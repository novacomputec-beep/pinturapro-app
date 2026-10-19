// Atualização pelo Google Play (In-App Updates), só Android, via expo-in-app-updates
// (módulo Expo nativo). Embrulha a lib de forma que QUALQUER falha — módulo nativo
// ausente (binário antigo, sideload), aparelho sem Play Store, erro da API — vire
// null/false e o chamador caia no caminho de sempre (abrir a loja). Nada aqui lança.
//
// Carregada sob demanda e dentro de try/catch de propósito: requireNativeModule LANÇA
// quando o módulo não está no binário, e um import estático derrubaria o app no boot.
//
// Só o fluxo IMEDIATO é usado: a tela cheia do Google baixa, instala e reinicia o app,
// e nunca há download em segundo plano. (O módulo também faz FLEXÍVEL, mas conclui o
// download sozinho com completeUpdate() — reiniciaria o app no meio do uso.)
import { Platform } from 'react-native'

let modulo = null
let indisponivel = Platform.OS !== 'android'

const obter = () => {
  if (indisponivel) return null
  if (modulo) return modulo
  try {
    modulo = require('expo-in-app-updates')
    return modulo
  } catch (err) {
    indisponivel = true
    console.log('[AtualizacaoPlay] módulo indisponível | msg:', err?.message)
    return null
  }
}

// Pergunta ao Play se há versão mais nova. Devolve null quando não dá para saber.
// `updateInProgress` (fluxo iniciado antes e ainda em curso) não conta como disponível.
export const consultarPlay = async () => {
  const m = obter()
  if (!m) return null
  try {
    const r = await m.checkForUpdate()
    return {
      disponivel: r?.updateAvailable === true && r?.updateInProgress !== true,
      imediata: r?.immediateAllowed === true,
      versionCode: r?.storeVersion ?? null,
    }
  } catch (err) {
    console.log('[AtualizacaoPlay] consulta falhou | msg:', err?.message)
    return null
  }
}

// Abre o fluxo IMEDIATO do Google (tela cheia). Resolve true quando o fluxo foi ABERTO;
// false quando o Play não permite ou falhou — o chamador abre a loja.
export const iniciarAtualizacaoImediata = async () => {
  const m = obter()
  if (!m) return false
  try {
    return (await m.startUpdate(true)) === true
  } catch (err) {
    console.log('[AtualizacaoPlay] startUpdate falhou | msg:', err?.message)
    return false
  }
}

// Cancelamento do fluxo pela pessoa (fechou a tela do Google). Devolve a função que
// remove o listener (no-op se a lib não carregou).
export const ouvirCancelamentoPlay = (cb) => {
  const m = obter()
  if (!m) return () => {}
  try { return m.addUpdateListener('updateCancelled', (e) => cb(e || {})) } catch (err) { return () => {} }
}
