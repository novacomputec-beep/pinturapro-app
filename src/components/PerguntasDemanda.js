import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Modal, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Pergunta única do profissional sobre uma demanda, e a resposta única do dono. Um
// componente só para DetalheReparo e DetalheObra não divergirem (a mesma razão de
// components/Agendamento existir). Aparece SÓ nos detalhes, nunca nos feeds, e só antes
// do match — depois dele a conversa é entre os dois do combinado, não pública.
//
// Formato de cada pergunta (GET /reparos/:id e /obras/:id, campo `perguntas`):
//   { id, pergunta, resposta, criado_em, respondido_em, minha }
// Sem nomes de autor, de propósito: a pergunta é pública para todos os profissionais e
// o que importa é a dúvida, não quem a teve.

const LIMITE_PERGUNTA = 200
const LIMITE_RESPOSTA = 300
const AMBAR = '#FFC107'

const respondida = (p) => !!(p?.resposta && String(p.resposta).trim())

// ── Lado do PROFISSIONAL ─────────────────────────────────────────────────────────────────

// Lista das perguntas já feitas (de qualquer profissional) com a resposta embaixo. Sem
// perguntas, não renderiza nada: o botão de perguntar é quem convida.
export const CardPerguntasProfissional = ({ perguntas }) => {
  const lista = perguntas || []
  if (lista.length === 0) return null
  return (
    <View style={estilos.card}>
      <Text style={estilos.cardTitulo}>❓ Perguntas sobre o pedido ({lista.length})</Text>
      {lista.map((p, i) => (
        <View key={p.id ?? i} style={[estilos.item, i === lista.length - 1 && { marginBottom: 0 }]}>
          <Text style={estilos.pergunta}>{p.pergunta}</Text>
          {respondida(p) ? (
            <View style={estilos.respostaBox}>
              <Text style={estilos.resposta}>{p.resposta}</Text>
            </View>
          ) : (
            <View style={estilos.aguardandoBox}>
              <Text style={estilos.aguardando}>⏳ Aguardando resposta do cliente</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  )
}

// Botão tracejado azul, logo acima de "Tenho interesse". A tela decide quando mostrá-lo
// (some com a própria pergunta já feita e depois do match).
export const BotaoPerguntar = ({ onPress }) => (
  <TouchableOpacity style={estilos.btnPerguntar} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
    <Text style={estilos.btnPerguntarTexto}>❓ Perguntar ao cliente</Text>
  </TouchableOpacity>
)

// Modal da pergunta. Guarda o próprio texto: ao fechar (enviada ou cancelada) ele zera,
// para a próxima abertura — noutra demanda — não herdar nada.
export const ModalPerguntar = ({ visivel, enviando, onFechar, onEnviar }) => {
  const [texto, setTexto] = useState('')
  const fechar = () => { if (enviando) return; setTexto(''); onFechar() }
  const enviar = async () => {
    const t = texto.trim()
    if (!t || enviando) return
    const ok = await onEnviar(t)
    if (ok) setTexto('')
  }
  const vazio = !texto.trim()
  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={fechar}>
      <View style={estilos.modalFundo}>
        <View style={estilos.modalCard}>
          <Text style={estilos.modalTitulo}>❓ Sua pergunta ao cliente</Text>
          <Text style={estilos.modalExplicacao}>
            Você pode fazer uma única pergunta neste pedido. Ela fica visível para todos os profissionais. Telefones e links são removidos.
          </Text>
          <TextInput
            style={estilos.modalInput}
            value={texto}
            onChangeText={(v) => setTexto(v.slice(0, LIMITE_PERGUNTA))}
            placeholder="Ex: O material já está comprado?"
            placeholderTextColor={cores.placeholderCampo}
            multiline
            maxLength={LIMITE_PERGUNTA}
            editable={!enviando}
            autoFocus
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
          />
          <Text style={estilos.contador}>{texto.length}/{LIMITE_PERGUNTA}</Text>
          <View style={estilos.modalBotoes}>
            <TouchableOpacity style={estilos.btnCancelar} onPress={fechar} disabled={enviando}>
              <Text style={estilos.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[estilos.btnEnviar, (enviando || vazio) && { opacity: 0.6 }]} onPress={enviar} disabled={enviando || vazio}>
              <Text style={estilos.btnEnviarTexto}>{enviando ? 'Enviando...' : 'Enviar pergunta'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ── Lado do DONO ─────────────────────────────────────────────────────────────────────────

// Uma pergunta sem resposta, com o campo e o botão. Estado do texto por item (cada
// pergunta tem o seu), e o item some da lista quando a resposta chega pela recarga.
const ItemResponder = ({ pergunta, respondendo, onResponder }) => {
  const [texto, setTexto] = useState('')
  const vazio = !texto.trim()
  return (
    <View style={estilos.novaItem}>
      <Text style={estilos.pergunta}>{pergunta.pergunta}</Text>
      <TextInput
        style={estilos.respostaInput}
        value={texto}
        onChangeText={(v) => setTexto(v.slice(0, LIMITE_RESPOSTA))}
        placeholder="Sua resposta..."
        placeholderTextColor={cores.placeholderCampo}
        multiline
        maxLength={LIMITE_RESPOSTA}
        editable={!respondendo}
        autoComplete="off"
        importantForAutofill="no"
        textContentType="none"
      />
      <Text style={estilos.contador}>{texto.length}/{LIMITE_RESPOSTA} · resposta única, visível a todos</Text>
      <TouchableOpacity
        style={[estilos.btnResponder, (respondendo || vazio) && { opacity: 0.6 }]}
        onPress={() => { if (!vazio && !respondendo) onResponder(pergunta.id, texto.trim()) }}
        disabled={respondendo || vazio}
      >
        <Text style={estilos.btnResponderTexto}>{respondendo ? 'Enviando...' : 'Responder'}</Text>
      </TouchableOpacity>
    </View>
  )
}

// Perguntas do dono: as sem resposta no card azul (uma por vez com o próprio campo), as
// já respondidas embaixo, só leitura. Sem perguntas, não renderiza nada.
//   respondendoId: id da pergunta cuja resposta está a caminho (desabilita só aquela).
export const CardPerguntasDono = ({ perguntas, respondendoId, onResponder }) => {
  const lista = perguntas || []
  if (lista.length === 0) return null
  const novas = lista.filter(p => !respondida(p))
  const feitas = lista.filter(respondida)
  return (
    <View style={{ marginBottom: 16 }}>
      {novas.length > 0 && (
        <View style={estilos.cardNova}>
          <Text style={estilos.cardNovaTitulo}>❓ Pergunta nova · responda para atrair propostas</Text>
          {novas.map((p, i) => (
            <ItemResponder
              key={p.id ?? i}
              pergunta={p}
              respondendo={respondendoId != null && String(respondendoId) === String(p.id)}
              onResponder={onResponder}
            />
          ))}
        </View>
      )}
      {feitas.length > 0 && (
        <View style={estilos.card}>
          <Text style={estilos.cardTitulo}>Já respondidas ({feitas.length})</Text>
          {feitas.map((p, i) => (
            <View key={p.id ?? i} style={[estilos.item, i === feitas.length - 1 && { marginBottom: 0 }]}>
              <Text style={estilos.pergunta}>{p.pergunta}</Text>
              <View style={estilos.respostaBox}>
                <Text style={estilos.resposta}>{p.resposta}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  // Card neutro (lista do profissional / já respondidas do dono): mesmo molde dos demais
  // cards de detalhe — fundo de card, borda fina, raio médio.
  card:        { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, marginBottom: 16 },
  cardTitulo:  { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  item:        { marginBottom: 14 },
  pergunta:    { fontSize: 14, fontWeight: '600', color: cores.textoForte, lineHeight: 20, marginBottom: 8 },
  // Resposta com barra verde à esquerda; aguardando com barra âmbar. Mesmo molde da
  // recusadoLinha dos detalhes (barra de 2-3px no lugar de um badge).
  respostaBox:   { borderLeftWidth: 3, borderLeftColor: cores.sucesso, paddingLeft: 10, paddingVertical: 2 },
  resposta:      { fontSize: 13, color: cores.textoMedio, lineHeight: 20 },
  aguardandoBox: { borderLeftWidth: 3, borderLeftColor: AMBAR, paddingLeft: 10, paddingVertical: 2 },
  aguardando:    { fontSize: 12, color: AMBAR, fontWeight: '600' },
  // Botão tracejado azul: o mesmo contorno tracejado do uploadBtn de PainelMidiaDemanda,
  // na cor de informação (azul), para não disputar com o laranja do "Tenho interesse".
  btnPerguntar:      { borderWidth: 1.5, borderColor: cores.info, borderStyle: 'dashed', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 12 },
  btnPerguntarTexto: { fontSize: 14, fontWeight: '700', color: cores.info },
  // Modal: mesmo molde dos modais inline dos detalhes (ponto de referência, minutos).
  modalFundo:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  modalCard:       { backgroundColor: cores.fundoCard, borderRadius: 16, padding: 24, width: '100%' },
  modalTitulo:     { fontSize: 16, fontWeight: '700', color: cores.textoForte, marginBottom: 8 },
  modalExplicacao: { fontSize: 13, color: cores.textoFraco, lineHeight: 19, marginBottom: 16 },
  modalInput:      { backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: 10, padding: 14, fontSize: 14, color: cores.textoForte, minHeight: 90, textAlignVertical: 'top' },
  contador:        { fontSize: 11, color: cores.textoFraco, textAlign: 'right', marginTop: 6, marginBottom: 12 },
  modalBotoes:     { flexDirection: 'row', gap: 10 },
  btnCancelar:      { flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnCancelarTexto: { color: cores.textoFraco, fontWeight: '600' },
  btnEnviar:        { flex: 1, backgroundColor: cores.primaria, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnEnviarTexto:   { color: '#0A0A0A', fontWeight: '700' },
  // Card azul do dono: borda na cor de informação, fundo levemente tintado (mesmo
  // artifício do categoriaPill: cor + alpha em hex).
  cardNova:       { backgroundColor: cores.info + '14', borderWidth: 1.5, borderColor: cores.info, borderRadius: raios.medio, padding: 14, marginBottom: 12 },
  cardNovaTitulo: { fontSize: 11, fontWeight: '700', color: cores.info, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  novaItem:       { marginBottom: 8 },
  respostaInput:  { backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: 10, padding: 12, fontSize: 14, color: cores.textoForte, minHeight: 72, textAlignVertical: 'top' },
  btnResponder:      { backgroundColor: cores.sucesso, borderRadius: 10, padding: 12, alignItems: 'center' },
  btnResponderTexto: { color: '#0A0A0A', fontWeight: '700', fontSize: 14 },
})
