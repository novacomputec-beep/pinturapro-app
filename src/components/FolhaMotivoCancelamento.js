import React, { useState, useEffect } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, Animated, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import useArrastarParaFechar, { ZonaArraste, RaizGestosFolha } from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'

// Arte "Por que vai cancelar?": folha aberta quando o DONO cancela um pedido JÁ PUBLICADO
// (o "🗑️ Cancelar pedido" do detalhe e a lixeira de Meus pedidos). Um motivo é obrigatório:
// "Cancelar pedido" (vermelho) só habilita com um marcado, e o valor vai como
// motivo_cancelamento na exclusão (utils/excluirPedido). "Voltar", ✕, toque fora e arrastar
// só fecham. Mesmo molde visual da FolhaDicaFoto. A escolha zera a cada abertura.
export const MOTIVOS_CANCELAMENTO = [
  { valor: 'ja_resolvi',        rotulo: '✅ Já resolvi' },
  { valor: 'ninguem_respondeu', rotulo: '⏳ Ninguém respondeu a tempo' },
  { valor: 'cadastrei_errado',  rotulo: '✏️ Cadastrei errado' },
  { valor: 'desisti',           rotulo: '🙅 Desisti do serviço' },
]

// Texto da confirmação de cancelar (components/CancelarPedido) e, com n > 0, o aviso desta folha.
export const textoConfirmacaoCancelar = (n) =>
  n > 0
    ? `Ele já foi publicado e ${n} ${n === 1 ? 'profissional se interessou' : 'profissionais se interessaram'}. Ao cancelar, o pedido sai do app e eles são avisados.`
    : 'Ao cancelar, o pedido sai do app.'

// `interessados`: com ao menos um, o aviso acima aparece sobre as opções; 0 não mostra nada.
export default function FolhaMotivoCancelamento({ visivel, enviando, interessados = 0, onConfirmar, onFechar }) {
  const nInteressados = Number(interessados) || 0
  const insets = useSafeAreaInsets()
  const [motivo, setMotivo] = useState(null)
  useEffect(() => { if (visivel) setMotivo(null) }, [visivel])
  // Durante o envio nada fecha a folha: o desfecho (sucesso ou erro) é de quem chamou.
  const fechar = () => { if (!enviando) onFechar?.() }
  const { gesto, estiloArraste, medirFolha } = useArrastarParaFechar(fechar, !!visivel)
  if (!visivel) return null
  const travado = !motivo || !!enviando
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={fechar}>
      <RaizGestosFolha>
      <View style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.sheet, { paddingBottom: insets.bottom + 20 }, estiloArraste]} onLayout={medirFolha}>
          <ZonaArraste gesto={gesto} style={{ alignSelf: 'stretch' }}>
            <View style={estilos.alca} />
            <LinhaCabecalhoFolha onFechar={fechar}>
              <Text style={estilos.titulo}>Por que vai cancelar?</Text>
            </LinhaCabecalhoFolha>
          </ZonaArraste>
          {nInteressados > 0 ? <Text style={estilos.aviso}>{textoConfirmacaoCancelar(nInteressados)}</Text> : null}
          {MOTIVOS_CANCELAMENTO.map((m) => {
            const marcado = motivo === m.valor
            return (
              <TouchableOpacity
                key={m.valor}
                style={[estilos.opcao, marcado && estilos.opcaoMarcada]}
                onPress={() => setMotivo(m.valor)}
                disabled={!!enviando}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ selected: marcado }}
              >
                <Text style={estilos.opcaoTexto} maxFontSizeMultiplier={1.4}>{m.rotulo}</Text>
                <View style={[estilos.bolinha, marcado && estilos.bolinhaMarcada]}>
                  {marcado ? <View style={estilos.miolo} /> : null}
                </View>
              </TouchableOpacity>
            )
          })}
          <TouchableOpacity
            style={[estilos.cancelar, travado && estilos.apagado]}
            onPress={() => onConfirmar?.(motivo)}
            disabled={travado}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: travado }}
          >
            {enviando
              ? <ActivityIndicator size="small" color="#0A0A0A" />
              : <Text style={estilos.cancelarTexto} maxFontSizeMultiplier={1.4}>Cancelar pedido</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={estilos.secundario} onPress={fechar} disabled={!!enviando} activeOpacity={0.85} accessibilityRole="button">
            <Text style={estilos.secundarioTexto} maxFontSizeMultiplier={1.4}>Voltar</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      </RaizGestosFolha>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: espacos.tela, paddingTop: 12, alignItems: 'center', ...larguraMaxima },
  alca:            { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 18 },
  titulo:          { fontSize: 20, fontWeight: '800', color: cores.textoForte, textAlign: 'center', letterSpacing: -0.3, marginBottom: 14 },
  aviso:           { alignSelf: 'stretch', fontSize: 14, color: cores.textoMedio, lineHeight: 20, textAlign: 'center', marginBottom: 14 },
  opcao:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cores.fundoElevado, borderWidth: 1.5, borderColor: cores.borda, borderRadius: raios.grande, paddingVertical: 14, paddingHorizontal: 16, width: '100%', marginBottom: 8 },
  opcaoMarcada:    { borderColor: cores.primaria },
  opcaoTexto:      { flex: 1, color: cores.textoForte, fontSize: 15, fontWeight: '600', marginRight: 10 },
  bolinha:         { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: cores.bordaCampo, alignItems: 'center', justifyContent: 'center' },
  bolinhaMarcada:  { borderColor: cores.primaria },
  miolo:           { width: 10, height: 10, borderRadius: 5, backgroundColor: cores.primaria },
  cancelar:        { backgroundColor: cores.perigo, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: 54, marginTop: 10, marginBottom: 10 },
  apagado:         { opacity: 0.4 },
  cancelarTexto:   { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  secundario:      { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.grande, paddingVertical: 15, paddingHorizontal: 28, width: '100%', alignItems: 'center' },
  secundarioTexto: { color: cores.textoForte, fontSize: 15, fontWeight: '600' },
})
