import React, { useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import BannerErroCarregamento from '../../components/BannerErroCarregamento'
import { useAuth } from '../../contexts/AuthContext'
import { buscarDicas, lerDicasVistas, contarNovas, rotuloNovas } from '../../services/dicas'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

// "💡 Dicas do ProTudo" (Arte-Dicas): hero e a lista de temas de GET /dicas (services/dicas),
// cada um com ícone, nome, quantas dicas tem e quantas ainda não foram vistas. Tocar abre a
// DicasTemaScreen com os cards. Mesmo esqueleto das outras telas do PerfilStack: seta de
// voltar, puxar-para-atualizar e banner de erro que nunca esconde o que já carregou. O
// conteúdo é exportado (DicasConteudo) para a Galeria.

export function DicasConteudo({ temas, vistas, carregando, erro, onRetry, onAbrirTema }) {
  return (
    <>
      <LinearGradient colors={['#ff8a3d', '#f05a28', '#c2410c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.hero}>
        <Text style={estilos.heroEmoji}>💡</Text>
        <Text style={estilos.heroTitulo} maxFontSizeMultiplier={1.3}>Use o ProTudo como um expert</Text>
        <Text style={estilos.heroSub} maxFontSizeMultiplier={1.3}>Regras e atalhos que fazem seu pedido andar mais rápido.</Text>
      </LinearGradient>

      {!!onRetry && <BannerErroCarregamento mensagem={erro} onRetry={onRetry} />}

      {carregando ? (
        <ActivityIndicator color={cores.primaria} size="large" style={{ marginTop: 32 }} />
      ) : temas.length === 0 ? (
        !erro && <Text style={estilos.vazio}>Nenhuma dica por aqui ainda.</Text>
      ) : (
        temas.map((t) => {
          const total = t.dicas.length
          const novas = contarNovas([t], vistas)
          return (
            <TouchableOpacity
              key={t.tema}
              style={estilos.card}
              onPress={() => onAbrirTema(t)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t.tema}, ${total} dica${total === 1 ? '' : 's'}${novas ? `, ${rotuloNovas(novas)}` : ''}`}
            >
              <Text style={estilos.cardIcone}>{t.icone}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={estilos.cardTitulo} maxFontSizeMultiplier={1.3}>{t.tema}</Text>
                <Text style={estilos.cardSub} maxFontSizeMultiplier={1.3}>{total} dica{total === 1 ? '' : 's'}</Text>
              </View>
              {novas > 0 && (
                <View style={estilos.badge}><Text style={estilos.badgeTexto}>{rotuloNovas(novas)}</Text></View>
              )}
              <Text style={estilos.seta}>→</Text>
            </TouchableOpacity>
          )
        })
      )}
    </>
  )
}

export default function DicasScreen({ navigation }) {
  const { usuario } = useAuth()
  const [temas, setTemas] = useState(null)
  const [vistas, setVistas] = useState(() => new Set())
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState(null)
  const montadoRef = useRef(true)
  useEffect(() => () => { montadoRef.current = false }, [])

  // Relê a cada foco (forçando a API): ao voltar de um tema, as vistas mudaram e o contador de
  // cada card precisa cair; e uma dica nova publicada pelo admin aparece sem reabrir o app.
  const buscar = async () => {
    try {
      const [r, v] = await Promise.all([buscarDicas({ forcar: true }), lerDicasVistas(usuario?.id)])
      if (!montadoRef.current) return
      setTemas(r.temas)
      setVistas(v)
      setErro(null)
    } catch (err) {
      console.log('[Dicas] falha ao carregar | status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem)
      if (montadoRef.current) setErro('Não foi possível carregar as dicas.')
    } finally {
      if (montadoRef.current) { setCarregando(false); setAtualizando(false) }
    }
  }

  useFocusEffect(useCallback(() => { buscar() }, [usuario?.id]))

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <ScrollView
        contentContainerStyle={[estilos.lista, larguraMaxima]}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); buscar() }} tintColor={cores.primaria} />}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
          <Text style={estilos.voltarIcone}>←</Text>
        </TouchableOpacity>
        <DicasConteudo
          temas={temas || []}
          vistas={vistas}
          carregando={carregando && !temas}
          erro={erro}
          onRetry={buscar}
          onAbrirTema={(tema) => navigation.navigate('DicasTema', { tema })}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  lista: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico },
  btnVoltar: { marginTop: 16, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  voltarIcone: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  // Hero laranja: mesmo gradiente do "Convide um colega".
  hero: { borderRadius: raios.grande, padding: 20, marginBottom: 16 },
  heroEmoji: { fontSize: 32, marginBottom: 8 },
  heroTitulo: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 28, marginBottom: 6 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 19 },
  vazio: { fontSize: 13, color: cores.textoMedio, textAlign: 'center', marginTop: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, marginBottom: 10 },
  cardIcone: { fontSize: 26 },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: cores.textoForte, lineHeight: 20 },
  cardSub: { fontSize: 12, color: cores.textoMedio, marginTop: 2 },
  badge: { backgroundColor: cores.primariaSuave, borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeTexto: { fontSize: 11, fontWeight: '700', color: cores.primaria },
  seta: { fontSize: 14, color: cores.textoFraco },
})
