import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'
import { distanciaItemKm, formatarDistancia, useCoordsUsuario } from '../../utils/distancia'
import { bannerInteressadosJaExibido, marcarBannerInteressadosExibido } from '../../utils/sessao'

const statusInfo = {
  pendente:  { cor: '#E8833A', label: '⏳ Aguardando aprovação' },
  aprovada:  { cor: '#4caf50', label: '✅ Aprovada' },
  recusada:  { cor: '#f44336', label: '❌ Recusada' },
  aberta:    { cor: '#4caf50', label: '✅ Publicada' },
  encerrada: { cor: '#4caf50', label: '✅ Concluído com sucesso' },
  cancelada: { cor: '#f44336', label: '❌ Cancelada' },
}

export default function MinhasObrasScreen({ navigation, route }) {
  const { usuario, logout } = useAuth()
  const soAba = route?.params?.soAba || null

  const [obras,           setObras]           = useState([])
  const [reparos,         setReparos]         = useState([])
  const [obrasHistorico,  setObrasHistorico]  = useState([])
  const [reparosHistorico,setReparosHistorico]= useState([])
  const [carregando,  setCarregando]  = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [aba,   setAba]   = useState(soAba || 'obras')
  const [secao, setSecao] = useState('ativos')
  const [mostrarBanner, setMostrarBanner] = useState(false)
  const [itemPendente, setItemPendente] = useState(null)
  const [coords] = useCoordsUsuario()

  const buscarDados = async () => {
    try {
      const [obrasResp, reparosResp] = await Promise.all([
        api.get('/obras/minhas'),
        api.get('/reparos/minhas'),
      ])
      setObras(obrasResp.obras || [])
      // Itens encerrados saem do Histórico e passam a viver na aba "Contratos Finalizados";
      // o Histórico fica apenas com expirados/cancelados/não concluídos.
      setObrasHistorico((obrasResp.historico || []).filter(o => o.status !== 'encerrada'))
      setReparos(reparosResp.reparos || [])
      setReparosHistorico((reparosResp.historico || []).filter(r => r.status !== 'encerrada'))

      // Banner verde "Parabéns" — exibido uma única vez por sessão de login quando
      // há ao menos uma obra/reparo com candidatura/interesse ainda sem resposta.
      const obraPend   = (obrasResp.obras     || []).find(o => Number(o.candidaturas_pendentes) > 0)
      const reparoPend = (reparosResp.reparos || []).find(r => Number(r.interesses_pendentes) > 0)
      const pend = obraPend ? { tipo: 'obra', item: obraPend } : reparoPend ? { tipo: 'reparo', item: reparoPend } : null
      if (pend && !bannerInteressadosJaExibido()) {
        marcarBannerInteressadosExibido()
        setItemPendente(pend)
        setMostrarBanner(true)
      }
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
      ? `⚠️ ATENÇÃO: ${tipo === 'obra' ? 'Esta obra' : 'Este reparo'} já foi publicado e prestadores podem estar interessados.\n\nAo excluir, eles perderão o acesso e poderá haver insatisfação.\n\nTem certeza que deseja excluir?`
      : `Deseja excluir "${item.titulo}"?`

    Alert.alert('Excluir', aviso, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          try {
            if (tipo === 'obra') {
              await api.delete(`/obras/dono/${item.id}`)
              setObras(prev => prev.filter(o => o.id !== item.id))
              setObrasHistorico(prev => prev.filter(o => o.id !== item.id))
            } else {
              await api.delete(`/reparos/dono/${item.id}`)
              setReparos(prev => prev.filter(r => r.id !== item.id))
              setReparosHistorico(prev => prev.filter(r => r.id !== item.id))
            }
          } catch (err) {
            console.log('[MinhasObras] falha ao excluir item | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
            Alert.alert('Erro', err.mensagem || 'Não foi possível excluir.')
          }
        }
      }
    ])
  }

  const renderItem = ({ item, tipo }) => {
    const eEncerrado = item.status === 'encerrada'
    const eExpirado  = !eEncerrado && item.status === 'aberta' && item.expira_em && new Date(item.expira_em) < new Date()
    const info       = eEncerrado || eExpirado
      ? null
      : (statusInfo[item.status_aprovacao] || statusInfo[item.status] || statusInfo.pendente)
    const temMatch   = tipo === 'reparo' && item.match_feito_em && item.match_usuario_id
    const dist       = distanciaItemKm(coords, item)

    return (
      <TouchableOpacity
        style={estilos.card}
        onPress={() => {
          if (tipo === 'obra') navigation.navigate('DetalheObra',  { obra: item })
          else                 navigation.navigate('DetalheReparo', { reparo: item })
        }}
        activeOpacity={0.85}
      >
        <View style={estilos.cardTopo}>
          <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
          <Text style={estilos.cardValor}>
            R$ {Number(item.valor || item.valor_estimado || 0).toLocaleString('pt-BR')}
          </Text>
        </View>
        <Text style={estilos.cardLocal}>
          📍 {item.cidade}{item.uf ? `, ${item.uf}` : ''}
          {dist != null && <Text style={estilos.cardDistancia}>{`  ·  ${formatarDistancia(dist)}`}</Text>}
        </Text>

        {(eEncerrado || eExpirado) && (
          <View style={[estilos.tagHistorico, eEncerrado ? estilos.tagEncerrado : estilos.tagExpirado]}>
            <Text style={[estilos.tagHistoricoTexto, { color: eEncerrado ? '#4caf50' : '#888' }]}>
              {eEncerrado
                ? (tipo === 'obra' ? '🔒 Obra encerrada' : '🔒 Reparo encerrado')
                : '⏰ Expirado sem match'}
            </Text>
          </View>
        )}

        {temMatch && (
          <View style={estilos.matchBadge}>
            <Text style={estilos.matchBadgeTexto}>⏱ Prestador a caminho — toque para ver</Text>
          </View>
        )}

        {item.valor_acordado != null && (
          <View style={estilos.acordadoBadge}>
            <Text style={estilos.acordadoTexto}>
              🤝 Valor acordado: R$ {Number(item.valor_acordado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {info ? (
            <View style={[estilos.statusPill, { borderColor: info.cor }]}>
              <Text style={[estilos.statusTexto, { color: info.cor }]}>{info.label}</Text>
            </View>
          ) : (
            <View />
          )}
          <TouchableOpacity
            onPress={() => deletarItem(item, tipo)}
            style={estilos.btnLixeira}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 16 }}>🗑️</Text>
          </TouchableOpacity>
        </View>

        {Number(item.total_interessados) > 0 && (
          <Text style={estilos.interessados}>
            {tipo === 'obra' ? '👷' : '🔧'} {item.total_interessados} profissional(is) interessado(s)
          </Text>
        )}
      </TouchableOpacity>
    )
  }

  const aAtivos   = aba === 'obras' ? obras           : reparos
  const aHistorico= aba === 'obras' ? obrasHistorico  : reparosHistorico
  const dados     = secao === 'ativos' ? aAtivos : aHistorico

  return (
    <SafeAreaView style={estilos.container}>
      {mostrarBanner && (
        <View style={estilos.bannerParabens}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => {
              setMostrarBanner(false)
              if (itemPendente?.tipo === 'obra')   navigation.navigate('DetalheObra',   { obra: itemPendente.item })
              if (itemPendente?.tipo === 'reparo') navigation.navigate('DetalheReparo', { reparo: itemPendente.item })
            }}
          >
            <Text style={estilos.bannerParabensTexto}>🎉 Parabéns – você recebeu interessado(s) · toque para ver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMostrarBanner(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={estilos.bannerParabensFechar}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={estilos.header}>
        <View>
          <Text style={estilos.saudacao}>Olá, {usuario?.nome?.split(' ')[0]} 🏠</Text>
          <Text style={estilos.titulo}>
            {soAba === 'reparos' ? 'Meus ' : 'Minhas '}
            <Text style={{ color: cores.primaria }}>{soAba === 'reparos' ? 'Reparos' : 'Obras'}</Text>
          </Text>
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

      <View style={estilos.abasSecao}>
        <TouchableOpacity
          style={[estilos.abaSecaoBtn, secao === 'ativos' && estilos.abaSecaoBtnAtivo]}
          onPress={() => setSecao('ativos')}
        >
          <Text style={[estilos.abaSecaoTexto, secao === 'ativos' && estilos.abaSecaoTextoAtivo]}>
            Ativos ({aAtivos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[estilos.abaSecaoBtn, secao === 'historico' && estilos.abaSecaoBtnAtivo]}
          onPress={() => setSecao('historico')}
        >
          <Text style={[estilos.abaSecaoTexto, secao === 'historico' && estilos.abaSecaoTextoAtivo]}>
            Histórico ({aHistorico.length})
          </Text>
        </TouchableOpacity>
      </View>

      {carregando ? (
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      ) : dados.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>{aba === 'obras' ? '🏗️' : '🔧'}</Text>
          <Text style={estilos.vazioTitulo}>
            {secao === 'ativos'
              ? (aba === 'obras' ? 'Nenhuma obra ativa' : 'Nenhum reparo ativo')
              : 'Nenhum histórico ainda'}
          </Text>
          <Text style={estilos.vazioSub}>
            {secao === 'ativos'
              ? (aba === 'obras' ? 'Cadastre sua primeira obra de pintura!' : 'Cadastre seu primeiro reparo!')
              : (aba === 'obras' ? 'Obras encerradas e expiradas aparecerão aqui.' : 'Reparos encerrados e expirados aparecerão aqui.')}
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
  container:            { flex: 1, backgroundColor: cores.fundo },
  bannerParabens:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.medio, marginHorizontal: espacos.tela, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12 },
  bannerParabensTexto:  { flex: 1, color: '#4caf50', fontWeight: '700', fontSize: 13 },
  bannerParabensFechar: { color: '#4caf50', fontSize: 15, fontWeight: '700', paddingLeft: 12 },
  header:               { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espacos.tela, paddingTop: 16, paddingBottom: 12 },
  saudacao:             { fontSize: 13, color: cores.textoFraco, marginBottom: 2 },
  titulo:               { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  btnSair:              { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  btnSairTexto:         { fontSize: 12, color: cores.textoMedio },
  botoesRow:            { flexDirection: 'row', paddingHorizontal: espacos.tela, gap: 10, marginBottom: 12 },
  btnNovo:              { flex: 1, backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center' },
  btnNovoTexto:         { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  abas:                 { flexDirection: 'row', paddingHorizontal: espacos.tela, gap: 8, marginBottom: 8 },
  abaBtn:               { flex: 1, padding: 10, borderRadius: raios.medio, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, alignItems: 'center' },
  abaBtnAtivo:          { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
  abaTexto:             { fontSize: 13, color: cores.textoMedio },
  abaTextoAtivo:        { color: cores.primaria, fontWeight: '600' },
  abasSecao:            { flexDirection: 'row', paddingHorizontal: espacos.tela, gap: 8, marginBottom: 12 },
  abaSecaoBtn:          { flex: 1, paddingVertical: 7, borderRadius: raios.medio, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, alignItems: 'center' },
  abaSecaoBtnAtivo:     { backgroundColor: '#1a1a2a', borderColor: '#444' },
  abaSecaoTexto:        { fontSize: 12, color: cores.textoMutado },
  abaSecaoTextoAtivo:   { color: cores.textoMedio, fontWeight: '600' },
  lista:                { paddingHorizontal: espacos.tela, paddingBottom: 32, gap: 12 },
  vazio:                { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone:           { fontSize: 48, marginBottom: 16 },
  vazioTitulo:          { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub:             { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
  card:                 { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 16 },
  cardTopo:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  cardTitulo:           { flex: 1, fontSize: 14, fontWeight: '600', color: cores.textoForte, lineHeight: 20 },
  cardValor:            { fontSize: 14, fontWeight: '700', color: cores.sucesso },
  cardLocal:            { fontSize: 12, color: cores.textoFraco, marginBottom: 10 },
  cardDistancia:        { color: cores.primaria, fontWeight: '600' },
  tagHistorico:         { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8, borderWidth: 0.5 },
  tagEncerrado:         { backgroundColor: '#0a1a0a', borderColor: '#2a4a2a' },
  tagExpirado:          { backgroundColor: '#1a1a1a', borderColor: '#333' },
  tagHistoricoTexto:    { fontSize: 10, fontWeight: '600' },
  matchBadge:           { backgroundColor: '#1a1a2a', borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.medio, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  matchBadgeTexto:      { fontSize: 11, color: cores.primaria, fontWeight: '600', textAlign: 'center' },
  acordadoBadge:        { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.medio, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  acordadoTexto:        { fontSize: 12, color: '#4caf50', fontWeight: '700', textAlign: 'center' },
  statusPill:           { alignSelf: 'flex-start', borderWidth: 0.5, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  statusTexto:          { fontSize: 11, fontWeight: '500' },
  btnLixeira:           { padding: 6, borderRadius: 8, backgroundColor: '#3a1a1a' },
  interessados:         { fontSize: 11, color: cores.textoMutado, marginTop: 6 },
})
