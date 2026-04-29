import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert, Image
} from 'react-native'
import { BotaoPrimario, BotaoSecundario, Input } from '../../components'
import { useAuth } from '../../contexts/AuthContext'
import { cores, espacos } from '../../utils/tema'

export default function LoginScreen({ navigation }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})

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
      await login(email.trim().toLowerCase(), senha)
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Erro ao fazer login')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={estilos.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={estilos.voltarBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={estilos.voltarIcone}>←</Text>
          </TouchableOpacity>

          {/* LOGO */}
          <View style={estilos.logoWrap}>
            <Image
              source={require('../../../assets/logo.png')}
              style={estilos.logo}
              resizeMode="contain"
            />
          </View>

          <Text style={estilos.titulo}>Bem-vindo{'\n'}de volta</Text>
          <Text style={estilos.subtitulo}>Acesse sua conta de pintor</Text>

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
              <TouchableOpacity
                style={estilos.olhoBtn}
                onPress={() => setMostrarSenha(!mostrarSenha)}
              >
                <Text style={estilos.olhoTexto}>{mostrarSenha ? 'ocultar' : 'mostrar'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={estilos.esqueciBtn}>
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

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: espacos.tela,
    paddingBottom: 40,
  },
  voltarBtn: {
    marginTop: 14,
    width: 36,
    height: 36,
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  voltarIcone: {
    color: cores.textoMedio,
    fontSize: 16,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 200,
    height: 100,
  },
  titulo: {
    fontSize: 28,
    fontWeight: '700',
    color: cores.textoForte,
    letterSpacing: -0.5,
    marginBottom: 6,
    lineHeight: 36,
  },
  subtitulo: {
    fontSize: 13,
    color: cores.textoFraco,
    marginBottom: 32,
  },
  form: {
    flex: 1,
  },
  olhoBtn: {
    position: 'absolute',
    right: 14,
    bottom: 27,
  },
  olhoTexto: {
    fontSize: 12,
    color: cores.textoFraco,
  },
  esqueciBtn: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: -4,
  },
  esqueciTexto: {
    fontSize: 12,
    color: cores.primaria,
  },
  ouDivisor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  ouLinha: {
    flex: 1,
    height: 0.5,
    backgroundColor: cores.bordaFraca,
  },
  ouTexto: {
    fontSize: 11,
    color: cores.textoMutado,
  },
})