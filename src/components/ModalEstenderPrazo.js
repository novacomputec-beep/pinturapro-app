import React, { useState, useEffect } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native'
import { cores, raios } from '../utils/tema'

// Modal de aumento de prazo (dono da obra/reparo). Modelado na estrutura de
// ModalAvaliacao (backdrop escurecido + card central, fade).
// O prazo é DIGITADO, não escolhido numa lista fixa: o dono informa quantos
// dias/horas quer somar. A unidade vem do pai (prop `unidade`), porque obra e reparo
// raciocinam em escalas diferentes — mas a conversão para HORAS acontece aqui, no
// confirmar, de modo que onEstender siga recebendo sempre horas: o contrato com a
// API não mudou.
// O teto é assunto EXCLUSIVO do servidor, que sempre foi a fonte da verdade: o campo
// não tenta adivinhá-lo nem se esconder por causa dele. Nada de estado "sem orçamento"
// aqui — quem recusa é a API, e o pai já traduz a recusa em alerta.
// O POST real fica a cargo do pai via onEstender(horas); aqui só controlamos a
// digitação e o estado local de "enviando" (trava toque duplo).
export default function ModalEstenderPrazo({ visivel, unidade = 'horas', onEstender, onFechar }) {
  const [enviando, setEnviando] = useState(false)
  const [valor, setValor] = useState('')

  // Zera envio e campo sempre que o modal reabre: o número anterior não pode
  // reaparecer numa nova tentativa.
  useEffect(() => {
    if (visivel) { setEnviando(false); setValor('') }
  }, [visivel])

  const emDias = unidade === 'dias'
  // Só dígitos entram no estado, então o parse não tem como ver sinal, vírgula ou
  // espaço — resta o piso de 1, que é o mínimo que faz sentido somar.
  const quantidade = parseInt(valor, 10)
  const valido = Number.isFinite(quantidade) && quantidade >= 1

  const confirmar = async () => {
    if (enviando || !valido) return
    setEnviando(true)
    try {
      await onEstender(emDias ? quantidade * 24 : quantidade)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          <Text style={estilos.titulo}>Por quanto tempo aumentar?</Text>

          <View style={estilos.campoWrap}>
            <TextInput
              style={estilos.input}
              value={valor}
              onChangeText={(t) => setValor(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={cores.textoFraco}
              maxLength={4}
              editable={!enviando}
              autoFocus
            />
            <Text style={estilos.unidadeTexto}>{emDias ? 'dia(s)' : 'hora(s)'}</Text>
          </View>
          <Text style={estilos.ajuda}>Mínimo de 1 {emDias ? 'dia' : 'hora'}.</Text>
          <TouchableOpacity
            style={[estilos.opcao, (!valido || enviando) && estilos.opcaoDesabilitada]}
            onPress={confirmar}
            disabled={!valido || enviando}
            activeOpacity={0.85}
          >
            <Text style={estilos.opcaoTexto}>{enviando ? 'Aumentando…' : 'Aumentar prazo'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={estilos.fechar}
            onPress={onFechar}
            disabled={enviando}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={estilos.fecharTexto}>Agora não</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:            { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.primaria, padding: 28, alignItems: 'center' },
  titulo:          { fontSize: 22, fontWeight: '800', color: cores.primaria, textAlign: 'center', marginBottom: 20, letterSpacing: -0.3 },
  campoWrap:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 8 },
  input:           { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: 16, paddingVertical: 12, fontSize: 24, fontWeight: '800', color: cores.textoForte, textAlign: 'center', minWidth: 110 },
  unidadeTexto:    { fontSize: 16, fontWeight: '700', color: cores.textoMedio, marginLeft: 10 },
  ajuda:           { fontSize: 12, color: cores.textoFraco, textAlign: 'center', marginBottom: 16 },
  opcao:           { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 10 },
  opcaoDesabilitada:{ opacity: 0.5 },
  opcaoTexto:      { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  fechar:          { paddingVertical: 8, marginTop: 4 },
  fecharTexto:     { color: cores.textoFraco, fontSize: 13 },
})
