import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Arte-Valor-A-Combinar: o dono publicou o pedido sem valor ("Não sei o valor — quero receber
// propostas", valor_a_combinar = true na linha do serviço/obra). No lugar da linha de valor
// (cards do feed e detalhe, profissional e dono) entra este chip azul; no feed ele também
// chama a proposta, no detalhe (curto) só nomeia.
export const ehValorACombinar = (demanda) => demanda?.valor_a_combinar === true

export const ROTULO_VALOR_A_COMBINAR = '💬 Valor a combinar'

export default function ChipValorACombinar({ curto = false, estilo }) {
  return (
    <View style={[estilos.chip, estilo]}>
      <Text style={estilos.texto}>{curto ? ROTULO_VALOR_A_COMBINAR : `${ROTULO_VALOR_A_COMBINAR} · envie sua proposta`}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  chip:  { alignSelf: 'flex-start', backgroundColor: cores.infoSuave, borderWidth: 1, borderColor: cores.infoBorda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 5 },
  texto: { fontSize: 12, fontWeight: '700', color: cores.info },
})
