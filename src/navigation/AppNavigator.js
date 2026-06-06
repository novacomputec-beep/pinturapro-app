import 'react-native-gesture-handler'
import React, { useRef, useEffect } from 'react'
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, Linking } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import * as Notifications from 'expo-notifications'
import { useAuth } from '../contexts/AuthContext'
import { cores, raios } from '../utils/tema'
import api from '../services/api'

// Auth
import SplashScreen        from '../screens/Auth/SplashScreen'
import LoginScreen         from '../screens/Auth/LoginScreen'
import CadastroScreen      from '../screens/Auth/CadastroScreen'
import EsqueciSenhaScreen  from '../screens/Auth/EsqueciSenhaScreen'

// App — Pintor
import FeedScreen          from '../screens/Feed/FeedScreen'
import DetalheObraScreen   from '../screens/Obra/DetalheObraScreen'
import ContratosScreen     from '../screens/Contratos/ContratosScreen'
import MensagensScreen     from '../screens/Mensagens/MensagensScreen'
import PerfilScreen        from '../screens/Perfil/PerfilScreen'
import EditarPerfilScreen  from '../screens/Perfil/EditarPerfilScreen'
import AlterarSenhaScreen  from '../screens/Perfil/AlterarSenhaScreen'

// App — Prestador
import FeedReparosScreen   from '../screens/Reparos/FeedReparosScreen'
import DetalheReparoScreen from '../screens/Reparos/DetalheReparoScreen'

// App — Dono de Obra
import MinhasObrasScreen      from '../screens/DonoObra/MinhasObrasScreen'
import CadastrarObraScreen    from '../screens/DonoObra/CadastrarObraScreen'
import CadastrarReparoScreen  from '../screens/DonoObra/CadastrarReparoScreen'
import DetalheMinhaObraScreen from '../screens/DonoObra/DetalheMinhaObraScreen'

const Stack       = createNativeStackNavigator()
const Tab         = createBottomTabNavigator()
const FeedStack   = createNativeStackNavigator()
const ReparoStack = createNativeStackNavigator()
const DonoStack   = createNativeStackNavigator()
const PerfilStack = createNativeStackNavigator()

export const navigationRef = React.createRef()

const navegarParaNotificacao = (data) => {
  if (!navigationRef.current || !data?.tipo) return
  try {
    switch (data.tipo) {
      case 'nova_obra':
        navigationRef.current.navigate('Obras'); break
      case 'candidatura_aprovada':
      case 'candidatura_recusada':
        navigationRef.current.navigate('Contratos'); break
      case 'nova_mensagem':
        navigationRef.current.navigate('Mensagens'); break
      case 'novo_reparo':
        navigationRef.current.navigate('Reparos'); break
      case 'nova_candidatura':
        navigationRef.current.navigate('MinhasObras'); break
    }
  } catch (err) {
    console.log('Erro ao navegar para notificação:', err)
  }
}

const TabIcone = ({ nome, focado }) => {
  const mapa = { Obras: '⬡', Contratos: '📄', Mensagens: '💬', Perfil: '👤', Reparos: '🔧' }
  return (
    <Text style={{ fontSize: 20, opacity: focado ? 1 : 0.3, color: focado ? cores.primaria : cores.textoFraco }}>
      {mapa[nome] || '●'}
    </Text>
  )
}

function PagamentoPendenteScreen() {
  const { logout, usuario, assinatura, setUsuario, setAssinatura } = useAuth()
  const [link, setLink] = React.useState(null)
  const [carregando, setCarregando] = React.useState(true)
  const [verificando, setVerificando] = React.useState(false)
  const [erro, setErro] = React.useState(null)

  const buscarLink = React.useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const plano = assinatura?.plano || 'mensal'
      const pagamento = await api.post('/pagamentos/criar-assinatura', { plano })
      if (pagamento.init_point) {
        setLink(pagamento.init_point)
        Linking.openURL(pagamento.init_point).catch(() => {})
      } else {
        setErro('Link de pagamento não retornado. Toque em "Tentar novamente".')
      }
    } catch (err) {
      const msg = err?.erro || err?.message || 'Não foi possível gerar o link de pagamento.'
      setErro(msg)
    } finally {
      setCarregando(false)
    }
  }, [assinatura?.plano])

  React.useEffect(() => { buscarLink() }, [])

  const verificarPagamento = async () => {
    setVerificando(true)
    try {
      const dados = await api.get('/auth/perfil')
      setUsuario(dados.usuario)
      setAssinatura(dados.assinatura)
    } catch {}
    finally { setVerificando(false) }
  }

  const valorMensal = assinatura?.valor_mensal
    ? `R$ ${Number(assinatura.valor_mensal).toFixed(2).replace('.', ',')}`
    : usuario?.role === 'prestador' ? 'R$ 49,90' : 'R$ 99,90'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: cores.fundo }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>💳</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: cores.textoForte, textAlign: 'center', marginBottom: 8 }}>
          Finalize seu pagamento
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
              onPress={() => Linking.openURL(link).catch(() => {})}
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

// Stack do Perfil (compartilhado entre pintor e prestador)
const PerfilStackNavigator = () => (
  <PerfilStack.Navigator screenOptions={{ headerShown: false }}>
    <PerfilStack.Screen name="PerfilMain"   component={PerfilScreen} />
    <PerfilStack.Screen name="EditarPerfil" component={EditarPerfilScreen} />
    <PerfilStack.Screen name="AlterarSenha" component={AlterarSenhaScreen} />
  </PerfilStack.Navigator>
)

// Stack do Feed de Pintores
const FeedStackNavigator = () => (
  <FeedStack.Navigator screenOptions={{ headerShown: false }}>
    <FeedStack.Screen name="FeedMain"    component={FeedScreen} />
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

// Tabs do Pintor
const TabsPintorNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { backgroundColor: cores.fundo, borderTopWidth: 0.5, borderTopColor: cores.bordaFraca, height: 72, paddingBottom: 14, paddingTop: 8 },
      tabBarActiveTintColor: cores.primaria,
      tabBarInactiveTintColor: cores.textoFraco,
      tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
      tabBarIcon: ({ focused }) => <TabIcone nome={route.name} focado={focused} />,
    })}
  >
    <Tab.Screen name="Obras"     component={FeedStackNavigator} options={{ title: 'Obras' }} />
    <Tab.Screen name="Contratos" component={ContratosScreen} />
    <Tab.Screen name="Mensagens" component={MensagensScreen} />
    <Tab.Screen name="Perfil"    component={PerfilStackNavigator} options={{ title: 'Perfil' }} />
  </Tab.Navigator>
)

// Tabs do Prestador (inclui Obras para pintores e Reparos para todos)
const TabsPrestadorNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { backgroundColor: cores.fundo, borderTopWidth: 0.5, borderTopColor: cores.bordaFraca, height: 72, paddingBottom: 14, paddingTop: 8 },
      tabBarActiveTintColor: cores.primaria,
      tabBarInactiveTintColor: cores.textoFraco,
      tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
      tabBarIcon: ({ focused }) => <TabIcone nome={route.name} focado={focused} />,
    })}
  >
    <Tab.Screen name="Obras"     component={FeedStackNavigator} options={{ title: 'Obras' }} />
    <Tab.Screen name="Reparos"   component={ReparoStackNavigator} options={{ title: 'Reparos' }} />
    <Tab.Screen name="Mensagens" component={MensagensScreen} />
    <Tab.Screen name="Perfil"    component={PerfilStackNavigator} options={{ title: 'Perfil' }} />
  </Tab.Navigator>
)

// Stack do Dono de Obra
const DonoObraNavigator = () => (
  <DonoStack.Navigator screenOptions={{ headerShown: false }}>
    <DonoStack.Screen name="MinhasObras"      component={MinhasObrasScreen} />
    <DonoStack.Screen name="CadastrarObra"    component={CadastrarObraScreen} />
    <DonoStack.Screen name="CadastrarReparo"  component={CadastrarReparoScreen} />
    <DonoStack.Screen name="DetalheMinhaObra" component={DetalheMinhaObraScreen} />
    <DonoStack.Screen name="DetalheReparo"    component={DetalheReparoScreen} />
    <DonoStack.Screen name="EditarPerfil"     component={EditarPerfilScreen} />
    <DonoStack.Screen name="AlterarSenha"     component={AlterarSenhaScreen} />
  </DonoStack.Navigator>
)

export default function AppNavigator() {
  const { usuario, assinatura, carregando } = useAuth()
  const respostaNotificacaoRef = useRef(null)

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

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, statusBarTranslucent: false, statusBarColor: '#0A0A0A', statusBarStyle: 'light' }}>
        {usuario ? (
          usuario.role === 'dono_obra' ? (
            <Stack.Screen name="DonoApp" component={DonoObraNavigator} />
          ) : usuario.role === 'prestador' ? (
            assinatura?.status === 'ativa' ? (
              <Stack.Screen name="PrestadorApp" component={TabsPrestadorNavigator} />
            ) : (
              <Stack.Screen name="Pagamento" component={PagamentoPendenteScreen} />
            )
          ) : (
            assinatura?.status === 'ativa' ? (
              <Stack.Screen name="App" component={TabsPintorNavigator} />
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
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}