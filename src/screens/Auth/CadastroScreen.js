import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'react-native'
import { BotaoPrimario, Input, SeletorLocalidade } from '../../components'
import { authService } from '../../services/api'
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

const UploadFoto = ({ label, valor, onPress }) => (
  <TouchableOpacity style={estilos.uploadFotoBtn} onPress={onPress} activeOpacity={0.8}>
    {valor ? (
      <Image source={{ uri: valor }} style={estilos.uploadFotoPreview} />
    ) : (
      <View style={estilos.uploadFotoVazio}>
        <Text style={estilos.uploadFotoIcone}>📷</Text>
        <Text style={estilos.uploadFotoTexto}>{label}</Text>
      </View>
    )}
    {valor && (
      <View style={estilos.uploadFotoOk}>
        <Text style={{ color: cores.sucesso, fontSize: 11, fontWeight: '600' }}>✓ Adicionada</Text>
      </View>
    )}
  </TouchableOpacity>
)

export default function CadastroScreen({ navigation }) {
  const { loginComToken } = useAuth()
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
  const [enviandoDocs, setEnviandoDocs] = useState(false)

  const isPrestador = tipoConta === 'pintor' || tipoConta === 'prestador'
  const isDono = tipoConta === 'dono_obra' || tipoConta === 'dono_reparo'
  // Prestador tem 4 passos: dados pessoais, profissional, plano, verificação
  const totalPassos = isDono ? 2 : 4

  const escolherTipo = (tipo) => { setTipoConta(tipo); setPasso(1) }

  const selecionarFoto = async (setter) => {
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
            const resultado = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              quality: 0.6,
            })
            if (!resultado.canceled) setter(resultado.assets[0].uri)
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
            const resultado = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.6,
            })
            if (!resultado.canceled) setter(resultado.assets[0].uri)
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

  const validarPasso2 = () => {
    const novos = {}
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

  const avancar = () => {
    if (passo === 1 && !validarPasso1()) return
    if (passo === 2 && !validarPasso2()) return
    if (passo === 4 && isPrestador && !validarPasso4()) return
    if (passo === totalPassos) { handleCadastrar(); return }
    // Para dono, passo 2 já é o último antes de cadastrar
    if (isDono && passo === 2) { handleCadastrar(); return }
    setPasso(p => p + 1)
  }

  const voltar = () => {
    if (passo > 1) setPasso(p => p - 1)
    else if (passo === 1) { setTipoConta(null); setPasso(0) }
    else navigation.goBack()
  }

  const uploadFotoVerificacao = async (uri, tipo) => {
    const formData = new FormData()
    formData.append('arquivo', {
      uri,
      type: 'image/jpeg',
      name: `${tipo}.jpg`,
    })
    formData.append('tipo', tipo)

    const resp = await fetch(
      'https://pinturapro-api-production.up.railway.app/api/auth/upload-verificacao',
      {
        method: 'POST',
        body: formData,
      }
    )

    if (!resp.ok) {
      const erro = await resp.json().catch(() => ({}))
      throw new Error(erro.erro || `Erro ao enviar ${tipo}`)
    }

    const data = await resp.json()
    return data.url
  }

  const handleCadastrar = async () => {
    setCarregando(true)
    let timeoutId = null
    try {
      let docFrenteUrl = null
      let docVersoUrl = null
      let selfieUrl = null

      // Se for prestador, faz upload dos documentos primeiro
      if (isPrestador && docFrente) {
        setEnviandoDocs(true)
        timeoutId = setTimeout(() => {
          setCarregando(false)
          setEnviandoDocs(false)
          Alert.alert(
            'Tempo esgotado',
            'O envio demorou muito. Verifique sua conexão e tente novamente.',
            [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
          )
        }, 10000)
        docFrenteUrl = await uploadFotoVerificacao(docFrente, 'doc_frente')
        docVersoUrl  = await uploadFotoVerificacao(docVerso, 'doc_verso')
        selfieUrl    = await uploadFotoVerificacao(selfie, 'selfie')
        clearTimeout(timeoutId)
        timeoutId = null
        setEnviandoDocs(false)
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
        anos_experiencia: isPrestador ? parseInt(anosExp) || 0 : 0,
        tamanho_equipe: isPrestador ? parseInt(equipe) || 1 : 1,
        especialidades: isPrestador
          ? especialidades.split(',').map(s => s.trim()).filter(Boolean) : [],
        pix_reembolso: pixReembolso.trim() || null,
        referencias,
        verificacao_doc_frente_url: docFrenteUrl,
        verificacao_doc_verso_url: docVersoUrl,
        verificacao_selfie_url: selfieUrl,
        rg: isPrestador ? rg.trim() || null : null,
        rg_orgao: isPrestador ? rgOrgao : null,
        rg_estado: isPrestador ? rgEstado || null : null,
      }

      const resposta = await authService.cadastrar(dados)

      if (resposta?.token) {
        await loginComToken(resposta.token, resposta.usuario, resposta.assinatura)

        // Se for prestador, mostra aviso de verificação pendente
        if (isPrestador) {
          Alert.alert(
            '✅ Cadastro realizado!',
            'Seus dados estão sendo verificados. Em até 1 hora você receberá a confirmação por e-mail.\n\nEnquanto isso, você já pode explorar o app!',
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
      const titulo = err.status === 409 ? 'Cadastro não realizado' : 'Erro'
      Alert.alert(titulo, err.mensagem || err.message || 'Não foi possível criar sua conta.')
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      setCarregando(false)
      setEnviandoDocs(false)
    }
  }

  const getValorPlano = () => {
    if (tipoConta === 'prestador') return { mensal: 'R$ 49,90', anual: 'R$ 41,58', anualTotal: 'R$ 499/ano' }
    return { mensal: 'R$ 99,90', anual: 'R$ 83,25', anualTotal: 'R$ 999/ano' }
  }

  const valores = getValorPlano()

  if (passo === 0) {
    return (
      <SafeAreaView style={estilos.container}>
        <ScrollView contentContainerStyle={estilos.scroll}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoForte, fontSize: 32, fontWeight: '900' }}>←</Text>
          </TouchableOpacity>
          <Text style={estilos.titulo}>Como você{'\n'}quer usar?</Text>
          <Text style={estilos.subtitulo}>Escolha o perfil que melhor descreve você</Text>

          <TouchableOpacity style={estilos.tipoCard} onPress={() => escolherTipo('pintor')} activeOpacity={0.8}>
            <Text style={estilos.tipoIcone}>🖌️</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoNome}>Sou construtor, pedreiro ou pintor</Text>
              <Text style={estilos.tipoDesc}>Quero encontrar obras de pintura disponíveis na região</Text>
              <Text style={estilos.tipoPreco}>R$ 99,90/mês</Text>
            </View>
            <Text style={{ color: cores.textoFraco, fontSize: 18 }}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.tipoCard} onPress={() => escolherTipo('prestador')} activeOpacity={0.8}>
            <Text style={estilos.tipoIcone}>🔧</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoNome}>Sou prestador de serviços</Text>
              <Text style={estilos.tipoDesc}>Quero encontrar reparos e serviços gerais na região</Text>
              <Text style={estilos.tipoPreco}>R$ 49,90/mês</Text>
            </View>
            <Text style={{ color: cores.textoFraco, fontSize: 18 }}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.tipoCard} onPress={() => escolherTipo('dono_obra')} activeOpacity={0.8}>
            <Text style={estilos.tipoIcone}>🏠</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoNome}>Construção civil e pintura</Text>
              <Text style={estilos.tipoDesc}>Quero cadastrar minha obra e encontrar pintores qualificados</Text>
              <Text style={[estilos.tipoPreco, { color: cores.sucesso }]}>Gratuito</Text>
            </View>
            <Text style={{ color: cores.textoFraco, fontSize: 18 }}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.tipoCard} onPress={() => escolherTipo('dono_reparo')} activeOpacity={0.8}>
            <Text style={estilos.tipoIcone}>🛠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoNome}>Preciso de Reparos domésticos</Text>
              <Text style={estilos.tipoDesc}>Torneira, elétrica, marcenaria e outros reparos do dia a dia</Text>
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={voltar}>
            <Text style={{ color: cores.textoForte, fontSize: 32, fontWeight: '900' }}>←</Text>
          </TouchableOpacity>
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
                    onPress={() => selecionarFoto(setDocFrente)}
                  />
                  {erros.docFrente && <Text style={estilos.erroTexto}>{erros.docFrente}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.fotoLabel}>Verso *</Text>
                  <UploadFoto
                    label="Tirar foto"
                    valor={docVerso}
                    onPress={() => selecionarFoto(setDocVerso)}
                  />
                  {erros.docVerso && <Text style={estilos.erroTexto}>{erros.docVerso}</Text>}
                </View>
              </View>

              <Text style={[estilos.labelSecao, { marginTop: 16 }]}>SELFIE COM DOCUMENTO *</Text>
              <Text style={estilos.labelSecaoDesc}>Segure seu documento ao lado do rosto</Text>
              <UploadFoto
                label="Tirar selfie com documento"
                valor={selfie}
                onPress={() => selecionarFoto(setSelfie)}
              />
              {erros.selfie && <Text style={estilos.erroTexto}>{erros.selfie}</Text>}

              {enviandoDocs && (
                <View style={estilos.enviandoBox}>
                  <Text style={estilos.enviandoTexto}>📤 Enviando documentos... aguarde</Text>
                </View>
              )}
            </View>
          )}

          <View style={estilos.acoesRow}>
            <BotaoPrimario
              titulo={passo === totalPassos ? (enviandoDocs ? 'Enviando...' : 'Finalizar cadastro →') : 'Continuar →'}
              onPress={avancar}
              carregando={carregando}
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
  btnVoltar: { marginTop: 40, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 20 },
  indicador: { flexDirection: 'row', gap: 6, marginBottom: 28 },
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
  labelSecao: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  labelSecaoDesc: { fontSize: 11, color: cores.textoMutado, marginBottom: 10 },
  referenciaBox: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, marginBottom: 10 },
  referenciaLabel: { fontSize: 12, fontWeight: '600', color: cores.textoMedio, marginBottom: 8 },
  fotosRow: { flexDirection: 'row', gap: 12 },
  fotoLabel: { fontSize: 11, color: cores.textoFraco, marginBottom: 6 },
  uploadFotoBtn: { backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, overflow: 'hidden', height: 100 },
  uploadFotoVazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  uploadFotoIcone: { fontSize: 24 },
  uploadFotoTexto: { fontSize: 11, color: cores.textoFraco, textAlign: 'center' },
  uploadFotoPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  uploadFotoOk: { position: 'absolute', bottom: 6, left: 0, right: 0, alignItems: 'center' },
  enviandoBox: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 12, alignItems: 'center', marginTop: 12 },
  enviandoTexto: { fontSize: 13, color: cores.textoMedio },
  erroTexto: { fontSize: 11, color: cores.perigo, marginTop: 4 },
})