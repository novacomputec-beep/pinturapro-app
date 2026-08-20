package com.pinturapro.app

import android.content.Context
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.util.concurrent.TimeUnit
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.Protocol

/**
 * Cliente HTTP nativo de todo o app. Substitui o `Connection: close` que a instância axios
 * mandava em toda requisição (ver src/services/api.js): aquele header comprava imunidade ao
 * socket ocioso morto ao preço de um handshake TCP + TLS por chamada, pago no rádio do
 * celular. Aqui o mesmo problema é tratado uma camada abaixo, sem custo por requisição.
 *
 * Registrado em MainApplication.onCreate — ver o comentário de lá sobre por que o ponto de
 * registro importa.
 */
class PinturaProOkHttpFactory(private val context: Context) : OkHttpClientFactory {

  /**
   * SEMPRE a partir de OkHttpClientProvider.createClientBuilder(context, cache), nunca de um
   * OkHttpClient.Builder() cru. Não é preferência de estilo — são duas quebras concretas:
   *
   * 1. O NetworkingModule do RN faz `(CookieJarContainer) mClient.cookieJar()` ao subir. Um
   *    cliente sem o ReactCookieJarContainer do builder padrão estoura ClassCastException na
   *    criação dos módulos nativos: crash de inicialização, tela branca em 100% dos starts.
   * 2. O NetworkingModule pede o cliente por createClient(context), mas o OkHttpClientProvider
   *    desvia para esta fábrica IGNORANDO o context — e com ele o cache de disco de 10 MB que
   *    o app tem hoje. Por isso o context é recebido no construtor e o cache é recolocado
   *    aqui: sem isto, registrar uma fábrica derrubaria o cache em silêncio.
   *
   * O builder padrão também deixa connect/read/writeTimeout em 0, e é assim que tem de ficar:
   * o timeout de cada chamada chega do JS como callTimeout (NetworkingModule aplica por
   * requisição). Um readTimeout "prudente" aqui só trocaria a falha por uma
   * InterruptedIOException, que o retryOnConnectionFailure NÃO reexecuta.
   *
   * Pool NOVO a cada chamada, e não um estático compartilhado: o Fresco (carregamento de
   * <Image>) pede o cliente por esta mesma fábrica, então um pool único deixaria as
   * miniaturas do Cloudinary despejarem a conexão da API. Um pool por cliente reproduz
   * exatamente o isolamento de hoje.
   */
  override fun createNewNetworkModuleClient(): OkHttpClient =
    OkHttpClientProvider.createClientBuilder(context, CACHE_BYTES)
      .connectionPool(ConnectionPool(MAX_CONEXOES_OCIOSAS, KEEP_ALIVE_SEGUNDOS, TimeUnit.SECONDS))
      // Já é o default do OkHttp; explícito porque é ELE o substituto do `Connection: close`.
      // Quando uma conexão reaproveitada morre no meio da requisição, o
      // RetryAndFollowUpInterceptor reexecuta a chamada numa conexão nova e o JS nunca vê o
      // ERR_NETWORK. Cobre só a variante que falha NA HORA: a que trava até o callTimeout vem
      // como InterruptedIOException e não é reexecutada — essa continua sendo do
      // comRetry({ timeout: true }) e do aquecimento, em src/utils/rede.js.
      .retryOnConnectionFailure(true)
      // HTTP/1.1 FORÇADO — teste de hipótese, como o keep-alive de 5 s foi antes.
      //
      // O log de borda da Railway trouxe os dois campos que faltavam: downstreamProto é
      // HTTP/2.0 e upstreamProto é HTTP/1.1. O aparelho fala h2 com a borda; a borda fala
      // HTTP/1.1 com o Node. E upstreamRqDuration é IGUAL a totalDuration em toda linha —
      // 56 e 56 nos POSTs que falham, 4 e 4 nos GETs. Os ~55 ms são o Node respondendo, e
      // não um handshake: a leitura de "conexão nova" morre aí, e a de "conexões
      // concorrentes" morre no h2, onde streams dividem uma conexão só.
      //
      // O que sobra de plausível é um STREAM h2 sendo resetado entre a borda e o aparelho.
      // Para o cliente isso chega exatamente como o sintoma: ERR_NETWORK, sem status, sem
      // resposta — enquanto upstreamErrors fica vazio, porque a borda recebeu a resposta do
      // Node normalmente e não viu problema nenhum. Um reset de stream não derruba a
      // conexão, então os GETs vizinhos continuam voltando em 4 ms na mesma conexão viva —
      // que é justamente o que o log mostra três segundos depois da rajada.
      //
      // Sem h2 não há stream para resetar: cada requisição volta a ter a própria conexão, e
      // o modo de falha, se persistir, passa a ser observável como queda de conexão.
      //
      // PREÇO: sem multiplexação. Requisições concorrentes deixam de dividir uma conexão e
      // cada uma precisa da sua, com handshake quando não houver ociosa no pool — o que
      // torna o keep-alive de 45 s abaixo mais importante, não menos.
      .protocols(listOf(Protocol.HTTP_1_1))
      .build()

  companion object {
    // O mesmo tamanho que o createClientBuilder(context) do RN usaria. Repetido aqui porque a
    // sobrecarga de um argumento é justamente a que esta fábrica deixa de alcançar (ver acima).
    private const val CACHE_BYTES = 10 * 1024 * 1024

    // 45 s. Voltou a ser 45 depois de um período em 5 s, e o 5 foi um TESTE DE HIPÓTESE que
    // o log de borda falsificou.
    //
    // A hipótese era: o que morre em silêncio é o socket OCIOSO, então encurtar o keep-alive
    // reduziria a janela em que um intermediário pode derrubá-lo sem que o FIN chegue ao
    // aparelho. O build com 5 s manteve a falha IDÊNTICA — as mesmas rajadas de exatamente
    // três entregas, com o servidor processando as três e o cliente sem ver resposta
    // nenhuma. E os tempos mataram a explicação por handshake: upstreamRqDuration é igual a
    // totalDuration em toda linha do log, ou seja, os ~55 ms das requisições que falham são
    // o Node respondendo, não conexão sendo aberta. Socket ocioso morto não é o mecanismo.
    //
    // Falsificada a hipótese, o custo que ela cobrava deixa de se justificar: com 5 s o ciclo
    // de 15 s dos três overlays abria conexão nova a cada volta, e o "usuário lê o card e
    // toca" também — cada uma pagando TCP + TLS contra os EUA, centenas de milissegundos a
    // partir do Brasil. Com o HTTP/1.1 forçado acima isso piora, porque some a multiplexação
    // e cada requisição concorrente quer a própria conexão: manter 5 s agora seria pagar
    // handshake quase sempre.
    //
    // 45 s também RECOLOCA a relação que o aquecimento pressupõe. O aquecerSeOcioso de
    // src/utils/rede.js só dispara o GET /health depois de 60 s sem resposta bem-sucedida
    // (JANELA_OCIOSA). Com o pool em 45 s, a conexão é descartada ANTES dessa janela, e o
    // /health encontra o pool já limpo — que é o desenho descrito em src/services/api.js.
    // Com o pool em 5 s a distância virava uma ordem de grandeza: entre 5 s e 60 s de
    // ociosidade o pool já não tinha conexão E o aquecimento ainda se recusava a rodar, de
    // modo que a ação do usuário pagava o handshake inteiro sozinha.
    //
    // A corrida contra o socket ceifado não acaba com nenhum dos dois valores. Por isso o
    // retryOnConnectionFailure acima, o comRetry e o aquecimento seguem todos de pé.
    private const val KEEP_ALIVE_SEGUNDOS = 45L

    // 8, e não os 5 do default. Este cliente é compartilhado por seis hosts — a API na Railway,
    // api.cloudinary.com, servicodados.ibge.gov.br, viacep.com.br,
    // nominatim.openstreetmap.org e exp.host (token do expo-notifications) — e o teto de
    // ociosas é global, não por host. O cadastro toca quatro deles em sequência; com 5 slots, a
    // conexão despejada seria a da API, bem antes de a pessoa enviar o formulário.
    private const val MAX_CONEXOES_OCIOSAS = 8
  }
}
