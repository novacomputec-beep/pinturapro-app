import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'
import api from '../../services/api'
import { estadoRascunhoCadastro, limparRascunhoCadastro } from '../../utils/rascunhoCadastro'

// Garante que o prompt de retomada apareça no máximo uma vez por execução do app
// (evita re-perguntar ao voltar ao Splash na mesma sessão). Reinicia a cada
// cold-start porque o módulo é recarregado junto com o processo.
let resumeCadastroVerificado = false

export default function SplashScreen({ navigation }) {
  const [stats, setStats] = useState({ total_valor_obras: null, total_obras_ativas: null })

  useEffect(() => {
    api.get('/stats/publico')
      .then(data => setStats({ total_valor_obras: data.total_valor_obras, total_obras_ativas: data.total_obras_ativas }))
      .catch(err => console.log('[SplashScreen] falha ao buscar stats públicos | code:', err.code, '| msg:', err.message))
  }, [])

  // Resume de cold-start: um process kill do Android durante o cadastro reinicia o
  // app AQUI (Splash, rota inicial pré-auth) e NÃO remonta o CadastroScreen sozinho —
  // por isso a checagem vive neste ponto de entrada. Se há rascunho fresco (<24h),
  // oferece retomar; se expirado, limpa em silêncio; se não há, não faz nada.
  useEffect(() => {
    if (resumeCadastroVerificado) return
    resumeCadastroVerificado = true
    ;(async () => {
      const estado = await estadoRascunhoCadastro()
      if (estado === 'expirado') {
        await limparRascunhoCadastro()
        return
      }
      if (estado === 'fresco') {
        Alert.alert(
          'Continuar cadastro?',
          'Você tem um cadastro em andamento. Deseja continuar de onde parou?',
          [
            { text: 'Descartar', style: 'destructive', onPress: () => { limparRascunhoCadastro() } },
            { text: 'Continuar cadastro', onPress: () => navigation.navigate('Cadastro') },
          ],
        )
      }
    })()
  }, [])

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.container}>

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
        <Text style={estilos.logoTagline}>Obras e reparos para profissionais qualificados e com idoneidade checada!</Text>
      </View>

      {/* Arte central */}
      <View style={estilos.artArea}>
        <TouchableOpacity
          style={estilos.artCard}
          onPress={() => navigation.navigate('Cadastro')}
          activeOpacity={0.8}
        >
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
            <Text style={estilos.artValorTexto}>
              {stats.total_valor_obras != null
                ? `R$ ${Number(stats.total_valor_obras).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
                : '—'}
            </Text>
            <Text style={estilos.artValorLabel}>
              {stats.total_obras_ativas != null
                ? `${stats.total_obras_ativas} vagas ativas agora`
                : 'empreitada disponível'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Ações */}
      <View style={estilos.acoes}>
        {/* Chamada ao dono: a tela sempre falou ao prestador ("profissionais
            qualificados"), e o dono é o outro lado do marketplace. Leva ao MESMO
            destino do "Criar minha conta" — Cadastro no passo 0, onde a escolha de
            perfil acontece. Sem rota nova, sem params. */}
        <TouchableOpacity
          style={estilos.donoCard}
          onPress={() => navigation.navigate('Cadastro')}
          activeOpacity={0.8}
        >
          <Text style={estilos.donoTitulo}>Precisa de um profissional?</Text>
          <Text style={estilos.donoTexto}>
            Lâmpada queimada, vaso entupido, uma faxina, um cuidador — ou uma obra maior. Cadastre sua necessidade grátis e receba profissionais aprovados da sua região.
          </Text>
        </TouchableOpacity>
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
          <Text style={{ color: cores.primaria }} onPress={() => navigation.navigate('Termos')}>Termos de uso</Text>
          {' '}e{' '}
          <Text style={{ color: cores.primaria }} onPress={() => navigation.navigate('Privacidade')}>Política de privacidade</Text>
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
  donoCard: {
    backgroundColor: cores.primariaSuave,
    borderWidth: 0.5,
    borderColor: cores.primariaBorda,
    borderRadius: raios.grande,
    padding: espacos.lg,
    marginBottom: espacos.lg,
  },
  donoTitulo: {
    fontSize: 15,
    fontWeight: '700',
    color: cores.textoForte,
    marginBottom: 6,
  },
  donoTexto: {
    fontSize: 12,
    color: cores.textoMedio,
    lineHeight: 18,
  },
  termos: {
    textAlign: 'center',
    fontSize: 11,
    color: cores.textoMutado,
    lineHeight: 18,
  },
})
