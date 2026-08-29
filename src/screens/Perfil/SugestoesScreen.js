import React, { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario, Input } from '../../components'
import api from '../../services/api'
import { cores, espacos, alturas, larguraMaxima } from '../../utils/tema'
import { comRetry } from '../../utils/rede'

// Teto do texto. O mesmo número vai no maxLength do campo e no contador, para que o
// limite que trava a digitação seja o limite que a pessoa lê.
const MAX_TEXTO = 2000

export default function SugestoesScreen({ navigation }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const vazio = !texto.trim()

  const handleEnviar = async () => {
    // O botão continua TOCÁVEL com o campo vazio, de propósito: um botão apagado que não
    // responde não diz o que falta. Aqui o toque devolve o motivo em vez de não fazer nada.
    if (vazio) {
      setErro('Escreva sua sugestão antes de enviar.')
      return
    }
    // Trava de toque duplo. O `enviando` já apaga o botão via `carregando`, mas o
    // BotaoPrimario só desabilita no render SEGUINTE — dois toques no mesmo quadro
    // entrariam os dois aqui, e /sugestoes cria recurso: seriam duas sugestões iguais.
    if (enviando) return
    setErro('')
    setEnviando(true)
    try {
      // comRetry SEM flags, igual ao AlterarSenhaScreen: só erro de rede duro é
      // reexecutado, onde a requisição não chegou ao servidor. { timeout } e { servidor }
      // ficam de fora porque este POST CRIA um recurso e repetir duplicaria a sugestão.
      await comRetry(() => api.post('/sugestoes', { texto: texto.trim() }))
      Alert.alert('Obrigado! 💡', 'Sua sugestão foi enviada.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ])
    } catch (err) {
      console.log('[Sugestoes] falha ao enviar sugestão | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert('Erro', err.mensagem || err?.response?.data?.erro || 'Não foi possível enviar a sugestão.')
    } finally {
      // No finally, não no try: se a chamada falhar no meio o botão volta a responder e a
      // pessoa pode tentar de novo sem sair da tela.
      setEnviando(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
          </TouchableOpacity>

          <Text style={estilos.titulo}>Sugestões</Text>
          <Text style={estilos.subtitulo}>Conte o que você mudaria no app — lemos todas</Text>

          <Input
            label="SUA SUGESTÃO"
            placeholder="Descreva sua ideia..."
            value={texto}
            onChangeText={(t) => { setTexto(t); if (erro) setErro('') }}
            multiline
            numberOfLines={6}
            maxLength={MAX_TEXTO}
            editable={!enviando}
            textAlignVertical="top"
            estiloInput={estilos.campo}
            erro={erro}
          />

          <Text style={estilos.contador}>{texto.length}/{MAX_TEXTO}</Text>

          <BotaoPrimario
            titulo="Enviar sugestão →"
            onPress={handleEnviar}
            carregando={enviando}
            estilo={[{ marginTop: 8 }, vazio && estilos.btnVazio]}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico },
  btnVoltar: { marginTop: 60, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 24 },
  // Só a altura do box muda em relação ao Input padrão — cor, borda, raio e padding
  // seguem os do componente, que é o que mantém o campo igual ao das outras telas.
  campo: { minHeight: 140 },
  // Alinhado à direita, sob o campo: mesma escala do inputErroTexto (11) e a cor mais
  // apagada da paleta de texto, para o número não competir com o rótulo.
  contador: { fontSize: 11, color: cores.textoFraco, textAlign: 'right', marginTop: -espacos.sm, marginBottom: espacos.md },
  // Cara de desabilitado SEM disabled: o toque continua chegando ao handleEnviar, que
  // responde com a mensagem inline. Mesmo valor do btnDesabilitado do componente.
  btnVazio: { opacity: 0.5 },
})
