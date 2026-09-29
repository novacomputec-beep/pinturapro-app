import React, { useEffect, useState } from 'react'
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native'
import * as Application from 'expo-application'
import api from '../services/api'
import { cores, raios } from '../utils/tema'

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

export default function AvisoAtualizacao() {
  // null = nada a mostrar | 'obrigatoria' | 'opcional'
  const [tipo, setTipo] = useState(null)

  useEffect(() => {
    let montado = true
    const instalada = partesVersao(Application.nativeApplicationVersion)
    if (!instalada || !LOJA) return
    api.get('/config/versao-app')
      .then((resp) => {
        if (!montado) return
        const daPlataforma = resp?.[Platform.OS]
        const minima = partesVersao(daPlataforma?.minima)
        const atual = partesVersao(daPlataforma?.atual)
        if (minima && versaoMenor(instalada, minima)) setTipo('obrigatoria')
        else if (atual && versaoMenor(instalada, atual)) setTipo('opcional')
      })
      .catch(() => {})
    return () => { montado = false }
  }, [])

  if (!tipo) return null

  const obrigatoria = tipo === 'obrigatoria'
  const fechar = () => { if (!obrigatoria) setTipo(null) }

  const abrirLoja = () => {
    const tentativa = LOJA.app
      ? Linking.openURL(LOJA.app).catch(() => Linking.openURL(LOJA.web))
      : Linking.openURL(LOJA.web)
    tentativa.catch(() => {})
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={fechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          <Image source={require('../../assets/logo.png')} style={estilos.icone} resizeMode="contain" />
          <Text style={estilos.titulo}>{TEXTOS[tipo].titulo}</Text>
          <Text style={estilos.texto}>{TEXTOS[tipo].texto}</Text>

          <TouchableOpacity style={estilos.cta} onPress={abrirLoja} activeOpacity={0.85}>
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
