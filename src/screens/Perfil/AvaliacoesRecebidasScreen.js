import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../services/api'
import { comRetry } from '../../utils/rede'
import { cores, espacos, raios } from '../../utils/tema'

const formatarData = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—'

// Estrelas somente-leitura. Reproduz a MESMA renderização visual do ModalAvaliacao
// (glifos ★/☆, laranja da marca), porque o modal não expõe as estrelas isoladamente e
// não devemos alterá-lo. `nota` é arredondada pelo chamador quando vier de uma média.
const Estrelas = ({ nota, tamanho = 15 }) => (
  <View style={{ flexDirection: 'row' }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Text key={n} style={{ fontSize: tamanho, marginRight: 2, color: n <= nota ? '#E8833A' : cores.textoFraco }}>
        {n <= nota ? '★' : '☆'}
      </Text>
    ))}
  </View>
)

export default function AvaliacoesRecebidasScreen({ navigation }) {
  const [avaliacoes, setAvaliacoes] = useState([])
  const [media, setMedia] = useState(0)
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)

  // Carrega a 1ª página. media/total vêm da resposta (mesma fonte agregada dos cards de
  // prestador), então batem com o número mostrado ao contratante. A API pagina
  // (page/limit); load-more por onEndReached fica como adição futura (ver relatório).
  const buscar = async () => {
    try {
      const data = await comRetry(() => api.get('/avaliacoes/recebidas'))
      setAvaliacoes(Array.isArray(data?.avaliacoes) ? data.avaliacoes : [])
      setMedia(Number(data?.media) || 0)
      setTotal(Number(data?.total) || 0)
    } catch (err) {
      console.log('[AvaliacoesRecebidas] falha ao carregar | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscar() }, []))

  const onRefresh = () => { setAtualizando(true); buscar() }

  const Cabecalho = () => (
    <>
      <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
        <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
      </TouchableOpacity>
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Avaliações recebidas</Text>
        {/* Resumo só quando há avaliações; o vazio é coberto pelo bloco dedicado abaixo. */}
        {total > 0 && (
          <View style={estilos.resumoRow}>
            <Text style={estilos.mediaNum}>{media.toFixed(1)}</Text>
            <Estrelas nota={Math.round(media)} tamanho={18} />
            <Text style={estilos.resumoTotal}>{total} {total === 1 ? 'avaliação' : 'avaliações'}</Text>
          </View>
        )}
      </View>
    </>
  )

  if (carregando) {
    return (
      <SafeAreaView style={estilos.container}>
        <Cabecalho />
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 40 }} />
      </SafeAreaView>
    )
  }

  const renderItem = ({ item }) => (
    <View style={estilos.card}>
      <View style={estilos.cardHeader}>
        <Estrelas nota={Number(item.nota) || 0} />
        {item.contrato_tipo ? (
          <View style={estilos.tag}>
            <Text style={estilos.tagTexto}>{item.contrato_tipo === 'obra' ? 'Obra' : 'Reparo'}</Text>
          </View>
        ) : null}
      </View>
      {item.comentario ? (
        <Text style={estilos.comentario}>“{item.comentario}”</Text>
      ) : (
        <Text style={estilos.semComentario}>Sem comentário</Text>
      )}
      <Text style={estilos.meta}>
        👤 {item.avaliador_nome || 'Cliente'} · {formatarData(item.created_at)}
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={estilos.container}>
      {avaliacoes.length === 0 ? (
        <>
          <Cabecalho />
          <View style={estilos.vazio}>
            <Text style={estilos.vazioIcone}>⭐</Text>
            <Text style={estilos.vazioTitulo}>Nenhuma avaliação ainda</Text>
            <Text style={estilos.vazioSub}>
              Quando um cliente avaliar um serviço que você concluiu, a avaliação aparecerá aqui.
            </Text>
          </View>
        </>
      ) : (
        <FlatList
          data={avaliacoes}
          keyExtractor={(item, i) => String(item.id ?? i)}
          renderItem={renderItem}
          ListHeaderComponent={Cabecalho}
          contentContainerStyle={estilos.lista}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container:    { flex: 1, backgroundColor: cores.fundo, paddingHorizontal: espacos.tela },
  btnVoltar:    { marginTop: 60, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  header:       { paddingBottom: 12 },
  titulo:       { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  resumoRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  mediaNum:     { fontSize: 22, fontWeight: '800', color: '#E8833A' },
  resumoTotal:  { fontSize: 13, color: cores.textoFraco },
  lista:        { paddingBottom: 32, paddingTop: 4 },
  card:         { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 16 },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tag:          { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: cores.fundoElevado },
  tagTexto:     { fontSize: 11, fontWeight: '700', color: cores.textoMedio },
  comentario:   { fontSize: 14, color: cores.textoForte, lineHeight: 20, fontStyle: 'italic', marginBottom: 8 },
  semComentario:{ fontSize: 13, color: cores.textoMutado, marginBottom: 8 },
  meta:         { fontSize: 12, color: cores.textoMedio },
  vazio:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 60 },
  vazioIcone:   { fontSize: 48, marginBottom: 16 },
  vazioTitulo:  { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub:     { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
})
