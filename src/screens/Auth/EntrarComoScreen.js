import React, { useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, BackHandler
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { cores, espacos, raios, larguraMaxima } from '../../utils/tema'

// Mesmas cores da escolha de perfil da CadastroScreen: laranja = trabalhar, azul = contratar.
const COR_TRABALHAR = '#F0822E'
const COR_CONTRATAR = '#6AA6F0'

// Ordem de exibição e aparência por tipo. A chave é o tipo como a API devolve em `contas`.
const TIPOS = [
  { tipo: 'reparador', icone: '🔧', cor: COR_TRABALHAR, pill: 'TRABALHAR', titulo: 'Serviços gerais e domésticos' },
  { tipo: 'pintor', icone: '🖌️', cor: COR_TRABALHAR, pill: 'TRABALHAR', titulo: 'Obras, construção e pintura' },
  { tipo: 'dono_reparo', icone: '🛠️', cor: COR_CONTRATAR, pill: 'CONTRATAR', titulo: 'Um serviço doméstico' },
  { tipo: 'dono_obra', icone: '🏠', cor: COR_CONTRATAR, pill: 'CONTRATAR', titulo: 'Uma obra, reforma ou pintura' },
]

// Item de `contas` pode vir como string ou como objeto com `tipo` — o valor lido aqui é o
// MESMO que volta para o POST /auth/login, sem tradução.
const tipoDe = (conta) => (typeof conta === 'string' ? conta : conta?.tipo)

// Tela "Entrar como:" — renderizada pela LoginScreen (não é rota) quando o login devolve
// 2+ contas. E-mail e senha ficam no estado da LoginScreen; daqui só sai o tipo escolhido.
export default function EntrarComoScreen({ contas, tipoCarregando, onEscolher, onVoltar }) {
  // Voltar do Android retorna ao login em vez de sair da pilha.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onVoltar(); return true })
    return () => sub.remove()
  }, [onVoltar])

  const tipos = (contas || []).map(tipoDe).filter(Boolean)
  const cards = [
    ...TIPOS.filter(t => tipos.includes(t.tipo)),
    // Tipo que a API devolveu e esta versão do app não conhece: aparece no fim, com o
    // próprio nome, em vez de sumir e deixar a conta inalcançável.
    ...tipos.filter(t => !TIPOS.some(k => k.tipo === t)).map(t => ({ tipo: t, icone: '👤', cor: cores.textoFraco, pill: 'CONTA', titulo: t })),
  ]

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.container}>
      <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={onVoltar} disabled={!!tipoCarregando}>
          <Text style={estilos.voltarIcone}>←</Text>
        </TouchableOpacity>
        <View style={estilos.logoWrap}>
          <Image source={require('../../../assets/logo.png')} style={estilos.logo} resizeMode="contain" />
          <Text style={estilos.logoNome}>
            <Text style={{ color: cores.marcaAzul }}>P</Text>ro<Text style={{ color: cores.primaria }}>T</Text>udo
          </Text>
          <View style={estilos.logoRegua} />
        </View>
        <Text style={[estilos.titulo, { textAlign: 'center' }]}>Entrar como:</Text>
        <Text style={[estilos.subtitulo, { textAlign: 'center' }]}>Você tem mais de um cadastro com este e-mail</Text>

        {cards.map((c, i) => (
          <TouchableOpacity
            key={c.tipo}
            style={[estilos.card, { borderColor: c.cor, backgroundColor: c.cor + '22' }, i > 0 && { marginTop: 32 }]}
            onPress={() => onEscolher(c.tipo)}
            disabled={!!tipoCarregando}
            activeOpacity={0.8}
          >
            <Text style={estilos.cardIcone}>{c.icone}</Text>
            <View style={{ flex: 1, alignItems: 'flex-start' }}>
              <View style={[estilos.pill, { borderColor: c.cor }]}>
                <Text style={[estilos.pillTexto, { color: c.cor }]}>{c.pill}</Text>
              </View>
              <Text style={[estilos.cardTitulo, { color: c.cor }]}>{c.titulo}</Text>
            </View>
            {tipoCarregando === c.tipo && <ActivityIndicator color={c.cor} />}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  // Bloco do topo (voltar, logo, nome, régua, título) com os mesmos valores da CadastroScreen.
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40, paddingTop: 8 },
  btnVoltar: { marginTop: 8, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  voltarIcone: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  logoWrap: { alignItems: 'center', marginBottom: 4 },
  logo: { width: 170, height: 64 },
  logoNome: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, marginBottom: 2 },
  logoRegua: { width: 88, height: 2, borderRadius: 1, backgroundColor: cores.primaria, marginTop: 0, marginBottom: 10 },
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 26, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 24 },
  card: { borderWidth: 2, borderRadius: raios.grande, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardIcone: { fontSize: 40 },
  pill: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10, marginBottom: 8 },
  pillTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  cardTitulo: { fontSize: 18, fontWeight: '700' },
})
