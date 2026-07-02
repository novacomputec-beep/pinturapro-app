import React, { useState, useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Linking, Alert
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../services/api'
import ModalAvaliacao from '../../components/ModalAvaliacao'
import { cores, espacos, raios } from '../../utils/tema'

const formatarValor = (v) =>
  (v == null || isNaN(Number(v)))
    ? 'A combinar'
    : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const formatarData = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—'

export default function ContratosFinalizadosScreen({ navigation, route }) {
  const tipo = route?.params?.tipo === 'obra' ? 'obra' : 'reparo'
  // perfil='dono' usa os endpoints do solicitante (mostra o prestador contratado);
  // padrão 'prestador' mantém o comportamento legado (mostra o dono/solicitante).
  const perfil = route?.params?.perfil === 'dono' ? 'dono' : 'prestador'
  const ehObra = tipo === 'obra'
  const ehDono = perfil === 'dono'
  const endpoint = ehDono
    ? (ehObra ? '/obras/meus-contratos-dono' : '/reparos/meus-contratos-dono')
    : (ehObra ? '/obras/meus-contratos'      : '/reparos/meus-contratos')
  const telaDetalhe = ehObra ? 'DetalheObra' : 'DetalheReparo'

  const [contratos, setContratos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [bloqueados, setBloqueados] = useState(new Set())
  const [avaliandoContrato, setAvaliandoContrato] = useState(null)

  // Carrega a lista de prestadores bloqueados do dono na montagem (só lado dono).
  useEffect(() => {
    if (!ehDono) return
    api.get('/usuarios/prestadores-bloqueados').then(resp => {
      const ids = new Set((resp.bloqueados || []).map(b => b.prestador_id))
      setBloqueados(ids)
    }).catch(err => console.log('[ContratosFinalizados] falha ao carregar bloqueados | msg:', err.message))
  }, [ehDono])

  const toggleBloqueio = async (prestadorId) => {
    const jaBloqueado = bloqueados.has(prestadorId)
    try {
      if (jaBloqueado) {
        await api.delete(`/usuarios/desbloquear-prestador/${prestadorId}`)
        setBloqueados(prev => { const novo = new Set(prev); novo.delete(prestadorId); return novo })
      } else {
        await api.post('/usuarios/bloquear-prestador', { prestador_id: prestadorId })
        setBloqueados(prev => new Set(prev).add(prestadorId))
      }
    } catch (err) {
      console.log('[ContratosFinalizados] falha ao alternar bloqueio | msg:', err.message)
      Alert.alert('Erro', 'Não foi possível atualizar o bloqueio. Tente novamente.')
    }
  }

  const handleEnviarAvaliacao = async (estrelas) => {
    try {
      await api.post('/avaliacoes', {
        contrato_tipo: ehObra ? 'obra' : 'reparo',
        contrato_id: avaliandoContrato.id,
        estrelas,
      })
      setAvaliandoContrato(null)
      buscar()  // refresh list so ja_avaliei updates
    } catch (err) {
      setAvaliandoContrato(null)
      // O interceptor de api.js rejeita com { mensagem, status, code }.
      const msg = err?.mensagem || 'Não foi possível enviar a avaliação. Tente novamente.'
      Alert.alert('Erro', msg)
    }
  }

  const buscar = async () => {
    try {
      const data = await api.get(endpoint)
      setContratos(data.contratos || [])
    } catch (err) {
      console.log('[ContratosFinalizados] falha ao carregar | tipo:', tipo, '| status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscar() }, []))

  const onRefresh = () => { setAtualizando(true); buscar() }

  const abrirDetalhe = (item) => {
    if (ehObra) navigation.navigate('DetalheObra', { obra: item })
    else        navigation.navigate('DetalheReparo', { reparo: item })
  }

  const ligarDono = (tel) => {
    if (tel) Linking.openURL(`tel:${tel}`).catch(err => console.log('[ContratosFinalizados] falha ao discar | msg:', err.message))
  }

  if (carregando) {
    return (
      <SafeAreaView style={estilos.container}>
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  const renderItem = ({ item }) => {
    const valorBase = ehObra ? item.valor : item.valor_estimado
    return (
      <View style={estilos.card}>
        <View style={estilos.cardHeader}>
          <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
          <View style={estilos.badgeConcluido}>
            <Text style={estilos.badgeConcluidoTexto}>✅ Concluído</Text>
          </View>
        </View>
        <Text style={estilos.cardMeta}>{item.categoria} · {item.cidade}{item.uf ? `, ${item.uf}` : ''}</Text>

        <View style={estilos.valoresRow}>
          <View>
            <Text style={estilos.valorLabel}>Valor acordado</Text>
            <Text style={[estilos.valorTexto, { color: cores.primaria }]}>
              {formatarValor(item.valor_acordado != null ? item.valor_acordado : valorBase)}
            </Text>
          </View>
          <View>
            <Text style={estilos.valorLabel}>Concluído em</Text>
            <Text style={estilos.valorTexto}>{formatarData(item.match_feito_em)}</Text>
          </View>
        </View>

        {(ehDono ? item.prestador_nome : item.dono_nome) && (
          <Text style={estilos.dono}>
            👤 {ehDono ? `Prestador: ${item.prestador_nome}` : item.dono_nome}
          </Text>
        )}

        <View style={estilos.acoes}>
          <TouchableOpacity style={estilos.btnVer} onPress={() => abrirDetalhe(item)}>
            <Text style={estilos.btnVerTexto}>Ver detalhes →</Text>
          </TouchableOpacity>
          {(ehDono ? item.prestador_telefone : item.dono_telefone) && (
            <TouchableOpacity style={estilos.btnLigar} onPress={() => ligarDono(ehDono ? item.prestador_telefone : item.dono_telefone)}>
              <Text style={estilos.btnLigarTexto}>📞 Contato</Text>
            </TouchableOpacity>
          )}
        </View>

        {ehDono && item.prestador_id && (
          <TouchableOpacity
            style={[estilos.btnBloquear, bloqueados.has(item.prestador_id) && estilos.btnBloquearAtivo]}
            onPress={() => toggleBloqueio(item.prestador_id)}
          >
            <Text style={[estilos.btnBloquearTexto, bloqueados.has(item.prestador_id) && estilos.btnBloquearTextoAtivo]}>
              {bloqueados.has(item.prestador_id) ? '✅ Desbloquear para futuros serviços' : '🚫 Bloquear para futuros serviços'}
            </Text>
          </TouchableOpacity>
        )}

        {(ehDono ? item.prestador_id : item.dono_id) && !item.ja_avaliei && (
          <TouchableOpacity
            style={estilos.btnAvaliar}
            onPress={() => setAvaliandoContrato(item)}
          >
            <Text style={estilos.btnAvaliarTexto}>⭐ Avaliar {ehDono ? 'prestador' : 'solicitante'}</Text>
          </TouchableOpacity>
        )}
        {item.ja_avaliei && (
          <View style={estilos.avaliadoBadge}>
            <Text style={estilos.avaliadoBadgeTexto}>✅ Você já avaliou este contrato</Text>
          </View>
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Contratos Finalizados</Text>
        <Text style={estilos.subtitulo}>
          {contratos.length} {ehObra ? 'obra' : 'reparo'}{contratos.length !== 1 ? 's' : ''} concluído{contratos.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {contratos.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>✅</Text>
          <Text style={estilos.vazioTitulo}>Nenhum contrato finalizado</Text>
          <Text style={estilos.vazioSub}>
            {ehDono
              ? (ehObra
                  ? 'Obras concluídas em que você contratou um profissional aparecerão aqui.'
                  : 'Reparos concluídos em que você contratou um profissional aparecerão aqui.')
              : (ehObra
                  ? 'Obras concluídas em que você foi o profissional contratado aparecerão aqui.'
                  : 'Reparos concluídos em que você foi o profissional contratado aparecerão aqui.')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={contratos}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={estilos.lista}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}

      <ModalAvaliacao
        visivel={!!avaliandoContrato}
        nomeAvaliado={avaliandoContrato ? (ehDono ? avaliandoContrato.prestador_nome : avaliandoContrato.dono_nome) : ''}
        onEnviar={handleEnviarAvaliacao}
        onFechar={() => setAvaliandoContrato(null)}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container:          { flex: 1, backgroundColor: cores.fundo },
  header:             { paddingHorizontal: espacos.tela, paddingTop: 16, paddingBottom: 12 },
  titulo:             { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  subtitulo:          { fontSize: 13, color: cores.textoFraco, marginTop: 2 },
  lista:              { paddingHorizontal: espacos.tela, paddingBottom: 32, paddingTop: 8 },
  card:               { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 16 },
  cardHeader:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitulo:         { fontSize: 14, fontWeight: '600', color: cores.textoForte, flex: 1, marginRight: 8, lineHeight: 20 },
  badgeConcluido:     { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#1a3a1a' },
  badgeConcluidoTexto:{ fontSize: 11, fontWeight: '700', color: '#4caf50' },
  cardMeta:           { fontSize: 12, color: cores.textoFraco, marginBottom: 12, textTransform: 'capitalize' },
  valoresRow:         { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 },
  valorLabel:         { fontSize: 10, color: cores.textoMutado, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  valorTexto:         { fontSize: 15, fontWeight: '700', color: cores.textoForte },
  dono:               { fontSize: 12, color: cores.textoMedio, marginBottom: 12 },
  acoes:              { flexDirection: 'row', gap: 10 },
  btnVer:             { flex: 1, backgroundColor: cores.primaria, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnVerTexto:        { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  btnLigar:           { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', borderWidth: 0.5, borderColor: cores.borda, backgroundColor: cores.fundoElevado },
  btnLigarTexto:      { fontSize: 13, fontWeight: '600', color: cores.textoMedio },
  btnBloquear:        { marginTop: 8, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 0.5, borderColor: cores.perigo, backgroundColor: 'transparent' },
  btnBloquearTexto:   { fontSize: 12, fontWeight: '600', color: cores.perigo },
  btnBloquearAtivo:   { backgroundColor: cores.perigo + '15', borderColor: cores.perigo },
  btnBloquearTextoAtivo: { color: cores.perigo },
  btnAvaliar:         { marginTop: 8, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 0.5, borderColor: '#E8833A', backgroundColor: '#E8833A15' },
  btnAvaliarTexto:    { fontSize: 12, fontWeight: '700', color: '#E8833A' },
  avaliadoBadge:      { marginTop: 8, borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: cores.fundoElevado },
  avaliadoBadgeTexto: { fontSize: 12, fontWeight: '600', color: cores.textoMedio },
  vazio:              { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone:         { fontSize: 48, marginBottom: 16 },
  vazioTitulo:        { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub:           { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
})
