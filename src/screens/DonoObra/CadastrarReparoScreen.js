import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, Modal, TouchableOpacity, Alert, Keyboard, BackHandler, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import api from '../../services/api'
import { comRetry, mensagemErroRede } from '../../utils/rede'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { cores, raios, alturas } from '../../utils/tema'
import { useSelecaoMidia, useUploadMidiaDemanda } from '../../utils/midia'
import useArrastarParaFechar from '../../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from '../../components/BotaoFecharFolha'
import { softAskRef } from '../../components/SoftAskNotificacao'
import { avisarPedidoRef } from '../../components/AvisarPedidoSheet'
import { CATEGORIAS_SERVICO, MAX_CATEGORIAS_DEMANDA } from '../../utils/categorias'
import { gruposComCategorias, contagemPorGrupo, SLUG_OUTROS } from '../../utils/gruposServico'
import { carregarGruposCategorias, sugerirRelacionadas } from '../../services/gruposCategorias'
import BannerComoFunciona from '../../components/BannerComoFunciona'
import { cadastro } from '../../components/RetomadaMatchHost'
import { useBarraServicoVisivel } from '../../components/BarraServicoEmAndamento'
import {
  MolduraWizard, RodapeWizard, GradeGrupos, ChipsEscolhidos, Sugestoes, FolhaGrupo,
  PassoDetalhes, PassoPrazoValor, PassoEndereco, AvisosPublicar, PASSO_DO_CAMPO, TOTAL_PASSOS,
} from './CadastrarServicoPassos'

// Cadastro de serviço do dono em 4 passos (Arte-Cadastrar-Servico): grupos → detalhes →
// prazo e valor → endereço. SÓ o layout mudou: estado, validações, payload de POST
// /reparos/dono, fluxo de mídia, sugestões, reset pós-envio e o sinal para a
// RetomadaMatchHost são os de sempre. As peças de tela moram em
// ./CadastrarServicoPassos; os grupos e exemplos em utils/gruposServico.
//
// Fase 1 (Arte-Fase1-Contratar): esta tela é a raiz da aba "Novo pedido" do dono, com o
// título "Cadastrar pedido". O passo 1 ganhou o tile "Obras de Construção Civil", que
// empilha o CadastrarObraScreen (o ← de lá volta aos grupos). A antiga bifurcação de
// Alvenaria ("Pedreiro ou ajudante" → obra) saiu: a porta para a obra é o tile, e Alvenaria
// é uma categoria como as outras.
//
// Até MAX_CATEGORIAS_DEMANDA (3) categorias por serviço, começando sem nenhuma marcada: a
// escolha é da pessoa (e obrigatória, ver validar/CAMPOS_OBRIGATORIOS). A primeira marcada
// vai como `categoria` (a coluna de sempre) e a lista inteira como `categorias`.

// Rota desta tela como raiz da aba "Novo pedido" (AppNavigator). É por ela que o título vira
// "Cadastrar pedido" e que o banner "Como funciona" aparece no passo 1.
const ROTA_NOVO_PEDIDO = 'CadastrarPedidoMain'

// Campos obrigatórios em ordem visual (de cima p/ baixo, passo a passo). Quando a pessoa
// tenta avançar/publicar incompleto, a tela vai ao passo do 1º campo com erro, rola até ele
// e mostra um alerta claro.
const CAMPOS_OBRIGATORIOS = [
  { chave: 'categorias',    msg: 'Escolha ao menos uma categoria antes de continuar.' },
  { chave: 'titulo',        msg: 'Por favor, informe o título do serviço antes de continuar.' },
  { chave: 'descricao',     msg: 'Descreva o serviço necessário antes de continuar.' },
  { chave: 'urgencia',      msg: 'Selecione o prazo para iniciar o serviço antes de continuar.' },
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

const CATEGORIA_POR_SLUG = new Map(CATEGORIAS_SERVICO.map((c) => [c.slug, c]))

export default function CadastrarReparoScreen({ navigation, route }) {
  const [passo, setPasso] = useState(1)
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [titulo, setTitulo] = useState('')
  const [categorias, setCategorias] = useState([])
  // slug → slugs do grupo dele (services/gruposCategorias). Vazio até a resposta chegar, e
  // vazio de vez se ela falhar: sem grupos não há sugestão, e o cadastro segue igual.
  const [grupoDoSlugApi, setGrupoDoSlugApi] = useState({})
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
  // Opcional e independente do CEP: ajuda o profissional a achar o local ("portão azul",
  // "em frente à padaria"). Fica sempre visível, inclusive sem CEP válido.
  const [pontoReferencia, setPontoReferencia] = useState('')
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enderecoEncontrado, setEnderecoEncontrado] = useState(false)
  // Picker de mídia: null = fechado; 'video' / 'foto' (vindo dos dois botões grandes, cada
  // um oferece câmera OU galeria) / 'todas' (as três opções de sempre).
  const [pickerMidia, setPickerMidia] = useState(null)
  // Folha do grupo aberto no passo 1 (objeto de gruposComCategorias) ou null.
  const [grupoAberto, setGrupoAberto] = useState(null)
  const enviandoRef = useRef(false)
  // Criação confirmada pelo servidor: é o que autoriza o reset no próximo foco. Não dá
  // para reaproveitar enviandoRef aqui — ele já é true durante o envio, e uma ida a
  // outra aba no meio de um POST que ainda pode falhar apagaria o formulário à toa.
  const submetidoRef = useRef(false)
  const clientRequestIdRef = useRef(gerarRequestId())
  const montadoRef = useRef(true)
  const scrollRef = useRef(null)
  // Posição vertical (offset no ScrollView) de cada campo obrigatório, para rolar até ele.
  // Só os campos do passo atual estão montados, então a troca de passo zera o mapa.
  const camposYRef = useRef({})
  // Campo a rolar DEPOIS de trocar de passo por erro (o layout do passo novo ainda não existe
  // no momento do setPasso).
  const rolarAteRef = useRef(null)
  const registrarY = (...chaves) => (e) => {
    const y = e.nativeEvent.layout.y
    chaves.forEach(c => { camposYRef.current[c] = y })
  }

  const grupos = useMemo(() => gruposComCategorias(), [])
  // A barra "Agendado" flutua sobre o rodapé da aba: enquanto ela existe, o rodapé fixo sobe.
  const reservaInferior = useBarraServicoVisivel() ? alturas.barraServico : 0

  useEffect(() => {
    return () => { montadoRef.current = false }
  }, [])

  // Hook compartilhado de upload de mídia (Fase 3): dono do estado dos itens, do
  // upload em 2º plano (quando a flag USAR_UPLOAD_STREAMING está ligada) e do
  // registro pós-criação. O caminho antigo (direto ao Cloudinary) segue ativo
  // enquanto a flag está desligada.
  const midia = useUploadMidiaDemanda({ vertical: 'reparo', montadoRef, logPrefix: '[CadastrarReparo]' })

  // Reset APÓS ENVIO BEM-SUCEDIDO — espelhado em CadastrarObraScreen. Após um envio
  // bem-sucedido navegamos para 'Meus pedidos' (outra aba); ao voltar para 'Novo pedido'
  // o foco dispara este reset, limpando as mídias e liberando os bitmaps de preview. Em
  // caso de FALHA o usuário permanece nesta mesma tela (sem nova transição de foco),
  // então os anexos NÃO são descartados e podem ser reenviados.
  // O foco sozinho não diz POR QUE a tela foi focada: sem a trava abaixo, uma simples
  // ida-e-volta de aba era indistinguível do retorno pós-envio e apagava um formulário
  // já preenchido. Só a criação confirmada arma o reset, e ele se desarma ao rodar.
  // midia.resetar é estável.
  // Volta ao passo 1: depois de publicar, a próxima composição começa limpa, do começo.
  const limparFormulario = useCallback(() => {
    setPasso(1)
    setTitulo('')
    setCategorias([])
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
    setPontoReferencia('')
    setLatitude(null)
    setLongitude(null)
    setErros({})
    setEnderecoEncontrado(false)
    setBuscandoCep(false)
    setGrupoAberto(null)
    enviandoRef.current = false
  }, [midia.resetar])

  useFocusEffect(useCallback(() => {
    if (!submetidoRef.current) return
    submetidoRef.current = false
    limparFormulario()
  }, [limparFormulario]))

  // Volta ao topo a cada foco: aba que fica montada preserva o scroll entre idas e
  // vindas, e o formulário reaparecia no meio. Efeito separado do reset acima (que só
  // roda pós-envio) e sem conflito com o scroll de validação (que roda no submit).
  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, []))

  // Troca de passo: zera as posições (o passo novo registra as suas) e rola — ao topo, ou
  // até o campo com erro que motivou a troca, depois de o layout dele existir.
  useEffect(() => {
    camposYRef.current = {}
    const chave = rolarAteRef.current
    rolarAteRef.current = null
    if (!chave) { scrollRef.current?.scrollTo({ y: 0, animated: false }); return }
    const t = setTimeout(() => {
      const y = camposYRef.current[chave]
      scrollRef.current?.scrollTo({ y: y != null ? Math.max(y - 24, 0) : 0, animated: true })
    }, 120)
    return () => clearTimeout(t)
  }, [passo])

  // Voltar do Android: com folha aberta o Modal cuida (onRequestClose); senão, passo
  // anterior sem perder nada. No passo 1 segue o comportamento de sempre (sai da tela).
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (grupoAberto || pickerMidia) return false
      if (passo > 1) { setPasso(p => p - 1); return true }
      return false
    })
    return () => sub.remove()
  }, [passo, grupoAberto, pickerMidia]))

  // Handlers de captura/seleção de mídia + recuperação de resultados perdidos na
  // destruição da MainActivity (Android). Implementação única em utils/midia.
  const { usarCameraFoto, usarCameraVideo, usarGaleria } = useSelecaoMidia({
    logPrefix: '[CadastrarReparo]',
    montadoRef,
    setMidias: midia.adicionar,
  })

  // Sinal de cadastro em uso para o RetomadaMatchHost (ver `cadastro` lá): qualquer campo
  // fora do valor inicial ou mídia anexada, enquanto ESTA instância está focada — o
  // redirecionamento do 2º plano desiste só de dentro de um formulário em uso. Cai ao
  // enviar (campos limpos), ao perder o foco ou ao desmontar.
  const focado = useIsFocused()
  const temConteudo = !!(
    titulo || descricao || valorEstimado || urgencia != null || categorias.length > 0 ||
    cep || logradouro || numero || complemento || bairro || cidade || uf || pontoReferencia ||
    midia.itens.length > 0
  )

  // Grupos de categorias relacionadas (sugestões), uma vez por montagem (a requisição é uma
  // por processo, ver o serviço). Guardado por montadoRef para não escrever em tela desmontada.
  useEffect(() => {
    carregarGruposCategorias().then(g => { if (montadoRef.current) setGrupoDoSlugApi(g || {}) })
  }, [])
  useEffect(() => {
    if (!focado) return
    cadastro.comConteudo = temConteudo
    return () => { cadastro.comConteudo = false }
  }, [focado, temConteudo])

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
      Alert.alert('Erro', await mensagemErroRede('Não foi possível buscar o CEP. Verifique sua conexão.'))
    } finally {
      if (montadoRef.current) setBuscandoCep(false)
    }
  }

  // As MESMAS regras de sempre, de uma vez. `validarPasso` filtra o resultado para o passo.
  const validarTudo = () => {
    const novos = {}
    if (categorias.length === 0) novos.categorias = 'Escolha ao menos uma categoria'
    if (!titulo.trim()) novos.titulo = 'Informe o título'
    if (!descricao.trim()) novos.descricao = 'Descreva o serviço necessário'
    if (!urgencia) novos.urgencia = 'Selecione o prazo para iniciar o serviço'
    if (!uf) novos.uf = 'Selecione o estado'
    if (!cidade) novos.cidade = 'Selecione a cidade'
    if (!cep || cep.length < 8) novos.cep = 'Informe um CEP válido'
    if (enderecoEncontrado && !logradouro.trim()) novos.logradouro = 'Informe a rua/avenida'
    if (enderecoEncontrado && !numero.trim()) novos.numero = 'Informe o número'
    if (!valorEstimado.trim()) novos.valorEstimado = 'Informe quanto você quer pagar'
    return novos
  }
  const validarPasso = (p) => {
    const tudo = validarTudo()
    const doPasso = {}
    for (const chave of Object.keys(tudo)) if (PASSO_DO_CAMPO[chave] === p) doPasso[chave] = tudo[chave]
    setErros(doPasso)
    return doPasso
  }
  const validar = () => {
    const novos = validarTudo()
    setErros(novos)
    return novos
  }

  // Vai ao passo do 1º campo com erro (na ordem visual), rola até ele e avisa.
  const apontarErro = (novosErros) => {
    Keyboard.dismiss()
    const primeiro = CAMPOS_OBRIGATORIOS.find(c => novosErros[c.chave])
    if (!primeiro) return
    const alvo = PASSO_DO_CAMPO[primeiro.chave] || passo
    if (alvo !== passo) {
      rolarAteRef.current = primeiro.chave
      setPasso(alvo)
    } else {
      const y = camposYRef.current[primeiro.chave]
      if (scrollRef.current && y != null) scrollRef.current.scrollTo({ y: Math.max(y - 24, 0), animated: true })
    }
    Alert.alert('Campo obrigatório', primeiro.msg)
  }

  // "Continuar": valida só o passo atual e segue.
  const avancar = () => {
    const novos = validarPasso(passo)
    if (Object.keys(novos).length > 0) { apontarErro(novos); return }
    Keyboard.dismiss()
    setPasso(p => Math.min(p + 1, TOTAL_PASSOS))
  }

  // "←" e voltar do Android: passo anterior, sem perder nada. No passo 1, a seta só existe
  // fora da raiz da aba (fluxo empilhado legado) e aí volta de fato.
  const voltarPasso = () => {
    Keyboard.dismiss()
    if (passo > 1) setPasso(p => p - 1)
    else navigation.goBack()
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
          { headers: { 'User-Agent': 'ProTudo/1.0' } }),
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

  // Toque numa linha da folha, no tile "Não achei" ou num chip de sugestão. Marcada →
  // desmarca. Não marcada → entra, se ainda há vaga (no limite as linhas restantes ficam
  // desabilitadas, então este guarda é para o chip de sugestão e para toques em sequência).
  const noLimite = categorias.length >= MAX_CATEGORIAS_DEMANDA
  const selecionarCategoria = (id) => {
    if (categorias.includes(id)) { setCategorias(categorias.filter(c => c !== id)); return }
    if (noLimite) return
    setCategorias([...categorias, id])
  }

  // Sugestões: vizinhas de grupo (da API) do que já está marcado, ainda não marcadas.
  const sugestoes = sugerirRelacionadas(grupoDoSlugApi, categorias)
    .map(slug => CATEGORIA_POR_SLUG.get(slug))
    .filter(Boolean)

  // Arrastar o título do picker de mídia para baixo fecha como o toque fora e o voltar.
  const arrastePicker = useArrastarParaFechar(() => setPickerMidia(null), pickerMidia != null)

  // Tile "Obras de Construção Civil" do passo 1: empilha o cadastro de obra que já existe
  // (CadastrarObraScreen, na mesma aba). Nada é levado daqui — a obra começa do zero — e este
  // formulário fica como está por baixo: o ← de lá devolve a pessoa aos grupos.
  const abrirObra = () => {
    Keyboard.dismiss()
    navigation.navigate('CadastrarObra')
  }

  // Desfecho do serviço publicado com sucesso. Sem permissão de notificação, o sheet
  // "Seu pedido foi publicado! 🎉" (AvisarPedidoSheet) substitui o alerta: ele mesmo
  // anuncia a publicação e pede o aviso no momento de maior relevância. Com a permissão
  // concedida (ou falha na consulta) o mostrar() devolve false e vale o fluxo de sempre —
  // alerta, lista e o soft-ask, que nesse caso é no-op por conta própria.
  const anunciarPublicado = async () => {
    if (await avisarPedidoRef.mostrar?.()) { navigation.navigate('Meus pedidos'); return }
    Alert.alert('✅ Serviço publicado!', 'Seu serviço já está visível para profissionais qualificados da sua região!',
      [{ text: 'OK', onPress: () => { navigation.navigate('Meus pedidos'); softAskRef.mostrar?.('dono_reparo') } }], { cancelable: false })
  }

  // Publica as mídias e trata sucesso total ou parcial (retry só das pendentes).
  // O upload/registro em si vive no hook compartilhado (useUploadMidiaDemanda);
  // aqui ficam apenas os alertas e a navegação, específicos do reparo.
  const finalizarPublicacao = async (reparoId, lista) => {
    const falhas = await midia.publicarMidias(reparoId, lista)
    if (!montadoRef.current) return
    setCarregando(false)
    if (falhas.length === 0) {
      anunciarPublicado()
    } else {
      const temVideoFalho = falhas.some(f => f.tipo === 'video')
      const dicaVideo = temVideoFalho
        ? '\n\n📹 Vídeos grandes podem falhar em conexões lentas — tente novamente em Wi-Fi ou grave um vídeo mais curto.'
        : ''
      Alert.alert(
        '⚠️ Serviço criado',
        `Seu serviço foi criado, mas ${falhas.length} mídia(s) não foram enviadas. Deseja tentar enviá-las novamente?${dicaVideo}`,
        [
          { text: 'Tentar novamente', onPress: () => { setCarregando(true); finalizarPublicacao(reparoId, falhas) } },
          { text: 'Continuar assim mesmo', onPress: () => navigation.navigate('Meus pedidos') },
        ],
        { cancelable: false }
      )
    }
  }

  const handleCadastrar = async () => {
    if (enviandoRef.current) return
    if (midia.algumEnviando) { Alert.alert('Aguarde o envio das mídias', 'Suas fotos/vídeos ainda estão sendo enviados. Aguarde a conclusão para publicar.'); return }
    // Validação COMPLETA roda ANTES de qualquer chamada de API ou navegação.
    const novosErros = validar()
    if (Object.keys(novosErros).length > 0) { apontarErro(novosErros); return }
    enviandoRef.current = true
    setCarregando(true)
    const enderecoCompleto = [logradouro, numero, complemento, bairro, cidade, uf].filter(Boolean).join(', ')
    const geo = await geocodificarEnderecoFinal()
    if (montadoRef.current) { setLatitude(geo.lat); setLongitude(geo.lng) }
    let reparo
    try {
      reparo = await comRetry(() => api.post('/reparos/dono', {
        titulo: titulo.trim(),
        // A primeira marcada é a coluna de sempre; a lista inteira vai ao lado dela.
        categoria: categorias[0],
        categorias,
        descricao: descricao.trim(),
        valor_estimado: valorEstimado ? parseFloat(valorEstimado.replace(/\./g, '').replace(',', '.')) : null,
        pais: 'Brasil',
        uf: uf.trim(),
        cidade: cidade.trim(),
        bairro: bairro.trim(),
        prazo_atendimento_horas: urgencia,
        endereco_obra: enderecoCompleto,
        // Campo livre e opcional: vazio vira null em vez de string vazia.
        ponto_referencia: pontoReferencia.trim() || null,
        latitude: geo.lat,
        longitude: geo.lng,
        // tera_midias: o servidor segura o push do novo serviço enquanto for true e só empurra
        // quando /reparos/:id/midias-prontas chega. True SÓ se o dono escolheu ao menos uma mídia
        // (midia.itens.length), senão false = push imediato, comportamento de sempre.
        tera_midias: midia.itens.length > 0,
        client_request_id: clientRequestIdRef.current,
      }))
      // Criação confirmada — rotaciona a chave para a próxima composição (retries de falha reusam a mesma)
      clientRequestIdRef.current = gerarRequestId()
      // O reparo existe: daqui em diante o retorno a esta aba é um recomeço, e só agora o
      // reset por foco fica armado. Vale para os dois desfechos abaixo (com e sem mídia),
      // inclusive quando alguma mídia falha — o reparo já foi criado de qualquer forma.
      submetidoRef.current = true
    } catch (e) {
      console.log('[CadastrarReparo] falha ao criar reparo | status:', e.status, '| code:', e.code, '| msg:', e.mensagem)
      const msg = e.mensagem || 'Não foi possível cadastrar o serviço. Tente novamente.'
      Alert.alert('Erro', msg)
      enviandoRef.current = false
      setCarregando(false)
      return
    }
    // Fase de mídia: cada item é isolado; falhas não cancelam as demais e podem ser reenviadas
    if (midia.itens.length === 0) {
      setCarregando(false)
      if (!montadoRef.current) return
      anunciarPublicado()
      return
    }
    await finalizarPublicacao(reparo.id)
  }

  // Picker: fecha, solta o teclado e abre a câmera/galeria com a mesma folga de sempre.
  const abrirMidia = (fn) => { Keyboard.dismiss(); setPickerMidia(null); setTimeout(() => fn(), 500) }

  // Esta tela é a RAIZ da aba "Novo pedido" do dono: a stack da aba começa nesta rota
  // (index 0) e não existe "voltar" no passo 1 — a seta nem é renderizada. Se um dia for
  // empilhada (index > 0), a seta aparece e volta de fato. Checamos o index da PRÓPRIA stack
  // — canGoBack() sobe para o tab/root e podia resolver true nesta raiz de aba. Nos passos
  // 2–4 a seta volta um passo.
  const naRaiz = (navigation.getState()?.index ?? 0) === 0
  const mostrarVoltar = passo > 1 || !naRaiz
  const deNovoPedido = route?.name === ROTA_NOVO_PEDIDO

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <MolduraWizard
        passo={passo}
        // "Cadastrar pedido" quando aberta pela aba "Novo pedido" (serviço E obra saem daqui);
        // fora dela vale o título padrão da moldura, "Cadastrar serviço".
        tituloTela={deNovoPedido ? 'Cadastrar pedido' : undefined}
        onVoltar={voltarPasso}
        mostrarVoltar={mostrarVoltar}
        scrollRef={scrollRef}
        reservaInferior={reservaInferior}
        // Só na raiz da aba "Novo pedido" e no 1º passo: é a tela inicial do dono.
        acimaDoTitulo={passo === 1 && deNovoPedido ? <BannerComoFunciona navigation={navigation} semRecuo /> : null}
        rodape={passo < TOTAL_PASSOS
          ? <RodapeWizard rotulo="Continuar →" onPress={avancar} />
          : <RodapeWizard
              rotulo="Publicar pedido →"
              onPress={handleCadastrar}
              carregando={carregando}
              desabilitado={midia.algumEnviando}
              nota={carregando ? '📤 Enviando mídias, aguarde... Seu serviço já está publicado; o envio das mídias pode levar alguns minutos em conexões lentas.' : null}
            />}
      >
        {passo === 1 && (
          <View onLayout={registrarY('categorias')}>
            {erros.categorias && <Text style={estilos.erroTexto}>{erros.categorias}</Text>}
            <GradeGrupos
              grupos={grupos}
              contagem={contagemPorGrupo(categorias)}
              outrosMarcado={categorias.includes(SLUG_OUTROS)}
              bloqueado={noLimite}
              onAbrir={(g) => { Keyboard.dismiss(); setGrupoAberto(g) }}
              onOutros={() => selecionarCategoria(SLUG_OUTROS)}
              onObras={deNovoPedido ? abrirObra : undefined}
            />
            <ChipsEscolhidos categorias={categorias} onRemover={selecionarCategoria} />
            {/* Sugestões: só depois da primeira marcada e enquanto há vaga. */}
            {!noLimite && <Sugestoes sugestoes={sugestoes} onAdicionar={selecionarCategoria} />}
          </View>
        )}
        {passo === 2 && (
          <PassoDetalhes
            titulo={titulo} onTitulo={setTitulo}
            descricao={descricao} onDescricao={setDescricao}
            erros={erros} registrarY={registrarY}
            midia={{
              itens: midia.itens, onRemover: midia.remover, onReenviar: midia.reenviar,
              onGravarVideo: () => setPickerMidia('video'),
              onTirarFotos: () => setPickerMidia('foto'),
              onGaleria: () => abrirMidia(usarGaleria),
            }}
          />
        )}
        {passo === 3 && (
          <PassoPrazoValor
            urgencia={urgencia} onUrgencia={setUrgencia}
            valor={valorEstimado} onValor={(t) => setValorEstimado(mascararValor(t))}
            erros={erros} registrarY={registrarY}
          />
        )}
        {passo === 4 && (
          <PassoEndereco
            cep={cep} onCep={buscarCep} buscandoCep={buscandoCep} enderecoEncontrado={enderecoEncontrado}
            pontoReferencia={pontoReferencia} onPontoReferencia={setPontoReferencia}
            logradouro={logradouro} onLogradouro={setLogradouro}
            numero={numero} onNumero={setNumero}
            complemento={complemento} onComplemento={setComplemento}
            bairro={bairro} onBairro={setBairro}
            uf={uf} cidade={cidade} onLocalidade={({ uf: u, cidade: c }) => { setUf(u); setCidade(c || '') }}
            erros={erros} registrarY={registrarY}
            rodapeTexto={<AvisosPublicar />}
          />
        )}
      </MolduraWizard>

      {/* Folha do grupo (passo 1): linhas grandes com exemplos e caixa; "Pronto" fecha. */}
      <FolhaGrupo
        visivel={grupoAberto != null}
        grupo={grupoAberto}
        selecionadas={categorias}
        onAlternar={selecionarCategoria}
        onPronto={() => setGrupoAberto(null)}
      />

      {/* Picker de mídia: as opções de sempre, filtradas pelo botão que abriu ('video' =
          câmera-vídeo ou galeria; 'foto' = câmera-foto ou galeria; 'todas' = as três). */}
      <Modal visible={pickerMidia != null} transparent animationType="slide" onRequestClose={() => setPickerMidia(null)}>
        <TouchableOpacity style={estilos.modalOverlay} activeOpacity={1} onPress={() => setPickerMidia(null)}>
          <Animated.View style={[estilos.modalSheet, arrastePicker.estiloArraste]}>
            <View {...arrastePicker.panHandlers}>
              <LinhaCabecalhoFolha onFechar={() => setPickerMidia(null)}>
                <Text style={estilos.modalTitulo}>{pickerMidia === 'video' ? 'Gravar vídeo' : pickerMidia === 'foto' ? 'Tirar fotos' : 'Adicionar mídia'}</Text>
              </LinhaCabecalhoFolha>
            </View>
            {pickerMidia !== 'video' && (
              <TouchableOpacity style={estilos.modalOpcao} onPress={() => abrirMidia(usarCameraFoto)}>
                <Text style={estilos.modalOpcaoTexto}>📷 Câmera — Foto</Text>
              </TouchableOpacity>
            )}
            {pickerMidia !== 'foto' && (
              <TouchableOpacity style={estilos.modalOpcao} onPress={() => abrirMidia(usarCameraVideo)}>
                <Text style={estilos.modalOpcaoTexto}>🎬 Câmera — Vídeo</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={estilos.modalOpcao} onPress={() => abrirMidia(usarGaleria)}>
              <Text style={estilos.modalOpcaoTexto}>🖼️ Galeria</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[estilos.modalOpcao, { marginTop: 8 }]} onPress={() => setPickerMidia(null)}>
              <Text style={[estilos.modalOpcaoTexto, { color: cores.textoFraco }]}>Cancelar</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  erroTexto: { fontSize: 11, color: cores.perigo, marginBottom: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: cores.fundoCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: cores.textoForte, marginBottom: 16, textAlign: 'center' },
  modalOpcao: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 16, alignItems: 'center', marginBottom: 8 },
  modalOpcaoTexto: { fontSize: 15, color: cores.textoForte, fontWeight: '500' },
})
