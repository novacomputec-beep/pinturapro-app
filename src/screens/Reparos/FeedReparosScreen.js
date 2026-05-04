import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const CATEGORIAS = [
  { id: 'todas', label: 'Todas' },
  { id: 'hidraulica', label: '🚿 Hidráulica' },
  { id: 'eletrica', label: '💡 Elétrica' },
  { id: 'marcenaria', label: '🪚 Marcenaria' },
  { id: 'alvenaria', label: '🏠 Alvenaria' },
  { id: 'climatizacao', label: '❄️ Climatização' },
  { id: 'outros', label: '🔨 Outros' },
]

export default function FeedReparosScreen({ navigation }) {
  const { usuario, logout } = useAuth()
  const [reparos, setReparos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [categoria, setCategoria] = useState('todas')

  const buscarReparos = async (cat = categoria) => {
    try {
      const params = cat !== 'todas' ? `?categoria=${cat}` : ''
      const resposta = await api.get(`/reparos${params}`)
      setReparos(resposta.reparos || [])
    } catch (err) {
      console.log('Erro ao buscar reparos:', err)
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscarReparos() }, [categoria]))

  const onRefresh = () => { setAtualizando(true); buscarReparos() }

  const mudarCategoria = (cat) => {
    setCategoria(cat)
    setCarregando(true)
    buscarReparos(cat)
  }

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.header}>
        <View>
          <Text style={estilos.saudacao}>Olá, {usuario?.nome?.split(' ')[0]} 🔧</Text>
          <Text style={estilos.titulo}>Reparos <Text style={{ color: cores.primaria }}>Disponíveis</Text></Text>
        </View>
        <TouchableOpacity style={estilos.btnSair} onPress={() => Alert.alert('Sair', 'Deseja sair?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Sair', onPress: logout }
        ])}>
          <Text style={estilos.btnSairTexto}>Sair</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={reparos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={estilos.lista}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
        ListHeaderComponent={
          <FlatList
            data={CATEGORIAS}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            style={estilos.filtros}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[estilos.filtroPill, categoria === item.id && estilos.filtroPillAtivo]}
                onPress={() => mudarCategoria(item.id)}
              >
                <Text style={[estilos.filtroTexto, categoria === item.id && estilos.filtroTextoAtivo]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        }
        ListEmptyComponent={
          carregando ? (
            <ActivityIndicator color={cores.primaria} size="large" style={{ marginTop: 60 }} />
          ) : (
            <View style={estilos.vazio}>
              <Text style={estilos.vazioIcone}>🔧</Text>
              <Text style={estilos.vazioTitulo}>Nenhum reparo disponível</Text>
              <Text style={estilos.vazioSub}>Novos reparos aparecem aqui quando forem aprovados.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={estilos.card}
            onPress={() => navigation.navigate('DetalheReparo', { reparo: item })}
            activeOpacity={0.85}
          >
            <View style={estilos.cardTopo}>
              <View style={estilos.categoriaPill}>
                <Text style={estilos.categoriaTexto}>{item.categoria}</Text>
              </View>
              {item.valor_estimado && (
                <Text style={estilos.cardValor}>
                  R$ {Number(item.valor_estimado).toLocaleString('pt-BR')}
                </Text>
              )}
            </View>
            <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
            <Text style={estilos.cardLocal}>📍 {item.cidade}{item.bairro ? `, ${item.bairro}` : ''}</Text>
            {item.descricao && (
              <Text style={estilos.cardDesc} numberOfLines={2}>{item.descricao}</Text>
            )}
            {item.total_interessados > 0 && (
              <Text style={estilos.interessados}>🔧 {item.total_interessados} prestador(es) interessado(s)</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 12 },
  saudacao: { fontSize: 13, color: cores.textoFraco, marginBottom: 2 },
  titulo: { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  btnSair: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  btnSairTexto: { fontSize: 12, color: cores.textoMedio },
  filtros: { paddingHorizontal: espacos.tela, paddingVertical: 12 },
  filtroPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  filtroPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  filtroTexto: { fontSize: 12, color: cores.textoMedio },
  filtroTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  lista: { paddingHorizontal: espacos.tela, paddingBottom: 32, gap: 12 },
  vazio: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  vazioIcone: { fontSize: 48, marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 16 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4 },
  categoriaTexto: { fontSize: 11, color: cores.textoFraco, textTransform: 'capitalize' },
  cardValor: { fontSize: 14, fontWeight: '700', color: cores.sucesso },
  cardTitulo: { fontSize: 15, fontWeight: '600', color: cores.textoForte, lineHeight: 22, marginBottom: 6 },
  cardLocal: { fontSize: 12, color: cores.textoFraco, marginBottom: 6 },
  cardDesc: { fontSize: 12, color: cores.textoMedio, lineHeight: 18, marginBottom: 6 },
  interessados: { fontSize: 12, color: cores.primaria, fontWeight: '500' },
})