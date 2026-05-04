import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert, SectionList
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

export default function MinhasObrasScreen({ navigation }) {
  const { usuario, logout } = useAuth()
  const [obras, setObras] = useState([])
  const [reparos, setReparos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [aba, setAba] = useState('obras')

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

  const renderItem = ({ item, tipo }) => {
    const info = statusInfo[item.status_aprovacao] || statusInfo[item.status] || statusInfo.pendente
    return (
      <TouchableOpacity
        style={estilos.card}
        onPress={() => navigation.navigate(
          tipo === 'obra' ? 'DetalheMinhaObra' : 'DetalheMinhaObra',
          { obra: item }
        )}
        activeOpacity={0.85}
      >
        <View style={estilos.cardTopo}>
          <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
          <Text style={estilos.cardValor}>
            R$ {Number(item.valor || item.valor_estimado || 0).toLocaleString('pt-BR')}
          </Text>
        </View>
        <Text style={estilos.cardLocal}>📍 {item.cidade}, MG</Text>
        <View style={[estilos.statusPill, { borderColor: info.cor }]}>
          <Text style={[estilos.statusTexto, { color: info.cor }]}>{info.label}</Text>
        </View>
        {item.total_interessados > 0 && (
          <Text style={estilos.interessados}>
            {tipo === 'obra' ? '👷' : '🔧'} {item.total_interessados} profissional(is) interessado(s)
          </Text>
        )}
      </TouchableOpacity>
    )
  }

  const dados = aba === 'obras' ? obras : reparos

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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 12 },
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
  statusPill: { alignSelf: 'flex-start', borderWidth: 0.5, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  statusTexto: { fontSize: 11, fontWeight: '500' },
  interessados: { fontSize: 12, color: cores.primaria, fontWeight: '500' },
})