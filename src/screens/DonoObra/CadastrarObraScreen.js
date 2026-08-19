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
import { cores, espacos, raios, alturas } from '../../utils/tema'
import { useSelecaoMidia, useUploadMidiaDemanda } from '../../utils/midia'
import { softAskRef } from '../../components/SoftAskNotificacao'

const CATEGORIAS = [
  { id: 'residencial',   label: '🏠 Residencial'   },
  { id: 'comercial',     label: '🏢 Comercial'      },
  { id: 'galpao',        label: '🏭 Galpão'         },
  { id: 'rural',         label: '🌾 Rural'          },
  { id: 'institucional', label: '🏛️ Institucional'  },
  { id: 'outros',        label: '🔨 Outros'         },
]

const PRAZOS = [
  { id: 24,   label: '📅 Hoje',           desc: 'Início hoje'          },
  { id: 168,  label: '📆 Esta semana',    desc: 'Início esta semana'   },
  { id: 720,  label: '🗓️ Este mês',        desc: 'Início este mês'      },
  { id: 1440, label: '📋 Mês que vem',    desc: 'Início mês que vem'   },
  { id: 2160, label: '⏳ Mais de um mês', desc: 'Sem urgência'         },
  { id: 'data', label: '📅 Defina a data inicial', desc: 'Escolha uma data específica' },
]

// Gera uma chave de idempotência por sessão de composição (formato UUID v4)
const gerarRequestId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })

// Converte "dd/mm/aaaa" no FIM do dia escolhido (23:59:59.999 local); null se não for um
// dia de calendário real (rejeita 31/02 etc., que o Date "rolaria" para o mês seguinte).
const fimDoDiaData = (str) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str || '')
  if (!m) return null
  const dia = parseInt(m[1], 10), mes = parseInt(m[2], 10), ano = parseInt(m[3], 10)
  const d = new Date(ano, mes - 1, dia, 23, 59, 59, 999)
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null
  return d
}

// horas_para_expirar equivalente à data inicial: do agora até o fim do dia escolhido.
// Mín. 1h para que o dia inteiro escolhido conte como "antes do início" (mesma semântica
// dos buckets em horas). null se a data for inválida.
const horasAteData = (str) => {
  const fim = fimDoDiaData(str)
  if (!fim) return null
  return Math.max(1, Math.ceil((fim.getTime() - Date.now()) / 3600000))
}

// Nome IANA do fuso do APARELHO (ex.: 'America/Sao_Paulo', 'America/Rio_Branco'). O
// servidor precisa dele para resolver "fim do dia de hoje" no fuso de quem publica: o app
// roda em todo o Brasil, e Acre é UTC-5 enquanto São Paulo é UTC-3 — fixar um fuso erraria
// o prazo em duas horas para o outro lado do país.
//
// Intl.DateTimeFormat().resolvedOptions().timeZone é a ÚNICA fonte disponível aqui sem
// dependência nova: não há expo-localization nem react-native-localize no projeto.
//
// Devolve undefined quando não dá para confiar na resposta, e nesse caso o campo
// simplesmente não vai no corpo. NUNCA devolve offset no lugar do nome: '-03:00' não diz
// em que fuso o aparelho está (Cuiabá e São Paulo compartilham offset em parte do ano) e
// mandá-lo como se fosse o nome faria o servidor calcular sobre um dado errado sem ter
// como perceber. O teste de '/' é o que separa um nome de região ('America/Sao_Paulo') de
// um retorno degenerado ('', 'UTC') — nenhum fuso brasileiro é 'UTC'.
const fusoDoAparelho = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof tz === 'string' && tz.includes('/') ? tz : undefined
  } catch (err) {
    console.log('[CadastrarObra] fuso do aparelho indisponível | msg:', err?.message)
    return undefined
  }
}

export default function CadastrarObraScreen({ navigation }) {
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('residencial')
  const [descricao, setDescricao] = useState('')
  const [valorEstimado, setValorEstimado] = useState('')
  const [prazo, setPrazo] = useState(null)
  const [dataInicial, setDataInicial] = useState('')
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  // Opcional e independente do CEP: ajuda o profissional a achar o local ("portão azul",
  // "em frente à padaria"). Fica sempre visível, inclusive sem CEP válido.
  const [pontoReferencia, setPontoReferencia] = useState('')
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enderecoEncontrado, setEnderecoEncontrado] = useState(false)
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const enviandoRef = useRef(false)
  // Criação confirmada pelo servidor: é o que autoriza o reset no próximo foco. Não dá
  // para reaproveitar enviandoRef aqui — ele já é true durante o envio, e uma ida a
  // outra aba no meio de um POST que ainda pode falhar apagaria o formulário à toa.
  const submetidoRef = useRef(false)
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

  // Reset APÓS ENVIO BEM-SUCEDIDO — espelha CadastrarReparoScreen para que ambas se
  // comportem de forma idêntica. Após um envio bem-sucedido navegamos para 'Minhas
  // Obras' (outra aba); ao voltar para 'Nova Obra' o foco dispara este reset, limpando
  // as mídias e liberando os bitmaps de preview. Em caso de FALHA o usuário permanece
  // nesta mesma tela (sem nova transição de foco), então os anexos NÃO são descartados
  // e podem ser reenviados.
  // O foco sozinho não diz POR QUE a tela foi focada: sem a trava abaixo, uma simples
  // ida-e-volta de aba era indistinguível do retorno pós-envio e apagava um formulário
  // já preenchido. Só a criação confirmada arma o reset, e ele se desarma ao rodar.
  useFocusEffect(useCallback(() => {
    if (!submetidoRef.current) return
    submetidoRef.current = false
    setTitulo('')
    setCategoria('residencial')
    setDescricao('')
    setValorEstimado('')
    setPrazo(null)
    setDataInicial('')
    midia.resetar()
    setCep('')
    setLogradouro('')
    setNumero('')
    setComplemento('')
    setBairro('')
    setCidade('')
    setUf('')
    setPontoReferencia('')
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

  const mascararValor = (valor) => {
    const nums = valor.replace(/\D/g, '')
    if (!nums) return ''
    const centavos = Math.min(parseInt(nums, 10), 9999999999)
    const reais = Math.floor(centavos / 100)
    const cents = centavos % 100
    const reaisStr = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${reaisStr},${String(cents).padStart(2, '0')}`
  }

  // Máscara dd/mm/aaaa no mesmo estilo de mascararValor: extrai só dígitos e formata
  // conforme o usuário digita. Sem dependência de picker/máscara.
  const mascararData = (valor) => {
    const nums = valor.replace(/\D/g, '').slice(0, 8)
    if (nums.length <= 2) return nums
    if (nums.length <= 4) return `${nums.slice(0, 2)}/${nums.slice(2)}`
    return `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4)}`
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
    if (!prazo) novos.prazo = 'Selecione o prazo para iniciar o serviço'
    else if (prazo === 'data') {
      const fim = fimDoDiaData(dataInicial)
      if (!fim || fim.getTime() <= Date.now()) novos.dataInicial = 'Informe uma data futura válida (dd/mm/aaaa)'
    }
    if (!uf) novos.uf = 'Selecione o estado'
    if (!cidade) novos.cidade = 'Selecione a cidade'
    if (!cep || cep.length < 8) novos.cep = 'Informe um CEP válido'
    if (enderecoEncontrado && !logradouro.trim()) novos.logradouro = 'Informe a rua/avenida'
    if (enderecoEncontrado && !numero.trim()) novos.numero = 'Informe o número'
    if (!valorEstimado.trim()) novos.valorEstimado = 'Informe o valor oferecido'
    setErros(novos)
    return Object.keys(novos).length === 0
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
          { headers: { 'User-Agent': 'ProLar/1.0' } }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('geocode_timeout')), 4000)),
      ])
      const geoData = await resp.json()
      if (geoData.length > 0) {
        return { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) }
      }
    } catch (err) {
      console.log('[CadastrarObra] geocode indisponível, publicando sem coordenadas | msg:', err.message)
    }
    return { lat: null, lng: null }
  }

  const selecionarMidia = () => setShowMediaPicker(true)

  // Publica as mídias e trata sucesso total ou parcial (retry só das pendentes).
  // O upload/registro em si vive no hook compartilhado (useUploadMidiaDemanda);
  // aqui ficam apenas os alertas e a navegação, específicos da obra.
  const finalizarPublicacao = async (obraId, lista, statusAprovacao) => {
    const falhas = await midia.publicarMidias(obraId, lista)
    if (!montadoRef.current) return
    setCarregando(false)
    // Só a igualdade explícita com 'aprovada' anuncia publicação: qualquer outro valor
    // (pendente, ausente, resposta antiga sem o campo) cai no texto de análise, que é a
    // alegação mais fraca — anunciar "já está visível" para uma obra que não está seria pior.
    const jaAprovada = statusAprovacao === 'aprovada'
    if (falhas.length === 0) {
      Alert.alert(
        jaAprovada ? '✅ Obra publicada!' : '✅ Obra enviada para análise!',
        jaAprovada
          ? 'Sua obra já está visível para os profissionais qualificados da sua região. Ela ainda pode passar por uma revisão da nossa equipe no horário comercial.'
          : 'Sua obra foi recebida e passará por uma breve aprovação. Em breve estará visível para profissionais qualificados da sua região!',
        [{ text: 'OK', onPress: () => { navigation.navigate('Minhas Obras'); softAskRef.mostrar?.('dono_obra') } }], { cancelable: false })
    } else {
      const temVideoFalho = falhas.some(f => f.tipo === 'video')
      const dicaVideo = temVideoFalho
        ? '\n\n📹 Vídeos grandes podem falhar em conexões lentas — tente novamente em Wi-Fi ou grave um vídeo mais curto.'
        : ''
      // A aprovação é dita AQUI também: este ramo substitui o alerta de sucesso, e sem
      // repetir o aviso o dono que tropeça numa mídia nunca fica sabendo que a obra
      // ainda passa por análise.
      const fraseAprovacao = jaAprovada
        ? 'Sua obra já está visível para os profissionais qualificados da sua região. Ela ainda pode passar por uma revisão da nossa equipe no horário comercial.'
        : 'Sua obra foi recebida e passará por uma breve aprovação.'
      Alert.alert(
        jaAprovada ? '⚠️ Obra publicada (mídias pendentes)' : '⚠️ Obra enviada para análise (mídias pendentes)',
        `${fraseAprovacao} Mas ${falhas.length} mídia(s) não foram enviadas. Deseja tentar enviá-las novamente?${dicaVideo}`,
        [
          { text: 'Tentar novamente', onPress: () => { setCarregando(true); finalizarPublicacao(obraId, falhas, statusAprovacao) } },
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
    const geo = await geocodificarEnderecoFinal()
    if (montadoRef.current) { setLatitude(geo.lat); setLongitude(geo.lng) }
    // Só a faixa "Hoje" (id 24 da lista PRAZOS). O teste é sobre a ESCOLHA do usuário, não
    // sobre o número de horas: o seletor de data também pode render 24 em horas_para_expirar
    // por coincidência, e ali "hoje" não foi pedido — mandar o modo naquele caso mudaria o
    // prazo de quem escolheu uma data. Lido uma vez só, antes do corpo.
    const fusoHoje = prazo === 24 ? fusoDoAparelho() : null
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
        horas_para_expirar: prazo === 'data' ? horasAteData(dataInicial) : prazo,
        // Os dois campos abaixo SÓ existem no corpo da faixa "Hoje". Em qualquer outra faixa
        // o spread é `{}` e o corpo sai idêntico ao de antes, chave por chave: o ramo de
        // fallback do servidor (o das horas) depende de prazo_modo estar AUSENTE, não de
        // valer outra coisa. Duas guardas separadas porque são condições diferentes — a
        // faixa escolhida e a disponibilidade do fuso.
        ...(prazo === 24 ? { prazo_modo: 'hoje' } : {}),
        ...(fusoHoje ? { timezone: fusoHoje } : {}),
        endereco_obra: enderecoCompleto,
        // Campo livre e opcional: vazio vira null em vez de string vazia.
        ponto_referencia: pontoReferencia.trim() || null,
        latitude: geo.lat,
        longitude: geo.lng,
        client_request_id: clientRequestIdRef.current,
      }))
      // Criação confirmada — rotaciona a chave para a próxima composição (retries de falha reusam a mesma)
      clientRequestIdRef.current = gerarRequestId()
      // A obra existe: daqui em diante o retorno a esta aba é um recomeço, e só agora o
      // reset por foco fica armado. Vale para os dois desfechos abaixo (com e sem mídia),
      // inclusive quando alguma mídia falha — a obra já foi criada de qualquer forma.
      submetidoRef.current = true
    } catch (e) {
      console.log('[CadastrarObra] falha ao criar obra | status:', e.status, '| code:', e.code, '| msg:', e.mensagem)
      const msg = e.mensagem || 'Não foi possível cadastrar a obra. Tente novamente.'
      Alert.alert('Erro', msg)
      enviandoRef.current = false
      setCarregando(false)
      return
    }
    // Estado real de aprovação vindo da criação: decide se o alerta anuncia publicação ou
    // análise. Lido uma vez aqui e repassado, para os dois desfechos abaixo dizerem o mesmo.
    const statusAprovacao = obra?.status_aprovacao
    const jaAprovada = statusAprovacao === 'aprovada'
    // Fase de mídia: cada item é isolado; falhas não cancelam as demais e podem ser reenviadas
    if (midia.itens.length === 0) {
      setCarregando(false)
      if (!montadoRef.current) return
      Alert.alert(
        jaAprovada ? '✅ Obra publicada!' : '✅ Obra enviada para análise!',
        jaAprovada
          ? 'Sua obra já está visível para os profissionais qualificados da sua região. Ela ainda pode passar por uma revisão da nossa equipe no horário comercial.'
          : 'Sua obra foi recebida e passará por uma breve aprovação. Em breve estará visível para profissionais qualificados da sua região!',
        [{ text: 'OK', onPress: () => { navigation.navigate('Minhas Obras'); softAskRef.mostrar?.('dono_obra') } }], { cancelable: false })
      return
    }
    await finalizarPublicacao(obra.id, undefined, statusAprovacao)
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Esta tela é a RAIZ da aba "Nova Obra" (dono_obra): a stack da aba só contém
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
          <Text style={estilos.titulo}>Cadastrar{'\n'}obra</Text>
          <Text style={estilos.subtitulo}>Descreva a obra e encontre um profissional qualificado</Text>
          <View style={estilos.avisoBanner}>
            <Text style={estilos.avisoIcone}>🎥</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.avisoTitulo}>GRAVE UM VÍDEO DE NO MÁXIMO 30 SEGUNDOS!</Text>
              <Text style={estilos.avisoTexto}>Mostre o local da obra e narre detalhadamente. Isso acelera muito o atendimento e evita mal-entendidos!</Text>
            </View>
          </View>
          <Input label="TÍTULO DA OBRA" placeholder="Ex: Pintura interna residência 3 quartos" value={titulo} onChangeText={setTitulo} erro={erros.titulo} estiloInput={estilos.tituloBordaAzul} />
          <Text style={estilos.labelCategoria}>CATEGORIA</Text>
          <View style={estilos.categoriasRow}>
            {CATEGORIAS.map(c => (
              <TouchableOpacity key={c.id} style={[estilos.categoriaPill, categoria === c.id && estilos.categoriaPillAtivo]} onPress={() => setCategoria(c.id)}>
                <Text style={[estilos.categoriaPillTexto, categoria === c.id && estilos.categoriaPillTextoAtivo]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={estilos.labelCategoria}>⏰ PRAZO PARA INICIAR O SERVIÇO</Text>
          {erros.prazo && <Text style={estilos.erroTexto}>{erros.prazo}</Text>}
          <View style={estilos.urgenciasGrid}>
            {PRAZOS.map(p => (
              <TouchableOpacity key={p.id} style={[estilos.urgenciaCard, prazo === p.id && estilos.urgenciaCardAtivo]} onPress={() => setPrazo(p.id)}>
                <Text style={estilos.urgenciaLabel}>{p.label}</Text>
                <Text style={estilos.urgenciaDesc}>{p.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {prazo === 'data' && (
            <Input
              label="DATA INICIAL DA OBRA"
              placeholder="dd/mm/aaaa"
              value={dataInicial}
              onChangeText={(t) => setDataInicial(mascararData(t))}
              keyboardType="numeric"
              maxLength={10}
              erro={erros.dataInicial}
            />
          )}
          <Input label="DESCRIÇÃO DA OBRA" placeholder="Descreva detalhadamente o que precisa ser feito..." value={descricao} onChangeText={setDescricao} erro={erros.descricao} multiline numberOfLines={4} />
          <Input label="VALOR OFERECIDO PARA A OBRA (R$)" placeholder="Ex: 2.500,00" value={valorEstimado} onChangeText={(t) => setValorEstimado(mascararValor(t))} keyboardType="numeric" erro={erros.valorEstimado} />
          <Text style={estilos.labelCategoria}>📍 LOCALIZAÇÃO DA OBRA</Text>
          <Text style={estilos.dicaCep}>Comece pelo CEP — estado e cidade são preenchidos automaticamente</Text>
          <View style={estilos.cepRow}>
            <Input label="CEP DO LOCAL DA OBRA" placeholder="00000-000" value={cep} onChangeText={buscarCep} keyboardType="numeric" maxLength={8} erro={erros.cep} estilo={{ flex: 1 }} />
            {buscandoCep && <ActivityIndicator color={cores.primaria} style={{ marginTop: 28, marginLeft: 12 }} />}
            {enderecoEncontrado && !buscandoCep && <Text style={estilos.cepOk}>✅</Text>}
          </View>
          {/* Sempre visível: não depende de enderecoEncontrado, porque é justamente em
              endereço difícil (CEP geral, sem logradouro) que a referência mais ajuda. */}
          <Input
            label="PONTO DE REFERÊNCIA (opcional)"
            placeholder="Ex: portão azul, em frente à padaria"
            value={pontoReferencia}
            onChangeText={setPontoReferencia}
          />
          {enderecoEncontrado && (
            <>
              {/* Editável: em cidade pequena de "CEP geral" o ViaCEP não devolve logradouro,
                  e travar o campo deixava o usuário sem nenhuma forma de informar a rua. */}
              <Input label="LOGRADOURO (rua/avenida)" placeholder="Preenchido pelo CEP — ou digite a rua" value={logradouro} onChangeText={setLogradouro} erro={erros.logradouro} />
              <View style={estilos.duasColunas}>
                <Input label="NÚMERO" placeholder="Ex: 123" value={numero} onChangeText={setNumero} keyboardType="numeric" erro={erros.numero} estilo={{ flex: 1 }} />
                <Input label="COMPLEMENTO" placeholder="Ap, sala..." value={complemento} onChangeText={setComplemento} estilo={{ flex: 1 }} />
              </View>
              <Input label="BAIRRO" value={bairro} onChangeText={setBairro} />
              {/* Antes dependia de `latitude`, preenchida na busca do CEP. O geocode passou
                  para o envio, então o gatilho aqui é ter a rua — que é o que de fato
                  permite localizar a obra. */}
              {logradouro.trim() !== '' && (
                <View style={estilos.geoConfirm}>
                  <Text style={estilos.geoConfirmTexto}>📍 Endereço completo — profissionais próximos serão notificados!</Text>
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
          {/* Acima do botão, e não abaixo: embaixo o aviso ficava fora da dobra, em 11px
              apagados, e era lido depois de publicar — quando já não informa decisão nenhuma. */}
          <Text style={estilos.avisoUpload}>Sua obra passará por uma breve aprovação antes de ser publicada. Após aprovação, profissionais qualificados da sua região serão notificados.</Text>
          <BotaoPrimario titulo="Publicar obra →" onPress={handleCadastrar} carregando={carregando} desabilitado={midia.algumEnviando} estilo={{ marginTop: 8 }} />
          {carregando && <Text style={estilos.avisoUpload}>📤 Enviando mídias, aguarde... Sua obra já está cadastrada; o envio das mídias pode levar alguns minutos em conexões lentas.</Text>}
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
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico, paddingTop: 16 },
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
  categoriaPill: { width: '48%', alignItems: 'center', backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
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
