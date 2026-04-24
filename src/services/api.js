import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

const API_URL = 'https://pinturapro-api-production.up.railway.app/api'

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

// Interceptor: injeta o token JWT em toda requisição autenticada
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('token')
    console.log('Token enviado:', token ? 'SIM' : 'NAO')
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
    console.log('Erro API:', error.response?.status, error.response?.data)
    const msg = error.response?.data?.erro || 'Erro de conexão. Verifique sua internet.'
    return Promise.reject({ mensagem: msg, status: error.response?.status })
  }
)

// ─── AUTH ────────────────────────────────────────────────────
export const authService = {
  login: (email, senha) =>
    api.post('/auth/login', { email, senha }),

  cadastrar: (dados) =>
    api.post('/auth/cadastro', dados),

  perfil: () =>
    api.get('/auth/perfil'),

  atualizarPerfil: (dados) =>
    api.put('/auth/perfil', dados),
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