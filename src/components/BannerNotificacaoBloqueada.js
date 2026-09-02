import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, AppState, Linking } from 'react-native'
import * as Notifications from 'expo-notifications'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../contexts/AuthContext'

// Aviso PERSISTENTE para quem bloqueou permanentemente as notificações
// (canAskAgain === false): o app nunca mais consegue pedir permissão e a pessoa
// deixa de receber qualquer push sem perceber — foi exatamente o caso de produção.
// Só o dono do aparelho reverte isso, nas Configurações do sistema. Espelha o
// GlobalVencimentoBanner: overlay condicional, sem props, lê useAuth() e devolve
// null enquanto a condição não vale. NUNCA chama requestPermissionsAsync — apenas
// consulta; pedir permissão é a Fase 2.
const BannerNotificacaoBloqueada = () => {
  const { usuario } = useAuth()
  // Inset do topo pelo MESMO caminho do BarraServicoEmAndamento (:25) e do
  // useTabBarStyle (AppNavigator:634): useSafeAreaInsets no render, valor fixo no
  // StyleSheet. Sem altura cravada — em aparelho sem recorte o inset é 0 e a tarja
  // não se mexe; com recorte ela desce exatamente o que o aparelho pede.
  const { top } = useSafeAreaInsets()
  // Começa false: durante a consulta assíncrona a barra não aparece, para nunca
  // exibir um aviso falso antes de sabermos o estado real da permissão.
  const [bloqueada, setBloqueada] = useState(false)

  const verificar = useCallback(async () => {
    // Sem sessão não há o que avisar.
    if (!usuario) {
      setBloqueada(false)
      return
    }
    try {
      const { granted, canAskAgain } = await Notifications.getPermissionsAsync()
      setBloqueada(!granted && canAskAgain === false)
    } catch (err) {
      // Falha ao consultar não deve virar aviso — melhor calar que mentir.
      setBloqueada(false)
    }
  }, [usuario])

  // Ao montar e a cada troca de usuário.
  useEffect(() => { verificar() }, [verificar])

  // Ao voltar para o foreground (ex.: usuário retornou das Configurações após
  // ativar) — senão a barra ficaria na tela depois de resolvido. Mesmo padrão de
  // CelebracaoMatchHost.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => { if (estado === 'active') verificar() })
    return () => sub.remove()
  }, [verificar])

  if (!usuario || !bloqueada) return null

  return (
    <View style={[estilos.banner, { top }]}>
      <Text style={estilos.texto}>
        🔕 Notificações bloqueadas — você não será avisado de novidades.
      </Text>
      <TouchableOpacity style={estilos.botao} onPress={() => Linking.openSettings()} activeOpacity={0.8}>
        <Text style={estilos.botaoTexto}>Abrir Configurações</Text>
      </TouchableOpacity>
    </View>
  )
}

const estilos = StyleSheet.create({
  // zIndex 9999 IGUAL ao GlobalVencimentoBanner: como este banner é montado ANTES
  // dele em App.js, o empate de zIndex cai na ordem dos irmãos (sort estável do RN),
  // e o vencimento — montado depois — pinta por cima no raro dia em que ambos valem.
  banner: {
    position: 'absolute',
    // `top` sai do render (inset do aparelho); o resto da caixa é fixo.
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#FFC107',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  texto: {
    color: '#0A0A0A',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  botao: {
    backgroundColor: '#0A0A0A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  botaoTexto: {
    color: '#FFC107',
    fontSize: 12,
    fontWeight: '700',
  },
})

export default BannerNotificacaoBloqueada
