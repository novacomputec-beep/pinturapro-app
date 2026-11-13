import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, Image, StyleSheet, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import useArrastarParaFechar, { ZonaArraste, RaizGestosFolha } from '../hooks/useArrastarParaFechar'
import BotaoFecharFolha from './BotaoFecharFolha'
import { avatar } from '../utils/imagemOtimizada'

// Arte-Profissional-Desistiu (dono de serviço e de obra): o profissional ESCOLHIDO cancelou
// depois do match e o pedido voltou a ficar aberto. GET /reparos/:id e GET /obras/:id devolvem
// ao dono, ao lado da linha, `desistencias` (utils/desistencias da API: id do interesse /
// candidatura, usuario_id, primeiro nome, foto_url, cancelado_em, motivo, motivo_texto em
// 3ª pessoa, detalhe, acordo — mais recente primeiro) e `interessados_ativos` (quantos ainda
// estão na disputa: 'pendente' ou 'contraproposta_dono').
//
// Três peças, todas só de desenho:
//   1. SheetProfissionalDesistiu — folha que aparece UMA vez por desistência (marca local por
//      frente + demanda + id do interesse, AsyncStorage) quando o dono abre o pedido: avatar
//      com ✕ vermelho, "<Nome> desistiu do serviço", título do pedido e quando, o motivo, as
//      três linhas do que acontece agora e os dois botões (ver interessados / esperar).
//   2. CardDesistiu — caixa âmbar no topo do detalhe enquanto NÃO há profissional escolhido.
//   3. SecaoQuemDesistiu — bloco tracejado e apagado abaixo da lista de interessados, um por
//      desistente com a etiqueta vermelha "desistiu".
// As telas decidem quando cada peça vale (dono, pedido aberto, sem match) e tiram da lista
// principal os interesses que estão em `desistencias` (mesmo id), para ninguém sair duas vezes.

const p2 = (n) => String(n).padStart(2, '0')
const iniciaisDe = (nome) =>
  (nome || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || null

// A mais recente — a API já ordena por cancelado_em DESC, mas a tela não depende disso.
export const desistenciaMaisRecente = (desistencias) => {
  if (!Array.isArray(desistencias) || desistencias.length === 0) return null
  const t = (d) => { const ms = new Date(d?.cancelado_em).getTime(); return Number.isFinite(ms) ? ms : -Infinity }
  return desistencias.reduce((melhor, d) => (d && (!melhor || t(d) > t(melhor)) ? d : melhor), null)
}

// "hoje às 14:05" · "ontem às 14:05" · "29/10 às 14:05"; data ilegível → null.
export const quandoDesistiu = (iso, agoraMs = Date.now()) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hora = `${p2(d.getHours())}:${p2(d.getMinutes())}`
  const chave = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  const hoje = new Date(agoraMs)
  if (chave(d) === chave(hoje)) return `hoje às ${hora}`
  if (chave(d) === chave(new Date(agoraMs - 86400000))) return `ontem às ${hora}`
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} às ${hora}`
}
// Versão curta para o card: "às 14:05" no mesmo dia, senão a data junto.
export const horaDesistiu = (iso, agoraMs = Date.now()) => {
  const q = quandoDesistiu(iso, agoraMs)
  return q ? q.replace(/^hoje /, '') : null
}

// Motivo pronto para ler: o rótulo da API (3ª pessoa) e, quando houver, o detalhe escrito.
export const textoMotivo = (d) => {
  const rotulo = d?.motivo_texto || 'Outro motivo'
  const detalhe = String(d?.detalhe || '').trim()
  return detalhe ? `${rotulo} — ${detalhe}` : rotulo
}

// Arte-Profissional-Saiu (11/11/2026): o profissional escolhido EXCLUIU A CONTA
// (cancelamentoMatchService.desfazerMatchesPorExclusao da API, motivo 'conta_excluida'). Não é
// uma desistência dele neste pedido: o título vira "<Nome> saiu do ProTudo" na folha, no card e
// na linha de "QUEM DESISTIU"; motivo, linhas, botões e cores seguem iguais.
export const MOTIVO_CONTA_EXCLUIDA = 'conta_excluida'
export const saiuDoApp = (d) => d?.motivo === MOTIVO_CONTA_EXCLUIDA
// Título da folha/card/linha para uma desistência: "<Nome> saiu do ProTudo" ou "<Nome> desistiu
// do serviço / da obra".
export const tituloDesistencia = (d, frente = 'servico', nomePadrao = 'O profissional') => {
  const nome = d?.nome || nomePadrao
  if (saiuDoApp(d)) return `${nome} saiu do ProTudo`
  return `${nome} desistiu ${frente === 'obra' ? 'da obra' : 'do serviço'}`
}

// Desistência SINTÉTICA a partir do toque no push match_cancelado { motivo: 'conta_excluida' }
// (AppNavigator → route.params.desistenciaPush): a API apaga a proposta e a conta do profissional
// na mesma transação, então o detalhe volta SEM esta desistência em `desistencias` — sem isto o
// dono abria o pedido reaberto e nada explicava por quê. Sem nome (a conta não existe mais),
// hora = a do toque, id próprio por push (a marca "vista" vale para este toque).
export const TEXTO_MOTIVO_CONTA_EXCLUIDA = 'Excluiu a conta no ProTudo'
export const desistenciaDoPush = (desistenciaPush) => {
  if (!desistenciaPush || desistenciaPush.motivo !== MOTIVO_CONTA_EXCLUIDA) return null
  return {
    id: `push:${MOTIVO_CONTA_EXCLUIDA}:${desistenciaPush.chave || desistenciaPush.cancelado_em || 'x'}`,
    usuario_id: null, nome: null, foto_url: null,
    cancelado_em: desistenciaPush.cancelado_em || new Date().toISOString(),
    motivo: MOTIVO_CONTA_EXCLUIDA, motivo_texto: TEXTO_MOTIVO_CONTA_EXCLUIDA, detalhe: null, acordo: false,
    doPush: true,
  }
}

// "ainda há 2 interessados esperando a sua escolha" / "aguardando novos interessados".
export const linhaInteressados = (interessadosAtivos) => {
  const n = Number(interessadosAtivos) || 0
  if (n <= 0) return 'aguardando novos interessados'
  return `ainda há ${n} ${n === 1 ? 'interessado esperando' : 'interessados esperando'} a sua escolha`
}

// Marca local "já vi esta desistência", por frente + demanda + id do interesse. null = ainda
// não li (não mostra nada), true = pendente de ver, false = já vista. A gravação é
// best-effort, como a dica de avisados: falhar só faz a folha voltar uma vez.
const CHAVE = 'desistencia_vista'
export const chaveDesistenciaVista = (frente, demandaId, desistenciaId) => `${CHAVE}:${frente}:${demandaId}:${desistenciaId}`
export const gravarDesistenciaVista = (frente, demandaId, desistenciaId) => {
  if (demandaId == null || desistenciaId == null) return
  AsyncStorage.setItem(chaveDesistenciaVista(frente, demandaId, desistenciaId), '1').catch(() => {})
}

export const useDesistenciaNaoVista = (frente, demandaId, desistencia) => {
  const id = desistencia?.id ?? null
  const [pendente, setPendente] = useState(null)
  useEffect(() => {
    let vivo = true
    setPendente(null)
    if (id == null || demandaId == null) return undefined
    AsyncStorage.getItem(chaveDesistenciaVista(frente, demandaId, id))
      .then((raw) => { if (vivo) setPendente(raw !== '1') })
      .catch(() => { if (vivo) setPendente(false) })
    return () => { vivo = false }
  }, [frente, demandaId, id])
  const marcarVista = useCallback(() => {
    setPendente(false)
    gravarDesistenciaVista(frente, demandaId, id)
  }, [frente, demandaId, id])
  return [pendente === true, marcarVista]
}

// Lista do dono (MinhasObrasScreen): /reparos/minhas e /obras/minhas trazem em cada linha SEM
// match `desistencia_recente` ({ id, nome, foto_url, cancelado_em, motivo_texto, acordo } —
// utils/desistencias da API). Recebe [{ frente, demanda }] e devolve a desistência mais recente
// que ainda não foi vista neste aparelho (mesma chave do detalhe), ou null. multiGet numa
// leitura só; falha de leitura = nada a mostrar (nunca uma folha repetida por engano).
export const primeiraDesistenciaNaoVista = async (itens) => {
  const candidatos = (itens || [])
    .filter(({ demanda }) => demanda && demanda.id != null && !demanda.match_usuario_id && demanda.desistencia_recente?.id != null)
    .map(({ frente, demanda }) => ({ frente, demanda, desistencia: demanda.desistencia_recente, chave: chaveDesistenciaVista(frente, demanda.id, demanda.desistencia_recente.id) }))
  if (candidatos.length === 0) return null
  let pares
  try { pares = await AsyncStorage.multiGet(candidatos.map(c => c.chave)) } catch (e) { return null }
  const vistas = new Set(pares.filter(([, v]) => v === '1').map(([k]) => k))
  const naoVistas = candidatos.filter(c => !vistas.has(c.chave))
  if (naoVistas.length === 0) return null
  const t = (c) => { const ms = new Date(c.desistencia?.cancelado_em).getTime(); return Number.isFinite(ms) ? ms : -Infinity }
  return naoVistas.reduce((melhor, c) => (!melhor || t(c) > t(melhor) ? c : melhor), null)
}

const AvatarDesistente = ({ d, tamanho = 56, comX = true }) => {
  const iniciais = iniciaisDe(d?.nome)
  const r = tamanho / 2
  return (
    <View style={{ width: tamanho, height: tamanho }}>
      {d?.foto_url ? (
        <Image source={{ uri: avatar(d.foto_url) }} style={{ width: tamanho, height: tamanho, borderRadius: r }} />
      ) : (
        <View style={[estilos.avatarVazio, { width: tamanho, height: tamanho, borderRadius: r }]}>
          <Text style={[estilos.avatarIniciais, { fontSize: tamanho * 0.32 }]}>{iniciais || '👷'}</Text>
        </View>
      )}
      {comX && (
        <View style={estilos.xBadge}>
          <Text style={estilos.xBadgeTexto}>✕</Text>
        </View>
      )}
    </View>
  )
}

const Linha = ({ icone, children }) => (
  <View style={estilos.linha}>
    <Text style={estilos.linhaIcone}>{icone}</Text>
    <Text style={estilos.linhaTexto}>{children}</Text>
  </View>
)

// visivel: a tela decide (dono, sem escolhido, desistência ainda não vista). desistencia: o
// item da API. titulo: o do pedido. frente: 'servico' | 'obra' (só muda "do serviço"/"da obra").
// interessadosAtivos: interessados_ativos da API. onVerInteressados: fecha e rola até a lista.
// onEsperar: fecha (também o toque fora, o voltar do Android e o arraste para baixo na
// alça/cabeçalho — useArrastarParaFechar). Os dois marcam como vista.
export function SheetProfissionalDesistiu({ visivel, desistencia, titulo, frente = 'servico', interessadosAtivos, onVerInteressados, onEsperar }) {
  const insets = useSafeAreaInsets()
  const { gesto, estiloArraste, medirFolha } = useArrastarParaFechar(onEsperar, !!visivel)
  const d = desistencia || {}
  const quando = quandoDesistiu(d.cancelado_em)
  const sub = [titulo ? `"${titulo}"` : null, quando].filter(Boolean).join(' · ')
  return (
    <Modal visible={!!visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={onEsperar}>
      <RaizGestosFolha>
      <View style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onEsperar} accessibilityRole="button" accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.sheet, { paddingBottom: insets.bottom + 20 }, estiloArraste]} onLayout={medirFolha}>
          {/* Alça + cabeçalho fora do ScrollView: é a zona do arraste; o resto rola como antes. */}
          <ZonaArraste gesto={gesto}>
            <View style={estilos.alca} />
            <View style={estilos.cabecalho}>
              <AvatarDesistente d={d} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={estilos.titulo}>{tituloDesistencia(d, frente)}</Text>
                {sub ? <Text style={estilos.subtitulo} numberOfLines={2}>{sub}</Text> : null}
              </View>
              {/* "✕ Fechar" no fim da linha do cabeçalho: o mesmo onEsperar do toque fora. */}
              <BotaoFecharFolha onPress={onEsperar} />
            </View>
          </ZonaArraste>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={estilos.motivoBox}>
              <Text style={estilos.motivoRotulo}>MOTIVO</Text>
              <Text style={estilos.motivoTexto}>{textoMotivo(d)}{d.acordo ? ' · de comum acordo' : ''}</Text>
            </View>

            <Linha icone="🔓">Seu pedido voltou a ficar aberto.</Linha>
            <Linha icone="👥">{linhaInteressados(interessadosAtivos).replace(/^./, (c) => c.toUpperCase())}.</Linha>
            <Linha icone="🔔">Novos profissionais continuam sendo avisados.</Linha>

            <TouchableOpacity style={estilos.btnLaranja} onPress={onVerInteressados} activeOpacity={0.85} accessibilityRole="button">
              <Text style={estilos.btnLaranjaTexto}>Ver interessados e escolher outro</Text>
            </TouchableOpacity>
            <TouchableOpacity style={estilos.btnContorno} onPress={onEsperar} activeOpacity={0.85} accessibilityRole="button">
              <Text style={estilos.btnContornoTexto}>Entendi, vou esperar</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
      </RaizGestosFolha>
    </Modal>
  )
}

// Caixa âmbar no topo do detalhe, enquanto não há profissional escolhido.
export function CardDesistiu({ desistencia, estilo, frente }) {
  const d = desistencia || {}
  const nome = d.nome || 'O profissional'
  const hora = horaDesistiu(d.cancelado_em)
  // Arte-Profissional-Saiu: "<Nome> saiu do ProTudo"; senão o "<Nome> desistiu" curto de sempre.
  const titulo = saiuDoApp(d) ? tituloDesistencia(d, frente) : `${nome} desistiu`
  return (
    <View style={[estilos.card, estilo]}>
      <Text style={estilos.cardTitulo}>⚠️ {titulo}{hora ? ` ${hora}` : ''}</Text>
      <Text style={estilos.cardTexto}>
        <Text style={estilos.cardForte}>Motivo: </Text>{textoMotivo(d)}. Seu pedido voltou a ficar aberto. Escolha outro interessado abaixo ou aguarde novos.
      </Text>
    </View>
  )
}

// Bloco tracejado e apagado abaixo da lista: quem já foi escolhido e saiu.
export function SecaoQuemDesistiu({ desistencias, estilo, frente }) {
  const lista = Array.isArray(desistencias) ? desistencias.filter(Boolean) : []
  if (lista.length === 0) return null
  return (
    <View style={[estilos.secao, estilo]}>
      <Text style={estilos.secaoTitulo}>QUEM DESISTIU</Text>
      {lista.map((d, i) => (
        <View key={d.id ?? i} style={[estilos.desistenteLinha, i === lista.length - 1 && { marginBottom: 0 }]}>
          <AvatarDesistente d={d} tamanho={36} comX={false} />
          <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
            <View style={estilos.desistenteTopo}>
              {/* Arte-Profissional-Saiu: "<Nome> saiu do ProTudo" no lugar do nome sozinho. */}
              <Text style={estilos.desistenteNome} numberOfLines={1}>{saiuDoApp(d) ? tituloDesistencia(d, frente, 'Profissional') : (d.nome || 'Profissional')}</Text>
              <View style={estilos.tag}><Text style={estilos.tagTexto}>desistiu</Text></View>
            </View>
            <Text style={estilos.desistenteMeta} numberOfLines={2}>
              {[quandoDesistiu(d.cancelado_em), textoMotivo(d)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

const AMBAR = '#FFC107'

const estilos = StyleSheet.create({
  // Folha: o mesmo molde das SheetDesfazerEscolha/SheetCancelamento (borda vermelha no topo).
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 3, borderTopColor: cores.perigo, paddingHorizontal: espacos.tela, paddingTop: 12, maxHeight: '92%', ...larguraMaxima },
  alca:            { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 16 },
  cabecalho:       { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  titulo:          { fontSize: 20, fontWeight: '800', color: cores.textoForte, letterSpacing: -0.3, lineHeight: 26 },
  subtitulo:       { fontSize: 13, color: cores.textoMedio, marginTop: 4, lineHeight: 18 },
  avatarVazio:     { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  avatarIniciais:  { color: cores.primaria, fontWeight: '700' },
  xBadge:          { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: cores.perigo, borderWidth: 2, borderColor: cores.fundoCard, alignItems: 'center', justifyContent: 'center' },
  xBadgeTexto:     { color: '#FFFFFF', fontSize: 12, fontWeight: '800', lineHeight: 14, includeFontPadding: false },
  motivoBox:       { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, marginBottom: 14 },
  motivoRotulo:    { fontSize: 10, fontWeight: '700', color: cores.textoMedio, letterSpacing: 0.5, marginBottom: 4 },
  motivoTexto:     { fontSize: 14, color: cores.textoForte, lineHeight: 20 },
  linha:           { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  linhaIcone:      { fontSize: 16, lineHeight: 20, width: 22, textAlign: 'center' },
  linhaTexto:      { flex: 1, fontSize: 13, color: cores.textoForte, lineHeight: 20 },
  btnLaranja:      { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginTop: 10, marginBottom: 10 },
  btnLaranjaTexto: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  btnContorno:     { backgroundColor: 'transparent', borderWidth: 1, borderColor: cores.bordaCampo, borderRadius: raios.medio, padding: 14, alignItems: 'center' },
  btnContornoTexto:{ fontSize: 14, fontWeight: '600', color: cores.textoForte },

  // Card âmbar do topo: mesma caixa da nota "falta menos de 1 dia" da folha de desfazer.
  card:            { backgroundColor: 'rgba(255,193,7,0.10)', borderWidth: 1, borderColor: 'rgba(255,193,7,0.45)', borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  cardTitulo:      { fontSize: 15, fontWeight: '800', color: AMBAR, marginBottom: 6 },
  cardTexto:       { fontSize: 13, color: cores.textoForte, lineHeight: 19 },
  cardForte:       { fontWeight: '700', color: AMBAR },

  // Seção apagada: tracejada, sem fundo, texto médio.
  secao:           { borderWidth: 1, borderStyle: 'dashed', borderColor: cores.bordaCampo, borderRadius: raios.grande, padding: 12, marginTop: 6, marginBottom: 16, opacity: 0.7 },
  secaoTitulo:     { fontSize: 11, fontWeight: '600', color: cores.textoMedio, letterSpacing: 0.5, marginBottom: 10 },
  desistenteLinha: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  desistenteTopo:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  desistenteNome:  { flexShrink: 1, fontSize: 14, fontWeight: '600', color: cores.textoMedio },
  desistenteMeta:  { fontSize: 11, color: cores.textoMedio, marginTop: 2, lineHeight: 15 },
  tag:             { backgroundColor: cores.perigoSuave, borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagTexto:        { fontSize: 10, fontWeight: '700', color: cores.perigo },
})
