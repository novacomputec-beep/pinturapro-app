import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useAuth } from '../contexts/AuthContext'
import { espacos, larguraMaxima, cores, raios } from '../utils/tema'
import { lerEstadoBanner, bannerSilenciado, dispensarBanner, marcarTemMatch, profissionalJaTeveMatch } from '../utils/indicacao'

// Peças da indicação de colegas que aparecem FORA da tela própria (ConvidarColegaScreen):
// o selo nos cards de candidato/interessado do dono e o cartão do feed do profissional.

// Selo "Embaixador ProTudo": o profissional com 3 colegas indicados aprovados. Chip
// pequeno ao lado do nome, no tom da marca — informa, não grita.
export const ChipEmbaixador = () => (
  <View style={estilos.chipEmbaixador} accessibilityLabel="Embaixador ProTudo">
    <Text style={estilos.chipEmbaixadorTexto} numberOfLines={1}>🏅 Embaixador ProTudo</Text>
  </View>
)

// Cartão "Gostou? Convide um colega" no feed do profissional, no MESMO molde do
// BannerComoFunciona (gradiente laranja, ✕ no canto, toque abre a tela). Regras em
// utils/indicacao: só depois do primeiro match; volta 30 dias depois de cada ✕; para
// de vez na 3ª dispensa. Começa oculto e só mostra depois de LER a marca, para nunca
// piscar para quem já dispensou.
export const BannerConvideColega = ({ navigation }) => {
  const { usuario } = useAuth()
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    let vivo = true
    const uid = usuario?.id
    if (uid == null) return undefined
    const ehProfissional = usuario.role === 'prestador' || usuario.role === 'assinante'
    if (!ehProfissional) return undefined
    ;(async () => {
      try {
        const e = await lerEstadoBanner(uid)
        // Caminho barato primeiro: silenciado não paga a consulta do match.
        if (bannerSilenciado(e)) return
        let temMatch = e.temMatch
        if (!temMatch) {
          temMatch = await profissionalJaTeveMatch(usuario)
          if (temMatch) marcarTemMatch(uid)
        }
        if (vivo && temMatch) setVisivel(true)
      } catch (err) {
        // Sem rede não há cartão: é um convite, não um fluxo.
        console.log('[BannerConvideColega] falha ao decidir se mostra | code:', err?.code)
      }
    })()
    return () => { vivo = false }
  }, [usuario?.id])

  if (!visivel) return null

  // Some já; a gravação falhar só faz o cartão voltar na próxima abertura.
  const dispensar = () => {
    setVisivel(false)
    dispensarBanner(usuario.id)
  }

  // Abrir NÃO conta como dispensa: quem foi ver a tela e voltou ainda pode querer o atalho.
  const abrir = () => {
    // A tela vive no PerfilStack, aba 'Perfil' dos navegadores do profissional.
    navigation.navigate('Perfil', { screen: 'ConvidarColega', initial: false })
  }

  return (
    <View style={[estilos.wrap, larguraMaxima]}>
      <TouchableOpacity
        style={estilos.sombra}
        onPress={abrir}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Gostou? Convide um colega e ganhe um mês grátis"
      >
        <LinearGradient
          colors={['#ff8a3d', '#f05a28', '#c2410c']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={estilos.card}
        >
          <View style={estilos.icone}>
            <Text style={estilos.iconeTexto}>🤝</Text>
          </View>
          <View style={estilos.textos}>
            <Text style={estilos.sobretitulo} maxFontSizeMultiplier={1.3}>GOSTOU DO PROTUDO?</Text>
            <Text style={estilos.titulo} maxFontSizeMultiplier={1.3}>Convide um colega e ganhe +1 mês grátis</Text>
            <View style={estilos.chip}>
              <Text style={estilos.chipTexto} maxFontSizeMultiplier={1.3}>🤝 Convidar agora →</Text>
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
  chipEmbaixador: { alignSelf: 'flex-start', backgroundColor: cores.primaria + '1F', borderWidth: 0.5, borderColor: cores.primaria + '55', borderRadius: raios.pill, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 6, flexShrink: 1 },
  chipEmbaixadorTexto: { fontSize: 10, fontWeight: '700', color: cores.primaria },
  // Cartão: cópia fiel das medidas do BannerComoFunciona, trocando o botão de play pelo
  // emoji do aperto de mão.
  wrap: { paddingHorizontal: espacos.tela, marginBottom: 12 },
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
  icone: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconeTexto: { fontSize: 30 },
  textos: { flex: 1, minWidth: 0, paddingRight: 14 },
  sobretitulo: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: 'rgba(255,255,255,0.85)', marginBottom: 3 },
  titulo: { fontSize: 19, fontWeight: '900', lineHeight: 23, color: '#FFFFFF' },
  chip: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginTop: 8 },
  chipTexto: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  fechar: { position: 'absolute', top: 8, right: 10, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  fecharTexto: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', lineHeight: 14 },
})
