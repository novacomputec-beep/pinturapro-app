import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'
import { mascararTelefone } from '../utils/telefone'

// Cartão verde "📱 Seu WhatsApp" (arte whatsapp-dono-previa), acima do "Publicar pedido" dos
// cadastros de serviço e de obra. Só aparece para o dono logado SEM telefone no cadastro; o
// número é opcional e vai como `telefone` na própria chamada de criação (POST /reparos/dono e
// POST /obras/dono), só quando preenchido. Número inválido: a API responde 400 e a mensagem
// dela sai no Alert de erro de sempre da tela. Criado o pedido, a sessão local ganha o
// telefone e o cartão não volta.

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '')

// Máscara do campo, como na arte: (34) 9 9999-9999.
export const mascararWhatsapp = (valor) => {
  const d = soDigitos(valor).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  let s = `(${d.slice(0, 2)}) ${d.slice(2, 3)}`
  if (d.length > 3) s += ` ${d.slice(3, 7)}`
  if (d.length > 7) s += `-${d.slice(7)}`
  return s
}

export const donoSemTelefone = (usuario) => !!usuario && soDigitos(usuario.telefone).length === 0

// Estado do cartão para a tela de cadastro:
//   cartao        — o elemento (null quando a conta já tem telefone);
//   campoTelefone — () => { telefone } para espalhar no corpo da criação, ou {} se vazio/oculto;
//   aoPublicar    — depois da criação confirmada: grava o telefone na sessão local;
//   limpar        — "Cancelar pedido".
export function useWhatsappDono(usuario, setUsuario) {
  const [valor, setValor] = useState('')
  const visivel = donoSemTelefone(usuario)
  const digitos = visivel ? soDigitos(valor) : ''
  // No formato do cadastro e do "Editar perfil" — (34) 99999-9999 —, o que o Perfil já exibe.
  const telefone = digitos ? mascararTelefone(digitos) : ''

  const campoTelefone = () => (telefone ? { telefone } : {})
  const aoPublicar = () => {
    if (!telefone) return
    setUsuario(prev => (prev ? { ...prev, telefone } : prev))
    setValor('')
  }
  const limpar = useCallback(() => setValor(''), [])

  const cartao = visivel
    ? <CartaoWhatsappDono valor={valor} onMudar={(t) => setValor(mascararWhatsapp(t))} />
    : null
  return { cartao, campoTelefone, aoPublicar, limpar }
}

export default function CartaoWhatsappDono({ valor, onMudar }) {
  return (
    <View style={estilos.cartao}>
      <Text style={estilos.titulo}>📱 Seu WhatsApp</Text>
      <Text style={estilos.texto}>Quando um profissional fizer uma pergunta sobre o seu pedido, avisamos você pelo WhatsApp, para você não perder nenhuma proposta.</Text>
      <TextInput
        style={estilos.campo}
        value={valor}
        onChangeText={onMudar}
        placeholder="(34) 9 ____-____"
        placeholderTextColor={cores.placeholderCampo}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={16}
        accessibilityLabel="Seu WhatsApp, opcional"
      />
      <Text style={estilos.nota}>Opcional · Fica salvo no seu cadastro · Não aparece para ninguém</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  cartao: { backgroundColor: cores.sucessoSuave, borderWidth: 1, borderColor: cores.sucessoBorda, borderRadius: raios.medio, padding: 14, marginTop: 4, marginBottom: 16 },
  titulo: { fontSize: 15, fontWeight: '700', color: cores.sucesso, marginBottom: 6 },
  texto: { fontSize: 13, lineHeight: 19, color: cores.textoMedio, marginBottom: 12 },
  campo: { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.sucessoBorda, borderRadius: raios.medio, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, fontWeight: '600', color: cores.textoForte, letterSpacing: 0.5 },
  nota: { fontSize: 11, color: cores.textoFraco, marginTop: 8 },
})
