import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator
} from 'react-native'
import { obrasService, candidaturasService, mensagensService } from '../../services/api'
import { BadgeStatus, BotaoPrimario, BotaoSecundario, Tag, Separador } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

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
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // Form candidatura
  const [referencias, setReferencias] = useState('')

  // Form dúvida
  const [duvida, setDuvida] = useState('')
  const [enviandoDuvida, setEnviandoDuvida] = useState(false)

  useEffect(() => {
    const buscar = async () => {
      try {
        const resposta = await obrasService.detalhe(obraInicial.id)
        setObra(resposta.obra)
        setMidias(resposta.midias || [])
        setMinhaCandidatura(resposta.minha_candidatura)
      } catch {
        setObra(obraInicial)
      } finally {
        setCarregando(false)
      }
    }
    buscar()
  }, [obraInicial.id])

  const handleCandidatar = async () => {
    if (!referencias.trim()) {
      Alert.alert('Atenção', 'Descreva sua experiência e referências.')
      return
    }
    setEnviando(true)
    try {
      await candidaturasService.candidatar(obra.id, referencias)
      setMinhaCandidatura({ status: 'pendente' })
      setModalAberto(false)
      Alert.alert(
        'Solicitação enviada!',
        'Sua candidatura foi recebida. A equipe irá analisá-la em breve.'
      )
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar sua candidatura.')
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

      {/* Topbar */}
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoMedio, fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.topbarTitulo}>Detalhe da obra</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Galeria */}
        <View style={estilos.galeria}>
          <View style={estilos.fotoMain}>
            <Text style={estilos.fotoIcone}>🏠</Text>
            <View style={estilos.fotoProtegida}>
              <Text style={estilos.fotoProtegidaTexto}>🔒 Conteúdo protegido</Text>
            </View>
            {urgente && (
              <View style={estilos.countdownPill}>
                <View style={estilos.countdownDot} />
                <Text style={estilos.countdownTexto}>Expira {countdown}</Text>
              </View>
            )}
          </View>
          <Text style={estilos.galeriaInfo}>
            {midias.length} fotos e vídeos disponíveis após aceite
          </Text>
        </View>

        <View style={estilos.corpo}>

          {/* Cabeçalho */}
          <View style={estilos.obraHeader}>
            <View style={estilos.categoriaRow}>
              <View style={estilos.categoriaPill}>
                <Text style={estilos.categoriaPillTexto}>{dadosObra.categoria}</Text>
              </View>
            </View>
            <Text style={estilos.obraTitulo}>{dadosObra.titulo}</Text>
            <View style={estilos.localRow}>
              <Text style={estilos.localTexto}>
                📍 {dadosObra.cidade}, MG
                {dadosObra.bairro ? ` · ${dadosObra.bairro}` : ''}
                {dadosObra.metragem ? ` · ${dadosObra.metragem}m²` : ''}
              </Text>
            </View>
          </View>

          {/* Stats */}
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
              <Text style={[estilos.statValor, urgente && { color: cores.primaria }]}>
                {countdown}
              </Text>
              <Text style={estilos.statLabel}>Expira em</Text>
            </View>
          </View>

          {/* Descrição */}
          {dadosObra.descricao && (
            <>
              <Text style={estilos.secaoTitulo}>Descrição da obra</Text>
              <Text style={estilos.descricaoTexto}>{dadosObra.descricao}</Text>
            </>
          )}

          {/* Tags */}
          {dadosObra.tags?.length > 0 && (
            <>
              <Text style={estilos.secaoTitulo}>Serviços inclusos</Text>
              <View style={estilos.tagsWrap}>
                {dadosObra.tags.map((tag, i) => <Tag key={i} texto={tag} />)}
              </View>
            </>
          )}

          <Separador estilo={{ marginVertical: 20 }} />

          {/* Dúvidas */}
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
            <TouchableOpacity
              style={estilos.duvidaEnviarBtn}
              onPress={handleEnviarDuvida}
              disabled={enviandoDuvida || !duvida.trim()}
            >
              {enviandoDuvida
                ? <ActivityIndicator color={cores.primaria} size="small" />
                : <Text style={estilos.duvidaEnviarTexto}>→</Text>
              }
            </TouchableOpacity>
          </View>

          <Separador estilo={{ marginVertical: 20 }} />

          {/* Botão de aceite */}
          {minhaCandidatura ? (
            <View style={estilos.candidaturaFeita}>
              <BadgeStatus status={minhaCandidatura.status} />
              <Text style={estilos.candidaturaFeitaTexto}>
                {minhaCandidatura.status === 'pendente'
                  ? 'Sua candidatura está sendo analisada pela equipe.'
                  : minhaCandidatura.status === 'aprovada'
                  ? 'Parabéns! Você foi aprovado para esta obra.'
                  : 'Sua candidatura não foi selecionada desta vez.'}
              </Text>
            </View>
          ) : (
            <>
              <BotaoPrimario
                titulo="Tenho interesse nesta obra →"
                onPress={() => setModalAberto(true)}
              />
              <Text style={estilos.aceiteAviso}>
                Ao demonstrar interesse, sua solicitação será analisada pela equipe antes da confirmação.
              </Text>
            </>
          )}

        </View>
      </ScrollView>

      {/* Modal: Formulário de candidatura */}
      <Modal
        visible={modalAberto}
        animationType="slide"
        transparent
        onRequestClose={() => setModalAberto(false)}
      >
        <View style={estilos.modalOverlay}>
          <View style={estilos.modalSheet}>
            <View style={estilos.modalHandle} />
            <Text style={estilos.modalTitulo}>Solicitação de obra</Text>
            <Text style={estilos.modalSub}>
              Preencha os dados abaixo para análise da equipe
            </Text>
            <Text style={estilos.inputLabel}>REFERÊNCIAS E OBRAS ANTERIORES</Text>
            <TextInput
              style={estilos.textarea}
              placeholder="Descreva brevemente sua experiência e obras realizadas..."
              placeholderTextColor={cores.textoMutado}
              value={referencias}
              onChangeText={setReferencias}
              multiline
              numberOfLines={5}
            />
            <BotaoPrimario
              titulo="Enviar solicitação"
              onPress={handleCandidatar}
              carregando={enviando}
              estilo={{ marginTop: 16, marginBottom: 10 }}
            />
            <BotaoSecundario
              titulo="Cancelar"
              onPress={() => setModalAberto(false)}
            />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espacos.tela,
    paddingVertical: 12,
  },
  btnVoltar: {
    width: 36, height: 36,
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  topbarTitulo: { fontSize: 14, color: cores.textoMedio, fontWeight: '500' },
  galeria: { paddingHorizontal: espacos.tela, marginBottom: 16 },
  fotoMain: {
    height: 200,
    backgroundColor: cores.fundoElevado,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  fotoIcone: { fontSize: 60, opacity: 0.08 },
  fotoProtegida: {
    position: 'absolute',
    bottom: 12, right: 12,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  fotoProtegidaTexto: { fontSize: 10, color: cores.textoFraco },
  countdownPill: {
    position: 'absolute',
    top: 12, right: 12,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderWidth: 0.5, borderColor: cores.primaria,
    borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  countdownDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: cores.primaria },
  countdownTexto: { fontSize: 10, fontWeight: '500', color: cores.primaria },
  galeriaInfo: { fontSize: 11, color: cores.textoMutado, marginTop: 8, textAlign: 'center' },
  corpo: { paddingHorizontal: espacos.tela, paddingBottom: 40 },
  obraHeader: { marginBottom: 16 },
  categoriaRow: { marginBottom: 10 },
  categoriaPill: {
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.pill,
    paddingHorizontal: 12, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  categoriaPillTexto: { fontSize: 11, color: cores.textoFraco, textTransform: 'capitalize' },
  obraTitulo: {
    fontSize: 18, fontWeight: '700',
    color: cores.textoForte, lineHeight: 26,
    marginBottom: 8,
  },
  localRow: {},
  localTexto: { fontSize: 12, color: cores.textoFraco },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: {
    flex: 1,
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.medio,
    padding: 12, alignItems: 'center',
  },
  statValor: { fontSize: 14, fontWeight: '700', color: cores.textoForte, marginBottom: 3 },
  statLabel: { fontSize: 10, color: cores.textoFraco, textAlign: 'center' },
  secaoTitulo: {
    fontSize: 11, fontWeight: '600',
    color: cores.textoFraco,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  descricaoTexto: {
    fontSize: 13, color: cores.textoMedio,
    lineHeight: 22, marginBottom: 20,
  },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  duvidaBox: {
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.grande,
    padding: 14,
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    marginBottom: 4,
  },
  duvidaInput: {
    flex: 1, fontSize: 13,
    color: cores.textoForte,
    minHeight: 40, maxHeight: 100,
  },
  duvidaEnviarBtn: {
    width: 36, height: 36,
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  duvidaEnviarTexto: { color: cores.primaria, fontSize: 16 },
  candidaturaFeita: {
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.grande,
    padding: 16, gap: 10,
  },
  candidaturaFeitaTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 20 },
  aceiteAviso: {
    textAlign: 'center',
    fontSize: 11, color: cores.textoMutado,
    marginTop: 10, lineHeight: 18,
  },
  inputLabel: {
    fontSize: 11, color: cores.textoFraco,
    letterSpacing: 0.5, marginBottom: 7,
    textTransform: 'uppercase',
  },
  textarea: {
    backgroundColor: cores.fundoInput,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.medio,
    padding: 14,
    fontSize: 13, color: cores.textoForte,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: cores.fundoCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 0.5, borderColor: cores.borda,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4,
    backgroundColor: cores.borda,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitulo: {
    fontSize: 20, fontWeight: '700',
    color: cores.textoForte, marginBottom: 4,
  },
  modalSub: {
    fontSize: 12, color: cores.textoFraco, marginBottom: 20,
  },
})
