import React, { useState, useEffect, useMemo } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { cores, raios, larguraMaxima } from '../utils/tema'
import { MiniPessoa } from './PosMatchFixo'
import { carregarCatalogoEtiquetas, rotuloNivel, gruposDaDemanda, etiquetasPara, maxEtiquetas } from '../services/etiquetasAvaliacao'

// Tela FIXA de avaliação do profissional pelo dono (reparo E obra), aberta como Modal pelas
// quatro origens de sempre (detalhe do reparo/obra, Contratos Finalizados, CelebracaoMatchHost).
// Sem ScrollView: corpo flex:1 com 'space-evenly' entre cabeçalho e rodapé, todo texto com
// numberOfLines — mesma construção da TelaPosMatch. Blocos, na ordem:
//   1. título + mini card do profissional (o MiniPessoa da tela pós-match: foto, nota, selo);
//   2. cinco estrelas tocáveis com a palavra do nível (5 Excelente … 1 Péssimo), verde → vermelho;
//   3. chips de etiquetas do nível escolhido (multi-seleção, teto do catálogo), vindas de
//      GET /config/etiquetas-avaliacao: as do(s) grupo(s) da demanda + as universais;
//   4. "Enviar avaliação" → onEnviar(estrelas, etiquetas) — o POST continua nos pais.
// NÃO há campo de texto livre: a API recusa comentário.
//
// Props: visivel, nomeAvaliado, onEnviar(estrelas, etiquetas), onFechar (as de sempre) +
// profissional (objeto do mini card: nome, foto_url, avaliacoes_*, selo_bem_avaliado,
// especialidades — opcional, cai no nome), ehObra, demanda (categorias para o grupo).
// Trocar a nota zera as etiquetas (são do nível). Catálogo indisponível: avalia só com a nota.

const COR_NIVEL = { 5: cores.sucesso, 4: '#9BD35A', 3: '#E8C14A', 2: cores.primaria, 1: cores.perigo }
const MFS = 1.15
const T = ({ linhas = 1, ...p }) => <Text numberOfLines={linhas} maxFontSizeMultiplier={MFS} {...p} />

// Conteúdo da tela (sem o Modal), reutilizado pela galeria de estados com dados locais.
// `catalogo` força um catálogo pronto (galeria); sem ele, busca o da API.
export function AvaliacaoConteudo({ nomeAvaliado, profissional, ehObra, demanda, onEnviar, onFechar, catalogo: catalogoProp, notaInicial = 0, etiquetasIniciais = [] }) {
  const [estrelas, setEstrelas] = useState(notaInicial)
  const [etiquetas, setEtiquetas] = useState(etiquetasIniciais)
  const [enviando, setEnviando] = useState(false)
  const [catalogo, setCatalogo] = useState(catalogoProp || null)
  const [carregando, setCarregando] = useState(!catalogoProp)

  useEffect(() => {
    if (catalogoProp) { setCatalogo(catalogoProp); setCarregando(false); return }
    let montado = true
    carregarCatalogoEtiquetas().then((c) => { if (montado) { setCatalogo(c); setCarregando(false) } })
    return () => { montado = false }
  }, [catalogoProp])

  const grupos = useMemo(() => gruposDaDemanda(catalogo, ehObra, demanda), [catalogo, ehObra, demanda])
  const opcoes = useMemo(() => etiquetasPara(catalogo, grupos, estrelas), [catalogo, grupos, estrelas])
  const teto = maxEtiquetas(catalogo)
  const nivel = estrelas ? rotuloNivel(catalogo, estrelas) : ''
  const corNivel = COR_NIVEL[estrelas] || cores.textoMedio

  const escolherNota = (n) => { if (n !== estrelas) { setEstrelas(n); setEtiquetas([]) } }
  const alternar = (e) => setEtiquetas((atual) => (
    atual.includes(e) ? atual.filter((x) => x !== e) : (atual.length >= teto ? atual : [...atual, e])
  ))
  const enviar = async () => {
    if (estrelas < 1 || enviando) return
    setEnviando(true)
    try { await onEnviar(estrelas, etiquetas) } finally { setEnviando(false) }
  }

  const pessoa = profissional || { nome: nomeAvaliado }
  return (
    <View style={estilos.corpo}>
      <View>
        <T style={estilos.titulo}>Como foi sua experiência?</T>
        <T style={estilos.subtitulo}>Avalie {pessoa?.nome || nomeAvaliado || 'o profissional'}</T>
        <MiniPessoa souDono outro={pessoa} />
      </View>

      <View>
        <View style={estilos.estrelasRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => escolherNota(n)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${n} estrela${n > 1 ? 's' : ''}`}>
              <T style={[estilos.estrela, { color: n <= estrelas ? corNivel : cores.textoFraco }]}>{n <= estrelas ? '★' : '☆'}</T>
            </TouchableOpacity>
          ))}
        </View>
        <T style={[estilos.nivel, { color: corNivel }]}>{nivel || 'Toque nas estrelas'}</T>
      </View>

      <View style={estilos.blocoChips}>
        {estrelas < 1 ? (
          <T linhas={2} style={estilos.dica}>Escolha a nota para ver as etiquetas.</T>
        ) : carregando ? (
          <T style={estilos.dica}>Carregando etiquetas…</T>
        ) : opcoes.length === 0 ? (
          <T linhas={2} style={estilos.dica}>Sem etiquetas disponíveis — a nota já basta.</T>
        ) : (
          <>
            <T style={estilos.dica}>O que mais marcou? (até {teto})</T>
            <View style={estilos.chips}>
              {opcoes.map((e) => {
                const ligado = etiquetas.includes(e)
                return (
                  <TouchableOpacity key={e} onPress={() => alternar(e)} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{ selected: ligado }}
                    style={[estilos.chip, ligado && { backgroundColor: `${corNivel}22`, borderColor: corNivel }]}>
                    <T style={[estilos.chipTexto, ligado && { color: corNivel }]}>{ligado ? '✓ ' : ''}{e}</T>
                  </TouchableOpacity>
                )
              })}
            </View>
          </>
        )}
      </View>

      <View>
        <TouchableOpacity style={[estilos.cta, (estrelas < 1 || enviando) && estilos.ctaDesabilitado]} onPress={enviar} disabled={estrelas < 1 || enviando} activeOpacity={0.85} accessibilityRole="button">
          <T style={estilos.ctaTexto}>{enviando ? 'Enviando...' : 'Enviar avaliação'}</T>
        </TouchableOpacity>
        <TouchableOpacity style={estilos.depois} onPress={onFechar} disabled={enviando} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
          <T style={estilos.depoisTexto}>Agora não</T>
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default function ModalAvaliacao({ visivel, nomeAvaliado, profissional, ehObra, demanda, onEnviar, onFechar }) {
  return (
    <Modal visible={visivel} animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.tela}>
        <View style={[estilos.wrapper, larguraMaxima]}>
          {/* key: reabrir com outro contrato zera nota e etiquetas. */}
          <AvaliacaoConteudo key={visivel ? `${ehObra ? 'o' : 'r'}-${demanda?.id ?? nomeAvaliado}` : 'fechado'}
            nomeAvaliado={nomeAvaliado} profissional={profissional} ehObra={ehObra} demanda={demanda} onEnviar={onEnviar} onFechar={onFechar} />
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  tela:        { flex: 1, backgroundColor: cores.fundo },
  wrapper:     { flex: 1, paddingHorizontal: 20, paddingVertical: 12 },
  corpo:       { flex: 1, justifyContent: 'space-evenly' },
  titulo:      { fontSize: 22, fontWeight: '800', color: cores.primaria, textAlign: 'center', letterSpacing: -0.3 },
  subtitulo:   { fontSize: 14, color: cores.textoMedio, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  estrelasRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  estrela:     { fontSize: 44, marginHorizontal: 4, includeFontPadding: false },
  nivel:       { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  blocoChips:  { minHeight: 120, justifyContent: 'center' },
  dica:        { fontSize: 13, color: cores.textoMedio, textAlign: 'center', marginBottom: 8 },
  chips:       { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip:        { paddingVertical: 8, paddingHorizontal: 14, borderRadius: raios.pill, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.fundoCard },
  chipTexto:   { fontSize: 13, fontWeight: '600', color: cores.textoForte },
  cta:         { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, alignItems: 'center', marginBottom: 8 },
  ctaDesabilitado: { opacity: 0.5 },
  ctaTexto:    { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  depois:      { paddingVertical: 8, alignItems: 'center' },
  depoisTexto: { color: cores.textoFraco, fontSize: 13 },
})
