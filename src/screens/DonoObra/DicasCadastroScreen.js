import React from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity
} from 'react-native'
import { BotaoPrimario } from '../../components'
import { cores, espacos, raios } from '../../utils/tema'

const dicasReparo = [
  { icone: '📝', titulo: 'Detalhe bastante o serviço', desc: 'Quanto mais detalhes você fornecer, mais precisa será a proposta do profissional.' },
  { icone: '🎥', titulo: 'Envie vídeo com voz', desc: 'Grave um vídeo explicando o problema em detalhes. Isso acelera muito o aceite!' },
  { icone: '💰', titulo: 'Valor justo evita demora', desc: 'Valores muito baixos afastam profissionais. Pesquise o preço médio do serviço.' },
  { icone: '🔍', titulo: 'Não omita nenhum detalhe', desc: 'Informações ocultas geram discussões futuras. Seja completo desde o início.' },
  { icone: '🤝', titulo: 'Seja transparente', desc: 'Não minimize as dificuldades do serviço. A honestidade gera melhores resultados.' },
  { icone: '😊', titulo: 'Boa sorte!', desc: 'Com essas dicas, você encontrará o profissional ideal rapidamente. Sucesso!' },
]

const dicasPintura = [
  { icone: '📐', titulo: 'Informe a metragem correta', desc: 'A área a ser pintada é fundamental para um orçamento preciso. Meça com cuidado.' },
  { icone: '🎥', titulo: 'Envie fotos e vídeos do ambiente', desc: 'Mostre o estado atual das paredes, tetos e detalhes que precisam de atenção.' },
  { icone: '🎨', titulo: 'Especifique o tipo de tinta', desc: 'Se tiver preferência por marca ou tipo de tinta (acrílica, PVA, textura), informe.' },
  { icone: '💰', titulo: 'Valor justo atrai profissionais', desc: 'Pesquise o valor médio por m² na sua região para uma proposta mais competitiva.' },
  { icone: '📋', titulo: 'Liste todos os serviços', desc: 'Massa corrida, selador, rodapés, janelas — liste tudo que precisa ser feito.' },
  { icone: '😊', titulo: 'Boa sorte!', desc: 'Com essas dicas, você encontrará o pintor ideal para sua obra. Sucesso!' },
]

export default function DicasCadastroScreen({ route, navigation }) {
  const { tipo } = route.params // 'reparo' ou 'pintura'
  const dicas = tipo === 'reparo' ? dicasReparo : dicasPintura
  const titulo = tipo === 'reparo' ? 'Dicas para seu\nreparo' : 'Dicas para sua\nobra de pintura'
  const subtitulo = tipo === 'reparo'
    ? 'Siga essas dicas para encontrar o profissional ideal mais rápido!'
    : 'Siga essas dicas para atrair os melhores pintores!'
  const proximaTela = tipo === 'reparo' ? 'CadastrarReparo' : 'CadastrarObra'

  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoForte, fontSize: 26, fontWeight: '700' }}>←</Text>
        </TouchableOpacity>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={estilos.scroll}>
        <View style={estilos.headerBox}>
          <Text style={estilos.headerIcone}>{tipo === 'reparo' ? '🛠️' : '🖌️'}</Text>
          <Text style={estilos.titulo}>{titulo}</Text>
          <Text style={estilos.subtitulo}>{subtitulo}</Text>
        </View>

        {dicas.map((dica, i) => (
          <View key={i} style={[estilos.dicaCard, i === dicas.length - 1 && estilos.dicaCardUltima]}>
            <View style={estilos.dicaNumero}>
              <Text style={estilos.dicaNumeroTexto}>{i + 1}</Text>
            </View>
            <View style={estilos.dicaIconeWrap}>
              <Text style={estilos.dicaIcone}>{dica.icone}</Text>
            </View>
            <View style={estilos.dicaTextoWrap}>
              <Text style={estilos.dicaTitulo}>{dica.titulo}</Text>
              <Text style={estilos.dicaDesc}>{dica.desc}</Text>
            </View>
          </View>
        ))}

        <View style={estilos.acoesWrap}>
          <BotaoPrimario
            titulo={`Entendi, vamos cadastrar →`}
            onPress={() => navigation.navigate(proximaTela)}
            estilo={{ marginBottom: 12 }}
          />
          <TouchableOpacity
            style={estilos.btnPular}
            onPress={() => navigation.navigate(proximaTela)}
          >
            <Text style={estilos.btnPularTexto}>Pular dicas</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espacos.tela, paddingVertical: 12 },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: espacos.tela, paddingBottom: 40 },
  headerBox: { alignItems: 'center', paddingVertical: 24, marginBottom: 8 },
  headerIcone: { fontSize: 52, marginBottom: 12 },
  titulo: { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 34, textAlign: 'center', marginBottom: 8 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, textAlign: 'center', lineHeight: 20 },
  dicaCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: cores.bordaFraca },
  dicaCardUltima: { borderBottomWidth: 0, backgroundColor: cores.primariaSuave, borderRadius: raios.grande, padding: 16, marginTop: 8 },
  dicaNumero: { width: 24, height: 24, borderRadius: 12, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  dicaNumeroTexto: { fontSize: 11, fontWeight: '700', color: '#0A0A0A' },
  dicaIconeWrap: { width: 32, alignItems: 'center', flexShrink: 0 },
  dicaIcone: { fontSize: 22 },
  dicaTextoWrap: { flex: 1 },
  dicaTitulo: { fontSize: 14, fontWeight: '600', color: cores.textoForte, marginBottom: 4 },
  dicaDesc: { fontSize: 12, color: cores.textoMedio, lineHeight: 18 },
  acoesWrap: { marginTop: 28 },
  btnPular: { alignItems: 'center', padding: 12 },
  btnPularTexto: { fontSize: 13, color: cores.textoFraco },
})