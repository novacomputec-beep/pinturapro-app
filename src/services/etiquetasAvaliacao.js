import api from './api'
import { categoriasDe } from '../utils/categorias'

// Catálogo das etiquetas de avaliação — GET /config/etiquetas-avaliacao (público, cache de 1h
// no servidor). O app NUNCA grava a tabela em código: níveis, universais e os grupos
// (chave, nome, especialidades, etiquetas por nível) vêm daqui. Memoizado por processo e
// com a promessa compartilhada (duas telas abrindo juntas fazem UMA chamada). Falha de rede
// devolve null e NÃO fica em cache: a próxima abertura tenta de novo. Nada aqui lança.
let catalogoCache = null
let emVoo = null

const valido = (c) => c && Array.isArray(c.grupos) && c.universais && Array.isArray(c.niveis)

export const carregarCatalogoEtiquetas = async () => {
  if (catalogoCache) return catalogoCache
  if (emVoo) return emVoo
  emVoo = api.get('/config/etiquetas-avaliacao')
    .then((resp) => { if (valido(resp)) catalogoCache = resp; return catalogoCache })
    .catch((err) => { console.log('[Etiquetas] catálogo indisponível | code:', err?.code); return null })
    .finally(() => { emVoo = null })
  return emVoo
}

// Palavra do nível por nota (5 Excelente … 1 Péssimo). Do catálogo quando há; senão o padrão.
const NIVEIS_PADRAO = { 5: 'Excelente', 4: 'Bom', 3: 'Regular', 2: 'Ruim', 1: 'Péssimo' }
export const rotuloNivel = (catalogo, nota) =>
  catalogo?.niveis?.find((n) => Number(n.nota) === Number(nota))?.rotulo || NIVEIS_PADRAO[nota] || ''

// Grupo(s) da demanda avaliada, pela MESMA regra do servidor: obra → o grupo cujas
// especialidades são as de construção ('construcao_pintura'); reparo → todo grupo que
// contenha alguma das categorias da demanda (categoriasDe). 'outros' sozinho → nenhum.
export const gruposDaDemanda = (catalogo, ehObra, demanda) => {
  if (!catalogo) return []
  if (ehObra) return catalogo.grupos.filter((g) => g.chave === 'construcao_pintura').map((g) => g.chave)
  const cats = categoriasDe(demanda)
  return catalogo.grupos.filter((g) => (g.especialidades || []).some((s) => cats.includes(s))).map((g) => g.chave)
}

// Etiquetas oferecidas para (grupos, nota): as dos grupos no nível, depois as universais do
// nível, sem repetição. Sem catálogo → [] (a tela avalia só com a nota).
export const etiquetasPara = (catalogo, grupos, nota) => {
  if (!catalogo || !nota) return []
  const saida = []
  for (const chave of grupos) {
    const g = catalogo.grupos.find((x) => x.chave === chave)
    for (const e of g?.etiquetas?.[nota] || []) if (!saida.includes(e)) saida.push(e)
  }
  for (const e of catalogo.universais?.[nota] || []) if (!saida.includes(e)) saida.push(e)
  return saida
}

export const maxEtiquetas = (catalogo) => Number(catalogo?.max_por_avaliacao) || 5
