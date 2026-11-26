import React from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import useArrastarParaFechar, { ZonaArraste, RaizGestosFolha } from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'

// Folha "📵 Tire o contato do texto" (arte anti-contato-previa, painel A): a API recusou
// publicar ou editar um serviço/obra com 409 codigo 'CONTATO_NO_TEXTO' (telefone, e-mail ou
// rede social no texto) e NADA foi gravado. Uma saída só — "Entendi, vou corrigir" (ou ✕,
// toque fora, voltar, arrastar): fecha, e o formulário fica como foi digitado.
// Mesmo molde visual da FolhaPareceAnuncio. Perguntas e respostas não passam por aqui: a API
// já devolve o contato trocado por "••••" (painel B).
//
// Contrato lido aqui: erro com codigo 'CONTATO_NO_TEXTO' (corpo do 4xx em `dados`). O trecho
// encontrado vem no mesmo corpo; aceita os nomes razoáveis do campo. Sem trecho, a linha
// "Encontramos" não aparece.
export const ehContatoNoTexto = (x) => x?.codigo === 'CONTATO_NO_TEXTO' || x?.dados?.codigo === 'CONTATO_NO_TEXTO'

const CAMPOS_TRECHO = ['trecho', 'snippet', 'encontrado', 'encontramos', 'contato', 'contato_encontrado', 'trecho_encontrado']
const LIMITE_TRECHO = 60
export const trechoContatoDe = (x) => {
  for (const fonte of [x?.dados, x]) {
    for (const campo of CAMPOS_TRECHO) {
      const bruto = Array.isArray(fonte?.[campo]) ? fonte[campo][0] : fonte?.[campo]
      if (typeof bruto === 'string' && bruto.trim()) {
        const t = bruto.trim().replace(/\s+/g, ' ')
        return t.length > LIMITE_TRECHO ? `${t.slice(0, LIMITE_TRECHO).trimEnd()}…` : t
      }
    }
  }
  return null
}

const N = ({ children }) => <Text style={estilos.negrito}>{children}</Text>

export default function FolhaContatoNoTexto({ visivel, trecho, onFechar }) {
  const insets = useSafeAreaInsets()
  const { gesto, estiloArraste, medirFolha } = useArrastarParaFechar(onFechar, !!visivel)
  if (!visivel) return null
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <RaizGestosFolha>
      <View style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.sheet, { paddingBottom: insets.bottom + 20 }, estiloArraste]} onLayout={medirFolha}>
          <ZonaArraste gesto={gesto} style={{ alignSelf: 'stretch' }}>
            <View style={estilos.alca} />
            <LinhaCabecalhoFolha onFechar={onFechar}>
              <Text style={estilos.titulo}>📵 Tire o contato do texto</Text>
            </LinhaCabecalhoFolha>
            <Text style={estilos.corpo}>Por segurança, o pedido <N>não pode ter telefone, e-mail ou redes sociais</N>.</Text>
            <Text style={estilos.corpo}>Para tirar dúvidas, os profissionais <N>fazem perguntas no seu pedido</N>, você recebe a notificação e responde por aqui mesmo. Assim, você e o profissional ficam <N>protegidos pelo ProTudo</N>.</Text>
            {!!trecho && <Text style={estilos.encontramos}>Encontramos: "{trecho}"</Text>}
          </ZonaArraste>
          <TouchableOpacity style={estilos.cta} onPress={onFechar} activeOpacity={0.85} accessibilityRole="button">
            <Text style={estilos.ctaTexto} maxFontSizeMultiplier={1.4}>Entendi, vou corrigir</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      </RaizGestosFolha>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: espacos.tela, paddingTop: 12, alignItems: 'center', ...larguraMaxima },
  alca:        { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 18 },
  titulo:      { fontSize: 20, fontWeight: '800', color: cores.textoForte, letterSpacing: -0.3, marginBottom: 10 },
  corpo:       { fontSize: 14, color: cores.textoMedio, lineHeight: 21, marginBottom: 14 },
  negrito:     { fontWeight: '700', color: cores.textoForte },
  encontramos: { fontSize: 13, color: cores.perigo, lineHeight: 19, marginBottom: 14 },
  cta:         { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginTop: 4 },
  ctaTexto:    { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
})
