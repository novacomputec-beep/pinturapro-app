import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, Linking, Alert
} from 'react-native'
import { candidaturasService } from '../../services/api'
import { BadgeStatus, Card, Separador } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

const formatarData = (data) =>
  data ? new Date(data).toLocaleDateString('pt-BR') : '—'

const formatarValor = (v) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const CardContrato = ({ item, onVerContrato }) => {
  const obra  = item.obras
  const temContrato = item.status === 'aprovada'

  return (
    <Card estilo={estilos.card}>
      {/* Status topo */}
      <View style={estilos.cardTopo}>
        <BadgeStatus status={item.status} />
        <Text style={estilos.dataTexto}>{formatarData(item.criado_em)}</Text>
      </View>

      <Separador estilo={{ marginVertical: 12 }} />

      {/* Info da obra */}
      <Text style={estilos.obraTitulo} numberOfLines={2}>{obra?.titulo}</Text>
      <Text style={estilos.obraLocal}>📍 {obra?.cidade}, MG</Text>

      <View style={estilos.infoRow}>
        <View style={estilos.infoItem}>
          <Text style={estilos.infoLabel}>Valor</Text>
          <Text style={[estilos.infoValor, { color: cores.sucesso }]}>
            {obra?.valor ? formatarValor(obra.valor) : '—'}
          </Text>
        </View>
        <View style={estilos.infoItem}>
          <Text style={estilos.infoLabel}>Categoria</Text>
          <Text style={estilos.infoValor}>{obra?.categoria || '—'}</Text>
        </View>
        <View style={estilos.infoItem}>
          <Text style={estilos.infoLabel}>Situação</Text>
          <Text style={estilos.infoValor}>{obra?.status || '—'}</Text>
        </View>
      </View>

      {/* Botão ver contrato */}
      {temContrato && (
        <>
          <Separador estilo={{ marginTop: 12, marginBottom: 12 }} />
          <TouchableOpacity
            style={estilos.btnContrato}
            onPress={() => onVerContrato(item)}
          >
            <Text style={estilos.btnContratoTexto}>📄 Ver contrato</Text>
            <Text style={estilos.btnContratoSeta}>→</Text>
          </TouchableOpacity>
        </>
      )}

      {item.status === 'pendente' && (
        <View style={estilos.pendenteAviso}>
          <Text style={estilos.pendenteAvisoTexto}>
            Aguardando análise da equipe...
          </Text>
        </View>
      )}

      {item.status === 'recusada' && (
        <View style={estilos.recusadoAviso}>
          <Text style={estilos.recusadoAvisoTexto}>
            Candidatura não selecionada.
          </Text>
        </View>
      )}
    </Card>
  )
}

export default function ContratosScreen() {
  const [candidaturas, setCandidaturas] = useState([])
  const [carregando, setCarregando]     = useState(true)
  const [filtro, setFiltro]             = useState('todos')

  useEffect(() => {
    const buscar = async () => {
      try {
        const dados = await candidaturasService.minhas()
        setCandidaturas(dados || [])
      } catch (err) {
        console.log('Erro ao buscar candidaturas:', err)
      } finally {
        setCarregando(false)
      }
    }
    buscar()
  }, [])

  const handleVerContrato = (item) => {
    Alert.alert(
      'Contrato',
      'O contrato será aberto para visualização.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abrir',
          onPress: () => {
            // Em produção: abrir URL assinada do Supabase Storage
            // Linking.openURL(item.contrato_url)
            Alert.alert('Em breve', 'Visualização de PDF em implementação.')
          }
        }
      ]
    )
  }

  const FILTROS = [
    { id: 'todos',    label: 'Todos'    },
    { id: 'pendente', label: 'Pendentes'},
    { id: 'aprovada', label: 'Aprovados'},
    { id: 'recusada', label: 'Recusados'},
  ]

  const dadosFiltrados = filtro === 'todos'
    ? candidaturas
    : candidaturas.filter(c => c.status === filtro)

  return (
    <SafeAreaView style={estilos.container}>

      {/* Cabeçalho */}
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Contratos</Text>
        <Text style={estilos.subtitulo}>{candidaturas.length} candidatura(s)</Text>
      </View>

      {/* Filtros */}
      <View style={estilos.filtrosRow}>
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[estilos.filtroPill, filtro === f.id && estilos.filtroPillAtivo]}
            onPress={() => setFiltro(f.id)}
          >
            <Text style={[estilos.filtroPillTexto, filtro === f.id && estilos.filtroPillTextoAtivo]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {carregando ? (
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      ) : dadosFiltrados.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>📋</Text>
          <Text style={estilos.vazioTitulo}>Nenhuma candidatura</Text>
          <Text style={estilos.vazioSub}>
            Quando você demonstrar interesse em uma obra, ela aparecerá aqui.
          </Text>
        </View>
      ) : (
        <FlatList
          data={dadosFiltrados}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CardContrato item={item} onVerContrato={handleVerContrato} />
          )}
          contentContainerStyle={estilos.lista}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: {
    paddingHorizontal: espacos.tela,
    paddingTop: 8, paddingBottom: 8,
  },
  titulo: {
    fontSize: 26, fontWeight: '700',
    color: cores.textoForte, letterSpacing: -0.5,
  },
  subtitulo: { fontSize: 12, color: cores.textoFraco, marginTop: 2 },
  filtrosRow: {
    flexDirection: 'row',
    paddingHorizontal: espacos.tela,
    gap: 8,
    marginBottom: 16, marginTop: 8,
    flexWrap: 'wrap',
  },
  filtroPill: {
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.pill,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  filtroPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  filtroPillTexto: { fontSize: 12, color: cores.textoMedio },
  filtroPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  lista: { paddingHorizontal: espacos.tela, paddingBottom: 32 },
  card: { padding: 16 },
  cardTopo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dataTexto: { fontSize: 11, color: cores.textoMutado },
  obraTitulo: {
    fontSize: 15, fontWeight: '600',
    color: cores.textoForte, lineHeight: 22,
    marginBottom: 4,
  },
  obraLocal: { fontSize: 12, color: cores.textoFraco, marginBottom: 14 },
  infoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  infoItem: {
    flex: 1,
    backgroundColor: cores.fundoElevado,
    borderRadius: raios.medio,
    padding: 10, alignItems: 'center',
  },
  infoLabel: { fontSize: 10, color: cores.textoFraco, marginBottom: 3 },
  infoValor: {
    fontSize: 12, fontWeight: '600',
    color: cores.textoForte, textAlign: 'center', textTransform: 'capitalize',
  },
  btnContrato: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: cores.fundoElevado,
    borderRadius: raios.medio,
    padding: 12,
  },
  btnContratoTexto: { fontSize: 13, color: cores.textoForte, fontWeight: '500' },
  btnContratoSeta: { fontSize: 14, color: cores.primaria },
  pendenteAviso: {
    marginTop: 12,
    backgroundColor: cores.primariaSuave,
    borderRadius: raios.medio,
    padding: 10, alignItems: 'center',
  },
  pendenteAvisoTexto: { fontSize: 12, color: cores.primaria },
  recusadoAviso: {
    marginTop: 12,
    backgroundColor: cores.perigoSuave,
    borderRadius: raios.medio,
    padding: 10, alignItems: 'center',
  },
  recusadoAvisoTexto: { fontSize: 12, color: cores.perigo },
  vazio: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40,
  },
  vazioIcone: { fontSize: 36, marginBottom: 16 },
  vazioTitulo: {
    fontSize: 16, fontWeight: '600',
    color: cores.textoFraco, marginBottom: 8,
  },
  vazioSub: {
    fontSize: 13, color: cores.textoMutado,
    textAlign: 'center', lineHeight: 20,
  },
})
