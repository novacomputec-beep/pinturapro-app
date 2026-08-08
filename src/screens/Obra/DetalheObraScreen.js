import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  TouchableOpacity, ActivityIndicator, Alert, TextInput, Linking, Modal
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import api, { obrasService } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useFocusEffect } from '@react-navigation/native'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { celebracaoRef } from '../../components/CelebracaoMatchHost'
import ModalEstenderPrazo from '../../components/ModalEstenderPrazo'
import ModalAvaliacao from '../../components/ModalAvaliacao'
import { comRetry, ehContaSuspensa, ehProfissionalSuspenso, recarregarSeFalhaDeRede } from '../../utils/rede'
import { cores, espacos, raios, alturas } from '../../utils/tema'
import { distanciaItemKm, formatarDistancia, useCoordsUsuario } from '../../utils/distancia'
import { avatar, media, full, videoOtimizado } from '../../utils/imagemOtimizada'
import { thumbnailDeCapa, FRAME_TILE_DETALHE } from '../../utils/thumbnail'
import { emojiObra } from '../../utils/categorias'

// Tile da tira "Fotos e vídeos". Componente próprio, e fora da tela (mesmo motivo do
// CardObra no feed), porque cada tile precisa do SEU estado de falha: um item
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
// contagem contínua através do match — o pintor vê o tempo que RESTAVA no Rol, não uma
// janela nova de match_feito_em + prazo. Ao chegar a zero dispara onExpirar (POST
// /obras/:id/expirar-match) no exato momento de expira_em; o job verificarCronometroObras
// faz o mesmo no servidor — quem disparar primeiro vence, o outro é no-op idempotente.
// match_feito_em segue usado noutros lugares, mas não para esta contagem.
// onExpirar é OPCIONAL de propósito: só o alvo expira_em representa o fim do prazo da
// obra, então só ele pode disparar /expirar-match. Ver a nota no ponto de render.
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
    /* Barra de UMA linha, com a forma e a altura do botão primário (mesmo raio, mesmo
       padding) mas em contorno, não preenchida: é informação, não ação. O rótulo acima e
       a explicação abaixo saíram — "Prazo para chegar" à esquerda já diz as duas coisas. */
    <View style={[estilos.relogioBarra, expirou && estilos.relogioExpirado]}>
      <Text style={[estilos.relogioBarraLabel, expirou && { color: cores.textoFraco }]}>
        {expirou ? '⏰ Tempo esgotado' : 'Prazo para chegar'}
      </Text>
      {/* Esgotado NÃO mostra tempo: zerado, o formatador devolve "menos de 1 min", que
          contradiz o rótulo — e mesmo um "0m" só repetiria o que ESGOTADO já diz. */}
      {!expirou && <Text style={[estilos.relogioTempo, urgente && { color: '#f44336' }]}>{tempo}</Text>}
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
  // Fechado por padrão: depois do match o profissional já leu o pedido (foi com base nele
  // que se candidatou). O que ele precisa desta tela agora é endereço, cronômetro e os
  // botões — descrição e mídia viram consulta, não leitura obrigatória.
  const [mostrarPedido, setMostrarPedido] = useState(false)
  const [valorContraPintor, setValorContraPintor] = useState('')
  const [enviandoResposta, setEnviandoResposta] = useState(false)
  const [modalTempo, setModalTempo] = useState(false)
  const [minutosTempo, setMinutosTempo] = useState('')
  const [modalEstender, setModalEstender] = useState(false)
  const [estendendo, setEstendendo] = useState(false)
  // Guarda a janela EM VOO (o id, não um boolean): trava as três opções de uma vez e
  // ainda permite marcar qual delas está sendo enviada.
  const [enviandoJanela, setEnviandoJanela] = useState(null)
  const [respondendoChegada, setRespondendoChegada] = useState(false)
  const [declarandoChegada, setDeclarandoChegada] = useState(false)
  const [coords] = useCoordsUsuario()
  const mountedRef = useRef(true)

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
  const isDono = usuario?.id != null && obra?.criado_por != null &&
    String(usuario.id) === String(obra.criado_por)
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

  // Núcleo da recarga: relê a obra e repõe o estado, PROPAGANDO a falha. É disso que
  // recarregarSeFalhaDeRede precisa para distinguir "recarreguei" de "nem isso consegui"
  // (ver rede.js) — mesmo molde do recarregarPerfil em EditarPerfilScreen.
  const recarregarObra = async () => {
    const resposta = await comRetry(() => obrasService.detalhe(obraInicial.id))
    // Corpo VAZIO chega como string, não como objeto: é o caso do 304 Not Modified, que
    // agora entra pelo ramo de SUCESSO (api.js). Não significa "obra inexistente" e sim
    // "nada mudou" — sem esta guarda, `resposta.obra || resposta` devolvia a própria
    // string vazia, setObra('') e a tela caía no "Obra não encontrada" por cima de
    // dados corretos. O teste é pelo TIPO, para não alterar o caso do 200 legítimo.
    if (!resposta || typeof resposta !== 'object') return
    if (mountedRef.current) {
      setObra(resposta.obra || resposta)
      setMidias(resposta.midias || [])
      setMinhaCandidatura(resposta.minha_candidatura)
      setCandidatos(resposta.candidatos || [])
    }
  }

  // Recarga SILENCIOSA: a do mount, a do foco e a que segue uma mutação bem-sucedida.
  // Engole a falha de propósito — um refetch que não deu certo não deve virar alerta —,
  // e é justamente por engolir que ela NÃO serve para recarregarSeFalhaDeRede. Todos os
  // chamadores antigos continuam usando esta, com o mesmo comportamento de sempre.
  const buscar = async () => {
    try {
      await recarregarObra()
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
      // Suspenso: sai antes da reconsulta — não há candidatura nova a descobrir, e o
      // motivo real precisa aparecer no lugar do "não foi possível registrar".
      if (alertouSuspensao(err)) return
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

  // Janela de chegada: o profissional promete QUANDO chega, antes de partir. Grava um
  // ESTADO (a mesma janela duas vezes dá o mesmo resultado) e não cria recurso novo, que
  // é exatamente o caso do { timeout: true } descrito em rede.js:16-19 — o socket ocioso
  // que trava até o timeout de 30 s é o mesmo evento do ERR_NETWORK e merece o retry.
  // { servidor } fica FORA: um 5xx prova que a requisição chegou.
  const handleEscolherJanela = async (janela) => {
    if (enviandoJanela) return
    // Estado ANTES do envio, para a reconsulta do catch saber o que é novidade. Sem esta
    // foto, "existe uma janela" não distingue a que acabou de ser gravada de uma que já
    // estava lá antes do toque.
    const previstaAntes = obra?.chegada_prevista_em
    const pendenteAntes = obra?.chegada_pendente_em
    setEnviandoJanela(janela)
    try {
      const resp = await comRetry(() => api.post(`/obras/${obra.id}/chegada-prevista`, { janela }), { timeout: true, persistir: true })
      // O horário exibido vem SEMPRE do servidor. Se a resposta não trouxer o campo,
      // buscar() reidrata a obra — em nenhuma hipótese derivamos um instante do rótulo
      // escolhido aqui, que é um pedido ("amanhã de manhã"), não um horário.
      const nova = resp?.chegada_prevista_em || resp?.obra?.chegada_prevista_em
      if (nova) {
        if (mountedRef.current) setObra(prev => ({ ...prev, chegada_prevista_em: nova }))
      } else {
        await buscar()
      }
    } catch (err) {
      console.log('[DetalheObra] falha ao informar chegada prevista | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (alertouSuspensao(err)) return
      // Mesmo padrão de handleInteresse/handleMatch: a 1ª tentativa pode ter sido gravada
      // e só a resposta se perdido. Reconsulta antes de acusar erro — se a janela apareceu
      // agora (prevista OU pendente, conforme o servidor exija ou não o aceite do dono),
      // a promessa está feita e alertar seria mentir sobre o que está no servidor.
      // O detalhe volta { obra } ou a obra na raiz, como no handleEncerrar.
      // A reconsulta vai de comRetry, e não de uma tentativa única: quando ela roda, o
      // comRetry do POST já insistiu por ~45 s ({ persistir }) e desistiu, ou seja, a
      // rede está falhando há bastante tempo. Um GET solitário nesse instante quase
      // sempre falha também, e aí a recuperação nunca acontece — justamente no cenário
      // que ela existe para cobrir. { timeout } porque GET é idempotente; { persistir }
      // fica FORA de propósito: dobrar a janela para 90 s antes de dar qualquer resposta
      // é pior para quem está olhando a tela do que um alerta honesto.
      try {
        const atual = await comRetry(() => obrasService.detalhe(obra.id), { timeout: true })
        const o = atual?.obra || atual
        const gravou = (!previstaAntes && o?.chegada_prevista_em) || (!pendenteAntes && o?.chegada_pendente_em)
        if (gravou) { await buscar(); return }
      } catch (e2) { console.log('[DetalheObra] reconsulta pós-chegada-prevista falhou | code:', e2.code) }
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
      await comRetry(() => api.post(`/obras/${obra.id}/chegada-prevista/responder`, { aceito }))
      // buscar() em vez de remendar o estado local: é o servidor que decide se a
      // pendente vira combinada ou simplesmente some, e a tela toda depende disso.
      await buscar()
    } catch (err) {
      console.log('[DetalheObra] falha ao responder chegada prevista | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      // Rede pura → recarrega em vez de alertar: a tela mostra a janela como o servidor a
      // tem (respondida ou não), que é o que a pessoa precisa saber. Qualquer erro COM
      // resposta do servidor continua no alerta.
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) return
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
    // Foto do estado ANTES do toque. O mesmo endpoint declara OU confirma conforme quem
    // tocou, então "houve chegada" não basta como prova: o que interessa é se ESTE toque
    // ADIANTOU alguma coisa. Comparar com o antes cobre os dois papéis sem precisar
    // adivinhar qual dos dois o servidor executou.
    const declaradaAntes = obra?.chegada_declarada_em
    const confirmadaAntes = obra?.chegada_confirmada_em
    setDeclarandoChegada(true)
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/chegada`, {}), { timeout: true, persistir: true })
      // buscar() porque o mesmo toque produz estados diferentes conforme quem tocou:
      // declarada, ou declarada + confirmada. Quem sabe qual saiu é o servidor.
      await buscar()
    } catch (err) {
      console.log('[DetalheObra] falha ao registrar chegada | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (alertouSuspensao(err)) return
      // Mesmo padrão de handleInteresse/handleMatch: reconsulta antes de acusar erro. Se
      // a chegada avançou, o toque valeu e o alerta seria um erro sobre algo que deu certo.
      // Mesma razão do comRetry usado na janela de chegada: a rede vem falhando há ~45 s.
      //
      // O QUE CONTA COMO PROVA é o que ESTE toque produziu, e o endpoint é o mesmo para os
      // dois lados — então não basta ver que a chegada andou: durante os ~45 s em que este
      // toque falhava, a OUTRA parte pode ter agido, e ler isso como sucesso próprio seria
      // dizer que o usuário fez algo que ele não fez.
      // chegada_declarada_por resolve o lado da declaração: dá para saber de quem ela é.
      // Confirmar é ação do DONO (o toque dele sobre uma declaração existente é o que
      // confirma), então só para ele um chegada_confirmada_em novo prova o próprio toque.
      try {
        const atual = await comRetry(() => obrasService.detalhe(obra.id), { timeout: true })
        const o = atual?.obra || atual
        // String() nos dois lados: o id vem número ou string conforme o endpoint, mesma
        // disciplina do isDono (:320) e do pintorMatch. Os != null vêm ANTES porque
        // String(undefined) === String(undefined) daria "igual" — dois ids ausentes não
        // podem casar e transformar a declaração de terceiro em sucesso deste usuário.
        const declaracaoMinha = o?.chegada_declarada_por != null && usuario?.id != null &&
          String(o.chegada_declarada_por) === String(usuario.id)
        const declareiAgora = !declaradaAntes && !!o?.chegada_declarada_em && declaracaoMinha
        const confirmeiAgora = isDono && !confirmadaAntes && !!o?.chegada_confirmada_em
        if (declareiAgora || confirmeiAgora) { await buscar(); return }
      } catch (e2) { console.log('[DetalheObra] reconsulta pós-chegada falhou | code:', e2.code) }
      Alert.alert('Erro', err.mensagem || 'Não foi possível registrar a chegada.')
    } finally {
      if (mountedRef.current) setDeclarandoChegada(false)
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
          // { persistir } sem { timeout }: só o ERR_NETWORK duro insiste por 45 s. A
          // variante que trava fica de fora porque o match não é idempotente de fato —
          // repetido sobre um match já gravado, o servidor responde 409, que é 4xx e
          // nunca reexecuta. Quem transforma esse 409 em sucesso é a reconsulta abaixo.
          const resposta = await comRetry(() => api.post(`/obras/${obra.id}/match`, {}), { persistir: true })
          aplicarSucesso(resposta.match_feito_em)
        } catch (err) {
          console.log('[DetalheObra] falha ao confirmar match | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
          // Antes da reconsulta: suspenso, o match não saiu, e insistir só trocaria o
          // motivo verdadeiro por um "não foi possível confirmar".
          if (alertouSuspensao(err)) return
          // A 1ª tentativa pode ter dado certo no servidor mas a resposta se perdeu
          // (troca de rede), ou o retry recebeu 409 "já tem pintor". Reconsulta:
          // se o match já for deste pintor, trata como sucesso em vez de erro confuso.
          try {
            const atual = await obrasService.detalhe(obra.id)
            const obraAtual = atual?.obra || atual
            // Comparação em String como em pintorMatch/souPintorDoMatch (:778, :791): o id vem
            // número ou string conforme o endpoint, e com === o match que DEU certo era lido
            // como de outro pintor — a reconsulta não salvava nada e o alerta de erro subia
            // mesmo assim. Os != null vêm antes porque dois ids ausentes casariam.
            const matchId = obraAtual?.match_usuario_id
            if (matchId != null && usuario?.id != null && String(matchId) === String(usuario.id)) { aplicarSucesso(obraAtual.match_feito_em); return }
          } catch (e2) { console.log('[DetalheObra] reconsulta pós-match falhou | code:', e2.code) }
          Alert.alert('Erro', err.mensagem || 'Não foi possível confirmar.')
        }
      }}
    ])
  }

  const handleEncerrar = async () => {
    const concluirComSucesso = () => {
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
    }
    // Pedido registrado, mas a obra NÃO fechou: não mexe no status local, não abre o
    // ModalAvaliacao do dono e não volta à lista pelo ramo do pintor — avaliar e concluir
    // só fazem sentido depois que a outra parte confirmar. buscar() reidrata
    // encerramento_solicitado_por/_em, que trocam o rótulo do botão.
    const aguardarOutraParte = () => {
      buscar()
      Alert.alert('⏳ Aguardando a outra parte', 'Seu pedido de encerramento foi registrado. A obra será concluída quando a outra parte confirmar.')
    }
    const executar = async () => {
      try {
        const resp = await comRetry(() => api.post(`/obras/${obra.id}/encerrar`, {}))
        if (resp?.encerramento === 'pendente') { aguardarOutraParte(); return }
        concluirComSucesso()
      } catch (err) {
        console.log('[DetalheObra] falha ao encerrar obra | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
        // handleEncerrar é dos DOIS lados nesta tela, então cobre o pintor suspenso.
        if (alertouSuspensao(err)) return
        // Mesmo tratamento de handleEncerrarPrestador (DetalheReparo): a 1ª tentativa pode
        // ter sido aceita no servidor e só a resposta se perdeu (troca de rede). Reconsulta
        // antes de acusar erro — se a obra já está encerrada, segue como sucesso e o
        // ModalAvaliacao do dono abre. O detalhe volta { obra } ou a obra na raiz.
        try {
          const atual = await obrasService.detalhe(obra.id)
          if ((atual?.obra || atual)?.status === 'encerrada') { concluirComSucesso(); return }
          // O pedido pode ter sido registrado e só a resposta se perdeu: idem, é sucesso.
          if ((atual?.obra || atual)?.encerramento_solicitado_por != null) { aguardarOutraParte(); return }
        } catch (e2) { console.log('[DetalheObra] reconsulta pós-encerrar falhou | code:', e2.code) }
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
    Alert.alert('✅ Encerrar obra?', 'Confirme que o serviço foi concluído.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Encerrar', onPress: executar },
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
        { text: 'Não, fiquei satisfeito(a)', style: 'cancel', onPress: finalizarPosEncerrar },
        { text: 'Bloquear', style: 'destructive', onPress: async () => {
          // { timeout: true }: bloquear é IDEMPOTENTE (grava um estado, não cria
          // recurso). Um socket ocioso morto também se manifesta como timeout de
          // 30 s, e aqui isso é caro: o fluxo segue para finalizarPosEncerrar() e a
          // pessoa sai da tela achando que bloqueou. { servidor } fica fora — 5xx
          // significa que a requisição chegou.
          try { await comRetry(() => api.post('/usuarios/bloquear-prestador', { prestador_id: pintorId }), { timeout: true, persistir: true }) }
          catch (err) {
            console.log('[DetalheObra] falha ao bloquear pintor | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
            // Antes falhava calado: quem tocou "Bloquear" saía da tela achando que tinha
            // bloqueado. O alerta sobe antes do goBack e sobrevive à navegação.
            // SEM recarregarSeFalhaDeRede, de propósito: o bloqueio não aparece nesta tela
            // (vive na lista de bloqueados) e o fluxo segue para finalizarPosEncerrar(),
            // que sai daqui. Recarregar não mostraria nada sobre a ação e a falha de rede
            // voltaria a ser silenciosa — exatamente o bug que o alerta acima corrigiu.
            Alert.alert('Erro', err.mensagem || 'Não foi possível bloquear o profissional.')
          }
          finalizarPosEncerrar()
        } },
      ],
    )
  }

  const enviarAvaliacaoEncerrar = async (estrelas) => {
    try {
      await comRetry(() => api.post('/avaliacoes', { contrato_tipo: 'obra', contrato_id: obra.id, estrelas }))
    } catch (err) {
      console.log('[DetalheObra] falha ao enviar avaliação | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      // SEM recarregarSeFalhaDeRede, mesma razão do bloqueio logo acima: a avaliação não
      // é exibida nesta tela e o fluxo segue para oferecerBloqueioEncerrar(), então a
      // recarga não diria nada sobre a nota enviada — só apagaria o aviso.
      Alert.alert('Erro', err?.mensagem || 'Não foi possível enviar a avaliação. Tente novamente.')
    }
    oferecerBloqueioEncerrar()
  }

  const handleExpirarMatch = async () => {
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/expirar-match`, {}))
      setObra(prev => ({ ...prev, match_feito_em: null, match_usuario_id: null, pedido_tempo_status: null }))
      Alert.alert('⏰ Tempo esgotado', 'O profissional não chegou a tempo. A obra está disponível novamente.')
    } catch (err) { console.log('Erro ao expirar match:', err) }
  }

  // "O profissional não chegou": o dono contesta a declaração de chegada da outra parte.
  // Espelha DetalheReparoScreen — mesmo endpoint do relógio acima (/expirar-match), mas por
  // decisão de uma pessoa e não por prazo vencido, e por isso passa por confirmação: tira o
  // profissional da obra e o app não tem como refazer o match depois.
  // O erro NÃO é engolido como no onExpirar automático: lá ninguém tocou em nada; aqui houve
  // um toque, e um toque sem resposta faz a pessoa tocar de novo.
  const handleNaoChegou = async () => {
    const executar = async () => {
      try {
        await comRetry(() => api.post(`/obras/${obra.id}/expirar-match`, {}))
        await buscar()
        Alert.alert('Obra reaberta', 'O match foi desfeito e a obra voltou a ficar disponível para outros profissionais.')
      } catch (err) {
        console.log('[DetalheObra] falha ao expirar match por não chegada | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
        Alert.alert('Erro', err.mensagem || 'Não foi possível liberar a obra. Tente novamente.')
      }
    }
    // Espelha DetalheReparoScreen: o texto diz o que a ação faz (desfaz o match), onde a obra
    // vai parar (de volta ao feed, aberta a outros) e quando usá-la (só se ele realmente não
    // apareceu). Sem a terceira, "não chegou" vira o botão de quem está impaciente com um
    // profissional a caminho — e o estrago cai sobre alguém que não fez nada errado.
    Alert.alert(
      '🚫 O profissional não chegou?',
      'Isto desfaz o match: o profissional sai desta obra e ela volta para a lista de disponíveis, aberta a outros profissionais. Use apenas se ele realmente não apareceu no local — a ação não pode ser desfeita pelo app.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', style: 'destructive', onPress: executar },
      ]
    )
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
      // É AQUI que o dono recebe o 409 PROFISSIONAL_SUSPENSO ao tentar aceitar: o aceite
      // não vale, e o motivo é o profissional, não a conexão de quem está aceitando.
      if (alertouSuspensao(err)) return
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
      if (alertouSuspensao(err)) return
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
    } catch (err) {
      console.log('[DetalheObra] falha ao pedir tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      // Rede pura → recarrega: pedido_tempo_status é justamente o que a tela mostra, então
      // o estado do servidor responde sozinho se o pedido saiu ou não.
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) return
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar a solicitação.')
    }
  }

  const handleperguntarTempo = async () => {
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/perguntar-tempo`, {}))
      setObra(prev => ({ ...prev, pedido_tempo_status: 'aguardando_minutos' }))
      Alert.alert('✅ Profissional notificado!', 'Ele vai informar quantos minutos precisa.')
    } catch (err) {
      console.log('[DetalheObra] falha ao perguntar tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) return
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar.')
    }
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
    } catch (err) {
      console.log('[DetalheObra] falha ao informar tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) return
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar.')
    }
  }

  const handleResponderTempo = (aceito) => {
    Alert.alert(
      aceito ? '✅ Aceitar tempo extra?' : '❌ Recusar tempo extra?',
      aceito ? `O profissional precisará de ${obra.pedido_tempo_minutos} minuto(s) a mais.` : 'A obra voltará para disponível e o profissional será bloqueado.',
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
          } catch (err) {
            console.log('[DetalheObra] falha ao responder tempo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
            // Recarrega em vez de alertar: aceitar/recusar mexe em match_feito_em e no
            // pedido_tempo_status, ambos na tela. Note que o goBack() do ramo "recusar"
            // só acontece no sucesso — numa falha de rede a pessoa continua aqui, vendo
            // o estado real.
            if (await recarregarSeFalhaDeRede(err, recarregarObra)) return
            Alert.alert('Erro', err.mensagem || 'Não foi possível responder.')
          }
        }}
      ]
    )
  }

  const temMatch = obra?.match_feito_em && obra?.match_usuario_id
  // Obra finalizada é SOMENTE LEITURA. Encerrar não limpa match_feito_em/match_usuario_id,
  // então todo bloco pendurado apenas em temMatch/souPintorDoMatch continuaria ativo depois
  // da conclusão. Este flag é o gate único de todas as ações; os botões de Encerrar já testam
  // o status por conta própria e ficam como estão.
  const encerrada = obra?.status === 'encerrada'
  // Encerramento em duas etapas: quando uma parte pede, o servidor devolve
  // encerramento 'pendente' e a obra NÃO fecha — fecha só quando a outra confirma.
  // Enquanto pende, o status segue 'aberta', então `encerrada` continua false e a tela
  // permanece operável de propósito.
  // O detalhe não traz um campo 'encerramento': o pendente é inferido de quem pediu —
  // encerramento_solicitado_por preenchido (junto com encerramento_solicitado_em) na
  // linha da obra.
  const encerramentoPendente = obra?.encerramento_solicitado_por != null
  // Quem pediu vê "aguardando"; a outra parte vê "confirmar". Comparação em String como no
  // isDono; encerramentoPendente já garante o id do solicitante presente.
  const euSolicitei = encerramentoPendente && usuario?.id != null &&
    String(obra.encerramento_solicitado_por) === String(usuario.id)
  // Rótulo dos botões de encerrar (dono e pintor): o padrão só vale fora do pendente.
  const rotuloEncerrar = (padrao) =>
    euSolicitei ? '⏳ Aguardando a outra parte' : encerramentoPendente ? '✅ Confirmar encerramento' : padrao
  // Mesma comparação guardada do isDono/ehMatch: temMatch já garante match_usuario_id
  // presente, então só falta exigir o id do usuário logado antes de comparar em String.
  const souPintorDoMatch = temMatch && usuario?.id != null &&
    String(obra.match_usuario_id) === String(usuario.id)
  // Profissional FORA da disputa: ou foi recusado, ou o dono já escolheu outro. Para ele
  // o prazo desta obra deixou de ser um prazo — não é notícia dele, e ver o relógio correr
  // sugere que ainda há algo a fazer. Os dois vocabulários de recusa do backend estão
  // cobertos (ver a tabela STATUS_GRUPO em ContratosScreen.js:24).
  // O DONO nunca entra aqui: o prazo é da obra dele, ele vê a contagem em qualquer caso.
  // Quem ainda não se candidatou também fica de fora do flag — para esse a contagem é
  // justamente o sinal de urgência que o faz decidir.
  const minhaRecusada = minhaCandidatura?.status === 'recusado' || minhaCandidatura?.status === 'recusada'
  const foraDaDisputa = !isDono && (minhaRecusada || (temMatch && !souPintorDoMatch))
  // As duas grafias do aceite (ver STATUS_GRUPO em ContratosScreen.js:24), derivadas uma vez
  // porque agora dois blocos dependem do mesmo teste: o que oferece a ida ao local e o que
  // explica por que ela não está sendo oferecida. Espelha DetalheReparoScreen:1045.
  const minhaAceita = minhaCandidatura?.status === 'aceito' || minhaCandidatura?.status === 'aprovada'
  // Prazo vencido vem PRONTO do servidor (relógio do banco), o mesmo campo que o botão de
  // estender já usa (:1262). Não se compara expira_em com o relógio do aparelho: a hora
  // local adiantada faria esta tela discordar do servidor sobre o que ainda está de pé.
  const expirada = !!obra?.expirada
  // Mesma comparação guardada dos flags acima: sem ela um id de tipo diferente faria o find
  // devolver undefined, apagando o botão de WhatsApp e o nome no ModalAvaliacao.
  const pintorMatch = temMatch
    ? candidatos.find(c => c.usuario_id != null && String(c.usuario_id) === String(obra.match_usuario_id))
    : null
  // Texto único da chegada prometida, lido do timestamp do servidor e reusado pelos dois
  // lados (dono e pintor). Null quando não há promessa — ou quando a data não deu para
  // ler —, e aí os blocos que dependem dele não renderizam.
  const chegadaPrevistaTexto = textoChegada(obra?.chegada_prevista_em)
  // Chegada PROPOSTA e ainda não respondida. Mesmo formatador do combinado, pela mesma
  // razão: o dono decide sobre um horário, não sobre o rótulo "amanhã de manhã".
  const chegadaPendenteTexto = textoChegada(obra?.chegada_pendente_em)
  // Chegada AO LOCAL (etapa seguinte à janela combinada): uma parte declara, o dono
  // confirma. Os três estados abaixo são mutuamente exclusivos e cobrem o caminho todo.
  const chegadaDeclaradaTexto = textoChegada(obra?.chegada_declarada_em)
  const chegadaConfirmadaTexto = textoChegada(obra?.chegada_confirmada_em)
  const chegadaConfirmada = !!obra?.chegada_confirmada_em
  const chegadaAguardaConfirmacao = !!obra?.chegada_declarada_em && !chegadaConfirmada
  const chegadaNaoDeclarada = !obra?.chegada_declarada_em && !chegadaConfirmada
  // Declaração de chegada feita pela OUTRA parte — quem pode contestá-la é quem não a fez.
  // Mesma disciplina de String dos demais flags de identidade (souPintorDoMatch): os != null
  // vêm ANTES porque String(undefined) === String(undefined) daria "igual", e dois ids
  // ausentes fariam a declaração de terceiro passar por própria.
  // Sem chegada_declarada_por na resposta o flag fica false e o botão não aparece — lado
  // seguro, porque contestar desfaz o match e devolve a obra ao feed.
  const chegadaDeclaradaPorOutro = !!obra?.chegada_declarada_em &&
    obra?.chegada_declarada_por != null && usuario?.id != null &&
    String(obra.chegada_declarada_por) !== String(usuario.id)
  // Encerrar NÃO é travado pela chegada: o botão está sempre utilizável. Travá-lo punia
  // quem não tinha culpa — o profissional terminava o serviço e ficava refém de um toque
  // que só a outra parte podia dar, sem nenhuma saída dentro do app.
  // O aviso que ficava ao lado do botão saiu daqui: virou uma frase no modal de match,
  // dito UMA vez às duas partes no momento em que o combinado nasce, em vez de uma tarja
  // âmbar permanente sobre o botão. Encerrar segue livre — nunca houve bloqueio, e o
  // servidor já resolve a ordem devolvendo `encerramento: 'pendente'` quando falta a
  // confirmação da outra parte.
  const distancia = distanciaItemKm(coords, obra)

  const abrirWhatsApp = (telefone) => {
    const digitos = (telefone || '').replace(/\D/g, '')
    if (!digitos) { console.log('[DetalheObra] abrirWhatsApp chamado sem número — ignorado'); return }
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

  if (!obra) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
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
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
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
              /* videoOtimizado, e não a URL crua: este player é o único lugar que baixa
                 o vídeo inteiro. O estado guarda a URL ORIGINAL de propósito — a
                 transformação é de entrega, aplicada na leitura, e nada a persiste. */
              source={{ uri: videoOtimizado(videoFullscreen) }}
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

          {/* !encerrada: o rótulo ("📅 Hoje") descreve o prazo CONFIGURADO, não o tempo que
              resta — não muda com a aproximação e não sabia nada do encerramento. Numa obra
              concluída ele seguia no topo anunciando urgência. Some o banner inteiro: sem
              prazo a correr, nem o rótulo nem o texto de prazo têm o que dizer. */}
          {/* !souPintorDoMatch: para quem JÁ ganhou a obra o prazo do anúncio não é mais
              informação — o que vale para ele é o cronômetro da chegada, logo abaixo.
              Dono e demais profissionais seguem vendo. */}
          {/* !(isDono && temMatch): fechado o match, o prazo do ANÚNCIO parou de valer
              também para o dono — o que corre agora é o cronômetro da chegada. */}
          {!encerrada && !souPintorDoMatch && !(isDono && temMatch) && (obra.horas_para_expirar || obra.prazo_execucao_horas) && (
            <View style={estilos.urgenciaBanner}>
              <Text style={estilos.urgenciaTexto}>
                {(obra.horas_para_expirar || obra.prazo_execucao_horas) <= 24 ? '📅 Hoje'
                  : (obra.horas_para_expirar || obra.prazo_execucao_horas) <= 168 ? '📆 Esta semana'
                  : (obra.horas_para_expirar || obra.prazo_execucao_horas) <= 720 ? '🗓️ Este mês'
                  : (obra.horas_para_expirar || obra.prazo_execucao_horas) <= 1440 ? '📋 Mês que vem'
                  : '⏳ Mais de um mês'}
              </Text>
              {/* Contagem pré-match: some para quem está fora da disputa (recusado ou
                  dono já escolheu outro) e em obra encerrada — ali não há mais prazo a
                  correr para ninguém, nem para o dono, e o contador ficava vivo (ou
                  cravado em EXPIRADO) numa obra já concluída. Cai no texto neutro em vez
                  de deixar buraco no banner. */}
              {obra.expira_em && !foraDaDisputa && !encerrada
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
          {/* Endereço do serviço em destaque para o profissional, acima da linha de
              cidade/bairro e sem depender mais do match: basta a API devolver o endereço.
              O dono vê o mesmo dado na linha simples abaixo — os dois blocos são mutuamente
              exclusivos por isDono, então o endereço nunca renderiza duas vezes. */}
          {obra.endereco_obra && !isDono ? (
            <View style={estilos.enderecoMatchBox}>
              <Text style={estilos.enderecoMatchLabel}>📍 Endereço do serviço:</Text>
              <Text style={estilos.enderecoMatchTexto}>{obra.endereco_obra}</Text>
              {/* Opcional no cadastro: só ocupa espaço quando o dono realmente informou. */}
              {obra.ponto_referencia ? (
                <Text style={estilos.pontoReferenciaTexto}>🔎 Referência: {obra.ponto_referencia}</Text>
              ) : null}
            </View>
          ) : null}
          {/* Para o DONO a linha de cidade/bairro só sobra quando NÃO há endereço completo:
              tendo endereço, ela seria uma versão mais pobre da linha logo abaixo. E a
              distância nunca entra — ela mede o GPS de quem olha até a obra, então no dono
              seria a distância dele até a própria demanda, número que não informa nada a
              quem publicou. A visão do profissional segue exatamente como estava. */}
          {/* Também some para o profissional do MATCH quando há endereço completo: a caixa
              acima já traz rua, número, bairro e cidade, e a distância deixa de importar
              depois que a obra é dele. */}
          {!((isDono || souPintorDoMatch) && obra.endereco_obra) && (
            <Text style={estilos.local}>
              📍 {obra.cidade}{obra.bairro ? `, ${obra.bairro}` : ''}
              {!isDono && distancia != null && <Text style={estilos.localDistancia}>{`  ·  ${formatarDistancia(distancia)}`}</Text>}
            </Text>
          )}
          {isDono && obra.endereco_obra ? (
            <>
              <Text style={estilos.enderecoLinha}>📍 {obra.endereco_obra}</Text>
              {obra.ponto_referencia ? (
                <Text style={estilos.pontoReferenciaLinha}>🔎 Referência: {obra.ponto_referencia}</Text>
              ) : null}
            </>
          ) : null}

          {/* Pós-match a descrição e a mídia empurram o cronômetro e os botões para fora da
              primeira tela. Viram um acordeão fechado: seguem a um toque, sem custar a
              dobra. Só para o profissional do match — dono e demais veem tudo aberto. */}
          {souPintorDoMatch && (
            <TouchableOpacity style={estilos.togglePedido} onPress={() => setMostrarPedido(v => !v)} activeOpacity={0.8}>
              <Text style={estilos.togglePedidoTexto}>
                {mostrarPedido ? '▲ Ocultar detalhes da obra' : '▼ Ver detalhes da obra'}
              </Text>
            </TouchableOpacity>
          )}

          {(!souPintorDoMatch || mostrarPedido) && obra.descricao && (
            <>
              <Text style={estilos.secaoTitulo}>Descrição</Text>
              <Text style={estilos.descricao}>{obra.descricao}</Text>
            </>
          )}

          {(!souPintorDoMatch || mostrarPedido) && (midias.length > 0 ? (
            <>
              <Text style={estilos.secaoTitulo}>Fotos e vídeos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {midias.map((midia, i) => (
                  <TileMidia
                    key={i}
                    midia={midia}
                    emoji={emojiObra(obra.categoria)}
                    onPress={() => midia.tipo === 'video' ? setVideoFullscreen(midia.url) : setFotoFullscreen(midia.url)}
                  />
                ))}
              </ScrollView>
            </>
          ) : obra?.status === 'encerrada' ? (
            <View style={estilos.avisoMidiaRemovida}>
              <Text style={estilos.avisoMidiaRemovidaIcone}>📷</Text>
              <Text style={estilos.avisoMidiaRemovidaTexto}>Mídia removida automaticamente após 7 dias da conclusão do serviço</Text>
            </View>
          ) : null)}

          {/* Paridade com DetalheReparo: a contagem NÃO deve renderizar quando encerrada
              (evita, inclusive, o onExpirar disparar /expirar-match numa obra concluída).
              (souPintorDoMatch || isDono): a contagem é das DUAS partes do match. Todo bloco
              da era pós-match ao redor já checa quem é quem; este não checava, então um
              candidato recusado via o relógio do vencedor — e, pior, ao zerar o onExpirar
              disparava POST /obras/:id/expirar-match do aparelho DELE, seguido do alerta
              "o profissional não chegou a tempo" como se fosse participante. */}
          {/* Alvo da contagem: a chegada PROMETIDA quando existe, senão o prazo da obra.
              onExpirar só acompanha o alvo expira_em. Zerar a promessa das 14h não
              significa que o prazo da obra acabou, e disparar /expirar-match ali
              devolveria a obra ao Rol no meio da janela ainda válida — o mesmo estrago
              que o gate de identidade abaixo evita para quem nem é do match. Sem prazo
              vencido não há match a expirar; com promessa no ar, quem cuida do prazo real
              é o job verificarCronometroObras. */}
          {/* !chegadaConfirmada: confirmada a chegada, a contagem sai de cena — ela media o
              tempo ATÉ chegar, e esse prazo já foi cumprido. Deixá-la correndo ali passaria
              a cobrar um atraso que não existe mais. */}
          {(souPintorDoMatch || isDono) && temMatch && obra.expira_em && !chegadaConfirmada && !encerrada && (
            <RelogioRegressivo
              expiraEm={obra.chegada_prevista_em || obra.expira_em}
              onExpirar={obra.chegada_prevista_em ? undefined : handleExpirarMatch}
            />
          )}

          {/* No lugar da contagem, o marco de início do serviço — para as DUAS partes do
              match, mesma regra de identidade da contagem que ele substitui. O horário sai
              de chegada_confirmada_em; ilegível, o bloco ainda aparece sem a data, porque
              "em andamento" é a informação principal e não depende dela. */}
          {(souPintorDoMatch || isDono) && temMatch && chegadaConfirmada && !encerrada && (
            <View style={estilos.emAndamentoBox}>
              <Text style={estilos.emAndamentoTexto}>
                ▶️ Em andamento{chegadaConfirmadaTexto ? ` desde ${chegadaConfirmadaTexto}` : ''}
              </Text>
            </View>
          )}

          {temMatch && !encerrada && (
            <View style={estilos.contratoBanner}>
              <Text style={estilos.contratoBannerTitulo}>📋 Contrato enviado por e-mail</Text>
              <Text style={estilos.contratoBannerTexto}>
                Enviamos um contrato simples para o seu e-mail e para o da outra parte. Usar é opcional — mas é ele que protege vocês dois.
              </Text>
            </View>
          )}

          {isDono && (
            <>
              {obra.status === 'aberta' && !obra.match_usuario_id && (
                <TouchableOpacity
                  style={[{ backgroundColor: '#2a2200', borderWidth: 1, borderColor: '#E8833A', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 12 }, obra.expirada && { opacity: 0.6 }]}
                  onPress={() => setModalEstender(true)}
                  disabled={obra.expirada}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#E8833A' }}>{obra.expirada ? 'Prazo encerrado' : '⏳ Aumentar tempo para serviço'}</Text>
                </TouchableOpacity>
              )}
              <ModalEstenderPrazo
                visivel={modalEstender}
                unidade="dias"
                onEstender={handleEstender}
                onFechar={() => setModalEstender(false)}
              />
              {/* Chegada PROPOSTA, aguardando a resposta do dono. Sem temMatch no gate,
                  de propósito: a janela é proposta ANTES de o profissional partir, e
                  exigir o match aqui esconderia justamente a pergunta cuja resposta
                  destrava o combinado. Reusa a caixa do pedido de tempo — é a mesma
                  situação: o profissional pede, o dono decide. */}
              {obra.chegada_pendente_em && !encerrada && (
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
              {obra.chegada_prevista_em && !encerrada && (
                <View style={estilos.chegadaBox}>
                  <Text style={estilos.chegadaTexto}>🚚 Chegada prometida: {chegadaPrevistaTexto}</Text>
                </View>
              )}
              {temMatch && pintorMatch?.telefone && !encerrada && (
                <TouchableOpacity
                  style={estilos.btnWhatsApp}
                  onPress={() => abrirWhatsApp(pintorMatch.telefone)}
                >
                  <Text style={estilos.btnWhatsAppTexto}>💬 WhatsApp do profissional: {pintorMatch.telefone}</Text>
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
              {/* A outra resposta à mesma declaração, logo abaixo do "Confirmar chegada":
                  quem declarou foi o profissional, e o dono diz que não foi o que aconteceu.
                  As duas saídas ficam juntas de propósito — separadas, a de contestar viraria
                  um caminho escondido para quem está esperando alguém que não veio. */}
              {chegadaDeclaradaPorOutro && !encerrada && (
                <TouchableOpacity style={estilos.btnNaoChegou} onPress={handleNaoChegou}>
                  <Text style={estilos.btnNaoChegouTexto}>🚫 O profissional não chegou</Text>
                </TouchableOpacity>
              )}
              {temMatch && chegadaNaoDeclarada && !encerrada && (
                <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleChegada} disabled={declarandoChegada}>
                  <Text style={estilos.btnPerguntarTempoTexto}>{declarandoChegada ? 'Registrando…' : '🚶 Profissional chegou'}</Text>
                </TouchableOpacity>
              )}
              {temMatch && obra?.status !== 'encerrada' && (
                <TouchableOpacity style={[estilos.btnEncerrar, euSolicitei && { opacity: 0.6 }]} onPress={handleEncerrar} disabled={euSolicitei}>
                  <Text style={estilos.btnEncerrarTexto}>{rotuloEncerrar('✅ Confirmar conclusão — Encerrar obra')}</Text>
                </TouchableOpacity>
              )}
              {temMatch && obra.pedido_tempo_status === 'aguardando_tempo' && !encerrada && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>⚠️ Profissional precisa de mais tempo</Text>
                  <Text style={estilos.pedidoAlertaMotivo}>Motivo: {obra.pedido_tempo_motivo}</Text>
                  <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleperguntarTempo}>
                    <Text style={estilos.btnPerguntarTempoTexto}>⏱ Quanto tempo a mais você precisa?</Text>
                  </TouchableOpacity>
                </View>
              )}
              {temMatch && obra.pedido_tempo_status === 'aguardando_minutos' && !encerrada && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o profissional informar quantos minutos precisa...</Text>
                </View>
              )}
              {temMatch && obra.pedido_tempo_status === 'aguardando_aprovacao' && !encerrada && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>⏳ Profissional precisa de mais tempo</Text>
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
              <Text style={[estilos.secaoTitulo, { marginTop: 20 }]}>🎨 Profissionais candidatos ({candidatos.length})</Text>
              {candidatos.length === 0 ? (
                <View style={estilos.vazioInteressados}>
                  <Text style={estilos.vazioInteressadosTexto}>Nenhum profissional demonstrou interesse ainda.{'\n'}Aguarde as notificações!</Text>
                </View>
              ) : (
                candidatos.map((item) => {
                  // Contato (telefone/endereço completo) só é liberado para o pintor MATCHED,
                  // não em 'aceito'. Deriva do match, não do status. (Novo contrato da API:
                  // telefone/logradouro voltam null até o pintor confirmar que está a caminho.)
                  // Comparação em String como no isDono. temMatch já garante
                  // obra.match_usuario_id presente; falta exigir o id do candidato.
                  const ehMatch = temMatch && item.usuario_id != null &&
                    String(item.usuario_id) === String(obra.match_usuario_id)
                  // Aceite nas duas grafias do backend (ver STATUS_GRUPO em
                  // ContratosScreen.js:24), como já se faz no painel do próprio candidato
                  // logo abaixo. Derivado uma vez porque os dois badges de aceite —
                  // com e sem match — precisam do mesmo teste.
                  const foiAceito = item.status === 'aceito' || item.status === 'aprovada'
                  const expTexto = formatarExperiencia(item.anos_experiencia)
                  const equipeN = Number(item.tamanho_equipe)
                  const linhaQualif = [expTexto, equipeN > 1 ? `equipe de ${equipeN}` : null].filter(Boolean).join(' · ')
                  // Recusado vira LINHA, não card. O card inteiro — avatar, cidade,
                  // valores, questionário, badge — existe para o dono DECIDIR, e sobre
                  // este ele já decidiu. Resta reconhecer quem é, caso mude de ideia.
                  // Aceita as duas grafias de recusa (ver STATUS_GRUPO em
                  // ContratosScreen.js:24); 'recusada' é a do endpoint legado e de fato
                  // aparece aqui, então só 'recusado' deixaria metade das linhas como card.
                  if (item.status === 'recusado' || item.status === 'recusada') {
                    const nota = item.avaliacoes_total > 0
                      ? `⭐ ${Number(item.avaliacoes_media).toFixed(1)} (${item.avaliacoes_total})`
                      : '🆕 Novo'
                    return (
                      <View key={item.id} style={estilos.recusadoLinha}>
                        {/* ✗ no nome: a borda vermelha sozinha deixaria o estado por conta
                            da cor, invisível para quem não a distingue. */}
                        <Text style={estilos.recusadoNome} numberOfLines={1}>✗ {item.nome}</Text>
                        <Text style={estilos.recusadoMeta} numberOfLines={1}>
                          {[nota, linhaQualif].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    )
                  }
                  const espTexto = especialidadesTexto(item.especialidades)
                  // Fechado o match, o valor do pintor escolhido não é mais proposta: vira o
                  // combinado, mesma troca de rótulo do topo da tela. QUAL linha carrega esse
                  // valor segue o COALESCE(contraproposta, proposto) usado lá — havendo
                  // contraproposta é ela que vale, e a de cima segue sendo a proposta original.
                  const propostoEhCombinado = ehMatch && item.valor_contraproposta == null
                  // "Aceitou o meu preço": o botão do profissional COPIA o valor pedido para
                  // valor_proposto (handleInteresse, :265) e não manda flag nenhuma — a
                  // igualdade com o pedido é o ÚNICO sinal que chega aqui. Fonte do pedido é
                  // sempre obra.valor || obra.valor_estimado, o mesmo par que o botão lê.
                  // Exige pedido > 0, a mesma guarda do botão em :1211: sem valor pedido,
                  // 0 === 0 anunciaria um aceite que não houve. Pedido ausente vira NaN, que
                  // nunca é igual a nada, então cai no rótulo neutro.
                  // Não vale quando já é "Valor combinado" — ali o match já foi fechado.
                  const valorPedidoObra = Number(obra.valor || obra.valor_estimado || 0)
                  const aceitouValorPedido = !propostoEhCombinado && valorPedidoObra > 0 &&
                    Number(item.valor_proposto) === valorPedidoObra
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
                            disputavam largura com ele e o endereço completo do pintor do
                            match espremia tudo. Em linha própria, quebram naturalmente. */}
                        {/* Cidade e, quando houver, bairro depois da vírgula — mesma ordem da
                            linha de local da obra no topo da tela. */}
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
                              onPress={() => { api.get('/health').catch(() => {}); setContrapropostaCandidaturaId(item.id) }}
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
                        dele no card do candidato. */}
                    {foiAceito && ehMatch && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 12, color: '#4caf50', fontWeight: '600' }}>
                          {chegadaConfirmada ? '▶️ Serviço em andamento' : '✅ Proposta aceita — profissional a caminho.'}
                        </Text>
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
              {souPintorDoMatch && chegadaNaoDeclarada && !encerrada && (
                <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleChegada} disabled={declarandoChegada}>
                  <Text style={estilos.btnPerguntarTempoTexto}>{declarandoChegada ? 'Registrando…' : '🚶 Cheguei no local do serviço'}</Text>
                </TouchableOpacity>
              )}
              {souPintorDoMatch && chegadaAguardaConfirmacao && !encerrada && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante confirmar sua chegada...</Text>
                </View>
              )}
              {souPintorDoMatch && obra?.status !== 'encerrada' && (
                <TouchableOpacity style={[estilos.btnEncerrar, euSolicitei && { opacity: 0.6 }]} onPress={handleEncerrar} disabled={euSolicitei}>
                  <Text style={estilos.btnEncerrarTexto}>{rotuloEncerrar('✅ Serviço concluído — Encerrar')}</Text>
                </TouchableOpacity>
              )}
              {/* !chegadaConfirmada: pedir mais tempo é sobre o prazo ATÉ chegar, e esse
                  prazo acabou quando o dono confirmou a chegada. Mesma razão pela qual a
                  contagem regressiva sai de cena nesse momento. */}
              {souPintorDoMatch && !obra.pedido_tempo_status && !chegadaConfirmada && !encerrada && (
                <TouchableOpacity style={estilos.btnPedirTempo} onPress={handlePedirTempo}>
                  <Text style={estilos.btnPedirTempoTexto}>⚠️ Preciso de mais tempo para chegar</Text>
                </TouchableOpacity>
              )}
              {souPintorDoMatch && obra.pedido_tempo_status === 'aguardando_tempo' && !encerrada && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante responder sua solicitação...</Text>
                </View>
              )}
              {souPintorDoMatch && obra.pedido_tempo_status === 'aguardando_minutos' && !encerrada && (
                <TouchableOpacity style={estilos.btnInformarTempo} onPress={handleInformarTempo}>
                  <Text style={estilos.btnInformarTempoTexto}>⏱ Informar quantos minutos preciso</Text>
                </TouchableOpacity>
              )}
              {souPintorDoMatch && obra.pedido_tempo_status === 'aguardando_aprovacao' && !encerrada && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante aceitar os {obra.pedido_tempo_minutos} minuto(s) extra...</Text>
                </View>
              )}
              {!temMatch && !encerrada && (
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
                    {/* Prazo vencido: nada de oferecer a ida ao local. Espelha
                        DetalheReparoScreen — o bloco abaixo promete "você foi selecionado" e
                        arma a contagem regressiva de uma obra cujo anúncio já venceu. O aviso
                        que substitui diz o que houve e para onde ir (só o dono estende o
                        prazo, :1262). */}
                    {minhaAceita && expirada && (
                      <>
                        <Text style={{ color: '#f44336', fontWeight: '600', marginBottom: 6 }}>⏰ Prazo vencido</Text>
                        <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20 }}>Sua proposta foi aceita, mas o prazo desta obra venceu antes da sua ida ao local. Fale com o solicitante: ele pode aumentar o tempo do serviço para vocês seguirem.</Text>
                      </>
                    )}
                    {minhaAceita && !expirada && (
                      <>
                        <Text style={{ color: '#4caf50', fontWeight: '600', marginBottom: 6 }}>✅ Proposta aceita!</Text>
                        <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20, marginBottom: 12 }}>Parabéns! Você foi selecionado. Confirme sua ida ao local:</Text>
                        {/* Janela de chegada, ACIMA do botão de partida: prometer o horário
                            é o passo anterior a "estou a caminho". Some assim que houver
                            promessa — trocada pelo horário que o servidor calculou, para o
                            profissional ver o mesmo compromisso que o dono lê. */}
                        {obra.chegada_prevista_em ? (
                          <Text style={estilos.chegadaConfirmada}>✅ Você prometeu chegar {chegadaPrevistaTexto}</Text>
                        ) : obra.chegada_pendente_em ? (
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
                          <Text style={estilos.btnMatchTexto}>🎨 Estou a caminho! Iniciar contagem →</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {/* Reusa o MESMO flag do foraDaDisputa: antes este painel testava só
                        'recusado', então uma candidatura recusada pelo endpoint legado
                        ('recusada', ver STATUS_GRUPO em ContratosScreen.js:24) caía num
                        painel vazio — sem aviso nenhum de que estava fora. */}
                    {minhaRecusada && (
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
                          ⚠️ Se você propuser outro valor, a obra ainda ficará disponível para outros profissionais até que o solicitante aceite. Pense bem!
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
      </KeyboardAvoidingView>

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
  // Folga extra no fim da rolagem para o teclado não cobrir o último campo
  // (contraproposta) — o padding horizontal/topo continua vindo de `corpo`.
  // +barraServico: espelha DetalheReparoScreen — a barra do rodapé flutua sobre esta tela e
  // cobriria o último botão da rolagem, que aqui é sempre um botão de ação.
  scroll: { flexGrow: 1, paddingBottom: 40 + alturas.barraServico },
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
  // Sem marginTop negativo: ele existia para encostar na linha de cidade/bairro, que o
  // dono deixou de ver quando há endereço completo — e é exatamente aí que esta linha
  // aparece. Sem a linha acima, o negativo puxava o endereço para cima do título.
  enderecoLinha: { fontSize: 12, color: cores.textoFraco, marginBottom: 16, lineHeight: 17 },
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
  togglePedido: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  togglePedidoTexto: { fontSize: 13, fontWeight: '600', color: cores.textoMedio },
  descricao: { fontSize: 13, color: cores.textoMedio, lineHeight: 22, marginBottom: 20 },
  midiaItem: { width: 110, height: 82, marginRight: 10, borderRadius: 10, overflow: 'hidden' },
  midiaImagem: { width: '100%', height: '100%' },
  // Placeholder do tile que não renderizou. Mesmo cinza do thumbVazia dos feeds; o
  // ícone é maior porque o tile é 160x120dp, contra os 64dp do thumb de lá.
  midiaVazia: { backgroundColor: '#2E2E2E', alignItems: 'center', justifyContent: 'center' },
  midiaVaziaIcone: { fontSize: 40 },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  avisoMidiaRemovida: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, marginBottom: 20 },
  avisoMidiaRemovidaIcone: { fontSize: 20 },
  avisoMidiaRemovidaTexto: { flex: 1, fontSize: 12, color: cores.textoFraco, lineHeight: 18 },
  // Mesmo raio e mesmo padding do botão primário desta tela, para as duas barras terem a
  // MESMA altura; a diferença é o preenchimento — contorno aqui, sólido lá.
  relogioBarra: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent', borderWidth: 1.5, borderColor: cores.primaria, borderRadius: raios.medio, padding: 16, marginBottom: 16 },
  relogioExpirado: { borderColor: '#666' },
  relogioBarraLabel: { fontSize: 14, fontWeight: '600', color: cores.textoMedio },
  // Barra vermelha à esquerda no lugar do badge "❌ Recusado" que a linha substituiu:
  // marca o estado sem gastar uma terceira linha de texto.
  recusadoLinha: { borderLeftWidth: 2, borderLeftColor: cores.perigo, paddingLeft: 10, paddingVertical: 8, marginBottom: 8, opacity: 0.75 },
  recusadoNome: { fontSize: 13, fontWeight: '600', color: cores.textoMedio },
  recusadoMeta: { fontSize: 11, color: cores.textoFraco, marginTop: 2 },
  relogioTempo: { fontSize: 16, fontWeight: '700', color: cores.primaria, fontVariant: ['tabular-nums'], letterSpacing: 1 },
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
  // Contorno, não preenchido: fica ao lado do "Confirmar chegada" sólido e não pode competir
  // com ele — desfazer o match é a saída de exceção, não o caminho esperado.
  btnNaoChegou: { backgroundColor: 'transparent', borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.medio, padding: 12, alignItems: 'center', marginTop: 10 },
  btnNaoChegouTexto: { fontSize: 13, fontWeight: '700', color: cores.perigo },
  pedidoBox: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginTop: 10 },
  pedidoTexto: { fontSize: 13, color: cores.textoMedio, textAlign: 'center', lineHeight: 20 },
  // Aviso (não bloqueio) acima do botão de encerrar. Mesma paleta âmbar do pedidoAlertaBox
  // — é a cor que esta tela já usa para "leia antes de agir" —, em caixa mais discreta:
  // não pede um toque, só informa a ordem recomendada.
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
  // Janela de chegada (pintor, antes de partir). As opções quebram em várias linhas
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
