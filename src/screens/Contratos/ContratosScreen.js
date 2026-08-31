import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { candidaturasService } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { BadgeStatus, Card, Separador, STATUS_BADGE } from '../../components'
import BannerErroCarregamento from '../../components/BannerErroCarregamento'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

const formatarData = (data) =>
  data ? new Date(data).toLocaleDateString('pt-BR') : '—'

const formatarValor = (v) =>
  v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'

// O backend grava candidaturas com dois vocabulários, conforme o fluxo usado:
//   • aceitar/recusar via DetalheObra (/obras/:id/candidatura/:id/responder) → 'aceito'/'recusado'
//   • aprovar/recusar legado (/candidaturas/:id/aprovar|recusar)            → 'aprovada'/'recusada'
// Os grupos abaixo normalizam ambos para filtros e renderização. 'contraproposta_dono'
// (negociação em aberto) entra em Pendentes.
const STATUS_GRUPO = {
  pendente: ['pendente', 'contraproposta_dono'],
  aprovada: ['aceito', 'aprovada'],
  recusada: ['recusado', 'recusada'],
}

export default function ContratosScreen({ navigation }) {
  const [candidaturas, setCandidaturas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [erro, setErro] = useState(null)
  const { usuario } = useAuth()

  const buscar = async () => {
    try {
      const dados = await candidaturasService.minhas()
      // O endpoint retorna { candidaturas, page, limit } — extrai o array
      setCandidaturas(Array.isArray(dados?.candidaturas) ? dados.candidaturas : [])
      setErro(null)
    } catch (err) {
      console.log('Erro ao buscar candidaturas:', err)
      setErro(err.mensagem || 'Não foi possível carregar suas candidaturas.')
    } finally {
      setCarregando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscar() }, []))

  const FILTROS = [
    { id: 'todos',    label: 'Todos'     },
    { id: 'pendente', label: 'Pendentes' },
    { id: 'aprovada', label: 'Aprovados' },
    { id: 'recusada', label: 'Recusados' },
  ]

  // Guarda defensiva contra shape inesperado (evita crash de render)
  const lista = Array.isArray(candidaturas) ? candidaturas : []
  // Sai daqui SÓ quem ficou com a obra: essa candidatura virou contrato e continua em
  // "Contratos Finalizados", então mantê-la aqui a mostraria em dois lugares ao mesmo tempo.
  // A recusada fica. Filtrar pelo ciclo da OBRA levava as duas juntas e tirava a recusa de
  // todos os filtros de uma vez, inclusive "Recusados" — mesma correção de
  // MeusInteressesScreen.js:84, que é esta lista na vertical de reparos.
  const visiveis = lista.filter(c => !(c.obra_status === 'encerrada' && STATUS_GRUPO.aprovada.includes(c.status)))
  const dadosFiltrados = filtro === 'todos'
    ? visiveis
    : visiveis.filter(c => (STATUS_GRUPO[filtro] || [filtro]).includes(c.status))

  const renderItem = ({ item }) => {
    const temContrato = STATUS_GRUPO.aprovada.includes(item.status)
    const obra = item.obras || item
    // "Ainda no páreo": só enquanto a candidatura não foi decidida (grupo pendente) e a
    // obra segue aberta. O match vem da API (match_usuario_id); comparo com o meu id
    // (useAuth) para distinguir "ninguém escolhido ainda" de "escolheram outro".
    // Expiração vem PRONTA do servidor (relógio do banco), como em MinhasObrasScreen:121.
    // Comparar expira_em com o relógio do aparelho fazia esta lista discordar do servidor
    // quando a hora local estava adiantada/atrasada — a mesma obra dizia "no páreo" aqui e
    // já expirada lá. Aqui a linha é a CANDIDATURA, não a obra, e os campos da obra chegam
    // prefixados (obra_status, obra_titulo…), daí obra_expirada antes do nome simples.
    const eEncerrada       = item.obra_status === 'encerrada'
    const expirada         = !eEncerrada && !!(item.obra_expirada ?? item.expirada)
    const demandaAberta    = !eEncerrada && !expirada
    const emAnalise        = STATUS_GRUPO.pendente.includes(item.status)
    const semMatch         = item.match_usuario_id == null
    const outroSelecionado = !semMatch && String(item.match_usuario_id) !== String(usuario?.id)
    const mostrarParaeo    = emAnalise && demandaAberta && (semMatch || outroSelecionado)
    // A candidatura nunca foi respondida e já não será: a obra fechou com outra pessoa ou o
    // prazo venceu. O status CONTINUA 'pendente' no servidor, e BadgeStatus só olha o status
    // — diria "Pendente" para uma disputa que terminou. Override local igual ao de
    // MeusInteressesScreen.js:184, porque aqui o desfecho é o da OBRA, não o da candidatura.
    // Vale só enquanto indeciso: aceita e recusada têm desfecho próprio e mantêm o badge
    // delas mesmo com a obra fechada.
    const semResposta      = emAnalise && !demandaAberta

    const abrirDetalhe = () => navigation?.navigate('DetalheObra', {
      obra: {
        id: item.obra_id,
        titulo: item.obra_titulo || item.titulo,
        categoria: item.obra_categoria || item.categoria,
        cidade: item.obra_cidade || item.cidade,
        uf: item.obra_uf || item.uf,
        valor: item.obra_valor || item.valor,
      },
    })

    return (
      <TouchableOpacity activeOpacity={0.85} onPress={abrirDetalhe}>
        <Card estilo={estilos.card}>
          <View style={estilos.cardTopo}>
            {semResposta ? (
              <View style={estilos.badgeSemResposta}>
                <View style={estilos.badgeSemRespostaDot} />
                <Text style={estilos.badgeSemRespostaTexto}>Sem resposta</Text>
              </View>
            ) : (
              <BadgeStatus status={item.status} />
            )}
            <Text style={estilos.dataTexto}>{formatarData(item.criado_em)}</Text>
          </View>

          <Separador estilo={{ marginVertical: 12 }} />

          <Text style={estilos.obraTitulo} numberOfLines={2}>
            {item.obra_titulo || item.titulo || 'Obra'}
          </Text>
          <Text style={estilos.obraLocal}>
            📍 {item.obra_cidade || item.cidade || '—'}{item.obra_uf || item.uf ? `, ${item.obra_uf || item.uf}` : ''}
          </Text>

          {/* Algo no card precisa dizer que a OBRA acabou: "Sem resposta" fala da
              candidatura, e a recusada não ganha badge nenhum sobre a demanda. Sem a tarja,
              a linha de uma obra fechada é indistinguível de uma em disputa. Mesma tarja de
              MeusInteressesScreen.js:197 — o componente Tag não serve porque o estilo dele
              não tem alignSelf e a tarja esticaria na largura do card. */}
          {!demandaAberta && (
            <View style={[estilos.tagObra, expirada && estilos.tagExpirada]}>
              <Text style={[estilos.tagObraTexto, expirada && estilos.tagExpiradaTexto]}>
                {eEncerrada ? '🔒 Obra encerrada' : '⏰ Prazo expirado'}
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

          <View style={estilos.infoRow}>
            <View style={estilos.infoItem}>
              <Text style={estilos.infoLabel}>Valor obra</Text>
              <Text style={[estilos.infoValor, { color: cores.sucesso }]}>
                {formatarValor(item.obra_valor || item.valor)}
              </Text>
            </View>
            <View style={estilos.infoItem}>
              <Text style={estilos.infoLabel}>Categoria</Text>
              <Text style={estilos.infoValor}>{item.obra_categoria || item.categoria || '—'}</Text>
            </View>
            <View style={estilos.infoItem}>
              <Text style={estilos.infoLabel}>Situação</Text>
              {/* Mesma decisão E mesmo rótulo do badge: primeiro o override de "Sem
                  resposta" (o cru dizia "pendente" a três centímetros dele e da tarja de
                  obra fechada), depois o texto de STATUS_BADGE — sem ele a célula escrevia
                  a chave do banco, "contraproposta_dono", ao lado do badge que dizia
                  "Contraproposta".
                  O cru fica como ÚLTIMO recurso, para status que o mapa ainda não conhece:
                  o badge nesse caso cai em 'encerrada' e diz "Encerrada", que aqui seria uma
                  invenção — a chave nova é feia, mas é verdade, e some quando o mapa
                  aprender a chave. */}
              {/* textTransform 'none' contra o 'capitalize' de infoValor: aquele existe para
                  o valor cru (a célula Categoria ainda depende dele, "pintura interna" →
                  "Pintura Interna"), mas o rótulo aqui já vem escrito como deve aparecer, e
                  a regra por PALAVRA o deformava — "Sem Resposta", "Em Análise". */}
              <Text style={[estilos.infoValor, { textTransform: 'none' }]}>
                {semResposta ? 'Sem resposta' : (STATUS_BADGE[item.status]?.texto || item.status)}
              </Text>
            </View>
          </View>

          {temContrato && (
            <>
              <Separador estilo={{ marginTop: 12, marginBottom: 12 }} />
              <View style={estilos.contratoBox}>
                <Text style={estilos.contratoTexto}>✅ Contrato enviado por e-mail</Text>
                <Text style={estilos.contratoSub}>Verifique sua caixa de entrada</Text>
              </View>
            </>
          )}

          {/* Contraproposta do solicitante: o pintor precisa responder na tela de
              detalhe (aceitar/recusar/contrapropor). Espelha o card de reparo. */}
          {item.status === 'contraproposta_dono' && (
            <>
              <Separador estilo={{ marginTop: 12, marginBottom: 12 }} />
              <View style={estilos.alertaBanner}>
                <Text style={estilos.alertaTexto}>⚡ O solicitante enviou uma contraproposta — veja os detalhes</Text>
              </View>
              <TouchableOpacity style={estilos.btnVer} onPress={abrirDetalhe}>
                <Text style={estilos.btnVerTexto}>Ver detalhes →</Text>
              </TouchableOpacity>
            </>
          )}

          {STATUS_GRUPO.recusada.includes(item.status) && (
            <View style={estilos.recusadoAviso}>
              <Text style={estilos.recusadoAvisoTexto}>Candidatura não selecionada.</Text>
            </View>
          )}
        </Card>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Contratos</Text>
        <Text style={estilos.subtitulo}>{lista.length} candidatura(s)</Text>
      </View>

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

      {/* Irmão do ramo vazio, nunca dentro dele: lista vazia POR FALHA mostra os dois. */}
      <BannerErroCarregamento mensagem={erro} onRetry={buscar} />

      {carregando ? (
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      ) : dadosFiltrados.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>📋</Text>
          <Text style={estilos.vazioTitulo}>Nenhuma candidatura</Text>
          <Text style={estilos.vazioSub}>
            Quando você demonstrar interesse em uma obra, ela aparecerá aqui.
          </Text>
        </View>
      ) : (
        <FlatList
          data={dadosFiltrados}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[estilos.lista, larguraMaxima]}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: { paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 8 },
  titulo: { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  subtitulo: { fontSize: 12, color: cores.textoFraco, marginTop: 2 },
  filtrosRow: { flexDirection: 'row', paddingHorizontal: espacos.tela, gap: 8, marginBottom: 16, marginTop: 8, flexWrap: 'wrap' },
  filtroPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 6 },
  filtroPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  filtroPillTexto: { fontSize: 12, color: cores.textoMedio },
  filtroPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  lista: { paddingHorizontal: espacos.tela, paddingBottom: 32 + alturas.barraServico },
  card: { padding: 16 },
  cardTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dataTexto: { fontSize: 11, color: cores.textoMutado },
  // Mesma geometria do BadgeStatus (components/index.js:154) — pílula, ponto de 5 e texto
  // de 11 —, porque este badge fica no lugar dele: divergir faria o card da disputa
  // encerrada parecer de outra lista. Nas cores segue 'recusada', o desfecho mais próximo.
  badgeSemResposta: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: cores.perigoSuave, borderWidth: 0.5, borderColor: cores.perigo + '66', borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeSemRespostaDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: cores.perigo },
  badgeSemRespostaTexto: { fontSize: 11, fontWeight: '500', color: cores.perigo },
  obraTitulo: { fontSize: 15, fontWeight: '600', color: cores.textoForte, lineHeight: 22, marginBottom: 4 },
  obraLocal: { fontSize: 12, color: cores.textoFraco, marginBottom: 14 },
  // Espelha tagReparo/tagExpirado de MeusInteressesScreen.js:314, em tokens do tema em vez
  // dos hex de lá. marginBottom 14 é o mesmo respiro que obraLocal já usa acima da tarja.
  tagObra: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 14 },
  // textoMedio, não textoFraco: #444 sobre o #1A1A1A da tarja dá ~1.6:1, ilegível para a
  // única linha que diz que a obra acabou. #888 sobe para ~4.9:1. Igual em
  // MeusInteressesScreen.js:315.
  tagObraTexto: { fontSize: 10, color: cores.textoMedio, fontWeight: '500' },
  tagExpirada: { backgroundColor: cores.perigoSuave, borderColor: cores.perigo + '55' },
  tagExpiradaTexto: { fontSize: 11, color: cores.perigo, fontWeight: '700' },
  avisoParaeo: { fontSize: 12, lineHeight: 16, marginBottom: 14 },
  infoRow: { flexDirection: 'row', gap: 8 },
  infoItem: { flex: 1, backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 10, alignItems: 'center' },
  infoLabel: { fontSize: 10, color: cores.textoFraco, marginBottom: 3 },
  infoValor: { fontSize: 12, fontWeight: '600', color: cores.textoForte, textAlign: 'center', textTransform: 'capitalize' },
  contratoBox: { backgroundColor: cores.sucessoSuave, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  contratoTexto: { fontSize: 13, color: cores.sucesso, fontWeight: '600', marginBottom: 2 },
  contratoSub: { fontSize: 11, color: cores.sucesso, opacity: 0.8 },
  alertaBanner: { backgroundColor: '#3a2a1a', borderWidth: 1, borderColor: '#FF6B3544', borderRadius: raios.medio, padding: 10, marginBottom: 12 },
  alertaTexto: { fontSize: 12, color: '#FF6B35', textAlign: 'center' },
  btnVer: { backgroundColor: cores.primaria, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnVerTexto: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  recusadoAviso: { marginTop: 12, backgroundColor: cores.perigoSuave, borderRadius: raios.medio, padding: 10, alignItems: 'center' },
  recusadoAvisoTexto: { fontSize: 12, color: cores.perigo },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone: { fontSize: 36, marginBottom: 16 },
  vazioTitulo: { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub: { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
})