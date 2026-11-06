import React, { useState, useEffect, useRef } from 'react'
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
import { useLoginSocial, useAssinaturaPosLogin, BotoesSociais, TelaPagamentoPendente } from './LoginSocial'
import EntrarComoScreen from './EntrarComoScreen'

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
  // Por onde o "Entrar como:" entrou ('senha' | 'google' | 'apple'): a escolha repete o
  // login certo. O fluxo social inteiro (diálogo, POST /auth/social, cadastro via ticket)
  // mora em ./LoginSocial, compartilhado com a SplashScreen.
  const modoContasRef = useRef('senha')
  const { linkPagamento, setLinkPagamento, tratarAssinatura } = useAssinaturaPosLogin()
  const social = useLoginSocial({
    navigation,
    ocupado: carregando || !!tipoCarregando,
    onEscolher: ({ provedor, contas: lista, ultimoTipo: salvo }) => {
      setUltimoTipo(salvo)
      modoContasRef.current = provedor
      setContas(lista)
    },
    onSessao: tratarAssinatura,
  })

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

  if (contas && !linkPagamento) {
    return (
      <EntrarComoScreen
        contas={contas}
        tipoCarregando={tipoCarregando}
        ultimoTipo={ultimoTipo}
        onEscolher={(tipo) => (modoContasRef.current === 'senha' ? handleLogin(tipo) : social.handleSocial(modoContasRef.current, tipo, setTipoCarregando))}
        onVoltar={() => { social.limparCredencial(); setContas(null) }}
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

          {/* Google e Apple acima do formulário, com o divisor "ou entre com e-mail" abaixo. */}
          <BotoesSociais
            carregandoSocial={social.carregandoSocial}
            temApple={social.temApple}
            desabilitado={carregando}
            onGoogle={() => social.handleSocial('google')}
            onApple={() => social.handleSocial('apple')}
            divisorDepois="ou entre com e-mail"
            estilo={estilos.social}
          />

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
  // Bloco social (./LoginSocial): o divisor de baixo já traz 20 de margem, então aqui só
  // se desconta um pouco para o formulário não ficar longe.
  social: { marginBottom: -4 },
  olhoBtn: { position: 'absolute', right: 14, bottom: 27 },
  olhoTexto: { fontSize: 12, color: cores.textoFraco },
  esqueciBtn: { alignSelf: 'flex-end', marginBottom: 20, marginTop: -4 },
  esqueciTexto: { fontSize: 12, color: cores.primaria },
  ouDivisor: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  ouLinha: { flex: 1, height: 0.5, backgroundColor: cores.bordaFraca },
  ouTexto: { fontSize: 11, color: cores.textoMutado },
  creditoTexto: { textAlign: 'center', fontSize: 11, color: cores.textoMutado, marginTop: 32 },
})
