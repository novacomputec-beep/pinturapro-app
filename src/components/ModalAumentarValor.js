import React, { useState, useEffect } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native'
import { cores, raios } from '../utils/tema'

// Modal de aumento de VALOR (dono da obra/reparo). Irmão do ModalEstenderPrazo: mesma
// casca (backdrop escurecido + card central, fade), mesmo contrato com o pai — o POST
// real fica a cargo dele via onAumentar(valor); aqui só cuidamos da digitação, da
// máscara e do estado local de "enviando" (trava toque duplo).
//
// O campo é o NOVO valor da demanda, em reais, pré-preenchido com valorMinimo (o
// valor_minimo_aumento que o detalhe devolve). A única validação local é esse piso,
// porque é o único dado que o servidor já nos deu; teto e demais recusas continuam
// assunto exclusivo da API, e o pai traduz a recusa em alerta com a mensagem dela.

// Mesma máscara de CadastrarReparoScreen: só dígitos entram, tratados como centavos.
const mascararValor = (valor) => {
  const nums = String(valor).replace(/\D/g, '')
  if (!nums) return ''
  const centavos = Math.min(parseInt(nums, 10), 9999999999)
  const reais = Math.floor(centavos / 100)
  const cents = centavos % 100
  const reaisStr = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${reaisStr},${String(cents).padStart(2, '0')}`
}

const paraNumero = (mascarado) => {
  const nums = String(mascarado).replace(/\D/g, '')
  return nums ? parseInt(nums, 10) / 100 : NaN
}

const formatarReais = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ModalAumentarValor({ visivel, valorMinimo, onAumentar, onFechar }) {
  const [enviando, setEnviando] = useState(false)
  const [valor, setValor] = useState('')

  const minimo = Number(valorMinimo)
  const temMinimo = Number.isFinite(minimo) && minimo > 0

  // Zera envio e repõe o mínimo sempre que o modal reabre: o número da tentativa
  // anterior não pode reaparecer numa nova.
  useEffect(() => {
    if (visivel) {
      setEnviando(false)
      setValor(temMinimo ? mascararValor(Math.round(minimo * 100)) : '')
    }
  }, [visivel, minimo, temMinimo])

  const numero = paraNumero(valor)
  const valido = Number.isFinite(numero) && numero > 0 && (!temMinimo || numero >= minimo)

  const confirmar = async () => {
    if (enviando || !valido) return
    setEnviando(true)
    try {
      await onAumentar(numero)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal visible={visivel} transparent animationType="fade" statusBarTranslucent onRequestClose={onFechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          <Text style={estilos.titulo}>Qual o novo valor?</Text>

          <View style={estilos.campoWrap}>
            <Text style={estilos.prefixo}>R$</Text>
            <TextInput
              style={estilos.input}
              value={valor}
              onChangeText={(t) => setValor(mascararValor(t))}
              keyboardType="number-pad"
              placeholder="0,00"
              placeholderTextColor={cores.textoFraco}
              maxLength={16}
              editable={!enviando}
              autoFocus
            />
          </View>
          <Text style={estilos.ajuda}>
            {temMinimo ? `Mínimo de ${formatarReais(minimo)}.` : 'Informe o novo valor.'}
          </Text>
          <TouchableOpacity
            style={[estilos.opcao, (!valido || enviando) && estilos.opcaoDesabilitada]}
            onPress={confirmar}
            disabled={!valido || enviando}
            activeOpacity={0.85}
          >
            <Text style={estilos.opcaoTexto}>{enviando ? 'Aumentando…' : 'Aumentar valor'}</Text>
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
  prefixo:         { fontSize: 16, fontWeight: '700', color: cores.textoMedio, marginRight: 10 },
  input:           { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: 16, paddingVertical: 12, fontSize: 24, fontWeight: '800', color: cores.textoForte, minWidth: 160, textAlign: 'center' },
  ajuda:           { fontSize: 12, color: cores.textoFraco, textAlign: 'center', marginBottom: 16 },
  opcao:           { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 10 },
  opcaoDesabilitada:{ opacity: 0.5 },
  opcaoTexto:      { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  fechar:          { paddingVertical: 8, marginTop: 4 },
  fecharTexto:     { color: cores.textoFraco, fontSize: 13 },
})
