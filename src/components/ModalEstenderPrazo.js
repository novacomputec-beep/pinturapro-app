import React, { useState, useEffect } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Modal de aumento de prazo (dono da obra/reparo). Modelado na estrutura de
// ModalAvaliacao (backdrop escurecido + card central, tappable options, fade).
// Renderiza APENAS as opções fixas cujo valor cabe em extensaoMaximaHoras — o
// orçamento 2x restante devolvido pelo detalhe. Nada de itens desabilitados: o que
// não cabe simplesmente não aparece. Se o orçamento acabou (0/ausente), mostra a
// mensagem de teto atingido em vez de uma lista vazia.
// O POST real fica a cargo do pai via onEstender(horas); aqui só controlamos a
// seleção e o estado local de "enviando" (trava toque duplo).
const OPCOES = [
  { horas: 1,  label: '+1 hora'   },
  { horas: 2,  label: '+2 horas'  },
  { horas: 6,  label: '+6 horas'  },
  { horas: 12, label: '+12 horas' },
  { horas: 24, label: '+24 horas' },
]

export default function ModalEstenderPrazo({ visivel, extensaoMaximaHoras, mensagemCap, onEstender, onFechar }) {
  const [enviando, setEnviando] = useState(false)

  // Zera o estado de envio sempre que o modal reabre.
  useEffect(() => {
    if (visivel) setEnviando(false)
  }, [visivel])

  const disponiveis = OPCOES.filter(op => op.horas <= (Number(extensaoMaximaHoras) || 0))

  const escolher = async (horas) => {
    if (enviando) return
    setEnviando(true)
    try {
      await onEstender(horas)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          <Text style={estilos.titulo}>Por quanto tempo aumentar?</Text>

          {disponiveis.length === 0 ? (
            <Text style={estilos.mensagemCap}>{mensagemCap}</Text>
          ) : (
            <View style={estilos.opcoesWrap}>
              {disponiveis.map(op => (
                <TouchableOpacity
                  key={op.horas}
                  style={[estilos.opcao, enviando && estilos.opcaoDesabilitada]}
                  onPress={() => escolher(op.horas)}
                  disabled={enviando}
                  activeOpacity={0.85}
                >
                  <Text style={estilos.opcaoTexto}>{op.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={estilos.fechar}
            onPress={onFechar}
            disabled={enviando}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={estilos.fecharTexto}>{disponiveis.length === 0 ? 'Fechar' : 'Agora não'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:            { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.primaria, padding: 28, alignItems: 'center' },
  titulo:          { fontSize: 22, fontWeight: '800', color: cores.primaria, textAlign: 'center', marginBottom: 20, letterSpacing: -0.3 },
  mensagemCap:     { fontSize: 14, color: cores.textoMedio, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  opcoesWrap:      { width: '100%', marginBottom: 12 },
  opcao:           { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 10 },
  opcaoDesabilitada:{ opacity: 0.5 },
  opcaoTexto:      { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  fechar:          { paddingVertical: 8, marginTop: 4 },
  fecharTexto:     { color: cores.textoFraco, fontSize: 13 },
})
