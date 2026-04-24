import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, KeyboardAvoidingView, Platform, Alert, ActivityIndicator
} from 'react-native'
import { BotaoPrimario, BotaoSecundario, Input } from '../../components'
import { authService } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { cores, espacos, raios } from '../../utils/tema'

const TOTAL_PASSOS = 3

// Indicador de progresso
const IndicadorPassos = ({ passo }) => (
  <View style={estilos.indicador}>
    {[1, 2, 3].map((n) => (
      <View
        key={n}
        style={[
          estilos.indicadorDot,
          n < passo  && estilos.indicadorDotFeito,
          n === passo && estilos.indicadorDotAtivo,
        ]}
      />
    ))}
  </View>
)

export default function CadastroScreen({ navigation }) {
  const { login } = useAuth()
  const [passo, setPasso] = useState(1)
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})

  // Passo 1 — dados pessoais
  const [nome, setNome] = useState('')
  const [sobrenome, setSobrenome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  // Passo 2 — perfil profissional
  const [cidade, setCidade] = useState('')
  const [anosExp, setAnosExp] = useState('')
  const [equipe, setEquipe] = useState('')
  const [especialidades, setEspecialidades] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')

  // Passo 3 — plano
  const [planoSelecionado, setPlanoSelecionado] = useState('mensal')

  const validarPasso1 = () => {
    const novos = {}
    if (!nome.trim())   novos.nome   = 'Informe o nome'
    if (!email.trim())  novos.email  = 'Informe o e-mail'
    if (!senha.trim())  novos.senha  = 'Informe a senha'
    if (senha.length < 8) novos.senha = 'Mínimo 8 caracteres'
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
    if (passo < TOTAL_PASSOS) setPasso(p => p + 1)
  }

  const voltar = () => {
    if (passo > 1) setPasso(p => p - 1)
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
        anos_experiencia: parseInt(anosExp) || 0,
        tamanho_equipe:   parseInt(equipe)  || 1,
        especialidades: especialidades.split(',').map(s => s.trim()).filter(Boolean),
        cpf_cnpj: cpfCnpj.trim(),
      }

      const resposta = await authService.cadastrar(dados)

      // Faz login automático após cadastro
      await login(dados.email, senha)

      Alert.alert(
        'Conta criada!',
        'Bem-vindo à PinturaPro. Agora escolha seu plano para acessar as obras.',
        [{ text: 'OK' }]
      )
    } catch (err) {
      Alert.alert('Erro', err.mensagem || 'Não foi possível criar sua conta.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <SafeAreaView style={estilos.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={estilos.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Cabeçalho */}
          <TouchableOpacity style={estilos.btnVoltar} onPress={voltar}>
            <Text style={{ color: cores.textoMedio, fontSize: 16 }}>←</Text>
          </TouchableOpacity>

          <Text style={estilos.titulo}>
            {passo === 1 ? 'Criar\nsua conta'
              : passo === 2 ? 'Perfil\nprofissional'
              : 'Escolha\nseu plano'}
          </Text>
          <Text style={estilos.subtitulo}>
            {passo === 1 ? 'Passo 1 de 3 — dados pessoais'
              : passo === 2 ? 'Passo 2 de 3 — informações profissionais'
              : 'Passo 3 de 3 — assinatura'}
          </Text>

          <IndicadorPassos passo={passo} />

          {/* ── PASSO 1 ── */}
          {passo === 1 && (
            <View>
              <View style={estilos.duasColunas}>
                <Input
                  label="NOME"
                  placeholder="Primeiro nome"
                  value={nome}
                  onChangeText={setNome}
                  erro={erros.nome}
                  estilo={{ flex: 1 }}
                />
                <Input
                  label="SOBRENOME"
                  placeholder="Sobrenome"
                  value={sobrenome}
                  onChangeText={setSobrenome}
                  estilo={{ flex: 1 }}
                />
              </View>
              <Input
                label="E-MAIL"
                placeholder="seu@email.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                erro={erros.email}
              />
              <Input
                label="WHATSAPP"
                placeholder="(34) 99999-9999"
                value={telefone}
                onChangeText={setTelefone}
                keyboardType="phone-pad"
              />
              <View>
                <Input
                  label="SENHA"
                  placeholder="Mínimo 8 caracteres"
                  value={senha}
                  onChangeText={setSenha}
                  secureTextEntry={!mostrarSenha}
                  erro={erros.senha}
                />
                <TouchableOpacity
                  style={estilos.olhoBtn}
                  onPress={() => setMostrarSenha(!mostrarSenha)}
                >
                  <Text style={estilos.olhoTexto}>{mostrarSenha ? 'ocultar' : 'mostrar'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── PASSO 2 ── */}
          {passo === 2 && (
            <View>
              <Input
                label="CIDADE ONDE ATUA"
                placeholder="Ex: Uberlândia, MG"
                value={cidade}
                onChangeText={setCidade}
                erro={erros.cidade}
              />
              <View style={estilos.duasColunas}>
                <Input
                  label="ANOS DE EXPERIÊNCIA"
                  placeholder="Ex: 8"
                  value={anosExp}
                  onChangeText={setAnosExp}
                  keyboardType="numeric"
                  estilo={{ flex: 1 }}
                />
                <Input
                  label="TAMANHO DA EQUIPE"
                  placeholder="Ex: 4"
                  value={equipe}
                  onChangeText={setEquipe}
                  keyboardType="numeric"
                  estilo={{ flex: 1 }}
                />
              </View>
              <Input
                label="ESPECIALIDADES"
                placeholder="Ex: textura, epóxi, acabamento fino"
                value={especialidades}
                onChangeText={setEspecialidades}
              />
              <Input
                label="CPF / CNPJ"
                placeholder="000.000.000-00"
                value={cpfCnpj}
                onChangeText={setCpfCnpj}
                keyboardType="numeric"
                erro={erros.cpfCnpj}
              />
            </View>
          )}

          {/* ── PASSO 3 ── */}
          {passo === 3 && (
            <View>
              <Text style={estilos.planoSubtitulo}>
                Escolha o plano para acessar obras disponíveis:
              </Text>

              {/* Plano Mensal */}
              <TouchableOpacity
                style={[estilos.planoCard, planoSelecionado === 'mensal' && estilos.planoCardAtivo]}
                onPress={() => setPlanoSelecionado('mensal')}
                activeOpacity={0.8}
              >
                <View style={[estilos.planoRadio, planoSelecionado === 'mensal' && estilos.planoRadioAtivo]}>
                  {planoSelecionado === 'mensal' && <View style={estilos.planoRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.planoNome}>Plano Mensal</Text>
                  <Text style={estilos.planoDesc}>Acesso completo às obras disponíveis</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={estilos.planoPreco}>R$ 99,90</Text>
                  <Text style={estilos.planoPeriodo}>/mês</Text>
                </View>
              </TouchableOpacity>

              {/* Plano Anual */}
              <TouchableOpacity
                style={[estilos.planoCard, planoSelecionado === 'anual' && estilos.planoCardAtivo]}
                onPress={() => setPlanoSelecionado('anual')}
                activeOpacity={0.8}
              >
                <View style={{ position: 'absolute', top: -10, right: 14 }}>
                  <View style={estilos.planoDestaque}>
                    <Text style={estilos.planoDestaqueTexto}>Economize 2 meses</Text>
                  </View>
                </View>
                <View style={[estilos.planoRadio, planoSelecionado === 'anual' && estilos.planoRadioAtivo]}>
                  {planoSelecionado === 'anual' && <View style={estilos.planoRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.planoNome}>Plano Anual</Text>
                  <Text style={estilos.planoDesc}>Melhor custo-benefício</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={estilos.planoPreco}>R$ 83,25</Text>
                  <Text style={estilos.planoPeriodo}>/mês · R$ 999/ano</Text>
                </View>
              </TouchableOpacity>

              {/* Segurança */}
              <View style={estilos.segurancaBox}>
                <Text style={estilos.segurancaIcone}>🔒</Text>
                <Text style={estilos.segurancaTexto}>
                  Pagamento 100% seguro via Mercado Pago. Cancele quando quiser.
                </Text>
              </View>
            </View>
          )}

          {/* Botões de navegação */}
          <View style={estilos.acoesRow}>
            {passo < TOTAL_PASSOS ? (
              <BotaoPrimario titulo="Continuar →" onPress={avancar} />
            ) : (
              <BotaoPrimario
                titulo="Finalizar cadastro →"
                onPress={handleCadastrar}
                carregando={carregando}
              />
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: espacos.tela,
    paddingBottom: 40,
  },
  btnVoltar: {
    marginTop: 14,
    width: 36, height: 36,
    backgroundColor: cores.fundoElevado,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  titulo: {
    fontSize: 28, fontWeight: '700',
    color: cores.textoForte,
    letterSpacing: -0.5,
    lineHeight: 36,
    marginBottom: 6,
  },
  subtitulo: {
    fontSize: 13, color: cores.textoFraco,
    marginBottom: 20,
  },
  indicador: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 28,
  },
  indicadorDot: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: cores.fundoElevado,
  },
  indicadorDotAtivo: {
    width: 20, borderRadius: 3,
    backgroundColor: cores.primaria,
  },
  indicadorDotFeito: {
    backgroundColor: cores.sucesso,
  },
  duasColunas: {
    flexDirection: 'row',
    gap: 12,
  },
  olhoBtn: {
    position: 'absolute',
    right: 14, bottom: 27,
  },
  olhoTexto: { fontSize: 12, color: cores.textoFraco },
  planoSubtitulo: {
    fontSize: 13, color: cores.textoMedio,
    marginBottom: 16,
  },
  planoCard: {
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.grande,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  planoCardAtivo: {
    borderColor: cores.primaria,
    backgroundColor: cores.primariaSuave,
  },
  planoRadio: {
    width: 18, height: 18,
    borderRadius: 9,
    borderWidth: 0.5, borderColor: cores.borda,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  planoRadioAtivo: {
    borderColor: cores.primaria,
    backgroundColor: cores.primaria,
  },
  planoRadioDot: {
    width: 7, height: 7,
    borderRadius: 4,
    backgroundColor: '#0A0A0A',
  },
  planoNome: {
    fontSize: 14, fontWeight: '600',
    color: cores.textoForte, marginBottom: 2,
  },
  planoDesc: { fontSize: 11, color: cores.textoFraco },
  planoPreco: {
    fontSize: 15, fontWeight: '700',
    color: cores.sucesso,
  },
  planoPeriodo: { fontSize: 10, color: cores.textoFraco, textAlign: 'right' },
  planoDestaque: {
    backgroundColor: cores.primaria,
    borderRadius: raios.pill,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  planoDestaqueTexto: {
    fontSize: 10, fontWeight: '700',
    color: '#0A0A0A',
  },
  segurancaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: cores.fundoCard,
    borderWidth: 0.5, borderColor: cores.borda,
    borderRadius: raios.medio,
    padding: 12,
    marginTop: 4,
  },
  segurancaIcone: { fontSize: 14 },
  segurancaTexto: {
    flex: 1, fontSize: 11,
    color: cores.textoFraco, lineHeight: 17,
  },
  acoesRow: { marginTop: 24 },
})
