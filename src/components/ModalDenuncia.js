import React, { useState, useEffect } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native'
import { cores, raios } from '../utils/tema'

// Modal de denúncia do contrato finalizado, aberto pelo PROFISSIONAL sobre o solicitante.
// Segue o padrão visual de ModalAvaliacao (backdrop escurecido + card central, fade) com a
// moldura de perigo do ModalExcluirConta, porque é uma ação séria — mas reversível pelo
// suporte, não destrutiva aqui.
//
// Categoria e descrição são AMBAS obrigatórias: os ids abaixo são exatamente os aceitos
// pelo CHECK de categoria da API, e o servidor rejeita descrição vazia — melhor travar o
// botão aqui do que devolver erro depois de a pessoa já ter escrito a denúncia.
// O POST real fica a cargo do pai via onEnviar(categoria, descricao) — aqui só cuidamos da
// seleção, do texto e do estado local de "Enviando..." (trava toque duplo).
export const CATEGORIAS_DENUNCIA = [
  { id: 'nao_pagamento',     label: 'Não pagou o combinado' },
  { id: 'nao_compareceu',    label: 'Não compareceu / sumiu' },
  { id: 'servico_diferente', label: 'Serviço diferente do combinado' },
  { id: 'assedio',           label: 'Assédio' },
  { id: 'local_inseguro',    label: 'Local inseguro' },
  { id: 'fraude',            label: 'Fraude' },
  { id: 'outro',             label: 'Outro' },
]

export default function ModalDenuncia({ visivel, nomeDenunciado, onEnviar, onFechar }) {
  const [categoria, setCategoria] = useState(null)
  const [descricao, setDescricao] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Zera tudo a cada reabertura: a denúncia anterior não pode vazar para outro contrato.
  useEffect(() => {
    if (visivel) { setCategoria(null); setDescricao(''); setEnviando(false) }
  }, [visivel])

  // Válido = categoria escolhida + texto com conteúdo real (só espaço não conta, é o que a
  // API recusaria de qualquer forma).
  const texto = descricao.trim()
  const valido = !!categoria && texto.length > 0

  const enviar = async () => {
    if (!valido || enviando) return
    setEnviando(true)
    try {
      await onEnviar(categoria, texto)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          <Text style={estilos.titulo}>Denunciar</Text>
          <Text style={estilos.subtitulo}>
            {nomeDenunciado ? `Conte o que houve com ${nomeDenunciado}.` : 'Conte o que houve neste contrato.'}
            {'\n'}Nossa equipe analisa cada denúncia.
          </Text>

          {/* ScrollView: com 5 categorias + campo de texto o card passa da tela em
              aparelho pequeno, e o teclado ainda come metade da altura. */}
          <ScrollView style={estilos.lista} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {CATEGORIAS_DENUNCIA.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[estilos.opcao, categoria === c.id && estilos.opcaoAtiva]}
                onPress={() => setCategoria(c.id)}
                disabled={enviando}
                activeOpacity={0.7}
              >
                <Text style={[estilos.opcaoTexto, categoria === c.id && estilos.opcaoTextoAtivo]}>
                  {categoria === c.id ? '● ' : '○ '}{c.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TextInput
              style={estilos.input}
              value={descricao}
              onChangeText={setDescricao}
              placeholder="Descreva o que aconteceu"
              placeholderTextColor={cores.textoMutado}
              multiline
              numberOfLines={4}
              maxLength={1000}
              editable={!enviando}
              textAlignVertical="top"
            />
          </ScrollView>

          <TouchableOpacity
            style={[estilos.cta, (!valido || enviando) && estilos.ctaDesabilitado]}
            onPress={enviar}
            disabled={!valido || enviando}
            activeOpacity={0.85}
          >
            <Text style={estilos.ctaTexto}>{enviando ? 'Enviando...' : 'Enviar denúncia'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.fechar} onPress={onFechar} disabled={enviando} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={estilos.fecharTexto}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:            { width: '100%', maxWidth: 380, maxHeight: '85%', backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.perigo, padding: 24 },
  titulo:          { fontSize: 22, fontWeight: '800', color: cores.perigo, textAlign: 'center', marginBottom: 8, letterSpacing: -0.3 },
  subtitulo:       { fontSize: 13, color: cores.textoMedio, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  lista:           { width: '100%', marginBottom: 16 },
  opcao:           { borderWidth: 0.5, borderColor: cores.borda, backgroundColor: cores.fundoElevado, borderRadius: raios.medio, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8 },
  opcaoAtiva:      { borderColor: cores.perigo, backgroundColor: cores.perigo + '15' },
  opcaoTexto:      { fontSize: 13, color: cores.textoMedio, fontWeight: '500' },
  opcaoTextoAtivo: { color: cores.perigo, fontWeight: '700' },
  input:           { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: cores.textoForte, minHeight: 92, marginTop: 4 },
  cta:             { backgroundColor: cores.perigo, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 8 },
  ctaDesabilitado: { opacity: 0.5 },
  ctaTexto:        { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  fechar:          { paddingVertical: 8, alignItems: 'center' },
  fecharTexto:     { color: cores.textoFraco, fontSize: 13 },
})
