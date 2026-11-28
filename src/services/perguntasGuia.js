import api from './api'
import { carregarChaveDoGrupo } from './gruposCategorias'

// Perguntas-guia do passo de descrição do Novo pedido (serviço e obra): GET /perguntas-guia
// (pinturapro-api ecf8474, público, dado estático em src/data/perguntasGuia.js):
//   { grupos: { <chave do grupo>: [perguntas] }, especialidades: { <slug>: [perguntas] } }
// A especialidade listada SUBSTITUI o seu grupo. UMA ida por processo (a promise fica em
// memória, como services/gruposCategorias); falha → null em silêncio (sem caixa) e a próxima
// montagem tenta de novo.

const listaDe = (v) => (Array.isArray(v) ? v.map((p) => String(p ?? '').trim()).filter(Boolean) : [])
const mapaDe = (o) => {
  const m = {}
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { const l = listaDe(v); if (l.length) m[k] = l }
  return m
}

let promessa = null
const carregar = () => {
  if (!promessa) {
    promessa = Promise.all([api.get('/perguntas-guia'), carregarChaveDoGrupo()])
      .then(([r, chaveDoSlug]) => ({ grupos: mapaDe(r?.grupos), especialidades: mapaDe(r?.especialidades), chaveDoSlug: chaveDoSlug || {} }))
      .catch((err) => {
        console.log('[PerguntasGuia] GET falhou, sem caixa | code:', err?.code, '| msg:', err?.mensagem)
        promessa = null
        return null
      })
  }
  return promessa
}

// Perguntas para as especialidades marcadas (na ordem em que foram marcadas): a primeira com
// entrada própria em `especialidades`; sem nenhuma, a primeira cujo GRUPO tem entrada em
// `grupos`; senão null (sem caixa).
export const escolherPerguntas = (dados, slugs) => {
  if (!dados) return null
  const lista = (Array.isArray(slugs) ? slugs : []).filter(Boolean)
  for (const s of lista) if (dados.especialidades[s]) return dados.especialidades[s]
  for (const s of lista) { const g = dados.chaveDoSlug[s]; if (g && dados.grupos[g]) return dados.grupos[g] }
  return null
}

export const carregarPerguntasGuia = carregar
