import React, { useState, useEffect } from 'react'
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { cores, raios, espacos } from '../utils/tema'

// Modal de confirmação para exclusão definitiva da conta. Segue o padrão visual
// de ModalAvaliacao (backdrop escurecido + card central), mas com moldura de
// perigo (vermelho) por ser uma ação destrutiva e irreversível.
//
// O parent fornece onConfirmar(senha): faz a chamada DELETE /conta/excluir e o
// logout. Se falhar, deve lançar um erro com .mensagem (ou .message) — este
// modal exibe a mensagem inline para o usuário poder corrigir a senha e tentar
// de novo sem reabrir o modal.
export default function ModalExcluirConta({ visivel, onConfirmar, onFechar }) {
  const [senha, setSenha] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState('')

  // Zera o estado sempre que o modal é reaberto.
  useEffect(() => {
    if (visivel) { setSenha(''); setMostrar(false); setExcluindo(false); setErro('') }
  }, [visivel])

  const confirmar = async () => {
    if (excluindo) return
    if (!senha.trim()) { setErro('Informe sua senha para confirmar.'); return }
    setErro('')
    setExcluindo(true)
    try {
      await onConfirmar(senha)
      // Em caso de sucesso o parent faz logout e esta árvore é desmontada.
    } catch (err) {
      setErro(err?.mensagem || err?.message || 'Não foi possível excluir a conta. Tente novamente.')
      setExcluindo(false)
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          <Text style={estilos.titulo}>Excluir conta</Text>
          <Text style={estilos.subtitulo}>
            Esta ação é <Text style={estilos.destaque}>irreversível</Text>. Sua conta e todos os dados
            associados serão apagados permanentemente e não poderão ser recuperados.
          </Text>
          <Text style={estilos.instrucao}>Digite sua senha atual para confirmar:</Text>

          <View>
            <TextInput
              style={[estilos.input, erro && estilos.inputErro]}
              placeholder="••••••••"
              placeholderTextColor={cores.textoMutado}
              value={senha}
              onChangeText={(t) => { setSenha(t); if (erro) setErro('') }}
              secureTextEntry={!mostrar}
              autoCapitalize="none"
              editable={!excluindo}
            />
            <TouchableOpacity style={estilos.olhoBtn} onPress={() => setMostrar(!mostrar)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={estilos.olhoTexto}>{mostrar ? 'ocultar' : 'mostrar'}</Text>
            </TouchableOpacity>
          </View>

          {erro ? <Text style={estilos.erroTexto}>{erro}</Text> : null}

          <TouchableOpacity
            style={[estilos.cta, excluindo && estilos.ctaDesabilitado]}
            onPress={confirmar}
            disabled={excluindo}
            activeOpacity={0.85}
          >
            <Text style={estilos.ctaTexto}>{excluindo ? 'Excluindo...' : 'Excluir minha conta'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.cancelar} onPress={onFechar} disabled={excluindo} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={estilos.cancelarTexto}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:           { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.perigo, padding: 28 },
  titulo:         { fontSize: 22, fontWeight: '800', color: cores.perigo, textAlign: 'center', marginBottom: 12, letterSpacing: -0.3 },
  subtitulo:      { fontSize: 14, color: cores.textoMedio, textAlign: 'center', lineHeight: 21, marginBottom: 18 },
  destaque:       { color: cores.perigo, fontWeight: '700' },
  instrucao:      { fontSize: 13, color: cores.textoForte, marginBottom: 8 },
  input:          { backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: espacos.lg, paddingVertical: 13, paddingRight: 70, fontSize: 14, color: cores.textoForte },
  inputErro:      { borderColor: cores.perigo },
  olhoBtn:        { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  olhoTexto:      { fontSize: 12, color: cores.textoFraco },
  erroTexto:      { color: cores.perigo, fontSize: 12, marginTop: 6 },
  cta:            { backgroundColor: cores.perigo, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginTop: 20, marginBottom: 12 },
  ctaDesabilitado:{ opacity: 0.5 },
  ctaTexto:       { color: cores.branco, fontSize: 16, fontWeight: '800' },
  cancelar:       { paddingVertical: 8, alignItems: 'center' },
  cancelarTexto:  { color: cores.textoFraco, fontSize: 13 },
})
