// Pedido de avaliação NA LOJA (Play Store / App Store) via expo-store-review — o diálogo
// nativo de estrelas (Play In-App Review / SKStoreReviewController), sem sair do app.
// Não confundir com a avaliação do PROFISSIONAL (ModalAvaliacao → POST /avaliacoes).
//
// Mesma postura de atualizacaoPlay.js: QUALQUER falha vira false e nada aqui lança —
// módulo nativo ausente (binário antigo recebendo OTA), aparelho sem loja, erro da API,
// AsyncStorage indisponível. Um pedido de avaliação nunca pode quebrar o fluxo que o
// chamou, que é sempre um momento bom (nota alta enviada, match conquistado).
//
// Carregado sob demanda e dentro de try/catch pelo mesmo motivo de lá: o require de um
// módulo nativo que não está no binário LANÇA, e um import estático derrubaria o boot.
//
// Cooldown de 60 dias por aparelho (AsyncStorage): o SO já limita quantas vezes o diálogo
// aparece (iOS: 3x/ano; Android: cota própria) e NÃO diz se mostrou. Gastar a cota a cada
// gatilho faria o pedido cair justamente quando mais vale. A marca é gravada ANTES do
// requestReview() — se ele resolver sem mostrar nada, ainda assim conta como pedido.

import AsyncStorage from '@react-native-async-storage/async-storage'

const CHAVE_ULTIMO_PEDIDO = 'avaliacaoLoja:ultimoPedido'
const INTERVALO_MS = 60 * 24 * 60 * 60 * 1000 // 60 dias

let modulo = null
let indisponivel = false

const obter = () => {
  if (indisponivel) return null
  if (modulo) return modulo
  try {
    modulo = require('expo-store-review')
    return modulo
  } catch (err) {
    indisponivel = true
    console.log('[AvaliacaoLoja] módulo indisponível | msg:', err?.message)
    return null
  }
}

const emCooldown = async () => {
  const raw = await AsyncStorage.getItem(CHAVE_ULTIMO_PEDIDO)
  if (!raw) return false
  const ultimo = Number(raw)
  if (!Number.isFinite(ultimo)) return false
  return Date.now() - ultimo < INTERVALO_MS
}

// Pede a avaliação se o aparelho suporta e o cooldown passou. Resolve true quando o
// pedido foi feito ao SO (que decide, em silêncio, se mostra); false em qualquer outro
// caso. Fire-and-forget nos chamadores: não há nada a esperar nem a tratar.
export const pedirAvaliacaoLoja = async () => {
  try {
    const m = obter()
    if (!m) return false
    if (!(await m.isAvailableAsync())) return false
    if (!(await m.hasAction())) return false
    if (await emCooldown()) return false
    await AsyncStorage.setItem(CHAVE_ULTIMO_PEDIDO, String(Date.now()))
    await m.requestReview()
    return true
  } catch (err) {
    console.log('[AvaliacaoLoja] pedido falhou | msg:', err?.message)
    return false
  }
}
