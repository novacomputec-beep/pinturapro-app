import api from '../services/api'
import { comRetry } from './rede'

// Cancelamento do MATCH pelas duas partes (dono e profissional, reparo e obra), antes do
// "Estou a caminho". Todo o contrato com a API vive AQUI — rotas, chaves do corpo, leitura
// da simulação e do pedido pendente —, para as duas telas de detalhe não repetirem nada e
// um ajuste de nome ser uma troca só.
//
// Rotas (reparos e obras, a mesma forma):
//   POST /:id/cancelar-match?simular=1  → { tipo: 'livre' | 'tardio' } — só diz qual seria
//                                         o desfecho (tardio = faltam menos de 12 h para o
//                                         horário combinado; conta como falta)
//   POST /:id/cancelar-match            → { motivo, motivo_texto, comum_acordo } — cancela
//                                         (comum_acordo: true só PEDE; o outro lado responde)
//   POST /:id/cancelar-match/responder  → { acao: 'aceitar' | 'recusar' } — resposta ao pedido
// O pedido pendente chega no detalhe como `pedido_cancelamento` (ao lado da linha ou nela):
//   { id, solicitado_por, motivo, motivo_texto, criado_em, expira_em }.

const base = (frente, id) => `/${frente === 'obra' ? 'obras' : 'reparos'}/${id}/cancelar-match`

export const MOTIVOS_DONO = [
  { valor: 'imprevisto',  rotulo: 'Imprevisto pessoal' },
  { valor: 'nao_preciso', rotulo: 'Não preciso mais do serviço' },
  { valor: 'outro',       rotulo: 'Outro motivo' },
]
export const MOTIVOS_PROFISSIONAL = [
  { valor: 'imprevisto',  rotulo: 'Imprevisto pessoal' },
  { valor: 'sem_horario', rotulo: 'Não consigo atender no horário' },
  { valor: 'outro',       rotulo: 'Outro motivo' },
]

// Texto do motivo para mostrar ao outro lado: o texto livre do "Outro", senão o rótulo do
// slug (de qualquer dos dois lados), senão o que veio.
export const rotuloMotivo = (pedido) => {
  if (!pedido) return null
  const texto = (pedido.motivo_texto || '').trim()
  if (texto) return texto
  const slug = pedido.motivo
  const achado = [...MOTIVOS_DONO, ...MOTIVOS_PROFISSIONAL].find(m => m.valor === slug)
  return achado ? achado.rotulo : (slug || null)
}

// Simulação → 'livre' | 'tardio'. Aceita o campo direto, aninhado ou um boolean `tardio`;
// na dúvida, 'livre' NÃO é o lado seguro (esconderia a falta) — por isso só vira 'livre'
// quando a resposta não diz nada de tardio.
export const simularCancelamento = async (frente, id) => {
  const resp = await comRetry(() => api.post(`${base(frente, id)}?simular=1`, {}))
  const tipo = resp?.tipo ?? resp?.cancelamento?.tipo ?? (resp?.tardio === true ? 'tardio' : 'livre')
  return { tipo: tipo === 'tardio' ? 'tardio' : 'livre' }
}

export const cancelarMatch = (frente, id, { motivo, motivoTexto, comumAcordo }) =>
  comRetry(() => api.post(base(frente, id), {
    motivo,
    motivo_texto: (motivoTexto || '').trim() || undefined,
    comum_acordo: !!comumAcordo,
  }))

export const responderPedidoCancelamento = (frente, id, acao) =>
  comRetry(() => api.post(`${base(frente, id)}/responder`, { acao }))

export const pedidoCancelamentoDe = (resposta, linha) => {
  const p = resposta?.pedido_cancelamento ?? linha?.pedido_cancelamento ?? null
  return p && typeof p === 'object' ? p : null
}

// Quem pediu: o campo pode vir como solicitado_por / usuario_id / pedido_por.
export const pedidoEhMeu = (pedido, usuarioId) => {
  const por = pedido?.solicitado_por ?? pedido?.usuario_id ?? pedido?.pedido_por
  return por != null && usuarioId != null && String(por) === String(usuarioId)
}
