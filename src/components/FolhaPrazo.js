import React from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import useArrastarParaFechar, { ZonaArraste, RaizGestosFolha } from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'

// As duas folhas do prazo curto (arte prazo-curto-previa-v2), no cadastro de serviço e de obra.
// Mesmo molde das folhas "Isto parece um anúncio" e "Tire o contato do texto".
//
//   FolhaPedidoUrgente  — ao ESCOLHER um prazo de 4 horas ou menos (não o "Hoje"): confirma se
//                         a pressa é real. "Sim" mantém; "Posso dar mais tempo" limpa a escolha.
//   FolhaConfiraPrazo   — 409 PRAZO_INCOERENTE no publicar (pinturapro-api 2a57324,
//                         utils/prazoIncoerente): o texto fala num tempo futuro ("sábado", "dia
//                         12") e o prazo escolhido é curto. Nada foi gravado. "Ajustar o prazo"
//                         volta às opções; "Manter" reenvia com confirmar_prazo: true.
//
// Contrato do 409: { erro, codigo: 'PRAZO_INCOERENTE', prazo_incoerente: true, trecho,
// prazo_rotulo, prazo_horas } — só para quem manda suporta_prazo_check: true.
export const PRAZO_CURTO_HORAS = 4
export const ehPrazoCurto = (horas) => Number.isFinite(Number(horas)) && Number(horas) > 0 && Number(horas) <= PRAZO_CURTO_HORAS
export const rotuloHoras = (horas) => `${horas} ${Number(horas) === 1 ? 'hora' : 'horas'}`

export const ehPrazoIncoerente = (x) => x?.codigo === 'PRAZO_INCOERENTE' || x?.dados?.codigo === 'PRAZO_INCOERENTE'
const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
// { trecho, rotulo } da recusa; o rótulo cai nas horas do corpo e, por último, no que a tela sabe.
export const dadosPrazoIncoerente = (x, rotuloLocal) => {
  const d = x?.dados || x || {}
  const horas = Number(d.prazo_horas)
  return {
    trecho: texto(d.trecho),
    rotulo: texto(d.prazo_rotulo) || (horas > 0 ? rotuloHoras(horas) : null) || rotuloLocal || 'poucas horas',
  }
}

const N = ({ children }) => <Text style={estilos.negrito}>{children}</Text>

// Base das duas: título, corpo, botão laranja e botão secundário. Fechar (✕, toque fora, voltar,
// arrastar) chama onFechar.
function FolhaBase({ visivel, titulo, children, rotuloPrimario, onPrimario, rotuloSecundario, onSecundario, onFechar }) {
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
              <Text style={estilos.titulo}>{titulo}</Text>
            </LinhaCabecalhoFolha>
            {children}
          </ZonaArraste>
          <TouchableOpacity style={estilos.cta} onPress={onPrimario} activeOpacity={0.85} accessibilityRole="button">
            <Text style={estilos.ctaTexto} maxFontSizeMultiplier={1.4}>{rotuloPrimario}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.secundario} onPress={onSecundario} activeOpacity={0.85} accessibilityRole="button">
            <Text style={estilos.secundarioTexto} maxFontSizeMultiplier={1.4}>{rotuloSecundario}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      </RaizGestosFolha>
    </Modal>
  )
}

// prazo: o rótulo do prazo escolhido ("2 horas"). Fechar sem escolher mantém o prazo (onManter).
export function FolhaPedidoUrgente({ visivel, prazo, onManter, onMaisTempo }) {
  return (
    <FolhaBase
      visivel={visivel}
      titulo="⚡ Pedido urgente"
      rotuloPrimario="Sim, preciso nesse prazo" onPrimario={onManter}
      rotuloSecundario="Posso dar mais tempo" onSecundario={onMaisTempo}
      onFechar={onManter}
    >
      <Text style={estilos.corpo}>Pedidos urgentes mobilizam todos os profissionais sérios da sua região, que param o que estão fazendo para te atender.</Text>
      <Text style={[estilos.corpo, { marginBottom: 20 }]}>Você terá <N>{prazo}</N> para escolher um deles. É realmente necessário esse prazo?</Text>
    </FolhaBase>
  )
}

// trecho / rotulo: de dadosPrazoIncoerente. Fechar sem escolher deixa o formulário como está.
export function FolhaConfiraPrazo({ visivel, trecho, rotulo, onAjustar, onManter, onFechar }) {
  return (
    <FolhaBase
      visivel={visivel}
      titulo="📅 Confira o prazo"
      rotuloPrimario="Ajustar o prazo" onPrimario={onAjustar}
      rotuloSecundario={`Manter ${rotulo}`} onSecundario={onManter}
      onFechar={onFechar}
    >
      <Text style={estilos.corpo}>
        {trecho ? <>Você escreveu <N>"{trecho}"</N>, mas escolheu o prazo de <N>{rotulo}</N>.</> : <>Você escolheu o prazo de <N>{rotulo}</N>.</>}
      </Text>
      <Text style={[estilos.corpo, { marginBottom: 20 }]}>Com mais tempo, mais profissionais conseguem ver e mandar proposta.</Text>
    </FolhaBase>
  )
}

const estilos = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: espacos.tela, paddingTop: 12, alignItems: 'center', ...larguraMaxima },
  alca:            { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 18 },
  titulo:          { fontSize: 20, fontWeight: '800', color: cores.textoForte, letterSpacing: -0.3, marginBottom: 10 },
  corpo:           { fontSize: 14, color: cores.textoMedio, lineHeight: 21, marginBottom: 14 },
  negrito:         { fontWeight: '700', color: cores.textoForte },
  cta:             { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 10 },
  ctaTexto:        { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  secundario:      { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.grande, paddingVertical: 15, paddingHorizontal: 28, width: '100%', alignItems: 'center' },
  secundarioTexto: { color: cores.textoForte, fontSize: 15, fontWeight: '600' },
})
