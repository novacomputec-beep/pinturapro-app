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
const detectar = async (usuario) => {
  const uid = usuario.id
  const vistas = await carregarVistas(uid)
  const naoVisto = (k) => !vistas.has(k)

  const ehDonoReparo = usuario.role === 'dono_obra' && usuario.tipo_dono === 'reparo'
  const ehDonoObra   = usuario.role === 'dono_obra' && usuario.tipo_dono !== 'reparo'
  const ehReparador  = usuario.role === 'prestador' && usuario.tipo_prestador !== 'pintor'
  const ehPintor     = (usuario.role === 'prestador' && usuario.tipo_prestador === 'pintor') || usuario.role === 'assinante'

  // dono_reparo — um reparador demonstrou interesse
  if (ehDonoReparo) {
    const resp = await api.get('/reparos/minhas')
    const r = (resp.reparos || []).find(x => Number(x.interesses_pendentes) > 0 && naoVisto(`reparo:${x.id}`))
    if (r) return {
      chave: `reparo:${r.id}`, emoji: '🔔',
      titulo: 'Seu reparo recebeu uma proposta!',
      subtitulo: `"${r.titulo}" tem prestador(es) interessado(s). Veja e escolha o melhor!`,
      ctaTexto: 'Ver proposta',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: r } }),
    }
  }
  // dono_obra — um pintor/construtor se candidatou
  if (ehDonoObra) {
    const resp = await api.get('/obras/minhas')
    const o = (resp.obras || []).find(x => Number(x.candidaturas_pendentes) > 0 && naoVisto(`obra:${x.id}`))
    if (o) return {
      chave: `obra:${o.id}`, emoji: '🔔',
      titulo: 'Sua obra recebeu uma proposta!',
      subtitulo: `"${o.titulo}" tem profissional(is) interessado(s). Veja e escolha o melhor!`,
      ctaTexto: 'Ver proposta',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: o } }),
    }
  }
  // reparador — o dono aceitou sua proposta
  if (ehReparador) {
    const resp = await api.get('/reparos/meus-interesses')
    const it = (resp.ativos || []).find(x => x.status === 'aceito' && naoVisto(`interesse:${x.id}`))
    if (it) return {
      chave: `interesse:${it.id}`, emoji: '🎉',
      titulo: 'Parabéns! Você conseguiu o serviço!',
      subtitulo: `O cliente aceitou sua proposta para "${it.titulo}". Combine os detalhes agora!`,
      ctaTexto: 'Ver detalhes',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: it.reparo_id } } }),
    }
  }
  // pintor/construtor — o dono aceitou sua candidatura
  if (ehPintor) {
    const resp = await api.get('/candidaturas/minhas')
    const c = (resp.candidaturas || []).find(x => (x.status === 'aceito' || x.status === 'aprovada') && naoVisto(`candidatura:${x.id}`))
    if (c) return {
      chave: `candidatura:${c.id}`, emoji: '🎉',
      titulo: 'Parabéns! Você conseguiu a obra!',
      subtitulo: `O cliente aceitou sua proposta${c.titulo ? ` para "${c.titulo}"` : ''}. Combine os detalhes agora!`,
      ctaTexto: 'Ver detalhes',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: c.obra_id } } }),
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
      if (ev) { await marcarVista(usuario.id, ev.chave); setEvento(ev) }
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
  const irParaDetalhe = () => { const ev = evento; setEvento(null); ev?.navegar?.() }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={fechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          <Text style={estilos.confete}>🎉   ✨   🎉</Text>
          <Text style={estilos.emoji}>{evento.emoji}</Text>
          <Text style={estilos.titulo}>{evento.titulo}</Text>
          <Text style={estilos.subtitulo}>{evento.subtitulo}</Text>
          <TouchableOpacity style={estilos.cta} onPress={irParaDetalhe} activeOpacity={0.85}>
            <Text style={estilos.ctaTexto}>{evento.ctaTexto} →</Text>
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
