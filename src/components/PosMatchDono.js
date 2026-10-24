import React, { useState, useEffect, useRef } from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { cores, raios } from '../utils/tema'
import { formatarDuracao } from '../utils/tempo'
import { rotulosEspecialidades } from '../utils/categorias'
import { avatar } from '../utils/imagemOtimizada'
import { CaixaAtencaoApp } from './Agendamento'

// Bloco do DONO logo depois do match, enquanto o profissional ainda não disse "Estou a
// caminho" (a_caminho_em nulo). Um componente só para DetalheReparo e DetalheObra não
// divergirem — a mesma razão de components/Agendamento existir. Ordem fixa:
//   1. card do topo: categoria, título, endereço, "Valor combinado" e "Prazo para chegar";
//   2. banner laranja "aguarde o dia e o horário" — OU, quando o profissional já propôs
//      (ou o horário já foi aceito), o `agendamento` que a tela passa (CardAgendamento);
//   3. mini card do profissional escolhido;
//   4. a caixa âmbar da penalidade (CaixaAtencaoApp, texto intacto) — só com o banner, porque
//      o CardAgendamento já traz a mesma caixa dentro dele;
//   5. com `onEditarReferencia`, a linha do ponto de referência (a mesma da tela, que nesse
//      caso esconde a dela para a ordem do mockup valer);
//   6. "Contrato enviado para o seu e-mail" — o card completo com o banner; com `agendamento`
//      (proposta recebida ou AGENDADO) vira UMA linha, para o estado caber numa tela.
// O que a tela mostrava nesse estado (valor em destaque, lista de candidatos, botões de
// chegada e conclusão) fica por conta dela esconder.

const iniciaisDe = (nome) =>
  (nome || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'

const formatarValor = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

// Limite do dono em America/Sao_Paulo — é o fuso em que o prazo foi cadastrado e em que o
// servidor escreve os pushes, não o do aparelho. Intl com timeZone quando existe (Hermes
// traz Intl nas duas plataformas); sem ele cai no relógio local, que no Brasil coincide.
// "hoje, às 14:00" / "amanhã, às 14:00" / "qui, 29/10 às 14:00".
const SP_TZ = 'America/Sao_Paulo'
const DIAS_PT = { Sun: 'dom', Mon: 'seg', Tue: 'ter', Wed: 'qua', Thu: 'qui', Fri: 'sex', Sat: 'sáb' }
const DIAS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const p2 = (n) => String(n).padStart(2, '0')
const partesSP = (d) => {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: SP_TZ, hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    const o = {}
    for (const p of f.formatToParts(d)) o[p.type] = p.value
    // Alguns motores escrevem meia-noite como "24" com hour12: false.
    return { dia: o.weekday, d: o.day, m: o.month, y: o.year, hh: o.hour === '24' ? '00' : o.hour, mm: o.minute }
  } catch (e) {
    return { dia: DIAS_EN[d.getDay()], d: p2(d.getDate()), m: p2(d.getMonth() + 1), y: String(d.getFullYear()), hh: p2(d.getHours()), mm: p2(d.getMinutes()) }
  }
}
export const formatarLimiteSP = (iso, agoraMs = Date.now()) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const a = partesSP(d)
  const chave = (x) => `${x.y}-${x.m}-${x.d}`
  const hora = `${a.hh}:${a.mm}`
  if (chave(a) === chave(partesSP(new Date(agoraMs)))) return `hoje, às ${hora}`
  if (chave(a) === chave(partesSP(new Date(agoraMs + 86400000)))) return `amanhã, às ${hora}`
  return `${DIAS_PT[a.dia] || a.dia}, ${a.d}/${a.m} às ${hora}`
}

const UM_DIA_MS = 24 * 60 * 60 * 1000

// Contagem até `alvo` (chegada prevista ou prazo da demanda). Tique de 30 s: o rótulo é em
// minutos. `onExpirar` dispara UMA vez ao zerar — é o mesmo gancho do RelogioRegressivo das
// telas, que este box substitui no estado pós-match do dono.
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

export default function BlocoPosMatchDono({ demanda, frente, endereco, valor, profissional, agendamento, onExpirar, pontoReferencia, onEditarReferencia }) {
  const alvoPrazo = demanda?.chegada_prevista_em || demanda?.expira_em
  // Banner: a menos de 24 h do limite não há "dia" a escolher, só o horário. Lido uma vez
  // por render — o banner não precisa acompanhar o relógio como o box do prazo.
  const prazoCurto = !!alvoPrazo && (new Date(alvoPrazo).getTime() - Date.now()) < UM_DIA_MS
  const limiteTexto = formatarLimiteSP(alvoPrazo)
  const temValor = valor != null && Number(valor) > 0
  const nota = profissional?.avaliacoes_total > 0
    ? `⭐ ${Number(profissional.avaliacoes_media).toFixed(1)} (${profissional.avaliacoes_total} ${profissional.avaliacoes_total === 1 ? 'avaliação' : 'avaliações'})`
    : '🆕 Novo na plataforma'
  const especialidades = rotulosEspecialidades(profissional?.especialidades)

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
        {endereco ? <Text style={estilos.endereco}>📍 {endereco}</Text> : null}
        <View style={estilos.boxesRow}>
          {temValor && (
            <View style={[estilos.box, estilos.boxValorCombinado]}>
              <Text style={[estilos.boxRotulo, { color: cores.sucesso }]}>VALOR COMBINADO</Text>
              <Text style={[estilos.boxValor, { color: cores.sucesso }]}>{formatarValor(valor)}</Text>
            </View>
          )}
          {alvoPrazo && (
            <View style={estilos.box}>
              <Text style={estilos.boxRotulo}>PRAZO PARA CHEGAR</Text>
              <TempoRestante alvo={alvoPrazo} frente={frente} onExpirar={onExpirar} />
            </View>
          )}
        </View>
      </View>

      {/* 2. Banner laranja OU o card de agendamento (proposta a responder / agendado) */}
      {agendamento ? agendamento : (
        <View style={estilos.bannerSombra}>
          <LinearGradient
            colors={['#ff8a3d', '#f05a28', '#c2410c']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={estilos.banner}
          >
            <Text style={estilos.bannerEmoji}>⏳</Text>
            <Text style={estilos.bannerTitulo}>{prazoCurto ? 'AGUARDE O PROFISSIONAL ENVIAR O HORÁRIO' : 'AGUARDE O PROFISSIONAL ENVIAR O DIA E O HORÁRIO'}</Text>
            <Text style={estilos.bannerSub}>Depois é só você concordar ou sugerir outro.</Text>
            {limiteTexto ? (
              <View style={estilos.bannerLimite}>
                <Text style={estilos.bannerLimiteLinha}>{prazoCurto ? '📅 O horário precisa ser até:' : '📅 O dia e o horário precisam ser até:'}</Text>
                <Text style={estilos.bannerLimiteValor}>{limiteTexto}</Text>
                <Text style={estilos.bannerLimiteNota}>É o prazo que você cadastrou.</Text>
              </View>
            ) : null}
            <View style={estilos.bannerChip}>
              <Text style={estilos.bannerChipTexto}>🔔 Você será avisado por notificação</Text>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* 3. Mini card do profissional escolhido */}
      {profissional ? (
        <View style={estilos.mini}>
          <Text style={estilos.miniRotulo}>PROFISSIONAL ESCOLHIDO</Text>
          <View style={estilos.miniLinha}>
            {profissional.foto_url ? (
              <Image source={{ uri: avatar(profissional.foto_url) }} style={estilos.miniAvatar} />
            ) : (
              <View style={[estilos.miniAvatar, estilos.miniAvatarVazio]}>
                <Text style={estilos.miniIniciais}>{iniciaisDe(profissional.nome)}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={estilos.miniNome} numberOfLines={1}>{profissional.nome}</Text>
              <Text style={estilos.miniNota}>{nota}</Text>
              {profissional.cidade ? <Text style={estilos.miniMeta} numberOfLines={1}>📍 {profissional.cidade}{profissional.bairro ? `, ${profissional.bairro}` : ''}</Text> : null}
              {especialidades ? <Text style={estilos.miniMeta} numberOfLines={2}>🛠 {especialidades}</Text> : null}
            </View>
          </View>
        </View>
      ) : null}

      {/* 4. Penalidade — texto intacto. Dentro do CardAgendamento ela já existe. */}
      {!agendamento && <CaixaAtencaoApp />}

      {/* 5. Ponto de referência (só quando a tela delega a linha para cá) */}
      {onEditarReferencia ? (
        <TouchableOpacity onPress={onEditarReferencia} activeOpacity={0.7}>
          {pontoReferencia ? (
            <Text style={estilos.referenciaLinha}>
              🔎 Referência: {pontoReferencia}
              <Text style={estilos.referenciaAcao}>  editar</Text>
            </Text>
          ) : (
            <Text style={estilos.referenciaVazia}>🔎 Adicionar ponto de referência</Text>
          )}
        </TouchableOpacity>
      ) : null}

      {/* 6. Contrato */}
      {agendamento ? (
        <View style={estilos.contratoLinha}>
          <Text style={estilos.contratoTitulo} numberOfLines={1}>📋 Contrato enviado para o seu e-mail</Text>
        </View>
      ) : (
        <View style={estilos.contrato}>
          <Text style={estilos.contratoTitulo}>📋 Contrato enviado para o seu e-mail</Text>
          <Text style={estilos.contratoTexto}>
            Enviamos um contrato simples para o seu e-mail e para o da outra parte. Usar é opcional — mas é ele que protege vocês dois.
          </Text>
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
  bannerTitulo: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', textAlign: 'center', lineHeight: 23, letterSpacing: 0.3, marginBottom: 8 },
  bannerSub: { fontSize: 14, color: 'rgba(255,255,255,0.92)', textAlign: 'center', lineHeight: 20, marginBottom: 14 },
  bannerLimite: { alignSelf: 'stretch', backgroundColor: 'rgba(20,20,22,0.55)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', marginBottom: 12 },
  bannerLimiteLinha: { fontSize: 13, color: 'rgba(255,255,255,0.92)', textAlign: 'center', marginBottom: 4 },
  bannerLimiteValor: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginBottom: 4 },
  bannerLimiteNota: { fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  bannerChip: { backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  bannerChipTexto: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  mini: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  miniRotulo: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: cores.textoMedio, marginBottom: 10 },
  miniLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  miniAvatar: { width: 44, height: 44, borderRadius: 22 },
  miniAvatarVazio: { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  miniIniciais: { color: cores.primaria, fontSize: 15, fontWeight: '700' },
  miniNome: { fontSize: 15, fontWeight: '700', color: cores.textoForte },
  miniNota: { fontSize: 12, color: cores.primaria, fontWeight: '600', marginTop: 2 },
  miniMeta: { fontSize: 12, color: cores.textoMedio, marginTop: 2, lineHeight: 17 },

  // Mesmo visual das linhas de referência da tela (pontoReferenciaLinha / referenciaVazia),
  // sem o marginTop negativo — aqui não há linha de endereço acima a colar.
  referenciaLinha: { fontSize: 13, color: cores.textoMedio, lineHeight: 19, marginBottom: 14 },
  referenciaAcao: { fontSize: 12, color: cores.primaria, fontWeight: '600' },
  referenciaVazia: { fontSize: 12, color: cores.primaria, fontWeight: '600', marginBottom: 14 },

  contrato: { backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#4a4a8a', borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  contratoLinha: { backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#4a4a8a', borderRadius: raios.medio, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16 },
  contratoTitulo: { fontSize: 13, fontWeight: '700', color: '#8888cc', marginBottom: 8 },
  contratoTexto: { fontSize: 12, color: cores.textoMedio, lineHeight: 19 },
})
