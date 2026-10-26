import React, { useState, useEffect, useRef } from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { cores, raios } from '../utils/tema'
import { formatarDuracao } from '../utils/tempo'
import { avatar } from '../utils/imagemOtimizada'
import { CardAgendamento, PickerAgendamento, CaixaAtencaoApp, formatarAgendado } from './Agendamento'
import { formatarLimiteSP } from './PosMatchDono'
import ChipsCategoria from './ChipsCategoria'

// Bloco do PROFISSIONAL do match enquanto ele ainda não disse "Estou a caminho" (a_caminho_em
// nulo). Mesma linguagem visual do PosMatchDono, para DetalheReparo e DetalheObra não
// divergirem. Ordem fixa:
//   1. card do topo: categoria, título, bairro · cidade, "Valor combinado" e
//      "Prazo para chegar" (reparo) / "Início previsto" (obra);
//   2. o estado do horário, UM destes:
//      a) banner laranja "envie ao cliente o dia e o horário" com o limite e o botão branco
//         que abre o picker de proposta;
//      b) proposta enviada: caixa laranja "⏳ AGUARDANDO O CLIENTE CONFIRMAR" com o horário
//         proposto em destaque, o aviso de notificação e a caixa âmbar dentro;
//      c) o cliente contrapropôs: o CardAgendamento (aceitar / sugerir outro), que a tela
//         passa pronto em `agendamento`;
//      d) horário ACEITO (chegada_prevista_em): caixa verde "📅 AGENDADO" (obra: "📅 INÍCIO
//         AGENDADO") com a data em destaque, a contagem, o botão "🚗 Estou a caminho" (só
//         libera no dia agendado) e a caixa âmbar em fonte maior;
//   3. mini card do cliente — foto (avatar otimizado) quando houver, iniciais quando só
//      houver o nome, 🏠 quando a API não mandar nenhum dos dois;
//   4. a caixa âmbar da penalidade (texto intacto) — só no estado (a); nos outros ela já
//      vem dentro da própria caixa;
//   5. "📋 Contrato enviado para o seu e-mail" em UMA linha — nos estados (b) e (d), para
//      cada um caber numa tela.

const formatarValor = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const iniciaisDe = (nome) =>
  (nome || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || null

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

// Contagem até o horário agendado — o mesmo desenho do ContagemAgendado do CardAgendamento.
const ContagemAgendado = ({ alvo, frente }) => {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])
  const ms = new Date(alvo).getTime() - agora
  if (!Number.isFinite(ms)) return null
  if (ms <= 0) return <Text style={estilos.agendadoContagem}>⏰ Chegou a hora combinada</Text>
  return <Text style={estilos.agendadoContagem}>⏳ Faltam {formatarDuracao(ms, { frente, arredondar: 'cima' })}</Text>
}

const UM_DIA_MS = 24 * 60 * 60 * 1000

// demanda: a linha do reparo/obra. frente: 'servico' | 'obra'. valor: o combinado.
// usuarioId: para saber se a proposta pendente é minha. agendamento: o CardAgendamento que a
// tela monta quando o CLIENTE contrapropôs (pendente de outro) — null nos demais casos.
// enviando/onPropor: o POST /chegada-prevista do picker. onExpirar: o mesmo do relógio.
// cliente: { nome, foto_url } do solicitante, quando a API mandar (hoje não manda nenhum).
// podeDizerACaminho/onACaminho: o botão "Estou a caminho" do estado AGENDADO (handleMatch).
export default function BlocoPosMatchProfissional({ demanda, frente, valor, usuarioId, agendamento, enviando, onPropor, onExpirar, cliente, podeDizerACaminho, onACaminho }) {
  const ehObra = frente === 'obra'
  const [escolhendo, setEscolhendo] = useState(false)
  const pendente = demanda?.chegada_pendente_em
  const agendado = demanda?.chegada_prevista_em
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
  const miniTexto = agendado
    ? (ehObra ? 'Cliente · início confirmado' : 'Cliente · horário confirmado')
    : minhaPendente
      ? 'Cliente · analisando sua proposta'
      : (ehObra ? 'Cliente · aguardando sua proposta de início' : 'Cliente · aguardando sua proposta de horário')
  const iniciais = iniciaisDe(cliente?.nome)
  // Contrato em uma linha só nos estados "proposta enviada" e AGENDADO (mockup de uma tela).
  const contratoLinha = !agendamento && (!!agendado || minhaPendente)

  return (
    <View>
      {/* 1. Card do topo */}
      <View style={estilos.topo}>
        {/* Até 2 chips + "+N" (ChipsCategoria); obra e reparo antigo = o chip de sempre. */}
        <ChipsCategoria demanda={demanda} estilo={{ marginBottom: 10 }} />
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

      {/* 2. Contraproposta do cliente / AGENDADO / aguardando / banner */}
      {agendamento ? agendamento : agendado ? (
        <View style={estilos.agendadoCard}>
          <Text style={estilos.agendadoRotulo}>{ehObra ? '📅 INÍCIO AGENDADO' : '📅 AGENDADO'}</Text>
          <Text style={estilos.agendadoData}>{formatarAgendado(agendado) || String(agendado)}</Text>
          <ContagemAgendado alvo={agendado} frente={frente} />
          {/* "Estou a caminho" só libera no DIA agendado (a_caminho_em é write-once no servidor). */}
          <TouchableOpacity
            style={[estilos.btnACaminho, !podeDizerACaminho && { opacity: 0.5 }]}
            onPress={onACaminho}
            disabled={!podeDizerACaminho || !onACaminho}
            activeOpacity={0.85}
          >
            <Text style={estilos.btnACaminhoTexto}>
              {podeDizerACaminho ? '🚗 Estou a caminho!' : '🚗 Estou a caminho (libera no dia agendado)'}
            </Text>
          </TouchableOpacity>
          <CaixaAtencaoApp grande />
        </View>
      ) : minhaPendente ? (
        <View style={estilos.bannerSombra}>
          <LinearGradient colors={['#ff8a3d', '#f05a28', '#c2410c']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.banner}>
            <Text style={estilos.bannerTitulo}>⏳ AGUARDANDO O CLIENTE CONFIRMAR</Text>
            <Text style={estilos.propostaData}>{formatarAgendado(pendente) || String(pendente)}</Text>
            <Text style={estilos.bannerSub}>Você será avisado por notificação.</Text>
            <View style={estilos.ambarDentro}>
              <CaixaAtencaoApp grande />
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

      {/* 3. Mini card do cliente: foto → iniciais → 🏠 */}
      <View style={estilos.mini}>
        {cliente?.foto_url ? (
          <Image source={{ uri: avatar(cliente.foto_url) }} style={estilos.miniAvatar} />
        ) : (
          <View style={[estilos.miniAvatar, estilos.miniAvatarVazio]}>
            <Text style={iniciais ? estilos.miniIniciais : estilos.miniCasa}>{iniciais || '🏠'}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {cliente?.nome ? <Text style={estilos.miniNome} numberOfLines={1}>{cliente.nome}</Text> : null}
          <Text style={cliente?.nome ? estilos.miniMeta : estilos.miniNome} numberOfLines={2}>{miniTexto}</Text>
          <Text style={estilos.miniMeta}>O contato é liberado depois do "Estou a caminho".</Text>
        </View>
      </View>

      {/* 4. Penalidade — texto intacto. Nos outros estados ela já está dentro da caixa. */}
      {!agendamento && !agendado && !minhaPendente && <CaixaAtencaoApp />}

      {/* 5. Contrato em uma linha */}
      {contratoLinha && (
        <View style={estilos.contratoLinha}>
          <Text style={estilos.contratoTitulo} numberOfLines={1}>📋 Contrato enviado para o seu e-mail</Text>
        </View>
      )}
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
  bannerSub: { fontSize: 14, color: 'rgba(255,255,255,0.92)', textAlign: 'center', lineHeight: 20, marginBottom: 14 },
  bannerLimite: { alignSelf: 'stretch', backgroundColor: 'rgba(20,20,22,0.55)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginBottom: 14 },
  bannerLimiteLinha: { fontSize: 13, color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginBottom: 4 },
  bannerLimiteValor: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 4 },
  bannerLimiteNota: { fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  // Horário proposto em destaque (estado "aguardando o cliente confirmar").
  propostaData: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 6 },
  ambarDentro: { alignSelf: 'stretch' },
  btnEscolher: { alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: raios.grande, paddingVertical: 16, alignItems: 'center' },
  btnEscolherTexto: { fontSize: 16, fontWeight: '800', color: '#f05a28' },
  // O picker herda o visual escuro dos chips; dentro do banner ganha um fundo próprio.
  pickerWrap: { alignSelf: 'stretch', backgroundColor: cores.fundoCard, borderRadius: 14, padding: 12 },

  // Verde do card AGENDADO do CardAgendamento (mesmas cores), com a data maior.
  agendadoCard: { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.grande, padding: 16, marginBottom: 14 },
  agendadoRotulo: { fontSize: 11, fontWeight: '700', color: '#4caf50', letterSpacing: 0.5, marginBottom: 2 },
  agendadoData: { fontSize: 26, fontWeight: '800', color: '#4caf50', marginTop: 4, marginBottom: 6 },
  agendadoContagem: { fontSize: 13, color: cores.textoForte, marginBottom: 12 },
  // Mesmo btnMatch das telas de detalhe.
  btnACaminho: { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 12 },
  btnACaminhoTexto: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },

  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  miniAvatar: { width: 44, height: 44, borderRadius: 22 },
  miniAvatarVazio: { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  miniIniciais: { color: cores.primaria, fontSize: 15, fontWeight: '700' },
  miniCasa: { fontSize: 20 },
  miniNome: { fontSize: 14, fontWeight: '700', color: cores.textoForte, lineHeight: 19 },
  miniMeta: { fontSize: 12, color: cores.textoMedio, marginTop: 2, lineHeight: 17 },

  contratoLinha: { backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#4a4a8a', borderRadius: raios.medio, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16 },
  contratoTitulo: { fontSize: 13, fontWeight: '700', color: '#8888cc' },
})
