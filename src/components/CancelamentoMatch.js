import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, TextInput, Modal, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import useArrastarParaFechar from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'
import { MOTIVOS_PROFISSIONAL, rotuloMotivo } from '../utils/cancelamento'

// Cancelamento do match pelas duas partes, antes do "Estou a caminho". Um componente só
// para DetalheReparo e DetalheObra não divergirem (mesma razão de components/Agendamento):
//   BotaoCancelarServico   — "✕ Cancelar serviço" vazado em vermelho, abaixo do bloco pós-match;
//   SheetCancelamento      — a folha de baixo com borda vermelha no topo: 'livre' (sem
//                            punição) ou 'tardio' (menos de 12 h: falta, ou pedir de comum
//                            acordo), com o motivo obrigatório;
//   CardPedidoCancelamento — o pedido de comum acordo pendente: card laranja para quem
//                            responde, linha de espera para quem pediu.

const LIMITE_MOTIVO = 200

export const BotaoCancelarServico = ({ onPress, desabilitado }) => (
  <TouchableOpacity
    style={[estilos.btnCancelar, desabilitado && { opacity: 0.5 }]}
    onPress={onPress}
    disabled={desabilitado}
    activeOpacity={0.8}
    accessibilityRole="button"
    accessibilityLabel="Cancelar serviço"
  >
    <Text style={estilos.btnCancelarTexto}>✕ Cancelar serviço</Text>
  </TouchableOpacity>
)

// Radios do motivo + campo do "Outro". O texto vive aqui; a tela só recebe o escolhido.
const Motivos = ({ opcoes, valor, texto, onValor, onTexto, desabilitado, semTitulo }) => (
  <View style={estilos.motivos}>
    {semTitulo ? null : <Text style={estilos.motivosTitulo}>Motivo (obrigatório)</Text>}
    {opcoes.map((m) => {
      const ativo = valor === m.valor
      return (
        <TouchableOpacity key={m.valor} style={estilos.radioLinha} onPress={() => onValor(m.valor)} disabled={desabilitado} activeOpacity={0.7} accessibilityRole="radio" accessibilityState={{ checked: ativo }}>
          <View style={[estilos.radio, ativo && estilos.radioAtivo]}>{ativo ? <View style={estilos.radioMiolo} /> : null}</View>
          <Text style={[estilos.radioTexto, ativo && { color: cores.textoForte, fontWeight: '600' }]}>{m.rotulo}</Text>
        </TouchableOpacity>
      )
    })}
    {valor === 'outro' && (
      <TextInput
        style={estilos.campoOutro}
        value={texto}
        onChangeText={(v) => onTexto(v.slice(0, LIMITE_MOTIVO))}
        placeholder="Conte em poucas palavras"
        placeholderTextColor={cores.placeholderCampo}
        multiline
        maxLength={LIMITE_MOTIVO}
        editable={!desabilitado}
        autoComplete="off"
        importantForAutofill="no"
        textContentType="none"
      />
    )}
  </View>
)

// Arte "Trocar ou cancelar v2" (dono): o botão "✕ Trocar profissional ou cancelar" abre ESTA
// folha, e não mais a de cancelamento. Passo 1 "O que você quer fazer?": verde "Trocar de
// profissional" → confirmação "Trocar <nome>?" → onTrocar (o desfazer-match da tela, NUNCA o
// cancelar-match); vermelho "Cancelar o pedido inteiro" → onCancelarInteiro (a tela fecha
// esta folha e abre a SheetCancelamento, que é o único caminho do dono até o cancelar-match).
// nome: primeiro nome do escolhido. enviando: o desfazer-match em voo (trava a folha).
export const SheetTrocarOuCancelar = ({ visivel, nome, enviando, onFechar, onTrocar, onCancelarInteiro }) => {
  const insets = useSafeAreaInsets()
  const [etapa, setEtapa] = useState('escolha')
  useEffect(() => { if (visivel) setEtapa('escolha') }, [visivel])
  const fechar = () => { if (!enviando) onFechar() }
  const { panHandlers, estiloArraste, medirFolha } = useArrastarParaFechar(enviando ? null : fechar, !!visivel)
  const quem = nome || 'o profissional'
  const Quem = quem.charAt(0).toUpperCase() + quem.slice(1)

  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={() => { if (etapa === 'trocar' && !enviando) setEtapa('escolha'); else fechar() }}>
      <View style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} />
        <Animated.View style={[estilos.sheet, estilos.sheetNeutra, { paddingBottom: insets.bottom + 16 }, estiloArraste]} onLayout={medirFolha}>
          <View style={estilos.zonaAlca} {...panHandlers}>
            <View style={estilos.alca} />
            <LinhaCabecalhoFolha onFechar={fechar} desabilitado={!!enviando}>
              <Text style={estilos.tituloCompacto}>{etapa === 'trocar' ? `Trocar ${quem}?` : 'O que você quer fazer?'}</Text>
            </LinhaCabecalhoFolha>
          </View>
          {etapa === 'escolha' ? (
            <>
              <Text style={estilos.subtituloCompacto}>Profissional escolhido: {Quem}</Text>
              <TouchableOpacity style={[estilos.opcao, estilos.opcaoVerde]} onPress={() => setEtapa('trocar')} activeOpacity={0.85} accessibilityRole="button">
                <Text style={estilos.opcaoTitulo}>🔄 Trocar de profissional</Text>
                <Text style={estilos.opcaoSub}>O pedido continua aberto; você escolhe outro.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[estilos.opcao, estilos.opcaoVermelha]} onPress={onCancelarInteiro} activeOpacity={0.85} accessibilityRole="button">
                <Text style={estilos.opcaoTitulo}>✕ Cancelar o pedido inteiro</Text>
                <Text style={estilos.opcaoSub}>O pedido sai do app.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={estilos.linkVoltar} onPress={fechar} activeOpacity={0.7} accessibilityRole="button">
                <Text style={estilos.linkVoltarTexto}>Voltar</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={estilos.subtituloCompacto}>Seu pedido continua aberto. Você escolhe outro entre os interessados.</Text>
              <TouchableOpacity style={[estilos.btnCompacto, estilos.btnCompactoLaranja, enviando && { opacity: 0.6 }]} onPress={onTrocar} disabled={!!enviando} activeOpacity={0.85} accessibilityRole="button">
                <Text style={[estilos.btnCompactoTexto, { color: '#0A0A0A' }]}>{enviando ? 'Enviando…' : '🔄 Sim, escolher outro profissional'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={estilos.linkVoltar} onPress={() => setEtapa('escolha')} disabled={!!enviando} activeOpacity={0.7} accessibilityRole="button">
                <Text style={estilos.linkVoltarTexto}>Voltar</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  )
}

// Motivos do "Cancelar o pedido inteiro?" (dono), na ordem da arte. Os slugs são os da API;
// MOTIVOS_DONO (rótulos mostrados ao profissional) fica como está.
const MOTIVOS_DONO_PEDIDO = [
  { valor: 'nao_preciso', rotulo: 'Não preciso mais do serviço' },
  { valor: 'imprevisto',  rotulo: 'Imprevisto' },
  { valor: 'outro',       rotulo: 'Outro motivo' },
]
const LIMITE_TITULO_CURTO = 30
const tituloCurto = (t) => {
  const s = String(t || '').trim()
  return s.length > LIMITE_TITULO_CURTO ? `${s.slice(0, LIMITE_TITULO_CURTO - 1).trimEnd()}…` : s
}

// visivel/carregando: a folha abre no toque e mostra o spinner enquanto a simulação não
// volta. simulacao: { tipo: 'livre' | 'tardio' }. souDono decide os textos e os motivos.
// temHorario: há chegada_prevista_em (muda a frase do "sem punição"). nomeOutro: o primeiro
// nome do outro lado, para a linha do comum acordo.
// onCancelar(motivo, texto) / onPedirAcordo(motivo, texto): os dois POSTs da tela.
// interessados: quantos OUTROS interessados o pedido tem (fora o escolhido) — só o dono usa,
// no aviso vermelho. tituloPedido: o título do pedido (dono, aviso vermelho).
// Dono (arte "Trocar ou cancelar v2"): só se chega aqui pelo "Cancelar o pedido inteiro" da
// SheetTrocarOuCancelar; a tela manda o cancelar-match com manter_aberta: false, então
// qualquer motivo ENCERRA o pedido — é o que o aviso vermelho diz.
export const SheetCancelamento = ({ visivel, carregando, simulacao, souDono, nomeOutro, temHorario, interessados, tituloPedido, enviando, onFechar, onCancelar, onPedirAcordo }) => {
  const insets = useSafeAreaInsets()
  const [motivo, setMotivo] = useState(null)
  const [texto, setTexto] = useState('')
  // Cada abertura começa limpa: o motivo de um serviço não vale para outro.
  useEffect(() => { if (visivel) { setMotivo(null); setTexto('') } }, [visivel])

  const opcoes = souDono ? MOTIVOS_DONO_PEDIDO : MOTIVOS_PROFISSIONAL
  const motivoOk = !!motivo && (motivo !== 'outro' || !!texto.trim())
  const tardio = simulacao?.tipo === 'tardio'
  const n = Number.isFinite(Number(interessados)) && Number(interessados) > 0 ? Number(interessados) : 0
  const confirmarCancelar = () => {
    if (!motivoOk || enviando) return
    onCancelar(motivo, texto)
  }
  // Antecedência que a API aplicou (12 h; 1 h nas demandas de faixa curta).
  const limite = Number.isFinite(Number(simulacao?.limite_horas)) && Number(simulacao.limite_horas) > 0 ? Number(simulacao.limite_horas) : 12
  const fechar = () => { if (!enviando) onFechar() }
  // Arrastar a alça/cabeçalho para baixo fecha como o toque fora e o voltar do Android (travado
  // ao enviar). O título saiu do ScrollView para a linha do cabeçalho, ao lado da pílula
  // "✕ Fechar"; enquanto a simulação carrega a linha fica só com a pílula.
  const { panHandlers, estiloArraste, medirFolha } = useArrastarParaFechar(enviando ? null : fechar, !!visivel)
  const pronto = !carregando && !!simulacao
  const outro = nomeOutro || (souDono ? 'o profissional' : 'o cliente')

  const textoLado = souDono
    ? 'O profissional será avisado e o pedido volta para os outros profissionais.'
    : 'O cliente será avisado e o pedido volta a receber propostas de outros profissionais.'
  const textoPrazo = temHorario ? `Faltam mais de ${limite}h para o horário combinado.` : 'Ainda não há horário combinado.'

  // Aviso vermelho do dono: "<nome> e os outros interessados" só quando há outros.
  const quemAvisa = outro.charAt(0).toUpperCase() + outro.slice(1)
  const tCurto = tituloCurto(tituloPedido)
  const avisoDono = `⚠️ ${tCurto ? `O pedido "${tCurto}"` : 'O pedido'} será encerrado e sairá do app. ${n > 0 ? `${quemAvisa} e os outros interessados serão avisados.` : `${quemAvisa} será avisado.`}`

  const conteudoDono = (
    <>
      {tardio ? (
        <View style={estilos.avisoCompacto}>
          <Text style={estilos.avisoCompactoTexto}>⚠️ Faltam menos de {limite}h. Cancelar agora conta como falta para você (3 faltas em 90 dias suspendem a conta).</Text>
        </View>
      ) : null}
      <Text style={estilos.porQue}>Por quê?</Text>
      <Motivos opcoes={opcoes} valor={motivo} texto={texto} onValor={setMotivo} onTexto={setTexto} desabilitado={enviando} semTitulo />
      <View style={estilos.avisoCompacto}>
        <Text style={estilos.avisoCompactoTexto}>{avisoDono}</Text>
      </View>
      <View style={estilos.botoesRow}>
        <TouchableOpacity style={[estilos.btnCompacto, estilos.btnCompactoLaranja, { flex: 1 }]} onPress={fechar} disabled={enviando} activeOpacity={0.85} accessibilityRole="button">
          <Text style={[estilos.btnCompactoTexto, { color: '#0A0A0A' }]}>Voltar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[estilos.btnCompacto, estilos.btnCompactoContornoVermelho, { flex: 1 }, (!motivoOk || enviando) && { opacity: 0.5 }]} onPress={confirmarCancelar} disabled={!motivoOk || enviando} activeOpacity={0.85} accessibilityRole="button">
          <Text style={[estilos.btnCompactoTexto, { color: cores.perigo }]}>{enviando ? 'Enviando…' : 'Sim, cancelar o pedido'}</Text>
        </TouchableOpacity>
      </View>
      {tardio ? (
        <TouchableOpacity style={estilos.linkVoltar} onPress={() => onPedirAcordo(motivo, texto)} disabled={!motivoOk || enviando} activeOpacity={0.7} accessibilityRole="button">
          <Text style={[estilos.linkVoltarTexto, (!motivoOk || enviando) && { opacity: 0.5 }]}>🤝 Ou pedir para {outro} cancelar de comum acordo (sem falta)</Text>
        </TouchableOpacity>
      ) : null}
    </>
  )

  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={fechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} />
        <Animated.View style={[estilos.sheet, { paddingBottom: insets.bottom + 20 }, estiloArraste]} onLayout={medirFolha}>
          <View style={estilos.zonaAlca} {...panHandlers}>
            <View style={estilos.alca} />
            <LinhaCabecalhoFolha onFechar={fechar} desabilitado={!!enviando}>
              {pronto ? (souDono
                ? <Text style={estilos.tituloCompacto}>Cancelar o pedido inteiro?</Text>
                : <Text style={estilos.titulo}>{tardio ? 'Cancelar em cima da hora?' : 'Cancelar este serviço?'}</Text>) : null}
            </LinhaCabecalhoFolha>
          </View>
          {!pronto ? (
            <View style={estilos.carregando}>
              <ActivityIndicator color={cores.perigo} />
              <Text style={estilos.carregandoTexto}>Conferindo o prazo…</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {souDono ? conteudoDono : (<>
              {tardio ? (
                <>
                  <View style={estilos.caixaVermelha}>
                    <Text style={estilos.caixaVermelhaTexto}>⚠️ Faltam menos de {limite}h. Cancelar agora conta como falta para você (3 faltas em 90 dias suspendem a conta).</Text>
                  </View>
                  <Text style={estilos.linhaAcordo}>
                    🤝 Ou peça para {outro} cancelar de comum acordo: se aceitar, ninguém leva falta. Sem resposta em 2h, o pedido expira e o combinado continua.
                  </Text>
                </>
              ) : (
                <View style={estilos.caixaVerde}>
                  <Text style={estilos.caixaVerdeTexto}>✅ Sem punição. {textoPrazo} {textoLado}</Text>
                </View>
              )}

              <Motivos opcoes={opcoes} valor={motivo} texto={texto} onValor={setMotivo} onTexto={setTexto} desabilitado={enviando} />

              {!tardio && (
                <Text style={estilos.regra}>Regra: cancelar com menos de 12h do horário combinado conta como falta. 3 faltas em 90 dias suspendem a conta.</Text>
              )}

              {tardio ? (
                <>
                  <TouchableOpacity style={[estilos.btnLaranja, (!motivoOk || enviando) && { opacity: 0.5 }]} onPress={() => onPedirAcordo(motivo, texto)} disabled={!motivoOk || enviando} activeOpacity={0.85}>
                    <Text style={estilos.btnLaranjaTexto}>{enviando ? 'Enviando…' : '🤝 Pedir de comum acordo'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[estilos.btnVermelho, (!motivoOk || enviando) && { opacity: 0.5 }]} onPress={confirmarCancelar} disabled={!motivoOk || enviando} activeOpacity={0.85}>
                    <Text style={estilos.btnVermelhoTexto}>{enviando ? 'Enviando…' : 'Cancelar mesmo assim'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={estilos.btnVoltarTexto} onPress={fechar} disabled={enviando}>
                    <Text style={estilos.btnVoltarTextoTexto}>Voltar</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={estilos.botoesRow}>
                  <TouchableOpacity style={estilos.btnVoltar} onPress={fechar} disabled={enviando} activeOpacity={0.85}>
                    <Text style={estilos.btnVoltarRotulo}>Voltar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[estilos.btnVermelho, { flex: 1, marginBottom: 0 }, (!motivoOk || enviando) && { opacity: 0.5 }]} onPress={confirmarCancelar} disabled={!motivoOk || enviando} activeOpacity={0.85}>
                    <Text style={estilos.btnVermelhoTexto}>{enviando ? 'Enviando…' : 'Cancelar serviço'}</Text>
                  </TouchableOpacity>
                </View>
              )}
              </>)}
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// pedido: o pedido_cancelamento pendente ({ por, meu, motivo, detalhe, expira_em }). paraMim: é
// o OUTRO lado quem pediu (eu respondo). nomeOutro: o primeiro nome de quem está do outro
// lado. onResponder('aceitar' | 'recusar').
export const CardPedidoCancelamento = ({ pedido, paraMim, nomeOutro, respondendo, onResponder }) => {
  if (!pedido) return null
  const nome = nomeOutro || 'a outra parte'
  if (!paraMim) {
    return (
      <View style={estilos.aguardando}>
        <Text style={estilos.aguardandoTexto}>⏳ Aguardando {nome} responder ao pedido de cancelamento</Text>
        <Text style={estilos.rodape}>Sem resposta em 2h, o pedido expira e o agendamento continua.</Text>
      </View>
    )
  }
  const motivo = rotuloMotivo(pedido)
  return (
    <View style={estilos.cardPedido}>
      <Text style={estilos.cardPedidoRotulo}>🤝 PEDIDO DE CANCELAMENTO</Text>
      <Text style={estilos.cardPedidoTitulo}>{nome} pediu para cancelar de comum acordo</Text>
      {motivo ? <Text style={estilos.cardPedidoMotivo}>Motivo: {motivo}</Text> : null}
      <Text style={estilos.cardPedidoTexto}>Se você aceitar, o serviço é cancelado e ninguém leva falta. Se recusar, o combinado continua valendo.</Text>
      <View style={estilos.botoesRow}>
        <TouchableOpacity style={[estilos.btnRecusar, respondendo && { opacity: 0.6 }]} onPress={() => onResponder('recusar')} disabled={respondendo} activeOpacity={0.85}>
          <Text style={estilos.btnRecusarTexto}>Recusar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[estilos.btnAceitar, respondendo && { opacity: 0.6 }]} onPress={() => onResponder('aceitar')} disabled={respondendo} activeOpacity={0.85}>
          <Text style={estilos.btnAceitarTexto}>{respondendo ? 'Enviando…' : 'Aceitar cancelamento'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={estilos.rodape}>Sem resposta em 2h, o pedido expira e o agendamento continua.</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  // Vazado em vermelho: mesmo molde do btnNaoVeio do Agendamento, sem o fundo tintado.
  btnCancelar:      { borderWidth: 1.5, borderColor: cores.perigo, borderRadius: raios.medio, padding: 13, alignItems: 'center', marginBottom: 16 },
  btnCancelarTexto: { fontSize: 14, fontWeight: '700', color: cores.perigo },

  // Folha: mesmo molde da VerificacaoIdentidadeSheet, com a borda vermelha no topo.
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 3, borderTopColor: cores.perigo, paddingHorizontal: espacos.tela, maxHeight: '92%', ...larguraMaxima },
  // Zona do arraste: os 12 de paddingTop do sheet, a alça e a linha do cabeçalho (título + "✕ Fechar").
  zonaAlca:        { paddingTop: 12 },
  alca:            { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 16 },
  carregando:      { alignItems: 'center', paddingVertical: 28, gap: 10 },
  carregandoTexto: { fontSize: 13, color: cores.textoMedio },
  titulo:          { fontSize: 20, fontWeight: '800', color: cores.textoForte, letterSpacing: -0.3, marginBottom: 14 },
  caixaVerde:      { backgroundColor: cores.sucessoSuave, borderWidth: 1, borderColor: cores.sucesso + '66', borderRadius: raios.medio, padding: 14, marginBottom: 14 },
  caixaVerdeTexto: { fontSize: 13, color: cores.textoForte, lineHeight: 20 },
  caixaVermelha:   { backgroundColor: cores.perigoSuave, borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.medio, padding: 14, marginBottom: 12 },
  caixaVermelhaTexto: { fontSize: 13, fontWeight: '600', color: cores.textoForte, lineHeight: 20 },
  linhaAcordo:     { fontSize: 13, color: cores.textoMedio, lineHeight: 19, marginBottom: 14 },

  motivos:         { marginBottom: 12 },
  motivosTitulo:   { fontSize: 11, fontWeight: '700', color: cores.textoMedio, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  radioLinha:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  radio:           { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: cores.bordaCampo, alignItems: 'center', justifyContent: 'center' },
  radioAtivo:      { borderColor: cores.perigo },
  radioMiolo:      { width: 10, height: 10, borderRadius: 5, backgroundColor: cores.perigo },
  radioTexto:      { fontSize: 14, color: cores.textoMedio },
  campoOutro:      { backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: 10, padding: 12, fontSize: 14, color: cores.textoForte, minHeight: 64, textAlignVertical: 'top', marginTop: 4 },
  regra:           { fontSize: 11, color: cores.textoFraco, lineHeight: 16, marginBottom: 14 },

  botoesRow:       { flexDirection: 'row', gap: 10, marginBottom: 10 },
  btnVoltar:       { flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, alignItems: 'center' },
  btnVoltarRotulo: { fontSize: 14, fontWeight: '600', color: cores.textoFraco },
  btnVermelho:     { backgroundColor: cores.perigo, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 10 },
  btnVermelhoTexto:{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  btnLaranja:      { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 10 },
  btnLaranjaTexto: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  btnVoltarTexto:  { paddingVertical: 10, alignItems: 'center' },
  btnVoltarTextoTexto: { fontSize: 13, color: cores.textoFraco },

  // Card laranja: o mesmo molde do propostaCard do Agendamento (#3a2a00 / borda primária).
  cardPedido:        { backgroundColor: '#3a2a00', borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  cardPedidoRotulo:  { fontSize: 11, fontWeight: '700', color: cores.primaria, letterSpacing: 0.5, marginBottom: 6 },
  cardPedidoTitulo:  { fontSize: 15, fontWeight: '700', color: cores.textoForte, lineHeight: 21, marginBottom: 6 },
  cardPedidoMotivo:  { fontSize: 13, color: cores.textoForte, lineHeight: 19, marginBottom: 6 },
  cardPedidoTexto:   { fontSize: 12, color: cores.textoMedio, lineHeight: 18, marginBottom: 12 },
  btnRecusar:        { flex: 1, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  btnRecusarTexto:   { fontSize: 13, fontWeight: '700', color: cores.textoForte },
  btnAceitar:        { flex: 1.4, backgroundColor: cores.sucesso, borderRadius: raios.medio, padding: 12, alignItems: 'center' },
  btnAceitarTexto:   { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  rodape:            { fontSize: 11, color: cores.textoFraco, lineHeight: 16 },

  aguardando:        { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 14, marginBottom: 16 },

  // Arte "Trocar ou cancelar v2" (dono): folha do passo 1, cartões de opção e botões compactos.
  sheetNeutra:       { borderTopColor: cores.borda },
  tituloCompacto:    { fontSize: 18, fontWeight: '800', color: cores.textoForte, letterSpacing: -0.3, marginBottom: 10 },
  subtituloCompacto: { fontSize: 13, color: cores.textoMedio, lineHeight: 19, marginBottom: 12 },
  opcao:             { borderWidth: 1, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14, marginBottom: 10 },
  opcaoVerde:        { backgroundColor: cores.sucessoSuave, borderColor: cores.sucesso },
  opcaoVermelha:     { backgroundColor: cores.perigoSuave, borderColor: cores.perigo },
  opcaoTitulo:       { fontSize: 15, fontWeight: '700', color: cores.textoForte },
  opcaoSub:          { fontSize: 12, color: cores.textoMedio, lineHeight: 17, marginTop: 2 },
  linkVoltar:        { paddingVertical: 10, alignItems: 'center' },
  linkVoltarTexto:   { fontSize: 13, color: cores.textoFraco, textAlign: 'center' },
  porQue:            { fontSize: 14, fontWeight: '700', color: cores.textoForte, marginBottom: 2 },
  avisoCompacto:     { backgroundColor: cores.perigoSuave, borderWidth: 1, borderColor: cores.perigo, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 12 },
  avisoCompactoTexto:{ fontSize: 12.5, fontWeight: '600', color: cores.textoForte, lineHeight: 18 },
  btnCompacto:       { borderRadius: 12, padding: 10, alignItems: 'center', justifyContent: 'center' },
  btnCompactoLaranja:{ backgroundColor: cores.primaria },
  btnCompactoContornoVermelho: { borderWidth: 1.5, borderColor: cores.perigo, backgroundColor: 'transparent' },
  btnCompactoTexto:  { fontSize: 14.5, fontWeight: '700' },
  aguardandoTexto:   { fontSize: 13, color: cores.textoMedio, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
})
