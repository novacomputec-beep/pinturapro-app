// Links de demanda compartilhados: https://protudo.app.br/p/CODIGO e protudo://p/CODIGO.
// Aqui mora o que NÃO depende de navegação: extrair o código do URL, resolvê-lo na API
// pública e avisar a pessoa quando o link não leva a lugar nenhum. Quem navega é o
// AppNavigator, pelo MESMO roteador do toque de notificação (navegarParaNotificacao).
import { Platform, ToastAndroid, Alert } from 'react-native'
import api from '../services/api'
import { comRetry } from './rede'

// Código de 5 caracteres alfanuméricos depois de "/p/". Casa nas duas formas: no https o
// "p" é o primeiro segmento do caminho; no esquema próprio ele é o host (protudo://p/X),
// e nos dois casos o texto "p/CODIGO" aparece igual. Query/fragmento depois do código são
// ignorados; um "p/abc" (curto) ou "p/abcdef" (longo) não casa e volta null.
const RE_CODIGO = /(?:^|\/)p\/([A-Za-z0-9]{5})(?:[/?#]|$)/

export const codigoDoLink = (url) => {
  if (typeof url !== 'string') return null
  // Sem normalizar caixa: quem decide se o código é case-sensitive é o servidor.
  const m = url.match(RE_CODIGO)
  return m ? m[1] : null
}

// Mensagem curta, sem bloquear: toast no Android; no iOS não existe toast nativo e o Alert
// de um botão é o equivalente mais próximo sem biblioteca nova.
export const mostrarAviso = (mensagem) => {
  if (Platform.OS === 'android') ToastAndroid.show(mensagem, ToastAndroid.LONG)
  else Alert.alert('', mensagem)
}

// Status que significam "demanda fechada": o link continua válido no servidor (a linha
// existe), mas não há mais o que ver/propor. Cobre as duas verticais e os dois gêneros.
const STATUS_FECHADOS = new Set([
  'encerrado', 'encerrada', 'cancelado', 'cancelada', 'expirado', 'expirada',
  'concluido', 'concluida', 'finalizado', 'finalizada', 'recusado', 'recusada',
])

// Lê o par (vertical, id) de qualquer forma razoável que a resposta pública tenha:
// { tipo: 'reparo'|'obra', id } no topo, ou os ids nomeados (reparo_id/obra_id), ou tudo
// isso dentro de `demanda`. Volta null quando não dá para saber onde a demanda vive.
const extrairDemanda = (resp) => {
  const d = resp?.demanda && typeof resp.demanda === 'object' ? resp.demanda : resp
  if (!d || typeof d !== 'object') return null
  const tipo = String(d.tipo ?? d.vertical ?? d.tipo_demanda ?? '').toLowerCase()
  if (d.reparo_id) return { reparo_id: d.reparo_id, status: d.status }
  if (d.obra_id) return { obra_id: d.obra_id, status: d.status }
  if (!d.id) return null
  if (tipo === 'reparo' || tipo === 'servico' || tipo === 'serviço') return { reparo_id: d.id, status: d.status }
  if (tipo === 'obra') return { obra_id: d.id, status: d.status }
  return null
}

// GET /publico/demanda/:codigo (a baseURL já traz o /api). Devolve { reparo_id } ou
// { obra_id } para o roteador, ou null quando o link não leva a nada: código inválido
// (404/400), demanda fechada (410 ou status fechado) ou resposta sem id/vertical. Erro de
// rede também vira null — o chamador só sabe mostrar o aviso, e abrir o detalhe sem id
// seria pior. GET é idempotente: retry em timeout e 5xx é seguro.
export const resolverDemandaPorCodigo = async (codigo) => {
  try {
    const resp = await comRetry(() => api.get(`/publico/demanda/${encodeURIComponent(codigo)}`), { timeout: true, servidor: true })
    const demanda = extrairDemanda(resp)
    if (!demanda) return null
    const fechada = resp?.encerrada === true || resp?.demanda?.encerrada === true || resp?.disponivel === false
      || STATUS_FECHADOS.has(String(demanda.status ?? '').toLowerCase())
    if (fechada) return null
    return demanda
  } catch (err) {
    console.log('[deepLink] falha ao resolver código | codigo:', codigo, '| status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem || err?.message)
    return null
  }
}
