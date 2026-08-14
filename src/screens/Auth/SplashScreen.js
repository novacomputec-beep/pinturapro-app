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

  // Os dois números são UM estado, não dois: cada um caía no próprio fallback, então uma
  // resposta parcial exibia um valor real ("R$ 84.000") sobre um rótulo sem número
  // ("vagas ativas agora"), ou o contrário — "—" sobre "12 vagas ativas agora", que
  // anuncia vagas e esconde quanto elas somam. Falta um, caem os dois.
  const temStats = stats.total_valor_obras != null && stats.total_obras_ativas != null

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
          <Text style={{ color: cores.marcaAzul }}>P</Text>ro<Text style={{ color: cores.primaria }}>L</Text>ar
        </Text>
        <View style={estilos.logoRegua} />
        <Text style={estilos.logoTagline}>Obras e serviços gerais com profissionais qualificados e idoneidade checada.</Text>
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
              {temStats
                ? `R$ ${Number(stats.total_valor_obras).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
                : '—'}
            </Text>
            <Text style={estilos.artValorLabel}>
              {temStats
                ? `${stats.total_obras_ativas} vagas ativas agora`
                : 'vagas ativas agora'}
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
            Da lâmpada queimada à reforma inteira — e também manicure, cabeleireiro, cuidador, professor particular. Publique o que você precisa, de graça, e receba propostas de profissionais aprovados da sua região.
          </Text>
        </TouchableOpacity>
        {/* Criar conta em primeiro e em laranja: esta tela é pré-login, então quem chega
            aqui é majoritariamente quem AINDA não tem conta. Dar o botão de destaque ao
            "Entrar" pedia a ação que só o usuário recorrente precisa, e ele já sabe o
            caminho. Mesmo par de destinos, invertida a ênfase. */}
        <BotaoPrimario
          titulo="Criar minha conta"
          onPress={() => navigation.navigate('Cadastro')}
          estilo={{ marginBottom: 10 }}
        />
        <BotaoSecundario
          titulo="Entrar na plataforma"
          onPress={() => navigation.navigate('Login')}
          estilo={{ marginBottom: 20 }}
        />
        {/* Frase e links em blocos separados: no <Text> único os links ficavam no meio do
            parágrafo, e quebravam onde a largura mandasse. Em duas linhas o aviso se lê
            de uma vez e os dois alvos de toque ficam lado a lado, previsíveis. */}
        <Text style={estilos.termos}>Ao continuar, você concorda com os</Text>
        <Text style={estilos.termosLinks}>
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
  // Régua sob o wordmark, como na arte do logo. Largura fixa e curta de propósito: ela
  // acompanha a PALAVRA, não a tela — esticada de ponta a ponta viraria um divisor de
  // seção. textoFraco (e 2px) para ficar atrás da marca, nunca competindo com ela.
  // Mesmos valores nas três telas que desenham o wordmark.
  logoRegua: {
    width: 64,
    height: 2,
    borderRadius: 1,
    backgroundColor: cores.textoFraco,
    marginTop: 2,
    marginBottom: 10,
  },
  // textAlign próprio: o alignItems do logoArea centra o BLOCO, não o texto, então a
  // tagline quebrada em duas linhas saía alinhada à esquerda dentro de um bloco centrado.
  logoTagline: {
    fontSize: 13,
    color: cores.textoForte,
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 19,
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
    color: cores.textoMedio,
    lineHeight: 18,
  },
  // Mesma métrica da linha de cima; a cor vale para o "e" entre os dois links, que herda
  // deste bloco (os links trazem a própria cor inline).
  termosLinks: {
    textAlign: 'center',
    fontSize: 11,
    color: cores.textoMedio,
    lineHeight: 18,
  },
})
