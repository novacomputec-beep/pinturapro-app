import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform
} from 'react-native'
import { BotaoPrimario, Input } from '../../components'
import { useAuth } from '../../contexts/AuthContext'
import { authService } from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

export default function EditarPerfilScreen({ navigation }) {
  const { usuario, setUsuario } = useAuth()
  const [nome, setNome] = useState(usuario?.nome || '')
  const [telefone, setTelefone] = useState(usuario?.telefone || '')
  const [cidade, setCidade] = useState(usuario?.cidade || '')
  const [carregando, setCarregando] = useState(false)

  const handleSalvar = async () => {
    if (!nome.trim()) {
      Alert.alert('Atenção', 'Informe seu nome.')
      return
    }
    setCarregando(true)
    try {
      const atualizado = await authService.atualizarPerfil({ nome: nome.trim(), telefone: telefone.trim(), cidade: cidade.trim() })
      setUsuario(prev => ({ ...prev, nome: atualizado.nome, cidade: atualizado.cidade }))
      Alert.alert('Sucesso', 'Perfil atualizado com sucesso!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ])
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível atualizar o perfil.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoMedio, fontSize: 16 }}>←</Text>
          </TouchableOpacity>

          <Text style={estilos.titulo}>Editar{'\n'}perfil</Text>
          <Text style={estilos.subtitulo}>Atualize suas informações pessoais</Text>

          <Input label="NOME COMPLETO" placeholder="Seu nome" value={nome} onChangeText={setNome} />
          <Input label="WHATSAPP" placeholder="(34) 99999-9999" value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" />
          <Input label="CIDADE" placeholder="Ex: Uberlândia, MG" value={cidade} onChangeText={setCidade} />

          <View style={estilos.infoBox}>
            <Text style={estilos.infoTexto}>📧 {usuario?.email}</Text>
            <Text style={estilos.infoSub}>O e-mail não pode ser alterado</Text>
          </View>

          <BotaoPrimario
            titulo="Salvar alterações →"
            onPress={handleSalvar}
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
  infoBox: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, marginBottom: 16 },
  infoTexto: { fontSize: 14, color: cores.textoMedio, marginBottom: 4 },
  infoSub: { fontSize: 11, color: cores.textoMutado },
})