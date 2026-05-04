import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator
} from 'react-native'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const statusInfo = {
  pendente:  { cor: '#E8833A', label: '⏳ Aguardando aprovação', desc: 'Nossa equipe está analisando sua obra.' },
  aprovada:  { cor: '#4caf50', label: '✅ Aprovada', desc: 'Sua obra está visível para pintores assinantes.' },
  recusada:  { cor: '#f44336', label: '❌ Recusada', desc: 'Sua obra não foi aprovada. Entre em contato conosco.' },
  aberta:    { cor: '#4caf50', label: '✅ Publicada', desc: 'Sua obra está visível para pintores assinantes.' },
  encerrada: { cor: '#888',    label: '🔒 Encerrada', desc: 'Esta obra foi encerrada.' },
}

const statusCandidatura = {
  pendente:  { cor: '#E8833A', label: '⏳ Em análise' },
  aprovada:  { cor: '#4caf50', label: '✅ Aprovado' },
  recusada:  { cor: '#f44336', label: '❌ Recusado' },
}

export default function DetalheMinhaObraScreen({ route, navigation }) {
  const { obra } = route.params
  const [candidaturas, setCandidaturas] = useState([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
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
    buscar()
  }, [obra.id])

  const info = statusInfo[obra.status_aprovacao] || statusInfo[obra.status] || statusInfo.pendente

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoMedio, fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.topbarTitulo}>Detalhe da obra</Text>
        <View style={{ width: 36 }} />
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
              <Text style={estilos.statValor}>R$ {Number(obra.valor).toLocaleString('pt-BR')}</Text>
              <Text style={estilos.statLabel}>Valor estimado</Text>
            </View>
            <View style={estilos.statCard}>
              <Text style={estilos.statValor}>{obra.prazo_execucao_dias} dias</Text>
              <Text style={estilos.statLabel}>Prazo</Text>
            </View>
            <View style={estilos.statCard}>
              <Text style={[estilos.statValor, { color: cores.primaria }]}>{candidaturas.length}</Text>
              <Text style={estilos.statLabel}>Interessados</Text>
            </View>
          </View>

          {obra.descricao && (
            <>
              <Text style={estilos.secaoTitulo}>Descrição</Text>
              <Text style={estilos.descricao}>{obra.descricao}</Text>
            </>
          )}

          <Text style={estilos.secaoTitulo}>Pintores interessados ({candidaturas.length})</Text>

          {carregando ? (
            <ActivityIndicator color={cores.primaria} />
          ) : candidaturas.length === 0 ? (
            <View style={estilos.vazio}>
              <Text style={estilos.vazioIcone}>👷</Text>
              <Text style={estilos.vazioTexto}>
                {obra.status_aprovacao === 'pendente' || obra.status_aprovacao === 'recusada'
                  ? 'Aguardando aprovação para receber candidaturas'
                  : 'Nenhum pintor demonstrou interesse ainda'}
              </Text>
            </View>
          ) : (
            candidaturas.map(c => {
              const sc = statusCandidatura[c.status] || statusCandidatura.pendente
              return (
                <View key={c.id} style={estilos.candidaturaCard}>
                  <View style={estilos.candidaturaHeader}>
                    <View>
                      <Text style={estilos.pintorNome}>{c.nome || 'Pintor'}</Text>
                      <Text style={estilos.pintorInfo}>
                        {c.cidade || ''}{c.anos_experiencia ? ` · ${c.anos_experiencia} anos exp.` : ''}
                        {c.tamanho_equipe ? ` · Equipe: ${c.tamanho_equipe}` : ''}
                      </Text>
                    </View>
                    <View style={[estilos.statusPill, { borderColor: sc.cor }]}>
                      <Text style={[estilos.statusPillTexto, { color: sc.cor }]}>{sc.label}</Text>
                    </View>
                  </View>
                  {c.referencias && <Text style={estilos.referencias}>"{c.referencias}"</Text>}
                  {c.telefone && <Text style={estilos.contato}>📱 {c.telefone}</Text>}
                </View>
              )
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espacos.tela, paddingVertical: 12 },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topbarTitulo: { fontSize: 14, color: cores.textoMedio, fontWeight: '500' },
  corpo: { paddingHorizontal: espacos.tela, paddingBottom: 40 },
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, lineHeight: 28, marginBottom: 6 },
  local: { fontSize: 13, color: cores.textoFraco, marginBottom: 16 },
  statusCard: { borderWidth: 1, borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  statusLabel: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  statusDesc: { fontSize: 13, color: cores.textoMedio, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  statValor: { fontSize: 14, fontWeight: '700', color: cores.textoForte, marginBottom: 3 },
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
  referencias: { fontSize: 12, color: cores.textoMedio, fontStyle: 'italic', lineHeight: 18, marginBottom: 6 },
  contato: { fontSize: 12, color: cores.primaria },
})