import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView, PixelRatio, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario } from '../../components'
import { cores, espacos, raios, larguraMaxima } from '../../utils/tema'
import api from '../../services/api'
import { estadoRascunhoCadastro, limparRascunhoCadastro } from '../../utils/rascunhoCadastro'
import { useLoginSocial, useAssinaturaPosLogin, BotoesSociais, TelaPagamentoPendente } from './LoginSocial'
import EntrarComoScreen from './EntrarComoScreen'

// Vitrine ESTÁTICA do que a plataforma cobre, na tela pré-login. Não é a lista de
// categorias do cadastro (CadastrarReparoScreen/CadastrarObraScreen, que são a fonte da
// verdade): é uma amostra dos dois lados do marketplace — seis de serviço doméstico em 2x3
// (a arte "cabe numa tela, sem rolar" tirou a terceira linha: Babá, Aulas e Mudanças) e a
// cápsula de obra abaixo. A ORDEM agrupa reparos na primeira linha e cuidados na segunda.
const VITRINE = [
  '🔧 Hidráulica',       '⚡ Elétrica',  '🪚 Marcenaria',
  '🧹 Faxina',           '✂️ Cabelo',    '💅 Manicure',
]

// A cápsula NÃO é uma sétima pill: é a outra METADE do marketplace. Seis pills cobrem o
// lado dos serviços; obra é um bloco só, com uma faixa própria, porque enfileirar
// 'Residencial'/'Comercial'/'Rural' entre as pills dava a entender que obra é mais uma
// categoria de serviço, e não o outro lado inteiro da plataforma.
const VITRINE_OBRAS = '🏗️ Obras de construção civil residenciais, comerciais, rurais, pinturas e muito mais… 🧱'

// Quebra a vitrine em linhas de três: cada linha é uma <View> própria, e é o que permite às
// pills usarem flex: 1 e fecharem a largura exata (ver vitrineLinha/vitrineChip).
const emLinhasDeTres = (itens) => {
  const linhas = []
  for (let i = 0; i < itens.length; i += 3) linhas.push(itens.slice(i, i + 3))
  return linhas
}

// Garante que o prompt de retomada apareça no máximo uma vez por execução do app
// (evita re-perguntar ao voltar ao Splash na mesma sessão). Reinicia a cada
// cold-start porque o módulo é recarregado junto com o processo.
let resumeCadastroVerificado = false

// Abaixo desta altura de janela (dp) a tela entra no modo compacto: logo menor, botões de
// 44, vãos mínimos menores. É o que faz um aparelho de 640 dp (área útil ~560) caber sem
// rolar; em tela alta os três espaçadores absorvem a folga como sempre.
const ALTURA_COMPACTA = 700

export default function SplashScreen({ navigation }) {
  const [stats, setStats] = useState({ total_valor_obras: null, total_obras_ativas: null })
  const { height: alturaJanela } = useWindowDimensions()
  const compacto = alturaJanela < ALTURA_COMPACTA
  // Escala de fonte do SISTEMA (acessibilidade), lida a cada render. Na escala normal (1.0)
  // a tagline cabe em duas linhas encolhendo só onde precisa; acima disso a pessoa PEDIU
  // texto maior, e encolher + cortar em duas linhas contradiria o pedido e comeria o fim
  // da frase — o "✓" e o "obra!". Então, a partir de qualquer escala > 1, o teto de linhas
  // sai e o texto quebra em quantas linhas precisar: perder legibilidade é aceitável,
  // perder o fim da frase não.
  const escalaFonteSistema = PixelRatio.getFontScale()
  const taglineAjuste = escalaFonteSistema > 1
    ? {}
    : { numberOfLines: 2, adjustsFontSizeToFit: true, minimumFontScale: 0.85 }

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
  // ("vagas ativas agora"), ou o contrário. Falta um, caem os dois.
  const temStats = stats.total_valor_obras != null && stats.total_obras_ativas != null

  // "Continuar com Google/Apple" (./LoginSocial, o mesmo fluxo que a LoginScreen tinha):
  // conta existente entra (último perfil lembrado ou o "Entrar como:" aqui mesmo), quem não
  // tem conta vai ao cadastro com o ticket.
  const [contas, setContas] = useState(null)
  const [ultimoTipo, setUltimoTipo] = useState(null)
  // E-mail das contas a escolher: o "Entrar como:" lê por ele a última conta contratante usada.
  const [emailContas, setEmailContas] = useState(null)
  const [tipoCarregando, setTipoCarregando] = useState(null)
  const [provedorContas, setProvedorContas] = useState(null)
  const { linkPagamento, setLinkPagamento, tratarAssinatura } = useAssinaturaPosLogin()
  const social = useLoginSocial({
    navigation,
    ocupado: !!tipoCarregando,
    onEscolher: ({ provedor, contas: lista, ultimoTipo: salvo, email }) => {
      setUltimoTipo(salvo)
      setEmailContas(email || null)
      setProvedorContas(provedor)
      setContas(lista)
    },
    onSessao: tratarAssinatura,
  })

  if (contas && !linkPagamento) {
    return (
      <EntrarComoScreen
        contas={contas}
        tipoCarregando={tipoCarregando}
        ultimoTipo={ultimoTipo}
        email={emailContas}
        onEscolher={(tipo) => social.handleSocial(provedorContas, tipo, setTipoCarregando)}
        onVoltar={() => { social.limparCredencial(); setContas(null) }}
      />
    )
  }

  if (linkPagamento) {
    return <TelaPagamentoPendente link={linkPagamento} onDepois={() => setLinkPagamento(null)} />
  }

  const alturaBotao = compacto ? 44 : 48

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.container}>

      {/* A arte pede UMA tela, sem rolar: o conteúdo foi dimensionado para caber (vitrine de
          duas linhas, sem divisor, vãos mínimos curtos, modo compacto em janela baixa). A
          ScrollView fica só como rede de segurança — com fonte do sistema ampliada o texto
          cresce e, aí, rolar é melhor que cortar. Em escala normal nada rola. O flexGrow
          garante ao menos a altura da viewport, e a folga vai toda para os três espaçadores. */}
      <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">

        {/* Logo */}
        <View style={[estilos.logoArea, compacto && estilos.logoAreaCompacta]}>
          <Image
            source={require('../../../assets/logo.png')}
            style={[estilos.logoIcone, compacto && estilos.logoIconeCompacto]}
            resizeMode="contain"
          />
          <Text style={[estilos.logoNome, compacto && estilos.logoNomeCompacto]}>
            <Text style={{ color: cores.marcaAzul }}>P</Text>ro<Text style={{ color: cores.primaria }}>T</Text>udo
          </Text>
          <View style={estilos.logoRegua} />
          {/* Duas linhas de propósito (quebra explícita, não por largura): a promessa e a
              garantia são frases distintas, e centradas uma sob a outra. O ✓ vai em
              cores.sucesso — a cor semântica de "aprovado", não um verde novo. */}
          <Text style={[estilos.logoTagline, compacto && estilos.logoTaglineCompacta]} {...taglineAjuste}>
            {'Conecta quem precisa a quem faz — da faxina à obra!'}{'\n'}
            {'Todos os profissionais cadastrados são verificados '}<Text style={{ color: cores.sucesso }}>✓</Text>
          </Text>
        </View>

        <View style={[estilos.espacador, compacto && estilos.espacadorCompacto]} />

        {/* Arte central */}
        <View style={estilos.artArea}>
          <TouchableOpacity
            style={{ width: '100%' }}
            onPress={() => navigation.navigate('Cadastro')}
            activeOpacity={0.8}
          >
            <Text style={estilos.vitrineTitulo}>Monetize seus talentos</Text>
            <View style={[estilos.artCard, compacto && estilos.artCardCompacto]}>
              <View style={estilos.artLinha}>
                <View style={[estilos.artBloco, { flex: 2, backgroundColor: cores.primariaSuave }]} />
                <View style={[estilos.artBloco, { flex: 1 }]} />
              </View>
              <View style={[estilos.artLinha, { marginTop: 6 }]}>
                <View style={[estilos.artBloco, { flex: 1 }]} />
                <View style={[estilos.artBloco, { flex: 1 }]} />
                <View style={[estilos.artBloco, { flex: 1, backgroundColor: cores.sucessoSuave }]} />
              </View>
              {/* A terceira linha do mock só existe em tela alta: no modo compacto ela é a
                  altura que faltava para o conjunto caber sem rolar. */}
              {!compacto && (
                <View style={[estilos.artLinha, { marginTop: 6 }]}>
                  <View style={[estilos.artBloco, { flex: 3 }]} />
                </View>
              )}
              <View style={[estilos.artValor, compacto && estilos.artValorCompacto]}>
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
            </View>
          </TouchableOpacity>
        </View>

        <View style={[estilos.espacador, compacto && estilos.espacadorCompacto]} />

        {/* Vitrine: o título e a grade são UM bloco — e UM alvo de toque, que abre o
            Cadastro, o mesmo destino do artCard e do "Criar minha conta" logo abaixo. UM alvo
            para o bloco todo, NUNCA um por pill: a vitrine é amostra do que a plataforma
            cobre, não um seletor. */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Cadastro')}
          activeOpacity={0.8}
        >
          <Text style={estilos.vitrineTitulo}>Precisa de um profissional?</Text>
          <View style={estilos.vitrineGrid}>
            {emLinhasDeTres(VITRINE).map((linha, i) => (
              <View key={i} style={estilos.vitrineLinha}>
                {linha.map((c) => (
                  <View key={c} style={estilos.vitrineChip}>
                    <Text style={estilos.vitrineChipTexto} numberOfLines={1}>{c}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
          {/* Irmã da grade, e ainda dentro do MESMO TouchableOpacity: o bloco segue
              sendo um alvo de toque só, como as pills. Sem onPress próprio. */}
          <View style={estilos.vitrineObras}>
            <Text style={estilos.vitrineObrasTexto} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8333}>{VITRINE_OBRAS}</Text>
          </View>
        </TouchableOpacity>

        <View style={[estilos.espacador, compacto && estilos.espacadorCompacto]} />

        {/* Ações, na ordem da arte: criar (laranja cheio), entrar (aro laranja de 2px, texto
            laranja-claro em negrito), Google no escuro oficial e, no iOS, a Apple logo abaixo.
            Sem divisor. A simetria dos três vãos TERMINA no "Criar minha conta". */}
        <View style={[estilos.acoes, compacto && estilos.acoesCompacto]}>
          <BotaoPrimario
            titulo="Criar minha conta"
            onPress={() => navigation.navigate('Cadastro')}
            estilo={{ marginBottom: 8, height: alturaBotao, paddingVertical: 0, justifyContent: 'center' }}
          />
          <TouchableOpacity
            style={[estilos.btnEntrar, { height: alturaBotao }]}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={estilos.btnEntrarTexto}>Entrar na plataforma</Text>
          </TouchableOpacity>
          <BotoesSociais
            carregandoSocial={social.carregandoSocial}
            temApple={social.temApple}
            onGoogle={() => social.handleSocial('google')}
            onApple={() => social.handleSocial('apple')}
            altura={alturaBotao}
            estilo={{ marginTop: 8 }}
          />
          {/* Frase e links em blocos separados: no <Text> único os links ficavam no meio do
              parágrafo, e quebravam onde a largura mandasse. Em duas linhas o aviso se lê
              de uma vez e os dois alvos de toque ficam lado a lado, previsíveis. */}
          <Text style={[estilos.termos, { marginTop: compacto ? 10 : 16 }]}>Ao continuar, você concorda com os</Text>
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
  // flexGrow garante o mínimo de uma tela cheia; a folga vai para os três espaçadores.
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  // 24 de respiro no topo (eram 60): a arte sem rolagem não tem altura para gastar.
  logoArea: {
    alignItems: 'center',
    paddingTop: 24,
  },
  logoAreaCompacta: { paddingTop: 8 },
  // Mesma caixa do logo da CadastroScreen e da LoginScreen (170x64), para as três telas
  // desenharem a MESMA marca; no modo compacto encolhe proporcionalmente.
  logoIcone: {
    width: 170,
    height: 64,
    marginBottom: 0,
  },
  logoIconeCompacto: { width: 144, height: 54 },
  logoNome: {
    fontSize: 28,
    fontWeight: '700',
    color: cores.textoForte,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  logoNomeCompacto: { fontSize: 24 },
  // Régua sob o wordmark, como na arte do logo: curta, laranja, 2px. Mesmos valores nas
  // três telas que desenham o wordmark.
  logoRegua: {
    width: 88,
    height: 2,
    borderRadius: 1,
    backgroundColor: cores.primaria,
    marginTop: 0,
    marginBottom: 8,
  },
  logoTagline: {
    fontSize: 13,
    color: cores.textoForte,
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 19,
  },
  logoTaglineCompacta: { fontSize: 12, lineHeight: 17 },
  artArea: {
    alignItems: 'center',
  },
  artCard: {
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: 20,
    padding: 14,
    width: '100%',
  },
  artCardCompacto: { padding: 12 },
  artLinha: {
    flexDirection: 'row',
    gap: 8,
  },
  artBloco: {
    height: 12,
    backgroundColor: cores.fundoElevado,
    borderRadius: 4,
  },
  artValor: {
    marginTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: cores.bordaFraca,
    paddingTop: 8,
  },
  artValorCompacto: { marginTop: 8, paddingTop: 6 },
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
    paddingBottom: 16,
  },
  acoesCompacto: { paddingBottom: 8 },
  // Os TRÊS vãos verticais da tela — logo→card, card→vitrine, vitrine→botão — são estes
  // espaçadores, e não padding de bloco nenhum. Mesmo flex e mesmo piso nos três: a folga
  // se divide em partes iguais em qualquer altura de tela. minHeight é o CHÃO: 12 (era 16)
  // em tela normal e 6 no modo compacto, o bastante para nenhum par de blocos se tocar.
  espacador: {
    flex: 1,
    minHeight: 12,
  },
  espacadorCompacto: { minHeight: 6 },
  vitrineTitulo: {
    fontSize: 13,
    fontWeight: '500',
    color: cores.textoForte,
    textAlign: 'center',
    marginBottom: 8,
  },
  // Uma <View> por linha (vitrineLinha) e flex: 1 nas pills: cada linha ocupa a largura
  // inteira, os dois gaps de 6 dp são descontados primeiro e o resto se divide em três
  // partes iguais — a primeira pill começa na borda esquerda e a terceira termina na
  // direita, as duas do botão. gap aqui é o respiro VERTICAL entre as duas linhas.
  vitrineGrid: {
    gap: 6,
  },
  vitrineLinha: {
    flexDirection: 'row',
    gap: 6,
  },
  // Espelha o estado NÃO-selecionado da categoriaPill do cadastro de serviço (mesmo fundo,
  // mesma borda de 0.5, mesma cor de texto), em escala menor. Não há estado ativo — quem
  // responde ao dedo é o bloco inteiro, um nível acima.
  vitrineChip: {
    flex: 1,
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
  // Mesmo raio e mesmo corpo de texto das pills, com a borda inteira em primária e o fundo
  // no primariaSuave: lê como OUTRO tipo de item. marginTop 6 repete o gap da grade.
  vitrineObras: {
    marginTop: 6,
    alignItems: 'center',
    backgroundColor: cores.primariaSuave,
    borderWidth: 1,
    borderColor: cores.primaria,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  vitrineObrasTexto: {
    fontSize: 12,
    color: cores.textoForte,
    textAlign: 'center',
  },
  // "Entrar na plataforma": aro laranja de 2px, texto laranja-claro em negrito.
  btnEntrar: {
    borderWidth: 2,
    borderColor: cores.primaria,
    borderRadius: raios.grande,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  btnEntrarTexto: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F5B37C',
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
