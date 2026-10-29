import React, { useState, useEffect, useRef, useMemo } from 'react'
import { View, Text, TouchableOpacity, Animated, Easing, Dimensions, Share, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { rotuloNivel } from '../../services/etiquetasAvaliacao'
import { rotulosEspecialidades } from '../../utils/categorias'
import { ChipBemAvaliado } from '../../components/SeloBemAvaliado'
import { cores, raios, espacos, larguraMaxima } from '../../utils/tema'

// Tela FIXA (sem ScrollView) de comemoração do PROFISSIONAL ao receber uma avaliação.
// Entradas: push 'avaliacao_recebida' { reparo_id | obra_id, nota } (AppNavigator) e o botão
// "⭐ Ver minha avaliação" do contrato finalizado (ContratosFinalizadosScreen).
// Corpo flex:1 'space-evenly', todo texto com numberOfLines — mesma construção da TelaPosMatch:
//   1. herói com confete: estrelas + palavra do nível + "Parabéns, {nome}!";
//   2. card "O CLIENTE DESTACOU" com as etiquetas desta avaliação;
//   3. faixa Valor combinado | Sua média | Avaliações;
//   4. "Compartilhar minha avaliação" e "Ver novos serviços".
//
// FONTES (API d5f3978): a nota vem do push (data.nota). As etiquetas DESTA avaliação não têm
// endpoint para o profissional — nem o push nem /reparos|obras/meus-contratos as trazem. A tela
// já lê `etiquetas` do push e `avaliacao_recebida: { nota, etiquetas }` da linha do contrato
// assim que a API mandar; até lá o card mostra as etiquetas mais recebidas no geral
// (/avaliacoes/recebidas) com o título honesto "MAIS DESTACADO EM VOCÊ".
//
// Compartilhar: captura um cartão com a marca (react-native-view-shot) e abre a folha nativa
// (expo-sharing). Os dois módulos são NATIVOS e carregados sob demanda dentro de try/catch —
// num binário anterior a eles o import estático derrubaria o app; aqui cai no Share de texto.

const MFS = 1.15
const T = ({ linhas = 1, ...p }) => <Text numberOfLines={linhas} maxFontSizeMultiplier={MFS} {...p} />
const COR_NIVEL = { 5: cores.sucesso, 4: '#9BD35A', 3: '#E8C14A', 2: cores.primaria, 1: cores.perigo }
const LINK_APP = 'protudo.app.br/baixar'
const formatarValor = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const estrelasTexto = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n))
const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || 'profissional'

// Módulos nativos sob demanda (ver o cabeçalho). null = indisponível neste binário.
const carregar = (nome) => { try { return nome === 'shot' ? require('react-native-view-shot') : require('expo-sharing') } catch (e) { return null } }

// Confete: peças coloridas caindo uma vez, só no herói. Animated com driver nativo; nada fica
// rodando depois de cair.
const CORES_CONFETE = ['#E8833A', '#5DC98A', '#3B82F6', '#FFC107', '#E24B4A', '#F0EDE6']
const Confete = ({ ativo }) => {
  const largura = Math.min(Dimensions.get('window').width, 480)
  const pecas = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    x: Math.random() * largura, rot: Math.random() * 360, cor: CORES_CONFETE[i % CORES_CONFETE.length],
    atraso: Math.random() * 500, tam: 6 + Math.random() * 6,
  })), [largura])
  const anim = useRef(pecas.map(() => new Animated.Value(0))).current
  useEffect(() => {
    if (!ativo) return
    Animated.parallel(anim.map((a, i) => Animated.timing(a, { toValue: 1, duration: 1800, delay: pecas[i].atraso, easing: Easing.out(Easing.quad), useNativeDriver: true }))).start()
  }, [ativo, anim, pecas])
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pecas.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', left: p.x, top: -12, width: p.tam, height: p.tam * 0.5, backgroundColor: p.cor, borderRadius: 1,
          opacity: anim[i].interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
          transform: [
            { translateY: anim[i].interpolate({ inputRange: [0, 1], outputRange: [0, 200] }) },
            { rotate: anim[i].interpolate({ inputRange: [0, 1], outputRange: [`${p.rot}deg`, `${p.rot + 540}deg`] }) },
          ],
        }} />
      ))}
    </View>
  )
}

// Cartão com a marca que vira imagem no compartilhar. Fica montado FORA da tela (left negativo)
// e collapsable={false}, que o view-shot exige no Android para achar a view.
const CartaoCompartilhar = React.forwardRef(({ nota, nivel, nome, especialidade, etiquetas }, ref) => (
  <View ref={ref} collapsable={false} style={estilos.cartao}>
    <Text style={estilos.cartaoMarca}>ProTudo</Text>
    <Text style={[estilos.cartaoEstrelas, { color: COR_NIVEL[nota] || cores.primaria }]}>{estrelasTexto(nota)}</Text>
    <Text style={[estilos.cartaoNivel, { color: COR_NIVEL[nota] || cores.primaria }]}>{nivel}</Text>
    <Text style={estilos.cartaoNome} numberOfLines={1}>{nome}</Text>
    {especialidade ? <Text style={estilos.cartaoEsp} numberOfLines={1}>🛠 {especialidade}</Text> : null}
    {etiquetas.length > 0 ? (
      <View style={estilos.cartaoChips}>
        {etiquetas.slice(0, 4).map((e) => <View key={e} style={estilos.cartaoChip}><Text style={estilos.cartaoChipTexto} numberOfLines={1}>✓ {e}</Text></View>)}
      </View>
    ) : null}
    <Text style={estilos.cartaoRodape}>Avaliado no ProTudo · {LINK_APP}</Text>
  </View>
))

// Conteúdo da tela, puro: recebe tudo pronto. A galeria de estados o usa com dados locais.
// dados: { nome, especialidade, nota, etiquetas, etiquetasDoContrato (bool), valor, media,
//          total, selo }. onVerServicos: navegação do botão; compartilhar: sobrescreve a ação.
export function CelebracaoAvaliacaoConteudo({ dados, onVerServicos, compartilhar: compartilharProp }) {
  const cartaoRef = useRef(null)
  const [compartilhando, setCompartilhando] = useState(false)
  const nota = Number(dados?.nota) || 0
  const nivel = nota ? rotuloNivel(null, nota) : ''
  const cor = COR_NIVEL[nota] || cores.primaria
  const etiquetas = dados?.etiquetas || []
  const nome = dados?.nome || ''

  const compartilhar = async () => {
    if (compartilharProp) { compartilharProp(); return }
    if (compartilhando) return
    setCompartilhando(true)
    const texto = `${estrelasTexto(nota)} ${nivel}! Fui avaliado no ProTudo${etiquetas.length ? `: ${etiquetas.slice(0, 3).join(', ')}` : ''}. Baixe o app: https://${LINK_APP}`
    try {
      const shot = carregar('shot')
      const sharing = carregar('sharing')
      const disponivel = sharing ? await sharing.isAvailableAsync().catch(() => false) : false
      if (shot?.captureRef && disponivel && cartaoRef.current) {
        const uri = await shot.captureRef(cartaoRef, { format: 'png', quality: 1, result: 'tmpfile' })
        await sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartilhar minha avaliação', UTI: 'public.png' })
      } else {
        await Share.share({ message: texto })
      }
    } catch (err) {
      // Captura/folha falhou: o texto ainda compartilha. Cancelar a folha não chega aqui.
      console.log('[AvaliacaoRecebida] compartilhar como imagem falhou, indo de texto | msg:', err?.message)
      try { await Share.share({ message: texto }) } catch (e) {}
    } finally {
      setCompartilhando(false)
    }
  }

  return (
    <View style={estilos.corpo}>
      {/* 1. Herói */}
      <View style={[estilos.heroi, { borderColor: cor + '66' }]}>
        <Confete ativo={nota > 0} />
        <T style={[estilos.heroiEstrelas, { color: cor }]}>{nota ? estrelasTexto(nota) : '⭐'}</T>
        <T style={[estilos.heroiNivel, { color: cor }]}>{nivel || 'Nova avaliação'}</T>
        <T style={estilos.heroiParabens}>Parabéns, {primeiroNome(nome)}!</T>
        {dados?.selo ? <ChipBemAvaliado estilo={{ alignSelf: 'center', marginLeft: 0, marginTop: 6 }} /> : null}
      </View>

      {/* 2. Etiquetas */}
      {etiquetas.length > 0 ? (
        <View style={estilos.card}>
          <T style={estilos.cardRotulo}>{dados?.etiquetasDoContrato ? 'O CLIENTE DESTACOU' : 'MAIS DESTACADO EM VOCÊ'}</T>
          <View style={estilos.chips}>
            {etiquetas.slice(0, 5).map((e) => (
              <View key={e} style={[estilos.chip, { borderColor: cor, backgroundColor: cor + '22' }]}><T style={[estilos.chipTexto, { color: cor }]}>✓ {e}</T></View>
            ))}
          </View>
        </View>
      ) : null}

      {/* 3. Faixa */}
      <View style={estilos.faixa}>
        <View style={[estilos.faixaMetade, estilos.faixaValor]}>
          <T style={[estilos.faixaRotulo, { color: cores.sucesso }]}>VALOR COMBINADO</T>
          <T style={[estilos.faixaNumero, { color: cores.sucesso }]} adjustsFontSizeToFit minimumFontScale={0.8}>{dados?.valor != null && Number(dados.valor) > 0 ? formatarValor(dados.valor) : '—'}</T>
        </View>
        <View style={estilos.faixaMetade}>
          <T style={estilos.faixaRotulo}>SUA MÉDIA</T>
          <T style={estilos.faixaNumero}>{dados?.total > 0 ? `⭐ ${Number(dados.media).toFixed(1)}` : '—'}</T>
        </View>
        <View style={[estilos.faixaMetade, { borderRightWidth: 0 }]}>
          <T style={estilos.faixaRotulo}>AVALIAÇÕES</T>
          <T style={estilos.faixaNumero}>{dados?.total ?? '—'}</T>
        </View>
      </View>

      {/* 4. Ações */}
      <View>
        <TouchableOpacity style={[estilos.btnPrincipal, compartilhando && { opacity: 0.6 }]} onPress={compartilhar} disabled={compartilhando} activeOpacity={0.85} accessibilityRole="button">
          <T style={estilos.btnPrincipalTexto}>{compartilhando ? 'Preparando…' : '📤 Compartilhar minha avaliação'}</T>
        </TouchableOpacity>
        <TouchableOpacity style={estilos.btnSecundario} onPress={onVerServicos} activeOpacity={0.85} accessibilityRole="button">
          <T style={estilos.btnSecundarioTexto}>Ver novos serviços →</T>
        </TouchableOpacity>
      </View>

      {/* Fora da tela: só existe para a captura. */}
      <View style={estilos.foraDaTela} pointerEvents="none">
        <CartaoCompartilhar ref={cartaoRef} nota={nota} nivel={nivel} nome={nome} especialidade={dados?.especialidade} etiquetas={etiquetas} />
      </View>
    </View>
  )
}

// Rota: params { tipo: 'reparo' | 'obra', id, nota?, etiquetas? }.
export default function AvaliacaoRecebidaScreen({ navigation, route }) {
  const { usuario } = useAuth()
  const { tipo, id, nota: notaParam, etiquetas: etiquetasParam } = route?.params || {}
  const ehObra = tipo === 'obra'
  const [dados, setDados] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      // Em paralelo e tolerante: cada fonte que falhar só deixa a sua parte em "—".
      const [resumo, contratos] = await Promise.all([
        api.get('/avaliacoes/recebidas').catch(() => null),
        api.get(ehObra ? '/obras/meus-contratos' : '/reparos/meus-contratos').catch(() => null),
      ])
      if (!vivo) return
      const contrato = (contratos?.contratos || []).find((c) => String(c.id) === String(id)) || null
      const recebida = contrato?.avaliacao_recebida || null
      const doContrato = (Array.isArray(etiquetasParam) && etiquetasParam.length ? etiquetasParam : null) || (recebida?.etiquetas?.length ? recebida.etiquetas : null)
      const agregadas = (resumo?.etiquetas || []).map((e) => e?.etiqueta).filter(Boolean).slice(0, 3)
      setDados({
        nome: usuario?.nome,
        especialidade: rotulosEspecialidades(usuario?.especialidades),
        nota: Number(notaParam) || Number(recebida?.nota) || 0,
        etiquetas: doContrato || agregadas,
        etiquetasDoContrato: !!doContrato,
        valor: contrato ? (contrato.valor_acordado ?? contrato.valor ?? contrato.valor_estimado) : null,
        media: Number(resumo?.media) || 0,
        total: Number(resumo?.total) || 0,
        selo: resumo?.selo_bem_avaliado === true,
      })
    })()
    return () => { vivo = false }
  }, [ehObra, id, notaParam, etiquetasParam, usuario?.nome, usuario?.especialidades])

  // Feed de disponíveis do papel (mesma aba do 'reparo_proximo' / 'obra_proxima').
  const usaTabsPintor = usuario?.role === 'assinante' || (usuario?.role === 'prestador' && usuario?.tipo_prestador === 'pintor')
  const verServicos = () => navigation.navigate(usaTabsPintor ? 'Obras' : 'Reparos')

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.tela}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
          <Text style={estilos.btnVoltarTexto}>←</Text>
        </TouchableOpacity>
        <T style={estilos.topbarTitulo}>Avaliação recebida</T>
        <View style={{ width: 36 }} />
      </View>
      <View style={[estilos.wrapper, larguraMaxima]}>
        {dados ? <CelebracaoAvaliacaoConteudo dados={dados} onVerServicos={verServicos} /> : null}
      </View>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espacos.tela, paddingVertical: 12 },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnVoltarTexto: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, includeFontPadding: false },
  topbarTitulo: { fontSize: 14, color: cores.textoMedio, fontWeight: '500' },
  wrapper: { flex: 1, paddingHorizontal: espacos.tela, paddingTop: 4, paddingBottom: 8 },
  corpo: { flex: 1, justifyContent: 'space-evenly' },

  heroi: { backgroundColor: cores.fundoCard, borderWidth: 1, borderRadius: raios.grande, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', overflow: 'hidden' },
  heroiEstrelas: { fontSize: 38, letterSpacing: 4, includeFontPadding: false },
  heroiNivel: { fontSize: 24, fontWeight: '900', marginTop: 2 },
  heroiParabens: { fontSize: 17, fontWeight: '700', color: cores.textoForte, marginTop: 6 },

  card: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 12 },
  cardRotulo: { fontSize: 11, fontWeight: '800', color: cores.textoMedio, letterSpacing: 0.5, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipTexto: { fontSize: 13, fontWeight: '700' },

  faixa: { flexDirection: 'row', borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, overflow: 'hidden' },
  faixaMetade: { flex: 1, backgroundColor: cores.fundoElevado, paddingVertical: 8, paddingHorizontal: 10, borderRightWidth: 0.5, borderRightColor: cores.borda },
  faixaValor: { backgroundColor: cores.sucessoSuave },
  faixaRotulo: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: cores.textoMedio, marginBottom: 2 },
  faixaNumero: { fontSize: 15, fontWeight: '800', color: cores.textoForte },

  btnPrincipal: { backgroundColor: cores.primaria, borderRadius: raios.medio, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  btnPrincipalTexto: { fontSize: 15, fontWeight: '800', color: '#0A0A0A' },
  btnSecundario: { borderWidth: 1, borderColor: cores.primariaBorda, borderRadius: raios.medio, paddingVertical: 13, alignItems: 'center' },
  btnSecundarioTexto: { fontSize: 14, fontWeight: '700', color: cores.primaria },

  // Cartão da imagem compartilhada (1080 px de largura útil em densidade 3 ≈ 360 dp).
  foraDaTela: { position: 'absolute', left: -10000, top: 0 },
  cartao: { width: 360, backgroundColor: '#0A0A0A', borderRadius: 24, borderWidth: 2, borderColor: '#E8833A', padding: 24, alignItems: 'center' },
  cartaoMarca: { fontSize: 22, fontWeight: '900', color: '#E8833A', letterSpacing: 0.5, marginBottom: 12 },
  cartaoEstrelas: { fontSize: 40, letterSpacing: 4 },
  cartaoNivel: { fontSize: 26, fontWeight: '900', marginTop: 2 },
  cartaoNome: { fontSize: 20, fontWeight: '800', color: '#F0EDE6', marginTop: 12 },
  cartaoEsp: { fontSize: 13, color: '#888888', marginTop: 4 },
  cartaoChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 14 },
  cartaoChip: { borderWidth: 1, borderColor: '#5DC98A', backgroundColor: '#5DC98A22', borderRadius: 24, paddingHorizontal: 10, paddingVertical: 5 },
  cartaoChipTexto: { fontSize: 12, fontWeight: '700', color: '#5DC98A' },
  cartaoRodape: { fontSize: 12, color: '#888888', marginTop: 18 },
})
