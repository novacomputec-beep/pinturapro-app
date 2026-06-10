import React, { useState, useRef } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert,
  Image, FlatList, Modal, ActivityIndicator
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Audio } from 'expo-av'
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
  const [logradouro, setLogradouro] = useState('')
  const [uf, setUf] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enderecoEncontrado, setEnderecoEncontrado] = useState(false)
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [metragem, setMetragem] = useState('')
  const [prazo, setPrazo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [tags, setTags] = useState('')
  const [cep, setCep] = useState('')
  const [midias, setMidias] = useState([])
  const [enviandoMidias, setEnviandoMidias] = useState(false)
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const enviandoRef = useRef(false)

  const mascararValor = (v) => {
    const nums = v.replace(/\D/g, '')
    if (!nums) return ''
    const centavos = Math.min(parseInt(nums, 10), 9999999999)
    const reais = Math.floor(centavos / 100)
    const cents = centavos % 100
    const reaisStr = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${reaisStr},${String(cents).padStart(2, '0')}`
  }

  const buscarCep = async (cepDigitado) => {
    const cepLimpo = cepDigitado.replace(/\D/g, '')
    setCep(cepLimpo)
    if (cepLimpo.length !== 8) return
    setBuscandoCep(true)
    setEnderecoEncontrado(false)
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const dados = await resp.json()
      if (dados.erro) { Alert.alert('CEP não encontrado', 'Verifique o CEP informado.'); return }
      setLogradouro(dados.logradouro || '')
      setBairro(dados.bairro || '')
      setCidade(dados.localidade || '')
      setUf(dados.uf || '')
      setEnderecoEncontrado(true)
      const endereco = `${dados.logradouro}, ${dados.localidade}, ${dados.uf}, Brasil`
      const geoResp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endereco)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'PinturaPro/1.0' } }
      )
      const geoData = await geoResp.json()
      if (geoData.length > 0) {
        setLatitude(parseFloat(geoData[0].lat))
        setLongitude(parseFloat(geoData[0].lon))
      }
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível buscar o CEP. Verifique sua conexão.')
    } finally {
      setBuscandoCep(false)
    }
  }

  const validar = () => {
    const novos = {}
    if (!titulo.trim()) novos.titulo = 'Informe o título'
    if (!valor.trim()) novos.valor = 'Informe o valor oferecido'
    if (!cep.trim()) novos.cep = 'Informe o CEP'
    if (!prazo.trim()) novos.prazo = 'Informe o prazo'
    if (!descricao.trim()) novos.descricao = 'Descreva a obra'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const usarCameraFoto = async () => {
    setShowMediaPicker(false)
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera.'); return }
    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    })
    if (!resultado.canceled) setMidias(prev => [...prev, ...resultado.assets])
  }

  const usarCameraVideo = async () => {
    setShowMediaPicker(false)
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera.'); return }
    await Audio.requestPermissionsAsync()
    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
      allowsEditing: false,
      videoMaxDuration: 60,
    })
    if (!resultado.canceled) setMidias(prev => [...prev, ...resultado.assets])
  }

  const usarGaleria = async () => {
    setShowMediaPicker(false)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria.'); return }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.7,
      videoMaxDuration: 60,
    })
    if (!resultado.canceled) setMidias(prev => [...prev, ...resultado.assets])
  }

  const removerMidia = (index) => {
    setMidias(prev => prev.filter((_, i) => i !== index))
  }

  const handleCadastrar = async () => {
    if (enviandoRef.current) return
    if (!validar()) return
    enviandoRef.current = true
    setCarregando(true)
    let obra = null
    try {
      const enderecoCompleto = [logradouro, numero, complemento, bairro, cidade, uf].filter(Boolean).join(', ')
      try {
        obra = await api.post('/obras/dono', {
          titulo: titulo.trim(),
          categoria,
          valor: parseFloat(valor.replace(/\./g, '').replace(',', '.')),
          cidade: cidade,
          bairro: bairro,
          cep: cep || null,
          uf: uf || null,
          latitude: latitude || null,
          longitude: longitude || null,
          endereco_obra: enderecoCompleto || null,
          metragem: parseFloat(metragem) || null,
          prazo_execucao_dias: parseInt(prazo),
          descricao: descricao.trim(),
          tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          horas_para_expirar: 720,
        })
      } catch (e) {
        Alert.alert('Erro', 'Não foi possível cadastrar a obra. Tente novamente.')
        enviandoRef.current = false
        setCarregando(false)
        return
      }
      if (midias.length > 0) {
        setEnviandoMidias(true)
        for (let i = 0; i < midias.length; i++) {
          const midia = midias[i]
          const isVideo = midia.type === 'video'
          if (isVideo) {
            let params
            try {
              params = await api.get('/upload/assinatura-cloudinary')
            } catch (e) {
              Alert.alert('Erro', 'Erro ao preparar upload. Tente novamente.')
              await api.delete(`/obras/dono/${obra.id}`).catch(() => {})
              throw e
            }
            const cloudForm = new FormData()
            cloudForm.append('file', { uri: midia.uri, type: 'video/mp4', name: `video_${i}.mp4` })
            cloudForm.append('timestamp', String(params.timestamp))
            cloudForm.append('signature', params.signature)
            cloudForm.append('api_key', params.api_key)
            cloudForm.append('folder', params.folder)
            let cloudData
            try {
              cloudData = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open('POST', `https://api.cloudinary.com/v1_1/${params.cloud_name}/video/upload`)
                xhr.onload = () => {
                  try { resolve(JSON.parse(xhr.responseText)) }
                  catch(e) { reject(new Error('Invalid JSON response')) }
                }
                xhr.onerror = () => reject(new Error('XHR network error: ' + xhr.status))
                xhr.send(cloudForm)
              })
            } catch (e) {
              Alert.alert('Erro', 'Erro ao enviar arquivo. Verifique sua conexão.')
              await api.delete(`/obras/dono/${obra.id}`).catch(() => {})
              throw e
            }
            if (cloudData.error) {
              Alert.alert('Erro', 'Erro ao enviar arquivo. Verifique sua conexão.')
              await api.delete(`/obras/dono/${obra.id}`).catch(() => {})
              throw new Error(cloudData.error?.message || 'Erro ao fazer upload do vídeo')
            }
            try {
              await api.post('/upload/obra-url', { obra_id: obra.id, url: cloudData.secure_url, tipo: 'video', ordem: i + 1 })
            } catch (e) {
              Alert.alert('Erro', 'Erro ao finalizar cadastro. Tente novamente.')
              throw e
            }
          } else {
            let params
            try {
              params = await api.get('/upload/assinatura-cloudinary', { params: { folder: 'pinturapro/fotos' } })
            } catch (e) {
              Alert.alert('Erro', 'Erro ao preparar upload. Tente novamente.')
              await api.delete(`/obras/dono/${obra.id}`).catch(() => {})
              throw e
            }
            let cloudData
            try {
              const cloudForm = new FormData()
              cloudForm.append('file', { uri: midia.uri, type: 'image/jpeg', name: `foto_${i}.jpg` })
              cloudForm.append('timestamp', String(params.timestamp))
              cloudForm.append('signature', params.signature)
              cloudForm.append('api_key', params.api_key)
              cloudForm.append('folder', params.folder)
              cloudData = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open('POST', `https://api.cloudinary.com/v1_1/${params.cloud_name}/image/upload`)
                xhr.onload = () => {
                  try { resolve(JSON.parse(xhr.responseText)) }
                  catch(e) { reject(new Error('Invalid JSON response')) }
                }
                xhr.onerror = () => reject(new Error('XHR network error: ' + xhr.status))
                xhr.send(cloudForm)
              })
            } catch (e) {
              Alert.alert('Erro', 'Erro ao enviar arquivo. Verifique sua conexão.')
              await api.delete(`/obras/dono/${obra.id}`).catch(() => {})
              throw e
            }
            if (cloudData.error) {
              Alert.alert('Erro', 'Erro ao enviar arquivo. Verifique sua conexão.')
              await api.delete(`/obras/dono/${obra.id}`).catch(() => {})
              throw new Error(cloudData.error?.message || 'Erro ao fazer upload da foto')
            }
            try {
              await api.post('/upload/obra-url', { obra_id: obra.id, url: cloudData.secure_url, tipo: 'foto', ordem: i + 1 })
            } catch (e) {
              Alert.alert('Erro', 'Erro ao finalizar cadastro. Tente novamente.')
              throw e
            }
          }
        }
      }
      navigation.goBack()
    } catch (err) {
      const msg = err.status === 409
        ? (err.mensagem || 'Dados já cadastrados.')
        : (err.mensagem || err.message || 'Não foi possível cadastrar a obra.')
      Alert.alert('Erro', msg, [
        { text: 'OK', onPress: () => { enviandoRef.current = false; setCarregando(false); setEnviandoMidias(false) } }
      ])
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
            <Input label="VALOR OFERECIDO (R$)" placeholder="5.000,00" value={valor} onChangeText={(t) => setValor(mascararValor(t))} keyboardType="numeric" erro={erros.valor} estilo={{ flex: 1 }} />
            <Input label="PRAZO (dias)" placeholder="30" value={prazo} onChangeText={setPrazo} keyboardType="numeric" erro={erros.prazo} estilo={{ flex: 1 }} />
          </View>
          <Text style={[estilos.labelCategoria, { marginTop: 16 }]}>📍 CEP DO LOCAL DO SERVIÇO</Text>
          <View style={estilos.cepRow}>
            <Input label="CEP" placeholder="00000-000" value={cep} onChangeText={buscarCep} keyboardType="numeric" maxLength={8} erro={erros.cep} estilo={{ flex: 1 }} />
            {buscandoCep && <ActivityIndicator color={cores.primaria} style={{ marginTop: 28, marginLeft: 12 }} />}
            {enderecoEncontrado && !buscandoCep && <Text style={estilos.cepOk}>✅</Text>}
          </View>
          {enderecoEncontrado && (
            <>
              <Input label="LOGRADOURO" value={logradouro} onChangeText={setLogradouro} editable={false} estilo={{ backgroundColor: cores.fundoElevado }} />
              <View style={estilos.duasColunas}>
                <Input label="NÚMERO" placeholder="Ex: 123" value={numero} onChangeText={setNumero} keyboardType="numeric" erro={erros.numero} estilo={{ flex: 1 }} />
                <Input label="COMPLEMENTO" placeholder="Ap, sala..." value={complemento} onChangeText={setComplemento} estilo={{ flex: 1 }} />
              </View>
              <Input label="BAIRRO" value={bairro} onChangeText={setBairro} />
              {latitude && (
                <View style={estilos.geoConfirm}>
                  <Text style={estilos.geoConfirmTexto}>📍 Localização encontrada — pintores próximos serão notificados!</Text>
                </View>
              )}
            </>
          )}
          <Input label="METRAGEM (m²)" placeholder="Ex: 150" value={metragem} onChangeText={setMetragem} keyboardType="numeric" />
          <Input label="DESCRIÇÃO DETALHADA" placeholder="Descreva os serviços necessários, condições especiais, materiais..." value={descricao} onChangeText={setDescricao} erro={erros.descricao} multiline numberOfLines={4} />
          <Input label="TAGS (separadas por vírgula)" placeholder="tinta acrílica, massa corrida, selador" value={tags} onChangeText={setTags} />
          <Text style={estilos.labelCategoria}>FOTOS E VÍDEOS DA OBRA</Text>
          <Text style={estilos.dicaMidia}>💡 Dica: grave um vídeo com o encarregado explicando os detalhes da obra</Text>
          <TouchableOpacity style={estilos.uploadBtn} onPress={() => setShowMediaPicker(true)}>
            <Text style={estilos.uploadIcone}>📎</Text>
            <Text style={estilos.uploadTexto}>Adicionar fotos e vídeos</Text>
          </TouchableOpacity>
          <Text style={estilos.dicaMidia}>📹 Filme no máximo 30 segundos para melhor resultado</Text>
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
            desabilitado={carregando}
            estilo={{ marginTop: 8 }}
          />
          <Text style={estilos.aviso}>
            Após o envio, nossa equipe irá analisar sua obra e você receberá uma notificação com o resultado.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={showMediaPicker} transparent animationType="slide" onRequestClose={() => setShowMediaPicker(false)}>
        <TouchableOpacity style={estilos.modalOverlay} activeOpacity={1} onPress={() => setShowMediaPicker(false)}>
          <View style={estilos.modalSheet}>
            <Text style={estilos.modalTitulo}>Adicionar mídia</Text>
            <TouchableOpacity style={estilos.modalOpcao} onPress={usarCameraFoto}>
              <Text style={estilos.modalOpcaoTexto}>📷 Câmera — Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={estilos.modalOpcao} onPress={usarCameraVideo}>
              <Text style={estilos.modalOpcaoTexto}>🎬 Câmera — Vídeo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={estilos.modalOpcao} onPress={usarGaleria}>
              <Text style={estilos.modalOpcaoTexto}>🖼️ Galeria</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[estilos.modalOpcao, { marginTop: 8 }]} onPress={() => setShowMediaPicker(false)}>
              <Text style={[estilos.modalOpcaoTexto, { color: cores.textoFraco }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: cores.fundoElevado, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: cores.textoForte, marginBottom: 16, textAlign: 'center' },
  modalOpcao: { paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: cores.borda },
  modalOpcaoTexto: { fontSize: 15, color: cores.textoForte, textAlign: 'center' },
  cepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cepOk: { fontSize: 20, marginTop: 28, marginLeft: 12 },
  geoConfirm: { backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: cores.sucesso, borderRadius: raios.medio, padding: 10, marginBottom: 16 },
  geoConfirmTexto: { fontSize: 12, color: cores.sucesso, textAlign: 'center' },
})
