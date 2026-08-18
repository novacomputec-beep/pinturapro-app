import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'
import api from '../../services/api'
import { estadoRascunhoCadastro, limparRascunhoCadastro } from '../../utils/rascunhoCadastro'

// Vitrine ESTÁTICA do que a plataforma cobre, na tela pré-login. Não é a lista de
// categorias do cadastro (CadastrarReparoScreen/CadastrarObraScreen, que são a fonte da
// verdade e têm 15 e 6 itens): é uma amostra dos dois lados do marketplace — seis de
// serviço doméstico, três de obra — escolhida para caber em 3x3 sem rolar.
const VITRINE = [
  '🔧 Hidráulica', '⚡ Elétrica',   '🧹 Faxina',
  '💅 Manicure',   '🤝 Cuidador',   '🌳 Jardineiro',
  '🏠 Residencial', '🏢 Comercial',  '🌾 Rural',
]

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

      {/* Sem rolagem, esta tela dependia de caber inteira: em aparelho baixo o "Entrar na
          plataforma" e os links de Termos/Privacidade ficavam abaixo da dobra, sem forma
          alguma de alcançá-los — o login ficava bloqueado no aparelho, não apenas apertado.
          O par flexGrow: 1 + justifyContent: 'center' do contentContainer é o mesmo padrão da
          LoginScreen (:83): em tela alta o conteúdo continua centrado e nada muda, porque o
          artArea (flex: 1) segue absorvendo a folga e não sobra espaço para o justifyContent
          distribuir; em tela baixa o contêiner cresce até a altura do conteúdo e passa a
          rolar. O SafeAreaView segue por fora, então as bordas seguras não rolam junto. */}
      <ScrollView contentContainerStyle={estilos.scroll} showsVerticalScrollIndicator={false}>

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
          {/* Mesma pergunta de antes, agora respondida pelos próprios exemplos em vez de um
              parágrafo: a lista se lê num golpe de vista e o bloco encolhe. */}
          <Text style={estilos.vitrineTitulo}>Precisa de um profissional?</Text>
          {/* <View>, e NÃO <TouchableOpacity>: nada aqui é tocável. Um chip com cara de
              botão que não responde ao toque é pior do que chip nenhum — quem quiser entrar
              usa os dois botões logo abaixo, que continuam sendo os únicos alvos da tela.
              numberOfLines={1} por isso mesmo: em tela estreita o rótulo trunca e a grade
              mantém as três colunas, em vez de quebrar em duas linhas e desalinhar tudo. */}
          <View style={estilos.vitrineGrid}>
            {VITRINE.map((c) => (
              <View key={c} style={estilos.vitrineChip}>
                <Text style={estilos.vitrineChipTexto} numberOfLines={1}>{c}</Text>
              </View>
            ))}
          </View>
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

      </ScrollView>

    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
    paddingHorizontal: espacos.tela,
  },
  // Só o contentContainer da rolagem — nenhum valor das regras abaixo mudou. O flexGrow
  // garante o mínimo de uma tela cheia (sem ele o conteúdo encolheria para a própria altura
  // e a centralização se perderia), e a partir daí o conteúdo manda e a rolagem aparece.
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  logoArea: {
    alignItems: 'center',
    paddingTop: 60,
  },
  // Mesma caixa do logo da CadastroScreen e da LoginScreen (170x64). As três telas desenham
  // o MESMO logo.png, e a caixa quadrada de 72 daqui fazia o resizeMode="contain" entregar
  // um wordmark visivelmente menor que o das outras duas — a marca mudava de tamanho de uma
  // tela para a seguinte. Sem margem própria (0), como o logo da CadastroScreen: o respiro
  // até o wordmark passa a ser o mesmo nas três.
  logoIcone: {
    width: 170,
    height: 64,
    marginBottom: 0,
  },
  logoNome: {
    fontSize: 28,
    fontWeight: '700',
    color: cores.textoForte,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  // Régua sob o wordmark, como na arte do logo. Largura fixa e curta de propósito: ela
  // acompanha a PALAVRA, não a tela — esticada de ponta a ponta viraria um divisor de
  // seção. Laranja primária: é peça da MARCA, e no cinza lia como divisor esquecido.
  // Continua com 2px de altura para sublinhar a palavra sem competir com ela.
  // Encostada no wordmark (marginTop 0 + os 2 do logoNome): solta, virava régua à toa.
  // Mesmos valores nas três telas que desenham o wordmark.
  logoRegua: {
    width: 64,
    height: 2,
    borderRadius: 1,
    backgroundColor: cores.primaria,
    marginTop: 0,
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
    // 'flex-end', e não 'center'. Centralizado, a folga que o flex: 1 sobra se dividia
    // em duas metades — uma acima do card, outra abaixo —, e a metade de baixo entrava
    // no vão até "Precisa de um profissional?". Esse vão passava a depender da altura da
    // tela e não havia como calibrá-lo. Encostando o card embaixo, TODA a folga vai para
    // cima e o vão de baixo vira só o padding + a métrica do texto, igual em qualquer
    // aparelho. A altura desta caixa continua vindo do flex (do container), não do
    // conteúdo: justifyContent só distribui o espaço DENTRO dela, então nada disso mexe
    // na altura intrínseca da coluna nem no ponto de dobra do ScrollView.
    justifyContent: 'flex-end',
    alignItems: 'center',
    // paddingTop 40 / paddingBottom 36 (era um paddingVertical: 40 simétrico). Os 36
    // daqui, somados a 1,12 de meia-entrelinha e 3,38 de cap-gap do título de 13, dão
    // 40,50 dp de vão ÓPTICO acima do título; os 20 do marginBottom da vitrineGrid, com
    // os 5 de padding da pill, 0,5 de borda e 3,30 de folga do descendente, dão 28,80 dp
    // abaixo da grade. É o corte de 58/42 medido no que se VÊ, não nos números
    // declarados. A soma declarada segue 56, como era antes de qualquer redistribuição.
    paddingTop: 40,
    paddingBottom: 36,
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
  vitrineTitulo: {
    fontSize: 13,
    fontWeight: '500',
    color: cores.textoForte,
    textAlign: 'center',
    marginBottom: 10,
  },
  // Mesma grade das pills de categoria do cadastro (linha + wrap + largura 31%), com o
  // gap menor: são nove itens decorativos, não um seletor.
  vitrineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    // 20 literal, no lugar de espacos.lg (16): é a metade de baixo do corte óptico de
    // 58/42. Os 20 daqui + 5 de padding da pill + 0,5 de borda + 3,30 de folga do
    // descendente do rótulo de 10 dão 28,80 dp, contra os 40,50 dp do vão acima do
    // título (ver artArea). Literal, e não token, porque 20 não existe em `espacos` — o
    // valor sai da conta óptica, não da escala de espaçamento.
    // O `gap: 6` acima é o respiro ENTRE as pills e não entra nessa conta.
    marginBottom: 20,
  },
  // Espelha o estado NÃO-selecionado da categoriaPill do CadastrarReparoScreen (mesmo
  // fundo, mesma borda de 0.5, mesma cor de texto), em escala menor: 10 em vez de 12 no
  // rótulo, 5/4 de padding em vez de 7/12, raio 13 em vez dos 24 do raios.pill. Não há
  // estado ativo — nada aqui seleciona nada.
  vitrineChip: {
    width: '31%',
    alignItems: 'center',
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: 13,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  vitrineChipTexto: {
    fontSize: 10,
    color: cores.textoMedio,
    textAlign: 'center',
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
