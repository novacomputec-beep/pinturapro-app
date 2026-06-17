import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const STATUS_INFO = {
  pendente:            { texto: 'Aguardando resposta', cor: '#FFC107', bg: '#3a3a1a' },
  aceito:              { texto: '✅ Proposta aceita',  cor: '#4caf50', bg: '#1a3a1a' },
  recusado:            { texto: '✗ Recusado',          cor: '#f44336', bg: '#3a1a1a' },
  contraproposta_dono: { texto: '💬 Contraproposta',   cor: '#FF6B35', bg: '#3a2a1a' },
}

const formatarValor = (v) =>
  (v == null || isNaN(Number(v)))
    ? 'A combinar'
    : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function MeusInteressesScreen({ navigation }) {
  const [ativos, setAtivos]       = useState([])
  const [historico, setHistorico] = useState([])
  const [secao, setSecao]         = useState('ativos')
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)

  const buscar = async () => {
    try {
      const data = await api.get('/reparos/meus-interesses')
      setAtivos(data.ativos || [])
      // Reparos encerrados aparecem em "Contratos Finalizados"; aqui só o histórico restante (ex: expirados)
      setHistorico((data.historico || []).filter(item => item.reparo_status !== 'encerrada'))
    } catch (err) {
      console.log('Erro ao buscar interesses:', err)
      Alert.alert('Erro', 'Não foi possível carregar seus serviços.')
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscar() }, []))

  const onRefresh = () => { setAtualizando(true); buscar() }

  const dados = secao === 'ativos' ? ativos : historico

  if (carregando) {
    return (
      <SafeAreaView style={estilos.container}>
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  const renderItem = ({ item }) => {
    const s = STATUS_INFO[item.status] || STATUS_INFO.pendente
    const eEncerrado = item.reparo_status === 'encerrada'
    const eExpirado  = !eEncerrado && item.reparo_status === 'aberta' && item.expira_em && new Date(item.expira_em) < new Date()

    return (
      <View style={estilos.card}>
        <View style={estilos.cardHeader}>
          <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
          <View style={[estilos.statusBadge, { backgroundColor: s.bg }]}>
            <Text style={[estilos.statusTexto, { color: s.cor }]}>{s.texto}</Text>
          </View>
        </View>
        {(eEncerrado || eExpirado) && (
          <View style={estilos.tagReparo}>
            <Text style={estilos.tagReparoTexto}>
              {eEncerrado ? '🔒 Reparo encerrado' : '⏰ Expirado sem match'}
            </Text>
          </View>
        )}
        <Text style={estilos.cardMeta}>{item.categoria} · {item.cidade}{item.bairro ? `, ${item.bairro}` : ''}</Text>
        <View style={estilos.valoresRow}>
          <View>
            <Text style={estilos.valorLabel}>Valor do reparo</Text>
            <Text style={estilos.valorTexto}>{formatarValor(item.valor_estimado)}</Text>
          </View>
          {item.valor_proposto != null && (
            <View>
              <Text style={estilos.valorLabel}>Sua proposta</Text>
              <Text style={[estilos.valorTexto, { color: cores.primaria }]}>{formatarValor(item.valor_proposto)}</Text>
            </View>
          )}
          {item.valor_contraproposta != null && (
            <View>
              <Text style={estilos.valorLabel}>Contraproposta</Text>
              <Text style={[estilos.valorTexto, { color: '#FF6B35' }]}>{formatarValor(item.valor_contraproposta)}</Text>
            </View>
          )}
        </View>
        {item.status === 'contraproposta_dono' && (
          <View style={estilos.alertaBanner}>
            <Text style={estilos.alertaTexto}>⚡ O solicitante enviou uma contraproposta — veja os detalhes</Text>
          </View>
        )}
        <TouchableOpacity
          style={estilos.btnVer}
          onPress={() => navigation.navigate('DetalheReparo', { reparo: { id: item.reparo_id, titulo: item.titulo, categoria: item.categoria, cidade: item.cidade } })}
        >
          <Text style={estilos.btnVerTexto}>Ver detalhes →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Meus Reparos</Text>
        <Text style={estilos.subtitulo}>{dados.length} registro{dados.length !== 1 ? 's' : ''}</Text>
      </View>

      <View style={estilos.abas}>
        <TouchableOpacity
          style={[estilos.abaBtn, secao === 'ativos' && estilos.abaBtnAtivo]}
          onPress={() => setSecao('ativos')}
        >
          <Text style={[estilos.abaTexto, secao === 'ativos' && estilos.abaTextoAtivo]}>
            Ativos ({ativos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[estilos.abaBtn, secao === 'historico' && estilos.abaBtnAtivo]}
          onPress={() => setSecao('historico')}
        >
          <Text style={[estilos.abaTexto, secao === 'historico' && estilos.abaTextoAtivo]}>
            Histórico ({historico.length})
          </Text>
        </TouchableOpacity>
      </View>

      {dados.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>📋</Text>
          <Text style={estilos.vazioTitulo}>
            {secao === 'ativos' ? 'Nenhum interesse ativo' : 'Nenhum histórico ainda'}
          </Text>
          <Text style={estilos.vazioSub}>
            {secao === 'ativos'
              ? 'Explore os reparos disponíveis e demonstre interesse para aparecer aqui.'
              : 'Reparos encerrados e expirados aparecerão aqui.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={dados}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
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
  container:        { flex: 1, backgroundColor: cores.fundo },
  header:           { paddingHorizontal: espacos.tela, paddingTop: 16, paddingBottom: 12 },
  titulo:           { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  subtitulo:        { fontSize: 13, color: cores.textoFraco, marginTop: 2 },
  abas:             { flexDirection: 'row', paddingHorizontal: espacos.tela, gap: 8, marginBottom: 12 },
  abaBtn:           { flex: 1, padding: 10, borderRadius: raios.medio, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, alignItems: 'center' },
  abaBtnAtivo:      { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
  abaTexto:         { fontSize: 13, color: cores.textoMedio },
  abaTextoAtivo:    { color: cores.primaria, fontWeight: '600' },
  lista:            { paddingHorizontal: espacos.tela, paddingBottom: 32, paddingTop: 8 },
  card:             { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 16 },
  cardHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitulo:       { fontSize: 14, fontWeight: '600', color: cores.textoForte, flex: 1, marginRight: 8, lineHeight: 20 },
  statusBadge:      { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusTexto:      { fontSize: 11, fontWeight: '700' },
  tagReparo:        { backgroundColor: '#1e1e1e', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 6, borderWidth: 0.5, borderColor: '#333' },
  tagReparoTexto:   { fontSize: 10, color: cores.textoFraco, fontWeight: '500' },
  cardMeta:         { fontSize: 12, color: cores.textoFraco, marginBottom: 12, textTransform: 'capitalize' },
  valoresRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 },
  valorLabel:       { fontSize: 10, color: cores.textoMutado, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  valorTexto:       { fontSize: 15, fontWeight: '700', color: cores.textoForte },
  alertaBanner:     { backgroundColor: '#3a2a1a', borderWidth: 1, borderColor: '#FF6B3544', borderRadius: raios.medio, padding: 10, marginBottom: 12 },
  alertaTexto:      { fontSize: 12, color: '#FF6B35', textAlign: 'center' },
  btnVer:           { backgroundColor: cores.primaria, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnVerTexto:      { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  vazio:            { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone:       { fontSize: 48, marginBottom: 16 },
  vazioTitulo:      { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub:         { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
})
