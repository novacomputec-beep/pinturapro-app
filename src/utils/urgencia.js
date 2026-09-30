// Tarja de urgência — FONTE ÚNICA.
//
// Antes cada tela tinha a sua régua: o card do feed de reparo dizia "⚪ Sem urgência" e o
// detalhe do MESMO reparo dizia "📆 Esta semana" em vermelho fixo; a obra tinha uma tabela
// no feed e uma escada de faixas diferente no detalhe. Este arquivo é o mesmo remédio de
// utils/tempo.js e utils/categorias.js: uma regra por frente, e feed + detalhe leem daqui.
//
// As duas funções devolvem o MESMO formato, ou null quando não há tarja a mostrar:
//   { emoji, texto, label, cor, bg, borda }
//   label = `${emoji} ${texto}` (o que vai na tela) · borda = cor + '44' (mesma cor, ~27% alfa)
// A tela decide só o layout (raio, padding, tamanho de fonte) — nunca rótulo nem cor.

import { formatarDuracao } from './tempo'

const montar = (emoji, texto, cor, bg) => ({
  emoji,
  texto,
  label: `${emoji} ${texto}`,
  cor,
  bg,
  borda: cor + '44',
})

// REPARO — escala de urgência por prazo_atendimento_horas (o prazo que o dono escolheu no
// cadastro, em horas). É o prazo CONFIGURADO, não o tempo que resta: não muda com a
// aproximação nem com extensão. `ate` é inclusivo; a última faixa pega todo o resto.
const FAIXAS_REPARO = [
  { ate: 2,        emoji: '🔴', texto: 'Muito urgente', cor: '#f44336', bg: '#3a1a1a' },
  { ate: 8,        emoji: '🟠', texto: 'Urgente',       cor: '#FF9800', bg: '#3a2a1a' },
  { ate: 24,       emoji: '🟡', texto: 'Hoje',          cor: '#FFC107', bg: '#3a3a1a' },
  { ate: 72,       emoji: '🟢', texto: 'Normal',        cor: '#4caf50', bg: '#1a3a1a' },
  { ate: Infinity, emoji: '⚪', texto: 'Sem urgência',  cor: '#9e9e9e', bg: '#2a2a2a' },
]
const FAIXA_SEM_URGENCIA = FAIXAS_REPARO[FAIXAS_REPARO.length - 1]

export const urgenciaReparo = (horas) => {
  // Ausente/zero → sem tarja (mesmo teste que o feed sempre fez).
  if (!horas) return null
  // Valor não numérico não casa com nenhuma faixa (nem com Infinity): cai na última,
  // como caía no `return` final da régua antiga.
  const faixa = FAIXAS_REPARO.find(f => horas <= f.ate) || FAIXA_SEM_URGENCIA
  return montar(faixa.emoji, faixa.texto, faixa.cor, faixa.bg)
}

// Faixa neutra (⚪ "Sem urgência", a última da escala) já montada. É o fallback dos banners
// de DETALHE: quando a régua devolve null (prazo ausente/zero) mas a demanda ainda tem
// expira_em, o detalhe mostra a tarja nesta faixa para não perder a contagem "Expira em".
// O feed NÃO usa isto — lá, sem prazo não há faixa.
export const SEM_URGENCIA = montar(FAIXA_SEM_URGENCIA.emoji, FAIXA_SEM_URGENCIA.texto, FAIXA_SEM_URGENCIA.cor, FAIXA_SEM_URGENCIA.bg)

// OBRA — não é escala de urgência: é a janela de início que o dono escolheu, por
// horas_para_expirar (a mesma tabela do CadastrarObraScreen), sempre no MESMO cinza.
// Casamento EXATO, não por faixa; fora da tabela cai no genérico "Iniciar em <duração>".
const JANELA_INICIO_OBRA = {
  24: 'Iniciar hoje',
  168: 'Iniciar esta semana',
  720: 'Iniciar este mês',
  1440: 'Iniciar mês que vem',
  2160: 'Sem urgência',
}
const EMOJI_OBRA = '⚪'
const COR_OBRA = '#9e9e9e'
const BG_OBRA = '#2a2a2a'

export const urgenciaObra = (horasParaExpirar, totalExtensaoHoras) => {
  // horas_para_expirar chega como STRING ("168"): coage para número antes de qualquer
  // conta ou lookup. Ausente/não-numérico → sem tarja.
  const horasInicio = horasParaExpirar == null ? NaN : Number(horasParaExpirar)
  if (!Number.isFinite(horasInicio)) return null
  // Extensão vem PRONTA do servidor: total_extensao_horas (STRING, null se nunca estendida).
  // Com extensão, o rótulo canônico da janela deixa de valer — a obra não começa mais
  // "mês que vem" — e o texto vira a duração real (janela + extensão). Sem extensão
  // (null/ausente/não-finito/<=0), vale o rótulo canônico.
  const extHoras = totalExtensaoHoras == null ? NaN : Number(totalExtensaoHoras)
  const temExtensao = Number.isFinite(extHoras) && extHoras > 0
  const texto = temExtensao
    ? `Iniciar em ${formatarDuracao((horasInicio + extHoras) * 3600000, { frente: 'obra', maxUnidades: 2 })}`
    : (JANELA_INICIO_OBRA[horasInicio]
      || `Iniciar em ${formatarDuracao(horasInicio * 3600000, { frente: 'obra', maxUnidades: 2 })}`)
  return montar(EMOJI_OBRA, texto, COR_OBRA, BG_OBRA)
}
