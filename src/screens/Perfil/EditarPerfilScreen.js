import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Image, ActivityIndicator
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { BotaoPrimario, Input } from '../../components'
import { useAuth } from '../../contexts/AuthContext'
import { authService } from '../../services/api'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const xhrUpload = (url, form) => new Promise((resolve, reject) => {
  const attempt = (isRetry) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText)) }
      catch (e) {
        if (!isRetry) setTimeout(() => attempt(true), 2000)
        else reject(new Error('Resposta inválida do servidor de upload'))
      }
    }
    xhr.onerror = () => {
      if (!isRetry) setTimeout(() => attempt(true), 2000)
      else reject(new Error('Falha na conexão com o servidor de upload'))
    }
    xhr.send(form)
  }
  attempt(false)
})

export default function EditarPerfilScreen({ navigation }) {
  const { usuario, setUsuario } = useAuth()
  const [nome, setNome] = useState(usuario?.nome || '')
  const [telefone, setTelefone] = useState(usuario?.telefone || '')
  const [cidade, setCidade] = useState(usuario?.cidade || '')
  const [carregando, setCarregando] = useState(false)
  const [uploadandoFoto, setUploadandoFoto] = useState(false)
  const [fotoUrl, setFotoUrl] = useState(usuario?.foto_url || null)

  const processarFoto = async (uri) => {
    setUploadandoFoto(true)
    try {
      const params = await api.get('/upload/assinatura-cloudinary', { params: { folder: 'pinturapro/perfil' } })
      const cloudForm = new FormData()
      cloudForm.append('file', { uri, type: 'image/jpeg', name: 'foto_perfil.jpg' })
      cloudForm.append('timestamp', String(params.timestamp))
      cloudForm.append('signature', params.signature)
      cloudForm.append('api_key', params.api_key)
      cloudForm.append('folder', params.folder)
      cloudForm.append('transformation', 'q_auto:good,w_400,h_400,c_fill')
      const cloudData = await xhrUpload(`https://api.cloudinary.com/v1_1/${params.cloud_name}/image/upload`, cloudForm)
      if (cloudData.error || !cloudData.secure_url) throw new Error(cloudData.error?.message || 'Erro no upload da foto')
      await api.patch('/auth/foto-perfil', { foto_url: cloudData.secure_url })
      setFotoUrl(cloudData.secure_url)
      setUsuario(prev => ({ ...prev, foto_url: cloudData.secure_url }))
      Alert.alert('Sucesso', 'Foto atualizada!')
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível enviar a foto.')
    } finally {
      setUploadandoFoto(false)
    }
  }

  const handleEscolherFoto = () => {
    Alert.alert('Foto de perfil', 'Como deseja enviar a foto?', [
      {
        text: '📷 Câmera',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync()
            if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera.'); return }
            const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
            if (!result.canceled) processarFoto(result.assets[0].uri)
          } catch { Alert.alert('Erro', 'Não foi possível abrir a câmera.') }
        }
      },
      {
        text: '🖼️ Galeria',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
            if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à sua galeria.'); return }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 })
            if (!result.canceled) processarFoto(result.assets[0].uri)
          } catch { Alert.alert('Erro', 'Não foi possível abrir a galeria.') }
        }
      },
      { text: 'Cancelar', style: 'cancel' }
    ])
  }

  const handleSalvar = async () => {
    if (!nome.trim()) {
      Alert.alert('Atenção', 'Informe seu nome.')
      return
    }
    setCarregando(true)
    try {
      const atualizado = await authService.atualizarPerfil({
        nome: nome.trim(),
        telefone: telefone.trim(),
        cidade: cidade.trim()
      })
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
            <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
          </TouchableOpacity>

          <Text style={estilos.titulo}>Editar{'\n'}perfil</Text>
          <Text style={estilos.subtitulo}>Atualize suas informações pessoais</Text>

          {/* Avatar editável */}
          <TouchableOpacity style={estilos.avatarWrap} onPress={handleEscolherFoto} activeOpacity={0.8}>
            {uploadandoFoto ? (
              <View style={estilos.avatarCirculo}>
                <ActivityIndicator color={cores.primaria} />
              </View>
            ) : fotoUrl ? (
              <Image source={{ uri: fotoUrl }} style={estilos.avatarFoto} />
            ) : (
              <View style={estilos.avatarCirculo}>
                <Text style={estilos.avatarIniciais}>
                  {usuario?.nome?.substring(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={estilos.avatarBotaoFoto}>
              <Text style={estilos.avatarCameraIcone}>📷</Text>
            </View>
          </TouchableOpacity>
          <Text style={estilos.avatarDica}>Toque para alterar a foto</Text>

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
  btnVoltar: { marginTop: 60, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 24 },
  avatarWrap: { alignSelf: 'center', marginBottom: 8, position: 'relative' },
  avatarCirculo: { width: 90, height: 90, borderRadius: 45, backgroundColor: cores.primariaSuave, borderWidth: 2, borderColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  avatarFoto: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: cores.primaria },
  avatarIniciais: { fontSize: 28, fontWeight: '700', color: cores.primaria },
  avatarBotaoFoto: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: cores.fundo },
  avatarCameraIcone: { fontSize: 13 },
  avatarDica: { fontSize: 11, color: cores.textoFraco, textAlign: 'center', marginBottom: 24 },
  infoBox: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, marginBottom: 16 },
  infoTexto: { fontSize: 14, color: cores.textoMedio, marginBottom: 4 },
  infoSub: { fontSize: 11, color: cores.textoMutado },
})