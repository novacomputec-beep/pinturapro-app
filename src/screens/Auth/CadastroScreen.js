import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, AppState, BackHandler
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Image } from 'react-native'
import { AppEventsLogger } from 'react-native-fbsdk-next'
import { BotaoPrimario, Input, SeletorLocalidade } from '../../components'
import api, { authService } from '../../services/api'
import { comRetry } from '../../utils/rede'
import { mascararTelefone } from '../../utils/telefone'
import { RASCUNHO_KEY, RASCUNHO_SENHA_KEY, limparRascunhoCadastro } from '../../utils/rascunhoCadastro'
import { useAuth } from '../../contexts/AuthContext'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, espacos, raios, larguraMaxima } from '../../utils/tema'
import { mostrarCobranca } from '../../utils/plataforma'
import { MAX_ESPECIALIDADES, normalizarEspecialidades, rotuloEspecialidade } from '../../utils/categorias'

// Cores da escolha de perfil (passo 0): laranja = trabalhar, azul = contratar.
const COR_TRABALHAR = '#F0822E'
const COR_CONTRATAR = '#6AA6F0'

// ─── MÚLTIPLAS CONTAS POR E-MAIL ─────────────────────────────
const MSG_OUTRO_TIPO = 'Você já tem cadastro no ProTudo com este e-mail. Use a mesma senha da sua conta.'
// Erros novos do backend, pela chave estável `codigo`. Código fora do mapa → mensagem de sempre.
const MSG_ERRO_CONTAS = {
  senha_conta_existente: 'A senha não confere com a da sua conta já existente. Use a mesma senha.',
  tipo_duplicado: 'Você já tem um cadastro deste tipo. Entre pelo login.',
  limite_contas: 'Este e-mail já atingiu o limite de cadastros.',
}
// A verificar-disponibilidade "diz" outro tipo pelo `codigo` (no erro, é só o que o
// interceptor repassa do corpo) ou por campo booleano no corpo de sucesso.
// Lookup por chave PRÓPRIA: um codigo como 'constructor' não pode casar com o protótipo.
const msgErroContas = (codigo) => (typeof codigo === 'string' && Object.prototype.hasOwnProperty.call(MSG_ERRO_CONTAS, codigo) ? MSG_ERRO_CONTAS[codigo] : null)
const CODIGOS_OUTRO_TIPO = ['email_em_outro_tipo', 'cpf_em_outro_tipo']
const ehOutroTipo = (r) => !!r && (CODIGOS_OUTRO_TIPO.includes(r.codigo) || r.email_em_outro_tipo === true || r.cpf_em_outro_tipo === true)

// ─── VALIDAÇÃO CPF/CNPJ ──────────────────────────────────────
const validarCPF = (cpf) => {
  const nums = cpf.replace(/\D/g, '')
  if (nums.length !== 11) return false
  if (/^(\d)\1+$/.test(nums)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  if (resto !== parseInt(nums[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10 || resto === 11) resto = 0
  return resto === parseInt(nums[10])
}

const validarCNPJ = (cnpj) => {
  const nums = cnpj.replace(/\D/g, '')
  if (nums.length !== 14) return false
  if (/^(\d)\1+$/.test(nums)) return false
  const calc = (n, arr) => {
    let soma = 0
    let pos = arr.length - 7
    for (let i = arr.length; i >= 1; i--) {
      soma += parseInt(n.charAt(arr.length - i)) * pos--
      if (pos < 2) pos = 9
    }
    return soma % 11 < 2 ? 0 : 11 - (soma % 11)
  }
  return (
    calc(nums, nums.substring(0, 12)) === parseInt(nums[12]) &&
    calc(nums, nums.substring(0, 13)) === parseInt(nums[13])
  )
}

const validarCpfCnpj = (valor) => {
  const nums = valor.replace(/\D/g, '')
  if (nums.length === 11) return validarCPF(nums)
  if (nums.length === 14) return validarCNPJ(nums)
  return false
}

const mascararCpfCnpj = (valor) => {
  const nums = valor.replace(/\D/g, '').slice(0, 14)
  if (nums.length <= 11) {
    return nums
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return nums
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

const IndicadorPassos = ({ passo, total }) => (
  <View style={estilos.indicador}>
    {Array.from({ length: total }).map((_, i) => (
      <View key={i} style={[
        estilos.indicadorDot,
        i < passo - 1 && estilos.indicadorDotFeito,
        i === passo - 1 && estilos.indicadorDotAtivo,
      ]} />
    ))}
  </View>
)

const classificarErro = (err) => {
  if (err?.code === 'ECONNABORTED' || err?.message?.toLowerCase().includes('timeout')) return 'TIMEOUT'
  if (err?.status >= 500) return `SERVER_ERROR(HTTP ${err?.status})`
  if (err?.status >= 400) return `CLIENT_ERROR(HTTP ${err?.status})`
  if (err?.code === 'ERR_NETWORK' || err?.message?.toLowerCase().includes('network')) return 'NETWORK_ERROR'
  return `UNKNOWN(code=${err?.code ?? 'none'})`
}

export default function CadastroScreen({ navigation, route }) {
  const { loginComToken } = useAuth()
  const insets = useSafeAreaInsets()
  const montadoRef = useRef(true)
  const multiplasContasRef = useRef(false)                // GET /config → multiplas_contas; false = cadastro de sempre

  useEffect(() => {
    // Warm-up ao ABRIR a tela. NÃO é cold start do servidor: o Serverless está
    // desligado e a API fica de pé. O que morre é a CONEXÃO — um socket TCP ocioso
    // é derrubado pelo SO/pela rede sem avisar o cliente, e o pool do axios segue
    // achando que ele serve. Não importa se ficou ocioso com o app em 2º plano ou
    // parado em 1º plano numa tela sem tráfego: a PRIMEIRA requisição depois disso
    // é entregue no socket morto e morre calada até o timeout de 30 s.
    // Aqui o intervalo é enorme — entre abrir o cadastro e tocar em "Criar conta"
    // vão vários passos de formulário. Este ping descartável reutiliza o socket
    // podre e leva o erro no lugar do POST /auth/cadastro, forçando o pool a abrir
    // conexão nova. Falhar aqui é o caso de sucesso: por isso console.log, sem
    // retry e sem await. Explicação canônica no WarmupController (App.js).
    api.get('/health').catch(err => console.log('[CadastroScreen] falha no warmup /health | code:', err.code, '| msg:', err.mensagem))
    // Janela de lançamento (grátis) — COSMÉTICO e fire-and-forget: nunca bloqueia/atrasa
    // o render. Endpoint público (pré-login, sem token). Qualquer erro/timeout mantém o
    // default false (preço normal). Só "sobe" para o estado grátis se resolver gratis:true.
    api.get('/config/lancamento')
      .then(resp => { if (montadoRef.current) setLancamentoGratis(!!resp?.gratis) })
      .catch(() => {})
    // Chave de múltiplas contas por e-mail — mesmo molde: fire-and-forget, e qualquer
    // erro/timeout/ausência do campo mantém false, que é o cadastro de sempre.
    api.get('/config')
      .then(resp => { multiplasContasRef.current = resp?.multiplas_contas === true })
      .catch(() => {})
    return () => { montadoRef.current = false }
  }, [])

  const [tipoConta, setTipoConta] = useState(null)
  const [passo, setPasso] = useState(0)
  const [lado, setLado] = useState(null)                  // passo 0: null = 1ª tela | 'trabalhar' | 'contratar'
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [lancamentoGratis, setLancamentoGratis] = useState(false)

  const [nome, setNome] = useState('')
  const [sobrenome, setSobrenome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [cep, setCep] = useState('')
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enderecoEncontrado, setEnderecoEncontrado] = useState(false)
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [anosExp, setAnosExp] = useState('')
  const [equipe, setEquipe] = useState('')
  // Array de SLUGS, não mais texto livre. normalizarEspecialidades cuida de rascunho
  // antigo (que gravava CSV) e de valor legado — ver restauração abaixo.
  const [especialidades, setEspecialidades] = useState([])

  // Retorno da EspecialidadesScreen, por params SERIALIZÁVEIS — nada de callback em
  // rota: função não sobrevive ao Android reciclar o processo, e o estado de navegação
  // restaurado traria um callback morto.
  //
  // O setParams(undefined) logo depois de aplicar é o que impede o mesmo retorno de ser
  // reaplicado num foco seguinte: sem ele, remover uma pill pelo ✕ e sair/voltar da tela
  // faria o param antigo ressuscitar a seleção e desfazer a remoção.
  const especialidadesRetorno = route.params?.especialidades
  useEffect(() => {
    if (!especialidadesRetorno) return
    setEspecialidades(normalizarEspecialidades(especialidadesRetorno))
    setErros(e => ({ ...e, especialidades: undefined }))
    navigation.setParams({ especialidades: undefined })
  }, [especialidadesRetorno])
  const [planoSelecionado, setPlanoSelecionado] = useState('mensal')

  const [rg, setRg] = useState('')
  const [rgOrgao, setRgOrgao] = useState('SSP')
  const [rgEstado, setRgEstado] = useState('')

  const [progresso, setProgresso] = useState('')          // texto de fase exibido durante o cadastro
  const emAndamentoRef = useRef(false)                    // trava reentrância (evita toques múltiplos)
  const disponibilidadeOkRef = useRef(false)              // verificar-disponibilidade roda só 1x por sessão

  // ─── A4: Persistência do rascunho de cadastro ─────────────────────────────
  // O Android pode reciclar a Activity quando o app vai a segundo plano (tela
  // apaga / troca de app) no meio do cadastro — isso zerava todo o formulário e
  // devolvia o usuário à home. Persistimos os campos + o passo atual para
  // restaurar exatamente onde parou. A senha vai no SecureStore
  // (cifrado, mesmo mecanismo do token); o resto no AsyncStorage. Limpamos o
  // rascunho ao concluir o cadastro ou ao sair da tela (cancelar).
  // A ScrollView do formulário é UMA só para todos os passos (sem key por passo, logo não
  // remonta): sem este handle não há como devolver o scroll ao topo na troca de passo.
  const scrollRef = useRef(null)
  const restauradoRef = useRef(false)   // trava saves até a restauração inicial terminar
  const snapshotRef = useRef({})        // campos NÃO sensíveis (AsyncStorage) — sempre atual
  const senhaRef = useRef('')           // senha (SecureStore) — sempre atual
  snapshotRef.current = {
    tipoConta, passo, nome, sobrenome, email, telefone, cidade, uf, cep,
    latitude, longitude, logradouro, numero, complemento, bairro, enderecoEncontrado,
    cpfCnpj, anosExp, equipe, especialidades, planoSelecionado,
    rg, rgOrgao, rgEstado,
  }
  senhaRef.current = senha

  // Lê refs (nunca closures) → seguro chamar de listeners com deps [].
  const salvarRascunho = async () => {
    if (!restauradoRef.current) return
    const s = snapshotRef.current
    if (!s.tipoConta || s.passo < 1) return   // só salva com progresso real
    try {
      // _ts em toda gravação → janela de validade de 24h no resume de cold-start.
      await AsyncStorage.setItem(RASCUNHO_KEY, JSON.stringify({ ...s, _ts: Date.now() }))
      if (senhaRef.current) await SecureStore.setItemAsync(RASCUNHO_SENHA_KEY, senhaRef.current)
      else await SecureStore.deleteItemAsync(RASCUNHO_SENHA_KEY).catch(() => {})
    } catch (err) {
      console.log('[CadastroScreen] falha ao salvar rascunho | msg:', err.message)
    }
  }

  // Delega ao limpador compartilhado (remove AsyncStorage + senha + fotos).
  const limparRascunho = () => limparRascunhoCadastro()

  // Restaura o rascunho na montagem, ANTES de qualquer interação.
  useEffect(() => {
    (async () => {
      try {
        const bruto = await AsyncStorage.getItem(RASCUNHO_KEY)
        if (bruto && montadoRef.current) {
          const s = JSON.parse(bruto)
          setTipoConta(s.tipoConta ?? null)
          setNome(s.nome ?? ''); setSobrenome(s.sobrenome ?? '')
          setEmail(s.email ?? ''); setTelefone(s.telefone ?? '')
          setCidade(s.cidade ?? ''); setUf(s.uf ?? '')
          setCep(s.cep ?? ''); setEnderecoEncontrado(!!s.enderecoEncontrado)
          setLatitude(s.latitude ?? null); setLongitude(s.longitude ?? null)
          setLogradouro(s.logradouro ?? ''); setNumero(s.numero ?? '')
          setComplemento(s.complemento ?? ''); setBairro(s.bairro ?? '')
          setCpfCnpj(s.cpfCnpj ?? ''); setAnosExp(s.anosExp ?? ''); setEquipe(s.equipe ?? '')
          setEspecialidades(normalizarEspecialidades(s.especialidades)); setPlanoSelecionado(s.planoSelecionado ?? 'mensal')
          setRg(s.rg ?? ''); setRgOrgao(s.rgOrgao ?? 'SSP'); setRgEstado(s.rgEstado ?? '')
          const senhaSalva = await SecureStore.getItemAsync(RASCUNHO_SENHA_KEY)
          if (senhaSalva && montadoRef.current) setSenha(senhaSalva)
          // Rascunho antigo podia estar no passo 4 (PIX/referências), que não existe mais.
          setPasso(s.passo === 4 ? 2 : (s.passo ?? 0))   // por último: renderiza direto a tela onde parou
        }
      } catch (err) {
        console.log('[CadastroScreen] falha ao restaurar rascunho | msg:', err.message)
      } finally {
        restauradoRef.current = true
      }
    })()
  }, [])

  // Salva ao ir a segundo plano (o momento exato do item 6) e a cada troca de passo.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'background' || estado === 'inactive') salvarRascunho()
    })
    return () => sub.remove()
  }, [])
  // Troca de passo: salva o rascunho e devolve o scroll ao topo. Como só o miolo do
  // formulário troca (o cabeçalho e a própria ScrollView continuam montados), o offset
  // sobrevive à transição e o passo novo abriria no meio. Sem animação: é um recomeço
  // de tela, não um deslocamento que o usuário pediu. No passo 0 o ref está nulo —
  // aquela tela tem ScrollView própria — e o encadeamento opcional cobre o caso.
  useEffect(() => {
    salvarRascunho()
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [passo])

  const isPrestador = tipoConta === 'pintor' || tipoConta === 'prestador'
  const isDono = tipoConta === 'dono_obra' || tipoConta === 'dono_reparo'
  // Lançamento grátis: o prestador não vê a etapa de plano (passo 3). No iOS ela também
  // some (Apple 3.1.1: nada de preço de assinatura) e o plano vai fixo em 'mensal'.
  const modoLancamento = (lancamentoGratis || !mostrarCobranca) && isPrestador
  // Prestador: dados pessoais, perfil profissional e, só no caminho pago, plano. PIX,
  // referências e fotos saíram do cadastro — são pedidos na primeira proposta
  // (VerificacaoIdentidadeSheet). Dono: 2 passos, como sempre.
  const totalPassos = isDono || modoLancamento ? 2 : 3

  const escolherTipo = (tipo) => { setTipoConta(tipo); setPasso(1) }

  // Escolha de perfil em 2 telas: na 2ª (lado escolhido), o voltar do Android retorna
  // à 1ª em vez de sair do cadastro.
  useEffect(() => {
    if (passo !== 0 || !lado) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setLado(null); return true })
    return () => sub.remove()
  }, [passo, lado])

  const validarPasso1 = () => {
    const novos = {}
    if (!nome.trim()) novos.nome = 'Informe o nome'
    if (!email.trim()) novos.email = 'Informe o e-mail'
    if (!senha.trim()) novos.senha = 'Informe a senha'
    if (senha.length < 8) novos.senha = 'Mínimo 8 caracteres'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  // Mesmo padrão do fluxo do dono: ViaCEP preenche estado/cidade e o Nominatim
  // geocodifica para latitude/longitude (best-effort — não bloqueia o cadastro).
  // Sem logradouro, o geocode resolve no centro da cidade, suficiente como base.
  const buscarCep = async (cepDigitado) => {
    const cepLimpo = cepDigitado.replace(/\D/g, '')
    setCep(cepLimpo)
    setLatitude(null)
    setLongitude(null)
    setEnderecoEncontrado(false)
    if (cepLimpo.length !== 8) return
    setBuscandoCep(true)
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
      const dados = await resp.json()
      if (dados.erro) { Alert.alert('CEP não encontrado', 'Verifique o CEP informado.'); return }
      if (montadoRef.current) {
        setCidade(dados.localidade || '')
        setUf(dados.uf || '')
        setLogradouro(dados.logradouro || '')
        setBairro(dados.bairro || '')
        setEnderecoEncontrado(true)
      }
      const endereco = [dados.logradouro, dados.bairro, dados.localidade, dados.uf, 'Brasil'].filter(Boolean).join(', ')
      const geoResp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(endereco)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'ProTudo/1.0' } }
      )
      const geoData = await geoResp.json()
      if (geoData.length > 0 && montadoRef.current) {
        setLatitude(parseFloat(geoData[0].lat))
        setLongitude(parseFloat(geoData[0].lon))
      }
    } catch (err) {
      console.log('[Cadastro] falha ao buscar CEP | msg:', err.message)
      Alert.alert('Erro', 'Não foi possível buscar o CEP. Verifique sua conexão.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.')
    } finally {
      if (montadoRef.current) setBuscandoCep(false)
    }
  }

  const validarPasso2 = () => {
    const novos = {}
    if (isPrestador && (!cep || cep.length !== 8)) novos.cep = 'Informe um CEP válido'
    if (isPrestador && !especialidades.length) novos.especialidades = 'Escolha ao menos uma especialidade'
    if (!uf.trim()) novos.uf = 'Selecione o estado'
    if (!cidade.trim()) novos.cidade = 'Selecione a cidade'
    if (!cpfCnpj.trim()) {
      novos.cpfCnpj = 'Informe CPF ou CNPJ'
    } else if (!validarCpfCnpj(cpfCnpj)) {
      novos.cpfCnpj = 'CPF ou CNPJ inválido'
    }
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  // Pré-checagem de duplicidade em BACKGROUND — pura conveniência, NÃO trava o fluxo.
  // Fix 1 garante que um duplicado é pego no submit final como 409 com a mensagem
  // certa, então não precisamos de gate aqui: fire-and-forget, sem await, sem
  // spinner/"verificando". Se o servidor confirmar duplicado rápido, avisamos cedo
  // (alerta não-bloqueante) p/ o usuário voltar e corrigir; se a rede estiver lenta,
  // ele segue preenchendo normalmente e nada fica "travado".
  // aoDuplicar: quando informado, o 409 vira aviso INLINE (erro sob o campo) em vez do
  // Alert. Usado pela checagem de CPF no onBlur, onde o usuário ainda está na tela do
  // campo e um popup atrapalharia mais do que ajudaria.
  // tipo_conta só acompanha a checagem com a chave de múltiplas contas ligada; desligada,
  // o payload é o de sempre.
  const comTipoConta = (payload) => (multiplasContasRef.current && tipoConta ? { ...payload, tipo_conta: tipoConta } : payload)

  const checarDisponibilidadeBackground = (payload, { marcarOk = false, aoDuplicar = null } = {}) => {
    // Mesmo aviso, mesmo estilo de cada chamador (inline no onBlur do CPF, Alert no resto).
    const avisarOutroTipo = () => {
      if (!montadoRef.current) return
      if (aoDuplicar) aoDuplicar({ mensagem: MSG_OUTRO_TIPO })
      else Alert.alert('Atenção', MSG_OUTRO_TIPO)
    }
    comRetry(() => api.post('/auth/verificar-disponibilidade', comTipoConta(payload)), { timeout: true, servidor: true })
      .then((resp) => {
        // e-mail + CPF confirmados livres → handleCadastrar pula a re-checagem no submit.
        if (marcarOk) disponibilidadeOkRef.current = true
        if (multiplasContasRef.current && ehOutroTipo(resp)) avisarOutroTipo()
      })
      .catch(err => {
        if (multiplasContasRef.current && ehOutroTipo(err)) {
          // Já tem conta de OUTRO tipo com este e-mail/CPF: avisa e o cadastro segue.
          if (marcarOk) disponibilidadeOkRef.current = true
          avisarOutroTipo()
        } else if (err?.status === 409 && montadoRef.current) {
          // Aviso não-bloqueante (codigo estável: cpf_duplicado / email_duplicado).
          if (aoDuplicar) aoDuplicar({ ...err, mensagem: msgErroContas(err?.codigo) || err?.mensagem })
          else Alert.alert('Atenção', msgErroContas(err?.codigo) || err?.mensagem || 'Estes dados já estão cadastrados.')
        } else {
          const kind = classificarErro(err)
          console.log(`[cadastro] ⚠ pré-checagem background ignorada | kind=${kind} | status=${err?.status} | code=${err?.code}`)
        }
      })
  }

  // Aviso EARLY de CPF duplicado, no ponto mais cedo possível: ao SAIR do campo, assim
  // que o formato passa. Vale p/ prestador E dono — o dono nunca chegava no gate de
  // transição do passo 2 (lá o passo 2 é o submit), então só descobria o duplicado no
  // final. Mesma checagem de background do passo 1/2: fire-and-forget, sem gate.
  const verificarCpfDisponivel = () => {
    const doc = cpfCnpj.trim()
    // Formato inválido/incompleto não vai à rede — validarPasso2 já cobre esse caso.
    if (!doc || !validarCpfCnpj(doc)) return
    checarDisponibilidadeBackground({ cpf_cnpj: doc }, {
      aoDuplicar: (err) => setErros(e => ({ ...e, cpfCnpj: err?.mensagem || 'CPF/CNPJ já cadastrado' })),
    })
  }

  // Qualquer edição de e-mail ou CPF invalida a pré-checagem já confirmada: o ref volta
  // a false (handleCadastrar reconsulta no submit em vez de confiar no dado antigo) e o
  // aviso inline sai da tela, já que se refere ao valor anterior.
  const invalidarDisponibilidade = () => {
    disponibilidadeOkRef.current = false
    setErros(e => (e.cpfCnpj ? { ...e, cpfCnpj: null } : e))
  }

  const avancar = () => {
    if (passo === 1 && !validarPasso1()) return
    if (passo === 2 && !validarPasso2()) return

    // >= e não ===: se o lançamento grátis resolver com o usuário já no passo de plano,
    // totalPassos cai para 2 e o passo 3 vira o último.
    if (passo >= totalPassos) { handleCadastrar(); return }
    // Para dono, passo 2 já é o último antes de cadastrar
    if (isDono && passo === 2) { handleCadastrar(); return }

    // Chegou aqui = vai avançar de tela (não é submit). Dispara o aviso cedo,
    // não-bloqueante, no ponto em que o dado passa a existir: e-mail ao sair do
    // passo 1, CPF ao sair do passo 2.
    // Vale p/ dono E prestador (mesma tela, mesmos passos 1 e 2).
    if (passo === 1) {
      checarDisponibilidadeBackground({ email: email.trim().toLowerCase() })
    } else if (passo === 2) {
      checarDisponibilidadeBackground({ email: email.trim().toLowerCase(), cpf_cnpj: cpfCnpj.trim() }, { marcarOk: true })
    }

    setPasso(p => p + 1)
  }

  const voltar = () => {
    if (passo > 1) setPasso(p => p - 1)
    else if (passo === 1) { setTipoConta(null); setPasso(0) }
    else {
      // Saiu da tela de cadastro (cancelou): descarta o rascunho para não restaurar depois.
      restauradoRef.current = false
      limparRascunho()
      navigation.goBack()
    }
  }

  const handleCadastrar = async () => {
    // Rede de segurança do passo 2, e não uma segunda regra: validarPasso2 continua sendo
    // quem valida: `avancar` o executa em toda transição 2→3. O buraco é OUTRO — a
    // restauração de rascunho faz setPasso(s.passo ?? 0) (:358) e cai direto no passo 3
    // sem passar por `avancar`, então um rascunho gravado antes desta mudança (cujo texto
    // livre a normalização descarta) chegava ao submit com a lista vazia.
    //
    // Volta ao passo 2 com o erro no campo em vez de só recusar: o useEffect de [passo]
    // rola ao topo, então o campo aparece já em vermelho e a ação fica óbvia. O alerta
    // existe porque um salto de tela sem explicação se lê como bug.
    //
    // ANTES do emAndamentoRef: sair aqui com a trava ligada deixaria o botão morto para
    // sempre, e o usuário não teria como submeter nem depois de escolher.
    if (isPrestador && !especialidades.length) {
      setErros(e => ({ ...e, especialidades: 'Escolha ao menos uma especialidade' }))
      setPasso(2)
      Alert.alert('Falta uma coisa', 'Escolha ao menos uma especialidade para concluir o cadastro.')
      return
    }
    if (emAndamentoRef.current) return   // já em andamento: ignora toques repetidos
    emAndamentoRef.current = true
    setCarregando(true)
    try {
      // step1 — Pré-checagem de CPF/e-mail. Roda UMA ÚNICA VEZ por sessão: se já passou,
      // re-tentativas pulam direto para o cadastro. Isso evita a
      // cascata de chamadas que estourava o rate limit (429 "Muitas tentativas").
      if (!disponibilidadeOkRef.current) {
        setProgresso('Verificando dados...')
        console.log('[cadastro] ▶ step1 POST /auth/verificar-disponibilidade', { email: email.trim().toLowerCase(), cpf_cnpj: cpfCnpj.trim() })
        try {
          await comRetry(() => api.post('/auth/verificar-disponibilidade', comTipoConta({
            email: email.trim().toLowerCase(),
            cpf_cnpj: cpfCnpj.trim(),
          })), { timeout: true, servidor: true })
          disponibilidadeOkRef.current = true
          console.log('[cadastro] ✓ step1 disponibilidade ok')
        } catch (err) {
          const kind = classificarErro(err)
          console.log(`[cadastro] ✗ step1 verificar-disponibilidade FALHOU | kind=${kind} | status=${err?.status} | msg="${err?.mensagem || err?.message}" | code=${err?.code}`)
          // FAIL-OPEN: só um 409 (duplicado EXPLÍCITO) bloqueia aqui. Erros não-definitivos
          // (timeout/rede/5xx) NÃO travam o cadastro — seguimos para o POST /auth/cadastro,
          // que é o backstop real e devolve 409 com a mensagem certa se de fato for duplicado.
          // Múltiplas contas ligado: "já existe em OUTRO tipo" não é duplicado — segue.
          const outroTipo = multiplasContasRef.current && ehOutroTipo(err)
          if (err?.status === 409 && !outroTipo) throw err
          console.log('[cadastro] ↻ step1 falhou por erro não-definitivo — prosseguindo (POST /auth/cadastro é o backstop)')
        }
      } else {
        console.log('[cadastro] ↻ step1 verificar-disponibilidade já validado nesta sessão — pulando')
      }

      const dados = {
        nome: `${nome.trim()} ${sobrenome.trim()}`.trim(),
        email: email.trim().toLowerCase(),
        telefone: telefone.trim(),
        senha,
        cidade: cidade.trim(),
        cpf_cnpj: cpfCnpj.trim(),
        tipo_conta: tipoConta,
        // iOS nunca mostra a escolha: vai 'mensal' explícito, e não o estado (que também é
        // 'mensal', mas por omissão — e um rascunho poderia trazer outro valor).
        plano: isPrestador ? (mostrarCobranca ? planoSelecionado : 'mensal') : null,
        pais: 'Brasil',
        uf: uf.trim(),
        cep: isPrestador ? (cep || null) : null,
        latitude: isPrestador ? latitude : null,
        longitude: isPrestador ? longitude : null,
        logradouro: isPrestador ? (logradouro.trim() || null) : null,
        numero: isPrestador ? (numero.trim() || null) : null,
        complemento: isPrestador ? (complemento.trim() || null) : null,
        bairro: isPrestador ? (bairro.trim() || null) : null,
        anos_experiencia: isPrestador ? parseInt(anosExp) || 0 : 0,
        tamanho_equipe: isPrestador ? parseInt(equipe) || 1 : 1,
        especialidades: isPrestador ? especialidades : [],
        // PIX e referências do prestador não vão mais no cadastro (POST /auth/verificacao).
        // O dono segue mandando os mesmos vazios de sempre.
        ...(isDono ? { pix_reembolso: null, referencias: [] } : {}),
        rg: isPrestador ? rg.trim() || null : null,
        rg_orgao: isPrestador ? rgOrgao : null,
        rg_estado: isPrestador ? rgEstado || null : null,
      }

      setProgresso('Finalizando cadastro...')
      console.log('[cadastro] ▶ step4 POST /auth/cadastro', { ...dados, senha: '[REDACTED]' })
      let resposta
      try {
        // POST cria recurso (não-idempotente) → comRetry padrão: só reexecuta em ERR_NETWORK
        // (requisição não chegou ao servidor). NÃO habilitar timeout/servidor para não duplicar cadastro.
        resposta = await comRetry(() => authService.cadastrar(dados))
        console.log('[cadastro] ✓ step4 cadastro ok', { usuario_id: resposta?.usuario?.id, role: resposta?.usuario?.role, tipo_prestador: resposta?.usuario?.tipo_prestador, token: !!resposta?.token })
      } catch (err) {
        const kind = classificarErro(err)
        console.log(`[cadastro] ✗ step4 /auth/cadastro FALHOU | kind=${kind} | status=${err?.status} | msg="${err?.mensagem || err?.message}" | code=${err?.code}`)
        throw err
      }

      // Cadastro concluído com sucesso → descarta o rascunho e interrompe novos saves
      // (evita re-gravar durante a transição de tela disparada pelo loginComToken).
      restauradoRef.current = false
      await limparRascunho()

      // Evento de cadastro concluído para o Meta SDK. Antes do loginComToken, que dispara
      // a troca de tela. Nunca pode bloquear o cadastro: falha aqui só vai para o log.
      try {
        AppEventsLogger.logEvent(AppEventsLogger.AppEvents.CompletedRegistration, {
          [AppEventsLogger.AppEventParams.RegistrationMethod]: String(resposta?.usuario?.role ?? ''),
        })
      } catch (err) {
        console.log('[MetaSDK] falha ao registrar CompletedRegistration | msg:', err?.message)
      }

      if (resposta?.token) {
        await loginComToken(resposta.token, resposta.usuario, resposta.assinatura)

        // Prestador já entra com acesso: o loginComToken acima troca a pilha para o
        // feed (AppNavigator), então o botão só precisa fechar o alerta. Só quando a
        // assinatura veio ativa — sem isso a tela seguinte é a de pagamento/análise, e
        // prometer "já pode ver os serviços" seria mentira.
        if (isPrestador && resposta.assinatura?.status === 'ativa') {
          Alert.alert(
            'Cadastro concluído!',
            'Você já pode ver os serviços disponíveis na sua região e começar a trabalhar! Quando enviar sua primeira proposta, pediremos a confirmação da sua identidade.',
            [{ text: 'Ver serviços disponíveis' }]
          )
        }
      } else {
        Alert.alert(
          'Conta criada!',
          'Faça login para continuar.',
          [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
        )
      }

    } catch (err) {
      const kind = classificarErro(err)
      console.log(`[cadastro] ✗ handleCadastrar FALHOU | kind=${kind} | status=${err?.status} | msg="${err?.mensagem || err?.message}" | code=${err?.code}`)
      // Erros novos de múltiplas contas (401 senha_conta_existente, 409 tipo_duplicado /
      // limite_contas): mesmo Alert dos duplicados, com o texto do mapa.
      if (msgErroContas(err?.codigo)) {
        Alert.alert('Atenção', msgErroContas(err?.codigo))
        return
      }
      if (err.status === 409) {
        Alert.alert('Atenção', err.mensagem || 'Dados já cadastrados.')
        return
      }
      if (kind === 'TIMEOUT' || kind === 'NETWORK_ERROR') {
        Alert.alert('Conexão lenta', 'Conexão lenta detectada. Verifique sua internet e tente novamente.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.')
      } else {
        Alert.alert('Erro', err.mensagem || err.message || 'Não foi possível criar sua conta.')
      }
    } finally {
      emAndamentoRef.current = false
      setCarregando(false)
      setProgresso('')
    }
  }

  const getValorPlano = () => {
    if (tipoConta === 'prestador') return { mensal: 'R$ 49,90', anual: 'R$ 41,58', anualTotal: 'R$ 499/ano' }
    return { mensal: 'R$ 99,90', anual: 'R$ 83,25', anualTotal: 'R$ 999/ano' }
  }

  const valores = getValorPlano()

  if (passo === 0) {
    const corLado = lado === 'trabalhar' ? COR_TRABALHAR : COR_CONTRATAR
    // 2ª tela: serviço primeiro. O tipo de cada opção é o mesmo de sempre; sem `preco` = dono (Gratuito).
    const opcoesLado = lado === 'trabalhar' ? [
      { tipo: 'prestador', icone: '🔧', titulo: 'Serviços gerais e domésticos', desc: 'Manicure, maquiagem, aula particular, montagem de móveis e muito mais', preco: 'R$ 49,90/mês' },
      { tipo: 'pintor', icone: '🖌️', titulo: 'Obras, construção e pintura', desc: 'Pedreiro, pintor, construtor', preco: 'R$ 99,90/mês' },
    ] : [
      { tipo: 'dono_reparo', icone: '🛠️', titulo: 'Um serviço doméstico', desc: 'Conserto, montagem, aula, beleza e muito mais, com profissionais da minha região' },
      { tipo: 'dono_obra', icone: '🏠', titulo: 'Uma obra, reforma ou pintura', desc: 'Cadastro a obra e recebo propostas de profissionais da minha região' },
    ]
    return (
      <SafeAreaView style={estilos.container}>
        <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => (lado ? setLado(null) : navigation.navigate('Splash'))}>
            <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
          </TouchableOpacity>
          <View style={estilos.logoWrap}>
            <Image source={require('../../../assets/logo.png')} style={estilos.logo} resizeMode="contain" />
            <Text style={estilos.logoNome}>
              <Text style={{ color: cores.marcaAzul }}>P</Text>ro<Text style={{ color: cores.primaria }}>T</Text>udo
            </Text>
            <View style={estilos.logoRegua} />
          </View>
          {!lado ? (
            <>
              <Text style={[estilos.titulo, { textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>O que você quer fazer?</Text>
              <Text style={[estilos.subtitulo, { textAlign: 'center' }]}>Toque em uma das duas opções</Text>

              <TouchableOpacity style={[estilos.ladoCard, { borderColor: COR_TRABALHAR, backgroundColor: COR_TRABALHAR + '22' }]} onPress={() => setLado('trabalhar')} activeOpacity={0.8}>
                <View style={estilos.ladoTituloLinha}>
                  <Text style={estilos.ladoIcone}>🔧</Text>
                  <Text style={[estilos.ladoTitulo, { color: COR_TRABALHAR }]}>QUERO TRABALHAR</Text>
                </View>
                <Text style={estilos.ladoDesc}>Sou profissional e quero receber pedidos de obras e serviços</Text>
                {/* Mesma condição do "Grátis" dos preços: nunca no iOS (3.1.1), só na janela de lançamento. */}
                {mostrarCobranca && lancamentoGratis && (
                  <Text style={estilos.ladoGratis}>Gratuito</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={[estilos.ladoCard, { borderColor: COR_CONTRATAR, backgroundColor: COR_CONTRATAR + '22' }]} onPress={() => setLado('contratar')} activeOpacity={0.8}>
                <View style={estilos.ladoTituloLinha}>
                  <Text style={estilos.ladoIcone}>🏠</Text>
                  <Text style={[estilos.ladoTitulo, { color: COR_CONTRATAR }]}>QUERO CONTRATAR</Text>
                </View>
                <Text style={estilos.ladoDesc}>Preciso de um profissional para uma obra ou um serviço</Text>
                <Text style={estilos.ladoGratis}>Sempre gratuito</Text>
              </TouchableOpacity>

              <View style={estilos.avisoCadastros}>
                <Text style={estilos.avisoCadastrosIcone}>👥</Text>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.avisoCadastrosTitulo}>Até 4 cadastros por pessoa</Text>
                  <Text style={estilos.avisoCadastrosTexto}>
                    Com o <Text style={estilos.avisoCadastrosDestaque}>mesmo e-mail, CPF e senha</Text> você pode ter um cadastro de cada tipo: profissional e cliente, de obra e de serviço.
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={estilos.ladoPillLinha}>
                <View style={[estilos.ladoPill, { borderColor: corLado, backgroundColor: corLado + '22' }]}>
                  <Text style={[estilos.ladoPillTexto, { color: corLado }]}>{lado === 'trabalhar' ? 'QUERO TRABALHAR' : 'QUERO CONTRATAR'}</Text>
                </View>
                <TouchableOpacity onPress={() => setLado(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={estilos.ladoTrocar}>trocar</Text>
                </TouchableOpacity>
              </View>

              {opcoesLado.map((op, i) => (
                <TouchableOpacity key={op.tipo} style={[estilos.opcaoCard, { borderColor: corLado, backgroundColor: corLado + '22' }, i > 0 && { marginTop: 32 }]} onPress={() => escolherTipo(op.tipo)} activeOpacity={0.8}>
                  <Text style={estilos.opcaoIcone}>{op.icone}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[estilos.opcaoTitulo, { color: corLado }]}>{op.titulo}</Text>
                    <Text style={estilos.opcaoDesc}>{op.desc}</Text>
                    {op.preco ? (
                      /* Preço de assinatura: nunca no iOS (3.1.1), nem riscado. */
                      mostrarCobranca && (lancamentoGratis ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={[estilos.tipoPreco, { color: cores.textoFraco, textDecorationLine: 'line-through' }]}>{op.preco}</Text>
                          <Text style={[estilos.tipoPreco, { color: cores.sucesso, fontWeight: '700', marginLeft: 6 }]}>Grátis</Text>
                        </View>
                      ) : (
                        <Text style={estilos.tipoPreco}>{op.preco}</Text>
                      ))
                    ) : (
                      <Text style={[estilos.tipoPreco, { color: cores.sucesso }]}>Gratuito</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'android' && Platform.Version < 35 ? undefined : 'padding'} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={[estilos.scroll, larguraMaxima, { paddingTop: insets.top + 8 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={voltar}>
            <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
          </TouchableOpacity>
          <View style={estilos.logoWrap}>
            <Image source={require('../../../assets/logo.png')} style={estilos.logo} resizeMode="contain" />
            <Text style={estilos.logoNome}>
              <Text style={{ color: cores.marcaAzul }}>P</Text>ro<Text style={{ color: cores.primaria }}>T</Text>udo
            </Text>
            <View style={estilos.logoRegua} />
          </View>
          <Text style={estilos.titulo}>
            {passo === 1 ? 'Criar\nsua conta'
              : passo === 2 ? (isDono ? 'Seus\ndados' : 'Perfil\nprofissional')
              : 'Escolha\nseu plano'}
          </Text>
          <Text style={estilos.subtitulo}>
            {`Passo ${Math.min(passo, totalPassos)} de ${totalPassos} — ${
              passo === 1 ? 'dados pessoais'
              : passo === 2 ? (isDono ? 'localização e documento' : 'informações profissionais')
              : 'assinatura'}`}
          </Text>
          <IndicadorPassos passo={Math.min(passo, totalPassos)} total={totalPassos} />

          {/* PASSO 1 — Dados pessoais */}
          {passo === 1 && (
            <View>
              <View style={estilos.duasColunas}>
                <Input label="NOME" placeholder="Primeiro nome" value={nome} onChangeText={setNome} erro={erros.nome} estilo={{ flex: 1 }} />
                <Input label="SOBRENOME" placeholder="Sobrenome" value={sobrenome} onChangeText={setSobrenome} estilo={{ flex: 1 }} />
              </View>
              <Input label="E-MAIL" placeholder="seu@email.com" value={email} onChangeText={(t) => { setEmail(t); invalidarDisponibilidade() }} keyboardType="email-address" autoCapitalize="none" erro={erros.email} />
              <Input label="WHATSAPP" placeholder="(34) 99999-9999" value={telefone} onChangeText={(t) => setTelefone(mascararTelefone(t))} keyboardType="phone-pad" />
              <View>
                <Input label="SENHA" placeholder="Mínimo 8 caracteres" value={senha} onChangeText={setSenha} secureTextEntry={!mostrarSenha} erro={erros.senha} />
                <TouchableOpacity style={estilos.olhoBtn} onPress={() => setMostrarSenha(!mostrarSenha)}>
                  <Text style={estilos.olhoTexto}>{mostrarSenha ? 'ocultar' : 'mostrar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* PASSO 2 — Perfil profissional */}
          {passo === 2 && (
            <View>
              {isDono && (
                <Text style={{ fontSize: 12, color: cores.textoFraco, marginBottom: 16, lineHeight: 18 }}>
                  ⚠️ Informe seus dados e endereço atual, não o endereço da obra (se forem diferentes)
                </Text>
              )}
              {isPrestador && (
                <>
                  <Text style={estilos.dicaCep}>Comece pelo CEP — endereço, estado e cidade são preenchidos automaticamente</Text>
                  <View style={estilos.cepRow}>
                    <Input label="CEP" placeholder="00000-000" value={cep} onChangeText={buscarCep} keyboardType="numeric" maxLength={8} erro={erros.cep} estilo={{ flex: 1 }} />
                    {buscandoCep && <ActivityIndicator color={cores.primaria} style={{ marginTop: 28, marginLeft: 12 }} />}
                    {enderecoEncontrado && !buscandoCep && <Text style={estilos.cepOk}>✅</Text>}
                  </View>
                  <Input label="LOGRADOURO (rua/avenida)" placeholder="Preenchido pelo CEP" value={logradouro} onChangeText={setLogradouro} />
                  <View style={estilos.duasColunas}>
                    <Input label="NÚMERO" placeholder="Ex: 123" value={numero} onChangeText={setNumero} keyboardType="numeric" estilo={{ flex: 1 }} />
                    <Input label="COMPLEMENTO" placeholder="Apto/bloco (opcional)" value={complemento} onChangeText={setComplemento} estilo={{ flex: 2 }} />
                  </View>
                  <Input label="BAIRRO" placeholder="Preenchido pelo CEP" value={bairro} onChangeText={setBairro} />
                </>
              )}
              <SeletorLocalidade
                uf={uf}
                cidade={cidade}
                onChange={({ uf: u, cidade: c }) => { setUf(u); setCidade(c || '') }}
                erroEstado={erros.uf}
                erroCidade={erros.cidade}
              />
              <Input label="CPF / CNPJ" placeholder="000.000.000-00" value={cpfCnpj} onChangeText={(t) => { setCpfCnpj(mascararCpfCnpj(t)); invalidarDisponibilidade() }} onBlur={verificarCpfDisponivel} keyboardType="numeric" erro={erros.cpfCnpj} />
              {isPrestador && (
                <>
                  <View style={estilos.duasColunas}>
                    <Input label="ANOS DE EXP." placeholder="Ex: 8" value={anosExp} onChangeText={setAnosExp} keyboardType="numeric" estilo={{ flex: 1 }} />
                    <Input label="TAMANHO DA EQUIPE" placeholder="Nº de pessoas" value={equipe} onChangeText={setEquipe} keyboardType="numeric" estilo={{ flex: 1 }} />
                  </View>
                  {/* Campo de ABERTURA, não de digitação: a lista é fechada e a escolha
                      acontece na EspecialidadesScreen. O ✕ de cada pill remove ali mesmo,
                      sem reabrir a tela — tirar uma de cinco não vale uma navegação. */}
                  <Text style={estilos.labelSecao}>ESPECIALIDADES (até {MAX_ESPECIALIDADES})</Text>
                  <TouchableOpacity
                    style={[estilos.campoEspecialidades, erros.especialidades && estilos.campoEspecialidadesErro]}
                    onPress={() => navigation.navigate('Especialidades', { selecionadas: especialidades, lado: tipoConta === 'pintor' ? 'pintura' : 'reparo', origem: 'Cadastro' })}
                    activeOpacity={0.7}
                  >
                    <Text style={especialidades.length ? estilos.campoEspTexto : estilos.campoEspPlaceholder}>
                      {especialidades.length ? `${especialidades.length} selecionada${especialidades.length > 1 ? 's' : ''}` : 'Escolher especialidades'}
                    </Text>
                    <Text style={estilos.campoEspSeta}>→</Text>
                  </TouchableOpacity>
                  {!!erros.especialidades && <Text style={estilos.erroEspecialidades}>{erros.especialidades}</Text>}
                  {!!especialidades.length && (
                    <View style={estilos.espPills}>
                      {especialidades.map(slug => (
                        <TouchableOpacity
                          key={slug}
                          style={estilos.espPill}
                          onPress={() => setEspecialidades(atuais => atuais.filter(s => s !== slug))}
                          activeOpacity={0.7}
                        >
                          <Text style={estilos.espPillTexto}>{rotuloEspecialidade(slug)}</Text>
                          <Text style={estilos.espPillX}>✕</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <Input label="RG (somente números)" placeholder="000000000" value={rg} onChangeText={(t) => setRg(t.replace(/\D/g, '').slice(0, 9))} keyboardType="numeric" />
                  <Text style={estilos.labelSecao}>ÓRGÃO EMISSOR DO RG</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {['SSP', 'PC', 'PM', 'IFP', 'DETRAN', 'Outro'].map(o => (
                      <TouchableOpacity key={o} style={[estilos.categoriaPill, rgOrgao === o && estilos.categoriaPillAtivo]} onPress={() => setRgOrgao(o)}>
                        <Text style={[estilos.categoriaPillTexto, rgOrgao === o && estilos.categoriaPillTextoAtivo]}>{o}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={estilos.labelSecao}>ESTADO EMISSOR DO RG</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(s => (
                      <TouchableOpacity key={s} style={[estilos.categoriaPill, rgEstado === s && estilos.categoriaPillAtivo]} onPress={() => setRgEstado(s)}>
                        <Text style={[estilos.categoriaPillTexto, rgEstado === s && estilos.categoriaPillTextoAtivo]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          {/* PASSO 3 — Plano */}
          {passo === 3 && isPrestador && (
            <View>
              <Text style={estilos.planoSubtitulo}>
                Escolha o plano para acessar {tipoConta === 'prestador' ? 'os serviços disponíveis' : 'as obras disponíveis'}:
              </Text>
              <TouchableOpacity style={[estilos.planoCard, planoSelecionado === 'mensal' && estilos.planoCardAtivo]} onPress={() => setPlanoSelecionado('mensal')} activeOpacity={0.8}>
                <View style={[estilos.planoRadio, planoSelecionado === 'mensal' && estilos.planoRadioAtivo]}>
                  {planoSelecionado === 'mensal' && <View style={estilos.planoRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.planoNome}>Plano Mensal</Text>
                  <Text style={estilos.planoDesc}>Acesso completo</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={estilos.planoPreco}>{valores.mensal}</Text>
                  <Text style={estilos.planoPeriodo}>/mês</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={[estilos.planoCard, planoSelecionado === 'anual' && estilos.planoCardAtivo]} onPress={() => setPlanoSelecionado('anual')} activeOpacity={0.8}>
                <View style={{ position: 'absolute', top: -10, right: 14 }}>
                  <View style={estilos.planoDestaque}><Text style={estilos.planoDestaqueTexto}>Economize 2 meses</Text></View>
                </View>
                <View style={[estilos.planoRadio, planoSelecionado === 'anual' && estilos.planoRadioAtivo]}>
                  {planoSelecionado === 'anual' && <View style={estilos.planoRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.planoNome}>Plano Anual</Text>
                  <Text style={estilos.planoDesc}>Melhor custo-benefício</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={estilos.planoPreco}>{valores.anual}</Text>
                  <Text style={estilos.planoPeriodo}>/mês · {valores.anualTotal}</Text>
                </View>
              </TouchableOpacity>
              {/* Menção à forma de pagamento: some no iOS (3.1.1), sem frase no lugar. */}
              {mostrarCobranca && (
              <View style={estilos.segurancaBox}>
                <Text style={estilos.segurancaIcone}>🔒</Text>
                <Text style={estilos.segurancaTexto}>Pagamento 100% seguro via PagBank. Cancele quando quiser.</Text>
              </View>
              )}
            </View>
          )}

          {!!progresso && (
            <View style={estilos.enviandoBox}>
              <Text style={estilos.enviandoTexto}>📤 {progresso}</Text>
            </View>
          )}
          <View style={estilos.acoesRow}>
            <BotaoPrimario
              titulo={carregando && progresso ? progresso : (passo >= totalPassos ? 'Finalizar cadastro →' : 'Continuar →')}
              onPress={avancar}
              carregando={carregando && !progresso}
              desabilitado={carregando}
            />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40, paddingTop: 8 },
  logoWrap: { alignItems: 'center', marginBottom: 4 },
  logo: { width: 170, height: 64 },
  // Mesmos valores do rótulo da SplashScreen (logoNome), para as duas telas baterem.
  logoNome: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, marginBottom: 2 },
  // Mesmos valores da régua da SplashScreen (logoRegua), para as três telas baterem.
  logoRegua: { width: 88, height: 2, borderRadius: 1, backgroundColor: cores.primaria, marginTop: 0, marginBottom: 10 },
  btnVoltar: { marginTop: 8, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  // Mesmos 20/26 do titulo da LoginScreen, pelo mesmo motivo: em 28 a saudação empatava
  // com o wordmark (mesmo corpo, mesmo peso) e, nos passos que quebram em duas linhas
  // ("Criar\nsua conta"), pesava mais que a marca. O passo 0 segue com adjustsFontSizeToFit
  // e minimumFontScale 0.85 (:910) — agora encolhendo a partir de 20, que é o efeito
  // desejado: o título nunca ultrapassa a marca, nem quando cabe folgado.
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 26, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 12 },
  indicador: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  indicadorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: cores.fundoElevado },
  indicadorDotAtivo: { width: 20, borderRadius: 3, backgroundColor: cores.primaria },
  indicadorDotFeito: { backgroundColor: cores.sucesso },
  duasColunas: { flexDirection: 'row', gap: 12 },
  olhoBtn: { position: 'absolute', right: 14, bottom: 27 },
  olhoTexto: { fontSize: 12, color: cores.textoFraco },
  ladoCard: { borderWidth: 2, borderRadius: raios.grande, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', marginBottom: 20 },
  ladoTituloLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 },
  ladoIcone: { fontSize: 38 },
  ladoTitulo: { fontSize: 22, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center', flexShrink: 1 },
  ladoDesc: { fontSize: 15, color: cores.textoForte, lineHeight: 22, textAlign: 'center' },
  ladoGratis: { fontSize: 14, fontWeight: '700', color: cores.sucesso, marginTop: 10 },
  avisoCadastros: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#141417', borderWidth: 1, borderColor: '#2E2E34', borderRadius: raios.grande, padding: 16 },
  avisoCadastrosIcone: { fontSize: 24 },
  avisoCadastrosTitulo: { fontSize: 15, fontWeight: '700', color: cores.branco, marginBottom: 4 },
  avisoCadastrosTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 19 },
  avisoCadastrosDestaque: { color: '#E8833A' },
  ladoPillLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 24 },
  ladoPill: { borderWidth: 2, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16 },
  ladoPillTexto: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  ladoTrocar: { fontSize: 14, color: cores.textoFraco, textDecorationLine: 'underline' },
  opcaoCard: { borderWidth: 2, borderRadius: raios.grande, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  opcaoIcone: { fontSize: 40 },
  opcaoTitulo: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  opcaoDesc: { fontSize: 14, color: cores.textoForte, lineHeight: 20, marginBottom: 6 },
  tipoPreco: { fontSize: 12, fontWeight: '600', color: cores.primaria },
  planoSubtitulo: { fontSize: 13, color: cores.textoMedio, marginBottom: 16 },
  planoCard: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  planoCardAtivo: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  planoRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 0.5, borderColor: cores.borda, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  planoRadioAtivo: { borderColor: cores.primaria, backgroundColor: cores.primaria },
  planoRadioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#0A0A0A' },
  planoNome: { fontSize: 14, fontWeight: '600', color: cores.textoForte, marginBottom: 2 },
  planoDesc: { fontSize: 11, color: cores.textoFraco },
  planoPreco: { fontSize: 15, fontWeight: '700', color: cores.sucesso },
  planoPeriodo: { fontSize: 10, color: cores.textoFraco, textAlign: 'right' },
  planoDestaque: { backgroundColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 3 },
  planoDestaqueTexto: { fontSize: 10, fontWeight: '700', color: '#0A0A0A' },
  segurancaBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, marginTop: 4 },
  segurancaIcone: { fontSize: 14 },
  segurancaTexto: { flex: 1, fontSize: 11, color: cores.textoFraco, lineHeight: 17 },
  acoesRow: { marginTop: 24 },
  labelSecao: { fontSize: 11, fontWeight: '600', color: cores.textoForte, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  // Mesma caixa do Input (fundo, borda, raio, padding) para o campo não parecer de outra
  // família só por abrir uma tela em vez de aceitar digitação.
  campoEspecialidades: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: raios.medio, paddingHorizontal: espacos.lg, paddingVertical: 13, marginTop: 7 },
  campoEspecialidadesErro: { borderColor: cores.perigo },
  campoEspTexto: { fontSize: 14, color: cores.textoForte },
  campoEspPlaceholder: { fontSize: 14, color: cores.placeholderCampo },
  campoEspSeta: { fontSize: 14, color: cores.textoFraco },
  erroEspecialidades: { color: cores.perigo, fontSize: 11, marginTop: 4 },
  espPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 4 },
  espPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 6 },
  espPillTexto: { fontSize: 12, color: cores.textoForte },
  espPillX: { fontSize: 12, color: cores.primaria, fontWeight: '700' },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
  categoriaPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  categoriaPillTexto: { fontSize: 12, color: cores.textoMedio },
  categoriaPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  enviandoBox: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 12, alignItems: 'center', marginTop: 12 },
  enviandoTexto: { fontSize: 13, color: cores.textoMedio },
  cepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cepOk: { fontSize: 20, marginTop: 28, marginLeft: 12 },
  dicaCep: { fontSize: 11, color: cores.textoMedio, marginBottom: 10, marginTop: 12 },
})