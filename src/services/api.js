import axios from 'axios'
import * as SecureStore from 'expo-secure-store'
import { comRetry } from '../utils/rede'

const API_URL = 'https://pinturapro-api-production.up.railway.app/api'

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// Interceptor: injeta o token JWT em toda requisição autenticada
api.interceptors.request.use(async (config) => {
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
  (response) => response.data,
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