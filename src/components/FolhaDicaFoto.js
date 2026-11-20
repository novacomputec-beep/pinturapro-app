import React from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import useArrastarParaFechar, { ZonaArraste, RaizGestosFolha } from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'

// Folha "Pedidos com fotos ou vídeos recebem mais propostas": aparece no "Publicar" do
// cadastro de serviço/obra quando o pedido vai sair SEM mídia e a categoria é das que pedem
// foto (utils/categorias: CATEGORIAS_PEDE_FOTO; obra, sempre). Nunca bloqueia: "Publicar sem
// foto ou vídeo" publica como sempre, e fechar (✕, toque fora, voltar, arrastar) só devolve
// a pessoa ao formulário. Mesmo molde visual do AvisarPedidoSheet.
//   onAdicionar — "Adicionar foto ou vídeo": a tela abre o picker de mídia de sempre.
//   onPublicar  — "Publicar sem foto ou vídeo".
export default function FolhaDicaFoto({ visivel, onAdicionar, onPublicar, onFechar }) {
  const insets = useSafeAreaInsets()
  const { gesto, estiloArraste, medirFolha } = useArrastarParaFechar(onFechar, !!visivel)
  if (!visivel) return null
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <RaizGestosFolha>
      <View style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.sheet, { paddingBottom: insets.bottom + 20 }, estiloArraste]} onLayout={medirFolha}>
          {/* alignSelf stretch: o sheet centraliza os filhos, e a zona do arraste precisa da largura toda. */}
          <ZonaArraste gesto={gesto} style={{ alignSelf: 'stretch' }}>
            <View style={estilos.alca} />
            <LinhaCabecalhoFolha onFechar={onFechar}>
              <Text style={estilos.titulo}>📸 Pedidos com fotos ou vídeos recebem mais propostas</Text>
            </LinhaCabecalhoFolha>
            <Text style={estilos.corpo}>O profissional vê o serviço e já dá o preço certo, sem precisar perguntar.</Text>
          </ZonaArraste>
          <TouchableOpacity style={estilos.cta} onPress={onAdicionar} activeOpacity={0.85} accessibilityRole="button">
            <Text style={estilos.ctaTexto} maxFontSizeMultiplier={1.4}>📷 Adicionar foto ou vídeo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.secundario} onPress={onPublicar} activeOpacity={0.85} accessibilityRole="button">
            <Text style={estilos.secundarioTexto} maxFontSizeMultiplier={1.4}>Publicar sem foto ou vídeo</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      </RaizGestosFolha>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: espacos.tela, paddingTop: 12, alignItems: 'center', ...larguraMaxima },
  alca:            { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 18 },
  titulo:          { fontSize: 20, fontWeight: '800', color: cores.textoForte, textAlign: 'center', letterSpacing: -0.3, marginBottom: 10 },
  corpo:           { fontSize: 14, color: cores.textoMedio, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  cta:             { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 10 },
  ctaTexto:        { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  secundario:      { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.grande, paddingVertical: 15, paddingHorizontal: 28, width: '100%', alignItems: 'center' },
  secundarioTexto: { color: cores.textoForte, fontSize: 15, fontWeight: '600' },
})
