import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'
import api from '../../services/api'
import { estadoRascunhoCadastro, limparRascunhoCadastro } from '../../utils/rascunhoCadastro'

// Vitrine ESTÁTICA do que a plataforma cobre, na tela pré-login. Não é a lista de
// categorias do cadastro (CadastrarReparoScreen/CadastrarObraScreen, que são a fonte da
// verdade e têm 15 e 6 itens): é uma amostra dos dois lados do marketplace — nove de
// serviço doméstico, três de obra — em 4x3. A ORDEM agrupa: as três primeiras linhas são
// serviço doméstico e a ÚLTIMA fecha a grade com as três categorias de obra. Aulas,
// Chaveiro e Cabelo entraram por último e por isso ficaram no fim, partindo o bloco
// doméstico ao meio; movidos para a terceira linha, cada bloco volta a ser contíguo e a
// leitura não alterna entre os dois lados do marketplace. Os emojis seguem o padrão das
// outras entradas, que nunca aparecem sem um. O "3x3 sem rolar" que este comentário
// prometia deixou de valer: com quatro linhas a tela pode passar da dobra em aparelho
// baixo, e quem sustenta esse caso é o flexGrow do contentContainer somado ao piso dos
// espaçadores, não a contagem de linhas.
const VITRINE = [
  '🔧 Hidráulica', '⚡ Elétrica',   '🧹 Faxina',
  '💅 Manicure',   '🤝 Cuidador',   '🌳 Jardineiro',
  '📚 Aulas',      '🔑 Chaveiro',   '💇 Cabelo',
  '🏠 Residencial', '🏢 Comercial',  '🌾 Rural',
]

// Quebra a vitrine em linhas de três. A grade deixou de ser um container único com
// flexWrap justamente para isto: cada linha é uma <View> própria, e é o que permite às
// pills usarem flex: 1 e fecharem a largura exata (ver vitrineLinha/vitrineChip). Uma
// última linha incompleta continua válida — suas pills ficam mais largas, nunca tortas.
const emLinhasDeTres = (itens) => {
  const linhas = []
  for (let i = 0; i < itens.length; i += 3) linhas.push(itens.slice(i, i + 3))
  return linhas
}

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
          O flexGrow: 1 do contentContainer é o que sustenta os dois regimes: em tela alta ele
          garante ao menos a altura da viewport, e a folga vai toda para os três espaçadores
          iguais; em tela baixa o contêiner cresce até a altura do conteúdo e passa a rolar.
          O justifyContent: 'center' que o acompanha ficou inerte — os espaçadores absorvem a
          folga antes, e não sobra nada para ele distribuir —, mas continua ali porque é o
          padrão da LoginScreen (:83) e porque voltaria a valer se os espaçadores saíssem.
          O SafeAreaView segue por fora, então as bordas seguras não rolam junto. */}
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
          <Text style={estilos.logoTagline}>Conecta quem precisa a quem faz — da faxina à obra, com profissionais verificados.</Text>
        </View>

        <View style={estilos.espacador} />

        {/* Arte central */}
        <View style={estilos.artArea}>
          <TouchableOpacity
            style={{ width: '100%' }}
            onPress={() => navigation.navigate('Cadastro')}
            activeOpacity={0.8}
          >
            <Text style={estilos.vitrineTitulo}>Monetize seus talentos</Text>
            <View style={estilos.artCard}>
              <View style={estilos.artLinha}>
                <View style={[estilos.artBloco, { flex: 2, backgroundColor: cores.primariaSuave }]} />
                <View style={[estilos.artBloco, { flex: 1 }]} />
              </View>
              <View style={[estilos.artLinha, { marginTop: 6 }]}>
                <View style={[estilos.artBloco, { flex: 1 }]} />
                <View style={[estilos.artBloco, { flex: 1 }]} />
                <View style={[estilos.artBloco, { flex: 1, backgroundColor: cores.sucessoSuave }]} />
              </View>
              <View style={[estilos.artLinha, { marginTop: 6 }]}>
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
            </View>
          </TouchableOpacity>
        </View>

        <View style={estilos.espacador} />

        {/* Vitrine: o título e a grade são UM bloco — e agora UM alvo de toque. Seguem
            dentro do mesmo elemento para que os espaçadores os movam juntos: separá-los
            abriria um quarto vão, e a simetria é de três. */}
        {/* O comentário que ficava aqui dizia o OPOSTO do que este código faz agora —
            "<View>, e NÃO <TouchableOpacity>: nada aqui é tocável" —, com o argumento de
            que um chip com cara de botão que não responde ao toque é pior do que chip
            nenhum. O argumento continua certo; o que mudou foi a premissa. Não mexemos na
            aparência das pills, mexemos no destino: o bloco inteiro abre o Cadastro, o
            mesmo destino do artCard (:100) e do "Criar minha conta" logo abaixo. A cara de
            botão deixou de ser promessa falsa e virou verdade, então a regra que proibia o
            toque perdeu o objeto.
            UM alvo para o bloco todo, NUNCA um por pill: a vitrine é amostra do que a
            plataforma cobre, não um seletor. Doze alvos que caem todos no mesmo lugar
            prometeriam uma escolha por categoria que não existe do outro lado — tocar
            "Faxina" não filtra nada, e a decepção seria maior do que a de não poder tocar.
            Sem chevron, sem "ver todas", sem qualquer outra pista visual, e isso é
            deliberado: o convite explícito da tela é o botão primário, e dar seta ou
            rótulo a esta vitrine faria dela um segundo apelo competindo com ele. O
            activeOpacity é a ÚNICA resposta ao toque, o mesmo 0.8 do artCard — quem
            encostar descobre; quem não encostar não perde nada. */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Cadastro')}
          activeOpacity={0.8}
        >
          {/* Mesma pergunta de antes, agora respondida pelos próprios exemplos em vez de um
              parágrafo: a lista se lê num golpe de vista e o bloco encolhe. */}
          <Text style={estilos.vitrineTitulo}>Precisa de um profissional?</Text>
          {/* Uma <View> por linha de três, em vez de uma grade só com wrap: é o que deixa
              as pills usarem flex: 1 e consumirem a largura exata da linha (ver
              vitrineGrid). numberOfLines={1} segue pelo mesmo motivo de antes: em tela
              estreita o rótulo trunca e a linha mantém as três colunas, em vez de quebrar
              em duas linhas e desalinhar tudo. */}
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
        </TouchableOpacity>

        <View style={estilos.espacador} />

        {/* Ações. A simetria dos três vãos TERMINA no "Criar minha conta": daqui para baixo
            o espaçamento é o de sempre, com o "Entrar na plataforma" logo abaixo e os termos
            no rodapé, todos com as margens que já tinham. */}
        <View style={estilos.acoes}>
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
  // Sobrou só a centralização horizontal do card. TODA a distribuição vertical saiu daqui
  // e passou para os três espaçadores. O que havia antes competia com eles e por isso teve
  // de sair: o flex: 1 engolia a folga inteira antes que ela pudesse ser dividida em três,
  // e o par paddingTop 40 / paddingBottom 36 mais o justifyContent 'flex-end' fabricava
  // dois dos três vãos com números fixos e diferentes entre si. Foram duas tentativas de
  // acertar a proporção calibrando esses números à mão; o problema não era o valor, era o
  // método — número fixo não acompanha altura de tela.
  artArea: {
    alignItems: 'center',
  },
  // O maxWidth: 300 saiu. O width: '100%' já resolvia contra a área útil da tela (o
  // container tem paddingHorizontal: espacos.tela), então era só a trava de 300 que
  // segurava o card mais estreito que o "Criar minha conta" — as duas bordas do card
  // ficavam para dentro das do botão. Sem a trava, as quatro bordas coincidem.
  //
  // Com o card mais largo, as alturas de DENTRO baixaram junto, senão ele viraria uma
  // faixa alta demais para o que é: um enfeite com um número. Padding 20→16, blocos 14→12,
  // respiro entre as linhas do mock 8→6 (inline no JSX) e o rodapé do valor 16/12→12/10.
  // São 24 dp a menos de caixa — perto do que a quarta linha da vitrine passou a ocupar
  // logo abaixo, então o conjunto sai quase no mesmo lugar na vertical.
  artCard: {
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: 20,
    padding: 16,
    width: '100%',
  },
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
    marginTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: cores.bordaFraca,
    paddingTop: 10,
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
  // Os TRÊS vãos verticais da tela — logo→card, card→vitrine, vitrine→botão — são estes
  // espaçadores, e não padding de bloco nenhum. Mesmo flex e mesmo piso nos três: a folga
  // se divide em partes iguais em qualquer altura de tela, e é a IGUALDADE DO FLEX que
  // garante que continuem iguais quando a altura muda — não um número calibrado à mão,
  // que foi o método que falhou duas vezes.
  //
  // minHeight é o CHÃO: sem ele, numa tela baixa os três seriam espremidos a zero e a
  // vitrine encostaria no botão. espacos.lg (16) é o menor degrau da escala deste app
  // (4/8/12/16/20/28) que ainda se lê como separação deliberada e não como descuido de
  // alinhamento. Os três somam 48 dp de altura mínima — pouco o bastante para não empurrar
  // a dobra em aparelho médio, e o suficiente para que nenhum par de blocos se toque.
  espacador: {
    flex: 1,
    minHeight: espacos.lg,
  },
  vitrineTitulo: {
    fontSize: 13,
    fontWeight: '500',
    color: cores.textoForte,
    textAlign: 'center',
    marginBottom: 10,
  },
  // A grade era UMA linha com flexWrap e 31% de largura por pill. Três pills a 31% somam
  // 93%; com os dois gaps de 6 dp, sobrava perto de 7% da largura sem dono — 10,4 dp numa
  // tela de 360 (área útil 320). Como a linha alinha à esquerda, essa sobra ia TODA para a
  // direita: a primeira coluna encostava certinho na borda esquerda do botão primário e a
  // terceira parava antes da direita. Desalinhamento de uma borda só, na margem que mais
  // se compara, porque o botão logo abaixo mostra onde a direita deveria estar.
  //
  // Mecanismo novo: uma <View> por linha (vitrineLinha) e flex: 1 nas pills. Cada linha
  // ocupa a largura inteira do container; os dois gaps de 6 dp são descontados primeiro e
  // o que resta se divide em três partes iguais. Largura exata, sem porcentagem para
  // arredondar e sem sobra para acumular em ponta nenhuma — a primeira pill começa na
  // borda esquerda e a terceira termina na direita, as duas do botão.
  //
  // Vale para QUALQUER número de linhas, as quatro de hoje ou mais, porque a conta é feita
  // por linha e não pela grade inteira. Foi preferido a justifyContent: 'space-between',
  // que acertaria as bordas mas espalharia uma última linha incompleta de ponta a ponta, e
  // a medir a largura com onLayout, que custaria estado e um render a mais numa tela que
  // não precisa de nenhum dos dois.
  vitrineGrid: {
    // Agora é o respiro VERTICAL, entre as quatro linhas. O marginBottom: 20 que ficava
    // aqui saiu: ele era o terceiro vão (grade → botão) escrito como número fixo, e esse
    // vão é o terceiro espaçador — deixá-lo somaria por cima e quebraria a igualdade.
    gap: 6,
  },
  // O respiro HORIZONTAL entre as três pills da linha, o mesmo 6 dp de antes. É este gap
  // que sai da conta ANTES do flex: 1, e por isso a soma fecha exata na largura útil.
  vitrineLinha: {
    flexDirection: 'row',
    gap: 6,
  },
  // Espelha o estado NÃO-selecionado da categoriaPill do CadastrarReparoScreen (mesmo
  // fundo, mesma borda de 0.5, mesma cor de texto), em escala menor: 10 em vez de 12 no
  // rótulo, 5/4 de padding em vez de 7/12, raio 13 em vez dos 24 do raios.pill. Não há
  // estado ativo — nada aqui seleciona nada, e a pill não é alvo de toque por si: quem
  // responde ao dedo é o bloco inteiro, um nível acima.
  //
  // flex: 1 no lugar de width: '31%' — é aqui que a largura exata acontece. Ver vitrineGrid.
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
