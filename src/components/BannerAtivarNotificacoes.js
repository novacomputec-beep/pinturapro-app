import React, { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, AppState, Linking } from 'react-native'
import * as Notifications from 'expo-notifications'
import { LinearGradient } from 'expo-linear-gradient'
import { useAuth } from '../contexts/AuthContext'
import { cores, espacos, raios, larguraMaxima } from '../utils/tema'

// Cartão PERSISTENTE no topo dos feeds do profissional (serviços e obras) enquanto a
// permissão de notificação não está concedida. Sem "✕" de propósito: o feed é onde o
// pedido chega, e um profissional sem push perde pedidos sem saber — o cartão só some
// quando a permissão existe.
//
// Reconsulta ao montar e a cada volta ao foreground (quem foi às Configurações volta por
// aí), e some na hora que o SO concede. Começa escondido: nunca mostra o aviso antes de
// saber o estado real.
//
// O toque reaproveita o fluxo que já existe: garantirPermissaoConcedida (o ÚNICO ponto do
// app que dispara o diálogo do SO) e, concedida, registrarPushToken — o mesmo par do
// SoftAskController e do soft-ask. Com canAskAgain false o SO não mostra mais diálogo, e
// só as Configurações do aparelho resolvem: o botão abre direto lá.
export default function BannerAtivarNotificacoes() {
  const { garantirPermissaoConcedida, registrarPushToken } = useAuth()
  // null = ainda não consultado | true = concedida (nada a mostrar) | false = mostrar
  const [concedida, setConcedida] = useState(null)
  const podePedirRef = useRef(true)
  const ocupadoRef = useRef(false)

  const verificar = useCallback(async () => {
    try {
      const { granted, canAskAgain } = await Notifications.getPermissionsAsync()
      podePedirRef.current = canAskAgain !== false
      setConcedida(!!granted)
    } catch (err) {
      // Falha ao consultar não vira aviso: melhor calar que mentir.
      console.log('[BannerAtivarNotificacoes] falha ao consultar permissão | msg:', err?.message)
      setConcedida(true)
    }
  }, [])

  useEffect(() => { verificar() }, [verificar])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => { if (estado === 'active') verificar() })
    return () => sub.remove()
  }, [verificar])

  const ativar = async () => {
    if (ocupadoRef.current) return
    ocupadoRef.current = true
    try {
      if (!podePedirRef.current) {
        // Bloqueada no SO: o diálogo não existe mais; a volta das Configurações reconsulta.
        await Linking.openSettings()
        return
      }
      const ok = await garantirPermissaoConcedida()
      if (ok) {
        setConcedida(true)   // some na hora, sem esperar reconsulta
        registrarPushToken()
        return
      }
      // Negou: reconsulta para saber se virou bloqueio (Android 13+ fecha a porta na 2ª
      // recusa). Assim o próximo toque já vai para as Configurações em vez de não fazer nada.
      await verificar()
    } catch (err) {
      console.log('[BannerAtivarNotificacoes] falha ao ativar | msg:', err?.message)
    } finally {
      ocupadoRef.current = false
    }
  }

  if (concedida !== false) return null

  return (
    <View style={[estilos.wrap, larguraMaxima]}>
      <View style={estilos.moldura}>
        <LinearGradient
          colors={['#2C1B0F', '#1A1410', '#121110']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={estilos.card}
        >
          <LinearGradient colors={['#FFA552', cores.primaria]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.icone}>
            <Text style={estilos.iconeTexto} maxFontSizeMultiplier={1.3}>🔔</Text>
          </LinearGradient>
          <View style={estilos.textos}>
            <Text style={estilos.titulo}>Você está perdendo pedidos!</Text>
            <Text style={estilos.texto}>Suas notificações estão desligadas. Ative para saber na hora quando surgir serviço.</Text>
          </View>
          <TouchableOpacity
            style={estilos.botao}
            onPress={ativar}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Ativar notificações"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={estilos.botaoTexto} maxFontSizeMultiplier={1.4}>Ativar</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    </View>
  )
}

const estilos = StyleSheet.create({
  wrap: { paddingHorizontal: espacos.tela, marginBottom: 10 },
  // Borda, raio e brilho na moldura; o gradiente por dentro, recortado pelo raio. O
  // brilho laranja é sombra: no iOS pelo shadow*, no Android pela elevation (que aceita
  // shadowColor a partir do API 28; antes disso fica a sombra cinza padrão).
  moldura: {
    borderRadius: raios.grande,
    borderWidth: 1.5,
    borderColor: cores.primaria + 'B3',
    overflow: 'hidden',
    backgroundColor: '#1A1410',
    shadowColor: cores.primaria,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  icone: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconeTexto: { fontSize: 22 },
  textos: { flex: 1, minWidth: 0 },
  titulo: { fontSize: 15, fontWeight: '700', color: cores.textoForte, marginBottom: 2 },
  texto: { fontSize: 12.5, lineHeight: 17, color: '#B3AFA8' },
  botao: { backgroundColor: cores.primaria, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14, flexShrink: 0 },
  botaoTexto: { color: '#0A0A0A', fontSize: 13, fontWeight: '800' },
})
