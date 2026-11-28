import api from './api'
import { CATEGORIAS_SERVICO } from '../utils/categorias'

// Grupos de categorias RELACIONADAS do lado serviço, lidos de GET /config/grupos-categorias.
// O mapa vive no servidor (pinturapro-api utils/gruposCategorias.js, GRUPOS_RELACIONADOS:
// nome do grupo → slugs) e é o mesmo que casa os avisos de reparo com as especialidades;
// aqui ele só SUGERE, no cadastro, as categorias vizinhas da que o dono acabou de marcar.
//
// Aceita as duas formas razoáveis da resposta: { grupos: { nome: [slugs] } } (a forma do
// mapa do servidor) ou { grupos: [{ nome|id, categorias|slugs: [] }] }. Slug fora de
// CATEGORIAS_SERVICO é descartado — não há pill para ele.
//
// UMA requisição por processo, como o GET /config do ConviteCadastroServicos e o vídeo
// "Como funciona": a promise é guardada (não o valor) para montagens simultâneas dividirem
// a mesma ida; falha zera para a próxima montagem tentar de novo e, enquanto isso, responde
// "sem grupos" — o lado seguro (nenhuma sugestão) em vez de um chip que não existe.

const conhecidos = new Set(CATEGORIAS_SERVICO.map((c) => c.slug))

// Resposta → { slug: [slugs do grupo dele, ele incluído] }. 'outros' nunca entra.
const normalizar = (resp) => {
  const bruto = resp?.grupos ?? resp
  const grupos = Array.isArray(bruto)
    ? bruto.map((g) => g?.categorias ?? g?.slugs ?? [])
    : (bruto && typeof bruto === 'object' ? Object.values(bruto) : [])
  const grupoDoSlug = {}
  for (const lista of grupos) {
    if (!Array.isArray(lista)) continue
    const slugs = [...new Set(lista.map((s) => String(s).trim()).filter((s) => s && s !== 'outros' && conhecidos.has(s)))]
    for (const s of slugs) if (!grupoDoSlug[s]) grupoDoSlug[s] = slugs
  }
  return grupoDoSlug
}

// A resposta crua, uma ida por processo: dela saem os vizinhos (carregarGruposCategorias) e a
// chave de cada grupo (carregarChaveDoGrupo). Falha → null, e a próxima chamada tenta de novo.
let promessaResposta = null
const buscarResposta = () => {
  if (!promessaResposta) {
    promessaResposta = api.get('/config/grupos-categorias')
      .catch((err) => {
        console.log('[GruposCategorias] GET falhou, sem sugestões | code:', err?.code, '| msg:', err?.mensagem)
        promessaResposta = null
        return null
      })
  }
  return promessaResposta
}

export const carregarGruposCategorias = () => buscarResposta().then((r) => (r ? normalizar(r) : {}))

// Chave curta de cada grupo — a MESMA tabela CHAVE_DO_GRUPO do servidor (pinturapro-api ecf8474,
// utils/gruposCategorias.js:51). A resposta de /config/grupos-categorias só traz o NOME do
// grupo; as perguntas-guia (services/perguntasGuia) vêm por chave. Grupo novo no servidor sem
// linha aqui = sem perguntas do grupo (o lado seguro).
export const CHAVE_DO_GRUPO = {
  'Consertos da casa': 'reparos_casa', 'Limpeza e jardim': 'limpeza',
  'Beleza': 'beleza', 'Festas e eventos': 'festas',
  'Cuidado': 'cuidado', 'Transporte': 'transporte', 'Segurança': 'seguranca',
  'Escritório e aulas': 'digital_aulas', 'Arte e criação': 'arte', 'Divulgação e publicidade': 'divulgacao',
  'Obras de Construção Civil': 'obras_construcao_civil',
}

// { slug: chave do grupo dele }. Aceita as mesmas duas formas de resposta de `normalizar`.
export const carregarChaveDoGrupo = () => buscarResposta().then((r) => {
  const bruto = r?.grupos ?? r
  const pares = Array.isArray(bruto)
    ? bruto.map((g) => [g?.nome ?? g?.id, g?.categorias ?? g?.slugs])
    : (bruto && typeof bruto === 'object' ? Object.entries(bruto) : [])
  const chaveDoSlug = {}
  for (const [nome, slugs] of pares) {
    const chave = CHAVE_DO_GRUPO[String(nome ?? '').trim()]
    if (!chave || !Array.isArray(slugs)) continue
    for (const s of slugs) { const k = String(s).trim(); if (k && !chaveDoSlug[k]) chaveDoSlug[k] = chave }
  }
  return chaveDoSlug
})

// Slugs sugeridos para o que já está marcado: os vizinhos de grupo de CADA selecionada,
// menos as próprias selecionadas, na ordem de CATEGORIAS_SERVICO (a ordem das pills).
export const sugerirRelacionadas = (grupoDoSlug, selecionadas) => {
  const marcadas = new Set(selecionadas || [])
  const candidatas = new Set()
  for (const s of marcadas) for (const v of (grupoDoSlug?.[s] || [])) if (!marcadas.has(v)) candidatas.add(v)
  return CATEGORIAS_SERVICO.map((c) => c.slug).filter((s) => candidatas.has(s))
}
