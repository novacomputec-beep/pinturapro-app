import React, { createContext, useContext, useState, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
import { authService } from '../services/api'

const AuthContext = createContext({})

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
          } catch (err) {
            // Token inválido ou expirado — limpa e vai para login
            console.log('Token inválido, limpando sessão...')
            await SecureStore.deleteItemAsync('token')
            setUsuario(null)
            setAssinatura(null)
          }
        }
      } catch (err) {
        console.log('Erro ao restaurar sessão:', err)
        await SecureStore.deleteItemAsync('token')
      } finally {
        setCarregando(false)
      }
    }
    restaurarSessao()
  }, [])

  const login = async (email, senha) => {
    const resposta = await authService.login(email, senha)
    await SecureStore.setItemAsync('token', resposta.token)
    setUsuario(resposta.usuario)
    setAssinatura(resposta.assinatura)
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