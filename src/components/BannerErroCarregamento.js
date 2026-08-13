import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { cores } from '../utils/tema'

// Banner de falha de CARREGAMENTO com ação de repetir. Puramente apresentacional: quem
// é dono do estado `erro` e da função de refetch é a tela.
//
// Existe para separar dois estados que as listas confundiam: "não deu para carregar" e
// "não há nada aqui". Antes, um GET que falhava caía no catch, virava console.log e a
// tela renderizava o vazio — que se lê como "você não tem nada", uma afirmação sobre os
// dados do usuário que o app não podia fazer.
//
// Renderiza como IRMÃO do ramo vazio (nunca dentro dele), para que os dois possam
// aparecer juntos: lista vazia porque a carga falhou mostra o vazio E o banner.
//
// Estilos idênticos aos do erroBox/erroTexto inline dos dois feeds (FeedObrasScreen,
// FeedReparosScreen), que por ora seguem com suas próprias cópias.
export default function BannerErroCarregamento({ mensagem, onRetry }) {
  if (!mensagem) return null
  return (
    <View style={estilos.erroBox}>
      <Text style={estilos.erroTexto}>{mensagem}</Text>
      <TouchableOpacity onPress={onRetry} style={{ marginTop: 8 }}>
        <Text style={{ color: cores.primaria, fontSize: 13 }}>Tentar novamente</Text>
      </TouchableOpacity>
    </View>
  )
}

const estilos = StyleSheet.create({
  erroBox: { alignItems: 'center', padding: 20 },
  erroTexto: { color: cores.perigo, fontSize: 13, textAlign: 'center' },
})
