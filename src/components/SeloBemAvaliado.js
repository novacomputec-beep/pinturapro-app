import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Selo "Profissional bem avaliado": a API marca `selo_bem_avaliado` (3+ avaliações 5★,
// utils/etiquetasAvaliacao) no perfil do profissional (/auth/me), no resumo das avaliações
// (/avaliacoes/recebidas) e em cada linha de interessado/candidato que o dono recebe. Chip
// pequeno no mesmo molde do ChipEmbaixador (components/Indicacao): informa, não grita.
// `compacto` é a versão de uma palavra para linhas apertadas (mini card do pós-match).
export const temSeloBemAvaliado = (x) => x?.selo_bem_avaliado === true

export const ChipBemAvaliado = ({ compacto, estilo }) => (
  <View style={[estilos.chip, estilo]} accessibilityLabel="Profissional bem avaliado">
    <Text style={estilos.texto} numberOfLines={1} maxFontSizeMultiplier={1.15}>{compacto ? '🏅 Bem avaliado' : '🏅 Profissional bem avaliado'}</Text>
  </View>
)

const estilos = StyleSheet.create({
  chip:  { alignSelf: 'flex-start', backgroundColor: cores.sucessoSuave, borderWidth: 0.5, borderColor: cores.sucesso + '66', borderRadius: raios.pill, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 6 },
  texto: { fontSize: 10, fontWeight: '700', color: cores.sucesso },
})
