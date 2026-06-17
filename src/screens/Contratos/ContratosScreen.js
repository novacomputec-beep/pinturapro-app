import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput, ScrollView
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api, { candidaturasService } from '../../services/api'
import { BadgeStatus, Card, Separador, BotaoPrimario, BotaoSecundario } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

const formatarData = (data) =>
  data ? new Date(data).toLocaleDateString('pt-BR') : '—'

const formatarValor = (v) =>
  v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'

export default function ContratosScreen() {
  const [candidaturas, setCandidaturas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [modalNegociar, setModalNegociar] = useState(false)
  const [candidaturaSelecionada, setCandidaturaSelecionada] = useState(null)
  const [negociacoes, setNegociacoes] = useState([])
  const [valorNegociacao, setValorNegociacao] = useState('')
  const [mensagemNegociacao, setMensagemNegociacao] = useState('')
  const [enviando, setEnviando] = useState(false)

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

  const abrirNegociacao = async (item) => {
    setCandidaturaSelecionada(item)
    try {
      const resp = await api.get(`/candidaturas/${item.id}/negociacoes`)
      setNegociacoes(resp.negociacoes || [])
    } catch (err) {
      console.log('[Contratos] falha ao carregar negociações | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      setNegociacoes([])
    }
    setModalNegociar(true)
  }

  const handleNegociar = async () => {
    if (!valorNegociacao.trim()) {
      Alert.alert('Atenção', 'Informe o valor da contra-oferta.')
      return
    }
    setEnviando(true)
    try {
      await api.post(`/candidaturas/${candidaturaSelecionada.id}/negociar`, {
        valor: parseFloat(valorNegociacao.replace(',', '.')),
        mensagem: mensagemNegociacao,
      })
      setValorNegociacao('')
      setMensagemNegociacao('')
      const resp = await api.get(`/candidaturas/${candidaturaSelecionada.id}/negociacoes`)
      setNegociacoes(resp.negociacoes || [])
      Alert.alert('Contra-oferta enviada!', 'O dono da obra será notificado.')
    } catch (err) {
      console.log('[Contratos] falha ao enviar contra-oferta | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar a contra-oferta.')
    } finally {
      setEnviando(false)
    }
  }

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
    : emAndamento.filter(c => c.status === filtro)

  const renderItem = ({ item }) => {
    const temContrato = item.status === 'aprovada'
    const obra = item.obras || item

    return (
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

        {item.status === 'pendente' && (
          <>
            <Separador estilo={{ marginTop: 12, marginBottom: 12 }} />
            <TouchableOpacity style={estilos.btnNegociar} onPress={() => abrirNegociacao(item)}>
              <Text style={estilos.btnNegociarTexto}>💰 Ver / Fazer contra-oferta</Text>
              <Text style={{ color: cores.primaria }}>→</Text>
            </TouchableOpacity>
          </>
        )}

        {item.status === 'recusada' && (
          <View style={estilos.recusadoAviso}>
            <Text style={estilos.recusadoAvisoTexto}>Candidatura não selecionada.</Text>
          </View>
        )}
      </Card>
    )
  }

  return (
    <SafeAreaView style={estilos.container}>
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

      {/* Modal de negociação */}
      <Modal visible={modalNegociar} animationType="slide" transparent onRequestClose={() => setModalNegociar(false)}>
        <View style={estilos.modalOverlay}>
          <View style={estilos.modalSheet}>
            <View style={estilos.modalHandle} />
            <Text style={estilos.modalTitulo}>Negociação</Text>
            <Text style={estilos.modalSub}>{candidaturaSelecionada?.obra_titulo || ''}</Text>

            {negociacoes.length > 0 && (
              <>
                <Text style={estilos.secaoTitulo}>Histórico</Text>
                <ScrollView style={{ maxHeight: 180, marginBottom: 16 }} showsVerticalScrollIndicator={false}>
                  {negociacoes.map((neg, i) => (
                    <View key={i} style={[estilos.negCard, neg.autor_role === 'assinante' && estilos.negCardPintor]}>
                      <Text style={estilos.negAutor}>
                        {neg.autor_role === 'assinante' ? '👷 Você' : '🏠 Dono da obra'}
                      </Text>
                      <Text style={estilos.negValor}>{formatarValor(neg.valor)}</Text>
                      {neg.mensagem && <Text style={estilos.negMensagem}>{neg.mensagem}</Text>}
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={estilos.secaoTitulo}>Nova contra-oferta</Text>
            <Text style={[estilos.inputLabel, { marginTop: 0 }]}>VALOR (R$)</Text>
            <TextInput
              style={estilos.inputSimples}
              placeholder="Ex: 3500"
              placeholderTextColor={cores.textoMutado}
              value={valorNegociacao}
              onChangeText={setValorNegociacao}
              keyboardType="numeric"
            />
            <Text style={estilos.inputLabel}>MENSAGEM (opcional)</Text>
            <TextInput
              style={estilos.textarea}
              placeholder="Explique sua proposta..."
              placeholderTextColor={cores.textoMutado}
              value={mensagemNegociacao}
              onChangeText={setMensagemNegociacao}
              multiline
              numberOfLines={3}
            />
            <BotaoPrimario
              titulo="Enviar contra-oferta →"
              onPress={handleNegociar}
              carregando={enviando}
              estilo={{ marginTop: 8, marginBottom: 10 }}
            />
            <BotaoSecundario titulo="Fechar" onPress={() => setModalNegociar(false)} />
          </View>
        </View>
      </Modal>
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
  btnNegociar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.primaria, borderRadius: raios.medio, padding: 12 },
  btnNegociarTexto: { fontSize: 13, color: cores.primaria, fontWeight: '500' },
  recusadoAviso: { marginTop: 12, backgroundColor: cores.perigoSuave, borderRadius: raios.medio, padding: 10, alignItems: 'center' },
  recusadoAvisoTexto: { fontSize: 12, color: cores.perigo },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone: { fontSize: 36, marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 0.5, borderColor: cores.borda, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: cores.borda, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, marginBottom: 4 },
  modalSub: { fontSize: 12, color: cores.textoFraco, marginBottom: 16 },
  secaoTitulo: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  negCard: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 10, marginBottom: 8 },
  negCardPintor: { borderWidth: 0.5, borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  negAutor: { fontSize: 11, color: cores.textoFraco, marginBottom: 3 },
  negValor: { fontSize: 14, fontWeight: '700', color: cores.sucesso, marginBottom: 2 },
  negMensagem: { fontSize: 12, color: cores.textoMedio, fontStyle: 'italic' },
  inputLabel: { fontSize: 11, color: cores.textoFraco, letterSpacing: 0.5, marginBottom: 7, textTransform: 'uppercase', marginTop: 8 },
  inputSimples: { backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, fontSize: 14, color: cores.textoForte, marginBottom: 4 },
  textarea: { backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, fontSize: 13, color: cores.textoForte, minHeight: 80, textAlignVertical: 'top', marginBottom: 4 },
})