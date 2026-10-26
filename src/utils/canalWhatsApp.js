import { Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Canal do ProTudo no WhatsApp, onde os pedidos abertos também saem todo dia. Entradas
// para o PROFISSIONAL: o cartão dos feeds (components/BannerCanalWhatsApp) e o item fixo do
// Perfil. Aqui mora o que não é tela: o link e a marca local do cartão.
//
// O link é o MESMO constante do servidor (pinturapro-api services/conviteCanalService.js:23,
// URL_CANAL_WHATSAPP, usado no convite por e-mail). Nenhum endpoint o devolve — nem /config
// nem /publico/* —, então o app o carrega como constante; mudar o canal = mudar os dois.
export const URL_CANAL_WHATSAPP = 'https://whatsapp.com/channel/0029Vb9BoWT17En0RAOw8r1I'

export const abrirCanalWhatsApp = async () => {
  try { await Linking.openURL(URL_CANAL_WHATSAPP) } catch (err) {
    console.log('[CanalWhatsApp] não abriu o link do canal | msg:', err?.message)
  }
}

// ── Cartão dos feeds ────────────────────────────────────────────────────────────────────
// Marca LOCAL por usuário, no molde do cartão de indicação: { seguido, dispensas, ultima }.
//   - toque no cartão (abre o canal) → `seguido`: some para sempre;
//   - ✕ → volta 15 dias depois; para de vez na 3ª dispensa;
//   - PRIORIDADE para quem está sem permissão de notificação (é quem mais precisa de outro
//     canal de aviso): a primeira aparição não espera nada, e o cartão entra na frente dos
//     demais convites do feed (ordem de montagem nos feeds).
const REAPARECE_MS = 15 * 24 * 60 * 60 * 1000
export const MAX_DISPENSAS_CANAL = 3
const chave = (uid) => `banner_canal_whatsapp:${uid}`
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export const lerEstadoCanal = async (uid) => {
  try {
    const raw = await AsyncStorage.getItem(chave(uid))
    const e = raw ? JSON.parse(raw) : {}
    return { seguido: e.seguido === true, dispensas: num(e.dispensas), ultima: num(e.ultima) }
  } catch {
    return { seguido: false, dispensas: 0, ultima: 0 }
  }
}

const gravar = async (uid, estado) => {
  try { await AsyncStorage.setItem(chave(uid), JSON.stringify(estado)) } catch {
    // falha de storage não quebra o fluxo — no pior caso o cartão volta antes da hora
  }
}

export const dispensarCanal = async (uid) => {
  const e = await lerEstadoCanal(uid)
  await gravar(uid, { ...e, dispensas: e.dispensas + 1, ultima: Date.now() })
}

export const marcarCanalSeguido = async (uid) => {
  const e = await lerEstadoCanal(uid)
  await gravar(uid, { ...e, seguido: true })
}

// Silenciado: já seguiu, 3 dispensas dadas, ou a última há menos de 15 dias. Sem permissão
// de notificação a PRIMEIRA aparição (nenhuma dispensa ainda) nunca espera.
export const canalSilenciado = (e, semPermissao = false) => {
  if (e.seguido || e.dispensas >= MAX_DISPENSAS_CANAL) return true
  if (semPermissao && e.dispensas === 0) return false
  return e.ultima > 0 && Date.now() - e.ultima < REAPARECE_MS
}
