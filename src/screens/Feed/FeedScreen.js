import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Image, ScrollView
} from 'react-native'
import { obrasService } from '../../services/api'
import { comRetry } from '../../utils/rede'
import { useAuth } from '../../contexts/AuthContext'
import { useLocalizacao } from '../../hooks/useLocalizacao'
import { cores, espacos, raios } from '../../utils/tema'
import { distanciaKm, distanciaItemKm, formatarDistancia } from '../../utils/distancia'
import { useFocusEffect } from '@react-navigation/native'

const CATEGORIAS = [
  { id: 'todas',       label: 'Todas'       },
  { id: 'residencial', label: 'Residencial' },
  { id: 'comercial',   label: 'Comercial'   },
  { id: 'galpoes',     label: 'Galpões'     },
  { id: 'outras',      label: 'Outras'      },
]

const OPCOES_RAIO = [
  { id: 0,   label: '📍 Todos' },
  { id: 25,  label: '25 km'   },
  { id: 50,  label: '50 km'   },
  { id: 100, label: '100 km'  },
  { id: 200, label: '200 km'  },
]

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

const CardObra = ({ obra, onPress, onExpirar }) => {
  return (
    <TouchableOpacity
      style={estilos.card}
      onPress={() => onPress(obra)}
      activeOpacity={0.85}
    >
      {/* Orange left accent strip */}
      <View style={estilos.acentoEsq} />

      {/* Live countdown badge — top right */}
      {obra.expira_em && <ContadorExpiracao expiraEm={obra.expira_em} onExpirar={onExpirar} />}

      {/* Valor em destaque no topo */}
      <View style={estilos.valorDestaque}>
        <View style={estilos.valorDestaqueEsquerda}>
          <Text style={estilos.valorDestaqueLabel}>💰 VALOR OFERECIDO</Text>
          <Text style={estilos.valorDestaqueValor}>
            {obra.valor != null ? `R$ ${Number(obra.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'A combinar'}
          </Text>
        </View>
        <View style={estilos.valorDestaqueDireita}>
          <Text style={estilos.valorCategoria}>{obra.categoria}</Text>
          {obra.prazo_execucao_dias && (
            <Text style={estilos.valorPrazo}>⏱ {obra.prazo_execucao_dias} dias</Text>
          )}
        </View>
      </View>

      {/* Imagem */}
      <View style={estilos.cardImagem}>
        {obra.foto_capa ? (
          <Image source={{ uri: obra.foto_capa }} style={estilos.fotoImagem} resizeMode="cover" />
        ) : (
          <Text style={estilos.cardImagemIcone}>🏠</Text>
        )}
        {obra.total_midias > 0 && (
          <View style={estilos.midiasBadge}>
            <Text style={estilos.midiasTexto}>📷 {obra.total_midias}</Text>
          </View>
        )}
        {obra.distancia_exibida_km != null && (
          <View style={estilos.distanciaBadge}>
            <Text style={estilos.distanciaTexto}>📍 {formatarDistancia(obra.distancia_exibida_km)}</Text>
          </View>
        )}
      </View>

      {/* Corpo */}
      <View style={estilos.cardCorpo}>
        <Text style={estilos.cardTitulo} numberOfLines={2}>{obra.titulo}</Text>
        <Text style={estilos.cardLocalTexto}>
          📍 {obra.cidade}, MG{obra.metragem ? ` · ${obra.metragem}m²` : ''}
        </Text>
        <View style={estilos.cardRodape}>
          <Text style={estilos.cardCandidaturas}>
            👷 {obra.total_candidaturas || 0} interessados
          </Text>
          <View style={estilos.btnVerObra}>
            <Text style={estilos.btnVerObraTexto}>Ver obra →</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function FeedScreen({ navigation }) {
  const { usuario } = useAuth()
  const { coordenadas, permissao, carregando: carregandoGPS, reobter } = useLocalizacao()
  const [obras, setObras] = useState([])
  const [obrasFiltradas, setObrasFiltradas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [categoria, setCategoria] = useState('todas')
  const [raioFiltro, setRaioFiltro] = useState(0)
  const [erro, setErro] = useState(null)
  const raioRef = useRef(0)
  const coordsRef = useRef(null)

  const buscarObras = useCallback(async (cat = categoria) => {
    try {
      setErro(null)
      const params = { categoria: cat }
      if (coordsRef.current && raioRef.current > 0) {
        params.latitude = coordsRef.current.latitude
        params.longitude = coordsRef.current.longitude
        params.raio = raioRef.current
      }
      const resposta = await comRetry(() => obrasService.listar(params))
      setObras(resposta.obras || [])
    } catch (err) {
      console.log('[FeedScreen] falha ao buscar obras | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      setErro(err.mensagem || 'Erro ao buscar obras')
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }, [categoria])

  useFocusEffect(useCallback(() => { buscarObras() }, [categoria]))

  useEffect(() => {
    coordsRef.current = coordenadas
    if (coordenadas && raioRef.current > 0) buscarObras()
  }, [coordenadas])

  useEffect(() => {
    if (raioFiltro === 0 || !coordenadas) {
      setObrasFiltradas(obras)
      return
    }
    const coords = { lat: coordenadas.latitude, lng: coordenadas.longitude }
    const filtradas = obras
      .map(o => {
        if (!o.latitude || !o.longitude) return { ...o, distancia_km: null, distancia_exibida_km: null }
        // distancia_km continua sendo a distância crua: é ela que filtra pelo raio e ordena
        // a lista, e para isso o centro do município serve. Já distancia_exibida_km passa
        // pelo distanciaItemKm, que devolve null quando coordenadas_origem === 'centro_cidade'
        // — assim o badge não anuncia uma precisão que a coordenada não tem.
        const dist = distanciaKm(coords.lat, coords.lng, o.latitude, o.longitude)
        return { ...o, distancia_km: dist, distancia_exibida_km: distanciaItemKm(coords, o) }
      })
      .filter(o => o.distancia_km == null || o.distancia_km <= raioFiltro)
      .sort((a, b) => {
        const distDiff = (a.distancia_km ?? 9999) - (b.distancia_km ?? 9999)
        if (distDiff !== 0) return distDiff
        return new Date(a.expira_em) - new Date(b.expira_em)
      })
    setObrasFiltradas(filtradas)
  }, [obras, raioFiltro, coordenadas])

  const mudarRaio = (novoRaio) => {
    raioRef.current = novoRaio
    setRaioFiltro(novoRaio)
    if (novoRaio > 0 && coordenadas) buscarObras()
    else if (novoRaio === 0) buscarObras()
  }

  const onRefresh = () => { setAtualizando(true); buscarObras() }

  const dadosExibidos = raioFiltro > 0 ? obrasFiltradas : obras

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.header}>
        <View>
          <Text style={estilos.saudacao}>Olá, {usuario?.nome?.split(' ')[0]} 👷</Text>
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.filtrosScroll} contentContainerStyle={estilos.filtrosRow}>
        {CATEGORIAS.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[estilos.filtroPill, categoria === c.id && estilos.filtroPillAtivo]}
            onPress={() => setCategoria(c.id)}
          >
            <Text style={[estilos.filtroPillTexto, categoria === c.id && estilos.filtroPillTextoAtivo]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.filtrosScrollRaio} contentContainerStyle={estilos.filtrosRow}>
        {OPCOES_RAIO.map((r) => {
          const desabilitado = r.id > 0 && permissao !== 'granted'
          return (
            <TouchableOpacity
              key={r.id}
              style={[
                estilos.filtroPill,
                raioFiltro === r.id && estilos.filtroPillAtivo,
                desabilitado && { opacity: 0.4 }
              ]}
              onPress={() => !desabilitado && mudarRaio(r.id)}
              disabled={desabilitado}
            >
              {r.id > 0 && carregandoGPS ? (
                <ActivityIndicator size="small" color={cores.textoMedio} />
              ) : (
                <Text style={[estilos.filtroPillTexto, raioFiltro === r.id && estilos.filtroPillTextoAtivo]}>
                  {r.label}
                </Text>
              )}
            </TouchableOpacity>
          )
        })}
        {permissao === 'denied' && (
          <TouchableOpacity onPress={reobter} style={estilos.gpsAviso}>
            <Text style={estilos.gpsAvisoTexto}>Localização bloqueada · Toque para tentar novamente</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Text style={estilos.contadorTexto}>
        {dadosExibidos.length} obras em aberto
        {raioFiltro > 0 && coordenadas ? ` · até ${raioFiltro}km` : ''}
      </Text>

      {erro && (
        <View style={estilos.erroBox}>
          <Text style={estilos.erroTexto}>{erro}</Text>
          <TouchableOpacity onPress={buscarObras}>
            <Text style={{ color: cores.primaria, marginTop: 8 }}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      {carregando ? (
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      ) : dadosExibidos.length === 0 && !erro ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>📋</Text>
          <Text style={estilos.vazioTitulo}>Nenhuma obra disponível</Text>
          <Text style={estilos.vazioSub}>
            {raioFiltro > 0 ? `Nenhuma obra em até ${raioFiltro}km. Aumente o raio.` : 'Novas obras aparecem aqui em breve.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={dadosExibidos}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <CardObra
              obra={item}
              onPress={(obra) => navigation.navigate('DetalheObra', {
                obra: {
                  ...obra,
                  expira_em: obra.expira_em ? new Date(obra.expira_em).toISOString() : null,
                  tags: Array.isArray(obra.tags) ? obra.tags : [],
                }
              })}
              onExpirar={() => {
                setObras(prev => prev.filter(o => o.id !== item.id))
                setObrasFiltradas(prev => prev.filter(o => o.id !== item.id))
              }}
            />
          )}
          contentContainerStyle={estilos.lista}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
        />
      )}
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 14 },
  saudacao: { fontSize: 13, color: cores.textoFraco, marginBottom: 2 },
  titulo: { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  avatar: { width: 34, height: 34, backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { color: cores.primaria, fontSize: 12, fontWeight: '700' },
  filtrosScroll: { maxHeight: 46, marginBottom: 2 },
  filtrosScrollRaio: { maxHeight: 46, marginBottom: 8 },
  filtrosRow: { paddingHorizontal: espacos.tela, gap: 8, paddingBottom: 4, alignItems: 'center' },
  filtroPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 7 },
  filtroPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  filtroPillTexto: { fontSize: 12, color: cores.textoMedio },
  filtroPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  gpsAviso: { backgroundColor: '#3a1a1a', borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 6 },
  gpsAvisoTexto: { fontSize: 11, color: '#f44336' },
  contadorTexto: { fontSize: 12, color: cores.textoFraco, paddingHorizontal: espacos.tela, marginBottom: 10 },
  lista: { paddingHorizontal: espacos.tela, paddingBottom: 32 },
  erroBox: { alignItems: 'center', padding: 20 },
  erroTexto: { color: cores.perigo, fontSize: 13, textAlign: 'center' },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone: { fontSize: 36, marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: cores.fundoCard, borderRadius: 20, borderWidth: 0.5, borderColor: cores.borda, overflow: 'hidden', elevation: 4 },
  acentoEsq: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: cores.primaria, zIndex: 2 },
  countdownBadge: { position: 'absolute', top: 10, right: 10, zIndex: 10, backgroundColor: 'rgba(10,10,10,0.88)', borderWidth: 0.5, borderColor: cores.borda, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '88%' },
  countdownBadgeUrgente: { backgroundColor: 'rgba(139,0,0,0.92)', borderColor: '#FF4444' },
  countdownDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#FF4444' },
  countdownTexto: { fontSize: 10, fontWeight: '600', color: cores.textoFraco, flexShrink: 1 },
  // Valor destaque no topo
  valorDestaque: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: cores.sucessoSuave, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: cores.sucesso + '33' },
  valorDestaqueEsquerda: { flex: 1 },
  valorDestaqueLabel: { fontSize: 10, color: cores.sucesso, fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  valorDestaqueValor: { fontSize: 20, fontWeight: '700', color: cores.sucesso },
  valorDestaqueDireita: { alignItems: 'flex-end', gap: 4 },
  valorCategoria: { fontSize: 11, color: cores.textoFraco, textTransform: 'capitalize', backgroundColor: cores.fundoElevado, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  valorPrazo: { fontSize: 11, color: cores.textoFraco },
  // Imagem
  cardImagem: { height: 150, backgroundColor: cores.fundoElevado, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  fotoImagem: { width: '100%', height: '100%' },
  cardImagemIcone: { fontSize: 40, opacity: 0.15 },
  midiasBadge: { position: 'absolute', bottom: 10, left: 10, backgroundColor: 'rgba(10,10,10,0.88)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  midiasTexto: { fontSize: 10, color: cores.textoForte },
  distanciaBadge: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(10,10,10,0.88)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  distanciaTexto: { fontSize: 10, color: cores.primaria, fontWeight: '600' },
  // Corpo
  cardCorpo: { padding: 14 },
  cardTitulo: { fontSize: 14, fontWeight: '600', color: cores.textoForte, lineHeight: 20, marginBottom: 6 },
  cardLocalTexto: { fontSize: 12, color: cores.textoFraco, marginBottom: 12 },
  cardRodape: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardCandidaturas: { fontSize: 11, color: cores.textoMutado },
  btnVerObra: { backgroundColor: cores.primaria, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 7 },
  btnVerObraTexto: { fontSize: 11, fontWeight: '600', color: '#0A0A0A' },
})