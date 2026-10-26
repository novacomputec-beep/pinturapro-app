import React, { useState, useEffect, useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native'
import { cores, raios } from '../utils/tema'
import { formatarDuracao } from '../utils/tempo'

// Agendamento do serviço (dia + hora) negociado entre o profissional e o solicitante, em
// cima das colunas chegada_pendente_* / chegada_prevista_em da API (obras e reparos, mesmas
// colunas — utils/agendamento no servidor). Tudo que as duas telas de detalhe mostram sobre
// o horário mora aqui, para DetalheReparo e DetalheObra não divergirem:
//   PickerAgendamento  — chips de dia + hora, envia um instante ISO com o fuso do aparelho;
//   CardAgendamento    — o estado da negociação: proposta a responder, aguardando o outro
//                        lado, ou AGENDADO (card verde com contagem e os lembretes);
//   ModalCompareceu    — "🤔 O profissional veio?" (POST /:id/confirmar-comparecimento);
//   Caixa*             — os avisos fixos (reputação, concluir pelo app, atenção).
//
// Fluxo da API: o profissional casado propõe (POST /:id/chegada-prevista {data_hora}); o
// outro lado aceita ou contrapropõe (POST /:id/chegada-prevista/responder {acao, data_hora}),
// até RODADAS_MAX propostas. Quem propôs espera; só o outro lado responde.

export const RODADAS_MAX_AGENDAMENTO = 10
const HORA_INICIO = 6
const HORA_FIM = 21
const MAX_DIAS = 30
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const p2 = (n) => String(n).padStart(2, '0')

// "Qui, 23/10 às 14:00" no fuso do aparelho — mesmo desenho do formatarDataHoraSP da API,
// que escreve os pushes. Tabela fixa, não Intl: o texto não depende do que o motor JS sabe
// de pt-BR. Data ilegível devolve null e quem chama decide o que mostrar.
export const formatarAgendado = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${DIAS_CURTOS[d.getDay()]}, ${p2(d.getDate())}/${p2(d.getMonth() + 1)} às ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export const primeiroNome = (nome) => ((nome || '').trim().split(/\s+/)[0]) || null

const inicioDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

// O "Estou a caminho" só libera no DIA agendado (meia-noite local em diante).
export const diaAgendadoChegou = (iso, agoraMs = Date.now()) => {
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  return inicioDoDia(d).getTime() <= agoraMs
}

// ISO 8601 COM o fuso do aparelho (2026-10-23T14:00-03:00): a API lê o instante exato e não
// precisa assumir America/Sao_Paulo — quem está fora de Brasília manda o horário certo.
const isoComFuso = (d) => {
  const off = -d.getTimezoneOffset()
  const sinal = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}${sinal}${p2(Math.floor(abs / 60))}:${p2(abs % 60)}`
}

// ---------------------------------------------------------------------------------------
// Caixas fixas
// ---------------------------------------------------------------------------------------

// Profissional: por que concluir pelo app vale para ELE.
export const CaixaReputacao = () => (
  <View style={estilos.caixaAzul}>
    <Text style={estilos.caixaAzulTexto}>⭐ Sua reputação nasce aqui. Só os serviços concluídos pelo app viram avaliação e contam no seu histórico, e é isso que coloca você na frente nos próximos pedidos.</Text>
  </View>
)

// Solicitante: por que concluir pelo app vale para ELE.
export const CaixaConcluaPeloApp = () => (
  <View style={estilos.caixaAzul}>
    <Text style={estilos.caixaAzulTexto}>🛡️ Combinem tudo, mas concluam pelo app. Assim você avalia o profissional, pode denunciar se algo der errado e ajuda outras pessoas a escolherem bem.</Text>
  </View>
)

// Âmbar: na celebração do match e em TODO card de agendamento. `compacta` tira a margem
// inferior para caber dentro do modal da celebração. `grande` sobe a fonte (card AGENDADO
// do dono antes do "Estou a caminho", onde ela é o único aviso da tela).
export const CaixaAtencaoApp = ({ compacta, grande }) => (
  <View style={[estilos.caixaAmbar, compacta && { marginBottom: 16 }, grande && { marginBottom: 0 }]}>
    <Text style={[estilos.caixaAmbarTexto, grande && estilos.caixaAmbarTextoGrande]}>⚠️ Atenção: mesmo que conversem pelo WhatsApp, o dia, o horário e a conclusão do serviço devem ser registrados aqui no app. Agendar ou concluir o serviço fora do ProTudo gera penalidade para os dois. Cancelar com menos de 12h de antecedência conta como falta.</Text>
  </View>
)

// ---------------------------------------------------------------------------------------
// Picker de dia + hora
// ---------------------------------------------------------------------------------------

// `limite` (expira_em da demanda) é o teto dos chips: a API recusa (400) um horário do
// profissional depois do prazo. null = sem teto (a contraproposta do dono estica o prazo).
// Só o FUTURO entra: hora cheia de 06:00 a 21:00 cujo início ainda não passou.
export function PickerAgendamento({ titulo, limite, rotuloBotao, enviando, onEnviar, onCancelar }) {
  // Relógio lido UMA vez por montagem: os chips não precisam mudar enquanto a pessoa escolhe.
  const [agoraMs] = useState(() => Date.now())
  const limiteMs = limite ? new Date(limite).getTime() : NaN
  const temLimite = Number.isFinite(limiteMs)

  const horasDe = (dia) => {
    const r = []
    for (let h = HORA_INICIO; h <= HORA_FIM; h++) {
      const s = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), h, 0, 0, 0)
      if (s.getTime() <= agoraMs) continue
      if (temLimite && s.getTime() > limiteMs) continue
      r.push(s)
    }
    return r
  }

  const dias = useMemo(() => {
    const hoje = inicioDoDia(new Date(agoraMs))
    const lista = []
    for (let i = 0; i < MAX_DIAS; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i)
      if (temLimite && d.getTime() > limiteMs) break
      const horas = horasDe(d)
      if (horas.length === 0) continue
      lista.push({
        chave: d.getTime(),
        data: d,
        horas,
        rotulo: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : `${DIAS_CURTOS[d.getDay()]} ${p2(d.getDate())}`,
      })
    }
    return lista
  }, [agoraMs, limiteMs, temLimite])

  const [diaChave, setDiaChave] = useState(null)
  const [horaMs, setHoraMs] = useState(null)
  const dia = dias.find(d => d.chave === diaChave) || dias[0] || null
  const hora = dia ? dia.horas.find(h => h.getTime() === horaMs) || null : null

  const escolherDia = (d) => { setDiaChave(d.chave); setHoraMs(null) }
  const enviar = () => { if (hora && !enviando) onEnviar(isoComFuso(hora)) }

  return (
    <View style={estilos.pickerWrap}>
      <Text style={estilos.pickerTitulo}>{titulo}</Text>
      {temLimite && (
        <Text style={estilos.pickerSub}>Dentro do prazo do pedido: até {formatarAgendado(limite) || '—'}</Text>
      )}
      {dias.length === 0 ? (
        <Text style={estilos.pickerVazio}>Não há horário disponível dentro do prazo do pedido. Peça ao solicitante para aumentar o prazo.</Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.chipsLinha} keyboardShouldPersistTaps="handled">
            {dias.map(d => {
              const ativo = dia && d.chave === dia.chave
              return (
                <TouchableOpacity key={d.chave} style={[estilos.chip, ativo && estilos.chipAtivo]} onPress={() => escolherDia(d)} disabled={enviando} activeOpacity={0.7}>
                  <Text style={[estilos.chipTexto, ativo && estilos.chipTextoAtivo]}>{d.rotulo}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          <View style={estilos.chipsGrade}>
            {(dia ? dia.horas : []).map(h => {
              const ativo = hora && h.getTime() === hora.getTime()
              return (
                <TouchableOpacity key={h.getTime()} style={[estilos.chip, ativo && estilos.chipAtivo]} onPress={() => setHoraMs(h.getTime())} disabled={enviando} activeOpacity={0.7}>
                  <Text style={[estilos.chipTexto, ativo && estilos.chipTextoAtivo]}>{p2(h.getHours())}:00</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <TouchableOpacity
            style={[estilos.btnEnviar, (!hora || enviando) && { opacity: 0.5 }]}
            onPress={enviar}
            disabled={!hora || enviando}
            activeOpacity={0.85}
          >
            <Text style={estilos.btnEnviarTexto}>{enviando ? 'Enviando…' : rotuloBotao}</Text>
          </TouchableOpacity>
        </>
      )}
      {onCancelar && (
        <TouchableOpacity style={estilos.btnCancelar} onPress={onCancelar} disabled={enviando}>
          <Text style={estilos.btnCancelarTexto}>Cancelar</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------------------
// Contagem até o horário agendado
// ---------------------------------------------------------------------------------------

// Tique de 30 s: o rótulo é em minutos (régua de utils/tempo), e re-renderizar o card a
// cada segundo não acrescentaria nada.
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

// ---------------------------------------------------------------------------------------
// Card do estado da negociação
// ---------------------------------------------------------------------------------------

// demanda: a linha do reparo/obra (chegada_prevista_em, chegada_pendente_em,
//          chegada_proposta_por, chegada_pendente_rodada, match_usuario_id).
// souDono / nomeOutro: quem vê e como chamar o outro lado ("Carlos", ou o genérico).
// limite: expira_em — teto do picker do PROFISSIONAL; o dono contrapropõe sem teto.
// podePropor: quem pode abrir a 1ª proposta (só o profissional do match, regra da API).
// onPropor(iso) → POST /chegada-prevista; onResponder(acao, iso?) → POST /responder.
// agendadoDestaque: o card AGENDADO do DONO antes do "Estou a caminho" (dentro do
//          BlocoPosMatchDono) — data maior, sem a lista de lembretes e com a caixa âmbar em
//          fonte maior, para o estado caber numa tela. Os demais usos seguem iguais.
export function CardAgendamento({ demanda, usuarioId, souDono, nomeOutro, limite, frente, podePropor, enviando, respondendo, onPropor, onResponder, agendadoDestaque }) {
  const [sugerindo, setSugerindo] = useState(false)
  const prevista = demanda?.chegada_prevista_em
  const pendente = demanda?.chegada_pendente_em
  const propostaPor = demanda?.chegada_proposta_por || demanda?.match_usuario_id
  // A troca de pendência (resposta chegou, nova proposta) fecha o picker de contraproposta.
  useEffect(() => { setSugerindo(false) }, [pendente, propostaPor])

  const nome = nomeOutro || (souDono ? 'o profissional' : 'o solicitante')
  const Nome = nome.charAt(0).toUpperCase() + nome.slice(1)

  if (prevista) {
    if (agendadoDestaque) {
      return (
        <View style={estilos.agendadoCard}>
          <Text style={estilos.agendadoRotulo}>📅 AGENDADO</Text>
          <Text style={estilos.agendadoDataGrande}>{formatarAgendado(prevista) || String(prevista)}</Text>
          <ContagemAgendado alvo={prevista} frente={frente} />
          <CaixaAtencaoApp grande />
        </View>
      )
    }
    return (
      <View style={estilos.agendadoCard}>
        <Text style={estilos.agendadoRotulo}>📅 AGENDADO</Text>
        <Text style={estilos.agendadoData}>{formatarAgendado(prevista) || String(prevista)}</Text>
        <ContagemAgendado alvo={prevista} frente={frente} />
        <Text style={estilos.lembreteTitulo}>O app vai te lembrar:</Text>
        <Text style={estilos.lembreteItem}>• na véspera às 18h</Text>
        <Text style={estilos.lembreteItem}>• 2 horas antes</Text>
        <Text style={estilos.lembreteItem}>• na hora de sair</Text>
        <CaixaAtencaoApp compacta />
      </View>
    )
  }

  if (pendente) {
    const minha = propostaPor != null && usuarioId != null && String(propostaPor) === String(usuarioId)
    if (minha) {
      return (
        <View style={estilos.aguardandoCard}>
          <Text style={estilos.aguardandoTexto}>⏳ Aguardando {nome} confirmar {formatarAgendado(pendente) || ''}</Text>
          <CaixaAtencaoApp compacta />
        </View>
      )
    }
    if (sugerindo) {
      return (
        <View style={estilos.propostaCard}>
          <PickerAgendamento
            titulo="Quando você vai fazer o serviço?"
            limite={souDono ? null : limite}
            rotuloBotao={`Enviar para ${nome}`}
            enviando={respondendo}
            onEnviar={(iso) => onResponder('contraproposta', iso)}
            onCancelar={() => setSugerindo(false)}
          />
          <CaixaAtencaoApp compacta />
        </View>
      )
    }
    // sugestoes_restantes (API): quantas contrapropostas ESTE lado ainda pode mandar. Com o
    // campo, ele manda: 0 esconde "Sugerir outro"; 1 ou 2 avisam embaixo dos botões. Sem o
    // campo (API antiga), vale a régua local de rodadas, como antes.
    const restantesBruto = demanda?.sugestoes_restantes
    const restantes = (restantesBruto == null || restantesBruto === '' || !Number.isFinite(Number(restantesBruto)))
      ? null
      : Math.max(0, Math.floor(Number(restantesBruto)))
    const esgotou = restantes != null
      ? restantes === 0
      : (Number(demanda?.chegada_pendente_rodada) || 0) >= RODADAS_MAX_AGENDAMENTO
    const avisoRestantes = restantes === 2 ? 'Você só pode sugerir mais 2 vezes' : restantes === 1 ? 'Você só pode sugerir mais 1 vez' : null
    return (
      <View style={estilos.propostaCard}>
        <Text style={estilos.propostaTitulo}>📅 {Nome} propôs {formatarAgendado(pendente) || String(pendente)}</Text>
        <Text style={estilos.propostaSub}>Confirme o horário ou sugira outro.</Text>
        <View style={estilos.botoesRow}>
          <TouchableOpacity style={[estilos.btnConfirmar, respondendo && { opacity: 0.6 }]} onPress={() => onResponder('aceitar')} disabled={respondendo} activeOpacity={0.85}>
            <Text style={estilos.btnConfirmarTexto}>{respondendo ? 'Enviando…' : '✓ Confirmar'}</Text>
          </TouchableOpacity>
          {!esgotou && (
            <TouchableOpacity style={[estilos.btnSugerir, respondendo && { opacity: 0.6 }]} onPress={() => setSugerindo(true)} disabled={respondendo} activeOpacity={0.85}>
              <Text style={estilos.btnSugerirTexto}>Sugerir outro</Text>
            </TouchableOpacity>
          )}
        </View>
        {!esgotou && avisoRestantes ? <Text style={estilos.avisoRestantes}>{avisoRestantes}</Text> : null}
        {esgotou && (
          <Text style={estilos.propostaSub}>
            {restantes != null ? 'Limite de sugestões atingido — confirme o horário proposto.' : 'Limite de propostas atingido: resta confirmar este horário.'}
          </Text>
        )}
        <CaixaAtencaoApp compacta />
      </View>
    )
  }

  if (!podePropor) return null
  const esgotou = (Number(demanda?.chegada_pendente_rodada) || 0) >= RODADAS_MAX_AGENDAMENTO
  return (
    <View style={estilos.propostaCard}>
      {esgotou ? (
        <Text style={estilos.pickerVazio}>Limite de propostas de horário atingido. Combine com o solicitante e peça que ele aumente o prazo, se precisar.</Text>
      ) : (
        <PickerAgendamento
          titulo="Quando você vai fazer o serviço?"
          limite={limite}
          rotuloBotao="Enviar para o cliente confirmar"
          enviando={enviando}
          onEnviar={onPropor}
        />
      )}
      <CaixaAtencaoApp compacta />
    </View>
  )
}

// ---------------------------------------------------------------------------------------
// Modal do dono: "🤔 O profissional veio?"
// ---------------------------------------------------------------------------------------

export function ModalCompareceu({ visivel, enviando, onResponder, onFechar }) {
  return (
    <Modal visible={visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.modalCard}>
          <Text style={estilos.modalTitulo}>🤔 O profissional veio?</Text>
          <Text style={estilos.modalSub}>O horário combinado já passou. Conte para a gente o que aconteceu.</Text>
          <TouchableOpacity style={[estilos.btnConfirmar, { width: '100%', marginBottom: 10 }, enviando && { opacity: 0.6 }]} onPress={() => onResponder('sim')} disabled={enviando} activeOpacity={0.85}>
            <Text style={estilos.btnConfirmarTexto}>✅ Sim, o serviço foi feito</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[estilos.btnNaoVeio, enviando && { opacity: 0.6 }]} onPress={() => onResponder('nao')} disabled={enviando} activeOpacity={0.85}>
            <Text style={estilos.btnNaoVeioTexto}>🚫 Não veio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[estilos.btnSugerir, { width: '100%' }, enviando && { opacity: 0.6 }]} onPress={() => onResponder('remarcar')} disabled={enviando} activeOpacity={0.85}>
            <Text style={estilos.btnSugerirTexto}>🕐 Ainda vai acontecer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.btnCancelar} onPress={onFechar} disabled={enviando} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={estilos.btnCancelarTexto}>{enviando ? 'Enviando…' : 'Fechar'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  // Azul informativo: o par infoSuave/infoBorda do tema, como o ConviteCadastroServicos.
  caixaAzul:        { backgroundColor: cores.infoSuave, borderWidth: 1, borderColor: cores.infoBorda, borderRadius: raios.medio, padding: 14, marginBottom: 12 },
  caixaAzulTexto:   { fontSize: 13, color: cores.textoForte, lineHeight: 19 },
  // Âmbar: mesma caixa do pedido de tempo das telas de detalhe (#3a2a00 / laranja).
  caixaAmbar:       { backgroundColor: '#3a2a00', borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.medio, padding: 12, marginBottom: 12 },
  caixaAmbarTexto:  { fontSize: 12, color: cores.textoForte, lineHeight: 18 },
  caixaAmbarTextoGrande: { fontSize: 14, lineHeight: 21 },

  pickerWrap:       { marginBottom: 12 },
  pickerTitulo:     { fontSize: 14, fontWeight: '700', color: cores.textoForte, marginBottom: 4 },
  pickerSub:        { fontSize: 12, color: cores.textoMedio, marginBottom: 10 },
  pickerVazio:      { fontSize: 13, color: cores.textoMedio, lineHeight: 20, marginBottom: 8 },
  chipsLinha:       { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  chipsGrade:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  // Mesmo chip das janelas antigas (janelaOpcao do detalhe).
  chip:             { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 8 },
  chipAtivo:        { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
  chipTexto:        { fontSize: 13, fontWeight: '600', color: cores.textoForte },
  chipTextoAtivo:   { color: cores.primaria },
  btnEnviar:        { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center' },
  btnEnviarTexto:   { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  btnCancelar:      { paddingVertical: 10, alignItems: 'center' },
  btnCancelarTexto: { color: cores.textoFraco, fontSize: 13 },

  // Verde do "em andamento" das telas de detalhe.
  agendadoCard:     { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.grande, padding: 16, marginBottom: 12 },
  agendadoRotulo:   { fontSize: 11, fontWeight: '700', color: '#4caf50', letterSpacing: 0.5, marginBottom: 2 },
  agendadoData:     { fontSize: 18, fontWeight: '700', color: '#4caf50', marginBottom: 4 },
  agendadoDataGrande: { fontSize: 26, fontWeight: '800', color: '#4caf50', marginTop: 4, marginBottom: 6 },
  agendadoContagem: { fontSize: 13, color: cores.textoForte, marginBottom: 10 },
  lembreteTitulo:   { fontSize: 12, fontWeight: '600', color: cores.textoMedio, marginBottom: 2 },
  lembreteItem:     { fontSize: 12, color: cores.textoMedio, lineHeight: 18 },

  // Laranja da caixa de pedido (pedidoAlertaBox das telas de detalhe).
  propostaCard:     { backgroundColor: '#3a2a00', borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.grande, padding: 16, marginBottom: 12 },
  propostaTitulo:   { fontSize: 14, fontWeight: '700', color: cores.primaria, marginBottom: 4 },
  propostaSub:      { fontSize: 12, color: cores.textoMedio, marginBottom: 10, lineHeight: 18 },
  botoesRow:        { flexDirection: 'row', gap: 10, marginBottom: 12 },
  // Linha âmbar pequena embaixo dos botões (sugestões restantes).
  avisoRestantes:   { fontSize: 12, fontWeight: '600', color: cores.primaria, marginTop: -4, marginBottom: 10 },
  btnConfirmar:     { flex: 1, backgroundColor: cores.sucesso, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  btnConfirmarTexto:{ fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  btnSugerir:       { flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  btnSugerirTexto:  { fontSize: 13, fontWeight: '700', color: cores.textoForte },
  btnNaoVeio:       { width: '100%', backgroundColor: '#3a1a1a', borderWidth: 1, borderColor: '#f44336', borderRadius: raios.medio, padding: 12, alignItems: 'center', marginBottom: 10 },
  btnNaoVeioTexto:  { fontSize: 13, fontWeight: '700', color: '#f44336' },

  aguardandoCard:   { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 14, marginBottom: 12 },
  aguardandoTexto:  { fontSize: 13, color: cores.textoMedio, textAlign: 'center', lineHeight: 20, marginBottom: 10 },

  backdrop:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  modalCard:        { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.primaria, padding: 24 },
  modalTitulo:      { fontSize: 20, fontWeight: '800', color: cores.primaria, textAlign: 'center', marginBottom: 8 },
  modalSub:         { fontSize: 13, color: cores.textoMedio, textAlign: 'center', lineHeight: 20, marginBottom: 18 },
})
