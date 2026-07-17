import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Image, Modal, ScrollView, TextInput,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'
import { distanciaItemKm, formatarDistancia, useCoordsUsuario } from '../../utils/distancia'
import { thumbnailDeCapa } from '../../utils/thumbnail'
import { softAskRef } from '../../components/SoftAskNotificacao'

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

const CATEGORIAS = [
  { id: 'todas',         label: 'Todas'           },
  { id: 'residencial',   label: '🏠 Residencial'  },
  { id: 'comercial',     label: '🏢 Comercial'    },
  { id: 'institucional', label: '🏛️ Institucional' },
  { id: 'galpao',        label: '🏭 Galpão'       },
  { id: 'rural',         label: '🌾 Rural'        },
  { id: 'outros',        label: '🔨 Outros'       },
]

// Emoji por categoria, usado no thumbnail quando a obra não tem mídia. Não são
// emojis novos: são os MESMOS já exibidos nos labels de CATEGORIAS aqui e em
// CadastrarObraScreen — extraídos para que o thumbnail bata com o chip de filtro
// que a pessoa acabou de tocar. Espelha CATEGORIA_EMOJIS do FeedReparos.
// O fallback 🏗️ cobre categoria desconhecida (o banco pode ter valor legado que
// não está nesta lista) sem se disfarçar de "outros", que é 🔨 legítimo.
const CATEGORIA_EMOJIS = {
  residencial: '🏠', comercial: '🏢', institucional: '🏛️',
  galpao: '🏭', rural: '🌾', outros: '🔨',
}

const formatarValor = (v) =>
  v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'A combinar'

const ContadorExpiracao = ({ expiraEm, onExpirar }) => {
  const [restante, setRestante] = useState(null)
  const expiradoRef = useRef(false)

  useEffect(() => {
    expiradoRef.current = false
    const tick = () => {
      const diff = new Date(expiraEm) - new Date()
      if (diff <= 0) {
        setRestante(null)
        if (!expiradoRef.current) {
          expiradoRef.current = true
          if (onExpirar) onExpirar()
        }
        return
      }
      const dias = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const totalMin = Math.floor(diff / 60000)
      setRestante({ dias, h, m, totalMin })
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiraEm])

  if (!restante) return null

  const { dias, h, m, totalMin } = restante
  const urgente = totalMin < 10
  const mm = String(m).padStart(2, '0')
  let texto
  if (dias >= 1) {
    texto = `Finaliza em ${dias} ${dias === 1 ? 'dia' : 'dias'}`
  } else if (h >= 1) {
    texto = `Finaliza em ${h}h ${mm}min`
  } else {
    texto = `Finaliza em ${m}min`
  }
  // A urgência precisa existir fora da cor: quem não distingue o vermelho, ou está
  // sob sol forte, não recebe sinal nenhum de um pill só colorido. Aqui isso é ainda
  // mais crítico que no reparo — a obra não tem banner de urgência, então o pill é o
  // ÚNICO lugar que pode dizer a palavra.
  if (urgente) texto = `Urgente: ${texto}`

  return (
    <View style={[estilos.prazoPill, urgente ? estilos.prazoPillUrgente : estilos.prazoPillNormal]}>
      <Text
        style={[estilos.prazoTexto, urgente ? estilos.prazoTextoUrgente : estilos.prazoTextoNormal]}
        numberOfLines={1}
      >
        {texto}
      </Text>
    </View>
  )
}

const CardObra = ({ item, onPress, onExpirar, coords }) => {
  const dist = distanciaItemKm(coords, item)
  const emoji = CATEGORIA_EMOJIS[item.categoria] || '🏗️'
  // Rede de segurança do thumbnail: a capa pode não renderizar (URL quebrada,
  // mídia já removida, transformação recusada pelo Cloudinary). Sem isto o <Image>
  // deixaria um quadrado preto; assim cai no emoji da categoria.
  const [fotoFalhou, setFotoFalhou] = useState(false)
  // Vídeo vira frame estático; foto passa direto; sem mídia devolve null.
  const capa = thumbnailDeCapa(item.foto_capa)
  const temFoto = !!capa && !fotoFalhou

  return (
  <TouchableOpacity style={estilos.card} onPress={onPress} activeOpacity={0.85}>
    <View style={estilos.acentoEsq} />

    <View style={estilos.cardCorpo}>
      {/* Categoria à esquerda, prazo à direita, em flex row: por não serem mais
          absolutos, não há como se sobreporem, qualquer que seja o tamanho do texto. */}
      <View style={estilos.topoRow}>
        <View style={estilos.categoriaPill}>
          <Text style={estilos.categoriaTexto} numberOfLines={1}>{item.categoria}</Text>
        </View>
        {item.expira_em && (
          <ContadorExpiracao expiraEm={item.expira_em} onExpirar={onExpirar} />
        )}
      </View>

      {/* Label e valor na mesma linha (Text aninhado, como local/distância
          abaixo): alinha pela baseline sozinho e poupa ~24dp por card. */}
      <Text style={estilos.valorLinha}>
        Valor oferecido: <Text style={estilos.valorTexto}>{formatarValor(item.valor || item.valor_estimado)}</Text>
      </Text>

      <View style={estilos.conteudoRow}>
        {temFoto ? (
          <Image
            source={{ uri: capa }}
            style={estilos.thumb}
            resizeMode="cover"
            onError={() => setFotoFalhou(true)}
          />
        ) : (
          <View style={[estilos.thumb, estilos.thumbVazia]}>
            <Text style={estilos.thumbIcone}>{emoji}</Text>
          </View>
        )}
        <View style={estilos.textoCol}>
          <Text style={estilos.cardTitulo} numberOfLines={1}>{item.titulo}</Text>
          <Text style={estilos.cardLocal} numberOfLines={1}>
            📍 {item.cidade}{item.bairro ? `, ${item.bairro}` : ''}
            {dist != null && <Text style={estilos.cardDistancia}>{`  ·  ${formatarDistancia(dist)}`}</Text>}
          </Text>
          <View style={estilos.cardRodape}>
            <Text style={estilos.interessados}>🎨 {item.total_candidaturas || item.total_interessados || 0} interessado(s)</Text>
            <View style={estilos.btnVer}>
              <Text style={estilos.btnVerTexto}>Ver obra →</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  </TouchableOpacity>
  )
}

// Cache de GPS em nível de módulo: evita chamar o GPS a cada toque no filtro de
// distância (a leitura pode travar o spinner por segundos em aparelhos lentos).
let gpsCache = { coords: null, timestamp: 0 }
const GPS_CACHE_TTL = 30000 // 30 seconds

export default function FeedObrasScreen({ navigation }) {
  const { usuario } = useAuth()
  const [obras, setObras] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [categoria, setCategoria] = useState('todas')
  const [distancia, setDistancia] = useState('cidade')
  const [erro, setErro] = useState(null)
  const [coords, setCoords] = useCoordsUsuario()
  // "Buscar em outra cidade": null = usa a cidade do perfil; objeto = { cidade, uf, lat, lng }
  const [cidadeBusca, setCidadeBusca] = useState(null)
  const [modalCidadeVisivel, setModalCidadeVisivel] = useState(false)
  const [ufSelecionada, setUfSelecionada] = useState('')
  const [cidadeSelecionada, setCidadeSelecionada] = useState('')
  const [estados, setEstados] = useState([])
  const [cidades, setCidades] = useState([])
  const [buscaCidade, setBuscaCidade] = useState('')
  const mountedRef = useRef(true)
  // Aborta a requisição em voo quando uma nova seleção de filtro chega (evita corrida
  // onde uma resposta antiga/lenta sobrescreve a lista de uma seleção mais recente).
  const abortRef = useRef(null)
  useEffect(() => () => {
    mountedRef.current = false
    abortRef.current?.abort()
  }, [])

  const mudarDistancia = (val) => {
    setDistancia(val)
    setCarregando(true)
    buscarObras(categoria, val)
  }

  const buscarObras = async (cat = categoria, dist = distancia, cid = cidadeBusca) => {
    // Cancela qualquer requisição anterior ainda em voo.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Spinner com timeout máximo de 20s: se estourar, aborta e mostra erro.
    // (20s acomoda GPS + cold start + a própria requisição.)
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

    try {
      setErro(null)
      const params = {}
      if (cat !== 'todas') params.categoria = cat
      params.raio_km = dist
      if (cid) {
        params.cidade_busca = cid.cidade
        params.uf_busca = cid.uf
      }
      if (dist !== 'estado' && dist !== 'pais' && dist !== 'cidade') {
        if (cid && cid.lat != null) {
          // Busca em outra cidade: usa as coords geocodificadas da cidade escolhida,
          // sem acionar o GPS do aparelho.
          params.lat = String(cid.lat)
          params.lng = String(cid.lng)
          if (mountedRef.current && abortRef.current === controller) setCoords({ lat: cid.lat, lng: cid.lng })
        } else try {
          const { status } = await Location.requestForegroundPermissionsAsync()
          if (status === 'granted') {
            const agora = Date.now()
            let coordsUsar = null
            if (gpsCache.coords && (agora - gpsCache.timestamp) < GPS_CACHE_TTL) {
              // Cache de GPS ainda válido (< 30s): usa direto, sem chamar o GPS.
              coordsUsar = gpsCache.coords
            } else {
              try {
                // GPS com timeout próprio de 5s (separado do timeout total da requisição).
                const loc = await Promise.race([
                  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('gps_timeout')), 5000))
                ])
                gpsCache = { coords: loc.coords, timestamp: Date.now() }
                coordsUsar = loc.coords
              } catch (errGps) {
                // Timeout/permissão de GPS: se houver coords em cache (mesmo expiradas),
                // usa silenciosamente; senão segue sem lat/lng (API cai p/ filtro por cidade).
                console.log('[FeedObras] GPS indisponível, usando cache se houver | msg:', errGps.message)
                if (gpsCache.coords) coordsUsar = gpsCache.coords
              }
            }
            if (coordsUsar) {
              params.lat = String(coordsUsar.latitude)
              params.lng = String(coordsUsar.longitude)
              if (mountedRef.current && abortRef.current === controller) setCoords({ lat: coordsUsar.latitude, lng: coordsUsar.longitude })
            }
          }
        } catch (err) {
          console.log('[FeedObras] falha ao obter localização | code:', err.code, '| msg:', err.message)
        }
      }
      const resposta = await api.get('/obras', { params, signal: controller.signal })
      // Só aplica se ainda for a requisição atual (descarta respostas obsoletas).
      if (!timedOut && mountedRef.current && abortRef.current === controller) {
        setObras(resposta.obras || [])
      }
    } catch (err) {
      // Cancelada (substituída por nova seleção ou pelo timeout): ignora silenciosamente.
      if (err.code === 'ERR_CANCELED') return
      console.log('[FeedObras] falha ao buscar obras | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (!timedOut && mountedRef.current && abortRef.current === controller) {
        setErro(err.mensagem || 'Erro ao buscar obras')
      }
    } finally {
      clearTimeout(timer)
      if (!timedOut && mountedRef.current && abortRef.current === controller) {
        setCarregando(false)
        setAtualizando(false)
      }
    }
  }

  useFocusEffect(useCallback(() => { buscarObras() }, [categoria, distancia, cidadeBusca]))
  // Soft-ask de notificação no primeiro momento de relevância do pintor: ver o feed.
  // mostrar() faz o próprio check ao vivo e só exibe uma vez — chamar a cada foco é ok.
  useFocusEffect(useCallback(() => { softAskRef.mostrar?.('pintor') }, []))

  const onRefresh = () => { setAtualizando(true); buscarObras() }

  const mudarCategoria = (cat) => {
    setCategoria(cat)
    setCarregando(true)
    buscarObras(cat, distancia)
  }

  // ─── "Buscar em outra cidade" ─────────────────────────────────────────
  // A cidade de busca vive apenas no estado da sessão atual: ao reabrir o app,
  // o filtro volta para a cidade do perfil (sem persistência).
  const buscarEstados = async () => {
    try {
      const r = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
      const data = await r.json()
      setEstados(data.map(e => ({ sigla: e.sigla, nome: e.nome })))
    } catch (err) { console.log('[FeedObras] falha ao buscar estados IBGE | msg:', err.message) }
  }

  const buscarCidades = async (uf) => {
    setCidades([])
    setCidadeSelecionada('')
    try {
      const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
      const data = await r.json()
      setCidades(data.map(m => ({ id: m.id, nome: m.nome })))
    } catch (err) { console.log('[FeedObras] falha ao buscar cidades IBGE | msg:', err.message) }
  }

  // Recarrega as cidades sempre que o estado selecionado muda.
  useEffect(() => {
    if (ufSelecionada) buscarCidades(ufSelecionada)
  }, [ufSelecionada])

  const geocodarCidade = async (cidade, uf) => {
    try {
      const q = encodeURIComponent(`${cidade}, ${uf}, Brasil`)
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, { headers: { 'User-Agent': 'ArrumaPro/1.0' } })
      const data = await r.json()
      if (data.length > 0) {
        const resultado = data[0]
        // Validate: display_name must contain the expected UF to avoid wrong-state results
        const estadosPorUF = { AC:'Acre', AL:'Alagoas', AP:'Amapá', AM:'Amazonas', BA:'Bahia', CE:'Ceará', DF:'Distrito Federal', ES:'Espírito Santo', GO:'Goiás', MA:'Maranhão', MT:'Mato Grosso', MS:'Mato Grosso do Sul', MG:'Minas Gerais', PA:'Pará', PB:'Paraíba', PR:'Paraná', PE:'Pernambuco', PI:'Piauí', RJ:'Rio de Janeiro', RN:'Rio Grande do Norte', RS:'Rio Grande do Sul', RO:'Rondônia', RR:'Roraima', SC:'Santa Catarina', SP:'São Paulo', SE:'Sergipe', TO:'Tocantins' }
        const nomeEstado = estadosPorUF[uf] || ''
        const displayName = resultado.display_name || ''
        if (nomeEstado && !displayName.includes(nomeEstado) && !displayName.includes(uf)) {
          console.log('[geocodarCidade] resultado fora do estado esperado | uf:', uf, '| display_name:', displayName)
          return { lat: null, lng: null }
        }
        return { lat: parseFloat(resultado.lat), lng: parseFloat(resultado.lon) }
      }
    } catch (err) { console.log('[FeedObras] falha ao geocodar cidade | msg:', err.message) }
    return { lat: null, lng: null }
  }

  const confirmarCidadeBusca = async () => {
    if (!ufSelecionada || !cidadeSelecionada) return
    const { lat, lng } = await geocodarCidade(cidadeSelecionada, ufSelecionada)
    if (lat === null) {
      Alert.alert(
        '⚠️ Localização aproximada',
        `Não encontramos as coordenadas exatas de "${cidadeSelecionada}". Os filtros por distância (km) usarão seu GPS atual. Apenas os filtros "Cidade" e "Estado" buscarão em ${cidadeSelecionada}.`
      )
    }
    const nova = { cidade: cidadeSelecionada, uf: ufSelecionada, lat, lng }
    setCidadeBusca(nova)
    setBuscaCidade('')
    setModalCidadeVisivel(false)
    // Refetch imediato com a nova cidade — mesmo padrão imperativo de mudarCategoria/
    // mudarDistancia. Passa `nova` explicitamente porque setCidadeBusca só reflete no
    // próximo render; a lista não deve depender de um efeito para reagir à troca de cidade.
    setCarregando(true)
    buscarObras(categoria, distancia, nova)
  }

  const limparCidadeBusca = () => {
    setCidadeBusca(null)
    setBuscaCidade('')
    // Volta para a cidade do perfil e refaz a busca na hora (idem confirmarCidadeBusca).
    setCarregando(true)
    buscarObras(categoria, distancia, null)
  }

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.header}>
        <View>
          <Text style={estilos.saudacao}>Olá, {usuario?.nome?.split(' ')[0]} 🎨</Text>
          <Text style={estilos.titulo}>
            Obras <Text style={{ color: cores.primaria }}>disponíveis</Text>
          </Text>
        </View>
        <TouchableOpacity style={estilos.avatar} onPress={() => navigation.navigate('Perfil')}>
          {usuario?.foto_url ? (
            <Image source={{ uri: usuario.foto_url }} style={{ width: 34, height: 34, borderRadius: 17 }} />
          ) : (
            <Text style={estilos.avatarTexto}>
              {usuario?.nome?.substring(0, 2).toUpperCase()}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {erro && (
        <View style={estilos.erroBox}>
          <Text style={estilos.erroTexto}>{erro}</Text>
          <TouchableOpacity onPress={buscarObras} style={{ marginTop: 8 }}>
            <Text style={{ color: cores.primaria, fontSize: 13 }}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={obras}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={estilos.lista}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
        ListHeaderComponent={
          <>
            <FlatList
              data={CATEGORIAS}
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
            <TouchableOpacity
              style={estilos.btnCidadeBusca}
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
                  <View style={estilos.modalContainer}>
                  <Text style={estilos.modalTitulo}>Buscar em outra cidade</Text>

                  <Text style={estilos.modalLabel}>Estado</Text>
                  <ScrollView style={ufSelecionada ? estilos.listaScrollEstadoColapsado : estilos.listaScroll} nestedScrollEnabled>
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
                        placeholderTextColor={cores.textoMutado}
                        value={buscaCidade}
                        onChangeText={setBuscaCidade}
                        autoCapitalize="words"
                      />
                      <ScrollView style={estilos.listaScrollCidade} nestedScrollEnabled>
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
                </View>
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
          </>
        }
        ListEmptyComponent={
          carregando ? (
            <ActivityIndicator color={cores.primaria} size="large" style={{ marginTop: 60 }} />
          ) : (
            <View style={estilos.vazio}>
              <Text style={estilos.vazioIcone}>🏠</Text>
              <Text style={estilos.vazioTitulo}>Nenhuma obra disponível</Text>
              <Text style={estilos.vazioSub}>Novas obras aparecem aqui quando forem publicadas.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <CardObra
            item={item}
            coords={coords}
            onPress={() => navigation.navigate('DetalheObra', {
              obra: {
                ...item,
                expira_em: item.expira_em ? new Date(item.expira_em).toISOString() : null,
                tags: Array.isArray(item.tags) ? item.tags : [],
              }
            })}
            onExpirar={() => setObras(prev => prev.filter(o => o.id !== item.id))}
          />
        )}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 12 },
  saudacao: { fontSize: 13, color: cores.textoFraco, marginBottom: 2 },
  titulo: { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  avatar: { width: 34, height: 34, backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: cores.primaria, fontSize: 12, fontWeight: '700' },
  filtros: { paddingHorizontal: espacos.tela, paddingVertical: 12 },
  filtrosDistancia: { paddingHorizontal: espacos.tela, paddingBottom: 10 },
  filtroPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  filtroPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  filtroPillDistAtivo: { backgroundColor: '#1a1a3a', borderColor: '#6060cc', borderWidth: 0.5, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  filtroTexto: { fontSize: 12, color: cores.textoMedio },
  filtroTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  filtroTextoDistAtivo: { color: '#8888dd', fontWeight: '600', fontSize: 12 },
  lista: { paddingHorizontal: espacos.tela, paddingBottom: 32, gap: 16 },
  erroBox: { alignItems: 'center', padding: 20 },
  erroTexto: { color: cores.perigo, fontSize: 13, textAlign: 'center' },
  vazio: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  vazioIcone: { fontSize: 48, marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
  // Card — fundo bem acima do fundo da tela (#0A0A0A) e borda de 1dp, para os
  // cards se separarem entre si e da tela. Antes eram #111111/0.5dp: 1.05:1.
  card: { backgroundColor: '#1C1C1C', borderRadius: 16, borderWidth: 1, borderColor: '#2E2E2E', overflow: 'hidden', elevation: 4 },
  acentoEsq: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: cores.primaria, zIndex: 2 },

  cardCorpo: { padding: 14, paddingLeft: 18 },

  // Topo: categoria (esq) + prazo (dir). Ambos em fluxo normal — nunca absolutos.
  topoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  categoriaPill: { backgroundColor: cores.primaria + '2E', borderWidth: 0.5, borderColor: cores.primaria + '55', borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 },
  categoriaTexto: { fontSize: 12, fontWeight: '600', color: cores.primaria, textTransform: 'capitalize' },

  // Prazo: âmbar quando ainda há tempo, vermelho perto de expirar. Texto claro
  // sobre o próprio tom (4.5:1+); o #E24B4A puro só chegava a 3.57:1.
  // flexShrink 0: o prazo é a informação crítica e nunca deve ser cortado — quem
  // encolhe é a categoria.
  prazoPill: { borderRadius: raios.pill, borderWidth: 0.5, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  prazoPillNormal: { backgroundColor: '#FFC1072E', borderColor: '#FFC10755' },
  prazoPillUrgente: { backgroundColor: cores.perigo + '2E', borderColor: cores.perigo + '66' },
  prazoTexto: { fontSize: 12, fontWeight: '700' },
  prazoTextoNormal: { color: '#FFC107' },
  prazoTextoUrgente: { color: '#FF6B6B' },

  // Valor — label e número na mesma linha. O número caiu de 24px p/ 17px: abaixo
  // dos 18.66px o WCAG deixa de tratá-lo como "texto grande" (3:1) e passa a exigir
  // 4.5:1; o #5DC98A sobre o #1C1C1C do card dá 8.27:1, então passa AA nos dois
  // regimes. Label #888888 = 4.81:1, também AA.
  valorLinha: { fontSize: 11, color: cores.textoMedio, marginBottom: 14 },
  valorTexto: { fontSize: 17, fontWeight: '700', color: cores.sucesso },

  // Thumbnail + coluna de texto (substitui a faixa de foto de 140dp)
  conteudoRow: { flexDirection: 'row', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  thumbVazia: { backgroundColor: '#2E2E2E', alignItems: 'center', justifyContent: 'center' },
  thumbIcone: { fontSize: 24 },
  textoCol: { flex: 1 },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: cores.textoForte },
  cardLocal: { fontSize: 12, color: cores.textoMedio, marginTop: 3 },
  cardDistancia: { color: cores.primaria, fontWeight: '600' },
  cardRodape: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  interessados: { fontSize: 11, color: cores.textoMedio },
  btnVer: { backgroundColor: cores.primaria, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6 },
  btnVerTexto: { fontSize: 11, fontWeight: '700', color: '#0A0A0A' },

  // "Buscar em outra cidade"
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
  itemListaTxt: { fontSize: 14, color: cores.textoMedio },
  itemListaTxtAtivo: { color: cores.primaria, fontWeight: '700' },
  txtCarregando: { fontSize: 13, color: cores.textoFraco, padding: 14, textAlign: 'center' },
  inputBuscaCidade: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: cores.textoForte, marginBottom: 8 },
  btnConfirmar: { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 16, alignItems: 'center', marginTop: 20 },
  btnConfirmarTxt: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  btnCancelarModal: { padding: 14, alignItems: 'center', marginTop: 8 },
  btnCancelarModalTxt: { fontSize: 14, color: cores.textoFraco },
})
