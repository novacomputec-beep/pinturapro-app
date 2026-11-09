import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import api, { candidaturasService } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { comRetry } from '../../utils/rede'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'
import { useCoordsUsuario } from '../../utils/distancia'
import { leInteresses, leCandidaturas } from '../../utils/profissional'
import { marcarTemCandidaturas } from '../../utils/temObras'
import BannerErroCarregamento from '../../components/BannerErroCarregamento'
import EtiquetaTipo from '../../components/EtiquetaTipo'
import { CardInteresse, balde, migrouParaFinalizados } from '../Reparos/MeusInteressesScreen'
import { CardCandidatura, candidaturaVisivel, candidaturaNoFiltro } from '../Contratos/ContratosScreen'

// "Meus trabalhos" (Arte-Fase2-Trabalhar): tudo em que o profissional está envolvido, numa
// lista só — os interesses em SERVIÇOS e as candidaturas a OBRAS (propostas, negociações e
// matches), do mais novo para o mais antigo, cada card com a etiqueta "Serviço" / "Obra".
//
// É a soma das duas listas de sempre (MeusInteressesScreen e ContratosScreen):
//   - as MESMAS consultas (GET /reparos/meus-interesses e GET /candidaturas/minhas);
//   - os MESMOS cards (CardInteresse e CardCandidatura, importados de lá), com "no páreo",
//     "Sem resposta", fase do agendamento e contraproposta decididos por eles, abrindo
//     DetalheReparo ou DetalheObra;
//   - as MESMAS regras de quem sai da lista (o que virou contrato encerrado vive em
//     "Finalizados") e de quem entra em cada filtro, cada tipo com a sua.
// Quais consultas rodam sai de utils/profissional, pela CAPACIDADE e não pelo tipo da conta:
// interesses para quem pode serviços ou já demonstrou interesse alguma vez; candidaturas para
// quem pode obras ou já se candidatou alguma vez. As duas listas são da PESSOA (Fase 2b): vêm
// as propostas de qualquer conta profissional dela, e cada card lê de quem é o match em
// match_da_pessoa.

const FILTROS = [
  { id: 'todos',    label: 'Todos'     },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'aprovada', label: 'Aprovados' },
  { id: 'recusada', label: 'Recusados' },
  { id: 'expirada', label: 'Expirados' },
]

// Vazio por filtro: "Nenhum trabalho ainda" não diz nada a quem filtrou por Recusados.
const VAZIO = {
  todos:    { titulo: 'Nenhum trabalho ainda',     sub: 'Explore os pedidos disponíveis e demonstre interesse para aparecer aqui.' },
  pendente: { titulo: 'Nenhuma proposta pendente', sub: 'Propostas aguardando a resposta do solicitante aparecerão aqui.' },
  aprovada: { titulo: 'Nenhuma proposta aceita',   sub: 'Quando um solicitante aceitar sua proposta, o trabalho aparecerá aqui.' },
  recusada: { titulo: 'Nenhuma recusa',            sub: 'Propostas que não foram escolhidas aparecerão aqui.' },
  expirada: { titulo: 'Nenhum pedido expirado',    sub: 'Propostas que ficaram sem resposta até o prazo vencer aparecerão aqui.' },
}

// As duas listas numa só, da proposta mais nova para a mais antiga. Intercala sem reordenar
// cada lista por dentro (a ordem que o servidor deu a cada tipo é preservada). Data ilegível
// vai para o fim. `chave` distingue um interesse e uma candidatura com o mesmo id.
export const juntarTrabalhos = (interesses, candidaturas) => {
  const quando = (x) => { const t = new Date(x?.criado_em).getTime(); return Number.isFinite(t) ? t : 0 }
  const is = (interesses || []).map((item) => ({ tipo: 'reparo', item, chave: `reparo:${item.id}` }))
  const cs = (candidaturas || []).map((item) => ({ tipo: 'obra', item, chave: `obra:${item.id}` }))
  const saida = []
  let i = 0, j = 0
  while (i < is.length && j < cs.length) saida.push(quando(is[i].item) >= quando(cs[j].item) ? is[i++] : cs[j++])
  return [...saida, ...is.slice(i), ...cs.slice(j)]
}

// Miolo: título, filtros e a lista. A tela é dona dos dados; a Galeria passa listas locais.
// `linhas`: juntarTrabalhos(...) já sem o que migrou para "Finalizados". comEtiqueta: só
// quando a conta tem (ou pode ter) os dois tipos.
export function MeusTrabalhosConteudo({ linhas, filtro, onFiltro, carregando, usuario, coords, navigation, comEtiqueta, erro, atualizacao }) {
  const dados = linhas.filter((l) => (l.tipo === 'obra'
    ? candidaturaNoFiltro(l.item, filtro)
    : filtro === 'todos' || balde(l.item) === filtro))
  const vazio = VAZIO[filtro] || VAZIO.todos
  return (
    <>
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Meus trabalhos</Text>
        <Text style={estilos.subtitulo}>{dados.length} registro{dados.length !== 1 ? 's' : ''}</Text>
      </View>

      {/* flexWrap porque os cinco rótulos não cabem numa linha num aparelho de 360dp: quebram
          para uma segunda linha em vez de encolher a fonte — como nas duas listas de origem. */}
      <View style={estilos.filtrosRow}>
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[estilos.filtroPill, filtro === f.id && estilos.filtroPillAtivo]}
            onPress={() => onFiltro(f.id)}
          >
            <Text style={[estilos.filtroPillTexto, filtro === f.id && estilos.filtroPillTextoAtivo]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {erro}

      {carregando ? (
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      ) : dados.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>📋</Text>
          <Text style={estilos.vazioTitulo}>{vazio.titulo}</Text>
          <Text style={estilos.vazioSub}>{vazio.sub}</Text>
        </View>
      ) : (
        <FlatList
          data={dados}
          keyExtractor={(l) => l.chave}
          contentContainerStyle={[estilos.lista, larguraMaxima]}
          refreshControl={atualizacao}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item: l }) => (l.tipo === 'obra'
            ? <CardCandidatura item={l.item} usuario={usuario} navigation={navigation} etiqueta={comEtiqueta ? <EtiquetaTipo tipo="obra" /> : null} />
            : <CardInteresse item={l.item} coords={coords} usuario={usuario} navigation={navigation} etiqueta={comEtiqueta ? <EtiquetaTipo tipo="reparo" /> : null} />)}
        />
      )}
    </>
  )
}

export default function MeusTrabalhosScreen({ navigation }) {
  const { usuario } = useAuth()
  const [interesses, setInteresses] = useState([])
  const [candidaturas, setCandidaturas] = useState([])
  const [filtro, setFiltro] = useState('todos')
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState(null)
  const [coords] = useCoordsUsuario()
  // Lido por ref: o callback de foco é memoizado e o que a conta pode ver muda em uso.
  const usuarioRef = React.useRef(usuario); usuarioRef.current = usuario

  const buscar = async () => {
    const u = usuarioRef.current
    const comServicos = leInteresses(u)
    const comObras = leCandidaturas(u)
    // As duas consultas correm juntas e a falha de uma não apaga o que a outra trouxe: a
    // lista que falhou fica como estava e o banner avisa.
    const [rs, cs] = await Promise.all([
      comServicos
        ? comRetry(() => api.get('/reparos/meus-interesses')).then((valor) => ({ ok: true, valor }), (falha) => ({ ok: false, falha }))
        : null,
      comObras
        ? candidaturasService.minhas().then((valor) => ({ ok: true, valor }), (falha) => ({ ok: false, falha }))
        : null,
    ])
    let mensagem = null
    if (rs?.ok) {
      // Os dois arrays viram UMA lista (o balde sai do status + expiração da própria proposta,
      // não de qual coleção o servidor escolheu), com dedupe por id ficando com a PRIMEIRA
      // ocorrência — o mesmo tratamento da lista de serviços de origem.
      const vistos = new Set()
      const todas = [...(rs.valor?.ativos || []), ...(rs.valor?.historico || [])].filter((item) => {
        const k = String(item.id)
        if (vistos.has(k)) return false
        vistos.add(k)
        return true
      })
      setInteresses(todas.filter((item) => !migrouParaFinalizados(item)))
    } else if (rs) {
      console.log('[MeusTrabalhos] falha ao buscar interesses | status:', rs.falha?.status, '| code:', rs.falha?.code, '| msg:', rs.falha?.mensagem)
      mensagem = rs.falha?.mensagem || 'Não foi possível carregar seus serviços.'
    } else {
      setInteresses([])
    }
    if (cs?.ok) {
      // O endpoint retorna { candidaturas, page, limit } — extrai o array.
      const lista = Array.isArray(cs.valor?.candidaturas) ? cs.valor.candidaturas : []
      setCandidaturas(lista.filter(candidaturaVisivel))
      // Alguma candidatura (mesmo já encerrada): a conta TEM candidatura, então a aba
      // Mensagens (chat de obra) existe sem esperar a próxima leitura do perfil.
      if (lista.length > 0) marcarTemCandidaturas(u?.id)
    } else if (cs) {
      console.log('[MeusTrabalhos] falha ao buscar candidaturas | status:', cs.falha?.status, '| code:', cs.falha?.code, '| msg:', cs.falha?.mensagem)
      mensagem = mensagem || cs.falha?.mensagem || 'Não foi possível carregar suas candidaturas.'
    } else {
      setCandidaturas([])
    }
    setErro(mensagem)
    setCarregando(false)
    setAtualizando(false)
  }

  // Refaz a busca ao focar a aba: o trabalho que você fechou sai daqui na hora (vai para
  // "Finalizados") sem precisar relogar.
  useFocusEffect(useCallback(() => { buscar() }, []))

  const onRefresh = () => { setAtualizando(true); buscar() }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <MeusTrabalhosConteudo
        linhas={juntarTrabalhos(interesses, candidaturas)}
        filtro={filtro}
        onFiltro={setFiltro}
        carregando={carregando}
        usuario={usuario}
        coords={coords}
        navigation={navigation}
        comEtiqueta={leInteresses(usuario) && leCandidaturas(usuario)}
        erro={<BannerErroCarregamento mensagem={erro} onRetry={buscar} />}
        atualizacao={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: { paddingHorizontal: espacos.tela, paddingTop: 12, paddingBottom: 8 },
  // Título laranja, como "Pedidos para você" e "Meus pedidos".
  titulo: { fontSize: 28, fontWeight: '900', color: '#E08A44', letterSpacing: -0.5, lineHeight: 34 },
  subtitulo: { fontSize: 12, color: cores.textoFraco, marginTop: 2 },
  filtrosRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: espacos.tela, gap: 8, marginBottom: 12 },
  filtroPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 7 },
  filtroPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  filtroPillTexto: { fontSize: 12, color: cores.textoMedio },
  filtroPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  lista: { paddingHorizontal: espacos.tela, paddingBottom: 32 + alturas.barraServico },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone: { fontSize: 48, marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
})
