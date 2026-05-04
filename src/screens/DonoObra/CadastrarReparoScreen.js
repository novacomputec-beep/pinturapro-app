import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert, FlatList
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'react-native'
import { BotaoPrimario, Input } from '../../components'
import api, { uploadMidia } from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const CATEGORIAS = [
  { id: 'hidraulica', label: '🚿 Hidráulica' },
  { id: 'eletrica', label: '💡 Elétrica' },
  { id: 'marcenaria', label: '🪚 Marcenaria' },
  { id: 'alvenaria', label: '🏠 Alvenaria' },
  { id: 'climatizacao', label: '❄️ Climatização' },
  { id: 'outros', label: '🔨 Outros' },
]

export default function CadastrarReparoScreen({ navigation }) {
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('hidraulica')
  const [descricao, setDescricao] = useState('')
  const [valorEstimado, setValorEstimado] = useState('')
  const [cidade, setCidade] = useState('')
  const [bairro, setBairro] = useState('')
  const [midias, setMidias] = useState([])

  const validar = () => {
    const novos = {}
    if (!titulo.trim()) novos.titulo = 'Informe o título'
    if (!descricao.trim()) novos.descricao = 'Descreva o reparo necessário'
    if (!cidade.trim()) novos.cidade = 'Informe a cidade'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const selecionarMidia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria.')
      return
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
    })
    if (!resultado.canceled) {
      setMidias(prev => [...prev, ...resultado.assets])
    }
  }

  const removerMidia = (index) => {
    setMidias(prev => prev.filter((_, i) => i !== index))
  }

  const handleCadastrar = async () => {
    if (!validar()) return
    setCarregando(true)
    try {
      const reparo = await api.post('/reparos/dono', {
        titulo: titulo.trim(),
        categoria,
        descricao: descricao.trim(),
        valor_estimado: valorEstimado ? parseFloat(valorEstimado.replace(',', '.')) : null,
        cidade: cidade.trim(),
        bairro: bairro.trim(),
      })

      if (midias.length > 0) {
        for (let i = 0; i < midias.length; i++) {
          const midia = midias[i]
          const formData = new FormData()
          const isVideo = midia.type === 'video'
          formData.append('arquivo', {
            uri: midia.uri,
            type: isVideo ? 'video/mp4' : 'image/jpeg',
            name: isVideo ? `video_${i}.mp4` : `foto_${i}.jpg`,
          })
          formData.append('reparo_id', reparo.id)
          formData.append('ordem', i + 1)
          await api.post('/upload/reparo', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 120000,
          })
        }
      }

      Alert.alert(
        'Reparo enviado! 🎉',
        'Seu reparo foi enviado para aprovação. Nossa equipe irá analisá-lo em breve.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível cadastrar o reparo.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoMedio, fontSize: 16 }}>←</Text>
          </TouchableOpacity>

          <Text style={estilos.titulo}>Cadastrar{'\n'}reparo</Text>
          <Text style={estilos.subtitulo}>Descreva o reparo e encontre um profissional qualificado</Text>

          <Input label="TÍTULO DO REPARO" placeholder="Ex: Torneira da pia da cozinha vazando" value={titulo} onChangeText={setTitulo} erro={erros.titulo} />

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

          <Input label="DESCRIÇÃO DO PROBLEMA" placeholder="Descreva detalhadamente o que precisa ser feito..." value={descricao} onChangeText={setDescricao} erro={erros.descricao} multiline numberOfLines={4} />

          <Input label="VALOR ESTIMADO (R$) — opcional" placeholder="Ex: 150" value={valorEstimado} onChangeText={setValorEstimado} keyboardType="numeric" />

          <View style={estilos.duasColunas}>
            <Input label="CIDADE" placeholder="Uberlândia" value={cidade} onChangeText={setCidade} erro={erros.cidade} estilo={{ flex: 1 }} />
            <Input label="BAIRRO" placeholder="Centro" value={bairro} onChangeText={setBairro} estilo={{ flex: 1 }} />
          </View>

          <Text style={estilos.labelCategoria}>FOTOS E VÍDEOS</Text>
          <Text style={estilos.dica}>💡 Grave um vídeo mostrando o problema para facilitar o diagnóstico</Text>

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
            titulo="Enviar reparo para aprovação →"
            onPress={handleCadastrar}
            carregando={carregando}
            estilo={{ marginTop: 8 }}
          />

          <Text style={estilos.aviso}>
            Após aprovação, profissionais qualificados da sua região poderão demonstrar interesse.
          </Text>

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
  labelCategoria: { fontSize: 11, color: cores.textoFraco, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  categoriasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
  categoriaPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  categoriaPillTexto: { fontSize: 12, color: cores.textoMedio },
  categoriaPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  duasColunas: { flexDirection: 'row', gap: 12 },
  dica: { fontSize: 12, color: cores.textoFraco, marginBottom: 10, lineHeight: 18 },
  uploadBtn: { borderWidth: 1.5, borderColor: cores.borda, borderStyle: 'dashed', borderRadius: raios.medio, padding: 20, alignItems: 'center', marginBottom: 16, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  uploadIcone: { fontSize: 20 },
  uploadTexto: { fontSize: 14, color: cores.textoMedio },
  midiaItem: { width: 100, height: 100, marginRight: 8, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  midiaImagem: { width: '100%', height: '100%' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  midiaRemover: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  aviso: { fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 12, lineHeight: 18 },
})