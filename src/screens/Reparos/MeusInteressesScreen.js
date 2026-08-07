import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { comRetry } from '../../utils/rede'
import { cores, espacos, raios } from '../../utils/tema'
import { distanciaItemKm, formatarDistancia, useCoordsUsuario } from '../../utils/distancia'

// O fallback deste mapa é `pendente` ("Aguardando resposta"), então uma chave que falta
// não some da tela: ela MENTE. As duas grafias do endpoint legado ('aprovada'/'recusada',
// ver STATUS_GRUPO em ContratosScreen.js:24) caíam exatamente nisso — quem tinha sido
// recusado, e quem tinha sido APROVADO, liam os dois que ainda estavam aguardando.
// Cada uma aponta para o mesmo texto da grafia atual equivalente.
// 'expirado' entrou pelo mesmo motivo: sem a chave, a proposta que venceu sem resposta
// exibia "Aguardando resposta" — a mentira mais cara da lista, porque é exatamente a
// linha em que já não há nada a aguardar. Cores iguais às da tag ⏰ do card (:223-224).
const STATUS_INFO = {
  pendente:            { texto: 'Aguardando resposta', cor: '#FFC107', bg: '#3a3a1a' },
  aceito:              { texto: '✅ Proposta aceita',  cor: '#4caf50', bg: '#1a3a1a' },
  aprovada:            { texto: '✅ Proposta aceita',  cor: '#4caf50', bg: '#1a3a1a' },
  recusado:            { texto: '✗ Recusado',          cor: '#f44336', bg: '#3a1a1a' },
  recusada:            { texto: '✗ Recusado',          cor: '#f44336', bg: '#3a1a1a' },
  contraproposta_dono: { texto: '💬 Contraproposta',   cor: '#FF6B35', bg: '#3a2a1a' },
  expirado:            { texto: '⏰ Expirado',         cor: '#f44336', bg: '#3a1a1a' },
}

const formatarValor = (v) =>
  (v == null || isNaN(Number(v)))
    ? 'A combinar'
    : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

// Ciclos do REPARO que já não voltam atrás. 'cancelada' é o que a moderação grava ao
// recusar a demanda; 'expirada' é o vencimento já materializado no próprio status. Nenhum
// dos dois é filtrado na entrada (só 'encerrada' é, :93), então sem esta lista a linha
// passava como viva: caía em "Pendentes", não exibia tag nenhuma e ainda anunciava
// "Você segue no páreo" para um reparo que não existe mais.
const REPARO_INATIVO = ['cancelada', 'expirada']

// Expiração vem PRONTA do servidor (relógio do banco) — ver o comentário em renderItem.
// UM só predicado para o balde e para a tag do card: se divergirem, uma linha cai em
// "Expirados" sem exibir "⏰ Prazo expirado", ou o contrário.
// Três caminhos até "expirado", porque a informação chega de três formas: no status da
// PROPOSTA ('expirado'), no status do REPARO (cancelada/expirada) ou na flag calculada
// pelo servidor sobre um reparo ainda 'aberta'.
const eExpirado = (item) =>
  item.status === 'expirado' ||
  REPARO_INATIVO.includes(item.reparo_status) ||
  (item.reparo_status === 'aberta' && !!(item.reparo_expirada ?? item.expirada))

// As duas grafias de cada desfecho, iguais às de STATUS_GRUPO em ContratosScreen.js:24.
const GRUPO_STATUS = {
  aprovada: ['aceito', 'aprovada'],
  recusada: ['recusado', 'recusada'],
  pendente: ['pendente', 'contraproposta_dono'],
}

// Precedência: desfecho DECIDIDO primeiro, expiração só para quem ficou sem resposta.
// Uma proposta aceita não vira "expirada" porque o anúncio venceu — o serviço é seu — e
// uma recusa continua sendo recusa. "Expirado" é a proposta que MORREU SEM RESPOSTA, que
// é a única em que o vencimento do prazo conta como desfecho.
// O teste de expiração vem ANTES do de pendente e vale para qualquer status que sobre:
// 'expirado' não está em GRUPO_STATUS.pendente, e dentro daquele ramo nunca seria
// alcançado — a linha cujo status é literalmente "expirado" ficava fora de "Expirados".
// Status desconhecido segue devolvendo null (só "Todos") quando o reparo está vivo; num
// reparo inativo ele cai em "Expirados", que é o que a demanda morta diz sobre a linha.
const balde = (item) =>
  GRUPO_STATUS.aprovada.includes(item.status) ? 'aprovada'
    : GRUPO_STATUS.recusada.includes(item.status) ? 'recusada'
    : eExpirado(item) ? 'expirada'
    : GRUPO_STATUS.pendente.includes(item.status) ? 'pendente'
    : null

const FILTROS = [
  { id: 'todos',    label: 'Todos'     },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'aprovada', label: 'Aprovados' },
  { id: 'recusada', label: 'Recusados' },
  { id: 'expirada', label: 'Expirados' },
]

// Vazio por filtro: "Nenhum histórico ainda" não diz nada a quem filtrou por Recusados.
const VAZIO = {
  todos:    { titulo: 'Nenhum serviço ainda',      sub: 'Explore os serviços disponíveis e demonstre interesse para aparecer aqui.' },
  pendente: { titulo: 'Nenhuma proposta pendente', sub: 'Propostas aguardando a resposta do solicitante aparecerão aqui.' },
  aprovada: { titulo: 'Nenhuma proposta aceita',   sub: 'Quando um solicitante aceitar sua proposta, o serviço aparecerá aqui.' },
  recusada: { titulo: 'Nenhuma recusa',            sub: 'Propostas que não foram escolhidas aparecerão aqui.' },
  expirada: { titulo: 'Nenhum serviço expirado',   sub: 'Propostas que ficaram sem resposta até o prazo vencer aparecerão aqui.' },
}

export default function MeusInteressesScreen({ navigation }) {
  const [linhas, setLinhas]       = useState([])
  const [filtro, setFiltro]       = useState('todos')
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [coords]                  = useCoordsUsuario()
  const { usuario }               = useAuth()

  const buscar = async () => {
    try {
      const data = await comRetry(() => api.get('/reparos/meus-interesses'))
      // Os dois arrays viram UMA lista: o balde sai de status + expiração da própria
      // proposta, não de qual coleção o servidor escolheu. O split `ativos`/`historico`
      // segue o ciclo do REPARO (encerrado/vencido), não o da proposta, então classificar
      // por ele colocava uma recusa em "Ativos" e um aceite em "Histórico".
      // B72-05: ao focar a aba (useFocusEffect) refazemos a busca; encerrados pelo dono
      // saem daqui na hora (vão para "Contratos Finalizados") sem precisar relogar.
      // Dedupe por id, ficando com a PRIMEIRA ocorrência (ordem: ativos antes de
      // histórico). Enquanto eram duas listas separadas, uma linha repetida nos dois
      // arrays passava despercebida; concatenadas, ela vira chave duplicada no
      // keyExtractor. Os dois arrays deveriam ser partição disjunta da mesma consulta —
      // isto é cinto de segurança, não correção de um caso conhecido.
      const vistos = new Set()
      const todas = [...(data.ativos || []), ...(data.historico || [])]
        .filter(item => {
          const k = String(item.id)
          if (vistos.has(k)) return false
          vistos.add(k)
          return true
        })
      setLinhas(todas.filter(item => item.reparo_status !== 'encerrada'))
    } catch (err) {
      console.log('Erro ao buscar interesses:', err)
      Alert.alert('Erro', 'Não foi possível carregar seus serviços.')
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscar() }, []))

  const onRefresh = () => { setAtualizando(true); buscar() }

  const dados = filtro === 'todos' ? linhas : linhas.filter(i => balde(i) === filtro)

  if (carregando) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  const renderItem = ({ item }) => {
    const eEncerrado = item.reparo_status === 'encerrada'
    // Expiração vem PRONTA do servidor (relógio do banco), como em MinhasObrasScreen:121.
    // Comparar expira_em com o relógio do aparelho fazia esta lista discordar do servidor
    // quando a hora local estava adiantada/atrasada — o mesmo reparo aparecia expirado aqui
    // e ativo lá. Aqui a linha é o INTERESSE, não o reparo, e os campos do reparo chegam
    // prefixados (reparo_status, reparo_titulo…), daí reparo_expirada antes do nome simples.
    const expirado   = !eEncerrado && eExpirado(item)
    const dist       = distanciaItemKm(coords, item)
    // "Ainda no páreo": só faz sentido enquanto a candidatura não foi decidida (nem
    // aceito nem recusado) e a demanda segue aberta. O estado do match vem da API
    // (match_usuario_id); comparo com o meu id (useAuth) para distinguir "ninguém
    // escolhido ainda" de "escolheram outro".
    const demandaAberta    = !eEncerrado && !expirado
    const emAnalise        = item.status === 'pendente' || item.status === 'contraproposta_dono'
    const semMatch         = item.match_usuario_id == null
    const outroSelecionado = !semMatch && String(item.match_usuario_id) !== String(usuario?.id)
    const mostrarParaeo    = emAnalise && demandaAberta && (semMatch || outroSelecionado)
    // O prazo venceu e a proposta nunca foi respondida: o status CONTINUA 'pendente' no
    // servidor, então o mapa devolveria "Aguardando resposta" — a espera que já acabou.
    // Aqui o desfecho não é o status da proposta, é o do reparo: mesma tarja do expirado
    // com o texto que descreve o que houve. Vale só enquanto indeciso; aceito e recusado
    // têm desfecho próprio e mantêm o badge deles mesmo com o anúncio vencido.
    const s = (expirado && emAnalise)
      ? { ...STATUS_INFO.expirado, texto: 'Sem resposta' }
      : (STATUS_INFO[item.status] || STATUS_INFO.pendente)

    return (
      <View style={estilos.card}>
        <View style={estilos.cardHeader}>
          <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
          <View style={[estilos.statusBadge, { backgroundColor: s.bg }, (eEncerrado || expirado) && estilos.statusBadgeInativo]}>
            <Text style={[estilos.statusTexto, { color: s.cor }]}>{s.texto}</Text>
          </View>
        </View>
        {(eEncerrado || expirado) && (
          <View style={[estilos.tagReparo, expirado && estilos.tagExpirado]}>
            <Text style={[estilos.tagReparoTexto, expirado && estilos.tagExpiradoTexto]}>
              {eEncerrado ? '🔒 Serviço encerrado' : '⏰ Prazo expirado'}
            </Text>
          </View>
        )}
        {mostrarParaeo && (
          <Text style={[estilos.avisoParaeo, { color: semMatch ? cores.sucesso : cores.textoFraco }]}>
            {semMatch
              ? 'Você segue no páreo — nenhum profissional foi escolhido ainda.'
              : 'Outro profissional foi selecionado.'}
          </Text>
        )}
        <Text style={estilos.cardMeta}>
          {item.categoria} · {item.cidade}{item.bairro ? `, ${item.bairro}` : ''}
          {dist != null && <Text style={estilos.cardDistancia}>{`  ·  ${formatarDistancia(dist)}`}</Text>}
        </Text>
        <View style={estilos.valoresRow}>
          <View>
            <Text style={estilos.valorLabel}>Valor do serviço</Text>
            <Text style={estilos.valorTexto}>{formatarValor(item.valor_estimado)}</Text>
          </View>
          {item.valor_proposto != null && (
            <View>
              <Text style={estilos.valorLabel}>Sua proposta</Text>
              <Text style={[estilos.valorTexto, { color: cores.primaria }]}>{formatarValor(item.valor_proposto)}</Text>
            </View>
          )}
          {item.valor_contraproposta != null && (
            <View>
              <Text style={estilos.valorLabel}>Contraproposta</Text>
              <Text style={[estilos.valorTexto, { color: '#FF6B35' }]}>{formatarValor(item.valor_contraproposta)}</Text>
            </View>
          )}
        </View>
        {item.status === 'contraproposta_dono' && (
          <View style={estilos.alertaBanner}>
            <Text style={estilos.alertaTexto}>⚡ O solicitante enviou uma contraproposta — veja os detalhes</Text>
          </View>
        )}
        <TouchableOpacity
          style={estilos.btnVer}
          onPress={() => navigation.navigate('DetalheReparo', { reparo: { id: item.reparo_id, titulo: item.titulo, categoria: item.categoria, cidade: item.cidade, latitude: item.latitude, longitude: item.longitude } })}
        >
          <Text style={estilos.btnVerTexto}>Ver detalhes →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Meus Serviços</Text>
        <Text style={estilos.subtitulo}>{dados.length} registro{dados.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* flexWrap porque os cinco rótulos não cabem numa linha: ~41 caracteres a 12pt com
          paddingHorizontal 14 passam de 440dp, contra 320dp úteis num aparelho de 360dp.
          Quebram para uma segunda linha em vez de encolher a fonte — mesmo padrão de
          ContratosScreen.js:219, de onde vem toda a estilização das pílulas. */}
      <View style={estilos.filtrosRow}>
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[estilos.filtroPill, filtro === f.id && estilos.filtroPillAtivo]}
            onPress={() => setFiltro(f.id)}
          >
            <Text style={[estilos.filtroPillTexto, filtro === f.id && estilos.filtroPillTextoAtivo]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {dados.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>📋</Text>
          <Text style={estilos.vazioTitulo}>{(VAZIO[filtro] || VAZIO.todos).titulo}</Text>
          <Text style={estilos.vazioSub}>{(VAZIO[filtro] || VAZIO.todos).sub}</Text>
        </View>
      ) : (
        <FlatList
          data={dados}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={estilos.lista}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container:        { flex: 1, backgroundColor: cores.fundo },
  header:           { paddingHorizontal: espacos.tela, paddingTop: 16, paddingBottom: 12 },
  titulo:           { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  subtitulo:        { fontSize: 13, color: cores.textoFraco, marginTop: 2 },
  // Pílulas idênticas às de ContratosScreen.js:219-223 (as duas telas são a mesma lista,
  // uma por vertical), com o marginBottom 12 que as abas daqui já usavam.
  // space-between: primeira pílula encostada à esquerda e última à direita EM CADA linha.
  // O gap 8 vira mínimo, não medida fixa — numa linha com poucas pílulas a sobra toda é
  // distribuída entre elas.
  filtrosRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: espacos.tela, gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  filtroPill:       { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 6 },
  filtroPillAtivo:  { backgroundColor: cores.primaria, borderColor: cores.primaria },
  filtroPillTexto:  { fontSize: 12, color: cores.textoMedio },
  filtroPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  lista:            { paddingHorizontal: espacos.tela, paddingBottom: 32, paddingTop: 8 },
  card:             { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 16 },
  cardHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitulo:       { fontSize: 14, fontWeight: '600', color: cores.textoForte, flex: 1, marginRight: 8, lineHeight: 20 },
  statusBadge:      { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusTexto:      { fontSize: 11, fontWeight: '700' },
  tagReparo:        { backgroundColor: '#1e1e1e', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 6, borderWidth: 0.5, borderColor: '#333' },
  tagReparoTexto:   { fontSize: 10, color: cores.textoFraco, fontWeight: '500' },
  tagExpirado:      { backgroundColor: '#3a1a1a', borderColor: '#f4433655' },
  tagExpiradoTexto: { fontSize: 11, color: '#f44336', fontWeight: '700' },
  statusBadgeInativo: { opacity: 0.5 },
  cardMeta:         { fontSize: 12, color: cores.textoFraco, marginBottom: 12, textTransform: 'capitalize' },
  avisoParaeo:      { fontSize: 12, lineHeight: 16, marginBottom: 10 },
  cardDistancia:    { color: cores.primaria, fontWeight: '600', textTransform: 'none' },
  valoresRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 12 },
  valorLabel:       { fontSize: 10, color: cores.textoMutado, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  valorTexto:       { fontSize: 15, fontWeight: '700', color: cores.textoForte },
  alertaBanner:     { backgroundColor: '#3a2a1a', borderWidth: 1, borderColor: '#FF6B3544', borderRadius: raios.medio, padding: 10, marginBottom: 12 },
  alertaTexto:      { fontSize: 12, color: '#FF6B35', textAlign: 'center' },
  btnVer:           { backgroundColor: cores.primaria, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnVerTexto:      { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  vazio:            { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone:       { fontSize: 48, marginBottom: 16 },
  vazioTitulo:      { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub:         { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
})
