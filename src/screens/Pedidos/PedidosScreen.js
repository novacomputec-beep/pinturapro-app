import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Modal, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, Animated
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import useArrastarParaFechar from '../../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from '../../components/BotaoFecharFolha'
import * as Location from 'expo-location'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { comRetry } from '../../utils/rede'
import { registrarVisualizacao } from '../../services/feedVisualizacoesService'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'
import { useCoordsUsuario } from '../../utils/distancia'
import { paraFiltro, CATEGORIAS_SERVICO, CATEGORIAS_OBRA } from '../../utils/categorias'
import { podeServicos, podeObras } from '../../utils/profissional'
import { aoPedidoIndisponivel } from '../../utils/pedidoIndisponivel'
import { softAskRef } from '../../components/SoftAskNotificacao'
import BannerAtivarNotificacoes from '../../components/BannerAtivarNotificacoes'
import BannerComoFunciona from '../../components/BannerComoFunciona'
import { BannerConvideColega } from '../../components/Indicacao'
import BannerCanalWhatsApp from '../../components/BannerCanalWhatsApp'
import EtiquetaTipo from '../../components/EtiquetaTipo'
import { CardReparo } from '../Reparos/FeedReparosScreen'
import { CardObra } from '../Obra/FeedObrasScreen'

// "Pedidos para você" (Arte-Fase2-Trabalhar): o feed ÚNICO do profissional — os serviços,
// para quem pode serviços (usuario.pode_servicos), e as obras, para quem pode obras
// (usuario.pode_obras), na mesma lista, cada card com a etiqueta pequena "Serviço" / "Obra" e
// o segmento Todos / Serviços / Obras por cima.
//
// É a soma dos dois feeds de sempre (FeedReparosScreen e FeedObrasScreen), não um terceiro:
//   - as MESMAS duas consultas (GET /reparos e GET /obras), com os mesmos parâmetros de raio,
//     cidade de busca e categoria, e o mesmo desenho de aborto/timeout/refetch ao focar;
//   - os MESMOS cards (CardReparo e CardObra, importados de lá — prazo, urgência, capa,
//     distância e contador são os deles), abrindo DetalheReparo ou DetalheObra;
//   - os mesmos filtros de distância e o "Buscar em outra cidade".
// O que cada conta vê sai de utils/profissional, pela CAPACIDADE que a API devolve (por
// pessoa) e não pelo tipo da conta: a conta de serviços vê serviços e, com especialidade de
// obra, obras; a conta de obra (pintor/construtor) vê obras e, com especialidade de serviço,
// serviços. Com um tipo só, a tela é o feed daquele tipo: sem segmento e sem etiqueta.
//
// Filtro de CATEGORIA: as listas de categoria são diferentes nos dois tipos (categorias de
// serviço × tipos de obra), então os chips aparecem quando há UM tipo na tela — no segmento
// Serviços ou Obras, ou na conta de um tipo só. Em "Todos" não há chips; trocar de segmento
// limpa a categoria.

const DISTANCIAS = [
  { id: 'cidade', label: 'Cidade'   },
  { id: '40',     label: '+40 km'  },
  { id: '80',     label: '+80 km'  },
  { id: '120',    label: '+120 km' },
  { id: '300',    label: '+300 km' },
  { id: '500',    label: '+500 km' },
  { id: 'estado', label: 'Estado'  },
  { id: 'pais',   label: 'País'    },
]

const CATEGORIAS_POR_TIPO = { reparo: paraFiltro(CATEGORIAS_SERVICO), obra: paraFiltro(CATEGORIAS_OBRA) }

export const SEGMENTOS_PEDIDOS = [
  { id: 'todos',    label: 'Todos'    },
  { id: 'servicos', label: 'Serviços' },
  { id: 'obras',    label: 'Obras'    },
]

// Junta as duas listas para o segmento "Todos": quem FINALIZA antes vem primeiro. Intercala
// sem reordenar cada lista por dentro — a ordem que o servidor deu a cada tipo é preservada,
// só se decide de qual das duas sai o próximo card. Sem expira_em, o card vai para o fim.
export const intercalarPedidos = (reparos, obras) => {
  const quando = (x) => { const t = new Date(x?.expira_em).getTime(); return Number.isFinite(t) ? t : Infinity }
  const rs = (reparos || []).map((item) => ({ tipo: 'reparo', item, chave: `reparo:${item.id}` }))
  const os = (obras || []).map((item) => ({ tipo: 'obra', item, chave: `obra:${item.id}` }))
  const saida = []
  let i = 0, j = 0
  while (i < rs.length && j < os.length) saida.push(quando(rs[i].item) <= quando(os[j].item) ? rs[i++] : os[j++])
  return [...saida, ...rs.slice(i), ...os.slice(j)]
}

// Título laranja + "Das suas especialidades · Cidade". Exportado para a Galeria.
export const CabecalhoPedidos = ({ cidade }) => (
  <View style={estilos.header}>
    <Text style={estilos.titulo}>Pedidos para você</Text>
    <Text style={estilos.subtitulo} numberOfLines={1}>Das suas especialidades{cidade ? ` · ${cidade}` : ''}</Text>
  </View>
)

// Segmento Todos / Serviços / Obras. Exportado para a Galeria.
export const SegmentoPedidos = ({ valor, onMudar }) => (
  <View style={estilos.segmentos} accessibilityRole="tablist">
    {SEGMENTOS_PEDIDOS.map((s) => (
      <TouchableOpacity
        key={s.id}
        style={[estilos.segmento, valor === s.id && estilos.segmentoAtivo]}
        onPress={() => onMudar(s.id)}
        accessibilityRole="tab"
        accessibilityState={{ selected: valor === s.id }}
      >
        <Text style={[estilos.segmentoTexto, valor === s.id && estilos.segmentoTextoAtivo]}>{s.label}</Text>
      </TouchableOpacity>
    ))}
  </View>
)

const VAZIO = {
  todos:    { icone: '📋', titulo: 'Nenhum pedido disponível',  sub: 'Novos pedidos das suas especialidades aparecem aqui quando forem publicados.' },
  servicos: { icone: '🔧', titulo: 'Nenhum serviço disponível', sub: 'Novos serviços aparecem aqui quando forem publicados.' },
  obras:    { icone: '🏠', titulo: 'Nenhuma obra disponível',   sub: 'Novas obras aparecem aqui quando forem publicadas.' },
}

// Cache de GPS em nível de módulo: evita chamar o GPS a cada toque no filtro de
// distância (a leitura pode travar o spinner por segundos em aparelhos lentos).
// TTL de 5 min: o menor raio filtrável é 40 km, e em 5 min ninguém se desloca o
// bastante para mudar o resultado.
let gpsCache = { coords: null, timestamp: 0 }
const GPS_CACHE_TTL = 300000 // 5 minutos

// Promessa que nunca rejeita: { ok, valor } | { ok: false, erro }. As duas consultas correm
// juntas e a falha de uma não pode derrubar o que a outra trouxe.
const resolver = (p) => p.then((valor) => ({ ok: true, valor }), (erro) => ({ ok: false, erro }))

export default function PedidosScreen({ navigation }) {
  const { usuario } = useAuth()
  const comServicos = podeServicos(usuario)
  const comObras = podeObras(usuario)
  const doisTipos = comServicos && comObras

  const [reparos, setReparos] = useState([])
  const [obras, setObras] = useState([])
  // Pedido recusado com 409 PEDIDO_INDISPONIVEL no detalhe (dono excluiu): o card sai na hora.
  useEffect(() => aoPedidoIndisponivel(({ tipo, id }) => {
    if (tipo === 'reparo') setReparos(prev => prev.filter(r => r.id !== id))
    if (tipo === 'obra') setObras(prev => prev.filter(o => o.id !== id))
  }), [])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [segmento, setSegmento] = useState('todos')
  const [categoria, setCategoria] = useState('todas')
  const [distancia, setDistancia] = useState('cidade')
  const [erro, setErro] = useState(null)
  const [coords, setCoords] = useCoordsUsuario()
  // "Buscar em outra cidade": null = usa a cidade do perfil; objeto = { cidade, uf }
  const [cidadeBusca, setCidadeBusca] = useState(null)
  const [modalCidadeVisivel, setModalCidadeVisivel] = useState(false)
  // Arrastar o título da folha "Buscar em outra cidade" para baixo fecha como o Cancelar e o
  // voltar do Android; as listas de estado/cidade seguem rolando.
  const arrasteCidade = useArrastarParaFechar(() => setModalCidadeVisivel(false), modalCidadeVisivel)
  const [ufSelecionada, setUfSelecionada] = useState('')
  const [cidadeSelecionada, setCidadeSelecionada] = useState('')
  const [estados, setEstados] = useState([])
  const [cidades, setCidades] = useState([])
  const [buscaCidade, setBuscaCidade] = useState('')
  const mountedRef = useRef(true)
  // Aborta as requisições em voo quando uma nova seleção de filtro chega (evita corrida
  // onde uma resposta antiga/lenta sobrescreve a lista de uma seleção mais recente).
  const abortRef = useRef(null)
  useEffect(() => () => {
    mountedRef.current = false
    abortRef.current?.abort()
  }, [])

  // Tipo a que os chips de categoria se referem agora (null = sem chips): o do segmento, ou o
  // único tipo da conta.
  const tipoCategoria = doisTipos
    ? (segmento === 'servicos' ? 'reparo' : segmento === 'obras' ? 'obra' : null)
    : (comObras ? 'obra' : 'reparo')

  // Rastreamento de visualização no viewport (só serviços, como no feed de serviços): registra
  // cada serviço que ficar visível para o feed de proximidade. Identidade estável entre
  // renders (a FlatList não aceita onViewableItemsChanged mutável).
  const onViewableItemsChangedRef = useRef(({ viewableItems }) => {
    viewableItems.forEach(v => {
      if (v.item?.tipo === 'reparo' && v.item.item?.id) registrarVisualizacao('reparo', v.item.item.id)
    })
  })
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 500 })

  // Refs com os filtros atuais para o refetch ao reganhar foco, sem recriar o callback.
  const categoriaRef = useRef(categoria); categoriaRef.current = categoria
  const distanciaRef = useRef(distancia); distanciaRef.current = distancia
  const cidadeBuscaRef = useRef(cidadeBusca); cidadeBuscaRef.current = cidadeBusca
  const tipoCategoriaRef = useRef(tipoCategoria); tipoCategoriaRef.current = tipoCategoria
  // Mesmo motivo: a âncora do raio sai da cidade cadastrada, e o perfil pode ser editado
  // (EditarPerfil chama setUsuario) enquanto o callback de foco segue preso ao 1º render. O
  // que a conta pode ver também muda em uso (salvar uma especialidade de obra liga as obras).
  const usuarioRef = useRef(usuario); usuarioRef.current = usuario

  // Atualização otimista: a seleção (highlight) muda na hora; a busca é disparada pelo
  // useEffect abaixo. O filtro de distância NÃO é persistido: o feed sempre abre em 'cidade'.
  const mudarDistancia = (val) => { setDistancia(val) }
  const mudarCategoria = (cat) => { setCategoria(cat) }
  // Trocar de segmento limpa a categoria (as listas de categoria são de tipos diferentes).
  // Sem categoria ativa as duas listas já estão em mãos e a troca é só de exibição.
  const mudarSegmento = (s) => {
    setSegmento(s)
    if (categoria !== 'todas') setCategoria('todas')
  }

  // ─── "Buscar em outra cidade" ─────────────────────────────────────────
  // A cidade de busca vive apenas no estado da sessão atual: ao reabrir o app,
  // o filtro volta para a cidade do perfil (sem persistência).
  const buscarEstados = async () => {
    try {
      const r = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
      const data = await r.json()
      setEstados(data.map(e => ({ sigla: e.sigla, nome: e.nome })))
    } catch (err) { console.log('[Pedidos] falha ao buscar estados IBGE | msg:', err.message) }
  }

  const buscarCidades = async (uf) => {
    setCidades([])
    setCidadeSelecionada('')
    try {
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
      const data = await r.json()
      setCidades(data.map(m => ({ id: m.id, nome: m.nome })))
    } catch (err) { console.log('[Pedidos] falha ao buscar cidades IBGE | msg:', err.message) }
  }

  // Recarrega as cidades sempre que o estado selecionado muda.
  useEffect(() => {
    if (ufSelecionada) buscarCidades(ufSelecionada)
  }, [ufSelecionada])

  // Sem geocodificação no cliente: o servidor resolve a âncora da busca a partir de
  // cidade_busca + uf_busca, com o centroide do próprio dataset de municípios.
  const confirmarCidadeBusca = () => {
    if (!ufSelecionada || !cidadeSelecionada) return
    setCidadeBusca({ cidade: cidadeSelecionada, uf: ufSelecionada })
    // Trocar a âncora zera o escopo, SEMPRE: um raio escolhido pensando na cidade ANTERIOR,
    // reaplicado calado a outra cidade, devolve uma lista que ninguém pediu. Ampliar de novo
    // custa um toque — e aí é escolha consciente, já sabendo qual é a cidade de referência.
    setDistancia('cidade')
    setBuscaCidade('')
    setModalCidadeVisivel(false)
  }

  const limparCidadeBusca = () => {
    setCidadeBusca(null)
    // Limpar também é TROCAR de âncora — ela volta a ser a cidade do cadastro —, então o
    // escopo volta junto, pelo mesmo motivo do confirmarCidadeBusca acima.
    setDistancia('cidade')
    setBuscaCidade('')
    // Sem busca imperativa aqui: cidadeBusca é dependência do efeito único, que dispara
    // sozinho. O ref, porém, precisa zerar já: quem o lê é o refetch ao reganhar foco.
    cidadeBuscaRef.current = null
  }

  const buscarPedidos = async (cat = categoria, dist = distancia, { refresh = false } = {}) => {
    // Lidos via ref para que o refetch ao reganhar foco (callback memoizado com deps [])
    // enxergue os valores atuais, não os capturados na 1ª renderização.
    const cid = cidadeBuscaRef.current
    const u = usuarioRef.current
    const tiposDaConta = [podeServicos(u) && 'reparo', podeObras(u) && 'obra'].filter(Boolean)
    // Com categoria escolhida só o tipo dela é consultado (o outro nem está na tela); sem
    // categoria, todos os tipos da conta — é o que deixa a troca de segmento instantânea.
    const tipoCat = tipoCategoriaRef.current
    const tipos = cat !== 'todas' && tipoCat ? tiposDaConta.filter(t => t === tipoCat) : tiposDaConta

    // Cancela qualquer requisição anterior ainda em voo.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Spinner com timeout máximo de 20s: se estourar, aborta e mostra erro.
    // (20s acomoda GPS + cold start + as próprias requisições.)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      if (mountedRef.current && abortRef.current === controller) {
        setErro('Tempo limite excedido. Verifique sua conexão e tente novamente.')
        setCarregando(false)
        setAtualizando(false)
      }
    }, 20000)

    // No pull-to-refresh não liga, senão o RefreshControl e o indicador se somariam.
    if (!refresh && mountedRef.current) setCarregando(true)

    try {
      setErro(null)
      // Parâmetros COMUNS às duas consultas (os mesmos nomes nos dois endpoints).
      const params = {}
      if (cat !== 'todas') params.categoria = cat
      params.raio_km = dist
      if (cid) {
        params.cidade_busca = cid.cidade
        params.uf_busca = cid.uf
      }
      // Filtro por km: a âncora do raio é sempre uma CIDADE, nunca o aparelho. Com cidade
      // escolhida ela já foi enviada acima; sem cidade escolhida, entra a cidade CADASTRADA
      // do usuário. O servidor resolve o centroide a partir de cidade_busca + uf_busca, então
      // os dois campos andam juntos — um sozinho não identifica município. Sem cidade/uf no
      // cadastro, segue sem âncora e a API cai para o filtro por cidade.
      if (dist !== 'estado' && dist !== 'pais' && dist !== 'cidade' && !cid) {
        // Há cadastro em que a UF vem colada na cidade ("Niterói, RJ"). O sufixo é sempre
        // retirado do nome — com ele o servidor não acha o município nem quando a UF existe
        // em campo próprio. A UF cadastrada tem prioridade; o sufixo só cobre quem não a tem.
        let cidadeAncora = u?.cidade || null
        let ufSufixo = null
        if (cidadeAncora) {
          const partes = cidadeAncora.match(/^\s*(.+?),\s*([A-Za-z]{2})\s*$/)
          if (partes) {
            cidadeAncora = partes[1].trim()
            ufSufixo = partes[2].toUpperCase()
          } else {
            cidadeAncora = cidadeAncora.trim()
          }
        }
        const ufAncora = u?.uf || ufSufixo
        if (cidadeAncora && ufAncora) {
          params.cidade_busca = cidadeAncora
          params.uf_busca = ufAncora
        }
        // O GPS continua sendo lido aqui, mas SÓ alimenta a distância por card (setCoords):
        // não entra nos parâmetros da busca, logo não desloca o raio.
        try {
          const { status } = await Location.requestForegroundPermissionsAsync()
          if (status === 'granted') {
            const agora = Date.now()
            let coordsUsar = null
            if (gpsCache.coords && (agora - gpsCache.timestamp) < GPS_CACHE_TTL) {
              // Cache de GPS ainda válido: usa direto, sem chamar o GPS.
              coordsUsar = gpsCache.coords
            } else {
              try {
                // Primeiro a última posição conhecida do SO: volta praticamente na hora e
                // é precisa o bastante para um raio de dezenas de km. Só quando não há
                // nenhuma é que vale uma leitura ao vivo — e ainda assim com teto curto.
                let loc = await Location.getLastKnownPositionAsync()
                if (!loc) {
                  loc = await Promise.race([
                    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('gps_timeout')), 1500))
                  ])
                }
                gpsCache = { coords: loc.coords, timestamp: Date.now() }
                coordsUsar = loc.coords
              } catch (errGps) {
                // Timeout/permissão de GPS: se houver coords em cache (mesmo expiradas),
                // usa silenciosamente; senão a distância por card fica sem base nesta passada.
                console.log('[Pedidos] GPS indisponível, usando cache se houver | msg:', errGps.message)
                if (gpsCache.coords) coordsUsar = gpsCache.coords
              }
            }
            if (coordsUsar && mountedRef.current && abortRef.current === controller) {
              setCoords({ lat: coordsUsar.latitude, lng: coordsUsar.longitude })
            }
          }
        } catch (err) {
          console.log('[Pedidos] falha ao obter localização | code:', err.code, '| msg:', err.message)
        }
      }

      // As MESMAS chamadas dos dois feeds, lado a lado. Cada uma na forma em que sempre foi
      // feita (query string no serviço, `params` na obra).
      const qs = new URLSearchParams()
      Object.keys(params).forEach((k) => qs.set(k, params[k]))
      const consultas = tipos.map((tipo) => resolver(tipo === 'reparo'
        ? comRetry(() => api.get(`/reparos?${qs.toString()}`, { signal: controller.signal }))
        : comRetry(() => api.get('/obras', { params, signal: controller.signal }))))
      const respostas = await Promise.all(consultas)

      // Só aplica se ainda for a busca atual (descarta respostas obsoletas). Estourar o
      // timeout de 20s não descarta o que chegou: se a resposta veio e ainda é a corrente,
      // ela é renderizada — o timeout manda no aviso de erro, não em dado já pago.
      if (!mountedRef.current || abortRef.current !== controller) return
      let falha = null
      let algumaChegou = false
      tipos.forEach((tipo, i) => {
        const r = respostas[i]
        if (r.ok) {
          algumaChegou = true
          if (tipo === 'reparo') setReparos(r.valor?.reparos || [])
          else setObras(r.valor?.obras || [])
          return
        }
        // Cancelada (substituída por nova seleção ou pelo timeout): ignora silenciosamente.
        if (r.erro?.code === 'ERR_CANCELED') return
        console.log('[Pedidos] falha ao buscar', tipo === 'reparo' ? 'serviços' : 'obras', '| status:', r.erro?.status, '| code:', r.erro?.code, '| msg:', r.erro?.mensagem)
        if (!falha) falha = r.erro?.mensagem || (tipo === 'reparo' ? 'Erro ao buscar serviços' : 'Erro ao buscar obras')
      })
      if (falha && !timedOut) setErro(falha)
      else if (timedOut && algumaChegou) setErro(null)
    } catch (err) {
      // As consultas não rejeitam (resolver); isto cobre o imprevisto fora delas.
      console.log('[Pedidos] falha inesperada ao buscar pedidos | msg:', err?.message)
      if (!timedOut && mountedRef.current && abortRef.current === controller) setErro('Erro ao buscar pedidos')
    } finally {
      clearTimeout(timer)
      // Se a busca corrente terminou — inclusive depois do timeout — o spinner tem de sair.
      if (mountedRef.current && abortRef.current === controller) {
        setCarregando(false)
        setAtualizando(false)
      }
    }
  }

  // Fonte única de busca: dispara na montagem e a cada troca de filtro. comServicos/comObras
  // entram porque salvar as especialidades no Perfil muda o que a conta pode ver.
  useEffect(() => { buscarPedidos(categoria, distancia) }, [categoria, distancia, cidadeBusca, comServicos, comObras])

  // Perdeu um dos tipos com o segmento dele selecionado: volta a "Todos".
  useEffect(() => { if (!doisTipos && segmento !== 'todos') setSegmento('todos') }, [doisTipos, segmento])

  // Refetch ao reganhar foco — pula o primeiro foco, já coberto pelo useEffect acima.
  const primeiroFocoRef = useRef(true)
  useFocusEffect(useCallback(() => {
    if (primeiroFocoRef.current) { primeiroFocoRef.current = false; return }
    buscarPedidos(categoriaRef.current, distanciaRef.current)
  }, []))
  // Soft-ask de notificação no primeiro momento de relevância do profissional: ver o feed.
  // mostrar() faz o próprio check ao vivo e só exibe uma vez — chamar a cada foco é ok.
  useFocusEffect(useCallback(() => {
    const u = usuarioRef.current
    softAskRef.mostrar?.(podeServicos(u) && podeObras(u) ? 'profissional' : podeObras(u) ? 'pintor' : 'reparador')
  }, []))

  const onRefresh = () => { setAtualizando(true); buscarPedidos(categoria, distancia, { refresh: true }) }

  // O que vai para a lista: um tipo só (conta de um tipo, ou segmento) ou os dois intercalados.
  const lista = useMemo(() => {
    const soReparos = !comObras || (doisTipos && segmento === 'servicos')
    const soObras = !comServicos || (doisTipos && segmento === 'obras')
    return intercalarPedidos(soObras ? [] : reparos, soReparos ? [] : obras)
  }, [reparos, obras, segmento, doisTipos, comServicos, comObras])

  const chips = tipoCategoria ? CATEGORIAS_POR_TIPO[tipoCategoria] : null
  const vazio = VAZIO[doisTipos ? segmento : (comObras ? 'obras' : 'servicos')] || VAZIO.todos

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <CabecalhoPedidos cidade={cidadeBusca ? cidadeBusca.cidade : usuario?.cidade} />

      <BannerComoFunciona navigation={navigation} />
      {/* Canal do WhatsApp: nunca junto do "Como funciona" (ele decide isso sozinho) e na
          frente do convite de indicação — prioridade a quem está sem push. */}
      <BannerCanalWhatsApp />
      {/* Depois do primeiro match: "Convide um colega". As regras de reaparecer/parar vivem
          em utils/indicacao. */}
      <BannerConvideColega navigation={navigation} />

      {/* Fora da FlatList de propósito: fica fixo no topo enquanto a permissão de
          notificação não existe, e devolve null assim que ela é concedida. */}
      <BannerAtivarNotificacoes />

      {erro && (
        <View style={estilos.erroBox}>
          <Text style={estilos.erroTexto}>{erro}</Text>
          <TouchableOpacity onPress={() => buscarPedidos(categoria, distancia)} style={{ marginTop: 8 }}>
            <Text style={{ color: cores.primaria, fontSize: 13 }}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={lista}
        keyExtractor={(p) => p.chave}
        contentContainerStyle={[estilos.lista, larguraMaxima]}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        viewabilityConfig={viewabilityConfigRef.current}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
        ListHeaderComponent={
          <>
            {doisTipos && <SegmentoPedidos valor={segmento} onMudar={mudarSegmento} />}
            {chips && (
              <FlatList
                data={chips}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                style={estilos.filtros}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[estilos.filtroPill, categoria === item.id && estilos.filtroPillAtivo]}
                    onPress={() => mudarCategoria(item.id)}
                  >
                    <Text style={[estilos.filtroTexto, categoria === item.id && estilos.filtroTextoAtivo]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity
              style={[estilos.btnCidadeBusca, !chips && { marginTop: 4 }]}
              onPress={() => { setUfSelecionada(''); setCidadeSelecionada(''); setBuscaCidade(''); setModalCidadeVisivel(true); buscarEstados() }}
            >
              <Text style={estilos.txtCidadeBusca}>
                📍 {cidadeBusca ? `${cidadeBusca.cidade} - ${cidadeBusca.uf}` : (usuario?.cidade || 'Minha cidade')}
              </Text>
              {cidadeBusca && (
                <TouchableOpacity onPress={limparCidadeBusca} style={estilos.btnLimparCidade}>
                  <Text style={estilos.txtLimparCidade}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
            <Modal visible={modalCidadeVisivel} animationType="slide" transparent onRequestClose={() => setModalCidadeVisivel(false)}>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <View style={estilos.modalOverlay}>
                  <Animated.View style={[estilos.modalContainer, arrasteCidade.estiloArraste]}>
                    <View {...arrasteCidade.panHandlers}>
                      <LinhaCabecalhoFolha onFechar={() => setModalCidadeVisivel(false)}>
                        <Text style={estilos.modalTitulo}>Buscar em outra cidade</Text>
                      </LinhaCabecalhoFolha>
                    </View>

                    <Text style={estilos.modalLabel}>Estado</Text>
                    <ScrollView style={ufSelecionada ? estilos.listaScrollEstadoColapsado : estilos.listaScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {estados.map(e => (
                        <TouchableOpacity key={e.sigla} style={[estilos.itemLista, ufSelecionada === e.sigla && estilos.itemListaAtivo]} onPress={() => { setUfSelecionada(e.sigla) }}>
                          <Text style={[estilos.itemListaTxt, ufSelecionada === e.sigla && estilos.itemListaTxtAtivo]}>{e.nome} ({e.sigla})</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {ufSelecionada ? (
                      <>
                        <Text style={estilos.modalLabel}>Cidade</Text>
                        <TextInput
                          style={estilos.inputBuscaCidade}
                          placeholder="Buscar cidade..."
                          placeholderTextColor={cores.placeholderCampo}
                          value={buscaCidade}
                          onChangeText={setBuscaCidade}
                          autoCapitalize="words"
                        />
                        <ScrollView style={estilos.listaScrollCidade} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                          {cidades.length === 0
                            ? <Text style={estilos.txtCarregando}>Carregando cidades...</Text>
                            : cidades.filter(c => c.nome.toLowerCase().includes(buscaCidade.toLowerCase())).length === 0
                              ? <Text style={estilos.txtCarregando}>Nenhuma cidade encontrada</Text>
                              : cidades.filter(c => c.nome.toLowerCase().includes(buscaCidade.toLowerCase())).map(c => (
                                <TouchableOpacity key={c.id} style={[estilos.itemLista, cidadeSelecionada === c.nome && estilos.itemListaAtivo]} onPress={() => setCidadeSelecionada(c.nome)}>
                                  <Text style={[estilos.itemListaTxt, cidadeSelecionada === c.nome && estilos.itemListaTxtAtivo]}>{c.nome}</Text>
                                </TouchableOpacity>
                              ))
                          }
                        </ScrollView>
                      </>
                    ) : null}

                    <TouchableOpacity
                      style={[estilos.btnConfirmar, (!ufSelecionada || !cidadeSelecionada) && { opacity: 0.4 }]}
                      onPress={confirmarCidadeBusca}
                      disabled={!ufSelecionada || !cidadeSelecionada}
                    >
                      <Text style={estilos.btnConfirmarTxt}>Buscar aqui</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={estilos.btnCancelarModal} onPress={() => setModalCidadeVisivel(false)}>
                      <Text style={estilos.btnCancelarModalTxt}>Cancelar</Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
            <FlatList
              data={DISTANCIAS}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              style={estilos.filtrosDistancia}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[estilos.filtroPill, distancia === item.id && estilos.filtroPillDistAtivo]}
                  onPress={() => mudarDistancia(item.id)}
                >
                  <Text style={[estilos.filtroTexto, distancia === item.id && estilos.filtroTextoDistAtivo]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
            {/* Recarga sobre uma lista já preenchida: o ActivityIndicator do
                ListEmptyComponent só aparece com a lista vazia, então sem isto trocar de
                filtro não dava sinal nenhum de que algo estava acontecendo. */}
            {carregando && lista.length > 0 && (
              <View style={estilos.carregandoInline}>
                <ActivityIndicator color={cores.primaria} size="small" />
                <Text style={estilos.carregandoInlineTexto}>Atualizando…</Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          carregando ? (
            <ActivityIndicator color={cores.primaria} size="large" style={{ marginTop: 60 }} />
          ) : (
            <View style={estilos.vazio}>
              <Text style={estilos.vazioIcone}>{vazio.icone}</Text>
              <Text style={estilos.vazioTitulo}>{vazio.titulo}</Text>
              <Text style={estilos.vazioSub}>{vazio.sub}</Text>
            </View>
          )
        }
        renderItem={({ item: p }) => (p.tipo === 'obra' ? (
          <CardObra
            item={p.item}
            coords={coords}
            etiqueta={doisTipos ? <EtiquetaTipo tipo="obra" /> : null}
            onPress={() => navigation.navigate('DetalheObra', {
              obra: {
                ...p.item,
                expira_em: p.item.expira_em ? new Date(p.item.expira_em).toISOString() : null,
                tags: Array.isArray(p.item.tags) ? p.item.tags : [],
              }
            })}
            onExpirar={() => setObras(prev => prev.filter(o => o.id !== p.item.id))}
          />
        ) : (
          <CardReparo
            item={p.item}
            coords={coords}
            etiqueta={doisTipos ? <EtiquetaTipo tipo="reparo" /> : null}
            onPress={() => navigation.navigate('DetalheReparo', { reparo: p.item })}
            onExpirar={() => setReparos(prev => prev.filter(r => r.id !== p.item.id))}
          />
        ))}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: { paddingHorizontal: espacos.tela, paddingTop: 12, paddingBottom: 12 },
  // Título laranja da arte, no mesmo tom e peso do título das telas de cadastro e de "Meus pedidos".
  titulo: { fontSize: 28, fontWeight: '900', color: '#E08A44', letterSpacing: -0.5, lineHeight: 34 },
  subtitulo: { fontSize: 13, color: cores.textoMedio, marginTop: 2 },
  // Sem recuo próprio: o segmento mora no cabeçalho da lista, que já tem o recuo da tela, e
  // assim fica alinhado com os cards.
  segmentos: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  segmento: { flex: 1, paddingVertical: 10, borderRadius: raios.medio, backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, alignItems: 'center' },
  segmentoAtivo: { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
  segmentoTexto: { fontSize: 13, color: cores.textoMedio, fontWeight: '600' },
  segmentoTextoAtivo: { color: cores.textoForte, fontWeight: '700' },
  filtros: { paddingHorizontal: espacos.tela, paddingVertical: 12 },
  filtrosDistancia: { paddingHorizontal: espacos.tela, paddingBottom: 10 },
  carregandoInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingBottom: 10 },
  carregandoInlineTexto: { fontSize: 12, color: cores.textoMedio, marginLeft: 8 },
  filtroPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  filtroPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  filtroPillDistAtivo: { backgroundColor: '#1a1a3a', borderColor: '#6060cc', borderWidth: 0.5, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  filtroTexto: { fontSize: 12, color: cores.textoMedio },
  filtroTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  filtroTextoDistAtivo: { color: '#8888dd', fontWeight: '600', fontSize: 12 },
  lista: { paddingHorizontal: espacos.tela, paddingBottom: 32 + alturas.barraServico, gap: 16 },
  erroBox: { alignItems: 'center', padding: 20 },
  erroTexto: { color: cores.perigo, fontSize: 13, textAlign: 'center' },
  vazio: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  vazioIcone: { fontSize: 48, marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },

  // "Buscar em outra cidade" — os mesmos estilos dos dois feeds.
  btnCidadeBusca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cores.fundoCard, borderRadius: raios.medio, paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 16, marginBottom: 8, borderWidth: 0.5, borderColor: cores.borda },
  txtCidadeBusca: { fontSize: 13, color: cores.textoForte, fontWeight: '600', flex: 1 },
  btnLimparCidade: { paddingLeft: 10, paddingVertical: 4 },
  txtLimparCidade: { fontSize: 16, color: cores.textoFraco },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: cores.fundo, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  modalTitulo: { fontSize: 18, fontWeight: '700', color: cores.textoForte, marginBottom: 20, textAlign: 'center' },
  modalLabel: { fontSize: 13, color: cores.textoFraco, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  listaScroll: { maxHeight: 180, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio },
  listaScrollEstadoColapsado: { maxHeight: 70, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio },
  listaScrollCidade: { maxHeight: 280, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio },
  itemLista: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: cores.bordaFraca },
  itemListaAtivo: { backgroundColor: cores.primaria + '22' },
  itemListaTxt: { fontSize: 14, color: cores.textoForte },
  itemListaTxtAtivo: { color: cores.primaria, fontWeight: '700' },
  txtCarregando: { fontSize: 13, color: cores.textoFraco, padding: 14, textAlign: 'center' },
  inputBuscaCidade: { backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: raios.medio, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: cores.textoForte, marginBottom: 8 },
  btnConfirmar: { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 16, alignItems: 'center', marginTop: 20 },
  btnConfirmarTxt: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  btnCancelarModal: { padding: 14, alignItems: 'center', marginTop: 8 },
  btnCancelarModalTxt: { fontSize: 14, color: cores.textoFraco },
})
