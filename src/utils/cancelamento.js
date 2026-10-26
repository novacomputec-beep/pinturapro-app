import api from '../services/api'
import { comRetry } from './rede'

// Cancelamento do MATCH pelas duas partes (dono e profissional, reparo e obra), antes do
// "Estou a caminho". Todo o contrato com a API vive AQUI — rotas, chaves do corpo, leitura
// da simulação e do pedido pendente —, para as duas telas de detalhe não repetirem nada.
// Contrato: pinturapro-api e0accee, services/cancelamentoMatchService.js + routes/index.js:3262.
//
// Rotas (reparos e obras, a mesma forma):
//   POST /:id/cancelar-match?simular=1   → { tipo: 'livre'|'tardio', limite_horas, horas_ate_horario,
//                                          horario, regra, papel, falta, horario_texto,
//                                          pedido_cancelamento } — só classifica, sem agir
//   POST /:id/cancelar-match             → { motivo, detalhe? } — cancela (tardio = falta)
//   POST /:id/cancelamento-acordo        → { motivo, detalhe? } — só PEDE; o outro lado responde em 2 h
//   POST /:id/cancelamento-acordo/responder → { aceitar: true|false }
// motivo ∈ imprevisto | nao_preciso | nao_consigo_horario | outro; detalhe até 200 caracteres.
// O pedido pendente chega em GET /:id como `pedido_cancelamento` (ao lado da linha):
//   { por: 'dono'|'profissional', meu: bool, motivo, detalhe, criado_em, expira_em } ou null.
// Pushes: match_cancelado, pedido_cancelamento, pedido_cancelamento_recusado,
//   pedido_cancelamento_expirado (com reparo_id/obra_id) e cancelamentos_frequentes (sem id).

const base = (frente, id) => `/${frente === 'obra' ? 'obras' : 'reparos'}/${id}`

export const DETALHE_MAX = 200

export const MOTIVOS_DONO = [
  { valor: 'imprevisto',  rotulo: 'Imprevisto pessoal' },
  { valor: 'nao_preciso', rotulo: 'Não preciso mais do serviço' },
  { valor: 'outro',       rotulo: 'Outro motivo' },
]
export const MOTIVOS_PROFISSIONAL = [
  { valor: 'imprevisto',          rotulo: 'Imprevisto pessoal' },
  { valor: 'nao_consigo_horario', rotulo: 'Não consigo atender no horário' },
  { valor: 'outro',               rotulo: 'Outro motivo' },
]

// Texto do motivo para mostrar ao outro lado: o rótulo do slug e, havendo, o detalhe.
export const rotuloMotivo = (pedido) => {
  if (!pedido) return null
  const slug = pedido.motivo
  const achado = [...MOTIVOS_DONO, ...MOTIVOS_PROFISSIONAL].find(m => m.valor === slug)
  const rotulo = achado ? achado.rotulo : (slug || null)
  const detalhe = (pedido.detalhe || '').trim()
  if (rotulo && detalhe) return `${rotulo} — ${detalhe}`
  return rotulo || detalhe || null
}

// Simulação → { tipo, limite_horas, pedido_cancelamento, ... } como a API manda. Só o tipo é
// normalizado: qualquer coisa que não seja 'tardio' vira 'livre'.
export const simularCancelamento = async (frente, id) => {
  const resp = await comRetry(() => api.post(`${base(frente, id)}/cancelar-match?simular=1`, {}))
  const r = resp && typeof resp === 'object' ? resp : {}
  return { ...r, tipo: r.tipo === 'tardio' ? 'tardio' : 'livre' }
}

const corpoMotivo = ({ motivo, detalhe }) => ({
  motivo,
  detalhe: (detalhe || '').trim().slice(0, DETALHE_MAX) || undefined,
})

export const cancelarMatch = (frente, id, { motivo, detalhe }) =>
  comRetry(() => api.post(`${base(frente, id)}/cancelar-match`, corpoMotivo({ motivo, detalhe })))

export const pedirCancelamentoAcordo = (frente, id, { motivo, detalhe }) =>
  comRetry(() => api.post(`${base(frente, id)}/cancelamento-acordo`, corpoMotivo({ motivo, detalhe })))

export const responderPedidoCancelamento = (frente, id, aceitar) =>
  comRetry(() => api.post(`${base(frente, id)}/cancelamento-acordo/responder`, { aceitar: !!aceitar }))

export const pedidoCancelamentoDe = (resposta, linha) => {
  const p = resposta?.pedido_cancelamento ?? linha?.pedido_cancelamento ?? null
  return p && typeof p === 'object' ? p : null
}

// A API já diz se o pedido é de quem lê (`meu`).
export const pedidoEhMeu = (pedido) => pedido?.meu === true
