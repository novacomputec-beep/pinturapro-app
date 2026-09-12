import React, { useState, useEffect } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { cores, raios } from '../utils/tema'
import { mascararTelefone } from '../utils/telefone'
import { comRetry } from '../utils/rede'
import api from '../services/api'

// Pedido de contato com o suporte, aberto na tela de acesso bloqueado do iOS. Mesmo
// desenho de ModalDenuncia (backdrop escurecido + card central, fade), na moldura neutra
// da paleta — é um pedido de ajuda, não uma ação séria.
//
// O texto daqui é deliberadamente NEUTRO (Apple 3.1.1): nenhuma menção ao motivo do
// bloqueio nem a qualquer cobrança, em nenhum estado (formulário, erro ou confirmação). O que a pessoa precisa saber é que
// alguém da equipe vai falar com ela pelo WhatsApp que informou.
//
// WhatsApp obrigatório (10 ou 11 dígitos, máscara igual à do Perfil); mensagem opcional.
// POST /suporte/pedido via comRetry SEM flags, como /sugestoes: só rede dura é reenviada,
// onde a requisição não chegou ao servidor — { timeout } e { servidor } ficam de fora
// porque este POST cria um pedido e repetir abriria dois chamados.
const MAX_MENSAGEM = 1000

export default function ModalSuporte({ visivel, telefoneInicial, onFechar }) {
  const [whatsapp, setWhatsapp] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)

  // Zera a cada reabertura e pré-preenche com o telefone da conta, que a pessoa pode trocar.
  useEffect(() => {
    if (visivel) {
      setWhatsapp(mascararTelefone(telefoneInicial || ''))
      setMensagem('')
      setEnviando(false)
      setErro('')
      setEnviado(false)
    }
  }, [visivel, telefoneInicial])

  const digitos = whatsapp.replace(/\D/g, '')
  const whatsappValido = digitos.length === 10 || digitos.length === 11

  const enviar = async () => {
    // Botão continua tocável com o campo inválido, de propósito (SugestoesScreen): o toque
    // devolve o motivo em vez de não fazer nada.
    if (!whatsappValido) {
      setErro('Informe um WhatsApp com DDD para a equipe falar com você.')
      return
    }
    if (enviando) return
    setErro('')
    setEnviando(true)
    try {
      await comRetry(() => api.post('/suporte/pedido', {
        whatsapp: digitos,
        mensagem: mensagem.trim() || null,
      }))
      setEnviado(true)
    } catch (err) {
      console.log('[ModalSuporte] falha ao enviar pedido | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      setErro(err.mensagem || err?.response?.data?.erro || 'Não foi possível enviar agora. Verifique sua conexão e tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={enviando ? undefined : onFechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={estilos.backdrop}>
        <View style={estilos.card}>
          {enviado ? (
            <>
              <Text style={estilos.titulo}>Pedido recebido</Text>
              <Text style={estilos.subtitulo}>
                Obrigado! Nossa equipe vai entrar em contato com você pelo WhatsApp {whatsapp}.
              </Text>
              <TouchableOpacity style={estilos.cta} onPress={onFechar} activeOpacity={0.85}>
                <Text style={estilos.ctaTexto}>Fechar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={estilos.titulo}>Falar com o suporte</Text>
              <Text style={estilos.subtitulo}>
                Deixe seu WhatsApp e, se quiser, conte o que está acontecendo. Nossa equipe entra em contato com você.
              </Text>

              <Text style={estilos.label}>WHATSAPP</Text>
              <TextInput
                style={[estilos.input, erro && !whatsappValido && estilos.inputErro]}
                value={whatsapp}
                onChangeText={(t) => { setWhatsapp(mascararTelefone(t)); if (erro) setErro('') }}
                placeholder="(34) 99999-9999"
                placeholderTextColor={cores.textoMutado}
                keyboardType="phone-pad"
                editable={!enviando}
              />

              <Text style={estilos.label}>MENSAGEM (OPCIONAL)</Text>
              <TextInput
                style={[estilos.input, estilos.inputMultiline]}
                value={mensagem}
                onChangeText={setMensagem}
                placeholder="Conte como podemos ajudar"
                placeholderTextColor={cores.textoMutado}
                multiline
                numberOfLines={4}
                maxLength={MAX_MENSAGEM}
                editable={!enviando}
                textAlignVertical="top"
              />

              {!!erro && <Text style={estilos.erro}>{erro}</Text>}

              <TouchableOpacity
                style={[estilos.cta, (enviando || !whatsappValido) && estilos.ctaApagado]}
                onPress={enviar}
                disabled={enviando}
                activeOpacity={0.85}
              >
                <Text style={estilos.ctaTexto}>{enviando ? 'Enviando...' : 'Enviar pedido'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={estilos.fechar} onPress={onFechar} disabled={enviando} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={estilos.fecharTexto}>Cancelar</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:           { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.borda, padding: 24 },
  titulo:         { fontSize: 22, fontWeight: '800', color: cores.textoForte, textAlign: 'center', marginBottom: 8, letterSpacing: -0.3 },
  subtitulo:      { fontSize: 13, color: cores.textoMedio, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  label:          { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  input:          { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: cores.textoForte, marginBottom: 12 },
  inputMultiline: { minHeight: 92, fontSize: 13 },
  inputErro:      { borderColor: cores.perigo },
  erro:           { fontSize: 12, color: cores.perigo, textAlign: 'center', lineHeight: 18, marginBottom: 12 },
  cta:            { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 8 },
  // Cara de apagado SEM disabled enquanto o WhatsApp é inválido: o toque chega ao enviar,
  // que responde com a mensagem inline. Desabilita de verdade só durante o envio.
  ctaApagado:     { opacity: 0.5 },
  ctaTexto:       { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  fechar:         { paddingVertical: 8, alignItems: 'center' },
  fecharTexto:    { color: cores.textoFraco, fontSize: 13 },
})
