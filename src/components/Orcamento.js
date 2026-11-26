import React, { useState, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Keyboard } from 'react-native'
import { cores, raios } from '../utils/tema'
import { PickerAgendamento } from './Agendamento'

// VISITA PARA ORÇAMENTO (artes orcamento-previa A/B/C e orcamento-dica-cliente-previa D), para
// obras E reparos. Tudo o que DetalheObra e DetalheReparo mostram sobre o assunto mora aqui,
// para as duas telas não divergirem.
//
// Contrato (pinturapro-api da01188, utils/orcamentoVisita):
//   - POST /obras/:id/candidatura e POST /reparos/:id/interesse levam SEMPRE suporta_orcamento:
//     true, e tipo_proposta 'valor' (valor_proposto, mínimo R$ 20 → 400 VALOR_MINIMO) ou 'visita'
//     (visita_gratis, visita_valor quando cobrada, visita_quando ISO com fuso → 400
//     VISITA_QUANDO_OBRIGATORIA / VISITA_NO_PASSADO / VISITA_VALOR_OBRIGATORIO);
//   - o dono responde em POST …/responder: 'aceitar_visita' (status 'visita_aceita', pedido segue
//     aberto, endereço liberado só para esse profissional), 'aceitar' (o aceite de sempre, no
//     orçamento) ou 'recusar';
//   - com 'visita_aceita' o profissional manda POST …/orcamento { valor, prazo_dias, data_inicio
//     (AAAA-MM-DD), observacao } → status 'orcamento_enviado';
//   - cada proposta traz tipo_proposta, visita_*, orcamento_* e mensagem_profissional (na visita,
//     `mensagem` é um texto montado para o app antigo — nunca mostrar).

export const STATUS_VISITA_ACEITA = 'visita_aceita'
export const STATUS_ORCAMENTO_ENVIADO = 'orcamento_enviado'
export const CODIGOS_ERRO_PROPOSTA = ['VALOR_MINIMO', 'VISITA_QUANDO_OBRIGATORIA', 'VISITA_NO_PASSADO', 'VISITA_VALOR_OBRIGATORIO', 'TIPO_PROPOSTA_INVALIDO']

const p2 = (n) => String(n).padStart(2, '0')
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const inicioDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const reais = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// "2.500,00" (máscara das telas) → 2500; vazio/ilegível → null.
const numeroDe = (mascarado) => {
  const n = parseFloat(String(mascarado ?? '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const mascararValor = (v) => {
  const nums = String(v ?? '').replace(/\D/g, '')
  if (!nums) return ''
  const centavos = Math.min(parseInt(nums, 10), 9999999999)
  const reaisStr = Math.floor(centavos / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${reaisStr},${String(centavos % 100).padStart(2, '0')}`
}

export const ehVisita = (item) => item?.tipo_proposta === 'visita'
export const ehOrcamentoEnviado = (item) => ehVisita(item) && item?.status === STATUS_ORCAMENTO_ENVIADO
// Visita ainda em negociação (proposta, aceita ou com orçamento à espera): é quando o card do
// dono troca valor/botões pelos da visita. Depois do aceite do orçamento a proposta é a de sempre.
export const visitaEmAberto = (item) =>
  ehVisita(item) && ['pendente', STATUS_VISITA_ACEITA, STATUS_ORCAMENTO_ENVIADO].includes(item?.status)

// O que o PROFISSIONAL escreveu (nunca `mensagem` numa visita).
export const mensagemDoProfissional = (item) => {
  if (!item) return null
  if (item.mensagem_profissional !== undefined) return item.mensagem_profissional || null
  return ehVisita(item) ? null : (item.mensagem || null)
}

// "amanhã, 27/11, às 14h" / "sábado, 28/11, às 9h30" no fuso do aparelho; data ilegível → null.
export const quandoVisita = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const dif = Math.round((inicioDoDia(d).getTime() - inicioDoDia(new Date()).getTime()) / 86400000)
  const dia = dif === 0 ? 'hoje' : dif === 1 ? 'amanhã' : DIAS[d.getDay()]
  return `${dia}, ${p2(d.getDate())}/${p2(d.getMonth() + 1)}, às ${d.getHours()}h${d.getMinutes() ? p2(d.getMinutes()) : ''}`
}
// 'AAAA-MM-DD' → "01/12", sem passar por fuso.
export const dataCurta = (data) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data ?? ''))
  return m ? `${m[3]}/${m[2]}` : null
}
const rotuloVisita = (item) => (item?.visita_gratis || !(Number(item?.visita_valor) > 0) ? 'Grátis' : reais(item.visita_valor).replace(',00', ''))
const maiuscula = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// ---------------------------------------------------------------------------------------
// A · Profissional monta a proposta
// ---------------------------------------------------------------------------------------

// Estado do "TIPO DE PROPOSTA" para a tela de detalhe:
//   ehVisita — esconde o bloco de valor do formulário de sempre;
//   campos   — o seletor e, na visita, Grátis/Cobrada + valor + "Quando posso ir ao local";
//   corpo(valorNumerico) — os campos da proposta para o POST (suporta_orcamento incluso).
export function usePropostaVisita() {
  const [tipo, setTipo] = useState('valor')
  const [gratis, setGratis] = useState(true)
  const [valorVisita, setValorVisita] = useState('')
  const [quando, setQuando] = useState(null)
  const visita = tipo === 'visita'
  const corpo = (valorNumerico) => (visita
    ? { suporta_orcamento: true, tipo_proposta: 'visita', visita_gratis: gratis, ...(gratis ? {} : { visita_valor: numeroDe(valorVisita) }), visita_quando: quando }
    : { suporta_orcamento: true, tipo_proposta: 'valor', valor_proposto: valorNumerico })
  const campos = (
    <CamposTipoProposta
      tipo={tipo} onTipo={setTipo}
      gratis={gratis} onGratis={setGratis}
      valorVisita={valorVisita} onValorVisita={(t) => setValorVisita(mascararValor(t))}
      quando={quando} onQuando={setQuando}
    />
  )
  return { ehVisita: visita, campos, corpo }
}

const OpcaoTipo = ({ marcada, titulo, sub, onPress }) => (
  <TouchableOpacity
    style={[estilos.opcao, marcada && estilos.opcaoMarcada]}
    onPress={onPress}
    activeOpacity={0.8}
    accessibilityRole="radio"
    accessibilityState={{ selected: marcada }}
  >
    <Text style={estilos.opcaoTitulo}>{titulo}</Text>
    <Text style={estilos.opcaoSub}>{sub}</Text>
  </TouchableOpacity>
)

function CamposTipoProposta({ tipo, onTipo, gratis, onGratis, valorVisita, onValorVisita, quando, onQuando }) {
  const [escolhendo, setEscolhendo] = useState(false)
  const visita = tipo === 'visita'
  const texto = quandoVisita(quando)
  // "Amanhã, 27/11 · ⏰ 14h"
  const [dia, hora] = texto ? [texto.slice(0, texto.lastIndexOf(', às')), texto.slice(texto.lastIndexOf('às ') + 3)] : [null, null]
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={estilos.rotulo}>TIPO DE PROPOSTA</Text>
      <OpcaoTipo marcada={!visita} titulo="💰 Valor fechado" sub="Já sei quanto cobro pelo serviço" onPress={() => onTipo('valor')} />
      <OpcaoTipo marcada={visita} titulo="📋 Visita para orçamento" sub="Preciso ver o local antes de passar o valor" onPress={() => { Keyboard.dismiss(); onTipo('visita') }} />
      {visita && (
        <>
          <Text style={[estilos.rotulo, { marginTop: 8 }]}>A VISITA É</Text>
          <View style={estilos.segmento}>
            {[{ v: true, t: 'Grátis' }, { v: false, t: 'Cobrada' }].map(o => {
              const ativo = gratis === o.v
              return (
                <TouchableOpacity key={o.t} style={[estilos.segmentoItem, ativo && estilos.segmentoAtivo]} onPress={() => onGratis(o.v)} activeOpacity={0.8} accessibilityRole="radio" accessibilityState={{ selected: ativo }}>
                  <Text style={[estilos.segmentoTexto, ativo && estilos.segmentoTextoAtivo]}>{o.t}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {!gratis && (
            <TextInput
              style={[estilos.campo, { marginTop: 8 }]}
              placeholder="Valor da visita – R$ (ex: 50,00)"
              placeholderTextColor={cores.placeholderCampo}
              keyboardType="numeric"
              value={valorVisita}
              onChangeText={onValorVisita}
              accessibilityLabel="Valor da visita, em reais"
            />
          )}
          <Text style={[estilos.rotulo, { marginTop: 14 }]}>QUANDO POSSO IR AO LOCAL</Text>
          {escolhendo ? (
            <PickerAgendamento
              titulo="Dia e hora da visita"
              limite={null}
              rotuloBotao="Confirmar dia e hora"
              enviando={false}
              onEnviar={(iso) => { onQuando(iso); setEscolhendo(false) }}
              onCancelar={() => setEscolhendo(false)}
            />
          ) : (
            <TouchableOpacity style={estilos.campoToque} onPress={() => { Keyboard.dismiss(); setEscolhendo(true) }} activeOpacity={0.8} accessibilityRole="button">
              <Text style={texto ? estilos.campoToqueTexto : estilos.campoToqueVazio}>
                {texto ? `📅 ${maiuscula(dia)} · ⏰ ${hora}` : '📅 Escolher dia e hora'}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  )
}

// Aviso amarelo, abaixo do botão de enviar.
export const DicaValorMinimo = () => (
  <View style={estilos.dicaAmarela}>
    <Text style={estilos.dicaAmarelaTexto}>💡 Em "Valor fechado", valores abaixo de R$ 20 não são aceitos. Se ainda não sabe o preço, use a visita.</Text>
  </View>
)

// ---------------------------------------------------------------------------------------
// B e C · Cliente vê as propostas
// ---------------------------------------------------------------------------------------

export const PilulaValorFechado = ({ valorFmt }) => (
  <View style={[estilos.pilula, estilos.pilulaVerde]}>
    <Text style={[estilos.pilulaTexto, { color: cores.sucesso }]}>💰 Valor fechado · R$ {valorFmt}</Text>
  </View>
)

// Estilo extra do card do interessado com orçamento à espera (borda verde).
export const estiloCardOrcamento = { borderWidth: 1, borderColor: cores.sucesso }

// O que entra no card do dono no lugar da linha de valor, enquanto a visita está em aberto.
export function BlocoVisitaDono({ item }) {
  if (!visitaEmAberto(item)) return null
  if (item.status === STATUS_ORCAMENTO_ENVIADO) {
    const inicio = dataCurta(item.orcamento_data_inicio)
    const dias = Number(item.orcamento_prazo_dias)
    return (
      <View style={{ marginBottom: 4 }}>
        <View style={[estilos.pilula, estilos.pilulaVerde]}>
          <Text style={[estilos.pilulaTexto, { color: cores.sucesso }]}>💰 Orçamento após visita · {reais(item.orcamento_valor ?? item.valor_proposto)}</Text>
        </View>
        <Text style={estilos.linha}>
          {[dias > 0 ? `⏱️ Prazo: ${dias} ${dias === 1 ? 'dia' : 'dias'}` : null, inicio ? `📅 Começa em ${inicio}` : null].filter(Boolean).join(' · ')}
        </Text>
        {item.orcamento_observacao ? <Text style={estilos.observacao}>"{item.orcamento_observacao}"</Text> : null}
      </View>
    )
  }
  const quando = quandoVisita(item.visita_quando)
  return (
    <View style={{ marginBottom: 4 }}>
      <View style={[estilos.pilula, estilos.pilulaAzul]}>
        <Text style={[estilos.pilulaTexto, { color: '#7DB4FF' }]}>📋 Visita para orçamento · {rotuloVisita(item)}</Text>
      </View>
      {quando ? <Text style={estilos.linha}>📅 Pode ir {quando}</Text> : null}
    </View>
  )
}

// Botões do dono numa visita em aberto. onResponder(action): 'aceitar_visita' | 'aceitar' | 'recusar'.
export function AcoesVisitaDono({ item, enviando, onResponder }) {
  if (!visitaEmAberto(item)) return null
  if (item.status === STATUS_VISITA_ACEITA) {
    return (
      <View style={estilos.notaVerde}>
        <Text style={estilos.notaVerdeTexto}>✅ Visita aceita. Aguardando o orçamento do profissional. O pedido continua aberto para outras propostas.</Text>
      </View>
    )
  }
  const orcamento = item.status === STATUS_ORCAMENTO_ENVIADO
  const aceitar = () => (orcamento
    ? Alert.alert('Aceitar este orçamento?', 'O profissional será avisado e a demanda deixa de receber outras propostas.\n\nO pagamento do serviço é combinado e acertado diretamente com ele.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aceitar orçamento', onPress: () => onResponder('aceitar') },
      ])
    : Alert.alert('Aceitar esta visita?', 'O profissional será avisado e passa a ver o endereço completo. O pedido continua aberto para outras propostas, e você só decide depois de receber o orçamento.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aceitar visita', onPress: () => onResponder('aceitar_visita') },
      ]))
  const recusar = () => Alert.alert(orcamento ? 'Recusar este orçamento?' : 'Recusar esta visita?', 'O profissional será avisado e não poderá enviar outra proposta para esta demanda.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Recusar', style: 'destructive', onPress: () => onResponder('recusar') },
  ])
  return (
    <View style={estilos.acoes}>
      <TouchableOpacity style={[estilos.btnAceitar, enviando && { opacity: 0.6 }]} onPress={aceitar} disabled={enviando} activeOpacity={0.85} accessibilityRole="button">
        <Text style={estilos.btnAceitarTexto}>{orcamento ? 'Aceitar orçamento' : 'Aceitar visita'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[estilos.btnRecusar, enviando && { opacity: 0.6 }]} onPress={recusar} disabled={enviando} activeOpacity={0.85} accessibilityRole="button">
        <Text style={estilos.btnRecusarTexto}>Recusar</Text>
      </TouchableOpacity>
    </View>
  )
}

// ---------------------------------------------------------------------------------------
// Profissional: a própria proposta de visita (aguardando, aceita → enviar orçamento, enviado)
// ---------------------------------------------------------------------------------------

const DIAS_INICIO = 90
const isoLocal = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

function FormularioOrcamento({ enviando, onEnviar, onCancelar }) {
  const [valor, setValor] = useState('')
  const [prazo, setPrazo] = useState('')
  const [inicio, setInicio] = useState(null)
  const [observacao, setObservacao] = useState('')
  const dias = useMemo(() => {
    const hoje = inicioDoDia(new Date())
    return Array.from({ length: DIAS_INICIO }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i)
      return { iso: isoLocal(d), rotulo: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : `${DIAS_CURTOS[d.getDay()]} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}` }
    })
  }, [])
  const enviar = () => {
    if (enviando) return
    Keyboard.dismiss()
    // Só os obrigatórios vazios param aqui; valor mínimo, prazo e datas quem valida é a API.
    if (numeroDe(valor) == null) { Alert.alert('Atenção', 'Informe o valor do orçamento.'); return }
    if (!prazo) { Alert.alert('Atenção', 'Informe o prazo em dias.'); return }
    if (!inicio) { Alert.alert('Atenção', 'Escolha a data de início.'); return }
    onEnviar({ valor: numeroDe(valor), prazo_dias: parseInt(prazo, 10), data_inicio: inicio, observacao: observacao.trim() || null })
  }
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={estilos.rotulo}>VALOR DO SERVIÇO – R$</Text>
      <TextInput style={estilos.campo} placeholder="Ex: 3.200,00" placeholderTextColor={cores.placeholderCampo} keyboardType="numeric" value={valor} onChangeText={(t) => setValor(mascararValor(t))} editable={!enviando} />
      <Text style={[estilos.rotulo, { marginTop: 12 }]}>PRAZO (EM DIAS)</Text>
      <TextInput style={estilos.campo} placeholder="Ex: 10" placeholderTextColor={cores.placeholderCampo} keyboardType="number-pad" maxLength={3} value={prazo} onChangeText={(t) => setPrazo(t.replace(/\D/g, ''))} editable={!enviando} />
      <Text style={[estilos.rotulo, { marginTop: 12 }]}>COMEÇA EM</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
        {dias.map(d => {
          const ativo = d.iso === inicio
          return (
            <TouchableOpacity key={d.iso} style={[estilos.chip, ativo && estilos.chipAtivo]} onPress={() => setInicio(d.iso)} disabled={enviando} activeOpacity={0.7}>
              <Text style={[estilos.chipTexto, ativo && estilos.chipTextoAtivo]}>{d.rotulo}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
      <Text style={[estilos.rotulo, { marginTop: 12 }]}>OBSERVAÇÃO (OPCIONAL)</Text>
      <TextInput style={[estilos.campo, { minHeight: 76, textAlignVertical: 'top' }]} placeholder="Ex: Inclui troca do piso e revestimento até o teto." placeholderTextColor={cores.placeholderCampo} value={observacao} onChangeText={setObservacao} multiline maxLength={500} editable={!enviando} />
      <TouchableOpacity style={[estilos.btnAceitar, { flex: 0, marginTop: 12 }, enviando && { opacity: 0.6 }]} onPress={enviar} disabled={enviando} activeOpacity={0.85} accessibilityRole="button">
        <Text style={estilos.btnAceitarTexto}>{enviando ? 'Enviando…' : 'Enviar orçamento'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancelar} disabled={enviando} style={{ alignItems: 'center', padding: 10 }}>
        <Text style={{ color: cores.textoFraco, fontSize: 13 }}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  )
}

// proposta: minha_candidatura / meu_interesse. enviar(corpo): o POST …/orcamento da tela (lança
// o erro da API); onEnviado(): recarregar o detalhe. `abrirForm` vem do push de lembrete.
export function PainelVisitaProfissional({ proposta, enviar, onEnviado, abrirForm }) {
  const [form, setForm] = useState(!!abrirForm)
  const [enviando, setEnviando] = useState(false)
  if (!visitaEmAberto(proposta)) return null
  const quando = quandoVisita(proposta.visita_quando)
  if (proposta.status === 'pendente') {
    return (
      <View style={{ marginTop: 10 }}>
        <View style={[estilos.pilula, estilos.pilulaAzul]}>
          <Text style={[estilos.pilulaTexto, { color: '#7DB4FF' }]}>📋 Visita para orçamento · {rotuloVisita(proposta)}</Text>
        </View>
        {quando ? <Text style={estilos.linha}>📅 Você propôs ir {quando}</Text> : null}
      </View>
    )
  }
  if (proposta.status === STATUS_ORCAMENTO_ENVIADO) {
    const inicio = dataCurta(proposta.orcamento_data_inicio)
    const dias = Number(proposta.orcamento_prazo_dias)
    return (
      <View>
        <Text style={{ color: cores.sucesso, fontWeight: '600', marginBottom: 6 }}>💰 Orçamento enviado · {reais(proposta.orcamento_valor ?? proposta.valor_proposto)}</Text>
        <Text style={estilos.linha}>
          {[dias > 0 ? `⏱️ Prazo: ${dias} ${dias === 1 ? 'dia' : 'dias'}` : null, inicio ? `📅 Começa em ${inicio}` : null].filter(Boolean).join(' · ')}
        </Text>
        {proposta.orcamento_observacao ? <Text style={estilos.observacao}>"{proposta.orcamento_observacao}"</Text> : null}
        <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20, marginTop: 4 }}>Aguarde: o cliente vai aceitar ou recusar o seu orçamento.</Text>
      </View>
    )
  }
  const mandar = async (corpo) => {
    setEnviando(true)
    try {
      await enviar(corpo)
      setForm(false)
      Alert.alert('✅ Orçamento enviado!', 'O cliente foi avisado e vai aceitar ou recusar pelo app.')
      onEnviado?.()
    } catch (err) {
      console.log('[Orcamento] falha ao enviar orçamento | status:', err?.status, '| codigo:', err?.codigo, '| msg:', err?.mensagem)
      // Retry depois de uma resposta perdida: o orçamento já está lá.
      if (err?.codigo === 'ORCAMENTO_JA_ENVIADO') { setForm(false); onEnviado?.(); return }
      Alert.alert('Erro', err?.mensagem || 'Não foi possível enviar o orçamento. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }
  return (
    <View>
      <Text style={{ color: cores.sucesso, fontWeight: '600', marginBottom: 6 }}>📋 Visita aceita!</Text>
      {quando ? <Text style={estilos.linha}>📅 Visita {quando}</Text> : null}
      <Text style={{ fontSize: 13, color: cores.textoMedio, lineHeight: 20, marginBottom: 4 }}>📍 O endereço completo do pedido já aparece nesta tela. Depois da visita, envie o valor real por aqui.</Text>
      {form ? (
        <FormularioOrcamento enviando={enviando} onEnviar={mandar} onCancelar={() => setForm(false)} />
      ) : (
        <TouchableOpacity style={[estilos.btnAceitar, { flex: 0, marginTop: 8 }]} onPress={() => setForm(true)} activeOpacity={0.85} accessibilityRole="button">
          <Text style={estilos.btnAceitarTexto}>Enviar orçamento</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------------------
// D · Dica azul do cadastro, quando o cliente marca "Não sei o valor"
// ---------------------------------------------------------------------------------------

export const DicaOrcamentoCliente = () => (
  <View style={estilos.dicaAzul}>
    <Text style={estilos.dicaAzulTexto}>📋 Sem problema! Os profissionais poderão propor uma visita para orçamento, muitas vezes grátis. Depois da visita, você recebe o valor real pelo app e decide se aceita.</Text>
  </View>
)

const estilos = StyleSheet.create({
  rotulo: { fontSize: 11, fontWeight: '700', color: cores.textoFraco, letterSpacing: 0.5, marginBottom: 8 },
  opcao: { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, marginBottom: 8 },
  opcaoMarcada: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  opcaoTitulo: { fontSize: 15, fontWeight: '700', color: cores.textoForte, marginBottom: 3 },
  opcaoSub: { fontSize: 12, color: cores.textoMedio },
  segmento: { flexDirection: 'row', gap: 8 },
  segmentoItem: { flex: 1, paddingVertical: 11, borderRadius: raios.medio, backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, alignItems: 'center' },
  segmentoAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  segmentoTexto: { fontSize: 14, color: cores.textoMedio, fontWeight: '600' },
  segmentoTextoAtivo: { color: '#0A0A0A', fontWeight: '700' },
  campo: { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: cores.textoForte },
  campoToque: { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: 14, paddingVertical: 14 },
  campoToqueTexto: { fontSize: 15, color: cores.textoForte, fontWeight: '600' },
  campoToqueVazio: { fontSize: 15, color: cores.placeholderCampo },
  dicaAmarela: { backgroundColor: '#2a2200', borderWidth: 1, borderColor: '#6b5a00', borderRadius: raios.medio, padding: 12, marginBottom: 10 },
  dicaAmarelaTexto: { fontSize: 12, color: '#FFD666', lineHeight: 18 },
  dicaAzul: { backgroundColor: cores.infoSuave, borderWidth: 1, borderColor: cores.infoBorda, borderRadius: raios.medio, padding: 12, marginTop: 10 },
  dicaAzulTexto: { fontSize: 13, color: cores.textoForte, lineHeight: 19 },
  pilula: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  pilulaAzul: { backgroundColor: cores.infoSuave, borderColor: cores.infoBorda },
  pilulaVerde: { backgroundColor: cores.sucessoSuave, borderColor: cores.sucessoBorda },
  pilulaTexto: { fontSize: 12, fontWeight: '700' },
  linha: { fontSize: 14, color: cores.textoForte, lineHeight: 20, marginBottom: 4 },
  observacao: { fontSize: 13, color: cores.textoMedio, lineHeight: 19, marginBottom: 4 },
  acoes: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnAceitar: { flex: 1, backgroundColor: cores.primaria, borderRadius: raios.medio, paddingVertical: 12, alignItems: 'center' },
  btnAceitarTexto: { color: '#0A0A0A', fontSize: 14, fontWeight: '700' },
  btnRecusar: { flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, paddingVertical: 12, alignItems: 'center' },
  btnRecusarTexto: { color: cores.textoForte, fontSize: 14, fontWeight: '600' },
  notaVerde: { marginTop: 10, padding: 10, backgroundColor: cores.sucessoSuave, borderWidth: 1, borderColor: cores.sucessoBorda, borderRadius: raios.medio },
  notaVerdeTexto: { fontSize: 12, color: cores.textoForte, lineHeight: 18 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: raios.medio, backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda },
  chipAtivo: { backgroundColor: cores.primariaSuave, borderColor: cores.primaria },
  chipTexto: { fontSize: 13, color: cores.textoMedio, fontWeight: '600' },
  chipTextoAtivo: { color: cores.textoForte, fontWeight: '700' },
})
