import 'react-native-gesture-handler'
import React from 'react'
import { Text } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useAuth } from '../contexts/AuthContext'
import { cores } from '../utils/tema'

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

// App — Dono de Obra
import MinhasObrasScreen      from '../screens/DonoObra/MinhasObrasScreen'
import CadastrarObraScreen    from '../screens/DonoObra/CadastrarObraScreen'
import DetalheMinhaObraScreen from '../screens/DonoObra/DetalheMinhaObraScreen'

const Stack     = createNativeStackNavigator()
const Tab       = createBottomTabNavigator()
const FeedStack = createNativeStackNavigator()
const DonoStack = createNativeStackNavigator()

const TabIcone = ({ nome, focado }) => {
  const mapa = {
    Obras:      '⬡',
    Contratos:  '📄',
    Mensagens:  '💬',
    Perfil:     '👤',
    MinhasObras:'🏠',
  }
  return (
    <Text style={{
      fontSize: 20,
      opacity: focado ? 1 : 0.3,
      color: focado ? cores.primaria : cores.textoFraco,
    }}>
      {mapa[nome] || '●'}
    </Text>
  )
}

const FeedStackNavigator = () => (
  <FeedStack.Navigator screenOptions={{ headerShown: false }}>
    <FeedStack.Screen name="FeedMain"    component={FeedScreen} />
    <FeedStack.Screen name="DetalheObra" component={DetalheObraScreen} />
  </FeedStack.Navigator>
)

const TabsNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: cores.fundo,
        borderTopWidth: 0.5,
        borderTopColor: cores.bordaFraca,
        height: 72,
        paddingBottom: 14,
        paddingTop: 8,
      },
      tabBarActiveTintColor:   cores.primaria,
      tabBarInactiveTintColor: cores.textoFraco,
      tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
      tabBarIcon: ({ focused }) => (
        <TabIcone nome={route.name} focado={focused} />
      ),
    })}
  >
    <Tab.Screen name="Obras"     component={FeedStackNavigator} options={{ title: 'Obras' }} />
    <Tab.Screen name="Contratos" component={ContratosScreen} />
    <Tab.Screen name="Mensagens" component={MensagensScreen} />
    <Tab.Screen name="Perfil"    component={PerfilScreen} />
  </Tab.Navigator>
)

const DonoObraNavigator = () => (
  <DonoStack.Navigator screenOptions={{ headerShown: false }}>
    <DonoStack.Screen name="MinhasObras"      component={MinhasObrasScreen} />
    <DonoStack.Screen name="CadastrarObra"    component={CadastrarObraScreen} />
    <DonoStack.Screen name="DetalheMinhaObra" component={DetalheMinhaObraScreen} />
  </DonoStack.Navigator>
)

export default function AppNavigator() {
  const { usuario, carregando } = useAuth()

  if (carregando) return null

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {usuario ? (
          usuario.role === 'dono_obra' ? (
            <Stack.Screen name="DonoApp" component={DonoObraNavigator} />
          ) : (
            <Stack.Screen name="App" component={TabsNavigator} />
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