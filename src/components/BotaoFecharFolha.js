import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

// Pílula "✕ Fechar" do canto direito do cabeçalho de TODAS as folhas de baixo (arte opção B):
// o mesmo fechamento do toque fora e do voltar do Android, agora visível. Medidas da arte:
// altura 46, raio 23, fundo #26282e, borda 1.5 #3a3d44, texto #e3e7ee 15 bold, hitSlop 10.
// `desabilitado` (ou onPress nulo — a folha travada enquanto envia/salva, o mesmo gate do toque
// fora) apaga e trava o toque. Vive dentro da zona do arraste: o gesto só é tomado depois de
// alguns px de movimento, então o toque na pílula continua chegando.
export default function BotaoFecharFolha({ onPress, desabilitado = false, estilo }) {
  const travado = !!desabilitado || !onPress
  return (
    <TouchableOpacity
      style={[estilos.btn, travado && estilos.travado, estilo]}
      onPress={onPress}
      disabled={travado}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Fechar"
      accessibilityState={{ disabled: travado }}
    >
      <Text style={estilos.texto} maxFontSizeMultiplier={1.3}>✕ Fechar</Text>
    </TouchableOpacity>
  )
}

// Linha do cabeçalho: o título à esquerda (flex 1) e a pílula à direita. `children` é o título
// (ou o bloco de título); `espaco` é o respiro sob a linha, para a folha manter o que o título
// tinha de marginBottom.
export function LinhaCabecalhoFolha({ children, onFechar, desabilitado, estilo }) {
  return (
    <View style={[estilos.linha, estilo]}>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      <BotaoFecharFolha onPress={onFechar} desabilitado={desabilitado} />
    </View>
  )
}

const estilos = StyleSheet.create({
  btn:     { height: 46, borderRadius: 23, paddingHorizontal: 18, backgroundColor: '#26282e', borderWidth: 1.5, borderColor: '#3a3d44', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  travado: { opacity: 0.5 },
  texto:   { color: '#e3e7ee', fontSize: 15, fontWeight: '700' },
  linha:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
})
