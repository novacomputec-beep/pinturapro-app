import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, Modal,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Keyboard
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario, Input, SeletorLocalidade, PainelMidiaDemanda } from '../../components'
import api from '../../services/api'
import { comRetry } from '../../utils/rede'
import { useFocusEffect } from '@react-navigation/native'
import { bannerInteressadosHomeJaExibido, marcarBannerInteressadosHomeExibido } from '../../utils/sessao'
import { cores, espacos, raios } from '../../utils/tema'
import { useSelecaoMidia, useUploadMidiaDemanda } from '../../utils/midia'
import { softAskRef } from '../../components/SoftAskNotificacao'

const CATEGORIAS = [
  { id: 'hidraulica',   label: '🚿 Hidráulica'   },
  { id: 'eletrica',     label: '⚡ Elétrica'      },
  { id: 'marcenaria',   label: '🪚 Marcenaria'    },
  { id: 'alvenaria',    label: '🧱 Alvenaria'     },
  { id: 'climatizacao', label: '❄️ Climatização'  },
  { id: 'chaveiro',     label: '🔑 Chaveiro'      },
  { id: 'faxina',       label: '🧹 Faxina'        },
  { id: 'eletronica',      label: '📱 Eletrônica'      },
  { id: 'aula_particular', label: '📚 Aula Particular'  },
  { id: 'cuidador',        label: '🤝 Cuidador'        },
  { id: 'jardineiro',      label: '🌳 Jardineiro'      },
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

// Campos obrigatórios em ordem visual (de cima p/ baixo). Usado para, quando o usuário
// tenta publicar incompleto, rolar até o 1º campo com erro e exibir um alerta claro —
// antes a única sinalização era o erro inline (fora da tela, junto ao botão de baixo).
const CAMPOS_OBRIGATORIOS = [
  { chave: 'titulo',        msg: 'Por favor, informe o título do reparo antes de continuar.' },
  { chave: 'urgencia',      msg: 'Selecione o prazo de atendimento antes de continuar.' },
  { chave: 'descricao',     msg: 'Descreva o reparo necessário antes de continuar.' },
  { chave: 'valorEstimado', msg: 'Informe quanto você quer pagar antes de continuar.' },
  { chave: 'cep',           msg: 'Informe um CEP válido antes de continuar.' },
  { chave: 'logradouro',    msg: 'Informe a rua/avenida do endereço antes de continuar.' },
  { chave: 'numero',        msg: 'Informe o número do endereço antes de continuar.' },
  { chave: 'uf',            msg: 'Selecione o estado antes de continuar.' },
  { chave: 'cidade',        msg: 'Selecione a cidade antes de continuar.' },
]

// Gera uma chave de idempotência por sessão de composição (formato UUID v4)
const gerarRequestId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })

export default function CadastrarReparoScreen({ navigation }) {
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('hidraulica')
  const [descricao, setDescricao] = useState('')
  const [valorEstimado, setValorEstimado] = useState('')
  const [urgencia, setUrgencia] = useState(null)
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
  const [reparoPendente, setReparoPendente] = useState(null)
  const enviandoRef = useRef(false)
  const clientRequestIdRef = useRef(gerarRequestId())
  const montadoRef = useRef(true)
  const scrollRef = useRef(null)
  // Posição vertical (offset no ScrollView) de cada campo obrigatório, para rolar até ele.
  const camposYRef = useRef({})
  const registrarY = (...chaves) => (e) => {
    const y = e.nativeEvent.layout.y
    chaves.forEach(c => { camposYRef.current[c] = y })
  }

  useEffect(() => {
    return () => { montadoRef.current = false }
  }, [])

  // Hook compartilhado de upload de mídia (Fase 3): dono do estado dos itens, do
  // upload em 2º plano (quando a flag USAR_UPLOAD_STREAMING está ligada) e do
  // registro pós-criação. O caminho antigo (direto ao Cloudinary) segue ativo
  // enquanto a flag está desligada.
  const midia = useUploadMidiaDemanda({ vertical: 'reparo', montadoRef, logPrefix: '[CadastrarReparo]' })

  useFocusEffect(useCallback(() => {
    setTitulo('')
    setCategoria('hidraulica')
    setDescricao('')
    setValorEstimado('')
    setUrgencia(null)
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
    logPrefix: '[CadastrarReparo]',
    montadoRef,
    setMidias: midia.adicionar,
  })

  // Banner "Parabéns" também na aba inicial (Novo Reparo) — uma vez por sessão,
  // com flag própria (independente da aba Meus Reparos).
  useFocusEffect(useCallback(() => {
    let ativo = true
    ;(async () => {
      if (bannerInteressadosHomeJaExibido()) return
      try {
        const resp = await comRetry(() => api.get('/reparos/minhas'))
        const pendente = (resp.reparos || []).find(r => Number(r.interesses_pendentes) > 0)
        if (pendente && ativo && !bannerInteressadosHomeJaExibido()) {
          marcarBannerInteressadosHomeExibido()
          setReparoPendente(pendente)
          setMostrarBanner(true)
        }
      } catch (err) {
        console.log('[CadastrarReparo] falha ao checar pendentes p/ banner | code:', err.code)
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
    // Zera as coordenadas do CEP anterior: sem isto, corrigir o CEP publicava a
    // localização do primeiro endereço junto com o texto do segundo.
    setLatitude(null)
    setLongitude(null)
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
      // O geocode NÃO acontece aqui: neste ponto o endereço ainda não está completo —
      // falta o número, e em cidade de "CEP geral" falta o próprio logradouro, que o
      // usuário ainda vai digitar. Ele roda no envio, sobre o endereço final.
    } catch (err) {
      console.log('[CadastrarReparo] falha ao buscar CEP | msg:', err.message)
      Alert.alert('Erro', 'Não foi possível buscar o CEP. Verifique sua conexão.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.')
    } finally {
      if (montadoRef.current) setBuscandoCep(false)
    }
  }

  const validar = () => {
    const novos = {}
    if (!titulo.trim()) novos.titulo = 'Informe o título'
    if (!descricao.trim()) novos.descricao = 'Descreva o reparo necessário'
    if (!urgencia) novos.urgencia = 'Selecione o prazo de atendimento'
    if (!uf) novos.uf = 'Selecione o estado'
    if (!cidade) novos.cidade = 'Selecione a cidade'
    if (!cep || cep.length < 8) novos.cep = 'Informe um CEP válido'
    if (enderecoEncontrado && !logradouro.trim()) novos.logradouro = 'Informe a rua/avenida'
    if (enderecoEncontrado && !numero.trim()) novos.numero = 'Informe o número'
    if (!valorEstimado.trim()) novos.valorEstimado = 'Informe quanto você quer pagar'
    setErros(novos)
    return novos
  }

  // Geocodifica o endereço FINAL — com o logradouro que o usuário pode ter digitado.
  // Só roda no envio: é o único momento em que o endereço está completo.
  // SEM logradouro não geocodifica e não manda coordenada nenhuma. Mandar o ponto da
  // cidade como coordenada do cliente faria o servidor tratá-la como precisa, e o card
  // anunciaria "menos de 1 km de você" para a cidade inteira — exatamente a mentira que
  // a supressão por 'centro_cidade' existe para evitar. Sem coordenada, o servidor cai
  // no centro do município e marca a origem honestamente.
  const geocodificarEnderecoFinal = async () => {
    if (!logradouro.trim()) return { lat: null, lng: null }
    const consulta = [logradouro, numero, bairro, cidade, uf, 'Brasil'].filter(Boolean).join(', ')
    try {
      // Teto de 4s: publicar NUNCA espera pelo geocode. Estourou ou falhou, segue sem coordenada.
      const resp = await Promise.race([
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(consulta)}&format=json&limit=1`,
          { headers: { 'User-Agent': 'PinturaPro/1.0' } }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('geocode_timeout')), 4000)),
      ])
      const geoData = await resp.json()
      if (geoData.length > 0) {
        return { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) }
      }
    } catch (err) {
      console.log('[CadastrarReparo] geocode indisponível, publicando sem coordenadas | msg:', err.message)
    }
    return { lat: null, lng: null }
  }

  const selecionarMidia = () => setShowMediaPicker(true)

  // Publica as mídias e trata sucesso total ou parcial (retry só das pendentes).
  // O upload/registro em si vive no hook compartilhado (useUploadMidiaDemanda);
  // aqui ficam apenas os alertas e a navegação, específicos do reparo.
  const finalizarPublicacao = async (reparoId, lista) => {
    const falhas = await midia.publicarMidias(reparoId, lista)
    if (!montadoRef.current) return
    setCarregando(false)
    if (falhas.length === 0) {
      Alert.alert('✅ Reparo publicado!', 'Seu reparo já está visível para prestadores qualificados da sua região!',
        [{ text: 'OK', onPress: () => { navigation.navigate('Meus Reparos'); softAskRef.mostrar?.('dono_reparo') } }], { cancelable: false })
    } else {
      const temVideoFalho = falhas.some(f => f.tipo === 'video')
      const dicaVideo = temVideoFalho
        ? '\n\n📹 Vídeos grandes podem falhar em conexões lentas — tente novamente em Wi-Fi ou grave um vídeo mais curto.'
        : ''
      Alert.alert(
        '⚠️ Reparo criado',
        `Seu reparo foi criado, mas ${falhas.length} mídia(s) não foram enviadas. Deseja tentar enviá-las novamente?${dicaVideo}`,
        [
          { text: 'Tentar novamente', onPress: () => { setCarregando(true); finalizarPublicacao(reparoId, falhas) } },
          { text: 'Continuar assim mesmo', onPress: () => navigation.navigate('Meus Reparos') },
        ],
        { cancelable: false }
      )
    }
  }

  const handleCadastrar = async () => {
    if (enviandoRef.current) return
    if (midia.algumEnviando) { Alert.alert('Aguarde o envio das mídias', 'Suas fotos/vídeos ainda estão sendo enviados. Aguarde a conclusão para publicar.'); return }
    // Validação roda ANTES de qualquer chamada de API ou navegação.
    const novosErros = validar()
    if (Object.keys(novosErros).length > 0) {
      Keyboard.dismiss()
      const primeiro = CAMPOS_OBRIGATORIOS.find(c => novosErros[c.chave])
      if (primeiro) {
        const y = camposYRef.current[primeiro.chave]
        if (scrollRef.current && y != null) {
          scrollRef.current.scrollTo({ y: Math.max(y - 24, 0), animated: true })
        }
        Alert.alert('Campo obrigatório', primeiro.msg)
      }
      return
    }
    enviandoRef.current = true
    setCarregando(true)
    const enderecoCompleto = [logradouro, numero, complemento, bairro, cidade, uf].filter(Boolean).join(', ')
    const geo = await geocodificarEnderecoFinal()
    if (montadoRef.current) { setLatitude(geo.lat); setLongitude(geo.lng) }
    let reparo
    try {
      reparo = await comRetry(() => api.post('/reparos/dono', {
        titulo: titulo.trim(),
        categoria,
        descricao: descricao.trim(),
        valor_estimado: valorEstimado ? parseFloat(valorEstimado.replace(/\./g, '').replace(',', '.')) : null,
        pais: 'Brasil',
        uf: uf.trim(),
        cidade: cidade.trim(),
        bairro: bairro.trim(),
        prazo_atendimento_horas: urgencia,
        endereco_obra: enderecoCompleto,
        latitude: geo.lat,
        longitude: geo.lng,
        client_request_id: clientRequestIdRef.current,
      }))
      // Criação confirmada — rotaciona a chave para a próxima composição (retries de falha reusam a mesma)
      clientRequestIdRef.current = gerarRequestId()
    } catch (e) {
      console.log('[CadastrarReparo] falha ao criar reparo | status:', e.status, '| code:', e.code, '| msg:', e.mensagem)
      const msg = e.mensagem || 'Não foi possível cadastrar o reparo. Tente novamente.'
      Alert.alert('Erro', msg)
      enviandoRef.current = false
      setCarregando(false)
      return
    }
    // Fase de mídia: cada item é isolado; falhas não cancelam as demais e podem ser reenviadas
    if (midia.itens.length === 0) {
      setCarregando(false)
      if (!montadoRef.current) return
      Alert.alert('✅ Reparo publicado!', 'Seu reparo já está visível para prestadores qualificados da sua região!',
        [{ text: 'OK', onPress: () => { navigation.navigate('Meus Reparos'); softAskRef.mostrar?.('dono_reparo') } }], { cancelable: false })
      return
    }
    await finalizarPublicacao(reparo.id)
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      {mostrarBanner && (
        <View style={estilos.bannerParabens}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => {
              setMostrarBanner(false)
              if (reparoPendente) navigation.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: reparoPendente } })
            }}
          >
            <Text style={estilos.bannerParabensTexto}>🎉 Parabéns – seu reparo recebeu interessado(s) · toque para ver</Text>
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
        <ScrollView ref={scrollRef} contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Esta tela é a RAIZ da aba "Novo Reparo" (dono_reparo): a stack da aba só contém
              esta rota (index 0) e não existe "voltar" — por isso a seta nem é renderizada.
              No fluxo empilhado legado (DonoApp, tipo_dono indefinido) a mesma tela é
              empilhada (index > 0) e aí a seta aparece e volta de fato. Checamos o index da
              PRÓPRIA stack — canGoBack() sobe para o tab/root e podia resolver true nesta
              raiz de aba, disparando um goBack() que saía da área do dono. */}
          {(navigation.getState()?.index ?? 0) > 0 && (
            <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
              <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
            </TouchableOpacity>
          )}
          <Text style={estilos.titulo}>Cadastrar{'\n'}reparo</Text>
          <Text style={estilos.subtitulo}>Descreva o reparo e encontre um profissional qualificado</Text>
          <View style={estilos.avisoBanner}>
            <Text style={estilos.avisoIcone}>🎥</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.avisoTitulo}>GRAVE UM VÍDEO DE NO MÁXIMO 30 SEGUNDOS!</Text>
              <Text style={estilos.avisoTexto}>Mostre o problema e narre detalhadamente. Isso acelera muito o atendimento e evita mal-entendidos!</Text>
            </View>
          </View>
          <View onLayout={registrarY('titulo')}>
            <Input label="TÍTULO DO REPARO" placeholder="Ex: Torneira da pia da cozinha vazando" value={titulo} onChangeText={setTitulo} erro={erros.titulo} estiloInput={estilos.tituloBordaAzul} />
          </View>
          <Text style={estilos.labelCategoria}>CATEGORIA</Text>
          <View style={estilos.categoriasRow}>
            {CATEGORIAS.map(c => (
              <TouchableOpacity key={c.id} style={[estilos.categoriaPill, categoria === c.id && estilos.categoriaPillAtivo]} onPress={() => setCategoria(c.id)}>
                <Text style={[estilos.categoriaPillTexto, categoria === c.id && estilos.categoriaPillTextoAtivo]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View onLayout={registrarY('urgencia')}>
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
          </View>
          <View onLayout={registrarY('descricao')}>
            <Input label="DESCRIÇÃO DO PROBLEMA" placeholder="Descreva detalhadamente o que precisa ser feito..." value={descricao} onChangeText={setDescricao} erro={erros.descricao} multiline numberOfLines={4} />
          </View>
          <View onLayout={registrarY('valorEstimado')}>
            <Input label="QUANTO VOCÊ QUER PAGAR (R$)" placeholder="Ex: 150,00" value={valorEstimado} onChangeText={(t) => setValorEstimado(mascararValor(t))} keyboardType="numeric" erro={erros.valorEstimado} />
          </View>
          <Text style={estilos.labelCategoria}>📍 LOCALIZAÇÃO DA OBRA</Text>
          <Text style={estilos.dicaCep}>Comece pelo CEP — estado e cidade são preenchidos automaticamente</Text>
          <View style={estilos.cepRow} onLayout={registrarY('cep')}>
            <Input label="CEP DO LOCAL DO SERVIÇO" placeholder="00000-000" value={cep} onChangeText={buscarCep} keyboardType="numeric" maxLength={8} erro={erros.cep} estilo={{ flex: 1 }} />
            {buscandoCep && <ActivityIndicator color={cores.primaria} style={{ marginTop: 28, marginLeft: 12 }} />}
            {enderecoEncontrado && !buscandoCep && <Text style={estilos.cepOk}>✅</Text>}
          </View>
          {enderecoEncontrado && (
            <>
              {/* Editável: em cidade pequena de "CEP geral" o ViaCEP não devolve logradouro,
                  e travar o campo deixava o usuário sem nenhuma forma de informar a rua. */}
              <View onLayout={registrarY('logradouro')}>
                <Input label="LOGRADOURO (rua/avenida)" placeholder="Preenchido pelo CEP — ou digite a rua" value={logradouro} onChangeText={setLogradouro} erro={erros.logradouro} />
              </View>
              <View style={estilos.duasColunas} onLayout={registrarY('numero')}>
                <Input label="NÚMERO" placeholder="Ex: 123" value={numero} onChangeText={setNumero} keyboardType="numeric" erro={erros.numero} estilo={{ flex: 1 }} />
                <Input label="COMPLEMENTO" placeholder="Ap, sala..." value={complemento} onChangeText={setComplemento} estilo={{ flex: 1 }} />
              </View>
              <Input label="BAIRRO" value={bairro} onChangeText={setBairro} />
              {/* Antes dependia de `latitude`, preenchida na busca do CEP. O geocode passou
                  para o envio, então o gatilho aqui é ter a rua — que é o que de fato
                  permite localizar o reparo. */}
              {logradouro.trim() !== '' && (
                <View style={estilos.geoConfirm}>
                  <Text style={estilos.geoConfirmTexto}>📍 Endereço completo — prestadores próximos serão notificados!</Text>
                </View>
              )}
            </>
          )}
          <View onLayout={registrarY('uf', 'cidade')}>
            <SeletorLocalidade
              uf={uf}
              cidade={cidade}
              onChange={({ uf: u, cidade: c }) => { setUf(u); setCidade(c || '') }}
              erroEstado={erros.uf}
              erroCidade={erros.cidade}
            />
          </View>
          <PainelMidiaDemanda
            itens={midia.itens}
            onAbrirPicker={selecionarMidia}
            onRemover={midia.remover}
            onReenviar={midia.reenviar}
          />
          <Text style={estilos.avisoUpload}>⏳ A publicação pode demorar até 1 minuto. Não saia da tela até ser notificado!</Text>
          <BotaoPrimario titulo="Publicar reparo →" onPress={handleCadastrar} carregando={carregando} desabilitado={midia.algumEnviando} estilo={{ marginTop: 8 }} />
          {carregando && <Text style={estilos.avisoUpload}>📤 Enviando fotos, aguarde...</Text>}
          <Text style={estilos.aviso}>Seu reparo será publicado imediatamente e profissionais qualificados da sua região poderão demonstrar interesse.</Text>
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
  // Borda azul SÓ no título (destaca o campo). Aplicada via estiloInput no box do
  // TextInput — o estilo compartilhado (components: estilos.input) não é alterado.
  tituloBordaAzul: { borderColor: cores.info, borderWidth: 1.5 },
  labelCategoria: { fontSize: 11, color: cores.textoForte, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  erroTexto: { fontSize: 11, color: cores.perigo, marginBottom: 8 },
  categoriasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoriaPill: { width: '31%', alignItems: 'center', backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
  categoriaPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  categoriaPillTexto: { fontSize: 12, color: cores.textoMedio, textAlign: 'center' },
  categoriaPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  urgenciasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  urgenciaCard: { width: '48%', backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12 },
  urgenciaCardAtivo: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  urgenciaLabel: { fontSize: 13, fontWeight: '600', color: cores.textoForte, marginBottom: 2, textAlign: 'center' },
  urgenciaDesc: { fontSize: 11, color: cores.textoFraco, textAlign: 'center' },
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
