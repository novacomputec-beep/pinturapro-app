import React, { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import api from '../services/api'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import { quandoVisita } from './Orcamento'

// Arte visita-ajustes-previa (B/D): banners do topo com GET /me/pendencias (pinturapro-api
// 007abf8, routes/index.js "GET /me/pendencias" e utils/orcamentoVisita.pendenciasDoUsuario):
//   { pendencias: [{ tipo: 'visita_aceita', obra_id|reparo_id, proposta_id, titulo, visita_quando }
//                 | { tipo: 'orcamento_recebido', obra_id|reparo_id, proposta_id, titulo, valor }] }
// até 3, mais recentes primeiro. `tipo` escolhe quais esta tela mostra: 'visita_aceita' no feed do
// profissional (laranja), 'orcamento_recebido' em Meus pedidos do dono (verde) — a conta com os
// dois papéis vê cada um no seu lugar. Consulta a cada foco da tela e a cada volta do app ao
// primeiro plano; lista vazia ou falha → nada aparece (é um atalho, não um fluxo).
const MAX = 3

const reais = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TIPOS = {
  visita_aceita: {
    texto: (p) => [`📋 Visita aceita! ${String(p.titulo ?? '').trim()}`.trim(), quandoVisita(p.visita_quando)].filter(Boolean).join(' · '),
    acao: 'Ver endereço e detalhes →',
    caixa: { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
    cor: cores.primaria,
  },
  orcamento_recebido: {
    texto: (p) => [`💰 Orçamento recebido! ${String(p.titulo ?? '').trim()}`.trim(), Number(p.valor) > 0 ? reais(p.valor) : null].filter(Boolean).join(' · '),
    acao: 'Ver e decidir →',
    caixa: { backgroundColor: cores.sucessoSuave, borderColor: cores.sucesso },
    cor: cores.sucesso,
  },
}

export default function BannersPendencias({ navigation, tipo }) {
  const [itens, setItens] = useState([])
  const montadoRef = useRef(true)
  useEffect(() => () => { montadoRef.current = false }, [])

  const carregar = useCallback(async () => {
    try {
      const r = await api.get('/me/pendencias')
      const lista = Array.isArray(r?.pendencias) ? r.pendencias : []
      const meus = lista.filter(p => p?.tipo === tipo && (p.obra_id || p.reparo_id)).slice(0, MAX)
      if (montadoRef.current) setItens(meus)
    } catch (err) {
      console.log('[Pendencias] GET /me/pendencias falhou, banners ocultos | status:', err?.status, '| code:', err?.code)
      if (montadoRef.current) setItens([])
    }
  }, [tipo])

  useFocusEffect(useCallback(() => { carregar() }, [carregar]))
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') carregar() })
    return () => sub.remove()
  }, [carregar])

  const cfg = TIPOS[tipo]
  if (!cfg || itens.length === 0) return null

  // Abre o pedido; no orçamento, já rolando até a lista de propostas (o mesmo parâmetro que a
  // home do dono usa para a desistência).
  const abrir = (p) => {
    const extra = tipo === 'orcamento_recebido' ? { rolarAteInteressados: true } : {}
    if (p.obra_id) navigation.navigate('DetalheObra', { obra: { id: p.obra_id }, ...extra })
    else navigation.navigate('DetalheReparo', { reparo: { id: p.reparo_id }, ...extra })
  }

  return (
    <View style={[estilos.wrap, larguraMaxima]}>
      {itens.map((p) => (
        <TouchableOpacity
          key={`${p.obra_id ? 'o' : 'r'}:${p.proposta_id ?? p.obra_id ?? p.reparo_id}`}
          style={[estilos.caixa, cfg.caixa]}
          onPress={() => abrir(p)}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={estilos.texto} numberOfLines={2} maxFontSizeMultiplier={1.3}>{cfg.texto(p)}</Text>
          <Text style={[estilos.acao, { color: cfg.cor }]} maxFontSizeMultiplier={1.3}>{cfg.acao}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const estilos = StyleSheet.create({
  wrap: { paddingHorizontal: espacos.tela, marginBottom: 4 },
  caixa: { borderWidth: 1, borderRadius: raios.medio, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8 },
  texto: { fontSize: 14, fontWeight: '700', color: cores.textoForte, lineHeight: 19 },
  acao: { fontSize: 13, fontWeight: '800', marginTop: 4 },
})
