import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import { mostrarCobranca, mostrarAvisoCobranca, FRASE_ASSINATURA_EXTERNA } from '../utils/plataforma'

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

  // No iOS não se pede para renovar (3.1.1): fica só a frase, sem CTA — e conta gratuita
  // não tem cobrança nenhuma a avisar, então não recebe nem a frase.
  const texto = mostrarAvisoCobranca(assinatura)
    ? FRASE_ASSINATURA_EXTERNA
    : mostrarCobranca ? '⚠️ Último dia de acesso — sua assinatura vence hoje. Renove agora!' : null
  if (!texto) return null

  return (
    <View style={estilos.banner}>
      <Text style={estilos.texto}>
        {texto}
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
