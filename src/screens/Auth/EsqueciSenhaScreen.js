import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform
} from 'react-native'
import { BotaoPrimario, Input } from '../../components'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

export default function EsqueciSenhaScreen({ navigation }) {
  const [email, setEmail] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')

  const handleEnviar = async () => {
    if (!email.trim()) { setErro('Informe seu e-mail'); return }
    setErro('')
    setCarregando(true)
    try {
      await api.post('/auth/esqueci-senha', { email: email.trim().toLowerCase() })
      setEnviado(true)
    } catch {
      // Sempre mostra sucesso para não revelar se e-mail existe
      setEnviado(true)
    } finally {
      setCarregando(false)
    }
  }

  if (enviado) {
    return (
      <SafeAreaView style={estilos.container}>
        <ScrollView contentContainerStyle={[estilos.scroll, { alignItems: 'center', justifyContent: 'center', flex: 1 }]}>
          <Text style={{ fontSize: 56, marginBottom: 20 }}>📧</Text>
          <Text style={estilos.titulo}>Verifique{'\n'}seu e-mail</Text>
          <Text style={[estilos.subtitulo, { textAlign: 'center' }]}>
            Se o e-mail <Text style={{ color: cores.primaria }}>{email}</Text> estiver cadastrado, você receberá um código de redefinição em breve.
          </Text>
          <View style={estilos.dicaBox}>
            <Text style={estilos.dicaTexto}>💡 Verifique também a pasta de spam</Text>
          </View>
          <BotaoPrimario
            titulo="Voltar ao login →"
            onPress={() => navigation.navigate('Login')}
            estilo={{ marginTop: 24, width: '100%' }}
          />
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoForte, fontSize: 26, fontWeight: '700' }}>←</Text>
          </TouchableOpacity>

          <Text style={estilos.titulo}>Esqueceu{'\n'}sua senha?</Text>
          <Text style={estilos.subtitulo}>
            Informe o e-mail cadastrado e enviaremos um código para redefinir sua senha.
          </Text>

          <Input
            label="E-MAIL"
            placeholder="seu@email.com"
            value={email}
            onChangeText={text => { setEmail(text); setErro('') }}
            keyboardType="email-address"
            autoCapitalize="none"
            erro={erro}
          />

          <BotaoPrimario
            titulo="Enviar código →"
            onPress={handleEnviar}
            carregando={carregando}
            estilo={{ marginTop: 8 }}
          />

          <TouchableOpacity
            style={{ alignItems: 'center', padding: 16, marginTop: 8 }}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={{ fontSize: 13, color: cores.textoFraco }}>Lembrei minha senha · Fazer login</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 },
  btnVoltar: { marginTop: 14, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 24, lineHeight: 20 },
  dicaBox: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, marginTop: 8 },
  dicaTexto: { fontSize: 13, color: cores.textoMedio },
})