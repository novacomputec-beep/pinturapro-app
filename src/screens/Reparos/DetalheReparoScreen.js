import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, TextInput
} from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import { Image } from 'react-native'
import api from '../../services/api'
import { BotaoPrimario } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

export default function DetalheReparoScreen({ route, navigation }) {
  const { reparo: reparoInicial } = route.params
  const [reparo, setReparo] = useState(reparoInicial)
  const [midias, setMidias] = useState([])
  const [meuInteresse, setMeuInteresse] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)

  useEffect(() => {
    const buscar = async () => {
      try {
        const resposta = await api.get(`/reparos/${reparoInicial.id}`)
        setReparo(resposta.reparo)
        setMidias(resposta.midias || [])
        setMeuInteresse(resposta.meu_interesse)
      } catch (err) {
        console.log('Erro ao buscar reparo:', err)
      } finally {
        setCarregando(false)
      }
    }
    buscar()
  }, [reparoInicial.id])

  const handleInteresse = async () => {
    if (!mensagem.trim()) {
      Alert.alert('Atenção', 'Descreva brevemente sua experiência com este tipo de serviço.')
      return
    }
    setEnviando(true)
    try {
      await api.post(`/reparos/${reparo.id}/interesse`, { mensagem })
      setMeuInteresse({ status: 'pendente' })
      setMostrarForm(false)
      Alert.alert('Interesse registrado!', 'Sua solicitação foi enviada. A equipe irá analisá-la em breve.')
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível registrar seu interesse.')
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

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoMedio, fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.topbarTitulo}>Detalhe do reparo</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={estilos.corpo}>

          <View style={estilos.categoriaPill}>
            <Text style={estilos.categoriaTexto}>{reparo.categoria}</Text>
          </View>

          <Text style={estilos.titulo}>{reparo.titulo}</Text>
          <Text style={estilos.local}>📍 {reparo.cidade}{reparo.bairro ? `, ${reparo.bairro}` : ''}</Text>

          {reparo.valor_estimado && (
            <View style={estilos.valorBox}>
              <Text style={estilos.valorLabel}>Valor estimado</Text>
              <Text style={estilos.valorTexto}>
                R$ {Number(reparo.valor_estimado).toLocaleString('pt-BR')}
              </Text>
            </View>
          )}

          {reparo.descricao && (
            <>
              <Text style={estilos.secaoTitulo}>Descrição</Text>
              <Text style={estilos.descricao}>{reparo.descricao}</Text>
            </>
          )}

          {midias.length > 0 && (
            <>
              <Text style={estilos.secaoTitulo}>Fotos e vídeos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {midias.map((midia, i) => (
                  <View key={i} style={estilos.midiaItem}>
                    {midia.tipo === 'video' ? (
                      <Video
                        source={{ uri: midia.url }}
                        style={estilos.midiaImagem}
                        useNativeControls
                        resizeMode={ResizeMode.COVER}
                      />
                    ) : (
                      <Image source={{ uri: midia.url }} style={estilos.midiaImagem} resizeMode="cover" />
                    )}
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          {meuInteresse ? (
            <View style={estilos.interesseFeito}>
              <Text style={{ color: cores.primaria, fontWeight: '600', marginBottom: 6 }}>
                {meuInteresse.status === 'pendente' ? '⏳ Aguardando análise'
                  : meuInteresse.status === 'aprovada' ? '✅ Aprovado!'
                  : '❌ Não selecionado'}
              </Text>
              <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20 }}>
                {meuInteresse.status === 'pendente'
                  ? 'Sua solicitação está sendo analisada pela equipe.'
                  : meuInteresse.status === 'aprovada'
                  ? 'Parabéns! Você foi aprovado para este reparo.'
                  : 'Sua solicitação não foi selecionada desta vez.'}
              </Text>
            </View>
          ) : mostrarForm ? (
            <View style={estilos.formInteresse}>
              <Text style={estilos.secaoTitulo}>Sua experiência</Text>
              <TextInput
                style={estilos.textarea}
                placeholder="Descreva sua experiência com este tipo de serviço..."
                placeholderTextColor={cores.textoMutado}
                value={mensagem}
                onChangeText={setMensagem}
                multiline
                numberOfLines={4}
              />
              <BotaoPrimario
                titulo="Enviar solicitação →"
                onPress={handleInteresse}
                carregando={enviando}
                estilo={{ marginBottom: 10 }}
              />
              <TouchableOpacity onPress={() => setMostrarForm(false)} style={{ alignItems: 'center', padding: 10 }}>
                <Text style={{ color: cores.textoFraco, fontSize: 13 }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <BotaoPrimario
                titulo="Tenho interesse neste reparo →"
                onPress={() => setMostrarForm(true)}
              />
              <Text style={estilos.aviso}>
                Ao demonstrar interesse, sua solicitação será analisada pela equipe antes da confirmação.
              </Text>
            </>
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
  categoriaPill: { backgroundColor: cores.fundoElevado, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 10 },
  categoriaTexto: { fontSize: 11, color: cores.textoFraco, textTransform: 'capitalize' },
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, lineHeight: 28, marginBottom: 6 },
  local: { fontSize: 13, color: cores.textoFraco, marginBottom: 16 },
  valorBox: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valorLabel: { fontSize: 12, color: cores.textoFraco },
  valorTexto: { fontSize: 18, fontWeight: '700', color: cores.sucesso },
  secaoTitulo: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  descricao: { fontSize: 13, color: cores.textoMedio, lineHeight: 22, marginBottom: 20 },
  midiaItem: { width: 160, height: 120, marginRight: 10, borderRadius: 10, overflow: 'hidden' },
  midiaImagem: { width: '100%', height: '100%' },
  interesseFeito: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 16 },
  formInteresse: { marginTop: 8 },
  textarea: { backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, fontSize: 13, color: cores.textoForte, minHeight: 100, textAlignVertical: 'top', marginBottom: 12 },
  aviso: { textAlign: 'center', fontSize: 11, color: cores.textoMutado, marginTop: 10, lineHeight: 18 },
})