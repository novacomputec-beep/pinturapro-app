import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Clipboard from 'expo-clipboard'
import BannerErroCarregamento from '../../components/BannerErroCarregamento'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'
import { mostrarAviso } from '../../utils/deepLink'
import { buscarMinhasIndicacoes, mensagemConvite, convidarPeloWhatsApp, META_EMBAIXADOR } from '../../utils/indicacao'

// "Convide um colega" — só para o profissional (o item do Perfil que abre esta tela vive no
// bloco ehPrestador). Tudo que a tela mostra vem de GET /indicacoes/minhas (utils/indicacao):
// o código e o link pessoais, e os três números dos boxes. Mesmo esqueleto das outras telas
// do PerfilStack (AvaliacoesRecebidas): seta de voltar, título, puxar-para-atualizar e o
// banner de erro de carregamento, que nunca esconde o que já carregou. Copiar usa o
// expo-clipboard (o Clipboard do core do RN está depreciado).

const Stat = ({ numero, rotulo }) => (
  <View style={estilos.stat}>
    <Text style={estilos.statNumero}>{numero}</Text>
    <Text style={estilos.statRotulo} numberOfLines={2}>{rotulo}</Text>
  </View>
)

export default function ConvidarColegaScreen({ navigation }) {
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState(null)

  const buscar = async () => {
    try {
      const d = await buscarMinhasIndicacoes()
      setDados(d)
      setErro(null)
    } catch (err) {
      console.log('[ConvidarColega] falha ao carregar indicações | status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem)
      setErro('Não foi possível carregar suas indicações.')
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscar() }, []))

  const onRefresh = () => { setAtualizando(true); buscar() }

  const codigo = dados?.codigo || ''
  const link = dados?.link || ''
  const temLink = !!(codigo && link)

  const convidar = () => {
    if (!temLink) return
    convidarPeloWhatsApp(mensagemConvite(codigo, link))
  }

  const copiar = async () => {
    if (!temLink) return
    try {
      await Clipboard.setStringAsync(link)
      mostrarAviso('Link copiado!')
    } catch (err) {
      console.log('[ConvidarColega] falha ao copiar | msg:', err?.message)
      mostrarAviso('Não foi possível copiar. Segure o link para selecionar.')
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <ScrollView
        contentContainerStyle={[estilos.lista, larguraMaxima]}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
        </TouchableOpacity>

        {/* Hero laranja: mesmo gradiente dos cartões de convite do feed. */}
        <LinearGradient colors={['#ff8a3d', '#f05a28', '#c2410c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.hero}>
          <Text style={estilos.heroEmoji}>🤝</Text>
          <Text style={estilos.heroTitulo} maxFontSizeMultiplier={1.3}>Traga um colega para o ProTudo</Text>
          <Text style={estilos.heroSub} maxFontSizeMultiplier={1.3}>Quanto mais profissionais, mais clientes chegam para todos.</Text>
        </LinearGradient>

        <BannerErroCarregamento mensagem={erro} onRetry={buscar} />

        {carregando && !dados ? (
          <ActivityIndicator color={cores.primaria} style={{ marginTop: 32 }} />
        ) : (
          <>
            <Text style={estilos.secaoTitulo}>Seu link pessoal</Text>
            <View style={estilos.linkBox}>
              <Text style={estilos.linkTexto} selectable>{temLink ? link : 'Link indisponível no momento'}</Text>
              {!!codigo && <Text style={estilos.linkCodigo}>Código: <Text style={{ color: cores.primaria, fontWeight: '800' }}>{codigo}</Text></Text>}
            </View>

            <TouchableOpacity style={[estilos.btnWhats, !temLink && { opacity: 0.5 }]} onPress={convidar} disabled={!temLink} activeOpacity={0.85} accessibilityRole="button">
              <Text style={estilos.btnWhatsTexto}>Convidar pelo WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[estilos.btnCopiar, !temLink && { opacity: 0.5 }]} onPress={copiar} disabled={!temLink} activeOpacity={0.8} accessibilityRole="button">
              <Text style={estilos.btnCopiarTexto}>📋 Copiar link</Text>
            </TouchableOpacity>

            <View style={estilos.card}>
              <Text style={estilos.cardTitulo}>🎁 O que você ganha</Text>
              <View style={estilos.beneficio}>
                <Text style={estilos.beneficioIcone}>📅</Text>
                <Text style={estilos.beneficioTexto}>
                  <Text style={estilos.beneficioForte}>+1 mês grátis</Text> por colega aprovado, depois do seu ano gratuito (até 12 meses).
                </Text>
              </View>
              <View style={[estilos.beneficio, { marginBottom: 0 }]}>
                <Text style={estilos.beneficioIcone}>🏅</Text>
                <Text style={estilos.beneficioTexto}>
                  <Text style={estilos.beneficioForte}>Selo Embaixador ProTudo</Text> com {META_EMBAIXADOR} indicações — aparece para os clientes ao lado do seu nome.
                </Text>
              </View>
            </View>

            <View style={estilos.stats}>
              <Stat numero={dados?.indicados ?? 0} rotulo="Colegas indicados" />
              <Stat numero={dados?.mesesGanhos ?? 0} rotulo="Meses ganhos" />
              <Stat numero={dados?.embaixador ? '🏅' : (dados?.paraSelo ?? META_EMBAIXADOR)} rotulo={dados?.embaixador ? 'Embaixador' : 'Para o selo'} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo, paddingHorizontal: espacos.tela },
  lista: { paddingBottom: 32 + alturas.barraServico },
  btnVoltar: { marginTop: 60, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  hero: { borderRadius: 18, padding: 20, marginBottom: 20 },
  heroEmoji: { fontSize: 36, marginBottom: 8 },
  heroTitulo: { fontSize: 22, fontWeight: '900', lineHeight: 27, color: '#FFFFFF', marginBottom: 6 },
  heroSub: { fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.92)' },
  secaoTitulo: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  // Caixa tracejada do link: mesmo contorno tracejado do uploadBtn de PainelMidiaDemanda,
  // na cor da marca, para o link ler como "o seu", e não como um campo a preencher.
  linkBox: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: cores.primaria, borderRadius: raios.medio, padding: 14, marginBottom: 14, backgroundColor: cores.primaria + '0F' },
  linkTexto: { fontSize: 14, fontWeight: '600', color: cores.textoForte, lineHeight: 20 },
  linkCodigo: { fontSize: 12, color: cores.textoMedio, marginTop: 6 },
  // Verde do WhatsApp: cor da marca dele, não do tema, porque o botão fala do app de fora.
  btnWhats: { backgroundColor: '#25D366', borderRadius: raios.medio, padding: 16, alignItems: 'center', marginBottom: 10 },
  btnWhatsTexto: { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  btnCopiar: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 20 },
  btnCopiarTexto: { color: cores.textoForte, fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 16, marginBottom: 16 },
  cardTitulo: { fontSize: 11, fontWeight: '700', color: cores.primaria, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  beneficio: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  beneficioIcone: { fontSize: 18, lineHeight: 22 },
  beneficioTexto: { flex: 1, fontSize: 13, color: cores.textoMedio, lineHeight: 20 },
  beneficioForte: { color: cores.textoForte, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
  statNumero: { fontSize: 24, fontWeight: '800', color: cores.primaria, fontVariant: ['tabular-nums'] },
  statRotulo: { fontSize: 11, color: cores.textoMedio, textAlign: 'center', marginTop: 4, lineHeight: 15 },
})
