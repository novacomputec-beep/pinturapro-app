import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { cores, raios } from '../utils/tema'

// Etiqueta pequena "Serviço" / "Obra", ao lado do título de um card, nas listas que misturam
// os dois tipos (Arte-Fase1-Contratar e Arte-Fase2-Trabalhar): "Meus pedidos" e "Finalizados"
// do dono, "Pedidos", "Meus trabalhos" e "Finalizados" do profissional. Azul para serviço,
// laranja para obra. Só ajuda a reconhecer — o card e o detalhe de cada tipo seguem os mesmos.
// tipo: 'obra' | qualquer outra coisa (= serviço).
export default function EtiquetaTipo({ tipo }) {
  const obra = tipo === 'obra'
  return (
    <View style={[estilos.etiqueta, obra ? estilos.obra : estilos.servico]}>
      <Text style={[estilos.texto, { color: obra ? cores.primaria : cores.marcaAzul }]}>{obra ? 'Obra' : 'Serviço'}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  etiqueta: { borderWidth: 1, borderRadius: raios.pequeno, paddingHorizontal: 6, paddingVertical: 1 },
  servico: { borderColor: cores.marcaAzul + '88', backgroundColor: cores.marcaAzul + '1A' },
  obra: { borderColor: cores.primaria + '88', backgroundColor: cores.primariaSuave },
  texto: { fontSize: 10, fontWeight: '700' },
})
