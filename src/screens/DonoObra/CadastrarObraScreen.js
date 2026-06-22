import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Modal,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Keyboard
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'react-native'
import { Audio } from 'expo-av'
import { BotaoPrimario, Input, SeletorLocalidade } from '../../components'
import api from '../../services/api'
import { comRetry } from '../../utils/rede'
import { useFocusEffect } from '@react-navigation/native'
import { bannerInteressadosHomeJaExibido, marcarBannerInteressadosHomeExibido } from '../../utils/sessao'
import { cores, espacos, raios } from '../../utils/tema'

const CATEGORIAS = [
  { id: 'residencial',   label: '🏠 Residencial'   },
  { id: 'comercial',     label: '🏢 Comercial'      },
  { id: 'galpao',        label: '🏭 Galpão'         },
  { id: 'rural',         label: '🌾 Rural'          },
  { id: 'institucional', label: '🏛️ Institucional'  },
  { id: 'outros',        label: '🔨 Outros'         },
]

const PRAZOS = [
  { id: 24,   label: '📅 Hoje',           desc: 'Execução hoje'        },
  { id: 168,  label: '📆 Esta semana',    desc: 'Execução esta semana' },
  { id: 720,  label: '🗓️ Este mês',        desc: 'Execução este mês'    },
  { id: 1440, label: '📋 Mês que vem',    desc: 'Execução mês que vem' },
  { id: 2160, label: '⏳ Mais de um mês', desc: 'Sem urgência'         },
]

const MAX_UPLOAD_RETRIES = 2
const TIMEOUT_FOTO  = 45000    // 45s — fotos são pequenas (quality 0.6)
const TIMEOUT_VIDEO = 180000   // 180s — vídeos são muito maiores; 45s estourava em conexões móveis
// isVideo ajusta o timeout; backoff exponencial (2s, 6s, 18s) entre tentativas
const xhrUpload = (url, form, { isVideo = false } = {}) => new Promise((resolve, reject) => {
  const attempt = (n) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.timeout = isVideo ? TIMEOUT_VIDEO : TIMEOUT_FOTO
    const retryOu = (rejeitar) => { if (n < MAX_UPLOAD_RETRIES) setTimeout(() => attempt(n + 1), 2000 * Math.pow(3, n)); else rejeitar() }
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText)) }
      catch (e) {
        console.log('[xhrUpload] falha ao parsear resposta JSON | tentativa:', n, '| status:', xhr.status)
        retryOu(() => reject(new Error('Resposta inválida do servidor de upload')))
      }
    }
    xhr.onerror   = () => retryOu(() => reject(new Error('Falha na conexão com o servidor de upload')))
    xhr.ontimeout = () => retryOu(() => { const e = new Error('Tempo esgotado no upload da mídia'); e.code = 'UPLOAD_TIMEOUT'; reject(e) })
    xhr.send(form)
  }
  attempt(0)
})

// Gera uma chave de idempotência por sessão de composição (formato UUID v4)
const gerarRequestId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })

export default function CadastrarObraScreen({ navigation }) {
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('residencial')
  const [descricao, setDescricao] = useState('')
  const [valorEstimado, setValorEstimado] = useState('')
  const [prazo, setPrazo] = useState(null)
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
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const [mostrarBanner, setMostrarBanner] = useState(false)
  const [obraPendente, setObraPendente] = useState(null)
  const enviandoRef = useRef(false)
  const clientRequestIdRef = useRef(gerarRequestId())
  const montadoRef = useRef(true)

  useEffect(() => {
    return () => { montadoRef.current = false }
  }, [])

  // Banner "Parabéns" também na aba inicial (Nova Obra) — uma vez por sessão,
  // com flag própria (independente da aba Minhas Obras).
  useFocusEffect(useCallback(() => {
    let ativo = true
    ;(async () => {
      if (bannerInteressadosHomeJaExibido()) return
      try {
        const resp = await api.get('/obras/minhas')
        const pendente = (resp.obras || []).find(o => Number(o.candidaturas_pendentes) > 0)
        if (pendente && ativo && !bannerInteressadosHomeJaExibido()) {
          marcarBannerInteressadosHomeExibido()
          setObraPendente(pendente)
          setMostrarBanner(true)
        }
      } catch (err) {
        console.log('[CadastrarObra] falha ao checar pendentes p/ banner | code:', err.code)
      }
    })()
    return () => { ativo = false }
  }, []))

  const mascararValor = (valor) => {
    const nums = valor.replace(/\D/g, '')
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
      if (montadoRef.current) {
        setLogradouro(dados.logradouro || '')
        setBairro(dados.bairro || '')
        setCidade(dados.localidade || '')
        setUf(dados.uf || '')
        setEnderecoEncontrado(true)
      }
      const endereco = `${dados.logradouro}, ${dados.localidade}, ${dados.uf}, Brasil`
      const geoResp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endereco)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'PinturaPro/1.0' } }
      )
      const geoData = await geoResp.json()
      if (geoData.length > 0 && montadoRef.current) {
        setLatitude(parseFloat(geoData[0].lat))
        setLongitude(parseFloat(geoData[0].lon))
      }
    } catch (err) {
      console.log('[CadastrarObra] falha ao buscar CEP | msg:', err.message)
      Alert.alert('Erro', 'Não foi possível buscar o CEP. Verifique sua conexão.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.')
    } finally {
      if (montadoRef.current) setBuscandoCep(false)
    }
  }

  const validar = () => {
    const novos = {}
    if (!titulo.trim()) novos.titulo = 'Informe o título'
    if (!descricao.trim()) novos.descricao = 'Descreva a obra necessária'
    if (!prazo) novos.prazo = 'Selecione o prazo de execução'
    if (!uf) novos.uf = 'Selecione o estado'
    if (!cidade) novos.cidade = 'Selecione a cidade'
    if (!cep || cep.length < 8) novos.cep = 'Informe um CEP válido'
    if (enderecoEncontrado && !numero.trim()) novos.numero = 'Informe o número'
    if (!valorEstimado.trim()) novos.valorEstimado = 'Informe o valor oferecido'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const selecionarMidia = () => setShowMediaPicker(true)

  const usarCameraFoto = async () => {
    Keyboard.dismiss()
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera.'); return }
    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      allowsEditing: false,
    })
    if (!resultado.canceled) setMidias(prev => [...prev, ...resultado.assets])
  }

  const usarCameraVideo = async () => {
    Keyboard.dismiss()
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera.'); return }
    await Audio.requestPermissionsAsync()
    const resultado = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 30,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
      allowsEditing: false,
    })
    if (!resultado.canceled) setMidias(prev => [...prev, ...resultado.assets])
  }

  const usarGaleria = async () => {
    Keyboard.dismiss()
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria.'); return }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.6,
      videoMaxDuration: 30,
    })
    if (!resultado.canceled) setMidias(prev => [...prev, ...resultado.assets])
  }

  const removerMidia = (index) => setMidias(prev => prev.filter((_, i) => i !== index))

  // Upload de uma mídia (vídeo ou foto) para o Cloudinary + registro no backend
  const uploadUmaMidia = async ({ midia, ordem }, obraId) => {
    const isVideo = midia.type === 'video'
    const tipo = isVideo ? 'video' : 'foto'
    // GET idempotente; comRetry cobre timeout/5xx de cold start do Railway
    const params = await comRetry(() => isVideo
      ? api.get('/upload/assinatura-cloudinary')
      : api.get('/upload/assinatura-cloudinary', { params: { folder: 'pinturapro/fotos' } }),
      { timeout: true, servidor: true })
    const cloudForm = new FormData()
    cloudForm.append('file', isVideo
      ? { uri: midia.uri, type: 'video/mp4', name: `video_${ordem}.mp4` }
      : { uri: midia.uri, type: 'image/jpeg', name: `foto_${ordem}.jpg` })
    cloudForm.append('timestamp', String(params.timestamp))
    cloudForm.append('signature', params.signature)
    cloudForm.append('api_key', params.api_key)
    cloudForm.append('folder', params.folder)
    const cloudData = await xhrUpload(`https://api.cloudinary.com/v1_1/${params.cloud_name}/${isVideo ? 'video' : 'image'}/upload`, cloudForm, { isVideo })
    if (cloudData.error || !cloudData.secure_url) throw new Error(cloudData.error?.message || `Erro no upload de ${tipo}`)
    // Idempotente por slot (obra_id, ordem) no backend; seguro repetir em cold start
    await comRetry(() => api.post('/upload/obra-url', { obra_id: obraId, url: cloudData.secure_url, tipo, ordem }), { timeout: true, servidor: true })
  }

  // Envia a lista de mídias isolando cada item; retorna apenas as que falharam
  const enviarMidias = async (lista, obraId) => {
    const falhas = []
    for (const item of lista) {
      try {
        await uploadUmaMidia(item, obraId)
      } catch (err) {
        console.log('[CadastrarObra] falha no upload de mídia | ordem:', item.ordem, '| code:', err.code, '| msg:', err.message)
        falhas.push(item)
      }
    }
    return falhas
  }

  // Publica as mídias e trata sucesso total ou parcial (retry só das pendentes)
  const finalizarPublicacao = async (lista, obraId) => {
    const falhas = await enviarMidias(lista, obraId)
    if (!montadoRef.current) return
    setCarregando(false)
    if (falhas.length === 0) {
      Alert.alert('✅ Obra enviada para análise!', 'Sua obra foi recebida e passará por uma breve aprovação. Em breve estará visível para pintores qualificados da sua região!',
        [{ text: 'OK', onPress: () => navigation.navigate('Minhas Obras') }], { cancelable: false })
    } else {
      const temVideoFalho = falhas.some(f => f.midia?.type === 'video')
      const dicaVideo = temVideoFalho
        ? '\n\n📹 Vídeos grandes podem falhar em conexões lentas — tente novamente em Wi-Fi ou grave um vídeo mais curto.'
        : ''
      Alert.alert(
        '⚠️ Obra criada',
        `Sua obra foi criada, mas ${falhas.length} mídia(s) não foram enviadas. Deseja tentar enviá-las novamente?${dicaVideo}`,
        [
          { text: 'Tentar novamente', onPress: () => { setCarregando(true); finalizarPublicacao(falhas, obraId) } },
          { text: 'Continuar assim mesmo', onPress: () => navigation.navigate('Minhas Obras') },
        ],
        { cancelable: false }
      )
    }
  }

  const handleCadastrar = async () => {
    if (enviandoRef.current) return
    if (!validar()) return
    enviandoRef.current = true
    setCarregando(true)
    const enderecoCompleto = [logradouro, numero, complemento, bairro, cidade, uf].filter(Boolean).join(', ')
    let obra
    try {
      obra = await comRetry(() => api.post('/obras/dono', {
        titulo: titulo.trim(),
        categoria,
        descricao: descricao.trim(),
        valor: valorEstimado ? parseFloat(valorEstimado.replace(/\./g, '').replace(',', '.')) : null,
        pais: 'Brasil',
        uf: uf.trim(),
        cidade: cidade.trim(),
        bairro: bairro.trim(),
        horas_para_expirar: prazo,
        endereco_obra: enderecoCompleto,
        latitude,
        longitude,
        client_request_id: clientRequestIdRef.current,
      }))
      // Criação confirmada — rotaciona a chave para a próxima composição (retries de falha reusam a mesma)
      clientRequestIdRef.current = gerarRequestId()
    } catch (e) {
      console.log('[CadastrarObra] falha ao criar obra | status:', e.status, '| code:', e.code, '| msg:', e.mensagem)
      const msg = e.mensagem || 'Não foi possível cadastrar a obra. Tente novamente.'
      Alert.alert('Erro', msg)
      enviandoRef.current = false
      setCarregando(false)
      return
    }
    // Fase de mídia: cada item é isolado; falhas não cancelam as demais e podem ser reenviadas
    const itens = midias.map((midia, idx) => ({ midia, ordem: idx + 1 }))
    if (itens.length === 0) {
      setCarregando(false)
      if (!montadoRef.current) return
      Alert.alert('✅ Obra enviada para análise!', 'Sua obra foi recebida e passará por uma breve aprovação. Em breve estará visível para pintores qualificados da sua região!',
        [{ text: 'OK', onPress: () => navigation.navigate('Minhas Obras') }], { cancelable: false })
      return
    }
    await finalizarPublicacao(itens, obra.id)
  }

  return (
    <SafeAreaView style={estilos.container}>
      {mostrarBanner && (
        <View style={estilos.bannerParabens}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => {
              setMostrarBanner(false)
              if (obraPendente) navigation.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: obraPendente } })
            }}
          >
            <Text style={estilos.bannerParabensTexto}>🎉 Parabéns – sua obra recebeu interessado(s) · toque para ver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMostrarBanner(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={estilos.bannerParabensFechar}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
          </TouchableOpacity>
          <Text style={estilos.titulo}>Cadastrar{'\n'}obra</Text>
          <Text style={estilos.subtitulo}>Descreva a obra e encontre um profissional qualificado</Text>
          <View style={estilos.avisoBanner}>
            <Text style={estilos.avisoIcone}>🎥</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.avisoTitulo}>GRAVE UM VÍDEO DE NO MÁXIMO 30 SEGUNDOS!</Text>
              <Text style={estilos.avisoTexto}>Mostre o local da obra e narre detalhadamente. Isso acelera muito o atendimento e evita mal-entendidos!</Text>
            </View>
          </View>
          <Input label="TÍTULO DA OBRA" placeholder="Ex: Pintura interna residência 3 quartos" value={titulo} onChangeText={setTitulo} erro={erros.titulo} />
          <Text style={estilos.labelCategoria}>CATEGORIA</Text>
          <View style={estilos.categoriasRow}>
            {CATEGORIAS.map(c => (
              <TouchableOpacity key={c.id} style={[estilos.categoriaPill, categoria === c.id && estilos.categoriaPillAtivo]} onPress={() => setCategoria(c.id)}>
                <Text style={[estilos.categoriaPillTexto, categoria === c.id && estilos.categoriaPillTextoAtivo]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={estilos.labelCategoria}>⏰ PRAZO DE EXECUÇÃO</Text>
          {erros.prazo && <Text style={estilos.erroTexto}>{erros.prazo}</Text>}
          <View style={estilos.urgenciasGrid}>
            {PRAZOS.map(p => (
              <TouchableOpacity key={p.id} style={[estilos.urgenciaCard, prazo === p.id && estilos.urgenciaCardAtivo]} onPress={() => setPrazo(p.id)}>
                <Text style={estilos.urgenciaLabel}>{p.label}</Text>
                <Text style={estilos.urgenciaDesc}>{p.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Input label="DESCRIÇÃO DA OBRA" placeholder="Descreva detalhadamente o que precisa ser feito..." value={descricao} onChangeText={setDescricao} erro={erros.descricao} multiline numberOfLines={4} />
          <Input label="VALOR OFERECIDO PARA A OBRA (R$)" placeholder="Ex: 2.500,00" value={valorEstimado} onChangeText={(t) => setValorEstimado(mascararValor(t))} keyboardType="numeric" erro={erros.valorEstimado} />
          <Text style={estilos.labelCategoria}>📍 LOCALIZAÇÃO DA OBRA</Text>
          <Text style={estilos.dicaCep}>Comece pelo CEP — estado e cidade são preenchidos automaticamente</Text>
          <View style={estilos.cepRow}>
            <Input label="CEP DO LOCAL DA OBRA" placeholder="00000-000" value={cep} onChangeText={buscarCep} keyboardType="numeric" maxLength={8} erro={erros.cep} estilo={{ flex: 1 }} />
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
          <SeletorLocalidade
            uf={uf}
            cidade={cidade}
            onChange={({ uf: u, cidade: c }) => { setUf(u); setCidade(c || '') }}
            erroEstado={erros.uf}
            erroCidade={erros.cidade}
          />
          <Text style={estilos.labelCategoria}>FOTOS E VÍDEOS</Text>
          <TouchableOpacity style={estilos.uploadBtn} onPress={selecionarMidia}>
            <Text style={estilos.uploadIcone}>📎</Text>
            <Text style={estilos.uploadTexto}>Adicionar fotos e vídeos</Text>
          </TouchableOpacity>
          <Text style={estilos.dicaMidia}>📹 Filme no máximo 30 segundos para melhor resultado</Text>
          {midias.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {midias.map((item, index) => (
                <View key={index} style={estilos.midiaItem}>
                  <Image source={{ uri: item.uri }} style={estilos.midiaImagem} />
                  {item.type === 'video' && <View style={estilos.videoOverlay}><Text style={{ color: 'white', fontSize: 20 }}>▶</Text></View>}
                  <TouchableOpacity style={estilos.midiaRemover} onPress={() => removerMidia(index)}>
                    <Text style={{ color: 'white', fontSize: 12 }}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          <Text style={estilos.avisoUpload}>⏳ A publicação pode demorar até 1 minuto. Não saia da tela até ser notificado!</Text>
          <BotaoPrimario titulo="Publicar obra →" onPress={handleCadastrar} carregando={carregando} estilo={{ marginTop: 8 }} />
          <Text style={estilos.aviso}>Sua obra passará por uma breve aprovação antes de ser publicada. Após aprovação, pintores qualificados da sua região serão notificados.</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showMediaPicker} transparent animationType="slide" onRequestClose={() => setShowMediaPicker(false)}>
        <TouchableOpacity style={estilos.modalOverlay} activeOpacity={1} onPress={() => setShowMediaPicker(false)}>
          <View style={estilos.modalSheet}>
            <Text style={estilos.modalTitulo}>Adicionar mídia</Text>
            <TouchableOpacity style={estilos.modalOpcao} onPress={() => { Keyboard.dismiss(); setShowMediaPicker(false); setTimeout(() => usarCameraFoto(), 500) }}>
              <Text style={estilos.modalOpcaoTexto}>📷 Câmera — Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={estilos.modalOpcao} onPress={() => { Keyboard.dismiss(); setShowMediaPicker(false); setTimeout(() => usarCameraVideo(), 500) }}>
              <Text style={estilos.modalOpcaoTexto}>🎬 Câmera — Vídeo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={estilos.modalOpcao} onPress={() => { Keyboard.dismiss(); setShowMediaPicker(false); setTimeout(() => usarGaleria(), 500) }}>
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
  bannerParabens:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.medio, marginHorizontal: espacos.tela, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12 },
  bannerParabensTexto:  { flex: 1, color: '#4caf50', fontWeight: '700', fontSize: 13 },
  bannerParabensFechar: { color: '#4caf50', fontSize: 15, fontWeight: '700', paddingLeft: 12 },
  btnVoltar: { marginTop: 60, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 16, lineHeight: 20 },
  avisoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#1a2a1a', borderWidth: 1.5, borderColor: cores.sucesso, borderRadius: raios.grande, padding: 16, marginBottom: 20 },
  avisoIcone: { fontSize: 32 },
  avisoTitulo: { fontSize: 13, fontWeight: '800', color: cores.sucesso, letterSpacing: 0.5, marginBottom: 4 },
  avisoTexto: { fontSize: 12, color: '#a0c8a0', lineHeight: 18 },
  labelCategoria: { fontSize: 11, color: cores.textoForte, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
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
  dicaCep: { fontSize: 11, color: cores.textoMedio, marginBottom: 10, marginTop: -2 },
  duasColunas: { flexDirection: 'row', gap: 12 },
  geoConfirm: { backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: cores.sucesso, borderRadius: raios.medio, padding: 10, marginBottom: 16 },
  geoConfirmTexto: { fontSize: 12, color: cores.sucesso, textAlign: 'center' },
  dicaMidia: { fontSize: 12, color: cores.textoFraco, marginBottom: 10, lineHeight: 18 },
  uploadBtn: { borderWidth: 1.5, borderColor: cores.borda, borderStyle: 'dashed', borderRadius: raios.medio, padding: 20, alignItems: 'center', marginBottom: 10, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  uploadIcone: { fontSize: 20 },
  uploadTexto: { fontSize: 14, color: cores.textoMedio },
  midiaItem: { width: 100, height: 100, marginRight: 8, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  midiaImagem: { width: '100%', height: '100%' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  midiaRemover: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  aviso: { fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 12, lineHeight: 18 },
  avisoUpload: { fontSize: 12, color: cores.primaria, textAlign: 'center', marginTop: 12, marginBottom: 4, fontWeight: '600', lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: cores.fundoCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: cores.textoForte, marginBottom: 16, textAlign: 'center' },
  modalOpcao: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 16, alignItems: 'center', marginBottom: 8 },
  modalOpcaoTexto: { fontSize: 15, color: cores.textoForte, fontWeight: '500' },
})
