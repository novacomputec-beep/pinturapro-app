import React, { useEffect, useState, useRef, useCallback } from 'react'
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native'
import * as Application from 'expo-application'
import api from '../services/api'
import { cores, raios } from '../utils/tema'
import { consultarPlay, iniciarAtualizacaoImediata, ouvirCancelamentoPlay } from '../services/atualizacaoPlay'

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
//   - "Atualizar agora" com o Play disponível e IMEDIATO permitido: fluxo de tela cheia
//     do Google, nos dois avisos (dispensável e bloqueante). Só começa no toque; o Google
//     baixa, instala e reinicia o app. Nada roda em segundo plano.
//   - Play indisponível, IMEDIATO não permitido ou falha ao abrir: abre a loja
//     exatamente como antes.
// iOS: igual ao de sempre (abre a App Store).
const ANDROID_PACKAGE = 'com.pinturapro.app'
const APP_STORE_ID = '6807459250'

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

export default function AvisoAtualizacao() {
  // Veredito do SERVIDOR: null | 'obrigatoria' | 'opcional'.
  const [tipoServidor, setTipoServidor] = useState(null)
  // Veredito do PLAY (Android): null = não consultado/indisponível | { disponivel, imediata }.
  const [play, setPlay] = useState(null)
  // "Depois" (ou fluxo do Google aberto): esconde o aviso dispensável nesta abertura.
  const [dispensado, setDispensado] = useState(false)
  const iniciandoRef = useRef(false)
  // O listener do Play é registrado uma vez e lê o veredito do servidor por ref.
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
    consultarPlay().then((info) => { if (montado && info) setPlay(info) })
    return () => { montado = false }
  }, [])

  // A pessoa fechou a tela do Google sem atualizar. Bloqueante: o modal volta (não há
  // saída sem atualizar). Dispensável: fica escondido nesta abertura, como o "Depois".
  useEffect(() => {
    if (Platform.OS !== 'android') return
    return ouvirCancelamentoPlay(() => {
      if (tipoServidorRef.current === 'obrigatoria') setDispensado(false)
    })
  }, [])

  const obrigatoria = tipoServidor === 'obrigatoria'
  // Dispensável também quando só o Play sabe da versão nova.
  const tipo = obrigatoria ? 'obrigatoria' : (tipoServidor === 'opcional' || play?.disponivel) ? 'opcional' : null
  const mostrarModal = !!tipo && (obrigatoria || !dispensado)

  const fechar = () => { if (!obrigatoria) setDispensado(true) }

  const atualizar = useCallback(async () => {
    if (iniciandoRef.current) return
    iniciandoRef.current = true
    try {
      if (Platform.OS === 'android' && play?.disponivel && play?.imediata) {
        const aberto = await iniciarAtualizacaoImediata()
        if (aberto) {
          // A tela do Google está na frente; o modal dispensável sai para não disputar a
          // tela (o bloqueante fica, e volta a aparecer se a pessoa cancelar).
          if (!obrigatoria) setDispensado(true)
          return
        }
      }
      abrirLoja()
    } finally {
      iniciandoRef.current = false
    }
  }, [play, obrigatoria])

  if (!mostrarModal) return null

  return (
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
})
