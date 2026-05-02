import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert
} from 'react-native'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const statusInfo = {
  pendente: { cor: '#E8833A', label: '⏳ Aguardando aprovação' },
  aprovada: { cor: '#4caf50', label: '✅ Aprovada — visível aos pintores' },
  recusada: { cor: '#f44336', label: '❌ Recusada' },
  aberta:   { cor: '#4caf50', label: '✅ Publicada' },
  encerrada:{ cor: '#888', label: '🔒 Encerrada' },
}

export default function MinhasObrasScreen({ navigation }) {
  const { usuario, logout } = useAuth()
  const [obras, setObras] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)

  const buscarObras = async () => {
    try {
      const resposta = await api.get('/obras/minhas')
      setObras(resposta.obras || [])
    } catch (err) {
      console.log('Erro ao buscar obras:', err)
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useEffect(() => { buscarObras() }, [])

  const onRefresh = () => {
    setAtualizando(true)
    buscarObras()
  }

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.header}>
        <View>
          <Text style={estilos.saudacao}>Olá, {usuario?.nome?.split(' ')[0]} 🏠</Text>
          <Text style={estilos.titulo}>Minhas <Text style={{ color: cores.primaria }}>Obras</Text></Text>
        </View>
        <TouchableOpacity style={estilos.btnSair} onPress={() => Alert.alert('Sair', 'Deseja sair da conta?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sair', onPress: logout }
        ])}>
          <Text style={estilos.btnSairTexto}>Sair</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={estilos.btnNova}
        onPress={() => navigation.navigate('CadastrarObra')}
        activeOpacity={0.85}
      >
        <Text style={estilos.btnNovaTexto}>+ Cadastrar nova obra</Text>
      </TouchableOpacity>

      {carregando ? (
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      ) : obras.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>🏗️</Text>
          <Text style={estilos.vazioTitulo}>Nenhuma obra cadastrada</Text>
          <Text style={estilos.vazioSub}>Cadastre sua primeira obra e encontre pintores qualificados!</Text>
        </View>
      ) : (
        <FlatList
          data={obras}
          keyExtractor={(item) => item.id}
          contentContainerStyle={estilos.lista}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
          renderItem={({ item }) => {
            const info = statusInfo[item.status_aprovacao] || statusInfo[item.status] || statusInfo.pendente
            return (
              <TouchableOpacity
                style={estilos.card}
                onPress={() => navigation.navigate('DetalheMinhaObra', { obra: item })}
                activeOpacity={0.85}
              >
                <View style={estilos.cardTopo}>
                  <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
                  <Text style={estilos.cardValor}>R$ {Number(item.valor).toLocaleString('pt-BR')}</Text>
                </View>
                <Text style={estilos.cardLocal}>📍 {item.cidade}, MG</Text>
                <View style={[estilos.statusPill, { borderColor: info.cor }]}>
                  <Text style={[estilos.statusTexto, { color: info.cor }]}>{info.label}</Text>
                </View>
                {item.total_interessados > 0 && (
                  <Text style={estilos.interessados}>👷 {item.total_interessados} pintor(es) interessado(s)</Text>
                )}
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 16,
  },
  saudacao: { fontSize: 13, color: cores.textoFraco, marginBottom: 2 },
  titulo: { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  btnSair: {
    backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7,
  },
  btnSairTexto: { fontSize: 12, color: cores.textoMedio },
  btnNova: {
    backgroundColor: cores.primaria, marginHorizontal: espacos.tela,
    borderRadius: raios.medio, padding: 16, alignItems: 'center', marginBottom: 16,
  },
  btnNovaTexto: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  lista: { paddingHorizontal: espacos.tela, paddingBottom: 32, gap: 12 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone: { fontSize: 48, marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: cores.fundoCard, borderRadius: 16,
    borderWidth: 0.5, borderColor: cores.borda, padding: 16,
  },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  cardTitulo: { flex: 1, fontSize: 14, fontWeight: '600', color: cores.textoForte, lineHeight: 20 },
  cardValor: { fontSize: 14, fontWeight: '700', color: cores.sucesso },
  cardLocal: { fontSize: 12, color: cores.textoFraco, marginBottom: 10 },
  statusPill: {
    alignSelf: 'flex-start', borderWidth: 0.5,
    borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6,
  },
  statusTexto: { fontSize: 11, fontWeight: '500' },
  interessados: { fontSize: 12, color: cores.primaria, fontWeight: '500' },
})