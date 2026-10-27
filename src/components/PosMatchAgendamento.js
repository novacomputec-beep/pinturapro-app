import React, { useState, useEffect } from 'react'
import { View, Text, Image, TouchableOpacity, ScrollView, Modal, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios } from '../utils/tema'
import { rotulosEspecialidades } from '../utils/categorias'
import { avatar } from '../utils/imagemOtimizada'
import ChipsCategoria from './ChipsCategoria'
import { formatarAgendado } from './Agendamento'

// Telas ÚNICAS (sem rolagem) das duas fases entre o horário aceito e a chegada confirmada,
// para os quatro lados — dono e profissional, reparo e obra. Mesma linguagem visual do
// BlocoEmAndamento (PosMatchEmAndamento): card do topo, caixa de estado, botão principal,
// mini card da outra parte e a linha de links.
//   BlocoAgendado  — horário ACEITO (chegada_prevista_em) e ainda sem "Estou a caminho":
//                    caixa verde "📅 AGENDADO" com a data em destaque; o dono lê que o app
//                    lembra, o profissional tem o botão "🚗 Estou a caminho" dentro dela.
//   BlocoACaminho  — a_caminho_em marcado e chegada ainda não confirmada: caixa azul com a
//                    hora da saída e o prazo de chegada (âmbar quando o prazo passou — a
//                    tolerância de chegada da API), WhatsApp, o botão de chegada e o pedido
//                    de atraso ("Vou atrasar" do profissional, Aceitar/Recusar do dono).
// Os blocos só DESENHAM: ações, travas e regras continuam nos handlers das telas, que
// passam botão, estado e nós prontos (cancelamento, vigia).
//
// Tolerância e pedido de atraso (atrasoChegadaService da API, GET /:id → camposAtraso):
//   prazo_chegada    — a extensão aceita ou o horário combinado (chegada_prevista_em/expira_em)
//   tolerancia_ate   — a extensão (já com tudo dentro) ou prazo + 15 min; depois dela o cron
//                      desfaz o match e o dono pode marcar que o profissional não chegou
//   atrasado         — prazo passado, chegada não declarada (relógio do servidor)
//   pedido_atraso    — { minutos 15|30|60, motivo, criado_em, status pendente|aceito|
//                      auto_aceito|recusado, respondido_em, responde_ate }; um por vez
//   pedidos_atraso_restantes — de 2 por match
// POST /:id/pedir-atraso { minutos, motivo } (profissional) e /pedir-atraso/responder
// { aceitar } (dono). Aceite = novo prazo para os dois; recusa = match desfeito, sem falta.

const formatarValor = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const p2 = (n) => String(n).padStart(2, '0')
const iniciaisDe = (nome) =>
  (nome || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || null
const primeiroNomeDe = (nome, padrao) => (String(nome || '').trim().split(/\s+/)[0] || padrao)

// "HH:MM" de um instante (ISO ou ms); ilegível → null (o box/linha some).
export const horaDe = (iso) => {
  if (iso == null || iso === '') return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}

// Os mesmos da API: minutos aceitos num pedido, pedidos por match, tolerância padrão e o
// prazo de resposta do dono (depois dele o cron aceita por ele).
export const MINUTOS_ATRASO = [15, 30, 60]
export const MAX_PEDIDOS_ATRASO = 2
const TOLERANCIA_PADRAO_MS = 15 * 60000

// Campos de atraso que pedir-atraso e responder devolvem junto com a mensagem: a tela
// mescla só eles na demanda, sem reler.
export const camposAtrasoDe = (resp) => {
  const o = {}
  if (!resp || typeof resp !== 'object') return o
  for (const k of ['prazo_chegada', 'tolerancia_ate', 'atrasado', 'pedido_atraso', 'pedidos_atraso_restantes']) {
    if (k in resp) o[k] = resp[k]
  }
  return o
}

// Códigos do pedido de atraso → texto do alerta. A mensagem do servidor vem primeiro (é a
// mais exata); o mapa cobre a resposta sem `erro` e dá nome ao que cada código significa.
const MENSAGENS_ATRASO = {
  MINUTOS_INVALIDOS: 'Informe os minutos: 15, 30 ou 60.',
  SEM_A_CAMINHO: 'Toque em "Estou a caminho" antes de pedir mais tempo.',
  CHEGADA_DECLARADA: 'A chegada já foi registrada.',
  PEDIDO_PENDENTE: 'Já existe um pedido aguardando a resposta do cliente.',
  LIMITE_PEDIDOS: `Você já usou os ${MAX_PEDIDOS_ATRASO} pedidos de mais tempo deste atendimento.`,
  DEMANDA_FECHADA: 'Este atendimento não está mais em aberto.',
  SEM_PEDIDO: 'Não há pedido de mais tempo aguardando resposta.',
  PEDIDO_ATRASO_PENDENTE: 'Há um pedido de mais tempo aguardando resposta. Responda a ele antes.',
}
export const mensagemErroAtraso = (err, padrao) => err?.mensagem || MENSAGENS_ATRASO[err?.codigo] || padrao

// "2d 3h" · "3h 20min" · "45min" — contagem curta para o box e a linha "faltam". Sobe ao
// minuto inteiro (é quanto ESPERAR). Zero ou negativo → null: quem chama diz o que mostrar.
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

// Relógio de 30 s: os textos são em minutos, e o tique fica dentro do bloco para não
// re-renderizar a tela inteira (mesma razão dos contadores de PosMatchDono).
const useAgora = () => {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])
  return agora
}

// Aviso âmbar COMPACTO, dentro da caixa de estado (o texto longo é o CaixaAtencaoApp).
const AVISO_COMPACTO = '⚠️ Dia, horário e conclusão valem só registrados no app — fora dele, penalidade para os dois. Cancelar com menos de 12h conta como falta.'

// 1. Card do topo: chips, título, endereço (+ referência) e dois boxes.
const CardTopo = ({ demanda, endereco, pontoReferencia, valor, boxRotulo, boxValor, boxDestaque }) => {
  const temValor = valor != null && Number(valor) > 0
  return (
    <View style={estilos.topo}>
      <ChipsCategoria demanda={demanda} estilo={{ marginBottom: 8 }} />
      <Text style={estilos.titulo} numberOfLines={2}>{demanda?.titulo}</Text>
      {endereco ? <Text style={estilos.endereco} numberOfLines={2}>📍 {endereco}</Text> : null}
      {pontoReferencia ? <Text style={estilos.referencia} numberOfLines={1}>🔎 Referência: {pontoReferencia}</Text> : null}
      <View style={estilos.boxesRow}>
        {temValor && (
          <View style={[estilos.box, estilos.boxValorCombinado]}>
            <Text style={[estilos.boxRotulo, { color: cores.sucesso }]}>VALOR COMBINADO</Text>
            <Text style={[estilos.boxValor, { color: cores.sucesso }]}>{formatarValor(valor)}</Text>
          </View>
        )}
        {boxValor ? (
          <View style={[estilos.box, boxDestaque && estilos.boxDestaque]}>
            <Text style={[estilos.boxRotulo, boxDestaque && { color: cores.primaria }]}>{boxRotulo}</Text>
            <Text style={[estilos.boxValor, boxDestaque && { color: cores.primaria }]}>{boxValor}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

// Mini card da outra parte: foto → iniciais → 🏠/👷 (o mesmo do BlocoEmAndamento).
const MiniCard = ({ souDono, outro }) => {
  const nota = souDono
    ? (outro?.avaliacoes_total > 0
        ? `⭐ ${Number(outro.avaliacoes_media).toFixed(1)} (${outro.avaliacoes_total} ${outro.avaliacoes_total === 1 ? 'avaliação' : 'avaliações'})`
        : '🆕 Novo na plataforma')
    : 'Cliente'
  const especialidades = souDono ? rotulosEspecialidades(outro?.especialidades) : null
  const iniciais = iniciaisDe(outro?.nome)
  return (
    <View style={estilos.mini}>
      {outro?.foto_url ? (
        <Image source={{ uri: avatar(outro.foto_url) }} style={estilos.miniAvatar} />
      ) : (
        <View style={[estilos.miniAvatar, estilos.miniAvatarVazio]}>
          <Text style={iniciais ? estilos.miniIniciais : estilos.miniEmoji}>{iniciais || (souDono ? '👷' : '🏠')}</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={estilos.miniRotulo}>{souDono ? 'PROFISSIONAL' : 'CLIENTE'}</Text>
        {outro?.nome ? <Text style={estilos.miniNome} numberOfLines={1}>{outro.nome}</Text> : null}
        <Text style={estilos.miniNota} numberOfLines={1}>{nota}</Text>
        {especialidades ? <Text style={estilos.miniMeta} numberOfLines={1}>🛠 {especialidades}</Text> : null}
      </View>
    </View>
  )
}

// Linha de links pequenos: [{ texto, onPress, perigo }]; sem onPress o item não entra.
const Links = ({ itens }) => {
  const validos = itens.filter(i => i && i.onPress)
  if (validos.length === 0) return null
  return (
    <View style={[estilos.links, validos.length === 1 && { justifyContent: 'center' }]}>
      {validos.map((i) => (
        <TouchableOpacity key={i.texto} onPress={i.onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="link">
          <Text style={i.perigo ? estilos.linkPerigo : estilos.link}>{i.texto}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

// Botão principal laranja (chegada / a caminho). `carregando` troca o rótulo e trava.
const BotaoPrincipal = ({ rotulo, rotuloCarregando, onPress, desabilitado, carregando, estilo }) => (
  <TouchableOpacity
    style={[estilos.btnPrincipal, estilo, (desabilitado || carregando) && { opacity: 0.5 }]}
    onPress={onPress}
    disabled={desabilitado || carregando}
    activeOpacity={0.85}
    accessibilityRole="button"
  >
    <Text style={estilos.btnPrincipalTexto} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{carregando ? (rotuloCarregando || rotulo) : rotulo}</Text>
  </TouchableOpacity>
)

// ---------------------------------------------------------------------------------------
// AGENDADO — horário aceito, sem "Estou a caminho"
// ---------------------------------------------------------------------------------------
// demanda/frente/souDono/valor/endereco/pontoReferencia/outro: como no BlocoEmAndamento.
// podeDizerACaminho/onACaminho/enviandoACaminho: o botão do profissional (handleMatch).
// onReferencia (dono): abre o modal do ponto de referência. onDetalhes (profissional): abre a
// descrição e as fotos. onContrato: o alerta do contrato. cancelamento: o botão vazado ou o
// card de pedido pendente, montado pela tela. extras: nós da tela que a regra de negócio
// exige nesta fase (a vigia "o profissional veio?" do dono).
export function BlocoAgendado({
  demanda, frente, souDono, valor, endereco, pontoReferencia, outro,
  podeDizerACaminho, onACaminho, enviandoACaminho,
  onReferencia, onDetalhes, onContrato, cancelamento, extras,
}) {
  const agora = useAgora()
  const ehObra = frente === 'obra'
  const alvo = demanda?.chegada_prevista_em
  const ms = alvo ? new Date(alvo).getTime() - agora : NaN
  const faltam = duracaoCurta(ms)
  const dataTexto = formatarAgendado(alvo) || (alvo ? String(alvo) : '—')

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo} showsVerticalScrollIndicator={false} bounces={false}>
      <CardTopo
        demanda={demanda}
        endereco={endereco}
        pontoReferencia={pontoReferencia}
        valor={valor}
        boxRotulo={Number.isFinite(ms) && ms <= 0 ? 'HORÁRIO' : 'FALTAM'}
        boxValor={faltam || (Number.isFinite(ms) ? '⏰ Chegou a hora' : null)}
      />

      {/* 2. Caixa verde AGENDADO */}
      <View style={estilos.agendado}>
        <Text style={estilos.agendadoRotulo}>{ehObra ? '📅 INÍCIO AGENDADO' : '📅 AGENDADO'}</Text>
        <Text style={estilos.agendadoData}>{dataTexto}</Text>
        {souDono ? null : (
          <>
            <Text style={estilos.agendadoLinha}>Na hora de sair, avise o cliente:</Text>
            <BotaoPrincipal
              rotulo={podeDizerACaminho ? '🚗 Estou a caminho' : '🚗 Estou a caminho (libera no dia agendado)'}
              rotuloCarregando="Avisando…"
              onPress={onACaminho}
              desabilitado={!podeDizerACaminho || !onACaminho}
              carregando={enviandoACaminho}
              estilo={{ marginBottom: 10 }}
            />
          </>
        )}
        <View style={estilos.avisoCompacto}>
          <Text style={estilos.avisoCompactoTexto}>{AVISO_COMPACTO}</Text>
        </View>
      </View>

      {extras}

      {/* 3. Mini card */}
      <MiniCard souDono={souDono} outro={outro} />

      {/* 4. Links */}
      <Links itens={[
        souDono
          ? { texto: pontoReferencia ? '📍 Editar ponto de referência' : '📍 Adicionar ponto de referência', onPress: onReferencia }
          : { texto: '🔎 Ver descrição e fotos', onPress: onDetalhes },
        { texto: '📋 Contrato no e-mail', onPress: onContrato },
      ]} />

      {/* 5. Cancelamento (botão vazado ou card de pedido pendente) */}
      {cancelamento ? <View style={{ marginTop: 14 }}>{cancelamento}</View> : null}
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------------------
// A CAMINHO — a_caminho_em marcado, chegada não confirmada
// ---------------------------------------------------------------------------------------
// telefone/onWhatsApp: o botão do WhatsApp (some sem telefone). botao: { rotulo,
// rotuloCarregando, onPress, carregando } — o botão principal laranja; estado: o nó que
// toma o lugar dele quando a chegada já foi declarada (a caixa "declarou que chegou" do
// dono, a espera do profissional). onPedirAtraso (profissional, chegada não declarada):
// abre a folha "⏱ Quanto tempo a mais?" — o botão "⏱ Vou atrasar" só aparece com pedidos
// restantes e sem pedido pendente; pendente, a linha "Aguardando o cliente responder".
// onResponderAtraso(aceitar)/respondendoAtraso (dono): o card "⏱ PEDIDO DE TEMPO EXTRA"
// com Aceitar/Recusar enquanto pedido_atraso.status === 'pendente'. onNaoChegou (dono,
// chegada não declarada): "🚫 O profissional não chegou", que só aparece DEPOIS de
// tolerancia_ate e sem pedido pendente (a API recusa o expirar-match com um em aberto,
// 403 PEDIDO_ATRASO_PENDENTE). onDetalhes/onContrato: os links. Sem cancelamento nesta
// fase: a API recusa o cancelar-match depois do "Estou a caminho" (409 A_CAMINHO).
export function BlocoACaminho({
  demanda, frente, souDono, valor, endereco, pontoReferencia, outro,
  telefone, onWhatsApp, botao, estado, onNaoChegou, onDetalhes, onContrato,
  onPedirAtraso, onResponderAtraso, respondendoAtraso,
}) {
  const agora = useAgora()
  const saiu = horaDe(demanda?.a_caminho_em)
  // Prazo e tolerância vêm PRONTOS da API (ver o cabeçalho). Resposta sem os campos (API
  // antiga): o horário combinado e +15 min, que é o que os crons sempre leram.
  const prazoIso = demanda?.prazo_chegada || demanda?.chegada_prevista_em || demanda?.expira_em
  const prazoMs = prazoIso ? new Date(prazoIso).getTime() : NaN
  const toleranciaMs = demanda?.tolerancia_ate
    ? new Date(demanda.tolerancia_ate).getTime()
    : (Number.isFinite(prazoMs) ? prazoMs + TOLERANCIA_PADRAO_MS : NaN)
  const prazo = horaDe(prazoIso)
  const tolerancia = Number.isFinite(toleranciaMs) ? horaDe(toleranciaMs) : null
  const faltam = duracaoCurta(prazoMs - agora)
  const prazoVencido = Number.isFinite(prazoMs) && prazoMs <= agora
  // Atrasado: o flag do servidor OU o prazo vencido pelo relógio local — a caixa vira âmbar
  // no tique de 30 s, sem esperar o push 'atrasado' reler a demanda. Chegada já declarada
  // não é atraso (é o dono que falta confirmar), igual ao servidor.
  const semChegada = !demanda?.chegada_declarada_em && !demanda?.chegada_confirmada_em
  const atrasado = semChegada && (!!demanda?.atrasado || prazoVencido)
  const minAtraso = atrasado && Number.isFinite(prazoMs) ? Math.max(1, Math.ceil((agora - prazoMs) / 60000)) : 0
  const toleranciaVencida = Number.isFinite(toleranciaMs) && toleranciaMs <= agora
  const pedido = demanda?.pedido_atraso
  const pedidoPendente = pedido?.status === 'pendente'
  const restantes = Number(demanda?.pedidos_atraso_restantes) || 0
  const respondeAte = pedidoPendente ? horaDe(pedido?.responde_ate) : null
  // "Chegaria até": o novo limite se o dono aceitar agora — GREATEST(NOW(), limite atual) +
  // minutos, como a API calcula (SQL_NOVO_LIMITE); o limite atual é tolerancia_ate.
  const chegariaAte = pedidoPendente && Number(pedido?.minutos) > 0
    ? horaDe(Math.max(agora, Number.isFinite(toleranciaMs) ? toleranciaMs : agora) + Number(pedido.minutos) * 60000)
    : null
  const nomeOutro = primeiroNomeDe(outro?.nome, 'O profissional')
  const linhaLimite = prazo
    ? `${souDono ? 'Deve chegar até' : 'Chegue até'} ${prazo}${faltam ? ` · faltam ${faltam}` : prazoVencido ? ' · horário de chegada já passou' : ''}`
    : null

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo} showsVerticalScrollIndicator={false} bounces={false}>
      <CardTopo
        demanda={demanda}
        endereco={endereco}
        pontoReferencia={pontoReferencia}
        valor={valor}
        boxRotulo={atrasado ? 'TOLERÂNCIA ATÉ' : souDono ? 'CHEGA ATÉ' : 'CHEGAR ATÉ'}
        boxValor={atrasado ? (tolerancia || prazo) : prazo}
        boxDestaque={atrasado}
      />

      {/* 2. Caixa azul A CAMINHO — âmbar ATRASADO depois do prazo */}
      {atrasado ? (
        <View style={estilos.atrasado}>
          <Text style={estilos.atrasadoRotulo}>{souDono ? '⏰ PROFISSIONAL ATRASADO' : '⏰ VOCÊ ESTÁ ATRASADO'}</Text>
          <Text style={estilos.atrasadoMinutos}>{minAtraso} min de atraso</Text>
          <Text style={estilos.atrasadoTexto}>
            {souDono
              ? `Pequenos atrasos acontecem. Ele tem tolerância até ${tolerancia || '—'} — depois disso você poderá marcar que não chegou.`
              : `Tolerância até ${tolerancia || '—'}. Depois disso, sem aviso, conta como falta. O cliente já foi avisado.`}
          </Text>
        </View>
      ) : (
        <View style={estilos.aCaminho}>
          <Text style={estilos.aCaminhoRotulo}>{souDono ? '🚗 PROFISSIONAL A CAMINHO' : '🚗 VOCÊ ESTÁ A CAMINHO'}</Text>
          {saiu ? <Text style={estilos.aCaminhoSaiu}>{souDono ? 'saiu às' : 'avisou às'} {saiu}</Text> : null}
          {linhaLimite ? <Text style={[estilos.aCaminhoLimite, prazoVencido && { color: cores.primaria }]}>{linhaLimite}</Text> : null}
        </View>
      )}

      {/* 3. WhatsApp */}
      {telefone ? (
        <TouchableOpacity style={estilos.btnWhatsApp} onPress={onWhatsApp} activeOpacity={0.85} accessibilityRole="button">
          <Text style={estilos.btnWhatsAppTexto} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>💬 WhatsApp {souDono ? 'do profissional' : 'do cliente'}: {telefone}</Text>
        </TouchableOpacity>
      ) : null}

      {/* 4. Chegada: o botão principal ou o estado já declarado */}
      {estado ? estado : botao ? (
        <BotaoPrincipal
          rotulo={botao.rotulo}
          rotuloCarregando={botao.rotuloCarregando}
          onPress={botao.onPress}
          desabilitado={botao.desabilitado}
          carregando={botao.carregando}
        />
      ) : null}

      {/* 5. Pedido de atraso — profissional: "Vou atrasar" ou a espera; dono: o card a responder */}
      {!souDono && pedidoPendente ? (
        <View style={estilos.aguardando}>
          <Text style={estilos.aguardandoTexto}>⏳ Aguardando o cliente responder{respondeAte ? ` (até ${respondeAte})` : ''}</Text>
        </View>
      ) : !souDono && onPedirAtraso && restantes > 0 ? (
        <TouchableOpacity style={estilos.btnAtrasar} onPress={onPedirAtraso} activeOpacity={0.8} accessibilityRole="button">
          <Text style={estilos.btnAtrasarTexto}>{atrasado ? '⏱ Vou atrasar mais' : '⏱ Vou atrasar'}</Text>
        </TouchableOpacity>
      ) : null}
      {souDono && pedidoPendente && onResponderAtraso ? (
        <View style={estilos.pedidoAtraso}>
          <Text style={estilos.pedidoAtrasoRotulo}>⏱ PEDIDO DE TEMPO EXTRA</Text>
          <Text style={estilos.pedidoAtrasoTitulo}>{nomeOutro} pediu +{Number(pedido.minutos) || 0} min</Text>
          <Text style={estilos.pedidoAtrasoLinha} numberOfLines={2}>
            {chegariaAte ? `Chegaria até ${chegariaAte}` : 'Novo prazo ao aceitar'}{pedido.motivo ? ` · motivo: ${pedido.motivo}` : ''}
          </Text>
          <View style={estilos.pedidoAtrasoBotoes}>
            <TouchableOpacity style={[estilos.btnAceitar, respondendoAtraso && { opacity: 0.5 }]} onPress={() => onResponderAtraso(true)} disabled={!!respondendoAtraso} activeOpacity={0.85} accessibilityRole="button">
              <Text style={estilos.btnAceitarTexto}>{respondendoAtraso ? 'Enviando…' : '✓ Aceitar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[estilos.btnRecusar, respondendoAtraso && { opacity: 0.5 }]} onPress={() => onResponderAtraso(false)} disabled={!!respondendoAtraso} activeOpacity={0.85} accessibilityRole="button">
              <Text style={estilos.btnRecusarTexto}>✕ Recusar</Text>
            </TouchableOpacity>
          </View>
          <Text style={estilos.pedidoAtrasoNota}>Se aceitar, o novo prazo vale para os dois. Se recusar, o pedido volta para outros profissionais, sem falta para ele.</Text>
        </View>
      ) : null}

      {/* 6. "Não chegou" (dono): só depois da tolerância e sem pedido de atraso em aberto. */}
      {onNaoChegou && toleranciaVencida && !pedidoPendente ? (
        <TouchableOpacity style={estilos.btnNaoChegou} onPress={onNaoChegou} activeOpacity={0.8} accessibilityRole="button">
          <Text style={estilos.btnNaoChegouTexto}>🚫 O profissional não chegou</Text>
        </TouchableOpacity>
      ) : null}

      {/* 7. Mini card */}
      <MiniCard souDono={souDono} outro={outro} />

      {/* 8. Links */}
      <Links itens={[
        souDono
          ? { texto: '📋 Contrato no e-mail', onPress: onContrato }
          : { texto: '🔎 Ver descrição e fotos', onPress: onDetalhes },
      ]} />
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------------------
// Folha "⏱ Quanto tempo a mais?" — o pedido de atraso do profissional.
// ---------------------------------------------------------------------------------------
// onEnviar(minutos, motivo): a tela faz o POST /pedir-atraso e fecha a folha no sucesso;
// `enviando` trava os botões. Chips 15/30/60 (MINUTOS_ATRASO), motivo opcional até 200.
// O estado zera a cada abertura, para o segundo pedido não herdar o primeiro.
export function ModalPedirAtraso({ visivel, onFechar, onEnviar, enviando }) {
  const insets = useSafeAreaInsets()
  const [minutos, setMinutos] = useState(null)
  const [motivo, setMotivo] = useState('')
  useEffect(() => { if (visivel) { setMinutos(null); setMotivo('') } }, [visivel])
  const fechar = () => { if (!enviando) onFechar?.() }
  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={fechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={estilos.detalhesFundo}>
        <TouchableOpacity style={{ flex: 1 }} onPress={fechar} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={[estilos.detalhesCard, { paddingBottom: Math.max(28, insets.bottom + 20) }]}>
          <Text style={estilos.detalhesTitulo}>⏱ Quanto tempo a mais?</Text>
          <Text style={estilos.atrasoFolhaTexto}>O cliente recebe o pedido na hora e decide se aceita. Você pode pedir até {MAX_PEDIDOS_ATRASO} vezes neste serviço.</Text>
          <View style={estilos.chips}>
            {MINUTOS_ATRASO.map((m) => (
              <TouchableOpacity
                key={m}
                style={[estilos.chip, minutos === m && estilos.chipAtivo]}
                onPress={() => setMinutos(m)}
                disabled={!!enviando}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: minutos === m }}
              >
                <Text style={[estilos.chipTexto, minutos === m && estilos.chipTextoAtivo]}>+{m} min</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={estilos.detalhesSecao}>Motivo (opcional)</Text>
          <TextInput
            style={estilos.atrasoMotivo}
            value={motivo}
            onChangeText={setMotivo}
            placeholder="Ex: trânsito parado na avenida"
            placeholderTextColor={cores.textoFraco}
            maxLength={200}
            editable={!enviando}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
          />
          <BotaoPrincipal
            rotulo="Avisar o cliente"
            rotuloCarregando="Avisando…"
            onPress={() => onEnviar?.(minutos, motivo.trim())}
            desabilitado={!minutos}
            carregando={!!enviando}
            estilo={{ marginTop: 14, marginBottom: 8 }}
          />
          <TouchableOpacity onPress={fechar} disabled={!!enviando} style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 }} accessibilityRole="button">
            <Text style={estilos.linkNeutro}>Agora não</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------
// Descrição e fotos do pedido, para o profissional, sem sair da tela única.
// ---------------------------------------------------------------------------------------
// children: a tira de mídia que a tela já monta (TileMidia). extras: os modais de tela cheia
// (foto/vídeo) da tela, montados AQUI DENTRO enquanto a folha está aberta — no iOS um segundo
// Modal irmão não é apresentado por cima de outro já visível; aninhado, é.
export function ModalDetalhesDemanda({ visivel, onFechar, titulo, descricao, children, extras }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.detalhesFundo}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onFechar} activeOpacity={1} accessibilityRole="button" accessibilityLabel="Fechar" />
        <View style={[estilos.detalhesCard, { paddingBottom: Math.max(28, insets.bottom + 20) }]}>
          <View style={estilos.detalhesCabecalho}>
            <Text style={estilos.detalhesTitulo} numberOfLines={2}>{titulo}</Text>
            <TouchableOpacity onPress={onFechar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Fechar">
              <Text style={estilos.detalhesFechar}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {descricao ? (
              <>
                <Text style={estilos.detalhesSecao}>Descrição</Text>
                <Text style={estilos.detalhesTexto}>{descricao}</Text>
              </>
            ) : null}
            {children ? (
              <>
                <Text style={estilos.detalhesSecao}>Fotos e vídeos</Text>
                {children}
              </>
            ) : null}
            {!descricao && !children ? <Text style={estilos.detalhesTexto}>Este pedido não tem descrição nem fotos.</Text> : null}
          </ScrollView>
          {extras}
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  conteudo: { flexGrow: 1, paddingBottom: 16 },
  // Mesmo card do topo do BlocoEmAndamento.
  topo: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  titulo: { fontSize: 18, fontWeight: '700', color: cores.textoForte, lineHeight: 24, marginBottom: 4 },
  endereco: { fontSize: 12, color: cores.textoMedio, lineHeight: 17 },
  referencia: { fontSize: 12, color: cores.textoMedio, lineHeight: 17 },
  boxesRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  box: { flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 10 },
  boxValorCombinado: { backgroundColor: cores.sucessoSuave, borderColor: cores.sucesso + '55' },
  boxDestaque: { backgroundColor: cores.primariaSuave, borderColor: cores.primariaBorda },
  boxRotulo: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: cores.textoMedio, marginBottom: 3 },
  boxValor: { fontSize: 16, fontWeight: '800', color: cores.textoForte },

  // Verde do card AGENDADO (PosMatchProfissional.agendadoCard / emAndamentoBox).
  agendado: { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  agendadoRotulo: { fontSize: 12, fontWeight: '800', color: '#4caf50', letterSpacing: 0.5, marginBottom: 4 },
  agendadoData: { fontSize: 22, fontWeight: '800', color: cores.textoForte, lineHeight: 28, marginBottom: 6 },
  agendadoLinha: { fontSize: 13, color: cores.textoForte, lineHeight: 19, marginBottom: 10 },
  avisoCompacto: { backgroundColor: 'rgba(255,193,7,0.10)', borderWidth: 1, borderColor: 'rgba(255,193,7,0.45)', borderRadius: raios.pequeno, paddingHorizontal: 10, paddingVertical: 8 },
  avisoCompactoTexto: { fontSize: 11, color: '#FFC107', lineHeight: 16 },

  // Azul do estado A CAMINHO (tokens info do tema).
  aCaminho: { backgroundColor: cores.infoSuave, borderWidth: 1, borderColor: cores.infoBorda, borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  aCaminhoRotulo: { fontSize: 13, fontWeight: '800', color: cores.info, letterSpacing: 0.3, marginBottom: 4 },
  aCaminhoSaiu: { fontSize: 13, color: cores.textoForte, lineHeight: 19 },
  aCaminhoLimite: { fontSize: 13, fontWeight: '600', color: cores.textoForte, lineHeight: 19, marginTop: 2 },

  // Mesmo btnWhatsApp das telas de detalhe.
  btnWhatsApp: { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#25D366', borderRadius: raios.medio, padding: 13, alignItems: 'center', marginBottom: 10 },
  btnWhatsAppTexto: { fontSize: 13, fontWeight: '600', color: '#25D366' },
  // Laranja do btnMatch / btnPerguntarTempo das telas.
  btnPrincipal: { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnPrincipalTexto: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },
  btnNaoChegou: { backgroundColor: 'transparent', borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.medio, padding: 12, alignItems: 'center', marginBottom: 12 },
  btnNaoChegouTexto: { fontSize: 13, fontWeight: '700', color: cores.perigo },

  // Âmbar do atraso e do pedido de tempo extra (mesma paleta do avisoCompacto).
  atrasado: { backgroundColor: 'rgba(255,193,7,0.10)', borderWidth: 1, borderColor: 'rgba(255,193,7,0.55)', borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  atrasadoRotulo: { fontSize: 13, fontWeight: '800', color: '#FFC107', letterSpacing: 0.3, marginBottom: 4 },
  atrasadoMinutos: { fontSize: 22, fontWeight: '800', color: cores.textoForte, lineHeight: 28, marginBottom: 4 },
  atrasadoTexto: { fontSize: 12, color: cores.textoForte, lineHeight: 17 },
  // Vazado âmbar, pequeno: "⏱ Vou atrasar".
  btnAtrasar: { alignSelf: 'center', borderWidth: 1, borderColor: '#FFC107', borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 12 },
  btnAtrasarTexto: { fontSize: 12, fontWeight: '700', color: '#FFC107' },
  aguardando: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 12, alignItems: 'center', marginBottom: 12 },
  aguardandoTexto: { fontSize: 13, color: cores.textoForte, lineHeight: 19 },
  pedidoAtraso: { backgroundColor: 'rgba(255,193,7,0.10)', borderWidth: 1, borderColor: 'rgba(255,193,7,0.55)', borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  pedidoAtrasoRotulo: { fontSize: 12, fontWeight: '800', color: '#FFC107', letterSpacing: 0.5, marginBottom: 4 },
  pedidoAtrasoTitulo: { fontSize: 17, fontWeight: '800', color: cores.textoForte, lineHeight: 22, marginBottom: 2 },
  pedidoAtrasoLinha: { fontSize: 13, color: cores.textoForte, lineHeight: 18, marginBottom: 10 },
  pedidoAtrasoBotoes: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  btnAceitar: { flex: 1, backgroundColor: cores.sucesso, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  btnAceitarTexto: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  btnRecusar: { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  btnRecusarTexto: { fontSize: 14, fontWeight: '700', color: cores.perigo },
  pedidoAtrasoNota: { fontSize: 11, color: cores.textoMedio, lineHeight: 16 },
  // Folha do pedido de atraso.
  atrasoFolhaTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 19, marginTop: 4, marginBottom: 12 },
  chips: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, borderWidth: 1, borderColor: cores.borda, backgroundColor: cores.fundoElevado, borderRadius: raios.pill, paddingVertical: 10, alignItems: 'center' },
  chipAtivo: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  chipTexto: { fontSize: 14, fontWeight: '700', color: cores.textoForte },
  chipTextoAtivo: { color: cores.primaria },
  atrasoMotivo: { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: cores.textoForte },
  linkNeutro: { fontSize: 13, fontWeight: '600', color: cores.textoMedio },

  // Mini card (PosMatchEmAndamento.mini).
  mini: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 12, marginBottom: 12 },
  miniAvatar: { width: 44, height: 44, borderRadius: 22 },
  miniAvatarVazio: { backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center' },
  miniIniciais: { color: cores.primaria, fontSize: 15, fontWeight: '700' },
  miniEmoji: { fontSize: 20 },
  miniRotulo: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: cores.textoMedio, marginBottom: 2 },
  miniNome: { fontSize: 14, fontWeight: '700', color: cores.textoForte, lineHeight: 19 },
  miniNota: { fontSize: 12, color: cores.primaria, fontWeight: '600', marginTop: 1 },
  miniMeta: { fontSize: 12, color: cores.textoMedio, marginTop: 2, lineHeight: 17 },

  links: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
  linkPerigo: { fontSize: 12, fontWeight: '600', color: cores.perigo },
  link: { fontSize: 12, fontWeight: '600', color: '#8888cc' },

  // Folha de descrição e fotos.
  detalhesFundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  detalhesCard: { backgroundColor: cores.fundoCard, borderTopLeftRadius: raios.grande, borderTopRightRadius: raios.grande, padding: 20, paddingBottom: 28 },
  detalhesCabecalho: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  detalhesTitulo: { flex: 1, fontSize: 16, fontWeight: '700', color: cores.textoForte, lineHeight: 22 },
  detalhesFechar: { fontSize: 18, fontWeight: '700', color: cores.textoFraco },
  detalhesSecao: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, color: cores.textoMedio, marginTop: 10, marginBottom: 6 },
  detalhesTexto: { fontSize: 14, color: cores.textoForte, lineHeight: 21 },
})
