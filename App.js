import 'react-native-gesture-handler'
import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import AppNavigator from './src/navigation/AppNavigator'
import { iniciarRastreamento, pararRastreamento } from './src/services/locationService'

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

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" backgroundColor="#0A0A0A" />
        <RastreamentoController />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  )
}