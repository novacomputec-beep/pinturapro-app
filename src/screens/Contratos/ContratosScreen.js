import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { candidaturasService } from '../../services/api'
import { BadgeStatus, Card, Separador } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

const formatarData = (data) =>
  data ? new Date(data).toLocaleDateString('pt-BR') : '—'

const formatarValor = (v) =>
  v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'

// O backend grava candidaturas com dois vocabulários, conforme o fluxo usado:
//   • aceitar/recusar via DetalheObra (/obras/:id/candidatura/:id/responder) → 'aceito'/'recusado'
//   • aprovar/recusar legado (/candidaturas/:id/aprovar|recusar)            → 'aprovada'/'recusada'
// Os grupos abaixo normalizam ambos para filtros e renderização. 'contraproposta_dono'
// (negociação em aberto) entra em Pendentes.
const STATUS_GRUPO = {
  pendente: ['pendente', 'contraproposta_dono'],
  aprovada: ['aceito', 'aprovada'],
  recusada: ['recusado', 'recusada'],
}

export default function ContratosScreen({ navigation }) {
  const [candidaturas, setCandidaturas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('todos')

  const buscar = async () => {
    try {
      const dados = await candidaturasService.minhas()
      // O endpoint retorna { candidaturas, page, limit } — extrai o array
      setCandidaturas(Array.isArray(dados?.candidaturas) ? dados.candidaturas : [])
    } catch (err) {
      console.log('Erro ao buscar candidaturas:', err)
    } finally {
      setCarregando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscar() }, []))

  const FILTROS = [
    { id: 'todos',    label: 'Todos'     },
    { id: 'pendente', label: 'Pendentes' },
    { id: 'aprovada', label: 'Aprovados' },
    { id: 'recusada', label: 'Recusados' },
  ]

  // Guarda defensiva contra shape inesperado (evita crash de render)
  const lista = Array.isArray(candidaturas) ? candidaturas : []
  // Obras encerradas aparecem em "Contratos Finalizados"; aqui só negociações em andamento
  const emAndamento = lista.filter(c => c.obra_status !== 'encerrada')
  const dadosFiltrados = filtro === 'todos'
    ? emAndamento
    : emAndamento.filter(c => (STATUS_GRUPO[filtro] || [filtro]).includes(c.status))

  const renderItem = ({ item }) => {
    const temContrato = STATUS_GRUPO.aprovada.includes(item.status)
    const obra = item.obras || item

    const abrirDetalhe = () => navigation?.navigate('DetalheObra', {
      obra: {
        id: item.obra_id,
        titulo: item.obra_titulo || item.titulo,
        categoria: item.obra_categoria || item.categoria,
        cidade: item.obra_cidade || item.cidade,
        uf: item.obra_uf || item.uf,
        valor: item.obra_valor || item.valor,
      },
    })

    return (
      <TouchableOpacity activeOpacity={0.85} onPress={abrirDetalhe}>
        <Card estilo={estilos.card}>
          <View style={estilos.cardTopo}>
            <BadgeStatus status={item.status} />
            <Text style={estilos.dataTexto}>{formatarData(item.criado_em)}</Text>
          </View>

          <Separador estilo={{ marginVertical: 12 }} />

          <Text style={estilos.obraTitulo} numberOfLines={2}>
            {item.obra_titulo || item.titulo || 'Obra'}
          </Text>
          <Text style={estilos.obraLocal}>
            📍 {item.obra_cidade || item.cidade || '—'}{item.obra_uf || item.uf ? `, ${item.obra_uf || item.uf}` : ''}
          </Text>

          <View style={estilos.infoRow}>
            <View style={estilos.infoItem}>
              <Text style={estilos.infoLabel}>Valor obra</Text>
              <Text style={[estilos.infoValor, { color: cores.sucesso }]}>
                {formatarValor(item.obra_valor || item.valor)}
              </Text>
            </View>
            <View style={estilos.infoItem}>
              <Text style={estilos.infoLabel}>Categoria</Text>
              <Text style={estilos.infoValor}>{item.obra_categoria || item.categoria || '—'}</Text>
            </View>
            <View style={estilos.infoItem}>
              <Text style={estilos.infoLabel}>Situação</Text>
              <Text style={estilos.infoValor}>{item.status}</Text>
            </View>
          </View>

          {temContrato && (
            <>
              <Separador estilo={{ marginTop: 12, marginBottom: 12 }} />
              <View style={estilos.contratoBox}>
                <Text style={estilos.contratoTexto}>✅ Contrato enviado por e-mail</Text>
                <Text style={estilos.contratoSub}>Verifique sua caixa de entrada</Text>
              </View>
            </>
          )}

          {/* Contraproposta do solicitante: o pintor precisa responder na tela de
              detalhe (aceitar/recusar/contrapropor). Espelha o card de reparo. */}
          {item.status === 'contraproposta_dono' && (
            <>
              <Separador estilo={{ marginTop: 12, marginBottom: 12 }} />
              <View style={estilos.alertaBanner}>
                <Text style={estilos.alertaTexto}>⚡ O solicitante enviou uma contraproposta — veja os detalhes</Text>
              </View>
              <TouchableOpacity style={estilos.btnVer} onPress={abrirDetalhe}>
                <Text style={estilos.btnVerTexto}>Ver detalhes →</Text>
              </TouchableOpacity>
            </>
          )}

          {STATUS_GRUPO.recusada.includes(item.status) && (
            <View style={estilos.recusadoAviso}>
              <Text style={estilos.recusadoAvisoTexto}>Candidatura não selecionada.</Text>
            </View>
          )}
        </Card>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Contratos</Text>
        <Text style={estilos.subtitulo}>{lista.length} candidatura(s)</Text>
      </View>

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
          renderItem={renderItem}
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
  header: { paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 8 },
  titulo: { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  subtitulo: { fontSize: 12, color: cores.textoFraco, marginTop: 2 },
  filtrosRow: { flexDirection: 'row', paddingHorizontal: espacos.tela, gap: 8, marginBottom: 16, marginTop: 8, flexWrap: 'wrap' },
  filtroPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 6 },
  filtroPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  filtroPillTexto: { fontSize: 12, color: cores.textoMedio },
  filtroPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  lista: { paddingHorizontal: espacos.tela, paddingBottom: 32 },
  card: { padding: 16 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dataTexto: { fontSize: 11, color: cores.textoMutado },
  obraTitulo: { fontSize: 15, fontWeight: '600', color: cores.textoForte, lineHeight: 22, marginBottom: 4 },
  obraLocal: { fontSize: 12, color: cores.textoFraco, marginBottom: 14 },
  infoRow: { flexDirection: 'row', gap: 8 },
  infoItem: { flex: 1, backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 10, alignItems: 'center' },
  infoLabel: { fontSize: 10, color: cores.textoFraco, marginBottom: 3 },
  infoValor: { fontSize: 12, fontWeight: '600', color: cores.textoForte, textAlign: 'center', textTransform: 'capitalize' },
  contratoBox: { backgroundColor: cores.sucessoSuave, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  contratoTexto: { fontSize: 13, color: cores.sucesso, fontWeight: '600', marginBottom: 2 },
  contratoSub: { fontSize: 11, color: cores.sucesso, opacity: 0.8 },
  alertaBanner: { backgroundColor: '#3a2a1a', borderWidth: 1, borderColor: '#FF6B3544', borderRadius: raios.medio, padding: 10, marginBottom: 12 },
  alertaTexto: { fontSize: 12, color: '#FF6B35', textAlign: 'center' },
  btnVer: { backgroundColor: cores.primaria, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnVerTexto: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  recusadoAviso: { marginTop: 12, backgroundColor: cores.perigoSuave, borderRadius: raios.medio, padding: 10, alignItems: 'center' },
  recusadoAvisoTexto: { fontSize: 12, color: cores.perigo },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone: { fontSize: 36, marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
})