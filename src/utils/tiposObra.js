import { CATEGORIAS_OBRA } from './categorias'

// Tipos de obra do passo "Que tipo de obra?" do cadastro de obra (Arte-Cadastrar-Obra): os
// 9 slugs de CATEGORIAS_OBRA (contrato com a API) com uma linha de exemplos cada. Escolha
// ÚNICA, como sempre foi; 'outros' é o tile largo "Outro tipo de obra". Tipo sem linha de
// exemplos mostra só o nome — nada some.

export const SLUG_OUTROS_OBRA = 'outros'

export const EXEMPLOS_OBRA = {
  residencial:    'Casa, reforma, pintura, muro',
  comercial:      'Loja, escritório, sala',
  galpao:         'Barracão, depósito, cobertura',
  industrial:     'Fábrica, indústria',
  rural:          'Fazenda, curral, cerca',
  institucional:  'Escola, igreja, clínica',
  infraestrutura: 'Calçada, rua, ponte',
  saneamento:     'Esgoto, fossa, rede de água',
}

export const TILE_OUTROS_OBRA = { id: SLUG_OUTROS_OBRA, titulo: 'Outro tipo de obra', emoji: '➕', desc: 'Não é nenhum dos acima: descreva no próximo passo.' }

// Tipos na ordem de CATEGORIAS_OBRA (alfabética, 'outros' por último), sem o 'outros' — ele
// é o tile largo do fim da grade.
export const tiposObraComExemplos = () =>
  CATEGORIAS_OBRA.filter((c) => c.slug !== SLUG_OUTROS_OBRA)
    .map((c) => ({ slug: c.slug, rotulo: c.rotulo, emoji: c.emoji, exemplos: EXEMPLOS_OBRA[c.slug] || '' }))
