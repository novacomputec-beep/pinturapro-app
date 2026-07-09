import { useEffect } from 'react'
import { Alert, AppState, Keyboard } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'

// Implementação ÚNICA da seleção/captura de mídia, compartilhada por
// CadastrarObraScreen e CadastrarReparoScreen. Antes cada tela tinha sua própria
// cópia verbatim — um conserto em uma silenciosamente não chegava na outra
// (o mesmo problema de divergência dono/prestador que já mordeu este projeto).
// Cada chamador passa seu próprio `logPrefix` ('[CadastrarObra]' / '[CadastrarReparo]')
// para que os logs de produção continuem distinguíveis.

// Cancelamento INVOLUNTÁRIO (a Activity nem chegou a abrir, tipicamente por falta
// de memória) retorna quase instantâneo e sem assets; o VOLUNTÁRIO (usuário abriu
// a câmera/galeria e voltou) demora bem mais. Usamos o tempo decorrido para os
// distinguir e só incomodamos o usuário no caso involuntário.
const LIMIAR_CANCELAMENTO_INVOLUNTARIO_MS = 1000

// Apaga a cópia local criada pelo próprio app no cache após o upload. Tanto fotos
// quanto vídeos (câmera E galeria) são exportados pelo expo-image-picker para o
// cacheDirectory, então asset.uri aponta SEMPRE para uma cópia nossa — nunca para
// o original da galeria do usuário (content://). Ainda assim só apagamos se a URI
// estiver dentro do cacheDirectory, por segurança. Falha aqui é não-fatal: apenas
// registramos, nunca lançamos e nunca travamos o envio.
export const apagarArquivoTemp = async (uri, logPrefix) => {
  try {
    if (!uri || typeof uri !== 'string') return
    const cache = FileSystem.cacheDirectory
    if (!cache || !uri.startsWith(cache)) return
    await FileSystem.deleteAsync(uri, { idempotent: true })
  } catch (err) {
    console.log(`${logPrefix} falha ao apagar temp (não-fatal) | msg:`, err?.message)
  }
}

// Recupera resultados perdidos quando o Android destrói a MainActivity durante a
// captura (pressão de memória). expo-image-picker guarda o último resultado
// bem-sucedido e o entrega via getPendingResultAsync.
//
// Nota de versão (expo-image-picker ~14.7.1): o módulo nativo Android retorna um
// ÚNICO objeto { canceled, assets } ou null — apesar de a tipagem TS declarar
// `(ImagePickerResult | ImagePickerErrorResult)[]`. Toleramos ambos os formatos
// (objeto único, array e null) e descartamos entradas de erro (sem `assets`).
export const recuperarMidiasPendentes = async ({ logPrefix, montadoRef, setMidias }) => {
  try {
    const pendente = await ImagePicker.getPendingResultAsync()
    if (!pendente) return
    const respostas = Array.isArray(pendente) ? pendente : [pendente]
    const recuperadas = []
    for (const r of respostas) {
      if (r && !r.canceled && Array.isArray(r.assets)) recuperadas.push(...r.assets)
    }
    if (recuperadas.length > 0 && montadoRef.current) {
      console.log(`${logPrefix} mídias recuperadas via getPendingResultAsync:`, recuperadas.length)
      setMidias(prev => [...prev, ...recuperadas])
    }
  } catch (err) {
    console.log(`${logPrefix} getPendingResultAsync falhou (não-fatal) | msg:`, err?.message)
  }
}

// Hook de seleção de mídia. Registra a recuperação pós-destruição (montagem +
// retorno do 2º plano) e devolve os três handlers dos botões do bottom-sheet.
export function useSelecaoMidia({ logPrefix, montadoRef, setMidias }) {
  useEffect(() => {
    recuperarMidiasPendentes({ logPrefix, montadoRef, setMidias })
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recuperarMidiasPendentes({ logPrefix, montadoRef, setMidias })
    })
    return () => sub.remove()
    // montadoRef/setMidias são estáveis e logPrefix é constante — registra só uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const processarResultadoPicker = (resultado, origem, t0) => {
    const ms = Date.now() - t0
    if (!resultado || resultado.canceled) {
      const involuntario = ms < LIMIAR_CANCELAMENTO_INVOLUNTARIO_MS
      console.log(`${logPrefix} picker sem mídia | origem: ${origem} | ms: ${ms} | provavelInvoluntario: ${involuntario}`)
      if (involuntario) {
        Alert.alert('Não foi possível abrir', 'O app pode estar com pouca memória neste momento. Se as fotos/vídeos pararem de abrir, feche o aplicativo completamente e abra de novo.')
      }
      return
    }
    if (resultado.assets?.length && montadoRef.current) {
      setMidias(prev => [...prev, ...resultado.assets])
    }
  }

  const usarCameraFoto = async () => {
    Keyboard.dismiss()
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera.'); return }
      const t0 = Date.now()
      const resultado = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        allowsEditing: false,
      })
      processarResultadoPicker(resultado, 'camera-foto', t0)
    } catch (err) {
      console.log(`${logPrefix} launchCameraAsync (foto) rejeitou | msg:`, err?.message)
      Alert.alert('Não foi possível abrir a câmera', 'Tente novamente. Se o problema continuar, feche o aplicativo completamente e abra de novo.')
    }
  }

  const usarCameraVideo = async () => {
    Keyboard.dismiss()
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera.'); return }
      await Audio.requestPermissionsAsync()
      const t0 = Date.now()
      const resultado = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        videoMaxDuration: 30,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
        videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
        allowsEditing: false,
      })
      processarResultadoPicker(resultado, 'camera-video', t0)
    } catch (err) {
      console.log(`${logPrefix} launchCameraAsync (video) rejeitou | msg:`, err?.message)
      Alert.alert('Não foi possível abrir a câmera', 'Tente novamente. Se o problema continuar, feche o aplicativo completamente e abra de novo.')
    }
  }

  const usarGaleria = async () => {
    Keyboard.dismiss()
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria.'); return }
      const t0 = Date.now()
      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.6,
        videoMaxDuration: 30,
      })
      processarResultadoPicker(resultado, 'galeria', t0)
    } catch (err) {
      console.log(`${logPrefix} launchImageLibraryAsync rejeitou | msg:`, err?.message)
      Alert.alert('Não foi possível abrir a galeria', 'Tente novamente. Se o problema continuar, feche o aplicativo completamente e abra de novo.')
    }
  }

  return { usarCameraFoto, usarCameraVideo, usarGaleria }
}
