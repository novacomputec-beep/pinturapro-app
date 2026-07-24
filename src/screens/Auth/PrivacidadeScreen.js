import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { cores, espacos } from '../../utils/tema'

const SECOES = [
  {
    titulo: '1. Dados Coletados',
    texto: 'Coletamos nome, e-mail, telefone, CPF/CNPJ, cidade, foto de perfil e documentos de verificação de identidade. Dados de localização podem ser coletados para exibir serviços próximos.'
  },
  {
    titulo: '2. Uso dos Dados',
    texto: 'Usamos seus dados para criar e gerenciar sua conta, conectar prestadores com donos de obra, processar pagamentos, enviar notificações sobre oportunidades de serviço e comunicações do sistema.'
  },
  {
    titulo: '3. Compartilhamento',
    texto: 'Seus dados de contato (nome, telefone) são compartilhados com a outra parte quando um match de serviço é confirmado. Não vendemos seus dados para terceiros.'
  },
  {
    titulo: '4. Armazenamento e Segurança',
    texto: 'Dados são armazenados em servidores seguros com criptografia. Senhas são armazenadas com hash bcrypt. Tomamos medidas razoáveis para proteger suas informações.'
  },
  {
    titulo: '5. Seus Direitos',
    texto: 'Você pode solicitar acesso, correção ou exclusão dos seus dados pessoais a qualquer momento. Para exercer esses direitos, entre em contato: privacidade@pinturapro.com.br'
  },
  {
    titulo: '6. Cookies e Rastreamento',
    texto: 'O aplicativo não utiliza cookies. Podemos coletar dados de uso anônimos para melhorar a experiência do usuário.'
  },
  {
    titulo: '7. Retenção de Dados',
    texto: 'Mantemos seus dados enquanto sua conta estiver ativa. Após exclusão da conta, dados são removidos em até 30 dias, exceto quando exigido por lei.'
  },
  {
    titulo: '8. Contato',
    texto: 'Dúvidas sobre privacidade? Entre em contato: privacidade@pinturapro.com.br'
  },
]

export default function PrivacidadeScreen({ navigation }) {
  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.container}>
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.topbarTitulo}>Política de Privacidade</Text>
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
