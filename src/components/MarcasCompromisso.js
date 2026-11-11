import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Arte "marcas de compromisso" (10/11/2026) — responsabilidade pós-match da API
// (pinturapro-api utils/responsabilidade.js, d826bdd): eventos por PESSOA numa janela móvel
// de 90 dias.
//
//   Lado DONO, em cada candidato/interessado (GET /obras/:id candidatos, GET /reparos/:id
//   interessados, GET /candidaturas): compromissos_nao_cumpridos_90d (nº de vezes em que foi
//   escolhido e não marcou o horário) e cumpriu_todos (tem serviço encerrado e zero eventos
//   na janela) → caixa vermelha ou linha verde curta. Nenhum dos dois → nada.
//
//   Lado PROFISSIONAL, na linha da demanda (feed e detalhe): cliente_nao_respondeu_90d (nº de
//   propostas de horário de profissional que o dono deixou vencer sem responder) → caixa
//   vermelha no card do cliente e chip ⚠️ no card do feed.
//
// Só apresentação: quem decide o que é "não cumprido" é a API; aqui nenhum número é derivado.

export const compromissosNaoCumpridos = (p) => Number(p?.compromissos_nao_cumpridos_90d) || 0
export const temCompromissosNaoCumpridos = (p) => compromissosNaoCumpridos(p) > 0
export const cumpriuTodosCompromissos = (p) => p?.cumpriu_todos === true
export const clienteNaoRespondeu = (demanda) => (Number(demanda?.cliente_nao_respondeu_90d) || 0) > 0

export const TEXTO_CLIENTE_NAO_RESPONDEU = '⚠️ Não respondeu um profissional recentemente — deixou um horário proposto sem resposta.'

const textoCompromissos = (n) =>
  `⚠️ ${n} ${n === 1 ? 'compromisso não cumprido' : 'compromissos não cumpridos'} nos últimos 90 dias — foi escolhido e não marcou o horário.`

// Dono: sob o profissional da lista de propostas/candidatos.
export const MarcaCompromissos = ({ profissional, estilo }) => {
  const n = compromissosNaoCumpridos(profissional)
  if (n > 0) {
    return (
      <View style={[estilos.caixaVermelha, estilo]}>
        <Text style={estilos.caixaVermelhaTexto}>{textoCompromissos(n)}</Text>
      </View>
    )
  }
  if (cumpriuTodosCompromissos(profissional)) {
    return <Text style={[estilos.linhaVerde, estilo]}>✓ Cumpriu todos os compromissos</Text>
  }
  return null
}

// Profissional: dentro do card do cliente, no detalhe da demanda.
export const MarcaClienteNaoRespondeu = ({ demanda, estilo }) => {
  if (!clienteNaoRespondeu(demanda)) return null
  return (
    <View style={[estilos.caixaVermelha, estilo]}>
      <Text style={estilos.caixaVermelhaTexto}>{TEXTO_CLIENTE_NAO_RESPONDEU}</Text>
    </View>
  )
}

// Profissional: chip pequeno (legado — o feed passou a usar a LinhaClienteNaoRespondeu abaixo).
export const ChipClienteNaoRespondeu = ({ demanda }) => {
  if (!clienteNaoRespondeu(demanda)) return null
  return (
    <View style={estilos.chip} accessibilityLabel="Cliente não respondeu um profissional recentemente">
      <Text style={estilos.chipTexto}>⚠️ Não respondeu</Text>
    </View>
  )
}

export const TEXTO_LINHA_CLIENTE_NAO_RESPONDEU = '⚠️ Cliente não respondeu um profissional recentemente'

// Profissional: linha vermelha de largura total no card do feed (Arte-Card-Obra-Feed, 11/11/2026),
// logo abaixo da linha categoria + "Finaliza em". Sem numberOfLines: a frase nunca é cortada.
export const LinhaClienteNaoRespondeu = ({ demanda, estilo }) => {
  if (!clienteNaoRespondeu(demanda)) return null
  return (
    <View style={[estilos.linha, estilo]} accessibilityLabel="Cliente não respondeu um profissional recentemente">
      <Text style={estilos.linhaTexto}>{TEXTO_LINHA_CLIENTE_NAO_RESPONDEU}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  linha:              { alignSelf: 'stretch', backgroundColor: cores.perigoSuave, borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.pequeno, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
  linhaTexto:         { fontSize: 12, lineHeight: 17, fontWeight: '600', color: cores.perigo },
  caixaVermelha:      { backgroundColor: cores.perigoSuave, borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.medio, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6, marginBottom: 4 },
  caixaVermelhaTexto: { fontSize: 12, lineHeight: 17, color: cores.textoForte },
  linhaVerde:         { fontSize: 12, lineHeight: 17, color: cores.sucesso, fontWeight: '600', marginTop: 2, marginBottom: 4 },
  chip:               { flexDirection: 'row', alignItems: 'center', backgroundColor: cores.perigoSuave, borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.pill, paddingHorizontal: 7, paddingVertical: 2 },
  chipTexto:          { fontSize: 10, fontWeight: '700', color: cores.perigo },
})
