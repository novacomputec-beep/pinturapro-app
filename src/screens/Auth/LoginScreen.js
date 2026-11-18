import React, { useState, useEffect } from 'react'
import BotaoVoltar from '../../components/BotaoVoltar'
import {
  View, Text, StyleSheet,
  TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, Image
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as SecureStore from 'expo-secure-store'
import { BotaoPrimario, BotaoSecundario, Input } from '../../components'
import { useAuth, CHAVE_ULTIMO_EMAIL } from '../../contexts/AuthContext'
import { cores, espacos, larguraMaxima } from '../../utils/tema'
import { lerUltimoTipo } from '../../utils/contas'
import { useAssinaturaPosLogin, TelaPagamentoPendente } from './LoginSocial'
import EntrarComoScreen from './EntrarComoScreen'

// Login por e-mail e senha, como antes da 1.1.8. "Continuar com Google/Apple" vive só na
// tela de boas-vindas (SplashScreen, via ./LoginSocial); daqui saiu.
export default function LoginScreen({ navigation }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [contas, setContas] = useState(null)               // 2+ contas no e-mail → tela "Entrar como:"
  const [ultimoTipo, setUltimoTipo] = useState(null)       // tag "ÚLTIMO USADO" do "Entrar como:"
  const [tipoCarregando, setTipoCarregando] = useState(null)
  const { linkPagamento, setLinkPagamento, tratarAssinatura } = useAssinaturaPosLogin()

  // Semente do campo de e-mail: o do último login bem-sucedido. O SecureStore é assíncrono,
  // então não dá para ser o valor inicial do useState — o campo nasce vazio e recebe o valor
  // quando a leitura volta, que é o mesmo vazio de hoje caso a chave não exista.
  //
  // O `anterior ||` não é decoração: entre a montagem e a resposta da leitura cabe o tempo
  // de a pessoa já ter começado a digitar (ou colado outro e-mail), e sobrescrever ali
  // trocaria o que ela escreveu por um endereço antigo, no meio da digitação. Só preenche
  // campo que ainda está vazio.
  //
  // Sem senha nenhuma: só o e-mail é lembrado, e a senha continua sendo digitada sempre.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const salvo = await SecureStore.getItemAsync(CHAVE_ULTIMO_EMAIL)
        if (vivo && salvo) setEmail((anterior) => anterior || salvo)
      } catch (err) {
        // Chave ausente já devolve null sem lançar; este catch é para a falha do próprio
        // SecureStore. Nos dois casos o certo é o campo vazio de sempre — nunca um alerta.
        console.log('[Login] falha ao ler o último e-mail (campo segue vazio) | msg:', err?.message)
      }
    })()
    return () => { vivo = false }
  }, [])

  const validar = () => {
    const novosErros = {}
    if (!email.trim()) novosErros.email = 'Informe o e-mail'
    if (!senha.trim()) novosErros.senha = 'Informe a senha'
    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  // `tipo` só vem do "Entrar como:" (múltiplas contas no mesmo e-mail): repete o mesmo
  // login com o tipo escolhido e cai no fluxo normal abaixo. Sem ele é o login de sempre.
  const handleLogin = async (tipo) => {
    if (!validar()) return
    if (tipo) setTipoCarregando(tipo)
    else setCarregando(true)
    try {
      const resposta = await login(email.trim().toLowerCase(), senha, tipo)
      // 2+ contas, nenhum tipo escolhido e SEM token: o AuthContext NÃO gravou sessão. Mostra a
      // escolha e para aqui. Com token a sessão já entrou — o AuthContext repetiu o login com
      // o último perfil usado neste aparelho (utils/contas), e o payload traz `contas` junto.
      // Sem `contas`, ou com 1 só, nada muda.
      if (!tipo && !resposta?.token && Array.isArray(resposta?.contas) && resposta.contas.length >= 2) {
        // Último perfil usado neste aparelho (utils/contas): só vira tag — quando ele existe
        // o AuthContext já entrou direto; chega aqui se a repetição falhou ou o tipo sumiu.
        setUltimoTipo(await lerUltimoTipo(email.trim().toLowerCase()))
        setContas(resposta.contas)
        return
      }
      await tratarAssinatura(resposta)
    } catch (err) {
      console.log('[Login] falha ao fazer login | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert('Erro', err.mensagem || 'Erro ao fazer login')
    } finally {
      setCarregando(false)
      setTipoCarregando(null)
    }
  }

  if (contas && !linkPagamento) {
    return (
      <EntrarComoScreen
        contas={contas}
        tipoCarregando={tipoCarregando}
        ultimoTipo={ultimoTipo}
        email={email.trim().toLowerCase()}
        onEscolher={(tipo) => handleLogin(tipo)}
        onVoltar={() => setContas(null)}
      />
    )
  }

  if (linkPagamento) {
    return <TelaPagamentoPendente link={linkPagamento} onDepois={() => setLinkPagamento(null)} />
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Voltar SOBRE o canto esquerdo do bloco do logo (como na escolha de perfil), e não
              numa linha própria: é a altura que o logo de 170 precisa para a tela caber sem
              rolar. O logo circular já traz o nome "ProTudo": sem wordmark nem régua. */}
          <View style={estilos.topo}>
            <BotaoVoltar estilo={estilos.voltarBtn} onPress={() => navigation.goBack()} />
            <View style={estilos.logoWrap}>
              <Image source={require('../../../assets/logo-3d.png')} style={estilos.logo} resizeMode="contain" accessibilityLabel="ProTudo" />
            </View>
          </View>

          <Text style={estilos.titulo}>Bem-vindo de volta</Text>
          <Text style={estilos.subtitulo}>Acesse sua conta</Text>

          <View style={estilos.form}>
            <Input
              label="E-MAIL"
              placeholder="seu@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              erro={erros.email}
            />

            <View>
              <Input
                label="SENHA"
                placeholder="••••••••"
                value={senha}
                onChangeText={setSenha}
                secureTextEntry={!mostrarSenha}
                erro={erros.senha}
              />
              <TouchableOpacity style={estilos.olhoBtn} onPress={() => setMostrarSenha(!mostrarSenha)}>
                <Text style={estilos.olhoTexto}>{mostrarSenha ? 'ocultar' : 'mostrar'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={estilos.esqueciBtn}
              onPress={() => navigation.navigate('EsqueciSenha')}
            >
              <Text style={estilos.esqueciTexto}>Esqueci minha senha</Text>
            </TouchableOpacity>

            <BotaoPrimario
              titulo="Entrar"
              onPress={() => handleLogin()}
              carregando={carregando}
              estilo={{ marginTop: 8 }}
            />

            <View style={estilos.ouDivisor}>
              <View style={estilos.ouLinha} />
              <Text style={estilos.ouTexto}>ou</Text>
              <View style={estilos.ouLinha} />
            </View>

            <BotaoSecundario
              titulo="Criar nova conta"
              onPress={() => navigation.navigate('Cadastro')}
            />
          </View>

          {/* Fora do `form` (flex: 1), que se estica e empurra o crédito para o rodapé
              mesmo em tela alta, sem precisar de posicionamento absoluto. */}
          <Text style={estilos.creditoTexto}>By Nova Computec Informática</Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  // Os respiros desta tela (rodapé 24, subtítulo 16, "esqueci" 12, divisor 12, crédito 16)
  // são os curtos de propósito: com o logo circular de 170 a tela só cabe sem rolar num
  // celular de 6,1" se o resto não gastar altura. O ScrollView segue como rede (teclado,
  // fonte grande do sistema, barra de 3 botões).
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: espacos.tela, paddingBottom: 24 },
  // Bloco do topo: o voltar fica ABSOLUTO no canto esquerdo e o logo centra na tela. Eles
  // não se tocam: o disco do logo começa 8 abaixo do botão e, na altura da base do botão,
  // a borda esquerda do círculo já passou da borda direita dele (tela de 360 dp ou mais).
  topo: { marginTop: 8 },
  voltarBtn: { position: 'absolute', left: 0, top: 0, zIndex: 1 },
  logoWrap: { alignItems: 'center', marginTop: 8, marginBottom: 10 },
  // Logo circular (assets/logo-3d.png), que já traz o nome.
  logo: { width: 170, height: 170 },
  // Uma linha só (era "Bem-vindo / de volta" em duas): a segunda linha é altura que o logo
  // de 170 passou a ocupar.
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, marginBottom: 6, lineHeight: 26 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 16 },
  form: {},
  olhoBtn: { position: 'absolute', right: 14, bottom: 27 },
  olhoTexto: { fontSize: 12, color: cores.textoFraco },
  esqueciBtn: { alignSelf: 'flex-end', marginBottom: 12, marginTop: -4 },
  esqueciTexto: { fontSize: 12, color: cores.primaria },
  ouDivisor: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  ouLinha: { flex: 1, height: 0.5, backgroundColor: cores.bordaFraca },
  ouTexto: { fontSize: 11, color: cores.textoMutado },
  creditoTexto: { textAlign: 'center', fontSize: 11, color: cores.textoMutado, marginTop: 16 },
})
