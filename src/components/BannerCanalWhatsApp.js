import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import * as Notifications from 'expo-notifications'
import { LinearGradient } from 'expo-linear-gradient'
import { useAuth } from '../contexts/AuthContext'
import { carregarVideoComoFunciona, pilulaComoFuncionaOculta } from '../services/videoComoFunciona'
import { espacos, larguraMaxima } from '../utils/tema'
import { lerEstadoCanal, canalSilenciado, dispensarCanal, marcarCanalSeguido, abrirCanalWhatsApp } from '../utils/canalWhatsApp'

// Cartão "Receba os pedidos também no WhatsApp" nos feeds do profissional, no MESMO molde
// do BannerComoFunciona (medidas, ✕, toque abre), em verde. Regras em utils/canalWhatsApp:
// toque some para sempre; ✕ volta em 15 dias, para na 3ª; prioridade a quem está sem
// permissão de notificação. Nunca junto do cartão "Como funciona": aquele vem primeiro —
// enquanto ele estiver visível (vídeo publicado e marca não gravada), este não aparece.
// Começa oculto e só mostra depois de LER as marcas, para nunca piscar para quem já tocou.
export default function BannerCanalWhatsApp() {
  const { usuario } = useAuth()
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    let vivo = true
    const uid = usuario?.id
    if (uid == null) return undefined
    if (!(usuario.role === 'prestador' || usuario.role === 'assinante')) return undefined
    ;(async () => {
      try {
        // "Como funciona" na frente: as mesmas duas leituras que ele faz para se mostrar.
        const [video, comoFuncionaOculto] = await Promise.all([carregarVideoComoFunciona(), pilulaComoFuncionaOculta(uid)])
        if (video.video_id && !comoFuncionaOculto) return
        let semPermissao = false
        try { semPermissao = !(await Notifications.getPermissionsAsync()).granted } catch (err) {
          // Sem resposta do SO, trata como permitido: a prioridade é um favor, não uma regra.
          console.log('[BannerCanalWhatsApp] falha ao consultar permissão | msg:', err?.message)
        }
        const e = await lerEstadoCanal(uid)
        if (vivo && !canalSilenciado(e, semPermissao)) setVisivel(true)
      } catch (err) {
        console.log('[BannerCanalWhatsApp] falha ao decidir se mostra | msg:', err?.message)
      }
    })()
    return () => { vivo = false }
  }, [usuario?.id])

  if (!visivel) return null

  // Some já; a gravação falhar só faz o cartão voltar na próxima abertura.
  const dispensar = () => {
    setVisivel(false)
    dispensarCanal(usuario.id)
  }

  // Abriu o canal: cumpriu o papel, não volta mais.
  const abrir = () => {
    setVisivel(false)
    marcarCanalSeguido(usuario.id)
    abrirCanalWhatsApp()
  }

  return (
    <View style={[estilos.wrap, larguraMaxima]}>
      <TouchableOpacity
        style={estilos.sombra}
        onPress={abrir}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Receba os pedidos também no WhatsApp. Seguir o canal"
      >
        <LinearGradient
          colors={['#2fd06f', '#1fa855', '#128c45']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={estilos.card}
        >
          <View style={estilos.icone}>
            <Text style={estilos.iconeTexto}>📢</Text>
          </View>
          <View style={estilos.textos}>
            <Text style={estilos.sobretitulo} maxFontSizeMultiplier={1.3}>NÃO PERCA NENHUM PEDIDO</Text>
            <Text style={estilos.titulo} maxFontSizeMultiplier={1.3}>Receba os pedidos também no WhatsApp</Text>
            <View style={estilos.chip}>
              <Text style={estilos.chipTexto} maxFontSizeMultiplier={1.3}>Seguir o canal →</Text>
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
  // Cópia fiel das medidas do BannerComoFunciona; só a cor muda (verde do WhatsApp).
  wrap: { paddingHorizontal: espacos.tela, marginBottom: 12 },
  sombra: {
    borderRadius: 18,
    backgroundColor: '#1fa855',
    shadowColor: '#1fa855',
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
