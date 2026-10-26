import { Platform, Share, Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Application from 'expo-application'
import api from '../services/api'
import { comRetry } from './rede'

// Indicação de colegas (profissional → profissional). Aqui mora o que NÃO é tela: o
// contrato com a API, a mensagem do convite, a leitura do código vindo da loja e a marca
// local do cartão do feed. Telas e componentes (ConvidarColegaScreen, components/Indicacao,
// CadastroScreen) só consomem.
//
// Contrato da API, como combinado:
//   GET /indicacoes/minhas   → { codigo, link, indicados, aprovados, meses_ganhos, embaixador }
//   GET /indicacao/:codigo   → { nome } do profissional dono do código; 404 quando não existe
//   POST /auth/cadastro      → aceita `codigo_indicacao` (opcional)
//   candidatos/interessados  → `embaixador: true` no profissional com 3 indicações aprovadas
// A normalização abaixo tolera nomes vizinhos (total_indicados, indicados_aprovados) para
// uma diferença de grafia no servidor não zerar os números na tela.

// Selo Embaixador: 3 colegas aprovados.
export const META_EMBAIXADOR = 3

// Link pessoal quando a API não o devolve: mesmo host dos links de demanda (utils/deepLink).
const LINK_BASE = 'https://protudo.app.br/r/'
export const linkDeIndicacao = (codigo) => `${LINK_BASE}${encodeURIComponent(codigo || '')}`

// Mensagem do convite, texto aprovado. <CODIGO> e <link> são os dois únicos vazios.
export const mensagemConvite = (codigo, link) =>
  `Estou usando o ProTudo para receber pedidos de clientes aqui da região. É grátis! Baixe pelo link e use meu código ${codigo} no cadastro: ${link}`

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// GET /indicacoes/minhas normalizado. GET é idempotente: retry em timeout e 5xx é seguro.
export const buscarMinhasIndicacoes = async () => {
  const r = await comRetry(() => api.get('/indicacoes/minhas'), { timeout: true, servidor: true })
  const d = (r && typeof r === 'object') ? (r.indicacoes && typeof r.indicacoes === 'object' ? r.indicacoes : r) : {}
  const codigo = String(d.codigo ?? d.codigo_indicacao ?? '').trim()
  const indicados = num(d.indicados ?? d.total_indicados ?? d.colegas_indicados)
  // Sem contagem de aprovados separada, a de indicados é o melhor que há para o selo.
  const aprovados = d.aprovados != null || d.indicados_aprovados != null
    ? num(d.aprovados ?? d.indicados_aprovados)
    : indicados
  return {
    codigo,
    link: (typeof d.link === 'string' && d.link.trim()) || (codigo ? linkDeIndicacao(codigo) : ''),
    indicados,
    aprovados,
    mesesGanhos: num(d.meses_ganhos ?? d.meses),
    paraSelo: Math.max(0, META_EMBAIXADOR - aprovados),
    embaixador: d.embaixador === true || aprovados >= META_EMBAIXADOR,
  }
}

// GET /indicacao/:codigo → nome de quem indicou, ou null quando o código não existe
// (404/400). Erro de rede PROPAGA: quem chama decide se cala ou avisa — no cadastro, cala e
// deixa o servidor validar no POST.
export const buscarIndicador = async (codigo) => {
  try {
    const r = await comRetry(() => api.get(`/indicacao/${encodeURIComponent(codigo)}`), { timeout: true, servidor: true })
    if (!r || typeof r !== 'object' || r.valido === false) return null
    const nome = String(r.nome ?? r.indicador?.nome ?? r.usuario?.nome ?? '').trim()
    return nome || null
  } catch (err) {
    if (err?.status === 404 || err?.status === 400 || err?.status === 410) return null
    throw err
  }
}

// Código vindo da Play Store: o link de convite leva `c=CODIGO` no referrer da instalação
// (expo-application só o expõe no Android; no iOS a chamada rejeita e cai no null).
export const codigoDoInstallReferrer = async () => {
  if (Platform.OS !== 'android') return null
  try {
    const ref = await Application.getInstallReferrerAsync()
    if (!ref || typeof ref !== 'string') return null
    // O referrer pode vir codificado uma vez (utm_source%3D...) ou já em claro.
    const texto = (() => { try { return decodeURIComponent(ref) } catch { return ref } })()
    const m = texto.match(/(?:^|[?&])c=([A-Za-z0-9_-]{3,20})(?:$|[&#])/)
    return m ? m[1].toUpperCase() : null
  } catch (err) {
    console.log('[indicacao] install referrer indisponível | msg:', err?.message)
    return null
  }
}

// Convite pelo WhatsApp: tenta o app direto; sem ele (ou no simulador), cai na folha de
// compartilhar do sistema com a mesma mensagem — o convite nunca fica sem saída.
export const convidarPeloWhatsApp = async (mensagem) => {
  try {
    await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(mensagem)}`)
    return
  } catch (err) {
    console.log('[indicacao] WhatsApp não abriu, usando a folha de compartilhar | msg:', err?.message)
  }
  try { await Share.share({ message: mensagem }) } catch (err) {
    console.log('[indicacao] compartilhar cancelado/falhou | msg:', err?.message)
  }
}

// ── Cartão "Convide um colega" do feed ──────────────────────────────────────────────────
// Marca LOCAL por usuário, como a das celebrações: { dispensas, ultima, temMatch }.
//   - reaparece 30 dias depois de cada ✕; para de vez na 3ª dispensa;
//   - só depois do PRIMEIRO match do profissional. O match é descoberto uma vez nas listas
//     que o app já consulta e fica gravado (temMatch), para o feed não pagar a consulta a
//     cada abertura.
const REAPARECE_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_DISPENSAS_BANNER = 3
const chaveBanner = (uid) => `banner_indicacao:${uid}`

export const lerEstadoBanner = async (uid) => {
  try {
    const raw = await AsyncStorage.getItem(chaveBanner(uid))
    const e = raw ? JSON.parse(raw) : {}
    return { dispensas: num(e.dispensas), ultima: num(e.ultima), temMatch: e.temMatch === true }
  } catch {
    return { dispensas: 0, ultima: 0, temMatch: false }
  }
}

const gravarEstadoBanner = async (uid, estado) => {
  try { await AsyncStorage.setItem(chaveBanner(uid), JSON.stringify(estado)) } catch {
    // falha de storage não quebra o fluxo — no pior caso o cartão volta antes da hora
  }
}

export const dispensarBanner = async (uid) => {
  const e = await lerEstadoBanner(uid)
  await gravarEstadoBanner(uid, { ...e, dispensas: e.dispensas + 1, ultima: Date.now() })
}

export const marcarTemMatch = async (uid) => {
  const e = await lerEstadoBanner(uid)
  if (!e.temMatch) await gravarEstadoBanner(uid, { ...e, temMatch: true })
}

// Silenciado por dispensa: 3 já dadas, ou a última há menos de 30 dias.
export const bannerSilenciado = (e) =>
  e.dispensas >= MAX_DISPENSAS_BANNER || (e.ultima > 0 && Date.now() - e.ultima < REAPARECE_MS)

// Primeiro match do profissional, nas DUAS grafias de aceite (ver STATUS_GRUPO em
// ContratosScreen.js:24). Reparador: /reparos/meus-interesses (ativos + historico);
// pintor/assinante: /candidaturas/minhas. Encerradas contam — o match aconteceu.
const ACEITO = new Set(['aceito', 'aprovada'])
export const profissionalJaTeveMatch = async (usuario) => {
  const pintor = (usuario?.role === 'prestador' && usuario?.tipo_prestador === 'pintor') || usuario?.role === 'assinante'
  if (pintor) {
    const r = await comRetry(() => api.get('/candidaturas/minhas'), { timeout: true, servidor: true })
    return (r?.candidaturas || []).some(c => ACEITO.has(c.status))
  }
  const r = await comRetry(() => api.get('/reparos/meus-interesses'), { timeout: true, servidor: true })
  return [...(r?.ativos || []), ...(r?.historico || [])].some(i => ACEITO.has(i.status))
}
