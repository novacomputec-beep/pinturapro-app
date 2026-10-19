// Atualização pelo Google Play (In-App Updates), só Android, via expo-in-app-updates
// (módulo Expo nativo, sem react-native-device-info). Embrulha a lib de forma que
// QUALQUER falha — módulo nativo ausente (binário antigo, sideload), aparelho sem Play
// Store, erro da API — vire null/false e o chamador caia no caminho de sempre (abrir a
// loja). Nada aqui lança.
//
// Carregada sob demanda e dentro de try/catch de propósito: requireNativeModule LANÇA
// quando o módulo não está no binário, e um import estático derrubaria o app no boot.
//
// O que o módulo dá e o que não dá (ExpoInAppUpdatesModule.kt):
//   - eventos: updateStart { updateType }, updateDownloaded, updateCompleted,
//     updateCancelled. NÃO há evento de progresso (bytes) — a barra é indeterminada.
//   - ao terminar o download FLEXÍVEL ele mesmo chama completeUpdate(): o Play reinicia
//     o app sozinho; não existe "concluir" manual a expor.
//   - FAILED e resultado inesperado do fluxo: o próprio módulo abre a Play Store.
import { Platform } from 'react-native'

export const TIPO_PLAY = { FLEXIVEL: 0, IMEDIATO: 1 }

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

export const playDisponivel = () => obter() != null

// Pergunta ao Play se há versão mais nova. Devolve null quando não dá para saber.
// `emAndamento` = download flexível já iniciado numa abertura anterior (o Play retoma e
// o módulo conclui sozinho ao terminar): não é "disponível" para iniciar de novo.
export const consultarPlay = async () => {
  const m = obter()
  if (!m) return null
  try {
    const r = await m.checkForUpdate()
    const emAndamento = r?.updateInProgress === true
    return {
      disponivel: r?.updateAvailable === true && !emAndamento,
      emAndamento,
      flexivel: r?.flexibleAllowed === true,
      imediata: r?.immediateAllowed === true,
      versionCode: r?.storeVersion ?? null,
    }
  } catch (err) {
    console.log('[AtualizacaoPlay] consulta falhou | msg:', err?.message)
    return null
  }
}

// Abre a folha do Google (FLEXÍVEL) ou o fluxo de tela cheia (IMEDIATO). Resolve true
// quando o fluxo foi ABERTO; a resposta da pessoa chega pelos eventos.
export const iniciarAtualizacaoPlay = async (tipo) => {
  const m = obter()
  if (!m) return false
  try {
    return (await m.startUpdate(tipo === TIPO_PLAY.IMEDIATO)) === true
  } catch (err) {
    console.log('[AtualizacaoPlay] startUpdate falhou | tipo:', tipo, '| msg:', err?.message)
    return false
  }
}

// Eventos do módulo: cb(nome, payload) com nome em 'inicio' | 'baixado' | 'concluido' |
// 'cancelado'. Devolve a função que remove os listeners (no-op se a lib não carregou).
const EVENTOS = [
  ['updateStart', 'inicio'],
  ['updateDownloaded', 'baixado'],
  ['updateCompleted', 'concluido'],
  ['updateCancelled', 'cancelado'],
]
export const ouvirEventosPlay = (cb) => {
  const m = obter()
  if (!m) return () => {}
  const remover = []
  for (const [nativo, nome] of EVENTOS) {
    try { remover.push(m.addUpdateListener(nativo, (e) => cb(nome, e || {}))) } catch (err) {}
  }
  return () => { for (const r of remover) { try { r() } catch (e) {} } }
}
