import React, { createContext, useContext, useState, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { authService } from '../services/api'
import api from '../services/api'

const AuthContext = createContext({})

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null)
  const [assinatura, setAssinatura] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const restaurarSessao = async () => {
      try {
        const token = await SecureStore.getItemAsync('token')
        if (token) {
          try {
            const { usuario, assinatura } = await authService.perfil()
            setUsuario(usuario)
            setAssinatura(assinatura)
            registrarPushToken()
          } catch (err) {
            await SecureStore.deleteItemAsync('token')
            setUsuario(null)
            setAssinatura(null)
          }
        }
      } catch (err) {
        await SecureStore.deleteItemAsync('token')
      } finally {
        setCarregando(false)
      }
    }
    restaurarSessao()
  }, [])

  const registrarPushToken = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync()
      if (status !== 'granted') return

      const tokenData = await Notifications.getExpoPushTokenAsync()
      const pushToken = tokenData.data

      await api.post('/auth/push-token', { token: pushToken })
      console.log('Push token registrado:', pushToken)
    } catch (err) {
      console.log('Erro ao registrar push token:', err)
    }
  }

  const login = async (email, senha) => {
    const resposta = await authService.login(email, senha)
    await SecureStore.setItemAsync('token', resposta.token)
    setUsuario(resposta.usuario)
    setAssinatura(resposta.assinatura)
    setTimeout(() => registrarPushToken(), 1000)
    return resposta
  }

  const logout = async () => {
    await SecureStore.deleteItemAsync('token')
    setUsuario(null)
    setAssinatura(null)
  }

  const assinaturaAtiva = assinatura?.status === 'ativa'

  return (
    <AuthContext.Provider value={{
      usuario,
      assinatura,
      assinaturaAtiva,
      carregando,
      login,
      logout,
      setUsuario,
      setAssinatura,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)