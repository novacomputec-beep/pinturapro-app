import 'react-native-gesture-handler'
import React from 'react'
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Linking } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useAuth } from '../contexts/AuthContext'
import { cores, espacos, raios } from '../utils/tema'
import api from '../services/api'

// Auth
import SplashScreen   from '../screens/Auth/SplashScreen'
import LoginScreen    from '../screens/Auth/LoginScreen'
import CadastroScreen from '../screens/Auth/CadastroScreen'

// App — Pintor
import FeedScreen        from '../screens/Feed/FeedScreen'
import DetalheObraScreen from '../screens/Obra/DetalheObraScreen'
import ContratosScreen   from '../screens/Contratos/ContratosScreen'
import MensagensScreen   from '../screens/Mensagens/MensagensScreen'
import PerfilScreen      from '../screens/Perfil/PerfilScreen'

// App — Prestador de Serviços
import FeedReparosScreen   from '../screens/Reparos/FeedReparosScreen'
import DetalheReparoScreen from '../screens/Reparos/DetalheReparoScreen'

// App — Dono de Obra
import MinhasObrasScreen      from '../screens/DonoObra/MinhasObrasScreen'
import CadastrarObraScreen    from '../screens/DonoObra/CadastrarObraScreen'
import CadastrarReparoScreen  from '../screens/DonoObra/CadastrarReparoScreen'
import DetalheMinhaObraScreen from '../screens/DonoObra/DetalheMinhaObraScreen'

const Stack        = createNativeStackNavigator()
const Tab          = createBottomTabNavigator()
const FeedStack    = createNativeStackNavigator()
const ReparoStack  = createNativeStackNavigator()
const DonoStack    = createNativeStackNavigator()

const TabIcone = ({ nome, focado }) => {
  const mapa = { Obras: '⬡', Contratos: '📄', Mensagens: '💬', Perfil: '👤', Reparos: '🔧' }
  return (
    <Text style={{ fontSize: 20, opacity: focado ? 1 : 0.3, color: focado ? cores.primaria : cores.textoFraco }}>
      {mapa[nome] || '●'}
    </Text>
  )
}

// Tela de pagamento pendente
function PagamentoPendenteScreen() {
  const { logout, usuario } = useAuth()
  const [link, setLink] = React.useState(null)
  const [carregando, setCarregando] = React.useState(true)

  React.useEffect(() => {
    const buscar = async () => {
      try {
        const pagamento = await api.post('/pagamentos/criar-assinatura', { plano: 'mensal' })
        if (pagamento.init_point) setLink(pagamento.init_point)
      } catch {}
      finally { setCarregando(false) }
    }
    buscar()
  }, [])

  const valor = usuario?.role === 'prestador' ? 'R$ 49,90' : 'R$ 99,90'
  const tipo = usuario?.role === 'prestador' ? 'reparos e serviços' : 'obras de pintura'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: cores.fundo }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>💳</Text>
        <Text style={{ fontSize: 24, fontWeight: '700', color: cores.textoForte, textAlign: 'center', marginBottom: 8 }}>
          Assinatura pendente
        </Text>
        <Text style={{ fontSize: 14, color: cores.textoFraco, textAlign: 'center', lineHeight: 22, marginBottom: 8 }}>
          Para acessar {tipo} disponíveis, finalize seu pagamento.
        </Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: cores.primaria, marginBottom: 32 }}>
          {valor}/mês
        </Text>

        {carregando ? (
          <Text style={{ color: cores.textoFraco }}>Gerando link...</Text>
        ) : link ? (
          <TouchableOpacity
            style={{ backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 16, width: '100%', alignItems: 'center', marginBottom: 12 }}
            onPress={() => Linking.openURL(link)}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#0A0A0A' }}>Pagar agora →</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: cores.textoFraco, textAlign: 'center', marginBottom: 12 }}>
            Entre em contato para ativar seu acesso.
          </Text>
        )}

        <TouchableOpacity onPress={logout} style={{ padding: 14 }}>
          <Text style={{ fontSize: 13, color: cores.textoFraco }}>Sair da conta</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

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
    <Tab.Screen name="Perfil"    component={PerfilScreen} />
  </Tab.Navigator>
)

// Tabs do Prestador
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
    <Tab.Screen name="Reparos"   component={ReparoStackNavigator} options={{ title: 'Reparos' }} />
    <Tab.Screen name="Mensagens" component={MensagensScreen} />
    <Tab.Screen name="Perfil"    component={PerfilScreen} />
  </Tab.Navigator>
)

// Stack do Dono de Obra
const DonoObraNavigator = () => (
  <DonoStack.Navigator screenOptions={{ headerShown: false }}>
    <DonoStack.Screen name="MinhasObras"      component={MinhasObrasScreen} />
    <DonoStack.Screen name="CadastrarObra"    component={CadastrarObraScreen} />
    <DonoStack.Screen name="CadastrarReparo"  component={CadastrarReparoScreen} />
    <DonoStack.Screen name="DetalheMinhaObra" component={DetalheMinhaObraScreen} />
  </DonoStack.Navigator>
)

export default function AppNavigator() {
  const { usuario, assinatura, carregando } = useAuth()

  if (carregando) return null

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
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
            <Stack.Screen name="Splash"   component={SplashScreen} />
            <Stack.Screen name="Login"    component={LoginScreen} />
            <Stack.Screen name="Cadastro" component={CadastroScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}