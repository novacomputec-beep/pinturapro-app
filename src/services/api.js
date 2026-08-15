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
// Connection: close — cada requisição pede uma conexão NOVA em vez de reaproveitar uma
// do pool. Ataca na origem o problema descrito em rede.js:4-10: o socket de keep-alive
// ocioso que o SO/a rede derrubam sem avisar o cliente, que o pool continua entregando e
// no qual a requisição seguinte se perde (o ERR_NETWORK que motivou o retry e o
// aquecimento). Sem reaproveitamento, não há socket velho para morrer.
//
// Vale só para ESTA instância. Os uploads que não passam por ela seguem com keep-alive,
// de propósito: uploadFotoPerfil (:94) e uploadMidiaPublica (:108) usam axios avulso, e
// midia.js, EditarPerfilScreen e CadastroScreen sobem por XHR direto — arquivos grandes
// são exatamente o caso em que reaproveitar a conexão compensa.
const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Connection: 'close' },
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
    // `retryAfter` vai CRU (o valor do header, sem parse): quem decide o que fazer com ele
    // é o comRetry, no 503 de sobrecarga. Axios normaliza o nome do header em minúsculas.
    // Sem este repasse o comRetry não teria como enxergá-lo — ele só vê o objeto montado
    // aqui, nunca a resposta original.
    const retryAfter = error.response?.headers?.['retry-after']
    return Promise.reject({ mensagem: msg, status: error.response?.status, code: error.code, codigo: dados?.codigo, retryAfter })
  }
)

// ─── Deduplicação de GETs idênticos em voo ───────────────────
// Três componentes globais (CelebracaoMatchHost, RetomadaMatchHost e BarraServicoEmAndamento)
// leem a MESMA coleção do papel do usuário, cada um com o seu próprio guarda de "uma por vez"
// e o seu próprio intervalo de 15 s. Como nenhum conhece os outros, abrir o app dispara três
// requisições idênticas no mesmo instante. Aqui elas passam a dividir UMA requisição e UMA
// promise — os componentes não mudam e não sabem que isto existe.
//
// É compartilhamento EM VOO, nunca cache: a entrada morre quando a promise assenta, nos DOIS
// desfechos. Guardar uma promise já REJEITADA seria o pior dos mundos — as três tentativas do
// comRetry receberiam a mesma rejeição na hora, e o retry de ERR_NETWORK morreria parecendo
// que rodou.
//
// A camada fica ACIMA do interceptor de request (que roda dentro de getOriginal, então os
// compartilhadores custam um token e um aquecimento só) e ABAIXO do comRetry (que é do
// chamador e reinvoca api.get a cada tentativa: com a entrada já liberada, a tentativa
// seguinte abre uma requisição de verdade).
//
// Nada aqui toca em transporte: não monta requisição, não lê nem escreve header — o
// Connection: close segue vindo dos defaults da instância, e três requisições viram uma, o que
// só REDUZ o número de sockets — e não fala com o cliente HTTP nativo. Só decide se chama o
// axios de novo.
//
// Lista fechada, e não todo GET: estas quatro coleções alimentam overlays consultivos que já
// toleram 15 s de atraso. Ficam de fora, de propósito, as rotas de detalhe (/reparos/:id,
// /obras/:id) e o /auth/perfil, que são relidas logo DEPOIS de uma escrita — ali compartilhar
// uma leitura iniciada antes do commit devolveria o estado anterior à ação do usuário — e a
// assinatura do Cloudinary, que é datada e não se divide entre dois uploads.
const DEDUPAVEIS = new Set([
  '/reparos/meus-interesses',
  '/reparos/minhas',
  '/obras/minhas',
  '/candidaturas/minhas',
])

const emVoo = new Map()

const getOriginal = api.get.bind(api)

// A chave leva o TOKEN além da URL. Sem ele, uma entrada criada antes de um logout poderia ser
// entregue a um chamador de depois do login seguinte, servindo os dados da conta anterior —
// exatamente o risco de aparelho compartilhado que o logout já trata no AuthContext. Token
// diferente (ou ausente) é chave diferente, então logout e troca de conta nunca reaproveitam
// nada: a janela fecha aqui dentro, sem depender de aviso nenhum de fora.
const dedupar = async (url, config) => {
  let token = null
  try {
    token = await SecureStore.getItemAsync('token')
  } catch (err) {
    // Sem conseguir ler o token não dá para afirmar de QUEM seria a resposta compartilhada.
    // Segue sem dividir, que é o comportamento de hoje.
    console.log('[api] token ilegível para a chave de dedup, seguindo sem compartilhar | msg:', err.message)
    return getOriginal(url, config)
  }
  const chave = `${url}|${token || ''}`
  const existente = emVoo.get(chave)
  if (existente) return existente
  // .finally devolve uma promise NOVA, e é ela que vai ao mapa: quem compartilha recebe
  // exatamente o mesmo desfecho do original, e a limpeza roda no assentamento — resolvida ou
  // rejeitada, sem exceção.
  const promessa = getOriginal(url, config).finally(() => { emVoo.delete(chave) })
  emVoo.set(chave, promessa)
  return promessa
}

// Só o api.get é embrulhado, então POST/PUT jamais entram. Fora da lista, a chamada segue
// direto para o axios — mesmo objeto de promise de sempre, sem camada nenhuma no meio.
api.get = (url, config) => {
  // `signal`: FeedReparos e FeedObras abortam a requisição em voo ao trocar de filtro.
  // Compartilhada, o abort de uma tela mataria a busca da outra.
  // `params`: nenhuma das quatro rotas recebe algum hoje, e a chave não os carrega — se um dia
  // receberem, dividir por URL entregaria o resultado do filtro errado.
  if (!DEDUPAVEIS.has(url) || config?.signal || config?.params) return getOriginal(url, config)
  return dedupar(url, config)
}

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