import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, BackHandler, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../contexts/AuthContext'
import { cores, raios } from '../utils/tema'

// Tela de boas-vindas exibida uma única vez para prestadores recém-aprovados
// (reparador, pintor, construtor). Mostrada pelo AppNavigator antes das abas do
// prestador enquanto usuario.boas_vindas_exibida === false. Só pode ser dispensada
// pelo botão — gesto de voltar e botão físico (Android) ficam bloqueados; ao
// confirmar, o flag é limpo e o AppNavigator re-renderiza direto no feed.
export default function BoasVindasPrestadorScreen() {
  const { confirmarBoasVindas } = useAuth()
  const [enviando, setEnviando] = useState(false)

  // Bloqueia o botão físico de voltar (Android) — só o botão da tela dispensa.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => sub.remove()
  }, [])

  const aoComecar = async () => {
    if (enviando) return
    setEnviando(true)
    // confirmarBoasVindas limpa o flag mesmo se a chamada falhar, então o usuário
    // nunca fica preso nesta tela; o AppNavigator troca para as abas (feed) sozinho.
    await confirmarBoasVindas()
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.fundo}>
      <View style={estilos.card}>
        <Text style={estilos.confete}>🎉   ✨   🎉</Text>
        <Text style={estilos.emoji}>✅</Text>
        <Text style={estilos.titulo}>Cadastro Aprovado!</Text>
        <Text style={estilos.subtitulo}>
          Parabéns! Você agora está apto para atender às demandas disponíveis na plataforma. Bom trabalho!
        </Text>
        <TouchableOpacity
          style={[estilos.cta, enviando && estilos.ctaDesabilitado]}
          onPress={aoComecar}
          activeOpacity={0.85}
          disabled={enviando}
        >
          {enviando
            ? <ActivityIndicator color="#0A0A0A" />
            : <Text style={estilos.ctaTexto}>Começar a atender! →</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  fundo:           { flex: 1, backgroundColor: cores.fundo, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:            { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.primaria, padding: 28, alignItems: 'center' },
  confete:         { fontSize: 24, marginBottom: 4 },
  emoji:           { fontSize: 64, marginBottom: 8 },
  titulo:          { fontSize: 24, fontWeight: '800', color: cores.primaria, textAlign: 'center', marginBottom: 12, letterSpacing: -0.3 },
  subtitulo:       { fontSize: 15, color: cores.textoMedio, textAlign: 'center', lineHeight: 23, marginBottom: 28 },
  cta:             { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', minHeight: 54, justifyContent: 'center' },
  ctaDesabilitado: { opacity: 0.7 },
  ctaTexto:        { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
})
