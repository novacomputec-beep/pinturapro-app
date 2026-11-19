// Pedido "valor a combinar": o dono publicou sem dizer quanto paga ("Não sei o valor — quero
// receber propostas"). No banco o valor é NULL e valor_a_combinar = true, mas a API devolve
// '0.01' no lugar do null para as versões antigas do app (pinturapro-api utils/valorDemanda).
// Por isso NENHUMA tela pode decidir "tem valor" com `> 0`: a pergunta é sempre feita aqui,
// e a flag vem PRIMEIRO. Valor simbólico (<= 0,01) conta como "a combinar" mesmo sem a flag
// (pedidos antigos, respostas que não trazem a coluna).
export const ROTULO_ACEITA_PROPOSTAS = 'Aceita propostas'

const VALOR_SIMBOLICO_MAX = 0.01
const EPSILON = 1e-9

const paraNumero = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// true para 0,01 ou menos (inclusive 0 e negativos). null/vazio NÃO é simbólico: é ausência.
export const ehValorSimbolico = (v) => {
  const n = paraNumero(v)
  return n != null && n <= VALOR_SIMBOLICO_MAX + EPSILON
}

// Valor do PEDIDO como veio da API: obras usam `valor`, serviços usam `valor_estimado`.
const valorCru = (demanda) => {
  const a = paraNumero(demanda?.valor)
  return a != null ? a : paraNumero(demanda?.valor_estimado)
}

export const ehValorACombinar = (demanda) =>
  demanda?.valor_a_combinar === true || ehValorSimbolico(valorCru(demanda))

// Valor do pedido que PODE ir para a tela: número > 0,01, ou null (a combinar / sem valor).
export const valorRealDoPedido = (demanda) => {
  if (ehValorACombinar(demanda)) return null
  return valorCru(demanda)
}

// Um valor avulso (acordado, proposto) que pode ir para a tela: número > 0,01, ou null.
export const valorReal = (v) => {
  const n = paraNumero(v)
  return n != null && !ehValorSimbolico(n) ? n : null
}
