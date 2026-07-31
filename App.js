import 'react-native-gesture-handler'
import React, { useEffect } from 'react'
import { AppState } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import AppNavigator from './src/navigation/AppNavigator'
import GlobalVencimentoBanner from './src/components/GlobalVencimentoBanner'
import BannerNotificacaoBloqueada from './src/components/BannerNotificacaoBloqueada'
import { iniciarRastreamento, pararRastreamento } from './src/services/locationService'
import api from './src/services/api'

function RastreamentoController() {
  const { usuario } = useAuth()

  useEffect(() => {
    if (usuario?.role === 'prestador') {
      iniciarRastreamento()
    } else {
      pararRastreamento()
    }
    return () => {
      pararRastreamento()
    }
  }, [usuario])

  return null
}

// Warm-up ao voltar do 2º plano. NÃO é cold start do servidor: o Serverless está
// desligado e a API fica de pé (15,6 h de uptime observadas). O que morre é a
// CONEXÃO — enquanto o app está em 2º plano o SO/a rede derrubam o socket TCP
// ocioso, sem que o cliente saiba. O pool do axios continua achando que ele serve,
// e a PRIMEIRA requisição depois do retorno é entregue nesse socket morto: ela não
// falha na hora, morre em silêncio até estourar o timeout de 30 s — e essa vítima
// costuma ser a ação que o usuário acabou de tocar.
// Um GET /health descartável ao voltar à tela serve de para-raios: é ELE quem
// reutiliza o socket podre e leva o erro, forçando o pool a abrir uma conexão nova
// antes de o dedo chegar no botão. Por isso a falha aqui não é anomalia — é o
// caso de sucesso, e o log fica em console.log, não em console.error.
// Mesmo endpoint/padrão do warm-up que já existe no CadastroScreen e nas
// contrapropostas. SEM gate de sessão: um socket morto não distingue quem está
// logado, e pré-login a vítima seria o POST /auth/login.
// O listener só dispara em MUDANÇA de estado, então a montagem no boot não chama
// nada — ali a conexão é nova e o AuthContext já bate na API por conta própria.
function WarmupController() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        api.get('/health').catch(err => console.log('[Warmup] falha no /health (ok) | code:', err?.code, '| msg:', err?.mensagem))
      }
    })
    return () => sub.remove()
  }, [])

  return null
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" backgroundColor="#0A0A0A" />
        <RastreamentoController />
        <WarmupController />
        <BannerNotificacaoBloqueada />
        <GlobalVencimentoBanner />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  )
}