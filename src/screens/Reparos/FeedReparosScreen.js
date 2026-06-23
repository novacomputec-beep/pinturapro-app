import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Image
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'
import { distanciaItemKm, formatarDistancia, useCoordsUsuario } from '../../utils/distancia'

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

const STORAGE_KEY_DIST_REPAROS = 'filtro_distancia_reparos'

const CATEGORIAS = [
  { id: 'todas',        label: 'Todas'          },
  { id: 'hidraulica',   label: '🚿 Hidráulica'  },
  { id: 'eletrica',     label: '⚡ Elétrica'    },
  { id: 'marcenaria',   label: '🪚 Marcenaria'  },
  { id: 'alvenaria',    label: '🧱 Alvenaria'   },
  { id: 'climatizacao', label: '❄️ Climatização' },
  { id: 'chaveiro',     label: '🔑 Chaveiro'    },
  { id: 'faxina',       label: '🧹 Faxina'      },
  { id: 'outros',       label: '🔨 Outros'      },
]

const CATEGORIA_EMOJIS = {
  hidraulica: '🚿', eletrica: '⚡', marcenaria: '🪚', alvenaria: '🧱',
  climatizacao: '❄️', chaveiro: '🔑', faxina: '🧹', outros: '🔨',
}

const getUrgenciaInfo = (horas) => {
  if (!horas) return null
  if (horas <= 1)  return { label: '🔴 URGENTE',       cor: '#f44336', bg: '#3a1a1a' }
  if (horas <= 4)  return { label: '🟠 Muito urgente', cor: '#FF6B35', bg: '#3a2a1a' }
  if (horas <= 24) return { label: '🟡 Urgente',       cor: '#FFC107', bg: '#3a3a1a' }
  if (horas <= 72) return { label: '🟢 Normal',        cor: '#4caf50', bg: '#1a3a1a' }
  return               { label: '⚪ Sem urgência',    cor: '#9e9e9e', bg: '#2a2a2a' }
}

const formatarValor = (v) =>
  v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'A combinar'

// Defined outside FeedReparosScreen so the component reference is stable across renders
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
  const muitoUrgente = totalMin < 10
  const mm = String(m).padStart(2, '0')
  let texto
  if (muitoUrgente) {
    texto = `🔴 Faltam ${m}min — URGENTE!`
  } else if (dias >= 1) {
    texto = `⏰ Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}, ${h}h${mm}min — Ainda tem tempo, aproveite!`
  } else {
    texto = `⏰ Faltam ${h}h${mm}min — aproveite!`
  }

  return (
    <View style={[estilos.countdownBadge, muitoUrgente && estilos.countdownBadgeUrgente]}>
      {muitoUrgente && <View style={estilos.countdownDot} />}
      <Text style={[estilos.countdownTexto, muitoUrgente && { color: '#FF5555', fontWeight: '700' }]}>
        {texto}
      </Text>
    </View>
  )
}

// Defined outside to prevent re-creation on every parent render (which resets timer state)
const CardReparo = ({ item, onPress, onExpirar, coords }) => {
  const urgencia = getUrgenciaInfo(item.prazo_atendimento_horas)
  const emoji = CATEGORIA_EMOJIS[item.categoria] || '🔨'
  const dist = distanciaItemKm(coords, item)

  return (
    <TouchableOpacity style={estilos.card} onPress={onPress} activeOpacity={0.85}>
      {/* Orange left accent strip */}
      <View style={estilos.acentoEsq} />

      {/* Countdown badge — top right */}
      {item.expira_em && (
        <ContadorExpiracao expiraEm={item.expira_em} onExpirar={onExpirar} />
      )}

      {/* Urgency banner */}
      {urgencia && (
        <View style={[estilos.urgenciaBanner, { backgroundColor: urgencia.bg, borderBottomColor: urgencia.cor + '44' }]}>
          <Text style={[estilos.urgenciaTexto, { color: urgencia.cor }]}>{urgencia.label}</Text>
          <Text style={[estilos.urgenciaHoras, { color: urgencia.cor }]}>Atender em até {item.prazo_atendimento_horas}h</Text>
        </View>
      )}

      {/* Value + Category */}
      <View style={estilos.valorDestaque}>
        <View style={estilos.valorDestaqueEsquerda}>
          <Text style={estilos.valorDestaqueLabel}>💰 VALOR OFERECIDO</Text>
          <Text style={estilos.valorDestaqueValor}>{formatarValor(item.valor_estimado)}</Text>
        </View>
        <View style={estilos.categoriaPill}>
          <Text style={estilos.categoriaTexto}>{emoji} {item.categoria}</Text>
        </View>
      </View>

      {/* Photo */}
      {item.foto_capa && (
        <Image source={{ uri: item.foto_capa }} style={estilos.fotoImagem} resizeMode="cover" />
      )}

      {/* Body */}
      <View style={estilos.cardCorpo}>
        <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
        <Text style={estilos.cardLocal}>
          📍 {item.cidade}{item.bairro ? `, ${item.bairro}` : ''}
          {dist != null && <Text style={estilos.cardDistancia}>{`  ·  ${formatarDistancia(dist)}`}</Text>}
        </Text>
        {item.descricao && (
          <Text style={estilos.cardDesc} numberOfLines={2}>{item.descricao}</Text>
        )}
        <View style={estilos.cardRodape}>
          <Text style={estilos.interessados}>🔧 {item.total_interessados || 0} interessado(s)</Text>
          <View style={estilos.btnVer}>
            <Text style={estilos.btnVerTexto}>Ver serviço →</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function FeedReparosScreen({ navigation }) {
  const { usuario } = useAuth()
  const [reparos, setReparos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [categoria, setCategoria] = useState('todas')
  const [distancia, setDistancia] = useState('cidade')
  const [erro, setErro] = useState(null)
  const [coords, setCoords] = useCoordsUsuario()
  const mountedRef = useRef(true)
  // Aborta a requisição em voo quando uma nova seleção de filtro chega (evita corrida
  // onde uma resposta antiga/lenta sobrescreve a lista de uma seleção mais recente).
  const abortRef = useRef(null)
  useEffect(() => () => {
    mountedRef.current = false
    abortRef.current?.abort()
  }, [])

  // Refs com os filtros atuais para o refetch ao reganhar foco, sem recriar o callback.
  const categoriaRef = useRef(categoria); categoriaRef.current = categoria
  const distanciaRef = useRef(distancia); distanciaRef.current = distancia

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_DIST_REPAROS).then(val => {
      if (val) setDistancia(val)
    })
  }, [])

  // Atualização otimista: a seleção (highlight) muda na hora; a busca é disparada pelo
  // useEffect abaixo, independente da chamada de API.
  const mudarDistancia = (val) => {
    setDistancia(val)
    AsyncStorage.setItem(STORAGE_KEY_DIST_REPAROS, val).catch(() => {})
  }

  const mudarCategoria = (cat) => {
    setCategoria(cat)
  }

  const buscarReparos = async (cat = categoria, dist = distancia, { refresh = false } = {}) => {
    // Cancela qualquer requisição anterior ainda em voo.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Spinner com timeout máximo de 10s: se estourar, aborta e mostra erro.
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      if (mountedRef.current && abortRef.current === controller) {
        setErro('Tempo limite excedido. Verifique sua conexão e tente novamente.')
        setCarregando(false)
        setAtualizando(false)
      }
    }, 10000)

    if (!refresh && mountedRef.current) setCarregando(true)

    try {
      setErro(null)
      const params = new URLSearchParams()
      if (cat !== 'todas') params.set('categoria', cat)
      params.set('raio_km', dist)
      if (dist !== 'estado' && dist !== 'pais' && dist !== 'cidade') {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync()
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            params.set('lat', String(loc.coords.latitude))
            params.set('lng', String(loc.coords.longitude))
            if (mountedRef.current && abortRef.current === controller) {
              setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude })
            }
          }
        } catch (err) {
          console.log('[FeedReparos] falha ao obter localização | code:', err.code, '| msg:', err.message)
        }
      }
      const resposta = await api.get(`/reparos?${params.toString()}`, { signal: controller.signal })
      // Só aplica se ainda for a requisição atual (descarta respostas obsoletas).
      if (!timedOut && mountedRef.current && abortRef.current === controller) {
        setReparos(resposta.reparos || [])
      }
    } catch (err) {
      // Cancelada (substituída por nova seleção ou pelo timeout): ignora silenciosamente.
      if (err.code === 'ERR_CANCELED') return
      console.log('[FeedReparos] falha ao buscar reparos | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      if (!timedOut && mountedRef.current && abortRef.current === controller) {
        setErro(err.mensagem || 'Erro ao buscar reparos')
      }
    } finally {
      clearTimeout(timer)
      if (!timedOut && mountedRef.current && abortRef.current === controller) {
        setCarregando(false)
        setAtualizando(false)
      }
    }
  }

  // Fonte única de busca: dispara na montagem e a cada troca de filtro (uma requisição por troca).
  useEffect(() => { buscarReparos(categoria, distancia) }, [categoria, distancia])

  // Refetch ao reganhar foco — pula o primeiro foco, já coberto pelo useEffect acima.
  const primeiroFocoRef = useRef(true)
  useFocusEffect(useCallback(() => {
    if (primeiroFocoRef.current) { primeiroFocoRef.current = false; return }
    buscarReparos(categoriaRef.current, distanciaRef.current)
  }, []))

  const onRefresh = () => { setAtualizando(true); buscarReparos(categoria, distancia, { refresh: true }) }

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.header}>
        <View>
          <Text style={estilos.saudacao}>Olá, {usuario?.nome?.split(' ')[0]} 🔧</Text>
          <Text style={estilos.titulo}>
            Reparos <Text style={{ color: cores.primaria }}>disponíveis</Text>
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
          <TouchableOpacity onPress={() => buscarReparos(categoria, distancia)} style={{ marginTop: 8 }}>
            <Text style={{ color: cores.primaria, fontSize: 13 }}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={reparos}
        keyExtractor={(item) => item.id}
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
              <Text style={estilos.vazioIcone}>🔧</Text>
              <Text style={estilos.vazioTitulo}>Nenhum reparo disponível</Text>
              <Text style={estilos.vazioSub}>Novos reparos aparecem aqui quando forem publicados.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <CardReparo
            item={item}
            coords={coords}
            onPress={() => navigation.navigate('DetalheReparo', { reparo: item })}
            onExpirar={() => setReparos(prev => prev.filter(r => r.id !== item.id))}
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

  // Card
  card: {
    backgroundColor: cores.fundoCard,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: cores.borda,
    overflow: 'hidden',
    elevation: 4,
  },
  acentoEsq: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 4, backgroundColor: cores.primaria, zIndex: 2,
  },

  // Countdown badge
  countdownBadge: {
    position: 'absolute', top: 10, right: 10, zIndex: 10,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4,
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '88%',
  },
  countdownBadgeUrgente: { backgroundColor: 'rgba(139,0,0,0.92)', borderColor: '#FF4444' },
  countdownDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#FF4444' },
  countdownTexto: { fontSize: 10, fontWeight: '600', color: cores.textoFraco, flexShrink: 1 },

  // Urgency banner
  urgenciaBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 0.5 },
  urgenciaTexto: { fontSize: 13, fontWeight: '700' },
  urgenciaHoras: { fontSize: 11, fontWeight: '500' },

  // Value row
  valorDestaque: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.sucessoSuave, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: cores.sucesso + '33' },
  valorDestaqueEsquerda: { flex: 1 },
  valorDestaqueLabel: { fontSize: 10, color: cores.sucesso, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  valorDestaqueValor: { fontSize: 22, fontWeight: '700', color: cores.sucesso },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 5 },
  categoriaTexto: { fontSize: 12, color: cores.textoFraco, textTransform: 'capitalize' },

  // Photo
  fotoImagem: { width: '100%', height: 140 },

  // Body
  cardCorpo: { padding: 16 },
  cardTitulo: { fontSize: 15, fontWeight: '600', color: cores.textoForte, lineHeight: 22, marginBottom: 6 },
  cardLocal: { fontSize: 12, color: cores.textoFraco, marginBottom: 6 },
  cardDistancia: { color: cores.primaria, fontWeight: '600' },
  cardDesc: { fontSize: 12, color: cores.textoMedio, lineHeight: 18, marginBottom: 10 },
  cardRodape: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  interessados: { fontSize: 11, color: cores.textoMutado },
  btnVer: { backgroundColor: cores.primaria, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 7 },
  btnVerTexto: { fontSize: 11, fontWeight: '600', color: '#0A0A0A' },
})
