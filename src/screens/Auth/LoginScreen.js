import React, { useState } from 'react'
import {
  View, Text, StyleSheet,
  TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, Image, Linking
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario, BotaoSecundario, Input } from '../../components'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

export default function LoginScreen({ navigation }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [linkPagamento, setLinkPagamento] = useState(null)

  const validar = () => {
    const novosErros = {}
    if (!email.trim()) novosErros.email = 'Informe o e-mail'
    if (!senha.trim()) novosErros.senha = 'Informe a senha'
    setErros(novosErros)
    return Object.keys(novosErros).length === 0
  }

  const handleLogin = async () => {
    if (!validar()) return
    setCarregando(true)
    try {
      const resposta = await login(email.trim().toLowerCase(), senha)
      if (resposta?.assinatura?.status === 'pendente' || !resposta?.assinatura) {
        if (resposta?.usuario?.role === 'prestador' || resposta?.usuario?.role === 'assinante') {
          try {
            const pagamento = await api.post('/pagamentos/criar-assinatura', { plano: 'mensal' })
            if (pagamento.init_point) {
              setLinkPagamento(pagamento.init_point)
              return
            }
          } catch (err) {
            console.log('[Login] falha ao criar assinatura pós-login | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
          }
        }
      }
    } catch (err) {
      console.log('[Login] falha ao fazer login | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert('Erro', err.mensagem || 'Erro ao fazer login')
    } finally {
      setCarregando(false)
    }
  }

  if (linkPagamento) {
    return (
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.container}>
        <ScrollView contentContainerStyle={[estilos.scroll, { alignItems: 'center', paddingTop: 60 }]}>
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
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <TouchableOpacity style={estilos.voltarBtn} onPress={() => navigation.goBack()}>
            <Text style={estilos.voltarIcone}>←</Text>
          </TouchableOpacity>

          <View style={estilos.logoWrap}>
            <Image source={require('../../../assets/logo.png')} style={estilos.logo} resizeMode="contain" />
            <Text style={estilos.logoNome}>
              <Text style={{ color: cores.marcaAzul }}>P</Text>ro<Text style={{ color: cores.primaria }}>L</Text>ar
            </Text>
            <View style={estilos.logoRegua} />
          </View>

          <Text style={estilos.titulo}>Bem-vindo{'\n'}de volta</Text>
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
              onPress={handleLogin}
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
  logoRegua: { width: 64, height: 2, borderRadius: 1, backgroundColor: cores.primaria, marginTop: 0, marginBottom: 10 },
  // 20, e não 28: no 28 a saudação empatava com o wordmark (mesmo corpo, mesmo peso) e,
  // quebrando em duas linhas, pesava MAIS que a marca. 20 é o degrau em negrito que a
  // própria tela já usa (voltarIcone), então a marca lidera em 1,4x e o título ainda
  // lidera o subtítulo de 13 em 1,54x. lineHeight acompanha na mesma proporção de antes
  // (36/28 = 1,286 → 20 x 1,286 ≈ 26), senão as duas linhas se afastariam.
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, marginBottom: 6, lineHeight: 26 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 32 },
  form: {},
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