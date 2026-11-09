import React, { useState } from 'react'
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, ScrollView, Platform } from 'react-native'
import { cores, raios, espacos } from '../utils/tema'

// Exclusão definitiva da conta (Arte-Excluir-Conta). Card central com moldura de perigo
// (vermelho), no molde do ModalSuporte (backdrop escurecido + KeyboardAvoidingView).
//
// A confirmação é por PALAVRA, não por senha: a pessoa digita EXCLUIR (maiúsculas ou
// minúsculas, espaços nas pontas ignorados) e só então o botão vermelho liga. Conta de login
// social não tem senha que a pessoa conheça, e quem está logado já provou a identidade.
// A exclusão é da PESSOA — todos os perfis (contratar e trabalhar) saem juntos; por isso o
// texto lista o que some. Contrato: DELETE /conta/excluir com { confirmacao: "EXCLUIR" }
// (pinturapro-api 268f192).
//
// O parent fornece onConfirmar(): faz a chamada e o logout. Se falhar, lança um erro com
// .mensagem (ou .message) — o modal mostra a mensagem e continua aberto para nova tentativa.

export const PALAVRA_CONFIRMACAO = 'EXCLUIR'
export const confirmacaoValida = (texto) =>
  typeof texto === 'string' && texto.trim().toUpperCase() === PALAVRA_CONFIRMACAO

const O_QUE_APAGA = [
  'Seus perfis de contratar e de trabalhar',
  'Pedidos, propostas e conversas',
  'Avaliações e histórico',
]

// Miolo do modal (o card), exportado para a Galeria. `textoInicial`, `excluindoInicial` e
// `erroInicial` só servem à Galeria, para abrir já num estado.
export function ExcluirContaConteudo({ onConfirmar, onFechar, textoInicial = '', excluindoInicial = false, erroInicial = '' }) {
  const [texto, setTexto] = useState(textoInicial)
  const [excluindo, setExcluindo] = useState(excluindoInicial)
  const [erro, setErro] = useState(erroInicial)
  const pode = confirmacaoValida(texto) && !excluindo

  const confirmar = async () => {
    if (!pode) return
    setErro('')
    setExcluindo(true)
    try {
      await onConfirmar()
      // Em caso de sucesso o parent faz logout e esta árvore é desmontada.
    } catch (err) {
      setErro(err?.mensagem || err?.message || 'Não foi possível excluir a conta. Tente novamente.')
      setExcluindo(false)
    }
  }

  return (
    <View style={estilos.card}>
      <Text style={estilos.titulo}>Excluir conta</Text>
      <Text style={estilos.subtitulo}>Isto apaga tudo e não pode ser desfeito:</Text>
      <View style={estilos.lista}>
        {O_QUE_APAGA.map((linha) => (
          <View key={linha} style={estilos.item}>
            <Text style={estilos.itemIcone}>❌</Text>
            <Text style={estilos.itemTexto}>{linha}</Text>
          </View>
        ))}
      </View>

      <Text style={estilos.instrucao}>Para confirmar, digite <Text style={estilos.palavra}>{PALAVRA_CONFIRMACAO}</Text>:</Text>
      <TextInput
        style={[estilos.input, !!erro && estilos.inputErro]}
        placeholder={PALAVRA_CONFIRMACAO}
        placeholderTextColor={cores.placeholderCampo}
        value={texto}
        onChangeText={(t) => { setTexto(t); if (erro) setErro('') }}
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        editable={!excluindo}
        returnKeyType="done"
        accessibilityLabel={`Para confirmar, digite ${PALAVRA_CONFIRMACAO}`}
      />

      {erro ? <Text style={estilos.erroTexto}>{erro}</Text> : null}

      <TouchableOpacity
        style={[estilos.cta, !pode && estilos.ctaDesabilitado]}
        onPress={confirmar}
        disabled={!pode}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ disabled: !pode }}
      >
        <Text style={estilos.ctaTexto}>{excluindo ? 'Excluindo...' : 'Excluir minha conta para sempre'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={estilos.cancelar} onPress={onFechar} disabled={excluindo} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
        <Text style={estilos.cancelarTexto}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function ModalExcluirConta({ visivel, onConfirmar, onFechar }) {
  return (
    <Modal visible={visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={onFechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={estilos.backdrop}>
        {/* ScrollView: com o teclado aberto o card (lista + campo + botão) passa da área livre
            numa tela pequena; assim o botão continua alcançável. */}
        <ScrollView style={estilos.rolagem} contentContainerStyle={estilos.rolagemConteudo} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* key: reabrir zera o texto digitado, o erro e o "Excluindo...". */}
          <ExcluirContaConteudo key={visivel ? 'aberto' : 'fechado'} onConfirmar={onConfirmar} onFechar={onFechar} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  rolagem:         { flex: 1 },
  rolagemConteudo: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:            { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.perigo, padding: 28 },
  titulo:          { fontSize: 22, fontWeight: '800', color: cores.perigo, textAlign: 'center', marginBottom: 12, letterSpacing: -0.3 },
  subtitulo:       { fontSize: 14, color: cores.textoForte, fontWeight: '600', lineHeight: 21, marginBottom: 10 },
  lista:           { marginBottom: 18 },
  item:            { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  itemIcone:       { fontSize: 13, lineHeight: 21, marginRight: 8 },
  itemTexto:       { flex: 1, fontSize: 14, color: cores.textoMedio, lineHeight: 21 },
  instrucao:       { fontSize: 13, color: cores.textoForte, marginBottom: 8 },
  palavra:         { color: cores.perigo, fontWeight: '800' },
  input:           { backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: raios.medio, paddingHorizontal: espacos.lg, paddingVertical: 13, fontSize: 15, fontWeight: '700', letterSpacing: 1, color: cores.textoForte },
  inputErro:       { borderColor: cores.perigo },
  erroTexto:       { color: cores.perigo, fontSize: 12, marginTop: 6 },
  cta:             { backgroundColor: cores.perigo, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 16, width: '100%', alignItems: 'center', marginTop: 20, marginBottom: 12 },
  ctaDesabilitado: { opacity: 0.4 },
  ctaTexto:        { color: cores.branco, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  cancelar:        { paddingVertical: 8, alignItems: 'center' },
  cancelarTexto:   { color: cores.textoFraco, fontSize: 13 },
})
