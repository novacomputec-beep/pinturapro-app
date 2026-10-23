import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { cores, raios } from '../utils/tema'
import { formatarDuracao } from '../utils/tempo'
import { CardAgendamento, PickerAgendamento, CaixaAtencaoApp, formatarAgendado } from './Agendamento'
import { formatarLimiteSP } from './PosMatchDono'

// Bloco do PROFISSIONAL do match enquanto não há horário ACEITO (chegada_prevista_em nulo).
// Mesma linguagem visual do PosMatchDono, para DetalheReparo e DetalheObra não divergirem.
// Ordem fixa:
//   1. card do topo: categoria, título, bairro · cidade, "Valor combinado" e
//      "Prazo para chegar" (reparo) / "Início previsto" (obra);
//   2. banner laranja "envie ao cliente o dia e o horário" com o limite e o botão branco que
//      abre o picker de proposta — OU, já enviada a proposta, "⏳ AGUARDANDO O CLIENTE
//      CONFIRMAR" com o horário proposto — OU, se o cliente contrapropôs, o CardAgendamento
//      (aceitar / sugerir outro), que a tela passa pronto em `agendamento`;
//   3. mini card do cliente;
//   4. a caixa âmbar da penalidade (texto intacto) — só quando o CardAgendamento não está na
//      tela, porque ele já traz a mesma caixa dentro.
// "Estou a caminho" NÃO mora aqui de propósito: só existe depois do horário aceito, e aí a
// tela volta ao card AGENDADO com o botão logo abaixo.

const formatarValor = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

// Mesmo tique do PosMatchDono: minutos, 30 s, onExpirar uma vez ao zerar.
const TempoRestante = ({ alvo, frente, onExpirar }) => {
  const [agora, setAgora] = useState(() => Date.now())
  const expirouRef = useRef(false)
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])
  const ms = new Date(alvo).getTime() - agora
  useEffect(() => {
    if (!Number.isFinite(ms) || ms > 0 || expirouRef.current) return
    expirouRef.current = true
    if (onExpirar) onExpirar()
  }, [ms, onExpirar])
  if (!Number.isFinite(ms)) return <Text style={estilos.boxValor}>—</Text>
  if (ms <= 0) return <Text style={[estilos.boxValor, { color: cores.textoFraco }]}>⏰ Esgotado</Text>
  return <Text style={estilos.boxValor}>{formatarDuracao(ms, { frente, arredondar: 'cima' })}</Text>
}

const UM_DIA_MS = 24 * 60 * 60 * 1000

// demanda: a linha do reparo/obra. frente: 'servico' | 'obra'. valor: o combinado.
// usuarioId: para saber se a proposta pendente é minha. agendamento: o CardAgendamento que a
// tela monta quando o CLIENTE contrapropôs (pendente de outro) — null nos demais casos.
// enviando/onPropor: o POST /chegada-prevista do picker. onExpirar: o mesmo do relógio.
export default function BlocoPosMatchProfissional({ demanda, frente, valor, usuarioId, agendamento, enviando, onPropor, onExpirar }) {
  const ehObra = frente === 'obra'
  const [escolhendo, setEscolhendo] = useState(false)
  const pendente = demanda?.chegada_pendente_em
  const propostaPor = demanda?.chegada_proposta_por || demanda?.match_usuario_id
  const minhaPendente = !!pendente && propostaPor != null && usuarioId != null && String(propostaPor) === String(usuarioId)
  // Proposta enviada ou respondida: o picker fecha sozinho.
  useEffect(() => { setEscolhendo(false) }, [pendente])

  const limite = demanda?.expira_em
  const prazoCurto = !ehObra && !!limite && (new Date(limite).getTime() - Date.now()) < UM_DIA_MS
  const limiteTexto = formatarLimiteSP(limite)
  const temValor = valor != null && Number(valor) > 0
  const local = [demanda?.bairro, demanda?.cidade].filter(Boolean).join(' · ')

  const tituloBanner = ehObra
    ? 'ENVIE AO CLIENTE O DIA E O HORÁRIO DE INÍCIO DA OBRA'
    : prazoCurto ? 'ENVIE AO CLIENTE O HORÁRIO QUE VOCÊ PODE ATENDER' : 'ENVIE AO CLIENTE O DIA E O HORÁRIO QUE VOCÊ PODE ATENDER'
  const linhaLimite = ehObra ? '⏱️ O início precisa ser até:' : prazoCurto ? '⏱️ O horário precisa ser até:' : '⏱️ O dia e o horário precisam ser até:'
  const notaLimite = ehObra ? 'É a data que o cliente cadastrou.' : 'É o prazo que o cliente cadastrou.'
  const rotuloBotao = prazoCurto ? 'Escolher horário →' : 'Escolher dia e horário →'
  const miniTexto = ehObra ? 'Cliente · aguardando sua proposta de início' : 'Cliente · aguardando sua proposta de horário'

  return (
    <View>
      {/* 1. Card do topo */}
      <View style={estilos.topo}>
        {demanda?.categoria ? (
          <View style={estilos.categoriaPill}>
            <Text style={estilos.categoriaTexto}>{demanda.categoria}</Text>
          </View>
        ) : null}
        <Text style={estilos.titulo}>{demanda?.titulo}</Text>
        {local ? <Text style={estilos.endereco}>📍 {local}</Text> : null}
        <View style={estilos.boxesRow}>
          {temValor && (
            <View style={[estilos.box, estilos.boxValorCombinado]}>
              <Text style={[estilos.boxRotulo, { color: cores.sucesso }]}>VALOR COMBINADO</Text>
              <Text style={[estilos.boxValor, { color: cores.sucesso }]}>{formatarValor(valor)}</Text>
            </View>
          )}
          {limite && (
            <View style={estilos.box}>
              <Text style={estilos.boxRotulo}>{ehObra ? 'INÍCIO PREVISTO' : 'PRAZO PARA CHEGAR'}</Text>
              {ehObra
                ? <Text style={estilos.boxValor}>{formatarAgendado(limite) || '—'}</Text>
                : <TempoRestante alvo={limite} frente={frente} onExpirar={onExpirar} />}
            </View>
          )}
        </View>
      </View>

      {/* 2. Banner / aguardando / contraproposta do cliente */}
      {agendamento ? agendamento : minhaPendente ? (
        <View style={estilos.bannerSombra}>
          <LinearGradient colors={['#ff8a3d', '#f05a28', '#c2410c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.banner}>
            <Text style={estilos.bannerEmoji}>⏳</Text>
            <Text style={estilos.bannerTitulo}>AGUARDANDO O CLIENTE CONFIRMAR</Text>
            <View style={estilos.bannerLimite}>
              <Text style={estilos.bannerLimiteLinha}>📅 Você propôs:</Text>
              <Text style={estilos.bannerLimiteValor}>{formatarAgendado(pendente) || String(pendente)}</Text>
              <Text style={estilos.bannerLimiteNota}>O cliente pode confirmar ou sugerir outro horário.</Text>
            </View>
            <View style={estilos.bannerChip}>
              <Text style={estilos.bannerChipTexto}>🔔 Você será avisado por notificação</Text>
            </View>
          </LinearGradient>
        </View>
      ) : (
        <View style={estilos.bannerSombra}>
          <LinearGradient colors={['#ff8a3d', '#f05a28', '#c2410c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.banner}>
            <Text style={estilos.bannerEmoji}>📅</Text>
            <Text style={estilos.bannerTitulo}>{tituloBanner}</Text>
            {limiteTexto ? (
              <View style={estilos.bannerLimite}>
                <Text style={estilos.bannerLimiteLinha}>{linhaLimite}</Text>
                <Text style={estilos.bannerLimiteValor}>{limiteTexto}</Text>
                <Text style={estilos.bannerLimiteNota}>{notaLimite}</Text>
              </View>
            ) : null}
            {escolhendo ? (
              <View style={estilos.pickerWrap}>
                <PickerAgendamento
                  titulo={ehObra ? 'Quando você vai começar a obra?' : 'Quando você vai fazer o serviço?'}
                  limite={limite}
                  rotuloBotao="Enviar para o cliente confirmar"
                  enviando={enviando}
                  onEnviar={onPropor}
                  onCancelar={() => setEscolhendo(false)}
                />
              </View>
            ) : (
              <TouchableOpacity
                style={estilos.btnEscolher}
                onPress={() => setEscolhendo(true)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={rotuloBotao}
              >
                <Text style={estilos.btnEscolherTexto}>{rotuloBotao}</Text>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>
      )}

      {/* 3. Mini card do cliente */}
      <View style={estilos.mini}>
        <View style={[estilos.miniAvatar, estilos.miniAvatarVazio]}>
          <Text style={estilos.miniIniciais}>🏠</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={estilos.miniNome} numberOfLines={2}>{miniTexto}</Text>
          <Text style={estilos.miniMeta}>O contato é liberado depois do "Estou a caminho".</Text>
        </View>
      </View>

      {/* 4. Penalidade — texto intacto. Dentro do CardAgendamento ela já existe. */}
      {!agendamento && <CaixaAtencaoApp />}
    </View>
  )
}

const estilos = StyleSheet.create({
  topo: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 16, marginBottom: 14 },
  categoriaPill: { alignSelf: 'flex-start', backgroundColor: cores.primaria + '1F', borderWidth: 0.5, borderColor: cores.primaria + '55', borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 },
  categoriaTexto: { fontSize: 11, color: cores.primaria, textTransform: 'capitalize' },
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, lineHeight: 28, marginBottom: 6 },
  endereco: { fontSize: 12, color: cores.textoMedio, lineHeight: 17, marginBottom: 12 },
  boxesRow: { flexDirection: 'row', gap: 10 },
  box: { flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12 },
  boxValorCombinado: { backgroundColor: cores.sucessoSuave, borderColor: cores.sucesso + '55' },
  boxRotulo: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: cores.textoMedio, marginBottom: 4 },
  boxValor: { fontSize: 17, fontWeight: '800', color: cores.textoForte },

  bannerSombra: { borderRadius: 18, backgroundColor: '#f05a28', shadowColor: '#f05a28', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 14, elevation: 8, marginBottom: 14 },
  banner: { borderRadius: 18, overflow: 'hidden', paddingVertical: 22, paddingHorizontal: 18, alignItems: 'center' },
  bannerEmoji: { fontSize: 44, marginBottom: 8 },
  bannerTitulo: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', lineHeight: 23, letterSpacing: 0.3, marginBottom: 12 },
  bannerLimite: { alignSelf: 'stretch', backgroundColor: 'rgba(20,20,22,0.55)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginBottom: 14 },
  bannerLimiteLinha: { fontSize: 13, color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginBottom: 4 },
  bannerLimiteValor: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 4 },
  bannerLimiteNota: { fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  bannerChip: { backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  bannerChipTexto: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  btnEscolher: { alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: raios.grande, paddingVertical: 16, alignItems: 'center' },
  btnEscolherTexto: { fontSize: 16, fontWeight: '800', color: '#f05a28' },
  // O picker herda o visual escuro dos chips; dentro do banner ganha um fundo próprio.
  pickerWrap: { alignSelf: 'stretch', backgroundColor: cores.fundoCard, borderRadius: 14, padding: 12 },

  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  miniAvatar: { width: 44, height: 44, borderRadius: 22 },
  miniAvatarVazio: { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  miniIniciais: { fontSize: 20 },
  miniNome: { fontSize: 14, fontWeight: '700', color: cores.textoForte, lineHeight: 19 },
  miniMeta: { fontSize: 12, color: cores.textoMedio, marginTop: 2, lineHeight: 17 },
})
