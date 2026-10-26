import React from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'
import { rotulosEspecialidades } from '../utils/categorias'
import { avatar } from '../utils/imagemOtimizada'
import ChipsCategoria from './ChipsCategoria'
import { formatarAgendado } from './Agendamento'

// Tela ÚNICA do serviço EM ANDAMENTO (chegada confirmada, ainda não encerrado), para os
// quatro lados — dono e profissional, reparo e obra. Mesma linguagem visual dos blocos
// pós-match (PosMatchDono / PosMatchProfissional: card do topo, boxes, mini card), sem
// rolagem: o que a pessoa precisa aqui é o botão de concluir e o contato, não a descrição.
// Ordem fixa:
//   1. card do topo: chips de categoria, título, endereço (+ referência), "Valor combinado"
//      e "Chegou às HH:MM";
//   2. caixa verde "▶️ SERVIÇO EM ANDAMENTO · desde hoje às HH:MM" com a linha do papel;
//   3. botão do WhatsApp (quando a API já mandou o telefone);
//   4. o botão verde principal (a tela passa rótulo, ação e travas — as mesmas de sempre);
//   5. mini card da outra parte;
//   6. links pequenos: "🚩 Denunciar um problema" e "📋 Contrato no seu e-mail".

const formatarValor = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const p2 = (n) => String(n).padStart(2, '0')
const iniciaisDe = (nome) =>
  (nome || '').split(' ').map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || null

// "HH:MM" da chegada confirmada; ilegível → null (o box some, "em andamento" fica).
const horaDe = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}
// "hoje às 14:00" no mesmo dia; noutro dia a data completa (serviço que virou o dia).
const desdeTexto = (iso) => {
  const hora = horaDe(iso)
  if (!hora) return null
  const d = new Date(iso), h = new Date()
  const mesmoDia = d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate()
  return mesmoDia ? `hoje às ${hora}` : (formatarAgendado(iso) || hora)
}

// demanda: a linha do reparo/obra. souDono: decide os textos. valor: o combinado.
// endereco / pontoReferencia: o que o card do topo mostra. chegadaEm: chegada_confirmada_em.
// outro: { nome, foto_url, avaliacoes_media, avaliacoes_total, cidade, bairro, especialidades }
//        — o profissional (para o dono) ou o cliente (para o profissional).
// telefone/onWhatsApp: o botão verde do WhatsApp (some sem telefone).
// rotuloBotao/onConcluir/desabilitado/enviando: o botão principal, com as travas da tela.
// onDenunciar / onContrato: os dois links do rodapé.
export default function BlocoEmAndamento({
  demanda, souDono, valor, endereco, pontoReferencia, chegadaEm, outro,
  telefone, onWhatsApp, rotuloBotao, onConcluir, desabilitado, enviando, onDenunciar, onContrato,
}) {
  const temValor = valor != null && Number(valor) > 0
  const hora = horaDe(chegadaEm)
  const desde = desdeTexto(chegadaEm)
  const nota = souDono
    ? (outro?.avaliacoes_total > 0
        ? `⭐ ${Number(outro.avaliacoes_media).toFixed(1)} (${outro.avaliacoes_total} ${outro.avaliacoes_total === 1 ? 'avaliação' : 'avaliações'})`
        : '🆕 Novo na plataforma')
    : 'Cliente'
  const especialidades = souDono ? rotulosEspecialidades(outro?.especialidades) : null
  const iniciais = iniciaisDe(outro?.nome)

  return (
    <View style={estilos.tela}>
      {/* 1. Card do topo */}
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
          {hora && (
            <View style={estilos.box}>
              <Text style={estilos.boxRotulo}>CHEGOU ÀS</Text>
              <Text style={estilos.boxValor}>{hora}</Text>
            </View>
          )}
        </View>
      </View>

      {/* 2. Em andamento */}
      <View style={estilos.andamento}>
        <Text style={estilos.andamentoTitulo}>▶️ SERVIÇO EM ANDAMENTO{desde ? ` · desde ${desde}` : ''}</Text>
        <Text style={estilos.andamentoTexto}>
          {souDono
            ? 'Quando o serviço terminar, confirme aqui para avaliar o profissional.'
            : 'Ao terminar, peça ao cliente para confirmar a conclusão no app.'}
        </Text>
      </View>

      {/* 3. WhatsApp */}
      {telefone ? (
        <TouchableOpacity style={estilos.btnWhatsApp} onPress={onWhatsApp} activeOpacity={0.85} accessibilityRole="button">
          <Text style={estilos.btnWhatsAppTexto}>💬 WhatsApp {souDono ? 'do profissional' : 'do cliente'}: {telefone}</Text>
        </TouchableOpacity>
      ) : null}

      {/* 4. Botão principal */}
      <TouchableOpacity
        style={[estilos.btnConcluir, (desabilitado || enviando) && { opacity: 0.6 }]}
        onPress={onConcluir}
        disabled={desabilitado || enviando}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <Text style={estilos.btnConcluirTexto}>{enviando ? 'Encerrando…' : rotuloBotao}</Text>
      </TouchableOpacity>

      {/* 5. Mini card da outra parte: foto → iniciais → 🏠/👷 */}
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

      {/* 6. Links */}
      <View style={estilos.links}>
        <TouchableOpacity onPress={onDenunciar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="link">
          <Text style={estilos.linkPerigo}>🚩 Denunciar um problema</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onContrato} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="link">
          <Text style={estilos.link}>📋 Contrato no seu e-mail</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  // Mesmo card do topo dos blocos pós-match (PosMatchDono.topo), um pouco mais compacto.
  topo: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  titulo: { fontSize: 18, fontWeight: '700', color: cores.textoForte, lineHeight: 24, marginBottom: 4 },
  endereco: { fontSize: 12, color: cores.textoMedio, lineHeight: 17 },
  referencia: { fontSize: 12, color: cores.textoMedio, lineHeight: 17 },
  boxesRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  box: { flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 10 },
  boxValorCombinado: { backgroundColor: cores.sucessoSuave, borderColor: cores.sucesso + '55' },
  boxRotulo: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: cores.textoMedio, marginBottom: 3 },
  boxValor: { fontSize: 16, fontWeight: '800', color: cores.textoForte },

  // Verde do emAndamentoBox / card AGENDADO (mesmas cores).
  andamento: { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#4caf50', borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  andamentoTitulo: { fontSize: 13, fontWeight: '800', color: '#4caf50', letterSpacing: 0.3, marginBottom: 6 },
  andamentoTexto: { fontSize: 13, color: cores.textoForte, lineHeight: 19 },

  // Mesmo btnWhatsApp / btnEncerrar das telas de detalhe.
  btnWhatsApp: { backgroundColor: '#1a3a1a', borderWidth: 1, borderColor: '#25D366', borderRadius: raios.medio, padding: 13, alignItems: 'center', marginBottom: 10 },
  btnWhatsAppTexto: { fontSize: 13, fontWeight: '600', color: '#25D366' },
  btnConcluir: { backgroundColor: cores.sucesso, borderRadius: raios.medio, padding: 16, alignItems: 'center', marginBottom: 12 },
  btnConcluirTexto: { fontSize: 15, fontWeight: '700', color: '#0A0A0A' },

  // Mini card dos blocos pós-match (PosMatchProfissional.mini).
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
})
