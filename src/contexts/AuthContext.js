import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { authService } from '../services/api'
import api from '../services/api'
import { resetarFlagsSessao } from '../utils/sessao'

const AuthContext = createContext({})

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

const configurarCanalAndroid = async () => {
  if (Platform.OS !== 'android') return
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'ArrumaPro',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E8833A',
      sound: true,
    })
  } catch (err) {
    console.error('[Push] falha ao configurar canal Android | msg:', err?.message, err)
  }
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
            console.log('[AuthContext] falha ao restaurar sessão (perfil) | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
            await SecureStore.deleteItemAsync('token')
            setUsuario(null)
            setAssinatura(null)
          }
        }
      } catch (err) {
        console.log('[AuthContext] falha ao ler token do SecureStore | msg:', err.message)
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
    // O canal precisa existir ANTES de pedir o token no Android 8+.
    await configurarCanalAndroid()

    // Permissão: consulta o estado atual e só dispara o prompt se ainda não concedida.
    let status
    try {
      const atual = await Notifications.getPermissionsAsync()
      status = atual.status
      if (status !== 'granted' && atual.canAskAgain !== false) {
        status = (await Notifications.requestPermissionsAsync()).status
      }
    } catch (err) {
      console.error('[Push] falha ao obter/solicitar permissão de notificação | msg:', err?.message, err)
      return
    }
    if (status !== 'granted') {
      console.error('[Push] permissão de notificação NÃO concedida | status:', status, '— token não será gerado')
      return
    }

    // projectId: caminho correto é extra.eas.projectId (não extra.projectId).
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      || Constants.easConfig?.projectId
      || 'bf289259-dbe3-429f-9032-dcaca21f0a8a'

    let pushToken
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })
      pushToken = tokenData.data
    } catch (err) {
      console.error('[Push] getExpoPushTokenAsync FALHOU | projectId:', projectId, '| msg:', err?.message, err)
      return
    }

    try {
      await api.post('/auth/push-token', { token: pushToken })
      console.log('[Push] token registrado com sucesso | projectId:', projectId, '| token:', pushToken)
    } catch (err) {
      console.error('[Push] POST /auth/push-token FALHOU | status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem || err?.message, err)
    }
  }

  const login = async (email, senha) => {
    const resposta = await authService.login(email, senha)
    resetarFlagsSessao()
    await SecureStore.setItemAsync('token', resposta.token)
    setUsuario(resposta.usuario)
    setAssinatura(resposta.assinatura)
    setTimeout(() => registrarPushToken(), 1000)
    return resposta
  }

  // Função usada após cadastro — recebe token e dados diretamente
  const loginComToken = async (token, usuarioDados, assinaturaDados) => {
    resetarFlagsSessao()
    await SecureStore.setItemAsync('token', token)
    setUsuario(usuarioDados)
    setAssinatura(assinaturaDados || null)
    setTimeout(() => registrarPushToken(), 1000)
  }

  const logout = async () => {
    resetarFlagsSessao()
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