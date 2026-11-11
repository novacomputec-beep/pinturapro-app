import React from 'react'
import { View, Text } from 'react-native'
import { formatarDistancia } from '../utils/distancia'

// Peças compartilhadas pelos cards dos dois feeds (CardObra e CardReparo — Arte-Card-Obra-Feed,
// 11/11/2026). Vivem aqui para os dois cards não divergirem na frase nem no layout.

// "👥 N interessados"; sem ninguém ainda, o convite (quem chama pinta de verde).
export const textoInteressados = (n) =>
  n <= 0 ? '✨ Seja o primeiro interessado' : `👥 ${n} ${n === 1 ? 'interessado' : 'interessados'}`

// Localização: "📍 bairro · cidade" (sem UF, que a cidade já situa) e a distância como Text à
// parte, que nunca encolhe nem é cortada — quem perde espaço é o endereço.
export const LinhaLocal = ({ item, dist, estiloTexto, estiloDistancia }) => {
  const partes = [item?.bairro, item?.cidade].map(p => (p == null ? '' : String(p).trim())).filter(Boolean)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
      <Text style={[estiloTexto, { flexShrink: 1 }]} numberOfLines={1}>📍 {partes.join(' · ')}</Text>
      {dist != null && <Text style={[estiloTexto, estiloDistancia, { flexShrink: 0 }]}>{` · ${formatarDistancia(dist)}`}</Text>}
    </View>
  )
}
