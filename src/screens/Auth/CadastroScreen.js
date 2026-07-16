import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, AppState
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'react-native'
import { BotaoPrimario, Input, SeletorLocalidade } from '../../components'
import api, { authService } from '../../services/api'
import { comRetry } from '../../utils/rede'
import { recuperarMidiasPendentes } from '../../utils/midia'
import { RASCUNHO_KEY, RASCUNHO_SENHA_KEY, RASCUNHO_FOTOS_KEY, limparRascunhoCadastro } from '../../utils/rascunhoCadastro'
import { useAuth } from '../../contexts/AuthContext'
import { cores, espacos, raios } from '../../utils/tema'

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

const mascararTelefone = (valor) => {
  const nums = valor.replace(/\D/g, '').slice(0, 11)
  if (nums.length <= 10) {
    return nums.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
  }
  return nums.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
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

// Slot de foto com estado explícito de upload: enviando / enviada ✓ / erro (+ "Tentar
// novamente"). Em erro NÃO reverte para "Tirar foto" — mostra a falha e o botão de retry.
const UploadFoto = ({ label, valor, uploadando, enviada, erro, onPress, onRetry }) => (
  <View>
    <TouchableOpacity style={estilos.uploadFotoBtn} onPress={onPress} activeOpacity={0.8}>
      {valor ? (
        <Image source={{ uri: valor }} style={estilos.uploadFotoPreview} resizeMethod="resize" resizeMode="cover" />
      ) : (
        <View style={estilos.uploadFotoVazio}>
          <Text style={estilos.uploadFotoIcone}>📷</Text>
          <Text style={estilos.uploadFotoTexto}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
    {uploadando ? (
      <Text style={[estilos.fotoStatus, { color: cores.textoFraco }]}>Enviando…</Text>
    ) : erro ? (
      <TouchableOpacity onPress={onRetry} activeOpacity={0.7}>
        <Text style={[estilos.fotoStatus, { color: cores.perigo }]}>⚠ Falha no envio — tentar novamente</Text>
      </TouchableOpacity>
    ) : enviada ? (
      <Text style={[estilos.fotoStatus, { color: cores.sucesso }]}>✓ Enviada</Text>
    ) : valor ? (
      <Text style={[estilos.fotoStatus, { color: cores.textoFraco }]}>Adicionada</Text>
    ) : null}
  </View>
)

// Sobe a mídia direto ao Cloudinary com retry resiliente e SILENCIOSO.
// Até 9 tentativas (1 + MAX_UPLOAD_RETRIES) com backoff exponencial + jitter,
// cobrindo falhas de transporte (onerror/ontimeout) E respostas de erro HTTP do
// Cloudinary (4xx/5xx com corpo { error }) — que antes furavam o retry. Nenhum
// alerta aparece enquanto restam tentativas; só rejeita após esgotar todas.
const MAX_UPLOAD_RETRIES = 8
const UPLOAD_TIMEOUT = 45000

// Cutover das 3 fotos de verificação para o NOSSO endpoint (POST /upload/midia).
// true  = tenta o endpoint e, se falhar, cai no direto-Cloudinary (fallback).
// false = usa só o direto-Cloudinary (comportamento antigo — revert instantâneo, sem rebuild).
const USAR_UPLOAD_ENDPOINT = true
const backoffUpload = (n) => Math.min(1000 * Math.pow(2, n) + Math.random() * 1000, 15000)
const xhrUpload = (url, form) => new Promise((resolve, reject) => {
  const attempt = (n) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.timeout = UPLOAD_TIMEOUT
    const retryOu = (rejeitar) => { if (n < MAX_UPLOAD_RETRIES) setTimeout(() => attempt(n + 1), backoffUpload(n)); else rejeitar() }
    xhr.onload = () => {
      let parsed = null
      try { parsed = JSON.parse(xhr.responseText) }
      catch (e) {
        console.log('[xhrUpload] falha ao parsear resposta JSON | tentativa:', n, '| status:', xhr.status)
        return retryOu(() => reject(new Error('Resposta inválida do servidor de upload')))
      }
      // Cloudinary devolve 4xx/5xx com corpo { error: {...} }; trata como falha retentável
      if (xhr.status >= 400 || parsed?.error) {
        console.log('[xhrUpload] erro HTTP do Cloudinary | tentativa:', n, '| status:', xhr.status, '| msg:', parsed?.error?.message)
        return retryOu(() => reject(new Error(parsed?.error?.message || `Erro ${xhr.status} no upload da mídia`)))
      }
      resolve(parsed)
    }
    xhr.onerror   = () => retryOu(() => reject(new Error('Falha na conexão com o servidor de upload')))
    xhr.ontimeout = () => retryOu(() => reject(new Error('Tempo esgotado no upload da mídia')))
    xhr.send(form)
  }
  attempt(0)
})

const classificarErro = (err) => {
  if (err?.code === 'ECONNABORTED' || err?.message?.toLowerCase().includes('timeout')) return 'TIMEOUT'
  if (err?.status >= 500) return `SERVER_ERROR(HTTP ${err?.status})`
  if (err?.status >= 400) return `CLIENT_ERROR(HTTP ${err?.status})`
  if (err?.code === 'ERR_NETWORK' || err?.message?.toLowerCase().includes('network')) return 'NETWORK_ERROR'
  return `UNKNOWN(code=${err?.code ?? 'none'})`
}

export default function CadastroScreen({ navigation }) {
  const { loginComToken } = useAuth()
  const montadoRef = useRef(true)

  useEffect(() => {
    api.get('/health').catch(err => console.log('[CadastroScreen] falha no warmup /health | code:', err.code, '| msg:', err.mensagem))
    return () => { montadoRef.current = false }
  }, [])

  const [tipoConta, setTipoConta] = useState(null)
  const [passo, setPasso] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})

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
  const [especialidades, setEspecialidades] = useState('')
  const [planoSelecionado, setPlanoSelecionado] = useState('mensal')

  const [rg, setRg] = useState('')
  const [rgOrgao, setRgOrgao] = useState('SSP')
  const [rgEstado, setRgEstado] = useState('')

  // Campos de verificação (só para prestadores)
  const [pixReembolso, setPixReembolso] = useState('')
  const [ref1Nome, setRef1Nome] = useState('')
  const [ref1Tel, setRef1Tel] = useState('')
  const [ref2Nome, setRef2Nome] = useState('')
  const [ref2Tel, setRef2Tel] = useState('')
  const [docFrente, setDocFrente] = useState(null)
  const [docVerso, setDocVerso] = useState(null)
  const [selfie, setSelfie] = useState(null)
  // Pré-upload em background: assim que o usuário seleciona cada foto, ela já começa
  // a subir; ao tocar "Finalizar" as URLs costumam já estar prontas.
  const [docFrenteUrl, setDocFrenteUrl] = useState(null)
  const [docVersoUrl, setDocVersoUrl] = useState(null)
  const [selfieUrl, setSelfieUrl] = useState(null)
  const [uploadandoDocFrente, setUploadandoDocFrente] = useState(false)
  const [uploadandoDocVerso, setUploadandoDocVerso] = useState(false)
  const [uploadandoSelfie, setUploadandoSelfie] = useState(false)
  // Erro por foto (endpoint + fallback falharam): a UI mostra "Tentar novamente"
  // em vez de reverter silenciosamente para "Tirar foto".
  const [erroDocFrente, setErroDocFrente] = useState(false)
  const [erroDocVerso, setErroDocVerso] = useState(false)
  const [erroSelfie, setErroSelfie] = useState(false)
  const [enviandoDocs, setEnviandoDocs] = useState(false)
  const [progresso, setProgresso] = useState('')          // texto de fase exibido durante o cadastro
  const emAndamentoRef = useRef(false)                    // trava reentrância (evita toques múltiplos)
  const disponibilidadeOkRef = useRef(false)              // verificar-disponibilidade roda só 1x por sessão
  // Slot de foto em captura (frente/verso/selfie): a recuperação pós-destruição da
  // Activity (getPendingResultAsync) usa isto para rotear a foto perdida ao slot certo.
  const slotFotoPendenteRef = useRef(null)

  // ─── A4: Persistência do rascunho de cadastro ─────────────────────────────
  // O Android pode reciclar a Activity quando o app vai a segundo plano (tela
  // apaga / troca de app) no meio do cadastro — isso zerava todo o formulário e
  // devolvia o usuário à home. Persistimos os campos + o passo atual para
  // restaurar exatamente onde parou. NÃO persistimos as imagens (arquivos locais
  // file://): se perdidas, são re-selecionadas (rápido). A senha vai no SecureStore
  // (cifrado, mesmo mecanismo do token); o resto no AsyncStorage. Limpamos o
  // rascunho ao concluir o cadastro ou ao sair da tela (cancelar).
  const restauradoRef = useRef(false)   // trava saves até a restauração inicial terminar
  const snapshotRef = useRef({})        // campos NÃO sensíveis (AsyncStorage) — sempre atual
  const senhaRef = useRef('')           // senha (SecureStore) — sempre atual
  const fotosRef = useRef({})           // secure_urls das fotos (SecureStore) — sempre atual
  snapshotRef.current = {
    tipoConta, passo, nome, sobrenome, email, telefone, cidade, uf, cep,
    latitude, longitude, logradouro, numero, complemento, bairro, enderecoEncontrado,
    cpfCnpj, anosExp, equipe, especialidades, planoSelecionado,
    rg, rgOrgao, rgEstado, pixReembolso, ref1Nome, ref1Tel, ref2Nome, ref2Tel,
  }
  senhaRef.current = senha
  fotosRef.current = { docFrenteUrl, docVersoUrl, selfieUrl }

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
      // Fotos de verificação (PII) → SecureStore, apenas secure_urls (nunca file://).
      const f = fotosRef.current
      if (f.docFrenteUrl || f.docVersoUrl || f.selfieUrl) {
        await SecureStore.setItemAsync(RASCUNHO_FOTOS_KEY, JSON.stringify(f))
      } else {
        await SecureStore.deleteItemAsync(RASCUNHO_FOTOS_KEY).catch(() => {})
      }
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
          setEspecialidades(s.especialidades ?? ''); setPlanoSelecionado(s.planoSelecionado ?? 'mensal')
          setRg(s.rg ?? ''); setRgOrgao(s.rgOrgao ?? 'SSP'); setRgEstado(s.rgEstado ?? '')
          setPixReembolso(s.pixReembolso ?? '')
          setRef1Nome(s.ref1Nome ?? ''); setRef1Tel(s.ref1Tel ?? '')
          setRef2Nome(s.ref2Nome ?? ''); setRef2Tel(s.ref2Tel ?? '')
          const senhaSalva = await SecureStore.getItemAsync(RASCUNHO_SENHA_KEY)
          if (senhaSalva && montadoRef.current) setSenha(senhaSalva)
          // Fotos de verificação já enviadas (secure_urls): restaura para o slot
          // aparecer como "✓ Enviada" sem re-upload. Só URLs — o preview local
          // file:// não sobrevive ao process kill, mas a foto já está no Cloudinary.
          try {
            const fotosBrutas = await SecureStore.getItemAsync(RASCUNHO_FOTOS_KEY)
            if (fotosBrutas && montadoRef.current) {
              const f = JSON.parse(fotosBrutas)
              if (f.docFrenteUrl) setDocFrenteUrl(f.docFrenteUrl)
              if (f.docVersoUrl) setDocVersoUrl(f.docVersoUrl)
              if (f.selfieUrl) setSelfieUrl(f.selfieUrl)
            }
          } catch (e) { /* fotos corrompidas: ignora — usuário re-tira */ }
          setPasso(s.passo ?? 0)   // por último: renderiza direto a tela onde parou
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
  useEffect(() => { salvarRascunho() }, [passo])
  // Salva também logo após cada upload de foto concluído: as novas secure_urls
  // entram no estado *Url, então persistimos na hora (mesmo idioma do save-por-passo).
  useEffect(() => { salvarRascunho() }, [docFrenteUrl, docVersoUrl, selfieUrl])

  const isPrestador = tipoConta === 'pintor' || tipoConta === 'prestador'
  const isDono = tipoConta === 'dono_obra' || tipoConta === 'dono_reparo'
  // Prestador tem 4 passos: dados pessoais, profissional, plano, verificação
  const totalPassos = isDono ? 2 : 4

  const escolherTipo = (tipo) => { setTipoConta(tipo); setPasso(1) }

  const selecionarFoto = async (setter, tipo, setUrl, setUploadando, setErro) => {
    // Lança câmera/galeria com a MESMA proteção do fluxo de obra/reparo: try/catch para
    // não falhar em silêncio, marca o slot em captura (para a recuperação pós-retorno)
    // e distingue um cancelamento involuntário (retorno quase instantâneo, sem asset —
    // Activity morta por falta de memória) de um cancelamento real do usuário.
    const lancar = async (origem, abrir) => {
      slotFotoPendenteRef.current = { setter, tipo, setUrl, setUploadando, setErro }
      const t0 = Date.now()
      try {
        const resultado = await abrir()
        if (!resultado.canceled && resultado.assets?.length) {
          setter(resultado.assets[0].uri)
          if (tipo && setUrl) preUploadFoto(resultado.assets[0].uri, tipo, setUrl, setUploadando, setErro)
        } else if (resultado.canceled && Date.now() - t0 < 1000) {
          Alert.alert('Não foi possível abrir', 'O app pode estar com pouca memória neste momento. Se as fotos pararem de abrir, feche o aplicativo completamente e abra de novo.')
        }
      } catch (err) {
        console.log(`[Cadastro] launch ${origem} (${tipo}) rejeitou | msg:`, err?.message)
        Alert.alert('Não foi possível abrir', 'Tente novamente. Se o problema continuar, feche o aplicativo completamente e abra de novo.')
      } finally {
        // Só limpa se a promessa retornou de fato; se a Activity foi morta, ela nunca
        // resolve e o ref permanece p/ a recuperação via getPendingResultAsync.
        slotFotoPendenteRef.current = null
      }
    }
    Alert.alert(
      'Adicionar foto',
      'Como deseja adicionar a foto?',
      [
        {
          text: '📷 Tirar foto agora',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync()
            if (status !== 'granted') {
              Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera.')
              return
            }
            lancar('camera', () => ImagePicker.launchCameraAsync({
              allowsEditing: true,
              quality: 0.6,
              maxWidth: 1200,
              maxHeight: 1200,
            }))
          }
        },
        {
          text: '🖼️ Escolher da galeria',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
            if (status !== 'granted') {
              Alert.alert('Permissão necessária', 'Precisamos de acesso à galeria.')
              return
            }
            lancar('galeria', () => ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.6,
              maxWidth: 1200,
              maxHeight: 1200,
            }))
          }
        },
        { text: 'Cancelar', style: 'cancel' }
      ]
    )
  }

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
        { headers: { 'User-Agent': 'PinturaPro/1.0' } }
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

  const validarPasso4 = () => {
    const novos = {}
    if (!pixReembolso.trim()) novos.pixReembolso = 'Informe sua chave PIX para eventual reembolso'
    if (!ref1Nome.trim()) novos.ref1Nome = 'Informe o nome da referência 1'
    if (!ref1Tel.trim()) novos.ref1Tel = 'Informe o telefone da referência 1'
    if (!docFrente) novos.docFrente = 'Envie a frente do seu documento'
    if (!docVerso) novos.docVerso = 'Envie o verso do seu documento'
    if (!selfie) novos.selfie = 'Envie uma selfie segurando o documento'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  // Pré-checagem de duplicidade em BACKGROUND — pura conveniência, NÃO trava o fluxo.
  // Fix 1 garante que um duplicado é pego no submit final como 409 com a mensagem
  // certa, então não precisamos de gate aqui: fire-and-forget, sem await, sem
  // spinner/"verificando". Se o servidor confirmar duplicado rápido, avisamos cedo
  // (alerta não-bloqueante) p/ o usuário voltar e corrigir; se a rede estiver lenta,
  // ele segue preenchendo normalmente e nada fica "travado".
  const checarDisponibilidadeBackground = (payload, { marcarOk = false } = {}) => {
    comRetry(() => api.post('/auth/verificar-disponibilidade', payload), { timeout: true, servidor: true })
      .then(() => {
        // e-mail + CPF confirmados livres → handleCadastrar pula a re-checagem no submit.
        if (marcarOk) disponibilidadeOkRef.current = true
      })
      .catch(err => {
        if (err?.status === 409 && montadoRef.current) {
          // Aviso não-bloqueante (codigo estável: cpf_duplicado / email_duplicado).
          Alert.alert('Atenção', err?.mensagem || 'Estes dados já estão cadastrados.')
        } else {
          const kind = classificarErro(err)
          console.log(`[cadastro] ⚠ pré-checagem background ignorada | kind=${kind} | status=${err?.status} | code=${err?.code}`)
        }
      })
  }

  const avancar = () => {
    if (passo === 1 && !validarPasso1()) return
    if (passo === 2 && !validarPasso2()) return
    if (passo === 4 && isPrestador && !validarPasso4()) return

    if (passo === totalPassos) { handleCadastrar(); return }
    // Para dono, passo 2 já é o último antes de cadastrar
    if (isDono && passo === 2) { handleCadastrar(); return }

    // Chegou aqui = vai avançar de tela (não é submit). Dispara o aviso cedo,
    // não-bloqueante, no ponto em que o dado passa a existir: e-mail ao sair do
    // passo 1, CPF ao sair do passo 2 (antes das fotos do prestador, no passo 4).
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

  const uploadFotoVerificacao = async (uri, tipo) => {
    console.log(`[upload][${tipo}] ▶ step2 GET /upload/assinatura-publica`)
    let params
    try {
      params = await comRetry(() => api.get('/upload/assinatura-publica'), { timeout: true, servidor: true })
      console.log(`[upload][${tipo}] ✓ step2 assinatura ok | timestamp=${params.timestamp} folder=${params.folder}`)
    } catch (err) {
      const kind = classificarErro(err)
      console.log(`[upload][${tipo}] ✗ step2 assinatura FALHOU | kind=${kind} | status=${err?.status} | msg="${err?.mensagem || err?.message}" | code=${err?.code}`)
      throw err
    }
    const cloudForm = new FormData()
    cloudForm.append('file', { uri, type: 'image/jpeg', name: `${tipo}.jpg` })
    cloudForm.append('timestamp', String(params.timestamp))
    cloudForm.append('signature', params.signature)
    cloudForm.append('api_key', params.api_key)
    cloudForm.append('folder', params.folder)
    console.log(`[upload][${tipo}] ▶ step3 XHR Cloudinary | cloud=${params.cloud_name} folder=${params.folder}`)
    let cloudData
    try {
      cloudData = await xhrUpload(`https://api.cloudinary.com/v1_1/${params.cloud_name}/image/upload`, cloudForm)
      if (cloudData.error || !cloudData.secure_url) throw new Error(cloudData.error?.message || `Erro no upload de ${tipo}`)
      console.log(`[upload][${tipo}] ✓ step3 Cloudinary ok | url=${cloudData.secure_url}`)
    } catch (err) {
      console.log(`[upload][${tipo}] ✗ step3 Cloudinary FALHOU | msg="${err?.message}" | code=${err?.code} | cloudinary_error=${JSON.stringify(cloudData?.error ?? null)}`)
      throw err
    }
    return cloudData.secure_url
  }

  // NOVO caminho: sobe a foto para o NOSSO backend (POST /upload/midia, multipart,
  // campo "arquivo"), que repassa ao Cloudinary. Pré-auth (sem token no cadastro).
  // Retorna secure_url de { secure_url, public_id, resource_type }.
  const uploadViaEndpoint = async (uri, tipo) => {
    const form = new FormData()
    form.append('arquivo', { uri, type: 'image/jpeg', name: `${tipo}.jpg` })
    const resp = await api.uploadMidiaPublica(form)
    if (!resp?.secure_url) throw new Error(resp?.erro || `Resposta sem secure_url no upload de ${tipo}`)
    return resp.secure_url
  }

  // Sobe uma foto e guarda a URL (fire-and-start: não bloqueia a UI). Tenta o NOVO
  // endpoint e, em QUALQUER falha, cai no método direto-Cloudinary (uploadFotoVerificacao)
  // — nunca pior que antes. Só marca erro por foto se AMBOS falharem; nesse caso a UI
  // mostra "Tentar novamente" e o handleCadastrar ainda refaz o upload no envio (rede de segurança).
  const preUploadFoto = async (uri, tipo, setUrl, setUploadando, setErro) => {
    setUploadando(true)
    if (setErro) setErro(false)
    try {
      let url
      if (USAR_UPLOAD_ENDPOINT) {
        try {
          url = await uploadViaEndpoint(uri, tipo)
        } catch (errEndpoint) {
          console.log(`[CadastroScreen] endpoint /upload/midia falhou p/ ${tipo} — fallback direto-Cloudinary | msg:`, errEndpoint?.message)
          url = await uploadFotoVerificacao(uri, tipo)
        }
      } else {
        url = await uploadFotoVerificacao(uri, tipo)
      }
      if (montadoRef.current) { setUrl(url); if (setErro) setErro(false) }
    } catch (err) {
      console.log(`[CadastroScreen] pre-upload falhou (endpoint + fallback) p/ ${tipo} | msg:`, err.message)
      if (montadoRef.current) { setUrl(null); if (setErro) setErro(true) }
    } finally {
      if (montadoRef.current) setUploadando(false)
    }
  }

  // Recuperação pós-destruição da Activity (Android sob pressão de memória): se a
  // câmera/galeria foi morta durante a captura, o expo-image-picker guarda o resultado
  // e o entrega via getPendingResultAsync. Reusa a MESMA lógica da criação de obra/reparo
  // (src/utils/midia.js, sem duplicar), roteando a foto recuperada ao slot em captura.
  useEffect(() => {
    const aoReceber = (assets) => {
      const uri = assets?.[0]?.uri
      const slot = slotFotoPendenteRef.current
      if (!uri || !slot || !montadoRef.current) return
      slot.setter(uri)
      slotFotoPendenteRef.current = null
      if (slot.tipo && slot.setUrl) preUploadFoto(uri, slot.tipo, slot.setUrl, slot.setUploadando, slot.setErro)
    }
    recuperarMidiasPendentes({ logPrefix: '[Cadastro]', montadoRef, aoReceber })
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recuperarMidiasPendentes({ logPrefix: '[Cadastro]', montadoRef, aoReceber })
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCadastrar = async () => {
    if (emAndamentoRef.current) return   // já em andamento: ignora toques repetidos
    emAndamentoRef.current = true
    setCarregando(true)
    let timeoutId = null
    try {
      // step1 — Pré-checagem de CPF/e-mail. Roda UMA ÚNICA VEZ por sessão: se já passou,
      // re-tentativas (após falha de upload) pulam direto para os uploads. Isso evita a
      // cascata de chamadas que estourava o rate limit (429 "Muitas tentativas").
      if (!disponibilidadeOkRef.current) {
        setProgresso('Verificando dados...')
        console.log('[cadastro] ▶ step1 POST /auth/verificar-disponibilidade', { email: email.trim().toLowerCase(), cpf_cnpj: cpfCnpj.trim() })
        try {
          await comRetry(() => api.post('/auth/verificar-disponibilidade', {
            email: email.trim().toLowerCase(),
            cpf_cnpj: cpfCnpj.trim(),
          }), { timeout: true, servidor: true })
          disponibilidadeOkRef.current = true
          console.log('[cadastro] ✓ step1 disponibilidade ok')
        } catch (err) {
          const kind = classificarErro(err)
          console.log(`[cadastro] ✗ step1 verificar-disponibilidade FALHOU | kind=${kind} | status=${err?.status} | msg="${err?.mensagem || err?.message}" | code=${err?.code}`)
          // FAIL-OPEN: só um 409 (duplicado EXPLÍCITO) bloqueia aqui. Erros não-definitivos
          // (timeout/rede/5xx) NÃO travam o cadastro — seguimos para o POST /auth/cadastro,
          // que é o backstop real e devolve 409 com a mensagem certa se de fato for duplicado.
          if (err?.status === 409) throw err
          console.log('[cadastro] ↻ step1 falhou por erro não-definitivo — prosseguindo (POST /auth/cadastro é o backstop)')
        }
      } else {
        console.log('[cadastro] ↻ step1 verificar-disponibilidade já validado nesta sessão — pulando')
      }

      // Usa as URLs pré-enviadas (background) quando disponíveis; só sobe no envio
      // as fotos cujo pré-upload ainda não concluiu (fallback / degradação graciosa).
      let uploadedDocFrenteUrl = docFrenteUrl
      let uploadedDocVersoUrl = docVersoUrl
      let uploadedSelfieUrl = selfieUrl

      // Se for prestador, faz upload dos documentos primeiro
      if (isPrestador && docFrente) {
        const precisaUpload = !uploadedDocFrenteUrl || !uploadedDocVersoUrl || !uploadedSelfieUrl
        if (precisaUpload) {
          setEnviandoDocs(true)
          timeoutId = setTimeout(() => {
            emAndamentoRef.current = false
            setCarregando(false)
            setEnviandoDocs(false)
            setProgresso('')
            Alert.alert(
              'Tempo esgotado',
              'O envio demorou muito. Verifique sua conexão e tente novamente.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.',
              [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
            )
          }, 300000)
          // Rede de segurança final (5 min) — não deve disparar no caso comum: o
          // retry silencioso do xhrUpload (até 9 tentativas/foto) cobre quedas transitórias.
          console.log('[cadastro] ▶ iniciando uploads de documentos (300s timeout de segurança ativo)')
          try {
            if (!uploadedDocFrenteUrl) {
              setProgresso('Enviando documentos (1/3)...')
              uploadedDocFrenteUrl = await uploadFotoVerificacao(docFrente, 'doc_frente')
            }
            if (!uploadedDocVersoUrl) {
              setProgresso('Enviando documentos (2/3)...')
              uploadedDocVersoUrl = await uploadFotoVerificacao(docVerso, 'doc_verso')
            }
            if (!uploadedSelfieUrl) {
              setProgresso('Enviando documentos (3/3)...')
              uploadedSelfieUrl = await uploadFotoVerificacao(selfie, 'selfie')
            }
            console.log('[cadastro] ✓ todos os uploads concluídos', { docFrenteUrl: uploadedDocFrenteUrl, docVersoUrl: uploadedDocVersoUrl, selfieUrl: uploadedSelfieUrl })
          } catch (err) {
            const kind = classificarErro(err)
            console.log(`[cadastro] ✗ upload de documento FALHOU | kind=${kind} | msg="${err?.message}" | code=${err?.code}`)
            throw err
          }
          clearTimeout(timeoutId)
          timeoutId = null
          setEnviandoDocs(false)
        } else {
          setProgresso('Fotos já enviadas ✅')
        }
      }

      const referencias = []
      if (ref1Nome.trim()) referencias.push({ nome: ref1Nome.trim(), telefone: ref1Tel.trim() })
      if (ref2Nome.trim()) referencias.push({ nome: ref2Nome.trim(), telefone: ref2Tel.trim() })

      const dados = {
        nome: `${nome.trim()} ${sobrenome.trim()}`.trim(),
        email: email.trim().toLowerCase(),
        telefone: telefone.trim(),
        senha,
        cidade: cidade.trim(),
        cpf_cnpj: cpfCnpj.trim(),
        tipo_conta: tipoConta,
        plano: isPrestador ? planoSelecionado : null,
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
        especialidades: isPrestador
          ? especialidades.split(',').map(s => s.trim()).filter(Boolean) : [],
        pix_reembolso: pixReembolso.trim() || null,
        referencias,
        verificacao_doc_frente_url: uploadedDocFrenteUrl,
        verificacao_doc_verso_url: uploadedDocVersoUrl,
        verificacao_selfie_url: uploadedSelfieUrl,
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

      if (resposta?.token) {
        await loginComToken(resposta.token, resposta.usuario, resposta.assinatura)

        // Se for prestador, mostra aviso de verificação pendente
        if (isPrestador) {
          Alert.alert(
            'Cadastro enviado!',
            'Seus dados estão em análise. Você receberá a confirmação por e-mail em até 1 hora. O acesso será liberado após a aprovação.',
            [{ text: 'Entendi!' }]
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
      if (timeoutId) clearTimeout(timeoutId)
      emAndamentoRef.current = false
      setCarregando(false)
      setEnviandoDocs(false)
      setProgresso('')
    }
  }

  const getValorPlano = () => {
    if (tipoConta === 'prestador') return { mensal: 'R$ 49,90', anual: 'R$ 41,58', anualTotal: 'R$ 499/ano' }
    return { mensal: 'R$ 99,90', anual: 'R$ 83,25', anualTotal: 'R$ 999/ano' }
  }

  const valores = getValorPlano()

  // "Finalizar cadastro" só habilita quando as 3 fotos de verificação têm URL enviada
  // (não apenas escolhida). Só se aplica ao prestador no último passo; dono não tem fotos.
  // O re-upload no submit (handleCadastrar) permanece como rede de segurança; a saída
  // para o usuário em caso de falha é o "Tentar novamente" por foto.
  const fotosVerificacaoOk = !!docFrenteUrl && !!docVersoUrl && !!selfieUrl
  const bloquearFinalizarPorFotos = isPrestador && passo === totalPassos && !fotosVerificacaoOk

  // Prestador e dono de reparo usam o ícone; demais tipos seguem com o logo completo.
  const logoSource = (tipoConta === 'prestador' || tipoConta === 'dono_reparo')
    ? require('../../../assets/icone.png')
    : require('../../../assets/logo.png')

  if (passo === 0) {
    return (
      <SafeAreaView style={estilos.container}>
        <ScrollView contentContainerStyle={estilos.scroll}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.navigate('Splash')}>
            <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
          </TouchableOpacity>
          <View style={estilos.logoWrap}>
            <Image source={require('../../../assets/logo.png')} style={estilos.logo} resizeMode="contain" />
            <Text style={estilos.logoNome}>
              Pintura<Text style={{ color: cores.primaria }}>Pro</Text>
            </Text>
          </View>
          <Text style={[estilos.titulo, { textAlign: 'center' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Como você quer usar?</Text>
          <Text style={[estilos.subtitulo, { textAlign: 'center' }]}>Escolha o perfil que melhor descreve você</Text>

          <TouchableOpacity style={estilos.tipoCard} onPress={() => escolherTipo('pintor')} activeOpacity={0.8}>
            <Text style={estilos.tipoIcone}>🖌️</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoNome}>Sou construtor, pedreiro ou pintor</Text>
              <Text style={estilos.tipoDesc}>Quero encontrar obras disponíveis na minha região</Text>
              <Text style={estilos.tipoPreco}>R$ 99,90/mês</Text>
            </View>
            <Text style={{ color: cores.textoFraco, fontSize: 18 }}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.tipoCard} onPress={() => escolherTipo('prestador')} activeOpacity={0.8}>
            <Text style={estilos.tipoIcone}>🔧</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoNome}>Sou prestador de serviços domésticos</Text>
              <Text style={estilos.tipoDesc}>Quero encontrar reparos e serviços gerais na minha região</Text>
              <Text style={estilos.tipoPreco}>R$ 49,90/mês</Text>
            </View>
            <Text style={{ color: cores.textoFraco, fontSize: 18 }}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.tipoCard} onPress={() => escolherTipo('dono_obra')} activeOpacity={0.8}>
            <Text style={estilos.tipoIcone}>🏠</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoNome}>Tenho uma reforma, construção ou Pintura</Text>
              <Text style={estilos.tipoDesc}>Quero cadastrar minha obra e encontrar profissionais qualificados na minha região</Text>
              <Text style={[estilos.tipoPreco, { color: cores.sucesso }]}>Gratuito</Text>
            </View>
            <Text style={{ color: cores.textoFraco, fontSize: 18 }}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.tipoCard} onPress={() => escolherTipo('dono_reparo')} activeOpacity={0.8}>
            <Text style={estilos.tipoIcone}>🛠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoNome}>Preciso de Reparos domésticos</Text>
              <Text style={estilos.tipoDesc}>Tenho um reparo doméstico a ser feito e gostaria de encontrar profissionais capacitados na minha região</Text>
              <Text style={[estilos.tipoPreco, { color: cores.sucesso }]}>Gratuito</Text>
            </View>
            <Text style={{ color: cores.textoFraco, fontSize: 18 }}>→</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={voltar}>
            <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
          </TouchableOpacity>
          <View style={estilos.logoWrap}>
            <Image
              source={logoSource}
              style={logoSource === require('../../../assets/icone.png') ? estilos.logoIcone : estilos.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={estilos.titulo}>
            {passo === 1 ? 'Criar\nsua conta'
              : passo === 2 ? (isDono ? 'Seus\ndados' : 'Perfil\nprofissional')
              : passo === 3 ? 'Escolha\nseu plano'
              : 'Verificação\nde identidade'}
          </Text>
          <Text style={estilos.subtitulo}>
            {`Passo ${passo} de ${totalPassos} — ${
              passo === 1 ? 'dados pessoais'
              : passo === 2 ? (isDono ? 'localização e documento' : 'informações profissionais')
              : passo === 3 ? 'assinatura'
              : 'documentos e referências'}`}
          </Text>
          <IndicadorPassos passo={passo} total={totalPassos} />

          {/* PASSO 1 — Dados pessoais */}
          {passo === 1 && (
            <View>
              <View style={estilos.duasColunas}>
                <Input label="NOME" placeholder="Primeiro nome" value={nome} onChangeText={setNome} erro={erros.nome} estilo={{ flex: 1 }} />
                <Input label="SOBRENOME" placeholder="Sobrenome" value={sobrenome} onChangeText={setSobrenome} estilo={{ flex: 1 }} />
              </View>
              <Input label="E-MAIL" placeholder="seu@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" erro={erros.email} />
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
              <Input label="CPF / CNPJ" placeholder="000.000.000-00" value={cpfCnpj} onChangeText={(t) => setCpfCnpj(mascararCpfCnpj(t))} keyboardType="numeric" erro={erros.cpfCnpj} />
              {isPrestador && (
                <>
                  <View style={estilos.duasColunas}>
                    <Input label="ANOS DE EXP." placeholder="Ex: 8" value={anosExp} onChangeText={setAnosExp} keyboardType="numeric" estilo={{ flex: 1 }} />
                    <Input label="TAMANHO DA EQUIPE" placeholder="Nº de pessoas" value={equipe} onChangeText={setEquipe} keyboardType="numeric" estilo={{ flex: 1 }} />
                  </View>
                  <Input
                    label={tipoConta === 'prestador' ? 'ESPECIALIDADES (ex: hidráulica, elétrica)' : 'ESPECIALIDADES (ex: textura, epóxi)'}
                    placeholder="Separe por vírgula"
                    value={especialidades}
                    onChangeText={setEspecialidades}
                  />
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
                Escolha o plano para acessar {tipoConta === 'prestador' ? 'os reparos disponíveis' : 'as obras disponíveis'}:
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
              <View style={estilos.segurancaBox}>
                <Text style={estilos.segurancaIcone}>🔒</Text>
                <Text style={estilos.segurancaTexto}>Pagamento 100% seguro via PagBank. Cancele quando quiser.</Text>
              </View>
            </View>
          )}

          {/* PASSO 4 — Verificação de identidade (só prestadores) */}
          {passo === 4 && isPrestador && (
            <View>
              <View style={estilos.verificacaoBanner}>
                <Text style={estilos.verificacaoBannerTitulo}>🔐 Para sua segurança e dos solicitantes</Text>
                <Text style={estilos.verificacaoBannerTexto}>
                  Verificamos a identidade de todos os prestadores antes de liberar o acesso. O processo leva menos de 1 hora!
                </Text>
              </View>

              <Text style={estilos.labelSecao}>CHAVE PIX PARA REEMBOLSO</Text>
              <Text style={estilos.labelSecaoDesc}>Necessária caso sua conta não seja aprovada</Text>
              <Input
                label="CHAVE PIX (CPF, e-mail, telefone ou chave aleatória)"
                placeholder="Ex: 000.000.000-00"
                value={pixReembolso}
                onChangeText={setPixReembolso}
                erro={erros.pixReembolso}
              />

              <Text style={[estilos.labelSecao, { marginTop: 16 }]}>REFERÊNCIAS DE TRABALHOS ANTERIORES</Text>
              <Text style={estilos.labelSecaoDesc}>Informe pelo menos 1 pessoa que possa confirmar seu trabalho</Text>

              <View style={estilos.referenciaBox}>
                <Text style={estilos.referenciaLabel}>Referência 1 *</Text>
                <Input label="NOME" placeholder="Nome completo" value={ref1Nome} onChangeText={setRef1Nome} erro={erros.ref1Nome} />
                <Input label="TELEFONE" placeholder="(34) 99999-9999" value={ref1Tel} onChangeText={(t) => setRef1Tel(mascararTelefone(t))} keyboardType="phone-pad" erro={erros.ref1Tel} />
              </View>

              <View style={estilos.referenciaBox}>
                <Text style={estilos.referenciaLabel}>Referência 2 (opcional)</Text>
                <Input label="NOME" placeholder="Nome completo" value={ref2Nome} onChangeText={setRef2Nome} />
                <Input label="TELEFONE" placeholder="(34) 99999-9999" value={ref2Tel} onChangeText={(t) => setRef2Tel(mascararTelefone(t))} keyboardType="phone-pad" />
              </View>

              <Text style={[estilos.labelSecao, { marginTop: 16 }]}>DOCUMENTO DE IDENTIDADE</Text>
              <Text style={estilos.labelSecaoDesc}>RG, CNH ou outro documento oficial com foto</Text>

              <View style={estilos.fotosRow}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.fotoLabel}>Frente *</Text>
                  <UploadFoto
                    label="Tirar foto"
                    valor={docFrente}
                    uploadando={uploadandoDocFrente}
                    enviada={!!docFrenteUrl}
                    erro={erroDocFrente}
                    onPress={() => selecionarFoto(setDocFrente, 'doc_frente', setDocFrenteUrl, setUploadandoDocFrente, setErroDocFrente)}
                    onRetry={() => preUploadFoto(docFrente, 'doc_frente', setDocFrenteUrl, setUploadandoDocFrente, setErroDocFrente)}
                  />
                  {erros.docFrente && <Text style={estilos.erroTexto}>{erros.docFrente}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.fotoLabel}>Verso *</Text>
                  <UploadFoto
                    label="Tirar foto"
                    valor={docVerso}
                    uploadando={uploadandoDocVerso}
                    enviada={!!docVersoUrl}
                    erro={erroDocVerso}
                    onPress={() => selecionarFoto(setDocVerso, 'doc_verso', setDocVersoUrl, setUploadandoDocVerso, setErroDocVerso)}
                    onRetry={() => preUploadFoto(docVerso, 'doc_verso', setDocVersoUrl, setUploadandoDocVerso, setErroDocVerso)}
                  />
                  {erros.docVerso && <Text style={estilos.erroTexto}>{erros.docVerso}</Text>}
                </View>
              </View>

              <Text style={[estilos.labelSecao, { marginTop: 16 }]}>SELFIE COM DOCUMENTO *</Text>
              <Text style={estilos.labelSecaoDesc}>Segure seu documento ao lado do rosto</Text>
              <UploadFoto
                label="Tirar selfie com documento"
                valor={selfie}
                uploadando={uploadandoSelfie}
                enviada={!!selfieUrl}
                erro={erroSelfie}
                onPress={() => selecionarFoto(setSelfie, 'selfie', setSelfieUrl, setUploadandoSelfie, setErroSelfie)}
                onRetry={() => preUploadFoto(selfie, 'selfie', setSelfieUrl, setUploadandoSelfie, setErroSelfie)}
              />
              {erros.selfie && <Text style={estilos.erroTexto}>{erros.selfie}</Text>}
            </View>
          )}

          {!!progresso && (
            <View style={estilos.enviandoBox}>
              <Text style={estilos.enviandoTexto}>📤 {progresso}</Text>
            </View>
          )}
          <View style={estilos.acoesRow}>
            {carregando && passo === totalPassos && isPrestador && (
              <Text style={{ fontSize: 12, color: cores.textoFraco, textAlign: 'center', marginBottom: 12, lineHeight: 18 }}>
                ⏳ Aguarde — o envio das fotos pode levar até 1 minuto. Não feche o app.
              </Text>
            )}
            {bloquearFinalizarPorFotos && (
              <Text style={{ fontSize: 12, color: cores.textoFraco, textAlign: 'center', marginBottom: 8, lineHeight: 18 }}>
                Envie as 3 fotos (frente, verso e selfie) — aguarde cada uma marcar “✓ Enviada”.
              </Text>
            )}
            <BotaoPrimario
              titulo={carregando && progresso ? progresso : (passo === totalPassos ? 'Finalizar cadastro →' : 'Continuar →')}
              onPress={avancar}
              carregando={carregando && !progresso}
              desabilitado={carregando || bloquearFinalizarPorFotos}
            />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40, paddingTop: 16 },
  logoWrap: { alignItems: 'center', marginBottom: 10 },
  logo: { width: 170, height: 80 },
  logoIcone: { width: 170, height: 170, marginBottom: 4 },
  // Mesmos valores do rótulo da SplashScreen (logoNome), para as duas telas baterem.
  logoNome: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, marginBottom: 6 },
  btnVoltar: { marginTop: 16, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 20 },
  indicador: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  indicadorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: cores.fundoElevado },
  indicadorDotAtivo: { width: 20, borderRadius: 3, backgroundColor: cores.primaria },
  indicadorDotFeito: { backgroundColor: cores.sucesso },
  duasColunas: { flexDirection: 'row', gap: 12 },
  olhoBtn: { position: 'absolute', right: 14, bottom: 27 },
  olhoTexto: { fontSize: 12, color: cores.textoFraco },
  tipoCard: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  tipoIcone: { fontSize: 32 },
  tipoNome: { fontSize: 15, fontWeight: '600', color: cores.textoForte, marginBottom: 4 },
  tipoDesc: { fontSize: 12, color: cores.textoFraco, lineHeight: 18, marginBottom: 4 },
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
  // Verificação
  verificacaoBanner: { backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: cores.sucesso, borderRadius: raios.grande, padding: 16, marginBottom: 20 },
  verificacaoBannerTitulo: { fontSize: 13, fontWeight: '700', color: cores.sucesso, marginBottom: 6 },
  verificacaoBannerTexto: { fontSize: 12, color: '#a0c8a0', lineHeight: 18 },
  labelSecao: { fontSize: 11, fontWeight: '600', color: cores.textoForte, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
  categoriaPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  categoriaPillTexto: { fontSize: 12, color: cores.textoMedio },
  categoriaPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  labelSecaoDesc: { fontSize: 11, color: cores.textoMutado, marginBottom: 10 },
  referenciaBox: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, marginBottom: 10 },
  referenciaLabel: { fontSize: 12, fontWeight: '600', color: cores.textoMedio, marginBottom: 8 },
  fotosRow: { flexDirection: 'row', gap: 12 },
  fotoLabel: { fontSize: 11, color: cores.textoFraco, marginBottom: 6 },
  fotoStatus: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  uploadFotoBtn: { backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, overflow: 'hidden', height: 100 },
  uploadFotoVazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  uploadFotoIcone: { fontSize: 24 },
  uploadFotoTexto: { fontSize: 11, color: cores.textoFraco, textAlign: 'center' },
  uploadFotoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  uploadFotoOk: { position: 'absolute', bottom: 6, left: 0, right: 0, alignItems: 'center' },
  enviandoBox: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 12, alignItems: 'center', marginTop: 12 },
  enviandoTexto: { fontSize: 13, color: cores.textoMedio },
  erroTexto: { fontSize: 11, color: cores.perigo, marginTop: 4 },
  cepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cepOk: { fontSize: 20, marginTop: 28, marginLeft: 12 },
  dicaCep: { fontSize: 11, color: cores.textoMedio, marginBottom: 10, marginTop: 12 },
})