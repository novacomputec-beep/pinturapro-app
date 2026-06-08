import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator,
  Image, FlatList, Dimensions
} from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import { obrasService, candidaturasService, mensagensService } from '../../services/api'
import api from '../../services/api'
import { BotaoPrimario, BotaoSecundario, Tag, Separador } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

const { width } = Dimensions.get('window')

const formatarValor = (v) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const formatarCountdown = (expiraEm) => {
  const diff = new Date(expiraEm) - new Date()
  if (diff <= 0) return 'Expirado'
  const horas = Math.floor(diff / 3600000)
  const minutos = Math.floor((diff % 3600000) / 60000)
  if (horas < 24) return `${horas}h ${minutos}m`
  return `${Math.floor(horas / 24)} dias`
}

export default function DetalheObraScreen({ route, navigation }) {
  const { obra: obraInicial } = route.params
  const [obra, setObra] = useState(null)
  const [midias, setMidias] = useState([])
  const [minhaCandidatura, setMinhaCandidatura] = useState(null)
  const [negociacoes, setNegociacoes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [modalNegociar, setModalNegociar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [referencias, setReferencias] = useState('')
  const [valorOferta, setValorOferta] = useState('')
  const [mensagemOferta, setMensagemOferta] = useState('')
  const [valorNegociacao, setValorNegociacao] = useState('')
  const [mensagemNegociacao, setMensagemNegociacao] = useState('')
  const [duvida, setDuvida] = useState('')
  const [enviandoDuvida, setEnviandoDuvida] = useState(false)
  const [fotoAtiva, setFotoAtiva] = useState(0)
  const [usarContraOferta, setUsarContraOferta] = useState(false)

  useEffect(() => {
    buscar()
  }, [obraInicial.id])

  const buscar = async () => {
    try {
      const resposta = await obrasService.detalhe(obraInicial.id)
      setObra(resposta.obra)
      setMidias(resposta.midias || [])
      setMinhaCandidatura(resposta.minha_candidatura)
      if (resposta.minha_candidatura?.id) {
        const negResp = await api.get(`/candidaturas/${resposta.minha_candidatura.id}/negociacoes`)
        setNegociacoes(negResp.negociacoes || [])
      }
    } catch {
      setObra(obraInicial)
    } finally {
      setCarregando(false)
    }
  }

  const handleCandidatar = async () => {
    if (!referencias.trim()) {
      Alert.alert('Atenção', 'Descreva sua experiência e referências.')
      return
    }
    if (usarContraOferta && !valorOferta.trim()) {
      Alert.alert('Atenção', 'Informe o valor da sua oferta.')
      return
    }
    setEnviando(true)
    try {
      await api.post('/candidaturas', {
        obra_id: obra.id,
        referencias,
        valor_oferta: usarContraOferta ? parseFloat(valorOferta.replace(',', '.')) : null,
        mensagem_oferta: usarContraOferta ? mensagemOferta : null,
      })
      setMinhaCandidatura({ status: 'pendente' })
      setModalAberto(false)
      Alert.alert(
        'Solicitação enviada! 🎉',
        usarContraOferta
          ? `Sua oferta de R$ ${valorOferta} foi enviada para análise.`
          : 'Sua candidatura foi recebida. A equipe irá analisá-la em breve.'
      )
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar sua candidatura.')
    } finally {
      setEnviando(false)
    }
  }

  const handleNegociar = async () => {
    if (!valorNegociacao.trim()) {
      Alert.alert('Atenção', 'Informe o valor da sua contra-oferta.')
      return
    }
    setEnviando(true)
    try {
      await api.post(`/candidaturas/${minhaCandidatura.id}/negociar`, {
        valor: parseFloat(valorNegociacao.replace(',', '.')),
        mensagem: mensagemNegociacao,
      })
      setModalNegociar(false)
      setValorNegociacao('')
      setMensagemNegociacao('')
      await buscar()
      Alert.alert('Contra-oferta enviada!', 'O dono da obra será notificado.')
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar a contra-oferta.')
    } finally {
      setEnviando(false)
    }
  }

  const handleEnviarDuvida = async () => {
    if (!duvida.trim()) return
    setEnviandoDuvida(true)
    try {
      await mensagensService.enviar(obra.id, duvida)
      setDuvida('')
      Alert.alert('Dúvida enviada!', 'A equipe responderá em breve.')
    } catch (err) {
      Alert.alert('Erro', err.mensagem)
    } finally {
      setEnviandoDuvida(false)
    }
  }

  if (carregando) {
    return (
      <SafeAreaView style={estilos.container}>
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  const dadosObra = obra || obraInicial
  const countdown = formatarCountdown(dadosObra.expira_em)
  const urgente = countdown && !countdown.includes('dia') && countdown !== 'Expirado'

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoForte, fontSize: 32, fontWeight: '900' }}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.topbarTitulo}>Detalhe da obra</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {midias.length > 0 ? (
          <View style={estilos.galeriaWrap}>
            <FlatList
              data={midias}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / width)
                setFotoAtiva(index)
              }}
              renderItem={({ item }) => (
                <View style={estilos.fotoSlide}>
                  {item.tipo === 'foto' ? (
                    <Image source={{ uri: item.url_assinada || item.url }} style={estilos.fotoImagem} resizeMode="cover" />
                  ) : (
                    <Video source={{ uri: item.url_assinada || item.url }} style={estilos.fotoImagem} useNativeControls resizeMode={ResizeMode.COVER} isLooping={false} />
                  )}
                </View>
              )}
            />
            <View style={estilos.indicadoresRow}>
              {midias.map((_, i) => (
                <View key={i} style={[estilos.indicadorDot, i === fotoAtiva && estilos.indicadorDotAtivo]} />
              ))}
            </View>
            {urgente && (
              <View style={estilos.countdownPill}>
                <View style={estilos.countdownDot} />
                <Text style={estilos.countdownTexto}>Expira {countdown}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={estilos.galeria}>
            <View style={estilos.fotoMain}>
              <Text style={estilos.fotoIcone}>🏠</Text>
              {urgente && (
                <View style={estilos.countdownPill}>
                  <View style={estilos.countdownDot} />
                  <Text style={estilos.countdownTexto}>Expira {countdown}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={estilos.corpo}>
          <View style={estilos.obraHeader}>
            <View style={estilos.categoriaPill}>
              <Text style={estilos.categoriaPillTexto}>{dadosObra.categoria}</Text>
            </View>
            <Text style={estilos.obraTitulo}>{dadosObra.titulo}</Text>
            <Text style={estilos.localTexto}>
              📍 {dadosObra.cidade}, MG
              {dadosObra.bairro ? ` · ${dadosObra.bairro}` : ''}
              {dadosObra.metragem ? ` · ${dadosObra.metragem}m²` : ''}
            </Text>
          </View>

          <View style={estilos.statsRow}>
            <View style={estilos.statCard}>
              <Text style={[estilos.statValor, { color: cores.sucesso }]}>
                {formatarValor(dadosObra.valor)}
              </Text>
              <Text style={estilos.statLabel}>Empreitada</Text>
            </View>
            <View style={estilos.statCard}>
              <Text style={estilos.statValor}>{dadosObra.prazo_execucao_dias} dias</Text>
              <Text style={estilos.statLabel}>Prazo execução</Text>
            </View>
            <View style={[estilos.statCard, urgente && { borderColor: cores.primaria + '33' }]}>
              <Text style={[estilos.statValor, urgente && { color: cores.primaria }]}>{countdown}</Text>
              <Text style={estilos.statLabel}>Expira em</Text>
            </View>
          </View>

          {dadosObra.descricao && (
            <>
              <Text style={estilos.secaoTitulo}>Descrição da obra</Text>
              <Text style={estilos.descricaoTexto}>{dadosObra.descricao}</Text>
            </>
          )}

          {dadosObra.tags?.length > 0 && (
            <>
              <Text style={estilos.secaoTitulo}>Serviços inclusos</Text>
              <View style={estilos.tagsWrap}>
                {dadosObra.tags.map((tag, i) => <Tag key={i} texto={tag} />)}
              </View>
            </>
          )}

          {/* Histórico de negociações */}
          {negociacoes.length > 0 && (
            <>
              <Separador estilo={{ marginVertical: 16 }} />
              <Text style={estilos.secaoTitulo}>Histórico de negociação</Text>
              {negociacoes.map((neg, i) => (
                <View key={i} style={[estilos.negCard, neg.autor_role === 'assinante' && estilos.negCardPintor]}>
                  <Text style={estilos.negAutor}>{neg.autor_role === 'assinante' ? '👷 Você' : '🏠 Dono da obra'}</Text>
                  <Text style={estilos.negValor}>Proposta: {formatarValor(neg.valor)}</Text>
                  {neg.mensagem && <Text style={estilos.negMensagem}>{neg.mensagem}</Text>}
                </View>
              ))}
              <TouchableOpacity style={estilos.btnNegociar} onPress={() => setModalNegociar(true)}>
                <Text style={estilos.btnNegociarTexto}>💰 Fazer nova contra-oferta</Text>
              </TouchableOpacity>
            </>
          )}

          <Separador estilo={{ marginVertical: 20 }} />

          <Text style={estilos.secaoTitulo}>Dúvidas sobre esta obra?</Text>
          <View style={estilos.duvidaBox}>
            <TextInput
              style={estilos.duvidaInput}
              placeholder="Digite sua pergunta aqui..."
              placeholderTextColor={cores.textoMutado}
              value={duvida}
              onChangeText={setDuvida}
              multiline
            />
            <TouchableOpacity style={estilos.duvidaEnviarBtn} onPress={handleEnviarDuvida} disabled={enviandoDuvida || !duvida.trim()}>
              {enviandoDuvida
                ? <ActivityIndicator color={cores.primaria} size="small" />
                : <Text style={estilos.duvidaEnviarTexto}>→</Text>
              }
            </TouchableOpacity>
          </View>

          <Separador estilo={{ marginVertical: 20 }} />

          {minhaCandidatura ? (
            <View style={estilos.candidaturaFeita}>
              <Text style={{ color: cores.primaria, fontWeight: '600', marginBottom: 6 }}>
                {minhaCandidatura.status === 'pendente' ? '⏳ Aguardando análise'
                  : minhaCandidatura.status === 'aprovada' ? '✅ Aprovado!'
                  : '❌ Não selecionado'}
              </Text>
              <Text style={estilos.candidaturaFeitaTexto}>
                {minhaCandidatura.status === 'pendente'
                  ? 'Sua candidatura está sendo analisada pela equipe.'
                  : minhaCandidatura.status === 'aprovada'
                  ? 'Parabéns! Você foi aprovado para esta obra.'
                  : 'Sua candidatura não foi selecionada desta vez.'}
              </Text>
              {minhaCandidatura.status === 'pendente' && negociacoes.length === 0 && (
                <TouchableOpacity style={[estilos.btnNegociar, { marginTop: 12 }]} onPress={() => setModalNegociar(true)}>
                  <Text style={estilos.btnNegociarTexto}>💰 Fazer contra-oferta</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              <BotaoPrimario titulo="Tenho interesse nesta obra →" onPress={() => setModalAberto(true)} />
              <Text style={estilos.aceiteAviso}>
                Ao demonstrar interesse, sua solicitação será analisada pela equipe antes da confirmação.
              </Text>
            </>
          )}
        </View>
      </ScrollView>

      {/* Modal de candidatura */}
      <Modal visible={modalAberto} animationType="slide" transparent onRequestClose={() => setModalAberto(false)}>
        <View style={estilos.modalOverlay}>
          <View style={estilos.modalSheet}>
            <View style={estilos.modalHandle} />
            <Text style={estilos.modalTitulo}>Solicitação de obra</Text>
            <Text style={estilos.modalSub}>Preencha os dados abaixo para análise da equipe</Text>

            <Text style={estilos.inputLabel}>REFERÊNCIAS E EXPERIÊNCIA</Text>
            <TextInput
              style={estilos.textarea}
              placeholder="Descreva brevemente sua experiência e obras realizadas..."
              placeholderTextColor={cores.textoMutado}
              value={referencias}
              onChangeText={setReferencias}
              multiline
              numberOfLines={4}
            />

            {/* Toggle contra-oferta */}
            <TouchableOpacity
              style={estilos.toggleOferta}
              onPress={() => setUsarContraOferta(!usarContraOferta)}
            >
              <View style={[estilos.toggleBox, usarContraOferta && estilos.toggleBoxAtivo]}>
                {usarContraOferta && <View style={estilos.toggleDot} />}
              </View>
              <Text style={estilos.toggleTexto}>Quero propor um valor diferente</Text>
            </TouchableOpacity>

            {usarContraOferta && (
              <>
                <Text style={estilos.valorAtualTexto}>
                  Valor atual da obra: {formatarValor(dadosObra.valor)}
                </Text>
                <Text style={estilos.inputLabel}>MINHA OFERTA (R$)</Text>
                <TextInput
                  style={estilos.inputSimples}
                  placeholder="Ex: 3500"
                  placeholderTextColor={cores.textoMutado}
                  value={valorOferta}
                  onChangeText={setValorOferta}
                  keyboardType="numeric"
                />
                <Text style={estilos.inputLabel}>JUSTIFICATIVA (opcional)</Text>
                <TextInput
                  style={[estilos.textarea, { minHeight: 60 }]}
                  placeholder="Explique o motivo da sua oferta..."
                  placeholderTextColor={cores.textoMutado}
                  value={mensagemOferta}
                  onChangeText={setMensagemOferta}
                  multiline
                  numberOfLines={3}
                />
              </>
            )}

            <BotaoPrimario
              titulo={usarContraOferta ? `Enviar oferta de R$ ${valorOferta || '...'}` : 'Enviar solicitação'}
              onPress={handleCandidatar}
              carregando={enviando}
              estilo={{ marginTop: 16, marginBottom: 10 }}
            />
            <BotaoSecundario titulo="Cancelar" onPress={() => setModalAberto(false)} />
          </View>
        </View>
      </Modal>

      {/* Modal de negociação */}
      <Modal visible={modalNegociar} animationType="slide" transparent onRequestClose={() => setModalNegociar(false)}>
        <View style={estilos.modalOverlay}>
          <View style={estilos.modalSheet}>
            <View style={estilos.modalHandle} />
            <Text style={estilos.modalTitulo}>Contra-oferta</Text>
            <Text style={estilos.modalSub}>Proponha um novo valor para negociação</Text>
            <Text style={estilos.valorAtualTexto}>Valor da obra: {formatarValor(dadosObra.valor)}</Text>
            <Text style={estilos.inputLabel}>MEU VALOR (R$)</Text>
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
              style={[estilos.textarea, { minHeight: 80 }]}
              placeholder="Explique sua proposta..."
              placeholderTextColor={cores.textoMutado}
              value={mensagemNegociacao}
              onChangeText={setMensagemNegociacao}
              multiline
            />
            <BotaoPrimario titulo="Enviar contra-oferta →" onPress={handleNegociar} carregando={enviando} estilo={{ marginTop: 16, marginBottom: 10 }} />
            <BotaoSecundario titulo="Cancelar" onPress={() => setModalNegociar(false)} />
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
  topbarTitulo: { fontSize: 14, color: cores.textoMedio, fontWeight: '500' },
  galeriaWrap: { position: 'relative' },
  fotoSlide: { width, height: 220 },
  fotoImagem: { width: '100%', height: '100%' },
  indicadoresRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  indicadorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: cores.fundoElevado },
  indicadorDotAtivo: { width: 16, borderRadius: 3, backgroundColor: cores.primaria },
  galeria: { paddingHorizontal: espacos.tela, marginBottom: 16 },
  fotoMain: { height: 200, backgroundColor: cores.fundoElevado, borderRadius: 16, alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  fotoIcone: { fontSize: 60, opacity: 0.08 },
  countdownPill: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(10,10,10,0.88)', borderWidth: 0.5, borderColor: cores.primaria, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 5 },
  countdownDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: cores.primaria },
  countdownTexto: { fontSize: 10, fontWeight: '500', color: cores.primaria },
  corpo: { paddingHorizontal: espacos.tela, paddingBottom: 40 },
  obraHeader: { marginBottom: 16 },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 10 },
  categoriaPillTexto: { fontSize: 11, color: cores.textoFraco, textTransform: 'capitalize' },
  obraTitulo: { fontSize: 18, fontWeight: '700', color: cores.textoForte, lineHeight: 26, marginBottom: 8 },
  localTexto: { fontSize: 12, color: cores.textoFraco },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  statValor: { fontSize: 13, fontWeight: '700', color: cores.textoForte, marginBottom: 3 },
  statLabel: { fontSize: 10, color: cores.textoFraco, textAlign: 'center' },
  secaoTitulo: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  descricaoTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 22, marginBottom: 20 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  negCard: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, marginBottom: 8 },
  negCardPintor: { borderColor: cores.primaria + '44', backgroundColor: cores.primariaSuave },
  negAutor: { fontSize: 12, color: cores.textoFraco, marginBottom: 4 },
  negValor: { fontSize: 15, fontWeight: '700', color: cores.sucesso, marginBottom: 4 },
  negMensagem: { fontSize: 12, color: cores.textoMedio, fontStyle: 'italic' },
  btnNegociar: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.primaria, borderRadius: raios.medio, padding: 12, alignItems: 'center', marginTop: 8 },
  btnNegociarTexto: { fontSize: 13, color: cores.primaria, fontWeight: '600' },
  duvidaBox: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginBottom: 4 },
  duvidaInput: { flex: 1, fontSize: 13, color: cores.textoForte, minHeight: 40, maxHeight: 100 },
  duvidaEnviarBtn: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  duvidaEnviarTexto: { color: cores.primaria, fontSize: 16 },
  candidaturaFeita: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 16 },
  candidaturaFeitaTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 20 },
  aceiteAviso: { textAlign: 'center', fontSize: 11, color: cores.textoMutado, marginTop: 10, lineHeight: 18 },
  inputLabel: { fontSize: 11, color: cores.textoFraco, letterSpacing: 0.5, marginBottom: 7, textTransform: 'uppercase' },
  textarea: { backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, fontSize: 13, color: cores.textoForte, minHeight: 100, textAlignVertical: 'top', marginBottom: 12 },
  inputSimples: { backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, fontSize: 14, color: cores.textoForte, marginBottom: 12 },
  valorAtualTexto: { fontSize: 12, color: cores.textoFraco, marginBottom: 12 },
  toggleOferta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  toggleBox: { width: 36, height: 20, borderRadius: 10, borderWidth: 0.5, borderColor: cores.borda, backgroundColor: cores.fundoElevado, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 2 },
  toggleBoxAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria, alignItems: 'flex-end' },
  toggleDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#0A0A0A' },
  toggleTexto: { fontSize: 13, color: cores.textoMedio },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 0.5, borderColor: cores.borda, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, backgroundColor: cores.borda, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, marginBottom: 4 },
  modalSub: { fontSize: 12, color: cores.textoFraco, marginBottom: 20 },
})