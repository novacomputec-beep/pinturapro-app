import React, { useState, useEffect } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Modal de avaliação por estrelas (1..5) exibido após um contrato finalizado.
// Segue o padrão visual de CelebracaoMatchHost (backdrop escurecido + card central).
// O envio real fica a cargo do pai via onEnviar(estrelas); aqui só controlamos a
// seleção de estrelas e o estado local de "Enviando...".
export default function ModalAvaliacao({ visivel, nomeAvaliado, onEnviar, onFechar }) {
  const [estrelas, setEstrelas] = useState(0)
  const [enviando, setEnviando] = useState(false)

  // Zera a seleção sempre que o modal é reaberto (novo contrato a avaliar).
  useEffect(() => {
    if (visivel) { setEstrelas(0); setEnviando(false) }
  }, [visivel])

  const enviar = async () => {
    if (estrelas < 1 || enviando) return
    setEnviando(true)
    try {
      await onEnviar(estrelas)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          <Text style={estilos.titulo}>Como foi sua experiência?</Text>
          <Text style={estilos.subtitulo}>Avalie {nomeAvaliado}</Text>

          <View style={estilos.estrelasRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setEstrelas(n)}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                activeOpacity={0.7}
              >
                <Text style={[estilos.estrela, n <= estrelas ? estilos.estrelaCheia : estilos.estrelaVazia]}>
                  {n <= estrelas ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[estilos.cta, (estrelas < 1 || enviando) && estilos.ctaDesabilitado]}
            onPress={enviar}
            disabled={estrelas < 1 || enviando}
            activeOpacity={0.85}
          >
            <Text style={estilos.ctaTexto}>{enviando ? 'Enviando...' : 'Enviar avaliação'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.depois} onPress={onFechar} disabled={enviando} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={estilos.depoisTexto}>Agora não</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:          { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.primaria, padding: 28, alignItems: 'center' },
  titulo:        { fontSize: 22, fontWeight: '800', color: cores.primaria, textAlign: 'center', marginBottom: 10, letterSpacing: -0.3 },
  subtitulo:     { fontSize: 14, color: cores.textoMedio, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  estrelasRow:   { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  estrela:       { fontSize: 40, marginHorizontal: 4 },
  estrelaCheia:  { color: '#E8833A' },
  estrelaVazia:  { color: cores.textoFraco },
  cta:           { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 12 },
  ctaDesabilitado:{ opacity: 0.5 },
  ctaTexto:      { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  depois:        { paddingVertical: 8 },
  depoisTexto:   { color: cores.textoFraco, fontSize: 13 },
})
