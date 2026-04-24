import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, TextInput, ActivityIndicator, Alert
} from 'react-native'
import { candidaturasService, mensagensService } from '../../services/api'
import { Card, Separador } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

const formatarData = (data) =>
  data ? new Date(data).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }) : ''

// Card de mensagem individual
const CardMensagem = ({ msg }) => (
  <View style={estilos.msgCard}>
    {/* Pergunta do pintor */}
    <View style={estilos.perguntaWrap}>
      <View style={estilos.perguntaBubble}>
        <Text style={estilos.perguntaTexto}>{msg.conteudo}</Text>
      </View>
      <Text style={estilos.msgData}>{formatarData(msg.criado_em)}</Text>
    </View>

    {/* Resposta da equipe */}
    {msg.respondido && msg.resposta ? (
      <View style={estilos.respostaWrap}>
        <View style={estilos.respostaBubble}>
          <Text style={estilos.respostaLabel}>Equipe PinturaPro</Text>
          <Text style={estilos.respostaTexto}>{msg.resposta}</Text>
        </View>
        <Text style={[estilos.msgData, { textAlign: 'right' }]}>
          {formatarData(msg.respondido_em)}
        </Text>
      </View>
    ) : (
      <View style={estilos.aguardandoWrap}>
        <View style={estilos.aguardandoDot} />
        <Text style={estilos.aguardandoTexto}>Aguardando resposta da equipe...</Text>
      </View>
    )}
  </View>
)

export default function MensagensScreen() {
  const [candidaturas, setCandidaturas] = useState([])
  const [obraSelecionada, setObraSelecionada] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [novaDuvida, setNovaDuvida] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [carregandoMsgs, setCarregandoMsgs] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // Busca obras que o pintor se candidatou (para filtrar dúvidas por obra)
  useEffect(() => {
    const buscar = async () => {
      try {
        const dados = await candidaturasService.minhas()
        setCandidaturas(dados || [])
        if (dados?.length > 0) {
          setObraSelecionada(dados[0].obras)
        }
      } catch {
        // silencia
      } finally {
        setCarregando(false)
      }
    }
    buscar()
  }, [])

  // Busca mensagens da obra selecionada
  useEffect(() => {
    if (!obraSelecionada) return
    const buscarMsgs = async () => {
      setCarregandoMsgs(true)
      try {
        const dados = await mensagensService.porObra(obraSelecionada.id)
        setMensagens(dados || [])
      } catch {
        setMensagens([])
      } finally {
        setCarregandoMsgs(false)
      }
    }
    buscarMsgs()
  }, [obraSelecionada])

  const handleEnviar = async () => {
    if (!novaDuvida.trim() || !obraSelecionada) return
    setEnviando(true)
    try {
      const nova = await mensagensService.enviar(obraSelecionada.id, novaDuvida.trim())
      setMensagens(prev => [...prev, nova])
      setNovaDuvida('')
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar a dúvida.')
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return (
      <SafeAreaView style={estilos.container}>
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  if (candidaturas.length === 0) {
    return (
      <SafeAreaView style={estilos.container}>
        <View style={estilos.header}>
          <Text style={estilos.titulo}>Mensagens</Text>
        </View>
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>💬</Text>
          <Text style={estilos.vazioTitulo}>Nenhuma conversa ainda</Text>
          <Text style={estilos.vazioSub}>
            Suas dúvidas sobre obras aparecerão aqui após você demonstrar interesse em alguma.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={estilos.container}>

      {/* Cabeçalho */}
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Mensagens</Text>
      </View>

      {/* Seletor de obra */}
      {candidaturas.length > 1 && (
        <FlatList
          horizontal
          data={candidaturas}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={estilos.obrasSeletorList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                estilos.obraPill,
                obraSelecionada?.id === item.obras?.id && estilos.obraPillAtivo
              ]}
              onPress={() => setObraSelecionada(item.obras)}
            >
              <Text
                style={[
                  estilos.obraPillTexto,
                  obraSelecionada?.id === item.obras?.id && estilos.obraPillTextoAtivo
                ]}
                numberOfLines={1}
              >
                {item.obras?.titulo}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Título da obra selecionada */}
      {obraSelecionada && (
        <View style={estilos.obraAtualBanner}>
          <Text style={estilos.obraAtualTexto} numberOfLines={1}>
            📋 {obraSelecionada.titulo}
          </Text>
        </View>
      )}

      {/* Lista de mensagens */}
      {carregandoMsgs ? (
        <ActivityIndicator color={cores.primaria} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={mensagens}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CardMensagem msg={item} />}
          contentContainerStyle={[
            estilos.msgLista,
            mensagens.length === 0 && { flex: 1 }
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={estilos.semMensagens}>
              <Text style={estilos.semMensagensTexto}>
                Nenhuma dúvida enviada sobre esta obra ainda.{'\n'}
                Use o campo abaixo para perguntar à equipe.
              </Text>
            </View>
          }
        />
      )}

      {/* Input de nova dúvida */}
      {obraSelecionada && (
        <View style={estilos.inputArea}>
          <TextInput
            style={estilos.inputDuvida}
            placeholder="Digite sua dúvida sobre esta obra..."
            placeholderTextColor={cores.textoMutado}
            value={novaDuvida}
            onChangeText={setNovaDuvida}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              estilos.btnEnviar,
              (!novaDuvida.trim() || enviando) && estilos.btnEnviarDesabilitado
            ]}
            onPress={handleEnviar}
            disabled={!novaDuvida.trim() || enviando}
          >
            {enviando
              ? <ActivityIndicator color="#0A0A0A" size="small" />
              : <Text style={estilos.btnEnviarTexto}>→</Text>
            }
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: {
    paddingHorizontal: espacos.tela,
    paddingTop: 8, paddingBottom: 12,
  },
  titulo: {
    fontSize: 26, fontWeight: '700',
    color: cores.textoForte, letterSpacing: -0.5,
  },
  obrasSeletorList: {
    paddingHorizontal: espacos.tela,
    paddingBottom: 12, gap: 8,
  },
  obraPill: {
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.pill,
    paddingHorizontal: 14, paddingVertical: 7,
    maxWidth: 200,
  },
  obraPillAtivo: { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
  obraPillTexto: { fontSize: 12, color: cores.textoMedio },
  obraPillTextoAtivo: { color: cores.primaria, fontWeight: '500' },
  obraAtualBanner: {
    marginHorizontal: espacos.tela,
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.medio,
    padding: 10, marginBottom: 12,
  },
  obraAtualTexto: { fontSize: 12, color: cores.textoFraco },
  msgLista: {
    paddingHorizontal: espacos.tela,
    paddingBottom: 12,
  },
  msgCard: { marginBottom: 16 },
  perguntaWrap: { marginBottom: 8 },
  perguntaBubble: {
    backgroundColor: cores.primariaSuave,
    borderWidth: 0.5, borderColor: cores.primariaBorda,
    borderRadius: raios.grande,
    borderBottomRightRadius: 4,
    padding: 12,
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  perguntaTexto: { fontSize: 13, color: cores.textoForte, lineHeight: 20 },
  respostaWrap: { paddingLeft: 8 },
  respostaBubble: {
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.grande,
    borderBottomLeftRadius: 4,
    padding: 12,
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  respostaLabel: {
    fontSize: 10, fontWeight: '600',
    color: cores.primaria, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  respostaTexto: { fontSize: 13, color: cores.textoForte, lineHeight: 20 },
  msgData: { fontSize: 10, color: cores.textoMutado, marginTop: 4, paddingHorizontal: 4 },
  aguardandoWrap: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, paddingLeft: 8, marginTop: 4,
  },
  aguardandoDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: cores.primaria,
    opacity: 0.5,
  },
  aguardandoTexto: { fontSize: 11, color: cores.textoMutado, fontStyle: 'italic' },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: espacos.tela,
    paddingVertical: 12,
    borderTopWidth: 0.5, borderTopColor: cores.bordaFraca,
    backgroundColor: cores.fundo,
  },
  inputDuvida: {
    flex: 1,
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.grande,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 13, color: cores.textoForte,
    maxHeight: 100,
  },
  btnEnviar: {
    width: 42, height: 42,
    backgroundColor: cores.primaria,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  btnEnviarDesabilitado: { opacity: 0.4 },
  btnEnviarTexto: { fontSize: 18, color: '#0A0A0A', fontWeight: '700' },
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
  semMensagens: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 60, paddingHorizontal: 20,
  },
  semMensagensTexto: {
    fontSize: 13, color: cores.textoMutado,
    textAlign: 'center', lineHeight: 20,
  },
})
