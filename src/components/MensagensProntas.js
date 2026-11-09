import React, { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, Image, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import useArrastarParaFechar from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'
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
// demanda fechada ou chegada confirmada); com histórico, a folha fica só de leitura; sem fase
// E sem histórico nada aparece (temConversa).
//
// NA TELA FIXA do pós-match (arte aprovada) entra só UMA LINHA, "💬 Conversa com <nome> ›", com
// a etiqueta laranja "N nova(s)" (mensagens do outro lado ainda não vistas); a conversa inteira
// — histórico, "TOQUE PARA RESPONDER", "X de 5 nesta fase" e os chips — abre numa FOLHA DE BAIXO
// (BotaoFecharFolha + useArrastarParaFechar, como as outras folhas do app). "Vistas" = quantas
// mensagens do outro lado havia quando a folha foi aberta pela última vez, por demanda, em
// AsyncStorage (best-effort: sem storage, a etiqueta conta desde a abertura do app).
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

export const TIPO_PUSH = 'chegada_prevista'
const CHAVE_VISTAS = 'mensagens_prontas_vistas'

export const temConversa = (dados) => !!(dados?.fase || (Array.isArray(dados?.historico) && dados.historico.length > 0))
const doOutro = (historico) => (Array.isArray(historico) ? historico : []).filter(m => !m.minha).length

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
// Devolve { dados, carregando, enviando, novas, marcarVistas, recarregar, enviar }. Erros do
// GET (403/404/rede) deixam `dados` como está (null no primeiro carregamento → nada aparece).
export const useMensagensProntas = (tabela, demandaId, { ativo = true, chaveFase } = {}) => {
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(null) // frase_id em envio
  const [vistas, setVistas] = useState(null)     // nº de mensagens do outro lado já vistas
  const montadoRef = useRef(true)
  const emVooRef = useRef(false)
  const rota = demandaId ? `/${tabela}/${demandaId}/mensagens-prontas` : null
  const chaveVistas = demandaId ? `${CHAVE_VISTAS}:${tabela}:${demandaId}` : null

  useEffect(() => { montadoRef.current = true; return () => { montadoRef.current = false } }, [])

  // Quantas do outro lado já foram vistas (por demanda). Sem valor gravado, conta a partir de
  // agora: a primeira leitura marca tudo como visto, para a etiqueta não nascer "N novas" num
  // histórico antigo que a pessoa já leu noutra versão.
  useEffect(() => {
    if (!chaveVistas || !ativo) return
    let cancelado = false
    ;(async () => {
      let v = null
      try { v = await AsyncStorage.getItem(chaveVistas) } catch (err) { console.log('[MensagensProntas] vistas ilegíveis | msg:', err?.message) }
      if (!cancelado && montadoRef.current) setVistas(v == null ? null : Math.max(0, Number(v) || 0))
    })()
    return () => { cancelado = true }
  }, [chaveVistas, ativo])

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

  const marcarVistas = useCallback(() => {
    const n = doOutro(dados?.historico)
    setVistas(n)
    if (chaveVistas) AsyncStorage.setItem(chaveVistas, String(n)).catch(err => console.log('[MensagensProntas] vistas não gravadas | msg:', err?.message))
  }, [dados, chaveVistas])

  // Sem valor gravado ainda e com histórico carregado: grava o total de agora como visto.
  useEffect(() => {
    if (vistas !== null || !dados || !chaveVistas) return
    const n = doOutro(dados.historico)
    setVistas(n)
    AsyncStorage.setItem(chaveVistas, String(n)).catch(() => {})
  }, [vistas, dados, chaveVistas])

  const novas = dados && vistas !== null ? Math.max(0, doOutro(dados.historico) - vistas) : 0

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

  return { dados, carregando, enviando, novas, marcarVistas, recarregar, enviar }
}

// ---------------------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------------------

// Uma mensagem: minha à direita (tom laranja), do outro à esquerda (cinza); hora e ✓✓.
const Balao = ({ m }) => (
  <View style={[estilos.balaoLinha, m.minha ? estilos.balaoLinhaMinha : estilos.balaoLinhaOutro]}>
    <View style={[estilos.balao, m.minha ? estilos.balaoMeu : estilos.balaoOutro]}>
      <Text maxFontSizeMultiplier={MFS} style={estilos.balaoTexto}>{m.texto}</Text>
      <T style={[estilos.balaoHora, m.minha && estilos.balaoHoraMinha]}>{horaDe(m.enviado_em)}{m.minha ? '  ✓✓' : ''}</T>
    </View>
  </View>
)

const Avatar = ({ nome, fotoUrl, souDono }) => {
  const iniciais = iniciaisDe(nome)
  return fotoUrl ? (
    <Image source={{ uri: avatar(fotoUrl) }} style={estilos.avatar} />
  ) : (
    <View style={[estilos.avatar, estilos.avatarVazio]}>
      <T style={iniciais ? estilos.avatarIniciais : estilos.avatarEmoji}>{iniciais || (souDono ? '👷' : '🏠')}</T>
    </View>
  )
}

// A folha: cabeçalho (avatar, "Conversa com <nome>", subtítulo, ✕ Fechar) na zona do arraste;
// histórico rolando; embaixo, fixos, "TOQUE PARA RESPONDER" + contador e os chips.
const FolhaConversa = ({ visivel, onFechar, dados, nome, fotoUrl, souDono, enviando, onEnviar }) => {
  const insets = useSafeAreaInsets()
  const travada = !!enviando
  const fechar = travada ? null : onFechar
  const { panHandlers, estiloArraste } = useArrastarParaFechar(fechar, !!visivel)
  const rolagemRef = useRef(null)
  const historico = Array.isArray(dados?.historico) ? dados.historico : []
  const frases = Array.isArray(dados?.frases) ? dados.frases : []
  const limite = Number(dados?.limite) || 5
  const enviadasNaFase = dados?.fase ? Math.max(0, limite - (Number(dados.restantes) || 0)) : 0
  const esgotou = !!dados?.fase && (Number(dados.restantes) || 0) <= 0
  const podeResponder = !!dados?.fase && frases.length > 0
  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={() => fechar?.()}>
      <View style={estilos.folhaFundo}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => fechar?.()} accessibilityRole="button" accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.folhaCard, { paddingBottom: Math.max(20, insets.bottom + 12) }, estiloArraste]}>
          <View {...panHandlers}>
            <View style={estilos.alca} />
            <LinhaCabecalhoFolha onFechar={fechar} desabilitado={travada}>
              <View style={estilos.cabecalho}>
                <Avatar nome={nome} fotoUrl={fotoUrl} souDono={souDono} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T style={estilos.cabecalhoTitulo}>Conversa com {primeiroNomeDe(nome, souDono ? 'o profissional' : 'o cliente')}</T>
                  <T style={estilos.cabecalhoSub}>Mensagens prontas · sem digitar</T>
                </View>
              </View>
            </LinhaCabecalhoFolha>
          </View>

          <ScrollView
            ref={rolagemRef}
            style={estilos.lista}
            contentContainerStyle={[estilos.listaConteudo, historico.length === 0 && { flexGrow: 1, justifyContent: 'center' }]}
            onContentSizeChange={() => rolagemRef.current?.scrollToEnd?.({ animated: false })}
            showsVerticalScrollIndicator={false}
          >
            {historico.length === 0 ? (
              <T linhas={2} style={estilos.listaVazia}>{podeResponder ? 'Nenhuma mensagem ainda. Toque numa frase abaixo para começar.' : 'Nenhuma mensagem.'}</T>
            ) : historico.map((m) => <Balao key={m.id || `${m.frase_id}-${m.enviado_em}`} m={m} />)}
          </ScrollView>

          {podeResponder ? (
            <View style={estilos.responder}>
              <View style={estilos.responderLinha}>
                <T style={estilos.responderRotulo}>TOQUE PARA RESPONDER</T>
                <T style={[estilos.contador, esgotou && { color: cores.primaria }]}>{enviadasNaFase} de {limite} nesta fase</T>
              </View>
              <View style={estilos.chips}>
                {frases.map((f) => {
                  const enviada = !!f.enviada
                  const travado = enviada || esgotou || !!enviando
                  return (
                    <TouchableOpacity
                      key={f.id}
                      style={[estilos.chip, enviada && estilos.chipEnviada, !enviada && esgotou && estilos.chipTravada]}
                      onPress={() => onEnviar?.(f.id)}
                      disabled={travado}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: travado }}
                    >
                      <T style={[estilos.chipTexto, enviada && estilos.chipTextoEnviada]}>
                        {enviando === f.id ? 'Enviando…' : `${enviada ? '✓ ' : ''}${f.texto}`}
                      </T>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          ) : (
            <T linhas={2} style={estilos.somenteLeitura}>As mensagens prontas valem entre a escolha do profissional e a chegada dele.</T>
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------
// A linha da tela fixa (+ a folha)
// ---------------------------------------------------------------------------------------
// dados/novas/enviando/onEnviar/onAbrir: do useMensagensProntas (onAbrir = marcarVistas).
// outro: { nome, foto_url } da outra parte. souDono: lado de quem lê. Renderiza null quando
// !temConversa(dados). Altura da linha: 44dp — é o que entra no orçamento da tela fixa.
export default function ConversaProntas({ dados, novas, outro, souDono, enviando, onEnviar, onAbrir }) {
  const [folha, setFolha] = useState(false)
  // Novas mensagens chegando com a folha aberta já estão à vista: marca de novo.
  useEffect(() => { if (folha) onAbrir?.() }, [folha, dados?.historico?.length])
  if (!temConversa(dados)) return null
  const nome = outro?.nome
  const n = Number(novas) || 0
  const abrir = () => { onAbrir?.(); setFolha(true) }
  return (
    <>
      <TouchableOpacity style={estilos.linha} onPress={abrir} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Conversa com ${primeiroNomeDe(nome, souDono ? 'o profissional' : 'o cliente')}${n > 0 ? `, ${n} ${n === 1 ? 'nova' : 'novas'}` : ''}`}>
        <T style={estilos.linhaTexto}>💬 Conversa com {primeiroNomeDe(nome, souDono ? 'o profissional' : 'o cliente')}</T>
        {n > 0 ? (
          <View style={estilos.etiqueta}><T style={estilos.etiquetaTexto}>{n} {n === 1 ? 'nova' : 'novas'}</T></View>
        ) : null}
        <T style={estilos.linhaSeta}>›</T>
      </TouchableOpacity>
      <FolhaConversa
        visivel={folha}
        onFechar={() => setFolha(false)}
        dados={dados}
        nome={nome}
        fotoUrl={outro?.foto_url}
        souDono={souDono}
        enviando={enviando}
        onEnviar={onEnviar}
      />
    </>
  )
}

const estilos = StyleSheet.create({
  // Linha da tela fixa (44dp)
  linha: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, paddingHorizontal: 12 },
  linhaTexto: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '700', color: cores.textoForte },
  linhaSeta: { fontSize: 20, color: cores.textoMedio, lineHeight: 22 },
  etiqueta: { backgroundColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 9, paddingVertical: 3 },
  etiquetaTexto: { fontSize: 11, fontWeight: '800', color: '#0A0A0A' },

  // Folha
  folhaFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  folhaCard: { backgroundColor: cores.fundoCard, borderTopLeftRadius: raios.grande, borderTopRightRadius: raios.grande, paddingHorizontal: 16, paddingTop: 8, maxHeight: '85%' },
  alca: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: cores.borda, marginBottom: 10 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarVazio: { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  avatarIniciais: { color: cores.primaria, fontSize: 13, fontWeight: '700' },
  avatarEmoji: { fontSize: 16 },
  cabecalhoTitulo: { fontSize: 15, fontWeight: '700', color: cores.textoForte, lineHeight: 19 },
  cabecalhoSub: { fontSize: 11, color: cores.textoMedio, lineHeight: 15 },

  lista: { flexGrow: 0, flexShrink: 1, minHeight: 120, maxHeight: 320, marginTop: 10, backgroundColor: cores.fundoElevado, borderRadius: raios.medio },
  listaConteudo: { paddingHorizontal: 8, paddingVertical: 8 },
  listaVazia: { fontSize: 12, color: cores.textoMedio, textAlign: 'center', lineHeight: 16, paddingHorizontal: 12, paddingVertical: 24 },
  balaoLinha: { flexDirection: 'row', marginVertical: 2 },
  balaoLinhaMinha: { justifyContent: 'flex-end' },
  balaoLinhaOutro: { justifyContent: 'flex-start' },
  balao: { maxWidth: '82%', borderRadius: raios.medio, paddingHorizontal: 10, paddingVertical: 6 },
  balaoMeu: { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, borderBottomRightRadius: 4 },
  balaoOutro: { backgroundColor: '#262626', borderBottomLeftRadius: 4 },
  balaoTexto: { fontSize: 13, color: cores.textoForte, lineHeight: 17 },
  balaoHora: { fontSize: 10, color: cores.textoMedio, textAlign: 'right', marginTop: 1 },
  balaoHoraMinha: { color: cores.primaria },

  responder: { marginTop: 10 },
  responderLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  responderRotulo: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: cores.textoMedio },
  contador: { fontSize: 11, fontWeight: '600', color: cores.textoMedio },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'transparent' },
  chipEnviada: { borderColor: cores.borda, backgroundColor: cores.fundoElevado, opacity: 0.55 },
  chipTravada: { opacity: 0.4 },
  chipTexto: { fontSize: 12, fontWeight: '600', color: cores.primaria },
  chipTextoEnviada: { color: cores.textoMedio },
  somenteLeitura: { fontSize: 11, color: cores.textoFraco, lineHeight: 15, marginTop: 10 },
})
