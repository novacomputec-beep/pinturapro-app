import 'react-native-gesture-handler'
import React, { useRef, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import * as Notifications from 'expo-notifications'
import { useAuth } from '../contexts/AuthContext'
import { cores, raios } from '../utils/tema'
import api from '../services/api'
import { comRetry } from '../utils/rede'
import { navigationRef } from './navigationRef'
import CelebracaoMatchHost from '../components/CelebracaoMatchHost'
import SoftAskNotificacao from '../components/SoftAskNotificacao'
import BoasVindasPrestadorScreen from '../screens/BoasVindasPrestadorScreen'

// Auth
import SplashScreen        from '../screens/Auth/SplashScreen'
import LoginScreen         from '../screens/Auth/LoginScreen'
import CadastroScreen      from '../screens/Auth/CadastroScreen'
import EsqueciSenhaScreen  from '../screens/Auth/EsqueciSenhaScreen'
import TermosScreen        from '../screens/Auth/TermosScreen'
import PrivacidadeScreen   from '../screens/Auth/PrivacidadeScreen'

// App — Pintor
import FeedObrasScreen     from '../screens/Obra/FeedObrasScreen'
import DetalheObraScreen   from '../screens/Obra/DetalheObraScreen'
import ContratosScreen     from '../screens/Contratos/ContratosScreen'
import ContratosFinalizadosScreen from '../screens/Contratos/ContratosFinalizadosScreen'
import MensagensScreen     from '../screens/Mensagens/MensagensScreen'
import PerfilScreen        from '../screens/Perfil/PerfilScreen'
import EditarPerfilScreen  from '../screens/Perfil/EditarPerfilScreen'
import AlterarSenhaScreen  from '../screens/Perfil/AlterarSenhaScreen'
import AvaliacoesRecebidasScreen from '../screens/Perfil/AvaliacoesRecebidasScreen'

// App — Prestador
import FeedReparosScreen      from '../screens/Reparos/FeedReparosScreen'
import DetalheReparoScreen    from '../screens/Reparos/DetalheReparoScreen'
import MeusInteressesScreen   from '../screens/Reparos/MeusInteressesScreen'

// App — Dono de Obra
import MinhasObrasScreen      from '../screens/DonoObra/MinhasObrasScreen'
import CadastrarObraScreen    from '../screens/DonoObra/CadastrarObraScreen'
import CadastrarReparoScreen  from '../screens/DonoObra/CadastrarReparoScreen'

const Stack                = createNativeStackNavigator()
const Tab                  = createBottomTabNavigator()
const FeedStack            = createNativeStackNavigator()
const ReparoStack          = createNativeStackNavigator()
const DonoStack            = createNativeStackNavigator()
const PerfilStack          = createNativeStackNavigator()
const NovoReparoStack      = createNativeStackNavigator()
const MeusReparosStack     = createNativeStackNavigator()
const NovaObraStack        = createNativeStackNavigator()
const MinhasObrasStack     = createNativeStackNavigator()
const MeusInteressesStack  = createNativeStackNavigator()
const MinhasObrasInteresseStack = createNativeStackNavigator()
const ContratosFinObraStack     = createNativeStackNavigator()
const ContratosFinReparoStack   = createNativeStackNavigator()
const ContratosFinDonoReparoStack = createNativeStackNavigator()
const ContratosFinDonoObraStack   = createNativeStackNavigator()
const DonoReparoTab        = createBottomTabNavigator()
const DonoObraTab          = createBottomTabNavigator()

export { navigationRef }

// Contexto do usuário atual para roteamento de notificações ciente do papel/subtipo.
// Os nomes de aba variam por navegador montado (pintor vs reparador vs dono), então
// resolvemos o destino com base neste contexto antes de navegar.
let usuarioContexto = null
export const setUsuarioContexto = (u) => { usuarioContexto = u }

const navegarParaNotificacao = (data) => {
  if (!navigationRef.current || !data?.tipo) return
  const u = usuarioContexto || {}
  const usaTabsPintor    = u.role === 'assinante' || (u.role === 'prestador' && u.tipo_prestador === 'pintor')
  const usaTabsReparador = u.role === 'prestador' && u.tipo_prestador !== 'pintor'
  const ehPrestador      = usaTabsPintor || usaTabsReparador
  const ehDonoReparo     = u.role === 'dono_obra' && u.tipo_dono === 'reparo'
  // Donos com navegador de abas (reparo/pintura) possuem a aba "Contratos Finalizados".
  // O fallback (tipo_dono indefinido) usa um stack sem essa aba.
  const ehDonoComAba     = u.role === 'dono_obra' && (u.tipo_dono === 'reparo' || u.tipo_dono === 'pintura')

  // Aba de itens em andamento conforme o navegador montado para este usuário
  const tabEmAndamento =
    usaTabsPintor    ? 'Minhas Obras' :
    usaTabsReparador ? 'Meus Reparos' :
    ehDonoReparo     ? 'Meus Reparos' :
                       'Minhas Obras'   // dono de obra (pintura/fallback)

  const navegar = (nome) => navigationRef.current.navigate(nome)
  try {
    // Alertas de expiração (obra/reparo): cobrem por prefixo TODOS os marcos
    // (…_6h/_60/_30/_15) e o legado …_sem_interessados — deep-link direto ao detalhe.
    // Só navega com o id presente; sem id, cai no switch (que não trata estes tipos)
    // e não faz nada, em vez de abrir o detalhe com id indefinido.
    if (data.tipo.startsWith('obra_expirando') && data.obra_id) {
      navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } } })
      return
    }
    if (data.tipo.startsWith('reparo_expirando') && data.reparo_id) {
      navigationRef.current.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } } })
      return
    }
    switch (data.tipo) {
      // Feed
      case 'nova_obra':
        navegar('Obras'); break
      case 'novo_reparo':
        navegar('Reparos'); break
      // Mensagens
      case 'nova_mensagem':
        navegar('Mensagens'); break
      // Itens finalizados (encerrados): prestador e dono (com aba) veem em "Contratos Finalizados";
      // o dono fallback (sem a aba) cai na lista em andamento.
      case 'obra_encerrada':
      case 'reparo_encerrado':
        navegar((ehPrestador || ehDonoComAba) ? 'Contratos Finalizados' : tabEmAndamento); break
      // Match fechado (candidatura/proposta aceita) — deep-link direto p/ o detalhe
      case 'candidatura_aceita':
        if (data.obra_id) navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } } })
        else navegar(tabEmAndamento)
        break
      case 'interesse_aceito':
        if (data.reparo_id) navigationRef.current.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } } })
        else navegar(tabEmAndamento)
        break
      // Contraproposta do dono — deep-link direto ao detalhe (reparo ou obra) p/ o prestador responder
      case 'contraproposta_dono':
        if (data.reparo_id) navigationRef.current.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } } })
        else if (data.obra_id) navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } } })
        else navegar(tabEmAndamento)
        break
      // Demanda próxima: quem recebe ainda NÃO está envolvido com ela, então o item vive
      // no feed de disponíveis — e é por lá que se chega ao detalhe. Mandar para
      // "Meus Reparos"/"Minhas Obras" cairia numa lista onde a demanda não aparece.
      case 'reparo_proximo':
        if (data.reparo_id) navigationRef.current.navigate('Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } } })
        else navegar('Reparos')
        break
      case 'obra_proxima':
        if (data.obra_id) navigationRef.current.navigate('Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } } })
        else navegar('Obras')
        break
      // Resultado da moderação da obra — deep-link ao detalhe para o DONO. Em 'obra_recusada'
      // este é o único caminho até ela: a obra recusada não aparece em "Minhas Obras", então
      // sem o id o dono não tem como abrir o motivo da recusa.
      case 'obra_aprovada':
      case 'obra_recusada':
        if (data.obra_id) navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } } })
        else navegar(tabEmAndamento)
        break
      // Faltam 5 min no cronômetro do match — dono_reparo vai direto ao detalhe p/ aumentar prazo ou aguardar
      case 'reparo_5min_restantes':
        if (data.reparo_id) navigationRef.current.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } } })
        else navegar(tabEmAndamento)
        break
      // Demais eventos (candidaturas, interesses, contrapropostas, tempo, match):
      // negociações em andamento — vão para a lista correspondente do usuário
      case 'nova_candidatura':
      case 'match_obra':
      case 'novo_interesse':
      case 'match_reparo':
      case 'pedido_tempo':
      case 'aprovar_tempo':
      case 'interesse_recusado':
      case 'contraproposta_dono':
      case 'contra_oferta':
      case 'perguntar_tempo':
      case 'tempo_aceito':
      case 'tempo_recusado':
      case 'candidatura_aprovada':
      case 'candidatura_recusada':
        navegar(tabEmAndamento); break
      // Tipo desconhecido: não navega, mas DEIXA RASTRO. 'reparo_proximo' e 'obra_proxima'
      // passaram meses sem rota nenhuma e ninguém percebeu, porque cair fora do switch era
      // silencioso — o toque simplesmente não fazia nada. Log, não erro ao usuário.
      default:
        console.log('[notificacao] tipo sem rota | tipo:', data.tipo, '| payload:', JSON.stringify(data))
    }
  } catch (err) {
    console.log('Erro ao navegar para notificação:', err)
  }
}

const TabIcone = ({ nome, focado }) => {
  const mapa = { Obras: '🏗️', 'Contratos Finalizados': '✅', Mensagens: '💬', Perfil: '👤', Reparos: '🔧', 'Novo Reparo': '➕', 'Meus Reparos': '📋', 'Nova Obra': '🖌️', 'Minhas Obras': '📋' }
  return (
    <Text style={{ fontSize: 20, opacity: focado ? 1 : 0.3, color: focado ? cores.primaria : cores.textoFraco }}>
      {mapa[nome] || '●'}
    </Text>
  )
}

function PagamentoPendenteScreen() {
  const { logout, usuario, assinatura, revalidarSessao } = useAuth()
  const [link, setLink] = React.useState(null)
  const [carregando, setCarregando] = React.useState(true)
  const [verificando, setVerificando] = React.useState(false)
  const [erro, setErro] = React.useState(null)
  const mountedRef = React.useRef(true)
  React.useEffect(() => () => { mountedRef.current = false }, [])

  const buscarLink = React.useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const plano = assinatura?.plano || 'mensal'
      // Timeout de 20s: se a requisição travar sem resolver/rejeitar, força a rejeição
      // para que o catch rode e a tela não fique presa em "Gerando link...".
      const pagamento = await Promise.race([
        comRetry(() => api.post('/pagamentos/criar-assinatura', { plano })),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_criar_assinatura')), 20000))
      ])
      if (pagamento.init_point) {
        if (mountedRef.current) setLink(pagamento.init_point)
        Linking.openURL(pagamento.init_point).catch(err => console.log('[AppNavigator] falha ao abrir URL de pagamento | msg:', err.message))
      } else {
        if (mountedRef.current) setErro('Link de pagamento não retornado. Toque em "Tentar novamente".')
      }
    } catch (err) {
      console.log('[AppNavigator] falha ao buscar link de pagamento | status:', err.status, '| code:', err.code, '| msg:', err.mensagem || err.message)
      const msg = err?.mensagem || err?.erro || err?.message || 'Não foi possível gerar o link de pagamento.'
      if (mountedRef.current) setErro(msg)
    } finally {
      if (mountedRef.current) setCarregando(false)
    }
  }, [assinatura?.plano])

  React.useEffect(() => { buscarLink() }, [])

  // "Já paguei — verificar acesso" (tela de pagamento). Sempre dá feedback: revalida a
  // sessão e decide a mensagem pelo status REAL de assinatura devolvido por GET /auth/perfil
  // (ativa | pendente_verificacao | outro), nunca por suposição. Nunca um no-op silencioso.
  const verificarPagamento = async () => {
    setVerificando(true)
    try {
      // Refresh COMPLETO da sessão (boas-vindas + flags + push), não só usuario/assinatura.
      const { assinatura: a } = await revalidarSessao()
      const status = a?.status
      if (status === 'ativa') {
        // Aprovado: o AppNavigator troca de tela automaticamente (o app abre). O próprio
        // avanço é o feedback — não exibimos alerta para não sobrepor a transição.
        return
      }
      if (status === 'pendente_verificacao') {
        Alert.alert(
          'Cadastro em análise',
          'Seu cadastro está em análise. Assim que for aprovado (em até 1 hora), seu acesso será liberado.'
        )
        return
      }
      // Qualquer outro status (expirada, cancelada, pendente, sem assinatura): pagamento
      // ainda não confirmado pela plataforma.
      Alert.alert(
        'Pagamento ainda não confirmado',
        'Ainda não identificamos seu pagamento. Se você acabou de pagar, aguarde alguns minutos e toque novamente em "Já paguei — verificar acesso".'
      )
    } catch (err) {
      console.log('[AppNavigator] falha ao verificar pagamento | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert(
        'Não foi possível verificar',
        'Tivemos um problema ao verificar seu acesso. Verifique sua conexão e tente novamente.'
      )
    } finally { setVerificando(false) }
  }

  const valorMensal = assinatura?.valor_mensal
    ? `R$ ${Number(assinatura.valor_mensal).toFixed(2).replace('.', ',')}`
    : usuario?.role === 'prestador' ? 'R$ 49,90' : 'R$ 99,90'

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: cores.fundo }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>💳</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: cores.textoForte, textAlign: 'center', marginBottom: 8 }}>
          {assinatura?.status === 'expirada' ? 'Renove sua assinatura' : 'Finalize seu pagamento'}
        </Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: cores.primaria, marginBottom: 24 }}>
          {valorMensal}/mês
        </Text>

        {carregando && (
          <Text style={{ fontSize: 14, color: cores.textoFraco, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
            Gerando link de pagamento...
          </Text>
        )}

        {erro && !carregando && (
          <View style={{ backgroundColor: '#3a1a1a', borderWidth: 1, borderColor: '#f4433644', borderRadius: raios.medio, padding: 14, width: '100%', marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: '#f44336', textAlign: 'center', lineHeight: 20 }}>{erro}</Text>
          </View>
        )}

        {link ? (
          <>
            <Text style={{ fontSize: 13, color: cores.textoFraco, textAlign: 'center', lineHeight: 20, marginBottom: 16 }}>
              Você está sendo redirecionado. Se não abriu automaticamente, toque no botão abaixo.
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 16, width: '100%', alignItems: 'center', marginBottom: 12 }}
              onPress={() => Linking.openURL(link).catch(err => console.log('[AppNavigator] falha ao abrir link de pagamento | msg:', err.message))}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#0A0A0A' }}>Abrir página de pagamento →</Text>
            </TouchableOpacity>
          </>
        ) : !carregando && (
          <TouchableOpacity
            style={{ backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 16, width: '100%', alignItems: 'center', marginBottom: 12 }}
            onPress={buscarLink}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#0A0A0A' }}>Tentar novamente →</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={{ backgroundColor: cores.fundoCard, borderRadius: raios.medio, padding: 14, width: '100%', alignItems: 'center', marginBottom: 12, borderWidth: 0.5, borderColor: cores.borda }}
          onPress={verificarPagamento}
          disabled={verificando}
        >
          <Text style={{ fontSize: 14, color: verificando ? cores.textoFraco : cores.textoForte }}>
            {verificando ? 'Verificando...' : 'Já paguei — verificar acesso'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={logout} style={{ padding: 14 }}>
          <Text style={{ fontSize: 13, color: cores.textoFraco }}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function VerificacaoPendenteScreen() {
  const { logout, revalidarSessao, assinatura } = useAuth()
  const [verificando, setVerificando] = React.useState(false)
  // Conta gratuita (janela de lançamento): a API marca assinatura.tipo === 'gratuito'.
  // Nesse caso a tela troca a copy de pagamento por "aguardando aprovação". Qualquer
  // outro tipo (pago, null ou ausente) mantém a copy original byte-idêntica.
  const ehGratuito = assinatura?.tipo === 'gratuito'

  // "Já paguei — verificar acesso" (tela pós-pagamento, aguardando aprovação do admin).
  // Sempre dá feedback: revalida a sessão e decide a mensagem pelo status REAL devolvido por
  // GET /auth/perfil. Nesta tela o desfecho esperado é 'pendente_verificacao' até a aprovação.
  const verificarPagamento = async () => {
    setVerificando(true)
    try {
      // Refresh COMPLETO da sessão (boas-vindas + flags + push), não só usuario/assinatura.
      const { assinatura: a } = await revalidarSessao()
      const status = a?.status
      if (status === 'ativa') {
        // Aprovado: o AppNavigator troca de tela automaticamente (o app abre). O próprio
        // avanço é o feedback — não exibimos alerta para não sobrepor a transição.
        return
      }
      if (status === 'pendente_verificacao') {
        Alert.alert(
          'Cadastro em análise',
          'Seu cadastro está em análise. Assim que for aprovado (em até 1 hora), seu acesso será liberado.'
        )
        return
      }
      // Qualquer outro status (expirada, cancelada, pendente, sem assinatura): pagamento
      // ainda não confirmado pela plataforma.
      Alert.alert(
        'Pagamento ainda não confirmado',
        'Ainda não identificamos seu pagamento. Se você acabou de pagar, aguarde alguns minutos e toque novamente em "Já paguei — verificar acesso".'
      )
    } catch (err) {
      console.log('[AppNavigator] falha ao verificar pagamento | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert(
        'Não foi possível verificar',
        'Tivemos um problema ao verificar seu acesso. Verifique sua conexão e tente novamente.'
      )
    } finally { setVerificando(false) }
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: cores.fundo }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>{ehGratuito ? '✅' : '💳'}</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: cores.textoForte, textAlign: 'center', marginBottom: 8 }}>
          {ehGratuito ? 'Cadastro enviado!' : 'Pagamento efetuado com sucesso'}
        </Text>
        <Text style={{ fontSize: 15, color: cores.textoFraco, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
          {ehGratuito
            ? 'Estamos analisando seus dados — isso pode levar até uma hora. Você será avisado assim que for aprovado.'
            : 'Em instantes aprovaremos seu cadastro — isto pode levar até uma hora'}
        </Text>

        <TouchableOpacity
          style={{ backgroundColor: cores.fundoCard, borderRadius: raios.medio, padding: 14, width: '100%', alignItems: 'center', marginBottom: 12, borderWidth: 0.5, borderColor: cores.borda }}
          onPress={verificarPagamento}
          disabled={verificando}
        >
          <Text style={{ fontSize: 14, color: verificando ? cores.textoFraco : cores.textoForte }}>
            {verificando ? 'Verificando...' : (ehGratuito ? 'Verificar acesso' : 'Já paguei — verificar acesso')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={logout} style={{ padding: 14 }}>
          <Text style={{ fontSize: 13, color: cores.textoFraco }}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

// Stack do Perfil (compartilhado entre pintor e prestador)
const PerfilStackNavigator = () => (
  <PerfilStack.Navigator screenOptions={{ headerShown: false }}>
    <PerfilStack.Screen name="PerfilMain"   component={PerfilScreen} />
    <PerfilStack.Screen name="EditarPerfil" component={EditarPerfilScreen} />
    <PerfilStack.Screen name="AlterarSenha" component={AlterarSenhaScreen} />
    <PerfilStack.Screen name="AvaliacoesRecebidas" component={AvaliacoesRecebidasScreen} />
  </PerfilStack.Navigator>
)

// Stack do Feed de Pintores
const FeedStackNavigator = () => (
  <FeedStack.Navigator screenOptions={{ headerShown: false }}>
    <FeedStack.Screen name="FeedMain"    component={FeedObrasScreen} />
    <FeedStack.Screen name="DetalheObra" component={DetalheObraScreen} />
  </FeedStack.Navigator>
)

// Stack do Feed de Reparos
const ReparoStackNavigator = () => (
  <ReparoStack.Navigator screenOptions={{ headerShown: false }}>
    <ReparoStack.Screen name="FeedReparosMain" component={FeedReparosScreen} />
    <ReparoStack.Screen name="DetalheReparo"   component={DetalheReparoScreen} />
  </ReparoStack.Navigator>
)

// Stack de Meus Interesses (prestador)
const MeusInteressesNavigator = () => (
  <MeusInteressesStack.Navigator screenOptions={{ headerShown: false }}>
    <MeusInteressesStack.Screen name="MeusInteressesMain" component={MeusInteressesScreen} />
    <MeusInteressesStack.Screen name="DetalheReparo"      component={DetalheReparoScreen} />
  </MeusInteressesStack.Navigator>
)

// Stack: Minhas Obras (pintor — candidaturas/negociações em andamento)
const MinhasObrasInteresseNavigator = () => (
  <MinhasObrasInteresseStack.Navigator screenOptions={{ headerShown: false }}>
    <MinhasObrasInteresseStack.Screen name="MinhasObrasMain" component={ContratosScreen} />
    <MinhasObrasInteresseStack.Screen name="DetalheObra"     component={DetalheObraScreen} />
  </MinhasObrasInteresseStack.Navigator>
)

// Stack: Contratos Finalizados (pintor — obras concluídas)
const ContratosFinObraNavigator = () => (
  <ContratosFinObraStack.Navigator screenOptions={{ headerShown: false }}>
    <ContratosFinObraStack.Screen name="ContratosFinObraMain" component={ContratosFinalizadosScreen} initialParams={{ tipo: 'obra' }} />
    <ContratosFinObraStack.Screen name="DetalheObra"          component={DetalheObraScreen} />
  </ContratosFinObraStack.Navigator>
)

// Stack: Contratos Finalizados (reparador — reparos concluídos)
const ContratosFinReparoNavigator = () => (
  <ContratosFinReparoStack.Navigator screenOptions={{ headerShown: false }}>
    <ContratosFinReparoStack.Screen name="ContratosFinReparoMain" component={ContratosFinalizadosScreen} initialParams={{ tipo: 'reparo' }} />
    <ContratosFinReparoStack.Screen name="DetalheReparo"          component={DetalheReparoScreen} />
  </ContratosFinReparoStack.Navigator>
)

// Stack: Contratos Finalizados (dono_reparo — reparos concluídos onde contratou um prestador)
const ContratosFinDonoReparoNavigator = () => (
  <ContratosFinDonoReparoStack.Navigator screenOptions={{ headerShown: false }}>
    <ContratosFinDonoReparoStack.Screen name="ContratosFinDonoReparoMain" component={ContratosFinalizadosScreen} initialParams={{ tipo: 'reparo', perfil: 'dono' }} />
    <ContratosFinDonoReparoStack.Screen name="DetalheReparo"              component={DetalheReparoScreen} />
  </ContratosFinDonoReparoStack.Navigator>
)

// Stack: Contratos Finalizados (dono_obra — obras concluídas onde contratou um prestador)
const ContratosFinDonoObraNavigator = () => (
  <ContratosFinDonoObraStack.Navigator screenOptions={{ headerShown: false }}>
    <ContratosFinDonoObraStack.Screen name="ContratosFinDonoObraMain" component={ContratosFinalizadosScreen} initialParams={{ tipo: 'obra', perfil: 'dono' }} />
    <ContratosFinDonoObraStack.Screen name="DetalheObra"              component={DetalheObraScreen} />
  </ContratosFinDonoObraStack.Navigator>
)

// Estilo compartilhado da barra de abas. Deriva a reserva inferior do inset da barra
// de navegação do sistema (Android 15 edge-to-edge / notch iOS) via useSafeAreaInsets,
// restaurando o inset que o React Navigation aplicaria sozinho e que o height fixo
// anterior (72) anulava. Mantém o mesmo tamanho visível (72 - 8 - 14 = 50) somando o
// inset a height e paddingBottom. Chamado dentro de componentes sob o SafeAreaProvider raiz.
const useTabBarStyle = () => {
  const { bottom } = useSafeAreaInsets()
  return {
    backgroundColor: cores.fundo,
    borderTopWidth: 0.5,
    borderTopColor: cores.bordaFraca,
    height: 72 + bottom,
    paddingBottom: 14 + bottom,
    paddingTop: 8,
  }
}

// Tabs do Pintor
const TabsPintorNavigator = () => {
  const tabBarStyle = useTabBarStyle()
  return (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle,
      tabBarActiveTintColor: cores.primaria,
      tabBarInactiveTintColor: cores.textoFraco,
      tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
      tabBarIcon: ({ focused }) => <TabIcone nome={route.name} focado={focused} />,
    })}
  >
    <Tab.Screen name="Obras"                 component={FeedStackNavigator} options={{ title: 'Obras disponíveis' }} />
    <Tab.Screen name="Minhas Obras"          component={MinhasObrasInteresseNavigator} />
    <Tab.Screen name="Contratos Finalizados" component={ContratosFinObraNavigator} />
    <Tab.Screen name="Mensagens"             component={MensagensScreen} />
    <Tab.Screen name="Perfil"                component={PerfilStackNavigator} options={{ title: 'Perfil' }} />
  </Tab.Navigator>
  )
}

// Tabs do Prestador (Reparos, Meus Reparos, Contratos Finalizados, Mensagens, Perfil)
const TabsPrestadorNavigator = () => {
  const tabBarStyle = useTabBarStyle()
  return (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle,
      tabBarActiveTintColor: cores.primaria,
      tabBarInactiveTintColor: cores.textoFraco,
      tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
      tabBarIcon: ({ focused }) => <TabIcone nome={route.name} focado={focused} />,
    })}
  >
    <Tab.Screen name="Reparos"               component={ReparoStackNavigator}    options={{ title: 'Reparos disponíveis' }} />
    <Tab.Screen name="Meus Reparos"          component={MeusInteressesNavigator} options={{ title: 'Meus Reparos' }} />
    <Tab.Screen name="Contratos Finalizados" component={ContratosFinReparoNavigator} />
    <Tab.Screen name="Perfil"                component={PerfilStackNavigator}    options={{ title: 'Perfil' }} />
  </Tab.Navigator>
  )
}

// Tab: Novo Reparo (dono_reparo)
const NovoReparoTabStack = () => (
  <NovoReparoStack.Navigator screenOptions={{ headerShown: false }}>
    <NovoReparoStack.Screen name="CadastrarReparoMain" component={CadastrarReparoScreen} />
  </NovoReparoStack.Navigator>
)

// Tab: Meus Reparos (dono_reparo)
const MeusReparosTabStack = () => (
  <MeusReparosStack.Navigator screenOptions={{ headerShown: false }}>
    <MeusReparosStack.Screen name="ListaReparos" component={MinhasObrasScreen} initialParams={{ soAba: 'reparos' }} />
    <MeusReparosStack.Screen name="DetalheReparo" component={DetalheReparoScreen} />
  </MeusReparosStack.Navigator>
)

// Tab Navigator para dono de reparo
const donoTabOpts = {
  headerShown: false,
  tabBarActiveTintColor: cores.primaria,
  tabBarInactiveTintColor: cores.textoFraco,
  tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
}
const DonoReparoTabNavigator = () => {
  const tabBarStyle = useTabBarStyle()
  return (
  <DonoReparoTab.Navigator screenOptions={({ route }) => ({ ...donoTabOpts, tabBarStyle, tabBarIcon: ({ focused }) => <TabIcone nome={route.name} focado={focused} /> })}>
    <DonoReparoTab.Screen name="Novo Reparo"   component={NovoReparoTabStack} />
    <DonoReparoTab.Screen name="Meus Reparos"  component={MeusReparosTabStack} />
    <DonoReparoTab.Screen name="Contratos Finalizados" component={ContratosFinDonoReparoNavigator} />
    <DonoReparoTab.Screen name="Perfil"        component={PerfilStackNavigator} options={{ title: 'Perfil' }} />
  </DonoReparoTab.Navigator>
  )
}

// Tab: Nova Obra (dono_obra)
const NovaObraTabStack = () => (
  <NovaObraStack.Navigator screenOptions={{ headerShown: false }}>
    <NovaObraStack.Screen name="CadastrarObraMain" component={CadastrarObraScreen} />
  </NovaObraStack.Navigator>
)

// Tab: Minhas Obras (dono_obra)
const MinhasObrasTabStack = () => (
  <MinhasObrasStack.Navigator screenOptions={{ headerShown: false }}>
    <MinhasObrasStack.Screen name="ListaObras"   component={MinhasObrasScreen} initialParams={{ soAba: 'obras' }} />
    <MinhasObrasStack.Screen name="DetalheObra"  component={DetalheObraScreen} />
    <MinhasObrasStack.Screen name="DetalheReparo" component={DetalheReparoScreen} />
  </MinhasObrasStack.Navigator>
)

// Tab Navigator para dono de pintura
const DonoObraTabNavigator = () => {
  const tabBarStyle = useTabBarStyle()
  return (
  <DonoObraTab.Navigator screenOptions={({ route }) => ({ ...donoTabOpts, tabBarStyle, tabBarIcon: ({ focused }) => <TabIcone nome={route.name} focado={focused} /> })}>
    <DonoObraTab.Screen name="Nova Obra"      component={NovaObraTabStack} />
    <DonoObraTab.Screen name="Minhas Obras"   component={MinhasObrasTabStack} />
    <DonoObraTab.Screen name="Contratos Finalizados" component={ContratosFinDonoObraNavigator} />
    <DonoObraTab.Screen name="Mensagens"      component={MensagensScreen} />
    <DonoObraTab.Screen name="Perfil"         component={PerfilStackNavigator} options={{ title: 'Perfil' }} />
  </DonoObraTab.Navigator>
  )
}

// Stack do Dono de Obra (fallback para tipo_dono não definido)
const DonoObraNavigator = () => (
  <DonoStack.Navigator screenOptions={{ headerShown: false }}>
    <DonoStack.Screen name="MinhasObras"      component={MinhasObrasScreen} />
    <DonoStack.Screen name="CadastrarObra"    component={CadastrarObraScreen} />
    <DonoStack.Screen name="CadastrarReparo"  component={CadastrarReparoScreen} />
    <DonoStack.Screen name="DetalheObra"      component={DetalheObraScreen} />
    <DonoStack.Screen name="DetalheReparo"    component={DetalheReparoScreen} />
    <DonoStack.Screen name="EditarPerfil"     component={EditarPerfilScreen} />
    <DonoStack.Screen name="AlterarSenha"     component={AlterarSenhaScreen} />
  </DonoStack.Navigator>
)

export default function AppNavigator() {
  const { usuario, assinatura, carregando, mostrarBoasVindas } = useAuth()
  const respostaNotificacaoRef = useRef(null)

  // Mantém o contexto do usuário disponível para o roteador de notificações (deep-links)
  useEffect(() => { setUsuarioContexto(usuario) }, [usuario])

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(resposta => {
      if (resposta?.notification?.request?.content?.data) {
        setTimeout(() => navegarParaNotificacao(resposta.notification.request.content.data), 500)
      }
    })

    respostaNotificacaoRef.current = Notifications.addNotificationResponseReceivedListener(resposta => {
      navegarParaNotificacao(resposta.notification.request.content.data)
    })

    return () => respostaNotificacaoRef.current?.remove()
  }, [])

  if (carregando) return null
  if (usuario && assinatura === null) return null

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, statusBarTranslucent: false, statusBarColor: '#0A0A0A', statusBarStyle: 'light' }}>
        {usuario ? (
          usuario.role === 'dono_obra' ? (
            usuario.tipo_dono === 'reparo' ? (
              <Stack.Screen name="DonoReparoApp" component={DonoReparoTabNavigator} />
            ) : usuario.tipo_dono === 'pintura' ? (
              <Stack.Screen name="DonoObraApp" component={DonoObraTabNavigator} />
            ) : (
              <Stack.Screen name="DonoApp" component={DonoObraNavigator} />
            )
          ) : usuario.role === 'prestador' ? (
            assinatura?.status === 'ativa' ? (
              // Prestador recém-aprovado vê a tela de boas-vindas única antes das
              // abas. Ao confirmar, o flag limpa e cai direto no feed (aba inicial).
              mostrarBoasVindas ? (
                <Stack.Screen name="BoasVindasPrestador" component={BoasVindasPrestadorScreen} options={{ gestureEnabled: false }} />
              ) : usuario.tipo_prestador === 'pintor' ? (
                <Stack.Screen name="App" component={TabsPintorNavigator} />
              ) : (
                <Stack.Screen name="PrestadorApp" component={TabsPrestadorNavigator} />
              )
            ) : assinatura?.status === 'pendente_verificacao' ? (
              <Stack.Screen name="Verificacao" component={VerificacaoPendenteScreen} />
            ) : (
              <Stack.Screen name="Pagamento" component={PagamentoPendenteScreen} />
            )
          ) : (
            assinatura?.status === 'ativa' ? (
              <Stack.Screen name="App" component={TabsPintorNavigator} />
            ) : assinatura?.status === 'pendente_verificacao' ? (
              <Stack.Screen name="Verificacao" component={VerificacaoPendenteScreen} />
            ) : (
              <Stack.Screen name="Pagamento" component={PagamentoPendenteScreen} />
            )
          )
        ) : (
          <>
            <Stack.Screen name="Splash"        component={SplashScreen} />
            <Stack.Screen name="Login"         component={LoginScreen} />
            <Stack.Screen name="Cadastro"      component={CadastroScreen} />
            <Stack.Screen name="EsqueciSenha"  component={EsqueciSenhaScreen} />
            <Stack.Screen name="Termos"        component={TermosScreen} />
            <Stack.Screen name="Privacidade"   component={PrivacidadeScreen} />
          </>
        )}
      </Stack.Navigator>
      {usuario && <CelebracaoMatchHost />}
      {usuario && <SoftAskNotificacao />}
    </NavigationContainer>
  )
}