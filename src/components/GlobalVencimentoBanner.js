import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useAuth } from '../contexts/AuthContext'

const GlobalVencimentoBanner = () => {
  const { usuario, assinatura } = useAuth()

  if (!usuario || !assinatura?.proximo_vencimento) return null
  if (assinatura.status !== 'ativa') return null

  const hoje = new Date()
  const vencimento = new Date(assinatura.proximo_vencimento)
  const ehHoje = (
    vencimento.getFullYear() === hoje.getFullYear() &&
    vencimento.getMonth() === hoje.getMonth() &&
    vencimento.getDate() === hoje.getDate()
  )

  if (!ehHoje) return null

  return (
    <View style={estilos.banner}>
      <Text style={estilos.texto}>
        ⚠️ Último dia de acesso — sua assinatura vence hoje. Renove agora!
      </Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#C0392B',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
})

export default GlobalVencimentoBanner
