import React, { useState, useEffect } from 'react'
import { View, StyleSheet, BackHandler } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../contexts/AuthContext'
import { cores } from '../utils/tema'
import { TelaAviso, BotaoPrimario } from '../components'
import { Feather } from '@expo/vector-icons'

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
        <TelaAviso
          icone={<Feather name="check" size={36} color={cores.fundo} />}
          corIcone="sucesso"
          iconePreenchido
          titulo="Cadastro Aprovado!"
          corTitulo="sucesso"
          texto="Parabéns! Você agora está apto para atender às demandas disponíveis na plataforma. Bom trabalho!"
        >
          {/* carregando (e não desabilitado): o botão antigo já trocava o rótulo por um
              ActivityIndicator enquanto enviava — nenhuma string se perde aqui. */}
          <BotaoPrimario
            titulo="Começar a atender! →"
            onPress={aoComecar}
            carregando={enviando}
            estilo={{ width: '100%' }}
          />
        </TelaAviso>
      </View>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  fundo:           { flex: 1, backgroundColor: cores.fundo, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:            { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.primaria, padding: 28, alignItems: 'center' },
})
