// Pedido que deixou de estar disponível: a API responde 409 PEDIDO_INDISPONIVEL quando o
// profissional manda interesse/candidatura ou responde uma contraproposta num pedido que não está
// mais 'aberta' (o dono excluiu segundos antes, encerrou…). Nada foi gravado e o dono não foi
// avisado, então aqui só resta avisar quem tentou, voltar e tirar o card do feed.
// O feed assina (aoPedidoIndisponivel) e filtra o id — como o onExpirar do contador — sem
// esperar o refetch de foco. Mesmo desenho de utils/eventosPush: síncrono e blindado.
import { Alert } from 'react-native'

export const MENSAGEM_PEDIDO_INDISPONIVEL = 'Este pedido não está mais disponível.'

const ouvintes = new Set()

export const aoPedidoIndisponivel = (fn) => {
  ouvintes.add(fn)
  return () => { ouvintes.delete(fn) }
}

export const emitirPedidoIndisponivel = ({ tipo, id }) => {
  if (!id) return
  for (const fn of Array.from(ouvintes)) {
    try { fn({ tipo, id }) } catch (err) { console.log('[pedidoIndisponivel] assinante falhou | msg:', err?.message) }
  }
}

export const ehPedidoIndisponivel = (err) => err?.codigo === 'PEDIDO_INDISPONIVEL'

// Trata o erro no catch da tela de detalhe: alerta com o texto do servidor (ou o padrão), tira o
// card do feed e volta ao fechar o alerta. Devolve true quando tratou; ao chamador basta sair.
export const alertouPedidoIndisponivel = (err, { tipo, id, navigation }) => {
  if (!ehPedidoIndisponivel(err)) return false
  emitirPedidoIndisponivel({ tipo, id })
  Alert.alert('Aviso', err.mensagem || MENSAGEM_PEDIDO_INDISPONIVEL, [{ text: 'OK', onPress: () => navigation?.goBack?.() }])
  return true
}
