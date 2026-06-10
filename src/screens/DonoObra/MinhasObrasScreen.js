import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const statusInfo = {
  pendente:  { cor: '#E8833A', label: '⏳ Aguardando aprovação' },
  aprovada:  { cor: '#4caf50', label: '✅ Aprovada' },
  recusada:  { cor: '#f44336', label: '❌ Recusada' },
  aberta:    { cor: '#4caf50', label: '✅ Publicada' },
  encerrada: { cor: '#888',    label: '🔒 Encerrada' },
  cancelada: { cor: '#f44336', label: '❌ Cancelada' },
}

export default function MinhasObrasScreen({ navigation, route }) {
  const { usuario, logout } = useAuth()
  const soAba = route?.params?.soAba || null
  const [obras, setObras] = useState([])
  const [reparos, setReparos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [aba, setAba] = useState(soAba || 'obras')

  const buscarDados = async () => {
    try {
      const [obrasResp, reparosResp] = await Promise.all([
        api.get('/obras/minhas'),
        api.get('/reparos/minhas'),
      ])
      setObras(obrasResp.obras || [])
      setReparos(reparosResp.reparos || [])
    } catch (err) {
      console.log('Erro ao buscar dados:', err)
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscarDados() }, []))

  const onRefresh = () => { setAtualizando(true); buscarDados() }

  const deletarItem = async (item, tipo) => {
    const jaPublicado = item.status === 'aberta' || item.status_aprovacao === 'aprovada'
    const aviso = jaPublicado
      ? `⚠️ ATENÇÃO: Este ${tipo === 'obra' ? 'obra' : 'reparo'} já foi publicado e prestadores podem estar interessados.\n\nAo excluir, eles perderão o acesso e poderá haver insatisfação.\n\nTem certeza que deseja excluir?`
      : `Deseja excluir "${item.titulo}"?`

    Alert.alert('Excluir', aviso, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          try {
            if (tipo === 'obra') {
              await api.delete(`/obras/dono/${item.id}`)
              setObras(prev => prev.filter(o => o.id !== item.id))
            } else {
              await api.delete(`/reparos/dono/${item.id}`)
              setReparos(prev => prev.filter(r => r.id !== item.id))
            }
          } catch (err) {
            Alert.alert('Erro', err.mensagem || 'Não foi possível excluir.')
          }
        }
      }
    ])
  }

  const renderItem = ({ item, tipo }) => {
    const info = statusInfo[item.status_aprovacao] || statusInfo[item.status] || statusInfo.pendente
    const temMatch = tipo === 'reparo' && item.match_feito_em && item.match_usuario_id

    return (
      <TouchableOpacity
        style={estilos.card}
        onPress={() => {
          if (tipo === 'obra') {
            navigation.navigate('DetalheMinhaObra', { obra: item })
          } else {
            navigation.navigate('DetalheReparo', { reparo: item })
          }
        }}
        activeOpacity={0.85}
      >
        <View style={estilos.cardTopo}>
          <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
          <Text style={estilos.cardValor}>
            R$ {Number(item.valor || item.valor_estimado || 0).toLocaleString('pt-BR')}
          </Text>
        </View>
        <Text style={estilos.cardLocal}>📍 {item.cidade}, MG</Text>
        {temMatch && (
          <View style={estilos.matchBadge}>
            <Text style={estilos.matchBadgeTexto}>⏱ Prestador a caminho — toque para ver</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={[estilos.statusPill, { borderColor: info.cor }]}>
            <Text style={[estilos.statusTexto, { color: info.cor }]}>{info.label}</Text>
          </View>
          <TouchableOpacity
            onPress={() => deletarItem(item, tipo)}
            style={estilos.btnLixeira}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 16 }}>🗑️</Text>
          </TouchableOpacity>
        </View>
        {item.total_interessados > 0 && (
          <Text style={estilos.interessados}>
            {tipo === 'obra' ? '👷' : '🔧'} {item.total_interessados} profissional(is) interessado(s)
          </Text>
        )}
      </TouchableOpacity>
    )
  }

  const dados = aba === 'obras'
    ? obras.filter(o => o.status !== 'cancelada')
    : reparos.filter(r => r.status !== 'cancelada')

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.header}>
        <View>
          <Text style={estilos.saudacao}>Olá, {usuario?.nome?.split(' ')[0]} 🏠</Text>
          <Text style={estilos.titulo}>Meus <Text style={{ color: cores.primaria }}>Pedidos</Text></Text>
        </View>
        <TouchableOpacity style={estilos.btnSair} onPress={() => Alert.alert('Sair', 'Deseja sair da conta?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sair', onPress: logout }
        ])}>
          <Text style={estilos.btnSairTexto}>Sair</Text>
        </TouchableOpacity>
      </View>

      {!soAba && (
        <View style={estilos.botoesRow}>
          <TouchableOpacity
            style={estilos.btnNovo}
            onPress={() => navigation.navigate('CadastrarObra')}
            activeOpacity={0.85}
          >
            <Text style={estilos.btnNovoTexto}>🖌️ Nova obra</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[estilos.btnNovo, { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda }]}
            onPress={() => navigation.navigate('CadastrarReparo')}
            activeOpacity={0.85}
          >
            <Text style={[estilos.btnNovoTexto, { color: cores.textoForte }]}>🔧 Novo reparo</Text>
          </TouchableOpacity>
        </View>
      )}

      {!soAba && (
        <View style={estilos.abas}>
          <TouchableOpacity
            style={[estilos.abaBtn, aba === 'obras' && estilos.abaBtnAtivo]}
            onPress={() => setAba('obras')}
          >
            <Text style={[estilos.abaTexto, aba === 'obras' && estilos.abaTextoAtivo]}>
              🖌️ Obras ({obras.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[estilos.abaBtn, aba === 'reparos' && estilos.abaBtnAtivo]}
            onPress={() => setAba('reparos')}
          >
            <Text style={[estilos.abaTexto, aba === 'reparos' && estilos.abaTextoAtivo]}>
              🔧 Reparos ({reparos.length})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {carregando ? (
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      ) : dados.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>{aba === 'obras' ? '🏗️' : '🔧'}</Text>
          <Text style={estilos.vazioTitulo}>
            {aba === 'obras' ? 'Nenhuma obra cadastrada' : 'Nenhum reparo cadastrado'}
          </Text>
          <Text style={estilos.vazioSub}>
            {aba === 'obras'
              ? 'Cadastre sua primeira obra de pintura!'
              : 'Cadastre seu primeiro reparo!'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={dados}
          keyExtractor={(item) => item.id}
          contentContainerStyle={estilos.lista}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
          renderItem={({ item }) => renderItem({ item, tipo: aba === 'obras' ? 'obra' : 'reparo' })}
        />
      )}
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espacos.tela, paddingTop: 16, paddingBottom: 12 },
  saudacao: { fontSize: 13, color: cores.textoFraco, marginBottom: 2 },
  titulo: { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  btnSair: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  btnSairTexto: { fontSize: 12, color: cores.textoMedio },
  botoesRow: { flexDirection: 'row', paddingHorizontal: espacos.tela, gap: 10, marginBottom: 12 },
  btnNovo: { flex: 1, backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center' },
  btnNovoTexto: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  abas: { flexDirection: 'row', paddingHorizontal: espacos.tela, gap: 8, marginBottom: 12 },
  abaBtn: { flex: 1, padding: 10, borderRadius: raios.medio, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, alignItems: 'center' },
  abaBtnAtivo: { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
  abaTexto: { fontSize: 13, color: cores.textoMedio },
  abaTextoAtivo: { color: cores.primaria, fontWeight: '600' },
  lista: { paddingHorizontal: espacos.tela, paddingBottom: 32, gap: 12 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone: { fontSize: 48, marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 16 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  cardTitulo: { flex: 1, fontSize: 14, fontWeight: '600', color: cores.textoForte, lineHeight: 20 },
  cardValor: { fontSize: 14, fontWeight: '700', color: cores.sucesso },
  cardLocal: { fontSize: 12, color: cores.textoFraco, marginBottom: 10 },
  matchBadge: { backgroundColor: '#1a1a2a', borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.medio, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  matchBadgeTexto: { fontSize: 11, color: cores.primaria, fontWeight: '600', textAlign: 'center' },
  statusPill: { alignSelf: 'flex-start', borderWidth: 0.5, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  statusTexto: { fontSize: 11, fontWeight: '500' },
  btnLixeira: { padding: 6, borderRadius: 8, backgroundColor: '#3a1a1a' },
})