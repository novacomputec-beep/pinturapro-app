import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Seção de mídia compartilhada por CadastrarObraScreen e CadastrarReparoScreen
// (Fase 3). Puramente apresentacional: a tela é dona do hook useUploadMidiaDemanda
// e do modal do picker; aqui só renderizamos o botão de adicionar, os avisos e a
// tira de pré-visualização, alimentados via props.
//
// PARIDADE COM O FLUXO ANTIGO: o markup/estilos da tira são idênticos ao que as
// telas tinham inline. Os badges de status (Enviando/✓/⚠) só aparecem para itens
// que NÃO estão 'pendente' — como o upload em 2º plano só roda com a flag ligada,
// no fluxo antigo todos os itens ficam 'pendente' e a tira fica visualmente igual.
export default function PainelMidiaDemanda({ itens, onAbrirPicker, onRemover, onReenviar }) {
  return (
    <>
      <Text style={estilos.labelCategoria}>FOTOS E VÍDEOS</Text>
      <TouchableOpacity style={estilos.uploadBtn} onPress={onAbrirPicker}>
        <Text style={estilos.uploadIcone}>📎</Text>
        <Text style={estilos.uploadTexto}>Adicionar fotos e vídeos</Text>
      </TouchableOpacity>
      <Text style={estilos.avisoUpload}>📸 Opcional: filme e/ou tire foto(s) se realmente fizer diferença para informar o problema relatado.</Text>
      <Text style={estilos.dicaMidia}>📹 Filme no máximo 30 segundos para melhor resultado</Text>
      {itens.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {itens.map((item) => (
            <View key={item.id} style={estilos.midiaItem}>
              {item.tipo === 'video' ? (
                // Não decodifica frame de vídeo em resolução cheia — placeholder leve.
                <View style={[estilos.midiaImagem, estilos.videoPlaceholder]}>
                  <Text style={{ fontSize: 28 }}>🎬</Text>
                </View>
              ) : (
                // resizeMethod="resize" faz o Fresco (Android) decodificar um bitmap
                // já reduzido ao tamanho da view (100x100), em vez do full-res.
                <Image source={{ uri: item.localUri }} style={estilos.midiaImagem} resizeMethod="resize" resizeMode="cover" />
              )}
              {item.tipo === 'video' && <View style={estilos.videoOverlay}><Text style={{ color: 'white', fontSize: 20 }}>▶</Text></View>}

              {item.status === 'enviando' && (
                <View style={estilos.badge}>
                  <Text style={estilos.badgeTexto}>Enviando {Math.round((item.progresso || 0) * 100)}%</Text>
                </View>
              )}
              {item.status === 'enviada' && (
                <View style={[estilos.badge, estilos.badgeOk]}>
                  <Text style={estilos.badgeTexto}>✓ Enviada</Text>
                </View>
              )}
              {item.status === 'falha' && (
                <TouchableOpacity style={[estilos.badge, estilos.badgeFalha]} onPress={() => onReenviar(item.id)}>
                  <Text style={estilos.badgeTexto}>⚠ Tentar novamente</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={estilos.midiaRemover} onPress={() => onRemover(item.id)}>
                <Text style={{ color: 'white', fontSize: 12 }}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </>
  )
}

const estilos = StyleSheet.create({
  labelCategoria: { fontSize: 11, color: cores.textoForte, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  uploadBtn: { borderWidth: 1.5, borderColor: cores.borda, borderStyle: 'dashed', borderRadius: raios.medio, padding: 20, alignItems: 'center', marginBottom: 10, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  uploadIcone: { fontSize: 20 },
  uploadTexto: { fontSize: 14, color: cores.textoMedio },
  avisoUpload: { fontSize: 12, color: cores.primaria, textAlign: 'center', marginTop: 12, marginBottom: 4, fontWeight: '600', lineHeight: 18 },
  dicaMidia: { fontSize: 12, color: cores.textoFraco, marginBottom: 10, lineHeight: 18 },
  midiaItem: { width: 100, height: 100, marginRight: 8, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  midiaImagem: { width: '100%', height: '100%' },
  videoPlaceholder: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  midiaRemover: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 3, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.75)' },
  badgeOk: { backgroundColor: 'rgba(30,120,40,0.9)' },
  badgeFalha: { backgroundColor: 'rgba(170,45,45,0.92)' },
  badgeTexto: { color: 'white', fontSize: 10, fontWeight: '700' },
})
