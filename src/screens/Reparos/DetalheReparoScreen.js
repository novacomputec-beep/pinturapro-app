import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  TouchableOpacity, ActivityIndicator, Alert, TextInput, Linking, Modal
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useFocusEffect } from '@react-navigation/native'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { celebracaoRef } from '../../components/CelebracaoMatchHost'
import ModalEstenderPrazo from '../../components/ModalEstenderPrazo'
import ModalAvaliacao from '../../components/ModalAvaliacao'
import { comRetry, ehContaSuspensa, ehProfissionalSuspenso } from '../../utils/rede'
import { cores, espacos, raios } from '../../utils/tema'
import { distanciaItemKm, formatarDistancia, useCoordsUsuario } from '../../utils/distancia'
import { avatar, media, full } from '../../utils/imagemOtimizada'
import { thumbnailDeCapa, FRAME_TILE_DETALHE } from '../../utils/thumbnail'
import { emojiReparo } from '../../utils/categorias'

// Tile da tira "Fotos e vídeos". Componente próprio, e fora da tela (mesmo motivo do
// CardReparo no feed), porque cada tile precisa do SEU estado de falha: um item
// quebrado não pode derrubar os vizinhos, e um useState por tile é impossível dentro
// do .map da tela.
const TileMidia = ({ midia, emoji, onPress }) => {
  // Rede de segurança do thumbnail, igual à dos cards do feed: a mídia pode não
  // renderizar (URL quebrada, arquivo já removido, transformação recusada pelo
  // Cloudinary). Sem isto o <Image> deixava um retângulo preto; assim cai no emoji
  // da categoria, que é o mesmo placeholder que o feed mostra para o mesmo item.
  const [falhou, setFalhou] = useState(false)
  const ehVideo = midia.tipo === 'video'
  // O <Image> do RN não decodifica vídeo: passar o .mp4 cru aqui (o que esta tela
  // fazia) só podia dar tile preto, porque media() devolve a URL INTACTA quando não
  // encontra /image/upload/ — ela existe justamente supondo que o vídeo já virou
  // frame antes. thumbnailDeCapa é quem faz essa conversão, no recorte do tile.
  const uri = ehVideo ? thumbnailDeCapa(midia.url, FRAME_TILE_DETALHE) : media(midia.url)
  return (
    <TouchableOpacity style={estilos.midiaItem} onPress={onPress} activeOpacity={0.7}>
      {uri && !falhou ? (
        <Image source={{ uri }} style={estilos.midiaImagem} resizeMode="cover" onError={() => setFalhou(true)} />
      ) : (
        <View style={[estilos.midiaImagem, estilos.midiaVazia]}>
          <Text style={estilos.midiaVaziaIcone}>{emoji}</Text>
        </View>
      )}
      {/* O ▶ fica mesmo sobre o placeholder: o item continua sendo um vídeo e o toque
          continua abrindo o player, que lê a URL original e independe deste frame. */}
      {ehVideo && (
        <View style={estilos.videoOverlay}>
          <Text style={{ fontSize: 32, color: 'white' }}>▶</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

// Trunca para as unidades mais significativas, com granularidade decrescente:
//   ≥ 1 dia  → "19 dias 7h 25m"
//   ≥ 1 hora → "7h 25m"
//   ≥ 1 min  → "25m"
//   < 1 min  → "menos de 1 min"
// Estava inline no contador da lista; virou função de módulo para o RelogioRegressivo
// usar a MESMA regra. Ele formatava hh:mm:ss com a hora acumulada, e um prazo de uma
// semana aparecia como "167:45:46" — um número que ninguém lê como prazo.
// Segundos saíram de TODAS as faixas: um prazo medido em horas não se decide no
// segundo, e o dígito piscando puxava o olho para o único número que não importa.
// O último minuto não vira "0m" (que se lê como esgotado, e não é): vira uma frase.
const formatarTempoRestante = ({ d, h, m }) => {
  const pad = (n) => String(n).padStart(2, '0')
  if (d > 0) return `${d} dia${d > 1 ? 's' : ''}${h > 0 ? ` ${h}h` : ''}${m > 0 ? ` ${m}m` : ''}`
  if (h > 0) return `${h}h ${pad(m)}m`
  if (m > 0) return `${m}m`
  return 'menos de 1 min'
}

// Janelas de chegada oferecidas ao profissional depois que sua proposta é aceita. O
// rótulo aqui é só o que ELE lê; quem converte a janela num instante é o servidor, que
// devolve chegada_prevista_em. Nada nesta lista vira horário no aparelho.
const JANELAS_CHEGADA = [
  { id: 'hoje',         label: '🕐 Ainda hoje' },
  { id: 'amanha_manha', label: '🌅 Amanhã de manhã' },
  { id: 'amanha_tarde', label: '🌇 Amanhã à tarde' },
]

// Chegada prometida, SEMPRE derivada do timestamp que o servidor calculou — nunca do
// rótulo da janela escolhida. O rótulo é o pedido ("amanhã de manhã"); o timestamp é o
// compromisso, e é ele que o dono precisa ler. Data ausente/ilegível devolve null e o
// bloco inteiro some, em vez de imprimir "Invalid Date".
// Comparação por meia-noite LOCAL, não por diferença de 24h: às 23h de hoje, um horário
// das 8h de amanhã dista 9h e mesmo assim é "amanhã".
const formatarChegadaPrevista = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const meiaNoite = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dias = Math.round((meiaNoite(d) - meiaNoite(new Date())) / 86400000)
  if (dias === 0) return `hoje às ${hora}`
  if (dias === 1) return `amanhã às ${hora}`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} às ${hora}`
}

// Texto de exibição de um instante de chegada: o formato amigável quando a data dá para
// ler, e o valor CRU quando não dá. Antes os blocos eram condicionados ao retorno de
// formatarChegadaPrevista, que é null em data ilegível — e aí sumia o bloco inteiro,
// junto com o único controle da tela (o dono ficava sem os botões de aceitar/recusar, e
// o encerrar continuava travado sem nada explicando por quê). Um texto feio é melhor do
// que um sumiço: quem lê vê que existe um horário, mesmo que mal formatado.
const textoChegada = (iso) => (iso ? (formatarChegadaPrevista(iso) || String(iso)) : null)

// Suspensão interrompe a ação, e o motivo é do servidor: mostramos a mensagem DELE, que
// diz o que houve e o que fazer, em vez do "Erro" genérico — ou, pior, do texto de falha
// de conexão que a resposta 403 recebia antes da correção em api.js.
// Devolve true quando já alertou; ao chamador basta sair do catch.
const alertouSuspensao = (err) => {
  if (ehContaSuspensa(err)) {
    Alert.alert('Conta suspensa', err.mensagem || 'Sua conta está suspensa e esta ação não está disponível.')
    return true
  }
  if (ehProfissionalSuspenso(err)) {
    Alert.alert('Profissional suspenso', err.mensagem || 'Este profissional está suspenso e a proposta não pode ser aceita.')
    return true
  }
  return false
}

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
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRestante({ d, h, m, s })
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiraEm])

  if (!restante) {
    return <Text style={{ fontSize: 12, color: '#f44336', fontWeight: '700' }}>EXPIRADO</Text>
  }

  const { d, h, m } = restante
  const texto = `Expira em: ${formatarTempoRestante(restante)}`
  const urgente = d === 0 && h === 0 && m < 10
  return <Text style={{ fontSize: 12, color: '#f44336', fontWeight: urgente ? '700' : '500' }}>{texto}</Text>
}

// Iniciais para o avatar-placeholder do candidato (mesmo padrão de PerfilScreen/feed).
const iniciaisDe = (nome) =>
  (nome || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'

// Rótulo humano da experiência. O cadastro grava anos_experiencia como INTEIRO (parseInt),
// mas a API pode devolver um bucket ("menos_1_ano"/"1_a_3"/"3_a_5"/"mais_5"); tratamos ambos.
const EXPERIENCIA_LABELS = {
  menos_1_ano: 'Menos de 1 ano',
  '1_a_3': '1 a 3 anos',
  '3_a_5': '3 a 5 anos',
  mais_5: 'Mais de 5 anos',
  mais_5_anos: 'Mais de 5 anos',
}
const formatarExperiencia = (v) => {
  if (v == null || v === '') return null
  const s = String(v).trim()
  if (/^\d+$/.test(s)) {                                  // inteiro: "N anos de experiência"
    const n = Number(s)
    return n > 0 ? `${n} ${n === 1 ? 'ano' : 'anos'} de experiência` : null
  }
  return EXPERIENCIA_LABELS[s] || s.replace(/_/g, ' ')    // bucket conhecido, ou fallback limpo
}

// especialidades pode vir como array (cadastro) ou CSV; normaliza para "a, b, c".
const especialidadesTexto = (esp) => {
  const arr = Array.isArray(esp) ? esp : (typeof esp === 'string' ? esp.split(',') : [])
  const limpos = arr.map(s => String(s).trim()).filter(Boolean)
  return limpos.length ? limpos.join(', ') : null
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

// Pós-match: conta até o alvo que o CHAMADOR escolhe — chegada_prevista_em quando o
// profissional prometeu um horário, senão expira_em. Sem promessa, o comportamento é o
// de sempre: expira_em é o deadline (o MESMO prazo do contador pré-match), tornando a
// contagem contínua através do match — o prestador vê o tempo que RESTAVA no Rol, não
// uma janela nova de match_feito_em + prazo. match_feito_em segue usado noutros lugares
// (ordenação, "aceitou há X min"), mas não para esta contagem.
// onExpirar é OPCIONAL de propósito: só o alvo expira_em representa o fim do prazo do
// reparo, então só ele pode disparar /expirar-match. Ver a nota no ponto de render.
const RelogioRegressivo = ({ expiraEm, onExpirar }) => {
  const [restante, setRestante] = useState(null)
  const [expirou, setExpirou] = useState(false)
  const expirouRef = React.useRef(false)

  useEffect(() => {
    expirouRef.current = false
    const calcular = () => {
      const fim = new Date(expiraEm)
      const agora = new Date()
      const diff = fim - agora
      if (diff <= 0) {
        setRestante({ d: 0, h: 0, m: 0, s: 0 })
        if (!expirouRef.current) {
          expirouRef.current = true
          setExpirou(true)
          if (onExpirar) onExpirar()
        }
        return
      }
      // Dias separados das horas (antes a hora era acumulada, daí o "167:45:46").
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRestante({ d, h, m, s })
    }
    calcular()
    const interval = setInterval(calcular, 1000)
    return () => clearInterval(interval)
  }, [expiraEm])

  // Mesmo limiar de antes — o "00:" inicial só era verdade abaixo de 1 hora —, agora
  // lido dos campos em vez do texto, que não é mais hh:mm:ss.
  const urgente = !!restante && restante.d === 0 && restante.h === 0
  const tempo = restante ? formatarTempoRestante(restante) : ''
  return (
    <View style={[estilos.relogioBox, expirou && estilos.relogioExpirado]}>
      <Text style={estilos.relogioLabel}>{expirou ? '⏰ TEMPO ESGOTADO' : '⏱ TEMPO RESTANTE'}</Text>
      {/* Esgotado NÃO mostra tempo: zerado, o formatador devolve "menos de 1 min", que
          contradiz o rótulo — e mesmo um "0m" só repetiria o que ESGOTADO já diz. */}
      {!expirou && <Text style={[estilos.relogioTempo, urgente && { color: '#f44336' }]}>{tempo}</Text>}
      {!expirou && <Text style={estilos.relogioSub}>O profissional deve chegar dentro deste prazo</Text>}
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
  const [mostrarContraPrestador, setMostrarContraPrestador] = useState(false)
  const [valorContraPrestador, setValorContraPrestador] = useState('')
  const [enviandoResposta, setEnviandoResposta] = useState(false)
  const [encerrando, setEncerrando] = useState(false)
  const [avaliarVisivel, setAvaliarVisivel] = useState(false)
  const [modalTempo, setModalTempo] = useState(false)
  const [minutosTempo, setMinutosTempo] = useState('')
  const [modalEstender, setModalEstender] = useState(false)
  const [estendendo, setEstendendo] = useState(false)
  // Guarda a janela EM VOO (o id, não um boolean): trava as três opções de uma vez e
  // ainda permite marcar qual delas está sendo enviada.
  const [enviandoJanela, setEnviandoJanela] = useState(null)
  const [respondendoChegada, setRespondendoChegada] = useState(false)
  const [declarandoChegada, setDeclarandoChegada] = useState(false)
  // Janela de espera entre extensões: o detalhe pode devolver pode_estender_em, o
  // instante a partir do qual uma nova extensão passa a ser aceita. Enquanto for
  // futuro nem vale abrir o modal — o envio só voltaria recusado.
  const [agora, setAgora] = useState(() => Date.now())
  const [coords] = useCoordsUsuario()
  const mountedRef = useRef(true)
  // Após o match, mantém a contagem na tela por ~2 min e então devolve a aba "Meus Reparos"
  // (ou o feed) à lista, liberando o reparador para navegar/aceitar outros serviços.
  const autoRetornoRef = useRef(null)
  useEffect(() => () => { if (autoRetornoRef.current) clearTimeout(autoRetornoRef.current) }, [])

  // Ausente/null (ou data ilegível vinda da API) cai no NaN e é tratado como "sem
  // espera": o botão segue como sempre foi, em vez de travar por um campo que não deu
  // para ler. Passado também libera — só o futuro segura.
  const liberaEstenderEm = reparo.pode_estender_em ? new Date(reparo.pode_estender_em).getTime() : NaN
  const emEsperaEstender = Number.isFinite(liberaEstenderEm) && liberaEstenderEm > agora
  // Arredonda para cima e nunca mostra "0 min": faltando 10s ainda é 1 minuto de espera.
  const minutosEsperaEstender = emEsperaEstender ? Math.max(1, Math.ceil((liberaEstenderEm - agora) / 60000)) : 0

  // O relógio só existe enquanto a espera existe: ao vencer, este efeito faz o último
  // setAgora, o botão reabre e o intervalo é descartado. 30s bastam para um rótulo em
  // minutos e evitam re-renderizar o detalhe inteiro a cada segundo (os contadores de
  // expiração têm relógio próprio, isolados em seus componentes, justamente por isso).
  useEffect(() => {
    if (!emEsperaEstender) return
    const id = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(id)
  }, [emEsperaEstender, liberaEstenderEm])

  const mascararValor = (v) => {
    const nums = v.replace(/\D/g, '')
    if (!nums) return ''
    const centavos = Math.min(parseInt(nums, 10), 9999999999)
    const reaisStr = Math.floor(centavos / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${reaisStr},${String(centavos % 100).padStart(2, '0')}`
  }

  // Ids podem chegar como número ou string conforme o endpoint; compara em String para não
  // errar o lado por diferença de tipo (mesmo padrão de ContratosScreen.js:74). Os testes
  // != null vêm ANTES porque String(undefined) === String(undefined) daria "igual" — dois
  // ids ausentes (deep-link que só passa { id }, antes do buscar()) não podem casar.
  const isDono = usuario?.id != null && reparo?.criado_por != null &&
    String(usuario.id) === String(reparo.criado_por)
  const isPrestador = usuario?.role === 'prestador' || usuario?.role === 'assinante'

  useEffect(() => {
    mountedRef.current = true
    buscar()
    // Arma a proximidade (redesign): ao ABRIR o detalhe, o reparador sinaliza ao servidor
    // que viu este reparo. O servidor arma a notificação se o reparo estiver a >5km do
    // endereço de cadastro dele; a aproximação (<5km) é detectada depois via
    // checar-proximidade / cron. Fire-and-forget, uma vez por reparo aberto, e só para o
    // reparador vendo reparo de OUTRO (o dono do próprio reparo não arma). Idempotente no
    // servidor (ON CONFLICT DO NOTHING), então uma falha silenciosa é inócua.
    if (isPrestador && !isDono) {
      api.post(`/reparos/${reparoInicial.id}/abertura`).catch(() => {})
    }
    return () => { mountedRef.current = false }
  }, [reparoInicial.id])

  // Refetch silencioso ao reganhar foco: garante que uma contraproposta do dono
  // (ou mudança de status) apareça mesmo se o prestador já estava nesta tela.
  useFocusEffect(
    React.useCallback(() => {
      if (reparoInicial?.id) buscar()
    }, [reparoInicial?.id])
  )

  const buscar = async () => {
    try {
      const resposta = await comRetry(() => api.get(`/reparos/${reparoInicial.id}`))
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
      await comRetry(() => api.post(`/reparos/${reparo.id}/interesse`, { mensagem, valor_proposto: valorNumerico }))
      setMeuInteresse({ status: 'pendente' })
      setMostrarForm(false)
      Alert.alert('✅ Interesse registrado!', 'O solicitante receberá suas informações e entrará em contato se tiver interesse.', [{ text: 'OK', onPress: () => navigation.goBack() }])
    } catch (err) {
      console.log('[DetalheReparo] falha ao registrar interesse | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      // Suspenso: sai antes da reconsulta — não há interesse novo a descobrir, e o
      // motivo real precisa aparecer no lugar do "não foi possível registrar".
      if (alertouSuspensao(err)) return
      // A 1ª tentativa pode ter sido aceita no servidor mas a resposta se perdeu (troca
      // de rede), ou o retry recebeu 409 "já demonstrou interesse". Reconsulta: se o
      // interesse já existir para este usuário, trata como sucesso em vez de erro confuso.
      try {
        const atual = await api.get(`/reparos/${reparo.id}`)
        if (atual?.meu_interesse) {
          setMeuInteresse(atual.meu_interesse)
          setMostrarForm(false)
          Alert.alert('✅ Interesse registrado!', 'O solicitante receberá suas informações e entrará em contato se tiver interesse.', [{ text: 'OK', onPress: () => navigation.goBack() }])
          return
        }
      } catch (e2) { console.log('[DetalheReparo] reconsulta pós-interesse falhou | code:', e2.code) }
      Alert.alert('Erro', err.mensagem || 'Não foi possível registrar seu interesse.')
    } finally {
      setEnviando(false)
    }
  }

  // Janela de chegada: o profissional promete QUANDO chega, antes de partir. Grava um
  // ESTADO (a mesma janela duas vezes dá o mesmo resultado) e não cria recurso novo, que
  // é exatamente o caso do { timeout: true } descrito em rede.js:16-19 — o socket ocioso
  // que trava até o timeout de 30 s é o mesmo evento do ERR_NETWORK e merece o retry.
  // { servidor } fica FORA: um 5xx prova que a requisição chegou.
  const handleEscolherJanela = async (janela) => {
    if (enviandoJanela) return
    setEnviandoJanela(janela)
    try {
      const resp = await comRetry(() => api.post(`/reparos/${reparo.id}/chegada-prevista`, { janela }), { timeout: true, persistir: true })
      // O horário exibido vem SEMPRE do servidor. Se a resposta não trouxer o campo,
      // buscar() reidrata o reparo — em nenhuma hipótese derivamos um instante do
      // rótulo escolhido aqui, que é um pedido ("amanhã de manhã"), não um horário.
      if (resp?.chegada_prevista_em) {
        if (mountedRef.current) setReparo(prev => ({ ...prev, chegada_prevista_em: resp.chegada_prevista_em }))
      } else {
        await buscar()
      }
    } catch (err) {
      console.log('[DetalheReparo] falha ao informar chegada prevista | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (alertouSuspensao(err)) return
      Alert.alert('Erro', err.mensagem || 'Não foi possível informar sua previsão de chegada.')
    } finally {
      if (mountedRef.current) setEnviandoJanela(null)
    }
  }

  // Resposta do DONO à janela proposta. Vai de comRetry SEM { timeout }, ao contrário do
  // envio da janela: isto é uma RESPOSTA DE NEGOCIAÇÃO, o caso que rede.js:20-22 manda
  // deixar de fora — o servidor pode ter processado a 1ª tentativa e o retry duplicaria
  // o efeito. Só o ERR_NETWORK duro, onde a requisição não chegou, é reexecutado.
  // Mesmo tratamento de handleResponderTempo, a negociação vizinha.
  const handleResponderChegada = async (aceito) => {
    if (respondendoChegada) return
    setRespondendoChegada(true)
    try {
      await comRetry(() => api.post(`/reparos/${reparo.id}/chegada-prevista/responder`, { aceito }))
      // buscar() em vez de remendar o estado local: é o servidor que decide se a
      // pendente vira combinada ou simplesmente some, e a tela toda depende disso.
      await buscar()
    } catch (err) {
      console.log('[DetalheReparo] falha ao responder chegada prevista | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert('Erro', err.mensagem || 'Não foi possível responder.')
    } finally {
      if (mountedRef.current) setRespondendoChegada(false)
    }
  }

  // Chegada ao local. UM endpoint para os DOIS lados: quem toca primeiro declara, e o
  // toque do dono sobre uma declaração existente vale como confirmação. Quem distingue os
  // papéis é o servidor, pelo usuário autenticado — o app só anuncia o fato.
  // { timeout: true } aqui, ao contrário de handleResponderChegada: isto não move nada
  // acumulável, só registra que a chegada aconteceu. Reexecutar grava o mesmo fato, então
  // a ressalva de rede.js:20-22 (o retry duplicaria o efeito) não se aplica — o caso é o
  // da mutação de ESTADO de rede.js:16-19. { servidor } fora: um 5xx prova que chegou.
  const handleChegada = async () => {
    if (declarandoChegada) return
    setDeclarandoChegada(true)
    try {
      await comRetry(() => api.post(`/reparos/${reparo.id}/chegada`, {}), { timeout: true, persistir: true })
      // buscar() porque o mesmo toque produz estados diferentes conforme quem tocou:
      // declarada, ou declarada + confirmada. Quem sabe qual saiu é o servidor.
      await buscar()
    } catch (err) {
      console.log('[DetalheReparo] falha ao registrar chegada | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (alertouSuspensao(err)) return
      Alert.alert('Erro', err.mensagem || 'Não foi possível registrar a chegada.')
    } finally {
      if (mountedRef.current) setDeclarandoChegada(false)
    }
  }

  const handleMatch = async () => {
    const MSG_SUCESSO = 'O solicitante foi notificado. Dirija-se ao local!\n\nUm contrato simples, de prestação de serviços, foi enviado para seu e-mail e também para a outra parte. Vocês podem ou não utilizar e assinar, é facultativo para tarefas simples. Contudo, se quiserem se proteger, basta utilizá-lo. Imprima e assinem.\n\nBom trabalho para vocês! 🤝'
    const aplicarSucesso = (matchFeitoEm) => {
      setReparo(prev => ({ ...prev, match_feito_em: matchFeitoEm || prev.match_feito_em || new Date().toISOString(), match_usuario_id: usuario.id }))
      Alert.alert('✅ Confirmado!', MSG_SUCESSO)
      // Auto-retorno à lista após ~2 min. A contagem (RelogioRegressivo) deriva de
      // match_feito_em — segue valendo e reaparece se o reparo for reaberto; nada é parado.
      if (autoRetornoRef.current) clearTimeout(autoRetornoRef.current)
      autoRetornoRef.current = setTimeout(() => {
        if (mountedRef.current && navigation.canGoBack()) navigation.popToTop()
      }, 120000)
    }
    Alert.alert('🔧 Confirmar ida ao local?', 'Ao confirmar, o solicitante será notificado e a contagem regressiva será iniciada.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => {
        try {
          // { persistir } sem { timeout }: só o ERR_NETWORK duro insiste por 45 s. A
          // variante que trava fica de fora porque o match não é idempotente de fato —
          // repetido sobre um match já gravado, o servidor responde 409, que é 4xx e
          // nunca reexecuta. Quem transforma esse 409 em sucesso é a reconsulta abaixo.
          const resposta = await comRetry(() => api.post(`/reparos/${reparo.id}/match`, {}), { persistir: true })
          aplicarSucesso(resposta.match_feito_em)
        } catch (err) {
          console.log('[DetalheReparo] falha ao confirmar match | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
          // Antes da reconsulta: suspenso, o match não saiu, e insistir só trocaria o
          // motivo verdadeiro por um "não foi possível confirmar".
          if (alertouSuspensao(err)) return
          // A 1ª tentativa pode ter dado certo no servidor mas a resposta se perdeu
          // (troca de rede), ou o retry recebeu 409 "já tem prestador". Reconsulta:
          // se o match já for deste prestador, trata como sucesso em vez de erro confuso.
          try {
            const atual = await api.get(`/reparos/${reparo.id}`)
            // Comparação em String como em prestadorMatch/souPrestadorDoMatch (:860, :873): o
            // id vem número ou string conforme o endpoint, e com === o match que DEU certo era
            // lido como de outro prestador — a reconsulta não salvava nada e o alerta de erro
            // subia mesmo assim. Os != null vêm antes porque dois ids ausentes casariam.
            const matchId = atual?.reparo?.match_usuario_id
            if (matchId != null && usuario?.id != null && String(matchId) === String(usuario.id)) { aplicarSucesso(atual.reparo.match_feito_em); return }
          } catch (e2) { console.log('[DetalheReparo] reconsulta pós-match falhou | code:', e2.code) }
          Alert.alert('Erro', err.mensagem || 'Não foi possível confirmar.')
        }
      }}
    ])
  }

  const handleEncerrar = async () => {
    // 2º ponto de entrada da avaliação (o 1º é Contratos Finalizados). Em vez de
    // voltar direto à lista, abre o ModalAvaliacao para o dono avaliar o prestador.
    const concluirComSucesso = () => {
      if (mountedRef.current) setReparo(prev => ({ ...prev, status: 'encerrada' }))
      buscar()
      if (mountedRef.current) setAvaliarVisivel(true)
    }
    // Pedido registrado, mas o reparo NÃO fechou: não mexe no status local e não abre o
    // ModalAvaliacao — avaliar só faz sentido depois que a outra parte confirmar. buscar()
    // reidrata encerramento_solicitado_por/_em, que trocam o rótulo do botão.
    const aguardarOutraParte = () => {
      buscar()
      Alert.alert('⏳ Aguardando a outra parte', 'Seu pedido de encerramento foi registrado. O reparo será concluído quando a outra parte confirmar.')
    }
    const executar = async () => {
      try {
        const resp = await comRetry(() => api.post(`/reparos/${reparo.id}/encerrar`, {}))
        if (resp?.encerramento === 'pendente') { aguardarOutraParte(); return }
        concluirComSucesso()
      } catch (err) {
        console.log('[DetalheReparo] falha ao encerrar reparo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
        // Mesmo tratamento de handleEncerrarPrestador: a 1ª tentativa pode ter sido aceita
        // no servidor e só a resposta se perdeu (troca de rede). Reconsulta antes de acusar
        // erro — se o reparo já está encerrado, segue como sucesso e o ModalAvaliacao abre,
        // em vez de deixar o dono sem o 2º ponto de entrada da avaliação.
        try {
          const atual = await api.get(`/reparos/${reparo.id}`)
          if (atual?.reparo?.status === 'encerrada') { concluirComSucesso(); return }
          // O pedido pode ter sido registrado e só a resposta se perdeu: idem, é sucesso.
          if (atual?.reparo?.encerramento_solicitado_por != null) { aguardarOutraParte(); return }
        } catch (e2) { console.log('[DetalheReparo] reconsulta pós-encerrar (dono) falhou | code:', e2.code) }
        const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
        if (isNetwork) {
          Alert.alert('Erro de conexão', 'Não foi possível encerrar. Verifique sua conexão.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.', [
            { text: 'Tentar novamente', onPress: executar },
            { text: 'Cancelar', style: 'cancel' },
          ])
        } else {
          Alert.alert('Erro', err.mensagem || 'Não foi possível encerrar.')
        }
      }
    }
    Alert.alert('✅ Encerrar reparo?', 'Confirme que o serviço foi concluído.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar', onPress: executar },
    ])
  }

  // Pós-encerrar (fluxo do dono). Avaliar é OPCIONAL: pular (onFechar) conclui o
  // encerramento normalmente, voltando à lista. Se avaliar, reusa EXATAMENTE a invocação
  // de ContratosFinalizadosScreen.handleEnviarAvaliacao (POST /avaliacoes com
  // contrato_tipo/contrato_id) e, em seguida, oferece o bloqueio do prestador — mesma ação
  // do card (POST /usuarios/bloquear-prestador). A UNIQUE(contrato_tipo,contrato_id,
  // avaliador_id) do servidor já barra avaliação dupla se ele já avaliou por outro caminho.
  const finalizarPosEncerrar = () => {
    setAvaliarVisivel(false)
    if (navigation.canGoBack()) navigation.goBack()
  }

  const oferecerBloqueioEncerrar = () => {
    setAvaliarVisivel(false)
    const prestadorId = reparo.match_usuario_id
    if (!prestadorId) { finalizarPosEncerrar(); return }
    Alert.alert(
      'Bloquear para futuros serviços?',
      'Você pode impedir que este profissional seja pareado com você novamente. É opcional.',
      [
        { text: 'Não, fiquei satisfeito(a)', style: 'cancel', onPress: finalizarPosEncerrar },
        { text: 'Bloquear', style: 'destructive', onPress: async () => {
          // { timeout: true }: bloquear é IDEMPOTENTE (grava um estado, não cria
          // recurso). Um socket ocioso morto também se manifesta como timeout de
          // 30 s, e aqui isso é caro: o fluxo segue para finalizarPosEncerrar() e a
          // pessoa sai da tela achando que bloqueou. { servidor } fica fora — 5xx
          // significa que a requisição chegou.
          try { await comRetry(() => api.post('/usuarios/bloquear-prestador', { prestador_id: prestadorId }), { timeout: true, persistir: true }) }
          catch (err) {
            console.log('[DetalheReparo] falha ao bloquear prestador | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
            // Antes falhava calado: quem tocou "Bloquear" saía da tela achando que tinha
            // bloqueado. O alerta sobe antes do goBack e sobrevive à navegação.
            Alert.alert('Erro', err.mensagem || 'Não foi possível bloquear o profissional.')
          }
          finalizarPosEncerrar()
        } },
      ],
    )
  }

  const enviarAvaliacaoEncerrar = async (estrelas) => {
    try {
      await comRetry(() => api.post('/avaliacoes', { contrato_tipo: 'reparo', contrato_id: reparo.id, estrelas }))
    } catch (err) {
      console.log('[DetalheReparo] falha ao enviar avaliação | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert('Erro', err?.mensagem || 'Não foi possível enviar a avaliação. Tente novamente.')
    }
    // Avaliação enviada (ou falha tratada) → oferece bloqueio e conclui. Opcional em ambos.
    oferecerBloqueioEncerrar()
  }

  // Encerramento pelo PRESTADOR (reparador). Separado do handleEncerrar do dono para não
  // alterar o fluxo do dono_reparo. Usa comRetry (build 70) porque o ERR_NETWORK repetido
  // forçava o prestador a tocar várias vezes; o endpoint /encerrar é idempotente no servidor
  // (apenas seta status='encerrada'), então é seguro reexecutar.
  const handleEncerrarPrestador = () => {
    // Pós-sucesso: atualiza o estado local (o reparo sai imediatamente de "ativos" — o feed
    // e Meus Reparos refazem a busca ao focar) e leva o prestador aos Contratos Finalizados,
    // onde o reparo encerrado passa a aparecer — sem precisar reiniciar o app.
    const concluirComSucesso = () => {
      if (mountedRef.current) setReparo(prev => ({ ...prev, status: 'encerrada', status_aprovacao: 'encerrada' }))
      Alert.alert('✅ Serviço encerrado!', 'O reparo foi concluído com sucesso e movido para Contratos Finalizados.', [
        { text: 'OK', onPress: () => navigation.navigate('Contratos Finalizados') },
      ])
    }
    // Pedido registrado sem fechar o reparo: nada de status local nem de navegar para
    // Contratos Finalizados — o reparo ainda não está lá.
    const aguardarOutraParte = () => {
      buscar()
      Alert.alert('⏳ Aguardando a outra parte', 'Seu pedido de encerramento foi registrado. O reparo será concluído quando o solicitante confirmar.')
    }
    const executar = async () => {
      if (encerrando) return
      setEncerrando(true)
      try {
        const resp = await comRetry(() => api.post(`/reparos/${reparo.id}/encerrar`, {}))
        if (resp?.encerramento === 'pendente') { aguardarOutraParte(); return }
        concluirComSucesso()
      } catch (err) {
        console.log('[DetalheReparo] falha ao encerrar (prestador) | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
        if (alertouSuspensao(err)) return
        // A 1ª tentativa pode ter sido aceita no servidor mas a resposta se perdeu (troca de
        // rede). Reconsulta: se o reparo já estiver encerrado, trata como sucesso — mesmo
        // padrão de handleMatch/handleInteresse.
        try {
          const atual = await api.get(`/reparos/${reparo.id}`)
          if (atual?.reparo?.status === 'encerrada') { concluirComSucesso(); return }
          if (atual?.reparo?.encerramento_solicitado_por != null) { aguardarOutraParte(); return }
        } catch (e2) { console.log('[DetalheReparo] reconsulta pós-encerrar falhou | code:', e2.code) }
        const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
        if (isNetwork) {
          Alert.alert('Erro de conexão', 'Não foi possível encerrar. Verifique sua conexão.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.', [
            { text: 'Tentar novamente', onPress: executar },
            { text: 'Cancelar', style: 'cancel' },
          ])
        } else {
          Alert.alert('Erro', err.mensagem || 'Não foi possível encerrar.')
        }
      } finally {
        if (mountedRef.current) setEncerrando(false)
      }
    }
    Alert.alert('✅ Encerrar serviço?', 'Confirme que o serviço foi concluído. O solicitante será notificado.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar', onPress: executar },
    ])
  }

  const handleExpirarMatch = async () => {
    try {
      await comRetry(() => api.post(`/reparos/${reparo.id}/expirar-match`, {}))
      setReparo(prev => ({ ...prev, match_feito_em: null, match_usuario_id: null, pedido_tempo_status: null }))
      Alert.alert('⏰ Tempo esgotado', 'O profissional não chegou a tempo. O reparo está disponível novamente.')
    } catch (err) { console.log('Erro ao expirar match:', err) }
  }

  // Aumentar prazo (dono do reparo). Espelha o padrão de handleResponderInteresse:
  // comRetry + flag de loading + buscar() para refresh + ramo ERR_NETWORK. Após sucesso,
  // buscar() (refresh de mutação já usado por esta tela, NÃO um refetch de mount) reidrata
  // expira_em e a contagem reinicia via o efeito [expiraEm]. Erros documentados da API:
  // 422 (acima do teto 2x), 409 (não aberta / já com match), 404.
  const handleEstender = async (horas) => {
    if (estendendo) return
    setEstendendo(true)
    try {
      await comRetry(() => api.post(`/reparos/${reparo.id}/estender`, { horas }))
      setModalEstender(false)
      await buscar()
      Alert.alert('✅ Prazo aumentado!', 'O novo prazo já está valendo.')
    } catch (err) {
      console.log('[DetalheReparo] falha ao estender prazo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      if (err.status === 422) {
        setModalEstender(false)
        Alert.alert('Não foi possível aumentar', err.mensagem || 'Este reparo já está no prazo máximo permitido.')
      } else if (err.status === 409) {
        setModalEstender(false)
        Alert.alert('Não foi possível aumentar', err.mensagem || 'Este reparo não está mais disponível para aumento de prazo.')
      } else if (err.status === 404) {
        setModalEstender(false)
        Alert.alert('Não encontrado', err.mensagem || 'Reparo não encontrado.')
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
      console.log('[DetalheReparo] falha ao responder interesse | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      // É AQUI que o dono recebe o 409 PROFISSIONAL_SUSPENSO ao tentar aceitar: o aceite
      // não vale, e o motivo é o profissional, não a conexão de quem está aceitando.
      if (alertouSuspensao(err)) return
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      if (isNetwork) {
        Alert.alert('Erro de conexão', 'Não foi possível enviar. Verifique sua conexão.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.', [
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

  const handlePrestadorResponder = async (action, valor) => {
    const valorNum = valor ? parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) : null
    if (action === 'contraproposta' && !valorNum) { Alert.alert('Atenção', 'Informe o valor da contraproposta.'); return }
    setEnviandoResposta(true)
    try {
      await comRetry(() => api.post(`/reparos/${reparo.id}/interesse/${meuInteresse.id}/prestador-responder`, { action, valor: valorNum }))
      setMostrarContraPrestador(false)
      setValorContraPrestador('')
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
      console.log('[DetalheReparo] falha ao prestador responder contraproposta | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (alertouSuspensao(err)) return
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      if (isNetwork) {
        Alert.alert('Erro de conexão', 'Não foi possível enviar. Verifique sua conexão.\n\nSe você estiver com Wi-Fi e dados móveis ativados ao mesmo tempo, considere desativar os dados móveis temporariamente — isso pode evitar interrupções.', [
          { text: 'Tentar novamente', onPress: () => handlePrestadorResponder(action, valor) },
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
      await comRetry(() => api.post(`/reparos/${reparo.id}/pedir-tempo`, { motivo }))
      setReparo(prev => ({ ...prev, pedido_tempo_status: 'aguardando_tempo', pedido_tempo_motivo: motivo }))
      Alert.alert('✅ Solicitação enviada!', 'O solicitante foi notificado e vai perguntar quanto tempo você precisa.')
    } catch (err) { console.log('[DetalheReparo] falha ao pedir tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem); Alert.alert('Erro', err.mensagem || 'Não foi possível enviar a solicitação.') }
  }

  const handleperguntarTempo = async () => {
    try {
      await comRetry(() => api.post(`/reparos/${reparo.id}/perguntar-tempo`, {}))
      setReparo(prev => ({ ...prev, pedido_tempo_status: 'aguardando_minutos' }))
      Alert.alert('✅ Profissional notificado!', 'Ele vai informar quantos minutos precisa.')
    } catch (err) { console.log('[DetalheReparo] falha ao perguntar tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem); Alert.alert('Erro', err.mensagem || 'Não foi possível enviar.') }
  }

  const handleInformarTempo = () => setModalTempo(true)

  const enviarTempo = async () => {
    const min = parseInt(minutosTempo)
    if (!min || min <= 0) { Alert.alert('Atenção', 'Informe um número válido de minutos.'); return }
    setModalTempo(false)
    setMinutosTempo('')
    try {
      await comRetry(() => api.post(`/reparos/${reparo.id}/informar-tempo`, { minutos: min }))
      setReparo(prev => ({ ...prev, pedido_tempo_status: 'aguardando_aprovacao', pedido_tempo_minutos: min }))
      Alert.alert('✅ Enviado!', 'O solicitante foi notificado para aceitar ou recusar.')
    } catch (err) { console.log('[DetalheReparo] falha ao informar tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem); Alert.alert('Erro', err.mensagem || 'Não foi possível enviar.') }
  }

  const handleResponderTempo = (aceito) => {
    Alert.alert(
      aceito ? '✅ Aceitar tempo extra?' : '❌ Recusar tempo extra?',
      aceito ? `O profissional precisará de ${reparo.pedido_tempo_minutos} minuto(s) a mais.` : 'O reparo voltará para disponível e o profissional será bloqueado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: aceito ? 'Aceitar' : 'Recusar', style: aceito ? 'default' : 'destructive', onPress: async () => {
          try {
            const resp = await comRetry(() => api.post(`/reparos/${reparo.id}/responder-tempo`, { aceito }))
            if (aceito) {
              setReparo(prev => ({ ...prev, match_feito_em: resp.novo_match_feito_em, pedido_tempo_status: null, pedido_tempo_minutos: null }))
              Alert.alert('✅ Tempo concedido!', 'O cronômetro foi estendido.')
            } else {
              setReparo(prev => ({ ...prev, match_feito_em: null, match_usuario_id: null, pedido_tempo_status: null }))
              Alert.alert('❌ Recusado', 'O reparo voltou para disponível.')
              navigation.goBack()
            }
          } catch (err) { console.log('[DetalheReparo] falha ao responder tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem); Alert.alert('Erro', err.mensagem || 'Não foi possível responder.') }
        }}
      ]
    )
  }

  const temMatch = reparo?.match_feito_em && reparo?.match_usuario_id
  // Reparo finalizado é SOMENTE LEITURA. Encerrar não limpa match_feito_em/match_usuario_id,
  // então todo bloco pendurado apenas em temMatch/souPrestadorDoMatch continuaria ativo depois
  // da conclusão. Este flag é o gate único de todas as ações; os botões de Encerrar já testam
  // o status por conta própria e ficam como estão.
  const encerrada = reparo?.status === 'encerrada'
  // Encerramento em duas etapas: quando uma parte pede, o servidor devolve
  // encerramento 'pendente' e o reparo NÃO fecha — fecha só quando a outra confirma.
  // Enquanto pende, o status segue 'aberta', então `encerrada` continua false e a tela
  // permanece operável de propósito.
  // O detalhe não traz um campo 'encerramento': o pendente é inferido de quem pediu —
  // encerramento_solicitado_por preenchido (junto com encerramento_solicitado_em) na
  // linha do reparo.
  const encerramentoPendente = reparo?.encerramento_solicitado_por != null
  // Quem pediu vê "aguardando"; a outra parte vê "confirmar". Comparação em String como no
  // isDono; encerramentoPendente já garante o id do solicitante presente.
  const euSolicitei = encerramentoPendente && usuario?.id != null &&
    String(reparo.encerramento_solicitado_por) === String(usuario.id)
  // Rótulo dos botões de encerrar (dono e prestador): o padrão só vale fora do pendente.
  const rotuloEncerrar = (padrao) =>
    euSolicitei ? '⏳ Aguardando a outra parte' : encerramentoPendente ? '✅ Confirmar encerramento' : padrao
  // Mesma comparação guardada do isDono/ehMatch: temMatch já garante match_usuario_id
  // presente, então só falta exigir o id do usuário logado antes de comparar em String.
  const souPrestadorDoMatch = temMatch && usuario?.id != null &&
    String(reparo.match_usuario_id) === String(usuario.id)
  // Profissional FORA da disputa: ou foi recusado, ou o dono já escolheu outro. Para ele
  // o prazo deste reparo deixou de ser um prazo — não é notícia dele, e ver o relógio
  // correr sugere que ainda há algo a fazer. Espelha DetalheObraScreen; 'recusada' entra
  // junto por simetria com o vocabulário legado das candidaturas (ContratosScreen.js:24).
  // O DONO nunca entra aqui: o prazo é do reparo dele, ele vê a contagem em qualquer caso.
  // Quem ainda não demonstrou interesse também fica de fora do flag — para esse a contagem
  // é justamente o sinal de urgência que o faz decidir.
  const meuInteresseRecusado = meuInteresse?.status === 'recusado' || meuInteresse?.status === 'recusada'
  const foraDaDisputa = !isDono && (meuInteresseRecusado || (temMatch && !souPrestadorDoMatch))
  // Mesma comparação guardada dos flags acima: sem ela um id de tipo diferente faria o find
  // devolver undefined, apagando o botão de WhatsApp e o nome no ModalAvaliacao.
  const prestadorMatch = temMatch
    ? interessados.find(i => i.usuario_id != null && String(i.usuario_id) === String(reparo.match_usuario_id))
    : null
  // Texto único da chegada prometida, lido do timestamp do servidor e reusado pelos dois
  // lados (dono e prestador). Null quando não há promessa — ou quando a data não deu para
  // ler —, e aí os blocos que dependem dele não renderizam.
  const chegadaPrevistaTexto = textoChegada(reparo?.chegada_prevista_em)
  // Chegada PROPOSTA e ainda não respondida. Mesmo formatador do combinado, pela mesma
  // razão: o dono decide sobre um horário, não sobre o rótulo "amanhã de manhã".
  const chegadaPendenteTexto = textoChegada(reparo?.chegada_pendente_em)
  // Chegada AO LOCAL (etapa seguinte à janela combinada): uma parte declara, o dono
  // confirma. Os três estados abaixo são mutuamente exclusivos e cobrem o caminho todo.
  const chegadaDeclaradaTexto = textoChegada(reparo?.chegada_declarada_em)
  const chegadaConfirmadaTexto = textoChegada(reparo?.chegada_confirmada_em)
  const chegadaConfirmada = !!reparo?.chegada_confirmada_em
  const chegadaAguardaConfirmacao = !!reparo?.chegada_declarada_em && !chegadaConfirmada
  const chegadaNaoDeclarada = !reparo?.chegada_declarada_em && !chegadaConfirmada
  // Chegada REGISTRADA: anunciada por QUALQUER uma das partes, confirmada ou não.
  const chegadaRegistrada = !!reparo?.chegada_declarada_em || chegadaConfirmada
  // Encerrar exige que a chegada tenha sido registrada, e só onde a chegada foi negociada.
  // Basta a DECLARAÇÃO, não a confirmação do dono: exigindo a confirmação, um dono que
  // sumisse deixava o profissional sem saída — serviço feito, chegada declarada e o botão
  // de encerrar travado para sempre, porque o único caminho para destravá-lo era um toque
  // que só o outro lado podia dar. Match anterior a este fluxo não tem chegada_prevista_em
  // e segue encerrável como sempre.
  const podeEncerrar = !reparo?.chegada_prevista_em || chegadaRegistrada
  const distancia = distanciaItemKm(coords, reparo)

  // Valor exibido para o dono_reparo: enquanto não há proposta aceita, mostra o valor
  // originalmente proposto (reparo.valor_estimado). Após aceitar uma proposta/contraproposta,
  // o valor combinado vem do interesse aceito — COALESCE(valor_contraproposta, valor_proposto),
  // mesma regra de "Contratos Finalizados". (Só afeta a visão do dono; o prestador segue igual.)
  // Aceite nas duas grafias (ver STATUS_GRUPO em ContratosScreen.js:24). Aqui a grafia
  // não decide um rótulo e sim um VALOR: sem 'aprovada' o find falhava, valorAcordadoDono
  // ficava null e o dono via de volta o valor_estimado original — como se a negociação
  // não tivesse acontecido.
  const interesseAceitoDono = isDono
    ? interessados.find(i => i.status === 'aceito' || i.status === 'aprovada')
    : null
  const valorAcordadoDono = interesseAceitoDono
    ? (interesseAceitoDono.valor_contraproposta != null ? interesseAceitoDono.valor_contraproposta : interesseAceitoDono.valor_proposto)
    : null
  const valorPrincipal = valorAcordadoDono != null ? valorAcordadoDono : reparo?.valor_estimado
  const valorEstaCombinado = valorAcordadoDono != null || temMatch

  // B72-04: depois que o dono aceita um interesse, o prestador ainda precisa tocar
  // "Estou a caminho" para iniciar a contagem. O backend só grava match_usuario_id e
  // match_feito_em juntos nesse momento (/reparos/:id/match); ao aceitar, apenas o
  // interesse vira 'aceito'. Logo, "aceito mas ainda não partiu" = existe interesse
  // aceito, ainda sem match_feito_em e com o reparo não encerrado. (Só lado dono_reparo.)
  const aguardandoPrestadorPartir = isDono && reparo?.status !== 'encerrada' && !temMatch && !!interesseAceitoDono

  const abrirWhatsApp = (telefone) => {
    const digitos = (telefone || '').replace(/\D/g, '')
    if (!digitos) { console.log('[DetalheReparo] abrirWhatsApp chamado sem número — ignorado'); return }
    const numero = digitos.length <= 11 ? `55${digitos}` : digitos
    Linking.openURL(`whatsapp://send?phone=${numero}`)
  }

  if (carregando) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  if (!reparo) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
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
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
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
          <Image source={{ uri: full(fotoFullscreen) }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
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

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={estilos.corpo}>

          {/* !encerrada: o rótulo ("📅 Amanhã") descreve o prazo CONFIGURADO, não o tempo
              que resta — não muda com a aproximação e não sabia nada do encerramento. Num
              reparo concluído ele seguia no topo, urgindo atendimento logo acima do banner
              verde "SERVIÇO FINALIZADO". Some o banner inteiro: sem prazo a correr, nem o
              rótulo nem o texto de horas têm o que dizer. */}
          {!encerrada && reparo.prazo_atendimento_horas && (
            <View style={estilos.urgenciaBanner}>
              <Text style={estilos.urgenciaTexto}>
                {reparo.prazo_atendimento_horas <= 1 ? '🔴 Urgente agora!'
                  : reparo.prazo_atendimento_horas <= 2 ? '🟠 Muito urgente'
                  : reparo.prazo_atendimento_horas <= 4 ? '🟡 Urgente'
                  : reparo.prazo_atendimento_horas <= 8 ? '🟢 Hoje'
                  : reparo.prazo_atendimento_horas <= 24 ? '📅 Amanhã'
                  : '📆 Esta semana'}
              </Text>
              {/* Contagem pré-match: some para quem está fora da disputa (recusado ou
                  dono já escolheu outro) e em reparo encerrado — ali não há mais prazo a
                  correr para ninguém, nem para o dono, e o contador ficava vivo (ou
                  cravado em EXPIRADO) num reparo já concluído. Cai no texto neutro em vez
                  de deixar buraco no banner. */}
              {reparo.expira_em && !foraDaDisputa && !encerrada
                ? <ContadorExpiracaoReparo expiraEm={reparo.expira_em} />
                : <Text style={estilos.urgenciaHoras}>Atender em até {reparo.prazo_atendimento_horas}h</Text>
              }
            </View>
          )}

          {valorPrincipal != null && Number(valorPrincipal) > 0 && (
            <View style={estilos.valorDestaque}>
              <View>
                <Text style={estilos.valorDestaqueLabel}>💰 {valorEstaCombinado ? 'VALOR COMBINADO' : 'VALOR PROPOSTO'}</Text>
                <Text style={estilos.valorDestaqueValor}>
                  R$ {Number(valorPrincipal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={estilos.categoriaPill}>
                <Text style={estilos.categoriaTexto}>{reparo.categoria}</Text>
              </View>
            </View>
          )}

          <Text style={estilos.titulo}>{reparo.titulo}</Text>
          {/* Endereço do serviço em destaque para o profissional, acima da linha de
              cidade/bairro e sem depender mais do match: basta a API devolver o endereço.
              O dono vê o mesmo dado na linha simples abaixo — os dois blocos são mutuamente
              exclusivos por isDono, então o endereço nunca renderiza duas vezes. */}
          {reparo.endereco_reparo && !isDono ? (
            <View style={estilos.enderecoMatchBox}>
              <Text style={estilos.enderecoMatchLabel}>📍 Endereço do serviço:</Text>
              <Text style={estilos.enderecoMatchTexto}>{reparo.endereco_reparo}</Text>
              {/* Opcional no cadastro: só ocupa espaço quando o dono realmente informou. */}
              {reparo.ponto_referencia ? (
                <Text style={estilos.pontoReferenciaTexto}>🔎 Referência: {reparo.ponto_referencia}</Text>
              ) : null}
            </View>
          ) : null}
          <Text style={estilos.local}>
            📍 {reparo.cidade}{reparo.bairro ? `, ${reparo.bairro}` : ''}
            {distancia != null && <Text style={estilos.localDistancia}>{`  ·  ${formatarDistancia(distancia)}`}</Text>}
          </Text>
          {isDono && reparo.endereco_reparo ? (
            <>
              <Text style={estilos.enderecoLinha}>📍 {reparo.endereco_reparo}</Text>
              {reparo.ponto_referencia ? (
                <Text style={estilos.pontoReferenciaLinha}>🔎 Referência: {reparo.ponto_referencia}</Text>
              ) : null}
            </>
          ) : null}

          {reparo.descricao && (
            <>
              <Text style={estilos.secaoTitulo}>Descrição</Text>
              <Text style={estilos.descricao}>{reparo.descricao}</Text>
            </>
          )}

          {midias.length > 0 ? (
            <>
              <Text style={estilos.secaoTitulo}>Fotos e vídeos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {midias.map((midia, i) => (
                  <TileMidia
                    key={i}
                    midia={midia}
                    emoji={emojiReparo(reparo.categoria)}
                    onPress={() => midia.tipo === 'video' ? setVideoFullscreen(midia.url) : setFotoFullscreen(midia.url)}
                  />
                ))}
              </ScrollView>
            </>
          ) : reparo?.status === 'encerrada' ? (
            <View style={estilos.avisoMidiaRemovida}>
              <Text style={estilos.avisoMidiaRemovidaIcone}>📷</Text>
              <Text style={estilos.avisoMidiaRemovidaTexto}>Mídia removida automaticamente após 7 dias da conclusão do serviço</Text>
            </View>
          ) : null}

          {/* B72-06: reparo encerrado → banner verde de conclusão no lugar da contagem */}
          {reparo.status === 'encerrada' && (
            <View style={estilos.finalizadoBanner}>
              <Text style={estilos.finalizadoBannerTexto}>✅ SERVIÇO FINALIZADO COM SUCESSO!</Text>
            </View>
          )}

          {/* B72-06: a contagem (RelogioRegressivo) NÃO deve renderizar quando encerrada.
              (souPrestadorDoMatch || isDono): a contagem é das DUAS partes do match. Todo
              bloco da era pós-match ao redor já checa quem é quem; este não checava, então
              um interessado recusado via o relógio do vencedor — e, pior, ao zerar o
              onExpirar disparava POST /reparos/:id/expirar-match do aparelho DELE, seguido
              do alerta "o profissional não chegou a tempo" como se fosse participante. */}
          {/* Alvo da contagem: a chegada PROMETIDA quando existe, senão o prazo do reparo.
              onExpirar só acompanha o alvo expira_em. Zerar a promessa das 14h não
              significa que o prazo do reparo acabou, e disparar /expirar-match ali
              devolveria o reparo ao Rol no meio da janela ainda válida — o mesmo estrago
              que o gate de identidade abaixo evita para quem nem é do match. Sem prazo
              vencido não há match a expirar; com promessa no ar, quem cuida do prazo real
              é o servidor. */}
          {/* !chegadaConfirmada: confirmada a chegada, a contagem sai de cena — ela media o
              tempo ATÉ chegar, e esse prazo já foi cumprido. Deixá-la correndo ali passaria
              a cobrar um atraso que não existe mais. */}
          {(souPrestadorDoMatch || isDono) && temMatch && reparo.expira_em && !chegadaConfirmada && reparo.status !== 'encerrada' && (
            <RelogioRegressivo
              expiraEm={reparo.chegada_prevista_em || reparo.expira_em}
              onExpirar={reparo.chegada_prevista_em ? undefined : handleExpirarMatch}
            />
          )}

          {/* No lugar da contagem, o marco de início do serviço — para as DUAS partes do
              match, mesma regra de identidade da contagem que ele substitui. O horário sai
              de chegada_confirmada_em; ilegível, o bloco ainda aparece sem a data, porque
              "em andamento" é a informação principal e não depende dela. */}
          {(souPrestadorDoMatch || isDono) && temMatch && chegadaConfirmada && !encerrada && (
            <View style={estilos.emAndamentoBox}>
              <Text style={estilos.emAndamentoTexto}>
                ▶️ Em andamento{chegadaConfirmadaTexto ? ` desde ${chegadaConfirmadaTexto}` : ''}
              </Text>
            </View>
          )}

          {/* B72-04: dono aceitou, aguardando o prestador confirmar a ida (antes da contagem) */}
          {aguardandoPrestadorPartir && (
            <View style={estilos.aguardandoBanner}>
              <Text style={estilos.aguardandoBannerTitulo}>⏳ Aguardando o profissional</Text>
              <Text style={estilos.aguardandoBannerTexto}>
                Aguarde enquanto o profissional se organiza e parte para o local. Assim que ele confirmar, um cronômetro regressivo aparecerá aqui.
              </Text>
            </View>
          )}

          {temMatch && !encerrada && (
            <View style={estilos.contratoBanner}>
              <Text style={estilos.contratoBannerTitulo}>📋 Contrato enviado por e-mail</Text>
              <Text style={estilos.contratoBannerTexto}>
                Um contrato simples, de prestação de serviços, foi enviado para seu e-mail e também para a outra parte. Vocês podem ou não utilizar e assinar, é facultativo para tarefas simples. Contudo, se quiserem se proteger, basta utilizá-lo. Imprima e assinem.{'\n\n'}Bom trabalho para vocês! 🤝
              </Text>
            </View>
          )}

          {isDono && (
            <>
              {reparo.status === 'aberta' && !reparo.match_usuario_id && (
                <TouchableOpacity
                  style={[{ backgroundColor: '#2a2200', borderWidth: 1, borderColor: '#E8833A', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 12 }, (reparo.expirada || emEsperaEstender) && { opacity: 0.6 }]}
                  onPress={() => setModalEstender(true)}
                  disabled={reparo.expirada || emEsperaEstender}
                >
                  {/* Prazo encerrado vem antes da espera: é definitivo, e anunciar minutos
                      para quem já perdeu o prazo prometeria uma segunda chance inexistente. */}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#E8833A' }}>{reparo.expirada ? 'Prazo encerrado' : emEsperaEstender ? `⏳ Aguarde para estender (${minutosEsperaEstender} min)` : '⏳ Aumentar tempo para serviço'}</Text>
                </TouchableOpacity>
              )}
              <ModalEstenderPrazo
                visivel={modalEstender}
                unidade="horas"
                onEstender={handleEstender}
                onFechar={() => setModalEstender(false)}
              />
              {/* Chegada PROPOSTA, aguardando a resposta do dono. Sem temMatch no gate,
                  de propósito: a janela é proposta ANTES de o profissional partir, e
                  exigir o match aqui esconderia justamente a pergunta cuja resposta
                  destrava o combinado. Reusa a caixa do pedido de tempo — é a mesma
                  situação: o profissional pede, o dono decide. */}
              {reparo.chegada_pendente_em && !encerrada && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>🕐 Chegada proposta: {chegadaPendenteTexto}</Text>
                  <Text style={estilos.pedidoAlertaMotivo}>O profissional propôs este horário para chegar ao local.</Text>
                  <View style={estilos.pedidoBotoesRow}>
                    <TouchableOpacity style={estilos.btnAceitar} onPress={() => handleResponderChegada(true)} disabled={respondendoChegada}>
                      <Text style={estilos.btnAceitarTexto}>✅ Aceito</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={estilos.btnRecusar} onPress={() => handleResponderChegada(false)} disabled={respondendoChegada}>
                      <Text style={estilos.btnRecusarTexto}>❌ Não aceito</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {/* Chegada prometida, para o DONO. Renderiza o horário calculado pelo
                  servidor (chegada_prevista_em), nunca o rótulo da janela: "amanhã de
                  manhã" é o que o profissional escolheu, não uma hora com que o dono
                  possa se organizar. Sem o campo, chegadaPrevistaTexto é null e o bloco
                  some — nada de placeholder prometendo um horário que não existe.
                  Sem temMatch no gate, pelo mesmo motivo do bloco pendente acima: o
                  combinado nasce quando o dono aceita a janela, ANTES de o profissional
                  partir. Exigindo o match, o dono aceitava o horário e via a caixa
                  pendente sumir sem nada no lugar até a partida — justo o intervalo em
                  que ele precisa lembrar do que combinou. */}
              {reparo.chegada_prevista_em && !encerrada && (
                <View style={estilos.chegadaBox}>
                  <Text style={estilos.chegadaTexto}>🚚 Chegada prometida: {chegadaPrevistaTexto}</Text>
                </View>
              )}
              {temMatch && prestadorMatch?.telefone && !encerrada && (
                <TouchableOpacity
                  style={estilos.btnWhatsApp}
                  onPress={() => abrirWhatsApp(prestadorMatch.telefone)}
                >
                  <Text style={estilos.btnWhatsAppTexto}>💬 WhatsApp do profissional: {prestadorMatch.telefone}</Text>
                </TouchableOpacity>
              )}
              {/* Chegada declarada pelo profissional, esperando o dono. O botão chama o
                  MESMO /chegada: sobre uma declaração existente, o toque do dono é a
                  confirmação. */}
              {temMatch && chegadaAguardaConfirmacao && !encerrada && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>🚶 O profissional declarou que chegou{chegadaDeclaradaTexto ? ` ${chegadaDeclaradaTexto}` : ''}</Text>
                  <Text style={estilos.pedidoAlertaMotivo}>Confirme a chegada para o serviço começar.</Text>
                  <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleChegada} disabled={declarandoChegada}>
                    <Text style={estilos.btnPerguntarTempoTexto}>{declarandoChegada ? 'Confirmando…' : '✅ Confirmar chegada'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {temMatch && chegadaNaoDeclarada && !encerrada && (
                <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleChegada} disabled={declarandoChegada}>
                  <Text style={estilos.btnPerguntarTempoTexto}>{declarandoChegada ? 'Registrando…' : '🚶 Profissional chegou'}</Text>
                </TouchableOpacity>
              )}
              {/* podeEncerrar: o botão NÃO some quando falta confirmar a chegada — troca de
                  rótulo e desabilita, dizendo o que falta. Sumir sem aviso é o padrão que
                  esta tela já rejeita noutros pontos. Match sem chegada_prevista_em (de
                  antes deste fluxo) não passa por essa exigência. */}
              {temMatch && reparo?.status !== 'encerrada' && (
                <TouchableOpacity style={[estilos.btnEncerrar, (euSolicitei || !podeEncerrar) && { opacity: 0.6 }]} onPress={handleEncerrar} disabled={euSolicitei || !podeEncerrar}>
                  <Text style={estilos.btnEncerrarTexto}>{podeEncerrar ? rotuloEncerrar('✅ Confirmar conclusão — Encerrar reparo') : '🚶 Confirme a chegada para encerrar'}</Text>
                </TouchableOpacity>
              )}
              {temMatch && reparo.pedido_tempo_status === 'aguardando_tempo' && !encerrada && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>⚠️ Profissional precisa de mais tempo</Text>
                  <Text style={estilos.pedidoAlertaMotivo}>Motivo: {reparo.pedido_tempo_motivo}</Text>
                  <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleperguntarTempo}>
                    <Text style={estilos.btnPerguntarTempoTexto}>⏱ Quanto tempo a mais você precisa?</Text>
                  </TouchableOpacity>
                </View>
              )}
              {temMatch && reparo.pedido_tempo_status === 'aguardando_minutos' && !encerrada && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o profissional informar quantos minutos precisa...</Text>
                </View>
              )}
              {temMatch && reparo.pedido_tempo_status === 'aguardando_aprovacao' && !encerrada && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>⏳ Profissional precisa de mais tempo</Text>
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
              <Text style={[estilos.secaoTitulo, { marginTop: 20 }]}>🔧 Profissionais interessados ({interessados.length})</Text>
              {interessados.length === 0 ? (
                <View style={estilos.vazioInteressados}>
                  <Text style={estilos.vazioInteressadosTexto}>Nenhum profissional demonstrou interesse ainda.{'\n'}Aguarde as notificações!</Text>
                </View>
              ) : (
                interessados.map((item) => {
                  // Contato (telefone/endereço completo) só é liberado para o prestador MATCHED,
                  // não em 'aceito'. Deriva do match, não do status. (Novo contrato da API:
                  // telefone/logradouro voltam null até o prestador confirmar que está a caminho.)
                  // Comparação em String como no isDono. temMatch já garante
                  // reparo.match_usuario_id presente; falta exigir o id do interessado.
                  const ehMatch = temMatch && item.usuario_id != null &&
                    String(item.usuario_id) === String(reparo.match_usuario_id)
                  // Aceite nas duas grafias do backend (ver STATUS_GRUPO em
                  // ContratosScreen.js:24), como já se faz no painel do próprio interessado
                  // logo abaixo. Derivado uma vez porque os dois badges de aceite —
                  // com e sem match — precisam do mesmo teste.
                  const foiAceito = item.status === 'aceito' || item.status === 'aprovada'
                  const expTexto = formatarExperiencia(item.anos_experiencia)
                  const equipeN = Number(item.tamanho_equipe)
                  const linhaQualif = [expTexto, equipeN > 1 ? `equipe de ${equipeN}` : null].filter(Boolean).join(' · ')
                  const espTexto = especialidadesTexto(item.especialidades)
                  // Fechado o match, o valor do prestador escolhido não é mais proposta: vira o
                  // combinado, mesma troca de rótulo do topo da tela. QUAL linha carrega esse
                  // valor segue o COALESCE(contraproposta, proposto) usado lá — havendo
                  // contraproposta é ela que vale, e a de cima segue sendo a proposta original.
                  const propostoEhCombinado = ehMatch && item.valor_contraproposta == null
                  // "Aceitou o meu preço": o botão do profissional COPIA o valor pedido para
                  // valor_proposto (handleInteresse, :300) e não manda flag nenhuma — a
                  // igualdade com o pedido é o ÚNICO sinal que chega aqui.
                  // Fonte do pedido é reparo.valor_estimado CRU, NUNCA valorPrincipal: aquele
                  // vira o valor acordado depois que o dono aceita alguém (:745), e comparar
                  // a proposta com ela mesma acusaria "aceito" em toda a lista.
                  // Exige pedido > 0, a mesma guarda do botão em :1338: sem valor pedido,
                  // 0 === 0 anunciaria um aceite que não houve. Pedido ausente vira NaN, que
                  // nunca é igual a nada, então cai no rótulo neutro.
                  // Não vale quando já é "Valor combinado" — ali o match já foi fechado.
                  const valorPedidoReparo = Number(reparo?.valor_estimado || 0)
                  const aceitouValorPedido = !propostoEhCombinado && valorPedidoReparo > 0 &&
                    Number(item.valor_proposto) === valorPedidoReparo
                  const propostoFmt = item.valor_proposto != null
                    ? Number(item.valor_proposto).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                    : ''
                  return (
                  <View key={item.id} style={estilos.interessadoCard}>
                    <View style={estilos.candidatoTopo}>
                      {item.foto_url ? (
                        <Image source={{ uri: avatar(item.foto_url) }} style={estilos.candidatoAvatar} />
                      ) : (
                        <View style={[estilos.candidatoAvatar, estilos.candidatoAvatarVazio]}>
                          <Text style={estilos.candidatoAvatarIniciais}>{iniciaisDe(item.nome)}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={estilos.interessadoHeader}>
                          <Text style={[estilos.interessadoNome, { flex: 1 }]}>{item.nome}</Text>
                        </View>
                        {/* Cidade/endereço saem da linha do nome: em row com space-between
                            disputavam largura com ele e o endereço completo do prestador
                            do match espremia tudo. Em linha própria, quebram naturalmente. */}
                        {/* Cidade e, quando houver, bairro depois da vírgula — mesma ordem da
                            linha de local do reparo no topo da tela. */}
                        {!ehMatch && item.cidade && <Text style={estilos.interessadoCidade}>📍 {item.cidade}{item.bairro ? `, ${item.bairro}` : ''}</Text>}
                        {ehMatch && item.logradouro && (
                          <Text style={estilos.interessadoCidade}>📍 {item.logradouro}{item.numero ? ', ' + item.numero : ''}{item.bairro ? ' — ' + item.bairro : ''} — {item.cidade}</Text>
                        )}
                        {item.avaliacoes_total > 0 ? (
                          <Text style={estilos.avaliacaoLinha}>
                            ⭐ {Number(item.avaliacoes_media).toFixed(1)} ({item.avaliacoes_total} {item.avaliacoes_total === 1 ? 'avaliação' : 'avaliações'})
                          </Text>
                        ) : (
                          <Text style={estilos.avaliacaoLinhaNovo}>🆕 Novo na plataforma</Text>
                        )}
                      </View>
                    </View>
                    {linhaQualif ? <Text style={estilos.candidatoLinha}>⏱ {linhaQualif}</Text> : null}
                    {espTexto ? <Text style={estilos.candidatoLinha}>🛠 Especialidades: {espTexto}</Text> : null}
                    {item.valor_proposto != null && (
                      <Text style={{ fontSize: 18, fontWeight: '700', color: cores.textoMedio, marginBottom: 4 }}>
                        {aceitouValorPedido
                          ? `💰 Seu valor proposto (R$ ${propostoFmt}) foi aceito`
                          : `💰 ${propostoEhCombinado ? 'Valor combinado' : 'Valor proposto'}: R$ ${propostoFmt}`}
                      </Text>
                    )}
                    {item.valor_contraproposta != null && (
                      <Text style={{ fontSize: 13, color: '#E8833A', marginBottom: 4 }}>
                        🤝 {ehMatch ? 'Valor combinado' : 'Minha contraproposta'}: R$ {Number(item.valor_contraproposta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </Text>
                    )}
                    {item.mensagem && (
                      <View style={estilos.mensagemBox}>
                        <Text style={estilos.mensagemTexto}>{item.mensagem}</Text>
                      </View>
                    )}
                    {item.status === 'pendente' && !temMatch && !encerrada && (
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
                              // Warm-up ao ABRIR o campo: entre carregar a tela e tocar em
                              // "Enviar" o usuário lê a proposta e digita um valor, minutos
                              // sem tráfego nenhum. Basta isso: o socket TCP ocioso é
                              // derrubado pelo SO/pela rede — dá no mesmo ter ficado parado
                              // em 1º plano aqui ou o app ter ido para o 2º plano — e o pool
                              // do axios não percebe. Quem reutiliza o socket morto e trava
                              // até o timeout de 30 s é este ping descartável, não a
                              // contraproposta do usuário. NÃO é cold start do servidor.
                              // Sem await, erro engolido: falhar aqui é o caso de sucesso.
                              // Explicação canônica no WarmupController (App.js).
                              onPress={() => { api.get('/health').catch(() => {}); setContrapropostaInteresseId(item.id) }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#E8833A' }}>💬 Contraproposta</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                    {item.status === 'contraproposta_dono' && (
                      <View style={{ marginTop: 8, padding: 8, backgroundColor: '#2a1a00', borderRadius: raios.medio }}>
                        <Text style={{ fontSize: 12, color: '#E8833A' }}>⏳ Aguardando resposta do profissional...</Text>
                      </View>
                    )}
                    {foiAceito && !ehMatch && (
                      <View style={{ marginTop: 8, padding: 10, backgroundColor: '#0a1a0a', borderWidth: 1, borderColor: '#2a4a2a', borderRadius: raios.medio }}>
                        <Text style={{ fontSize: 13, color: '#4caf50', fontWeight: '600', marginBottom: 4 }}>⏳ Proposta aceita!</Text>
                        <Text style={{ fontSize: 12, color: cores.textoMedio, lineHeight: 18 }}>
                          O contato do profissional será liberado assim que ele confirmar que está a caminho.
                        </Text>
                      </View>
                    )}
                    {/* "A caminho" só vale ATÉ a chegada ser confirmada; depois disso o
                        profissional não está mais indo, está trabalhando. Mesmo fato que o
                        bloco "▶️ Em andamento" do topo já anuncia — esta linha é a versão
                        dele no card do interessado. */}
                    {foiAceito && ehMatch && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 12, color: '#4caf50', fontWeight: '600' }}>
                          {chegadaConfirmada ? '▶️ Serviço em andamento' : '✅ Proposta aceita — profissional a caminho.'}
                        </Text>
                      </View>
                    )}
                    {/* Badge do DONO para cada interessado: aceita as duas grafias de recusa
                        (ver STATUS_GRUPO em ContratosScreen.js:24). Sem 'recusada' a linha
                        de um recusado ficava sem badge nenhum, e o dono relia a lista sem
                        saber quem já tinha dispensado. */}
                    {(item.status === 'recusado' || item.status === 'recusada') && (
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
              {/* Rótulo na 1ª pessoa: aqui quem toca é o próprio profissional anunciando a
                  própria chegada. O botão do DONO (mesmo endpoint, logo acima na seção dele)
                  segue em 3ª pessoa — "Profissional chegou" —, porque lá o toque fala de
                  outra pessoa e vale como confirmação, não como declaração. */}
              {souPrestadorDoMatch && chegadaNaoDeclarada && !encerrada && (
                <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleChegada} disabled={declarandoChegada}>
                  <Text style={estilos.btnPerguntarTempoTexto}>{declarandoChegada ? 'Registrando…' : '🚶 Cheguei no local do serviço'}</Text>
                </TouchableOpacity>
              )}
              {souPrestadorDoMatch && chegadaAguardaConfirmacao && !encerrada && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante confirmar sua chegada...</Text>
                </View>
              )}
              {/* Mesma regra do botão do dono: rótulo explicando o que falta em vez de
                  botão ausente, e sem exigência nenhuma em match anterior ao fluxo. */}
              {souPrestadorDoMatch && reparo?.status !== 'encerrada' && (
                <TouchableOpacity style={[estilos.btnEncerrar, (encerrando || euSolicitei || !podeEncerrar) && { opacity: 0.6 }]} onPress={handleEncerrarPrestador} disabled={encerrando || euSolicitei || !podeEncerrar}>
                  <Text style={estilos.btnEncerrarTexto}>{!podeEncerrar ? '🚶 Confirme a chegada para encerrar' : encerrando ? 'Encerrando…' : rotuloEncerrar('✅ Serviço concluído — Encerrar')}</Text>
                </TouchableOpacity>
              )}
              {/* !chegadaConfirmada: pedir mais tempo é sobre o prazo ATÉ chegar, e esse
                  prazo acabou quando o dono confirmou a chegada. Mesma razão pela qual a
                  contagem regressiva sai de cena nesse momento (:1165). */}
              {souPrestadorDoMatch && !reparo.pedido_tempo_status && !chegadaConfirmada && !encerrada && (
                <TouchableOpacity style={estilos.btnPedirTempo} onPress={handlePedirTempo}>
                  <Text style={estilos.btnPedirTempoTexto}>⚠️ Preciso de mais tempo para chegar</Text>
                </TouchableOpacity>
              )}
              {souPrestadorDoMatch && reparo.pedido_tempo_status === 'aguardando_tempo' && !encerrada && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante responder sua solicitação...</Text>
                </View>
              )}
              {souPrestadorDoMatch && reparo.pedido_tempo_status === 'aguardando_minutos' && !encerrada && (
                <TouchableOpacity style={estilos.btnInformarTempo} onPress={handleInformarTempo}>
                  <Text style={estilos.btnInformarTempoTexto}>⏱ Informar quantos minutos preciso</Text>
                </TouchableOpacity>
              )}
              {souPrestadorDoMatch && reparo.pedido_tempo_status === 'aguardando_aprovacao' && !encerrada && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante aceitar os {reparo.pedido_tempo_minutos} minuto(s) extra...</Text>
                </View>
              )}
              {!temMatch && !encerrada && (
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
                        {meuInteresse.valor_contraproposta != null && (
                          <Text style={{ fontSize: 18, fontWeight: '700', color: cores.sucesso, marginBottom: 12 }}>
                            R$ {Number(meuInteresse.valor_contraproposta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </Text>
                        )}
                        {mostrarContraPrestador ? (
                          <View>
                            <TextInput
                              style={[estilos.input, { marginBottom: 8 }]}
                              placeholder="Sua contraproposta (ex: 350,00)"
                              placeholderTextColor={cores.textoMutado}
                              keyboardType="numeric"
                              value={valorContraPrestador}
                              onChangeText={v => setValorContraPrestador(mascararValor(v))}
                            />
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <TouchableOpacity style={[estilos.btnAceitar, { flex: 1 }]} onPress={() => handlePrestadorResponder('contraproposta', valorContraPrestador)} disabled={enviandoResposta}>
                                <Text style={estilos.btnAceitarTexto}>Enviar →</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[estilos.btnRecusar, { flex: 1 }]} onPress={() => { setMostrarContraPrestador(false); setValorContraPrestador('') }}>
                                <Text style={estilos.btnRecusarTexto}>Cancelar</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <>
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
                      </>
                    )}
                    {(meuInteresse.status === 'aceito' || meuInteresse.status === 'aprovada') && (
                      <>
                        <Text style={{ color: '#4caf50', fontWeight: '600', marginBottom: 6 }}>✅ Proposta aceita!</Text>
                        <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20, marginBottom: 12 }}>Parabéns! Você foi selecionado. Confirme sua ida ao local:</Text>
                        {/* Janela de chegada, ACIMA do botão de partida: prometer o horário
                            é o passo anterior a "estou a caminho". Some assim que houver
                            promessa — trocada pelo horário que o servidor calculou, para o
                            profissional ver o mesmo compromisso que o dono lê. */}
                        {reparo.chegada_prevista_em ? (
                          <Text style={estilos.chegadaConfirmada}>✅ Você prometeu chegar {chegadaPrevistaTexto}</Text>
                        ) : reparo.chegada_pendente_em ? (
                          /* Proposta no ar: nada de reabrir o seletor por baixo, senão o
                             profissional reenviaria por cima de uma janela que o dono
                             ainda está decidindo. O horário sai do timestamp pendente. */
                          <View style={estilos.pedidoBox}>
                            <Text style={estilos.pedidoTexto}>⏳ Sua chegada para {chegadaPendenteTexto} aguarda a confirmação do solicitante...</Text>
                          </View>
                        ) : (
                          <View style={estilos.janelaWrap}>
                            <Text style={estilos.janelaLabel}>Quando você pretende chegar?</Text>
                            <View style={estilos.janelaOpcoes}>
                              {JANELAS_CHEGADA.map(j => (
                                <TouchableOpacity
                                  key={j.id}
                                  style={[estilos.janelaOpcao, enviandoJanela === j.id && estilos.janelaOpcaoAtiva]}
                                  onPress={() => handleEscolherJanela(j.id)}
                                  disabled={!!enviandoJanela}
                                >
                                  <Text style={estilos.janelaOpcaoTexto}>{enviandoJanela === j.id ? 'Enviando…' : j.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        )}
                        <TouchableOpacity style={estilos.btnMatch} onPress={handleMatch}>
                          <Text style={estilos.btnMatchTexto}>🔧 Estou a caminho! Iniciar contagem →</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {/* Reusa o MESMO flag do foraDaDisputa, espelhando DetalheObraScreen:
                        um painel que some sem aviso é pior que um rótulo a mais, então
                        'recusada' entra aqui pelo mesmo motivo que entrou no flag. */}
                    {meuInteresseRecusado && (
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
                    {Number(reparo.valor_estimado) > 0 && !valorProposto && (
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
                    {!valorAceito && (
                      <View style={estilos.perguntaWrap}>
                        <Text style={estilos.perguntaLabel}>FAZER UMA CONTRAPROPOSTA (opcional) – R$</Text>
                        <TextInput
                          style={estilos.input}
                          placeholder="Ex: 350,00"
                          placeholderTextColor={cores.textoMutado}
                          keyboardType="numeric"
                          value={valorProposto}
                          onChangeText={v => setValorProposto(mascararValor(v))}
                        />
                        <Text style={{ color: '#f44336', fontWeight: '700', fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                          ⚠️ Se você propuser outro valor, o reparo ainda ficará disponível para outros profissionais até que o solicitante aceite. Pense bem!
                        </Text>
                      </View>
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
      </KeyboardAvoidingView>

      {/* Avaliação pós-encerrar (dono). Mesma invocação de ContratosFinalizadosScreen. */}
      <ModalAvaliacao
        visivel={avaliarVisivel}
        nomeAvaliado={prestadorMatch?.nome || 'o profissional'}
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
  // Folga extra no fim da rolagem para o teclado não cobrir o último campo
  // (contraproposta) — o padding horizontal/topo continua vindo de `corpo`.
  scroll: { flexGrow: 1, paddingBottom: 40 },
  urgenciaBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#3a1a1a', borderWidth: 1, borderColor: '#f4433644', borderRadius: raios.grande, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12 },
  urgenciaTexto: { fontSize: 14, fontWeight: '700', color: '#f44336' },
  urgenciaHoras: { fontSize: 12, color: '#f44336' },
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
  pontoReferenciaTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 19, marginTop: 6 },
  // Mesmo visual do pontoReferenciaTexto (dentro da caixa), com o espaçamento da linha
  // simples do dono: o marginTop negativo aproxima da linha de endereço acima, como o
  // enderecoLinha faz com a linha de cidade/bairro.
  pontoReferenciaLinha: { fontSize: 13, color: cores.textoMedio, lineHeight: 19, marginTop: -10, marginBottom: 16 },
  localDistancia: { color: cores.primaria, fontWeight: '600' },
  secaoTitulo: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  descricao: { fontSize: 13, color: cores.textoMedio, lineHeight: 22, marginBottom: 20 },
  midiaItem: { width: 160, height: 120, marginRight: 10, borderRadius: 10, overflow: 'hidden' },
  midiaImagem: { width: '100%', height: '100%' },
  // Placeholder do tile que não renderizou. Mesmo cinza do thumbVazia dos feeds; o
  // ícone é maior porque o tile é 160x120dp, contra os 64dp do thumb de lá.
  midiaVazia: { backgroundColor: '#2E2E2E', alignItems: 'center', justifyContent: 'center' },
  midiaVaziaIcone: { fontSize: 40 },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  avisoMidiaRemovida: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, marginBottom: 20 },
  avisoMidiaRemovidaIcone: { fontSize: 20 },
  avisoMidiaRemovidaTexto: { flex: 1, fontSize: 12, color: cores.textoFraco, lineHeight: 18 },
  relogioBox: { backgroundColor: '#1a1a2a', borderWidth: 1.5, borderColor: cores.primaria, borderRadius: raios.grande, padding: 20, alignItems: 'center', marginBottom: 16 },
  relogioExpirado: { backgroundColor: '#2a2a2a', borderColor: '#666' },
  relogioLabel: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 1, marginBottom: 8 },
  relogioTempo: { fontSize: 52, fontWeight: '700', color: cores.primaria, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  relogioSub: { fontSize: 11, color: cores.textoFraco, marginTop: 6, textAlign: 'center' },
  finalizadoBanner: { backgroundColor: '#1a3a1a', borderWidth: 1.5, borderColor: '#4caf50', borderRadius: raios.grande, padding: 20, alignItems: 'center', marginBottom: 16 },
  finalizadoBannerTexto: { fontSize: 16, fontWeight: '700', color: '#4caf50', textAlign: 'center', letterSpacing: 0.5 },
  aguardandoBanner: { backgroundColor: '#1a2a3a', borderWidth: 1, borderColor: '#4a90d9', borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  aguardandoBannerTitulo: { fontSize: 14, fontWeight: '700', color: '#6ab0f3', marginBottom: 6 },
  aguardandoBannerTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 20 },
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
  candidatoTopo: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  candidatoAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  candidatoAvatarVazio: { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  candidatoAvatarIniciais: { color: cores.primaria, fontSize: 14, fontWeight: '700' },
  candidatoLinha: { fontSize: 12, color: cores.textoMedio, marginTop: 4 },
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
  btnContraPrestador: { marginTop: 8, borderRadius: raios.medio, padding: 11, alignItems: 'center', borderWidth: 1, borderColor: '#E8833A', backgroundColor: '#2a1f12' },
  btnContraPrestadorTexto: { fontSize: 13, fontWeight: '700', color: '#E8833A' },
  btnRecusar: { flex: 1, backgroundColor: '#3a1a1a', borderWidth: 1, borderColor: '#f44336', borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  btnRecusarTexto: { fontSize: 13, fontWeight: '700', color: '#f44336' },
  btnAceitarValorProposto: { backgroundColor: '#3a2a00', borderWidth: 1.5, borderColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnAceitarValorPropostoTexto: { fontSize: 14, fontWeight: '700', color: cores.primaria },
  btnValorAceito: { backgroundColor: '#1a3a1a', borderWidth: 1.5, borderColor: '#4caf50', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnValorAceitoTexto: { fontSize: 14, fontWeight: '700', color: '#4caf50' },
  // Janela de chegada (prestador, antes de partir). As opções quebram em várias linhas
  // — os rótulos são longos e três pills numa linha só espremeriam o texto.
  janelaWrap: { marginBottom: 4 },
  janelaLabel: { fontSize: 13, fontWeight: '600', color: cores.textoMedio, marginBottom: 8 },
  janelaOpcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  janelaOpcao: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 8 },
  janelaOpcaoAtiva: { borderColor: cores.primaria, opacity: 0.6 },
  janelaOpcaoTexto: { fontSize: 13, fontWeight: '600', color: cores.textoForte },
  chegadaConfirmada: { fontSize: 13, fontWeight: '600', color: '#4caf50', marginBottom: 4 },
  // Chegada prometida (dono). Mesma família visual do banner de contrato.
  chegadaBox: { backgroundColor: '#1a2a3a', borderWidth: 1, borderColor: '#4a90d9', borderRadius: raios.medio, padding: 12, marginBottom: 12 },
  chegadaTexto: { fontSize: 14, fontWeight: '700', color: '#6ab0f3' },
  // Serviço em andamento (as duas partes), no lugar que era da contagem.
  emAndamentoBox: { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.grande, padding: 16, alignItems: 'center', marginBottom: 16 },
  emAndamentoTexto: { fontSize: 15, fontWeight: '700', color: '#4caf50' },
})