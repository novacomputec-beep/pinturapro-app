import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
  Image, FlatList
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { BotaoPrimario, Input } from '../../components'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const CATEGORIAS = [
  { id: 'residencial', label: '🏠 Residencial' },
  { id: 'comercial', label: '🏢 Comercial' },
  { id: 'galpoes', label: '🏭 Galpões' },
  { id: 'outras', label: '🔧 Outras' },
]

export default function CadastrarObraScreen({ navigation }) {
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('residencial')
  const [valor, setValor] = useState('')
  const [cidade, setCidade] = useState('')
  const [bairro, setBairro] = useState('')
  const [metragem, setMetragem] = useState('')
  const [prazo, setPrazo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tags, setTags] = useState('')
  const [midias, setMidias] = useState([])
  const [enviandoMidias, setEnviandoMidias] = useState(false)

  const validar = () => {
    const novos = {}
    if (!titulo.trim()) novos.titulo = 'Informe o título'
    if (!valor.trim()) novos.valor = 'Informe o valor estimado'
    if (!cidade.trim()) novos.cidade = 'Informe a cidade'
    if (!prazo.trim()) novos.prazo = 'Informe o prazo'
    if (!descricao.trim()) novos.descricao = 'Descreva a obra'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const selecionarMidia = async () => {
    Alert.alert(
      'Adicionar mídia',
      'Como deseja adicionar?',
      [
        {
          text: '📷 Câmera (foto ou vídeo)',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync()
            if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera.'); return }
            const { Audio } = require('expo-av')
            await Audio.requestPermissionsAsync()
            const resultado = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              quality: 0.7,
              allowsEditing: false,
            })
            if (!resultado.canceled) setMidias(prev => [...prev, ...resultado.assets])
          }
        },
        {
          text: '🖼️ Galeria',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
            if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria.'); return }
            const resultado = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              allowsMultipleSelection: true,
              quality: 0.7,
            })
            if (!resultado.canceled) setMidias(prev => [...prev, ...resultado.assets])
          }
        },
        { text: 'Cancelar', style: 'cancel' }
      ]
    )
  }

  const removerMidia = (index) => {
    setMidias(prev => prev.filter((_, i) => i !== index))
  }

  const handleCadastrar = async () => {
    if (carregando) return
    if (!validar()) return
    setCarregando(true)
    try {
      const obra = await api.post('/obras/dono', {
        titulo: titulo.trim(),
        categoria,
        valor: parseFloat(valor.replace(',', '.')),
        cidade: cidade.trim(),
        bairro: bairro.trim(),
        metragem: parseFloat(metragem) || null,
        prazo_execucao_dias: parseInt(prazo),
        descricao: descricao.trim(),
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        horas_para_expirar: 720,
      })
      if (midias.length > 0) {
        setEnviandoMidias(true)
        for (let i = 0; i < midias.length; i++) {
          const midia = midias[i]
          const formData = new FormData()
          const isVideo = midia.type === 'video'
          formData.append('arquivo', {
            uri: midia.uri,
            type: isVideo ? 'video/mp4' : 'image/jpeg',
            name: isVideo ? `video_${i}.mp4` : `foto_${i}.jpg`,
          })
          formData.append('obra_id', obra.id)
          formData.append('ordem', i + 1)
          const token = await require('expo-secure-store').getItemAsync('token')
          const uploadResp = await fetch(
            'https://pinturapro-api-production.up.railway.app/api/upload/dono',
            {
              method: 'POST',
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
              body: formData,
            }
          )
          if (!uploadResp.ok) throw new Error('Erro ao fazer upload')
        }
      }
      Alert.alert(
        'Obra enviada! 🎉',
        'Sua obra foi enviada para aprovação. Nossa equipe irá analisá-la em breve e você será notificado.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível cadastrar a obra.')
    } finally {
      setCarregando(false)
      setEnviandoMidias(false)
    }
  }

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoForte, fontSize: 32, fontWeight: '900' }}>←</Text>
          </TouchableOpacity>
          <Text style={estilos.titulo}>Cadastrar{'\n'}nova obra</Text>
          <Text style={estilos.subtitulo}>Preencha os dados da sua obra para encontrar pintores qualificados</Text>
          <Input label="TÍTULO DA OBRA" placeholder="Ex: Pintura completa apartamento 3 quartos" value={titulo} onChangeText={setTitulo} erro={erros.titulo} />
          <Text style={estilos.labelCategoria}>CATEGORIA</Text>
          <View style={estilos.categoriasRow}>
            {CATEGORIAS.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[estilos.categoriaPill, categoria === c.id && estilos.categoriaPillAtivo]}
                onPress={() => setCategoria(c.id)}
              >
                <Text style={[estilos.categoriaPillTexto, categoria === c.id && estilos.categoriaPillTextoAtivo]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={estilos.duasColunas}>
            <Input label="VALOR ESTIMADO (R$)" placeholder="5000" value={valor} onChangeText={setValor} keyboardType="numeric" erro={erros.valor} estilo={{ flex: 1 }} />
            <Input label="PRAZO (dias)" placeholder="30" value={prazo} onChangeText={setPrazo} keyboardType="numeric" erro={erros.prazo} estilo={{ flex: 1 }} />
          </View>
          <View style={estilos.duasColunas}>
            <Input label="CIDADE" placeholder="Uberlândia" value={cidade} onChangeText={setCidade} erro={erros.cidade} estilo={{ flex: 1 }} />
            <Input label="BAIRRO" placeholder="Centro" value={bairro} onChangeText={setBairro} estilo={{ flex: 1 }} />
          </View>
          <Input label="METRAGEM (m²)" placeholder="Ex: 150" value={metragem} onChangeText={setMetragem} keyboardType="numeric" />
          <Input label="DESCRIÇÃO DETALHADA" placeholder="Descreva os serviços necessários, condições especiais, materiais..." value={descricao} onChangeText={setDescricao} erro={erros.descricao} multiline numberOfLines={4} />
          <Input label="TAGS (separadas por vírgula)" placeholder="tinta acrílica, massa corrida, selador" value={tags} onChangeText={setTags} />
          <Text style={estilos.labelCategoria}>FOTOS E VÍDEOS DA OBRA</Text>
          <Text style={estilos.dicaMidia}>💡 Dica: grave um vídeo com o encarregado explicando os detalhes da obra</Text>
          <TouchableOpacity style={estilos.uploadBtn} onPress={selecionarMidia}>
            <Text style={estilos.uploadIcone}>📎</Text>
            <Text style={estilos.uploadTexto}>Adicionar fotos e vídeos</Text>
          </TouchableOpacity>
          {midias.length > 0 && (
            <FlatList
              data={midias}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => i.toString()}
              style={{ marginBottom: 16 }}
              renderItem={({ item, index }) => (
                <View style={estilos.midiaItem}>
                  <Image source={{ uri: item.uri }} style={estilos.midiaImagem} />
                  {item.type === 'video' && (
                    <View style={estilos.videoOverlay}>
                      <Text style={{ color: 'white', fontSize: 20 }}>▶</Text>
                    </View>
                  )}
                  <TouchableOpacity style={estilos.midiaRemover} onPress={() => removerMidia(index)}>
                    <Text style={{ color: 'white', fontSize: 12 }}>×</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
          <BotaoPrimario
            titulo={enviandoMidias ? 'Enviando mídias...' : 'Enviar obra para aprovação →'}
            onPress={handleCadastrar}
            carregando={carregando}
            estilo={{ marginTop: 8 }}
          />
          <Text style={estilos.aviso}>
            Após o envio, nossa equipe irá analisar sua obra e você receberá uma notificação com o resultado.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40, paddingTop: 16 },
  btnVoltar: {
    marginTop: 4, width: 36, height: 36,
    backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 24, lineHeight: 20 },
  labelCategoria: { fontSize: 11, color: cores.textoFraco, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  categoriasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
  categoriaPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  categoriaPillTexto: { fontSize: 12, color: cores.textoMedio },
  categoriaPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  duasColunas: { flexDirection: 'row', gap: 12 },
  dicaMidia: { fontSize: 12, color: cores.textoFraco, marginBottom: 10, lineHeight: 18 },
  uploadBtn: { borderWidth: 1.5, borderColor: cores.borda, borderStyle: 'dashed', borderRadius: raios.medio, padding: 20, alignItems: 'center', marginBottom: 16, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  uploadIcone: { fontSize: 20 },
  uploadTexto: { fontSize: 14, color: cores.textoMedio },
  midiaItem: { width: 100, height: 100, marginRight: 8, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  midiaImagem: { width: '100%', height: '100%' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  midiaRemover: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  aviso: { fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 12, lineHeight: 18 },
})
