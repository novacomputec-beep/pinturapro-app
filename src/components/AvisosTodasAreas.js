import React from 'react'
import { View, Text, Switch, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Arte-Avisos-Todos: a linha do Perfil do PROFISSIONAL, logo abaixo de "Minhas especialidades",
// que liga/desliga o aviso "fora da sua área" (usuarios.avisos_todas_areas, por conta, nasce
// ligado). Com ele ligado, um pedido publicado na cidade que NÃO é da área do profissional
// também chega — só por push, nunca por e-mail. Só apresentação: quem grava é o Perfil
// (PUT /auth/perfil); a Galeria usa o mesmo componente com estado local.
export const TITULO_AVISOS_TODAS_AREAS = 'Quero receber avisos de pedidos de todas as áreas'
export const SUBTITULO_AVISOS_TODAS_AREAS = 'Receba também pedidos de outras áreas na sua cidade. Só no celular, sem e-mail.'

// A preferência nasce LIGADA no servidor (DEFAULT TRUE): campo ausente — sessão gravada antes
// de o campo existir, API antiga — vale ligado. Só um `false` de verdade desliga.
export const avisosTodasAreasLigado = (...fontes) => {
  for (const u of fontes) if (typeof u?.avisos_todas_areas === 'boolean') return u.avisos_todas_areas
  return true
}

// Card verde DENTRO do cartão de ações do Perfil (que tem overflow hidden): 8 de margem + 8 de
// padding deixam o sino alinhado aos 16 das outras linhas, como a borda vermelha do "Corrigir".
// `desabilitado` trava o Switch enquanto a gravação está em voo.
export default function LinhaAvisosTodasAreas({ valor, onMudar, desabilitado }) {
  return (
    <View style={estilos.card}>
      <Text style={estilos.emoji}>🔔</Text>
      <View style={estilos.textos}>
        <Text style={estilos.titulo}>{TITULO_AVISOS_TODAS_AREAS}</Text>
        <Text style={estilos.subtitulo}>{SUBTITULO_AVISOS_TODAS_AREAS}</Text>
      </View>
      <Switch
        value={!!valor}
        onValueChange={onMudar}
        disabled={!!desabilitado}
        trackColor={{ false: cores.textoFraco, true: cores.sucesso }}
        thumbColor={cores.branco}
        accessibilityLabel={TITULO_AVISOS_TODAS_AREAS}
      />
    </View>
  )
}

const estilos = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.sucessoSuave, borderWidth: 1, borderColor: cores.sucesso, borderRadius: raios.medio, marginHorizontal: 8, marginVertical: 6, paddingHorizontal: 8, paddingVertical: 12 },
  emoji: { fontSize: 20 },
  textos: { flex: 1, minWidth: 0 },
  titulo: { fontSize: 14, fontWeight: '700', color: cores.textoForte, lineHeight: 19, marginBottom: 3 },
  subtitulo: { fontSize: 12, color: cores.textoMedio, lineHeight: 17 },
})
