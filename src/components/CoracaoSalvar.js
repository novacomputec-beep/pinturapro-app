import React from 'react'
import { TouchableOpacity, Alert } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { cores } from '../utils/tema'
import { useAuth } from '../contexts/AuthContext'
import { estaSalvo, alternarSalvo, useVersaoSalvos } from '../utils/salvos'

// Coração do card do feed (arte salvar-e-anuncio-previa-v2): contorno = não salvo, vermelho
// cheio = salvo; um toque alterna, como no Instagram. Otimista, com volta em caso de erro
// (utils/salvos). Fica DENTRO do card, que é tocável: o toque aqui não abre o pedido.
export const VERMELHO_SALVO = '#ED4956'
const CAMINHO = 'M12 20.6l-1.3-1.2C5.6 14.8 2.6 12 2.6 8.6 2.6 5.9 4.7 3.8 7.4 3.8c1.5 0 3 .7 3.9 1.9l.7.9.7-.9c.9-1.2 2.4-1.9 3.9-1.9 2.7 0 4.8 2.1 4.8 4.8 0 3.4-3 6.2-8.1 10.8L12 20.6z'

export const IconeCoracao = ({ cheio, size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d={CAMINHO} fill={cheio ? VERMELHO_SALVO : 'none'} stroke={cheio ? VERMELHO_SALVO : cores.textoForte} strokeWidth={1.8} strokeLinejoin="round" />
  </Svg>
)

export default function CoracaoSalvar({ tipo, item, size = 24, estilo }) {
  const { usuario } = useAuth()
  useVersaoSalvos()
  const salvo = estaSalvo(usuario?.id, tipo, item)
  const alternar = async () => {
    try {
      await alternarSalvo(usuario?.id, tipo, item)
    } catch (err) {
      console.log('[CoracaoSalvar] falha ao alternar | tipo:', tipo, '| status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem)
      Alert.alert('Erro', err?.mensagem || (salvo ? 'Não foi possível tirar dos salvos.' : 'Não foi possível salvar o pedido.'))
    }
  }
  return (
    <TouchableOpacity
      onPress={alternar}
      style={estilo}
      activeOpacity={0.6}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityState={{ selected: salvo }}
      accessibilityLabel={salvo ? 'Tirar dos salvos' : 'Salvar pedido'}
    >
      <IconeCoracao cheio={salvo} size={size} />
    </TouchableOpacity>
  )
}
