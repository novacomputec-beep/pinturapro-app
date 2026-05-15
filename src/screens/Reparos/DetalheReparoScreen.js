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

const PerguntaOpcoes = ({ label, opcoes, valor, onChange }) => (
  <View style={estilos.perguntaWrap}>
    <Text style={estilos.perguntaLabel}>{label}</Text>
    <View style={estilos.opcoesRow}>
      {opcoes.map(op => (
        <TouchableOpacity
          key={op}
          style={[estilos.opcaoPill, valor === op && estilos.opcaoPillAtivo]}
          onPress={() => onChange(op)}
        >
          <Text style={[estilos.opcaoTexto, valor === op && estilos.opcaoTextoAtivo]}>{op}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
)

export default function DetalheReparoScreen({ route, navigation }) {
  const { reparo: reparoInicial } = route.params
  const [reparo, setReparo] = useState(reparoInicial)
  const [midias, setMidias] = useState([])
  const [meuInteresse, setMeuInteresse] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)

  // Formulário de interesse
  const [tempoExperiencia, setTempoExperiencia] = useState('')
  const [jaEnfrентоуProblemas, setJaEnfrентоуProblemas] = useState('')
  const [sugestaoDurabilidade, setSugestaoDurabilidade] = useState('')
  const [possuiReferencias, setPossuiReferencias] = useState('')
  const [possuiFerramentas, setPossuiFerramentas] = useState('')
  const [mensagemAdicional, setMensagemAdicional] = useState('')

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
    if (!tempoExperiencia) {
      Alert.alert('Atenção', 'Informe há quanto tempo realiza este tipo de serviço.')
      return
    }
    if (!possuiFerramentas) {
      Alert.alert('Atenção', 'Informe se possui as ferramentas necessárias.')
      return
    }

    setEnviando(true)
    try {
      const mensagem = [
        `⏱ Experiência: ${tempoExperiencia}`,
        `⚠️ Já enfrentou problemas: ${jaEnfrентоуProblemas || 'Não informado'}`,
        `💡 Sugestão durabilidade: ${sugestaoDurabilidade || 'Não informado'}`,
        `📋 Possui referências: ${possuiReferencias || 'Não informado'}`,
        `🔧 Possui ferramentas: ${possuiFerramentas}`,
        mensagemAdicional ? `💬 Observação: ${mensagemAdicional}` : '',
      ].filter(Boolean).join('\n')

      await api.post(`/reparos/${reparo.id}/interesse`, { mensagem })
      setMeuInteresse({ status: 'pendente' })
      setMostrarForm(false)
      Alert.alert('✅ Interesse registrado!', 'O solicitante receberá suas informações e entrará em contato se tiver interesse.')
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

          {/* Valor em destaque no topo */}
          {reparo.valor_estimado && (
            <View style={estilos.valorDestaque}>
              <View>
                <Text style={estilos.valorDestaqueLabel}>💰 VALOR ESTIMADO</Text>
                <Text style={estilos.valorDestaqueValor}>
                  R$ {Number(reparo.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={estilos.categoriaPill}>
                <Text style={estilos.categoriaTexto}>{reparo.categoria}</Text>
              </View>
            </View>
          )}

          <Text style={estilos.titulo}>{reparo.titulo}</Text>
          <Text style={estilos.local}>📍 {reparo.cidade}{reparo.bairro ? `, ${reparo.bairro}` : ''}</Text>

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
                {meuInteresse.status === 'pendente' ? '⏳ Aguardando contato'
                  : meuInteresse.status === 'aprovada' ? '✅ Aprovado!'
                  : '❌ Não selecionado'}
              </Text>
              <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20 }}>
                {meuInteresse.status === 'pendente'
                  ? 'Suas informações foram enviadas ao solicitante. Aguarde o contato!'
                  : meuInteresse.status === 'aprovada'
                  ? 'Parabéns! Você foi aprovado para este reparo.'
                  : 'Sua solicitação não foi selecionada desta vez.'}
              </Text>
            </View>
          ) : mostrarForm ? (
            <View style={estilos.formInteresse}>
              <Text style={estilos.formTitulo}>📋 Suas informações profissionais</Text>
              <Text style={estilos.formSubtitulo}>
                Estas informações serão enviadas ao solicitante para que ele possa escolher o melhor profissional.
              </Text>

              <PerguntaOpcoes
                label="⏱ Há quanto tempo realiza este tipo de serviço?"
                opcoes={['Menos de 1 ano', '1 a 3 anos', '3 a 5 anos', 'Mais de 5 anos']}
                valor={tempoExperiencia}
                onChange={setTempoExperiencia}
              />

              <PerguntaOpcoes
                label="⚠️ Já enfrentou problemas com este tipo de serviço?"
                opcoes={['Nunca', 'Raramente', 'Algumas vezes']}
                valor={jaEnfrентоуProblemas}
                onChange={setJaEnfrентоуProblemas}
              />

              <PerguntaOpcoes
                label="📋 Possui referências neste tipo de reparo?"
                opcoes={['Sim', 'Não', 'Tenho fotos de serviços']}
                valor={possuiReferencias}
                onChange={setPossuiReferencias}
              />

              <PerguntaOpcoes
                label="🔧 Possui todas as ferramentas necessárias?"
                opcoes={['Sim, todas', 'A maioria', 'Preciso de algumas']}
                valor={possuiFerramentas}
                onChange={setPossuiFerramentas}
              />

              <View style={estilos.perguntaWrap}>
                <Text style={estilos.perguntaLabel}>💡 Sugestão para melhorar a durabilidade (opcional)</Text>
                <TextInput
                  style={estilos.textarea}
                  placeholder="Ex: Recomendo usar vedante específico para tubulações de água quente..."
                  placeholderTextColor={cores.textoMutado}
                  value={sugestaoDurabilidade}
                  onChangeText={setSugestaoDurabilidade}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={estilos.perguntaWrap}>
                <Text style={estilos.perguntaLabel}>💬 Mensagem adicional (opcional)</Text>
                <TextInput
                  style={estilos.textarea}
                  placeholder="Alguma informação extra que queira compartilhar..."
                  placeholderTextColor={cores.textoMutado}
                  value={mensagemAdicional}
                  onChangeText={setMensagemAdicional}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <BotaoPrimario
                titulo="Enviar minhas informações →"
                onPress={handleInteresse}
                carregando={enviando}
                estilo={{ marginBottom: 10, marginTop: 8 }}
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
                Ao demonstrar interesse, suas informações profissionais serão enviadas ao solicitante.
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
  valorDestaque: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.sucessoSuave, borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  valorDestaqueLabel: { fontSize: 10, color: cores.sucesso, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  valorDestaqueValor: { fontSize: 24, fontWeight: '700', color: cores.sucesso },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 4 },
  categoriaTexto: { fontSize: 11, color: cores.textoFraco, textTransform: 'capitalize' },
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, lineHeight: 28, marginBottom: 6 },
  local: { fontSize: 13, color: cores.textoFraco, marginBottom: 16 },
  secaoTitulo: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  descricao: { fontSize: 13, color: cores.textoMedio, lineHeight: 22, marginBottom: 20 },
  midiaItem: { width: 160, height: 120, marginRight: 10, borderRadius: 10, overflow: 'hidden' },
  midiaImagem: { width: '100%', height: '100%' },
  interesseFeito: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 16 },
  formInteresse: { marginTop: 8 },
  formTitulo: { fontSize: 16, fontWeight: '700', color: cores.textoForte, marginBottom: 6 },
  formSubtitulo: { fontSize: 12, color: cores.textoFraco, lineHeight: 18, marginBottom: 20 },
  perguntaWrap: { marginBottom: 16 },
  perguntaLabel: { fontSize: 12, fontWeight: '600', color: cores.textoMedio, marginBottom: 10, lineHeight: 18 },
  opcoesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcaoPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 8 },
  opcaoPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  opcaoTexto: { fontSize: 12, color: cores.textoMedio },
  opcaoTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  textarea: { backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, fontSize: 13, color: cores.textoForte, minHeight: 80, textAlignVertical: 'top' },
  aviso: { textAlign: 'center', fontSize: 11, color: cores.textoMutado, marginTop: 10, lineHeight: 18 },
})