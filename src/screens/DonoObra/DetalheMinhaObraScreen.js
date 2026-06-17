import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput
} from 'react-native'
import api from '../../services/api'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

const ContadorExpiracaoObra = ({ expiraEm }) => {
  const [restante, setRestante] = useState(null)
  const expiradoRef = useRef(false)

  useEffect(() => {
    expiradoRef.current = false
    const tick = () => {
      const diff = new Date(expiraEm) - new Date()
      if (diff <= 0) {
        if (!expiradoRef.current) { expiradoRef.current = true; setRestante(null) }
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setRestante({ h, m })
    }
    tick()
    const interval = setInterval(tick, 60000)
    return () => clearInterval(interval)
  }, [expiraEm])

  if (!restante) return <Text style={{ fontSize: 13, fontWeight: '700', color: '#f44336' }}>Expirado</Text>
  const urgente = restante.h < 2
  const texto = restante.h > 0
    ? `${restante.h}h ${String(restante.m).padStart(2, '0')}m`
    : `${String(restante.m).padStart(2, '0')}m`
  return <Text style={{ fontSize: 13, fontWeight: '700', color: urgente ? '#f44336' : '#4caf50' }}>⏱ {texto}</Text>
}

const statusInfo = {
  pendente:  { cor: '#E8833A', label: '⏳ Aguardando aprovação', desc: 'Nossa equipe está analisando sua publicação.' },
  aprovada:  { cor: '#4caf50', label: '✅ Aprovada', desc: 'Sua publicação está visível para profissionais.' },
  recusada:  { cor: '#f44336', label: '❌ Recusada', desc: 'Não foi aprovada. Entre em contato conosco.' },
  aberta:    { cor: '#4caf50', label: '✅ Publicada', desc: 'Visível para profissionais assinantes.' },
  encerrada: { cor: '#888',    label: '🔒 Encerrada', desc: 'Esta publicação foi encerrada.' },
}

const statusCandidatura = {
  pendente:  { cor: '#E8833A', label: '⏳ Em análise' },
  aprovada:  { cor: '#4caf50', label: '✅ Aprovado' },
  recusada:  { cor: '#f44336', label: '❌ Recusado' },
}

const formatarValor = (v) =>
  v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'

export default function DetalheMinhaObraScreen({ route, navigation }) {
  const { obra } = route.params
  const [candidaturas, setCandidaturas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [modalNegociar, setModalNegociar] = useState(false)
  const [candidaturaSelecionada, setCandidaturaSelecionada] = useState(null)
  const [histNegociacoes, setHistNegociacoes] = useState([])
  const [valorNegociacao, setValorNegociacao] = useState('')
  const [mensagemNegociacao, setMensagemNegociacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [respondendo, setRespondendo] = useState(null)

  useEffect(() => { buscar() }, [obra.id])

  const buscar = async () => {
    try {
      const resposta = await api.get(`/candidaturas/obra/${obra.id}`)
      setCandidaturas(resposta || [])
    } catch (err) {
      console.log('Erro ao buscar candidaturas:', err)
    } finally {
      setCarregando(false)
    }
  }

  const abrirNegociacao = async (candidatura) => {
    setCandidaturaSelecionada(candidatura)
    try {
      const resp = await api.get(`/candidaturas/${candidatura.id}/negociacoes`)
      setHistNegociacoes(resp.negociacoes || [])
    } catch (err) {
      console.log('[DetalheMinhaObra] falha ao carregar negociações | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      setHistNegociacoes([])
    }
    setModalNegociar(true)
  }

  const handleNegociar = async () => {
    if (!valorNegociacao.trim()) { Alert.alert('Atenção', 'Informe o valor da contra-oferta.'); return }
    setEnviando(true)
    try {
      await api.post(`/candidaturas/${candidaturaSelecionada.id}/negociar`, {
        valor: parseFloat(valorNegociacao.replace(',', '.')),
        mensagem: mensagemNegociacao,
      })
      setValorNegociacao('')
      setMensagemNegociacao('')
      const resp = await api.get(`/candidaturas/${candidaturaSelecionada.id}/negociacoes`)
      setHistNegociacoes(resp.negociacoes || [])
      Alert.alert('Contra-oferta enviada!', 'O profissional será notificado.')
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar a contra-oferta.')
    } finally {
      setEnviando(false)
    }
  }

  const handleDonoResponder = async (candidaturaId, action) => {
    Alert.alert(
      action === 'aceitar' ? 'Aprovar candidatura?' : 'Recusar candidatura?',
      action === 'aceitar'
        ? 'O profissional será notificado e selecionado para a obra.'
        : 'A candidatura será recusada e o profissional notificado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: action === 'aceitar' ? 'Aprovar' : 'Recusar',
          style: action === 'aceitar' ? 'default' : 'destructive',
          onPress: async () => {
            setRespondendo(candidaturaId)
            try {
              await api.post(`/candidaturas/${candidaturaId}/dono-responder`, { action })
              await buscar()
            } catch (err) {
              Alert.alert('Erro', err.mensagem || 'Não foi possível responder.')
            } finally {
              setRespondendo(null)
            }
          }
        }
      ]
    )
  }

  const handleDeletar = () => {
    const jaPublicado = obra.status === 'aberta' || obra.status_aprovacao === 'aprovada'
    const isReparo = obra.valor_estimado !== undefined && obra.valor === undefined
    const tipo = isReparo ? 'reparo' : 'obra'
    const aviso = jaPublicado
      ? `⚠️ ATENÇÃO: Este ${tipo} já foi publicado e prestadores podem estar interessados.\n\nAo excluir, eles perderão o acesso e poderá haver insatisfação.\n\nTem certeza que deseja excluir?`
      : `Deseja excluir "${obra.titulo}"?`

    Alert.alert('Excluir', aviso, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          try {
            if (isReparo) {
              await api.post(`/reparos/${obra.id}/encerrar`, {})
            } else {
              await api.delete(`/obras/dono/${obra.id}`)
            }
            Alert.alert('Excluído!', `${tipo === 'reparo' ? 'Reparo' : 'Obra'} removido com sucesso.`,
              [{ text: 'OK', onPress: () => navigation.goBack() }])
          } catch (err) {
            Alert.alert('Erro', err.mensagem || 'Não foi possível excluir.')
          }
        }
      }
    ])
  }

  const info = statusInfo[obra.status_aprovacao] || statusInfo[obra.status] || statusInfo.pendente
  const isReparo = obra.valor_estimado !== undefined && obra.valor === undefined

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.topbarTitulo}>{isReparo ? 'Detalhe do reparo' : 'Detalhe da obra'}</Text>
        <TouchableOpacity style={estilos.btnLixeira} onPress={handleDeletar}>
          <Text style={{ fontSize: 18 }}>🗑️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={estilos.corpo}>
          <Text style={estilos.titulo} numberOfLines={3}>{obra.titulo}</Text>
          <Text style={estilos.local}>📍 {obra.cidade}, MG{obra.bairro ? ` · ${obra.bairro}` : ''}</Text>

          <View style={[estilos.statusCard, { borderColor: info.cor }]}>
            <Text style={[estilos.statusLabel, { color: info.cor }]}>{info.label}</Text>
            <Text style={estilos.statusDesc}>{info.desc}</Text>
          </View>

          <View style={estilos.statsRow}>
            <View style={estilos.statCard}>
              <Text style={estilos.statValor}>{formatarValor(obra.valor || obra.valor_estimado)}</Text>
              <Text style={estilos.statLabel}>Valor oferecido</Text>
            </View>
            {obra.prazo_execucao_dias && (
              <View style={estilos.statCard}>
                <Text style={estilos.statValor}>{obra.prazo_execucao_dias} dias</Text>
                <Text style={estilos.statLabel}>Prazo</Text>
              </View>
            )}
            <View style={estilos.statCard}>
              <Text style={[estilos.statValor, { color: cores.primaria }]}>{candidaturas.length}</Text>
              <Text style={estilos.statLabel}>Interessados</Text>
            </View>
            <View style={estilos.statCard}>
              <Text style={[estilos.statValor, { color: cores.textoFraco }]}>{obra.total_visitas || 0}</Text>
              <Text style={estilos.statLabel}>Visitas</Text>
            </View>
            {obra.expira_em && (
              <View style={estilos.statCard}>
                <ContadorExpiracaoObra expiraEm={obra.expira_em} />
                <Text style={estilos.statLabel}>Expira em</Text>
              </View>
            )}
          </View>

          {obra.descricao && (
            <>
              <Text style={estilos.secaoTitulo}>Descrição</Text>
              <Text style={estilos.descricao}>{obra.descricao}</Text>
            </>
          )}

          <Text style={estilos.secaoTitulo}>
            {isReparo ? 'Prestadores interessados' : 'Pintores interessados'} ({candidaturas.length})
          </Text>

          {carregando ? (
            <ActivityIndicator color={cores.primaria} />
          ) : candidaturas.length === 0 ? (
            <View style={estilos.vazio}>
              <Text style={estilos.vazioIcone}>{isReparo ? '🔧' : '👷'}</Text>
              <Text style={estilos.vazioTexto}>
                {obra.status_aprovacao === 'pendente' || obra.status_aprovacao === 'recusada'
                  ? 'Aguardando aprovação para receber candidaturas'
                  : 'Nenhum profissional demonstrou interesse ainda'}
              </Text>
            </View>
          ) : (
            candidaturas.map(c => {
              const sc = statusCandidatura[c.status] || statusCandidatura.pendente
              return (
                <View key={c.id} style={estilos.candidaturaCard}>
                  <View style={estilos.candidaturaHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={estilos.pintorNome}>{c.nome || 'Profissional'}</Text>
                      <Text style={estilos.pintorInfo}>
                        {c.cidade || ''}{c.anos_experiencia ? ` · ${c.anos_experiencia} anos exp.` : ''}
                        {c.tamanho_equipe ? ` · Equipe: ${c.tamanho_equipe}` : ''}
                      </Text>
                    </View>
                    <View style={[estilos.statusPill, { borderColor: sc.cor }]}>
                      <Text style={[estilos.statusPillTexto, { color: sc.cor }]}>{sc.label}</Text>
                    </View>
                  </View>
                  {c.valor_oferta != null && (
                    <View style={estilos.ofertaBox}>
                      <Text style={estilos.ofertaLabel}>💰 Oferta do profissional</Text>
                      <Text style={estilos.ofertaValor}>{formatarValor(c.valor_oferta)}</Text>
                      {c.mensagem_oferta && <Text style={estilos.ofertaMensagem}>"{c.mensagem_oferta}"</Text>}
                    </View>
                  )}
                  {c.referencias && <Text style={estilos.referencias}>"{c.referencias}"</Text>}
                  {c.telefone && <Text style={estilos.contato}>📱 {c.telefone}</Text>}
                  {c.status === 'pendente' && (
                    <>
                      <View style={estilos.acaoRow}>
                        <TouchableOpacity
                          style={[estilos.btnAcao, { backgroundColor: '#1a3a1a', borderColor: '#4caf50' }]}
                          onPress={() => handleDonoResponder(c.id, 'aceitar')}
                          disabled={respondendo === c.id}
                        >
                          <Text style={{ color: '#4caf50', fontSize: 12, fontWeight: '700' }}>
                            {respondendo === c.id ? '...' : '✅ Aprovar'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[estilos.btnAcao, { backgroundColor: '#3a1a1a', borderColor: '#f44336' }]}
                          onPress={() => handleDonoResponder(c.id, 'recusar')}
                          disabled={respondendo === c.id}
                        >
                          <Text style={{ color: '#f44336', fontSize: 12, fontWeight: '700' }}>❌ Recusar</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity style={estilos.btnNegociar} onPress={() => abrirNegociacao(c)}>
                        <Text style={estilos.btnNegociarTexto}>💬 Negociar / Contra-oferta</Text>
                        <Text style={{ color: cores.primaria }}>→</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )
            })
          )}
        </View>
      </ScrollView>

      <Modal visible={modalNegociar} animationType="slide" transparent onRequestClose={() => setModalNegociar(false)}>
        <View style={estilos.modalOverlay}>
          <View style={estilos.modalSheet}>
            <View style={estilos.modalHandle} />
            <Text style={estilos.modalTitulo}>Negociação</Text>
            <Text style={estilos.modalSub}>{candidaturaSelecionada?.nome || 'Profissional'}</Text>
            {histNegociacoes.length > 0 && (
              <>
                <Text style={estilos.secaoTitulo}>Histórico</Text>
                <ScrollView style={{ maxHeight: 160, marginBottom: 12 }} showsVerticalScrollIndicator={false}>
                  {histNegociacoes.map((neg, i) => (
                    <View key={i} style={[estilos.negCard, neg.autor_role !== 'dono_obra' && estilos.negCardProfissional]}>
                      <Text style={estilos.negAutor}>{neg.autor_role === 'dono_obra' ? '🏠 Você' : '👷 Profissional'}</Text>
                      <Text style={estilos.negValor}>{formatarValor(neg.valor)}</Text>
                      {neg.mensagem && <Text style={estilos.negMensagem}>{neg.mensagem}</Text>}
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
            <Text style={estilos.inputLabel}>MINHA CONTRA-OFERTA (R$)</Text>
            <TextInput style={estilos.inputSimples} placeholder="Ex: 4500" placeholderTextColor={cores.textoMutado} value={valorNegociacao} onChangeText={setValorNegociacao} keyboardType="numeric" />
            <Text style={estilos.inputLabel}>MENSAGEM (opcional)</Text>
            <TextInput style={estilos.textarea} placeholder="Explique sua proposta..." placeholderTextColor={cores.textoMutado} value={mensagemNegociacao} onChangeText={setMensagemNegociacao} multiline numberOfLines={3} />
            <BotaoPrimario titulo="Enviar contra-oferta →" onPress={handleNegociar} carregando={enviando} estilo={{ marginTop: 8, marginBottom: 10 }} />
            <BotaoSecundario titulo="Fechar" onPress={() => setModalNegociar(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espacos.tela, paddingVertical: 12 },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnLixeira: { width: 36, height: 36, backgroundColor: '#3a1a1a', borderWidth: 0.5, borderColor: '#f44336', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topbarTitulo: { fontSize: 14, color: cores.textoMedio, fontWeight: '500' },
  corpo: { paddingHorizontal: espacos.tela, paddingBottom: 40 },
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, lineHeight: 28, marginBottom: 6 },
  local: { fontSize: 13, color: cores.textoFraco, marginBottom: 16 },
  statusCard: { borderWidth: 1, borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  statusLabel: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  statusDesc: { fontSize: 13, color: cores.textoMedio, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  statValor: { fontSize: 13, fontWeight: '700', color: cores.textoForte, marginBottom: 3 },
  statLabel: { fontSize: 10, color: cores.textoFraco, textAlign: 'center' },
  secaoTitulo: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  descricao: { fontSize: 13, color: cores.textoMedio, lineHeight: 22, marginBottom: 20 },
  vazio: { alignItems: 'center', paddingVertical: 32 },
  vazioIcone: { fontSize: 36, marginBottom: 10 },
  vazioTexto: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
  candidaturaCard: { backgroundColor: cores.fundoCard, borderRadius: raios.grande, borderWidth: 0.5, borderColor: cores.borda, padding: 14, marginBottom: 10 },
  candidaturaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  pintorNome: { fontSize: 14, fontWeight: '600', color: cores.textoForte, marginBottom: 2 },
  pintorInfo: { fontSize: 11, color: cores.textoFraco },
  statusPill: { borderWidth: 0.5, borderRadius: raios.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillTexto: { fontSize: 10, fontWeight: '600' },
  ofertaBox: { backgroundColor: cores.sucessoSuave, borderRadius: raios.medio, padding: 10, marginBottom: 8 },
  ofertaLabel: { fontSize: 11, color: cores.sucesso, fontWeight: '600', marginBottom: 2 },
  ofertaValor: { fontSize: 16, fontWeight: '700', color: cores.sucesso, marginBottom: 2 },
  ofertaMensagem: { fontSize: 12, color: cores.sucesso, fontStyle: 'italic' },
  referencias: { fontSize: 12, color: cores.textoMedio, fontStyle: 'italic', lineHeight: 18, marginBottom: 6 },
  contato: { fontSize: 12, color: cores.primaria, marginBottom: 8 },
  acaoRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnAcao: { flex: 1, borderWidth: 0.5, borderRadius: raios.medio, padding: 10, alignItems: 'center' },
  btnNegociar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.primaria, borderRadius: raios.medio, padding: 10, marginTop: 8 },
  btnNegociarTexto: { fontSize: 12, color: cores.primaria, fontWeight: '500' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 0.5, borderColor: cores.borda, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: cores.borda, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, marginBottom: 4 },
  modalSub: { fontSize: 12, color: cores.textoFraco, marginBottom: 16 },
  negCard: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 10, marginBottom: 8 },
  negCardProfissional: { borderWidth: 0.5, borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  negAutor: { fontSize: 11, color: cores.textoFraco, marginBottom: 3 },
  negValor: { fontSize: 14, fontWeight: '700', color: cores.sucesso, marginBottom: 2 },
  negMensagem: { fontSize: 12, color: cores.textoMedio, fontStyle: 'italic' },
  inputLabel: { fontSize: 11, color: cores.textoFraco, letterSpacing: 0.5, marginBottom: 7, textTransform: 'uppercase', marginTop: 8 },
  inputSimples: { backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, fontSize: 14, color: cores.textoForte, marginBottom: 4 },
  textarea: { backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, fontSize: 13, color: cores.textoForte, minHeight: 80, textAlignVertical: 'top', marginBottom: 4 },
})