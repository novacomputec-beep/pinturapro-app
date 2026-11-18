import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, useWindowDimensions } from 'react-native'
import { Feather } from '@expo/vector-icons'
import BotaoVoltar from '../../components/BotaoVoltar'
import { LinearGradient } from 'expo-linear-gradient'
import { cores, espacos, raios, larguraMaxima } from '../../utils/tema'

// Passo 0 do cadastro (escolha de perfil), em 3 telas: o caminho ("O que você quer fazer
// hoje?"), "Quero trabalhar" e "Quero contratar". Só apresentação: quem escolhe o tipo,
// troca o lado e volta é o CadastroScreen, que continua dono do estado.
//
// Cores da escolha de perfil: laranja = trabalhar, azul = contratar.
export const COR_TRABALHAR = '#F0822E'
export const COR_CONTRATAR = '#6AA6F0'

// Tons locais do mockup (escolha-redesign-v2): fundo e borda dos cards, cinzas de texto.
// cores.textoFraco (#444) some sobre o card escuro — por isso os cinzas próprios.
const FUNDO_CARD = '#131317'
const FUNDO_CHIP = '#1F1F25'
const BORDA_CHIP = '#33333B'
const TEXTO_DESC = '#C9C6BF'
const TEXTO_SUB = '#8E8E96'

// Mistura opaca de `cor` sobre `fundo` (t = quanto da cor entra). Para os stops do
// gradiente dos cards serem todos opacos: stops com alfa interpolam o alfa junto e
// deixam uma faixa translúcida no meio.
const misturar = (cor, fundo, t) => {
  const c = parseInt(cor.slice(1, 7), 16), f = parseInt(fundo.slice(1, 7), 16)
  const canal = (d) => Math.round(((c >> d) & 255) * t + ((f >> d) & 255) * (1 - t))
  return '#' + [16, 8, 0].map(d => canal(d).toString(16).padStart(2, '0')).join('')
}

// Brilho radial: UM png branco com alfa radial (glow.png, 256px), tingido por tintColor
// na cor de cada lado. LinearGradient é linear e não faz um halo redondo; o png faz.
const GLOW = require('../../../assets/escolha/glow.png')

// Exportado: o "Entrar como:" (EntrarComoScreen) usa as mesmas ilustrações por tipo.
export const IMG = {
  escolhaTrabalhar:  require('../../../assets/escolha/escolha-trabalhar.png'),
  escolhaContratar:  require('../../../assets/escolha/escolha-contratar.png'),
  trabalharServicos: require('../../../assets/escolha/trabalhar-servicos.png'),
  trabalharObras:    require('../../../assets/escolha/trabalhar-obras.png'),
  contratarServico:  require('../../../assets/escolha/contratar-servico.png'),
  contratarObra:     require('../../../assets/escolha/contratar-obra.png'),
}

// FOTOS dos 4 cards do cadastro (660x510, 3x de 220x170), no lugar da ilustração: as duas da
// 1ª tela ("Quero trabalhar" / "Quero contratar") e as duas das abas. O "Entrar como:" e o
// "Meus perfis" seguem com a ilustração (IMG acima) — os cards deles são menores.
const FOTO = {
  queroTrabalhar:    require('../../../assets/cards/card-quero-trabalhar.jpg'),
  queroContratar:    require('../../../assets/cards/card-quero-contratar.jpg'),
  trabalharServicos: require('../../../assets/cards/card-trabalhar-servicos.jpg'),
  contratarServicos: require('../../../assets/cards/card-contratar-servicos.jpg'),
}
// Medidas do bloco da foto NA ARTE aprovada, cuja tela tem 610 px de largura: retângulo
// deitado de 200x118, raio 18. O app desenha na mesma PROPORÇÃO da largura da janela
// (200/610 dela): num celular de 360 dp isso dá ~118x70 e sobra a coluna do rótulo + título
// e a seta na mesma linha, como na arte. De 610 dp de largura para cima vale o 200x118 cheio.
const ARTE_LARGURA = 610
const FOTO_ARTE = { largura: 200, altura: 118, raio: 18 }

// Card ÚNICO do lado contratante (Fase 1, Arte-Fase1-Contratar): quem contrata vê um lado só
// — serviços e obras são pedidos da mesma conta. Rótulo, título e ilustração são os mesmos no
// cadastro, no "Entrar como:" e no "Meus perfis".
const CONTRATAR = { rotulo: 'CONTRATAR', titulo: 'Serviços, obras e reformas', imagem: IMG.escolhaContratar }

// Card ÚNICO do lado de trabalho (Fase 2, Arte-Fase2-Trabalhar), pelo mesmo motivo: quem
// trabalha marca nas especialidades o que faz — serviços e/ou obras — e recebe os dois no
// mesmo feed.
const TRABALHAR = { rotulo: 'TRABALHAR', titulo: 'Serviços e obras', imagem: IMG.escolhaTrabalhar }

// Tipos de conta por lado: UM card em cada. Trabalhar cadastra a conta 'prestador' (a de
// serviços, que também pode marcar especialidades de obra — o preço exibido é o dela);
// contratar cadastra a conta dono_reparo (a mesma que publica serviço E obra).
// Sem `preco` = dono (Gratuito).
const OPCOES = {
  trabalhar: [
    { tipo: 'prestador', ...TRABALHAR, foto: FOTO.trabalharServicos, desc: 'Do conserto à obra: você marca o que faz e recebe só os pedidos da sua área.', chips: ['Elétrica', 'Faxina', 'Manicure', 'Pedreiro', 'Pintor', '+50'], preco: 'R$ 49,90/mês' },
  ],
  contratar: [
    { tipo: 'dono_reparo', ...CONTRATAR, foto: FOTO.contratarServicos, desc: 'Do conserto à reforma: publique o pedido e receba propostas para comparar.', chips: ['Encanador', 'Faxina', 'Manicure', 'Pintura', 'Reforma'] },
  ],
}

const LADOS = {
  trabalhar: { cor: COR_TRABALHAR, rotulo: 'QUERO TRABALHAR', titulo: 'Trabalhe pelo app',      subtitulo: 'Você recebe só os pedidos da sua área' },
  contratar: { cor: COR_CONTRATAR, rotulo: 'QUERO CONTRATAR', titulo: 'O que você precisa?',    subtitulo: 'Profissionais da sua região respondem no app' },
}

// Card por tipo de conta EXISTENTE, para o "Entrar como:" e o "Meus perfis": a chave é o
// tipo como a API devolve em `contas` e em tipoDaConta (utils/contas) — 'reparador', e não
// o 'prestador' do cadastro acima. Mesma ilustração, rótulo, título e cor do lado.
// As duas contas de cada lado têm o MESMO card (CONTRATAR / TRABALHAR): as telas mostram só
// uma delas (utils/contas.contaContratar / contaTrabalhar), e as chaves ficam todas para o
// tipo resolver de qualquer jeito.
export const CARTOES_TIPO = {
  reparador:   { lado: 'trabalhar', cor: COR_TRABALHAR, ...TRABALHAR },
  pintor:      { lado: 'trabalhar', cor: COR_TRABALHAR, ...TRABALHAR },
  dono_reparo: { lado: 'contratar', cor: COR_CONTRATAR, ...CONTRATAR },
  dono_obra:   { lado: 'contratar', cor: COR_CONTRATAR, ...CONTRATAR },
}
export const ROTULO_LADO = { trabalhar: LADOS.trabalhar.rotulo, contratar: LADOS.contratar.rotulo }

export const Chip = ({ texto, verde }) => (
  <View style={[s.chip, verde && s.chipVerde]}>
    <Text style={[s.chipTexto, verde && s.chipTextoVerde]} maxFontSizeMultiplier={1.6}>{texto}</Text>
  </View>
)

// O botão de voltar é o compartilhado do app (components/BotaoVoltar). Reexportado daqui
// porque o "Entrar como:" (EntrarComoScreen) o importa junto das outras peças desta tela.
export { BotaoVoltar }

// Fundo da tela: dois halos nos cantos (cores do mockup), atrás do conteúdo e sem toque.
// Tamanho fixo em px e não em % — a tela rola, e o halo tem que ficar preso ao canto.
export const FundoBrilhos = ({ corTopo, corBaixo }) => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <Image source={GLOW} style={[s.brilhoTopo, { tintColor: corTopo }]} resizeMode="stretch" />
    <Image source={GLOW} style={[s.brilhoBaixo, { tintColor: corBaixo }]} resizeMode="stretch" />
  </View>
)

// Imagem do card com um halo da cor do lado por trás. O halo é 1.5x a imagem, centrado;
// o card recorta (overflow hidden) o pouco que passa da borda esquerda, e isso é
// intencional: o brilho morre antes de chegar lá. Sem `imagem` (tipo de conta que esta
// versão do app não conhece, no "Entrar como:"), entra um emoji no lugar.
const ImagemComBrilho = ({ imagem, icone, tamanho, cor }) => (
  <View style={{ width: tamanho, height: tamanho, alignItems: 'center', justifyContent: 'center' }}>
    <Image source={GLOW} style={{ position: 'absolute', width: tamanho * 1.5, height: tamanho * 1.5, tintColor: cor, opacity: 0.55 }} resizeMode="stretch" />
    {imagem
      ? <Image source={imagem} style={{ width: tamanho, height: tamanho }} resizeMode="contain" />
      : <Text style={{ fontSize: Math.round(tamanho * 0.5) }}>{icone}</Text>}
  </View>
)

// Foto do card: cantos arredondados com recorte (overflow hidden, cover) e uma sombra leve.
// A sombra fica na View de FORA — a de dentro recorta, e sombra recortada não aparece no iOS.
// `selo` (opcional) é a pílula verde DENTRO da foto, no canto inferior esquerdo:
// { texto: 'Gratuito', precoRiscado?: 'R$ 49,90' } — o preço riscado vem antes do texto, na
// mesma pílula. Ela nunca passa da largura da foto: o texto encolhe até caber numa linha.
const FotoCard = ({ fonte, selo }) => {
  const { width } = useWindowDimensions()
  const escala = Math.min(width, ARTE_LARGURA) / ARTE_LARGURA
  const largura = Math.round(FOTO_ARTE.largura * escala)
  const altura = Math.round(FOTO_ARTE.altura * escala)
  const raio = Math.round(FOTO_ARTE.raio * escala)
  return (
    <View style={[s.fotoSombra, { width: largura, height: altura, borderRadius: raio }]}>
      <View style={{ flex: 1, borderRadius: raio, overflow: 'hidden' }}>
        <Image source={fonte} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        {!!selo && (
          <View style={s.fotoSelo}>
            <Text style={s.fotoSeloTexto} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2}>
              {!!selo.precoRiscado && <Text style={s.fotoSeloRiscado}>{selo.precoRiscado}</Text>}
              {selo.precoRiscado ? '  ' : ''}{selo.texto}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

// `foto` (opcional) troca a ilustração pela foto, NO MESMO LUGAR (à esquerda da linha):
// rótulo + título seguem à direita dela e a seta no fim da linha. Como a foto é mais larga
// que a ilustração, a coluna dos títulos estreita: o rótulo encolhe até caber em uma linha e
// o título em até duas.
// Card de escolha: imagem à esquerda, rótulo pequeno + título, seta à direita; abaixo,
// descrição, chips e o rodapé (preço/gratuito). Tudo quebra linha — nada de altura fixa,
// para fonte grande do sistema e tela estreita não cortarem texto.
// O fundo é um gradiente diagonal: canto superior esquerdo com um toque da cor do lado,
// escurecendo até o canto oposto. A borda e o raio ficam no Touchable, que recorta o
// gradiente; o gradiente só carrega o padding.
// `desc`, `chips` e `rodape` são opcionais (o "Entrar como:" e o "Meus perfis" usam só
// imagem, rótulo e título); `tamanhoRotulo` deixa o rótulo maior que o 11 do cadastro;
// `etiqueta` é a tag verde ao lado do rótulo ("ÚLTIMO USADO") e `etiquetaAbaixo` a tag
// numa linha própria sob o título ("EM USO"); `rotulo` pode ser texto ou nós de Text (o
// "Meus perfis" pinta a área de branco e a ação na cor); `corBorda` troca só a borda (verde
// no perfil em uso); `carregando` troca a seta por um spinner; `iconeSeta`/`corSeta` trocam
// a seta (＋ para adicionar, ✓ em uso).
export const CartaoEscolha = ({
  cor, corBorda, imagem, icone, tamanhoImagem = 80, rotulo, titulo, desc, chips, rodape, onPress, tamanhoTitulo = 18,
  tamanhoRotulo = 11, etiqueta, etiquetaAbaixo, disabled, carregando, iconeSeta = 'arrow-right', corSeta, accessibilityLabel,
  foto, selo,
}) => {
  const comFoto = !!foto
  const titulos = (
    <>
      <View style={s.cardRotuloLinha}>
        <Text
          style={[s.cardRotulo, { color: cor, fontSize: tamanhoRotulo }, comFoto && { flexShrink: 1 }]}
          maxFontSizeMultiplier={1.5}
          {...(comFoto ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.75 } : {})}
        >{rotulo}</Text>
        {!!etiqueta && <Chip texto={etiqueta} verde />}
      </View>
      <Text
        style={[s.cardTitulo, { fontSize: tamanhoTitulo, lineHeight: Math.round(tamanhoTitulo * 1.2) }]}
        {...(comFoto ? { numberOfLines: 2, adjustsFontSizeToFit: true, minimumFontScale: 0.75 } : {})}
      >{titulo}</Text>
      {!!etiquetaAbaixo && <View style={s.cardEtiquetaAbaixo}><Chip texto={etiquetaAbaixo} verde /></View>}
    </>
  )
  const seta = (
    <View style={[s.seta, { borderColor: (corSeta || cor) + 'AA', backgroundColor: (corSeta || cor) + '22' }]}>
      {carregando ? <ActivityIndicator color={corSeta || cor} /> : <Feather name={iconeSeta} size={18} color={corSeta || cor} />}
    </View>
  )
  const semMiolo = !desc && !chips?.length && !rodape
  return (
  <TouchableOpacity
    style={[s.card, { borderColor: (corBorda || cor) + '99' }]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel || `${rotulo}: ${titulo}`}
  >
    <LinearGradient
      colors={[misturar(cor, '#1C1C22', 0.16), '#141418', '#0E0E11']}
      locations={[0, 0.55, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.cardMiolo}
    >
    <View style={[s.cardTopo, semMiolo && { marginBottom: 0 }]}>
      {foto
        ? <FotoCard fonte={foto} selo={selo} />
        : <ImagemComBrilho imagem={imagem} icone={icone} tamanho={tamanhoImagem} cor={cor} />}
      <View style={s.cardTitulos}>{titulos}</View>
      {seta}
    </View>
    {!!desc && <Text style={s.cardDesc}>{desc}</Text>}
    {!!chips?.length && (
      <View style={s.chips}>
        {chips.map(c => <Chip key={c} texto={c} />)}
      </View>
    )}
    {rodape}
    </LinearGradient>
  </TouchableOpacity>
  )
}

// Preço do card de prestador. Nunca no iOS (3.1.1). Na janela de lançamento ele vai RISCADO
// dentro da pílula da foto, antes do "Gratuito" (seloPreco) e o card não tem linha de preço;
// fora da janela a assinatura é cobrada de verdade, e o preço cheio segue numa linha própria
// no rodapé (RodapePreco), sem pílula.
const seloPreco = ({ preco, mostrarCobranca, lancamentoGratis }) => (
  mostrarCobranca && lancamentoGratis ? { texto: 'Gratuito', precoRiscado: preco.replace('/mês', '') } : null
)
const RodapePreco = ({ preco, mostrarCobranca, lancamentoGratis }) => (
  mostrarCobranca && !lancamentoGratis ? <Text style={s.preco} maxFontSizeMultiplier={1.6}>{preco}</Text> : null
)

// Caixa tracejada do rodapé (ícone azul num círculo, título e texto). Exportada: o
// "Entrar como:" usa a mesma para "Dá para trocar depois".
export const CaixaAviso = ({ icone, titulo, children, estilo }) => (
  <View style={[s.avisoCadastros, estilo]}>
    <View style={s.avisoIcone}>
      <Feather name={icone} size={18} color={COR_CONTRATAR} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={s.avisoTitulo}>{titulo}</Text>
      <Text style={s.avisoTexto}>{children}</Text>
    </View>
  </View>
)

export default function EscolhaPerfil({ lado, setLado, onEscolher, onVoltar, paddingTop, mostrarCobranca, lancamentoGratis }) {
  if (!lado) {
    // Tela 1: logo circular de 119 centrado (já traz o nome "ProTudo" — sem wordmark em
    // texto), título numa linha só e os cards. Para caber sem rolar num celular comum
    // (~360x780dp) o botão de voltar fica SOBRE o bloco do logo, à esquerda, em vez de
    // ocupar uma linha própria e os respiros entre blocos são curtos; cada card traz a foto
    // à esquerda (FotoCard, na proporção da arte); o conteúdo
    // centra na vertical quando sobra espaço. O ScrollView fica só como rede para tela muito
    // pequena, barra de navegação de 3 botões ou fonte grande do sistema — aí rola,
    // nunca corta.
    return (
      <View style={s.tela}>
      <FundoBrilhos corTopo={COR_TRABALHAR} corBaixo={COR_CONTRATAR} />
      <ScrollView contentContainerStyle={[s.scroll, s.scrollTela1, larguraMaxima, { paddingTop }]} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
        <View style={s.topo}>
          <BotaoVoltar onPress={onVoltar} estilo={s.btnVoltarTopo} />
          <View style={s.logoWrap}>
            <Image source={require('../../../assets/logo-3d.png')} style={s.logo} resizeMode="contain" accessibilityLabel="ProTudo" />
          </View>
        </View>

        <Text style={s.tituloCentro} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>O que você quer fazer hoje?</Text>
        <Text style={s.subtituloCentro}>Escolha um caminho — dá para trocar depois</Text>

        <CartaoEscolha
          cor={COR_TRABALHAR}
          foto={FOTO.queroTrabalhar}
          tamanhoTitulo={20}
          rotulo="SOU PROFISSIONAL"
          titulo="Quero trabalhar"
          desc="Receba pedidos de clientes perto de você, direto no celular."
          chips={['Serviços', 'Obras', 'Na sua região']}
          // Mesma condição do "Gratuito" dos preços: nunca no iOS (3.1.1), só na janela de lançamento.
          selo={mostrarCobranca && lancamentoGratis ? { texto: 'Gratuito' } : null}
          onPress={() => setLado('trabalhar')}
        />

        <CartaoEscolha
          cor={COR_CONTRATAR}
          foto={FOTO.queroContratar}
          tamanhoTitulo={20}
          rotulo="PRECISO DE ALGUÉM"
          titulo="Quero contratar"
          desc="Publique o que precisa e receba propostas de profissionais da região."
          chips={['Serviços', 'Obras', 'Reformas']}
          selo={{ texto: 'Sempre gratuito' }}
          onPress={() => setLado('contratar')}
        />

        <CaixaAviso icone="users" titulo="Mais de um cadastro por pessoa">
          Com o <Text style={s.avisoDestaque}>mesmo e-mail, CPF e senha</Text>: para contratar e para trabalhar, com serviços e com obras.
        </CaixaAviso>
      </ScrollView>
      </View>
    )
  }

  const atual = LADOS[lado]
  // Toggle em ordem FIXA (Trabalhar à esquerda, Contratar à direita): só o destaque muda.
  const ordem = ['trabalhar', 'contratar']

  return (
    <View style={s.tela}>
    <FundoBrilhos corTopo={atual.cor} corBaixo={lado === 'trabalhar' ? COR_CONTRATAR : COR_TRABALHAR} />
    <ScrollView contentContainerStyle={[s.scroll, larguraMaxima, { paddingTop }]} showsVerticalScrollIndicator={false}>
      <View style={s.cabecalho}>
        <BotaoVoltar onPress={onVoltar} estilo={s.btnVoltarCabecalho} />
        <Image source={require('../../../assets/logo-3d.png')} style={s.logo} resizeMode="contain" accessibilityLabel="ProTudo" />
      </View>

      <View style={s.toggle} accessibilityRole="tablist">
        {ordem.map(l => {
          const ativo = l === lado
          return (
            <TouchableOpacity
              key={l}
              style={[s.toggleSeg, ativo && { backgroundColor: LADOS[l].cor }]}
              onPress={() => setLado(l)}
              disabled={ativo}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: ativo }}
            >
              <Text style={[s.toggleTexto, ativo && s.toggleTextoAtivo]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {LADOS[l].rotulo}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <Text style={s.titulo}>{atual.titulo}</Text>
      <Text style={s.subtitulo}>{atual.subtitulo}</Text>

      {OPCOES[lado].map(op => (
        <CartaoEscolha
          key={op.tipo}
          cor={atual.cor}
          imagem={op.imagem}
          foto={op.foto}
          rotulo={op.rotulo}
          titulo={op.titulo}
          desc={op.desc}
          chips={op.chips}
          selo={op.preco
            ? seloPreco({ preco: op.preco, mostrarCobranca, lancamentoGratis })
            : { texto: 'Gratuito' }}
          rodape={op.preco ? RodapePreco({ preco: op.preco, mostrarCobranca, lancamentoGratis }) : null}
          onPress={() => onEscolher(op.tipo)}
        />
      ))}
    </ScrollView>
    </View>
  )
}

// Exportado como `estilosEscolha`: o "Entrar como:" monta o topo (tela, scroll, logo,
// título centrado) com ESTES estilos, em vez de copiar os valores.
export const estilosEscolha = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo, overflow: 'hidden' },
  // Halos de canto: metade para fora da tela, opacidade baixa (o png é branco cheio no centro).
  brilhoTopo:  { position: 'absolute', width: 460, height: 460, top: -200, left: -200, opacity: 0.32 },
  brilhoBaixo: { position: 'absolute', width: 460, height: 460, bottom: -220, right: -200, opacity: 0.26 },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 },
  // Tela 1: rodapé curto e conteúdo centrado na vertical quando sobra espaço (o flexGrow
  // do `scroll` garante a altura mínima da tela; passando dela, rola como sempre).
  scrollTela1: { paddingBottom: 12, justifyContent: 'center' },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 10 },
  // Tela 1: o voltar (74 de largura) fica sobre o canto esquerdo do bloco do logo. O logo
  // tem 140, centrado: numa tela de 360 dp o disco começa depois do botão.
  topo: { marginTop: 0 },
  btnVoltarTopo: { position: 'absolute', left: 0, top: 0, marginTop: 0, marginBottom: 0, zIndex: 1 },
  // Logo circular (assets/logo-3d.png, já com o nome), centrado. 140 no cadastro — o
  // "Entrar como:" usa estes estilos de topo com o próprio tamanho (165).
  logoWrap: { alignItems: 'center', marginBottom: 4 },
  logo: { width: 119, height: 119 },
  tituloCentro: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, textAlign: 'center', marginBottom: 2 },
  subtituloCentro: { fontSize: 13, lineHeight: 18, color: TEXTO_SUB, textAlign: 'center', marginBottom: 12 },
  // Telas 2/3: voltar à esquerda e o logo de 119 centrado na mesma linha — a linha tem a
  // altura do logo e o conteúdo desce. O botão fica absoluto (centrado na vertical) para o
  // logo centrar na tela, e não no espaço que sobra.
  cabecalho: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 4, marginBottom: 12 },
  btnVoltarCabecalho: { position: 'absolute', left: 0, marginTop: 0, marginBottom: 0, zIndex: 1 },
  toggle: { flexDirection: 'row', backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: 999, padding: 4, marginBottom: 18 },
  toggleSeg: { flex: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  toggleTexto: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, color: TEXTO_SUB, textAlign: 'center' },
  toggleTextoAtivo: { color: '#0A0A0A' },
  titulo: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, marginBottom: 4 },
  subtitulo: { fontSize: 13, lineHeight: 18, color: TEXTO_SUB, marginBottom: 16 },
  card: { backgroundColor: FUNDO_CARD, borderWidth: 1.5, borderRadius: raios.grande, overflow: 'hidden', marginBottom: 16 },
  cardMiolo: { padding: 14 },
  cardTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardTitulos: { flex: 1 },
  // Sombra leve da foto. O fundo é obrigatório para a elevation do Android desenhar.
  fotoSombra: { flexShrink: 0, backgroundColor: '#0E0E11', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  cardRotuloLinha: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
  cardRotulo: { fontWeight: '800', letterSpacing: 1.2 },
  cardTitulo: { fontWeight: '700', color: cores.textoForte, letterSpacing: -0.3 },
  cardEtiquetaAbaixo: { flexDirection: 'row', marginTop: 6 },
  seta: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardDesc: { fontSize: 14, lineHeight: 20, color: TEXTO_DESC, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: FUNDO_CHIP, borderWidth: 1, borderColor: BORDA_CHIP, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 5 },
  chipTexto: { fontSize: 12, fontWeight: '600', color: TEXTO_DESC },
  chipVerde: { backgroundColor: cores.sucesso + '33', borderColor: cores.sucesso + '99' },
  chipTextoVerde: { color: cores.sucesso, fontWeight: '700' },
  preco: { fontSize: 12, fontWeight: '600', color: cores.primaria, marginTop: 10 },
  // Pílula dentro da foto, canto inferior esquerdo: fundo verde-escuro translúcido, borda e
  // texto verdes. maxWidth é o teto — o texto encolhe antes de a pílula sair da foto.
  fotoSelo: { position: 'absolute', left: 6, bottom: 6, maxWidth: '92%', backgroundColor: 'rgba(8,38,20,0.82)', borderWidth: 1, borderColor: cores.sucesso, borderRadius: raios.pill, paddingHorizontal: 7, paddingVertical: 2 },
  fotoSeloTexto: { fontSize: 10, fontWeight: '700', color: cores.sucesso },
  fotoSeloRiscado: { fontWeight: '600', color: '#C9D1D9', textDecorationLine: 'line-through' },
  avisoCadastros: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#141417', borderWidth: 1, borderColor: '#2E2E34', borderStyle: 'dashed', borderRadius: raios.grande, padding: 14, marginTop: 0 },
  avisoIcone: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: COR_CONTRATAR + '99', backgroundColor: COR_CONTRATAR + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avisoTitulo: { fontSize: 14, fontWeight: '700', color: cores.branco, marginBottom: 2 },
  avisoTexto: { fontSize: 12, lineHeight: 17, color: cores.textoMedio },
  avisoDestaque: { color: cores.primaria },
})
const s = estilosEscolha
