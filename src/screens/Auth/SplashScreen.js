import React from 'react'
import { View, Text, StyleSheet, SafeAreaView, Image } from 'react-native'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { cores, espacos } from '../../utils/tema'

export default function SplashScreen({ navigation }) {
  return (
    <SafeAreaView style={estilos.container}>

      {/* Logo */}
      <View style={estilos.logoArea}>
        <Image
          source={require('../../../assets/logo.png')}
          style={estilos.logoIcone}
          resizeMode="contain"
        />
        <Text style={estilos.logoNome}>
          Pintura<Text style={{ color: cores.primaria }}>Pro</Text>
        </Text>
        <Text style={estilos.logoTagline}>Obras para pintores profissionais</Text>
      </View>

      {/* Arte central */}
      <View style={estilos.artArea}>
        <View style={estilos.artCard}>
          <View style={estilos.artLinha}>
            <View style={[estilos.artBloco, { flex: 2, backgroundColor: cores.primariaSuave }]} />
            <View style={[estilos.artBloco, { flex: 1 }]} />
          </View>
          <View style={[estilos.artLinha, { marginTop: 8 }]}>
            <View style={[estilos.artBloco, { flex: 1 }]} />
            <View style={[estilos.artBloco, { flex: 1 }]} />
            <View style={[estilos.artBloco, { flex: 1, backgroundColor: cores.sucessoSuave }]} />
          </View>
          <View style={[estilos.artLinha, { marginTop: 8 }]}>
            <View style={[estilos.artBloco, { flex: 3 }]} />
          </View>
          <View style={estilos.artValor}>
            <Text style={estilos.artValorTexto}>R$ 8.400</Text>
            <Text style={estilos.artValorLabel}>empreitada disponível</Text>
          </View>
        </View>
      </View>

      {/* Ações */}
      <View style={estilos.acoes}>
        <BotaoPrimario
          titulo="Entrar na plataforma"
          onPress={() => navigation.navigate('Login')}
          estilo={{ marginBottom: 10 }}
        />
        <BotaoSecundario
          titulo="Criar minha conta"
          onPress={() => navigation.navigate('Cadastro')}
          estilo={{ marginBottom: 20 }}
        />
        <Text style={estilos.termos}>
          Ao continuar, você concorda com os{' '}
          <Text style={{ color: cores.textoMedio }}>Termos de uso</Text>
          {' '}e{' '}
          <Text style={{ color: cores.textoMedio }}>Política de privacidade</Text>
        </Text>
      </View>

    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
    paddingHorizontal: espacos.tela,
  },
  logoArea: {
    alignItems: 'center',
    paddingTop: 60,
  },
  logoIcone: {
    width: 72,
    height: 72,
    marginBottom: 16,
  },
  logoNome: {
    fontSize: 28,
    fontWeight: '700',
    color: cores.textoForte,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  logoTagline: {
    fontSize: 13,
    color: cores.textoFraco,
    letterSpacing: 0.3,
  },
  artArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  artCard: {
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 300,
  },
  artLinha: {
    flexDirection: 'row',
    gap: 8,
  },
  artBloco: {
    height: 14,
    backgroundColor: cores.fundoElevado,
    borderRadius: 4,
  },
  artValor: {
    marginTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: cores.bordaFraca,
    paddingTop: 12,
  },
  artValorTexto: {
    fontSize: 20,
    fontWeight: '700',
    color: cores.sucesso,
  },
  artValorLabel: {
    fontSize: 12,
    color: cores.textoFraco,
    marginTop: 2,
  },
  acoes: {
    paddingBottom: 40,
  },
  termos: {
    textAlign: 'center',
    fontSize: 11,
    color: cores.textoMutado,
    lineHeight: 18,
  },
})
