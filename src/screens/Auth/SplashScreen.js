import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, SafeAreaView, Image, TouchableOpacity, Alert } from 'react-native'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { cores, espacos } from '../../utils/tema'
import api from '../../services/api'
import { estadoRascunhoCadastro, limparRascunhoCadastro } from '../../utils/rascunhoCadastro'

// Garante que o prompt de retomada apareça no máximo uma vez por execução do app
// (evita re-perguntar ao voltar ao Splash na mesma sessão). Reinicia a cada
// cold-start porque o módulo é recarregado junto com o processo.
let resumeCadastroVerificado = false

// Pisos de exibição: um número só aparece se for prova. Abaixo do piso ele destrói
// confiança (ex.: "R$ 180", "2 vagas") — some e o value proposition entra no lugar.
// null/erro/lento caem no MESMO caminho de "abaixo do piso". Contagens de obra e
// reparo são independentes e NUNCA somadas.
const MIN_CONTAGEM = 5
const MIN_VALOR = 10000

export default function SplashScreen({ navigation }) {
  const [stats, setStats] = useState({ valor: null, obrasAbertas: null, reparosAbertas: null })

  useEffect(() => {
    api.get('/stats/publico')
      .then(data => setStats({
        // Optional chaining + ?? null: uma API antiga/errante (sem obras/reparos)
        // vira null nesses campos e simplesmente não exibe — nunca quebra a tela.
        valor: data?.total_valor_obras ?? null,
        obrasAbertas: data?.obras?.demandas_abertas ?? null,
        reparosAbertas: data?.reparos?.demandas_abertas ?? null,
      }))
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

  // Cada item é gatilhado de forma independente; abaixo do piso (ou sem dado) some.
  const temReparos = typeof stats.reparosAbertas === 'number' && stats.reparosAbertas >= MIN_CONTAGEM
  const temObras   = typeof stats.obrasAbertas   === 'number' && stats.obrasAbertas   >= MIN_CONTAGEM
  const temValor   = typeof stats.valor          === 'number' && stats.valor          >= MIN_VALOR
  const temAlgumaProva = temReparos || temObras || temValor

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
        <Text style={estilos.logoTagline}>Obras e reparos: publique sua demanda ou encontre trabalho.</Text>
      </View>

      {/* Dois caminhos — peso visual distinto, nunca somados */}
      <View style={estilos.caminhos}>

        {/* Dono: ênfase primária. É o lado hoje ignorado, e publicar é grátis —
            a promessa é infalsificável (não afirma que alguém responde). */}
        <View style={[estilos.caminhoCard, estilos.caminhoCardDono]}>
          <Text style={estilos.caminhoTitulo}>Tem uma obra ou reparo?</Text>
          <Text style={estilos.caminhoSub}>Publique grátis. Sem taxa para donos.</Text>
          <BotaoPrimario
            titulo="Publicar demanda"
            onPress={() => navigation.navigate('Cadastro')}
            estilo={{ marginTop: 14 }}
          />
        </View>

        {/* Prestador: ênfase secundária. Prova só quando passa do piso; obra e reparo
            em linhas separadas, jamais um número somado. */}
        <View style={[estilos.caminhoCard, estilos.caminhoCardPrestador]}>
          <Text style={estilos.caminhoTitulo}>É profissional?</Text>
          {temReparos && <Text style={estilos.prova}>{stats.reparosAbertas} reparos abertos agora</Text>}
          {temObras   && <Text style={estilos.prova}>{stats.obrasAbertas} obras abertas agora</Text>}
          {temValor   && (
            <Text style={estilos.prova}>
              R$ {Number(stats.valor).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} em trabalhos disponíveis
            </Text>
          )}
          {!temAlgumaProva && <Text style={estilos.caminhoSub}>Encontre obras e reparos para atender.</Text>}
          <BotaoSecundario
            titulo="Buscar trabalho"
            onPress={() => navigation.navigate('Cadastro')}
            estilo={{ marginTop: 14 }}
          />
        </View>

      </View>

      {/* Rodapé: acesso de quem já tem conta + termos */}
      <View style={estilos.rodape}>
        <BotaoSecundario
          titulo="Entrar na plataforma"
          onPress={() => navigation.navigate('Login')}
          estilo={{ marginBottom: 16 }}
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
    paddingTop: 56,
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
    color: cores.textoMedio,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  caminhos: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
  },
  caminhoCard: {
    backgroundColor: cores.fundoCard,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  caminhoCardDono: {
    borderColor: cores.primaria,
  },
  caminhoCardPrestador: {
    borderColor: cores.borda,
  },
  caminhoTitulo: {
    fontSize: 16,
    fontWeight: '700',
    color: cores.textoForte,
    marginBottom: 6,
  },
  caminhoSub: {
    fontSize: 13,
    color: cores.textoMedio,
    lineHeight: 19,
  },
  prova: {
    fontSize: 14,
    fontWeight: '700',
    color: cores.sucesso,
    marginTop: 2,
  },
  rodape: {
    paddingBottom: 32,
  },
  termos: {
    textAlign: 'center',
    fontSize: 11,
    color: cores.textoMutado,
    lineHeight: 18,
  },
})
