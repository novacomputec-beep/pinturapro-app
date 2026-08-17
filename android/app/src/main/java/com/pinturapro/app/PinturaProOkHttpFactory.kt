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

    // 45 s. O teto vem da JANELA_OCIOSA de 60 s em src/utils/rede.js: passado esse tempo o app
    // JÁ considera a conexão suspeita e dispara um /health descartável. Uma conexão do pool tem
    // de expirar ANTES desse limite, senão o pool entregaria exatamente aquilo de que o
    // aquecimento desconfia; 45 s deixam 15 s de margem — e garantem que o /health de
    // aquecimento sempre abra conexão nova, que é o que ele sempre quis fazer.
    //
    // O piso vem das janelas de reaproveitamento que interessam: o ciclo de 15 s dos três
    // overlays, o disparo simultâneo de várias chamadas ao montar uma tela, e o "usuário lê o
    // card e toca" de 5–30 s. 30 s cobririam os dois primeiros e começariam a perder o
    // terceiro.
    //
    // A corrida NÃO acaba: uma conexão ociosa há 44 s ainda é entregue, e ainda pode ter
    // morrido antes disso na NAT da operadora ou na borda. É por isso que o
    // retryOnConnectionFailure acima, o comRetry e o aquecimento continuam todos de pé.
    private const val KEEP_ALIVE_SEGUNDOS = 45L

    // 8, e não os 5 do default. Este cliente é compartilhado por seis hosts — a API na Railway,
    // api.cloudinary.com, servicodados.ibge.gov.br, viacep.com.br,
    // nominatim.openstreetmap.org e exp.host (token do expo-notifications) — e o teto de
    // ociosas é global, não por host. O cadastro toca quatro deles em sequência; com 5 slots, a
    // conexão despejada seria a da API, bem antes de a pessoa enviar o formulário.
    private const val MAX_CONEXOES_OCIOSAS = 8
  }
}
