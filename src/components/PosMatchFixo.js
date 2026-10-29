import React, { useState, useEffect, useRef } from 'react'
import { View, Text, Image, TouchableOpacity, Modal, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios } from '../utils/tema'
import { formatarDuracao } from '../utils/tempo'
import { rotulosEspecialidades } from '../utils/categorias'
import { avatar } from '../utils/imagemOtimizada'
import { rotuloMotivo } from '../utils/cancelamento'
import ChipsCategoria from './ChipsCategoria'
import { formatarAgendado, PickerAgendamento, RODADAS_MAX_AGENDAMENTO } from './Agendamento'

// Tela FIXA do pós-match (dono e profissional, reparo e obra) nas cinco fases entre o match
// e o encerramento: aguardando horário, horário proposto, agendado, a caminho, em andamento.
//
// Fixa POR CONSTRUÇÃO: nenhum ScrollView aqui. O corpo é um View flex:1 com
// justifyContent 'space-evenly' entre o cabeçalho da tela e a barra de abas, então os blocos
// se espalham proporcionalmente — nunca empilhados no topo com vazio embaixo. Para isso
// todo Text tem numberOfLines e maxFontSizeMultiplier 1.15 (o componente T abaixo), e as
// variantes de cada fase (vigia, pedido de cancelamento, pedido de atraso/atrasado, chegada
// declarada, reagendamento pendente) entram DENTRO do bloco de estado ou NO LUGAR dele,
// nunca somadas embaixo. Orçamento: ≤ 630dp em 360×780 (ver tabela no PR).
//
// Ordem fixa dos blocos:
//   1. card do topo: chips, título (1 linha), endereço (1 linha) e UMA faixa dividida ao
//      meio — "VALOR COMBINADO" verde | rótulo/valor do estado (prazo para chegar / faltam /
//      chega até / chegou às);
//   2. o bloco de estado da fase, com o conteúdo e as ações de hoje;
//   3. mini card da outra parte (nome, selo/nota, especialidade ou "Cliente");
//   4. aviso âmbar encurtado (3 linhas) — só nas fases em que ele aparece hoje;
//   5. uma linha de links: Ponto de referência (dono), Descrição e fotos, Contrato,
//      Denunciar (em andamento);
//   6. "Cancelar serviço" por último, nas fases em que existe hoje (até o "Estou a caminho").
//
// Os blocos só DESENHAM: handlers, chamadas de API e regras seguem nas telas, que passam
// tudo pronto. O picker de dia/hora (primeira proposta e "Sugerir outro") abre numa folha
// de baixo (FolhaPicker) em vez de inline, para a tela não crescer.

const MFS = 1.15
// Todo texto desta tela: 1 linha por padrão, teto de escala 1.15.
const T = ({ linhas = 1, ...p }) => <Text numberOfLines={linhas} maxFontSizeMultiplier={MFS} {...p} />

const formatarValor = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const p2 = (n) => String(n).padStart(2, '0')
const iniciaisDe = (nome) =>
  (nome || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || null
const primeiroNomeDe = (nome, padrao) => (String(nome || '').trim().split(/\s+/)[0] || padrao)

const horaDe = (iso) => {
  if (iso == null || iso === '') return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}
// Limite da demanda em America/Sao_Paulo — é o fuso em que o prazo foi cadastrado e em que o
// servidor escreve os pushes, não o do aparelho. Intl com timeZone quando existe (Hermes
// traz Intl nas duas plataformas); sem ele cai no relógio local, que no Brasil coincide.
// "hoje, às 14:00" / "amanhã, às 14:00" / "qui, 29/10 às 14:00".
const SP_TZ = 'America/Sao_Paulo'
const DIAS_PT = { Sun: 'dom', Mon: 'seg', Tue: 'ter', Wed: 'qua', Thu: 'qui', Fri: 'sex', Sat: 'sáb' }
const DIAS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
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
// "às HH:MM" hoje; "dd/mm às HH:MM" noutro dia.
const quandoTexto = (iso) => {
  const hora = horaDe(iso)
  if (!hora) return null
  const d = new Date(iso), h = new Date()
  const mesmoDia = d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate()
  return mesmoDia ? `às ${hora}` : `${p2(d.getDate())}/${p2(d.getMonth() + 1)} às ${hora}`
}
// "2d 3h" · "3h 20min" · "45min"; zero ou negativo → null.
const duracaoCurta = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return null
  const totalMin = Math.ceil(ms / 60000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`
  return `${m}min`
}
const TOLERANCIA_PADRAO_MS = 15 * 60000
const AUTO_ENCERRAR_MS = { reparo: 3 * 3600000, obra: 2 * 86400000 }
const CONTRATO_TEXTO = 'Enviamos um contrato simples para o seu e-mail e para o da outra parte. Usar é opcional — mas é ele que protege vocês dois.'

// Relógio de 30 s dentro de quem precisa (os textos são em minutos).
const useAgora = () => {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])
  return agora
}

// Contagem até `alvo` com onExpirar UMA vez ao zerar — o mesmo gancho do TempoRestante dos
// blocos antigos (dispara o /expirar-match quando o alvo é o prazo da demanda).
const useContagem = (alvo, onExpirar) => {
  const agora = useAgora()
  const expirouRef = useRef(false)
  const ms = alvo ? new Date(alvo).getTime() - agora : NaN
  useEffect(() => {
    if (!Number.isFinite(ms) || ms > 0 || expirouRef.current) return
    expirouRef.current = true
    if (onExpirar) onExpirar()
  }, [ms, onExpirar])
  return ms
}

// ---------------------------------------------------------------------------------------
// Peças
// ---------------------------------------------------------------------------------------

// 1. Card do topo. `faixa`: { rotulo, valor, destaque } — a metade direita da faixa.
const CardTopo = ({ demanda, endereco, pontoReferencia, valor, faixa }) => {
  const temValor = valor != null && Number(valor) > 0
  return (
    <View style={estilos.topo}>
      <ChipsCategoria demanda={demanda} estilo={{ marginBottom: 6 }} />
      <T style={estilos.titulo}>{demanda?.titulo}</T>
      {endereco ? <T style={estilos.endereco}>📍 {endereco}{pontoReferencia ? ` · 🔎 ${pontoReferencia}` : ''}</T> : null}
      <View style={estilos.faixa}>
        <View style={[estilos.faixaMetade, estilos.faixaValor, !temValor && { opacity: 0.5 }]}>
          <T style={[estilos.faixaRotulo, { color: cores.sucesso }]}>VALOR COMBINADO</T>
          <T style={[estilos.faixaNumero, { color: cores.sucesso }]}>{temValor ? formatarValor(valor) : '—'}</T>
        </View>
        <View style={[estilos.faixaMetade, faixa?.destaque && estilos.faixaDestaque]}>
          <T style={[estilos.faixaRotulo, faixa?.destaque && { color: cores.primaria }]}>{faixa?.rotulo || ' '}</T>
          <T style={[estilos.faixaNumero, faixa?.destaque && { color: cores.primaria }]}>{faixa?.valor || '—'}</T>
        </View>
      </View>
    </View>
  )
}

// 3. Mini card da outra parte: foto → iniciais → 🏠/👷. Exportado: a tela de avaliação
// (ModalAvaliacao) mostra o MESMO card do profissional.
export const MiniPessoa = ({ souDono, outro, linha2 }) => {
  const nota = souDono
    ? (outro?.avaliacoes_total > 0
        ? `⭐ ${Number(outro.avaliacoes_media).toFixed(1)} (${outro.avaliacoes_total} ${outro.avaliacoes_total === 1 ? 'avaliação' : 'avaliações'})`
        : '🆕 Novo na plataforma')
      // Selo "bem avaliado" na mesma linha da nota (sem altura extra): a linha do
      // interessado/candidato escolhido já traz selo_bem_avaliado da API.
      + (outro?.selo_bem_avaliado === true ? ' · 🏅 Bem avaliado' : '')
    : (linha2 || 'Cliente')
  const especialidades = souDono ? rotulosEspecialidades(outro?.especialidades) : null
  const iniciais = iniciaisDe(outro?.nome)
  return (
    <View style={estilos.mini}>
      {outro?.foto_url ? (
        <Image source={{ uri: avatar(outro.foto_url) }} style={estilos.miniAvatar} />
      ) : (
        <View style={[estilos.miniAvatar, estilos.miniAvatarVazio]}>
          <T style={iniciais ? estilos.miniIniciais : estilos.miniEmoji}>{iniciais || (souDono ? '👷' : '🏠')}</T>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T style={estilos.miniNome}>{outro?.nome || (souDono ? 'Profissional' : 'Cliente')}</T>
        <T style={estilos.miniNota}>{nota}</T>
        {especialidades ? <T style={estilos.miniMeta}>🛠 {especialidades}</T> : null}
      </View>
    </View>
  )
}

// 4. Aviso âmbar, no máximo 3 linhas.
const AvisoAmbar = () => (
  <View style={estilos.aviso}>
    <T linhas={3} style={estilos.avisoTexto}>⚠️ Dia, horário e conclusão só valem registrados no app — fora dele, penalidade para os dois. Cancelar com menos de 12h conta como falta.</T>
  </View>
)

// 5. Linha de links: [{ texto, onPress, perigo }]; sem onPress o item não entra.
const LinhaLinks = ({ itens }) => {
  const validos = itens.filter(i => i && i.onPress)
  if (validos.length === 0) return null
  return (
    <View style={[estilos.links, validos.length === 1 && { justifyContent: 'center' }]}>
      {validos.map((i) => (
        <TouchableOpacity key={i.texto} onPress={i.onPress} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} accessibilityRole="link">
          <T style={i.perigo ? estilos.linkPerigo : estilos.link}>{i.texto}</T>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const BotaoPrincipal = ({ rotulo, rotuloCarregando, onPress, desabilitado, carregando, verde, estilo }) => (
  <TouchableOpacity
    style={[estilos.btnPrincipal, verde && { backgroundColor: cores.sucesso }, estilo, (desabilitado || carregando) && { opacity: 0.5 }]}
    onPress={onPress}
    disabled={desabilitado || carregando}
    activeOpacity={0.85}
    accessibilityRole="button"
  >
    <T style={estilos.btnPrincipalTexto} adjustsFontSizeToFit minimumFontScale={0.8}>{carregando ? (rotuloCarregando || rotulo) : rotulo}</T>
  </TouchableOpacity>
)

const BotaoWhatsApp = ({ telefone, onPress, souDono, vazado }) => telefone ? (
  <TouchableOpacity style={[estilos.btnWhatsApp, vazado && { backgroundColor: 'transparent' }]} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
    <T style={estilos.btnWhatsAppTexto} adjustsFontSizeToFit minimumFontScale={0.8}>💬 WhatsApp {souDono ? 'do profissional' : 'do cliente'}: {telefone}</T>
  </TouchableOpacity>
) : null

// Pedido de cancelamento de comum acordo: card para quem responde (toma o lugar do bloco de
// estado), linha para quem pediu (dentro do bloco). Mesmos textos e onResponder do
// CardPedidoCancelamento.
const CardCancelamentoParaMim = ({ pedido, nomeOutro, respondendo, onResponder }) => {
  const nome = nomeOutro || 'A outra parte'
  const motivo = rotuloMotivo(pedido)
  return (
    <View style={estilos.cardLaranja}>
      <T style={estilos.rotuloLaranja}>🤝 PEDIDO DE CANCELAMENTO</T>
      <T linhas={2} style={estilos.cardTitulo}>{nome} pediu para cancelar de comum acordo</T>
      {motivo ? <T style={estilos.cardLinha}>Motivo: {motivo}</T> : null}
      <T linhas={2} style={estilos.cardNota}>Se aceitar, o serviço é cancelado e ninguém leva falta. Se recusar, o combinado continua.</T>
      <View style={estilos.botoesRow}>
        <TouchableOpacity style={[estilos.btnNeutro, respondendo && { opacity: 0.6 }]} onPress={() => onResponder('recusar')} disabled={!!respondendo} activeOpacity={0.85} accessibilityRole="button">
          <T style={estilos.btnNeutroTexto}>Recusar</T>
        </TouchableOpacity>
        <TouchableOpacity style={[estilos.btnVerde, respondendo && { opacity: 0.6 }]} onPress={() => onResponder('aceitar')} disabled={!!respondendo} activeOpacity={0.85} accessibilityRole="button">
          <T style={estilos.btnVerdeTexto}>{respondendo ? 'Enviando…' : 'Aceitar cancelamento'}</T>
        </TouchableOpacity>
      </View>
      <T style={estilos.cardRodape}>Sem resposta em 2h, o pedido expira e o combinado continua.</T>
    </View>
  )
}
const LinhaCancelamentoMeu = ({ nomeOutro }) => (
  <T linhas={2} style={estilos.linhaEspera}>⏳ Aguardando {nomeOutro || 'a outra parte'} responder ao pedido de cancelamento (expira em 2h)</T>
)

// Proposta de horário recebida: Confirmar / Sugerir outro (mesmo onResponder do
// CardAgendamento, mesma régua de sugestoes_restantes / rodadas).
const CardPropostaRecebida = ({ demanda, pendente, nomeOutro, souDono, respondendo, onResponder, onSugerir, cabecalho }) => {
  const nome = nomeOutro || (souDono ? 'o profissional' : 'o cliente')
  const Nome = nome.charAt(0).toUpperCase() + nome.slice(1)
  const restantesBruto = demanda?.sugestoes_restantes
  const restantes = (restantesBruto == null || restantesBruto === '' || !Number.isFinite(Number(restantesBruto)))
    ? null
    : Math.max(0, Math.floor(Number(restantesBruto)))
  const esgotou = restantes != null
    ? restantes === 0
    : (Number(demanda?.chegada_pendente_rodada) || 0) >= RODADAS_MAX_AGENDAMENTO
  const avisoRestantes = esgotou
    ? 'Limite de sugestões atingido — confirme o horário proposto.'
    : restantes === 2 ? 'Você só pode sugerir mais 2 vezes' : restantes === 1 ? 'Você só pode sugerir mais 1 vez' : null
  return (
    <View style={estilos.cardLaranja}>
      <T style={estilos.rotuloLaranja}>{cabecalho || '📅 HORÁRIO PROPOSTO'}</T>
      <T linhas={2} style={estilos.cardTitulo}>{Nome} propôs {formatarAgendado(pendente) || String(pendente)}</T>
      <T style={estilos.cardLinha}>Confirme o horário ou sugira outro.</T>
      <View style={estilos.botoesRow}>
        <TouchableOpacity style={[estilos.btnVerde, respondendo && { opacity: 0.6 }]} onPress={() => onResponder('aceitar')} disabled={!!respondendo} activeOpacity={0.85} accessibilityRole="button">
          <T style={estilos.btnVerdeTexto}>{respondendo ? 'Enviando…' : '✓ Confirmar'}</T>
        </TouchableOpacity>
        {!esgotou && (
          <TouchableOpacity style={[estilos.btnNeutro, respondendo && { opacity: 0.6 }]} onPress={onSugerir} disabled={!!respondendo} activeOpacity={0.85} accessibilityRole="button">
            <T style={estilos.btnNeutroTexto}>Sugerir outro</T>
          </TouchableOpacity>
        )}
      </View>
      {avisoRestantes ? <T style={estilos.cardRodape}>{avisoRestantes}</T> : null}
    </View>
  )
}

// Folha de baixo com o PickerAgendamento (primeira proposta do profissional ou "Sugerir
// outro"). Fecha sozinha quando a pendência muda (proposta enviada/respondida).
const FolhaPicker = ({ visivel, onFechar, titulo, limite, rotuloBotao, enviando, onEnviar }) => {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.folhaFundo}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onFechar} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={[estilos.folhaCard, { paddingBottom: Math.max(20, insets.bottom + 12) }]}>
          <PickerAgendamento titulo={titulo} limite={limite} rotuloBotao={rotuloBotao} enviando={enviando} onEnviar={onEnviar} onCancelar={onFechar} />
        </View>
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------
// Blocos de estado
// ---------------------------------------------------------------------------------------

// AGUARDANDO HORÁRIO — dono: banner "aguarde"; profissional: banner "envie" + botão do picker.
const EstadoAguardando = ({ demanda, frente, souDono, onAbrirPicker, rodape }) => {
  const ehObra = frente === 'obra'
  const limiteTexto = formatarLimiteSP(demanda?.expira_em)
  const prazoCurto = !ehObra && !!demanda?.expira_em && (new Date(demanda.expira_em).getTime() - Date.now()) < 86400000
  const tituloDono = prazoCurto ? 'AGUARDE O PROFISSIONAL ENVIAR O HORÁRIO' : 'AGUARDE O PROFISSIONAL ENVIAR O DIA E O HORÁRIO'
  const tituloPro = ehObra ? 'ENVIE AO CLIENTE O DIA E O HORÁRIO DE INÍCIO DA OBRA' : prazoCurto ? 'ENVIE AO CLIENTE O HORÁRIO QUE VOCÊ PODE ATENDER' : 'ENVIE AO CLIENTE O DIA E O HORÁRIO QUE VOCÊ PODE ATENDER'
  const linhaLimite = ehObra ? 'O início precisa ser até' : prazoCurto ? 'O horário precisa ser até' : 'O dia e o horário precisam ser até'
  return (
    <View style={estilos.banner}>
      <T linhas={2} style={estilos.bannerTitulo}>{souDono ? '⏳ ' : '📅 '}{souDono ? tituloDono : tituloPro}</T>
      {limiteTexto ? <T style={estilos.bannerLinha}>⏱️ {linhaLimite}: <T style={estilos.bannerForte}>{limiteTexto}</T></T> : null}
      {souDono ? (
        <>
          <T style={estilos.bannerSub}>Depois é só você concordar ou sugerir outro.</T>
          <View style={estilos.bannerChip}><T style={estilos.bannerChipTexto}>🔔 Você será avisado por notificação</T></View>
        </>
      ) : (
        <TouchableOpacity style={estilos.btnBranco} onPress={onAbrirPicker} activeOpacity={0.85} accessibilityRole="button">
          <T style={estilos.btnBrancoTexto}>{prazoCurto ? 'Escolher horário →' : 'Escolher dia e horário →'}</T>
        </TouchableOpacity>
      )}
      {rodape}
    </View>
  )
}

// HORÁRIO PROPOSTO — quem propôs espera; o outro lado confirma ou sugere.
const EstadoProposto = ({ demanda, souDono, minhaPendente, nomeOutro, respondendo, onResponder, onSugerir, rodape }) => {
  const pendente = demanda?.chegada_pendente_em
  if (minhaPendente) {
    return (
      <View style={estilos.banner}>
        <T style={estilos.bannerTitulo}>⏳ AGUARDANDO {souDono ? 'O PROFISSIONAL' : 'O CLIENTE'} CONFIRMAR</T>
        <T style={estilos.bannerData}>{formatarAgendado(pendente) || String(pendente)}</T>
        <T style={estilos.bannerSub}>Você será avisado por notificação.</T>
        {rodape}
      </View>
    )
  }
  return (
    <View>
      <CardPropostaRecebida demanda={demanda} pendente={pendente} nomeOutro={nomeOutro} souDono={souDono} respondendo={respondendo} onResponder={onResponder} onSugerir={onSugerir} />
      {rodape}
    </View>
  )
}

// AGENDADO — caixa verde com a data; profissional tem o "Estou a caminho" dentro. Variantes
// no lugar do conteúdo: vigia "o profissional veio?" (dono) e reagendamento pendente.
const EstadoAgendado = ({ demanda, frente, souDono, nomeOutro, podeDizerACaminho, onACaminho, enviandoACaminho, vigia, reagendamento, rodape }) => {
  const ehObra = frente === 'obra'
  const alvo = demanda?.chegada_prevista_em
  const dataTexto = formatarAgendado(alvo) || (alvo ? String(alvo) : '—')
  if (reagendamento && !reagendamento.minha) {
    return (
      <View>
        <CardPropostaRecebida
          demanda={demanda}
          pendente={demanda?.chegada_pendente_em}
          nomeOutro={nomeOutro}
          souDono={souDono}
          respondendo={reagendamento.respondendo}
          onResponder={reagendamento.onResponder}
          onSugerir={reagendamento.onSugerir}
          cabecalho={`📅 NOVA PROPOSTA · agendado ${dataTexto}`}
        />
        {rodape}
      </View>
    )
  }
  return (
    <View style={estilos.verde}>
      {/* Com a vigia, a data vai para a linha do rótulo: o que importa é a pergunta. */}
      <T style={estilos.verdeRotulo}>{ehObra ? '📅 INÍCIO AGENDADO' : '📅 AGENDADO'}{vigia ? ` · ${dataTexto}` : ''}</T>
      {vigia ? null : <T style={estilos.verdeData} adjustsFontSizeToFit minimumFontScale={0.8}>{dataTexto}</T>}
      {vigia ? (
        <View style={estilos.vigia}>
          <T style={estilos.vigiaTitulo}>🤔 O profissional veio?</T>
          <T linhas={2} style={estilos.vigiaTexto}>O horário combinado já passou. Conte para a gente o que aconteceu.</T>
          <TouchableOpacity style={estilos.btnLaranjaPequeno} onPress={vigia.onResponder} activeOpacity={0.85} accessibilityRole="button">
            <T style={estilos.btnLaranjaPequenoTexto}>Responder</T>
          </TouchableOpacity>
        </View>
      ) : souDono ? (
        <T linhas={2} style={estilos.verdeLinha}>O app lembra você: na véspera às 18h, 2 horas antes e na hora de sair.</T>
      ) : (
        <>
          <T style={estilos.verdeLinha}>Na hora de sair, avise o cliente:</T>
          <BotaoPrincipal
            rotulo={podeDizerACaminho ? '🚗 Estou a caminho' : '🚗 Estou a caminho (libera no dia agendado)'}
            rotuloCarregando="Avisando…"
            onPress={onACaminho}
            desabilitado={!podeDizerACaminho || !onACaminho}
            carregando={enviandoACaminho}
            estilo={{ marginBottom: 0, marginTop: 8 }}
          />
        </>
      )}
      {reagendamento?.minha ? (
        <T linhas={2} style={estilos.linhaEspera}>⏳ Nova proposta ({formatarAgendado(demanda?.chegada_pendente_em) || '—'}) aguardando {nomeOutro || 'a outra parte'}</T>
      ) : null}
      {rodape}
    </View>
  )
}

// A CAMINHO — caixa azul (âmbar quando atrasado) com saída, prazo, pedido de atraso e a
// chegada declarada DENTRO; abaixo, WhatsApp e o botão principal.
const EstadoACaminho = ({ demanda, souDono, outro, telefone, onWhatsApp, chegada, atraso, onNaoChegou }) => {
  const agora = useAgora()
  const saiu = horaDe(demanda?.a_caminho_em)
  const prazoIso = demanda?.prazo_chegada || demanda?.chegada_prevista_em || demanda?.expira_em
  const prazoMs = prazoIso ? new Date(prazoIso).getTime() : NaN
  const toleranciaMs = demanda?.tolerancia_ate
    ? new Date(demanda.tolerancia_ate).getTime()
    : (Number.isFinite(prazoMs) ? prazoMs + TOLERANCIA_PADRAO_MS : NaN)
  const prazo = horaDe(prazoIso)
  const tolerancia = Number.isFinite(toleranciaMs) ? horaDe(toleranciaMs) : null
  const faltam = duracaoCurta(prazoMs - agora)
  const prazoVencido = Number.isFinite(prazoMs) && prazoMs <= agora
  const semChegada = !demanda?.chegada_declarada_em && !demanda?.chegada_confirmada_em
  const atrasado = semChegada && (!!demanda?.atrasado || prazoVencido)
  const minAtraso = atrasado && Number.isFinite(prazoMs) ? Math.max(1, Math.ceil((agora - prazoMs) / 60000)) : 0
  const toleranciaVencida = Number.isFinite(toleranciaMs) && toleranciaMs <= agora
  const pedido = demanda?.pedido_atraso
  const pedidoPendente = pedido?.status === 'pendente'
  const restantes = Number(demanda?.pedidos_atraso_restantes) || 0
  const respondeAte = pedidoPendente ? horaDe(pedido?.responde_ate) : null
  const chegariaAte = pedidoPendente && Number(pedido?.minutos) > 0
    ? horaDe(Math.max(agora, Number.isFinite(toleranciaMs) ? toleranciaMs : agora) + Number(pedido.minutos) * 60000)
    : null
  const nomeOutro = primeiroNomeDe(outro?.nome, souDono ? 'O profissional' : 'O cliente')

  return (
    <View>
      <View style={atrasado ? estilos.ambar : estilos.azul}>
        {atrasado ? (
          <>
            <T style={estilos.ambarRotulo}>{souDono ? '⏰ PROFISSIONAL ATRASADO' : '⏰ VOCÊ ESTÁ ATRASADO'} · {minAtraso} min</T>
            <T linhas={2} style={estilos.caixaLinha}>
              {souDono
                ? `Tolerância até ${tolerancia || '—'} — depois disso você pode marcar que não chegou.`
                : `Tolerância até ${tolerancia || '—'}. Depois, sem aviso, conta como falta. O cliente já foi avisado.`}
            </T>
          </>
        ) : (
          <>
            <T style={estilos.azulRotulo}>{souDono ? '🚗 PROFISSIONAL A CAMINHO' : '🚗 VOCÊ ESTÁ A CAMINHO'}{saiu ? ` · ${souDono ? 'saiu' : 'avisou'} às ${saiu}` : ''}</T>
            {prazo ? (
              <T style={[estilos.caixaLinha, prazoVencido && { color: cores.primaria }]}>
                {souDono ? 'Deve chegar até' : 'Chegue até'} {prazo}{faltam ? ` · faltam ${faltam}` : prazoVencido ? ' · prazo passou' : ''}
              </T>
            ) : null}
          </>
        )}

        {/* Chegada declarada: o dono confirma (ou contesta), o profissional espera. */}
        {chegada?.aguardaConfirmacao ? (
          souDono ? (
            <T linhas={2} style={estilos.caixaDestaque}>🚶 {nomeOutro} declarou que chegou{chegada.declaradaTexto ? ` ${chegada.declaradaTexto}` : ''}. Confirme para o serviço começar.</T>
          ) : (
            <T linhas={2} style={estilos.caixaDestaque}>⏳ Aguardando o cliente confirmar sua chegada…</T>
          )
        ) : null}

        {/* Pedido de atraso: profissional pede (ou espera); dono responde. */}
        {!souDono && pedidoPendente ? (
          <T style={estilos.caixaDestaque}>⏳ Pedido de +{Number(pedido?.minutos) || 0} min aguardando o cliente{respondeAte ? ` (até ${respondeAte})` : ''}</T>
        ) : !souDono && atraso?.onPedir && restantes > 0 && chegada?.naoDeclarada ? (
          <TouchableOpacity style={estilos.btnAmbarPequeno} onPress={atraso.onPedir} activeOpacity={0.8} accessibilityRole="button">
            <T style={estilos.btnAmbarPequenoTexto}>{atrasado ? '⏱ Vou atrasar mais' : '⏱ Vou atrasar'}</T>
          </TouchableOpacity>
        ) : null}
        {souDono && pedidoPendente && atraso?.onResponder ? (
          <View style={estilos.pedidoAtraso}>
            <T style={estilos.pedidoAtrasoTitulo}>⏱ {nomeOutro} pediu +{Number(pedido.minutos) || 0} min{chegariaAte ? ` · chegaria até ${chegariaAte}` : ''}</T>
            {pedido.motivo ? <T style={estilos.caixaLinha}>Motivo: {pedido.motivo}</T> : null}
            <View style={estilos.botoesRow}>
              <TouchableOpacity style={[estilos.btnVerde, atraso.respondendo && { opacity: 0.5 }]} onPress={() => atraso.onResponder(true)} disabled={!!atraso.respondendo} activeOpacity={0.85} accessibilityRole="button">
                <T style={estilos.btnVerdeTexto}>{atraso.respondendo ? 'Enviando…' : '✓ Aceitar'}</T>
              </TouchableOpacity>
              <TouchableOpacity style={[estilos.btnVermelhoVazado, atraso.respondendo && { opacity: 0.5 }]} onPress={() => atraso.onResponder(false)} disabled={!!atraso.respondendo} activeOpacity={0.85} accessibilityRole="button">
                <T style={estilos.btnVermelhoVazadoTexto}>✕ Recusar</T>
              </TouchableOpacity>
            </View>
            <T style={estilos.cardRodape}>Aceitar vale para os dois; recusar devolve o pedido a outros, sem falta.</T>
          </View>
        ) : null}
      </View>

      <BotaoWhatsApp telefone={telefone} onPress={onWhatsApp} souDono={souDono} />

      {/* Botão principal: declarar/confirmar a chegada. */}
      {chegada?.naoDeclarada ? (
        <BotaoPrincipal rotulo={souDono ? '🚶 Profissional chegou' : '📍 Cheguei no local'} rotuloCarregando="Registrando…" onPress={chegada.onChegada} carregando={chegada.declarando} />
      ) : chegada?.aguardaConfirmacao && souDono ? (
        <BotaoPrincipal rotulo="✅ Confirmar chegada" rotuloCarregando="Confirmando…" onPress={chegada.onChegada} carregando={chegada.declarando} />
      ) : null}

      {/* "Não chegou": contestar a declaração (dono) ou, depois da tolerância, a vigia. */}
      {souDono && chegada?.aguardaConfirmacao && chegada?.declaradaPorOutro && chegada?.onContestar ? (
        <TouchableOpacity style={estilos.btnVermelhoVazadoLargo} onPress={chegada.onContestar} activeOpacity={0.8} accessibilityRole="button">
          <T style={estilos.btnVermelhoVazadoTexto}>🚫 O profissional não chegou</T>
        </TouchableOpacity>
      ) : onNaoChegou && toleranciaVencida && !pedidoPendente ? (
        <TouchableOpacity style={estilos.btnVermelhoVazadoLargo} onPress={onNaoChegou} activeOpacity={0.8} accessibilityRole="button">
          <T style={estilos.btnVermelhoVazadoTexto}>🚫 O profissional não chegou</T>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

// EM ANDAMENTO — caixa verde (ou "concluído pelo profissional" para o dono), WhatsApp e o
// botão de concluir/confirmar.
const EstadoEmAndamento = ({ demanda, frente, souDono, telefone, onWhatsApp, rotuloBotao, onConcluir, desabilitado, enviando, encerramentoOutro }) => {
  const hora = horaDe(demanda?.chegada_confirmada_em)
  const enc = souDono && encerramentoOutro?.solicitadoEm ? encerramentoOutro : null
  const terminouEm = enc ? quandoTexto(enc.solicitadoEm) : null
  const automaticoIso = enc
    ? (enc.automaticoEm || new Date(new Date(enc.solicitadoEm).getTime() + AUTO_ENCERRAR_MS[frente === 'obra' ? 'obra' : 'reparo']).toISOString())
    : null
  const automaticoEm = enc ? quandoTexto(automaticoIso) : null
  return (
    <View>
      {enc ? (
        <View style={estilos.concluido}>
          <T style={estilos.concluidoRotulo}>{frente === 'obra' ? '✅ OBRA CONCLUÍDA PELO PROFISSIONAL' : '✅ SERVIÇO CONCLUÍDO PELO PROFISSIONAL'}</T>
          <T style={estilos.concluidoLinha}>{enc.nome || 'O profissional'} terminou {terminouEm || 'agora'}</T>
          <T linhas={2} style={estilos.caixaLinha}>Confira o serviço e confirme a conclusão para avaliar o profissional.</T>
          {automaticoEm ? <T style={estilos.cardRodape}>Sem resposta, encerra automaticamente {automaticoEm}</T> : null}
        </View>
      ) : (
        <View style={estilos.verde}>
          <T style={estilos.verdeRotulo}>▶️ SERVIÇO EM ANDAMENTO{hora ? ` · desde ${hora}` : ''}</T>
          <T linhas={2} style={estilos.verdeLinha}>
            {souDono ? 'Quando o serviço terminar, confirme aqui para avaliar o profissional.' : 'Ao terminar, peça ao cliente para confirmar a conclusão no app.'}
          </T>
        </View>
      )}
      {!enc ? <BotaoWhatsApp telefone={telefone} onPress={onWhatsApp} souDono={souDono} /> : null}
      <BotaoPrincipal rotulo={rotuloBotao} rotuloCarregando="Encerrando…" onPress={onConcluir} desabilitado={desabilitado} carregando={enviando} verde estilo={enc && telefone ? { marginBottom: 8 } : undefined} />
      {enc ? <BotaoWhatsApp telefone={telefone} onPress={onWhatsApp} souDono={souDono} vazado /> : null}
    </View>
  )
}

// ---------------------------------------------------------------------------------------
// A tela
// ---------------------------------------------------------------------------------------
// fase: 'aguardando' | 'proposto' | 'agendado' | 'a_caminho' | 'em_andamento'.
// demanda/frente/souDono/valor/endereco/pontoReferencia/outro/usuarioId: como nos blocos
// antigos. onExpirar: o gancho do relógio do prazo (só sem horário aceito).
// agendamento: { nomeOutro, limite, enviando, onPropor(iso), respondendo, onResponder(acao, iso) }.
// agendado: { podeDizerACaminho, onACaminho, enviandoACaminho, vigia: { onResponder } | null }.
// aCaminho: { telefone, onWhatsApp, chegada: { naoDeclarada, aguardaConfirmacao,
//   declaradaPorOutro, declaradaTexto, onChegada, declarando, onContestar }, atraso: { onPedir,
//   onResponder, respondendo }, onNaoChegou }.
// emAndamento: { telefone, onWhatsApp, rotuloBotao, onConcluir, desabilitado, enviando, encerramentoOutro }.
// cancelamento: { pedido, paraMim, nomeOutro, respondendo, onResponder, onAbrir, desabilitado } | null.
// links: { onReferencia, onDetalhes, onContrato, onDenunciar }.
export default function TelaPosMatch({
  fase, demanda, frente, souDono, valor, endereco, pontoReferencia, outro, usuarioId, onExpirar,
  agendamento, agendado, aCaminho, emAndamento, cancelamento, links,
}) {
  const ehObra = frente === 'obra'
  const [picker, setPicker] = useState(null) // null | 'propor' | 'sugerir'
  const pendente = demanda?.chegada_pendente_em
  const propostaPor = demanda?.chegada_proposta_por || demanda?.match_usuario_id
  const minhaPendente = !!pendente && propostaPor != null && usuarioId != null && String(propostaPor) === String(usuarioId)
  // Proposta enviada ou respondida: a folha fecha sozinha.
  useEffect(() => { setPicker(null) }, [pendente, propostaPor])

  // Faixa do topo (metade direita) e contagem do prazo, por fase.
  const alvoPrazo = demanda?.chegada_prevista_em || demanda?.expira_em
  const msPrazo = useContagem(fase === 'aguardando' || fase === 'proposto' || fase === 'agendado' ? alvoPrazo : null, fase === 'agendado' ? undefined : onExpirar)
  let faixa = null
  if (fase === 'aguardando' || fase === 'proposto') {
    faixa = ehObra && !souDono
      ? { rotulo: 'INÍCIO PREVISTO', valor: formatarAgendado(demanda?.expira_em) || '—' }
      : { rotulo: 'PRAZO PARA CHEGAR', valor: !Number.isFinite(msPrazo) ? '—' : msPrazo <= 0 ? '⏰ Esgotado' : formatarDuracao(msPrazo, { frente, arredondar: 'cima' }) }
  } else if (fase === 'agendado') {
    const faltam = duracaoCurta(msPrazo)
    faixa = Number.isFinite(msPrazo) && msPrazo <= 0 ? { rotulo: 'HORÁRIO', valor: '⏰ Chegou a hora' } : { rotulo: 'FALTAM', valor: faltam || '—' }
  } else if (fase === 'a_caminho') {
    const prazoIso = demanda?.prazo_chegada || demanda?.chegada_prevista_em || demanda?.expira_em
    const semChegada = !demanda?.chegada_declarada_em && !demanda?.chegada_confirmada_em
    const prazoMs = prazoIso ? new Date(prazoIso).getTime() : NaN
    const atrasado = semChegada && (!!demanda?.atrasado || (Number.isFinite(prazoMs) && prazoMs <= Date.now()))
    const tolerancia = demanda?.tolerancia_ate ? horaDe(demanda.tolerancia_ate) : (Number.isFinite(prazoMs) ? horaDe(prazoMs + TOLERANCIA_PADRAO_MS) : null)
    faixa = atrasado
      ? { rotulo: 'TOLERÂNCIA ATÉ', valor: tolerancia || horaDe(prazoIso) || '—', destaque: true }
      : { rotulo: souDono ? 'CHEGA ATÉ' : 'CHEGAR ATÉ', valor: horaDe(prazoIso) || '—' }
  } else if (fase === 'em_andamento') {
    faixa = { rotulo: 'CHEGOU ÀS', valor: horaDe(demanda?.chegada_confirmada_em) || '—' }
  }

  // Cancelamento: botão por último (fases até o "Estou a caminho"); pedido pendente para mim
  // toma o lugar do bloco de estado; pedido meu vira a linha de espera dentro dele.
  const cancelParaMim = cancelamento?.pedido && cancelamento.paraMim
  const cancelMeu = cancelamento?.pedido && !cancelamento.paraMim
  const rodapeCancel = cancelMeu ? <LinhaCancelamentoMeu nomeOutro={cancelamento.nomeOutro} /> : null

  let estado = null
  if (cancelParaMim) {
    estado = <CardCancelamentoParaMim pedido={cancelamento.pedido} nomeOutro={cancelamento.nomeOutro} respondendo={cancelamento.respondendo} onResponder={cancelamento.onResponder} />
  } else if (fase === 'aguardando') {
    estado = <EstadoAguardando demanda={demanda} frente={frente} souDono={souDono} onAbrirPicker={() => setPicker('propor')} rodape={rodapeCancel} />
  } else if (fase === 'proposto') {
    estado = (
      <EstadoProposto
        demanda={demanda}
        souDono={souDono}
        minhaPendente={minhaPendente}
        nomeOutro={agendamento?.nomeOutro}
        respondendo={agendamento?.respondendo}
        onResponder={agendamento?.onResponder}
        onSugerir={() => setPicker('sugerir')}
        rodape={rodapeCancel}
      />
    )
  } else if (fase === 'agendado') {
    estado = (
      <EstadoAgendado
        demanda={demanda}
        frente={frente}
        souDono={souDono}
        nomeOutro={agendamento?.nomeOutro}
        podeDizerACaminho={agendado?.podeDizerACaminho}
        onACaminho={agendado?.onACaminho}
        enviandoACaminho={agendado?.enviandoACaminho}
        vigia={agendado?.vigia || null}
        reagendamento={pendente ? { minha: minhaPendente, respondendo: agendamento?.respondendo, onResponder: agendamento?.onResponder, onSugerir: () => setPicker('sugerir') } : null}
        rodape={rodapeCancel}
      />
    )
  } else if (fase === 'a_caminho') {
    estado = <EstadoACaminho demanda={demanda} souDono={souDono} outro={outro} {...aCaminho} />
  } else if (fase === 'em_andamento') {
    estado = <EstadoEmAndamento demanda={demanda} frente={frente} souDono={souDono} {...emAndamento} />
  }

  const mostraAviso = fase === 'aguardando' || fase === 'proposto' || fase === 'agendado'
  const mostraCancelar = mostraAviso && !!cancelamento?.onAbrir && !cancelamento?.pedido
  const linha2Cliente = fase === 'aguardando' || fase === 'proposto' || fase === 'agendado'
    ? 'Cliente · contato liberado após o "Estou a caminho"'
    : 'Cliente'

  // A folha do picker fica FORA do View 'space-evenly': um Modal irmão contaria como filho
  // e ganharia um vão próprio na distribuição.
  return (
    <>
    <View style={estilos.tela}>
      <CardTopo demanda={demanda} endereco={endereco} pontoReferencia={pontoReferencia} valor={valor} faixa={faixa} />
      {estado}
      <MiniPessoa souDono={souDono} outro={outro} linha2={linha2Cliente} />
      {mostraAviso ? <AvisoAmbar /> : null}
      <LinhaLinks itens={[
        souDono && links?.onReferencia ? { texto: pontoReferencia ? '📍 Editar referência' : '📍 Ponto de referência', onPress: links.onReferencia } : null,
        { texto: '🔎 Descrição e fotos', onPress: links?.onDetalhes },
        { texto: '📋 Contrato no e-mail', onPress: links?.onContrato },
        { texto: '🚩 Denunciar', onPress: links?.onDenunciar, perigo: true },
      ]} />
      {mostraCancelar ? (
        <TouchableOpacity style={[estilos.btnCancelar, cancelamento.desabilitado && { opacity: 0.5 }]} onPress={cancelamento.onAbrir} disabled={!!cancelamento.desabilitado} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Cancelar serviço">
          <T style={estilos.btnCancelarTexto}>✕ Cancelar serviço</T>
        </TouchableOpacity>
      ) : null}
    </View>

      <FolhaPicker
        visivel={!!picker}
        onFechar={() => setPicker(null)}
        titulo={ehObra ? 'Quando você vai começar a obra?' : 'Quando você vai fazer o serviço?'}
        /* Primeira proposta: teto no prazo do pedido. "Sugerir outro": o dono sem teto, o
           profissional com o prazo — a mesma régua do CardAgendamento. */
        limite={picker === 'sugerir' && souDono ? null : agendamento?.limite}
        rotuloBotao={picker === 'sugerir' ? `Enviar para ${agendamento?.nomeOutro || (souDono ? 'o profissional' : 'o cliente')}` : 'Enviar para o cliente confirmar'}
        enviando={picker === 'sugerir' ? !!agendamento?.respondendo : !!agendamento?.enviando}
        onEnviar={(iso) => picker === 'sugerir' ? agendamento?.onResponder?.('contraproposta', iso) : agendamento?.onPropor?.(iso)}
      />
    </>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1, justifyContent: 'space-evenly' },

  // 1. Card do topo (~150dp)
  topo: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 12 },
  titulo: { fontSize: 17, fontWeight: '700', color: cores.textoForte, lineHeight: 22, marginBottom: 2 },
  endereco: { fontSize: 12, color: cores.textoMedio, lineHeight: 16, marginBottom: 8 },
  faixa: { flexDirection: 'row', borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, overflow: 'hidden' },
  faixaMetade: { flex: 1, backgroundColor: cores.fundoElevado, paddingVertical: 7, paddingHorizontal: 10 },
  faixaValor: { backgroundColor: cores.sucessoSuave, borderRightWidth: 0.5, borderRightColor: cores.borda },
  faixaDestaque: { backgroundColor: cores.primariaSuave },
  faixaRotulo: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: cores.textoMedio, marginBottom: 2 },
  faixaNumero: { fontSize: 15, fontWeight: '800', color: cores.textoForte },

  // 2. Blocos de estado
  banner: { backgroundColor: '#f05a28', borderRadius: raios.grande, padding: 12 },
  bannerTitulo: { fontSize: 14, fontWeight: '900', color: '#FFFFFF', lineHeight: 19, letterSpacing: 0.2, marginBottom: 6 },
  bannerLinha: { fontSize: 12, color: 'rgba(255,255,255,0.92)', lineHeight: 17, marginBottom: 4 },
  bannerForte: { fontWeight: '800', color: '#FFFFFF' },
  bannerSub: { fontSize: 12, color: 'rgba(255,255,255,0.92)', lineHeight: 17, marginBottom: 6 },
  bannerData: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', lineHeight: 26, marginBottom: 4 },
  bannerChip: { alignSelf: 'flex-start', backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  bannerChipTexto: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  btnBranco: { backgroundColor: '#FFFFFF', borderRadius: raios.medio, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  btnBrancoTexto: { fontSize: 14, fontWeight: '800', color: '#f05a28' },

  cardLaranja: { backgroundColor: '#3a2a00', borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.grande, padding: 12 },
  rotuloLaranja: { fontSize: 11, fontWeight: '800', color: cores.primaria, letterSpacing: 0.5, marginBottom: 4 },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: cores.textoForte, lineHeight: 20, marginBottom: 4 },
  cardLinha: { fontSize: 12, color: cores.textoForte, lineHeight: 17, marginBottom: 6 },
  cardNota: { fontSize: 11, color: cores.textoMedio, lineHeight: 15, marginBottom: 8 },
  cardRodape: { fontSize: 11, color: cores.textoFraco, lineHeight: 15, marginTop: 6 },
  botoesRow: { flexDirection: 'row', gap: 8 },
  btnVerde: { flex: 1.3, backgroundColor: cores.sucesso, borderRadius: raios.medio, paddingVertical: 11, alignItems: 'center' },
  btnVerdeTexto: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  btnNeutro: { flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, paddingVertical: 11, alignItems: 'center' },
  btnNeutroTexto: { fontSize: 13, fontWeight: '700', color: cores.textoForte },
  btnVermelhoVazado: { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.medio, paddingVertical: 11, alignItems: 'center' },
  btnVermelhoVazadoLargo: { borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.medio, paddingVertical: 9, alignItems: 'center', marginTop: 8 },
  btnVermelhoVazadoTexto: { fontSize: 13, fontWeight: '700', color: cores.perigo },
  linhaEspera: { fontSize: 12, color: cores.textoMedio, lineHeight: 16, marginTop: 8 },

  verde: { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.grande, padding: 12 },
  verdeRotulo: { fontSize: 12, fontWeight: '800', color: '#4caf50', letterSpacing: 0.5, marginBottom: 4 },
  verdeData: { fontSize: 20, fontWeight: '800', color: cores.textoForte, lineHeight: 26, marginBottom: 4 },
  verdeLinha: { fontSize: 13, color: cores.textoForte, lineHeight: 18 },
  vigia: { backgroundColor: 'rgba(255,193,7,0.10)', borderWidth: 1, borderColor: 'rgba(255,193,7,0.45)', borderRadius: raios.medio, padding: 10, marginTop: 6 },
  vigiaTitulo: { fontSize: 14, fontWeight: '800', color: '#FFC107', marginBottom: 2 },
  vigiaTexto: { fontSize: 12, color: cores.textoForte, lineHeight: 16, marginBottom: 8 },
  btnLaranjaPequeno: { backgroundColor: cores.primaria, borderRadius: raios.medio, paddingVertical: 10, alignItems: 'center' },
  btnLaranjaPequenoTexto: { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },

  azul: { backgroundColor: cores.infoSuave, borderWidth: 1, borderColor: cores.infoBorda, borderRadius: raios.grande, padding: 12, marginBottom: 8 },
  azulRotulo: { fontSize: 12, fontWeight: '800', color: cores.info, letterSpacing: 0.3, marginBottom: 4 },
  ambar: { backgroundColor: 'rgba(255,193,7,0.10)', borderWidth: 1, borderColor: 'rgba(255,193,7,0.55)', borderRadius: raios.grande, padding: 12, marginBottom: 8 },
  ambarRotulo: { fontSize: 12, fontWeight: '800', color: '#FFC107', letterSpacing: 0.3, marginBottom: 4 },
  caixaLinha: { fontSize: 12, color: cores.textoForte, lineHeight: 17 },
  caixaDestaque: { fontSize: 13, fontWeight: '600', color: cores.textoForte, lineHeight: 18, marginTop: 6 },
  btnAmbarPequeno: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#FFC107', borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  btnAmbarPequenoTexto: { fontSize: 12, fontWeight: '700', color: '#FFC107' },
  pedidoAtraso: { marginTop: 8, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 8 },
  pedidoAtrasoTitulo: { fontSize: 14, fontWeight: '800', color: cores.textoForte, lineHeight: 19, marginBottom: 4 },

  concluido: { backgroundColor: '#13291A', borderWidth: 2, borderColor: '#7BD093', borderRadius: raios.grande, padding: 12, marginBottom: 8 },
  concluidoRotulo: { fontSize: 11, fontWeight: '800', color: '#7BD093', letterSpacing: 0.5, marginBottom: 4 },
  concluidoLinha: { fontSize: 17, fontWeight: '800', color: cores.textoForte, lineHeight: 22, marginBottom: 4 },

  btnWhatsApp: { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#25D366', borderRadius: raios.medio, paddingVertical: 11, alignItems: 'center', marginBottom: 8 },
  btnWhatsAppTexto: { fontSize: 13, fontWeight: '600', color: '#25D366' },
  btnPrincipal: { backgroundColor: cores.primaria, borderRadius: raios.medio, paddingVertical: 14, alignItems: 'center' },
  btnPrincipalTexto: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },

  // 3. Mini card (~62dp)
  mini: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, paddingVertical: 8, paddingHorizontal: 12 },
  miniAvatar: { width: 40, height: 40, borderRadius: 20 },
  miniAvatarVazio: { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  miniIniciais: { color: cores.primaria, fontSize: 14, fontWeight: '700' },
  miniEmoji: { fontSize: 18 },
  miniNome: { fontSize: 14, fontWeight: '700', color: cores.textoForte, lineHeight: 18 },
  miniNota: { fontSize: 12, color: cores.primaria, fontWeight: '600', lineHeight: 16 },
  miniMeta: { fontSize: 11, color: cores.textoMedio, lineHeight: 15 },

  // 4. Aviso âmbar (≤ 3 linhas, ~60dp)
  aviso: { backgroundColor: 'rgba(255,193,7,0.10)', borderWidth: 1, borderColor: 'rgba(255,193,7,0.45)', borderRadius: raios.pequeno, paddingHorizontal: 10, paddingVertical: 7 },
  avisoTexto: { fontSize: 11, color: '#FFC107', lineHeight: 15 },

  // 5. Links (~24dp)
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2, rowGap: 4 },
  link: { fontSize: 12, fontWeight: '600', color: '#8888cc' },
  linkPerigo: { fontSize: 12, fontWeight: '600', color: cores.perigo },

  // 6. Cancelar (~44dp)
  btnCancelar: { borderWidth: 1.5, borderColor: cores.perigo, borderRadius: raios.medio, paddingVertical: 11, alignItems: 'center' },
  btnCancelarTexto: { fontSize: 14, fontWeight: '700', color: cores.perigo },

  // Folha do picker
  folhaFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  folhaCard: { backgroundColor: cores.fundoCard, borderTopLeftRadius: raios.grande, borderTopRightRadius: raios.grande, padding: 16 },
})
