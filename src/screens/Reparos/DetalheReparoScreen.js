import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, TextInput, Linking, Modal
} from 'react-native'
import { Image } from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

const ContadorExpiracaoReparo = ({ expiraEm }) => {
  const [restante, setRestante] = useState(null)
  const expiradoRef = useRef(false)

  useEffect(() => {
    expiradoRef.current = false
    const tick = () => {
      const diff = new Date(expiraEm) - new Date()
      if (diff <= 0) {
        if (!expiradoRef.current) {
          expiradoRef.current = true
          setRestante(null)
        }
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRestante({ h, m, s })
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiraEm])

  if (!restante) {
    return <Text style={{ fontSize: 12, color: '#f44336', fontWeight: '700' }}>EXPIRADO</Text>
  }

  const urgente = restante.h === 0 && restante.m < 10
  const texto = `Expira em: ${restante.h > 0 ? `${restante.h}h ` : ''}${String(restante.m).padStart(2, '0')}m ${String(restante.s).padStart(2, '0')}s`
  return <Text style={{ fontSize: 12, color: '#f44336', fontWeight: urgente ? '700' : '500' }}>{texto}</Text>
}

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
  const expirouRef = React.useRef(false)

  useEffect(() => {
    expirouRef.current = false
    const calcular = () => {
      const inicio = new Date(matchFeitoEm)
      const fim = new Date(inicio.getTime() + prazoHoras * 3600 * 1000)
      const agora = new Date()
      const diff = fim - agora
      if (diff <= 0) {
        setTempo('00:00:00')
        if (!expirouRef.current) {
          expirouRef.current = true
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
      <Text style={estilos.relogioLabel}>{expirou ? '⏰ TEMPO ESGOTADO' : '⏱ TEMPO RESTANTE'}</Text>
      <Text style={[estilos.relogioTempo, urgente && !expirou && { color: '#f44336' }, expirou && { color: '#666' }]}>{tempo}</Text>
      {!expirou && <Text style={estilos.relogioSub}>O prestador deve chegar dentro deste prazo</Text>}
      {expirou && <Text style={estilos.relogioSub}>O reparo voltou para disponível</Text>}
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
  const [valorProposto, setValorProposto] = useState('')
  const [valorAceito, setValorAceito] = useState(false)
  const [fotoFullscreen, setFotoFullscreen] = useState(null)
  const [videoFullscreen, setVideoFullscreen] = useState(null)
  const [contrapropostaInteresseId, setContrapropostaInteresseId] = useState(null)
  const [valorContraproposta, setValorContraproposta] = useState('')
  const [enviandoResposta, setEnviandoResposta] = useState(false)
  const [modalTempo, setModalTempo] = useState(false)
  const [minutosTempo, setMinutosTempo] = useState('')
  const mountedRef = useRef(true)

  const mascararValor = (v) => {
    const nums = v.replace(/\D/g, '')
    if (!nums) return ''
    const centavos = Math.min(parseInt(nums, 10), 9999999999)
    const reaisStr = Math.floor(centavos / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${reaisStr},${String(centavos % 100).padStart(2, '0')}`
  }

  const isDono = usuario?.id === reparo?.criado_por
  const isPrestador = usuario?.role === 'prestador' || usuario?.role === 'assinante'

  useEffect(() => {
    mountedRef.current = true
    buscar()
    return () => { mountedRef.current = false }
  }, [reparoInicial.id])

  const buscar = async () => {
    try {
      const resposta = await api.get(`/reparos/${reparoInicial.id}`)
      if (mountedRef.current) {
        setReparo(resposta.reparo)
        setMidias(resposta.midias || [])
        setMeuInteresse(resposta.meu_interesse)
        setInteressados(resposta.interessados || [])
      }
    } catch (err) {
      console.log('Erro ao buscar reparo:', err)
    } finally {
      if (mountedRef.current) setCarregando(false)
    }
  }

  const comRetry = async (fn) => {
    try {
      return await fn()
    } catch (err) {
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      if (isNetwork) {
        await new Promise(r => setTimeout(r, 2000))
        return await fn()
      }
      throw err
    }
  }

  const handleInteresse = async () => {
    if (!tempoExperiencia) { Alert.alert('Atenção', 'Informe há quanto tempo realiza este tipo de serviço.'); return }
    if (!possuiFerramentas) { Alert.alert('Atenção', 'Informe se possui as ferramentas necessárias.'); return }
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
      const valorNumerico = valorAceito
        ? parseFloat(String(reparo.valor_estimado))
        : (valorProposto ? parseFloat(valorProposto.replace(/\./g, '').replace(',', '.')) : null)
      await api.post(`/reparos/${reparo.id}/interesse`, { mensagem, valor_proposto: valorNumerico })
      setMeuInteresse({ status: 'pendente' })
      setMostrarForm(false)
      Alert.alert('✅ Interesse registrado!', 'O solicitante receberá suas informações e entrará em contato se tiver interesse.', [{ text: 'OK', onPress: () => navigation.goBack() }])
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível registrar seu interesse.')
    } finally {
      setEnviando(false)
    }
  }

  const handleMatch = async () => {
    Alert.alert('🔧 Confirmar ida ao local?', 'Ao confirmar, o solicitante será notificado e a contagem regressiva será iniciada.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => {
        try {
          const resposta = await api.post(`/reparos/${reparo.id}/match`, {})
          setReparo(prev => ({ ...prev, match_feito_em: resposta.match_feito_em, match_usuario_id: usuario.id }))
          Alert.alert('✅ Confirmado!', 'O solicitante foi notificado. Dirija-se ao local!\n\nUm contrato simples, de prestação de serviços, foi enviado para seu e-mail e também para a outra parte. Vocês podem ou não utilizar e assinar, é facultativo para tarefas simples. Contudo, se quiserem se proteger, basta utilizá-lo. Imprima e assinem.\n\nBom trabalho para vocês! 🤝')
        } catch (err) { Alert.alert('Erro', err.mensagem || 'Não foi possível confirmar.') }
      }}
    ])
  }

  const handleEncerrar = async () => {
    Alert.alert('✅ Encerrar reparo?', 'Confirme que o serviço foi concluído.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar', onPress: async () => {
        try {
          await api.post(`/reparos/${reparo.id}/encerrar`, {})
          Alert.alert('✅ Reparo encerrado!', 'O reparo foi encerrado com sucesso.', [{ text: 'OK', onPress: () => navigation.goBack() }])
        } catch (err) { Alert.alert('Erro', err.mensagem || 'Não foi possível encerrar.') }
      }}
    ])
  }

  const handleExpirarMatch = async () => {
    try {
      await api.post(`/reparos/${reparo.id}/expirar-match`, {})
      setReparo(prev => ({ ...prev, match_feito_em: null, match_usuario_id: null, pedido_tempo_status: null }))
      Alert.alert('⏰ Tempo esgotado', 'O prestador não chegou a tempo. O reparo está disponível novamente.')
    } catch (err) { console.log('Erro ao expirar match:', err) }
  }

  const handleResponderInteresse = async (interesseId, action) => {
    if (action === 'contraproposta' && !valorContraproposta) {
      Alert.alert('Atenção', 'Informe o valor da contraproposta.')
      return
    }
    setEnviandoResposta(true)
    try {
      const valorNumerico = valorContraproposta
        ? parseFloat(valorContraproposta.replace(/\./g, '').replace(',', '.'))
        : null
      await comRetry(() => api.post(`/reparos/${reparo.id}/interesse/${interesseId}/responder`, { action, valor: valorNumerico }))
      setContrapropostaInteresseId(null)
      setValorContraproposta('')
      await buscar()
      const msgs = { aceitar: '✅ Proposta aceita!', recusar: 'Proposta recusada.', contraproposta: '💬 Contraproposta enviada!' }
      Alert.alert('Sucesso', msgs[action])
    } catch (err) {
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      if (isNetwork) {
        Alert.alert('Erro de conexão', 'Não foi possível enviar. Verifique sua conexão.', [
          { text: 'Tentar novamente', onPress: () => handleResponderInteresse(interesseId, action) },
          { text: 'Cancelar', style: 'cancel' },
        ])
      } else {
        Alert.alert('Erro', err.mensagem || 'Não foi possível responder.')
      }
    } finally {
      setEnviandoResposta(false)
    }
  }

  const handlePrestadorResponder = async (action) => {
    setEnviandoResposta(true)
    try {
      await comRetry(() => api.post(`/reparos/${reparo.id}/interesse/${meuInteresse.id}/prestador-responder`, { action }))
      await buscar()
      Alert.alert(
        action === 'aceitar' ? '✅ Contraproposta aceita!' : 'Proposta recusada.',
        action === 'aceitar'
          ? 'Ótimo! O solicitante foi notificado. Confirme sua ida ao local quando estiver pronto.'
          : 'O solicitante foi notificado.'
      )
    } catch (err) {
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      if (isNetwork) {
        Alert.alert('Erro de conexão', 'Não foi possível enviar. Verifique sua conexão.', [
          { text: 'Tentar novamente', onPress: () => handlePrestadorResponder(action) },
          { text: 'Cancelar', style: 'cancel' },
        ])
      } else {
        Alert.alert('Erro', err.mensagem || 'Não foi possível responder.')
      }
    } finally {
      setEnviandoResposta(false)
    }
  }

  const handlePedirTempo = () => {
    Alert.alert('⚠️ Preciso de mais tempo', 'Qual é o motivo?', [
      { text: '🚗 Veículo quebrou', onPress: () => enviarPedidoTempo('Veículo quebrou') },
      { text: '🚦 Trânsito intenso', onPress: () => enviarPedidoTempo('Trânsito intenso') },
      { text: '👮 Parada por fiscalização', onPress: () => enviarPedidoTempo('Parada por fiscalização') },
      { text: '💥 Acidente', onPress: () => enviarPedidoTempo('Acidente') },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  const enviarPedidoTempo = async (motivo) => {
    try {
      await api.post(`/reparos/${reparo.id}/pedir-tempo`, { motivo })
      setReparo(prev => ({ ...prev, pedido_tempo_status: 'aguardando_tempo', pedido_tempo_motivo: motivo }))
      Alert.alert('✅ Solicitação enviada!', 'O solicitante foi notificado e vai perguntar quanto tempo você precisa.')
    } catch (err) { Alert.alert('Erro', err.mensagem || 'Não foi possível enviar a solicitação.') }
  }

  const handleperguntarTempo = async () => {
    try {
      await api.post(`/reparos/${reparo.id}/perguntar-tempo`, {})
      setReparo(prev => ({ ...prev, pedido_tempo_status: 'aguardando_minutos' }))
      Alert.alert('✅ Prestador notificado!', 'Ele vai informar quantos minutos precisa.')
    } catch (err) { Alert.alert('Erro', err.mensagem || 'Não foi possível enviar.') }
  }

  const handleInformarTempo = () => setModalTempo(true)

  const enviarTempo = async () => {
    const min = parseInt(minutosTempo)
    if (!min || min <= 0) { Alert.alert('Atenção', 'Informe um número válido de minutos.'); return }
    setModalTempo(false)
    setMinutosTempo('')
    try {
      await api.post(`/reparos/${reparo.id}/informar-tempo`, { minutos: min })
      setReparo(prev => ({ ...prev, pedido_tempo_status: 'aguardando_aprovacao', pedido_tempo_minutos: min }))
      Alert.alert('✅ Enviado!', 'O solicitante foi notificado para aceitar ou recusar.')
    } catch (err) { Alert.alert('Erro', err.mensagem || 'Não foi possível enviar.') }
  }

  const handleResponderTempo = (aceito) => {
    Alert.alert(
      aceito ? '✅ Aceitar tempo extra?' : '❌ Recusar tempo extra?',
      aceito ? `O prestador precisará de ${reparo.pedido_tempo_minutos} minuto(s) a mais.` : 'O reparo voltará para disponível e o prestador será bloqueado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: aceito ? 'Aceitar' : 'Recusar', style: aceito ? 'default' : 'destructive', onPress: async () => {
          try {
            const resp = await api.post(`/reparos/${reparo.id}/responder-tempo`, { aceito })
            if (aceito) {
              setReparo(prev => ({ ...prev, match_feito_em: resp.novo_match_feito_em, pedido_tempo_status: null, pedido_tempo_minutos: null }))
              Alert.alert('✅ Tempo concedido!', 'O cronômetro foi estendido.')
            } else {
              setReparo(prev => ({ ...prev, match_feito_em: null, match_usuario_id: null, pedido_tempo_status: null }))
              Alert.alert('❌ Recusado', 'O reparo voltou para disponível.')
              navigation.goBack()
            }
          } catch (err) { Alert.alert('Erro', err.mensagem || 'Não foi possível responder.') }
        }}
      ]
    )
  }

  const temMatch = reparo?.match_feito_em && reparo?.match_usuario_id
  const souPrestadorDoMatch = temMatch && reparo?.match_usuario_id === usuario?.id
  const prestadorMatch = temMatch ? interessados.find(i => i.usuario_id === reparo.match_usuario_id) : null

  const abrirWhatsApp = (telefone) => {
    const digitos = telefone.replace(/\D/g, '')
    const numero = digitos.length <= 11 ? `55${digitos}` : digitos
    Linking.openURL(`whatsapp://send?phone=${numero}`)
  }

  if (carregando) {
    return (
      <SafeAreaView style={estilos.container}>
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  if (!reparo) {
    return (
      <SafeAreaView style={estilos.container}>
        <View style={estilos.topbar}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: cores.textoFraco }}>Reparo não encontrado</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.topbarTitulo}>{isDono ? 'Meu reparo' : 'Detalhe do reparo'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <Modal visible={!!fotoFullscreen} transparent animationType="fade" onRequestClose={() => setFotoFullscreen(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', alignItems: 'center', justifyContent: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 52, right: 20, zIndex: 10, width: 44, height: 44, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setFotoFullscreen(null)}
          >
            <Text style={{ color: 'white', fontSize: 22, fontWeight: '900' }}>✕</Text>
          </TouchableOpacity>
          <Image source={{ uri: fotoFullscreen }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
        </View>
      </Modal>

      <Modal visible={!!videoFullscreen} transparent animationType="fade" onRequestClose={() => setVideoFullscreen(null)}>
        <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 52, right: 20, zIndex: 10, width: 44, height: 44, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setVideoFullscreen(null)}
          >
            <Text style={{ color: 'white', fontSize: 22, fontWeight: '900' }}>✕</Text>
          </TouchableOpacity>
          {videoFullscreen && (
            <Video
              source={{ uri: videoFullscreen }}
              style={{ width: '100%', height: '50%' }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
            />
          )}
        </View>
      </Modal>

      <Modal visible={modalTempo} transparent animationType="fade" onRequestClose={() => { setModalTempo(false); setMinutosTempo('') }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: cores.fundoCard, borderRadius: 16, padding: 24, width: '100%' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: cores.textoForte, marginBottom: 8 }}>⏱ Quantos minutos você precisa?</Text>
            <Text style={{ fontSize: 13, color: cores.textoFraco, marginBottom: 16 }}>Digite o tempo em minutos</Text>
            <TextInput
              style={{ backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, padding: 14, fontSize: 18, color: cores.textoForte, textAlign: 'center', marginBottom: 16 }}
              keyboardType="numeric"
              value={minutosTempo}
              onChangeText={setMinutosTempo}
              placeholder="Ex: 15"
              placeholderTextColor={cores.textoMutado}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, padding: 14, alignItems: 'center' }}
                onPress={() => { setModalTempo(false); setMinutosTempo('') }}
              >
                <Text style={{ color: cores.textoFraco, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: cores.primaria, borderRadius: 10, padding: 14, alignItems: 'center' }}
                onPress={enviarTempo}
              >
                <Text style={{ color: '#0A0A0A', fontWeight: '700' }}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={estilos.corpo}>

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
              {reparo.expira_em
                ? <ContadorExpiracaoReparo expiraEm={reparo.expira_em} />
                : <Text style={estilos.urgenciaHoras}>Atender em até {reparo.prazo_atendimento_horas}h</Text>
              }
            </View>
          )}

          {reparo.valor_estimado && (
            <View style={estilos.valorDestaque}>
              <View>
                <Text style={estilos.valorDestaqueLabel}>💰 VALOR COMBINADO</Text>
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
                  <TouchableOpacity
                    key={i}
                    style={estilos.midiaItem}
                    onPress={() => midia.tipo === 'video' ? setVideoFullscreen(midia.url) : setFotoFullscreen(midia.url)}
                    activeOpacity={0.7}
                  >
                    <Image source={{ uri: midia.url }} style={estilos.midiaImagem} resizeMode="cover" />
                    {midia.tipo === 'video' && (
                      <View style={estilos.videoOverlay}>
                        <Text style={{ fontSize: 32, color: 'white' }}>▶</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {temMatch && reparo.prazo_atendimento_horas && (
            <RelogioRegressivo
              matchFeitoEm={reparo.match_feito_em}
              prazoHoras={reparo.prazo_atendimento_horas}
              onExpirar={handleExpirarMatch}
            />
          )}

          {temMatch && (
            <View style={estilos.contratoBanner}>
              <Text style={estilos.contratoBannerTitulo}>📋 Contrato enviado por e-mail</Text>
              <Text style={estilos.contratoBannerTexto}>
                Um contrato simples, de prestação de serviços, foi enviado para seu e-mail e também para a outra parte. Vocês podem ou não utilizar e assinar, é facultativo para tarefas simples. Contudo, se quiserem se proteger, basta utilizá-lo. Imprima e assinem.{'\n\n'}Bom trabalho para vocês! 🤝
              </Text>
            </View>
          )}

          {isDono && (
            <>
              {temMatch && prestadorMatch?.telefone && (
                <TouchableOpacity
                  style={estilos.btnWhatsApp}
                  onPress={() => abrirWhatsApp(prestadorMatch.telefone)}
                >
                  <Text style={estilos.btnWhatsAppTexto}>💬 WhatsApp do prestador: {prestadorMatch.telefone}</Text>
                </TouchableOpacity>
              )}
              {temMatch && (
                <TouchableOpacity style={estilos.btnEncerrar} onPress={handleEncerrar}>
                  <Text style={estilos.btnEncerrarTexto}>✅ Confirmar conclusão — Encerrar reparo</Text>
                </TouchableOpacity>
              )}
              {temMatch && reparo.pedido_tempo_status === 'aguardando_tempo' && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>⚠️ Prestador precisa de mais tempo</Text>
                  <Text style={estilos.pedidoAlertaMotivo}>Motivo: {reparo.pedido_tempo_motivo}</Text>
                  <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleperguntarTempo}>
                    <Text style={estilos.btnPerguntarTempoTexto}>⏱ Quanto tempo a mais você precisa?</Text>
                  </TouchableOpacity>
                </View>
              )}
              {temMatch && reparo.pedido_tempo_status === 'aguardando_minutos' && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o prestador informar quantos minutos precisa...</Text>
                </View>
              )}
              {temMatch && reparo.pedido_tempo_status === 'aguardando_aprovacao' && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>⏳ Prestador precisa de mais tempo</Text>
                  <Text style={estilos.pedidoAlertaMotivo}>Motivo: {reparo.pedido_tempo_motivo}</Text>
                  <Text style={estilos.pedidoAlertaMinutos}>Tempo solicitado: {reparo.pedido_tempo_minutos} minuto(s)</Text>
                  <View style={estilos.pedidoBotoesRow}>
                    <TouchableOpacity style={estilos.btnAceitar} onPress={() => handleResponderTempo(true)}>
                      <Text style={estilos.btnAceitarTexto}>✅ Aceito</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={estilos.btnRecusar} onPress={() => handleResponderTempo(false)}>
                      <Text style={estilos.btnRecusarTexto}>❌ Não aceito</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <Text style={[estilos.secaoTitulo, { marginTop: 20 }]}>🔧 Prestadores interessados ({interessados.length})</Text>
              {interessados.length === 0 ? (
                <View style={estilos.vazioInteressados}>
                  <Text style={estilos.vazioInteressadosTexto}>Nenhum prestador demonstrou interesse ainda.{'\n'}Aguarde as notificações!</Text>
                </View>
              ) : (
                interessados.map((item) => (
                  <View key={item.id} style={estilos.interessadoCard}>
                    <View style={estilos.interessadoHeader}>
                      <Text style={estilos.interessadoNome}>{item.nome}</Text>
                      {item.cidade && <Text style={estilos.interessadoCidade}>📍 {item.cidade}</Text>}
                    </View>
                    {item.valor_proposto && (
                      <Text style={{ fontSize: 13, color: cores.textoMedio, marginBottom: 4 }}>
                        💰 Valor proposto: R$ {Number(item.valor_proposto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </Text>
                    )}
                    {item.valor_contraproposta && (
                      <Text style={{ fontSize: 13, color: '#E8833A', marginBottom: 4 }}>
                        🤝 Minha contraproposta: R$ {Number(item.valor_contraproposta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </Text>
                    )}
                    {item.mensagem && (
                      <View style={estilos.mensagemBox}>
                        <Text style={estilos.mensagemTexto}>{item.mensagem}</Text>
                      </View>
                    )}
                    {item.status === 'pendente' && !temMatch && (
                      <View style={{ marginTop: 10 }}>
                        {contrapropostaInteresseId === item.id ? (
                          <View>
                            <TextInput
                              style={[estilos.input, { marginBottom: 8 }]}
                              placeholder="Valor da contraproposta (ex: 350,00)"
                              placeholderTextColor={cores.textoMutado}
                              keyboardType="numeric"
                              value={valorContraproposta}
                              onChangeText={v => setValorContraproposta(mascararValor(v))}
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity
                                style={[estilos.btnAceitar, { flex: 1 }]}
                                onPress={() => handleResponderInteresse(item.id, 'contraproposta')}
                                disabled={enviandoResposta}
                              >
                                <Text style={estilos.btnAceitarTexto}>Enviar →</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[estilos.btnRecusar, { flex: 1 }]}
                                onPress={() => { setContrapropostaInteresseId(null); setValorContraproposta('') }}
                              >
                                <Text style={estilos.btnRecusarTexto}>Cancelar</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            <TouchableOpacity
                              style={[estilos.btnAceitar, { flex: 1 }]}
                              onPress={() => handleResponderInteresse(item.id, 'aceitar')}
                              disabled={enviandoResposta}
                            >
                              <Text style={estilos.btnAceitarTexto}>✅ Aceitar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[estilos.btnRecusar, { flex: 1 }]}
                              onPress={() => handleResponderInteresse(item.id, 'recusar')}
                              disabled={enviandoResposta}
                            >
                              <Text style={estilos.btnRecusarTexto}>❌ Recusar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ flex: 1, backgroundColor: '#2a2200', borderWidth: 1, borderColor: '#E8833A', borderRadius: raios.medio, padding: 10, alignItems: 'center' }}
                              onPress={() => setContrapropostaInteresseId(item.id)}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#E8833A' }}>💬 Contra</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                    {item.status === 'contraproposta_dono' && (
                      <View style={{ marginTop: 8, padding: 8, backgroundColor: '#2a1a00', borderRadius: raios.medio }}>
                        <Text style={{ fontSize: 12, color: '#E8833A' }}>⏳ Aguardando resposta do prestador...</Text>
                      </View>
                    )}
                    {item.status === 'aceito' && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 12, color: '#4caf50', fontWeight: '600', marginBottom: 6 }}>✅ Proposta aceita!</Text>
                        {item.telefone && (
                          <TouchableOpacity style={estilos.btnWhatsApp} onPress={() => abrirWhatsApp(item.telefone)}>
                            <Text style={estilos.btnWhatsAppTexto}>💬 WhatsApp: {item.telefone}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    {item.status === 'recusado' && (
                      <View style={{ marginTop: 8, padding: 8, backgroundColor: '#1a0a0a', borderRadius: raios.medio }}>
                        <Text style={{ fontSize: 12, color: '#f44336' }}>❌ Recusado</Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          {isPrestador && !isDono && (
            <>
              {souPrestadorDoMatch && (
                <TouchableOpacity style={estilos.btnEncerrar} onPress={handleEncerrar}>
                  <Text style={estilos.btnEncerrarTexto}>✅ Serviço concluído — Encerrar</Text>
                </TouchableOpacity>
              )}
              {souPrestadorDoMatch && !reparo.pedido_tempo_status && (
                <TouchableOpacity style={estilos.btnPedirTempo} onPress={handlePedirTempo}>
                  <Text style={estilos.btnPedirTempoTexto}>⚠️ Preciso de mais tempo para chegar</Text>
                </TouchableOpacity>
              )}
              {souPrestadorDoMatch && reparo.pedido_tempo_status === 'aguardando_tempo' && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante responder sua solicitação...</Text>
                </View>
              )}
              {souPrestadorDoMatch && reparo.pedido_tempo_status === 'aguardando_minutos' && (
                <TouchableOpacity style={estilos.btnInformarTempo} onPress={handleInformarTempo}>
                  <Text style={estilos.btnInformarTempoTexto}>⏱ Informar quantos minutos preciso</Text>
                </TouchableOpacity>
              )}
              {souPrestadorDoMatch && reparo.pedido_tempo_status === 'aguardando_aprovacao' && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante aceitar os {reparo.pedido_tempo_minutos} minuto(s) extra...</Text>
                </View>
              )}
              {!temMatch && (
                meuInteresse ? (
                  <View style={estilos.interesseFeito}>
                    {meuInteresse.status === 'pendente' && (
                      <>
                        <Text style={{ color: cores.primaria, fontWeight: '600', marginBottom: 6 }}>⏳ Aguardando resposta</Text>
                        <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20 }}>Suas informações foram enviadas. Aguarde a resposta do solicitante!</Text>
                      </>
                    )}
                    {meuInteresse.status === 'contraproposta_dono' && (
                      <>
                        <Text style={{ color: '#E8833A', fontWeight: '600', marginBottom: 6 }}>💬 O solicitante fez uma contraproposta!</Text>
                        {meuInteresse.valor_contraproposta && (
                          <Text style={{ fontSize: 18, fontWeight: '700', color: cores.sucesso, marginBottom: 12 }}>
                            R$ {Number(meuInteresse.valor_contraproposta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </Text>
                        )}
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <TouchableOpacity style={[estilos.btnAceitar, { flex: 1 }]} onPress={() => handlePrestadorResponder('aceitar')} disabled={enviandoResposta}>
                            <Text style={estilos.btnAceitarTexto}>✅ Aceitar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[estilos.btnRecusar, { flex: 1 }]} onPress={() => handlePrestadorResponder('recusar')} disabled={enviandoResposta}>
                            <Text style={estilos.btnRecusarTexto}>❌ Recusar</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                    {meuInteresse.status === 'aceito' && (
                      <>
                        <Text style={{ color: '#4caf50', fontWeight: '600', marginBottom: 6 }}>✅ Proposta aceita!</Text>
                        <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20, marginBottom: 12 }}>Parabéns! Você foi selecionado. Confirme sua ida ao local:</Text>
                        <TouchableOpacity style={estilos.btnMatch} onPress={handleMatch}>
                          <Text style={estilos.btnMatchTexto}>🔧 Estou a caminho! Iniciar contagem →</Text>
                        </TouchableOpacity>
                        <Text style={estilos.avisoDeslocamento}>⚠️ Este cronômetro é apenas informativo para seu deslocamento. O prazo estabelecido pelo solicitante continua valendo independentemente.</Text>
                      </>
                    )}
                    {meuInteresse.status === 'recusado' && (
                      <>
                        <Text style={{ color: '#f44336', fontWeight: '600', marginBottom: 6 }}>❌ Não selecionado</Text>
                        <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20 }}>Sua proposta não foi aceita desta vez.</Text>
                      </>
                    )}
                  </View>
                ) : mostrarForm ? (
                  <View style={estilos.formInteresse}>
                    <Text style={estilos.formTitulo}>📋 Suas informações profissionais</Text>
                    <Text style={estilos.formSubtitulo}>Estas informações serão enviadas ao solicitante para que ele possa escolher o melhor profissional.</Text>
                    {reparo.valor_estimado && !valorProposto && (
                      <TouchableOpacity
                        style={valorAceito ? estilos.btnValorAceito : estilos.btnAceitarValorProposto}
                        onPress={() => setValorAceito(v => !v)}
                        disabled={enviando}
                      >
                        <Text style={valorAceito ? estilos.btnValorAceitoTexto : estilos.btnAceitarValorPropostoTexto}>
                          {valorAceito
                            ? `✅ Valor aceito (R$ ${Number(reparo.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
                            : `Aceitar o valor proposto (R$ ${Number(reparo.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
                          }
                        </Text>
                      </TouchableOpacity>
                    )}
                    <PerguntaOpcoes label="⏱ Há quanto tempo realiza este tipo de serviço?" opcoes={['Menos de 1 ano', '1 a 3 anos', '3 a 5 anos', 'Mais de 5 anos']} valor={tempoExperiencia} onChange={setTempoExperiencia} />
                    <PerguntaOpcoes label="⚠️ Já enfrentou problemas com este tipo de serviço?" opcoes={['Nunca', 'Raramente', 'Algumas vezes']} valor={jaEnfrentouProblemas} onChange={setJaEnfrentouProblemas} />
                    <PerguntaOpcoes label="📋 Possui referências neste tipo de reparo?" opcoes={['Sim', 'Não', 'Tenho fotos de serviços']} valor={possuiReferencias} onChange={setPossuiReferencias} />
                    <PerguntaOpcoes label="🔧 Possui todas as ferramentas necessárias?" opcoes={['Sim, todas', 'A maioria', 'Preciso de algumas']} valor={possuiFerramentas} onChange={setPossuiFerramentas} />
                    <View style={estilos.perguntaWrap}>
                      <Text style={estilos.perguntaLabel}>💡 Sugestão para melhorar a durabilidade (opcional)</Text>
                      <TextInput style={estilos.textarea} placeholder="Ex: Recomendo usar vedante específico..." placeholderTextColor={cores.textoMutado} value={sugestaoDurabilidade} onChangeText={setSugestaoDurabilidade} multiline numberOfLines={3} />
                    </View>
                    <View style={estilos.perguntaWrap}>
                      <Text style={estilos.perguntaLabel}>💬 Mensagem adicional (opcional)</Text>
                      <TextInput style={estilos.textarea} placeholder="Alguma informação extra..." placeholderTextColor={cores.textoMutado} value={mensagemAdicional} onChangeText={setMensagemAdicional} multiline numberOfLines={3} />
                    </View>
                    {!valorAceito && (
                      <View style={estilos.perguntaWrap}>
                        <Text style={estilos.perguntaLabel}>💰 Propor outro valor (opcional)</Text>
                        <TextInput
                          style={estilos.input}
                          placeholder="Ex: 350,00"
                          placeholderTextColor={cores.textoMutado}
                          keyboardType="numeric"
                          value={valorProposto}
                          onChangeText={v => setValorProposto(mascararValor(v))}
                        />
                        <Text style={{ color: '#f44336', fontWeight: '700', fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                          ⚠️ Se você propuser outro valor, o reparo ainda ficará disponível para outros prestadores até que o solicitante aceite. Pense bem!
                        </Text>
                      </View>
                    )}
                    <BotaoPrimario titulo="Enviar minhas informações →" onPress={handleInteresse} carregando={enviando} estilo={{ marginBottom: 10, marginTop: 8 }} />
                    <TouchableOpacity onPress={() => setMostrarForm(false)} style={{ alignItems: 'center', padding: 10 }}>
                      <Text style={{ color: cores.textoFraco, fontSize: 13 }}>Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <BotaoPrimario titulo="Tenho interesse neste reparo →" onPress={() => setMostrarForm(true)} />
                    <Text style={estilos.aviso}>Ao demonstrar interesse, suas informações profissionais serão enviadas ao solicitante.</Text>
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
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  relogioBox: { backgroundColor: '#1a1a2a', borderWidth: 1.5, borderColor: cores.primaria, borderRadius: raios.grande, padding: 20, alignItems: 'center', marginBottom: 16 },
  relogioExpirado: { backgroundColor: '#2a2a2a', borderColor: '#666' },
  relogioLabel: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 1, marginBottom: 8 },
  relogioTempo: { fontSize: 52, fontWeight: '700', color: cores.primaria, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  relogioSub: { fontSize: 11, color: cores.textoFraco, marginTop: 6, textAlign: 'center' },
  btnMatch: { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginTop: 12 },
  btnMatchTexto: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  btnWhatsApp: { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#25D366', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 8 },
  btnWhatsAppTexto: { fontSize: 13, fontWeight: '600', color: '#25D366' },
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
  input: { backgroundColor: cores.fundoInput, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, fontSize: 15, color: cores.textoForte },
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
  contratoBanner: { backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#4a4a8a', borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  contratoBannerTitulo: { fontSize: 13, fontWeight: '700', color: '#8888cc', marginBottom: 8 },
  contratoBannerTexto: { fontSize: 12, color: cores.textoMedio, lineHeight: 19 },
  btnPedirTempo: { backgroundColor: '#3a2a00', borderWidth: 1, borderColor: '#E8833A', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginTop: 10 },
  btnPedirTempoTexto: { fontSize: 13, fontWeight: '600', color: '#E8833A' },
  btnInformarTempo: { backgroundColor: cores.primariaSuave, borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginTop: 10 },
  btnInformarTempoTexto: { fontSize: 13, fontWeight: '600', color: cores.primaria },
  btnPerguntarTempo: { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 12, alignItems: 'center', marginTop: 12 },
  btnPerguntarTempoTexto: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  pedidoBox: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginTop: 10 },
  pedidoTexto: { fontSize: 13, color: cores.textoMedio, textAlign: 'center', lineHeight: 20 },
  pedidoAlertaBox: { backgroundColor: '#3a2a00', borderWidth: 1, borderColor: '#E8833A', borderRadius: raios.grande, padding: 16, marginTop: 10 },
  pedidoAlertaTitulo: { fontSize: 14, fontWeight: '700', color: '#E8833A', marginBottom: 4 },
  pedidoAlertaMotivo: { fontSize: 12, color: cores.textoMedio, marginBottom: 4 },
  pedidoAlertaMinutos: { fontSize: 13, fontWeight: '600', color: cores.textoForte, marginBottom: 12 },
  pedidoBotoesRow: { flexDirection: 'row', gap: 10 },
  btnAceitar: { flex: 1, backgroundColor: cores.sucesso, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  btnAceitarTexto: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  btnRecusar: { flex: 1, backgroundColor: '#3a1a1a', borderWidth: 1, borderColor: '#f44336', borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  btnRecusarTexto: { fontSize: 13, fontWeight: '700', color: '#f44336' },
  btnAceitarValorProposto: { backgroundColor: '#3a2a00', borderWidth: 1.5, borderColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnAceitarValorPropostoTexto: { fontSize: 14, fontWeight: '700', color: cores.primaria },
  btnValorAceito: { backgroundColor: '#1a3a1a', borderWidth: 1.5, borderColor: '#4caf50', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnValorAceitoTexto: { fontSize: 14, fontWeight: '700', color: '#4caf50' },
  avisoDeslocamento: { fontSize: 11, color: '#E8833A', textAlign: 'center', marginTop: 8, lineHeight: 16, paddingHorizontal: 8 },
})