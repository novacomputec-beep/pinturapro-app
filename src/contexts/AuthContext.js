import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { authService } from '../services/api'
import api from '../services/api'

const AuthContext = createContext({})

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

const configurarCanalAndroid = () => {
  if (Platform.OS !== 'android') return
  Notifications.setNotificationChannelAsync('default', {
    name: 'ArrumaPro',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#E8833A',
    sound: true,
  })
}

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null)
  const [assinatura, setAssinatura] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const notificacaoRecebidaRef = useRef(null)
  const notificacaoRespostaRef = useRef(null)

  useEffect(() => {
    configurarCanalAndroid()
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

    notificacaoRecebidaRef.current = Notifications.addNotificationReceivedListener(notificacao => {
      console.log('Notificação recebida:', notificacao.request.content)
    })

    notificacaoRespostaRef.current = Notifications.addNotificationResponseReceivedListener(resposta => {
      const data = resposta.notification.request.content.data
      console.log('Notificação tocada:', data)
    })

    return () => {
      notificacaoRecebidaRef.current?.remove()
      notificacaoRespostaRef.current?.remove()
    }
  }, [])

  const registrarPushToken = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync()
      if (status !== 'granted') return
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig?.extra?.projectId || 'bf289259-dbe3-429f-9032-dcaca21f0a8a' })
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

  // Função usada após cadastro — recebe token e dados diretamente
  const loginComToken = async (token, usuarioDados, assinaturaDados) => {
    await SecureStore.setItemAsync('token', token)
    setUsuario(usuarioDados)
    setAssinatura(assinaturaDados || null)
    setTimeout(() => registrarPushToken(), 1000)
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
      loginComToken,
      logout,
      setUsuario,
      setAssinatura,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)