import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useAuth } from '../contexts/AuthContext'
import { carregarVideoComoFunciona, pilulaComoFuncionaOculta, ocultarPilulaComoFunciona } from '../services/videoComoFunciona'
import { espacos, larguraMaxima } from '../utils/tema'

// Cartão "Veja como o ProTudo funciona" logo abaixo do cabeçalho das telas iniciais
// (feeds do profissional, listas e cadastros do dono). Substitui a pílula antiga com as
// MESMAS regras: aparece só com vídeo publicado (video_id não vazio) e enquanto a marca
// desta conta não está gravada; some PARA SEMPRE no toque do cartão ou no ✕ (marca local
// por conta — a chave do AsyncStorage é a mesma da pílula, então quem já dispensou segue
// dispensado). Depois disso a tela fica só no Perfil.
//
// Começa oculto: só mostra depois de LER a marca, para nunca piscar para quem já tocou.
//
// `semRecuo`: nas telas cujo conteúdo já tem paddingHorizontal (os ScrollViews de
// cadastro) o cartão não repete o recuo lateral.
export default function BannerComoFunciona({ navigation, semRecuo = false }) {
  const { usuario } = useAuth()
  const [temVideo, setTemVideo] = useState(false)
  const [oculta, setOculta] = useState(true)

  useEffect(() => {
    let vivo = true
    carregarVideoComoFunciona().then(v => { if (vivo) setTemVideo(!!v.video_id) })
    pilulaComoFuncionaOculta(usuario?.id).then(o => { if (vivo) setOculta(o) })
    return () => { vivo = false }
  }, [usuario?.id])

  if (!temVideo || oculta) return null

  // Some já; a gravação falhar só faz o cartão voltar na próxima abertura.
  const dispensar = () => {
    setOculta(true)
    ocultarPilulaComoFunciona(usuario?.id)
  }

  const abrir = () => {
    dispensar()
    // A tela vive no PerfilStack, aba 'Perfil' dos quatro navegadores de abas.
    navigation.navigate('Perfil', { screen: 'ComoFunciona', initial: false })
  }

  return (
    <View style={[estilos.wrap, semRecuo && estilos.wrapSemRecuo, larguraMaxima]}>
      <TouchableOpacity
        style={estilos.sombra}
        onPress={abrir}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Veja como o ProTudo funciona. Vídeo explicativo de 15 minutos"
      >
        <LinearGradient
          colors={['#ff8a3d', '#f05a28', '#c2410c']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={estilos.card}
        >
          <View style={estilos.play}>
            <View style={estilos.playTriangulo} />
          </View>
          <View style={estilos.textos}>
            <Text style={estilos.sobretitulo} maxFontSizeMultiplier={1.3}>NOVO POR AQUI?</Text>
            <Text style={estilos.titulo} maxFontSizeMultiplier={1.3}>Veja como o ProTudo funciona</Text>
            <View style={estilos.chip}>
              <Text style={estilos.chipTexto} maxFontSizeMultiplier={1.3}>▶ Vídeo explicativo · 15 min</Text>
            </View>
          </View>
          {/* Toque interno não propaga ao cartão: o responder fica com o filho mais fundo. */}
          <TouchableOpacity
            style={estilos.fechar}
            onPress={dispensar}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Fechar"
          >
            <Text style={estilos.fecharTexto}>✕</Text>
          </TouchableOpacity>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  )
}

const estilos = StyleSheet.create({
  wrap: { paddingHorizontal: espacos.tela, marginBottom: 12 },
  wrapSemRecuo: { paddingHorizontal: 0 },
  // Brilho laranja como sombra: iOS pelo shadow*, Android pela elevation (precisa de
  // backgroundColor opaco para desenhar). O gradiente por dentro, recortado pelo raio.
  sombra: {
    borderRadius: 18,
    backgroundColor: '#f05a28',
    shadowColor: '#f05a28',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  card: { borderRadius: 18, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingLeft: 16, paddingRight: 14 },
  play: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // Triângulo por bordas: só a esquerda colorida, as outras transparentes.
  playTriangulo: { width: 0, height: 0, marginLeft: 5, borderTopWidth: 11, borderBottomWidth: 11, borderLeftWidth: 19, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#f05a28' },
  textos: { flex: 1, minWidth: 0, paddingRight: 14 },
  sobretitulo: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: 'rgba(255,255,255,0.85)', marginBottom: 3 },
  titulo: { fontSize: 19, fontWeight: '900', lineHeight: 23, color: '#FFFFFF' },
  chip: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginTop: 8 },
  chipTexto: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  fechar: { position: 'absolute', top: 8, right: 10, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  fecharTexto: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', lineHeight: 14 },
})
