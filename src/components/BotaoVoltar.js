import React from 'react'
import { TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { cores } from '../utils/tema'

// O ÚNICO botão de voltar do app. Retângulo arredondado de 74×42 com a seta vetorial
// (nunca o caractere "←", que cada fonte de sistema desenha e alinha de um jeito).
//
// `estilo` serve só para POSICIONAR (margens, position): tamanho, raio, fundo, borda e
// centralização vêm DEPOIS dele no array e por isso sempre vencem — nenhuma tela consegue
// desenhar um botão de voltar diferente dos outros.
//
// Feather (traço) e não outra família: é a que o app já carrega nas abas, então a seta não
// pisca em branco esperando fonte. A caixa do ícone tem largura, altura e lineHeight iguais
// ao tamanho, sem padding de fonte, para o glifo ficar no centro exato nos dois eixos.
const TAMANHO_SETA = 23

export default function BotaoVoltar({ onPress, estilo, disabled }) {
  return (
    <TouchableOpacity
      style={[estilo, estilos.botao]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Voltar"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Feather name="arrow-left" size={TAMANHO_SETA} color="#FFFFFF" style={estilos.seta} />
    </TouchableOpacity>
  )
}

const estilos = StyleSheet.create({
  botao: {
    width: 74,
    height: 42,
    borderRadius: 12,
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5,
    borderColor: cores.borda,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  seta: {
    width: TAMANHO_SETA,
    height: TAMANHO_SETA,
    lineHeight: TAMANHO_SETA,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
})
