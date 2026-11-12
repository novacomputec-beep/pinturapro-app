import api from '../services/api'
import { comRetry } from './rede'

// Exclusão de um pedido pelo DONO: DELETE /obras/dono/:id ou /reparos/dono/:id. A API não
// apaga a linha, ela a marca como 'cancelada' (e o pedido sai das listas). Única chamada do app
// para isso: a lixeira dos cards de MeusPedidosScreen e o "🗑️ Cancelar pedido" do detalhe
// (components/CancelarPedido) passam por aqui.
//
// { timeout: true }: o DELETE de um id é IDEMPOTENTE. Repetir a exclusão de um id já removido
// devolveria 404, e 4xx nunca é reexecutado, então o retry não transforma sucesso em erro. Um
// socket ocioso derrubado pelo SO não falha na hora (ERR_NETWORK): pode travar até o timeout de
// 30 s, e é o mesmo evento, já que a requisição não foi processada nos dois casos. { servidor }
// fica FORA: um 5xx prova que a requisição chegou e pode ter excluído.
//
// 409 MATCH_ATIVO (profissional já escolhido) chega como erro com err.codigo === 'MATCH_ATIVO'
// e err.mensagem do servidor ("Use 'Cancelar serviço' na tela do pedido"); quem chama mostra.
export const excluirPedido = (tipo, id) =>
  comRetry(
    () => api.delete(tipo === 'obra' ? `/obras/dono/${id}` : `/reparos/dono/${id}`),
    { timeout: true, persistir: true },
  )

export const ehMatchAtivo = (err) => err?.codigo === 'MATCH_ATIVO'
