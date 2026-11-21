import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { cores } from '../utils/tema'

// Conta oficial do ProTudo (21/11/2026): a API devolve dono_oficial: true no feed e no detalhe
// das demandas dela (pinturapro-api 430eda1, utils/contaOficial.js). Tudo o que marca o pedido
// oficial mora aqui para os dois feeds e os dois detalhes não divergirem.
export const AZUL_OFICIAL = '#1D9BF0'
export const NOME_OFICIAL = 'ProTudo'
export const ehDonoOficial = (demanda) => demanda?.dono_oficial === true

// Borda do card do feed quando o pedido é oficial.
export const estiloCardOficial = { borderWidth: 2, borderColor: AZUL_OFICIAL }

// Roseta de 16 pontas: 16 lóbulos em volta de um disco, num viewBox de 24.
const LOBULOS = Array.from({ length: 16 }, (_, i) => {
  const a = (i * 2 * Math.PI) / 16
  return { cx: 12 + 9 * Math.cos(a), cy: 12 + 9 * Math.sin(a) }
})

// Selo de verificado: roseta azul com o "✓" branco.
export default function SeloOficial({ size = 14 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Conta verificada">
      <Circle cx={12} cy={12} r={9.4} fill={AZUL_OFICIAL} />
      {LOBULOS.map((p, i) => <Circle key={i} cx={p.cx} cy={p.cy} r={2.4} fill={AZUL_OFICIAL} />)}
      <Path d="M7.4 12.4l3.1 3.1 6.1-6.6" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

// Pill do topo do card: "Pedido oficial ProTudo" + selo.
export const PillPedidoOficial = ({ estilo }) => (
  <View style={[estilos.pill, estilo]}>
    <SeloOficial size={14} />
    <Text style={estilos.pillTexto} numberOfLines={1}>Pedido oficial {NOME_OFICIAL}</Text>
  </View>
)

// Linha do dono: "ProTudo" + selo + "· conta verificada".
export const LinhaDonoOficial = ({ estilo, grande = false }) => (
  <View style={[estilos.linha, estilo]}>
    <Text style={[estilos.nome, grande && estilos.nomeGrande]} numberOfLines={1}>{NOME_OFICIAL}</Text>
    <SeloOficial size={grande ? 16 : 14} />
    <Text style={[estilos.verificada, grande && estilos.verificadaGrande]} numberOfLines={1}>· conta verificada</Text>
  </View>
)

const estilos = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, backgroundColor: AZUL_OFICIAL + '26', borderWidth: 0.5, borderColor: AZUL_OFICIAL + '80', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillTexto: { fontSize: 12, fontWeight: '700', color: AZUL_OFICIAL, flexShrink: 1 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nome: { fontSize: 12, fontWeight: '700', color: cores.textoForte, flexShrink: 1 },
  nomeGrande: { fontSize: 14 },
  verificada: { fontSize: 12, color: cores.textoMedio, flexShrink: 0 },
  verificadaGrande: { fontSize: 13 },
})
