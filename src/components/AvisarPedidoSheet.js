import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, Image, Linking, Animated } from 'react-native'
import * as Notifications from 'expo-notifications'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import { useAuth } from '../contexts/AuthContext'
import useArrastarParaFechar from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'

// Bottom sheet "Seu pedido foi publicado! 🎉" (arte Arte-Avisar-Pedido): aparece logo
// depois de um reparo ou obra publicado COM SUCESSO, só para quem ainda não tem a
// permissão de notificação. Dois estados:
//   'pedir'     — ainda dá para pedir ao SO: "Sim, me avise" dispara o diálogo e, concedido,
//                 registra o token; "Agora não" só fecha.
//   'bloqueado' — canAskAgain false: o SO não mostra mais diálogo, então o sheet ensina o
//                 caminho das Configurações e "Abrir ajustes" leva até lá.
// Com a permissão concedida NUNCA aparece (o mostrar() devolve false e o chamador segue o
// fluxo de sempre). Não mexe no soft-ask (SoftAskNotificacao): é outro convite, ancorado
// ao momento de maior relevância para o dono — o pedido acabou de ir ao ar.
//
// Mesmo molde do SoftAskNotificacao: host montado uma vez no AppNavigator, acionado por ref
// de módulo. O conteúdo é exportado à parte (AvisarPedidoConteudo) para a Galeria de estados.
export const avisarPedidoRef = { mostrar: null }

const ICONE_APP = require('../../assets/icon.png')

const TEXTOS = {
  pedir: {
    corpo: 'Quer ser avisado na hora quando um profissional se interessar? Sem aviso, você pode perder as melhores propostas.',
    cta: 'Sim, me avise',
  },
  bloqueado: {
    corpo: 'As notificações do ProTudo estão desligadas no seu celular. Ligue para saber na hora quando um profissional se interessar.',
    cta: 'Abrir ajustes',
  },
}
const PASSOS_AJUSTES = ['Toque em Abrir ajustes', 'Toque em Notificações', 'Deixe ligado e volte ao app']

// Cartão de exemplo: a notificação como ela chega, para a pessoa ver o que está ganhando.
const CartaoExemplo = () => (
  <View style={estilos.cartao}>
    <View style={estilos.cartaoTopo}>
      <Image source={ICONE_APP} style={estilos.cartaoIcone} />
      <Text style={estilos.cartaoApp}>ProTudo</Text>
      <Text style={estilos.cartaoHora}>agora</Text>
    </View>
    <Text style={estilos.cartaoTitulo}>Novo interesse!</Text>
    <Text style={estilos.cartaoTexto}>Um profissional quer fazer o seu serviço</Text>
  </View>
)

// Conteúdo puro (sem Modal): o sheet real e a Galeria usam o MESMO miolo.
// modo: 'pedir' | 'bloqueado'. onAvisar: "Sim, me avise". onAgoraNao: "Agora não".
// onAbrirAjustes: "Abrir ajustes". Os handlers do estado que não está em uso são ignorados.
// arraste: panHandlers de useArrastarParaFechar (só o sheet real passa): alça e cabeçalho.
// onFechar: a pílula "✕ Fechar" à direita do título — o mesmo fechar do toque fora.
export const AvisarPedidoConteudo = ({ modo, onAvisar, onAgoraNao, onAbrirAjustes, ocupado = false, arraste, onFechar }) => {
  const textos = TEXTOS[modo] || TEXTOS.pedir
  const bloqueado = modo === 'bloqueado'
  return (
    <>
      {/* alignSelf stretch: o sheet centraliza os filhos, e a zona do arraste precisa da largura toda. */}
      <View style={{ alignSelf: 'stretch' }} {...(arraste || {})}>
        <View style={estilos.alca} />
        <LinhaCabecalhoFolha onFechar={onFechar}>
          <Text style={estilos.titulo}>Seu pedido foi publicado! 🎉</Text>
        </LinhaCabecalhoFolha>
        <Text style={estilos.corpo}>{textos.corpo}</Text>
      </View>

      {bloqueado ? (
        <View style={estilos.passos}>
          {PASSOS_AJUSTES.map((passo, i) => (
            <View key={passo} style={estilos.passo}>
              <View style={estilos.passoNumero}><Text style={estilos.passoNumeroTexto}>{i + 1}</Text></View>
              <Text style={estilos.passoTexto}>{passo}</Text>
            </View>
          ))}
        </View>
      ) : (
        <CartaoExemplo />
      )}

      <TouchableOpacity
        style={[estilos.cta, ocupado && { opacity: 0.6 }]}
        onPress={bloqueado ? onAbrirAjustes : onAvisar}
        disabled={ocupado}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={textos.cta}
      >
        <Text style={estilos.ctaTexto} maxFontSizeMultiplier={1.4}>{bloqueado ? '⚙️ ' : '🔔 '}{textos.cta}</Text>
      </TouchableOpacity>

      {!bloqueado && (
        <TouchableOpacity style={estilos.depois} onPress={onAgoraNao} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
          <Text style={estilos.depoisTexto}>Agora não</Text>
        </TouchableOpacity>
      )}
    </>
  )
}

const AvisarPedidoSheet = () => {
  const { garantirPermissaoConcedida, registrarPushToken } = useAuth()
  const insets = useSafeAreaInsets()
  const [modo, setModo] = useState(null) // null = escondido | 'pedir' | 'bloqueado'
  const ocupadoRef = useRef(false)
  const [ocupado, setOcupado] = useState(false)

  // Consulta AO VIVO e decide: concedida (ou falha na consulta) → false, nada aparece e o
  // chamador segue o fluxo de sempre; negada mas ainda pedível → 'pedir'; bloqueada
  // (canAskAgain false) → 'bloqueado'. Devolve true quando o sheet foi exibido.
  const mostrar = useCallback(async () => {
    try {
      const { granted, canAskAgain } = await Notifications.getPermissionsAsync()
      if (granted) { console.log('[AvisarPedido] não exibido | permissão já concedida'); return false }
      setModo(canAskAgain === false ? 'bloqueado' : 'pedir')
      return true
    } catch (err) {
      console.error('[AvisarPedido] falha ao consultar permissão | msg:', err?.message, err)
      return false
    }
  }, [])

  useEffect(() => { avisarPedidoRef.mostrar = mostrar }, [mostrar])

  const fechar = () => setModo(null)
  // Arrastar a alça/cabeçalho para baixo fecha como o toque fora e o voltar do Android.
  const { panHandlers, estiloArraste } = useArrastarParaFechar(fechar, !!modo)

  const aoAvisar = async () => {
    if (ocupadoRef.current) return
    ocupadoRef.current = true
    setOcupado(true)
    try {
      // garantirPermissaoConcedida é o ÚNICO ponto do app que dispara o diálogo do SO.
      const concedida = await garantirPermissaoConcedida()
      if (concedida) {
        setModo(null)
        registrarPushToken()
        return
      }
      // Recusou. Se a recusa virou bloqueio (Android 13+ fecha a porta na 2ª vez), o sheet
      // troca para o estado que ensina o caminho das Configurações em vez de sumir calado —
      // mesma verificação pós-tentativa do SoftAskNotificacao.aoAtivar.
      let bloqueada = false
      try {
        const { canAskAgain } = await Notifications.getPermissionsAsync()
        bloqueada = canAskAgain === false
      } catch (err) {
        console.log('[AvisarPedido] falha ao reconsultar permissão após negativa | msg:', err?.message)
      }
      if (bloqueada) setModo('bloqueado')
      else setModo(null)
    } finally {
      ocupadoRef.current = false
      setOcupado(false)
    }
  }

  const aoAbrirAjustes = () => {
    setModo(null)
    Linking.openSettings().catch((err) => console.log('[AvisarPedido] falha ao abrir ajustes | msg:', err?.message))
  }

  if (!modo) return null

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={fechar}>
      <View style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.sheet, { paddingBottom: insets.bottom + 20 }, estiloArraste]}>
          <AvisarPedidoConteudo modo={modo} ocupado={ocupado} onAvisar={aoAvisar} onAgoraNao={fechar} onAbrirAjustes={aoAbrirAjustes} arraste={panHandlers} onFechar={fechar} />
        </Animated.View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:            { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: espacos.tela, paddingTop: 12, alignItems: 'center', ...larguraMaxima },
  alca:             { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 18 },
  titulo:           { fontSize: 22, fontWeight: '800', color: cores.textoForte, textAlign: 'center', letterSpacing: -0.3, marginBottom: 10 },
  corpo:            { fontSize: 14, color: cores.textoMedio, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  // Cartão de exemplo: imita a notificação do sistema sobre o fundo do app.
  cartao:           { width: '100%', backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.primariaBorda, borderRadius: raios.grande, padding: 14, marginBottom: 22 },
  cartaoTopo:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cartaoIcone:      { width: 18, height: 18, borderRadius: 5, marginRight: 6 },
  cartaoApp:        { flex: 1, fontSize: 12, fontWeight: '600', color: cores.textoMedio },
  cartaoHora:       { fontSize: 12, color: cores.textoMedio },
  cartaoTitulo:     { fontSize: 15, fontWeight: '700', color: cores.textoForte, marginBottom: 2 },
  cartaoTexto:      { fontSize: 13.5, color: cores.textoForte, lineHeight: 19 },
  // Passos das Configurações (estado bloqueado).
  passos:           { width: '100%', backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, gap: 10, marginBottom: 22 },
  passo:            { flexDirection: 'row', alignItems: 'center', gap: 10 },
  passoNumero:      { width: 24, height: 24, borderRadius: 12, backgroundColor: cores.primariaSuave, borderWidth: 1, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  passoNumeroTexto: { fontSize: 12, fontWeight: '800', color: cores.primaria },
  passoTexto:       { flex: 1, fontSize: 14, color: cores.textoForte, lineHeight: 20 },
  cta:              { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 12 },
  ctaTexto:         { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  depois:           { paddingVertical: 8 },
  depoisTexto:      { color: cores.textoFraco, fontSize: 13 },
})

export default AvisarPedidoSheet
