// Reexecuta uma chamada de rede uma vez em caso de erro transitório (cold start /
// handover de rede).
//
// Por padrão só reexecuta em erro de rede "duro" (ERR_NETWORK / Network Error),
// onde a requisição provavelmente NÃO chegou ao servidor — seguro de repetir
// mesmo em chamadas não-idempotentes.
//
// Para chamadas IDEMPOTENTES (pré-checagens, GETs), habilite { timeout, servidor }
// p/ também reexecutar em timeout (ECONNABORTED) e 5xx — comuns em cold start.
// NÃO habilite isso em POSTs que criam recursos (criar obra/reparo) nem em
// respostas de negociação: o servidor pode ter processado a 1ª tentativa e o
// retry duplicaria o efeito.
export const comRetry = async (fn, { timeout = false, servidor = false, esperaMs = 2000 } = {}) => {
  try {
    return await fn()
  } catch (err) {
    const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
    const isTimeout = timeout && (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout'))
    const isServidor = servidor && err.status >= 500
    if (isNetwork || isTimeout || isServidor) {
      await new Promise(r => setTimeout(r, esperaMs))
      return await fn()
    }
    throw err
  }
}
