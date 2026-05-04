import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert
} from 'react-native'
import { BotaoPrimario, Input } from '../../components'
import { authService } from '../../services/api'
import { cores, espacos, raios } from '../../utils/tema'

const IndicadorPassos = ({ passo, total }) => (
  <View style={estilos.indicador}>
    {Array.from({ length: total }).map((_, i) => (
      <View key={i} style={[
        estilos.indicadorDot,
        i < passo - 1 && estilos.indicadorDotFeito,
        i === passo - 1 && estilos.indicadorDotAtivo,
      ]} />
    ))}
  </View>
)

export default function CadastroScreen({ navigation }) {
  const [tipoConta, setTipoConta] = useState(null)
  const [passo, setPasso] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})

  const [nome, setNome] = useState('')
  const [sobrenome, setSobrenome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [cidade, setCidade] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [anosExp, setAnosExp] = useState('')
  const [equipe, setEquipe] = useState('')
  const [especialidades, setEspecialidades] = useState('')
  const [planoSelecionado, setPlanoSelecionado] = useState('mensal')

  const totalPassos = tipoConta === 'pintor' ? 3 : 2

  const escolherTipo = (tipo) => { setTipoConta(tipo); setPasso(1) }

  const validarPasso1 = () => {
    const novos = {}
    if (!nome.trim()) novos.nome = 'Informe o nome'
    if (!email.trim()) novos.email = 'Informe o e-mail'
    if (!senha.trim()) novos.senha = 'Informe a senha'
    if (senha.length < 8) novos.senha = 'Minimo 8 caracteres'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const validarPasso2 = () => {
    const novos = {}
    if (!cidade.trim()) novos.cidade = 'Informe sua cidade'
    if (!cpfCnpj.trim()) novos.cpfCnpj = 'Informe CPF ou CNPJ'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const avancar = () => {
    if (passo === 1 && !validarPasso1()) return
    if (passo === 2 && !validarPasso2()) return
    if (passo === totalPassos) { handleCadastrar(); return }
    setPasso(p => p + 1)
  }

  const voltar = () => {
    if (passo > 1) setPasso(p => p - 1)
    else if (passo === 1) { setTipoConta(null); setPasso(0) }
    else navigation.goBack()
  }

  const handleCadastrar = async () => {
    setCarregando(true)
    try {
      const dados = {
        nome: `${nome.trim()} ${sobrenome.trim()}`.trim(),
        email: email.trim().toLowerCase(),
        telefone: telefone.trim(),
        senha,
        cidade: cidade.trim(),
        cpf_cnpj: cpfCnpj.trim(),
        tipo_conta: tipoConta,
        anos_experiencia: tipoConta === 'pintor' ? parseInt(anosExp) || 0 : 0,
        tamanho_equipe: tipoConta === 'pintor' ? parseInt(equipe) || 1 : 1,
        especialidades: tipoConta === 'pintor'
          ? especialidades.split(',').map(s => s.trim()).filter(Boolean) : [],
      }

      await authService.cadastrar(dados)

      if (tipoConta === 'pintor') {
        Alert.alert(
          'Conta criada!',
          'Sua conta foi criada! Faca login para finalizar seu pagamento e acessar as obras.',
          [{ text: 'Fazer login agora', onPress: () => navigation.navigate('Login') }]
        )
      } else {
        Alert.alert(
          'Conta criada!',
          'Bem-vindo! Faca login para cadastrar suas obras.',
          [{ text: 'Fazer login agora', onPress: () => navigation.navigate('Login') }]
        )
      }

    } catch (err) {
      Alert.alert('Erro', err.mensagem || err?.response?.data?.erro || 'Nao foi possivel criar sua conta.')
    } finally {
      setCarregando(false)
    }
  }

  if (passo === 0) {
    return (
      <SafeAreaView style={estilos.container}>
        <ScrollView contentContainerStyle={estilos.scroll}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoMedio, fontSize: 16 }}>←</Text>
          </TouchableOpacity>
          <Text style={estilos.titulo}>Como voce{'\n'}quer usar?</Text>
          <Text style={estilos.subtitulo}>Escolha o perfil que melhor descreve voce</Text>
          <TouchableOpacity style={estilos.tipoCard} onPress={() => escolherTipo('pintor')} activeOpacity={0.8}>
            <Text style={estilos.tipoIcone}>🖌️</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoNome}>Sou pintor profissional</Text>
              <Text style={estilos.tipoDesc}>Quero encontrar obras e servicos disponiveis na regiao</Text>
            </View>
            <Text style={{ color: cores.textoFraco, fontSize: 18 }}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.tipoCard} onPress={() => escolherTipo('dono_obra')} activeOpacity={0.8}>
            <Text style={estilos.tipoIcone}>🏠</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.tipoNome}>Tenho uma obra</Text>
              <Text style={estilos.tipoDesc}>Quero cadastrar minha obra e encontrar pintores qualificados</Text>
            </View>
            <Text style={{ color: cores.textoFraco, fontSize: 18 }}>→</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={voltar}>
            <Text style={{ color: cores.textoMedio, fontSize: 16 }}>←</Text>
          </TouchableOpacity>
          <Text style={estilos.titulo}>
            {passo === 1 ? 'Criar\nsua conta'
              : passo === 2 ? (tipoConta === 'pintor' ? 'Perfil\nprofissional' : 'Seus\ndados')
              : 'Escolha\nseu plano'}
          </Text>
          <Text style={estilos.subtitulo}>
            {`Passo ${passo} de ${totalPassos} — ${
              passo === 1 ? 'dados pessoais'
              : passo === 2 ? (tipoConta === 'pintor' ? 'informacoes profissionais' : 'localizacao e documento')
              : 'assinatura'}`}
          </Text>
          <IndicadorPassos passo={passo} total={totalPassos} />

          {passo === 1 && (
            <View>
              <View style={estilos.duasColunas}>
                <Input label="NOME" placeholder="Primeiro nome" value={nome} onChangeText={setNome} erro={erros.nome} estilo={{ flex: 1 }} />
                <Input label="SOBRENOME" placeholder="Sobrenome" value={sobrenome} onChangeText={setSobrenome} estilo={{ flex: 1 }} />
              </View>
              <Input label="E-MAIL" placeholder="seu@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" erro={erros.email} />
              <Input label="WHATSAPP" placeholder="(34) 99999-9999" value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" />
              <View>
                <Input label="SENHA" placeholder="Minimo 8 caracteres" value={senha} onChangeText={setSenha} secureTextEntry={!mostrarSenha} erro={erros.senha} />
                <TouchableOpacity style={estilos.olhoBtn} onPress={() => setMostrarSenha(!mostrarSenha)}>
                  <Text style={estilos.olhoTexto}>{mostrarSenha ? 'ocultar' : 'mostrar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {passo === 2 && (
            <View>
              <Input label="CIDADE" placeholder="Ex: Uberlandia, MG" value={cidade} onChangeText={setCidade} erro={erros.cidade} />
              <Input label="CPF / CNPJ" placeholder="000.000.000-00" value={cpfCnpj} onChangeText={setCpfCnpj} keyboardType="numeric" erro={erros.cpfCnpj} />
              {tipoConta === 'pintor' && (
                <>
                  <View style={estilos.duasColunas}>
                    <Input label="ANOS DE EXP." placeholder="Ex: 8" value={anosExp} onChangeText={setAnosExp} keyboardType="numeric" estilo={{ flex: 1 }} />
                    <Input label="TAMANHO DA EQUIPE" placeholder="Ex: 4" value={equipe} onChangeText={setEquipe} keyboardType="numeric" estilo={{ flex: 1 }} />
                  </View>
                  <Input label="ESPECIALIDADES" placeholder="Ex: textura, epoxi, acabamento fino" value={especialidades} onChangeText={setEspecialidades} />
                </>
              )}
            </View>
          )}

          {passo === 3 && tipoConta === 'pintor' && (
            <View>
              <Text style={estilos.planoSubtitulo}>Escolha o plano para acessar obras disponiveis:</Text>
              <TouchableOpacity style={[estilos.planoCard, planoSelecionado === 'mensal' && estilos.planoCardAtivo]} onPress={() => setPlanoSelecionado('mensal')} activeOpacity={0.8}>
                <View style={[estilos.planoRadio, planoSelecionado === 'mensal' && estilos.planoRadioAtivo]}>
                  {planoSelecionado === 'mensal' && <View style={estilos.planoRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.planoNome}>Plano Mensal</Text>
                  <Text style={estilos.planoDesc}>Acesso completo as obras disponiveis</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={estilos.planoPreco}>R$ 99,90</Text>
                  <Text style={estilos.planoPeriodo}>/mes</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={[estilos.planoCard, planoSelecionado === 'anual' && estilos.planoCardAtivo]} onPress={() => setPlanoSelecionado('anual')} activeOpacity={0.8}>
                <View style={{ position: 'absolute', top: -10, right: 14 }}>
                  <View style={estilos.planoDestaque}><Text style={estilos.planoDestaqueTexto}>Economize 2 meses</Text></View>
                </View>
                <View style={[estilos.planoRadio, planoSelecionado === 'anual' && estilos.planoRadioAtivo]}>
                  {planoSelecionado === 'anual' && <View style={estilos.planoRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.planoNome}>Plano Anual</Text>
                  <Text style={estilos.planoDesc}>Melhor custo-beneficio</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={estilos.planoPreco}>R$ 83,25</Text>
                  <Text style={estilos.planoPeriodo}>/mes · R$ 999/ano</Text>
                </View>
              </TouchableOpacity>
              <View style={estilos.segurancaBox}>
                <Text style={estilos.segurancaIcone}>🔒</Text>
                <Text style={estilos.segurancaTexto}>Pagamento 100% seguro via Mercado Pago. Cancele quando quiser.</Text>
              </View>
            </View>
          )}

          <View style={estilos.acoesRow}>
            <BotaoPrimario
              titulo={passo === totalPassos ? 'Finalizar cadastro →' : 'Continuar →'}
              onPress={avancar}
              carregando={carregando}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 },
  btnVoltar: { marginTop: 14, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 20 },
  indicador: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  indicadorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: cores.fundoElevado },
  indicadorDotAtivo: { width: 20, borderRadius: 3, backgroundColor: cores.primaria },
  indicadorDotFeito: { backgroundColor: cores.sucesso },
  duasColunas: { flexDirection: 'row', gap: 12 },
  olhoBtn: { position: 'absolute', right: 14, bottom: 27 },
  olhoTexto: { fontSize: 12, color: cores.textoFraco },
  tipoCard: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  tipoIcone: { fontSize: 32 },
  tipoNome: { fontSize: 15, fontWeight: '600', color: cores.textoForte, marginBottom: 4 },
  tipoDesc: { fontSize: 12, color: cores.textoFraco, lineHeight: 18 },
  planoSubtitulo: { fontSize: 13, color: cores.textoMedio, marginBottom: 16 },
  planoCard: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  planoCardAtivo: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  planoRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 0.5, borderColor: cores.borda, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  planoRadioAtivo: { borderColor: cores.primaria, backgroundColor: cores.primaria },
  planoRadioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#0A0A0A' },
  planoNome: { fontSize: 14, fontWeight: '600', color: cores.textoForte, marginBottom: 2 },
  planoDesc: { fontSize: 11, color: cores.textoFraco },
  planoPreco: { fontSize: 15, fontWeight: '700', color: cores.sucesso },
  planoPeriodo: { fontSize: 10, color: cores.textoFraco, textAlign: 'right' },
  planoDestaque: { backgroundColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 3 },
  planoDestaqueTexto: { fontSize: 10, fontWeight: '700', color: '#0A0A0A' },
  segurancaBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, marginTop: 4 },
  segurancaIcone: { fontSize: 14 },
  segurancaTexto: { flex: 1, fontSize: 11, color: cores.textoFraco, lineHeight: 17 },
  acoesRow: { marginTop: 24 },
})