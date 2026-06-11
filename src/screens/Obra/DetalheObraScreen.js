import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator,
  Image, Dimensions
} from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import { obrasService, candidaturasService, mensagensService } from '../../services/api'
import api from '../../services/api'
import { BotaoPrimario, BotaoSecundario, Tag, Separador } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

const { width } = Dimensions.get('window')

const formatarValor = (v) =>
  (v == null || isNaN(Number(v)))
    ? 'A combinar'
    : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const ContadorPill = ({ expiraEm }) => {
  const [restante, setRestante] = useState(null)
  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiraEm) - new Date()
      if (diff <= 0) { setRestante(null); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRestante({ h, m, s })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiraEm])
  if (!restante) return null
  const urgente = restante.h < 1
  const texto = restante.h > 0
    ? `${restante.h}h ${String(restante.m).padStart(2, '0')}m`
    : `${String(restante.m).padStart(2, '0')}m ${String(restante.s).padStart(2, '0')}s`
  return (
    <View style={[st.countdownPill, urgente && { backgroundColor: 'rgba(139,0,0,0.92)', borderColor: '#FF4444' }]}>
      <View style={[st.countdownDot, urgente && { backgroundColor: '#FF4444' }]} />
      <Text style={[st.countdownTexto, urgente && { color: '#FF4444' }]}>⏱ {texto}</Text>
    </View>
  )
}

const ContadorStat = ({ expiraEm }) => {
  const [restante, setRestante] = useState(null)
  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiraEm) - new Date()
      if (diff <= 0) { setRestante(null); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRestante({ h, m, s })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiraEm])
  if (!restante) return <Text style={[st.statValor, { color: '#f44336' }]}>Expirado</Text>
  const urgente = restante.h === 0 && restante.m < 10
  const texto = restante.h > 0
    ? `${restante.h}h ${String(restante.m).padStart(2, '0')}m`
    : `${String(restante.m).padStart(2, '0')}m ${String(restante.s).padStart(2, '0')}s`
  return <Text style={[st.statValor, urgente && { color: '#f44336' }]}>{texto}</Text>
}

export default function DetalheObraScreen({ route, navigation }) {
  const { obra: obraInicial } = route.params || {}
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
  const [midiaFullscreen, setMidiaFullscreen] = useState(null)

  useEffect(() => {
    if (obraInicial?.id) buscar()
    else setCarregando(false)
  }, [obraInicial?.id])

  const buscar = async () => {
    try {
      const resposta = await obrasService.detalhe(obraInicial.id)
      setObra(resposta.obra || resposta)
      setMidias(resposta.midias || [])
      setMinhaCandidatura(resposta.minha_candidatura || null)
      if (resposta.minha_candidatura?.id) {
        try {
          const negResp = await api.get(`/candidaturas/${resposta.minha_candidatura.id}/negociacoes`)
          setNegociacoes(negResp.negociacoes || [])
        } catch (e) {}
      }
    } catch (e) {
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
        obra_id: obra?.id || obraInicial?.id,
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
      await api.post(`/candidaturas/${minhaCandidatura?.id}/negociar`, {
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
      await mensagensService.enviar(obra?.id || obraInicial?.id, duvida)
      setDuvida('')
      Alert.alert('Dúvida enviada!', 'A equipe responderá em breve.')
    } catch (err) {
      Alert.alert('Erro', err.mensagem)
    } finally {
      setEnviandoDuvida(false)
    }
  }

  const handlePintorResponder = async (action) => {
    setEnviando(true)
    try {
      await api.post(`/candidaturas/${minhaCandidatura?.id}/pintor-responder`, { action })
      await buscar()
      Alert.alert(
        action === 'aceitar' ? '✅ Proposta aceita!' : 'Proposta recusada',
        action === 'aceitar'
          ? 'O dono da obra será notificado. Combine os detalhes!'
          : 'Sua candidatura foi encerrada.'
      )
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível responder.')
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return (
      <SafeAreaView style={st.container}>
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  const dadosObra = obra || obraInicial
  if (!dadosObra?.id) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.topbar}>
          <TouchableOpacity style={st.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={st.voltarIcone}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={cores.primaria} size="large" />
        </View>
      </SafeAreaView>
    )
  }

  const ultimaOfertaDono = negociacoes.length > 0 && negociacoes[negociacoes.length - 1].autor_role === 'dono_obra'
    ? negociacoes[negociacoes.length - 1]
    : null

  return (
    <SafeAreaView style={st.container}>

      {/* Top bar */}
      <View style={st.topbar}>
        <TouchableOpacity style={st.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={st.voltarIcone}>←</Text>
        </TouchableOpacity>
        <Text style={st.topbarTitulo}>Detalhe da obra</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Gallery — standalone horizontal ScrollView, NOT nested inside vertical ScrollView */}
      {midias.length > 0 ? (
        <View>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / width)
              setFotoAtiva(index)
            }}
          >
            {midias.map((item) => (
              <TouchableOpacity
                key={String(item.id)}
                style={st.fotoSlide}
                onPress={() => setMidiaFullscreen({ url: item.url_assinada || item.url, tipo: item.tipo })}
                activeOpacity={0.9}
              >
                {item.tipo === 'foto' ? (
                  <Image
                    source={{ uri: item.url_assinada || item.url }}
                    style={st.fotoImagem}
                    resizeMode="cover"
                  />
                ) : (
                  <Video
                    source={{ uri: item.url_assinada || item.url }}
                    style={st.fotoImagem}
                    useNativeControls
                    resizeMode={ResizeMode.COVER}
                    isLooping={false}
                  />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={st.indicadoresRow}>
            {midias.map((_, i) => (
              <View key={i} style={[st.indicadorDot, i === fotoAtiva && st.indicadorDotAtivo]} />
            ))}
          </View>
          {dadosObra?.expira_em && <ContadorPill expiraEm={dadosObra.expira_em} />}
        </View>
      ) : (
        <View style={st.galeriaVazia}>
          <Text style={st.galeriaVaziaIcone}>🏠</Text>
          {dadosObra?.expira_em && <ContadorPill expiraEm={dadosObra.expira_em} />}
        </View>
      )}

      {/* Single vertical ScrollView for all content — no nesting */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.corpo}>

        <View style={st.obraHeader}>
          <View style={st.categoriaPill}>
            <Text style={st.categoriaPillTexto}>{dadosObra?.categoria || ''}</Text>
          </View>
          <Text style={st.obraTitulo}>{dadosObra?.titulo || ''}</Text>
          <Text style={st.localTexto}>
            📍 {dadosObra?.cidade || ''}
            {dadosObra?.bairro ? ` · ${dadosObra.bairro}` : ''}
            {dadosObra?.metragem ? ` · ${dadosObra.metragem}m²` : ''}
          </Text>
        </View>

        <View style={st.statsRow}>
          <View style={st.statCard}>
            <Text style={[st.statValor, { color: cores.sucesso }]}>{formatarValor(dadosObra?.valor)}</Text>
            <Text style={st.statLabel}>Empreitada</Text>
          </View>
          <View style={st.statCard}>
            <Text style={st.statValor}>
              {dadosObra?.prazo_execucao_dias != null ? `${dadosObra.prazo_execucao_dias} dias` : '—'}
            </Text>
            <Text style={st.statLabel}>Prazo execução</Text>
          </View>
          <View style={st.statCard}>
            {dadosObra?.expira_em
              ? <ContadorStat expiraEm={dadosObra.expira_em} />
              : <Text style={st.statValor}>—</Text>
            }
            <Text style={st.statLabel}>Expira em</Text>
          </View>
        </View>

        {dadosObra?.descricao ? (
          <>
            <Text style={st.secaoTitulo}>Descrição da obra</Text>
            <Text style={st.descricaoTexto}>{dadosObra.descricao}</Text>
          </>
        ) : null}

        {Array.isArray(dadosObra?.tags) && dadosObra.tags.length > 0 && (
          <>
            <Text style={st.secaoTitulo}>Serviços inclusos</Text>
            <View style={st.tagsWrap}>
              {dadosObra.tags.map((tag, i) => <Tag key={i} texto={String(tag)} />)}
            </View>
          </>
        )}

        {negociacoes.length > 0 && (
          <>
            <Separador estilo={{ marginVertical: 16 }} />
            <Text style={st.secaoTitulo}>Histórico de negociação</Text>
            {negociacoes.map((neg, i) => (
              <View key={i} style={[st.negCard, neg.autor_role === 'assinante' && st.negCardPintor]}>
                <Text style={st.negAutor}>{neg.autor_role === 'assinante' ? '👷 Você' : '🏠 Dono da obra'}</Text>
                <Text style={st.negValor}>Proposta: {formatarValor(neg.valor)}</Text>
                {neg.mensagem ? <Text style={st.negMensagem}>{neg.mensagem}</Text> : null}
              </View>
            ))}
            <TouchableOpacity style={st.btnNegociar} onPress={() => setModalNegociar(true)}>
              <Text style={st.btnNegociarTexto}>💰 Fazer nova contra-oferta</Text>
            </TouchableOpacity>
          </>
        )}

        <Separador estilo={{ marginVertical: 20 }} />

        <Text style={st.secaoTitulo}>Dúvidas sobre esta obra?</Text>
        <View style={st.duvidaBox}>
          <TextInput
            style={st.duvidaInput}
            placeholder="Digite sua pergunta aqui..."
            placeholderTextColor={cores.textoMutado}
            value={duvida}
            onChangeText={setDuvida}
            multiline
          />
          <TouchableOpacity
            style={st.duvidaEnviarBtn}
            onPress={handleEnviarDuvida}
            disabled={enviandoDuvida || !duvida.trim()}
          >
            {enviandoDuvida
              ? <ActivityIndicator color={cores.primaria} size="small" />
              : <Text style={st.duvidaEnviarTexto}>→</Text>
            }
          </TouchableOpacity>
        </View>

        <Separador estilo={{ marginVertical: 20 }} />

        {minhaCandidatura ? (
          <View style={st.candidaturaFeita}>
            <Text style={{
              color: minhaCandidatura.status === 'aprovada' ? cores.sucesso
                : minhaCandidatura.status === 'recusada' ? '#f44336' : cores.primaria,
              fontWeight: '600', marginBottom: 6
            }}>
              {minhaCandidatura.status === 'pendente' ? '⏳ Aguardando análise'
                : minhaCandidatura.status === 'aprovada' ? '✅ Aprovado!'
                : '❌ Não selecionado'}
            </Text>
            <Text style={st.candidaturaFeitaTexto}>
              {minhaCandidatura.status === 'pendente'
                ? 'Sua candidatura está sendo analisada.'
                : minhaCandidatura.status === 'aprovada'
                ? 'Parabéns! Você foi aprovado para esta obra.'
                : 'Sua candidatura não foi selecionada desta vez.'}
            </Text>

            {minhaCandidatura.status === 'pendente' && ultimaOfertaDono && (
              <View style={st.contraOfertaBox}>
                <Text style={st.contraOfertaLabel}>💬 O dono fez uma proposta:</Text>
                <Text style={st.contraOfertaValor}>{formatarValor(ultimaOfertaDono.valor)}</Text>
                {ultimaOfertaDono.mensagem
                  ? <Text style={st.contraOfertaMensagem}>"{ultimaOfertaDono.mensagem}"</Text>
                  : null}
                <View style={st.respostaRow}>
                  <TouchableOpacity
                    style={st.btnAceitar}
                    onPress={() => handlePintorResponder('aceitar')}
                    disabled={enviando}
                  >
                    <Text style={st.btnAceitarTexto}>✅ Aceitar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={st.btnRecusar}
                    onPress={() => handlePintorResponder('recusar')}
                    disabled={enviando}
                  >
                    <Text style={st.btnRecusarTexto}>❌ Recusar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {minhaCandidatura.status === 'pendente' && !ultimaOfertaDono && (
              <TouchableOpacity style={[st.btnNegociar, { marginTop: 12 }]} onPress={() => setModalNegociar(true)}>
                <Text style={st.btnNegociarTexto}>💰 Fazer contra-oferta</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <BotaoPrimario titulo="Tenho interesse nesta obra →" onPress={() => setModalAberto(true)} />
            <Text style={st.aceiteAviso}>
              Ao demonstrar interesse, sua solicitação será analisada pela equipe antes da confirmação.
            </Text>
          </>
        )}

      </ScrollView>

      {/* Modal de candidatura */}
      <Modal visible={modalAberto} animationType="slide" transparent onRequestClose={() => setModalAberto(false)}>
        <View style={st.modalOverlay}>
          <View style={st.modalSheet}>
            <View style={st.modalHandle} />
            <Text style={st.modalTitulo}>Solicitação de obra</Text>
            <Text style={st.modalSub}>Preencha os dados abaixo para análise da equipe</Text>

            <Text style={st.inputLabel}>REFERÊNCIAS E EXPERIÊNCIA</Text>
            <TextInput
              style={st.textarea}
              placeholder="Descreva brevemente sua experiência e obras realizadas..."
              placeholderTextColor={cores.textoMutado}
              value={referencias}
              onChangeText={setReferencias}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity
              style={st.toggleOferta}
              onPress={() => setUsarContraOferta(!usarContraOferta)}
            >
              <View style={[st.toggleBox, usarContraOferta && st.toggleBoxAtivo]}>
                {usarContraOferta && <View style={st.toggleDot} />}
              </View>
              <Text style={st.toggleTexto}>Quero propor um valor diferente</Text>
            </TouchableOpacity>

            {usarContraOferta && (
              <>
                <Text style={st.valorAtualTexto}>
                  Valor atual da obra: {formatarValor(dadosObra?.valor)}
                </Text>
                <Text style={st.inputLabel}>MINHA OFERTA (R$)</Text>
                <TextInput
                  style={st.inputSimples}
                  placeholder="Ex: 3500"
                  placeholderTextColor={cores.textoMutado}
                  value={valorOferta}
                  onChangeText={setValorOferta}
                  keyboardType="numeric"
                />
                <Text style={st.inputLabel}>JUSTIFICATIVA (opcional)</Text>
                <TextInput
                  style={[st.textarea, { minHeight: 60 }]}
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
        <View style={st.modalOverlay}>
          <View style={st.modalSheet}>
            <View style={st.modalHandle} />
            <Text style={st.modalTitulo}>Contra-oferta</Text>
            <Text style={st.modalSub}>Proponha um novo valor para negociação</Text>
            <Text style={st.valorAtualTexto}>Valor da obra: {formatarValor(dadosObra?.valor)}</Text>
            <Text style={st.inputLabel}>MEU VALOR (R$)</Text>
            <TextInput
              style={st.inputSimples}
              placeholder="Ex: 3500"
              placeholderTextColor={cores.textoMutado}
              value={valorNegociacao}
              onChangeText={setValorNegociacao}
              keyboardType="numeric"
            />
            <Text style={st.inputLabel}>MENSAGEM (opcional)</Text>
            <TextInput
              style={[st.textarea, { minHeight: 80 }]}
              placeholder="Explique sua proposta..."
              placeholderTextColor={cores.textoMutado}
              value={mensagemNegociacao}
              onChangeText={setMensagemNegociacao}
              multiline
            />
            <BotaoPrimario
              titulo="Enviar contra-oferta →"
              onPress={handleNegociar}
              carregando={enviando}
              estilo={{ marginTop: 16, marginBottom: 10 }}
            />
            <BotaoSecundario titulo="Cancelar" onPress={() => setModalNegociar(false)} />
          </View>
        </View>
      </Modal>

      {/* Fullscreen media modal */}
      <Modal visible={!!midiaFullscreen} animationType="fade" transparent onRequestClose={() => setMidiaFullscreen(null)}>
        <View style={st.fullscreenOverlay}>
          <TouchableOpacity style={st.fullscreenFechar} onPress={() => setMidiaFullscreen(null)}>
            <Text style={st.fullscreenFecharTexto}>✕</Text>
          </TouchableOpacity>
          {midiaFullscreen?.tipo === 'foto' ? (
            <Image
              source={{ uri: midiaFullscreen.url }}
              style={st.fullscreenMidia}
              resizeMode="contain"
            />
          ) : (
            <Video
              source={{ uri: midiaFullscreen?.url }}
              style={st.fullscreenMidia}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
          )}
        </View>
      </Modal>

    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: espacos.tela, paddingVertical: 12,
  },
  btnVoltar: {
    width: 36, height: 36, backgroundColor: cores.fundoElevado,
    borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  voltarIcone: { color: cores.textoForte, fontSize: 32, fontWeight: '900' },
  topbarTitulo: { fontSize: 14, color: cores.textoMedio, fontWeight: '500' },

  fotoSlide: { width, height: 220 },
  fotoImagem: { width: '100%', height: '100%' },
  indicadoresRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  indicadorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: cores.fundoElevado },
  indicadorDotAtivo: { width: 16, borderRadius: 3, backgroundColor: cores.primaria },

  galeriaVazia: {
    height: 200, marginHorizontal: espacos.tela, marginBottom: 8,
    backgroundColor: cores.fundoElevado, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  galeriaVaziaIcone: { fontSize: 60, opacity: 0.08 },

  countdownPill: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(10,10,10,0.88)', borderWidth: 0.5, borderColor: cores.primaria,
    borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  countdownDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: cores.primaria },
  countdownTexto: { fontSize: 10, fontWeight: '500', color: cores.primaria },

  corpo: { paddingHorizontal: espacos.tela, paddingBottom: 40, paddingTop: 8 },
  obraHeader: { marginBottom: 16 },
  categoriaPill: {
    backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 4,
    alignSelf: 'flex-start', marginBottom: 10,
  },
  categoriaPillTexto: { fontSize: 11, color: cores.textoFraco, textTransform: 'capitalize' },
  obraTitulo: { fontSize: 18, fontWeight: '700', color: cores.textoForte, lineHeight: 26, marginBottom: 8 },
  localTexto: { fontSize: 12, color: cores.textoFraco },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.medio, padding: 12, alignItems: 'center',
  },
  statValor: { fontSize: 13, fontWeight: '700', color: cores.textoForte, marginBottom: 3 },
  statLabel: { fontSize: 10, color: cores.textoFraco, textAlign: 'center' },

  secaoTitulo: {
    fontSize: 11, fontWeight: '600', color: cores.textoFraco,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10,
  },
  descricaoTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 22, marginBottom: 20 },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },

  negCard: {
    backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.medio, padding: 12, marginBottom: 8,
  },
  negCardPintor: { borderColor: cores.primaria + '44', backgroundColor: cores.primariaSuave },
  negAutor: { fontSize: 12, color: cores.textoFraco, marginBottom: 4 },
  negValor: { fontSize: 15, fontWeight: '700', color: cores.sucesso, marginBottom: 4 },
  negMensagem: { fontSize: 12, color: cores.textoMedio, fontStyle: 'italic' },
  btnNegociar: {
    backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.primaria,
    borderRadius: raios.medio, padding: 12, alignItems: 'center', marginTop: 8,
  },
  btnNegociarTexto: { fontSize: 13, color: cores.primaria, fontWeight: '600' },

  duvidaBox: {
    backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.grande, padding: 14, flexDirection: 'row', alignItems: 'flex-end',
    gap: 10, marginBottom: 4,
  },
  duvidaInput: { flex: 1, fontSize: 13, color: cores.textoForte, minHeight: 40, maxHeight: 100 },
  duvidaEnviarBtn: {
    width: 36, height: 36, backgroundColor: cores.fundoElevado,
    borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  duvidaEnviarTexto: { color: cores.primaria, fontSize: 16 },

  candidaturaFeita: {
    backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.grande, padding: 16,
  },
  candidaturaFeitaTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 20 },
  aceiteAviso: { textAlign: 'center', fontSize: 11, color: cores.textoMutado, marginTop: 10, lineHeight: 18 },

  contraOfertaBox: {
    marginTop: 14, backgroundColor: cores.fundoElevado,
    borderWidth: 0.5, borderColor: cores.primaria + '66',
    borderRadius: raios.medio, padding: 14,
  },
  contraOfertaLabel: { fontSize: 11, color: cores.primaria, fontWeight: '600', marginBottom: 4 },
  contraOfertaValor: { fontSize: 18, fontWeight: '700', color: cores.sucesso, marginBottom: 4 },
  contraOfertaMensagem: { fontSize: 12, color: cores.textoMedio, fontStyle: 'italic', marginBottom: 10 },
  respostaRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnAceitar: {
    flex: 1, backgroundColor: '#1a3a1a', borderWidth: 0.5, borderColor: '#4caf50',
    borderRadius: raios.medio, padding: 12, alignItems: 'center',
  },
  btnAceitarTexto: { fontSize: 13, fontWeight: '700', color: '#4caf50' },
  btnRecusar: {
    flex: 1, backgroundColor: '#3a1a1a', borderWidth: 0.5, borderColor: '#f44336',
    borderRadius: raios.medio, padding: 12, alignItems: 'center',
  },
  btnRecusarTexto: { fontSize: 13, fontWeight: '700', color: '#f44336' },

  inputLabel: { fontSize: 11, color: cores.textoFraco, letterSpacing: 0.5, marginBottom: 7, textTransform: 'uppercase' },
  textarea: {
    backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.medio, padding: 14, fontSize: 13, color: cores.textoForte,
    minHeight: 100, textAlignVertical: 'top', marginBottom: 12,
  },
  inputSimples: {
    backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.medio, padding: 14, fontSize: 14, color: cores.textoForte, marginBottom: 12,
  },
  valorAtualTexto: { fontSize: 12, color: cores.textoFraco, marginBottom: 12 },
  toggleOferta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  toggleBox: {
    width: 36, height: 20, borderRadius: 10, borderWidth: 0.5, borderColor: cores.borda,
    backgroundColor: cores.fundoElevado, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleBoxAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria, alignItems: 'flex-end' },
  toggleDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#0A0A0A' },
  toggleTexto: { fontSize: 13, color: cores.textoMedio },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 0.5, borderColor: cores.borda, padding: 24, paddingBottom: 40,
  },
  modalHandle: { width: 40, height: 4, backgroundColor: cores.borda, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, marginBottom: 4 },
  modalSub: { fontSize: 12, color: cores.textoFraco, marginBottom: 20 },

  fullscreenOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: 'center', alignItems: 'center' },
  fullscreenMidia: { width: '100%', height: '80%' },
  fullscreenFechar: {
    position: 'absolute', top: 48, right: 20, zIndex: 10,
    width: 44, height: 44, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  fullscreenFecharTexto: { color: '#fff', fontSize: 22, fontWeight: '400' },
})
