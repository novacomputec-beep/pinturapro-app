import React from 'react'
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native'
import { cores, espacos, raios } from '../../utils/tema'

const formatarValor = (v) =>
  v == null || isNaN(Number(v))
    ? 'A combinar'
    : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function DetalheObraScreen({ route, navigation }) {
  const obra = route?.params?.obra || {}

  const titulo = obra.titulo || 'Sem título'
  const valor = formatarValor(obra.valor)
  const cidade = obra.cidade || ''
  const bairro = obra.bairro || ''
  const descricao = obra.descricao || ''
  const status = obra.status || ''

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={estilos.btnVoltarTexto}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.topbarTitulo}>Detalhe da obra</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={estilos.corpo} showsVerticalScrollIndicator={false}>
        <Text style={estilos.titulo}>{titulo}</Text>

        {!!status && (
          <View style={estilos.statusPill}>
            <Text style={estilos.statusTexto}>{status}</Text>
          </View>
        )}

        <View style={estilos.card}>
          <Text style={estilos.label}>VALOR</Text>
          <Text style={estilos.valorTexto}>{valor}</Text>
        </View>

        {!!(cidade || bairro) && (
          <View style={estilos.card}>
            <Text style={estilos.label}>LOCALIZAÇÃO</Text>
            <Text style={estilos.valor}>
              {[cidade, bairro].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        {!!descricao && (
          <View style={estilos.card}>
            <Text style={estilos.label}>DESCRIÇÃO</Text>
            <Text style={estilos.descricao}>{descricao}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espacos.tela,
    paddingVertical: 12,
  },
  btnVoltar: {
    width: 36,
    height: 36,
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnVoltarTexto: { color: cores.textoForte, fontSize: 22, fontWeight: '900' },
  topbarTitulo: { fontSize: 14, color: cores.textoMedio, fontWeight: '500' },
  corpo: { padding: espacos.tela, paddingBottom: 40 },
  titulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, marginBottom: 12, lineHeight: 28 },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: raios.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 16,
  },
  statusTexto: { fontSize: 12, color: cores.textoFraco, textTransform: 'capitalize' },
  card: {
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: raios.medio,
    padding: 14,
    marginBottom: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: cores.textoFraco,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  valorTexto: { fontSize: 18, fontWeight: '700', color: cores.sucesso },
  valor: { fontSize: 14, color: cores.textoMedio },
  descricao: { fontSize: 13, color: cores.textoMedio, lineHeight: 22 },
})
