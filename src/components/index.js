import React from 'react'
import {
  View, Text, TouchableOpacity, TextInput,
  ActivityIndicator, StyleSheet
} from 'react-native'
import { cores, fontes, raios, espacos } from '../utils/tema'

// Seção de mídia compartilhada (obra/reparo) — Fase 3.
export { default as PainelMidiaDemanda } from './PainelMidiaDemanda'

// ─── BOTÃO PRIMÁRIO ──────────────────────────────────────────
export const BotaoPrimario = ({ titulo, onPress, carregando, desabilitado, estilo }) => (
  <TouchableOpacity
    style={[estilos.btnPrimario, desabilitado && estilos.btnDesabilitado, estilo]}
    onPress={onPress}
    disabled={carregando || desabilitado}
    activeOpacity={0.8}
  >
    {carregando
      ? <ActivityIndicator color="#0A0A0A" size="small" />
      : <Text style={estilos.btnPrimarioTexto}>{titulo}</Text>
    }
  </TouchableOpacity>
)

// ─── BOTÃO SECUNDÁRIO ────────────────────────────────────────
export const BotaoSecundario = ({ titulo, onPress, estilo }) => (
  <TouchableOpacity
    style={[estilos.btnSecundario, estilo]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={estilos.btnSecundarioTexto}>{titulo}</Text>
  </TouchableOpacity>
)

// ─── INPUT ───────────────────────────────────────────────────
// estiloInput: override OPCIONAL do box do TextInput (não do wrapper). Fica ANTES de
// inputErro para que a borda de erro (vermelha) sempre prevaleça quando há erro.
export const Input = ({ label, erro, estilo, estiloInput, ...props }) => (
  <View style={[estilos.inputWrap, estilo]}>
    {label && <Text style={estilos.inputLabel}>{label}</Text>}
    <TextInput
      style={[estilos.input, estiloInput, erro && estilos.inputErro]}
      placeholderTextColor={cores.textoMutado}
      {...props}
    />
    {erro && <Text style={estilos.inputErroTexto}>{erro}</Text>}
  </View>
)

// ─── BADGE DE STATUS ─────────────────────────────────────────
export const BadgeStatus = ({ status }) => {
  const configs = {
    aberta:     { cor: cores.sucesso,   fundo: cores.sucessoSuave,  texto: 'Aberta'      },
    em_analise: { cor: cores.primaria,  fundo: cores.primariaSuave, texto: 'Em análise'  },
    encerrada:  { cor: cores.textoFraco, fundo: cores.fundoElevado, texto: 'Encerrada'   },
    pendente:   { cor: cores.primaria,  fundo: cores.primariaSuave, texto: 'Pendente'    },
    aprovada:   { cor: cores.sucesso,   fundo: cores.sucessoSuave,  texto: 'Aprovada'    },
    recusada:   { cor: cores.perigo,    fundo: cores.perigoSuave,   texto: 'Recusada'    },
    // Vocabulário do fluxo aceitar/recusar via DetalheObra (espelha aprovada/recusada)
    aceito:              { cor: cores.sucesso,  fundo: cores.sucessoSuave,  texto: 'Aceita'         },
    recusado:            { cor: cores.perigo,   fundo: cores.perigoSuave,   texto: 'Recusada'       },
    contraproposta_dono: { cor: cores.primaria, fundo: cores.primariaSuave, texto: 'Contraproposta' },
  }
  const cfg = configs[status] || configs.encerrada
  return (
    <View style={[estilos.badge, { backgroundColor: cfg.fundo, borderColor: cfg.cor + '66' }]}>
      <View style={[estilos.badgeDot, { backgroundColor: cfg.cor }]} />
      <Text style={[estilos.badgeTexto, { color: cfg.cor }]}>{cfg.texto}</Text>
    </View>
  )
}

// ─── CARD GENÉRICO ───────────────────────────────────────────
export const Card = ({ children, estilo }) => (
  <View style={[estilos.card, estilo]}>{children}</View>
)

// ─── SEPARADOR ───────────────────────────────────────────────
export const Separador = ({ estilo }) => (
  <View style={[estilos.separador, estilo]} />
)

// ─── TAG ─────────────────────────────────────────────────────
export const Tag = ({ texto }) => (
  <View style={estilos.tag}>
    <Text style={estilos.tagTexto}>{texto}</Text>
  </View>
)

// ─── SELETOR DE LOCALIDADE ───────────────────────────────────
export { default as SeletorLocalidade } from './SeletorLocalidade'

// ─── ESTILOS ─────────────────────────────────────────────────
const estilos = StyleSheet.create({
  btnPrimario: {
    backgroundColor: cores.primaria,
    borderRadius: raios.grande,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimarioTexto: {
    color: '#0A0A0A',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  btnDesabilitado: {
    opacity: 0.5,
  },
  btnSecundario: {
    backgroundColor: 'transparent',
    borderRadius: raios.grande,
    borderWidth: 0.5,
    borderColor: cores.borda,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnSecundarioTexto: {
    color: cores.textoMedio,
    fontSize: 14,
  },
  inputWrap: {
    marginBottom: espacos.md,
  },
  inputLabel: {
    fontSize: 11,
    color: cores.textoForte,
    letterSpacing: 0.5,
    marginBottom: 7,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: cores.fundoInput,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: raios.medio,
    paddingHorizontal: espacos.lg,
    paddingVertical: 13,
    fontSize: 14,
    color: cores.textoForte,
  },
  inputErro: {
    borderColor: cores.perigo,
  },
  inputErroTexto: {
    color: cores.perigo,
    fontSize: 11,
    marginTop: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: raios.pill,
    borderWidth: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    gap: 5,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  badgeTexto: {
    fontSize: 11,
    fontWeight: '500',
  },
  card: {
    backgroundColor: cores.fundoCard,
    borderRadius: raios.grande,
    borderWidth: 0.5,
    borderColor: cores.borda,
    overflow: 'hidden',
  },
  separador: {
    height: 0.5,
    backgroundColor: cores.bordaFraca,
  },
  tag: {
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tagTexto: {
    fontSize: 11,
    color: cores.textoFraco,
  },
})
