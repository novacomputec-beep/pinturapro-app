import React, { useState, useRef, useEffect } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { cores, espacos, raios, larguraMaxima } from '../utils/tema'
import { mensagemErroRede } from '../utils/rede'
import { excluirPedido, ehMatchAtivo } from '../utils/excluirPedido'
import FolhaMotivoCancelamento, { textoConfirmacaoCancelar } from './FolhaMotivoCancelamento'
import { FolhaAntesCancelar, depoisDeFecharFolha, propostaDoVisitante, modoAntesCancelar, valorDoOrcamento } from './Orcamento'

// Arte "Cancelar pedido": no detalhe do DONO (DetalheReparo / DetalheObra), SÓ enquanto não há
// profissional escolhido, um link discreto no fim do conteúdo, "🗑️ Cancelar pedido" (cinza,
// sublinhado, sem fundo e sem borda, com um divisor fino em cima). Com match ele some: a saída
// é o "Trocar profissional ou cancelar" do pós-match.
//
// O toque abre a confirmação. "Voltar" (laranja cheio) fecha; "Sim, cancelar pedido"
// (contorno vermelho) chama a MESMA exclusão da lixeira de MeusPedidosScreen
// (utils/excluirPedido), trata o 409 MATCH_ATIVO do mesmo jeito (Alert com a mensagem do
// servidor) e, dando certo, chama onCancelado (o detalhe volta para Meus pedidos).
//
// `interessados`: quantos profissionais REALMENTE se interessaram (a lista do dono sem
// cancelados/expirados/bloqueados e sem recusados); 0 tira a frase deles do texto.
// O texto mora em FolhaMotivoCancelamento (textoConfirmacaoCancelar), que mostra o mesmo aviso.
export { textoConfirmacaoCancelar }

//
// `publicado` (utils/excluirPedido: ehPublicado): pedido já visível aos profissionais. Aí o
// toque abre, no lugar da confirmação, a folha "Por que vai cancelar?"
// (FolhaMotivoCancelamento), e o motivo escolhido vai junto na exclusão.
//
// `visitante` (visitante_ativo do detalhe, pós-visita: { proposta_id, nome }): antes de tudo, a
// folha "Antes de cancelar". "Sim, contratei" fecha e chama onContratei(visitante) (a tela abre
// a FolhaContratei); "Não, vou cancelar" segue para a confirmação/motivo de sempre e o DELETE
// leva contratou_visitante: false.
// Qual folha sai depende dos flags da PROPOSTA do visitante (Orcamento: modoAntesCancelar), lida
// em `propostas` (a lista que a tela já tem) ou, sem ela lá, no detalhe buscado na hora:
// pode_contratei → a de sempre; orçamento enviado → "mandou um orçamento… Vai contratar?" com
// "Sim, aceitar o orçamento" (onAceitarOrcamento(propostaId): o 'aceitar' da tela); outro caso
// (ex.: antes do horário da visita) ou busca falhou → sem folha, direto ao cancelamento de sempre.
export default function CancelarPedido({ tipo, id, interessados = 0, publicado = false, onCancelado, visitante = null, propostas, onContratei, onAceitarOrcamento }) {
  const [aberto, setAberto] = useState(false)
  // { modo, valor } da folha "Antes de cancelar" aberta, ou null.
  const [antes, setAntes] = useState(null)
  const [negouVisitante, setNegouVisitante] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const montadoRef = useRef(true)
  useEffect(() => () => { montadoRef.current = false }, [])
  const temVisitante = !!visitante?.proposta_id

  const abrir = async () => {
    if (verificando) return
    setNegouVisitante(false)
    if (!temVisitante) { setAberto(true); return }
    setVerificando(true)
    let proposta = null
    try {
      proposta = await propostaDoVisitante(tipo, id, visitante, propostas)
    } catch (err) {
      console.log('[CancelarPedido] proposta do visitante indisponível; cancelamento de sempre | status:', err?.status, '| code:', err?.code)
    } finally {
      if (montadoRef.current) setVerificando(false)
    }
    if (!montadoRef.current) return
    const modo = modoAntesCancelar(proposta)
    if (modo) setAntes({ modo, valor: valorDoOrcamento(proposta) })
    else setAberto(true)
  }

  const confirmar = async (motivo) => {
    if (enviando) return
    setEnviando(true)
    try {
      await excluirPedido(tipo, id, typeof motivo === 'string' ? motivo : undefined, temVisitante && negouVisitante ? false : undefined)
      if (!montadoRef.current) return
      setAberto(false)
      onCancelado?.()
    } catch (err) {
      console.log('[CancelarPedido] falha ao cancelar | tipo:', tipo, '| status:', err?.status, '| code:', err?.code, '| codigo:', err?.codigo, '| msg:', err?.mensagem)
      if (!montadoRef.current) return
      setAberto(false)
      if (ehMatchAtivo(err)) { Alert.alert('Erro', err.mensagem || 'Já existe um profissional escolhido.'); return }
      Alert.alert('Erro', err?.mensagem || await mensagemErroRede('Não foi possível cancelar o pedido. Tente novamente.'))
    } finally {
      if (montadoRef.current) setEnviando(false)
    }
  }

  return (
    <>
      <View style={estilos.rodape}>
        <TouchableOpacity onPress={abrir} disabled={verificando} style={[estilos.linkToque, verificando && { opacity: 0.5 }]} accessibilityRole="button" accessibilityState={{ busy: verificando }} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}>
          <Text style={estilos.link}>🗑️ Cancelar pedido</Text>
        </TouchableOpacity>
      </View>

      <FolhaAntesCancelar
        visivel={!!antes}
        nome={visitante?.nome}
        modo={antes?.modo}
        valor={antes?.valor}
        onFechar={() => setAntes(null)}
        onContratei={() => { setAntes(null); depoisDeFecharFolha(() => onContratei?.(visitante)) }}
        onAceitarOrcamento={() => { setAntes(null); depoisDeFecharFolha(() => onAceitarOrcamento?.(visitante.proposta_id)) }}
        onCancelar={() => { setAntes(null); setNegouVisitante(true); depoisDeFecharFolha(() => { if (montadoRef.current) setAberto(true) }) }}
      />

      <FolhaMotivoCancelamento visivel={aberto && publicado} enviando={enviando} interessados={interessados} onConfirmar={confirmar} onFechar={() => setAberto(false)} />

      <Modal visible={aberto && !publicado} transparent animationType="fade" onRequestClose={() => !enviando && setAberto(false)}>
        <View style={estilos.overlay}>
          <View style={estilos.caixa}>
            <Text style={estilos.titulo}>Cancelar este pedido?</Text>
            <Text style={estilos.corpo}>{textoConfirmacaoCancelar(Number(interessados) || 0)}</Text>
            <TouchableOpacity style={estilos.btnVoltar} onPress={() => setAberto(false)} disabled={enviando} activeOpacity={0.85} accessibilityRole="button">
              <Text style={estilos.btnVoltarTexto}>Voltar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[estilos.btnCancelar, enviando && { opacity: 0.6 }]} onPress={confirmar} disabled={enviando} activeOpacity={0.85} accessibilityRole="button">
              {enviando
                ? <ActivityIndicator size="small" color={cores.perigo} />
                : <Text style={estilos.btnCancelarTexto}>Sim, cancelar pedido</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

const estilos = StyleSheet.create({
  rodape: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda, marginTop: 24, paddingTop: 16, paddingBottom: 8, alignItems: 'center' },
  linkToque: { paddingVertical: 4, paddingHorizontal: 8 },
  link: { fontSize: 13, color: cores.textoMedio, textDecorationLine: 'underline', textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', paddingHorizontal: espacos.tela },
  caixa: { backgroundColor: cores.fundoCard, borderRadius: raios.grande, padding: 20, ...larguraMaxima },
  titulo: { fontSize: 18, fontWeight: '800', color: cores.textoForte, marginBottom: 8 },
  corpo: { fontSize: 14, color: cores.textoMedio, lineHeight: 20, marginBottom: 20 },
  btnVoltar: { backgroundColor: cores.primaria, borderRadius: raios.medio, padding: 14, alignItems: 'center', marginBottom: 10 },
  btnVoltarTexto: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
  btnCancelar: { borderWidth: 1.5, borderColor: cores.perigo, borderRadius: raios.medio, padding: 13, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  btnCancelarTexto: { fontSize: 14, fontWeight: '700', color: cores.perigo },
})
