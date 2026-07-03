import api from './api'

let buffer = []
let vistos = new Set()
let timerFlush = null

const flush = async () => {
  if (timerFlush) { clearTimeout(timerFlush); timerFlush = null }
  if (buffer.length === 0) return
  const lote = buffer.splice(0, 50)
  try {
    await api.post('/feed/visualizacoes', { itens: lote })
  } catch (e) {
    // silencioso — visualização perdida não é crítica
  }
}

export const registrarVisualizacao = (tipo, id) => {
  if (!tipo || !id) return
  const chave = `${tipo}:${id}`
  if (vistos.has(chave)) return
  vistos.add(chave)
  buffer.push({ tipo, id })
  if (buffer.length >= 50) { flush(); return }
  if (!timerFlush) timerFlush = setTimeout(flush, 5000)
}

export const limparVisualizacoesSessao = () => {
  buffer = []
  vistos.clear()
  if (timerFlush) { clearTimeout(timerFlush); timerFlush = null }
}
