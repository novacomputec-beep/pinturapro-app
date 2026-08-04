import axios from 'axios'
import * as SecureStore from 'expo-secure-store'
import { comRetry, registrarSucesso, configurarAquecimento, aquecerSeOcioso } from '../utils/rede'

const API_URL = 'https://pinturapro-api-production.up.railway.app/api'

// 304 entra junto com a faixa 2xx. O default do axios é `status >= 200 && status < 300`,
// que joga o Not Modified no ramo de ERRO — e o código que ele carrega ali é lixo: o
// settle.js do axios escolhe a constante por `Math.floor(status / 100) - 4`, que para 304
// dá índice -1 e devolve `undefined`. O resultado chegava ao usuário como "Não foi
// possível concluir (erro 304)", e nenhuma regra do comRetry reconhecia esse erro (não é
// 4xx, nem rede, nem timeout, nem 5xx), então nem retry havia.
// Um 304 é uma resposta de SUCESSO: o servidor confirma que o recurso não mudou. Pode vir
// de um proxy/CDN à frente da API ou de qualquer requisição condicional, e nenhum dos dois
// é erro de aplicação. ATENÇÃO ao corpo: um 304 legítimo vem VAZIO, então o interceptor de
// sucesso devolve `undefined` como `response.data` — quem chama precisa tolerar isso, que
// é justamente o que os chamadores já fazem com `resp?.campo` e o fallback do buscar().
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  validateStatus: (status) => (status >= 200 && status < 300) || status === 304,
})

// Timeout curto e próprio do aquecimento. O default de 30 s da instância não serve aqui:
// o socket morto que este GET existe para descobrir é justamente o que trava até o
// timeout, e herdando 30 s o aquecimento seguraria a ação do usuário por meio minuto —
// pior do que o problema que resolve. Passado esse prazo, desiste e segue para a chamada
// real, que ainda tem o retry do comRetry como rede de segurança.
const TIMEOUT_AQUECIMENTO = 4000

// Config do GET de aquecimento. A flag `aquecimento` é o que impede a recursão: o próprio
// /health passa pelo interceptor de request abaixo, e sem ela pediria um aquecimento, que
// pediria outro, indefinidamente. A marca vai na CONFIG, e não numa comparação de URL,
// porque é a intenção da chamada que importa: mudar a rota de /health para outra coisa
// não pode reintroduzir a recursão, e uma chamada legítima a essa mesma rota (um health
// check de verdade, um dia) continua sendo aquecida como qualquer outra.
const aquecimentoConfig = { timeout: TIMEOUT_AQUECIMENTO, aquecimento: true }

// Interceptor: injeta o token JWT em toda requisição autenticada
api.interceptors.request.use(async (config) => {
  // Aquecimento ANTES do envio, cobrindo toda chamada da instância — inclusive as que não
  // passam por comRetry. Espera de propósito: a graça é o socket morto estourar aqui, num
  // pedido descartável, e não na ação do usuário. Nada aqui rejeita (ver rede.js), então
  // um aquecimento falho não derruba a requisição de verdade.
  if (!config.aquecimento) await aquecerSeOcioso()
  try {
    const token = await SecureStore.getItemAsync('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  } catch (err) {
    console.log('Erro ao buscar token:', err)
  }
  return config
})

// Interceptor: trata erros globalmente
api.interceptors.response.use(
  (response) => {
    // Marca o instante da última resposta BEM-SUCEDIDA: é o único momento em que se sabe
    // que havia uma conexão viva com o servidor. É essa marca que o interceptor de request
    // acima lê para decidir se aquece a conexão (ver rede.js). Fica no caminho de sucesso
    // de propósito — um erro de rede não prova conexão nenhuma, e um erro do servidor,
    // que prova, não é o caso que o aquecimento tenta evitar.
    registrarSucesso()
    return response.data
  },
  (error) => {
    console.log('Erro API:', error.response?.status, error.response?.data, '| network:', error.message, '| code:', error.code)
    // HOUVE resposta do servidor? Então quem fala é ele, mesmo que a mensagem venha
    // noutra chave além de `erro`. O texto de conexão só cabe quando não veio resposta
    // nenhuma. Antes o teste era só `data?.erro`, então uma resposta legítima sem essa
    // chave — um 403 que traz apenas { codigo, mensagem }, por exemplo — era anunciada ao
    // usuário como falha de rede, escondendo o motivo real (conta suspensa) atrás de um
    // conselho sobre Wi-Fi e dados móveis.
    const dados = error.response?.data
    const msgServidor = dados?.erro || dados?.mensagem || dados?.message
    const msg = error.response
      ? (msgServidor || `Não foi possível concluir (erro ${error.response.status}).`)
      : `Erro de conexão (${error.code || error.message})\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.`
    // `codigo` é a chave estável do backend (ex.: 'cpf_duplicado', 'email_duplicado')
    // para classificar sem depender do texto da mensagem.
    return Promise.reject({ mensagem: msg, status: error.response?.status, code: error.code, codigo: dados?.codigo })
  }
)

// Vai pela MESMA instância (mesma baseURL, mesmo host) porque é esse o pool de conexões
// que precisa ser exercitado — um axios avulso poderia abrir outro socket e não provar
// nada sobre o que a chamada real vai usar.
configurarAquecimento(() => api.get('/health', aquecimentoConfig))

// Upload foto de perfil
api.uploadFotoPerfil = async (formData) => {
  const token = await SecureStore.getItemAsync('token')
  const resposta = await axios.post(`${API_URL}/auth/foto-perfil`, formData, {
    timeout: 60000,
    headers: {
      'Content-Type': 'multipart/form-data',
      'Authorization': `Bearer ${token}`
    }
  })
  return resposta.data
}

// Upload de mídia via NOSSO backend (POST /upload/midia). Pré-auth: usado no cadastro,
// quando ainda NÃO há token — por isso NÃO envia Authorization e não passa pela instância
// `api` (cujo default é application/json). Retorna { secure_url, public_id, resource_type }.
api.uploadMidiaPublica = async (formData) => {
  const resposta = await axios.post(`${API_URL}/upload/midia`, formData, {
    timeout: 60000,
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return resposta.data
}

// ─── AUTH ────────────────────────────────────────────────────
export const authService = {
  login: (email, senha) =>
    comRetry(() => api.post('/auth/login', { email, senha })),
  cadastrar: (dados) =>
    comRetry(() => api.post('/auth/cadastro', dados)),
  perfil: () =>
    api.get('/auth/perfil'),
  atualizarPerfil: (dados) =>
    api.put('/auth/perfil', dados),
  alterarSenha: (dados) =>
    api.post('/auth/alterar-senha', dados),
  esqueciSenha: (email) =>
    api.post('/auth/esqueci-senha', { email }),
}

// ─── OBRAS ───────────────────────────────────────────────────
export const obrasService = {
  listar: (params) =>
    api.get('/obras', { params }),
  detalhe: (id) =>
    api.get(`/obras/${id}`),
}

// ─── CANDIDATURAS ────────────────────────────────────────────
export const candidaturasService = {
  candidatar: (obra_id, referencias) =>
    api.post('/candidaturas', { obra_id, referencias }),
  minhas: () =>
    api.get('/candidaturas/minhas'),
}

// ─── MENSAGENS ───────────────────────────────────────────────
export const mensagensService = {
  enviar: (obra_id, conteudo) =>
    api.post('/mensagens', { obra_id, conteudo }),
  porObra: (obra_id) =>
    api.get(`/mensagens/obra/${obra_id}`),
}

export default api