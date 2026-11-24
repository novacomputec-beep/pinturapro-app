import { useState, useEffect } from 'react'
import api from '../services/api'
import { comRetry } from './rede'

// Pedidos SALVOS pelo profissional (arte salvar-e-anuncio-previa-v2): o coração dos cards do feed.
//
// Contrato com a API (pinturapro-api 6d57715, routes/salvos.js + utils/demandasSalvas.js) — TODO
// o contrato mora neste arquivo:
//   - a linha do feed (GET /reparos e GET /obras) traz `salvo: true|false` para quem consulta;
//   - POST /salvos { tipo: 'reparo'|'obra', demanda_id } ALTERNA e devolve { tipo, demanda_id, salvo };
//   - GET /salvos?limit= → { salvos: [{ tipo, id, titulo, categoria, categorias, valor,
//     valor_a_combinar, cidade, bairro, uf, status, expira_em, aberta, foto_capa, salvo_em,
//     salvo: true }] }, do mais recente para o mais antigo (o chip "❤️ Salvos (n)");
//   - a linha do DONO (GET /reparos/minhas, /obras/minhas) traz `salvos_count`.
//
// O toque é OTIMISTA: a marca local muda na hora e vale sobre o `salvo` da linha (que só se
// atualiza na próxima busca); se a chamada falha, a marca volta ao que era e o erro sobe para
// quem chamou. Como o POST alterna do lado do servidor, o `salvo` da RESPOSTA é a verdade e
// substitui a marca otimista. Marcas e lista são por USUÁRIO: outra conta no mesmo aparelho não
// herda os corações da anterior.
const marcas = new Map()
const emVoo = new Set()
const listas = new Map() // uid → linhas de GET /salvos (normalizadas)
const ouvintes = new Set()
const avisar = () => ouvintes.forEach((f) => f())
const chave = (uid, tipo, id) => `${uid ?? ''}:${tipo}:${id}`
const tipoDe = (t) => (t === 'obra' ? 'obra' : 'reparo')

export const estaSalvo = (uid, tipo, item) => {
  const k = chave(uid, tipo, item?.id)
  return marcas.has(k) ? marcas.get(k) : item?.salvo === true
}

// Linha de GET /salvos na forma que os cards do feed leem: o card de serviço lê o valor em
// `valor_estimado`; o de obra, em `valor`.
const normalizar = (l) => {
  const tipo = tipoDe(l?.tipo)
  return { ...l, tipo, salvo: true, ...(tipo === 'reparo' ? { valor_estimado: l?.valor_estimado ?? l?.valor } : {}) }
}

// Lista dos salvos da conta (o que GET /salvos trouxe por último, mais os toques desta sessão).
export const listaSalvos = (uid) => listas.get(String(uid ?? '')) || []

// Relê GET /salvos. Nunca lança: falha mantém a lista que havia (o chip segue com o que sabe).
export const carregarSalvos = async (uid) => {
  if (uid == null) return
  try {
    const r = await comRetry(() => api.get('/salvos', { params: { limit: 100 } }), { timeout: true, servidor: true })
    const linhas = (Array.isArray(r?.salvos) ? r.salvos : []).filter((l) => l?.id != null).map(normalizar)
    listas.set(String(uid), linhas)
    // O servidor acabou de dizer quais estão salvos: as marcas destes ficam em dia.
    for (const l of linhas) if (!emVoo.has(chave(uid, l.tipo, l.id))) marcas.set(chave(uid, l.tipo, l.id), true)
    avisar()
  } catch (err) {
    console.log('[salvos] GET /salvos falhou, lista mantida | status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem)
  }
}

const porNaLista = (uid, tipo, item, salvo) => {
  const u = String(uid ?? '')
  const semEle = listaSalvos(uid).filter((l) => !(l.tipo === tipo && l.id === item.id))
  listas.set(u, salvo ? [normalizar({ ...item, tipo }), ...semEle] : semEle)
}

// Alterna e devolve o novo estado. Toque repetido com a chamada em voo é ignorado (devolve o
// estado atual). Falha: reverte e relança.
export const alternarSalvo = async (uid, tipo, item) => {
  const k = chave(uid, tipo, item?.id)
  const antes = estaSalvo(uid, tipo, item)
  if (item?.id == null || emVoo.has(k)) return antes
  const listaAntes = listaSalvos(uid)
  emVoo.add(k)
  marcas.set(k, !antes)
  porNaLista(uid, tipo, item, !antes)
  avisar()
  try {
    const r = await api.post('/salvos', { tipo, demanda_id: item.id })
    const agora = typeof r?.salvo === 'boolean' ? r.salvo : !antes
    if (agora !== !antes) { marcas.set(k, agora); porNaLista(uid, tipo, item, agora); avisar() }
    return agora
  } catch (err) {
    marcas.set(k, antes)
    listas.set(String(uid ?? ''), listaAntes)
    avisar()
    throw err
  } finally {
    emVoo.delete(k)
  }
}

// Re-renderiza quem usa a cada mudança de marca ou de lista; o número serve de dependência.
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
