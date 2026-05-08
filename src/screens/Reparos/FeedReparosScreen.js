import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Image
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const CATEGORIAS = [
  { id: 'todas',        label: 'Todas'          },
  { id: 'hidraulica',   label: '🔵 Hidráulica'  },
  { id: 'eletrica',     label: '⚡ Elétrica'    },
  { id: 'marcenaria',   label: '🪚 Marcenaria'  },
  { id: 'alvenaria',    label: '🧱 Alvenaria'   },
  { id: 'climatizacao', label: '❄️ Climatização' },
  { id: 'outros',       label: '🔨 Outros'      },
]

const formatarValor = (v) =>
  v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null

export default function FeedReparosScreen({ navigation }) {
  const { usuario } = useAuth()
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

  const CardReparo = ({ item }) => (
    <TouchableOpacity
      style={estilos.card}
      onPress={() => navigation.navigate('DetalheReparo', { reparo: item })}
      activeOpacity={0.85}
    >
      {/* Valor em destaque no topo */}
      <View style={estilos.valorDestaque}>
        <View style={estilos.valorDestaqueEsquerda}>
          <Text style={estilos.valorDestaqueLabel}>💰 VALOR ESTIMADO</Text>
          <Text style={estilos.valorDestaqueValor}>
            {formatarValor(item.valor_estimado) || 'A combinar'}
          </Text>
        </View>
        <View style={estilos.valorDestaqueDireita}>
          <View style={estilos.categoriaPill}>
            <Text style={estilos.categoriaTexto}>{item.categoria}</Text>
          </View>
        </View>
      </View>

      {/* Foto se existir */}
      {item.foto_capa && (
        <Image source={{ uri: item.foto_capa }} style={estilos.fotoImagem} resizeMode="cover" />
      )}

      {/* Corpo */}
      <View style={estilos.cardCorpo}>
        <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
        <Text style={estilos.cardLocal}>
          📍 {item.cidade}{item.bairro ? `, ${item.bairro}` : ''}
        </Text>
        {item.descricao && (
          <Text style={estilos.cardDesc} numberOfLines={2}>{item.descricao}</Text>
        )}
        <View style={estilos.cardRodape}>
          <Text style={estilos.interessados}>
            🔧 {item.total_interessados || 0} prestador(es) interessado(s)
          </Text>
          <View style={estilos.btnVer}>
            <Text style={estilos.btnVerTexto}>Ver reparo →</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.header}>
        <View>
          <Text style={estilos.saudacao}>Olá, {usuario?.nome?.split(' ')[0]} 🔧</Text>
          <Text style={estilos.titulo}>
            Reparos <Text style={{ color: cores.primaria }}>disponíveis</Text>
          </Text>
        </View>
        <TouchableOpacity style={estilos.avatar} onPress={() => navigation.navigate('Perfil')}>
  {usuario?.foto_url ? (
    <Image source={{ uri: usuario.foto_url }} style={{ width: 34, height: 34, borderRadius: 17 }} />
  ) : (
    <Text style={estilos.avatarTexto}>
      {usuario?.nome?.substring(0, 2).toUpperCase()}
    </Text>
  )}
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
        renderItem={({ item }) => <CardReparo item={item} />}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 12 },
  saudacao: { fontSize: 13, color: cores.textoFraco, marginBottom: 2 },
  titulo: { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  avatar: { width: 34, height: 34, backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: cores.primaria, fontSize: 12, fontWeight: '700' },
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
  card: { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, overflow: 'hidden' },
  // Valor destaque no topo
  valorDestaque: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.sucessoSuave, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: cores.sucesso + '33' },
  valorDestaqueEsquerda: { flex: 1 },
  valorDestaqueLabel: { fontSize: 10, color: cores.sucesso, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  valorDestaqueValor: { fontSize: 20, fontWeight: '700', color: cores.sucesso },
  valorDestaqueDireita: { alignItems: 'flex-end' },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4 },
  categoriaTexto: { fontSize: 11, color: cores.textoFraco, textTransform: 'capitalize' },
  // Foto
  fotoImagem: { width: '100%', height: 140 },
  // Corpo
  cardCorpo: { padding: 14 },
  cardTitulo: { fontSize: 15, fontWeight: '600', color: cores.textoForte, lineHeight: 22, marginBottom: 6 },
  cardLocal: { fontSize: 12, color: cores.textoFraco, marginBottom: 6 },
  cardDesc: { fontSize: 12, color: cores.textoMedio, lineHeight: 18, marginBottom: 10 },
  cardRodape: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  interessados: { fontSize: 11, color: cores.textoMutado },
  btnVer: { backgroundColor: cores.primaria, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 7 },
  btnVerTexto: { fontSize: 11, fontWeight: '600', color: '#0A0A0A' },
})