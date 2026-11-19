import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'
import { ROTULO_ACEITA_PROPOSTAS } from '../utils/valorACombinar'

// Arte-Valor-A-Combinar: o dono publicou o pedido sem valor ("Não sei o valor — quero receber
// propostas", valor_a_combinar = true na linha do serviço/obra). No lugar da linha de valor
// (cards do feed e detalhe, profissional e dono) entra este chip azul; no feed ele também
// chama a proposta, no detalhe (curto) só nomeia.
// A regra mora em utils/valorACombinar (flag primeiro; valor <= 0,01 também conta).
export { ehValorACombinar } from '../utils/valorACombinar'

// Texto único do app para esses pedidos: ROTULO_ACEITA_PROPOSTAS (feed, detalhe, listas).
export const ROTULO_VALOR_A_COMBINAR = `💬 ${ROTULO_ACEITA_PROPOSTAS}`

// `rotulo` troca o texto do chip curto (o detalhe usa "Aceita propostas").
export default function ChipValorACombinar({ curto = false, rotulo, estilo }) {
  return (
    <View style={[estilos.chip, estilo]}>
      <Text style={estilos.texto}>{rotulo || ROTULO_VALOR_A_COMBINAR}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  chip:  { alignSelf: 'flex-start', backgroundColor: cores.infoSuave, borderWidth: 1, borderColor: cores.infoBorda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 5 },
  texto: { fontSize: 12, fontWeight: '700', color: cores.info },
})
