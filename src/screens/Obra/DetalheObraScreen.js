import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, TextInput, Linking, Modal
} from 'react-native'
import { Image } from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import api, { obrasService } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useFocusEffect } from '@react-navigation/native'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { celebracaoRef } from '../../components/CelebracaoMatchHost'
import ModalEstenderPrazo from '../../components/ModalEstenderPrazo'
import ModalAvaliacao from '../../components/ModalAvaliacao'
import { comRetry } from '../../utils/rede'
import { cores, espacos, raios } from '../../utils/tema'
import { distanciaItemKm, formatarDistancia, useCoordsUsuario } from '../../utils/distancia'

const ContadorExpiracaoObra = ({ expiraEm }) => {
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

// Pós-match: conta até expira_em (o MESMO prazo do contador pré-match), tornando a
// contagem contínua através do match — o pintor vê o tempo que RESTAVA no Rol, não uma
// janela nova de match_feito_em + prazo. Ao chegar a zero dispara onExpirar (POST
// /obras/:id/expirar-match) no exato momento de expira_em; o job verificarCronometroObras
// faz o mesmo no servidor — quem disparar primeiro vence, o outro é no-op idempotente.
// match_feito_em segue usado noutros lugares, mas não para esta contagem.
const RelogioRegressivo = ({ expiraEm, onExpirar }) => {
  const [tempo, setTempo] = useState('')
  const [expirou, setExpirou] = useState(false)
  const expirouRef = React.useRef(false)

  useEffect(() => {
    expirouRef.current = false
    const calcular = () => {
      const fim = new Date(expiraEm)
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
  }, [expiraEm])

  const urgente = tempo && tempo.startsWith('00:')
  return (
    <View style={[estilos.relogioBox, expirou && estilos.relogioExpirado]}>
      <Text style={estilos.relogioLabel}>{expirou ? '⏰ TEMPO ESGOTADO' : '⏱ TEMPO RESTANTE'}</Text>
      <Text style={[estilos.relogioTempo, urgente && !expirou && { color: '#f44336' }, expirou && { color: '#666' }]}>{tempo}</Text>
      {!expirou && <Text style={estilos.relogioSub}>O pintor deve chegar dentro deste prazo</Text>}
      {expirou && <Text style={estilos.relogioSub}>A obra voltou para disponível</Text>}
    </View>
  )
}

export default function DetalheObraScreen({ route, navigation }) {
  const { obra: obraInicial } = route.params
  const { usuario } = useAuth()
  const [obra, setObra] = useState(obraInicial)
  const [avaliarVisivel, setAvaliarVisivel] = useState(false)
  const [midias, setMidias] = useState([])
  const [minhaCandidatura, setMinhaCandidatura] = useState(null)
  const [candidatos, setCandidatos] = useState([])
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
  const [contrapropostaCandidaturaId, setContrapropostaCandidaturaId] = useState(null)
  const [valorContraproposta, setValorContraproposta] = useState('')
  const [mostrarContraPintor, setMostrarContraPintor] = useState(false)
  const [valorContraPintor, setValorContraPintor] = useState('')
  const [enviandoResposta, setEnviandoResposta] = useState(false)
  const [modalTempo, setModalTempo] = useState(false)
  const [minutosTempo, setMinutosTempo] = useState('')
  const [modalEstender, setModalEstender] = useState(false)
  const [estendendo, setEstendendo] = useState(false)
  const [orcamentoEstender, setOrcamentoEstender] = useState(null)
  const [buscandoOrcamento, setBuscandoOrcamento] = useState(false)
  const [coords] = useCoordsUsuario()
  const mountedRef = useRef(true)

  const mascararValor = (v) => {
    const nums = v.replace(/\D/g, '')
    if (!nums) return ''
    const centavos = Math.min(parseInt(nums, 10), 9999999999)
    const reaisStr = Math.floor(centavos / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${reaisStr},${String(centavos % 100).padStart(2, '0')}`
  }

  const isDono = usuario?.id === obra?.criado_por
  const isPrestador = usuario?.role === 'prestador' || usuario?.role === 'assinante'

  useEffect(() => {
    mountedRef.current = true
    buscar()
    return () => { mountedRef.current = false }
  }, [obraInicial.id])

  // Refetch silencioso ao reganhar foco: garante que uma contraproposta do dono
  // (ou mudança de status) apareça mesmo se o pintor já estava nesta tela.
  useFocusEffect(
    React.useCallback(() => {
      if (obraInicial?.id) buscar()
    }, [obraInicial?.id])
  )

  const buscar = async () => {
    try {
      const resposta = await obrasService.detalhe(obraInicial.id)
      if (mountedRef.current) {
        setObra(resposta.obra || resposta)
        setMidias(resposta.midias || [])
        setMinhaCandidatura(resposta.minha_candidatura)
        setCandidatos(resposta.candidatos || [])
      }
    } catch (err) {
      console.log('Erro ao buscar obra:', err)
    } finally {
      if (mountedRef.current) setCarregando(false)
    }
  }

  const handleInteresse = async () => {
    if (!tempoExperiencia) { Alert.alert('Atenção', 'Informe há quanto tempo realiza este tipo de serviço.'); return }
    if (!possuiFerramentas) { Alert.alert('Atenção', 'Informe se possui os materiais e equipamentos necessários.'); return }
    setEnviando(true)
    try {
      const mensagem = [
        `⏱ Experiência: ${tempoExperiencia}`,
        `⚠️ Já enfrentou problemas: ${jaEnfrentouProblemas || 'Não informado'}`,
        `💡 Sugestão de acabamento: ${sugestaoDurabilidade || 'Não informado'}`,
        `📋 Possui referências: ${possuiReferencias || 'Não informado'}`,
        `🎨 Possui materiais e equipamentos: ${possuiFerramentas}`,
        mensagemAdicional ? `💬 Observação: ${mensagemAdicional}` : '',
      ].filter(Boolean).join('\n')
      const valorNumerico = valorAceito
        ? parseFloat(String(obra.valor || obra.valor_estimado))
        : (valorProposto ? parseFloat(valorProposto.replace(/\./g, '').replace(',', '.')) : null)
      await comRetry(() => api.post(`/obras/${obra.id}/candidatura`, { mensagem, valor_proposto: valorNumerico }))
      setMinhaCandidatura({ status: 'pendente' })
      setMostrarForm(false)
      Alert.alert('✅ Interesse registrado!', 'O solicitante receberá suas informações e entrará em contato se tiver interesse.', [{ text: 'OK', onPress: () => navigation.goBack() }])
    } catch (err) {
      console.log('[DetalheObra] falha ao registrar interesse | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      // A 1ª tentativa pode ter sido aceita no servidor mas a resposta se perdeu (troca
      // de rede), ou o retry recebeu 409 "já se candidatou". Reconsulta: se a candidatura
      // já existir para este usuário, trata como sucesso em vez de erro confuso.
      try {
        const atual = await obrasService.detalhe(obra.id)
        if (atual?.minha_candidatura) {
          setMinhaCandidatura(atual.minha_candidatura)
          setMostrarForm(false)
          Alert.alert('✅ Interesse registrado!', 'O solicitante receberá suas informações e entrará em contato se tiver interesse.', [{ text: 'OK', onPress: () => navigation.goBack() }])
          return
        }
      } catch (e2) { console.log('[DetalheObra] reconsulta pós-interesse falhou | code:', e2.code) }
      Alert.alert('Erro', err.mensagem || 'Não foi possível registrar seu interesse.')
    } finally {
      setEnviando(false)
    }
  }

  const handleMatch = async () => {
    const MSG_SUCESSO = 'O solicitante foi notificado. Dirija-se ao local!\n\nUm contrato simples, de prestação de serviços, foi enviado para seu e-mail e também para a outra parte. Vocês podem ou não utilizar e assinar, é facultativo para tarefas simples. Contudo, se quiserem se proteger, basta utilizá-lo. Imprima e assinem.\n\nBom trabalho para vocês! 🤝'
    const aplicarSucesso = (matchFeitoEm) => {
      setObra(prev => ({ ...prev, match_feito_em: matchFeitoEm || prev.match_feito_em || new Date().toISOString(), match_usuario_id: usuario.id }))
      Alert.alert('✅ Confirmado!', MSG_SUCESSO)
    }
    Alert.alert('🎨 Confirmar ida ao local?', 'Ao confirmar, o solicitante será notificado e a contagem regressiva será iniciada.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => {
        try {
          const resposta = await comRetry(() => api.post(`/obras/${obra.id}/match`, {}))
          aplicarSucesso(resposta.match_feito_em)
        } catch (err) {
          console.log('[DetalheObra] falha ao confirmar match | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
          // A 1ª tentativa pode ter dado certo no servidor mas a resposta se perdeu
          // (troca de rede), ou o retry recebeu 409 "já tem pintor". Reconsulta:
          // se o match já for deste pintor, trata como sucesso em vez de erro confuso.
          try {
            const atual = await obrasService.detalhe(obra.id)
            const obraAtual = atual?.obra || atual
            if (obraAtual?.match_usuario_id === usuario.id) { aplicarSucesso(obraAtual.match_feito_em); return }
          } catch (e2) { console.log('[DetalheObra] reconsulta pós-match falhou | code:', e2.code) }
          Alert.alert('Erro', err.mensagem || 'Não foi possível confirmar.')
        }
      }}
    ])
  }

  const handleEncerrar = async () => {
    Alert.alert('✅ Encerrar obra?', 'Confirme que o serviço foi concluído.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar', onPress: async () => {
        try {
          await comRetry(() => api.post(`/obras/${obra.id}/encerrar`, {}))
          if (mountedRef.current) setObra(prev => ({ ...prev, status: 'encerrada' }))
          // Dono: em vez de voltar direto à lista, abre o ModalAvaliacao para avaliar o
          // pintor (2º ponto de entrada; o 1º é Contratos Finalizados). Prestador mantém
          // o comportamento original (aviso + volta à lista) — o bloqueio é ação do dono.
          if (isDono) {
            buscar()
            if (mountedRef.current) setAvaliarVisivel(true)
          } else {
            Alert.alert('✅ Obra encerrada!', 'A obra foi encerrada com sucesso.', [{ text: 'OK', onPress: async () => { await buscar(); navigation.goBack() } }])
          }
        } catch (err) { console.log('[DetalheObra] falha ao encerrar obra | status:', err.status, '| code:', err.code, '| msg:', err.mensagem); Alert.alert('Erro', err.mensagem || 'Não foi possível encerrar.') }
      }}
    ])
  }

  // Pós-encerrar (fluxo do dono). Avaliar é OPCIONAL: pular (onFechar) conclui o
  // encerramento normalmente, voltando à lista. Se avaliar, reusa EXATAMENTE a invocação
  // de ContratosFinalizadosScreen.handleEnviarAvaliacao (POST /avaliacoes com
  // contrato_tipo/contrato_id) e, em seguida, oferece o bloqueio do pintor — mesma ação
  // do card (POST /usuarios/bloquear-prestador). A UNIQUE(contrato_tipo,contrato_id,
  // avaliador_id) do servidor já barra avaliação dupla se ele já avaliou por outro caminho.
  const finalizarPosEncerrar = () => {
    setAvaliarVisivel(false)
    if (navigation.canGoBack()) navigation.goBack()
  }

  const oferecerBloqueioEncerrar = () => {
    setAvaliarVisivel(false)
    const pintorId = obra.match_usuario_id
    if (!pintorId) { finalizarPosEncerrar(); return }
    Alert.alert(
      'Bloquear para futuros serviços?',
      'Você pode impedir que este profissional seja pareado com você novamente. É opcional.',
      [
        { text: 'Agora não', style: 'cancel', onPress: finalizarPosEncerrar },
        { text: 'Bloquear', style: 'destructive', onPress: async () => {
          try { await api.post('/usuarios/bloquear-prestador', { prestador_id: pintorId }) }
          catch (err) { console.log('[DetalheObra] falha ao bloquear pintor | msg:', err.message) }
          finalizarPosEncerrar()
        } },
      ],
    )
  }

  const enviarAvaliacaoEncerrar = async (estrelas) => {
    try {
      await api.post('/avaliacoes', { contrato_tipo: 'obra', contrato_id: obra.id, estrelas })
    } catch (err) {
      console.log('[DetalheObra] falha ao enviar avaliação | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert('Erro', err?.mensagem || 'Não foi possível enviar a avaliação. Tente novamente.')
    }
    oferecerBloqueioEncerrar()
  }

  const handleExpirarMatch = async () => {
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/expirar-match`, {}))
      setObra(prev => ({ ...prev, match_feito_em: null, match_usuario_id: null, pedido_tempo_status: null }))
      Alert.alert('⏰ Tempo esgotado', 'O pintor não chegou a tempo. A obra está disponível novamente.')
    } catch (err) { console.log('Erro ao expirar match:', err) }
  }

  // Lazy-fetch do orçamento de extensão NO TOQUE (não no mount): busca o detalhe fresco
  // só quando o dono decide aumentar o prazo, lê extensao_maxima_horas e abre o modal.
  // Não altera o comportamento de mount da tela. Falha → toast e NÃO abre o modal
  // (nunca abrir com orçamento adivinhado/velho). Espelha o abrirModalEstender do reparo.
  const abrirModalEstender = async () => {
    if (buscandoOrcamento) return
    setBuscandoOrcamento(true)
    try {
      const resposta = await comRetry(() => obrasService.detalhe(obra.id))
      const det = resposta?.obra || resposta
      setOrcamentoEstender(Number(det?.extensao_maxima_horas) || 0)
      setModalEstender(true)
    } catch (err) {
      console.log('[DetalheObra] falha ao buscar orçamento de extensão | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert('Erro', err.mensagem || 'Não foi possível carregar as opções de prazo. Tente novamente.')
    } finally {
      setBuscandoOrcamento(false)
    }
  }

  // Aumentar prazo (dono da obra). Espelha o padrão de handleResponderCandidatura:
  // comRetry + flag de loading + ramo ERR_NETWORK. Esta tela mantém a obra no estado
  // vinda da navegação; após sucesso, atualiza APENAS expira_em a partir da resposta do
  // POST (a contagem reinicia via o efeito [expiraEm]) — sem refetch, sem sobrescrever o
  // objeto inteiro. Erros documentados da API: 422 (acima do teto 2x), 409 (não aberta /
  // já com match), 404.
  const handleEstender = async (horas) => {
    if (estendendo) return
    setEstendendo(true)
    try {
      const resp = await comRetry(() => api.post(`/obras/${obra.id}/estender`, { horas }))
      setModalEstender(false)
      const novoExpira = resp?.expira_em || resp?.obra?.expira_em
      if (novoExpira) setObra(prev => ({ ...prev, expira_em: novoExpira }))
      Alert.alert('✅ Prazo aumentado!', 'O novo prazo já está valendo.')
    } catch (err) {
      console.log('[DetalheObra] falha ao estender prazo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      if (err.status === 422) {
        setModalEstender(false)
        Alert.alert('Não foi possível aumentar', err.mensagem || 'Esta obra já está no prazo máximo permitido.')
      } else if (err.status === 409) {
        setModalEstender(false)
        Alert.alert('Não foi possível aumentar', err.mensagem || 'Esta obra não está mais disponível para aumento de prazo.')
      } else if (err.status === 404) {
        setModalEstender(false)
        Alert.alert('Não encontrado', err.mensagem || 'Obra não encontrada.')
      } else if (isNetwork) {
        Alert.alert('Erro de conexão', 'Não foi possível aumentar o prazo. Verifique sua conexão.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.', [
          { text: 'Tentar novamente', onPress: () => handleEstender(horas) },
          { text: 'Cancelar', style: 'cancel' },
        ])
      } else {
        Alert.alert('Erro', err.mensagem || 'Não foi possível aumentar o prazo.')
      }
    } finally {
      setEstendendo(false)
    }
  }

  const handleResponderCandidatura = async (candidaturaId, action) => {
    if (action === 'contraproposta' && !valorContraproposta) {
      Alert.alert('Atenção', 'Informe o valor da contraproposta.')
      return
    }
    setEnviandoResposta(true)
    try {
      const valorNumerico = valorContraproposta
        ? parseFloat(valorContraproposta.replace(/\./g, '').replace(',', '.'))
        : null
      await comRetry(() => api.post(`/obras/${obra.id}/candidatura/${candidaturaId}/responder`, { action, valor: valorNumerico }))
      setContrapropostaCandidaturaId(null)
      setValorContraproposta('')
      if (action === 'recusar') {
        Alert.alert('Sucesso', 'Proposta recusada.', [{ text: 'OK', onPress: () => navigation.goBack() }])
        return
      }
      await buscar()
      const msgs = { aceitar: '✅ Proposta aceita!', contraproposta: '💬 Contraproposta enviada!' }
      Alert.alert('Sucesso', msgs[action])
    } catch (err) {
      console.log('[DetalheObra] falha ao responder candidatura | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      if (isNetwork) {
        Alert.alert('Erro de conexão', 'Não foi possível enviar. Verifique sua conexão.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.', [
          { text: 'Tentar novamente', onPress: () => handleResponderCandidatura(candidaturaId, action) },
          { text: 'Cancelar', style: 'cancel' },
        ])
      } else {
        Alert.alert('Erro', err.mensagem || 'Não foi possível responder.')
      }
    } finally {
      setEnviandoResposta(false)
    }
  }

  const handlePintorResponder = async (action, valor) => {
    const valorNum = valor ? parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) : null
    if (action === 'contraproposta' && !valorNum) { Alert.alert('Atenção', 'Informe o valor da contraproposta.'); return }
    setEnviandoResposta(true)
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/candidatura/${minhaCandidatura.id}/pintor-responder`, { action, valor: valorNum }))
      setMostrarContraPintor(false)
      setValorContraPintor('')
      await buscar()
      // Aceite confirmado: dispara a verificação de celebração já, sem esperar troca de foco/aba.
      if (action === 'aceitar') celebracaoRef.verificar?.(true)
      Alert.alert(
        action === 'aceitar' ? '✅ Contraproposta aceita!' : action === 'contraproposta' ? '💬 Contraproposta enviada!' : 'Proposta recusada.',
        action === 'aceitar'
          ? 'Ótimo! O solicitante foi notificado. Confirme sua ida ao local quando estiver pronto.'
          : action === 'contraproposta'
          ? 'O solicitante foi notificado da sua contraproposta.'
          : 'O solicitante foi notificado.'
      )
    } catch (err) {
      console.log('[DetalheObra] falha ao pintor responder contraproposta | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      if (isNetwork) {
        Alert.alert('Erro de conexão', 'Não foi possível enviar. Verifique sua conexão.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.', [
          { text: 'Tentar novamente', onPress: () => handlePintorResponder(action, valor) },
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
      await comRetry(() => api.post(`/obras/${obra.id}/pedir-tempo`, { motivo }))
      setObra(prev => ({ ...prev, pedido_tempo_status: 'aguardando_tempo', pedido_tempo_motivo: motivo }))
      Alert.alert('✅ Solicitação enviada!', 'O solicitante foi notificado e vai perguntar quanto tempo você precisa.')
    } catch (err) { console.log('[DetalheObra] falha ao pedir tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem); Alert.alert('Erro', err.mensagem || 'Não foi possível enviar a solicitação.') }
  }

  const handleperguntarTempo = async () => {
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/perguntar-tempo`, {}))
      setObra(prev => ({ ...prev, pedido_tempo_status: 'aguardando_minutos' }))
      Alert.alert('✅ Pintor notificado!', 'Ele vai informar quantos minutos precisa.')
    } catch (err) { console.log('[DetalheObra] falha ao perguntar tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem); Alert.alert('Erro', err.mensagem || 'Não foi possível enviar.') }
  }

  const handleInformarTempo = () => setModalTempo(true)

  const enviarTempo = async () => {
    const min = parseInt(minutosTempo)
    if (!min || min <= 0) { Alert.alert('Atenção', 'Informe um número válido de minutos.'); return }
    setModalTempo(false)
    setMinutosTempo('')
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/informar-tempo`, { minutos: min }))
      setObra(prev => ({ ...prev, pedido_tempo_status: 'aguardando_aprovacao', pedido_tempo_minutos: min }))
      Alert.alert('✅ Enviado!', 'O solicitante foi notificado para aceitar ou recusar.')
    } catch (err) { console.log('[DetalheObra] falha ao informar tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem); Alert.alert('Erro', err.mensagem || 'Não foi possível enviar.') }
  }

  const handleResponderTempo = (aceito) => {
    Alert.alert(
      aceito ? '✅ Aceitar tempo extra?' : '❌ Recusar tempo extra?',
      aceito ? `O pintor precisará de ${obra.pedido_tempo_minutos} minuto(s) a mais.` : 'A obra voltará para disponível e o pintor será bloqueado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: aceito ? 'Aceitar' : 'Recusar', style: aceito ? 'default' : 'destructive', onPress: async () => {
          try {
            const resp = await comRetry(() => api.post(`/obras/${obra.id}/responder-tempo`, { aceito }))
            if (aceito) {
              setObra(prev => ({ ...prev, match_feito_em: resp.novo_match_feito_em, pedido_tempo_status: null, pedido_tempo_minutos: null }))
              Alert.alert('✅ Tempo concedido!', 'O cronômetro foi estendido.')
            } else {
              setObra(prev => ({ ...prev, match_feito_em: null, match_usuario_id: null, pedido_tempo_status: null }))
              Alert.alert('❌ Recusado', 'A obra voltou para disponível.')
              navigation.goBack()
            }
          } catch (err) { console.log('[DetalheObra] falha ao responder tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem); Alert.alert('Erro', err.mensagem || 'Não foi possível responder.') }
        }}
      ]
    )
  }

  const temMatch = obra?.match_feito_em && obra?.match_usuario_id
  const souPintorDoMatch = temMatch && obra?.match_usuario_id === usuario?.id
  const pintorMatch = temMatch ? candidatos.find(c => c.usuario_id === obra.match_usuario_id) : null
  const distancia = distanciaItemKm(coords, obra)

  const abrirWhatsApp = (telefone) => {
    const digitos = (telefone || '').replace(/\D/g, '')
    if (!digitos) { console.log('[DetalheObra] abrirWhatsApp chamado sem número — ignorado'); return }
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

  if (!obra) {
    return (
      <SafeAreaView style={estilos.container}>
        <View style={estilos.topbar}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: cores.textoFraco }}>Obra não encontrada</Text>
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
        <Text style={estilos.topbarTitulo}>{isDono ? 'Minha obra' : 'Detalhe da obra'}</Text>
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

          {(obra.horas_para_expirar || obra.prazo_execucao_horas) && (
            <View style={estilos.urgenciaBanner}>
              <Text style={estilos.urgenciaTexto}>
                {(obra.horas_para_expirar || obra.prazo_execucao_horas) <= 24 ? '📅 Hoje'
                  : (obra.horas_para_expirar || obra.prazo_execucao_horas) <= 168 ? '📆 Esta semana'
                  : (obra.horas_para_expirar || obra.prazo_execucao_horas) <= 720 ? '🗓️ Este mês'
                  : (obra.horas_para_expirar || obra.prazo_execucao_horas) <= 1440 ? '📋 Mês que vem'
                  : '⏳ Mais de um mês'}
              </Text>
              {obra.expira_em
                ? <ContadorExpiracaoObra expiraEm={obra.expira_em} />
                : <Text style={estilos.urgenciaHoras}>Prazo de execução informado</Text>
              }
            </View>
          )}

          {(obra.valor || obra.valor_estimado) && (
            <View style={estilos.valorDestaque}>
              <View>
                <Text style={estilos.valorDestaqueLabel}>💰 {temMatch ? 'VALOR COMBINADO' : 'VALOR PROPOSTO'}</Text>
                <Text style={estilos.valorDestaqueValor}>
                  R$ {Number((obra.valor || obra.valor_estimado)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={estilos.categoriaPill}>
                <Text style={estilos.categoriaTexto}>{obra.categoria}</Text>
              </View>
            </View>
          )}

          <Text style={estilos.titulo}>{obra.titulo}</Text>
          <Text style={estilos.local}>
            📍 {obra.cidade}{obra.bairro ? `, ${obra.bairro}` : ''}
            {distancia != null && <Text style={estilos.localDistancia}>{`  ·  ${formatarDistancia(distancia)}`}</Text>}
          </Text>
          {obra.endereco_obra ? (
            <Text style={estilos.enderecoLinha}>📍 {obra.endereco_obra}</Text>
          ) : null}

          {obra.descricao && (
            <>
              <Text style={estilos.secaoTitulo}>Descrição</Text>
              <Text style={estilos.descricao}>{obra.descricao}</Text>
            </>
          )}

          {midias.length > 0 ? (
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
          ) : obra?.status === 'encerrada' ? (
            <View style={estilos.avisoMidiaRemovida}>
              <Text style={estilos.avisoMidiaRemovidaIcone}>📷</Text>
              <Text style={estilos.avisoMidiaRemovidaTexto}>Mídia removida automaticamente após 7 dias da conclusão do serviço</Text>
            </View>
          ) : null}

          {temMatch && obra.expira_em && (
            <RelogioRegressivo
              expiraEm={obra.expira_em}
              onExpirar={handleExpirarMatch}
            />
          )}

          {/* Pós-match: endereço em destaque — o pintor precisa saber para onde ir */}
          {temMatch && obra.endereco_obra && !isDono ? (
            <View style={estilos.enderecoMatchBox}>
              <Text style={estilos.enderecoMatchLabel}>📍 Endereço do serviço:</Text>
              <Text style={estilos.enderecoMatchTexto}>{obra.endereco_obra}</Text>
            </View>
          ) : null}

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
              {obra.status === 'aberta' && !obra.match_usuario_id && (
                <TouchableOpacity
                  style={[{ backgroundColor: '#2a2200', borderWidth: 1, borderColor: '#E8833A', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 12 }, buscandoOrcamento && { opacity: 0.6 }]}
                  onPress={abrirModalEstender}
                  disabled={buscandoOrcamento}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#E8833A' }}>{buscandoOrcamento ? 'Carregando…' : '⏳ Aumentar prazo da obra'}</Text>
                </TouchableOpacity>
              )}
              <ModalEstenderPrazo
                visivel={modalEstender}
                extensaoMaximaHoras={orcamentoEstender}
                mensagemCap="Esta obra já está no prazo máximo permitido."
                onEstender={handleEstender}
                onFechar={() => setModalEstender(false)}
              />
              {temMatch && pintorMatch?.telefone && (
                <TouchableOpacity
                  style={estilos.btnWhatsApp}
                  onPress={() => abrirWhatsApp(pintorMatch.telefone)}
                >
                  <Text style={estilos.btnWhatsAppTexto}>💬 WhatsApp do pintor: {pintorMatch.telefone}</Text>
                </TouchableOpacity>
              )}
              {temMatch && obra?.status !== 'encerrada' && (
                <TouchableOpacity style={estilos.btnEncerrar} onPress={handleEncerrar}>
                  <Text style={estilos.btnEncerrarTexto}>✅ Confirmar conclusão — Encerrar obra</Text>
                </TouchableOpacity>
              )}
              {temMatch && obra.pedido_tempo_status === 'aguardando_tempo' && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>⚠️ Pintor precisa de mais tempo</Text>
                  <Text style={estilos.pedidoAlertaMotivo}>Motivo: {obra.pedido_tempo_motivo}</Text>
                  <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleperguntarTempo}>
                    <Text style={estilos.btnPerguntarTempoTexto}>⏱ Quanto tempo a mais você precisa?</Text>
                  </TouchableOpacity>
                </View>
              )}
              {temMatch && obra.pedido_tempo_status === 'aguardando_minutos' && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o pintor informar quantos minutos precisa...</Text>
                </View>
              )}
              {temMatch && obra.pedido_tempo_status === 'aguardando_aprovacao' && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>⏳ Pintor precisa de mais tempo</Text>
                  <Text style={estilos.pedidoAlertaMotivo}>Motivo: {obra.pedido_tempo_motivo}</Text>
                  <Text style={estilos.pedidoAlertaMinutos}>Tempo solicitado: {obra.pedido_tempo_minutos} minuto(s)</Text>
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
              <Text style={[estilos.secaoTitulo, { marginTop: 20 }]}>🎨 Pintores candidatos ({candidatos.length})</Text>
              {candidatos.length === 0 ? (
                <View style={estilos.vazioInteressados}>
                  <Text style={estilos.vazioInteressadosTexto}>Nenhum pintor demonstrou interesse ainda.{'\n'}Aguarde as notificações!</Text>
                </View>
              ) : (
                candidatos.map((item) => {
                  // Contato (telefone/endereço completo) só é liberado para o pintor MATCHED,
                  // não em 'aceito'. Deriva do match, não do status. (Novo contrato da API:
                  // telefone/logradouro voltam null até o pintor confirmar que está a caminho.)
                  const ehMatch = temMatch && item.usuario_id === obra.match_usuario_id
                  return (
                  <View key={item.id} style={estilos.interessadoCard}>
                    <View style={estilos.interessadoHeader}>
                      <Text style={estilos.interessadoNome}>{item.nome}</Text>
                      {!ehMatch && item.cidade && <Text style={estilos.interessadoCidade}>📍 {item.cidade}</Text>}
                      {ehMatch && item.logradouro && (
                        <Text style={estilos.interessadoCidade}>📍 {item.logradouro}{item.numero ? ', ' + item.numero : ''}{item.bairro ? ' — ' + item.bairro : ''} — {item.cidade}</Text>
                      )}
                    </View>
                    {item.avaliacoes_total > 0 ? (
                      <Text style={estilos.avaliacaoLinha}>
                        ⭐ {Number(item.avaliacoes_media).toFixed(1)} ({item.avaliacoes_total} {item.avaliacoes_total === 1 ? 'avaliação' : 'avaliações'})
                      </Text>
                    ) : (
                      <Text style={estilos.avaliacaoLinhaNovo}>🆕 Novo na plataforma</Text>
                    )}
                    {item.valor_proposto != null && (
                      <Text style={{ fontSize: 13, color: cores.textoMedio, marginBottom: 4 }}>
                        💰 Valor proposto: R$ {Number(item.valor_proposto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </Text>
                    )}
                    {item.valor_contraproposta != null && (
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
                        {contrapropostaCandidaturaId === item.id ? (
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
                                onPress={() => handleResponderCandidatura(item.id, 'contraproposta')}
                                disabled={enviandoResposta}
                              >
                                <Text style={estilos.btnAceitarTexto}>Enviar →</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[estilos.btnRecusar, { flex: 1 }]}
                                onPress={() => { setContrapropostaCandidaturaId(null); setValorContraproposta('') }}
                              >
                                <Text style={estilos.btnRecusarTexto}>Cancelar</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            <TouchableOpacity
                              style={[estilos.btnAceitar, { flex: 1 }]}
                              onPress={() => handleResponderCandidatura(item.id, 'aceitar')}
                              disabled={enviandoResposta}
                            >
                              <Text style={estilos.btnAceitarTexto}>✅ Aceitar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[estilos.btnRecusar, { flex: 1 }]}
                              onPress={() => handleResponderCandidatura(item.id, 'recusar')}
                              disabled={enviandoResposta}
                            >
                              <Text style={estilos.btnRecusarTexto}>❌ Recusar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ flex: 1, backgroundColor: '#2a2200', borderWidth: 1, borderColor: '#E8833A', borderRadius: raios.medio, padding: 10, alignItems: 'center' }}
                              onPress={() => setContrapropostaCandidaturaId(item.id)}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#E8833A' }}>💬 Contraproposta</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                    {item.status === 'contraproposta_dono' && (
                      <View style={{ marginTop: 8, padding: 8, backgroundColor: '#2a1a00', borderRadius: raios.medio }}>
                        <Text style={{ fontSize: 12, color: '#E8833A' }}>⏳ Aguardando resposta do pintor...</Text>
                      </View>
                    )}
                    {item.status === 'aceito' && !ehMatch && (
                      <View style={{ marginTop: 8, padding: 10, backgroundColor: '#0a1a0a', borderWidth: 1, borderColor: '#2a4a2a', borderRadius: raios.medio }}>
                        <Text style={{ fontSize: 13, color: '#4caf50', fontWeight: '600', marginBottom: 4 }}>⏳ Proposta aceita!</Text>
                        <Text style={{ fontSize: 12, color: cores.textoMedio, lineHeight: 18 }}>
                          O contato do pintor será liberado assim que ele confirmar que está a caminho.
                        </Text>
                      </View>
                    )}
                    {item.status === 'aceito' && ehMatch && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 12, color: '#4caf50', fontWeight: '600' }}>✅ Proposta aceita — pintor a caminho.</Text>
                      </View>
                    )}
                    {item.status === 'recusado' && (
                      <View style={{ marginTop: 8, padding: 8, backgroundColor: '#1a0a0a', borderRadius: raios.medio }}>
                        <Text style={{ fontSize: 12, color: '#f44336' }}>❌ Recusado</Text>
                      </View>
                    )}
                  </View>
                  )
                })
              )}
            </>
          )}

          {isPrestador && !isDono && (
            <>
              {souPintorDoMatch && obra?.status !== 'encerrada' && (
                <TouchableOpacity style={estilos.btnEncerrar} onPress={handleEncerrar}>
                  <Text style={estilos.btnEncerrarTexto}>✅ Serviço concluído — Encerrar</Text>
                </TouchableOpacity>
              )}
              {souPintorDoMatch && !obra.pedido_tempo_status && (
                <TouchableOpacity style={estilos.btnPedirTempo} onPress={handlePedirTempo}>
                  <Text style={estilos.btnPedirTempoTexto}>⚠️ Preciso de mais tempo para chegar</Text>
                </TouchableOpacity>
              )}
              {souPintorDoMatch && obra.pedido_tempo_status === 'aguardando_tempo' && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante responder sua solicitação...</Text>
                </View>
              )}
              {souPintorDoMatch && obra.pedido_tempo_status === 'aguardando_minutos' && (
                <TouchableOpacity style={estilos.btnInformarTempo} onPress={handleInformarTempo}>
                  <Text style={estilos.btnInformarTempoTexto}>⏱ Informar quantos minutos preciso</Text>
                </TouchableOpacity>
              )}
              {souPintorDoMatch && obra.pedido_tempo_status === 'aguardando_aprovacao' && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante aceitar os {obra.pedido_tempo_minutos} minuto(s) extra...</Text>
                </View>
              )}
              {!temMatch && (
                minhaCandidatura ? (
                  <View style={estilos.interesseFeito}>
                    {minhaCandidatura.status === 'pendente' && (
                      <>
                        <Text style={{ color: cores.primaria, fontWeight: '600', marginBottom: 6 }}>⏳ Aguardando resposta</Text>
                        <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20 }}>Suas informações foram enviadas. Aguarde a resposta do solicitante!</Text>
                      </>
                    )}
                    {minhaCandidatura.status === 'contraproposta_dono' && (
                      <>
                        <Text style={{ color: '#E8833A', fontWeight: '600', marginBottom: 6 }}>💬 O solicitante fez uma contraproposta!</Text>
                        {minhaCandidatura.valor_contraproposta != null && (
                          <Text style={{ fontSize: 18, fontWeight: '700', color: cores.sucesso, marginBottom: 12 }}>
                            R$ {Number(minhaCandidatura.valor_contraproposta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </Text>
                        )}
                        {mostrarContraPintor ? (
                          <View>
                            <TextInput
                              style={[estilos.input, { marginBottom: 8 }]}
                              placeholder="Sua contraproposta (ex: 350,00)"
                              placeholderTextColor={cores.textoMutado}
                              keyboardType="numeric"
                              value={valorContraPintor}
                              onChangeText={v => setValorContraPintor(mascararValor(v))}
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity style={[estilos.btnAceitar, { flex: 1 }]} onPress={() => handlePintorResponder('contraproposta', valorContraPintor)} disabled={enviandoResposta}>
                                <Text style={estilos.btnAceitarTexto}>Enviar →</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[estilos.btnRecusar, { flex: 1 }]} onPress={() => { setMostrarContraPintor(false); setValorContraPintor('') }}>
                                <Text style={estilos.btnRecusarTexto}>Cancelar</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                              <TouchableOpacity style={[estilos.btnAceitar, { flex: 1 }]} onPress={() => handlePintorResponder('aceitar')} disabled={enviandoResposta}>
                                <Text style={estilos.btnAceitarTexto}>✅ Aceitar</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[estilos.btnRecusar, { flex: 1 }]} onPress={() => handlePintorResponder('recusar')} disabled={enviandoResposta}>
                                <Text style={estilos.btnRecusarTexto}>❌ Recusar</Text>
                              </TouchableOpacity>
                            </View>
                          </>
                        )}
                      </>
                    )}
                    {(minhaCandidatura.status === 'aceito' || minhaCandidatura.status === 'aprovada') && (
                      <>
                        <Text style={{ color: '#4caf50', fontWeight: '600', marginBottom: 6 }}>✅ Proposta aceita!</Text>
                        <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20, marginBottom: 12 }}>Parabéns! Você foi selecionado. Confirme sua ida ao local:</Text>
                        <TouchableOpacity style={estilos.btnMatch} onPress={handleMatch}>
                          <Text style={estilos.btnMatchTexto}>🎨 Estou a caminho! Iniciar contagem →</Text>
                        </TouchableOpacity>
                        <Text style={estilos.avisoDeslocamento}>⚠️ Este cronômetro é apenas informativo para seu deslocamento. O prazo estabelecido pelo solicitante continua valendo independentemente.</Text>
                      </>
                    )}
                    {minhaCandidatura.status === 'recusado' && (
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
                    {Number(obra.valor || obra.valor_estimado || 0) > 0 && !valorProposto && (
                      <TouchableOpacity
                        style={valorAceito ? estilos.btnValorAceito : estilos.btnAceitarValorProposto}
                        onPress={() => setValorAceito(v => !v)}
                        disabled={enviando}
                      >
                        <Text style={valorAceito ? estilos.btnValorAceitoTexto : estilos.btnAceitarValorPropostoTexto}>
                          {valorAceito
                            ? `✅ Valor aceito (R$ ${Number((obra.valor || obra.valor_estimado)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
                            : `Aceitar o valor proposto (R$ ${Number((obra.valor || obra.valor_estimado)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
                          }
                        </Text>
                      </TouchableOpacity>
                    )}
                    {!valorAceito && (
                      <View style={estilos.perguntaWrap}>
                        <Text style={estilos.perguntaLabel}>FAZER UMA CONTRAPROPOSTA (opcional) – R$</Text>
                        <TextInput
                          style={estilos.input}
                          placeholder="Ex: 2.500,00"
                          placeholderTextColor={cores.textoMutado}
                          keyboardType="numeric"
                          value={valorProposto}
                          onChangeText={v => setValorProposto(mascararValor(v))}
                        />
                        <Text style={{ color: '#f44336', fontWeight: '700', fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                          ⚠️ Se você propuser outro valor, a obra ainda ficará disponível para outros pintores até que o solicitante aceite. Pense bem!
                        </Text>
                      </View>
                    )}
                    <PerguntaOpcoes label="⏱ Há quanto tempo realiza este tipo de serviço?" opcoes={['Menos de 1 ano', '1 a 3 anos', '3 a 5 anos', 'Mais de 5 anos']} valor={tempoExperiencia} onChange={setTempoExperiencia} />
                    <PerguntaOpcoes label="⚠️ Já enfrentou problemas com este tipo de serviço?" opcoes={['Nunca', 'Raramente', 'Algumas vezes']} valor={jaEnfrentouProblemas} onChange={setJaEnfrentouProblemas} />
                    <PerguntaOpcoes label="📋 Possui referências em obras de pintura?" opcoes={['Sim', 'Não', 'Tenho fotos de serviços']} valor={possuiReferencias} onChange={setPossuiReferencias} />
                    <PerguntaOpcoes label="🎨 Possui todos os materiais e equipamentos necessários?" opcoes={['Sim, todos', 'A maioria', 'Preciso de alguns']} valor={possuiFerramentas} onChange={setPossuiFerramentas} />
                    <View style={estilos.perguntaWrap}>
                      <Text style={estilos.perguntaLabel}>💡 Sugestão para melhorar o acabamento (opcional)</Text>
                      <TextInput style={estilos.textarea} placeholder="Ex: Recomendo usar tinta premium para maior durabilidade..." placeholderTextColor={cores.textoMutado} value={sugestaoDurabilidade} onChangeText={setSugestaoDurabilidade} multiline numberOfLines={3} />
                    </View>
                    <View style={estilos.perguntaWrap}>
                      <Text style={estilos.perguntaLabel}>💬 Mensagem adicional (opcional)</Text>
                      <TextInput style={estilos.textarea} placeholder="Alguma informação extra..." placeholderTextColor={cores.textoMutado} value={mensagemAdicional} onChangeText={setMensagemAdicional} multiline numberOfLines={3} />
                    </View>
                    <BotaoPrimario titulo="Enviar minhas informações →" onPress={handleInteresse} carregando={enviando} estilo={{ marginBottom: 10, marginTop: 8 }} />
                    <TouchableOpacity onPress={() => setMostrarForm(false)} style={{ alignItems: 'center', padding: 10 }}>
                      <Text style={{ color: cores.textoFraco, fontSize: 13 }}>Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <BotaoPrimario titulo="Tenho interesse nesta obra →" onPress={() => setMostrarForm(true)} />
                    <Text style={estilos.aviso}>Ao demonstrar interesse, suas informações profissionais serão enviadas ao solicitante.</Text>
                  </>
                )
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Avaliação pós-encerrar (dono). Mesma invocação de ContratosFinalizadosScreen. */}
      <ModalAvaliacao
        visivel={avaliarVisivel}
        nomeAvaliado={pintorMatch?.nome || 'o profissional'}
        onEnviar={enviarAvaliacaoEncerrar}
        onFechar={finalizarPosEncerrar}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espacos.tela, paddingVertical: 12 },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topbarTitulo: { fontSize: 14, color: cores.textoMedio, fontWeight: '500' },
  corpo: { paddingHorizontal: espacos.tela, paddingBottom: 40 },
  urgenciaBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1a1a2a', borderWidth: 1, borderColor: cores.primaria + '44', borderRadius: raios.grande, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12 },
  urgenciaTexto: { fontSize: 14, fontWeight: '700', color: cores.primaria },
  urgenciaHoras: { fontSize: 12, color: cores.primaria },
  valorDestaque: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.sucessoSuave, borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  valorDestaqueLabel: { fontSize: 10, color: cores.sucesso, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  valorDestaqueValor: { fontSize: 24, fontWeight: '700', color: cores.sucesso },
  // Pill de categoria: mesmo padrão tintado dos cards do feed (laranja sobre o
  // próprio tom), para a categoria não trocar de cor entre feed e detalhe.
  // O #444444 sobre #1A1A1A dava 1.79:1 — o mesmo par que o redesign do feed já
  // havia derrubado, e que sobreviveu aqui.
  // O tint é 1F e não o 2E do feed porque o fundo é outro: a pill vive dentro do
  // valorDestaque, cujo #5DC98A22 é TRANSLÚCIDO e compõe para #15231B sobre o
  // #0A0A0A da tela. Esse verde levanta a luminância da composição e come a
  // margem — com 2E o texto cairia para 4.55:1. Menos tint = pill mais escura =
  // mais contraste com o laranja claro: 1F dá 5.00:1 (AA pede 4.5:1).
  categoriaPill: { backgroundColor: cores.primaria + '1F', borderWidth: 0.5, borderColor: cores.primaria + '55', borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 4 },
  categoriaTexto: { fontSize: 11, color: cores.primaria, textTransform: 'capitalize' },
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, lineHeight: 28, marginBottom: 6 },
  local: { fontSize: 13, color: cores.textoFraco, marginBottom: 16 },
  enderecoLinha: { fontSize: 12, color: cores.textoFraco, marginTop: -10, marginBottom: 16, lineHeight: 17 },
  enderecoMatchBox: { backgroundColor: cores.primariaSuave, borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.medio, padding: 12, marginBottom: 12 },
  enderecoMatchLabel: { fontSize: 12, fontWeight: '700', color: cores.primaria, marginBottom: 4 },
  enderecoMatchTexto: { fontSize: 14, fontWeight: '600', color: cores.textoForte, lineHeight: 20 },
  localDistancia: { color: cores.primaria, fontWeight: '600' },
  secaoTitulo: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  descricao: { fontSize: 13, color: cores.textoMedio, lineHeight: 22, marginBottom: 20 },
  midiaItem: { width: 160, height: 120, marginRight: 10, borderRadius: 10, overflow: 'hidden' },
  midiaImagem: { width: '100%', height: '100%' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  avisoMidiaRemovida: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, marginBottom: 20 },
  avisoMidiaRemovidaIcone: { fontSize: 20 },
  avisoMidiaRemovidaTexto: { flex: 1, fontSize: 12, color: cores.textoFraco, lineHeight: 18 },
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
  avaliacaoLinha: { fontSize: 12, color: '#E8833A', fontWeight: '600', marginTop: 2 },
  avaliacaoLinhaNovo: { fontSize: 12, color: cores.textoMedio, marginTop: 2 },
  interessadoCidade: { fontSize: 11, color: cores.textoFraco },
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
  btnContraPintor: { marginTop: 8, borderRadius: raios.medio, padding: 11, alignItems: 'center', borderWidth: 1, borderColor: '#E8833A', backgroundColor: '#2a1f12' },
  btnContraPintorTexto: { fontSize: 13, fontWeight: '700', color: '#E8833A' },
  btnRecusar: { flex: 1, backgroundColor: '#3a1a1a', borderWidth: 1, borderColor: '#f44336', borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  btnRecusarTexto: { fontSize: 13, fontWeight: '700', color: '#f44336' },
  btnAceitarValorProposto: { backgroundColor: '#3a2a00', borderWidth: 1.5, borderColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnAceitarValorPropostoTexto: { fontSize: 14, fontWeight: '700', color: cores.primaria },
  btnValorAceito: { backgroundColor: '#1a3a1a', borderWidth: 1.5, borderColor: '#4caf50', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnValorAceitoTexto: { fontSize: 14, fontWeight: '700', color: '#4caf50' },
  avisoDeslocamento: { fontSize: 11, color: '#E8833A', textAlign: 'center', marginTop: 8, lineHeight: 16, paddingHorizontal: 8 },
})
