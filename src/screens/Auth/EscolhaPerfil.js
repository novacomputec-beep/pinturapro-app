import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native'
import { Feather } from '@expo/vector-icons'
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

const IMG = {
  escolhaTrabalhar:  require('../../../assets/escolha/escolha-trabalhar.png'),
  escolhaContratar:  require('../../../assets/escolha/escolha-contratar.png'),
  trabalharServicos: require('../../../assets/escolha/trabalhar-servicos.png'),
  trabalharObras:    require('../../../assets/escolha/trabalhar-obras.png'),
  contratarServico:  require('../../../assets/escolha/contratar-servico.png'),
  contratarObra:     require('../../../assets/escolha/contratar-obra.png'),
}

// Tipos de conta por lado — os MESMOS de sempre (prestador/pintor/dono_reparo/dono_obra);
// sem `preco` = dono (Gratuito). Serviço primeiro, como antes.
const OPCOES = {
  trabalhar: [
    { tipo: 'prestador', imagem: IMG.trabalharServicos, rotulo: 'SERVIÇOS', titulo: 'Gerais e domésticos', desc: 'Do conserto à beleza: pedidos rápidos do dia a dia.', chips: ['Manicure', 'Elétrica', 'Aula particular', 'Faxina', '+40'], preco: 'R$ 49,90/mês' },
    { tipo: 'pintor',    imagem: IMG.trabalharObras,    rotulo: 'OBRAS',    titulo: 'Construção e pintura',  desc: 'Obras, reformas e pinturas com propostas maiores.',   chips: ['Pedreiro', 'Pintor', 'Construtor', 'Engenheiro'],       preco: 'R$ 99,90/mês' },
  ],
  contratar: [
    { tipo: 'dono_reparo', imagem: IMG.contratarServico, rotulo: 'SERVIÇO', titulo: 'Um serviço doméstico',    desc: 'Conserto, montagem, aula, beleza e muito mais.',       chips: ['Encanador', 'Eletricista', 'Manicure', 'Faxina'] },
    { tipo: 'dono_obra',   imagem: IMG.contratarObra,    rotulo: 'OBRA',    titulo: 'Obra, reforma ou pintura', desc: 'Cadastre a obra e receba propostas para comparar.', chips: ['Reforma', 'Construção', 'Pintura'] },
  ],
}

const LADOS = {
  trabalhar: { cor: COR_TRABALHAR, rotulo: 'QUERO TRABALHAR', titulo: 'Em que você trabalha?',  subtitulo: 'Você recebe só os pedidos da sua área' },
  contratar: { cor: COR_CONTRATAR, rotulo: 'QUERO CONTRATAR', titulo: 'O que você precisa?',    subtitulo: 'Profissionais da sua região respondem no app' },
}

const Chip = ({ texto, verde }) => (
  <View style={[s.chip, verde && s.chipVerde]}>
    <Text style={[s.chipTexto, verde && s.chipTextoVerde]} maxFontSizeMultiplier={1.6}>{texto}</Text>
  </View>
)

const Wordmark = ({ tamanho }) => (
  <Text style={[s.wordmark, { fontSize: tamanho }]} maxFontSizeMultiplier={1.3}>
    <Text style={{ color: cores.marcaAzul }}>P</Text>ro<Text style={{ color: cores.primaria }}>T</Text>udo
  </Text>
)

const BotaoVoltar = ({ onPress, estilo }) => (
  <TouchableOpacity style={[s.btnVoltar, estilo]} onPress={onPress} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
    <Feather name="arrow-left" size={20} color={cores.textoForte} />
  </TouchableOpacity>
)

// Fundo da tela: dois halos nos cantos (cores do mockup), atrás do conteúdo e sem toque.
// Tamanho fixo em px e não em % — a tela rola, e o halo tem que ficar preso ao canto.
const FundoBrilhos = ({ corTopo, corBaixo }) => (
  <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <Image source={GLOW} style={[s.brilhoTopo, { tintColor: corTopo }]} resizeMode="stretch" />
    <Image source={GLOW} style={[s.brilhoBaixo, { tintColor: corBaixo }]} resizeMode="stretch" />
  </View>
)

// Imagem do card com um halo da cor do lado por trás. O halo é 1.5x a imagem, centrado;
// o card recorta (overflow hidden) o pouco que passa da borda esquerda, e isso é
// intencional: o brilho morre antes de chegar lá.
const ImagemComBrilho = ({ imagem, tamanho, cor }) => (
  <View style={{ width: tamanho, height: tamanho, alignItems: 'center', justifyContent: 'center' }}>
    <Image source={GLOW} style={{ position: 'absolute', width: tamanho * 1.5, height: tamanho * 1.5, tintColor: cor, opacity: 0.55 }} resizeMode="stretch" />
    <Image source={imagem} style={{ width: tamanho, height: tamanho }} resizeMode="contain" />
  </View>
)

// Card de escolha: imagem à esquerda, rótulo pequeno + título, seta à direita; abaixo,
// descrição, chips e o rodapé (preço/gratuito). Tudo quebra linha — nada de altura fixa,
// para fonte grande do sistema e tela estreita não cortarem texto.
// O fundo é um gradiente diagonal: canto superior esquerdo com um toque da cor do lado,
// escurecendo até o canto oposto. A borda e o raio ficam no Touchable, que recorta o
// gradiente; o gradiente só carrega o padding.
const CartaoEscolha = ({ cor, imagem, tamanhoImagem = 80, rotulo, titulo, desc, chips, rodape, onPress, tamanhoTitulo = 18 }) => (
  <TouchableOpacity
    style={[s.card, { borderColor: cor + '99' }]}
    onPress={onPress}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel={`${rotulo}: ${titulo}`}
  >
    <LinearGradient
      colors={[misturar(cor, '#1C1C22', 0.16), '#141418', '#0E0E11']}
      locations={[0, 0.55, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.cardMiolo}
    >
    <View style={s.cardTopo}>
      <ImagemComBrilho imagem={imagem} tamanho={tamanhoImagem} cor={cor} />
      <View style={s.cardTitulos}>
        <Text style={[s.cardRotulo, { color: cor }]} maxFontSizeMultiplier={1.5}>{rotulo}</Text>
        <Text style={[s.cardTitulo, { fontSize: tamanhoTitulo, lineHeight: Math.round(tamanhoTitulo * 1.2) }]}>{titulo}</Text>
      </View>
      <View style={[s.seta, { borderColor: cor + 'AA', backgroundColor: cor + '22' }]}>
        <Feather name="arrow-right" size={18} color={cor} />
      </View>
    </View>
    <Text style={s.cardDesc}>{desc}</Text>
    <View style={s.chips}>
      {chips.map(c => <Chip key={c} texto={c} />)}
    </View>
    {rodape}
    </LinearGradient>
  </TouchableOpacity>
)

// Rodapé dos cards de prestador: preço de assinatura, nunca no iOS (3.1.1), nem riscado;
// na janela de lançamento, riscado + "Grátis".
const RodapePreco = ({ preco, mostrarCobranca, lancamentoGratis }) => {
  if (!mostrarCobranca) return null
  if (!lancamentoGratis) return <Text style={s.preco} maxFontSizeMultiplier={1.6}>{preco}</Text>
  return (
    <View style={s.rodapeLinha}>
      <Text style={s.precoRiscado} maxFontSizeMultiplier={1.6}>{preco}</Text>
      <Chip texto="Grátis" verde />
    </View>
  )
}

export default function EscolhaPerfil({ lado, setLado, onEscolher, onVoltar, paddingTop, mostrarCobranca, lancamentoGratis }) {
  if (!lado) {
    return (
      <View style={s.tela}>
      <FundoBrilhos corTopo={COR_TRABALHAR} corBaixo={COR_CONTRATAR} />
      <ScrollView contentContainerStyle={[s.scroll, larguraMaxima, { paddingTop }]} showsVerticalScrollIndicator={false}>
        <BotaoVoltar onPress={onVoltar} />
        <View style={s.logoWrap}>
          <Image source={require('../../../assets/logo.png')} style={s.logo} resizeMode="contain" />
          <Wordmark tamanho={26} />
        </View>

        <Text style={s.tituloCentro}>O que você quer{'\n'}fazer hoje?</Text>
        <Text style={s.subtituloCentro}>Escolha um caminho — dá para trocar depois</Text>

        <CartaoEscolha
          cor={COR_TRABALHAR}
          imagem={IMG.escolhaTrabalhar}
          tamanhoImagem={88}
          tamanhoTitulo={20}
          rotulo="SOU PROFISSIONAL"
          titulo="Quero trabalhar"
          desc="Receba pedidos de clientes perto de você, direto no celular."
          chips={['Serviços', 'Obras', 'Na sua região']}
          // Mesma condição do "Grátis" dos preços: nunca no iOS (3.1.1), só na janela de lançamento.
          rodape={mostrarCobranca && lancamentoGratis ? <View style={s.rodapeLinha}><Chip texto="Gratuito" verde /></View> : null}
          onPress={() => setLado('trabalhar')}
        />

        <CartaoEscolha
          cor={COR_CONTRATAR}
          imagem={IMG.escolhaContratar}
          tamanhoImagem={88}
          tamanhoTitulo={20}
          rotulo="PRECISO DE ALGUÉM"
          titulo="Quero contratar"
          desc="Publique o que precisa e receba propostas de profissionais da região."
          chips={['Serviços', 'Obras', 'Reformas']}
          rodape={<View style={s.rodapeLinha}><Chip texto="Sempre gratuito" verde /></View>}
          onPress={() => setLado('contratar')}
        />

        <View style={s.avisoCadastros}>
          <View style={s.avisoIcone}>
            <Feather name="users" size={18} color={COR_CONTRATAR} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.avisoTitulo}>Até 4 cadastros por pessoa</Text>
            <Text style={s.avisoTexto}>
              Com o <Text style={s.avisoDestaque}>mesmo e-mail, CPF e senha</Text>: profissional e cliente, de obra e de serviço.
            </Text>
          </View>
        </View>
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
        <View style={s.cabecalhoMarca}>
          <Image source={require('../../../assets/logo.png')} style={s.logoPequeno} resizeMode="contain" />
          <Wordmark tamanho={20} />
        </View>
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
          rotulo={op.rotulo}
          titulo={op.titulo}
          desc={op.desc}
          chips={op.chips}
          rodape={op.preco
            ? <RodapePreco preco={op.preco} mostrarCobranca={mostrarCobranca} lancamentoGratis={lancamentoGratis} />
            : <View style={s.rodapeLinha}><Chip texto="Gratuito" verde /></View>}
          onPress={() => onEscolher(op.tipo)}
        />
      ))}
    </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo, overflow: 'hidden' },
  // Halos de canto: metade para fora da tela, opacidade baixa (o png é branco cheio no centro).
  brilhoTopo:  { position: 'absolute', width: 460, height: 460, top: -200, left: -200, opacity: 0.32 },
  brilhoBaixo: { position: 'absolute', width: 460, height: 460, bottom: -220, right: -200, opacity: 0.26 },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 10 },
  // Tela 1: logo grande centrado, como nas outras telas de autenticação.
  logoWrap: { alignItems: 'center', marginBottom: 14 },
  logo: { width: 170, height: 64 },
  wordmark: { fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  tituloCentro: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, textAlign: 'center', marginBottom: 6 },
  subtituloCentro: { fontSize: 13, lineHeight: 18, color: TEXTO_SUB, textAlign: 'center', marginBottom: 18 },
  // Telas 2/3: voltar à esquerda e marca pequena centrada na mesma linha. O botão fica
  // absoluto para a marca centrar na tela, e não no espaço que sobra.
  cabecalho: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 8, marginBottom: 14 },
  btnVoltarCabecalho: { position: 'absolute', left: 0, marginTop: 0, marginBottom: 0 },
  cabecalhoMarca: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 44 },
  logoPequeno: { width: 36, height: 36 },
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
  cardRotulo: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 2 },
  cardTitulo: { fontWeight: '700', color: cores.textoForte, letterSpacing: -0.3 },
  seta: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardDesc: { fontSize: 14, lineHeight: 20, color: TEXTO_DESC, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: FUNDO_CHIP, borderWidth: 1, borderColor: BORDA_CHIP, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 5 },
  chipTexto: { fontSize: 12, fontWeight: '600', color: TEXTO_DESC },
  chipVerde: { backgroundColor: cores.sucesso + '33', borderColor: cores.sucesso + '99' },
  chipTextoVerde: { color: cores.sucesso, fontWeight: '700' },
  rodapeLinha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  preco: { fontSize: 12, fontWeight: '600', color: cores.primaria, marginTop: 10 },
  precoRiscado: { fontSize: 12, fontWeight: '600', color: TEXTO_SUB, textDecorationLine: 'line-through' },
  avisoCadastros: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#141417', borderWidth: 1, borderColor: '#2E2E34', borderStyle: 'dashed', borderRadius: raios.grande, padding: 14, marginTop: 4 },
  avisoIcone: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: COR_CONTRATAR + '99', backgroundColor: COR_CONTRATAR + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avisoTitulo: { fontSize: 14, fontWeight: '700', color: cores.branco, marginBottom: 2 },
  avisoTexto: { fontSize: 12, lineHeight: 17, color: cores.textoMedio },
  avisoDestaque: { color: cores.primaria },
})
