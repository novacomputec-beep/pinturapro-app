import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native'
import { cores, espacos, raios, larguraMaxima } from '../utils/tema'

// Arte "🤝 Antes de publicar": aparece no "Publicar" do cadastro de serviço/obra quando a sessão
// traz usuario.precisa_acordo_etico. "Publicar pedido" (laranja) só habilita com a caixa
// "Li e concordo" marcada; a tela então manda acordo_etico: true junto com a criação. "Voltar"
// (e o voltar do Android) só fecha: o formulário fica como está. A caixa desmarca a cada abertura.
export default function AcordoEtico({ visivel, onPublicar, onVoltar }) {
  const [concordo, setConcordo] = useState(false)
  useEffect(() => { if (visivel) setConcordo(false) }, [visivel])

  return (
    <Modal visible={!!visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={onVoltar}>
      <View style={estilos.overlay}>
        <View style={estilos.caixa}>
          <Text style={estilos.titulo}>🤝 Antes de publicar</Text>
          <Text style={estilos.corpo}>Do outro lado há profissionais sérios, que param o que estão fazendo para atender você.</Text>
          <Text style={estilos.corpo}>Publique só se realmente precisa do serviço, responda quem perguntar e, se desistir, encerre o pedido no app.</Text>
          <Text style={estilos.assinatura}>Equipe ProTudo</Text>
          <TouchableOpacity
            style={estilos.linhaCaixa}
            onPress={() => setConcordo(v => !v)}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: concordo }}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <View style={[estilos.caixaMarcar, concordo && estilos.caixaMarcada]}>
              {concordo ? <Text style={estilos.visto}>✓</Text> : null}
            </View>
            <Text style={estilos.caixaTexto}>Li e concordo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[estilos.btnPublicar, !concordo && estilos.btnApagado]}
            onPress={onPublicar}
            disabled={!concordo}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !concordo }}
          >
            <Text style={estilos.btnPublicarTexto} maxFontSizeMultiplier={1.4}>Publicar pedido</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.btnVoltar} onPress={onVoltar} activeOpacity={0.85} accessibilityRole="button">
            <Text style={estilos.btnVoltarTexto} maxFontSizeMultiplier={1.4}>Voltar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', paddingHorizontal: espacos.tela },
  caixa: { backgroundColor: cores.fundoCard, borderRadius: raios.grande, padding: 20, ...larguraMaxima },
  titulo: { fontSize: 18, fontWeight: '800', color: cores.textoForte, marginBottom: 12 },
  corpo: { fontSize: 14, color: cores.textoMedio, lineHeight: 21, marginBottom: 10 },
  assinatura: { fontSize: 13, fontWeight: '700', color: cores.textoForte, textAlign: 'right', marginBottom: 16 },
  linhaCaixa: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  caixaMarcar: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: cores.bordaCampo, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  caixaMarcada: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  visto: { color: '#0A0A0A', fontSize: 15, fontWeight: '800', lineHeight: 18 },
  caixaTexto: { fontSize: 15, fontWeight: '600', color: cores.textoForte },
  btnPublicar: { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 10 },
  btnApagado: { opacity: 0.4 },
  btnPublicarTexto: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  btnVoltar: { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, padding: 13, alignItems: 'center' },
  btnVoltarTexto: { fontSize: 14, fontWeight: '600', color: cores.textoForte },
})
