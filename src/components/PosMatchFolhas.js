import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios } from '../utils/tema'

// Folhas de baixo e helpers do pós-match que as telas de detalhe usam ao lado da tela fixa
// (components/PosMatchFixo):
//   ModalDetalhesDemanda — descrição e fotos do pedido, sem sair da tela única;
//   ModalPedirAtraso     — "⏱ Quanto tempo a mais?" (pedido de atraso do profissional);
//   horaDe / camposAtrasoDe / mensagemErroAtraso — os helpers do pedido de atraso.
//
// Tolerância e pedido de atraso (atrasoChegadaService da API, GET /:id → camposAtraso):
//   prazo_chegada    — a extensão aceita ou o horário combinado (chegada_prevista_em/expira_em)
//   tolerancia_ate   — a extensão (já com tudo dentro) ou prazo + 15 min; depois dela o cron
//                      desfaz o match e o dono pode marcar que o profissional não chegou
//   atrasado         — prazo passado, chegada não declarada (relógio do servidor)
//   pedido_atraso    — { minutos 15|30|60, motivo, criado_em, status pendente|aceito|
//                      auto_aceito|recusado, respondido_em, responde_ate }; um por vez
//   pedidos_atraso_restantes — de 2 por match
// POST /:id/pedir-atraso { minutos, motivo } (profissional) e /pedir-atraso/responder
// { aceitar } (dono). Aceite = novo prazo para os dois; recusa = match desfeito, sem falta.

const p2 = (n) => String(n).padStart(2, '0')

// "HH:MM" de um instante (ISO ou ms); ilegível → null (o box/linha some).
export const horaDe = (iso) => {
  if (iso == null || iso === '') return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}

// Os mesmos da API: minutos aceitos num pedido e pedidos por match.
export const MINUTOS_ATRASO = [15, 30, 60]
export const MAX_PEDIDOS_ATRASO = 2

// Campos de atraso que pedir-atraso e responder devolvem junto com a mensagem: a tela
// mescla só eles na demanda, sem reler.
export const camposAtrasoDe = (resp) => {
  const o = {}
  if (!resp || typeof resp !== 'object') return o
  for (const k of ['prazo_chegada', 'tolerancia_ate', 'atrasado', 'pedido_atraso', 'pedidos_atraso_restantes']) {
    if (k in resp) o[k] = resp[k]
  }
  return o
}

// Códigos do pedido de atraso → texto do alerta. A mensagem do servidor vem primeiro (é a
// mais exata); o mapa cobre a resposta sem `erro` e dá nome ao que cada código significa.
const MENSAGENS_ATRASO = {
  MINUTOS_INVALIDOS: 'Informe os minutos: 15, 30 ou 60.',
  SEM_A_CAMINHO: 'Toque em "Estou a caminho" antes de pedir mais tempo.',
  CHEGADA_DECLARADA: 'A chegada já foi registrada.',
  PEDIDO_PENDENTE: 'Já existe um pedido aguardando a resposta do cliente.',
  LIMITE_PEDIDOS: `Você já usou os ${MAX_PEDIDOS_ATRASO} pedidos de mais tempo deste atendimento.`,
  DEMANDA_FECHADA: 'Este atendimento não está mais em aberto.',
  SEM_PEDIDO: 'Não há pedido de mais tempo aguardando resposta.',
  PEDIDO_ATRASO_PENDENTE: 'Há um pedido de mais tempo aguardando resposta. Responda a ele antes.',
}
export const mensagemErroAtraso = (err, padrao) => err?.mensagem || MENSAGENS_ATRASO[err?.codigo] || padrao

// Botão principal laranja. `carregando` troca o rótulo e trava.
const BotaoPrincipal = ({ rotulo, rotuloCarregando, onPress, desabilitado, carregando, estilo }) => (
  <TouchableOpacity
    style={[estilos.btnPrincipal, estilo, (desabilitado || carregando) && { opacity: 0.5 }]}
    onPress={onPress}
    disabled={desabilitado || carregando}
    activeOpacity={0.85}
    accessibilityRole="button"
  >
    <Text style={estilos.btnPrincipalTexto} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{carregando ? (rotuloCarregando || rotulo) : rotulo}</Text>
  </TouchableOpacity>
)

// ---------------------------------------------------------------------------------------
// Folha "⏱ Quanto tempo a mais?" — o pedido de atraso do profissional.
// ---------------------------------------------------------------------------------------
// onEnviar(minutos, motivo): a tela faz o POST /pedir-atraso e fecha a folha no sucesso;
// `enviando` trava os botões. Chips 15/30/60 (MINUTOS_ATRASO), motivo opcional até 200.
// O estado zera a cada abertura, para o segundo pedido não herdar o primeiro.
export function ModalPedirAtraso({ visivel, onFechar, onEnviar, enviando }) {
  const insets = useSafeAreaInsets()
  const [minutos, setMinutos] = useState(null)
  const [motivo, setMotivo] = useState('')
  useEffect(() => { if (visivel) { setMinutos(null); setMotivo('') } }, [visivel])
  const fechar = () => { if (!enviando) onFechar?.() }
  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={fechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={estilos.detalhesFundo}>
        <TouchableOpacity style={{ flex: 1 }} onPress={fechar} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={[estilos.detalhesCard, { paddingBottom: Math.max(28, insets.bottom + 20) }]}>
          <Text style={estilos.detalhesTitulo}>⏱ Quanto tempo a mais?</Text>
          <Text style={estilos.atrasoFolhaTexto}>O cliente recebe o pedido na hora e decide se aceita. Você pode pedir até {MAX_PEDIDOS_ATRASO} vezes neste serviço.</Text>
          <View style={estilos.chips}>
            {MINUTOS_ATRASO.map((m) => (
              <TouchableOpacity
                key={m}
                style={[estilos.chip, minutos === m && estilos.chipAtivo]}
                onPress={() => setMinutos(m)}
                disabled={!!enviando}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: minutos === m }}
              >
                <Text style={[estilos.chipTexto, minutos === m && estilos.chipTextoAtivo]}>+{m} min</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={estilos.detalhesSecao}>Motivo (opcional)</Text>
          <TextInput
            style={estilos.atrasoMotivo}
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Ex: trânsito parado na avenida"
            placeholderTextColor={cores.textoFraco}
            maxLength={200}
            editable={!enviando}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
          />
          <BotaoPrincipal
            rotulo="Avisar o cliente"
            rotuloCarregando="Avisando…"
            onPress={() => onEnviar?.(minutos, motivo.trim())}
            desabilitado={!minutos}
            carregando={!!enviando}
            estilo={{ marginTop: 14, marginBottom: 8 }}
          />
          <TouchableOpacity onPress={fechar} disabled={!!enviando} style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 }} accessibilityRole="button">
            <Text style={estilos.linkNeutro}>Agora não</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------
// Descrição e fotos do pedido, sem sair da tela única.
// ---------------------------------------------------------------------------------------
// children: a tira de mídia que a tela já monta (TileMidia). extras: os modais de tela cheia
// (foto/vídeo) da tela, montados AQUI DENTRO enquanto a folha está aberta — no iOS um segundo
// Modal irmão não é apresentado por cima de outro já visível; aninhado, é.
export function ModalDetalhesDemanda({ visivel, onFechar, titulo, descricao, children, extras }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.detalhesFundo}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onFechar} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={[estilos.detalhesCard, { paddingBottom: Math.max(28, insets.bottom + 20) }]}>
          <View style={estilos.detalhesCabecalho}>
            <Text style={estilos.detalhesTitulo} numberOfLines={2}>{titulo}</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <Text style={estilos.detalhesFechar}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {descricao ? (
              <>
                <Text style={estilos.detalhesSecao}>Descrição</Text>
                <Text style={estilos.detalhesTexto}>{descricao}</Text>
              </>
            ) : null}
            {children ? (
              <>
                <Text style={estilos.detalhesSecao}>Fotos e vídeos</Text>
                {children}
              </>
            ) : null}
            {!descricao && !children ? <Text style={estilos.detalhesTexto}>Este pedido não tem descrição nem fotos.</Text> : null}
          </ScrollView>
          {extras}
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  btnPrincipal: { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnPrincipalTexto: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },

  // Folha do pedido de atraso.
  atrasoFolhaTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 19, marginTop: 4, marginBottom: 12 },
  chips: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.fundoElevado, borderRadius: raios.pill, paddingVertical: 10, alignItems: 'center' },
  chipAtivo: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  chipTexto: { fontSize: 14, fontWeight: '700', color: cores.textoForte },
  chipTextoAtivo: { color: cores.primaria },
  atrasoMotivo: { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: cores.textoForte },
  linkNeutro: { fontSize: 13, fontWeight: '600', color: cores.textoMedio },

  // Folha de descrição e fotos.
  detalhesFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  detalhesCard: { backgroundColor: cores.fundoCard, borderTopLeftRadius: raios.grande, borderTopRightRadius: raios.grande, padding: 20, paddingBottom: 28 },
  detalhesCabecalho: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  detalhesTitulo: { flex: 1, fontSize: 16, fontWeight: '700', color: cores.textoForte, lineHeight: 22 },
  detalhesFechar: { fontSize: 18, fontWeight: '700', color: cores.textoFraco },
  detalhesSecao: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: cores.textoMedio, marginTop: 10, marginBottom: 6 },
  detalhesTexto: { fontSize: 14, color: cores.textoForte, lineHeight: 21 },
})
