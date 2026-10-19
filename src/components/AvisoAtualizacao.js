import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet, Linking, Platform, Animated, Easing } from 'react-native'
import * as Application from 'expo-application'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { cores, raios, alturas } from '../utils/tema'
import { TIPO_PLAY, consultarPlay, iniciarAtualizacaoPlay, ouvirEventosPlay } from '../services/atualizacaoPlay'

// Aviso de atualização do app. No boot busca GET /config/versao-app (endpoint público,
// mesmo cliente do /config/lancamento) e compara a versão NATIVA instalada com o par
// { minima, atual } da plataforma:
//   - abaixo de `minima`: modal BLOQUEANTE, só "Atualizar agora". Não fecha pelo botão
//     voltar do Android nem ao voltar da loja — só some com o app atualizado.
//   - abaixo de `atual`: aviso dispensável, UMA vez por abertura do app ("Depois" fecha
//     e ele só volta no próximo cold start).
// Qualquer falha — rede, timeout, 304 sem corpo, resposta fora do formato, versão
// instalada indisponível — não mostra nada: aviso de atualização nunca pode travar o app
// por erro dele mesmo.
//
// ANDROID (Google Play In-App Updates, services/atualizacaoPlay.js):
//   - O Play também é consultado no boot. Se ELE diz que há versão nova, o aviso
//     dispensável aparece mesmo que o `atual` do servidor ainda não tenha subido.
//   - "Atualizar agora" com o Play disponível: FLEXÍVEL no aviso dispensável (folha de
//     confirmação do próprio Google, download em segundo plano com a barra inferior
//     deste componente; ao terminar o Play reinicia o app); IMEDIATO no bloqueante
//     (fluxo de tela cheia do Google).
//   - Play indisponível (sideload, aparelho sem Play Store, erro, binário sem o módulo):
//     abre a loja exatamente como antes.
// iOS: igual ao de sempre (abre a App Store).
const ANDROID_PACKAGE = 'com.pinturapro.app'
const APP_STORE_ID = '6807459250'
const LARANJA_PROGRESSO = '#F5891F'

// Android vai DIRETO no link https da Play Store, sem tentar market:// antes: em aparelhos
// Xiaomi/Oppo o market:// é capturado pela loja do fabricante em vez do Google Play.
const LOJA = Platform.select({
  android: {
    web: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
  },
  ios: {
    app: `itms-apps://apps.apple.com/app/id${APP_STORE_ID}`,
    web: `https://apps.apple.com/app/id${APP_STORE_ID}`,
  },
})

// "1.0.2" -> [1, 0, 2]. Só aceita números separados por ponto; qualquer outra coisa
// devolve null e o chamador desiste — comparar versão malformada seria adivinhar.
const partesVersao = (v) => {
  if (typeof v !== 'string' || !/^\d+(\.\d+)*$/.test(v.trim())) return null
  return v.trim().split('.').map(Number)
}

// true quando `a` é MENOR que `b`. Segmento ausente conta como 0 ("1.0" == "1.0.0").
const versaoMenor = (a, b) => {
  const tamanho = Math.max(a.length, b.length)
  for (let i = 0; i < tamanho; i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x !== y) return x < y
  }
  return false
}

const TEXTOS = {
  obrigatoria: {
    titulo: 'Atualização necessária',
    texto: 'Esta versão do ProTudo não é mais compatível. Atualize para continuar usando o app.',
  },
  opcional: {
    titulo: 'Nova versão disponível',
    texto: 'Atualize o ProTudo para ter as últimas melhorias e novidades.',
  },
}

const abrirLoja = () => {
  if (!LOJA) return
  const tentativa = LOJA.app
    ? Linking.openURL(LOJA.app).catch(() => Linking.openURL(LOJA.web))
    : Linking.openURL(LOJA.web)
  tentativa.catch(() => {})
}

// Trilha indeterminada: o módulo não entrega bytes, então um segmento laranja varre a
// trilha em loop (translateX no driver nativo — nada no thread de JS).
const LARGURA_SEGMENTO = 0.35
const BarraIndeterminada = () => {
  const [largura, setLargura] = useState(0)
  const posicao = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(posicao, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [posicao])
  const segmento = largura * LARGURA_SEGMENTO
  const translateX = posicao.interpolate({ inputRange: [0, 1], outputRange: [-segmento, largura] })
  return (
    <View style={estilos.trilha} onLayout={(e) => setLargura(e.nativeEvent.layout.width)} accessibilityRole="progressbar">
      {largura > 0 && <Animated.View style={[estilos.trilhaSegmento, { width: segmento, transform: [{ translateX }] }]} />}
    </View>
  )
}

export default function AvisoAtualizacao() {
  const { usuario } = useAuth()
  const insets = useSafeAreaInsets()
  // Veredito do SERVIDOR: null | 'obrigatoria' | 'opcional'.
  const [tipoServidor, setTipoServidor] = useState(null)
  // Veredito do PLAY (Android): null = não consultado/indisponível | { disponivel, emAndamento, flexivel, imediata }.
  const [play, setPlay] = useState(null)
  // "Depois" (ou folha do Google aberta): esconde o aviso dispensável nesta abertura.
  const [dispensado, setDispensado] = useState(false)
  // Barra inferior do download flexível: null | 'baixando' | 'pronto'.
  const [download, setDownload] = useState(null)
  const iniciandoRef = useRef(false)
  // Os listeners do Play são registrados uma vez e leem o veredito do servidor por ref.
  const tipoServidorRef = useRef(null)
  useEffect(() => { tipoServidorRef.current = tipoServidor }, [tipoServidor])

  useEffect(() => {
    let montado = true
    const instalada = partesVersao(Application.nativeApplicationVersion)
    if (instalada && LOJA) {
      api.get('/config/versao-app')
        .then((resp) => {
          if (!montado) return
          const daPlataforma = resp?.[Platform.OS]
          const minima = partesVersao(daPlataforma?.minima)
          const atual = partesVersao(daPlataforma?.atual)
          if (minima && versaoMenor(instalada, minima)) setTipoServidor('obrigatoria')
          else if (atual && versaoMenor(instalada, atual)) setTipoServidor('opcional')
        })
        .catch(() => {})
    }
    // Play em paralelo e independente: falha vira null e nada muda no caminho de sempre.
    // Download flexível deixado pela metade numa abertura anterior: o Play retoma e o
    // módulo conclui sozinho — a barra já nasce mostrando isso.
    consultarPlay().then((info) => {
      if (!montado || !info) return
      setPlay(info)
      if (info.emAndamento) setDownload('baixando')
    })
    return () => { montado = false }
  }, [])

  // Eventos do Play. Registrados uma vez; no-op onde o módulo não carregou.
  useEffect(() => {
    if (Platform.OS !== 'android') return
    return ouvirEventosPlay((nome, e) => {
      if (nome === 'inicio') {
        // A folha do Google abriu. No flexível a barra já entra atrás dela (se a pessoa
        // recusar, 'cancelado' a tira). No imediato o Play assume a tela e reinicia o
        // app sozinho — nada a mostrar aqui.
        if (e?.updateType === 'FLEXIBLE') setDownload('baixando')
      } else if (nome === 'baixado') {
        // Em seguida o módulo chama completeUpdate(): o Play reinicia o app.
        setDownload('pronto')
      } else if (nome === 'concluido') {
        setDownload(null)
      } else if (nome === 'cancelado') {
        // Recusou/fechou a folha. Bloqueante: o modal volta (não há saída sem atualizar).
        // Dispensável: fica escondido nesta abertura, como se tivesse tocado "Depois".
        setDownload(null)
        if (tipoServidorRef.current === 'obrigatoria') setDispensado(false)
      }
    })
  }, [])

  const obrigatoria = tipoServidor === 'obrigatoria'
  // Dispensável também quando só o Play sabe da versão nova.
  const tipo = obrigatoria ? 'obrigatoria' : (tipoServidor === 'opcional' || play?.disponivel) ? 'opcional' : null
  const mostrarModal = !!tipo && (obrigatoria || !dispensado) && !download

  const fechar = () => { if (!obrigatoria) setDispensado(true) }

  const atualizar = useCallback(async () => {
    if (iniciandoRef.current) return
    iniciandoRef.current = true
    try {
      if (Platform.OS === 'android' && play?.disponivel) {
        // Bloqueante prefere IMEDIATO (o Play só devolve a tela com o app atualizado);
        // dispensável prefere FLEXÍVEL (segue usando o app enquanto baixa). Cada um cai
        // no outro tipo se o Play só permitir aquele.
        const tipoPlay = obrigatoria
          ? (play.imediata ? TIPO_PLAY.IMEDIATO : play.flexivel ? TIPO_PLAY.FLEXIVEL : null)
          : (play.flexivel ? TIPO_PLAY.FLEXIVEL : play.imediata ? TIPO_PLAY.IMEDIATO : null)
        if (tipoPlay != null) {
          const aberto = await iniciarAtualizacaoPlay(tipoPlay)
          if (aberto) {
            // A folha do Google está na frente; o modal dispensável sai para não disputar
            // a tela (volta pelo evento 'cancelado' se for bloqueante).
            if (!obrigatoria) setDispensado(true)
            return
          }
        }
      }
      abrirLoja()
    } finally {
      iniciandoRef.current = false
    }
  }, [play, obrigatoria])

  // Barra inferior: acima da barra de abas quando há sessão (mesma conta do
  // BarraServicoEmAndamento), senão só o inset do aparelho.
  const baseInferior = (usuario ? alturas.tabBar : 0) + insets.bottom + 10

  return (
    <>
      {mostrarModal && (
        <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={fechar}>
          <View style={estilos.backdrop}>
            <View style={estilos.card}>
              <Image source={require('../../assets/logo.png')} style={estilos.icone} resizeMode="contain" />
              <Text style={estilos.titulo}>{TEXTOS[tipo].titulo}</Text>
              <Text style={estilos.texto}>{TEXTOS[tipo].texto}</Text>

              <TouchableOpacity style={estilos.cta} onPress={atualizar} activeOpacity={0.85}>
                <Text style={estilos.ctaTexto}>Atualizar agora</Text>
              </TouchableOpacity>

              {!obrigatoria && (
                <TouchableOpacity style={estilos.depois} onPress={fechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={estilos.depoisTexto}>Depois</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}

      {download && (
        <View style={[estilos.barra, { bottom: baseInferior }]} pointerEvents="none">
          <View style={estilos.barraCard}>
            <View style={estilos.barraLinha}>
              <Image source={require('../../assets/icon.png')} style={estilos.barraIcone} resizeMode="cover" />
              <View style={estilos.barraTextos}>
                {download === 'pronto' ? (
                  <>
                    <Text style={estilos.barraTitulo}>Atualização pronta!</Text>
                    <Text style={estilos.barraSub}>Leva só alguns segundos</Text>
                  </>
                ) : (
                  <Text style={estilos.barraTitulo}>Baixando atualização…</Text>
                )}
              </View>
            </View>
            {download === 'baixando' && <BarraIndeterminada />}
          </View>
        </View>
      )}
    </>
  )
}

const estilos = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:        { width: '100%', maxWidth: 380, backgroundColor: '#1A1A1D', borderRadius: 24, borderWidth: 1, borderColor: cores.primariaBorda, padding: 28, alignItems: 'center' },
  icone:       { width: 72, height: 72, marginBottom: 18 },
  titulo:      { fontSize: 22, fontWeight: '800', color: cores.textoForte, textAlign: 'center', marginBottom: 12, letterSpacing: -0.3 },
  texto:       { fontSize: 14, color: cores.textoMedio, textAlign: 'center', lineHeight: 21 },
  cta:         { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginTop: 24 },
  ctaTexto:    { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  depois:      { paddingVertical: 8, alignItems: 'center', marginTop: 12 },
  depoisTexto: { color: cores.textoMedio, fontSize: 13 },
  // Barra inferior do download: overlay global acima da BarraServicoEmAndamento (9999) —
  // as duas disputam o mesmo canto, e enquanto baixa é esta que importa.
  barra:       { position: 'absolute', left: 12, right: 12, zIndex: 10000, alignItems: 'center' },
  barraCard:   { width: '100%', maxWidth: 520, backgroundColor: '#1A1A1D', borderRadius: raios.grande, borderWidth: 1, borderColor: LARANJA_PROGRESSO + '66', padding: 12, elevation: 8, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  barraLinha:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barraIcone:  { width: 40, height: 40, borderRadius: 10, flexShrink: 0 },
  barraTextos: { flex: 1, minWidth: 0 },
  barraTitulo: { fontSize: 14, fontWeight: '700', color: cores.textoForte },
  barraSub:    { fontSize: 12, color: cores.textoMedio, marginTop: 1 },
  trilha:      { height: 6, borderRadius: 3, backgroundColor: '#2A2A2E', marginTop: 10, overflow: 'hidden' },
  trilhaSegmento: { height: '100%', borderRadius: 3, backgroundColor: LARANJA_PROGRESSO },
})
