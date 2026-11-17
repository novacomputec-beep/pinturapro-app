import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'
import ModalSuporte from './ModalSuporte'

// Histórico do PROFISSIONAL (CardInteresse e CardCandidatura): o cliente trocou de profissional
// ou cancelou o pedido com o atendimento EM ANDAMENTO. A API manda
// encerrado_pelo_cliente_em_andamento = 'trocado' | 'cancelado' | null em GET
// /reparos/meus-interesses e GET /candidaturas/minhas (pinturapro-api 78fb167). Três peças, para
// cada card pôr no lugar dele:
//   PilulaEncerradoPeloCliente — pílula cinza "Trocado pelo cliente" / "Cancelado pelo cliente";
//   LinhaSemFalta              — linha verde "✓ Isso não conta como falta para você.";
//   LinkFaleComProTudo         — divisória + link vermelho que abre o ModalSuporte deste pedido.
const ROTULOS = { trocado: 'Trocado pelo cliente', cancelado: 'Cancelado pelo cliente' }

export const rotuloEncerradoPeloCliente = (item) => ROTULOS[item?.encerrado_pelo_cliente_em_andamento] || null

export const PilulaEncerradoPeloCliente = ({ item }) => {
  const rotulo = rotuloEncerradoPeloCliente(item)
  if (!rotulo) return null
  return (
    <View style={estilos.pilula}>
      <Text style={estilos.pilulaTexto}>{rotulo}</Text>
    </View>
  )
}

export const LinhaSemFalta = ({ item, style }) => (
  rotuloEncerradoPeloCliente(item) ? <Text style={[estilos.semFalta, style]}>✓ Isso não conta como falta para você.</Text> : null
)

// tipo: 'reparo' | 'obra'. O pedido vai identificado na mensagem do suporte (contexto).
export function LinkFaleComProTudo({ item, tipo, usuario }) {
  const [aberto, setAberto] = useState(false)
  const rotulo = rotuloEncerradoPeloCliente(item)
  if (!rotulo) return null
  const ehObra = tipo === 'obra'
  const titulo = (ehObra ? (item.obra_titulo || item.titulo) : item.titulo) || ''
  const id = ehObra ? item.obra_id : item.reparo_id
  const contexto = `[${ehObra ? 'Obra' : 'Serviço'} "${String(titulo).slice(0, 80)}" · ${id || '?'} · ${rotulo}]`
  return (
    <>
      <View style={estilos.divisoria} />
      <TouchableOpacity onPress={() => setAberto(true)} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6 }} accessibilityRole="link">
        <Text style={estilos.link}>🚩 Não foi isso que aconteceu? Fale com o ProTudo</Text>
      </TouchableOpacity>
      {aberto ? (
        <ModalSuporte visivel telefoneInicial={usuario?.telefone} contexto={contexto} onFechar={() => setAberto(false)} />
      ) : null}
    </>
  )
}

const estilos = StyleSheet.create({
  // Cinza neutro, como o "Não selecionado": não é falta nem erro do profissional.
  pilula:      { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pilulaTexto: { fontSize: 11, fontWeight: '700', color: cores.textoMedio },
  semFalta:    { fontSize: 12, fontWeight: '600', color: cores.sucesso, lineHeight: 17, marginBottom: 10 },
  divisoria:   { height: StyleSheet.hairlineWidth, backgroundColor: cores.borda, marginTop: 12, marginBottom: 10 },
  link:        { fontSize: 12, fontWeight: '600', color: cores.perigo, textAlign: 'center' },
})
