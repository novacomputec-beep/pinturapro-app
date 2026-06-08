import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform
} from 'react-native'
import { BotaoPrimario, Input } from '../../components'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

export default function AlterarSenhaScreen({ navigation }) {
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})

  const validar = () => {
    const novos = {}
    if (!senhaAtual.trim()) novos.senhaAtual = 'Informe a senha atual'
    if (!novaSenha.trim()) novos.novaSenha = 'Informe a nova senha'
    if (novaSenha.length < 8) novos.novaSenha = 'Mínimo 8 caracteres'
    if (novaSenha !== confirmar) novos.confirmar = 'As senhas não coincidem'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const handleAlterar = async () => {
    if (!validar()) return
    setCarregando(true)
    try {
      await api.post('/auth/alterar-senha', {
        senha_atual: senhaAtual,
        nova_senha: novaSenha
      })
      Alert.alert('Sucesso! 🎉', 'Sua senha foi alterada com sucesso.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ])
    } catch (err) {
      Alert.alert('Erro', err.mensagem || err?.response?.data?.erro || 'Não foi possível alterar a senha.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoForte, fontSize: 32, fontWeight: '900' }}>←</Text>
          </TouchableOpacity>

          <Text style={estilos.titulo}>Alterar{'\n'}senha</Text>
          <Text style={estilos.subtitulo}>Escolha uma senha forte com pelo menos 8 caracteres</Text>

          <View>
            <Input
              label="SENHA ATUAL"
              placeholder="••••••••"
              value={senhaAtual}
              onChangeText={setSenhaAtual}
              secureTextEntry={!mostrar}
              erro={erros.senhaAtual}
            />
            <TouchableOpacity style={estilos.olhoBtn} onPress={() => setMostrar(!mostrar)}>
              <Text style={estilos.olhoTexto}>{mostrar ? 'ocultar' : 'mostrar'}</Text>
            </TouchableOpacity>
          </View>

          <Input
            label="NOVA SENHA"
            placeholder="Mínimo 8 caracteres"
            value={novaSenha}
            onChangeText={setNovaSenha}
            secureTextEntry={!mostrar}
            erro={erros.novaSenha}
          />

          <Input
            label="CONFIRMAR NOVA SENHA"
            placeholder="Repita a nova senha"
            value={confirmar}
            onChangeText={setConfirmar}
            secureTextEntry={!mostrar}
            erro={erros.confirmar}
          />

          <BotaoPrimario
            titulo="Alterar senha →"
            onPress={handleAlterar}
            carregando={carregando}
            estilo={{ marginTop: 8 }}
          />
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
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 24 },
  olhoBtn: { position: 'absolute', right: 14, bottom: 27 },
  olhoTexto: { fontSize: 12, color: cores.textoFraco },
})