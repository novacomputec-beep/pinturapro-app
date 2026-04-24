import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, ScrollView
} from 'react-native'
import { obrasService } from '../../services/api'
import { useLocalizacao } from '../../hooks/useLocalizacao'
import { useAuth } from '../../contexts/AuthContext'
import { BadgeStatus, Tag } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

const CATEGORIAS = [
  { id: 'todas',       label: 'Todas'       },
  { id: 'residencial', label: 'Residencial' },
  { id: 'comercial',   label: 'Comercial'   },
  { id: 'galpoes',     label: 'Galpões'     },
  { id: 'outras',      label: 'Outras'      },
]

const RAIOS = [
  { km: 0,    label: 'Minha cidade' },
  { km: 25,   label: '25 km'        },
  { km: 50,   label: '50 km'        },
  { km: 100,  label: '100 km'       },
  { km: 9999, label: 'Todo MG'      },
]

// Formata countdown
const formatarCountdown = (expiraEm) => {
  const diff = new Date(expiraEm) - new Date()
  if (diff <= 0) return null
  const horas = Math.floor(diff / 3600000)
  const minutos = Math.floor((diff % 3600000) / 60000)
  if (horas < 24) return `${horas}h ${minutos}m`
  return `${Math.floor(horas / 24)} dias`
}

// Card individual de obra
const CardObra = ({ obra, onPress }) => {
  const countdown = formatarCountdown(obra.expira_em)
  const urgente = countdown && !countdown.includes('dia')

  return (
    <TouchableOpacity
      style={[estilos.card, urgente && estilos.cardUrgente]}
      onPress={() => onPress(obra)}
      activeOpacity={0.85}
    >
      {/* Imagem placeholder */}
      <View style={estilos.cardImagem}>
        <Text style={estilos.cardImagemIcone}>🏠</Text>
        {countdown && (
          <View style={[estilos.countdownPill, urgente && estilos.countdownUrgente]}>
            {urgente && <View style={estilos.countdownDot} />}
            <Text style={[estilos.countdownTexto, urgente && { color: cores.primaria }]}>
              {urgente ? `Expira ${countdown}` : `Expira em ${countdown}`}
            </Text>
          </View>
        )}
        {obra.distancia_metros != null && (
          <View style={estilos.distanciaPill}>
            <Text style={estilos.distanciaTexto}>
              {obra.distancia_metros < 1000
                ? `${Math.round(obra.distancia_metros)}m`
                : obra.distancia_metros < 5000
                  ? <Text style={{ color: cores.sucesso }}>Na sua cidade</Text>
                  : `~${Math.round(obra.distancia_metros / 1000)}km`
              }
            </Text>
          </View>
        )}
      </View>

      {/* Corpo */}
      <View style={estilos.cardCorpo}>
        <View style={estilos.cardTopo}>
          <Text style={estilos.cardTitulo} numberOfLines={2}>{obra.titulo}</Text>
          <Text style={estilos.cardValor}>
            R$ {Number(obra.valor).toLocaleString('pt-BR')}
          </Text>
        </View>

        <View style={estilos.cardLocal}>
          <Text style={estilos.cardLocalTexto}>
            {obra.cidade}, MG{obra.metragem ? ` · ${obra.metragem}m²` : ''}
          </Text>
        </View>

        {obra.tags?.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={estilos.tags}>
              {obra.tags.slice(0, 4).map((tag, i) => (
                <Tag key={i} texto={tag} />
              ))}
            </View>
          </ScrollView>
        )}

        <View style={estilos.cardRodape}>
          <Text style={estilos.cardMidias}>
            {obra.total_midias || 0} fotos/vídeos
          </Text>
          <TouchableOpacity
            style={estilos.btnVerObra}
            onPress={() => onPress(obra)}
          >
            <Text style={estilos.btnVerObraTexto}>Ver obra →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function FeedScreen({ navigation }) {
  const { usuario } = useAuth()
  const { coordenadas } = useLocalizacao()

  const [obras, setObras] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [categoria, setCategoria] = useState('todas')
  const [raioKm, setRaioKm] = useState(50)

  const buscarObras = useCallback(async () => {
    try {
      const params = { categoria, raio_km: raioKm }
      if (coordenadas) {
        params.latitude  = coordenadas.latitude
        params.longitude = coordenadas.longitude
      }
      const resposta = await obrasService.listar(params)
      setObras(resposta.obras || [])
    } catch (err) {
      console.log('Erro ao buscar obras:', err)
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }, [categoria, raioKm, coordenadas])

  useEffect(() => { buscarObras() }, [buscarObras])

  const onRefresh = () => {
    setAtualizando(true)
    buscarObras()
  }

  return (
    <SafeAreaView style={estilos.container}>

      {/* Cabeçalho */}
      <View style={estilos.header}>
        <View>
          <Text style={estilos.saudacao}>Bom dia, {usuario?.nome?.split(' ')[0]} 👷</Text>
          <Text style={estilos.titulo}>
            Obras <Text style={{ color: cores.primaria }}>disponíveis</Text>
          </Text>
        </View>
        <TouchableOpacity
          style={estilos.avatar}
          onPress={() => navigation.navigate('Perfil')}
        >
          <Text style={estilos.avatarTexto}>
            {usuario?.nome?.substring(0, 2).toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filtro de raio */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.raioScroll}>
        <View style={estilos.raioRow}>
          {RAIOS.map((r) => (
            <TouchableOpacity
              key={r.km}
              style={[estilos.raioPill, raioKm === r.km && estilos.raioPillAtivo]}
              onPress={() => setRaioKm(r.km)}
            >
              <Text style={[estilos.raioPillTexto, raioKm === r.km && estilos.raioPillTextoAtivo]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Filtro de categoria */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.catScroll}>
        <View style={estilos.catRow}>
          {CATEGORIAS.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[estilos.catPill, categoria === c.id && estilos.catPillAtivo]}
              onPress={() => setCategoria(c.id)}
            >
              <Text style={[estilos.catPillTexto, categoria === c.id && estilos.catPillTextoAtivo]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Contador */}
      <View style={estilos.contadorRow}>
        <Text style={estilos.contadorTexto}>{obras.length} obras em aberto</Text>
      </View>

      {/* Lista de obras */}
      {carregando ? (
        <View style={estilos.carregando}>
          <ActivityIndicator color={cores.primaria} size="large" />
        </View>
      ) : obras.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>📍</Text>
          <Text style={estilos.vazioTitulo}>Nenhuma obra nesta região</Text>
          <Text style={estilos.vazioSub}>
            Tente ampliar o raio de busca para ver obras em cidades próximas.
          </Text>
          <TouchableOpacity
            style={estilos.btnExpandir}
            onPress={() => {
              const atual = RAIOS.findIndex(r => r.km === raioKm)
              if (atual < RAIOS.length - 1) setRaioKm(RAIOS[atual + 1].km)
            }}
          >
            <Text style={estilos.btnExpandirTexto}>Expandir raio →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={obras}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CardObra
              obra={item}
              onPress={(obra) => navigation.navigate('DetalheObra', { obra })}
            />
          )}
          contentContainerStyle={estilos.lista}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={atualizando}
              onRefresh={onRefresh}
              tintColor={cores.primaria}
            />
          }
        />
      )}

    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: cores.fundo,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: espacos.tela,
    paddingTop: 8,
    paddingBottom: 14,
  },
  saudacao: {
    fontSize: 13,
    color: cores.textoFraco,
    marginBottom: 2,
  },
  titulo: {
    fontSize: 26,
    fontWeight: '700',
    color: cores.textoForte,
    letterSpacing: -0.5,
  },
  avatar: {
    width: 34, height: 34,
    backgroundColor: cores.primariaSuave,
    borderWidth: 0.5,
    borderColor: cores.primariaBorda,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: {
    color: cores.primaria,
    fontSize: 12,
    fontWeight: '700',
  },
  raioScroll: { paddingLeft: espacos.tela, marginBottom: 6 },
  raioRow: { flexDirection: 'row', gap: 8, paddingRight: 20 },
  raioPill: {
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: raios.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  raioPillAtivo: { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
  raioPillTexto: { fontSize: 12, color: cores.textoFraco },
  raioPillTextoAtivo: { color: cores.primaria, fontWeight: '600' },

  catScroll: { paddingLeft: espacos.tela, marginBottom: 12 },
  catRow: { flexDirection: 'row', gap: 8, paddingRight: 20 },
  catPill: {
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: raios.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  catPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  catPillTexto: { fontSize: 12, color: cores.textoMedio },
  catPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },

  contadorRow: {
    paddingHorizontal: espacos.tela,
    marginBottom: 10,
  },
  contadorTexto: { fontSize: 12, color: cores.textoFraco },

  lista: {
    paddingHorizontal: espacos.tela,
    paddingBottom: 32,
  },
  carregando: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vazio: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  vazioIcone: { fontSize: 36, marginBottom: 16 },
  vazioTitulo: {
    fontSize: 16,
    fontWeight: '600',
    color: cores.textoFraco,
    marginBottom: 8,
    textAlign: 'center',
  },
  vazioSub: {
    fontSize: 13,
    color: cores.textoMutado,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  btnExpandir: {
    borderWidth: 0.5,
    borderColor: cores.primariaBorda,
    borderRadius: raios.medio,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  btnExpandirTexto: { fontSize: 13, color: cores.primaria },

  card: {
    backgroundColor: cores.fundoCard,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: cores.borda,
    overflow: 'hidden',
  },
  cardUrgente: { borderColor: cores.primaria + '44' },
  cardImagem: {
    height: 130,
    backgroundColor: cores.fundoElevado,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cardImagemIcone: { fontSize: 40, opacity: 0.15 },
  countdownPill: {
    position: 'absolute',
    top: 10, right: 10,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  countdownUrgente: { borderColor: cores.primaria },
  countdownDot: {
    width: 5, height: 5,
    borderRadius: 3,
    backgroundColor: cores.primaria,
  },
  countdownTexto: { fontSize: 10, fontWeight: '500', color: cores.textoFraco },
  distanciaPill: {
    position: 'absolute',
    top: 10, left: 10,
    backgroundColor: 'rgba(10,10,10,0.88)',
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  distanciaTexto: { fontSize: 10, color: cores.textoFraco },
  cardCorpo: { padding: 14 },
  cardTopo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 8,
  },
  cardTitulo: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: cores.textoForte,
    lineHeight: 20,
  },
  cardValor: {
    fontSize: 15,
    fontWeight: '700',
    color: cores.sucesso,
  },
  cardLocal: { marginBottom: 10 },
  cardLocalTexto: { fontSize: 12, color: cores.textoFraco },
  tags: { flexDirection: 'row', gap: 5 },
  cardRodape: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardMidias: { fontSize: 12, color: cores.textoMutado },
  btnVerObra: {
    backgroundColor: cores.primaria,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  btnVerObraTexto: { fontSize: 11, fontWeight: '600', color: '#0A0A0A' },
})
