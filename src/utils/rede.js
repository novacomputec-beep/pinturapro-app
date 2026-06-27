// Reexecuta uma chamada de rede em caso de erro transitório (cold start /
// handover de rede), com backoff exponencial e jitter entre as tentativas.
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
//
// Tentativas: no máximo 3 (1 original + 2 retries). A espera antes do retry usa
// backoff exponencial com jitter de ±20%:
//   - após a 1ª falha: esperaMs base (padrão 1000ms) → 800–1200ms
//   - após a 2ª falha: esperaMs * 2 base (2000ms)     → 1600–2400ms
// Se as 3 tentativas falharem, lança o último erro.
export const comRetry = async (fn, { timeout = false, servidor = false, esperaMs = 1000 } = {}) => {
  const maxTentativas = 3
  let ultimoErro

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    try {
      return await fn()
    } catch (err) {
      ultimoErro = err

      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      const isTimeout = timeout && (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout'))
      const isServidor = servidor && err.status >= 500
      const reexecutavel = isNetwork || isTimeout || isServidor

      // Não-reexecutável, ou já foi a última tentativa → propaga o erro.
      if (!reexecutavel || tentativa === maxTentativas - 1) throw err

      // Backoff exponencial: esperaMs, esperaMs*2, ... com jitter de ±20%.
      const base = esperaMs * Math.pow(2, tentativa)
      const espera = base * (0.8 + Math.random() * 0.4)
      await new Promise(r => setTimeout(r, espera))
    }
  }

  // Inalcançável na prática (o laço sempre retorna ou lança), mas mantém a
  // garantia de lançar o último erro caso a lógica acima mude.
  throw ultimoErro
}
