import React from 'react'
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import useArrastarParaFechar from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'

// Desfazer a escolha do profissional (Arte-Desfazer-Escolha), dono de reparo e de obra, na
// fase "aguardando horário" depois de desfazer_liberado_em (GET /:tabela/:id). A caixa e a
// nota moram na tela fixa (components/PosMatchFixo, EstadoAguardando); aqui ficam a folha de
// confirmação e as mensagens dos erros de POST /:tabela/dono/:id/desfazer-match
// (services/desfazerEscolhaService da API).
//
// O que o servidor faz no POST (e a folha explica): o profissional sai e leva 1 falta (3 em
// 90 dias suspendem); o pedido volta a ficar aberto com o prazo que restava (piso de 1h) e os
// outros interessados continuam valendo; todos são avisados, sem escolhido ainda.

const DIA_MS = 86400000

// 409 por `codigo` → texto do alerta. A mensagem do servidor vem primeiro (é a mais exata);
// o mapa cobre a resposta sem `erro` e diz, para cada código, o que a pessoa pode fazer.
const MENSAGENS_DESFAZER = {
  AGUARDE: 'Dê um tempo ao profissional: ainda não chegou a hora de desfazer a escolha. A tela mostra a partir de quando.',
  HORARIO_EM_NEGOCIACAO: 'O profissional já propôs ou combinou um horário. Para sair do atendimento, use "Trocar profissional ou cancelar".',
  A_CAMINHO: 'O profissional já está a caminho ou chegou: não dá mais para desfazer a escolha.',
  SEM_MATCH: 'Não há profissional escolhido para desfazer.',
  DEMANDA_FECHADA: 'Este pedido não está mais em andamento.',
  ESTADO_MUDOU: 'O atendimento mudou. Atualize a tela.',
}
export const mensagemErroDesfazer = (err, padrao = 'Não foi possível desfazer a escolha.') =>
  MENSAGENS_DESFAZER[err?.codigo] || err?.mensagem || padrao

// Falta menos de 24h para o prazo do pedido: a folha sugere aumentar o tempo, e a tela
// oferece o fluxo de estender depois do POST.
export const prazoCurtoParaDesfazer = (expiraEm, agoraMs = Date.now()) => {
  if (!expiraEm) return false
  const ms = new Date(expiraEm).getTime() - agoraMs
  return Number.isFinite(ms) && ms < DIA_MS
}

const Linha = ({ icone, children }) => (
  <View style={estilos.linha}>
    <Text style={estilos.linhaIcone}>{icone}</Text>
    <Text style={estilos.linhaTexto}>{children}</Text>
  </View>
)

// visivel/enviando: a folha abre no toque; `enviando` trava os dois botões. nome: o
// primeiro nome do profissional. interessados: quantos OUTROS seguem valendo (0 = sem número).
// prazoCurto: menos de 24h para o prazo (linha "aumentar o tempo").
// onDesfazer: o POST da tela. onFechar: "Esperar mais um pouco", o toque fora, o voltar do
// Android e o arraste para baixo na alça/título (useArrastarParaFechar) — todos travados
// enquanto `enviando`.
export function SheetDesfazerEscolha({ visivel, nome, interessados, prazoCurto, enviando, onFechar, onDesfazer }) {
  const insets = useSafeAreaInsets()
  const fechar = () => { if (!enviando) onFechar?.() }
  const { panHandlers, estiloArraste } = useArrastarParaFechar(enviando ? null : fechar, !!visivel)
  const n = Number(interessados) || 0
  const quem = nome || 'o profissional'
  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={fechar}>
      <View style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.sheet, { paddingBottom: insets.bottom + 20 }, estiloArraste]}>
          {/* Alça + título fora do ScrollView: é a zona do arraste; a lista rola como antes. */}
          <View {...panHandlers}>
            <View style={estilos.alca} />
            <LinhaCabecalhoFolha onFechar={fechar} desabilitado={!!enviando}>
              <Text style={estilos.titulo}>Desfazer a escolha de {quem}?</Text>
            </LinhaCabecalhoFolha>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Linha icone="🚫">{quem.charAt(0).toUpperCase() + quem.slice(1)} sai do pedido e recebe <Text style={estilos.forte}>1 falta</Text> (3 em 90 dias suspendem a conta).</Linha>
            <Linha icone="🔓">O pedido volta a ficar aberto{n > 0 ? ` e os outros ${n} ${n === 1 ? 'interessado continua' : 'interessados continuam'} valendo` : ' e os outros interessados continuam valendo'}.</Linha>
            <Linha icone="🔔">Os interessados são avisados. Ainda não há escolhido: você escolhe de novo quando quiser.</Linha>
            {prazoCurto ? (
              <View style={estilos.caixaAmbar}>
                <Text style={estilos.caixaAmbarTexto}>⏳ Falta menos de 1 dia para o prazo do pedido. Depois de desfazer, vale <Text style={estilos.forte}>aumentar o tempo</Text> para receber mais propostas.</Text>
              </View>
            ) : null}

            <TouchableOpacity style={[estilos.btnVermelho, enviando && { opacity: 0.5 }]} onPress={onDesfazer} disabled={!!enviando} activeOpacity={0.85} accessibilityRole="button">
              <Text style={estilos.btnVermelhoTexto}>{enviando ? 'Desfazendo…' : 'Desfazer e escolher outro'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[estilos.btnNeutro, enviando && { opacity: 0.5 }]} onPress={fechar} disabled={!!enviando} activeOpacity={0.85} accessibilityRole="button">
              <Text style={estilos.btnNeutroTexto}>Esperar mais um pouco</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  // Folha: o mesmo molde da SheetCancelamento (borda vermelha no topo).
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 3, borderTopColor: cores.perigo, paddingHorizontal: espacos.tela, paddingTop: 12, maxHeight: '92%', ...larguraMaxima },
  alca:            { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 16 },
  titulo:          { fontSize: 20, fontWeight: '800', color: cores.textoForte, letterSpacing: -0.3, marginBottom: 14 },
  linha:           { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  linhaIcone:      { fontSize: 16, lineHeight: 20, width: 22, textAlign: 'center' },
  linhaTexto:      { flex: 1, fontSize: 13, color: cores.textoForte, lineHeight: 20 },
  forte:           { fontWeight: '700', color: cores.textoForte },
  caixaAmbar:      { backgroundColor: 'rgba(255,193,7,0.10)', borderWidth: 1, borderColor: 'rgba(255,193,7,0.45)', borderRadius: raios.medio, padding: 12, marginTop: 4, marginBottom: 6 },
  caixaAmbarTexto: { fontSize: 13, color: '#FFC107', lineHeight: 19 },
  btnVermelho:     { backgroundColor: cores.perigo, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginTop: 10, marginBottom: 10 },
  btnVermelhoTexto:{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  btnNeutro:       { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, alignItems: 'center' },
  btnNeutroTexto:  { fontSize: 14, fontWeight: '600', color: cores.textoFraco },
})
