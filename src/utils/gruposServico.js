import { CATEGORIAS_SERVICO, CATEGORIAS_CONSTRUCAO } from './categorias'

// Grupos do passo "Do que você precisa?" do cadastro de serviço (Arte-Cadastrar-Servico): a
// única fonte dos 8 grupos, da ordem dos tiles, dos exemplos do dia a dia de cada categoria
// e do fallback. Os slugs são os de CATEGORIAS_SERVICO (contrato com a API); o que entra no
// pedido continua sendo o slug — o grupo é só apresentação.
//
// Categoria que exista em CATEGORIAS_SERVICO e NÃO esteja em nenhum grupo (uma futura, por
// exemplo) cai em "Casa e reparos" — nada some da tela. 'outros' nunca entra em grupo: é o
// tile largo "Não achei o meu serviço", que marca o slug direto.
//
// Dentro de cada folha as categorias saem em ordem ALFABÉTICA (regra fixa), seja qual for a
// ordem em que os slugs estão listados abaixo; "Outros" é sempre o último da tela.

export const GRUPO_FALLBACK = 'casa'
export const SLUG_OUTROS = 'outros'

// Categorias recém-chegadas: ganham a etiqueta verde "NOVO" na folha do grupo. Lista para
// esvaziar quando deixarem de ser novidade.
export const NOVAS_SERVICO = ['informatica', 'gesseiro', 'placas_fachadas', 'borracheiro']
export const ehNovaServico = (slug) => NOVAS_SERVICO.includes(slug)

export const GRUPOS_SERVICO = [
  { id: 'casa',       titulo: 'Casa e reparos',        emoji: '🏠', slugs: ['hidraulica', 'eletrica', 'climatizacao', 'alvenaria', 'montagem_moveis', 'faxina', 'chaveiro', 'marcenaria', 'serralheria', 'vidraceiro', 'estofamento', 'dedetizacao', 'jardineiro', 'eletronica', 'informatica', 'gesseiro'] },
  { id: 'festas',     titulo: 'Festas e eventos',      emoji: '🎉', slugs: ['garcom', 'churrasqueiro', 'cozinheiro', 'confeiteiro', 'salgadeiro', 'decoracao_festas', 'aluguel_festas', 'recreacao_infantil', 'filmagem_fotografia', 'musico', 'dj'] },
  { id: 'beleza',     titulo: 'Beleza e bem-estar',    emoji: '💇', slugs: ['cabelo', 'barbeiro', 'manicure', 'maquiagem', 'design_sobrancelhas', 'depilacao', 'massagem', 'podologo', 'personal_trainer', 'tatuagem'] },
  { id: 'cuidar',     titulo: 'Cuidar de alguém',      emoji: '🤝', slugs: ['baba', 'cuidador', 'pet'] },
  { id: 'transporte', titulo: 'Transporte e veículos', emoji: '🚗', slugs: ['motorista', 'motociclista', 'mudancas', 'lavajato', 'mecanica', 'borracheiro'] },
  { id: 'aulas',      titulo: 'Aulas e internet',      emoji: '💻', slugs: ['aula_particular', 'profissional_home_office', 'editor_video', 'social_midia', 'tradutor', 'panfletagem'] },
  { id: 'seguranca',  titulo: 'Segurança',             emoji: '🛡️', slugs: ['vigia', 'seguranca'] },
  { id: 'arte',       titulo: 'Arte e criação',        emoji: '🎨', slugs: ['artesanato', 'costura', 'placas_fachadas'] },
]

// Linha curta de exemplos do dia a dia, por slug. Categoria sem linha mostra só o nome.
export const EXEMPLOS_SERVICO = {
  hidraulica:               "Torneira, cano, vazamento, caixa d'água",
  eletrica:                 'Tomada, chuveiro, disjuntor, luminária',
  climatizacao:             'Ar-condicionado, geladeira, freezer',
  alvenaria:                'Buraco, rachadura, muro, reboco',
  montagem_moveis:          'Guarda-roupa, cama, estante, mesa',
  faxina:                   'Limpeza geral, pós-obra, diarista',
  chaveiro:                 'Cópia de chave, fechadura, abrir porta',
  marcenaria:               'Porta, armário, prateleira, conserto de madeira',
  serralheria:              'Portão, grade, solda, corrimão',
  vidraceiro:               'Vidro quebrado, box, janela, espelho',
  estofamento:              'Sofá, cadeira, banco de carro',
  dedetizacao:              'Baratas, cupins, ratos, formigas',
  jardineiro:               'Grama, poda, canteiro, limpeza de quintal',
  eletronica:               'TV, celular, notebook, som',
  garcom:                   'Festa, jantar, evento, bar',
  churrasqueiro:            'Churrasco em casa, aniversário, confraternização',
  cozinheiro:               'Almoço, jantar, marmitas, evento',
  confeiteiro:              'Bolo, doces, cupcakes',
  salgadeiro:               'Coxinha, salgados de festa, kit festa',
  decoracao_festas:         'Balões, mesa, painel, tema',
  aluguel_festas:           'Mesas, cadeiras, pula-pula, tenda',
  recreacao_infantil:       'Brincadeiras, monitores, oficinas',
  filmagem_fotografia:      'Fotos, vídeo, ensaio, drone',
  musico:                   'Voz e violão, banda, cerimônia',
  dj:                       'Som, luz, playlist, festa',
  cabelo:                   'Corte, escova, tintura, penteado',
  barbeiro:                 'Corte masculino, barba, degradê',
  manicure:                 'Unhas, pé e mão, esmaltação',
  maquiagem:                'Festa, noiva, ensaio',
  design_sobrancelhas:      'Sobrancelha, henna, micropigmentação',
  depilacao:                'Cera, laser, buço, pernas',
  massagem:                 'Relaxante, modeladora, drenagem',
  podologo:                 'Unha encravada, calo, pé diabético',
  personal_trainer:         'Treino em casa, academia, emagrecimento',
  tatuagem:                 'Tattoo, cobertura, retoque',
  baba:                     'Cuidar de criança, buscar na escola, noite',
  cuidador:                 'Idoso, pessoa doente, acompanhante',
  pet:                      'Passeio, banho, hospedagem, dog sitter',
  motorista:                'Levar e buscar, viagem, consulta',
  motociclista:             'Entrega, buscar encomenda, motoboy',
  mudancas:                 'Carreto, frete, transporte de móveis',
  lavajato:                 'Lavagem, polimento, higienização',
  mecanica:                 'Carro, moto, revisão, troca de peça',
  aula_particular:          'Reforço, matemática, inglês, música',
  profissional_home_office: 'Digitação, planilha, assistente virtual',
  editor_video:             'Reels, cortes, edição de vídeo',
  social_midia:             'Instagram, posts, anúncios',
  tradutor:                 'Documento, reunião, intérprete',
  panfletagem:              'Entrega de panfletos, divulgação',
  vigia:                    'Noturno, portaria, evento',
  seguranca:                'Festa, loja, escolta',
  costura:                  'Barra, ajuste, conserto de roupa',
  artesanato:               'Lembrancinhas, crochê, peças sob medida',
  informatica:              'Computador, notebook, impressora, formatação',
  gesseiro:                 'Forro, sanca, drywall, moldura',
  placas_fachadas:          'Letreiro, fachada de loja, adesivo, banner',
  borracheiro:              'Pneu furado, troca, calibragem',
  outros:                   'Não achou? Descreva no próximo passo.',
}

// Tile largo do fim da grade.
export const TILE_OUTROS = { id: SLUG_OUTROS, titulo: 'Não achei o meu serviço', emoji: '➕', desc: 'Marque aqui: o pedido chega a todos os profissionais da cidade.' }

const porSlug = new Map(CATEGORIAS_SERVICO.map((c) => [c.slug, c]))

// Os grupos com as categorias RESOLVIDAS ({ slug, rotulo, emoji, exemplos, nova }), em ordem
// ALFABÉTICA de rótulo dentro de cada grupo. Slug de grupo que não existe mais em
// CATEGORIAS_SERVICO é ignorado; categoria sem grupo entra em GRUPO_FALLBACK (e é ordenada
// junto). 'outros' fica de fora.
const alfabetica = (a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')
export const gruposComCategorias = () => {
  const usados = new Set()
  const grupos = GRUPOS_SERVICO.map((g) => ({
    ...g,
    categorias: g.slugs.map((s) => porSlug.get(s)).filter(Boolean).map((c) => { usados.add(c.slug); return comExemplos(c) }),
  }))
  const semGrupo = CATEGORIAS_SERVICO.filter((c) => c.slug !== SLUG_OUTROS && !usados.has(c.slug))
  if (semGrupo.length) {
    const alvo = grupos.find((g) => g.id === GRUPO_FALLBACK) || grupos[0]
    alvo.categorias.push(...semGrupo.map(comExemplos))
  }
  for (const g of grupos) g.categorias.sort(alfabetica)
  return grupos
}

const comExemplos = (c) => ({ slug: c.slug, rotulo: c.rotulo, emoji: c.emoji, exemplos: EXEMPLOS_SERVICO[c.slug] || '', nova: ehNovaServico(c.slug) })

// ── Bloco "Obras de Construção Civil" das ESPECIALIDADES (Arte-Fase2-Trabalhar) ──────────
// O profissional de serviços pode marcar também os quatro papéis de obra (a API aceita os
// slugs de CATEGORIAS_CONSTRUCAO na conta de reparador — Fase 2a); com algum marcado ele
// passa a ver obras no feed. NÃO é um grupo de serviço: fica fora de GRUPOS_SERVICO (não
// entra no cadastro de pedido do dono) e aparece só na escolha de especialidades, como o
// tile largo em destaque. O teto continua 5 NO TOTAL, somando serviços e obra.
export const GRUPO_OBRAS = 'obras'
export const EXEMPLOS_CONSTRUCAO = {
  construtor:        'Construção do zero, ampliação',
  engenheiro:        'Projeto, laudo, acompanhamento',
  pedreiro_servente: 'Alvenaria, reboco, piso, laje',
  pintor:            'Pintura interna, externa, textura',
}
const SLUGS_OBRA = new Set(CATEGORIAS_CONSTRUCAO.map((c) => c.slug))
export const ehEspecialidadeDeObra = (slug) => SLUGS_OBRA.has(slug)

// O bloco no formato de um grupo ({ id, titulo, emoji, categorias }), para abrir na MESMA
// folha dos grupos de serviço; os quatro tipos em ordem alfabética, com exemplos.
export const grupoObrasEspecialidades = () => ({
  id: GRUPO_OBRAS,
  titulo: 'Obras de Construção Civil',
  emoji: '🏗️',
  categorias: CATEGORIAS_CONSTRUCAO
    .map((c) => ({ slug: c.slug, rotulo: c.rotulo, emoji: c.emoji, exemplos: EXEMPLOS_CONSTRUCAO[c.slug] || '', nova: false }))
    .sort(alfabetica),
})

// Tile largo do bloco: `desc` é o fim da linha "N marcada(s) · Pedreiro, pintor, construtor".
export const TILE_OBRAS_ESPECIALIDADES = { emoji: '🏗️', titulo: 'Obras de Construção Civil', desc: 'Pedreiro, pintor, construtor' }

// Grupo (id) de um slug, com o mesmo fallback; 'outros' → null. Especialidade de obra cai no
// bloco GRUPO_OBRAS — sem isto ela contaria em "Casa e reparos" pelo fallback.
export const grupoDoSlug = (slug) => {
  if (!slug || slug === SLUG_OUTROS) return null
  if (SLUGS_OBRA.has(slug)) return GRUPO_OBRAS
  const g = GRUPOS_SERVICO.find((x) => x.slugs.includes(slug))
  return g ? g.id : GRUPO_FALLBACK
}

// Quantas das selecionadas estão em cada grupo: { id: n } (para o contador dos tiles).
export const contagemPorGrupo = (selecionadas) => {
  const n = {}
  for (const s of selecionadas || []) { const g = grupoDoSlug(s); if (g) n[g] = (n[g] || 0) + 1 }
  return n
}
