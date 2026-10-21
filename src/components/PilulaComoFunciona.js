import React, { useState, useEffect } from 'react'
import { Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import { carregarVideoComoFunciona, pilulaComoFuncionaOculta, ocultarPilulaComoFunciona } from '../services/videoComoFunciona'
import { cores, raios } from '../utils/tema'

// Pílula "🎬 Veja como funciona" ao lado da saudação das telas iniciais (feeds do
// profissional e listas do dono). Abre a ComoFunciona do PerfilStack e some PARA SEMPRE
// no primeiro toque (marca local por conta) — depois disso a tela fica só no Perfil.
//
// Aparece quando as duas coisas valem: há vídeo publicado (video_id não vazio) e a marca
// desta conta NÃO está gravada. Começa oculta: só mostra depois de LER a marca, para
// nunca piscar para quem já tocou.
export default function PilulaComoFunciona({ navigation }) {
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

  const abrir = () => {
    // Some já; a gravação falhar só faz a pílula voltar na próxima abertura.
    setOculta(true)
    ocultarPilulaComoFunciona(usuario?.id)
    // A tela vive no PerfilStack, aba 'Perfil' dos quatro navegadores de abas.
    navigation.navigate('Perfil', { screen: 'ComoFunciona', initial: false })
  }

  return (
    <TouchableOpacity
      style={estilos.pilula}
      onPress={abrir}
      activeOpacity={0.8}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel="Veja como funciona o ProTudo"
    >
      <Text style={estilos.texto}>🎬 Veja como funciona</Text>
    </TouchableOpacity>
  )
}

const estilos = StyleSheet.create({
  // Mesmo chip laranja do ConviteCadastroServicos, em escala menor para caber na linha da saudação.
  pilula: { alignSelf: 'flex-start', backgroundColor: cores.primariaSuave, borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 3 },
  texto:  { fontSize: 11, fontWeight: '700', color: cores.primaria },
})
