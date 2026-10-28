import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  TouchableOpacity, ActivityIndicator, Alert, TextInput, Linking, Modal, AppState
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'react-native'
import { VideoView, useVideoPlayer } from 'expo-video'
import api, { obrasService } from '../../services/api'
import { pedirAvaliacaoLoja } from '../../services/avaliacaoLoja'
import { useAuth } from '../../contexts/AuthContext'
import { useFocusEffect } from '@react-navigation/native'
import { BotaoPrimario, BotaoSecundario, AvisoContatoOculto } from '../../components'
import { celebracaoRef } from '../../components/CelebracaoMatchHost'
import ModalEstenderPrazo from '../../components/ModalEstenderPrazo'
import ModalAumentarValor from '../../components/ModalAumentarValor'
import BannerErroCarregamento from '../../components/BannerErroCarregamento'
import ModalAvaliacao from '../../components/ModalAvaliacao'
import VerificacaoIdentidadeSheet, { useVerificacaoIdentidade } from '../../components/VerificacaoIdentidadeSheet'
import { comRetry, ehContaSuspensa, ehProfissionalSuspenso, recarregarSeFalhaDeRede } from '../../utils/rede'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'
import { distanciaItemKm, formatarDistancia, useCoordsUsuario } from '../../utils/distancia'
import { avatar, media, full, videoOtimizado } from '../../utils/imagemOtimizada'
import { thumbnailDeCapa, FRAME_TILE_DETALHE } from '../../utils/thumbnail'
import { emojiObra, rotulosEspecialidades, rotuloCategoria } from '../../utils/categorias'
import { formatarDuracao } from '../../utils/tempo'
import { urgenciaObra, SEM_URGENCIA } from '../../utils/urgencia'
import { CardAgendamento, CaixaReputacao, CaixaConcluaPeloApp, ModalCompareceu, diaAgendadoChegou, primeiroNome } from '../../components/Agendamento'
import TelaPosMatch from '../../components/PosMatchFixo'
import { CardPerguntasProfissional, BotaoPerguntar, ModalPerguntar, CardPerguntasDono } from '../../components/PerguntasDemanda'
import { ChipEmbaixador } from '../../components/Indicacao'
import { SheetCancelamento } from '../../components/CancelamentoMatch'
import { ModalDetalhesDemanda, ModalPedirAtraso, horaDe, camposAtrasoDe, mensagemErroAtraso } from '../../components/PosMatchAgendamento'
import ModalSuporte from '../../components/ModalSuporte'
import { simularCancelamento, cancelarMatch, pedirCancelamentoAcordo, responderPedidoCancelamento, pedidoCancelamentoDe, pedidoEhMeu } from '../../utils/cancelamento'
import { aoPushRecebido } from '../../utils/eventosPush'

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

// As três janelas fixas ('hoje' | 'amanha_manha' | 'amanha_tarde') saíram daqui: o
// profissional agora propõe dia + hora (components/Agendamento), e a API continua aceitando
// os rótulos antigos só para os apps já nas lojas.

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

// Data absoluta com dia da semana, para o Alert de confirmação do aumento de prazo:
// "terça-feira, 21/10 às 14:30". Tabela fixa em vez de Intl: o texto não pode depender
// do que o motor JS do aparelho sabe de pt-BR. Instante ilegível devolve '—'.
const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']
const formatarVencimento = (ms) => {
  if (!Number.isFinite(ms)) return '—'
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${DIAS_SEMANA[d.getDay()]}, ${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`
}

// Prévia do novo vencimento, espelhando o CASE de POST /obras/:id/estender:
//   faixa "Hoje" (prazo_modo='hoje') → o prazo é FIM DE DIA: soma dias inteiros
//     (ceil(horas/24), mínimo 1) ao dia mais tardio entre o do prazo e o de hoje, e volta
//     ao fim desse dia (23:59 na tela; o servidor grava 1 µs antes da meia-noite);
//   demais faixas → GREATEST(expira_em, NOW()) + horas.
// A zona é a do aparelho: é a mesma que o dono tinha ao gravar prazo_timezone.
const preverNovoVencimento = (expiraEm, horas, prazoModo) => {
  const agoraMs = Date.now()
  const atualMs = expiraEm ? new Date(expiraEm).getTime() : NaN
  const baseMs = Number.isFinite(atualMs) ? Math.max(atualMs, agoraMs) : agoraMs
  if (prazoModo !== 'hoje') return { atualMs, novoMs: baseMs + horas * 3600000 }
  const dias = Math.max(1, Math.ceil(horas / 24))
  const b = new Date(baseMs)
  const fimDoDia = new Date(b.getFullYear(), b.getMonth(), b.getDate() + dias + 1, 0, 0, 0, 0)
  return { atualMs, novoMs: fimDoDia.getTime() - 60000 }
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

// `cor`: a da faixa do banner em que o contador mora (utils/urgencia.js), para a contagem
// não ficar vermelha numa tarja cinza. EXPIRADO segue vermelho: é estado, não faixa.
const ContadorExpiracaoObra = ({ expiraEm, cor = '#f44336' }) => {
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
      // `ms` vai junto: é o que utils/tempo.js formata; d/h/m seguem para os limiares de urgência.
      setRestante({ d, h, m, s, ms: diff })
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiraEm])

  if (!restante) {
    return <Text style={{ fontSize: 12, color: '#f44336', fontWeight: '700' }}>EXPIRADO</Text>
  }

  const { d, h, m } = restante
  const texto = `Expira em: ${formatarDuracao(restante.ms, { frente: 'obra' })}`
  const urgente = d === 0 && h === 0 && m < 10
  return <Text style={{ fontSize: 12, color: cor, fontWeight: urgente ? '700' : '500' }}>{texto}</Text>
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

// GET /obras/:id devolve alguns campos AO LADO de `obra` (routes/index.js, res.json do
// detalhe): prazo_chegada / tolerancia_ate / atrasado / pedido_atraso / pedidos_atraso_restantes
// (camposAtraso), dono_nome / dono_foto_url e sugestoes_restantes. Os blocos pós-match leem
// tudo da linha, então eles entram nela aqui. Linha nula/ausente fica como veio.
const mesclarTopo = (resposta, linha) => {
  if (!linha || typeof linha !== 'object' || !resposta || typeof resposta !== 'object') return linha
  const extra = camposAtrasoDe(resposta)
  for (const k of ['dono_nome', 'dono_foto_url', 'sugestoes_restantes']) if (k in resposta) extra[k] = resposta[k]
  return { ...linha, ...extra }
}

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
        setRestante({ d: 0, h: 0, m: 0, s: 0, ms: 0 })
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
      // `ms` vai junto: é o que utils/tempo.js formata; d/h/m seguem para os limiares de urgência.
      setRestante({ d, h, m, s, ms: diff })
    }
    calcular()
    const interval = setInterval(calcular, 1000)
    return () => clearInterval(interval)
  }, [expiraEm])

  // Mesmo limiar de antes — o "00:" inicial só era verdade abaixo de 1 hora —, agora
  // lido dos campos em vez do texto, que não é mais hh:mm:ss.
  const urgente = !!restante && restante.d === 0 && restante.h === 0
  const tempo = restante ? formatarDuracao(restante.ms, { frente: 'obra' }) : ''
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


// Player do modal de vídeo. Componente próprio porque useVideoPlayer é um hook e o
// player só existe enquanto o modal está aberto: montar/desmontar este componente
// cria e libera o player junto com o modal. Equivale ao <Video useNativeControls
// resizeMode="contain" shouldPlay> do expo-av que ele substitui.
function PlayerFullscreen({ uri }) {
  const player = useVideoPlayer(uri, (p) => { p.play() })
  return <VideoView player={player} style={{ width: '100%', height: '50%' }} nativeControls contentFit="contain" />
}

export default function DetalheObraScreen({ route, navigation }) {
  // abrirComparecimento: vem do toque no push 'confirmar_comparecimento' (AppNavigator) e
  // abre o modal "O profissional veio?" assim que o detalhe confirma que a pergunta vale.
  const { obra: obraInicial, abrirComparecimento } = route.params
  const { usuario, assinatura, assinaturaAtiva } = useAuth()
  const verificacao = useVerificacaoIdentidade()
  const [obra, setObra] = useState(obraInicial)
  // Falha da RECARGA, não "obra inexistente": a tela segue mostrando o objeto semeado
  // pelo param da lista, que pode estar desatualizado — é isso que o banner avisa.
  const [erro, setErro] = useState(null)
  const [avaliarVisivel, setAvaliarVisivel] = useState(false)
  // Armado por enviarAvaliacaoEncerrar (dono, nota 4-5); consumido em finalizarPosEncerrar.
  const pedirLojaRef = useRef(false)
  const [midias, setMidias] = useState([])
  // Teto POR EXTENSÃO (GET /obras/:id devolve extensao_maxima_horas ao LADO de `obra`,
  // não dentro dela — por isso tem estado próprio). null = servidor não informou.
  const [extensaoMaximaHoras, setExtensaoMaximaHoras] = useState(null)
  // Advisory do aumento de valor. Mesmo motivo: GET /obras/:id devolve pode_aumentar_valor
  // e valor_minimo_aumento ao LADO de `obra` (advisoryAumentoValor na API). A leitura
  // antiga, dentro de `obra`, nunca achava nada e o botão nunca aparecia; ela fica como
  // fallback caso alguma versão da API os coloque na linha.
  const [aumentoValor, setAumentoValor] = useState({ pode: false, minimo: null })
  const [minhaCandidatura, setMinhaCandidatura] = useState(null)
  const [candidatos, setCandidatos] = useState([])
  // Perguntas públicas sobre a obra (campo `perguntas` ao LADO de `obra`, como os
  // candidatos). O modal e os dois "enviando" vivem aqui; o texto vive no componente.
  const [perguntas, setPerguntas] = useState([])
  const [modalPergunta, setModalPergunta] = useState(false)
  const [enviandoPergunta, setEnviandoPergunta] = useState(false)
  const [respondendoPerguntaId, setRespondendoPerguntaId] = useState(null)
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
  // Pedido de atraso (fase A caminho, components/PosMatchAgendamento): a folha do
  // profissional e as travas dos dois POSTs (pedir / responder).
  const [modalAtraso, setModalAtraso] = useState(false)
  const [enviandoAtraso, setEnviandoAtraso] = useState(false)
  const [respondendoAtraso, setRespondendoAtraso] = useState(false)
  // Edição do ponto de referência (só dono): um Modal inline com TextInput e dois botões,
  // em vez de um componente novo.
  const [modalReferencia, setModalReferencia] = useState(false)
  const [textoReferencia, setTextoReferencia] = useState('')
  const [salvandoReferencia, setSalvandoReferencia] = useState(false)
  const [modalEstender, setModalEstender] = useState(false)
  const [estendendo, setEstendendo] = useState(false)
  // Trava de envio EM VOO. O estado logo acima não serve para o botão "Tentar novamente"
  // do alerta de rede: aquele onPress captura o handleEstender do render em que o erro
  // aconteceu — render no qual `estendendo` ainda era false —, então um toque abriria um
  // segundo ciclo por cima de um que ainda estivesse rodando. O ref é lido no INSTANTE do
  // toque, e não no do fechamento, e por isso é ele quem guarda a entrada do handler.
  const estendendoRef = useRef(false)
  // Aumento de valor (só dono): mesmo par estado + ref do estender, pelo mesmo motivo.
  const [modalAumentar, setModalAumentar] = useState(false)
  const [aumentando, setAumentando] = useState(false)
  const aumentandoRef = useRef(false)
  // Guarda a janela EM VOO (o id, não um boolean): trava as três opções de uma vez e
  // ainda permite marcar qual delas está sendo enviada.
  const [enviandoJanela, setEnviandoJanela] = useState(null)
  const [respondendoChegada, setRespondendoChegada] = useState(false)
  const [declarandoChegada, setDeclarandoChegada] = useState(false)
  // Telefone do solicitante: a API só o devolve ao pintor do match depois do "Estou a
  // caminho" (a_caminho_em); antes vem null e o botão de WhatsApp não existe.
  const [donoTelefone, setDonoTelefone] = useState(null)
  // "O profissional veio?" (vigia do comparecimento): modal e envio da resposta.
  const [modalCompareceu, setModalCompareceu] = useState(false)
  const [comparecendo, setComparecendo] = useState(false)
  const comparecimentoAbertoRef = useRef(false)
  // Cancelamento do match (utils/cancelamento): o pedido de comum acordo pendente (campo
  // pedido_cancelamento do detalhe), a folha e a simulação que ela mostra, e os dois envios.
  const [pedidoCancelamento, setPedidoCancelamento] = useState(null)
  const [sheetCancelar, setSheetCancelar] = useState(false)
  const [simulacaoCancelar, setSimulacaoCancelar] = useState(null)
  const [cancelando, setCancelando] = useState(false)
  const [respondendoCancelamento, setRespondendoCancelamento] = useState(false)
  // "🚩 Denunciar um problema" da tela de em andamento: pedido ao suporte (ModalSuporte) —
  // POST /denuncias só aceita contrato encerrado, e pelo profissional.
  const [suporteAberto, setSuporteAberto] = useState(false)
  // "🔎 Ver descrição e fotos" das telas únicas de agendado / a caminho (profissional).
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)
  // Instante da última recarga por sinal externo (push / volta ao primeiro plano): o toque
  // num push com o app em segundo plano dispara os dois sinais quase juntos — uma leitura basta.
  const ultimaRecargaSinalRef = useRef(0)
  // Janela de espera entre extensões: o detalhe pode devolver pode_estender_em, o
  // instante a partir do qual uma nova extensão passa a ser aceita. Enquanto for
  // futuro nem vale abrir o modal — o envio só voltaria recusado (409). Mesmo molde de
  // DetalheReparoScreen.
  const [agora, setAgora] = useState(() => Date.now())
  const [coords] = useCoordsUsuario()
  const mountedRef = useRef(true)
  // "Estou a caminho" em voo: trava o botão do BlocoAgendado e o segundo toque (o POST não é
  // idempotente: repetido responde 409 e abria um segundo "✅ Confirmado!").
  const [enviandoACaminho, setEnviandoACaminho] = useState(false)

  // Ausente/null (ou data ilegível vinda da API) cai no NaN e é tratado como "sem
  // espera": o botão segue como sempre foi, em vez de travar por um campo que não deu
  // para ler. Passado também libera — só o futuro segura.
  const liberaEstenderEm = obra?.pode_estender_em ? new Date(obra.pode_estender_em).getTime() : NaN
  const emEsperaEstender = Number.isFinite(liberaEstenderEm) && liberaEstenderEm > agora
  // Texto da espera pela régua única de utils/tempo.js, com teto ('cima'): carência se
  // conta em minutos inteiros e 45,5 min são 46 de espera, não 45. Só existe enquanto emEsperaEstender — que exige libera > agora —,
  // então a duração aqui é sempre positiva e "expirado" nunca chega ao rótulo.
  const esperaEstenderTexto = emEsperaEstender ? formatarDuracao(liberaEstenderEm - agora, { frente: 'obra', arredondar: 'cima' }) : ''

  // O relógio só existe enquanto a espera existe: ao vencer, este efeito faz o último
  // setAgora, o botão reabre e o intervalo é descartado. 30s bastam para um rótulo em
  // minutos e evitam re-renderizar o detalhe inteiro a cada segundo (os contadores de
  // expiração têm relógio próprio, isolados em seus componentes, justamente por isso).
  // Também bate enquanto há match sem chegada confirmada: `agora` alimenta podeDizerACaminho
  // (libera no DIA agendado) e a vigia comparecimentoPendente; parado no mount, a tela aberta
  // na véspera nunca liberava o "Estou a caminho" e o dono não via o "O profissional veio?".
  const relogioPosMatch = !!obra?.match_usuario_id && !obra?.chegada_confirmada_em && obra?.status !== 'encerrada'
  useEffect(() => {
    if (!emEsperaEstender && !relogioPosMatch) return
    const id = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(id)
  }, [emEsperaEstender, liberaEstenderEm, relogioPosMatch])

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

  // Recarga por SINAL EXTERNO, com a tela em foco: push desta obra em primeiro plano (ou o
  // toque num push que mira esta tela já aberta — utils/eventosPush) e a volta do app ao
  // primeiro plano (AppState 'active'). Espelha DetalheReparo.
  useEffect(() => {
    const id = obraInicial?.id
    if (!id) return
    const recarregar = () => {
      if (!navigation.isFocused()) return
      const t = Date.now()
      if (t - ultimaRecargaSinalRef.current < 1500) return
      ultimaRecargaSinalRef.current = t
      buscar()
    }
    const assinaturaApp = AppState.addEventListener('change', (estado) => { if (estado === 'active') recarregar() })
    const sairDoPush = aoPushRecebido((data) => {
      const alvo = data?.obra_id
      if (alvo != null && String(alvo) === String(id)) recarregar()
    })
    return () => { assinaturaApp.remove(); sairDoPush() }
  }, [obraInicial?.id])

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
      // Campos que GET /obras/:id devolve AO LADO da linha (não dentro dela): os de atraso
      // (camposAtraso), dono_nome/dono_foto_url (só ao pintor do match) e sugestoes_restantes.
      // Entram na linha porque é ela que os blocos pós-match leem; sem isto cada recarga apagava
      // o pedido de atraso pendente e o "Vou atrasar" (pedidos_atraso_restantes virava 0).
      setObra(mesclarTopo(resposta, resposta.obra || resposta))
      setMidias(resposta.midias || [])
      setMinhaCandidatura(resposta.minha_candidatura)
      setCandidatos(resposta.candidatos || [])
      setPerguntas(Array.isArray(resposta.perguntas) ? resposta.perguntas : [])
      setPedidoCancelamento(pedidoCancelamentoDe(resposta, resposta.obra || resposta))
      setDonoTelefone(resposta.dono_telefone ?? null)
      setExtensaoMaximaHoras(resposta.extensao_maxima_horas ?? null)
      const linha = resposta.obra || resposta
      setAumentoValor({
        pode:   resposta.pode_aumentar_valor  ?? linha?.pode_aumentar_valor  ?? false,
        minimo: resposta.valor_minimo_aumento ?? linha?.valor_minimo_aumento ?? null,
      })
    }
  }

  // Recarga SILENCIOSA: a do mount, a do foco e a que segue uma mutação bem-sucedida.
  // Engole a falha de propósito — um refetch que não deu certo não deve virar alerta —,
  // e é justamente por engolir que ela NÃO serve para recarregarSeFalhaDeRede. Todos os
  // chamadores antigos continuam usando esta, com o mesmo comportamento de sempre.
  const buscar = async () => {
    try {
      await recarregarObra()
      setErro(null)
    } catch (err) {
      console.log('Erro ao buscar obra:', err)
      setErro('Não foi possível atualizar. Os dados podem estar desatualizados.')
    } finally {
      if (mountedRef.current) setCarregando(false)
    }
  }

  const handleInteresse = async () => {
    if (!tempoExperiencia) { Alert.alert('Atenção', 'Informe há quanto tempo realiza esse tipo de serviço.'); return }
    if (!possuiFerramentas) { Alert.alert('Atenção', 'Informe se possui os materiais e equipamentos necessários.'); return }
    // Identidade só é pedida aqui, na primeira proposta: quem ainda não enviou
    // documentos abre a sheet; quem está em análise recebe o aviso.
    if (!(await verificacao.liberada())) return
    setEnviando(true)
    try {
      const mensagem = [
        `⏱ Experiência: ${tempoExperiencia}`,
        `⚠️ Já enfrentou problemas com esse tipo de serviço: ${jaEnfrentouProblemas || 'Não informado'}`,
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
      Alert.alert('✅ Interesse registrado!', 'O solicitante receberá suas informações e entrará em contato se tiver interesse.\n\nO pagamento do serviço é combinado e acertado diretamente com o solicitante.', [{ text: 'OK', onPress: () => navigation.goBack() }])
    } catch (err) {
      console.log('[DetalheObra] falha ao registrar interesse | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      // Suspenso: sai antes da reconsulta — não há candidatura nova a descobrir, e o
      // motivo real precisa aparecer no lugar do "não foi possível registrar".
      if (alertouSuspensao(err)) return
      // Rede de segurança: o servidor recusou por falta de verificação (403
      // VERIFICACAO_NECESSARIA) mesmo com o usuario local dizendo o contrário.
      if (await verificacao.tratouErro(err)) return
      // Obra PRÓPRIA (a mesma pessoa, noutra conta, chegou aqui por link ou pelo feed):
      // o servidor recusa com um `codigo` estável e a mensagem certa. Sai antes da
      // reconsulta — não há candidatura a descobrir — e mostra a mensagem como veio.
      if (typeof err.codigo === 'string' && /propri/i.test(err.codigo)) {
        Alert.alert('Aviso', err.mensagem || 'Você não pode se candidatar à sua própria obra.')
        return
      }
      // A 1ª tentativa pode ter sido aceita no servidor mas a resposta se perdeu (troca
      // de rede), ou o retry recebeu 409 "já se candidatou". Reconsulta: se a candidatura
      // já existir para este usuário, trata como sucesso em vez de erro confuso.
      try {
        const atual = await obrasService.detalhe(obra.id)
        if (atual?.minha_candidatura) {
          setMinhaCandidatura(atual.minha_candidatura)
          setMostrarForm(false)
          Alert.alert('✅ Interesse registrado!', 'O solicitante receberá suas informações e entrará em contato se tiver interesse.\n\nO pagamento do serviço é combinado e acertado diretamente com o solicitante.', [{ text: 'OK', onPress: () => navigation.goBack() }])
          return
        }
      } catch (e2) { console.log('[DetalheObra] reconsulta pós-interesse falhou | code:', e2.code) }
      Alert.alert('Erro', err.mensagem || 'Não foi possível registrar seu interesse.')
    } finally {
      setEnviando(false)
    }
  }

  // Pergunta única do profissional e resposta única do dono (components/PerguntasDemanda).
  // Espelha DetalheReparoScreen: comRetry SEM { timeout } porque os dois gravam algo que o
  // servidor aceita uma vez só; sucesso recarrega em silêncio; falha de rede recarrega em
  // vez de alertar (recarregarSeFalhaDeRede).
  const enviarPergunta = async (texto) => {
    if (enviandoPergunta) return false
    setEnviandoPergunta(true)
    try {
      await comRetry(() => api.post(`/obras/${obraInicial.id}/perguntas`, { pergunta: texto }))
      setModalPergunta(false)
      buscar()
      return true
    } catch (err) {
      console.log('[DetalheObra] falha ao enviar pergunta | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) { setModalPergunta(false); return true }
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar sua pergunta.')
      return false
    } finally {
      if (mountedRef.current) setEnviandoPergunta(false)
    }
  }

  const responderPergunta = async (perguntaId, texto) => {
    if (respondendoPerguntaId != null) return
    setRespondendoPerguntaId(perguntaId)
    try {
      await comRetry(() => api.post(`/obras/${obraInicial.id}/perguntas/${perguntaId}/resposta`, { resposta: texto }))
      buscar()
    } catch (err) {
      console.log('[DetalheObra] falha ao responder pergunta | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) return
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar sua resposta.')
    } finally {
      if (mountedRef.current) setRespondendoPerguntaId(null)
    }
  }

  // Proposta de horário (dia + hora, ISO com fuso): o profissional propõe QUANDO faz o
  // serviço e o dono confirma. Grava um ESTADO (write-once no servidor: a mesma proposta
  // duas vezes dá o mesmo resultado) e não cria recurso novo, que é exatamente o caso do
  // { timeout: true } descrito em rede.js:16-19 — o socket ocioso que trava até o timeout
  // de 30 s é o mesmo evento do ERR_NETWORK e merece o retry.
  // { servidor } fica FORA: um 5xx prova que a requisição chegou.
  const handleProporHorario = async (dataHora) => {
    if (enviandoJanela) return
    // Estado ANTES do envio, para a reconsulta do catch saber o que é novidade. Sem esta
    // foto, "existe uma janela" não distingue a que acabou de ser gravada de uma que já
    // estava lá antes do toque.
    const previstaAntes = obra?.chegada_prevista_em
    const pendenteAntes = obra?.chegada_pendente_em
    setEnviandoJanela('agendado')
    try {
      const resp = await comRetry(() => api.post(`/obras/${obra.id}/chegada-prevista`, { data_hora: dataHora }), { timeout: true, persistir: true })
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

  // Resposta à proposta pendente — do dono OU do profissional, quem não a fez: 'aceitar' ou
  // 'contraproposta' com data_hora. Vai de comRetry SEM { timeout }, ao contrário do envio
  // da proposta: isto é uma RESPOSTA DE NEGOCIAÇÃO, o caso que rede.js:20-22 manda deixar
  // de fora — o servidor pode ter processado a 1ª tentativa e o retry duplicaria o efeito.
  // Só o ERR_NETWORK duro, onde a requisição não chegou, é reexecutado.
  // Mesmo tratamento de responderAtraso, a negociação vizinha.
  const handleResponderAgendamento = async (acao, dataHora) => {
    if (respondendoChegada) return
    setRespondendoChegada(true)
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/chegada-prevista/responder`, { acao, ...(dataHora ? { data_hora: dataHora } : {}) }))
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
      // Alerta PRIMEIRO, recarga depois e sem await. Antes a recarga vinha na frente e o
      // alerta só aparecia quando ela terminasse: ela passa pelo comRetry como GET, que é
      // rota permitida, então numa rede ruim gastava até três tentativas com backoff antes
      // de a pessoa ler uma única palavra. Agora a mensagem sobe na hora e a tela se
      // atualiza atrás dela.
      // Sem await também significa que nada nesta recarga pode atrasar, engolir ou trocar o
      // erro original — o alerta já foi levantado quando ela começa.
      // recarregarObra() e não buscar(): o buscar() marca setErro('Não foi possível
      // atualizar...') quando falha, e esse aviso apareceria ATRÁS do alerta, culpando a
      // conexão por uma recarga acessória. O recarregarObra() só relê e aplica o estado (com
      // guarda de montagem), sem tocar em bandeira nenhuma — e o buscar() fica intacto para
      // os seus outros chamadores.
      // Rede pura fica de fora (err.status ausente): não há o que reler, e a requisição pode
      // nem ter chegado ao servidor.
      if (err.status != null) recarregarObra().catch(e => console.log('[DetalheObra] recarga pós-erro falhou | code:', e?.code))
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
    // a_caminho_em junto: é o que troca o botão por "você avisou que está a caminho" e o
    // buscar() em seguida traz dono_telefone, que a API só libera a partir daqui.
    const aplicarSucesso = (matchFeitoEm, aCaminhoEm) => {
      setObra(prev => ({ ...prev, match_feito_em: matchFeitoEm || prev.match_feito_em || new Date().toISOString(), match_usuario_id: usuario.id, a_caminho_em: aCaminhoEm || prev.a_caminho_em || new Date().toISOString() }))
      buscar()
      Alert.alert('✅ Confirmado!', MSG_SUCESSO)
    }
    if (enviandoACaminho) return
    Alert.alert('🎨 Confirmar ida ao local?', 'Ao confirmar, o solicitante será notificado e a contagem regressiva será iniciada.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: async () => {
        if (enviandoACaminho) return
        setEnviandoACaminho(true)
        try {
          // { persistir } sem { timeout }: só o ERR_NETWORK duro insiste por 45 s. A
          // variante que trava fica de fora porque o match não é idempotente de fato —
          // repetido sobre um match já gravado, o servidor responde 409, que é 4xx e
          // nunca reexecuta. Quem transforma esse 409 em sucesso é a reconsulta abaixo.
          const resposta = await comRetry(() => api.post(`/obras/${obra.id}/match`, {}), { persistir: true })
          aplicarSucesso(resposta.match_feito_em, resposta.a_caminho_em)
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
            if (matchId != null && usuario?.id != null && String(matchId) === String(usuario.id)) { aplicarSucesso(obraAtual.match_feito_em, obraAtual.a_caminho_em); return }
          } catch (e2) { console.log('[DetalheObra] reconsulta pós-match falhou | code:', e2.code) }
          Alert.alert('Erro', err.mensagem || 'Não foi possível confirmar.')
        } finally {
          if (mountedRef.current) setEnviandoACaminho(false)
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
    // Pedido de avaliação NA LOJA, só se a nota alta o armou. Daqui, e não do envio da
    // nota: todo caminho que fecha o Alert "Bloquear para futuros serviços?" (qualquer
    // botão) passa por aqui, então o diálogo nativo nunca sobe com o Alert aberto. O
    // Alert não é cancelável, logo não há saída por fora dele. 1,5 s depois, já na tela
    // anterior; a função nunca lança nem mexe nesta tela, então sobrevive ao goBack.
    if (pedirLojaRef.current) {
      pedirLojaRef.current = false
      setTimeout(() => { pedirAvaliacaoLoja() }, 1500)
    }
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
      // Nota alta enviada pelo dono = o melhor momento para pedir a avaliação NA LOJA. Só
      // ARMA aqui: o pedido em si sai de finalizarPosEncerrar, 1,5 s depois de o Alert de
      // bloqueio ser respondido, para nunca cair em cima dele.
      if (isDono && estrelas >= 4) pedirLojaRef.current = true
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
      // Releitura: o servidor também zera chegada_*, a candidatura aceita e a_caminho_em; só o
      // setObra acima deixava a tela num meio-termo ("Proposta aceita… Estou a caminho").
      buscar()
      Alert.alert('⏰ Tempo esgotado', 'O profissional não chegou a tempo. A obra está disponível novamente.')
    } catch (err) {
      console.log('Erro ao expirar match:', err)
      // Sem alerta e sem banner, e isso é deliberado: quem dispara este handler é o relógio
      // (RelogioRegressivo onExpirar), não um toque. Um modal aqui interromperia alguém que
      // está apenas olhando a tela, por uma ação que essa pessoa não pediu — é exatamente a
      // distinção que o comentário do handleNaoChegou, logo abaixo, já registra.
      // O que faltava era a TELA ficar certa. Falhando o expirar-match, ela seguia mostrando
      // um match que o servidor pode já ter desfeito, e nada corrigia isso: o setObra acima
      // só roda no sucesso. A releitura arruma o estado em silêncio, que é o comportamento
      // que este caminho sempre quis ter.
      // recarregarObra() e não buscar(): o buscar() marca setErro('Não foi possível atualizar...') ao
      // falhar, e um banner é justamente o aviso que não cabe aqui.
      // Sem await e com .catch que só loga: nada nesta releitura pode atrasar, lançar ou
      // aparecer. Rede pura fica de fora (err.status ausente): não há o que reler, e a
      // requisição pode nem ter chegado ao servidor.
      if (err.status != null) recarregarObra().catch(e => console.log('[DetalheObra] recarga pós-erro falhou | code:', e?.code))
    }
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
        console.log('[DetalheObra] falha ao expirar match por não chegada | status:', err.status, '| code:', err.code, '| codigo:', err.codigo, '| msg:', err.mensagem)
        // 403 PEDIDO_ATRASO_PENDENTE entra aqui: há um pedido de mais tempo a responder antes.
        Alert.alert('Erro', mensagemErroAtraso(err, 'Não foi possível liberar a obra. Tente novamente.'))
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
  // Abre já preenchido com o valor atual: a ação mais comum é corrigir, não redigitar.
  const abrirReferencia = () => {
    setTextoReferencia(obra.ponto_referencia || '')
    setModalReferencia(true)
  }

  // PATCH idempotente (grava um ESTADO, não cria recurso), daí { timeout: true } como no
  // bloqueio/desbloqueio. String vazia é o jeito documentado de LIMPAR — por isso não há
  // guarda de "não envie vazio". O estado local vem do ECO do servidor, então a linha
  // muda sem refetch; se o eco vier sem o campo, cai no que foi enviado.
  const salvarReferencia = async () => {
    if (salvandoReferencia) return
    setSalvandoReferencia(true)
    const valor = textoReferencia.trim().slice(0, 200)
    try {
      const resp = await comRetry(
        () => api.patch(`/obras/dono/${obra.id}/ponto-referencia`, { ponto_referencia: valor }),
        { timeout: true },
      )
      const salvo = resp?.ponto_referencia !== undefined ? resp.ponto_referencia : valor
      if (mountedRef.current) setObra(prev => ({ ...prev, ponto_referencia: salvo }))
      setModalReferencia(false)
    } catch (err) {
      console.log('[DetalheObra] falha ao salvar ponto de referência | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) { setModalReferencia(false); return }
      Alert.alert('Erro', err.mensagem || 'Não foi possível salvar o ponto de referência.')
    } finally {
      if (mountedRef.current) setSalvandoReferencia(false)
    }
  }

  // Irmão do handleEstender logo abaixo: mesma trava em voo, mesma recarga em vez de
  // remendo local, mesma leitura honesta de rede pura. A mensagem de recusa é a da
  // própria API (err.mensagem), com um fallback genérico só se ela vier vazia.
  const handleAumentarValor = async (valor) => {
    if (aumentandoRef.current) return
    aumentandoRef.current = true
    setAumentando(true)
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/aumentar-valor`, { valor }))
      setModalAumentar(false)
      await buscar()
      Alert.alert('✅ Valor aumentado!', 'O novo valor já está valendo.')
    } catch (err) {
      console.log('[DetalheObra] falha ao aumentar valor | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) { setModalAumentar(false); return }
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      if (isNetwork) {
        Alert.alert('Erro de conexão', 'Não foi possível aumentar o valor. Verifique sua conexão.', [
          { text: 'Tentar novamente', onPress: () => { if (!aumentandoRef.current) handleAumentarValor(valor) } },
          { text: 'Cancelar', style: 'cancel' },
        ])
      } else if (err.status === 404) {
        setModalAumentar(false)
        Alert.alert('Não encontrado', err.mensagem || 'Obra não encontrada.')
      } else {
        setModalAumentar(false)
        Alert.alert('Não foi possível aumentar', err.mensagem || 'Esta obra não pode ter o valor aumentado agora.')
      }
    } finally {
      aumentandoRef.current = false
      if (mountedRef.current) setAumentando(false)
    }
  }

  // Porta de entrada do modal (onEstender). O modal entrega HORAS (dias × 24, inteiro
  // ≥ 24); aqui entram as duas verificações que só a tela tem como fazer, ANTES do POST:
  //   1. Teto local: extensao_maxima_horas vem do detalhe quando o servidor o expõe. Sem
  //      ele (ausente/nulo) nada é barrado aqui — o 422 segue sendo a palavra final.
  //   2. Confirmação com o novo vencimento, calculado como o servidor calcula
  //      (preverNovoVencimento: GREATEST(expira_em, NOW()) + horas, ou fim de dia na faixa
  //      "Hoje"). É uma PRÉVIA pelo relógio do aparelho; o que vale é o buscar() depois.
  // Não espera a resposta do Alert, de propósito: devolver já libera o botão do modal em
  // vez de deixá-lo em "Aumentando…" atrás da pergunta. O envio real (executarEstender)
  // tem a trava em voo de sempre, então um toque extra enquanto ele corre é ignorado.
  const handleEstender = async (horas) => {
    if (estendendoRef.current) return
    const teto = Number(extensaoMaximaHoras)
    if (Number.isFinite(teto) && teto > 0 && horas > teto) {
      Alert.alert('Valor acima do permitido', `O aumento máximo permitido para esta obra é de ${formatarDuracao(teto * 3600000, { frente: 'obra' })}. Informe um valor menor.`)
      return
    }
    const dias = Math.round(horas / 24)
    const { atualMs, novoMs } = preverNovoVencimento(obra.expira_em, horas, obra.prazo_modo)
    Alert.alert(
      'Confirmar novo prazo?',
      `Você está aumentando o tempo desta obra em ${dias} ${dias === 1 ? 'dia' : 'dias'}.\n\nO pedido passará a vencer em:\n${formatarVencimento(novoMs)}\n(antes: ${formatarVencimento(atualMs)})`,
      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => executarEstender(horas) },
      ],
      // Voltar pelo botão físico (Android) vale como Voltar: nada foi enviado.
      { cancelable: true },
    )
  }

  const executarEstender = async (horas) => {
    if (estendendoRef.current) return
    estendendoRef.current = true
    setEstendendo(true)
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/estender`, { horas }))
      setModalEstender(false)
      // Recarrega em vez de remendar expira_em no estado: o detalhe também traz o novo
      // pode_estender_em, e sem ele o botão reabria na hora e o toque seguinte batia no
      // 409. Mesmo molde de DetalheReparoScreen. buscar() ENGOLE a falha (vira o aviso
      // "dados podem estar desatualizados"), então o alerta de sucesso abaixo sai mesmo
      // se a recarga cair — a extensão já valeu no servidor.
      await buscar()
      Alert.alert('✅ Prazo aumentado!', 'O novo prazo já está valendo.')
    } catch (err) {
      console.log('[DetalheObra] falha ao estender prazo | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      // Rede pura → RECARREGA em vez de alertar, na mesma forma do salvarReferencia
      // (:828) — dos cinco vizinhos que já fazem isto, é o único que também precisa
      // fechar um modal antes de sair, que é exatamente a situação deste handler.
      //
      // Um ERR_NETWORK não distingue "a requisição não chegou" de "chegou e a resposta se
      // perdeu": o adapter entrega o mesmo erro nos dois casos. Alertar escolhia sempre a
      // primeira leitura, e quando a extensão TINHA sido gravada a pessoa via "Erro de
      // conexão" sobre um prazo que já valia. A recarga mostra o que o SERVIDOR tem — o
      // expira_em novo, se valeu; a tela intacta, se não valeu — e é honesta nos dois.
      //
      // O alerta abaixo não sumiu: recarregarSeFalhaDeRede devolve false quando a própria
      // recarga falha, e aí o caminho é o de sempre.
      //
      // SEM { persistir }, de propósito: esta é a única mutação CUMULATIVA do conjunto, e
      // insistir por 45 s multiplicaria entregas do mesmo prazo contra uma guarda de
      // deduplicação da qual este código não quer depender por projeto.
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) { setModalEstender(false); return }
      const isNetwork = err.code === 'ERR_NETWORK' || err.message === 'Network Error'
      // 400 junto do 422: é o status que POST /estender usa hoje para "acima do teto" e
      // "horas inválidas", já com a mensagem em pt-BR (e extensao_maxima_horas) no corpo.
      if (err.status === 422 || err.status === 400) {
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
          // Passa pela trava em vez de reentrar direto: o alerta é levantado DENTRO do
          // catch, o finally que libera o ref roda logo depois, e nada impede um segundo
          // toque enquanto um ciclo ainda corre. Ler o ref no toque resolve as duas pontas.
          // executarEstender, não handleEstender: a pessoa já confirmou este prazo.
          { text: 'Tentar novamente', onPress: () => { if (!estendendoRef.current) executarEstender(horas) } },
          { text: 'Cancelar', style: 'cancel' },
        ])
      } else {
        Alert.alert('Erro', err.mensagem || 'Não foi possível aumentar o prazo.')
      }
    } finally {
      // O ref é liberado SEMPRE: ele é a trava, não um pedaço de tela, e deixá-lo preso
      // depois de um unmount travaria a ação numa remontagem. O estado segue a guarda de
      // montagem dos vizinhos (salvarReferencia, handleEscolherJanela, handleResponderChegada).
      estendendoRef.current = false
      if (mountedRef.current) setEstendendo(false)
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
      // 409 MATCH_ATIVO: o pintor já é o do match — a mensagem do servidor diz o caminho
      // ("Cancelar serviço"). Mesmo alerta de erro de sempre, com o texto dele.
      if (err.codigo === 'MATCH_ATIVO') { Alert.alert('Erro', err.mensagem || 'Este profissional já foi escolhido.'); return }
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
          ? 'Ótimo! O solicitante foi notificado. Confirme sua ida ao local quando estiver pronto.\n\nO pagamento do serviço é combinado e acertado diretamente com o solicitante.'
          : action === 'contraproposta'
          ? 'O solicitante foi notificado da sua contraproposta.\n\nO pagamento do serviço é combinado e acertado diretamente com o solicitante.'
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
      // Alerta PRIMEIRO, recarga depois e sem await — mesma razão do handleResponderChegada:
      // a recarga passa pelo comRetry como GET e, numa rede ruim, atrasava tanto o alerta
      // quanto o finally que desliga o "enviando", deixando o botão girando durante toda a
      // releitura. Fora do caminho do alerta, o finally roda de imediato.
      // recarregarObra() e não buscar(): o buscar() marca setErro('Não foi possível
      // atualizar...') quando falha, e esse aviso apareceria ATRÁS do alerta. O buscar()
      // segue intacto para os seus outros chamadores.
      // Rede pura fica de fora (err.status ausente): esse caso é do ramo isNetwork acima,
      // com "Tentar novamente".
      if (err.status != null) recarregarObra().catch(e => console.log('[DetalheObra] recarga pós-erro falhou | code:', e?.code))
    } finally {
      setEnviandoResposta(false)
    }
  }

  // Pedido de ATRASO (atrasoChegadaService da API; fluxo antigo pedir/perguntar/informar/
  // responder-tempo aposentado). Pintor: POST /pedir-atraso { minutos 15|30|60, motivo? }
  // pela folha ModalPedirAtraso. A resposta já traz prazo_chegada, tolerancia_ate, atrasado,
  // pedido_atraso e pedidos_atraso_restantes — mescla direto, sem reler.
  // Recusa da API (MINUTOS_INVALIDOS, SEM_A_CAMINHO, CHEGADA_DECLARADA, PEDIDO_PENDENTE,
  // LIMITE_PEDIDOS, DEMANDA_FECHADA): a mensagem do servidor no alerta e uma releitura, porque
  // o que ela descreve (chegada registrada, pedido já aberto, limite usado) mudou lá, não aqui.
  const handlePedirAtraso = async (minutos, motivo) => {
    if (enviandoAtraso) return
    setEnviandoAtraso(true)
    try {
      const resp = await comRetry(() => api.post(`/obras/${obra.id}/pedir-atraso`, { minutos, motivo: motivo || undefined }))
      if (!mountedRef.current) return
      setModalAtraso(false)
      setObra(prev => ({ ...prev, ...camposAtrasoDe(resp) }))
      Alert.alert('✅ Pedido enviado', 'O cliente recebe o pedido na hora. Sem resposta em 10 min, ele é aceito automaticamente.')
    } catch (err) {
      console.log('[DetalheObra] falha ao pedir atraso | status:', err.status, '| code:', err.code, '| codigo:', err.codigo, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) { if (mountedRef.current) setModalAtraso(false); return }
      if (mountedRef.current && err.status != null) setModalAtraso(false)
      Alert.alert('Erro', mensagemErroAtraso(err, 'Não foi possível pedir mais tempo.'))
      if (err.status != null) recarregarObra().catch(e => console.log('[DetalheObra] recarga pós-erro falhou | code:', e?.code))
    } finally {
      if (mountedRef.current) setEnviandoAtraso(false)
    }
  }

  // Dono: POST /pedir-atraso/responder { aceitar }. Aceitar move o prazo para os dois (a
  // resposta traz o novo prazo_chegada); recusar desfaz o match — o pintor sai sem falta e
  // a obra volta ao Rol —, por isso passa por confirmação e termina no goBack, como o
  // responder-tempo antigo. 409 SEM_PEDIDO (já respondido ou aceito pelo cron): mensagem do
  // servidor e releitura.
  const responderAtraso = async (aceitar) => {
    if (respondendoAtraso) return
    setRespondendoAtraso(true)
    try {
      const resp = await comRetry(() => api.post(`/obras/${obra.id}/pedir-atraso/responder`, { aceitar }))
      if (!mountedRef.current) return
      if (aceitar) {
        setObra(prev => ({ ...prev, ...camposAtrasoDe(resp) }))
        const novo = horaDe(resp?.prazo_chegada)
        Alert.alert('✅ Tempo concedido', novo ? `Novo prazo de chegada: ${novo}. Vale para os dois.` : 'O novo prazo de chegada vale para os dois.')
      } else {
        setObra(prev => ({ ...prev, match_feito_em: null, match_usuario_id: null, a_caminho_em: null, pedido_atraso: null, pedidos_atraso_restantes: 0, pedido_tempo_status: null }))
        Alert.alert('Recusado', 'A obra voltou para disponível, sem falta para o profissional.')
        navigation.goBack()
      }
    } catch (err) {
      console.log('[DetalheObra] falha ao responder atraso | status:', err.status, '| code:', err.code, '| codigo:', err.codigo, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) return
      Alert.alert('Erro', mensagemErroAtraso(err, 'Não foi possível responder.'))
      if (err.status != null) recarregarObra().catch(e => console.log('[DetalheObra] recarga pós-erro falhou | code:', e?.code))
    } finally {
      if (mountedRef.current) setRespondendoAtraso(false)
    }
  }
  const handleResponderAtraso = (aceitar) => {
    if (aceitar) { responderAtraso(true); return }
    Alert.alert('✕ Recusar o tempo extra?', `${primeiroNome(pintorMatch?.nome) || 'O profissional'} sai da obra sem falta, e a obra volta para outros profissionais.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Recusar', style: 'destructive', onPress: () => responderAtraso(false) },
    ])
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
  // Tarja de prazo do topo: mesma régua do card do feed (utils/urgencia.js). O detalhe
  // mantém o seu fallback: sem horas_para_expirar, a janela sai de prazo_execucao_horas.
  // Prazo ausente/zero/vazio NÃO vai à régua (ela leria 0 como "Iniciar em expirado"): aqui
  // isso é "sem prazo", como sempre foi neste detalhe. Sem faixa da régua (sem prazo, ou
  // valor não numérico), a tarja sai na faixa neutra ⚪ "Sem urgência" em dois casos, para
  // o detalhe nunca perder o que já mostrava:
  //   · ainda há contagem a mostrar (expira_em, e quem vê está na disputa) → "Expira em";
  //   · o campo veio preenchido mas não numérico → a tarja existia antes da régua única.
  // Sem prazo e sem contagem → sem tarja. O card do feed não tem esse fallback.
  const horasJanela = obra?.horas_para_expirar || obra?.prazo_execucao_horas
  const faixaPrazo = (horasJanela ? urgenciaObra(horasJanela, obra?.total_extensao_horas) : null)
    || ((obra?.expira_em && !foraDaDisputa) || horasJanela ? SEM_URGENCIA : null)
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

  // "Estou a caminho" já dado (POST /match grava a_caminho_em): é o que libera a troca de
  // telefones nos dois lados — antes dele a API devolve telefone/dono_telefone nulos.
  const aCaminho = !!obra?.a_caminho_em
  // Fase do DONO entre o match e o "Estou a caminho": a tela vira o bloco pós-match
  // (components/PosMatchDono) — valor/título/endereço num card só, banner "aguarde o dia e
  // o horário" (ou o card de agendamento, se o profissional já propôs), o profissional
  // escolhido, a penalidade e o contrato. Lista de candidatos e botões de chegada/conclusão
  // ficam escondidos até a_caminho_em existir. Espelha DetalheReparo.
  const faseAguardaHorario = isDono && !!temMatch && !encerrada && !aCaminho
  const temPropostaHorario = !!obra?.chegada_pendente_em || !!obra?.chegada_prevista_em
  // Proposta recebida ou AGENDADO (ainda sem "Estou a caminho"): o bloco assume a linha do
  // ponto de referência e o contrato vira uma linha; descrição some — tudo para caber numa tela.
  const donoAgendando = faseAguardaHorario && temPropostaHorario
  // Fase do PROFISSIONAL do match sem horário ACEITO — espelha DetalheReparo: o bloco
  // (components/PosMatchProfissional) fica FORA do painel `!temMatch`, que nunca mais
  // renderizava para o pintor casado desde que a API passou a casar no aceite. Com horário
  // aceito, o card AGENDADO e o "Estou a caminho" entram na seção do profissional.
  const horarioAceito = !!obra?.chegada_prevista_em
  const faseProAguardaHorario = !!souPintorDoMatch && !encerrada && !horarioAceito
  const clienteContrapropos = !!obra?.chegada_pendente_em && obra?.chegada_proposta_por != null &&
    usuario?.id != null && String(obra.chegada_proposta_por) !== String(usuario.id)
  // Valor combinado visto pelo pintor: a própria candidatura (contraproposta, proposto ou a
  // oferta legada), senão o valor da obra.
  const valorCombinadoPro = minhaCandidatura
    ? (minhaCandidatura.valor_contraproposta ?? minhaCandidatura.valor_proposto ?? minhaCandidatura.valor_oferta ?? obra?.valor ?? obra?.valor_estimado)
    : (obra?.valor ?? obra?.valor_estimado)
  // Horário ACEITO mas ainda sem "Estou a caminho": o mesmo bloco mostra o card INÍCIO AGENDADO
  // com o botão; a seção legada do pintor só volta depois de a_caminho_em.
  const proAgendadoSemACaminho = !!souPintorDoMatch && !encerrada && horarioAceito && !aCaminho
  // Proposta ENVIADA pelo pintor (aguardando o cliente) ou AGENDADO sem "a caminho":
  // descrição e caixa de reputação somem para o estado caber numa tela.
  const proPropostaEnviada = faseProAguardaHorario && !!obra?.chegada_pendente_em && !clienteContrapropos
  const proCompacto = proPropostaEnviada || proAgendadoSemACaminho
  const topoCompacto = faseAguardaHorario || faseProAguardaHorario || proAgendadoSemACaminho
  // Só a partir do DIA agendado: antes disso o toque anunciaria uma partida para um serviço
  // que ainda não chegou. Sem horário agendado não há dia de referência — fica travado.
  const podeDizerACaminho = !!obra?.chegada_prevista_em && diaAgendadoChegou(obra.chegada_prevista_em, agora)
  // Cancelamento do match: o botão (ou o pedido de comum acordo pendente) acompanha os
  // blocos pós-match acima — existe entre o match e o "Estou a caminho", para os dois lados,
  // e some com a_caminho_em junto com eles. O nome do outro lado vai à folha e ao card.
  const mostrarCancelamento = faseAguardaHorario || faseProAguardaHorario || proAgendadoSemACaminho
  const nomeOutroCancelamento = isDono ? primeiroNome(pintorMatch?.nome) : primeiroNome(obra?.dono_nome)
  // Tela FIXA do pós-match (components/PosMatchFixo) para o dono e para o pintor do match,
  // nas cinco fases entre o match e o encerramento — espelha DetalheReparo:
  //   aguardando / proposto / agendado (reagendamento pendente como variante) /
  //   a_caminho / em_andamento. null fora do match: o corpo rolável de sempre.
  const parteDoMatch = (isDono || !!souPintorDoMatch) && !!temMatch && !encerrada
  const fasePosMatch = !parteDoMatch ? null
    : chegadaConfirmada ? 'em_andamento'
    : aCaminho ? 'a_caminho'
    : horarioAceito ? 'agendado'
    : obra?.chegada_pendente_em ? 'proposto'
    : 'aguardando'
  // "🚫 O profissional não chegou" na tela A CAMINHO (só depois do limite de chegada): com o
  // horário AGENDADO vencido a saída é a vigia (POST /confirmar-comparecimento 'nao'), porque
  // POST /expirar-match recusa as partes depois do "Estou a caminho" (403 USE_CANCELAR_MATCH)
  // salvo contestando uma chegada declarada. Fora da vigia cai no handleNaoChegou de sempre.
  const naoChegouACaminho = () => {
    const vigia = obra?.chegada_janela === 'agendado' && !!obra?.chegada_prevista_em &&
      new Date(obra.chegada_prevista_em).getTime() <= Date.now() &&
      !obra?.chegada_confirmada_em && !obra?.comparecimento_resposta
    if (vigia) setModalCompareceu(true)
    else handleNaoChegou()
  }
  // Vigia do comparecimento: horário AGENDADO vencido, sem chegada confirmada e sem resposta
  // — as mesmas condições do 409 de POST /confirmar-comparecimento. O servidor pergunta por
  // push (vigia_comparecimento_em) 1h depois do horário; a tela também aceita o estado
  // derivado, para quem abre o detalhe antes do tique do cron.
  const comparecimentoPendente = isDono && temMatch && !encerrada &&
    obra?.chegada_janela === 'agendado' && !!obra?.chegada_prevista_em &&
    new Date(obra.chegada_prevista_em).getTime() <= agora &&
    !obra?.chegada_confirmada_em && !obra?.comparecimento_resposta
  // Abre o modal UMA vez por montagem: ao chegar pelo push, ou quando o servidor já perguntou.
  useEffect(() => {
    if (!comparecimentoPendente || comparecimentoAbertoRef.current) return
    if (abrirComparecimento || obra?.vigia_comparecimento_em) {
      comparecimentoAbertoRef.current = true
      setModalCompareceu(true)
    }
  }, [comparecimentoPendente, abrirComparecimento, obra?.vigia_comparecimento_em])

  // Resposta do dono à vigia. Negociação (sem { timeout }), como handleResponderAgendamento:
  // o servidor decide o desfecho ('sim' confirma a chegada, 'nao' desfaz o match pelo cron,
  // 'remarcar' libera o horário) e o buscar() traz o estado novo.
  const handleComparecimento = async (resposta) => {
    if (comparecendo) return
    setComparecendo(true)
    try {
      await comRetry(() => api.post(`/obras/${obra.id}/confirmar-comparecimento`, { resposta }))
      if (mountedRef.current) setModalCompareceu(false)
      await buscar()
      if (resposta === 'sim') Alert.alert('✅ Chegada confirmada', 'O serviço está em andamento. Quando terminar, encerrem pelo app.')
      else if (resposta === 'nao') Alert.alert('Registrado', 'Registramos que o profissional não veio. A obra volta a ficar disponível para outros profissionais.')
      else Alert.alert('Horário liberado', 'O profissional vai propor um novo horário, e você recebe um aviso para confirmar.')
    } catch (err) {
      console.log('[DetalheObra] falha ao registrar comparecimento | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) { if (mountedRef.current) setModalCompareceu(false); return }
      Alert.alert('Erro', err.mensagem || 'Não foi possível registrar sua resposta.')
      if (err.status != null) recarregarObra().catch(e => console.log('[DetalheObra] recarga pós-erro falhou | code:', e?.code))
    } finally {
      if (mountedRef.current) setComparecendo(false)
    }
  }

  // Cancelamento do match. O toque abre a folha já com o spinner e pede a simulação
  // (?simular=1): é ela que diz se o cancelamento é 'livre' ou 'tardio' (menos de 12 h).
  // Falhando a simulação, a folha fecha — sem saber o desfecho não se oferece o botão.
  const abrirCancelar = async () => {
    setSimulacaoCancelar(null)
    setSheetCancelar(true)
    try {
      const sim = await simularCancelamento('obra', obra.id)
      if (!mountedRef.current) return
      // A simulação também traz o pedido de acordo vigente: havendo um, a folha nem abre —
      // o card (ou a linha de espera) toma o lugar do botão.
      if (sim.pedido_cancelamento) { setPedidoCancelamento(sim.pedido_cancelamento); setSheetCancelar(false); return }
      setSimulacaoCancelar(sim)
    } catch (err) {
      console.log('[DetalheObra] falha ao simular cancelamento | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (mountedRef.current) setSheetCancelar(false)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) return
      Alert.alert('Erro', err.mensagem || 'Não foi possível conferir o prazo do cancelamento.')
    }
  }

  // Os dois envios da folha: cancelar de vez (POST /cancelar-match) ou só PEDIR o
  // cancelamento de comum acordo (POST /cancelamento-acordo — o outro lado responde em até
  // 2 h). Mesmo molde de handleComparecimento: sem { timeout }, e buscar() traz o estado
  // que o servidor decidiu.
  const handleCancelarMatch = async (motivo, detalhe, comumAcordo) => {
    if (cancelando) return
    setCancelando(true)
    try {
      const resp = await (comumAcordo ? pedirCancelamentoAcordo : cancelarMatch)('obra', obra.id, { motivo, detalhe })
      if (mountedRef.current) setSheetCancelar(false)
      // Dono com "Não preciso mais do serviço": a API cancela o match E encerra a obra
      // (demanda_encerrada) — não há o que reler nem "voltar para outros profissionais".
      if (!comumAcordo && resp?.demanda_encerrada) {
        Alert.alert('Pedido encerrado', 'O profissional foi avisado e o pedido foi encerrado.')
        navigation.goBack()
        return
      }
      await buscar()
      if (comumAcordo) {
        Alert.alert('🤝 Pedido enviado', `${nomeOutroCancelamento || 'A outra parte'} tem 2h para responder. Sem resposta, o pedido expira e o combinado continua.`)
      } else {
        Alert.alert('Serviço cancelado', isDono
          ? 'O profissional foi avisado e o pedido voltou para os outros profissionais.'
          : 'O cliente foi avisado e o pedido voltou a receber propostas de outros profissionais.')
      }
    } catch (err) {
      console.log('[DetalheObra] falha ao cancelar match | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) { if (mountedRef.current) setSheetCancelar(false); return }
      Alert.alert('Erro', err.mensagem || 'Não foi possível cancelar o serviço.')
      if (err.status != null) recarregarObra().catch(e => console.log('[DetalheObra] recarga pós-erro falhou | code:', e?.code))
    } finally {
      if (mountedRef.current) setCancelando(false)
    }
  }

  // Resposta ao pedido de comum acordo do outro lado ('aceitar' cancela sem falta para
  // ninguém; 'recusar' mantém o combinado).
  const handleResponderCancelamento = async (acao) => {
    if (respondendoCancelamento) return
    setRespondendoCancelamento(true)
    try {
      await responderPedidoCancelamento('obra', obra.id, acao === 'aceitar')
      await buscar()
      if (acao === 'aceitar') Alert.alert('Serviço cancelado', 'Cancelado de comum acordo. Ninguém leva falta.')
      else Alert.alert('Pedido recusado', 'O combinado continua valendo.')
    } catch (err) {
      console.log('[DetalheObra] falha ao responder pedido de cancelamento | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (await recarregarSeFalhaDeRede(err, recarregarObra)) return
      Alert.alert('Erro', err.mensagem || 'Não foi possível enviar sua resposta.')
      if (err.status != null) recarregarObra().catch(e => console.log('[DetalheObra] recarga pós-erro falhou | code:', e?.code))
    } finally {
      if (mountedRef.current) setRespondendoCancelamento(false)
    }
  }

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

  // Foto/vídeo em tela cheia. Com a folha "descrição e fotos" (ModalDetalhesDemanda) aberta,
  // estes dois Modals são montados DENTRO dela (prop extras): no iOS um Modal irmão não é
  // apresentado por cima de outro já visível, e o toque na miniatura não abria nada.
  const modaisMidia = (
    <>
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
            /* videoOtimizado, e não a URL crua: este player é o único lugar que baixa
               o vídeo inteiro. O estado guarda a URL ORIGINAL de propósito — a
               transformação é de entrega, aplicada na leitura, e nada a persiste. */
            <PlayerFullscreen uri={videoOtimizado(videoFullscreen)} />
          )}
        </View>
      </Modal>
    </>
  )

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.topbarTitulo}>{isDono ? 'Minha obra' : 'Detalhe da obra'}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Acima do conteúdo SEMEADO, que continua na tela: a recarga é que falhou. */}
      <BannerErroCarregamento mensagem={erro} onRetry={buscar} />

      {/* Na raiz sempre que a folha não os monta: fechada, OU fora da fase compacta (uma recarga
          por push/AppState pode desmontar a folha ainda "aberta", e os visores sumiriam). */}
      {!detalhesAbertos || !fasePosMatch ? modaisMidia : null}

      {/* KeyboardAvoidingView: o campo abre com o teclado (autoFocus) e, num iPhone pequeno, o
          teclado cobria Cancelar/Salvar do card centralizado. */}
      <Modal visible={modalReferencia} transparent animationType="fade" onRequestClose={() => setModalReferencia(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: cores.fundoCard, borderRadius: 16, padding: 24, width: '100%' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: cores.textoForte, marginBottom: 8 }}>🔎 Ponto de referência</Text>
            <Text style={{ fontSize: 13, color: cores.textoFraco, marginBottom: 16 }}>Ajuda o profissional a chegar. Deixe em branco para remover.</Text>
            <TextInput
              style={{ backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: 10, padding: 14, fontSize: 14, color: cores.textoForte, marginBottom: 16, minHeight: 80, textAlignVertical: 'top' }}
              value={textoReferencia}
              onChangeText={setTextoReferencia}
              placeholder="Ex: portão azul, ao lado da padaria"
              placeholderTextColor={cores.placeholderCampo}
              multiline
              maxLength={200}
              editable={!salvandoReferencia}
              autoFocus
              autoComplete="off"
              importantForAutofill="no"
              textContentType="none"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, padding: 14, alignItems: 'center' }}
                onPress={() => setModalReferencia(false)}
                disabled={salvandoReferencia}
              >
                <Text style={{ color: cores.textoFraco, fontWeight: '600' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[{ flex: 1, backgroundColor: cores.primaria, borderRadius: 10, padding: 14, alignItems: 'center' }, salvandoReferencia && { opacity: 0.6 }]}
                onPress={salvarReferencia}
                disabled={salvandoReferencia}
              >
                <Text style={{ color: '#0A0A0A', fontWeight: '700' }}>{salvandoReferencia ? 'Salvando...' : 'Salvar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ModalPerguntar
        visivel={modalPergunta}
        enviando={enviandoPergunta}
        onFechar={() => setModalPergunta(false)}
        onEnviar={enviarPergunta}
      />

      <SheetCancelamento
        visivel={sheetCancelar}
        carregando={!simulacaoCancelar}
        simulacao={simulacaoCancelar}
        souDono={isDono}
        nomeOutro={nomeOutroCancelamento}
        temHorario={!!obra.chegada_prevista_em}
        enviando={cancelando}
        onFechar={() => setSheetCancelar(false)}
        onCancelar={(motivo, texto) => handleCancelarMatch(motivo, texto, false)}
        onPedirAcordo={(motivo, texto) => handleCancelarMatch(motivo, texto, true)}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      {fasePosMatch ? (
        /* Tela FIXA do pós-match (components/PosMatchFixo): as cinco fases, sem rolagem. Os
           modais acima (fotos, vídeo, referência, folha de cancelamento) e a avaliação abaixo
           continuam montados; só o corpo rolável sai de cena. Handlers e chamadas são os de
           sempre — o componente só desenha. Espelha DetalheReparo. */
        <View style={[estilos.corpo, larguraMaxima, { flex: 1, paddingTop: 4, paddingBottom: 8 }]}>
          <TelaPosMatch
            fase={fasePosMatch}
            demanda={obra}
            frente="obra"
            souDono={isDono}
            valor={isDono ? (obra.valor || obra.valor_estimado) : valorCombinadoPro}
            endereco={obra.endereco_obra || [obra.cidade, obra.bairro].filter(Boolean).join(', ')}
            pontoReferencia={obra.ponto_referencia}
            outro={isDono ? pintorMatch : { nome: obra.dono_nome, foto_url: obra.dono_foto_url }}
            usuarioId={usuario?.id}
            onExpirar={obra.chegada_prevista_em ? undefined : handleExpirarMatch}
            /* Negociação do horário: POST /chegada-prevista (pintor) e /responder. */
            agendamento={{
              nomeOutro: isDono ? primeiroNome(pintorMatch?.nome) : primeiroNome(obra.dono_nome),
              limite: obra.expira_em,
              enviando: !!enviandoJanela,
              onPropor: handleProporHorario,
              respondendo: respondendoChegada,
              onResponder: handleResponderAgendamento,
            }}
            /* AGENDADO: "Estou a caminho" (handleMatch) e a vigia "o profissional veio?". */
            agendado={{
              podeDizerACaminho,
              onACaminho: handleMatch,
              enviandoACaminho,
              vigia: isDono && comparecimentoPendente ? { onResponder: () => setModalCompareceu(true) } : null,
            }}
            /* A CAMINHO: chegada (handleChegada, o mesmo /chegada dos dois lados; declarada, o
               dono confirma ou contesta), pedido de atraso (pintor pede antes de declarar a
               chegada; dono responde) e "não chegou" só com a vigia disponível — fora dela o
               caminho seria o /expirar-match, que a API recusa depois do "Estou a caminho". */
            aCaminho={{
              telefone: isDono ? pintorMatch?.telefone : donoTelefone,
              onWhatsApp: () => abrirWhatsApp(isDono ? pintorMatch?.telefone : donoTelefone),
              chegada: {
                naoDeclarada: chegadaNaoDeclarada,
                aguardaConfirmacao: chegadaAguardaConfirmacao,
                declaradaPorOutro: chegadaDeclaradaPorOutro,
                declaradaTexto: chegadaDeclaradaTexto,
                onChegada: handleChegada,
                declarando: declarandoChegada,
                onContestar: handleNaoChegou,
              },
              atraso: {
                onPedir: !isDono && chegadaNaoDeclarada ? () => setModalAtraso(true) : undefined,
                onResponder: isDono ? handleResponderAtraso : undefined,
                respondendo: respondendoAtraso,
              },
              onNaoChegou: isDono && chegadaNaoDeclarada && obra.chegada_janela === 'agendado' && !obra.comparecimento_resposta ? naoChegouACaminho : undefined,
            }}
            /* EM ANDAMENTO: concluir/confirmar com as travas de sempre (handleEncerrar atende os
               dois lados nesta tela); o pintor pediu o encerramento → card "concluída pelo
               profissional" (prazo do cron: 2 dias). */
            emAndamento={{
              telefone: isDono ? pintorMatch?.telefone : donoTelefone,
              onWhatsApp: () => abrirWhatsApp(isDono ? pintorMatch?.telefone : donoTelefone),
              rotuloBotao: isDono && encerramentoPendente && !euSolicitei ? '✅ Confirmar conclusão e avaliar' : rotuloEncerrar(isDono ? '✅ Confirmar conclusão' : '✅ Serviço concluído'),
              onConcluir: handleEncerrar,
              desabilitado: euSolicitei,
              encerramentoOutro: isDono && encerramentoPendente && !euSolicitei ? {
                nome: primeiroNome(pintorMatch?.nome),
                solicitadoEm: obra.encerramento_solicitado_em,
                automaticoEm: obra.encerramento_automatico_em,
              } : null,
            }}
            /* Cancelamento do match (até o "Estou a caminho"): botão por último; pedido de comum
               acordo pendente no lugar do bloco de estado (quem responde) ou como linha (quem pediu). */
            cancelamento={mostrarCancelamento ? {
              pedido: pedidoCancelamento,
              paraMim: pedidoCancelamento ? !pedidoEhMeu(pedidoCancelamento) : false,
              nomeOutro: nomeOutroCancelamento,
              respondendo: respondendoCancelamento,
              onResponder: handleResponderCancelamento,
              onAbrir: abrirCancelar,
              desabilitado: cancelando,
            } : null}
            links={{
              onReferencia: isDono ? abrirReferencia : undefined,
              onDetalhes: () => setDetalhesAbertos(true),
              onContrato: () => Alert.alert('📋 Contrato', 'Enviamos um contrato simples para o seu e-mail e para o da outra parte. Usar é opcional — mas é ele que protege vocês dois.'),
              onDenunciar: fasePosMatch === 'em_andamento' ? () => setSuporteAberto(true) : undefined,
            }}
          />
          {isDono && (
            <ModalCompareceu
              visivel={modalCompareceu}
              enviando={comparecendo}
              onResponder={handleComparecimento}
              onFechar={() => setModalCompareceu(false)}
            />
          )}
          {/* Descrição e fotos saem da tela e vão para a folha, para os dois lados. */}
          <ModalDetalhesDemanda
            visivel={detalhesAbertos}
            onFechar={() => setDetalhesAbertos(false)}
            titulo={obra.titulo}
            descricao={obra.descricao}
            extras={modaisMidia}
          >
            {midias.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                {midias.map((midia, i) => (
                  <TileMidia
                    key={i}
                    midia={midia}
                    emoji={emojiObra(obra.categoria)}
                    onPress={() => midia.tipo === 'video' ? setVideoFullscreen(midia.url) : setFotoFullscreen(midia.url)}
                  />
                ))}
              </ScrollView>
            ) : null}
          </ModalDetalhesDemanda>
          {!isDono && (
            <ModalPedirAtraso
              visivel={modalAtraso}
              enviando={enviandoAtraso}
              onEnviar={handlePedirAtraso}
              onFechar={() => setModalAtraso(false)}
            />
          )}
        </View>
      ) : (
      <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
          {/* Rótulo, emoji e cor vêm de utils/urgencia.js — a mesma régua do card do feed.
              O estilo guarda só o layout; fundo, borda (cor + 44) e texto seguem a faixa. */}
          {!encerrada && !souPintorDoMatch && !(isDono && temMatch) && faixaPrazo && (
            <View style={[estilos.urgenciaBanner, { backgroundColor: faixaPrazo.bg, borderColor: faixaPrazo.borda }]}>
              <Text style={[estilos.urgenciaTexto, { color: faixaPrazo.cor }]}>
                {faixaPrazo.label}
              </Text>
              {/* Contagem pré-match: some para quem está fora da disputa (recusado ou
                  dono já escolheu outro) e em obra encerrada — ali não há mais prazo a
                  correr para ninguém, nem para o dono, e o contador ficava vivo (ou
                  cravado em EXPIRADO) numa obra já concluída. Cai no texto neutro em vez
                  de deixar buraco no banner. */}
              {obra.expira_em && !foraDaDisputa && !encerrada
                ? <ContadorExpiracaoObra expiraEm={obra.expira_em} cor={faixaPrazo.cor} />
                : <Text style={[estilos.urgenciaHoras, { color: faixaPrazo.cor }]}>Prazo de execução informado</Text>
              }
            </View>
          )}

          {/* Fases pós-match (aguardando horário, proposta, agendado, a caminho, em andamento)
              vivem na tela fixa acima (TelaPosMatch); este corpo rolável nunca as desenha. */}

          {!topoCompacto && (obra.valor || obra.valor_estimado) && (
            <View style={[estilos.valorDestaque, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={estilos.valorDestaqueLinha}>
                <View>
                  <Text style={estilos.valorDestaqueLabel}>💰 {temMatch ? 'VALOR COMBINADO' : 'VALOR PROPOSTO'}</Text>
                  <Text style={estilos.valorDestaqueValor}>
                    R$ {Number((obra.valor || obra.valor_estimado)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={estilos.categoriaPill}>
                  {/* Rótulo do mapa, nunca o slug (textTransform 'none' contra o capitalize do estilo). */}
                  <Text style={[estilos.categoriaTexto, { textTransform: 'none' }]}>{rotuloCategoria(obra.categoria)}</Text>
                </View>
              </View>
              <View style={estilos.valorDestaqueDivisor} />
              <Text style={estilos.valorDestaqueNota}>Pagamento acertado direto com o profissional.{'\n'}O app não recebe valores.</Text>
            </View>
          )}

          {!topoCompacto && <Text style={estilos.titulo}>{obra.titulo}</Text>}
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
          {!topoCompacto && !((isDono || souPintorDoMatch) && obra.endereco_obra) && (
            <Text style={estilos.local}>
              📍 {obra.cidade}{obra.bairro ? `, ${obra.bairro}` : ''}
              {!isDono && distancia != null && <Text style={estilos.localDistancia}>{`  ·  ${formatarDistancia(distancia)}`}</Text>}
            </Text>
          )}
          {isDono && !faseAguardaHorario && obra.endereco_obra ? (
            <Text style={estilos.enderecoLinha}>📍 {obra.endereco_obra}</Text>
          ) : null}
          {/* Linha de referência do DONO: com valor, é a mesma linha de antes, agora tocável
              para corrigir; vazia, vira um convite discreto — sem ele não havia como saber
              que o campo existe. Fora do gate de endereco_obra de propósito: a referência é
              editável mesmo quando o endereço não foi preenchido. O profissional segue
              vendo só o texto, nos blocos acima. */}
          {isDono && !donoAgendando ? (
            <TouchableOpacity onPress={abrirReferencia} activeOpacity={0.7}>
              {obra.ponto_referencia ? (
                <Text style={estilos.pontoReferenciaLinha}>
                  🔎 Referência: {obra.ponto_referencia}
                  <Text style={estilos.referenciaAcao}>  editar</Text>
                </Text>
              ) : (
                <Text style={estilos.referenciaVazia}>🔎 Adicionar ponto de referência</Text>
              )}
            </TouchableOpacity>
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

          {(!souPintorDoMatch || mostrarPedido) && !donoAgendando && !proCompacto && obra.descricao && (
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

          {/* Paridade com DetalheReparo (B72-06): obra encerrada → banner verde de
              conclusão no lugar da contagem */}
          {obra.status === 'encerrada' && (
            <View style={estilos.finalizadoBanner}>
              <Text style={estilos.finalizadoBannerTexto}>✅ OBRA FINALIZADA COM SUCESSO!</Text>
            </View>
          )}

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
          {!topoCompacto && (souPintorDoMatch || isDono) && temMatch && obra.expira_em && !chegadaConfirmada && !encerrada && (
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

          {temMatch && !encerrada && !topoCompacto && (
            <View style={estilos.contratoBanner}>
              <Text style={estilos.contratoBannerTitulo}>📋 Contrato enviado por e-mail</Text>
              <Text style={estilos.contratoBannerTexto}>
                Enviamos um contrato simples para o seu e-mail e para o da outra parte. Usar é opcional — mas é ele que protege vocês dois.
              </Text>
            </View>
          )}

          {isDono && (
            <>
              {temMatch && !encerrada && !faseAguardaHorario && <CaixaConcluaPeloApp />}
              {obra.status === 'aberta' && !obra.match_usuario_id && (
                <TouchableOpacity
                  style={[{ backgroundColor: '#2a2200', borderWidth: 1, borderColor: '#E8833A', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 12 }, (obra.expirada || emEsperaEstender) && { opacity: 0.6 }]}
                  onPress={() => setModalEstender(true)}
                  disabled={obra.expirada || emEsperaEstender}
                >
                  {/* Prazo encerrado vem antes da espera: é definitivo, e anunciar minutos
                      para quem já perdeu o prazo prometeria uma segunda chance inexistente. */}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#E8833A' }}>{obra.expirada ? 'Prazo encerrado' : emEsperaEstender ? `⏳ Aguarde para estender (${esperaEstenderTexto})` : '⏳ Aumentar tempo da Obra'}</Text>
                </TouchableOpacity>
              )}
              <ModalEstenderPrazo
                visivel={modalEstender}
                unidade="dias"
                enviando={estendendo}
                onEstender={handleEstender}
                onFechar={() => setModalEstender(false)}
              />
              {/* Ao lado do aumento de prazo, e só quando o detalhe diz que pode: a
                  elegibilidade (pode_aumentar_valor) e o piso (valor_minimo_aumento) vêm
                  do servidor, e a tela não os adivinha. */}
              {aumentoValor.pode === true && (
                <TouchableOpacity
                  style={[{ backgroundColor: '#2a2200', borderWidth: 1, borderColor: '#E8833A', borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 12 }, aumentando && { opacity: 0.5 }]}
                  onPress={() => setModalAumentar(true)}
                  disabled={aumentando}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#E8833A' }}>Aumentar o valor da obra</Text>
                </TouchableOpacity>
              )}
              <ModalAumentarValor
                visivel={modalAumentar}
                valorMinimo={aumentoValor.minimo}
                onAumentar={handleAumentarValor}
                onFechar={() => setModalAumentar(false)}
              />
              {/* Agendamento (dia + hora) negociado entre as partes — proposta a responder,
                  aguardando o profissional ou AGENDADO: um card só, ver components/Agendamento.
                  O aceite já casa o profissional (API), então temMatch vale desde a proposta.
                  Some com a chegada confirmada: daí em diante o marco é "em andamento". */}
              {temMatch && !encerrada && !chegadaConfirmada && !faseAguardaHorario && (
                <CardAgendamento
                  demanda={obra}
                  usuarioId={usuario?.id}
                  souDono
                  nomeOutro={primeiroNome(pintorMatch?.nome)}
                  frente="obra"
                  podePropor={false}
                  enviando={!!enviandoJanela}
                  respondendo={respondendoChegada}
                  onPropor={handleProporHorario}
                  onResponder={handleResponderAgendamento}
                />
              )}
              {comparecimentoPendente && (
                <View style={estilos.pedidoAlertaBox}>
                  <Text style={estilos.pedidoAlertaTitulo}>🤔 O profissional veio?</Text>
                  <Text style={estilos.pedidoAlertaMotivo}>O horário combinado já passou. Conte para a gente o que aconteceu.</Text>
                  <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={() => setModalCompareceu(true)}>
                    <Text style={estilos.btnPerguntarTempoTexto}>Responder</Text>
                  </TouchableOpacity>
                </View>
              )}
              <ModalCompareceu
                visivel={modalCompareceu}
                enviando={comparecendo}
                onResponder={handleComparecimento}
                onFechar={() => setModalCompareceu(false)}
              />
              {/* WhatsApp do profissional SÓ depois do "Estou a caminho" (a_caminho_em) — a
                  API já devolve o telefone nulo antes disso; o gate local acompanha. */}
              {temMatch && aCaminho && pintorMatch?.telefone && !encerrada && (
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
              {/* !chegadaConfirmada: confirmada a chegada, não há mais o que contestar. */}
              {chegadaDeclaradaPorOutro && !chegadaConfirmada && !encerrada && (
                <TouchableOpacity style={estilos.btnNaoChegou} onPress={handleNaoChegou}>
                  <Text style={estilos.btnNaoChegouTexto}>🚫 O profissional não chegou</Text>
                </TouchableOpacity>
              )}
              {/* aCaminho: antes do "Estou a caminho" não há chegada a registrar nem conclusão
                  a confirmar — os dois botões esperam a_caminho_em. */}
              {temMatch && aCaminho && chegadaNaoDeclarada && !encerrada && (
                <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleChegada} disabled={declarandoChegada}>
                  <Text style={estilos.btnPerguntarTempoTexto}>{declarandoChegada ? 'Registrando…' : '🚶 Profissional chegou'}</Text>
                </TouchableOpacity>
              )}
              {temMatch && aCaminho && obra?.status !== 'encerrada' && (
                <TouchableOpacity style={[estilos.btnEncerrar, euSolicitei && { opacity: 0.6 }]} onPress={handleEncerrar} disabled={euSolicitei}>
                  <Text style={estilos.btnEncerrarTexto}>{rotuloEncerrar('✅ Confirmar conclusão — Encerrar obra')}</Text>
                </TouchableOpacity>
              )}
              {/* Pedido de atraso: só na tela única A CAMINHO (BlocoACaminho), que é onde a
                  fase vive; este corpo rolável não a desenha mais. */}
              {/* Perguntas dos profissionais: as novas no card azul, com o campo de resposta,
                  e as já respondidas embaixo. Só antes do match — depois dele a conversa
                  é com o escolhido, pelo card de agendamento. */}
              {!temMatch && !encerrada && (
                <CardPerguntasDono perguntas={perguntas} respondendoId={respondendoPerguntaId} onResponder={responderPergunta} />
              )}
              {/* Escondida na fase pós-match sem "a caminho": o bloco do topo já mostra o
                  escolhido, e os demais já perderam a disputa. */}
              {!faseAguardaHorario && (<>
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
                  const espTexto = rotulosEspecialidades(item.especialidades)
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
                          {/* Selo de quem trouxe 3 colegas aprovados (components/Indicacao). */}
                          {item.embaixador === true && <ChipEmbaixador />}
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
                    {encerrada && valorPedidoObra > 0 && (
                      <Text style={{ fontSize: 13, color: cores.textoMedio, marginBottom: 4 }}>
                        📋 Valor cadastrado: R$ {valorPedidoObra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </Text>
                    )}
                    {item.valor_proposto != null && (
                      <Text style={{ fontSize: encerrada ? 13 : 18, fontWeight: encerrada ? '400' : '700', color: cores.textoMedio, marginBottom: 4 }}>
                        {aceitouValorPedido
                          ? `💰 Seu valor proposto (R$ ${propostoFmt}) foi aceito`
                          : `💰 ${propostoEhCombinado ? 'Valor combinado' : 'Valor proposto'}: R$ ${propostoFmt}`}
                      </Text>
                    )}
                    {item.valor_contraproposta != null && (
                      <Text style={{ fontSize: encerrada ? 17 : 13, fontWeight: encerrada ? '500' : undefined, color: '#E8833A', marginBottom: 4 }}>
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
                              placeholderTextColor={cores.placeholderCampo}
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
                              onPress={() => Alert.alert('Aceitar esta proposta?', 'O profissional será avisado e a demanda deixa de receber outras propostas.\n\nO pagamento do serviço é combinado e acertado diretamente com ele.', [
                                { text: 'Cancelar', style: 'cancel' },
                                { text: 'Aceitar', onPress: () => handleResponderCandidatura(item.id, 'aceitar') },
                              ])}
                              disabled={enviandoResposta}
                            >
                              <Text style={estilos.btnAceitarTexto}>✅ Aceitar</Text>
                            </TouchableOpacity>
                            {/* Nunca sobre candidatura aceita (ou do pintor do match): o
                                servidor recusa com MATCH_ATIVO, e o caminho certo é "Cancelar
                                serviço". O bloco já exige 'pendente'; a guarda fica explícita. */}
                            {!foiAceito && !ehMatch && (
                            <TouchableOpacity
                              style={[estilos.btnRecusar, { flex: 1 }]}
                              onPress={() => Alert.alert('Recusar esta proposta?', 'O profissional será avisado e não poderá se candidatar de novo a esta demanda.', [
                                { text: 'Cancelar', style: 'cancel' },
                                { text: 'Recusar', style: 'destructive', onPress: () => handleResponderCandidatura(item.id, 'recusar') },
                              ])}
                              disabled={enviandoResposta}
                            >
                              <Text style={estilos.btnRecusarTexto}>❌ Recusar</Text>
                            </TouchableOpacity>
                            )}
                            {/* Contrapor um valor que o profissional JÁ aceitou não quer dizer
                                nada: ele copiou o valor pedido e a linha acima anuncia isso.
                                Mesma condição que desenha aquela linha (aceitouValorPedido),
                                não um segundo teste que poderia divergir dela. Aceitar e
                                Recusar continuam nos dois casos — o dono ainda escolhe entre
                                candidatos. */}
                            {!aceitouValorPedido && (
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
                            )}
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
                          {encerrada ? '✅ Obra finalizada' : chegadaConfirmada ? '▶️ Serviço em andamento' : '✅ Proposta aceita — profissional a caminho.'}
                        </Text>
                      </View>
                    )}
                  </View>
                  )
                })
              )}
              </>)}
            </>
          )}

          {isPrestador && !isDono && (
            <>
              {souPintorDoMatch && !encerrada && !proCompacto && <CaixaReputacao />}
              {/* Depois do "Estou a caminho": o card AGENDADO e a linha de confirmação — aqui,
                  fora do painel `!temMatch` (ver faseProAguardaHorario). Até a_caminho_em tudo
                  isso vive no BlocoPosMatchProfissional, no topo. Some com a chegada confirmada. */}
              {souPintorDoMatch && !encerrada && horarioAceito && aCaminho && !chegadaConfirmada && (
                <>
                  <CardAgendamento
                    demanda={obra}
                    usuarioId={usuario?.id}
                    souDono={false}
                    limite={obra.expira_em}
                    frente="obra"
                    podePropor={souPintorDoMatch}
                    enviando={!!enviandoJanela}
                    respondendo={respondendoChegada}
                    onPropor={handleProporHorario}
                    onResponder={handleResponderAgendamento}
                  />
                  {/* "Estou a caminho" só libera no DIA agendado; dado uma vez, vira a linha de
                      confirmação (a_caminho_em é write-once no servidor). */}
                  {aCaminho ? (
                    <Text style={estilos.chegadaConfirmada}>✅ Você avisou que está a caminho</Text>
                  ) : (
                    <TouchableOpacity style={[estilos.btnMatch, { marginTop: 0, marginBottom: 12 }, !podeDizerACaminho && { opacity: 0.5 }]} onPress={handleMatch} disabled={!podeDizerACaminho}>
                      <Text style={estilos.btnMatchTexto}>
                        {podeDizerACaminho ? '🚗 Estou a caminho!' : '🚗 Estou a caminho (libera no dia agendado)'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {/* WhatsApp do solicitante: dono_telefone só vem da API depois do "Estou a
                  caminho" (a_caminho_em) e só para o pintor do match. */}
              {souPintorDoMatch && aCaminho && donoTelefone && !encerrada && (
                <TouchableOpacity style={estilos.btnWhatsApp} onPress={() => abrirWhatsApp(donoTelefone)}>
                  <Text style={estilos.btnWhatsAppTexto}>💬 WhatsApp do solicitante: {donoTelefone}</Text>
                </TouchableOpacity>
              )}
              {/* Rótulo na 1ª pessoa: aqui quem toca é o próprio profissional anunciando a
                  própria chegada. O botão do DONO (mesmo endpoint, logo acima na seção dele)
                  segue em 3ª pessoa — "Profissional chegou" —, porque lá o toque fala de
                  outra pessoa e vale como confirmação, não como declaração. */}
              {/* aCaminho nos três: antes do "Estou a caminho" (aguardando horário / proposta
                  pendente) não há chegada a declarar nem conclusão — o /chegada marcaria
                  a_caminho_em por tabela, pulando o agendamento, e o /encerrar é 409. */}
              {souPintorDoMatch && aCaminho && chegadaNaoDeclarada && !encerrada && (
                <TouchableOpacity style={estilos.btnPerguntarTempo} onPress={handleChegada} disabled={declarandoChegada}>
                  <Text style={estilos.btnPerguntarTempoTexto}>{declarandoChegada ? 'Registrando…' : '🚶 Cheguei no local do serviço'}</Text>
                </TouchableOpacity>
              )}
              {souPintorDoMatch && aCaminho && chegadaAguardaConfirmacao && !encerrada && (
                <View style={estilos.pedidoBox}>
                  <Text style={estilos.pedidoTexto}>⏳ Aguardando o solicitante confirmar sua chegada...</Text>
                </View>
              )}
              {souPintorDoMatch && aCaminho && obra?.status !== 'encerrada' && (
                <TouchableOpacity style={[estilos.btnEncerrar, euSolicitei && { opacity: 0.6 }]} onPress={handleEncerrar} disabled={euSolicitei}>
                  <Text style={estilos.btnEncerrarTexto}>{rotuloEncerrar('✅ Serviço concluído — Encerrar')}</Text>
                </TouchableOpacity>
              )}
              {/* Pedido de atraso ("Vou atrasar"): só na tela única A CAMINHO (BlocoACaminho). */}
              {/* Perguntas públicas sobre a obra e o botão de fazer a própria. Só antes do
                  match. O botão some com a própria pergunta já feita (`minha`), fora da
                  disputa (recusado), sem assinatura (mesma regra do "Tenho interesse") e
                  com o formulário de proposta aberto — ele fica ACIMA do "Tenho interesse". */}
              {!temMatch && !encerrada && (
                <>
                  <CardPerguntasProfissional perguntas={perguntas} />
                  {assinaturaAtiva && !foraDaDisputa && !mostrarForm && !perguntas.some(p => p.minha) && (
                    <BotaoPerguntar onPress={() => setModalPergunta(true)} />
                  )}
                </>
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
                              placeholderTextColor={cores.placeholderCampo}
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
                        {/* Agendamento ACIMA do botão de partida: combinar o dia e a hora é o
                            passo anterior a "estou a caminho". O card cobre os três estados
                            (propor, aguardando, agendado) — ver components/Agendamento. */}
                        <CardAgendamento
                          demanda={obra}
                          usuarioId={usuario?.id}
                          souDono={false}
                          limite={obra.expira_em}
                          frente="obra"
                          podePropor={souPintorDoMatch}
                          enviando={!!enviandoJanela}
                          respondendo={respondendoChegada}
                          onPropor={handleProporHorario}
                          onResponder={handleResponderAgendamento}
                        />
                        {/* "Estou a caminho" só libera no DIA agendado; dado uma vez, vira a
                            linha de confirmação (a_caminho_em é write-once no servidor). */}
                        {aCaminho ? (
                          <Text style={estilos.chegadaConfirmada}>✅ Você avisou que está a caminho</Text>
                        ) : (
                          <TouchableOpacity style={[estilos.btnMatch, !podeDizerACaminho && { opacity: 0.5 }]} onPress={handleMatch} disabled={!podeDizerACaminho}>
                            <Text style={estilos.btnMatchTexto}>
                              {podeDizerACaminho ? '🚗 Estou a caminho!' : obra.chegada_prevista_em ? '🚗 Estou a caminho (libera no dia agendado)' : '🚗 Estou a caminho (agende o horário primeiro)'}
                            </Text>
                          </TouchableOpacity>
                        )}
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
                ) : !assinaturaAtiva ? (
                  /* Sem assinatura ativa não há proposta. Só o iOS chega aqui assim (no
                     Android quem deve nem entra nas abas): leitura completa, ação não —
                     e nenhuma frase no lugar (3.1.1). */
                  null
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
                          placeholderTextColor={cores.placeholderCampo}
                          keyboardType="numeric"
                          value={valorProposto}
                          onChangeText={v => setValorProposto(mascararValor(v))}
                        />
                        <Text style={{ color: '#f44336', fontWeight: '700', fontSize: 12, marginTop: 6, lineHeight: 18 }}>
                          ⚠️ Se você propuser outro valor, a obra ainda ficará disponível para outros profissionais até que o solicitante aceite. Pense bem!
                        </Text>
                      </View>
                    )}
                    <PerguntaOpcoes label="⏱ Há quanto tempo realiza esse tipo de serviço?" opcoes={['Menos de 1 ano', '1 a 3 anos', '3 a 5 anos', 'Mais de 5 anos']} valor={tempoExperiencia} onChange={setTempoExperiencia} />
                    <PerguntaOpcoes label="⚠️ Já enfrentou problemas com esse tipo de serviço?" opcoes={['Nunca', 'Raramente', 'Algumas vezes']} valor={jaEnfrentouProblemas} onChange={setJaEnfrentouProblemas} />
                    <PerguntaOpcoes label="📋 Possui referências em obras de pintura?" opcoes={['Sim', 'Não', 'Tenho fotos de serviços']} valor={possuiReferencias} onChange={setPossuiReferencias} />
                    <PerguntaOpcoes label="🎨 Possui todos os materiais e equipamentos necessários?" opcoes={['Sim, todos', 'A maioria', 'Preciso de alguns']} valor={possuiFerramentas} onChange={setPossuiFerramentas} />
                    <View style={estilos.perguntaWrap}>
                      <Text style={estilos.perguntaLabel}>💡 Sugestão para melhorar o acabamento (opcional)</Text>
                      <TextInput style={estilos.textarea} placeholder="Ex: Recomendo usar tinta premium para maior durabilidade..." placeholderTextColor={cores.placeholderCampo} value={sugestaoDurabilidade} onChangeText={setSugestaoDurabilidade} multiline numberOfLines={3} />
                      <AvisoContatoOculto />
                    </View>
                    <View style={estilos.perguntaWrap}>
                      <Text style={estilos.perguntaLabel}>💬 Mensagem adicional (opcional)</Text>
                      <TextInput style={estilos.textarea} placeholder="Alguma informação extra..." placeholderTextColor={cores.placeholderCampo} value={mensagemAdicional} onChangeText={setMensagemAdicional} multiline numberOfLines={3} />
                      <AvisoContatoOculto />
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
      )}
      </KeyboardAvoidingView>

      {/* Avaliação pós-encerrar (dono). Mesma invocação de ContratosFinalizadosScreen. */}
      <ModalAvaliacao
        visivel={avaliarVisivel}
        nomeAvaliado={pintorMatch?.nome || 'o profissional'}
        onEnviar={enviarAvaliacaoEncerrar}
        onFechar={finalizarPosEncerrar}
      />
      <VerificacaoIdentidadeSheet
        visivel={verificacao.aberta}
        onFechar={verificacao.fechar}
        onConcluido={() => navigation.goBack()}
        onAprovado={handleInteresse}
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
  // Só layout: fundo, borda e cor do texto vêm da faixa de utils/urgencia.js, inline.
  urgenciaBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: raios.grande, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12 },
  urgenciaTexto: { fontSize: 14, fontWeight: '700' },
  urgenciaHoras: { fontSize: 12 },
  valorDestaque: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.sucessoSuave, borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  valorDestaqueLabel: { fontSize: 10, color: cores.sucesso, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  valorDestaqueValor: { fontSize: 24, fontWeight: '700', color: cores.sucesso },
  valorDestaqueLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valorDestaqueDivisor: { height: 1, backgroundColor: cores.sucesso, opacity: 0.2, marginTop: 12, marginBottom: 8 },
  valorDestaqueNota: { fontSize: 11, color: cores.sucesso, fontWeight: '500', lineHeight: 16 },
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
  // "editar" no fim da própria linha, sem virar botão: a linha inteira já é a área de toque.
  referenciaAcao:       { fontSize: 12, color: cores.primaria, fontWeight: '600' },
  // Convite quando não há referência. Margens próprias (não as da linha preenchida, que
  // tem marginTop negativo para colar no endereço) porque aqui não há linha acima a colar.
  referenciaVazia:      { fontSize: 12, color: cores.primaria, fontWeight: '600', marginBottom: 16 },
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
  finalizadoBanner: { backgroundColor: '#1a3a1a', borderWidth: 1.5, borderColor: '#4caf50', borderRadius: raios.grande, padding: 20, alignItems: 'center', marginBottom: 16 },
  finalizadoBannerTexto: { fontSize: 16, fontWeight: '700', color: '#4caf50', textAlign: 'center', letterSpacing: 0.5 },
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
  textarea: { backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: raios.medio, padding: 14, fontSize: 13, color: cores.textoForte, minHeight: 80, textAlignVertical: 'top' },
  input: { backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: raios.medio, padding: 14, fontSize: 15, color: cores.textoForte },
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
  chegadaConfirmada: { fontSize: 13, fontWeight: '600', color: '#4caf50', marginBottom: 4 },
  // Chegada prometida (dono). Mesma família visual do banner de contrato.
  chegadaBox: { backgroundColor: '#1a2a3a', borderWidth: 1, borderColor: '#4a90d9', borderRadius: raios.medio, padding: 12, marginBottom: 12 },
  chegadaTexto: { fontSize: 14, fontWeight: '700', color: '#6ab0f3' },
  // Serviço em andamento (as duas partes), no lugar que era da contagem.
  emAndamentoBox: { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.grande, padding: 16, alignItems: 'center', marginBottom: 16 },
  emAndamentoTexto: { fontSize: 15, fontWeight: '700', color: '#4caf50' },
})
