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
// EXCEÇÃO no 5xx: 503 com codigo SOBRECARGA (o servidor descartando carga por pool
// saturado) é SEMPRE reexecutável, sem depender de { servidor }. É o único caso em que o
// servidor promete que a requisição não foi processada e ainda diz quando voltar, via
// Retry-After — que passa a ditar a espera no lugar do backoff local. Os demais 5xx
// (500/502/504) seguem exatamente como antes, atrás da flag { servidor }.
//
// Tentativas: no máximo 3 (1 original + 2 retries). A espera antes do retry usa
// backoff exponencial com jitter de ±20%:
//   - após a 1ª falha: esperaMs base (padrão 1000ms) → 800–1200ms
//   - após a 2ª falha: esperaMs * 2 base (2000ms)     → 1600–2400ms
// EXCEÇÃO: erro de rede na 1ª falha espera ESPERA_SOCKET_MORTO em vez do backoff (ver
// o comentário no ponto de uso). Se as 3 tentativas falharem, lança o último erro.
//
// { persistir } troca o teto de 3 TENTATIVAS por um teto de TEMPO (JANELA_PERSISTIR):
// insiste calado enquanto o erro for reexecutável e a janela não tiver fechado. Existe
// porque três tentativas em ~3 s não cobrem uma oscilação de rede real — elevador,
// garagem, handover de torre —, e o usuário recebia "não foi possível" por uma falha
// que teria passado sozinha meio minuto depois. Só faz sentido onde repetir é inócuo
// (as MESMAS chamadas que já podem usar { timeout }); num POST que cria recurso, mais
// tentativas significam mais chances de duplicar. Não muda o que é reexecutável: 4xx
// continua definitivo, e timeout/5xx só entram se as flags deles estiverem ligadas.

// Pausa curta antes do 1º retry de erro de REDE. Não é backoff — é o tempo de o socket
// morto sair do pool. Curta o bastante para o usuário não perceber, e é a única espera
// deste caminho: a 2ª falha já cai no backoff normal.
const ESPERA_SOCKET_MORTO = 600

// Teto da espera entre tentativas no modo { persistir }. Sem ele o backoff dobra até
// 16 s e a janela toda caberia em ~4 tentativas; com o teto são ~12, que é o ponto:
// muitas chances de pegar o instante em que a rede volta.
const ESPERA_MAX = 5000

// Teto do Retry-After. O valor vem do SERVIDOR, e um número grande (por engano ou por
// uma sobrecarga longa) prenderia o spinner do usuário pelo tempo que ele mandasse.
// 30 s cabe dentro da JANELA_PERSISTIR de 45 s, então nem no modo { persistir } uma
// única espera consome a janela inteira.
const TETO_RETRY_AFTER = 30000

// Janela do { persistir }. ~45 s é o tempo que se aceita esperar por uma ação que já
// foi confirmada na tela (o spinner do botão continua rodando) sem que a pessoa
// conclua que travou. O corte é medido ANTES de decidir por outra tentativa, então uma
// tentativa que estoure o timeout de 30 s pode ultrapassar a janela — o limite é de
// quando PARAR de tentar, não do tempo total decorrido.
const JANELA_PERSISTIR = 45000

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

// ─── Reenvio é OPT-OUT por rota ──────────────────────────────
// O ponto de partida continua o mesmo: o cliente NÃO distingue "a resposta se perdeu" de
// "a requisição não chegou" — o adapter do axios entrega um ERR_NETWORK idêntico nos dois
// casos. Reenviar às cegas somou três vezes o mesmo prazo em POST /obras/:id/estender.
//
// A primeira tentativa de conserto foi uma lista de INCLUSÃO, e errou a mão: com ela, toda
// rota fora da lista deixava de ser reenviada, e isso alcançou login, upload de mídia e
// criação de demanda — justamente as chamadas mais longas, as que mais falham em rede
// ruim e as que o usuário mais sente. O inventário rota a rota mostrou o porquê: na
// esmagadora maioria das rotas deste app, uma entrega repetida no máximo dispara uma
// notificação duplicada; ela não corrompe dado guardado.
//
// Então inverte: reenvia SEMPRE, exceto nas rotas em que repetir causa dano real e
// irreversível. O risco que a inclusão evitava — uma rota nova nascer reenviável por
// esquecimento — passa a ser o preço, e é o preço menor: uma rota nova que dispara
// notificação a mais incomoda, uma rota antiga que não reenvia quebra o app na mão de
// quem está com sinal fraco.
//
// Método e rota chegam no próprio objeto de erro (`metodo`/`rota`, postos pelo interceptor
// de api.js), então nada aqui muda a assinatura do comRetry nem os 81 call sites.
const SEG_NUMERICO = /^\d+$/
const SEG_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

// Colapsa id em curinga para o padrão casar independente do id: numérico e UUID, os dois
// formatos que as rotas usam. A query sai fora — `/reparos?categoria=x` (FeedReparos) tem
// de casar com `/reparos`, e um filtro no meio da URL não muda QUAL rota é.
const normalizarRota = (rota) => {
  if (typeof rota !== 'string' || !rota) return null
  return rota
    .split('?')[0]
    .split('/')
    .map(seg => (SEG_NUMERICO.test(seg) || SEG_UUID.test(seg)) ? '*' : seg)
    .join('/')
}

// As QUATRO rotas em que repetir causa dano real e irreversível — cobrança, e-mail
// disparado, segredo rotacionado, recurso criado em duplicata. Fora daqui, o pior que uma
// entrega repetida faz neste app é mandar uma notificação a mais.
//
// A comparação é por IGUALDADE EXATA da string normalizada, não por prefixo. É isso que
// mantém 'POST /obras' restrito à rota administrativa sem segmento nenhum depois: a
// normalização preserva a profundidade do caminho, então /obras/dono vira 'POST
// /obras/dono' e /obras/12/estender vira 'POST /obras/*/estender' — strings diferentes,
// nenhuma delas negada. Um teste de prefixo bloquearia a árvore inteira de obras.
const NAO_REENVIAVEIS = new Set([
  // Cobrança: repetir pode gerar uma segunda assinatura no PagBank.
  'POST /pagamentos/criar-assinatura',
  // Dispara e-mail com link de recuperação: repetir enche a caixa e multiplica tokens.
  'POST /auth/esqueci-senha',
  // Rotaciona o segredo do 2FA: a segunda chamada invalida o que a primeira mostrou.
  'POST /admin/2fa/setup',
  // Criação administrativa de obra, EXATAMENTE esta rota — sem nada depois de /obras.
  'POST /obras',
])

// `metodo`/`rota` ausentes = REENVIA (falha ABERTA), coerente com a inversão. Não é
// descuido: o caso real em que isso acontece é um erro lançado dentro do interceptor de
// REQUEST, que estoura ANTES do despacho — nada foi entregue ao servidor, então repetir é
// seguro por construção, e era exatamente o comportamento de julho. Uma rota negada
// tampouco escapa por aqui: para chegar às quatro acima a requisição precisa ter sido
// despachada, e aí error.config existe e `metodo`/`rota` vêm preenchidos.
const podeReenviar = (err) => {
  const metodo = err?.metodo
  const rota = normalizarRota(err?.rota)
  if (!metodo || !rota) return true
  return !NAO_REENVIAVEIS.has(`${metodo} ${rota}`)
}

export const comRetry = async (fn, { timeout = false, servidor = false, esperaMs = 1000, persistir = false } = {}) => {
  const maxTentativas = 3
  const inicio = Date.now()
  let ultimoErro

  for (let tentativa = 0; ; tentativa++) {
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
      // 503 + codigo SOBRECARGA é o servidor DESCARTANDO carga: a requisição foi recusada
      // ANTES de ser processada, e o próprio servidor diz quando voltar (Retry-After). Por
      // isso não passa pela flag { servidor }: vale para qualquer chamada, inclusive os
      // POSTs que criam recurso e jamais poderiam repetir um 500 — ali um 500 pode ter
      // sido processado, um shed não foi. Sai de isServidor para não ser classificado
      // duas vezes e para não herdar o backoff local quando há Retry-After.
      const isSobrecarga = err.status === 503 && err.codigo === 'SOBRECARGA'
      const isServidor = !isClientError && servidor && err.status >= 500 && !isSobrecarga
      // A allowlist entra como AND sobre a classificação: a rota ganha o direito de ser
      // reenviada, mas o MOTIVO continua tendo de ser um dos de sempre.
      //
      // O shed fica FORA dela, e por isso vem antes do parêntese. Um 503 SOBRECARGA é o
      // servidor recusando a requisição ANTES de processá-la (ver :142-147): não há efeito
      // a duplicar, em rota nenhuma e método nenhum, então condicioná-lo à lista não
      // protegia nada e desligava o shed em ~56 call sites de mutação de uma vez.
      const reexecutavel = isSobrecarga || (podeReenviar(err) && (isNetwork || isTimeout || isServidor))

      // Não-reexecutável → propaga na hora, em qualquer modo.
      if (!reexecutavel) throw err

      // Fim da linha: 3 tentativas no modo normal, janela de tempo no { persistir }.
      // O tempo é medido do início da PRIMEIRA tentativa, então esperas e tentativas
      // já gastas contam — a janela é o orçamento total, não o de cada rodada.
      const acabou = persistir
        ? Date.now() - inicio >= JANELA_PERSISTIR
        : tentativa === maxTentativas - 1
      if (acabou) throw err

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

      // Backoff exponencial: esperaMs, esperaMs*2, ... com jitter de ±20%. No modo
      // { persistir } o dobro para em ESPERA_MAX, senão a janela inteira seria gasta
      // esperando em vez de tentando.
      const base = persistir
        ? Math.min(esperaMs * Math.pow(2, tentativa), ESPERA_MAX)
        : esperaMs * Math.pow(2, tentativa)
      // No shed, quem sabe quando a capacidade volta é o servidor: o Retry-After manda, e
      // o backoff local (que não sabe nada sobre a fila do outro lado) fica de fora.
      // MAS com o MESMO jitter de ±20% do caminho normal: a API manda 1 s FIXO para todo
      // mundo que ela descarta, então honrar o valor ao pé da letra faria a frota inteira
      // voltar no mesmo instante e derrubar o pool de novo — o efeito que o shed existe
      // para evitar. O jitter entra ANTES do teto, para que o valor final nunca o ultrapasse.
      // Header ausente, vazio ou não-numérico (inclusive a forma HTTP-date) cai no caminho
      // de sempre, então um servidor que pare de mandá-lo não muda nada.
      const raSeg = Number(err.retryAfter)
      const espera = (isSobrecarga && Number.isFinite(raSeg) && raSeg > 0)
        ? Math.min(raSeg * 1000 * (0.8 + Math.random() * 0.4), TETO_RETRY_AFTER)
        : base * (0.8 + Math.random() * 0.4)
      await new Promise(r => setTimeout(r, espera))
    }
  }

  // Inalcançável: o laço só termina por return ou throw. Mantido para a garantia de
  // lançar o último erro caso a condição de parada acima mude.
  // eslint-disable-next-line no-unreachable
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

// ─── Falha de rede PURA ──────────────────────────────────────
// ERR_NETWORK é o ÚNICO carimbo aceito. Ele nasce em um lugar só — o onerror do adapter
// XHR do axios — e significa exatamente uma coisa: a requisição saiu e NÃO voltou
// resposta nenhuma. Só isso autoriza trocar o alerta por uma recarga.
//
// O que fica deliberadamente DE FORA, e por quê:
//   • status ausente. É tentador ("não houve resposta"), e é errado: status também falta
//     no cancelamento, no timeout e em TODO erro que nunca passou pelo cliente HTTP — o
//     fetch do CEP, o Promise.race que rejeita com Error, a recusa do ImagePicker, o
//     upload direto ao Cloudinary. Casar por ausência de status recarregaria a tela num
//     CEP inválido ou num seletor de fotos cancelado.
//   • ERR_CANCELED. Quem cancelou foi o próprio app (troca de filtro, saída da tela);
//     recarregar seria brigar com a navegação que provocou o cancelamento.
//   • ECONNABORTED (timeout de 30 s). Ali a requisição pode ter sido processada, e a
//     espera longa já foi sinal suficiente para quem estava olhando.
//
// O texto 'Network Error' (err.message) também não entra: o interceptor de api.js
// descarta `message` e preserva só `code`, então quem chega aqui já vem sem ele. O
// comRetry testa os dois porque roda ANTES do interceptor, sobre o AxiosError cru.
export const ehFalhaDeRede = (err) => err?.code === 'ERR_NETWORK'

// Recarrega em vez de alertar quando a falha é de rede pura. A tela passa a mostrar o
// que o SERVIDOR tem, e isso é honesto nos DOIS desfechos possíveis de um ERR_NETWORK:
// se a requisição não chegou, aparece o estado inalterado; se chegou e só a resposta se
// perdeu, aparece o estado já alterado. Em ambos o usuário vê a verdade, em vez de um
// alerta que pode estar mentindo sobre o que aconteceu no servidor.
//
// Devolve true quando recarregou — o chamador NÃO deve alertar. Devolve false quando a
// falha não era de rede OU quando a própria recarga falhou: sumir com o erro e ainda
// não conseguir mostrar o estado real deixaria a pessoa sem informação nenhuma, então
// nesse caso o alerta volta a ser a resposta certa.
//
// ATENÇÃO ao passar `recarregar`: ela precisa PROPAGAR a falha. Uma função que engole o
// próprio erro (o padrão dos buscar() das telas, que só fazem console.log) sempre parece
// ter dado certo, e aí o alerta é suprimido mesmo com a rede ainda fora.
export const recarregarSeFalhaDeRede = async (err, recarregar) => {
  if (!ehFalhaDeRede(err)) return false
  try {
    await recarregar()
    return true
  } catch (e) {
    console.log('[rede] recarga pós-falha de rede também falhou | code:', e?.code)
    return false
  }
}
