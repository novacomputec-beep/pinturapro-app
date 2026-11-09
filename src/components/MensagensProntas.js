import React, { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, Image, TouchableOpacity, Modal, ScrollView, StyleSheet, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useArrastarParaFechar from '../hooks/useArrastarParaFechar'
import api from '../services/api'
import { comRetry } from '../utils/rede'
import { aoPushRecebido } from '../utils/eventosPush'
import { mostrarAviso } from '../utils/deepLink'
import { avatar } from '../utils/imagemOtimizada'
import { cores, raios } from '../utils/tema'

// MENSAGENS PRONTAS — conversa por frases prontas entre o dono e o profissional escolhido, no
// detalhe da demanda dos dois lados (obras e reparos). Sem campo de texto em lugar nenhum:
// quem envia toca numa frase do catálogo, e é o SERVIDOR que grava e envia o texto dela
// (pinturapro-api f2bc6af — services/mensagensProntasService + utils/mensagensProntas).
//
//   GET  /:tabela/:id/mensagens-prontas              → { fase, papel, limite, restantes, frases, historico }
//   POST /:tabela/:id/mensagens-prontas { frase_id } → 201 { mensagem, fase, limite, restantes, frases }
//
// `frases` já vem com `enviada` (esta frase já foi enviada por este lado nesta fase) e
// `historico` com `minha`. `fase` null = não há o que enviar agora (sem profissional escolhido,
// demanda fechada ou chegada confirmada); com histórico, o bloco fica só de leitura; sem fase
// E sem histórico o bloco não aparece (temConversa).
//
// 409 do POST, por `codigo`: FASE_INCORRETA (a fase mudou — a frase era de outra etapa),
// FRASE_REPETIDA, LIMITE_ATINGIDO. Os três viram um toast curto e uma releitura, que repõe os
// chips no estado do servidor. 400 FRASE_INVALIDA não acontece com o catálogo do próprio GET.
//
// Atualização: o push do outro lado chega com data.tipo 'chegada_prevista' + obra_id/reparo_id
// (o mesmo tipo que já abre o detalhe) — o hook relê a conversa quando o id bate. A tela também
// relê quando a fase da demanda muda (chaveFase), porque o catálogo é por fase.

const MFS = 1.15
const T = ({ linhas, ...p }) => <Text numberOfLines={linhas} maxFontSizeMultiplier={MFS} {...p} />

export const ULTIMAS_NA_CAIXA = 3
export const TIPO_PUSH = 'chegada_prevista'

export const temConversa = (dados) => !!(dados?.fase || (Array.isArray(dados?.historico) && dados.historico.length > 0))

const p2 = (n) => String(n).padStart(2, '0')
const horaDe = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = new Date()
  const mesmoDia = d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate()
  const hora = `${p2(d.getHours())}:${p2(d.getMinutes())}`
  return mesmoDia ? hora : `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${hora}`
}
const iniciaisDe = (nome) =>
  (nome || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || null
const primeiroNomeDe = (nome, padrao) => (String(nome || '').trim().split(/\s+/)[0] || padrao)

// ---------------------------------------------------------------------------------------
// Hook: estado da conversa de UMA demanda
// ---------------------------------------------------------------------------------------
// tabela: 'obras' | 'reparos'; demandaId; ativo: false não carrega nem assina nada (fora do
// pós-match); chaveFase: qualquer valor que mude quando a fase da demanda muda (relê).
// Devolve { dados, carregando, enviando, recarregar, enviar }. Erros do GET (403/404/rede)
// deixam `dados` como está (null no primeiro carregamento → bloco escondido).
export const useMensagensProntas = (tabela, demandaId, { ativo = true, chaveFase } = {}) => {
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(null) // frase_id em envio
  const montadoRef = useRef(true)
  const emVooRef = useRef(false)
  const rota = demandaId ? `/${tabela}/${demandaId}/mensagens-prontas` : null

  useEffect(() => { montadoRef.current = true; return () => { montadoRef.current = false } }, [])

  const recarregar = useCallback(async () => {
    if (!rota || !ativo || emVooRef.current) return
    emVooRef.current = true
    setCarregando(true)
    try {
      const resp = await comRetry(() => api.get(rota))
      // 304 chega vazio (api.js): nada mudou, mantém o que está.
      if (resp && typeof resp === 'object' && montadoRef.current) setDados(resp)
    } catch (err) {
      console.log('[MensagensProntas] GET falhou | status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem)
    } finally {
      emVooRef.current = false
      if (montadoRef.current) setCarregando(false)
    }
  }, [rota, ativo])

  // Primeiro carregamento e releitura a cada mudança de fase da demanda.
  useEffect(() => { if (ativo) recarregar() }, [recarregar, chaveFase, ativo])

  // Push do outro lado (data.tipo 'chegada_prevista' + o id desta demanda) → relê.
  useEffect(() => {
    if (!ativo || !demandaId) return undefined
    const chave = tabela === 'obras' ? 'obra_id' : 'reparo_id'
    return aoPushRecebido((data) => {
      if (data?.tipo !== TIPO_PUSH) return
      const alvo = data?.[chave]
      if (alvo != null && String(alvo) === String(demandaId)) recarregar()
    })
  }, [ativo, demandaId, tabela, recarregar])

  const enviar = useCallback(async (fraseId) => {
    if (!rota || enviando) return false
    setEnviando(fraseId)
    try {
      const resp = await comRetry(() => api.post(rota, { frase_id: fraseId }), { timeout: true, persistir: true })
      if (montadoRef.current && resp && typeof resp === 'object') {
        setDados(prev => ({
          ...(prev || {}),
          fase: resp.fase ?? prev?.fase ?? null,
          limite: resp.limite ?? prev?.limite,
          restantes: resp.restantes ?? prev?.restantes,
          frases: Array.isArray(resp.frases) ? resp.frases : (prev?.frases || []),
          historico: resp.mensagem ? [...(prev?.historico || []), resp.mensagem] : (prev?.historico || []),
        }))
      }
      return true
    } catch (err) {
      console.log('[MensagensProntas] POST falhou | status:', err?.status, '| codigo:', err?.codigo, '| msg:', err?.mensagem)
      if (err?.status === 409) {
        const texto = err.codigo === 'FRASE_REPETIDA' ? 'Você já enviou esta mensagem.'
          : err.codigo === 'LIMITE_ATINGIDO' ? (err.mensagem || 'Você já enviou todas as mensagens desta etapa.')
          : (err.mensagem || 'Esta mensagem não vale para o momento atual.')
        mostrarAviso(texto)
      } else if (err?.status === 403) {
        mostrarAviso('Só o cliente e o profissional escolhido podem trocar mensagens aqui.')
      } else {
        mostrarAviso(err?.mensagem || 'Não foi possível enviar a mensagem.')
      }
      // Repõe chips e contador no estado do servidor (a fase pode ter mudado).
      recarregar()
      return false
    } finally {
      if (montadoRef.current) setEnviando(null)
    }
  }, [rota, enviando, recarregar])

  return { dados, carregando, enviando, recarregar, enviar }
}

// ---------------------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------------------

// Uma mensagem: minha à direita (tom laranja), do outro à esquerda (cinza); hora e ✓✓.
const Balao = ({ m }) => (
  <View style={[estilos.balaoLinha, m.minha ? estilos.balaoLinhaMinha : estilos.balaoLinhaOutro]}>
    <View style={[estilos.balao, m.minha ? estilos.balaoMeu : estilos.balaoOutro]}>
      <T linhas={3} style={[estilos.balaoTexto, m.minha && estilos.balaoTextoMeu]}>{m.texto}</T>
      <T style={[estilos.balaoHora, m.minha && estilos.balaoHoraMinha]}>{horaDe(m.enviado_em)}{m.minha ? '  ✓✓' : ''}</T>
    </View>
  </View>
)

// Cabeçalho "Conversa com <nome>": avatar (foto → iniciais), subtítulo fixo.
const Cabecalho = ({ nome, fotoUrl, souDono }) => {
  const iniciais = iniciaisDe(nome)
  return (
    <View style={estilos.cabecalho}>
      {fotoUrl ? (
        <Image source={{ uri: avatar(fotoUrl) }} style={estilos.avatar} />
      ) : (
        <View style={[estilos.avatar, estilos.avatarVazio]}>
          <T style={iniciais ? estilos.avatarIniciais : estilos.avatarEmoji}>{iniciais || (souDono ? '👷' : '🏠')}</T>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T style={estilos.cabecalhoTitulo}>Conversa com {primeiroNomeDe(nome, souDono ? 'o profissional' : 'o cliente')}</T>
        <T style={estilos.cabecalhoSub}>Mensagens prontas · sem digitar</T>
      </View>
    </View>
  )
}

// Folha de baixo com a conversa inteira (só leitura; responder é no bloco).
const FolhaConversa = ({ visivel, onFechar, historico, nome, fotoUrl, souDono }) => {
  const insets = useSafeAreaInsets()
  const { panHandlers, estiloArraste } = useArrastarParaFechar(onFechar, !!visivel)
  const rolagemRef = useRef(null)
  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.folhaFundo}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onFechar} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.folhaCard, { paddingBottom: Math.max(20, insets.bottom + 12) }, estiloArraste]}>
          <View {...panHandlers}>
            <View style={estilos.alca} />
            <View style={estilos.folhaTopo}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Cabecalho nome={nome} fotoUrl={fotoUrl} souDono={souDono} />
              </View>
              <TouchableOpacity onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Fechar">
                <T style={estilos.fechar}>✕</T>
              </TouchableOpacity>
            </View>
            <T style={estilos.folhaContagem}>{historico.length} {historico.length === 1 ? 'mensagem' : 'mensagens'} · conversa inteira</T>
          </View>
          <ScrollView
            ref={rolagemRef}
            style={estilos.folhaLista}
            contentContainerStyle={{ paddingVertical: 8 }}
            onContentSizeChange={() => rolagemRef.current?.scrollToEnd?.({ animated: false })}
          >
            {historico.map((m) => <Balao key={m.id || `${m.frase_id}-${m.enviado_em}`} m={m} />)}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------
// O bloco
// ---------------------------------------------------------------------------------------
// dados: a resposta do GET (ver topo). outro: { nome, foto_url } da outra parte. souDono: lado
// de quem lê (só para o emoji do avatar vazio). enviando: frase_id em envio | null.
// onEnviar(frase_id). Renderiza null quando !temConversa(dados).
export default function ConversaProntas({ dados, outro, souDono, enviando, onEnviar }) {
  const [folha, setFolha] = useState(false)
  if (!temConversa(dados)) return null
  const historico = Array.isArray(dados.historico) ? dados.historico : []
  const frases = Array.isArray(dados.frases) ? dados.frases : []
  const ultimas = historico.slice(-ULTIMAS_NA_CAIXA)
  const limite = Number(dados.limite) || 5
  const enviadasNaFase = dados.fase ? Math.max(0, limite - (Number(dados.restantes) || 0)) : 0
  const esgotou = !!dados.fase && (Number(dados.restantes) || 0) <= 0
  const podeResponder = !!dados.fase && frases.length > 0
  const nome = outro?.nome

  return (
    <View style={estilos.bloco}>
      <Cabecalho nome={nome} fotoUrl={outro?.foto_url} souDono={souDono} />

      {/* Caixa de altura fixa: só as últimas 3, alinhadas embaixo como num chat. */}
      <View style={[estilos.caixa, ultimas.length === 0 && { justifyContent: 'center' }]}>
        {ultimas.length === 0 ? (
          <T linhas={2} style={estilos.caixaVazia}>{podeResponder ? 'Nenhuma mensagem ainda. Toque numa frase abaixo para começar.' : 'Nenhuma mensagem.'}</T>
        ) : ultimas.map((m) => <Balao key={m.id || `${m.frase_id}-${m.enviado_em}`} m={m} />)}
      </View>
      {historico.length > 0 ? (
        <TouchableOpacity onPress={() => setFolha(true)} hitSlop={{ top: 6, bottom: 6 }} accessibilityRole="link" style={estilos.linkLinha}>
          <T style={estilos.link}>Ver conversa inteira ({historico.length}) ›</T>
        </TouchableOpacity>
      ) : null}

      {podeResponder ? (
        <>
          <View style={estilos.responderLinha}>
            <T style={estilos.responderRotulo}>TOQUE PARA RESPONDER</T>
            <T style={[estilos.contador, esgotou && { color: cores.primaria }]}>{enviadasNaFase} de {limite} nesta fase</T>
          </View>
          <View style={estilos.chips}>
            {frases.map((f) => {
              const enviada = !!f.enviada
              const travada = enviada || esgotou || !!enviando
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[estilos.chip, enviada && estilos.chipEnviada, !enviada && esgotou && estilos.chipTravada]}
                  onPress={() => onEnviar?.(f.id)}
                  disabled={travada}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: travada }}
                >
                  <T style={[estilos.chipTexto, enviada && estilos.chipTextoEnviada]}>
                    {enviando === f.id ? 'Enviando…' : `${enviada ? '✓ ' : ''}${f.texto}`}
                  </T>
                </TouchableOpacity>
              )
            })}
          </View>
        </>
      ) : (
        <T linhas={2} style={estilos.somenteLeitura}>As mensagens prontas valem entre a escolha do profissional e a chegada dele.</T>
      )}

      <FolhaConversa visivel={folha} onFechar={() => setFolha(false)} historico={historico} nome={nome} fotoUrl={outro?.foto_url} souDono={souDono} />
    </View>
  )
}

const estilos = StyleSheet.create({
  bloco: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 12 },

  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarVazio: { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  avatarIniciais: { color: cores.primaria, fontSize: 13, fontWeight: '700' },
  avatarEmoji: { fontSize: 16 },
  cabecalhoTitulo: { fontSize: 14, fontWeight: '700', color: cores.textoForte, lineHeight: 18 },
  cabecalhoSub: { fontSize: 11, color: cores.textoMedio, lineHeight: 15 },

  // Caixa das últimas 3 (altura fixa ~128dp: 3 balões de 1 linha).
  caixa: { height: 128, marginTop: 10, backgroundColor: cores.fundoElevado, borderRadius: raios.medio, paddingHorizontal: 8, paddingVertical: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  caixaVazia: { fontSize: 12, color: cores.textoMedio, textAlign: 'center', lineHeight: 16, paddingHorizontal: 12 },
  balaoLinha: { flexDirection: 'row', marginVertical: 2 },
  balaoLinhaMinha: { justifyContent: 'flex-end' },
  balaoLinhaOutro: { justifyContent: 'flex-start' },
  balao: { maxWidth: '82%', borderRadius: raios.medio, paddingHorizontal: 10, paddingVertical: 5 },
  balaoMeu: { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, borderBottomRightRadius: 4 },
  balaoOutro: { backgroundColor: '#262626', borderBottomLeftRadius: 4 },
  balaoTexto: { fontSize: 13, color: cores.textoForte, lineHeight: 17 },
  balaoTextoMeu: { color: cores.textoForte },
  balaoHora: { fontSize: 10, color: cores.textoMedio, textAlign: 'right', marginTop: 1 },
  balaoHoraMinha: { color: cores.primaria },

  linkLinha: { alignSelf: 'flex-end', marginTop: 4 },
  link: { fontSize: 12, fontWeight: '600', color: '#8888cc' },

  responderLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 6 },
  responderRotulo: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: cores.textoMedio },
  contador: { fontSize: 11, fontWeight: '600', color: cores.textoMedio },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'transparent' },
  chipEnviada: { borderColor: cores.borda, backgroundColor: cores.fundoElevado, opacity: 0.55 },
  chipTravada: { opacity: 0.4 },
  chipTexto: { fontSize: 12, fontWeight: '600', color: cores.primaria },
  chipTextoEnviada: { color: cores.textoMedio },
  somenteLeitura: { fontSize: 11, color: cores.textoFraco, lineHeight: 15, marginTop: 8 },

  // Folha da conversa inteira
  folhaFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  folhaCard: { backgroundColor: cores.fundoCard, borderTopLeftRadius: raios.grande, borderTopRightRadius: raios.grande, paddingHorizontal: 16, paddingTop: 8, maxHeight: '80%' },
  alca: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: cores.borda, marginBottom: 10 },
  folhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fechar: { fontSize: 18, color: cores.textoMedio, paddingHorizontal: 4 },
  folhaContagem: { fontSize: 11, color: cores.textoMedio, marginTop: 8, marginBottom: 4 },
  folhaLista: { borderTopWidth: 0.5, borderTopColor: cores.borda },
})
