import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { comRetry, recarregarSeFalhaDeRede } from '../../utils/rede'
import { excluirPedido, ehMatchAtivo } from '../../utils/excluirPedido'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'
import { distanciaItemKm, formatarDistancia, useCoordsUsuario } from '../../utils/distancia'
import { categoriasDe, emojiReparo } from '../../utils/categorias'
import { marcarTemObras } from '../../utils/temObras'
import { softAskRef } from '../../components/SoftAskNotificacao'
import BannerErroCarregamento from '../../components/BannerErroCarregamento'
import EtiquetaTipo from '../../components/EtiquetaTipo'
import BannerComoFunciona from '../../components/BannerComoFunciona'
import { textoFasePosMatch } from '../../components/Agendamento'
import { SheetProfissionalDesistiu, primeiraDesistenciaNaoVista, gravarDesistenciaVista } from '../../components/ProfissionalDesistiu'

// "Meus pedidos" (Arte-Fase1-Contratar): os serviços E as obras da pessoa numa lista só, do
// mais novo para o mais antigo, cada card com a etiqueta pequena "Serviço" / "Obra". É a
// lista do dono de sempre (era a MinhasObrasScreen, com um seletor Obras/Serviços): as MESMAS
// duas consultas (GET /obras/minhas e /reparos/minhas — a API já devolve os pedidos da
// pessoa, de qualquer conta contratante do mesmo CPF), os mesmos cards, a mesma exclusão e a
// mesma folha "Profissional desistiu". Só deixou de haver dois lados: o toque abre
// DetalheReparo ou DetalheObra conforme o tipo do card.
//
// Segmentos: "Em aberto" (as ativas) e "Histórico" (expiradas/canceladas — as encerradas
// vivem na aba "Finalizados"). MeusPedidosConteudo é exportado para a Galeria.

const statusInfo = {
  pendente:  { cor: '#E8833A', label: '⏳ Aguardando aprovação' },
  aprovada:  { cor: '#4caf50', label: '✅ Aprovada' },
  recusada:  { cor: '#f44336', label: '❌ Recusada' },
  aberta:    { cor: '#4caf50', label: '✅ Publicada' },
  encerrada: { cor: '#4caf50', label: '✅ Concluído com sucesso' },
  cancelada: { cor: '#f44336', label: '❌ Cancelada' },
}

// Junta as duas listas num só fluxo, marcando o tipo de cada linha, do mais novo para o mais
// antigo. As duas respostas já vêm por criado_em DESC; aqui só se intercalam. Data ilegível
// vai para o fim, sem derrubar a ordenação. `chave` distingue um serviço e uma obra com o
// mesmo id (são tabelas diferentes).
export const juntarPedidos = (reparos, obras) => {
  const quando = (x) => { const t = new Date(x?.criado_em).getTime(); return Number.isFinite(t) ? t : 0 }
  return [
    ...(reparos || []).map((item) => ({ tipo: 'reparo', item, chave: `reparo:${item.id}` })),
    ...(obras || []).map((item) => ({ tipo: 'obra', item, chave: `obra:${item.id}` })),
  ].sort((a, b) => quando(b.item) - quando(a.item))
}


function CardPedido({ tipo, item, coords, onAbrir, onExcluir }) {
  const ehObra = tipo === 'obra'
  const eEncerrado = item.status === 'encerrada'
  // Expiração vem PRONTA do servidor (relógio do banco). Comparar expira_em com o
  // relógio do aparelho fazia a lista discordar do servidor quando a hora local estava
  // adiantada/atrasada — o mesmo item aparecia expirado aqui e ativo lá.
  const eExpirado  = !eEncerrado && item.status === 'aberta' && item.expirada
  const info       = eEncerrado || eExpirado
    ? null
    : (statusInfo[item.status_aprovacao] || statusInfo[item.status] || statusInfo.pendente)
  const temMatch   = item.match_feito_em && item.match_usuario_id
  const dist       = distanciaItemKm(coords, item)
  const emoji      = ehObra ? '🏗️' : emojiReparo(categoriasDe(item)[0] || item.categoria)

  return (
    <TouchableOpacity style={estilos.card} onPress={() => onAbrir(tipo, item)} activeOpacity={0.85}>
      <View style={estilos.cardTopo}>
        <View style={estilos.cardIcone}><Text style={estilos.cardIconeTexto}>{emoji}</Text></View>
        <View style={{ flex: 1 }}>
          <View style={estilos.cardTituloLinha}>
            <Text style={estilos.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
            <EtiquetaTipo tipo={tipo} />
          </View>
          <Text style={estilos.cardLocal}>
            📍 {item.cidade}{item.uf ? `, ${item.uf}` : ''}
            {dist != null && <Text style={estilos.cardDistancia}>{`  ·  ${formatarDistancia(dist)}`}</Text>}
          </Text>
        </View>
        <Text style={estilos.cardValor}>
          R$ {Number(item.valor || item.valor_estimado || 0).toLocaleString('pt-BR')}
        </Text>
      </View>

      {(eEncerrado || eExpirado) && (
        <View style={[estilos.tagHistorico, eEncerrado ? estilos.tagEncerrado : estilos.tagExpirado]}>
          <Text style={[estilos.tagHistoricoTexto, { color: eEncerrado ? '#4caf50' : '#f44336' }]}>
            {eEncerrado
              ? (ehObra ? '🔒 Obra encerrada' : '🔒 Serviço encerrado')
              : (ehObra ? '⏰ OBRA EXPIRADA' : '⏰ SERVIÇO EXPIRADO')}
          </Text>
        </View>
      )}

      {temMatch && (
        <View style={estilos.matchBadge}>
          {/* Antes do "Estou a caminho" (a_caminho_em) a linha segue a fase do agendamento
              (components/Agendamento: sem proposta, proposta pendente, agendado); o texto
              antigo só vale depois dele. */}
          <Text style={estilos.matchBadgeTexto}>
            {textoFasePosMatch(item, true) ?? '⏱ Profissional a caminho — toque para ver'}
          </Text>
        </View>
      )}

      {item.valor_acordado != null && (
        <View style={estilos.acordadoBadge}>
          <Text style={estilos.acordadoTexto}>
            🤝 Valor acordado: R$ {Number(item.valor_acordado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {info ? (
          <View style={[estilos.statusPill, { borderColor: info.cor }]}>
            <Text style={[estilos.statusTexto, { color: info.cor }]}>{info.label}</Text>
          </View>
        ) : (
          <View />
        )}
        <TouchableOpacity
          onPress={() => onExcluir(item, tipo)}
          style={estilos.btnLixeira}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={ehObra ? 'Excluir obra' : 'Excluir serviço'}
        >
          <Text style={{ fontSize: 16 }}>🗑️</Text>
        </TouchableOpacity>
      </View>

      {Number(item.total_interessados) > 0 && (
        <Text style={estilos.interessados}>
          {ehObra ? '👷' : '🔧'} {item.total_interessados} profissional(is) interessado(s)
        </Text>
      )}
    </TouchableOpacity>
  )
}

// Miolo da tela: título, segmentos e a lista (ou o vazio). A tela é dona dos dados e das
// ações; a Galeria passa listas locais e handlers no-op. `acimaDosSegmentos`: o banner
// "Como funciona" da tela; `erro`: o banner de falha, irmão do vazio (lista vazia POR FALHA
// mostra os dois); `atualizacao`: o RefreshControl da tela (a Galeria não passa).
export function MeusPedidosConteudo({ abertos, historico, secao, onSecao, carregando, coords, onAbrir, onExcluir, acimaDosSegmentos, erro, atualizacao }) {
  const dados = secao === 'ativos' ? abertos : historico
  return (
    <>
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Meus pedidos</Text>
      </View>

      {acimaDosSegmentos}

      <View style={estilos.segmentos} accessibilityRole="tablist">
        <TouchableOpacity
          style={[estilos.segmento, secao === 'ativos' && estilos.segmentoAtivo]}
          onPress={() => onSecao('ativos')}
          accessibilityRole="tab"
          accessibilityState={{ selected: secao === 'ativos' }}
        >
          <Text style={[estilos.segmentoTexto, secao === 'ativos' && estilos.segmentoTextoAtivo]}>
            Em aberto ({abertos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[estilos.segmento, secao === 'historico' && estilos.segmentoAtivo]}
          onPress={() => onSecao('historico')}
          accessibilityRole="tab"
          accessibilityState={{ selected: secao === 'historico' }}
        >
          <Text style={[estilos.segmentoTexto, secao === 'historico' && estilos.segmentoTextoAtivo]}>Histórico</Text>
        </TouchableOpacity>
      </View>

      {erro}

      {carregando ? (
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      ) : dados.length === 0 ? (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioIcone}>📋</Text>
          <Text style={estilos.vazioTitulo}>
            {secao === 'ativos' ? 'Nenhum pedido em aberto' : 'Nenhum histórico ainda'}
          </Text>
          <Text style={estilos.vazioSub}>
            {secao === 'ativos'
              ? 'Publique o seu primeiro pedido na aba "Novo pedido".'
              : 'Pedidos expirados aparecerão aqui. Os concluídos ficam na aba "Finalizados".'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={dados}
          keyExtractor={(p) => p.chave}
          contentContainerStyle={[estilos.lista, larguraMaxima]}
          showsVerticalScrollIndicator={false}
          refreshControl={atualizacao}
          renderItem={({ item: p }) => <CardPedido tipo={p.tipo} item={p.item} coords={coords} onAbrir={onAbrir} onExcluir={onExcluir} />}
        />
      )}
    </>
  )
}

export default function MeusPedidosScreen({ navigation }) {
  const { usuario } = useAuth()

  const [obras,           setObras]           = useState([])
  const [reparos,         setReparos]         = useState([])
  const [obrasHistorico,  setObrasHistorico]  = useState([])
  const [reparosHistorico,setReparosHistorico]= useState([])
  const [carregando,  setCarregando]  = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [secao, setSecao] = useState('ativos')
  const [erro, setErro] = useState(null)
  const [coords] = useCoordsUsuario()
  // Arte-Profissional-Desistiu na home do dono: depois de cada carga das listas, a desistência
  // mais recente ainda não vista (desistencia_recente nas linhas sem match, mesma chave local
  // do detalhe) abre a MESMA folha do detalhe, uma vez. { frente, demanda, desistencia } | null.
  const [desistenciaHome, setDesistenciaHome] = useState(null)

  // Núcleo da recarga: relê as duas listas e repõe o estado, PROPAGANDO a falha. É disso
  // que recarregarSeFalhaDeRede precisa para distinguir "recarreguei" de "nem isso
  // consegui" (ver rede.js) — mesmo molde do recarregarPerfil em EditarPerfilScreen.
  const recarregarDados = async () => {
    const [obrasResp, reparosResp] = await Promise.all([
      comRetry(() => api.get('/obras/minhas')),
      comRetry(() => api.get('/reparos/minhas')),
    ])
    // Corpo VAZIO (304) chega como string: `''.obras || []` esvaziaria as listas e a tela
    // ficaria "sem nada" por cima de dados corretos. Mesma guarda por TIPO das telas de
    // detalhe. Basta uma das duas respostas vir vazia para não mexer em nada — as listas
    // são repostas juntas, e repor metade deixaria a tela num estado que não existe.
    if (!obrasResp || typeof obrasResp !== 'object') return
    if (!reparosResp || typeof reparosResp !== 'object') return
    setObras(obrasResp.obras || [])
    // Itens encerrados saem do Histórico e passam a viver na aba "Finalizados";
    // o Histórico fica apenas com expirados/cancelados/não concluídos.
    setObrasHistorico((obrasResp.historico || []).filter(o => o.status !== 'encerrada'))
    setReparos(reparosResp.reparos || [])
    setReparosHistorico((reparosResp.historico || []).filter(r => r.status !== 'encerrada'))
    // Alguma obra na lista (ativa ou no histórico): a pessoa TEM obra, então a aba Mensagens
    // existe (utils/temObras). Só marca que tem — lista sem obra não prova que não há
    // (as canceladas não vêm aqui), e isso quem diz é GET /auth/contas.
    if ((obrasResp.obras || []).length > 0 || (obrasResp.historico || []).length > 0) marcarTemObras(usuario?.id)
    // Só as ativas: no histórico (expirado) não há mais quem escolher.
    primeiraDesistenciaNaoVista([
      ...(reparosResp.reparos || []).map(d => ({ frente: 'reparo', demanda: d })),
      ...(obrasResp.obras || []).map(d => ({ frente: 'obra', demanda: d })),
    ]).then((achada) => { if (achada) setDesistenciaHome(achada) })
  }

  // Os dois botões (e o toque fora / voltar) marcam como vista; "Ver interessados" abre o
  // detalhe já rolado até a lista (rolarAteInteressados é lido pelas telas de detalhe).
  const fecharDesistenciaHome = () => {
    if (!desistenciaHome) return
    gravarDesistenciaVista(desistenciaHome.frente, desistenciaHome.demanda.id, desistenciaHome.desistencia.id)
    setDesistenciaHome(null)
  }
  const verInteressadosDesistencia = () => {
    if (!desistenciaHome) return
    const { frente, demanda } = desistenciaHome
    fecharDesistenciaHome()
    if (frente === 'obra') navigation.navigate('DetalheObra', { obra: demanda, rolarAteInteressados: true })
    else navigation.navigate('DetalheReparo', { reparo: demanda, rolarAteInteressados: true })
  }

  // Recarga SILENCIOSA: a do foco e a do pull-to-refresh. Engole a falha de propósito, e
  // é por engolir que ela NÃO serve para recarregarSeFalhaDeRede.
  const buscarDados = async () => {
    try {
      await recarregarDados()
      setErro(null)
    } catch (err) {
      console.log('[MeusPedidos] erro ao buscar dados:', err)
      setErro(err.mensagem || 'Não foi possível carregar seus pedidos.')
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscarDados() }, []))

  // Soft-ask de notificação no momento de relevância do dono: ver a própria lista de
  // pedidos. Espelha os feeds do profissional (FeedObrasScreen/FeedReparosScreen) —
  // mostrar() faz o próprio check ao vivo e respeita teto e intervalo, então chamar a
  // cada foco é ok. Variante 'dono': a lista tem serviços e obras.
  useFocusEffect(useCallback(() => {
    softAskRef.mostrar?.('dono')
  }, []))

  const onRefresh = () => { setAtualizando(true); buscarDados() }

  const deletarItem = async (item, tipo) => {
    const jaPublicado = item.status === 'aberta' || item.status_aprovacao === 'aprovada'
    const aviso = jaPublicado
      ? `⚠️ ATENÇÃO: ${tipo === 'obra' ? 'Esta obra' : 'Este serviço'} já foi publicado e profissionais podem estar interessados.\n\nAo excluir, eles perderão o acesso e poderá haver insatisfação.\n\nTem certeza que deseja excluir?`
      : `Deseja excluir "${item.titulo}"?`

    Alert.alert('Excluir', aviso, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive', onPress: async () => {
          try {
            // Chamada única (utils/excluirPedido): a mesma do "🗑️ Cancelar pedido" do detalhe.
            await excluirPedido(tipo, item.id)
            if (tipo === 'obra') {
              setObras(prev => prev.filter(o => o.id !== item.id))
              setObrasHistorico(prev => prev.filter(o => o.id !== item.id))
            } else {
              setReparos(prev => prev.filter(r => r.id !== item.id))
              setReparosHistorico(prev => prev.filter(r => r.id !== item.id))
            }
          } catch (err) {
            console.log('[MeusPedidos] falha ao excluir item | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
            // 409 MATCH_ATIVO: há profissional escolhido — a mensagem do servidor diz o caminho
            // ("Cancelar serviço" na tela do pedido). Mesmo alerta de erro, com o texto dele.
            if (ehMatchAtivo(err)) { Alert.alert('Erro', err.mensagem || 'Já existe um profissional escolhido.'); return }
            // Rede pura → recarrega em vez de alertar. A lista É o resultado da ação: se
            // o DELETE não chegou, o item reaparece; se chegou e só a resposta se perdeu,
            // ele some. Nos dois casos a tela responde sozinha se a exclusão valeu.
            if (await recarregarSeFalhaDeRede(err, recarregarDados)) return
            Alert.alert('Erro', err.mensagem || 'Não foi possível excluir.')
          }
        }
      }
    ])
  }

  const abrir = (tipo, item) => {
    if (tipo === 'obra') navigation.navigate('DetalheObra',  { obra: item })
    else                 navigation.navigate('DetalheReparo', { reparo: item })
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      {/* Arte-Profissional-Desistiu: a mesma folha do detalhe, na home do dono. */}
      <SheetProfissionalDesistiu
        visivel={!!desistenciaHome}
        desistencia={desistenciaHome?.desistencia}
        titulo={desistenciaHome?.demanda?.titulo}
        frente={desistenciaHome?.frente === 'obra' ? 'obra' : 'servico'}
        interessadosAtivos={desistenciaHome?.frente === 'obra' ? desistenciaHome?.demanda?.candidaturas_pendentes : desistenciaHome?.demanda?.interesses_pendentes}
        onVerInteressados={verInteressadosDesistencia}
        onEsperar={fecharDesistenciaHome}
      />
      <MeusPedidosConteudo
        abertos={juntarPedidos(reparos, obras)}
        historico={juntarPedidos(reparosHistorico, obrasHistorico)}
        secao={secao}
        onSecao={setSecao}
        carregando={carregando}
        coords={coords}
        onAbrir={abrir}
        onExcluir={deletarItem}
        acimaDosSegmentos={<BannerComoFunciona navigation={navigation} />}
        erro={<BannerErroCarregamento mensagem={erro} onRetry={buscarDados} />}
        atualizacao={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container:            { flex: 1, backgroundColor: cores.fundo },
  header:               { paddingHorizontal: espacos.tela, paddingTop: 16, paddingBottom: 12 },
  // Título laranja da arte, no mesmo tom e peso do título das telas de cadastro.
  titulo:               { fontSize: 28, fontWeight: '900', color: '#E08A44', letterSpacing: -0.5, lineHeight: 34 },
  segmentos:            { flexDirection: 'row', paddingHorizontal: espacos.tela, gap: 8, marginBottom: 12 },
  segmento:             { flex: 1, paddingVertical: 10, borderRadius: raios.medio, backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, alignItems: 'center' },
  segmentoAtivo:        { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
  segmentoTexto:        { fontSize: 13, color: cores.textoMedio, fontWeight: '600' },
  segmentoTextoAtivo:   { color: cores.textoForte, fontWeight: '700' },
  lista:                { paddingHorizontal: espacos.tela, paddingBottom: 32 + alturas.barraServico, gap: 12 },
  vazio:                { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioIcone:           { fontSize: 48, marginBottom: 16 },
  vazioTitulo:          { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub:             { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
  card:                 { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 16 },
  cardTopo:             { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  cardIcone:            { width: 40, height: 40, borderRadius: 10, backgroundColor: cores.fundoElevado, alignItems: 'center', justifyContent: 'center' },
  cardIconeTexto:       { fontSize: 20 },
  cardTituloLinha:      { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  cardTitulo:           { flexShrink: 1, fontSize: 14, fontWeight: '600', color: cores.textoForte, lineHeight: 20 },
  cardValor:            { fontSize: 14, fontWeight: '700', color: cores.sucesso },
  cardLocal:            { fontSize: 12, color: cores.textoFraco },
  cardDistancia:        { color: cores.primaria, fontWeight: '600' },
  tagHistorico:         { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8, borderWidth: 0.5 },
  tagEncerrado:         { backgroundColor: '#0a1a0a', borderColor: '#2a4a2a' },
  tagExpirado:          { backgroundColor: '#1a1a1a', borderColor: '#333' },
  tagHistoricoTexto:    { fontSize: 10, fontWeight: '600' },
  matchBadge:           { backgroundColor: '#1a1a2a', borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.medio, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  matchBadgeTexto:      { fontSize: 11, color: cores.primaria, fontWeight: '600', textAlign: 'center' },
  acordadoBadge:        { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.medio, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  acordadoTexto:        { fontSize: 12, color: '#4caf50', fontWeight: '700', textAlign: 'center' },
  statusPill:           { alignSelf: 'flex-start', borderWidth: 0.5, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  statusTexto:          { fontSize: 11, fontWeight: '500' },
  btnLixeira:           { padding: 6, borderRadius: 8, backgroundColor: '#3a1a1a' },
  interessados:         { fontSize: 11, color: cores.textoMutado, marginTop: 6 },
})
