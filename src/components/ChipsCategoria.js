import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'
import { categoriasDe, emojiReparo, rotuloCategoria } from '../utils/categorias'

// Chips de categoria de uma demanda: até `max` (2) chips e um "+N" com o resto. Lê a lista
// por categoriasDe (utils/categorias): `categorias` quando existe, senão `categoria` — por
// isso o lado obra e os reparos antigos continuam mostrando exatamente o chip de sempre.
//
// Duas variantes, copiadas dos chips que as telas já tinham:
//   'feed'    → o categoriaPill dos cards do feed (tinta 2E, 12px, com emoji da categoria);
//   'detalhe' → o dos detalhes e dos cards pós-match (tinta 1F, 11px, sem emoji).
// O texto é o RÓTULO do mapa (rotuloCategoria: "eletronica" → "Eletrônica"), nunca o slug.
export default function ChipsCategoria({ demanda, variante = 'detalhe', max = 2, estilo }) {
  const lista = categoriasDe(demanda)
  if (!lista.length) return null
  const feed = variante === 'feed'
  const visiveis = lista.slice(0, max)
  const resto = lista.length - visiveis.length
  return (
    <View style={[estilos.linha, estilo]}>
      {visiveis.map((slug) => (
        <View key={slug} style={[estilos.pill, feed ? estilos.pillFeed : estilos.pillDetalhe]}>
          <Text style={[estilos.texto, feed ? estilos.textoFeed : estilos.textoDetalhe]} numberOfLines={1}>
            {feed ? `${emojiReparo(slug)} ${rotuloCategoria(slug)}` : rotuloCategoria(slug)}
          </Text>
        </View>
      ))}
      {resto > 0 && (
        <View style={[estilos.pill, feed ? estilos.pillFeed : estilos.pillDetalhe]} accessibilityLabel={`mais ${resto} categoria${resto > 1 ? 's' : ''}`}>
          <Text style={[estilos.texto, feed ? estilos.textoFeed : estilos.textoDetalhe]}>+{resto}</Text>
        </View>
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
  pill: { borderWidth: 0.5, borderColor: cores.primaria + '55', borderRadius: raios.pill, flexShrink: 1 },
  pillFeed: { backgroundColor: cores.primaria + '2E', paddingHorizontal: 10, paddingVertical: 4 },
  pillDetalhe: { backgroundColor: cores.primaria + '1F', paddingHorizontal: 12, paddingVertical: 4 },
  texto: { color: cores.primaria },
  textoFeed: { fontSize: 12, fontWeight: '600' },
  textoDetalhe: { fontSize: 11 },
})
