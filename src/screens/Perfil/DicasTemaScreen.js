import React, { useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../contexts/AuthContext'
import { marcarDicasVistas, idsDoTema } from '../../services/dicas'
import { normalizarEspecialidades } from '../../utils/categorias'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

// Um tema das "💡 Dicas do ProTudo" (Arte-Dicas): cards numerados com borda laranja à esquerda,
// **negrito** renderizado, etiqueta verde "NOVO" quando a API diz `nova`, e, quando a dica
// tem `acao`, um link azul que leva ao lugar certo do app. Abrir o tema marca as dicas dele
// como vistas (services/dicas) — é isso que baixa o badge "N novas" do Perfil.
// O conteúdo é exportado (DicasTemaConteudo) para a Galeria.

// Rótulo do atalho por `acao` (vocabulário fechado da API). Fora dele: sem link.
const ROTULO_ACAO = {
  ativar_avisos: '🔔 Ativar avisos',
  meus_pedidos: '📋 Ver meus pedidos',
  editar_perfil: '✏️ Editar perfil',
  especialidades: '🛠 Minhas especialidades',
  meus_perfis: '👥 Meus perfis',
}

// "**negrito**" → trechos em Text aninhado. Marcação sem par fica como texto comum.
export const renderNegrito = (texto, estiloNegrito) => {
  const partes = String(texto ?? '').split(/\*\*(.+?)\*\*/g)
  return partes.map((p, i) => (i % 2 === 1 ? <Text key={i} style={estiloNegrito}>{p}</Text> : p))
}

export function DicasTemaConteudo({ tema, onAcao, acaoDisponivel }) {
  const dicas = tema?.dicas || []
  return (
    <>
      <Text style={estilos.titulo} maxFontSizeMultiplier={1.3}>{tema?.icone} {tema?.tema}</Text>
      <Text style={estilos.subtitulo}>{dicas.length} dica{dicas.length === 1 ? '' : 's'}</Text>
      {dicas.map((d, i) => {
        const rotulo = d.acao && (!acaoDisponivel || acaoDisponivel(d.acao)) ? ROTULO_ACAO[d.acao] : null
        return (
          <View key={d.id} style={estilos.card}>
            <View style={estilos.cardTopo}>
              <View style={estilos.numero}><Text style={estilos.numeroTexto}>{i + 1}</Text></View>
              {d.nova && <View style={estilos.tagNovo}><Text style={estilos.tagNovoTexto}>NOVO</Text></View>}
            </View>
            <Text style={estilos.texto} maxFontSizeMultiplier={1.4}>{renderNegrito(d.texto, estilos.negrito)}</Text>
            {!!rotulo && (
              <TouchableOpacity onPress={() => onAcao(d.acao)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="link" accessibilityLabel={rotulo}>
                <Text style={estilos.link}>{rotulo} →</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}
    </>
  )
}

export default function DicasTemaScreen({ navigation, route }) {
  const { usuario } = useAuth()
  const tema = route.params?.tema
  const ehPrestador = usuario?.role === 'prestador' || usuario?.role === 'assinante'

  // Abriu o tema = viu as dicas dele. Uma vez por montagem; falhar só mantém o badge.
  useEffect(() => { marcarDicasVistas(usuario?.id, idsDoTema(tema)) }, [usuario?.id, tema])

  // "Minhas especialidades" só existe para o profissional; o resto vale para todos.
  const acaoDisponivel = (acao) => acao !== 'especialidades' || ehPrestador

  // Destinos: todos dentro do PerfilStack, exceto a lista de pedidos, que é a ABA da conta
  // (o navegador de abas, pai deste stack, resolve o nome). "Ativar avisos" volta ao Perfil
  // com um sinal: o fluxo de permissão (diálogo do SO / Configurações / token) mora lá, na
  // linha "🔔 Ativar notificações", e assim é um só.
  const executar = (acao) => {
    switch (acao) {
      case 'ativar_avisos':
        navigation.navigate('PerfilMain', { ativarNotificacoes: Date.now() })
        return
      case 'meus_pedidos': {
        const tipo = ehPrestador ? usuario?.tipo_prestador : usuario?.tipo_dono
        const obra = ehPrestador ? tipo === 'pintor' : tipo !== 'reparo'
        navigation.navigate(obra ? 'Minhas Obras' : 'Meus Reparos')
        return
      }
      case 'editar_perfil':
        navigation.navigate('EditarPerfil')
        return
      case 'especialidades':
        navigation.navigate('Especialidades', {
          selecionadas: normalizarEspecialidades(usuario?.especialidades),
          lado: usuario?.tipo_prestador === 'pintor' ? 'pintura' : 'reparo',
          origem: 'PerfilMain',
        })
        return
      case 'meus_perfis':
        navigation.navigate('MeusPerfis')
        return
      default:
        console.log('[DicasTema] ação desconhecida:', acao)
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <ScrollView contentContainerStyle={[estilos.lista, larguraMaxima]} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
          <Text style={estilos.voltarIcone}>←</Text>
        </TouchableOpacity>
        <DicasTemaConteudo tema={tema} onAcao={executar} acaoDisponivel={acaoDisponivel} />
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  lista: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico },
  btnVoltar: { marginTop: 16, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  voltarIcone: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  titulo: { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 30, marginBottom: 4 },
  subtitulo: { fontSize: 12, color: cores.textoMedio, marginBottom: 16 },
  // Card numerado com a borda laranja à esquerda (a arte).
  card: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderLeftWidth: 4, borderLeftColor: cores.primaria, borderRadius: raios.medio, padding: 14, marginBottom: 12 },
  cardTopo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  numero: { width: 24, height: 24, borderRadius: 12, backgroundColor: cores.primariaSuave, borderWidth: 1, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { fontSize: 12, fontWeight: '800', color: cores.primaria },
  tagNovo: { backgroundColor: cores.sucesso, borderRadius: raios.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagNovoTexto: { fontSize: 10, fontWeight: '800', color: '#0A0A0A', letterSpacing: 0.5 },
  texto: { fontSize: 14, color: cores.textoForte, lineHeight: 21 },
  negrito: { fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '700', color: cores.info, marginTop: 10 },
})
