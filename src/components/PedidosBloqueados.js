import React, { useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { cores, raios, larguraMaxima } from '../utils/tema'
import { useAuth } from '../contexts/AuthContext'
import ModalSuporte from './ModalSuporte'

// Arte "Novos pedidos liberados em <dd/mm>" (10/11/2026): tela cheia mostrada quando criar
// uma demanda (POST /obras/dono ou /reparos/dono) volta 409 PEDIDOS_BLOQUEADOS — pela 2ª vez
// em 90 dias a PESSOA do dono deixou a proposta de horário de um profissional vencer sem
// responder, e a API bloqueia por 7 dias só a CRIAÇÃO de pedidos novos (pinturapro-api
// utils/responsabilidade.js, d826bdd). O corpo do 409 traz `liberado_em` (ISO), que chega
// aqui via err.dados (services/api).
//
// Os pedidos já abertos seguem intactos — o texto diz isso. "Falar com o suporte" abre o
// MESMO ModalSuporte do Perfil (POST /suporte/pedido), com o telefone da conta.

export const CODIGO_PEDIDOS_BLOQUEADOS = 'PEDIDOS_BLOQUEADOS'
export const ehPedidosBloqueados = (err) => err?.status === 409 && err?.codigo === CODIGO_PEDIDOS_BLOQUEADOS

// "dd/mm" em horário local; sem data válida volta null (o texto cai no genérico).
const diaMes = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function TelaPedidosBloqueados({ visivel, liberadoEm, onFechar }) {
  const { usuario } = useAuth()
  const [suporteAberto, setSuporteAberto] = useState(false)
  const data = diaMes(liberadoEm)
  return (
    <Modal visible={visivel} animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <SafeAreaView style={estilos.tela}>
        <View style={[estilos.corpo, larguraMaxima]}>
          <Text style={estilos.icone}>⏸️</Text>
          <Text style={estilos.titulo}>{data ? `Novos pedidos liberados em ${data}` : 'Novos pedidos temporariamente pausados'}</Text>
          <Text style={estilos.texto}>
            Pela 2ª vez em 90 dias, um profissional reservou a agenda para você e ficou sem resposta.
          </Text>

          <View style={estilos.caixa}>
            <Text style={estilos.caixaLinha}>🗓️ Seus pedidos atuais continuam normais.</Text>
            <Text style={estilos.caixaLinha}>✅ A partir de {data || 'a data de liberação'} você pode cadastrar novos pedidos.</Text>
            <Text style={estilos.caixaLinha}>💬 Acha que foi um engano? Fale com o suporte.</Text>
          </View>

          <TouchableOpacity style={estilos.cta} onPress={() => setSuporteAberto(true)} activeOpacity={0.85}>
            <Text style={estilos.ctaTexto}>Falar com o suporte</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.voltar} onPress={onFechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={estilos.voltarTexto}>Voltar</Text>
          </TouchableOpacity>
        </View>

        <ModalSuporte
          visivel={suporteAberto}
          telefoneInicial={usuario?.telefone}
          onFechar={() => setSuporteAberto(false)}
        />
      </SafeAreaView>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  tela:        { flex: 1, backgroundColor: cores.fundo },
  corpo:       { flex: 1, width: '100%', alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 24 },
  icone:       { fontSize: 56, textAlign: 'center', marginBottom: 16 },
  titulo:      { fontSize: 24, fontWeight: '800', color: cores.textoForte, textAlign: 'center', letterSpacing: -0.3, lineHeight: 30, marginBottom: 12 },
  texto:       { fontSize: 15, color: cores.textoMedio, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  caixa:       { backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.grande, padding: 16, gap: 10, marginBottom: 28 },
  caixaLinha:  { fontSize: 14, color: cores.textoForte, lineHeight: 20 },
  cta:         { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, alignItems: 'center', marginBottom: 8 },
  ctaTexto:    { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  voltar:      { paddingVertical: 10, alignItems: 'center' },
  voltarTexto: { color: cores.textoMedio, fontSize: 14 },
})
