import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { cores, raios } from '../utils/tema'
import { navigationRef } from '../navigation/navigationRef'
import { carregarVistas, marcarVista } from '../utils/celebracao'

// Detecta o match a comemorar para o usuário atual, conforme o papel. Retorna o
// primeiro evento ainda não visto (marca d'água local) ou null. Cada papel celebra
// o momento certo do funil: donos ao receber proposta; prestadores ao serem aceitos.
//
// O encerramento pendente entra por último em cada papel, de propósito: ele não usa
// marca d'água (repete até ser resolvido) e, na frente dos demais, esconderia todo o
// resto enquanto durasse. Atrás, os eventos de uma vez só disparam, ficam marcados e
// saem do caminho — na verificação seguinte o encerramento aparece.
const detectar = async (usuario) => {
  const uid = usuario.id
  const vistas = await carregarVistas(uid)
  const naoVisto = (k) => !vistas.has(k)

  const ehDonoReparo = usuario.role === 'dono_obra' && usuario.tipo_dono === 'reparo'
  const ehDonoObra   = usuario.role === 'dono_obra' && usuario.tipo_dono !== 'reparo'
  const ehReparador  = usuario.role === 'prestador' && usuario.tipo_prestador !== 'pintor'
  const ehPintor     = (usuario.role === 'prestador' && usuario.tipo_prestador === 'pintor') || usuario.role === 'assinante'

  // Donos: a marca d'água é POR PROPOSTA (interesse/candidatura), não por reparo/obra.
  // Chavear por `reparo:${id}`/`obra:${id}` silenciava o item para sempre depois da 1ª
  // proposta — quem negociava e não fechava (o prestador recusa a contraproposta, p.ex.)
  // nunca mais era avisado das propostas seguintes daquele mesmo reparo/obra. A API
  // devolve o id da proposta pendente mais recente; enquanto ele mudar, o modal reaparece.

  // dono_reparo — um reparador demonstrou interesse
  if (ehDonoReparo) {
    const resp = await api.get('/reparos/minhas')
    const r = (resp.reparos || []).find(x =>
      x.interesse_pendente_recente_id != null && naoVisto(`interesse:${x.interesse_pendente_recente_id}`)
    )
    if (r) return {
      chave: `interesse:${r.interesse_pendente_recente_id}`, emoji: '🔔',
      titulo: 'Seu reparo recebeu uma proposta!',
      subtitulo: `"${r.titulo}" tem profissional(is) interessado(s). Veja e escolha o melhor!`,
      ctaTexto: 'Ver proposta',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: r }, initial: false }),
    }
    const matched = (resp.reparos || []).find(x =>
      x.match_feito_em && x.match_usuario_id && naoVisto(`reparo_match:${x.id}`)
    )
    if (matched) return {
      chave: `reparo_match:${matched.id}`, emoji: '🎉',
      titulo: 'Seu reparo vai ser realizado!',
      subtitulo: `Ótima notícia! Um profissional verificado fechou negócio para "${matched.titulo}". Combine os detalhes agora!`,
      ctaTexto: 'Ver detalhes',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: matched }, initial: false }),
    }
    const enc = (resp.reparos || []).find(x =>
      x.encerramento_solicitado_por != null && String(x.encerramento_solicitado_por) !== String(uid)
    )
    if (enc) return {
      semMarca: true,
      chave: `encerramento:${enc.id}`, emoji: '🤝',
      titulo: 'Confirme o encerramento',
      subtitulo: `O profissional marcou "${enc.titulo}" como concluído. O reparo só encerra quando você confirmar.`,
      ctaTexto: 'Confirmar encerramento',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: enc }, initial: false }),
    }
  }
  // dono_obra — um pintor/construtor se candidatou
  if (ehDonoObra) {
    const resp = await api.get('/obras/minhas')
    const o = (resp.obras || []).find(x =>
      x.candidatura_pendente_recente_id != null && naoVisto(`candidatura:${x.candidatura_pendente_recente_id}`)
    )
    if (o) return {
      chave: `candidatura:${o.candidatura_pendente_recente_id}`, emoji: '🔔',
      titulo: 'Sua obra recebeu uma proposta!',
      subtitulo: `"${o.titulo}" tem profissional(is) interessado(s). Veja e escolha o melhor!`,
      ctaTexto: 'Ver proposta',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: o }, initial: false }),
    }
    const matched = (resp.obras || []).find(x =>
      x.match_feito_em && x.match_usuario_id && naoVisto(`obra_match:${x.id}`)
    )
    if (matched) return {
      chave: `obra_match:${matched.id}`, emoji: '🎉',
      titulo: 'Sua obra vai ser realizada!',
      subtitulo: `Ótima notícia! Um profissional verificado fechou negócio para "${matched.titulo}". Combine os detalhes agora!`,
      ctaTexto: 'Ver detalhes',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: matched }, initial: false }),
    }
    const enc = (resp.obras || []).find(x =>
      x.encerramento_solicitado_por != null && String(x.encerramento_solicitado_por) !== String(uid)
    )
    if (enc) return {
      semMarca: true,
      chave: `encerramento:${enc.id}`, emoji: '🤝',
      titulo: 'Confirme o encerramento',
      subtitulo: `O profissional marcou "${enc.titulo}" como concluída. A obra só encerra quando você confirmar.`,
      ctaTexto: 'Confirmar encerramento',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: enc }, initial: false }),
    }
  }
  // reparador — o dono aceitou sua proposta
  if (ehReparador) {
    const resp = await api.get('/reparos/meus-interesses')
    // Contraproposta pendente do dono — mais urgente, verifica ANTES do aceito.
    const cp = (resp.ativos || []).find(x => x.status === 'contraproposta_dono' && naoVisto(`contraproposta:${x.id}`))
    if (cp) return {
      tipo: 'contraproposta_prestador',
      chave: `contraproposta:${cp.id}`,
      titulo: '💬 Nova contraproposta!',
      mensagem: `O solicitante de "${cp.titulo}" fez uma contraproposta de R$ ${Number(cp.valor_contraproposta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Veja e responda!`,
      reparo_id: cp.reparo_id,
      interesse_id: cp.id,
    }
    // As DUAS grafias de aceite (ver STATUS_GRUPO em ContratosScreen.js:24), igual ao ramo
    // do pintor e ao gate de encerramento logo abaixo: sem 'aprovada' o profissional nunca
    // era parabenizado pelo serviço que ganhou.
    const it = (resp.ativos || []).find(x => (x.status === 'aceito' || x.status === 'aprovada') && naoVisto(`interesse:${x.id}`))
    if (it) return {
      chave: `interesse:${it.id}`, emoji: '🎉',
      titulo: 'Parabéns! Você conseguiu o serviço!',
      subtitulo: `O cliente aceitou sua proposta para "${it.titulo}". Combine os detalhes agora!`,
      ctaTexto: 'Ver detalhes',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: it.reparo_id } }, initial: false }),
    }
    // Exige o interesse ACEITO: a lista traz também propostas recusadas/pendentes do
    // mesmo reparo, e o pedido de encerramento só diz respeito a quem está no serviço.
    // As DUAS grafias de aceite (ver STATUS_GRUPO em ContratosScreen.js:24), como o ramo
    // do pintor logo abaixo já fazia: um aceite gravado como 'aprovada' não pode engolir
    // o aviso — sem ele o reparo fica parado esperando uma confirmação que o profissional
    // nunca é convidado a dar.
    const enc = (resp.ativos || []).find(x =>
      (x.status === 'aceito' || x.status === 'aprovada') && x.encerramento_solicitado_por != null &&
      String(x.encerramento_solicitado_por) !== String(uid)
    )
    if (enc) return {
      semMarca: true,
      chave: `encerramento:${enc.reparo_id}`, emoji: '🤝',
      titulo: 'Confirme o encerramento',
      subtitulo: `O solicitante marcou "${enc.titulo}" como concluído. O reparo só encerra quando você confirmar.`,
      ctaTexto: 'Confirmar encerramento',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: enc.reparo_id } }, initial: false }),
    }
  }
  // pintor/construtor — o dono aceitou sua candidatura
  if (ehPintor) {
    const resp = await api.get('/candidaturas/minhas')
    // Contraproposta pendente do dono — mais urgente, verifica ANTES do aceito.
    const cp = (resp.candidaturas || []).find(x => x.status === 'contraproposta_dono' && naoVisto(`contraproposta:${x.id}`))
    if (cp) return {
      tipo: 'contraproposta_prestador',
      chave: `contraproposta:${cp.id}`,
      titulo: '💬 Nova contraproposta!',
      mensagem: `O dono da obra "${cp.titulo}" fez uma contraproposta de R$ ${Number(cp.valor_contraproposta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Veja e responda!`,
      obra_id: cp.obra_id,
      candidatura_id: cp.id,
    }
    const c = (resp.candidaturas || []).find(x => (x.status === 'aceito' || x.status === 'aprovada') && naoVisto(`candidatura:${x.id}`))
    if (c) return {
      chave: `candidatura:${c.id}`, emoji: '🎉',
      titulo: 'Parabéns! Você conseguiu a obra!',
      subtitulo: `O cliente aceitou sua proposta${c.titulo ? ` para "${c.titulo}"` : ''}. Combine os detalhes agora!`,
      ctaTexto: 'Ver detalhes',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: c.obra_id } }, initial: false }),
    }
    // Mesmo motivo do reparador: só a candidatura aceita está no serviço.
    const enc = (resp.candidaturas || []).find(x =>
      (x.status === 'aceito' || x.status === 'aprovada') && x.encerramento_solicitado_por != null &&
      String(x.encerramento_solicitado_por) !== String(uid)
    )
    if (enc) return {
      semMarca: true,
      chave: `encerramento:${enc.obra_id}`, emoji: '🤝',
      titulo: 'Confirme o encerramento',
      subtitulo: `O dono${enc.titulo ? ` de "${enc.titulo}"` : ' da obra'} marcou o serviço como concluído. A obra só encerra quando você confirmar.`,
      ctaTexto: 'Confirmar encerramento',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: enc.obra_id } }, initial: false }),
    }
  }
  return null
}

// Ref de módulo para acionar a verificação de celebração a partir de outras telas
// (ex.: logo após o prestador/pintor aceitar, sem depender de troca de foco/aba).
export const celebracaoRef = { verificar: null }

// Overlay de celebração de match. Montado uma vez no NavigationContainer; aparece
// automaticamente ao abrir o app, voltar ao foreground ou navegar entre abas.
export default function CelebracaoMatchHost() {
  const { usuario } = useAuth()
  const [evento, setEvento] = useState(null)
  const checandoRef = useRef(false)
  const ultimaRef = useRef(0)

  // forcar=true (login / foreground) checa já; senão, no máximo 1x a cada 15s para
  // não bater na API a cada troca de aba.
  const verificar = useCallback(async (forcar = false) => {
    if (!usuario || checandoRef.current) return
    const agora = Date.now()
    if (!forcar && agora - ultimaRef.current < 15000) return
    ultimaRef.current = agora
    checandoRef.current = true
    try {
      const ev = await detectar(usuario)
      // Marca como visto ao exibir → comemora exatamente uma vez, mesmo se só dispensar.
      // Exceto os eventos `semMarca` (encerramento pendente): não são notícia a comemorar
      // uma vez, e sim uma ação que falta. Ficam fora da marca d'água e reaparecem a cada
      // verificação até a outra parte deixar de estar esperando.
      if (ev) {
        if (!ev.semMarca) await marcarVista(usuario.id, ev.chave)
        setEvento(ev)
      }
    } catch (e) {
      console.log('[Celebracao] falha ao verificar match | code:', e.code)
    } finally {
      checandoRef.current = false
    }
  }, [usuario])

  // Expõe verificar via ref de módulo para acionamento externo (outras telas).
  useEffect(() => { celebracaoRef.verificar = verificar }, [verificar])

  // Ao logar / abrir o app
  useEffect(() => { if (usuario) verificar(true) }, [usuario, verificar])

  // Ao voltar para o foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => { if (estado === 'active') verificar(true) })
    return () => sub.remove()
  }, [verificar])

  // Ao navegar entre abas/telas (sem nenhuma celebração já aberta)
  useEffect(() => {
    const nav = navigationRef.current
    if (!nav?.addListener) return
    const unsub = nav.addListener('state', () => { if (!evento) verificar() })
    return unsub
  }, [usuario, evento, verificar])

  if (!evento) return null

  const fechar = () => setEvento(null)
  const irParaDetalhe = () => {
    const ev = evento
    setEvento(null)
    // Contrapropostas usam ids diretos (sem closure navegar); demais eventos trazem navegar().
    if (ev?.tipo === 'contraproposta_prestador') {
      if (ev.reparo_id) navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: ev.reparo_id } }, initial: false })
      else if (ev.obra_id) navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: ev.obra_id } }, initial: false })
      return
    }
    ev?.navegar?.()
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={fechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          <Text style={estilos.confete}>🎉   ✨   🎉</Text>
          {evento.emoji ? <Text style={estilos.emoji}>{evento.emoji}</Text> : null}
          <Text style={estilos.titulo}>{evento.titulo}</Text>
          <Text style={estilos.subtitulo}>{evento.subtitulo || evento.mensagem}</Text>
          <TouchableOpacity style={estilos.cta} onPress={irParaDetalhe} activeOpacity={0.85}>
            <Text style={estilos.ctaTexto}>{evento.ctaTexto || 'Ver proposta'} →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.depois} onPress={fechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={estilos.depoisTexto}>Ver depois</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:       { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.primaria, padding: 28, alignItems: 'center' },
  confete:    { fontSize: 24, marginBottom: 4 },
  emoji:      { fontSize: 64, marginBottom: 8 },
  titulo:     { fontSize: 22, fontWeight: '800', color: cores.primaria, textAlign: 'center', marginBottom: 10, letterSpacing: -0.3 },
  subtitulo:  { fontSize: 14, color: cores.textoMedio, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  cta:        { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 12 },
  ctaTexto:   { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  depois:     { paddingVertical: 8 },
  depoisTexto:{ color: cores.textoFraco, fontSize: 13 },
})
