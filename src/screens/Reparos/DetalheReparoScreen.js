import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, TextInput
} from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import { Image } from 'react-native'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { BotaoPrimario, BotaoSecundario } from '../../components'
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

const RelogioRegressivo = ({ matchFeitoEm, prazoHoras, onExpirar }) => {
  const [tempo, setTempo] = useState('')
  const [expirou, setExpirou] = useState(false)

  useEffect(() => {
    const calcular = () => {
      const inicio = new Date(matchFeitoEm)
      const fim = new Date(inicio.getTime() + prazoHoras * 3600 * 1000)
      const agora = new Date()
      const diff = fim - agora

      if (diff <= 0) {
        setTempo('00:00:00')
        if (!expirou) {
          setExpirou(true)
          if (onExpirar) onExpirar()
        }
        return
      }

      const horas = Math.floor(diff / 3600000)
      const minutos = Math.floor((diff % 3600000) / 60000)
      const segundos = Math.floor((diff % 60000) / 1000)
      setTempo(`${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`)
    }

    calcular()
    const interval = setInterval(calcular, 1000)
    return () => clearInterval(interval)
  }, [matchFeitoEm, prazoHoras])

  const urgente = tempo && tempo.startsWith('00:')

  return (
    <View style={[estilos.relogioBox, expirou && estilos.relogioExpirado]}>
      <Text style={estilos.relogioLabel}>
        {expirou ? '⏰ TEMPO ESGOTADO' : '⏱ TEMPO RESTANTE'}
      </Text>
      <Text style={[estilos.relogioTempo, urgente && !expirou && { color: '#f44336' }, expirou && { color: '#666' }]}>
        {tempo}
      </Text>
      {!expirou && (
        <Text style={estilos.relogioSub}>O prestador deve chegar dentro deste prazo</Text>
      )}
      {expirou && (
        <Text style={estilos.relogioSub}>O reparo voltou para disponível</Text>
      )}
    </View>
  )
}

export default function DetalheReparoScreen({ route, navigation }) {
  const { reparo: reparoInicial } = route.params
  const { usuario } = useAuth()
  const [reparo, setReparo] = useState(reparoInicial)
  const [midias, setMidias] = useState([])
  const [meuInteresse, setMeuInteresse] = useState(null)
  const [interessados, setInteressados] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)

  const [tempoExperiencia, setTempoExperiencia] = useState('')
  const [jaEnfrentouProblemas, setJaEnfrentouProblemas] = useState('')
  const [sugestaoDurabilidade, setSugestaoDurabilidade] = useState('')
  const [possuiReferencias, setPossuiReferencias] = useState('')
  const [possuiFerramentas, setPossuiFerramentas] = useState('')
  const [mensagemAdicional, setMensagemAdicional] = useState('')

  const isDono      = usuario?.id === reparo?.criado_por
  const isPrestador = usuario?.role === 'prestador'

  useEffect(() => {
    buscar()
  }, [reparoInicial.id])

  const buscar = async () => {
    try {
      const resposta = await api.get(`/reparos/${reparoInicial.id}`)
      setReparo(resposta.reparo)
      setMidias(resposta.midias || [])
      setMeuInteresse(resposta.meu_interesse)
      setInteressados(resposta.interessados || [])
    } catch (err) {
      console.log('Erro ao buscar reparo:', err)
    } finally {
      setCarregando(false)
    }
  }

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
        `⚠️ Já enfrentou problemas: ${jaEnfrentouProblemas || 'Não informado'}`,
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

  const handleMatch = async () => {
    Alert.alert(
      '🔧 Confirmar ida ao local?',
      'Ao confirmar, o solicitante será notificado e a contagem regressiva será iniciada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar', onPress: async () => {
            try {
              const resposta = await api.post(`/reparos/${reparo.id}/match`, {})
              setReparo(prev => ({ ...prev, match_feito_em: resposta.match_feito_em, match_usuario_id: usuario.id }))
              Alert.alert('✅ Confirmado!', 'O solicitante foi notificado. Dirija-se ao local!')
            } catch (err) {
              Alert.alert('Erro', err.mensagem || 'Não foi possível confirmar.')
            }
          }
        }
      ]
    )
  }

  const handleEncerrar = async () => {
    Alert.alert(
      '✅ Encerrar reparo?',
      'Confirme que o serviço foi concluído.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Encerrar', onPress: async () => {
            try {
              await api.post(`/reparos/${reparo.id}/encerrar`, {})
              Alert.alert('✅ Reparo encerrado!', 'O reparo foi encerrado com sucesso.',
                [{ text: 'OK', onPress: () => navigation.goBack() }])
            } catch (err) {
              Alert.alert('Erro', err.mensagem || 'Não foi possível encerrar.')
            }
          }
        }
      ]
    )
  }

  const handleExpirarMatch = async () => {
    try {
      await api.post(`/reparos/${reparo.id}/expirar-match`, {})
      setReparo(prev => ({ ...prev, match_feito_em: null, match_usuario_id: null }))
      Alert.alert('⏰ Tempo esgotado', 'O prestador não chegou a tempo. O reparo está disponível novamente.')
    } catch (err) {
      console.log('Erro ao expirar match:', err)
    }
  }

  const temMatch = reparo.match_feito_em && reparo.match_usuario_id
  const souPrestadorDoMatch = temMatch && reparo.match_usuario_id === usuario?.id

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
        <Text style={estilos.topbarTitulo}>
          {isDono ? 'Meu reparo' : 'Detalhe do reparo'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={estilos.corpo}>

          {/* Urgência */}
          {reparo.prazo_atendimento_horas && (
            <View style={estilos.urgenciaBanner}>
              <Text style={estilos.urgenciaTexto}>
                {reparo.prazo_atendimento_horas <= 1 ? '🔴 Urgente agora!'
                  : reparo.prazo_atendimento_horas <= 2 ? '🟠 Muito urgente'
                  : reparo.prazo_atendimento_horas <= 4 ? '🟡 Urgente'
                  : reparo.prazo_atendimento_horas <= 8 ? '🟢 Hoje'
                  : reparo.prazo_atendimento_horas <= 24 ? '📅 Amanhã'
                  : '📆 Esta semana'}
              </Text>
              <Text style={estilos.urgenciaHoras}>
                Atender em até {reparo.prazo_atendimento_horas}h
              </Text>
            </View>
          )}

          {/* Valor em destaque */}
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
                      <Video source={{ uri: midia.url }} style={estilos.midiaImagem} useNativeControls resizeMode={ResizeMode.COVER} />
                    ) : (
                      <Image source={{ uri: midia.url }} style={estilos.midiaImagem} resizeMode="cover" />
                    )}
                  </View>
                ))}
              </ScrollView>
            </>
          )}

          {/* Relógio regressivo após match — aparece para dono E prestador */}
          {temMatch && reparo.prazo_atendimento_horas && (
            <RelogioRegressivo
              matchFeitoEm={reparo.match_feito_em}
              prazoHoras={reparo.prazo_atendimento_horas}
              onExpirar={handleExpirarMatch}
            />
          )}

          {/* ============================================
              ÁREA DO DONO
          ============================================ */}
          {isDono && (
            <>
              {/* Botão encerrar para o dono quando tem match */}
              {temMatch && (
                <TouchableOpacity style={estilos.btnEncerrar} onPress={handleEncerrar}>
                  <Text style={estilos.btnEncerrarTexto}>✅ Confirmar conclusão — Encerrar reparo</Text>
                </TouchableOpacity>
              )}

              {/* Lista de interessados */}
              <Text style={[estilos.secaoTitulo, { marginTop: 20 }]}>
                🔧 Prestadores interessados ({interessados.length})
              </Text>

              {interessados.length === 0 ? (
                <View style={estilos.vazioInteressados}>
                  <Text style={estilos.vazioInteressadosTexto}>
                    Nenhum prestador demonstrou interesse ainda.{'\n'}
                    Aguarde as notificações!
                  </Text>
                </View>
              ) : (
                interessados.map((item) => (
                  <View key={item.id} style={estilos.interessadoCard}>
                    <View style={estilos.interessadoHeader}>
                      <Text style={estilos.interessadoNome}>{item.nome}</Text>
                      {item.cidade && (
                        <Text style={estilos.interessadoCidade}>📍 {item.cidade}</Text>
                      )}
                    </View>
                    {item.telefone && (
                      <Text style={estilos.interessadoTelefone}>📱 {item.telefone}</Text>
                    )}
                    {item.mensagem && (
                      <View style={estilos.mensagemBox}>
                        <Text style={estilos.mensagemTexto}>{item.mensagem}</Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          {/* ============================================
              ÁREA DO PRESTADOR
          ============================================ */}
          {isPrestador && !isDono && (
            <>
              {/* Botão encerrar para o prestador do match */}
              {souPrestadorDoMatch && (
                <TouchableOpacity style={estilos.btnEncerrar} onPress={handleEncerrar}>
                  <Text style={estilos.btnEncerrarTexto}>✅ Serviço concluído — Encerrar</Text>
                </TouchableOpacity>
              )}

              {/* Ações quando ainda não tem match */}
              {!temMatch && (
                meuInteresse ? (
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
                        ? 'Parabéns! Você foi selecionado. Confirme sua ida ao local:'
                        : 'Sua solicitação não foi selecionada desta vez.'}
                    </Text>
                    {meuInteresse.status === 'aprovada' && (
                      <TouchableOpacity style={estilos.btnMatch} onPress={handleMatch}>
                        <Text style={estilos.btnMatchTexto}>🔧 Estou a caminho! Iniciar contagem →</Text>
                      </TouchableOpacity>
                    )}
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
                      valor={jaEnfrentouProblemas}
                      onChange={setJaEnfrentouProblemas}
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
                        placeholder="Ex: Recomendo usar vedante específico..."
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
                        placeholder="Alguma informação extra..."
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
                    <BotaoPrimario titulo="Tenho interesse neste reparo →" onPress={() => setMostrarForm(true)} />
                    <Text style={estilos.aviso}>
                      Ao demonstrar interesse, suas informações profissionais serão enviadas ao solicitante.
                    </Text>
                  </>
                )
              )}
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
  urgenciaBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#3a1a1a', borderWidth: 1, borderColor: '#f4433644', borderRadius: raios.grande, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12 },
  urgenciaTexto: { fontSize: 14, fontWeight: '700', color: '#f44336' },
  urgenciaHoras: { fontSize: 12, color: '#f44336' },
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
  relogioBox: { backgroundColor: '#1a1a2a', borderWidth: 1.5, borderColor: cores.primaria, borderRadius: raios.grande, padding: 20, alignItems: 'center', marginBottom: 16 },
  relogioExpirado: { backgroundColor: '#2a2a2a', borderColor: '#666' },
  relogioLabel: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 1, marginBottom: 8 },
  relogioTempo: { fontSize: 52, fontWeight: '700', color: cores.primaria, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  relogioSub: { fontSize: 11, color: cores.textoFraco, marginTop: 6, textAlign: 'center' },
  btnMatch: { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginTop: 12 },
  btnMatchTexto: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  btnEncerrar: { backgroundColor: cores.sucesso, borderRadius: raios.medio, padding: 16, alignItems: 'center', marginTop: 12, marginBottom: 8 },
  btnEncerrarTexto: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
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
  vazioInteressados: { backgroundColor: cores.fundoCard, borderRadius: raios.grande, borderWidth: 0.5, borderColor: cores.borda, padding: 24, alignItems: 'center', marginBottom: 16 },
  vazioInteressadosTexto: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
  interessadoCard: { backgroundColor: cores.fundoCard, borderRadius: raios.grande, borderWidth: 0.5, borderColor: cores.borda, padding: 14, marginBottom: 10 },
  interessadoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  interessadoNome: { fontSize: 14, fontWeight: '600', color: cores.textoForte },
  interessadoCidade: { fontSize: 11, color: cores.textoFraco },
  interessadoTelefone: { fontSize: 12, color: cores.primaria, marginBottom: 6 },
  mensagemBox: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 10, marginTop: 6 },
  mensagemTexto: { fontSize: 12, color: cores.textoMedio, lineHeight: 18 },
})