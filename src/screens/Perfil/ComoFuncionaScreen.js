import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import YoutubePlayer from 'react-native-youtube-iframe'
import { carregarVideoComoFunciona } from '../../services/videoComoFunciona'
import { cores, espacos, raios, alturas, larguraMaxima, LARGURA_MAXIMA } from '../../utils/tema'

// Tela "Como funciona o ProTudo": o vídeo do YouTube embutido (react-native-youtube-iframe,
// 16:9, começa do zero) e a lista de capítulos que o admin publica. Tocar num capítulo
// busca o ponto no player e passa a tocar; o capítulo em curso fica em destaque, lido do
// player a cada segundo enquanto ele toca.

const formatarTempo = (seg) => {
  const s = Math.max(0, Math.floor(Number(seg) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function ComoFuncionaScreen({ navigation }) {
  const { width } = useWindowDimensions()
  const [video, setVideo] = useState(null)
  const [tocando, setTocando] = useState(false)
  const [capituloAtual, setCapituloAtual] = useState(-1)
  const playerRef = useRef(null)

  useEffect(() => {
    let vivo = true
    carregarVideoComoFunciona().then(v => { if (vivo) setVideo(v) })
    return () => { vivo = false }
  }, [])

  const capitulos = video?.capitulos || []

  // Índice do último capítulo cujo início já passou — a lista chega ordenada por seg.
  const capituloEm = useCallback((t) => {
    let i = -1
    for (let k = 0; k < capitulos.length; k++) if (Number(capitulos[k].seg) <= t) i = k
    return i
  }, [capitulos])

  // Enquanto toca, lê o tempo a cada segundo para mover o destaque. Parado, não há o que
  // acompanhar — e o toque num capítulo já ajusta o destaque na hora.
  useEffect(() => {
    if (!tocando) return undefined
    const timer = setInterval(() => {
      playerRef.current?.getCurrentTime?.()
        .then(t => setCapituloAtual(capituloEm(t)))
        .catch(() => {})
    }, 1000)
    return () => clearInterval(timer)
  }, [tocando, capituloEm])

  const onChangeState = useCallback((estado) => {
    if (estado === 'playing') setTocando(true)
    else if (estado === 'paused' || estado === 'ended') setTocando(false)
  }, [])

  const pular = (indice) => {
    const seg = Number(capitulos[indice]?.seg) || 0
    playerRef.current?.seekTo?.(seg, true)
    setCapituloAtual(indice)
    setTocando(true)
  }

  // 16:9 na largura útil: tela (ou o teto de tablet) menos as margens laterais.
  const larguraPlayer = Math.min(width, LARGURA_MAXIMA) - espacos.tela * 2
  const alturaPlayer = Math.round(larguraPlayer * 9 / 16)

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={estilos.btnVoltarTexto}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.titulo}>Como funciona o ProTudo</Text>

        {video === null ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 40 }} />
        ) : !video.video_id ? (
          <Text style={estilos.semVideo}>O vídeo ainda não está disponível. Volte em breve.</Text>
        ) : (
          <>
            <View style={[estilos.playerWrap, { height: alturaPlayer }]}>
              <YoutubePlayer
                ref={playerRef}
                height={alturaPlayer}
                width={larguraPlayer}
                videoId={video.video_id}
                play={tocando}
                onChangeState={onChangeState}
                initialPlayerParams={{ start: 0, rel: false }}
              />
            </View>

            <Text style={estilos.chamada}>Assista do começo: vale a pena!</Text>
            {capitulos.length > 0 && (
              <>
                <Text style={estilos.subchamada}>Ou toque num capítulo para pular:</Text>
                <View style={estilos.lista}>
                  {capitulos.map((c, i) => {
                    const ativo = i === capituloAtual
                    return (
                      <TouchableOpacity
                        key={`${c.seg}-${i}`}
                        style={[estilos.capitulo, ativo && estilos.capituloAtivo]}
                        onPress={() => pular(i)}
                        activeOpacity={0.7}
                      >
                        <Text style={estilos.capituloTempo}>{formatarTempo(c.seg)}</Text>
                        <Text style={[estilos.capituloTitulo, ativo && estilos.capituloTituloAtivo]}>{c.titulo}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container:          { flex: 1, backgroundColor: cores.fundo },
  scroll:             { paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 32 + alturas.barraServico },
  btnVoltar:          { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  btnVoltarTexto:     { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, includeFontPadding: false },
  titulo:             { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, marginBottom: 16 },
  semVideo:           { fontSize: 13, color: cores.textoFraco, textAlign: 'center', marginTop: 40, lineHeight: 20 },
  playerWrap:         { width: '100%', borderRadius: raios.grande, overflow: 'hidden', backgroundColor: cores.preto, marginBottom: 16 },
  chamada:            { fontSize: 15, fontWeight: '700', color: cores.textoForte, marginBottom: 4 },
  subchamada:         { fontSize: 13, color: cores.textoFraco, marginBottom: 12 },
  lista:              { gap: 8 },
  capitulo:           { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, paddingVertical: 12, paddingHorizontal: 14 },
  capituloAtivo:      { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
  capituloTempo:      { fontSize: 13, fontWeight: '700', color: cores.primaria, minWidth: 44, fontVariant: ['tabular-nums'] },
  capituloTitulo:     { flex: 1, fontSize: 13, color: cores.textoMedio, lineHeight: 18 },
  capituloTituloAtivo:{ color: cores.textoForte, fontWeight: '600' },
})
