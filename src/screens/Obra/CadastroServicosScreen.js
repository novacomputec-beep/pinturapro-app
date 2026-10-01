import React, { useState, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario } from '../../components'
import api from '../../services/api'
import { comRetry } from '../../utils/rede'
import { useAuth } from '../../contexts/AuthContext'
import { mascararTelefone } from '../../utils/telefone'
import { CATEGORIAS_SERVICO, MAX_ESPECIALIDADES, rotuloComEmoji } from '../../utils/categorias'
import { ocultarConviteServicos } from '../../components/ConviteCadastroServicos'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

// "Cadastro de serviços": o profissional de OBRA (pintor/construtor) cria, com um toque,
// a conta irmã de reparador no mesmo e-mail. Nada é digitado — nome, e-mail, WhatsApp,
// cidade e a verificação de documentos vêm da conta atual e aparecem só para conferência.
// A única decisão é a lista de especialidades, que abre com Alvenaria marcada porque é
// por ela que a pessoa chegou aqui (convite do feed de obras).
//
// O servidor é quem copia os dados e cria a conta: POST /auth/contas/reparador recebe só
// as especialidades e devolve { conta: { id, tipo, nome }, aprovada } — SEM token. Não há
// como trocar de conta daqui: a sessão continua a de obras, e o caminho para a nova é sair
// e entrar de novo escolhendo "Serviços gerais e domésticos" no "Entrar como:".

const SLUG_ALVENARIA = 'alvenaria'

// Mensagens por `codigo` do 409 (mesma convenção do cadastro). Específicas desta tela: não
// há formulário para corrigir, então cada uma diz o que a pessoa PODE fazer a seguir.
const MSG_409 = {
  tipo_duplicado: 'Você já tem um cadastro de serviços com este e-mail. Saia da conta e entre de novo escolhendo "Serviços gerais e domésticos".',
  limite_contas: 'Este e-mail já atingiu o limite de cadastros por pessoa. Não é possível criar outro.',
  cpf_duplicado: 'Seu CPF já está em outro cadastro de serviços. Entre pelo login com o e-mail daquela conta.',
  email_duplicado: 'Este e-mail já está em outro cadastro de serviços. Entre pelo login escolhendo "Serviços gerais e domésticos".',
}
const msg409 = (codigo) => (typeof codigo === 'string' && Object.prototype.hasOwnProperty.call(MSG_409, codigo) ? MSG_409[codigo] : null)

const Linha = ({ label, valor }) => (
  <View style={estilos.linha}>
    <Text style={estilos.linhaLabel}>{label}</Text>
    <Text style={estilos.linhaValor}>{valor || '—'}</Text>
  </View>
)

export default function CadastroServicosScreen({ navigation }) {
  const { usuario } = useAuth()
  const [selecionadas, setSelecionadas] = useState([SLUG_ALVENARIA])
  const [carregando, setCarregando] = useState(false)
  const enviandoRef = useRef(false)
  const montadoRef = useRef(true)
  useEffect(() => () => { montadoRef.current = false }, [])

  const cheio = selecionadas.length >= MAX_ESPECIALIDADES
  // Atualização funcional, como na EspecialidadesScreen: o teto vale toque a toque.
  const alternar = (slug) => {
    setSelecionadas((atuais) => {
      if (atuais.includes(slug)) return atuais.filter((s) => s !== slug)
      if (atuais.length >= MAX_ESPECIALIDADES) return atuais
      return [...atuais, slug]
    })
  }

  // Só a verificação APROVADA da conta de obra vale para a irmã. Qualquer outro valor
  // (pendente, ausente, reprovado) é "em análise": a alegação mais fraca.
  const verificada = usuario?.verificacao_status === 'aprovado'
  const cidadeBairro = [usuario?.cidade, usuario?.bairro].filter(Boolean).join(' / ')

  const confirmar = async () => {
    if (enviandoRef.current) return
    if (!selecionadas.length) { Alert.alert('Especialidades', 'Escolha pelo menos uma especialidade para continuar.'); return }
    enviandoRef.current = true
    setCarregando(true)
    try {
      // comRetry como authService.cadastrar: a regra de quando um POST pode ser reenviado
      // mora lá (metodo/rota), não aqui.
      const resposta = await comRetry(() => api.post('/auth/contas/reparador', { especialidades: selecionadas }))
      // A conta existe: o convite do feed não tem mais o que convidar. Antes do alerta, para
      // a marca valer mesmo que a pessoa feche o app em cima dele.
      await ocultarConviteServicos(usuario?.id)
      if (!montadoRef.current) return
      // `aprovada` diz se a conta nova já nasce liberada (verificação herdada) ou se ainda
      // passa pela equipe; só a igualdade estrita com true promete o acesso imediato.
      const aprovada = resposta?.aprovada === true
      Alert.alert(
        '✅ Cadastro de serviços criado!',
        (aprovada
          ? 'Sua conta de serviços já está aprovada, com o mesmo e-mail e senha.'
          : 'Sua conta de serviços foi criada com o mesmo e-mail e senha e passará por uma breve análise.')
        + '\n\nPara usá-la, saia desta conta e entre de novo escolhendo "Serviços gerais e domésticos".',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
        { cancelable: false }
      )
    } catch (err) {
      console.log('[CadastroServicos] falha ao criar conta de reparador | status:', err?.status, '| code:', err?.code, '| codigo:', err?.codigo, '| msg:', err?.mensagem)
      // Já existia: é a mesma informação de "criada" para o convite — grava a marca.
      if (err?.status === 409 && err?.codigo === 'tipo_duplicado') await ocultarConviteServicos(usuario?.id)
      if (!montadoRef.current) return
      if (err?.status === 409) {
        Alert.alert('Não foi possível criar', msg409(err?.codigo) || err?.mensagem || 'Estes dados já estão em outro cadastro.')
      } else {
        Alert.alert('Erro', err?.mensagem || 'Não foi possível criar o cadastro de serviços. Tente novamente.')
      }
    } finally {
      enviandoRef.current = false
      if (montadoRef.current) setCarregando(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={estilos.voltarIcone}>←</Text>
        </TouchableOpacity>

        <Text style={estilos.titulo}>Cadastro{'\n'}de serviços</Text>
        <Text style={estilos.subtitulo}>Mesmo e-mail e senha da sua conta de obras. Confira os dados e escolha suas especialidades.</Text>

        <Text style={estilos.secao}>SEUS DADOS</Text>
        <View style={estilos.bloco}>
          <Linha label="Nome" valor={usuario?.nome} />
          <Linha label="E-mail" valor={usuario?.email} />
          <Linha label="WhatsApp" valor={usuario?.telefone ? mascararTelefone(usuario.telefone) : null} />
          <Linha label="Cidade/bairro" valor={cidadeBairro} />
          <View style={[estilos.linha, estilos.linhaUltima]}>
            <Text style={estilos.linhaLabel}>Documento e selfie</Text>
            <Text style={[estilos.linhaValor, verificada ? estilos.verificado : estilos.emAnalise]}>
              {verificada ? 'já verificados ✓' : 'em análise'}
            </Text>
          </View>
        </View>

        <Text style={estilos.secao}>ESPECIALIDADES</Text>
        <Text style={estilos.contador}>{selecionadas.length} de {MAX_ESPECIALIDADES} selecionadas</Text>
        <View style={estilos.grade}>
          {CATEGORIAS_SERVICO.map((c) => {
            const ativa = selecionadas.includes(c.slug)
            const bloqueada = cheio && !ativa
            return (
              <TouchableOpacity
                key={c.slug}
                style={[estilos.pill, ativa && estilos.pillAtiva, bloqueada && estilos.pillBloqueada]}
                onPress={() => alternar(c.slug)}
                disabled={bloqueada}
                activeOpacity={0.7}
              >
                <Text style={[estilos.pillTexto, ativa && estilos.pillTextoAtivo]}>{rotuloComEmoji(c)}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {!selecionadas.length && (
          <Text style={estilos.aviso}>Escolha pelo menos uma especialidade para continuar.</Text>
        )}

        <BotaoPrimario
          titulo="Confirmar e criar cadastro"
          onPress={confirmar}
          carregando={carregando}
          desabilitado={!selecionadas.length}
          estilo={{ marginTop: espacos.sm }}
        />
        <Text style={estilos.rodape}>Você continua com sua conta de obras. A conta de serviços é uma conta a mais, no mesmo e-mail.</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico },
  btnVoltar: { marginTop: 16, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  voltarIcone: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, lineHeight: 20, marginBottom: 24 },
  secao: { fontSize: 11, color: cores.textoForte, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  // Bloco de leitura, não campos: fundo de card e linhas separadas, para não parecer editável.
  bloco: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, paddingHorizontal: 16, marginBottom: 24 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: cores.bordaFraca },
  linhaUltima: { borderBottomWidth: 0 },
  linhaLabel: { fontSize: 12, color: cores.textoMedio },
  linhaValor: { fontSize: 14, color: cores.textoForte, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  verificado: { color: cores.sucesso },
  emAnalise: { color: cores.primaria },
  contador: { fontSize: 12, fontWeight: '600', color: cores.primaria, marginBottom: 12 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  // Duas colunas (48%), e não as três do cadastro de serviço: "🧱 Alvenaria – pequenos
  // reparos" é a pill mais longa da lista e é justamente a que abre marcada.
  pill: { width: '48%', alignItems: 'center', backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 8 },
  pillAtiva: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  pillBloqueada: { opacity: 0.35 },
  pillTexto: { fontSize: 12, color: cores.textoMedio, textAlign: 'center' },
  pillTextoAtivo: { color: cores.fundo, fontWeight: '600' },
  aviso: { fontSize: 12, color: cores.textoFraco, textAlign: 'center', marginBottom: espacos.sm },
  rodape: { fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 12, lineHeight: 18 },
})
