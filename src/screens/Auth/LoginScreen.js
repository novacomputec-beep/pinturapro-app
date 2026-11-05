import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet,
  TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, Image, Linking, ActivityIndicator
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as SecureStore from 'expo-secure-store'
import * as AppleAuthentication from 'expo-apple-authentication'
import { AntDesign } from '@expo/vector-icons'
import { BotaoPrimario, BotaoSecundario, Input } from '../../components'
import { useAuth, CHAVE_ULTIMO_EMAIL } from '../../contexts/AuthContext'
import api from '../../services/api'
import { cores, espacos, raios, larguraMaxima } from '../../utils/tema'
import { mostrarCobranca } from '../../utils/plataforma'
import { lerUltimoTipo } from '../../utils/contas'
import { appleDisponivel, obterCredencialSocial, mensagemErroSocial, NOME_PROVEDOR } from '../../services/loginSocial'
import EntrarComoScreen from './EntrarComoScreen'

export default function LoginScreen({ navigation }) {
  const { login, loginSocial } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [linkPagamento, setLinkPagamento] = useState(null)
  const [contas, setContas] = useState(null)               // 2+ contas no e-mail → tela "Entrar como:"
  const [ultimoTipo, setUltimoTipo] = useState(null)       // tag "ÚLTIMO USADO" do "Entrar como:"
  const [tipoCarregando, setTipoCarregando] = useState(null)
  // "Continuar com Google/Apple" (Arte-Login-Google-Apple). carregandoSocial: o provedor cujo
  // botão está girando. temApple: iOS 13+ com a capability — só aí o botão da Apple aparece.
  // credencialRef guarda { provedor, id_token, nome } entre o POST sem `tipo` e a repetição
  // com o tipo escolhido no "Entrar como:"; modoContasRef diz por onde o "Entrar como:"
  // entrou ('senha' | 'google' | 'apple'), para a escolha repetir o login certo.
  const [carregandoSocial, setCarregandoSocial] = useState(null)
  const [temApple, setTemApple] = useState(false)
  const credencialRef = useRef(null)
  const modoContasRef = useRef('senha')

  useEffect(() => {
    let vivo = true
    appleDisponivel().then((ok) => { if (vivo) setTemApple(ok) })
    return () => { vivo = false }
  }, [])

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
        modoContasRef.current = 'senha'
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

  // Pós-login comum (senha e social): profissional sem assinatura ativa ganha a cobrança.
  const tratarAssinatura = async (resposta) => {
    if (resposta?.assinatura?.status === 'pendente' || !resposta?.assinatura) {
      if (resposta?.usuario?.role === 'prestador' || resposta?.usuario?.role === 'assinante') {
        try {
          const pagamento = await api.post('/pagamentos/criar-assinatura', { plano: 'mensal' })
          // No iOS a chamada acima continua (a assinatura nasce do mesmo jeito), mas o
          // link não vira tela: a 3.1.1 proíbe o checkout externo. Quem acolhe esse
          // usuário é a PagamentoPendenteScreen, que no iOS mostra só a frase.
          if (pagamento.init_point && mostrarCobranca) {
            setLinkPagamento(pagamento.init_point)
          }
        } catch (err) {
          console.log('[Login] falha ao criar assinatura pós-login | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
        }
      }
    }
  }

  // "Continuar com Google/Apple". Sem `tipo`: abre o diálogo do provedor (cancelou → nada
  // acontece) e manda a credencial a POST /auth/social via AuthContext.loginSocial. Com conta:
  // o mesmo caminho do login por senha (último perfil lembrado ou "Entrar como:"). Sem conta:
  // abre o cadastro completo com nome/e-mail travados e o ticket no lugar da senha. `tipo`
  // só vem do "Entrar como:" e repete o POST com a credencial guardada, sem novo diálogo.
  const handleSocial = async (provedor, tipo) => {
    if (carregando || carregandoSocial || tipoCarregando) return
    let credencial = tipo ? credencialRef.current : null
    if (!credencial) {
      setCarregandoSocial(provedor)
      try {
        credencial = await obterCredencialSocial(provedor)
      } catch (err) {
        console.log('[Login] falha no diálogo do provedor | provedor:', provedor, '| code:', err?.code, '| msg:', err?.message)
        const msg = mensagemErroSocial(err, provedor)
        if (msg) Alert.alert(`Não foi possível entrar com ${NOME_PROVEDOR[provedor]}`, msg)
        setCarregandoSocial(null)
        return
      }
      if (!credencial) { setCarregandoSocial(null); return }   // cancelou: silêncio
      credencialRef.current = credencial
    }
    if (tipo) setTipoCarregando(tipo)
    else setCarregandoSocial(provedor)
    try {
      const resposta = await loginSocial(credencial, tipo)
      if (resposta?.novo) {
        credencialRef.current = null
        navigation.navigate('Cadastro', { social: { provedor, nome: resposta.nome || null, email: resposta.email, ticket: resposta.ticket } })
        return
      }
      if (resposta?.escolher) {
        setUltimoTipo(resposta.ultimoTipo || null)
        modoContasRef.current = provedor
        setContas(resposta.contas)
        return
      }
      credencialRef.current = null
      await tratarAssinatura(resposta)
    } catch (err) {
      console.log('[Login] falha no login social | provedor:', provedor, '| status:', err?.status, '| codigo:', err?.codigo, '| code:', err?.code, '| msg:', err?.mensagem || err?.message)
      // Resposta da API (401 token recusado, 403 desativada…): a credencial não serve mais.
      if (err?.status) credencialRef.current = null
      const msg = mensagemErroSocial(err, provedor)
      if (msg) Alert.alert(`Não foi possível entrar com ${NOME_PROVEDOR[provedor]}`, msg)
    } finally {
      setCarregandoSocial(null)
      setTipoCarregando(null)
    }
  }

  if (contas && !linkPagamento) {
    return (
      <EntrarComoScreen
        contas={contas}
        tipoCarregando={tipoCarregando}
        ultimoTipo={ultimoTipo}
        onEscolher={(tipo) => (modoContasRef.current === 'senha' ? handleLogin(tipo) : handleSocial(modoContasRef.current, tipo))}
        onVoltar={() => { credencialRef.current = null; setContas(null) }}
      />
    )
  }

  if (linkPagamento) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.container}>
        <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima, { alignItems: 'center', paddingTop: 60 }]}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>💳</Text>
          <Text style={[estilos.titulo, { textAlign: 'center' }]}>Pagamento pendente</Text>
          <Text style={[estilos.subtitulo, { textAlign: 'center', marginBottom: 32 }]}>
            Sua conta foi criada! Para acessar as obras disponíveis, finalize seu pagamento.
          </Text>
          <BotaoPrimario
            titulo="Pagar agora via PagBank →"
            onPress={() => Linking.openURL(linkPagamento)}
            estilo={{ marginBottom: 12, width: '100%' }}
          />
          <TouchableOpacity style={estilos.btnDepois} onPress={() => setLinkPagamento(null)}>
            <Text style={estilos.btnDepoisTexto}>Pagar depois</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 20, lineHeight: 18, paddingHorizontal: 20 }}>
            Após o pagamento ser confirmado, seu acesso será ativado automaticamente.
          </Text>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <TouchableOpacity style={estilos.voltarBtn} onPress={() => navigation.goBack()}>
            <Text style={estilos.voltarIcone}>←</Text>
          </TouchableOpacity>

          <View style={estilos.logoWrap}>
            <Image source={require('../../../assets/logo.png')} style={estilos.logo} resizeMode="contain" />
            <Text style={estilos.logoNome}>
              <Text style={{ color: cores.marcaAzul }}>P</Text>ro<Text style={{ color: cores.primaria }}>T</Text>udo
            </Text>
            <View style={estilos.logoRegua} />
          </View>

          <Text style={estilos.titulo}>Bem-vindo{'\n'}de volta</Text>
          <Text style={estilos.subtitulo}>Acesse sua conta</Text>

          {/* Google (branco, em todas as plataformas) e Apple (botão oficial, só no iOS que
              tem o recurso). O da Apple é preto como manda a arte; o aro de 1px é o que o
              separa do fundo #0A0A0A. Enquanto um gira, o outro fica desligado. */}
          <View style={estilos.social}>
            <TouchableOpacity
              style={[estilos.btnGoogle, carregandoSocial && carregandoSocial !== 'google' && { opacity: 0.6 }]}
              onPress={() => handleSocial('google')}
              disabled={!!carregandoSocial || carregando}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continuar com Google"
            >
              {carregandoSocial === 'google' ? <ActivityIndicator color="#1F1F1F" /> : (
                <>
                  <AntDesign name="google" size={18} color="#1F1F1F" />
                  <Text style={estilos.btnGoogleTexto}>Continuar com Google</Text>
                </>
              )}
            </TouchableOpacity>
            {temApple ? (
              <View style={[estilos.appleWrap, carregandoSocial && { opacity: 0.6 }]} pointerEvents={carregandoSocial || carregando ? 'none' : 'auto'}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={raios.medio}
                  style={estilos.btnApple}
                  onPress={() => handleSocial('apple')}
                />
              </View>
            ) : null}
            <View style={estilos.ouDivisor}>
              <View style={estilos.ouLinha} />
              <Text style={estilos.ouTexto}>ou entre com e-mail</Text>
              <View style={estilos.ouLinha} />
            </View>
          </View>

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
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: espacos.tela, paddingBottom: 40 },
  // Mesmo espaçamento do btnVoltar da CadastroScreen (8/10): é o elemento imediatamente
  // acima do bloco do logo, então 14/20 aqui deslocava a marca para baixo em relação à
  // outra tela mesmo com o bloco já idêntico.
  voltarBtn: { marginTop: 8, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  voltarIcone: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  // 22 aqui + os 10 do logoRegua = 32 de respiro entre a régua e o título — o mesmo 32 que
  // o subtitulo usa para separar o bloco do formulário, e ~0,9 da lineHeight do título de
  // 28px. Fica NESTE estilo, e não no marginBottom do logoRegua, porque aquele se declara
  // idêntico ao das outras duas telas: mexer lá tornaria o comentário mentira.
  logoWrap: { alignItems: 'center', marginBottom: 22 },
  // Mesmos valores do logo da CadastroScreen, sem margem própria. O -6 que morava aqui
  // encostava a palavra na imagem só NESTA tela, e era exatamente o que impedia o bloco das
  // três telas de bater: a folga que a linha de 28px reserva acima da maiúscula existe nas
  // outras duas do mesmo jeito, e lá ela nunca foi compensada.
  logo: { width: 170, height: 64 },
  // Mesmos valores do rótulo da CadastroScreen (logoNome), para as duas telas baterem.
  logoNome: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, marginBottom: 2 },
  // Mesmos valores da régua da SplashScreen (logoRegua), para as três telas baterem.
  logoRegua: { width: 88, height: 2, borderRadius: 1, backgroundColor: cores.primaria, marginTop: 0, marginBottom: 10 },
  // 20, e não 28: no 28 a saudação empatava com o wordmark (mesmo corpo, mesmo peso) e,
  // quebrando em duas linhas, pesava MAIS que a marca. 20 é o degrau em negrito que a
  // própria tela já usa (voltarIcone), então a marca lidera em 1,4x e o título ainda
  // lidera o subtítulo de 13 em 1,54x. lineHeight acompanha na mesma proporção de antes
  // (36/28 = 1,286 → 20 x 1,286 ≈ 26), senão as duas linhas se afastariam.
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, marginBottom: 6, lineHeight: 26 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 32 },
  form: {},
  // Botões sociais: 48 de altura (o mesmo do BotaoPrimario) e 10 entre eles. O divisor
  // reaproveita ouDivisor/ouLinha/ouTexto, com a margem vertical reduzida pelo `social`.
  social: { marginBottom: -4 },
  btnGoogle: { height: 48, borderRadius: raios.medio, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: '#DADCE0' },
  btnGoogleTexto: { fontSize: 15, fontWeight: '600', color: '#1F1F1F' },
  appleWrap: { marginTop: 10, borderRadius: raios.medio, borderWidth: 1, borderColor: cores.bordaCampo },
  btnApple: { height: 48, width: '100%' },
  olhoBtn: { position: 'absolute', right: 14, bottom: 27 },
  olhoTexto: { fontSize: 12, color: cores.textoFraco },
  esqueciBtn: { alignSelf: 'flex-end', marginBottom: 20, marginTop: -4 },
  esqueciTexto: { fontSize: 12, color: cores.primaria },
  ouDivisor: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  ouLinha: { flex: 1, height: 0.5, backgroundColor: cores.bordaFraca },
  ouTexto: { fontSize: 11, color: cores.textoMutado },
  creditoTexto: { textAlign: 'center', fontSize: 11, color: cores.textoMutado, marginTop: 32 },
  btnDepois: { padding: 14, alignItems: 'center' },
  btnDepoisTexto: { fontSize: 14, color: cores.textoFraco },
})