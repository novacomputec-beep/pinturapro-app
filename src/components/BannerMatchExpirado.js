import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Toque no push data.tipo 'match_expirado' (dono): o AppNavigator abre o detalhe da demanda
// com `destacarPrazo: true`, e o detalhe rola até o bloco "Aumentar tempo" (a data/prazo da
// demanda reaberta), realça o botão e mostra esta faixa logo acima dele. Só enquanto a demanda
// está aberta e sem profissional escolhido — é o estado em que as duas saídas da frase existem
// (a lista de interessados e o prazo novo).
export const TEXTO_MATCH_EXPIRADO = 'O profissional não marcou horário. Escolha outro interessado ou defina uma nova data.'

export const BannerMatchExpirado = () => (
  <View style={estilos.faixa} accessibilityRole="alert">
    <Text style={estilos.texto}>⏰ {TEXTO_MATCH_EXPIRADO}</Text>
  </View>
)

// Realce do botão de prazo: borda mais grossa e fundo mais quente que o padrão (#2a2200 /
// 1px laranja), para o olho achar o bloco depois do scroll.
export const estiloDestaquePrazo = { borderWidth: 2, borderColor: cores.primaria, backgroundColor: 'rgba(232,131,58,0.22)' }

const estilos = StyleSheet.create({
  faixa: { backgroundColor: cores.primariaSuave, borderWidth: 1, borderColor: cores.primariaBorda, borderRadius: raios.medio, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  texto: { fontSize: 13, lineHeight: 19, color: cores.textoForte, fontWeight: '600' },
})
