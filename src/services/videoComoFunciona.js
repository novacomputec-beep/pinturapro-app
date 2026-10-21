import AsyncStorage from '@react-native-async-storage/async-storage'
import api from './api'

// Vídeo "Como funciona o ProTudo" (YouTube) e seus capítulos, lidos de
// GET /publico/video-como-funciona → { video_id, capitulos: [{ seg, titulo }] }.
// video_id '' = sem vídeo publicado: a tela, a entrada do Perfil e a pílula das telas
// iniciais somem. Quem grava é o admin (PUT /admin/video-como-funciona).
//
// UMA requisição por processo, como o GET /config do ConviteCadastroServicos: a promise é
// guardada (não o valor) para montagens simultâneas dividirem a mesma ida; falha zera para
// a próxima montagem tentar de novo e, enquanto isso, responde "sem vídeo" — o lado seguro
// (nada aparece) em vez de uma entrada que abre uma tela vazia.
const SEM_VIDEO = { video_id: '', capitulos: [] }

let promessaVideo = null
export const carregarVideoComoFunciona = () => {
  if (!promessaVideo) {
    promessaVideo = api.get('/publico/video-como-funciona')
      .then(resp => ({
        video_id: typeof resp?.video_id === 'string' ? resp.video_id : '',
        capitulos: Array.isArray(resp?.capitulos) ? resp.capitulos : [],
      }))
      .catch(err => {
        console.log('[VideoComoFunciona] GET falhou, vídeo oculto | code:', err?.code, '| msg:', err?.mensagem)
        promessaVideo = null
        return SEM_VIDEO
      })
  }
  return promessaVideo
}

// Marca local "já toquei na pílula 🎬 Veja como funciona": por conta (id do usuário), como
// a do ConviteCadastroServicos. Definitiva — a pílula nunca volta; a tela segue acessível
// pelo Perfil. Best-effort: falhar só faz a pílula aparecer de novo na próxima abertura.
const CHAVE_PILULA = 'pilula_como_funciona_oculta'
const chavePilula = (usuarioId) => `${CHAVE_PILULA}:${usuarioId}`

export const pilulaComoFuncionaOculta = async (usuarioId) => {
  if (usuarioId == null) return true
  try { return (await AsyncStorage.getItem(chavePilula(usuarioId))) === '1' } catch (e) { return false }
}

export const ocultarPilulaComoFunciona = async (usuarioId) => {
  if (usuarioId == null) return
  try { await AsyncStorage.setItem(chavePilula(usuarioId), '1') } catch (e) {}
}
