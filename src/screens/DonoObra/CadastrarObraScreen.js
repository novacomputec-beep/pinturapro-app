import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, Modal, TouchableOpacity, Alert, Keyboard, BackHandler } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import api from '../../services/api'
import { comRetry, mensagemErroRede } from '../../utils/rede'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { cores, raios, alturas } from '../../utils/tema'
import { useSelecaoMidia, useUploadMidiaDemanda } from '../../utils/midia'
import { softAskRef } from '../../components/SoftAskNotificacao'
import { avisarPedidoRef } from '../../components/AvisarPedidoSheet'
import { tiposObraComExemplos, TILE_OUTROS_OBRA } from '../../utils/tiposObra'
import BannerComoFunciona from '../../components/BannerComoFunciona'
import { cadastro } from '../../components/RetomadaMatchHost'
import { useBarraServicoVisivel } from '../../components/BarraServicoEmAndamento'
import {
  MolduraWizard, RodapeWizard, GradeTiposObra, PassoDetalhes, PassoPrazoValorObra, PassoEndereco,
  CaixaAvisosObra, TITULOS_PASSO_OBRA, PASSO_DO_CAMPO_OBRA, TOTAL_PASSOS,
} from './CadastrarServicoPassos'

// Cadastro de obra do dono em 4 passos (Arte-Cadastrar-Obra), na MESMA moldura do cadastro de
// serviço (./CadastrarServicoPassos): tipo → detalhes → prazo e valor → endereço. SÓ o layout
// mudou: estado, validações, payload de POST /obras/dono (prazo_modo/timezone de "Hoje",
// data inicial), aprovação, fluxo de mídia, pré-preenchimento vindo do serviço, reset
// pós-envio e o sinal para a RetomadaMatchHost são os de sempre.

// O tipo da obra começa SEM seleção (antes abria no primeiro da lista): a escolha é da pessoa
// e obrigatória — "Continuar" do passo 1 e "Publicar obra" validam (ver validarTudo).
const CATEGORIA_INICIAL = null

const PRAZOS = [
  { id: 24,   label: '📅 Hoje',           desc: 'Início hoje'          },
  { id: 168,  label: '📆 Esta semana',    desc: 'Início esta semana'   },
  { id: 720,  label: '🗓️ Este mês',        desc: 'Início este mês'      },
  { id: 1440, label: '📋 Mês que vem',    desc: 'Início mês que vem'   },
  { id: 2160, label: '⏳ Mais de 1 mês', desc: 'Sem urgência'         },
  { id: 'data', label: '📅 Defina a data', desc: 'Escolha uma data' },
]

// Campos obrigatórios em ordem visual (passo a passo). Ao avançar/publicar incompleto, a
// tela vai ao passo do 1º campo com erro, rola até ele e mostra um alerta claro.
const CAMPOS_OBRIGATORIOS = [
  { chave: 'categoria',     msg: 'Escolha o tipo da obra' },
  { chave: 'titulo',        msg: 'Por favor, informe o título da obra antes de continuar.' },
  { chave: 'descricao',     msg: 'Descreva a obra necessária antes de continuar.' },
  { chave: 'prazo',         msg: 'Selecione o prazo para iniciar a obra antes de continuar.' },
  { chave: 'dataInicial',   msg: 'Informe uma data futura válida (dd/mm/aaaa) antes de continuar.' },
  { chave: 'valorEstimado', msg: 'Informe o valor oferecido antes de continuar.' },
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

export default function CadastrarObraScreen({ navigation, route }) {
  // Chegada a partir de CadastrarReparoScreen (Alvenaria → "Pedreiro ou ajudante"): traz
  // o que já foi preenchido lá e o nome da rota de origem. undefined nos outros caminhos.
  const deReparo = route?.params?.deReparo
  const [passo, setPasso] = useState(1)
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState(CATEGORIA_INICIAL)
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
  // Picker de mídia: null = fechado; 'video' / 'foto' (cada botão grande oferece câmera OU
  // galeria) / 'todas' (as três opções de sempre).
  const [pickerMidia, setPickerMidia] = useState(null)
  const enviandoRef = useRef(false)
  // Criação confirmada pelo servidor: é o que autoriza o reset no próximo foco. Não dá
  // para reaproveitar enviandoRef aqui — ele já é true durante o envio, e uma ida a
  // outra aba no meio de um POST que ainda pode falhar apagaria o formulário à toa.
  const submetidoRef = useRef(false)
  const scrollRef = useRef(null)
  const clientRequestIdRef = useRef(gerarRequestId())
  const montadoRef = useRef(true)
  // Posição (offset no ScrollView) de cada campo obrigatório do passo atual, para rolar até
  // ele; e o campo a rolar DEPOIS de trocar de passo por erro.
  const camposYRef = useRef({})
  const rolarAteRef = useRef(null)
  const registrarY = (...chaves) => (e) => {
    const y = e.nativeEvent.layout.y
    chaves.forEach(c => { camposYRef.current[c] = y })
  }

  const tipos = useMemo(() => tiposObraComExemplos(), [])
  // A barra "Agendado" flutua sobre o rodapé da aba: enquanto ela existe, o rodapé fixo sobe.
  const reservaInferior = useBarraServicoVisivel() ? alturas.barraServico : 0

  useEffect(() => {
    return () => { montadoRef.current = false }
  }, [])

  // Hook compartilhado de upload de mídia (Fase 3): dono do estado dos itens, do
  // upload em 2º plano (quando a flag USAR_UPLOAD_STREAMING está ligada) e do
  // registro pós-criação. O caminho antigo (direto ao Cloudinary) segue ativo
  // enquanto a flag está desligada.
  const midia = useUploadMidiaDemanda({ vertical: 'obra', montadoRef, logPrefix: '[CadastrarObra]' })

  // Pré-preenchimento vindo do formulário de serviço. Só os campos que existem igual nas
  // duas telas: título, descrição, endereço e mídias. Categoria da obra, prazo e valor
  // ficam para a pessoa escolher aqui — são outras escalas. Roda por efeito, e não como
  // valor inicial do useState, para valer também quando esta tela já estiver montada e
  // receber um novo deReparo (mesmo comportamento nos dois casos). Começa no passo 1: o
  // tipo da obra é a primeira coisa que falta.
  useEffect(() => {
    if (!deReparo) return
    setPasso(1)
    setTitulo(deReparo.titulo || '')
    setDescricao(deReparo.descricao || '')
    setCep(deReparo.cep || '')
    setLogradouro(deReparo.logradouro || '')
    setNumero(deReparo.numero || '')
    setComplemento(deReparo.complemento || '')
    setBairro(deReparo.bairro || '')
    setCidade(deReparo.cidade || '')
    setUf(deReparo.uf || '')
    setPontoReferencia(deReparo.pontoReferencia || '')
    setEnderecoEncontrado(!!deReparo.enderecoEncontrado)
    midia.importar(deReparo.midias)
    // midia.importar é estável (useCallback sem deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deReparo])

  // Para onde ir depois de publicar. No caminho normal, a aba "Minhas Obras" do dono de
  // obra. Vindo do serviço, a conta é de dono_reparo e essa aba NÃO existe: primeiro
  // volta à rota de origem com { obraPublicada: true } (o navigate a uma rota já na pilha
  // volta até ela e atualiza os params — é isso que desempilha esta tela e limpa o
  // formulário de lá), depois abre a lista onde a obra aparece. Qual lista depende do
  // navegador: nas abas do dono_reparo é "Meus Reparos" (ListaReparos, na aba de obras);
  // no stack legado (tipo_dono indefinido) é a MinhasObras do próprio stack. A pilha é
  // lida ANTES do primeiro navigate, enquanto esta tela ainda está nela.
  const irParaLista = () => {
    if (!deReparo?.rotaOrigem) { navigation.navigate('Minhas Obras'); return }
    const legado = navigation.getState()?.routeNames?.includes('MinhasObras')
    navigation.navigate(deReparo.rotaOrigem, { obraPublicada: true })
    if (legado) navigation.navigate('MinhasObras', { aba: 'obras' })
    else navigation.navigate('Meus Reparos', { screen: 'ListaReparos', params: { aba: 'obras' } })
  }

  // Reset APÓS ENVIO BEM-SUCEDIDO — espelha CadastrarReparoScreen para que ambas se
  // comportem de forma idêntica. Após um envio bem-sucedido navegamos para 'Minhas
  // Obras' (outra aba); ao voltar para 'Nova Obra' o foco dispara este reset, limpando
  // as mídias e liberando os bitmaps de preview. Em caso de FALHA o usuário permanece
  // nesta mesma tela (sem nova transição de foco), então os anexos NÃO são descartados
  // e podem ser reenviados.
  // O foco sozinho não diz POR QUE a tela foi focada: sem a trava abaixo, uma simples
  // ida-e-volta de aba era indistinguível do retorno pós-envio e apagava um formulário
  // já preenchido. Só a criação confirmada arma o reset, e ele se desarma ao rodar.
  // Volta ao passo 1: a próxima composição começa limpa, do começo.
  useFocusEffect(useCallback(() => {
    if (!submetidoRef.current) return
    submetidoRef.current = false
    setPasso(1)
    setTitulo('')
    setCategoria(CATEGORIA_INICIAL)
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

  // Volta ao topo a cada foco: aba que fica montada preserva o scroll entre idas e
  // vindas, e o formulário reaparecia no meio. Efeito separado do reset acima, que
  // só roda pós-envio.
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

  // Voltar do Android: com o picker aberto o Modal cuida; senão, passo anterior sem perder
  // nada. No passo 1 segue o comportamento de sempre (sai da tela / volta ao serviço).
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pickerMidia) return false
      if (passo > 1) { setPasso(p => p - 1); return true }
      return false
    })
    return () => sub.remove()
  }, [passo, pickerMidia]))

  // Sinal de cadastro em uso para o RetomadaMatchHost (ver `cadastro` lá), espelhando
  // CadastrarReparoScreen: qualquer campo fora do valor inicial ou mídia anexada, enquanto
  // ESTA instância está focada (vale também para a cópia empilhada sobre o formulário de
  // serviço do dono_reparo). Cai ao enviar, ao perder o foco ou ao desmontar.
  const focado = useIsFocused()
  const temConteudo = !!(
    titulo || descricao || valorEstimado || prazo != null || dataInicial || categoria != null ||
    cep || logradouro || numero || complemento || bairro || cidade || uf || pontoReferencia ||
    midia.itens.length > 0
  )
  useEffect(() => {
    if (!focado) return
    cadastro.comConteudo = temConteudo
    return () => { cadastro.comConteudo = false }
  }, [focado, temConteudo])

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
      Alert.alert('Erro', await mensagemErroRede('Não foi possível buscar o CEP. Verifique sua conexão.'))
    } finally {
      if (montadoRef.current) setBuscandoCep(false)
    }
  }

  // As MESMAS regras de sempre, de uma vez. `validarPasso` filtra o resultado para o passo.
  const validarTudo = () => {
    const novos = {}
    if (!categoria) novos.categoria = 'Escolha o tipo da obra'
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
    return novos
  }
  const validarPasso = (p) => {
    const tudo = validarTudo()
    const doPasso = {}
    for (const chave of Object.keys(tudo)) if (PASSO_DO_CAMPO_OBRA[chave] === p) doPasso[chave] = tudo[chave]
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
    const alvo = PASSO_DO_CAMPO_OBRA[primeiro.chave] || passo
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
  // fora da raiz da aba (empilhada sobre o serviço ou no fluxo legado) e aí volta de fato.
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
      console.log('[CadastrarObra] geocode indisponível, publicando sem coordenadas | msg:', err.message)
    }
    return { lat: null, lng: null }
  }

  // Desfecho da obra criada com sucesso. Publicada de fato (jaAprovada) e sem permissão de
  // notificação, o sheet "Seu pedido foi publicado! 🎉" (AvisarPedidoSheet) substitui o
  // alerta: ele mesmo anuncia a publicação e pede o aviso no momento de maior relevância.
  // Obra ainda em análise NÃO entra no sheet — o título dele afirma "publicado", e isso
  // seria mentira para quem só enviou; ali vale o alerta de análise e o soft-ask de sempre.
  // Com a permissão concedida (ou falha na consulta) o mostrar() devolve false e também vale
  // o fluxo de sempre — alerta, lista e o soft-ask, que nesse caso é no-op por conta própria.
  const anunciarCriada = async (jaAprovada) => {
    if (jaAprovada && await avisarPedidoRef.mostrar?.()) { irParaLista(); return }
    Alert.alert(
      jaAprovada ? '✅ Obra publicada!' : '✅ Obra enviada para análise!',
      jaAprovada
        ? 'Sua obra já está visível para os profissionais qualificados da sua região. Ela ainda pode passar por uma revisão da nossa equipe no horário comercial.'
        : 'Sua obra foi recebida e passará por uma breve aprovação. Em breve estará visível para profissionais qualificados da sua região!',
      [{ text: 'OK', onPress: () => { irParaLista(); softAskRef.mostrar?.('dono_obra') } }], { cancelable: false })
  }

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
      anunciarCriada(jaAprovada)
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
          { text: 'Continuar assim mesmo', onPress: irParaLista },
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
        // tera_midias: o servidor segura o push da nova obra enquanto for true e só empurra
        // quando /obras/:id/midias-prontas chega. True SÓ se o dono escolheu ao menos uma mídia
        // (midia.itens.length), senão false = push imediato, comportamento de sempre.
        tera_midias: midia.itens.length > 0,
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
      anunciarCriada(jaAprovada)
      return
    }
    await finalizarPublicacao(obra.id, undefined, statusAprovacao)
  }

  // Picker: fecha, solta o teclado e abre a câmera/galeria com a mesma folga de sempre.
  const abrirMidia = (fn) => { Keyboard.dismiss(); setPickerMidia(null); setTimeout(() => fn(), 500) }

  // Esta tela é a RAIZ da aba "Nova Obra" (dono_obra): a stack da aba só contém esta rota
  // (index 0) e não existe "voltar" no passo 1 — a seta nem é renderizada. Empilhada (sobre o
  // serviço do dono_reparo, ou no fluxo legado) a seta aparece e volta de fato. Checamos o
  // index da PRÓPRIA stack — canGoBack() sobe para o tab/root e podia resolver true nesta
  // raiz de aba. Nos passos 2–4 a seta volta um passo.
  const naRaiz = (navigation.getState()?.index ?? 0) === 0
  const mostrarVoltar = passo > 1 || !naRaiz

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <MolduraWizard
        passo={passo}
        tituloTela="Cadastrar obra"
        titulos={TITULOS_PASSO_OBRA}
        onVoltar={voltarPasso}
        mostrarVoltar={mostrarVoltar}
        scrollRef={scrollRef}
        reservaInferior={reservaInferior}
        // Só na raiz da aba "Nova Obra" (rota *Main) e no 1º passo: é a tela inicial do
        // dono_obra e a aba Perfil existe. Empilhada (NovoReparoStack/legado) a rota é 'CadastrarObra'.
        acimaDoTitulo={passo === 1 && route?.name === 'CadastrarObraMain' ? <BannerComoFunciona navigation={navigation} semRecuo /> : null}
        rodape={passo < TOTAL_PASSOS
          ? <RodapeWizard rotulo="Continuar →" onPress={avancar} />
          : <RodapeWizard
              rotulo="Publicar obra →"
              onPress={handleCadastrar}
              carregando={carregando}
              desabilitado={midia.algumEnviando}
              nota={carregando ? '📤 Enviando mídias, aguarde... Sua obra já está cadastrada; o envio das mídias pode levar alguns minutos em conexões lentas.' : null}
            />}
      >
        {passo === 1 && (
          <View onLayout={registrarY('categoria')}>
            {erros.categoria && <Text style={estilos.erroTexto}>{erros.categoria}</Text>}
            <GradeTiposObra tipos={tipos} tileOutros={TILE_OUTROS_OBRA} selecionado={categoria} onEscolher={(slug) => { setCategoria(slug); setErros(e => ({ ...e, categoria: undefined })) }} />
          </View>
        )}
        {passo === 2 && (
          <PassoDetalhes
            titulo={titulo} onTitulo={setTitulo}
            descricao={descricao} onDescricao={setDescricao}
            erros={erros} registrarY={registrarY}
            rotuloTitulo="TÍTULO DA OBRA" placeholderTitulo="Ex: Pintura interna residência 3 quartos" rotuloDescricao="DESCRIÇÃO DA OBRA"
            midia={{
              itens: midia.itens, onRemover: midia.remover, onReenviar: midia.reenviar,
              onGravarVideo: () => setPickerMidia('video'),
              onTirarFotos: () => setPickerMidia('foto'),
              onGaleria: () => abrirMidia(usarGaleria),
            }}
          />
        )}
        {passo === 3 && (
          <PassoPrazoValorObra
            prazos={PRAZOS} prazo={prazo} onPrazo={setPrazo}
            dataInicial={dataInicial} onDataInicial={(t) => setDataInicial(mascararData(t))}
            valor={valorEstimado} onValor={(t) => setValorEstimado(mascararValor(t))}
            erros={erros} registrarY={registrarY}
          />
        )}
        {passo === 4 && (
          <PassoEndereco
            rotuloLocal="📍 LOCALIZAÇÃO DA OBRA" rotuloCep="CEP DO LOCAL DA OBRA"
            cep={cep} onCep={buscarCep} buscandoCep={buscandoCep} enderecoEncontrado={enderecoEncontrado}
            pontoReferencia={pontoReferencia} onPontoReferencia={setPontoReferencia}
            logradouro={logradouro} onLogradouro={setLogradouro}
            numero={numero} onNumero={setNumero}
            complemento={complemento} onComplemento={setComplemento}
            bairro={bairro} onBairro={setBairro}
            uf={uf} cidade={cidade} onLocalidade={({ uf: u, cidade: c }) => { setUf(u); setCidade(c || '') }}
            erros={erros} registrarY={registrarY}
            rodapeTexto={<CaixaAvisosObra />}
          />
        )}
      </MolduraWizard>

      {/* Picker de mídia: as opções de sempre, filtradas pelo botão que abriu ('video' =
          câmera-vídeo ou galeria; 'foto' = câmera-foto ou galeria; 'todas' = as três). */}
      <Modal visible={pickerMidia != null} transparent animationType="slide" onRequestClose={() => setPickerMidia(null)}>
        <TouchableOpacity style={estilos.modalOverlay} activeOpacity={1} onPress={() => setPickerMidia(null)}>
          <View style={estilos.modalSheet}>
            <Text style={estilos.modalTitulo}>{pickerMidia === 'video' ? 'Gravar vídeo' : pickerMidia === 'foto' ? 'Tirar fotos' : 'Adicionar mídia'}</Text>
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
          </View>
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
