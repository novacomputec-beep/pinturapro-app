import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert, FlatList, ActivityIndicator
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'react-native'
import { BotaoPrimario, Input } from '../../components'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const CATEGORIAS = [
  { id: 'hidraulica',   label: '🚿 Hidráulica'   },
  { id: 'eletrica',     label: '💡 Elétrica'      },
  { id: 'marcenaria',   label: '🪚 Marcenaria'    },
  { id: 'alvenaria',    label: '🏠 Alvenaria'     },
  { id: 'climatizacao', label: '❄️ Climatização'  },
  { id: 'outros',       label: '🔨 Outros'        },
]

const URGENCIAS = [
  { id: 1,   label: '🔴 1 hora',      desc: 'Urgência máxima' },
  { id: 2,   label: '🟠 2 horas',     desc: 'Muito urgente'   },
  { id: 4,   label: '🟡 4 horas',     desc: 'Urgente'         },
  { id: 8,   label: '🟢 8 horas',     desc: 'Hoje'            },
  { id: 24,  label: '📅 Amanhã',      desc: 'Sem pressa'      },
  { id: 72,  label: '📆 Esta semana', desc: 'Flexível'        },
]

export default function CadastrarReparoScreen({ navigation }) {
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('hidraulica')
  const [descricao, setDescricao] = useState('')
  const [valorEstimado, setValorEstimado] = useState('')
  const [urgencia, setUrgencia] = useState(null)
  const [midias, setMidias] = useState([])
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enderecoEncontrado, setEnderecoEncontrado] = useState(false)

  const mascararValor = (valor) => {
    const nums = valor.replace(/\D/g, '')
    if (!nums) return ''
    const numero = parseInt(nums) / 100
    return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
    if (!descricao.trim()) novos.descricao = 'Descreva o reparo necessário'
    if (!urgencia) novos.urgencia = 'Selecione o prazo de atendimento'
    if (!cep || cep.length < 8) novos.cep = 'Informe um CEP válido'
    if (!numero.trim()) novos.numero = 'Informe o número'
    if (!valorEstimado.trim()) novos.valorEstimado = 'Informe quanto você quer pagar'
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
            const resultado = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              quality: 0.7,
              videoMaxDuration: 60,
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
              videoMaxDuration: 60,
            })
            if (!resultado.canceled) setMidias(prev => [...prev, ...resultado.assets])
          }
        },
        { text: 'Cancelar', style: 'cancel' }
      ]
    )
  }

  const removerMidia = (index) => setMidias(prev => prev.filter((_, i) => i !== index))

  const handleCadastrar = async () => {
    if (carregando) return
    if (!validar()) return
    setCarregando(true)
    try {
      const enderecoCompleto = [logradouro, numero, complemento, bairro, cidade, uf].filter(Boolean).join(', ')
      const reparo = await api.post('/reparos/dono', {
        titulo: titulo.trim(),
        categoria,
        descricao: descricao.trim(),
        valor_estimado: valorEstimado ? parseFloat(valorEstimado.replace(/\./g, '').replace(',', '.')) : null,
        cidade: cidade.trim(),
        bairro: bairro.trim(),
        prazo_atendimento_horas: urgencia,
        endereco_obra: enderecoCompleto,
        latitude,
        longitude,
      })
      if (midias.length > 0) {
        for (let i = 0; i < midias.length; i++) {
          const midia = midias[i]
          const formData = new FormData()
          const isVideo = midia.type === 'video'
          formData.append('arquivo', { uri: midia.uri, type: isVideo ? 'video/mp4' : 'image/jpeg', name: isVideo ? `video_${i}.mp4` : `foto_${i}.jpg` })
          formData.append('reparo_id', reparo.id)
          formData.append('ordem', i + 1)
          await api.post('/upload/reparo', formData, { timeout: 120000 })
        }
      }
      Alert.alert('✅ Reparo publicado!', 'Seu reparo já está visível para prestadores qualificados da sua região!', [{ text: 'OK', onPress: () => navigation.goBack() }])
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
          <View style={estilos.avisoBanner}>
            <Text style={estilos.avisoIcone}>🎥</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.avisoTitulo}>GRAVE UM VÍDEO DE 30 SEGUNDOS!</Text>
              <Text style={estilos.avisoTexto}>Mostre o problema e narre detalhadamente. Isso acelera muito o atendimento e evita mal-entendidos!</Text>
            </View>
          </View>
          <Input label="TÍTULO DO REPARO" placeholder="Ex: Torneira da pia da cozinha vazando" value={titulo} onChangeText={setTitulo} erro={erros.titulo} />
          <Text style={estilos.labelCategoria}>CATEGORIA</Text>
          <View style={estilos.categoriasRow}>
            {CATEGORIAS.map(c => (
              <TouchableOpacity key={c.id} style={[estilos.categoriaPill, categoria === c.id && estilos.categoriaPillAtivo]} onPress={() => setCategoria(c.id)}>
                <Text style={[estilos.categoriaPillTexto, categoria === c.id && estilos.categoriaPillTextoAtivo]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={estilos.labelCategoria}>⏰ PRAZO DE ATENDIMENTO</Text>
          {erros.urgencia && <Text style={estilos.erroTexto}>{erros.urgencia}</Text>}
          <View style={estilos.urgenciasGrid}>
            {URGENCIAS.map(u => (
              <TouchableOpacity key={u.id} style={[estilos.urgenciaCard, urgencia === u.id && estilos.urgenciaCardAtivo]} onPress={() => setUrgencia(u.id)}>
                <Text style={estilos.urgenciaLabel}>{u.label}</Text>
                <Text style={estilos.urgenciaDesc}>{u.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Input label="DESCRIÇÃO DO PROBLEMA" placeholder="Descreva detalhadamente o que precisa ser feito..." value={descricao} onChangeText={setDescricao} erro={erros.descricao} multiline numberOfLines={4} />
          <Input label="QUANTO VOCÊ QUER PAGAR (R$)" placeholder="Ex: 150,00" value={valorEstimado} onChangeText={(t) => setValorEstimado(mascararValor(t))} keyboardType="numeric" erro={erros.valorEstimado} />
          <Text style={estilos.labelCategoria}>📍 LOCALIZAÇÃO DA OBRA</Text>
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
              <View style={estilos.duasColunas}>
                <Input label="BAIRRO" value={bairro} onChangeText={setBairro} estilo={{ flex: 1 }} />
                <Input label="CIDADE/UF" value={`${cidade}/${uf}`} editable={false} estilo={{ flex: 1, backgroundColor: cores.fundoElevado }} />
              </View>
              {latitude && (
                <View style={estilos.geoConfirm}>
                  <Text style={estilos.geoConfirmTexto}>📍 Localização encontrada — prestadores próximos serão notificados!</Text>
                </View>
              )}
            </>
          )}
          <Text style={estilos.labelCategoria}>FOTOS E VÍDEOS</Text>
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
                  {item.type === 'video' && <View style={estilos.videoOverlay}><Text style={{ color: 'white', fontSize: 20 }}>▶</Text></View>}
                  <TouchableOpacity style={estilos.midiaRemover} onPress={() => removerMidia(index)}>
                    <Text style={{ color: 'white', fontSize: 12 }}>×</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
          <BotaoPrimario titulo="Publicar reparo →" onPress={handleCadastrar} carregando={carregando} estilo={{ marginTop: 8 }} />
          <Text style={estilos.aviso}>Seu reparo será publicado imediatamente e profissionais qualificados da sua região poderão demonstrar interesse.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40, paddingTop: 16 },
  btnVoltar: { marginTop: 4, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 16, lineHeight: 20 },
  avisoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#1a2a1a', borderWidth: 1.5, borderColor: cores.sucesso, borderRadius: raios.grande, padding: 16, marginBottom: 20 },
  avisoIcone: { fontSize: 32 },
  avisoTitulo: { fontSize: 13, fontWeight: '800', color: cores.sucesso, letterSpacing: 0.5, marginBottom: 4 },
  avisoTexto: { fontSize: 12, color: '#a0c8a0', lineHeight: 18 },
  labelCategoria: { fontSize: 11, color: cores.textoFraco, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  erroTexto: { fontSize: 11, color: cores.perigo, marginBottom: 8 },
  categoriasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
  categoriaPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  categoriaPillTexto: { fontSize: 12, color: cores.textoMedio },
  categoriaPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  urgenciasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  urgenciaCard: { width: '48%', backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12 },
  urgenciaCardAtivo: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  urgenciaLabel: { fontSize: 13, fontWeight: '600', color: cores.textoForte, marginBottom: 2 },
  urgenciaDesc: { fontSize: 11, color: cores.textoFraco },
  cepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cepOk: { fontSize: 20, marginTop: 28, marginLeft: 12 },
  duasColunas: { flexDirection: 'row', gap: 12 },
  geoConfirm: { backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: cores.sucesso, borderRadius: raios.medio, padding: 10, marginBottom: 16 },
  geoConfirmTexto: { fontSize: 12, color: cores.sucesso, textAlign: 'center' },
  uploadBtn: { borderWidth: 1.5, borderColor: cores.borda, borderStyle: 'dashed', borderRadius: raios.medio, padding: 20, alignItems: 'center', marginBottom: 16, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  uploadIcone: { fontSize: 20 },
  uploadTexto: { fontSize: 14, color: cores.textoMedio },
  midiaItem: { width: 100, height: 100, marginRight: 8, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  midiaImagem: { width: '100%', height: '100%' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  midiaRemover: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  aviso: { fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 12, lineHeight: 18 },
})