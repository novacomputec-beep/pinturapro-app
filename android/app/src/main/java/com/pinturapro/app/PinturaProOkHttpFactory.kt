package com.pinturapro.app

import android.content.Context
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.util.concurrent.TimeUnit
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient

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
      .build()

  companion object {
    // O mesmo tamanho que o createClientBuilder(context) do RN usaria. Repetido aqui porque a
    // sobrecarga de um argumento é justamente a que esta fábrica deixa de alcançar (ver acima).
    private const val CACHE_BYTES = 10 * 1024 * 1024

    // 5 s — era 45 s. A hipótese que este número testa: o que morre em silêncio é o socket
    // OCIOSO. Uma mutação pequena é respondida em 4–9 ms e a conexão fica parada no pool por
    // até o keep-alive inteiro; nesse tempo um intermediário pode derrubá-la sem que o FIN
    // chegue ao aparelho, e a requisição seguinte é entregue num socket morto. O upload ao
    // Cloudinary nunca falha e é o contraexemplo: ele segura o socket OCUPADO por segundos ou
    // minutos, e socket ocupado não é ceifado.
    //
    // Com 5 s, só é reaproveitada a conexão que ficou parada por muito pouco tempo — a janela
    // em que a chance de ela ter morrido é mínima. O ganho de reúso que sobra é o que
    // realmente importa: a rajada de chamadas ao montar uma tela, todas dentro do mesmo
    // segundo.
    //
    // O preço é explícito: o ciclo de 15 s dos três overlays passa a abrir conexão nova a
    // cada volta, e o "usuário lê o card e toca" também. Cada uma dessas custa um handshake
    // TCP + TLS contra os EUA — na casa das centenas de milissegundos a partir do Brasil.
    //
    // A corrida NÃO acaba: mesmo uma conexão ociosa há 4 s pode estar morta se quem a derruba
    // for mais agressivo que isso. Por isso o retryOnConnectionFailure acima, o comRetry e o
    // aquecimento seguem todos de pé — este número reduz a exposição, não a elimina.
    private const val KEEP_ALIVE_SEGUNDOS = 5L

    // 8, e não os 5 do default. Este cliente é compartilhado por seis hosts — a API na Railway,
    // api.cloudinary.com, servicodados.ibge.gov.br, viacep.com.br,
    // nominatim.openstreetmap.org e exp.host (token do expo-notifications) — e o teto de
    // ociosas é global, não por host. O cadastro toca quatro deles em sequência; com 5 slots, a
    // conexão despejada seria a da API, bem antes de a pessoa enviar o formulário.
    private const val MAX_CONEXOES_OCIOSAS = 8
  }
}
