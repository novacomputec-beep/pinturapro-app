// Emoji por categoria, usado onde uma demanda precisa aparecer SEM imagem: o
// thumbnail do feed quando não há capa, e o tile da tira de mídia do detalhe quando a
// URL não renderiza. Não são emojis novos: são os MESMOS já exibidos nos labels de
// CATEGORIAS dos feeds e das telas de cadastro, para que o placeholder bata com o chip
// de filtro que a pessoa acabou de tocar.
//
// Mora aqui, e não em cada tela, porque a lista passou a ser lida em QUATRO arquivos
// (os dois feeds e os dois detalhes) — a cópia verbatim entre telas irmãs é exatamente
// a divergência que este projeto já pagou antes, e é o mesmo motivo de utils/thumbnail.js
// existir. Obra e reparo têm listas DIFERENTES (categorias diferentes), então são dois
// mapas, não um.
//
// O fallback cobre categoria desconhecida (o banco pode ter valor legado fora da lista)
// sem se disfarçar de "outros", que é 🔨 legítimo nos dois lados.

const EMOJIS_REPARO = {
  hidraulica: '🚿', eletrica: '⚡', marcenaria: '🪚', alvenaria: '🧱',
  climatizacao: '❄️', chaveiro: '🔑', faxina: '🧹', outros: '🔨',
  eletronica: '📱', aula_particular: '📚', cuidador: '🤝', jardineiro: '🌳',
}

const EMOJIS_OBRA = {
  residencial: '🏠', comercial: '🏢', institucional: '🏛️',
  galpao: '🏭', rural: '🌾', outros: '🔨',
}

export const emojiReparo = (categoria) => EMOJIS_REPARO[categoria] || '🔨'
export const emojiObra   = (categoria) => EMOJIS_OBRA[categoria]   || '🏗️'
