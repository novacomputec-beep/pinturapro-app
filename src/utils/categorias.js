// Vocabulário de categorias do app — FONTE ÚNICA.
//
// Antes, as listas viviam copiadas em cinco telas (as duas de cadastro, os dois feeds e
// a vitrine da Splash), cada uma com sua ordem e seus rótulos. Foi assim que "Aula
// Particular" virou "Aulas" na Splash e que o painel passou a mostrar uma categoria que
// o app não oferecia: cópia verbatim entre telas irmãs é exatamente a divergência que
// este projeto já pagou antes, e o mesmo motivo de utils/thumbnail.js existir.
//
// O SLUG é o contrato com o banco e com a API — nunca renomeie um slug existente, há
// linhas gravadas apontando para ele. Rótulo e emoji são só apresentação e podem mudar
// à vontade. Slug novo segue a convenção dos antigos: sem acento, sem espaço,
// underscore no lugar do espaço.
//
// Obra e serviço são listas DIFERENTES (categorias diferentes), então são dois arrays,
// não um.

// Ordena por rótulo em pt-BR — localeCompare com a locale explícita é o que faz "Á"
// cair junto de "A" em vez de depois de "Z", que é onde a ordenação por code point
// jogaria os acentos. "Outros" é a exceção e vai SEMPRE ao fim das duas listas: é o
// escape da taxonomia, e alfabetá-lo no meio o esconderia entre categorias reais.
const ordenar = (lista) =>
  [...lista].sort((a, b) => {
    if (a.slug === 'outros') return 1
    if (b.slug === 'outros') return -1
    return a.rotulo.localeCompare(b.rotulo, 'pt-BR')
  })

export const CATEGORIAS_SERVICO = ordenar([
  { slug: 'hidraulica',      rotulo: 'Hidráulica',        emoji: '🔧' },
  { slug: 'eletrica',        rotulo: 'Elétrica',          emoji: '⚡' },
  { slug: 'marcenaria',      rotulo: 'Marcenaria',        emoji: '🪚' },
  { slug: 'alvenaria',       rotulo: 'Alvenaria',         emoji: '🧱' },
  { slug: 'climatizacao',    rotulo: 'Climatização',      emoji: '❄️' },
  { slug: 'chaveiro',        rotulo: 'Chaveiro',          emoji: '🔑' },
  { slug: 'faxina',          rotulo: 'Faxina',            emoji: '🧹' },
  { slug: 'eletronica',      rotulo: 'Eletrônica',        emoji: '📱' },
  { slug: 'aula_particular', rotulo: 'Aula particular',   emoji: '📚' },
  { slug: 'cuidador',        rotulo: 'Cuidador',          emoji: '🤝' },
  { slug: 'jardineiro',      rotulo: 'Jardineiro',        emoji: '🌳' },
  { slug: 'manicure',        rotulo: 'Manicure/pedicure', emoji: '💅' },
  { slug: 'cabelo',          rotulo: 'Cabelo/penteados',  emoji: '✂️' },
  { slug: 'massagem',        rotulo: 'Massagens',         emoji: '💆' },
  { slug: 'mudancas',        rotulo: 'Mudanças',          emoji: '📦' },
  { slug: 'estofamento',     rotulo: 'Estofamento',       emoji: '🛋️' },
  { slug: 'baba',            rotulo: 'Babá',              emoji: '👶' },
  { slug: 'cozinheiro',      rotulo: 'Cozinheiro',        emoji: '🍳' },
  { slug: 'motorista',       rotulo: 'Motorista',         emoji: '🚗' },
  { slug: 'garcom',          rotulo: 'Garçom',            emoji: '🍽️' },
  { slug: 'dedetizacao',     rotulo: 'Dedetização',       emoji: '🐜' },
  { slug: 'montagem_moveis', rotulo: 'Montagem de móveis',  emoji: '🔩' },
  { slug: 'vigia',           rotulo: 'Vigia',              emoji: '👮' },
  { slug: 'outros',          rotulo: 'Outros',            emoji: '➕' },
])

// Lado CONSTRUÇÃO — os quatro slugs que a API aceita para pintor/construtor. Lista à
// parte de CATEGORIAS_SERVICO (o lado doméstico, reparador) porque a API valida cada
// especialidade contra a lista DO LADO: um slug doméstico salvo por um pintor volta 400.
// Slugs idênticos aos da API — engenheiro, construtor, pedreiro_servente, pintor — e é
// esse o contrato; rótulo e emoji são só apresentação. Sem 'outros' aqui: não existe do
// lado da API.
export const CATEGORIAS_CONSTRUCAO = ordenar([
  { slug: 'engenheiro',        rotulo: 'Engenheiro',        emoji: '📐' },
  { slug: 'construtor',        rotulo: 'Construtor',        emoji: '🏗️' },
  { slug: 'pedreiro_servente', rotulo: 'Pedreiro/servente', emoji: '🧱' },
  { slug: 'pintor',            rotulo: 'Pintor',            emoji: '🖌️' },
])

// Espelha o listaPorLado da API: 'pintura' devolve a construção, qualquer outra coisa
// (inclusive null/undefined) cai no lado doméstico. É a MESMA regra de fallback da API,
// que sem lado usa a lista do reparador — um dono que não deveria ver isto, ou um
// tipo_prestador ausente, nunca causa erro, só recebe a lista mais permissiva.
export const especialidadesPorLado = (lado) =>
  lado === 'pintura' ? CATEGORIAS_CONSTRUCAO : CATEGORIAS_SERVICO

// União dos dois lados, para os lookups de RÓTULO e a validação de normalização: nenhum
// slug válido — de qualquer lado — pode ser descartado por vir "do outro".
const TODAS_ESPECIALIDADES = [...CATEGORIAS_SERVICO, ...CATEGORIAS_CONSTRUCAO]

export const CATEGORIAS_OBRA = ordenar([
  { slug: 'residencial',    rotulo: 'Residencial',    emoji: '🏠' },
  { slug: 'comercial',      rotulo: 'Comercial',      emoji: '🏢' },
  { slug: 'galpao',         rotulo: 'Galpão',         emoji: '🏭' },
  { slug: 'rural',          rotulo: 'Rural',          emoji: '🌾' },
  { slug: 'institucional',  rotulo: 'Institucional',  emoji: '🏛️' },
  { slug: 'industrial',     rotulo: 'Industrial',     emoji: '⚙️' },
  { slug: 'saneamento',     rotulo: 'Saneamento',     emoji: '🚰' },
  { slug: 'infraestrutura', rotulo: 'Infraestrutura', emoji: '🛣️' },
  { slug: 'outros',         rotulo: 'Outros',         emoji: '➕' },
])

// Os dois mapas continuam existindo, agora DERIVADOS dos arrays acima em vez de
// escritos à mão — é o que garante que um slug novo não possa entrar na lista sem
// emoji. Seguem privados, como antes: quem consome usa emojiReparo/emojiObra.
const paraMapa = (lista) =>
  lista.reduce((mapa, c) => { mapa[c.slug] = c.emoji; return mapa }, {})

const EMOJIS_REPARO = paraMapa(CATEGORIAS_SERVICO)
const EMOJIS_OBRA   = paraMapa(CATEGORIAS_OBRA)

// Emoji por categoria, usado onde uma demanda precisa aparecer SEM imagem: o thumbnail
// do feed quando não há capa, e o tile da tira de mídia do detalhe quando a URL não
// renderiza. O placeholder bate com o chip de filtro que a pessoa acabou de tocar
// porque os dois saem da MESMA lista.
//
// O fallback cobre categoria desconhecida (o banco pode ter valor legado fora da lista)
// sem se disfarçar de "outros", que é 🔨 legítimo nos dois lados.
export const emojiReparo = (categoria) => EMOJIS_REPARO[categoria] || '🔨'
export const emojiObra   = (categoria) => EMOJIS_OBRA[categoria]   || '🏗️'

// Rótulo pronto para chip/label: "🚿 Hidráulica". Existe para as telas não voltarem a
// concatenar emoji e texto cada uma do seu jeito — foi o que produziu "Aula Particular"
// numa tela e "Aulas" na outra.
export const rotuloComEmoji = (c) => `${c.emoji} ${c.rotulo}`

// Adaptadores para a forma que as telas já consomem: { id, label }. Ficam AQUI e não em
// cada tela porque remodelar no ponto de uso é o que reabre a porta para cada uma
// concatenar do seu jeito — a origem exata da divergência que este arquivo veio fechar.
//
// `id` recebe o SLUG sem tradução: é o valor que a tela envia à API, e o contrato com o
// banco não muda por causa de apresentação.
export const paraSeletor = (lista) =>
  lista.map((c) => ({ id: c.slug, label: rotuloComEmoji(c) }))

// Filtro dos feeds = o seletor com 'Todas' na frente. 'todas' NÃO é categoria: é o
// estado 'sem filtro' do feed, por isso não entra em CATEGORIAS_* nem ganha emoji, e
// segue fora da ordenação alfabética — primeiro item, sempre.
export const paraFiltro = (lista) =>
  [{ id: 'todas', label: 'Todas' }, ...paraSeletor(lista)]

// Teto de especialidades do prestador. Mora aqui e não na tela porque o cadastro, o
// perfil e a tela de seleção precisam do MESMO número — três cópias de "5" é como as
// listas de categoria divergiram em primeiro lugar.
export const MAX_ESPECIALIDADES = 5

// Normaliza qualquer coisa que chegue no lugar de `especialidades` para uma lista limpa
// de slugs VÁLIDOS. Aceita as três formas que existem no mundo real:
//   - array de slugs (o formato novo),
//   - string CSV (texto livre do cadastro antigo e rascunhos gravados antes desta
//     mudança),
//   - null/undefined (conta sem o campo).
//
// O que não é slug conhecido é DESCARTADO em silêncio — "Faz tudo", "Acho", "Hidráulica"
// com maiúscula e acento não têm para onde mapear sem adivinhar, e adivinhar erraria. A
// consequência é assumida: quem tinha texto livre volta a ter a lista vazia e escolhe de
// novo, o que é o ponto da migração.
//
// Também deduplica: sem isto um slug repetido no banco ocuparia duas das cinco vagas.
export const normalizarEspecialidades = (valor) => {
  const bruto = Array.isArray(valor)
    ? valor
    : (typeof valor === 'string' ? valor.split(',') : [])
  // Aceita slugs dos DOIS lados: um pintor selecionando construção não pode ter suas
  // escolhas descartadas aqui antes de chegar à API. Lixo de fato (texto livre legado)
  // segue caindo fora.
  const validos = new Set(TODAS_ESPECIALIDADES.map((c) => c.slug))
  return [...new Set(bruto.map((s) => String(s).trim()).filter((s) => validos.has(s)))]
}

// Rótulo de um slug avulso, para as telas que mostram a seleção já feita.
export const rotuloEspecialidade = (slug) => {
  // Busca nos dois lados; slug desconhecido volta cru, como antes.
  const c = TODAS_ESPECIALIDADES.find((x) => x.slug === slug)
  return c ? rotuloComEmoji(c) : slug
}

// Linha "Alvenaria, Aula particular, Babá" para as telas que mostram as especialidades
// de um prestador como texto corrido (Perfil e os cards de candidato dos dois Detalhes).
// Vivia duplicada como especialidadesTexto() em DetalheObra e DetalheReparo — mesma
// cópia verbatim que este arquivo existe para fechar.
//
// Aceita array, CSV (dado antigo do banco) e null. Difere de normalizarEspecialidades
// num ponto DELIBERADO: valor fora da lista NÃO é descartado, aparece cru. Aqui é
// exibição de dado gravado, e sumir com uma entrada leria como o campo perdendo dados;
// lá é entrada de seleção, onde texto livre legado não tem pill para ocupar.
// Sem emoji: é linha de dado, não chip.
export const rotulosEspecialidades = (esp) => {
  const arr = Array.isArray(esp) ? esp : (typeof esp === 'string' ? esp.split(',') : [])
  const limpos = arr.map((s) => String(s).trim()).filter(Boolean)
  const rotulos = limpos.map((s) => TODAS_ESPECIALIDADES.find((c) => c.slug === s)?.rotulo || s)
  return rotulos.length ? rotulos.join(', ') : null
}
