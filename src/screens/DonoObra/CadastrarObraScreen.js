import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, Modal,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Keyboard
} from 'react-native'
import { BotaoPrimario, Input, SeletorLocalidade, PainelMidiaDemanda } from '../../components'
import api from '../../services/api'
import { comRetry } from '../../utils/rede'
import { useFocusEffect } from '@react-navigation/native'
import { bannerInteressadosHomeJaExibido, marcarBannerInteressadosHomeExibido } from '../../utils/sessao'
import { cores, espacos, raios } from '../../utils/tema'
import { useSelecaoMidia, useUploadMidiaDemanda } from '../../utils/midia'

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

  // Hook compartilhado de upload de mídia (Fase 3): dono do estado dos itens, do
  // upload em 2º plano (quando a flag USAR_UPLOAD_STREAMING está ligada) e do
  // registro pós-criação. O caminho antigo (direto ao Cloudinary) segue ativo
  // enquanto a flag está desligada.
  const midia = useUploadMidiaDemanda({ vertical: 'obra', montadoRef, logPrefix: '[CadastrarObra]' })

  // Reset completo ao focar a tela — espelha CadastrarReparoScreen para que ambas
  // se comportem de forma idêntica. Após um envio bem-sucedido navegamos para
  // 'Minhas Obras' (outra aba); ao voltar para 'Nova Obra' o foco dispara este
  // reset, limpando as mídias e liberando os bitmaps de preview. Em caso de FALHA
  // o usuário permanece nesta mesma tela (sem nova transição de foco), então os
  // anexos NÃO são descartados e podem ser reenviados.
  useFocusEffect(useCallback(() => {
    setTitulo('')
    setCategoria('residencial')
    setDescricao('')
    setValorEstimado('')
    setPrazo(null)
    midia.resetar()
    setCep('')
    setLogradouro('')
    setNumero('')
    setComplemento('')
    setBairro('')
    setCidade('')
    setUf('')
    setLatitude(null)
    setLongitude(null)
    setErros({})
    setEnderecoEncontrado(false)
    setBuscandoCep(false)
    enviandoRef.current = false
  }, []))

  // Handlers de captura/seleção de mídia + recuperação de resultados perdidos na
  // destruição da MainActivity (Android). Implementação única em utils/midia.
  const { usarCameraFoto, usarCameraVideo, usarGaleria } = useSelecaoMidia({
    logPrefix: '[CadastrarObra]',
    montadoRef,
    setMidias: midia.adicionar,
  })

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

  // Publica as mídias e trata sucesso total ou parcial (retry só das pendentes).
  // O upload/registro em si vive no hook compartilhado (useUploadMidiaDemanda);
  // aqui ficam apenas os alertas e a navegação, específicos da obra.
  const finalizarPublicacao = async (obraId, lista) => {
    const falhas = await midia.publicarMidias(obraId, lista)
    if (!montadoRef.current) return
    setCarregando(false)
    if (falhas.length === 0) {
      Alert.alert('✅ Obra enviada para análise!', 'Sua obra foi recebida e passará por uma breve aprovação. Em breve estará visível para pintores qualificados da sua região!',
        [{ text: 'OK', onPress: () => navigation.navigate('Minhas Obras') }], { cancelable: false })
    } else {
      const temVideoFalho = falhas.some(f => f.tipo === 'video')
      const dicaVideo = temVideoFalho
        ? '\n\n📹 Vídeos grandes podem falhar em conexões lentas — tente novamente em Wi-Fi ou grave um vídeo mais curto.'
        : ''
      Alert.alert(
        '⚠️ Obra criada',
        `Sua obra foi criada, mas ${falhas.length} mídia(s) não foram enviadas. Deseja tentar enviá-las novamente?${dicaVideo}`,
        [
          { text: 'Tentar novamente', onPress: () => { setCarregando(true); finalizarPublicacao(obraId, falhas) } },
          { text: 'Continuar assim mesmo', onPress: () => navigation.navigate('Minhas Obras') },
        ],
        { cancelable: false }
      )
    }
  }

  const handleCadastrar = async () => {
    if (enviandoRef.current) return
    if (midia.algumEnviando) { Alert.alert('Aguarde o envio das mídias', 'Suas fotos/vídeos ainda estão sendo enviados. Aguarde a conclusão para publicar.'); return }
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
    if (midia.itens.length === 0) {
      setCarregando(false)
      if (!montadoRef.current) return
      Alert.alert('✅ Obra enviada para análise!', 'Sua obra foi recebida e passará por uma breve aprovação. Em breve estará visível para pintores qualificados da sua região!',
        [{ text: 'OK', onPress: () => navigation.navigate('Minhas Obras') }], { cancelable: false })
      return
    }
    await finalizarPublicacao(obra.id)
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
          <PainelMidiaDemanda
            itens={midia.itens}
            onAbrirPicker={selecionarMidia}
            onRemover={midia.remover}
            onReenviar={midia.reenviar}
          />
          <Text style={estilos.avisoUpload}>⏳ A publicação pode demorar até 1 minuto. Não saia da tela até ser notificado!</Text>
          <BotaoPrimario titulo="Publicar obra →" onPress={handleCadastrar} carregando={carregando} desabilitado={midia.algumEnviando} estilo={{ marginTop: 8 }} />
          {carregando && <Text style={estilos.avisoUpload}>📤 Enviando fotos, aguarde...</Text>}
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
  aviso: { fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 12, lineHeight: 18 },
  avisoUpload: { fontSize: 12, color: cores.primaria, textAlign: 'center', marginTop: 12, marginBottom: 4, fontWeight: '600', lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: cores.fundoCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: cores.textoForte, marginBottom: 16, textAlign: 'center' },
  modalOpcao: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 16, alignItems: 'center', marginBottom: 8 },
  modalOpcaoTexto: { fontSize: 15, color: cores.textoForte, fontWeight: '500' },
})
