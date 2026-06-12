import React from 'react'
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native'
import { cores, espacos } from '../../utils/tema'

const SECOES = [
  {
    titulo: '1. Aceitação dos Termos',
    texto: 'Ao usar o aplicativo ArrumaPro, você concorda com estes Termos de Uso. Se não concordar, não utilize o aplicativo.'
  },
  {
    titulo: '2. Descrição do Serviço',
    texto: 'O ArrumaPro é uma plataforma que conecta donos de obra/reparo com prestadores de serviço profissionais. Não somos parte nas negociações entre usuários.'
  },
  {
    titulo: '3. Cadastro e Conta',
    texto: 'Você é responsável pela veracidade das informações fornecidas no cadastro e pela segurança de suas credenciais de acesso.'
  },
  {
    titulo: '4. Assinatura e Pagamento',
    texto: 'Prestadores de serviço pagam uma assinatura mensal para acesso à plataforma. O pagamento é processado de forma segura via PagBank.'
  },
  {
    titulo: '5. Uso Aceitável',
    texto: 'É proibido usar a plataforma para atividades ilegais, fraudulentas ou que violem direitos de terceiros. Reservamo-nos o direito de suspender contas que violem estas regras.'
  },
  {
    titulo: '6. Limitação de Responsabilidade',
    texto: 'O ArrumaPro não se responsabiliza por danos decorrentes de serviços prestados entre usuários, informações incorretas ou falhas técnicas fora de nosso controle.'
  },
  {
    titulo: '7. Alterações nos Termos',
    texto: 'Podemos atualizar estes Termos a qualquer momento. O uso continuado do aplicativo após as alterações implica aceitação dos novos termos.'
  },
  {
    titulo: '8. Contato',
    texto: 'Dúvidas sobre estes Termos? Entre em contato: suporte@pinturapro.com.br'
  },
]

export default function TermosScreen({ navigation }) {
  return (
    <SafeAreaView style={estilos.container}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoForte, fontSize: 32, fontWeight: '900' }}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.topbarTitulo}>Termos de Uso</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={estilos.scroll} showsVerticalScrollIndicator={false}>
        <Text style={estilos.atualizadoEm}>Atualizado em Janeiro de 2025</Text>

        {SECOES.map((s, i) => (
          <View key={i} style={estilos.secao}>
            <Text style={estilos.secaoTitulo}>{s.titulo}</Text>
            <Text style={estilos.secaoTexto}>{s.texto}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espacos.tela, paddingVertical: 12 },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  topbarTitulo: { fontSize: 14, color: cores.textoMedio, fontWeight: '500' },
  scroll: { paddingHorizontal: espacos.tela, paddingBottom: 40 },
  atualizadoEm: { fontSize: 12, color: cores.textoFraco, marginBottom: 24, marginTop: 4 },
  secao: { marginBottom: 20 },
  secaoTitulo: { fontSize: 14, fontWeight: '700', color: cores.textoForte, marginBottom: 6 },
  secaoTexto: { fontSize: 13, color: cores.textoMedio, lineHeight: 22 },
})
