import { useEffect, useState, useCallback } from 'react'
import { Alert, AppState, Keyboard } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'
import * as SecureStore from 'expo-secure-store'
import api from '../services/api'
import { comRetry } from './rede'

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
export const recuperarMidiasPendentes = async ({ logPrefix, montadoRef, aoReceber }) => {
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
      // Callback genérico: cada chamador decide o que fazer com os assets recuperados
      // (a criação de obra/reparo anexa à lista; o cadastro roteia ao slot em captura).
      aoReceber(recuperadas)
    }
  } catch (err) {
    console.log(`${logPrefix} getPendingResultAsync falhou (não-fatal) | msg:`, err?.message)
  }
}

// Hook de seleção de mídia. Registra a recuperação pós-destruição (montagem +
// retorno do 2º plano) e devolve os três handlers dos botões do bottom-sheet.
export function useSelecaoMidia({ logPrefix, montadoRef, setMidias }) {
  useEffect(() => {
    // Modelo multi-mídia (obra/reparo): anexa as recuperadas à lista — comportamento
    // idêntico ao anterior (antes o setMidias era passado direto ao helper).
    const aoReceber = (assets) => setMidias(prev => [...prev, ...assets])
    recuperarMidiasPendentes({ logPrefix, montadoRef, aoReceber })
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recuperarMidiasPendentes({ logPrefix, montadoRef, aoReceber })
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

// ============================================================================
// UPLOAD DE MÍDIA DA DEMANDA (obra/reparo) — Fase 3
// ============================================================================
// FLAG de corte de transporte. Enquanto FALSE, o app usa EXATAMENTE o caminho
// antigo (upload direto ao Cloudinary no momento do "Publicar"), byte-a-byte
// idêntico ao que existia antes — nenhum upload em 2º plano, nenhum badge de
// progresso, nenhum novo gate. Só ao virar TRUE é que a mídia passa a subir em
// segundo plano pelo endpoint próprio (POST /upload/midia) durante o
// preenchimento do formulário. Vira apenas 1 linha; nada mais muda.
export const USAR_UPLOAD_STREAMING = false

// Config por vertical: ÚNICO ponto de divergência obra × reparo na camada de
// mídia. Ambos os endpoints de registro já são idempotentes por (id, ordem).
const CONFIG_MIDIA = {
  obra:   { idField: 'obra_id',   registerPath: '/upload/obra-url'   },
  reparo: { idField: 'reparo_id', registerPath: '/upload/reparo-url' },
}

// ── Caminho ANTIGO (direto ao Cloudinary) — MOVIDO VERBATIM das telas ────────
// Retry resiliente e SILENCIOSO: até 9 tentativas (1 + MAX_UPLOAD_RETRIES) com
// backoff exponencial + jitter, cobrindo falhas de transporte E respostas de
// erro HTTP do Cloudinary (4xx/5xx com corpo { error }). Nenhum alerta enquanto
// restam tentativas; só rejeita após esgotar todas.
const MAX_UPLOAD_RETRIES = 8
const TIMEOUT_FOTO  = 45000    // 45s — fotos são pequenas (quality 0.6)
const TIMEOUT_VIDEO = 180000   // 180s — vídeos são muito maiores
const backoffUpload = (n) => Math.min(1000 * Math.pow(2, n) + Math.random() * 1000, 15000)
const xhrUpload = (url, form, { isVideo = false } = {}) => new Promise((resolve, reject) => {
  const attempt = (n) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.timeout = isVideo ? TIMEOUT_VIDEO : TIMEOUT_FOTO
    const retryOu = (rejeitar) => { if (n < MAX_UPLOAD_RETRIES) setTimeout(() => attempt(n + 1), backoffUpload(n)); else rejeitar() }
    xhr.onload = () => {
      let parsed = null
      try { parsed = JSON.parse(xhr.responseText) }
      catch (e) {
        console.log('[xhrUpload] falha ao parsear resposta JSON | tentativa:', n, '| status:', xhr.status)
        return retryOu(() => reject(new Error('Resposta inválida do servidor de upload')))
      }
      if (xhr.status >= 400 || parsed?.error) {
        console.log('[xhrUpload] erro HTTP do Cloudinary | tentativa:', n, '| status:', xhr.status, '| msg:', parsed?.error?.message)
        return retryOu(() => reject(new Error(parsed?.error?.message || `Erro ${xhr.status} no upload da mídia`)))
      }
      resolve(parsed)
    }
    xhr.onerror   = () => retryOu(() => reject(new Error('Falha na conexão com o servidor de upload')))
    xhr.ontimeout = () => retryOu(() => { const e = new Error('Tempo esgotado no upload da mídia'); e.code = 'UPLOAD_TIMEOUT'; reject(e) })
    xhr.send(form)
  }
  attempt(0)
})

// Sobe UMA mídia direto ao Cloudinary (caminho antigo) e devolve { secureUrl,
// publicId }. A LÓGICA de assinatura + xhrUpload é a mesma de antes; apenas o
// passo de registro foi separado (agora fica no chamador), para o mesmo código
// servir tanto o fluxo antigo (upload no Publicar) quanto o novo.
const uploadViaCloudinary = async (item, { ordem = 1 } = {}) => {
  const isVideo = item.tipo === 'video'
  const params = await comRetry(() => isVideo
    ? api.get('/upload/assinatura-cloudinary')
    : api.get('/upload/assinatura-cloudinary', { params: { folder: 'pinturapro/fotos' } }),
    { timeout: true, servidor: true })
  const cloudForm = new FormData()
  cloudForm.append('file', isVideo
    ? { uri: item.localUri, type: 'video/mp4', name: `video_${ordem}.mp4` }
    : { uri: item.localUri, type: 'image/jpeg', name: `foto_${ordem}.jpg` })
  cloudForm.append('timestamp', String(params.timestamp))
  cloudForm.append('signature', params.signature)
  cloudForm.append('api_key', params.api_key)
  cloudForm.append('folder', params.folder)
  const cloudData = await xhrUpload(`https://api.cloudinary.com/v1_1/${params.cloud_name}/${isVideo ? 'video' : 'image'}/upload`, cloudForm, { isVideo })
  if (cloudData.error || !cloudData.secure_url) throw new Error(cloudData.error?.message || `Erro no upload de ${isVideo ? 'video' : 'foto'}`)
  return { secureUrl: cloudData.secure_url, publicId: cloudData.public_id }
}

// ── Caminho NOVO (endpoint próprio, streaming) — POST /upload/midia ──────────
// Multipart campo "arquivo", autenticado; devolve { secure_url, public_id,
// resource_type }. Usa XHR (não axios) para expor upload.onprogress. Uma única
// tentativa: em 2º plano o reenvio é manual (reenviar()); no Publicar cai no
// tratamento de falha parcial das telas.
const uploadViaMidiaEndpoint = (item, { onProgress } = {}) => new Promise((resolve, reject) => {
  const isVideo = item.tipo === 'video'
  ;(async () => {
    let token = null
    try { token = await SecureStore.getItemAsync('token') } catch (e) {}
    const form = new FormData()
    form.append('arquivo', {
      uri: item.localUri,
      type: isVideo ? 'video/mp4' : 'image/jpeg',
      name: isVideo ? 'video.mp4' : 'foto.jpg',
    })
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${api.defaults.baseURL}/upload/midia`)
    xhr.timeout = isVideo ? TIMEOUT_VIDEO : TIMEOUT_FOTO
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total) }
    xhr.onload = () => {
      let parsed = null
      try { parsed = JSON.parse(xhr.responseText) } catch (e) {
        return reject(new Error('Resposta inválida do servidor de upload'))
      }
      if (xhr.status >= 400 || !parsed?.secure_url) {
        return reject(new Error(parsed?.erro || parsed?.error?.message || `Erro ${xhr.status} no upload da mídia`))
      }
      resolve({ secureUrl: parsed.secure_url, publicId: parsed.public_id })
    }
    xhr.onerror   = () => reject(new Error('Falha na conexão com o servidor de upload'))
    xhr.ontimeout = () => { const e = new Error('Tempo esgotado no upload da mídia'); e.code = 'UPLOAD_TIMEOUT'; reject(e) }
    xhr.send(form)
  })().catch(reject)
})

// Transporte escolhido pela flag. Registro é idêntico para os dois.
const uploadTransporte = (item, opcoes) =>
  USAR_UPLOAD_STREAMING ? uploadViaMidiaEndpoint(item, opcoes) : uploadViaCloudinary(item, opcoes)

// UUID v4 para key estável de cada item (independente da ordem, que só é fixada
// no registro).
const gerarIdMidia = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })

// Hook compartilhado de upload de mídia da demanda. Estado por item:
//   { id, localUri, tipo:'foto'|'video', status:'pendente'|'enviando'|'enviada'|'falha',
//     progresso:0..1, secureUrl?, publicId?, erro? }
// `adicionar` é passado como `setMidias` ao useSelecaoMidia (que só ANEXA:
// prev => [...prev, ...assets]); aceita tanto o updater quanto um array cru.
export function useUploadMidiaDemanda({ vertical, montadoRef, logPrefix }) {
  const config = CONFIG_MIDIA[vertical]
  const [itens, setItens] = useState([])

  const adicionar = useCallback((entrada) => {
    const assets = typeof entrada === 'function' ? entrada([]) : entrada
    if (!assets || assets.length === 0) return
    setItens(prev => [...prev, ...assets.map(a => ({
      id: gerarIdMidia(),
      localUri: a.uri,
      tipo: a.type === 'video' ? 'video' : 'foto',
      status: 'pendente',
      progresso: 0,
    }))])
  }, [])

  const remover = useCallback((id) => setItens(prev => prev.filter(i => i.id !== id)), [])
  const reenviar = useCallback((id) => setItens(prev => prev.map(i =>
    i.id === id ? { ...i, status: 'pendente', progresso: 0, erro: undefined } : i)), [])
  const resetar = useCallback(() => setItens([]), [])

  const algumEnviando = itens.some(i => i.status === 'enviando')

  // Upload em 2º plano — SÓ quando a flag está ligada. Serializa: sobe um item
  // por vez (nunca inicia se já há um 'enviando'). Com a flag desligada este
  // efeito é inerte e os itens ficam 'pendente' até o Publicar (fluxo antigo).
  useEffect(() => {
    if (!USAR_UPLOAD_STREAMING) return
    if (itens.some(i => i.status === 'enviando')) return
    const proximo = itens.find(i => i.status === 'pendente')
    if (!proximo) return
    let cancelado = false
    setItens(prev => prev.map(i => i.id === proximo.id ? { ...i, status: 'enviando', progresso: 0 } : i))
    uploadViaMidiaEndpoint(proximo, {
      onProgress: (p) => { if (!cancelado && montadoRef.current) setItens(prev => prev.map(i => i.id === proximo.id ? { ...i, progresso: p } : i)) },
    })
      .then(({ secureUrl, publicId }) => {
        if (!montadoRef.current) return
        setItens(prev => prev.map(i => i.id === proximo.id ? { ...i, status: 'enviada', progresso: 1, secureUrl, publicId } : i))
      })
      .catch((err) => {
        console.log(`${logPrefix} falha no upload em 2º plano | code: ${err.code} | msg: ${err.message}`)
        if (!montadoRef.current) return
        setItens(prev => prev.map(i => i.id === proximo.id ? { ...i, status: 'falha', erro: err.message } : i))
      })
    return () => { cancelado = true }
  }, [itens, montadoRef, logPrefix])

  // Publica a mídia contra a demanda já criada. Para cada item: garante o upload
  // (reaproveita secureUrl já enviada em 2º plano; senão sobe agora pelo
  // transporte da flag — este é o fluxo do caminho ANTIGO) e registra no backend
  // via endpoint idempotente por (id, ordem). Devolve os itens que falharam,
  // preservando sua `ordem`, para o retry das telas. `lista` opcional = subset a
  // reprocessar (retry); ausente = todos os itens, na ordem visual.
  const publicarMidias = useCallback(async (demandaId, lista) => {
    const alvo = lista || itens
    const falhas = []
    for (let i = 0; i < alvo.length; i++) {
      const item = alvo[i]
      const ordem = lista ? item.ordem : i + 1
      try {
        let { secureUrl, publicId } = item
        if (!secureUrl) {
          const r = await uploadTransporte(item, { ordem })
          secureUrl = r.secureUrl
          publicId = r.publicId
        }
        await comRetry(() => api.post(config.registerPath, {
          [config.idField]: demandaId, url: secureUrl, tipo: item.tipo, ordem,
        }), { timeout: true, servidor: true })
        await apagarArquivoTemp(item.localUri, logPrefix)
      } catch (err) {
        console.log(`${logPrefix} falha no upload/registro de mídia | ordem: ${ordem} | code: ${err.code} | msg: ${err.message}`)
        falhas.push({ ...item, ordem })
      }
    }
    return falhas
  }, [itens, config, logPrefix])

  return { itens, adicionar, remover, reenviar, resetar, algumEnviando, publicarMidias }
}
