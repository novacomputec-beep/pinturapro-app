// Repasse dos pushes às telas montadas. Dois emissores: o listener de notificação RECEBIDA
// em primeiro plano (AuthContext) e o de notificação TOCADA (AppNavigator) — este cobre o
// toque que mira uma tela já aberta, onde o navigate não dispara foco nem novo mount. As
// telas de detalhe assinam e releem a demanda quando o push traz o id delas.
// Síncrono e blindado: um assinante que lance não derruba os outros nem o listener nativo.

const ouvintes = new Set()

export const aoPushRecebido = (fn) => {
  ouvintes.add(fn)
  return () => { ouvintes.delete(fn) }
}

export const emitirPushRecebido = (data) => {
  if (!data || typeof data !== 'object') return
  for (const fn of Array.from(ouvintes)) {
    try { fn(data) } catch (err) { console.log('[eventosPush] assinante falhou | msg:', err?.message) }
  }
}
