// Duração legível — FONTE ÚNICA.
//
// Hoje cada tela formata prazo do seu jeito: o feed de reparo diz "Finaliza em 6 dias"
// num pill e "Atender em até 168h" no banner ao lado; o detalhe de obra diz "2 meses e
// 12 dias" e o de reparo "19 dias 7h 25m" para a mesma ideia. São cinco cópias locais
// (formatarTempoRestante ×2, textoPrazoAtendimento, e os dois ContadorExpiracao inline)
// que divergiram exatamente como as listas de categoria divergiram antes de
// utils/categorias.js. Este arquivo é o mesmo remédio: UM formatador, e as telas migram
// para cá uma a uma (nenhuma foi migrada ainda — este é o passo 1).
//
// CALENDÁRIO FIXO (comercial): mês = 30 dias, ano = 360 dias. Não há calendário real
// aqui: um prazo é uma DURAÇÃO, não uma data, e "1 mês" contado a partir de 31/01 não
// tem resposta certa. O ano é 360 e não 365 DE PROPÓSITO: 12 × 30 = 360, então o resto
// depois de tirar os anos é sempre < 360 dias e os meses nunca chegam a 12 — a saída
// "12 meses" é inalcançável por construção. Com 365 havia um buraco de cinco dias
// (360 a 364) em que aparecia "12 meses[ e N dias]" em vez de "1 ano".
// Consequência assumida: uma obra de 365 dias reais lê "1 ano e 5 dias".
//
// Duas FRENTES, porque obra e reparo medem prazos de escalas diferentes:
//   servico → dia, hora, minuto.            NUNCA agrupa em mês/ano: 90 dias é "90 dias".
//   obra    → ano, mês, dia, hora, minuto.  Agrupa para cima: 90 dias é "3 meses".
// Abaixo de um dia as duas frentes são idênticas.
//
// Saída: até `maxUnidades` unidades não zeradas (padrão 3), da maior para a menor,
// unidas por vírgula e "e":
//   "1 ano, 2 meses e 3 dias" · "1 dia e 12h" · "45min"
// Unidade ZERADA é omitida, nunca impressa — "1 ano e 4h" é saída válida quando meses e
// dias são zero. Depois da última unidade permitida, o resto é TRUNCADO, nunca
// arredondado: prazo que "sobe" prometeria tempo que não existe. Com maxUnidades: 1,
// 6 dias e 20h é "6 dias" — é o que os pills do feed usam, onde cabe uma palavra e o
// detalhe é que mostra as três.
//
// Singular/plural: "1 dia"/"2 dias", "1 mês"/"2 meses", "1 ano"/"2 anos",
// "1 hora" (por extenso, só no singular) / "2h" (abreviado no plural), "1min"/"30min".
// Abaixo de um minuto: "menos de 1 min". Zero ou negativo: "expirado".

const MINUTO = 60 * 1000
const HORA   = 60 * MINUTO
const DIA    = 24 * HORA
const MES    = 30 * DIA
const ANO    = 360 * DIA

const FRENTES = ['servico', 'obra']

// Rótulo de uma unidade já com a regra de número. Fica numa tabela e não em ifs
// espalhados para a regra "hora por extenso só no singular" existir num lugar só.
const rotulo = (unidade, n) => {
  switch (unidade) {
    case 'ano':    return `${n} ${n === 1 ? 'ano' : 'anos'}`
    case 'mes':    return `${n} ${n === 1 ? 'mês' : 'meses'}`
    case 'dia':    return `${n} ${n === 1 ? 'dia' : 'dias'}`
    case 'hora':   return n === 1 ? '1 hora' : `${n}h`
    case 'minuto': return `${n}min`
    default:       return String(n)
  }
}

// "A" · "A e B" · "A, B e C". O "e" vai sempre antes do ÚLTIMO item; a vírgula só
// aparece com três.
const juntar = (partes) => {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
}

// Decompõe a duração nas unidades da frente. Trabalha em MINUTOS inteiros (floor) para
// o segundo nunca influenciar: um prazo não se decide no segundo, e "59min 59s" é
// 59min, não 1 hora.
const decompor = (ms, frente) => {
  const totalMin = Math.floor(ms / MINUTO)
  const partes = []
  let restoMin = totalMin

  if (frente === 'obra') {
    const anos = Math.floor(restoMin / (ANO / MINUTO));  restoMin -= anos * (ANO / MINUTO)
    const meses = Math.floor(restoMin / (MES / MINUTO)); restoMin -= meses * (MES / MINUTO)
    partes.push(['ano', anos], ['mes', meses])
  }
  const dias = Math.floor(restoMin / (DIA / MINUTO));    restoMin -= dias * (DIA / MINUTO)
  const horas = Math.floor(restoMin / (HORA / MINUTO));  restoMin -= horas * (HORA / MINUTO)
  partes.push(['dia', dias], ['hora', horas], ['minuto', restoMin])
  return partes
}

// Duração em milissegundos → texto. `frente` é obrigatória e validada: um chamador que
// esquecesse a opção cairia em silêncio na frente errada e a divergência voltaria pela
// porta dos fundos.
export const formatarDuracao = (ms, { frente, maxUnidades = 3 } = {}) => {
  if (!FRENTES.includes(frente)) {
    throw new Error(`formatarDuracao: frente inválida "${frente}" (use 'servico' ou 'obra')`)
  }
  // Inteiro ≥ 1; qualquer outra coisa é erro de chamada, não um pedido de "zero unidades".
  if (!Number.isInteger(maxUnidades) || maxUnidades < 1) {
    throw new Error(`formatarDuracao: maxUnidades inválido "${maxUnidades}" (inteiro ≥ 1)`)
  }
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return 'expirado'
  if (n < MINUTO) return 'menos de 1 min'

  const naoZeradas = decompor(n, frente)
    .filter(([, valor]) => valor > 0)
    .slice(0, maxUnidades)
    .map(([unidade, valor]) => rotulo(unidade, valor))
  return juntar(naoZeradas)
}

// Prazo de atendimento ESTÁTICO (prazo_atendimento_horas): a urgência que o dono
// escolheu no cadastro, em horas. Não é contagem — não tica — mas se lê com a mesma
// régua do reparo, para "168h" virar "7 dias" como o pill ao lado já diz.
// Valor ausente/não numérico devolve null: quem chama decide o que mostrar, em vez de
// este arquivo inventar um prazo ("expirado" seria mentira para um campo vazio).
export const formatarPrazoAtendimento = (horas) => {
  const h = Number(horas)
  if (horas == null || horas === '' || !Number.isFinite(h)) return null
  return formatarDuracao(h * HORA, { frente: 'servico' })
}
