import { useState, useEffect } from 'react'
import api from '../services/api'

// Pedidos SALVOS pelo profissional (arte salvar-e-anuncio-previa-v2): o coração dos cards do feed.
//
// Contrato com a API — TODO o contrato mora neste arquivo:
//   - a linha do feed (GET /reparos e GET /obras) traz `salvo: true|false` para quem consulta;
//   - salvar:  POST   /reparos/:id/salvar  |  /obras/:id/salvar
//   - tirar:   DELETE /reparos/:id/salvar  |  /obras/:id/salvar
//   - a linha do DONO (GET /reparos/minhas, /obras/minhas) traz `salvos_count`.
//
// O toque é OTIMISTA: a marca local muda na hora e vale sobre o `salvo` da linha (que só se
// atualiza na próxima busca do feed); se a chamada falha, a marca volta ao que era e o erro
// sobe para quem chamou. A marca é por USUÁRIO + tipo + id: outra conta no mesmo aparelho não
// herda os corações da anterior.
const marcas = new Map()
const emVoo = new Set()
const ouvintes = new Set()
const avisar = () => ouvintes.forEach((f) => f())
const chave = (uid, tipo, id) => `${uid ?? ''}:${tipo}:${id}`
const rota = (tipo, id) => `/${tipo === 'obra' ? 'obras' : 'reparos'}/${id}/salvar`

export const estaSalvo = (uid, tipo, item) => {
  const k = chave(uid, tipo, item?.id)
  return marcas.has(k) ? marcas.get(k) : item?.salvo === true
}

// Alterna e devolve o novo estado. Toque repetido com a chamada em voo é ignorado (devolve o
// estado atual). Falha: reverte e relança.
export const alternarSalvo = async (uid, tipo, item) => {
  const k = chave(uid, tipo, item?.id)
  const antes = estaSalvo(uid, tipo, item)
  if (item?.id == null || emVoo.has(k)) return antes
  emVoo.add(k)
  marcas.set(k, !antes)
  avisar()
  try {
    if (antes) await api.delete(rota(tipo, item.id))
    else await api.post(rota(tipo, item.id))
    return !antes
  } catch (err) {
    marcas.set(k, antes)
    avisar()
    throw err
  } finally {
    emVoo.delete(k)
  }
}

// Re-renderiza quem usa a cada mudança de marca; o número devolvido serve de dependência.
export const useVersaoSalvos = () => {
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    const f = () => setVersao((v) => v + 1)
    ouvintes.add(f)
    return () => { ouvintes.delete(f) }
  }, [])
  return versao
}

// Caixa do dono: "N profissional(is) salvaram seu pedido".
export const textoSalvaram = (n) => `${n} ${n === 1 ? 'profissional salvou' : 'profissionais salvaram'} seu pedido`
