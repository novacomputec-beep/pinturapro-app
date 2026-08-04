// Reexecuta uma chamada de rede em caso de erro transitório (socket ocioso
// derrubado, handover de rede), com backoff exponencial e jitter entre as tentativas.
//
// O caso dominante NÃO é cold start do servidor: o Serverless está desligado e a API
// fica de pé. O que morre é a CONEXÃO — o SO/a rede derrubam um socket TCP ocioso sem
// avisar o cliente, o pool do axios continua entregando esse socket, e a requisição
// seguinte se perde nele. Isso chega aqui de DUAS formas, e a diferença é só de
// timing: ou falha na hora (ERR_NETWORK), ou some sem resposta até estourar o timeout
// de 30 s (ECONNABORTED). Nos dois casos a requisição NÃO foi processada — é o mesmo
// evento, e por isso os dois merecem retry nas mesmas chamadas.
//
// Por padrão só reexecuta em erro de rede "duro" (ERR_NETWORK / Network Error),
// onde a requisição provavelmente NÃO chegou ao servidor — seguro de repetir
// mesmo em chamadas não-idempotentes.
//
// Para chamadas IDEMPOTENTES (pré-checagens, GETs, mutações que gravam um ESTADO e
// não criam um recurso novo), habilite { timeout } p/ também cobrir a variante que
// trava. { servidor } acrescenta 5xx, que é outra história: um 5xx PROVA que a
// requisição chegou e foi processada, então só vale onde repetir o efeito é inócuo.
// NÃO habilite isso em POSTs que criam recursos (criar obra/reparo) nem em
// respostas de negociação: o servidor pode ter processado a 1ª tentativa e o
// retry duplicaria o efeito.
//
// Respostas 4xx NUNCA são reexecutadas (nem com timeout/servidor ligados): são
// definitivas (duplicado/inválido/não autorizado) e repetir não muda o resultado.
//
// Tentativas: no máximo 3 (1 original + 2 retries). A espera antes do retry usa
// backoff exponencial com jitter de ±20%:
//   - após a 1ª falha: esperaMs base (padrão 1000ms) → 800–1200ms
//   - após a 2ª falha: esperaMs * 2 base (2000ms)     → 1600–2400ms
// EXCEÇÃO: erro de rede na 1ª falha espera ESPERA_SOCKET_MORTO em vez do backoff (ver
// o comentário no ponto de uso). Se as 3 tentativas falharem, lança o último erro.

// Pausa curta antes do 1º retry de erro de REDE. Não é backoff — é o tempo de o socket
// morto sair do pool. Curta o bastante para o usuário não perceber, e é a única espera
// deste caminho: a 2ª falha já cai no backoff normal.
const ESPERA_SOCKET_MORTO = 600

// ─── Aquecimento de conexão ──────────────────────────────────
// O retry acima conserta o socket morto DEPOIS que ele estraga a ação do usuário: a
// chamada de verdade falha, espera-se ESPERA_SOCKET_MORTO, e só a 2ª tentativa passa —
// com o usuário olhando um spinner. O aquecimento antecipa esse custo: passado um tempo
// de ociosidade (a janela em que o SO/a rede derrubam o socket de keep-alive sem avisar),
// manda um GET /health ANTES da chamada real. Se o socket estiver morto, quem descobre é
// o /health, e o pool já entrega uma conexão nova para a ação que interessa.
//
// Quem CHAMA isto é o interceptor de request de api.js, não o comRetry: assim a proteção
// vale para TODA chamada da instância, inclusive as que não passam por comRetry (o
// buscar() das telas de detalhe, authService.perfil, obrasService.detalhe...). O próprio
// /health também atravessa esse interceptor, e é por isso que ele carrega uma flag
// explícita na config para não se aquecer de novo — ver aquecimentoConfig em api.js.
//
// O resultado é DESCARTÁVEL — sucesso, 404, 500 ou falha de rede dão no mesmo e nada
// disso é propagado. Não é uma checagem de saúde da API: é um pedido qualquer cuja única
// função é forçar o pool a exercitar a conexão. Um 404 (rota inexistente) cumpre o papel
// igualmente bem, porque prova que a requisição chegou ao servidor.
const JANELA_OCIOSA = 60000

// Marca do último SUCESSO — o único momento em que se sabe que havia uma conexão viva.
// Começa no carregamento do módulo, e não em 0, porque no start do app o pool está vazio:
// não existe socket velho a exercitar, e um /health aqui só atrasaria a 1ª ação do usuário.
let ultimoSucessoEm = Date.now()

// Injetado por api.js (que é quem tem a instância axios e a baseURL). Fica como injeção
// para não inverter a dependência: api.js já importa deste módulo, e importar de volta
// criaria um ciclo.
let aquecerConexao = null

// Um aquecimento em voo é compartilhado: uma tela que dispara várias chamadas ao ganhar
// foco depois de ociosa precisa de UM /health, não de um por chamada.
let aquecimentoEmVoo = null

export const registrarSucesso = () => { ultimoSucessoEm = Date.now() }

export const configurarAquecimento = (fn) => { aquecerConexao = fn }

export const aquecerSeOcioso = async () => {
  if (!aquecerConexao) return
  if (Date.now() - ultimoSucessoEm <= JANELA_OCIOSA) return
  if (!aquecimentoEmVoo) {
    // O .catch aqui é o que torna o aquecimento descartável: a promise compartilhada
    // NUNCA rejeita, então nenhum chamador precisa se proteger dela.
    aquecimentoEmVoo = Promise.resolve()
      .then(() => aquecerConexao())
      .catch((err) => { console.log('[rede] aquecimento falhou (descartado) | code:', err?.code) })
      .finally(() => { aquecimentoEmVoo = null })
  }
  await aquecimentoEmVoo
}

export const comRetry = async (fn, { timeout = false, servidor = false, esperaMs = 1000 } = {}) => {
  const maxTentativas = 3
  let ultimoErro

  for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
    try {
      return await fn()
    } catch (err) {
      ultimoErro = err

      // Um 4xx é uma resposta DEFINITIVA do servidor (dado duplicado, inválido, não
      // autorizado). Repetir só re-executaria o mesmo POST — no cadastro, isso chegou
      // a re-subir imagens 3x por causa de um CPF duplicado. Nunca reexecuta 4xx,
      // independentemente das flags timeout/servidor.
      const isClientError = err.status >= 400 && err.status < 500
      const isNetwork = !isClientError && (err.code === 'ERR_NETWORK' || err.message === 'Network Error')
      const isTimeout = !isClientError && timeout && (err.code === 'ECONNABORTED' || err.message?.toLowerCase().includes('timeout'))
      const isServidor = !isClientError && servidor && err.status >= 500
      const reexecutavel = isNetwork || isTimeout || isServidor

      // Não-reexecutável, ou já foi a última tentativa → propaga o erro.
      if (!reexecutavel || tentativa === maxTentativas - 1) throw err

      // Erro de REDE na 1ª tentativa: pausa CURTA, não o backoff cheio. O caso típico é
      // um socket de keep-alive reaproveitado depois de um tempo ocioso e já fechado do
      // outro lado. Antes daqui se repetia NA HORA, apostando que a repetição abriria
      // conexão nova — mas quem decide isso é o pool da plataforma, não este código: no
      // mesmo tick o socket morto ainda pode estar lá, e o retry falha pelo mesmo motivo,
      // gastando uma das três tentativas à toa. ~600ms dão margem para ele ser descartado
      // sem que o usuário sinta a diferença de um retry imediato.
      // Da 2ª em diante, e para timeout/5xx, o backoff exponencial continua valendo.
      if (isNetwork && tentativa === 0) {
        await new Promise(r => setTimeout(r, ESPERA_SOCKET_MORTO))
        continue
      }

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

// Suspensões, classificadas pelo par (status, codigo) e NUNCA pelo texto da mensagem —
// mesma disciplina do `codigo` descrito em api.js. Moram aqui, junto do resto da leitura
// de erro, para que os dois códigos tenham UM lugar só quando o backend mexer neles.
//
// CONTA_SUSPENSA (403): quem age está suspenso. Vale para QUALQUER ação dele.
// PROFISSIONAL_SUSPENSO (409): quem age está bem, mas o profissional do outro lado foi
// suspenso — só aparece para o dono, ao tentar aceitar uma proposta.
//
// Nenhum dos dois é reexecutável: são 4xx, que comRetry já não repete em hipótese alguma.
export const ehContaSuspensa = (err) => err?.status === 403 && err?.codigo === 'CONTA_SUSPENSA'
export const ehProfissionalSuspenso = (err) => err?.status === 409 && err?.codigo === 'PROFISSIONAL_SUSPENSO'
