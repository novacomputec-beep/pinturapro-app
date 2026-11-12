import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Pill azul "onde é o atendimento" para o PROFISSIONAL (card do feed e detalhe do pedido),
// logo abaixo da linha de local. Lê demanda.local_atendimento (POST /reparos/dono); só
// desenha para 'casa_cliente' e 'local_profissional' — 'tanto_faz', null ou ausente = nada.
const TEXTOS = {
  casa_cliente: '🏠 Atendimento na casa do cliente',
  local_profissional: '💈 Cliente vai até o seu espaço',
}

export default function PillLocalAtendimento({ demanda, estilo }) {
  const texto = TEXTOS[demanda?.local_atendimento]
  if (!texto) return null
  return (
    <View style={[estilos.pill, estilo]}>
      <Text style={estilos.texto} numberOfLines={1}>{texto}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  pill: { alignSelf: 'flex-start', backgroundColor: cores.info + '1F', borderWidth: 1, borderColor: cores.info, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4, marginBottom: 4 },
  texto: { fontSize: 11, fontWeight: '700', color: cores.info },
})
