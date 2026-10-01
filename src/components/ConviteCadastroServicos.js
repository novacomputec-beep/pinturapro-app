import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { cores, raios } from '../utils/tema'

// Convite no topo do feed de obras: o profissional de obra (pintor/construtor) que ainda
// não tem conta de reparador é chamado a criar o "Cadastro de serviços" com os dados que
// já tem. Existe porque o rótulo "Alvenaria – pequenos reparos" passou a receber demanda
// de pedreiro no lado de SERVIÇOS, e quem sabe fazer isso está do lado de OBRA sem ver.
//
// Aparece quando as três coisas valem ao mesmo tempo:
//   1. a chave multiplas_contas do GET /config está ligada (sem ela o servidor recusa a
//      segunda conta, e convidar seria convidar para um erro);
//   2. a sessão é de prestador com tipo_prestador 'pintor';
//   3. a marca local desta conta NÃO está gravada.
// A marca é a ÚNICA forma de esconder o convite, e é por conta (id do usuário, como o
// BannerNotificacaoBloqueada). Três coisas a gravam, todas definitivas: o "✕", a criação
// da conta de reparador e o 409 tipo_duplicado (a conta já existia — mesma informação).
// O app não guarda a lista de contas do e-mail; quem sabe se a conta existe é o servidor.

const CHAVE = 'convite_cadastro_servicos_oculto'
const chave = (usuarioId) => `${CHAVE}:${usuarioId}`

// Exportado para a CadastroServicosScreen gravar a mesma marca ao criar (ou descobrir que
// já existia). Best-effort: falhar só faz o convite voltar na próxima abertura.
export const ocultarConviteServicos = async (usuarioId) => {
  if (usuarioId == null) return
  try { await AsyncStorage.setItem(chave(usuarioId), '1') } catch (e) {}
}

// GET /config uma vez por processo. A promise é guardada (não o valor) para duas montagens
// simultâneas dividirem a mesma requisição; falha zera para a próxima montagem tentar de
// novo, e enquanto isso a resposta é false — convite nenhum, que é o lado seguro.
let promessaConfig = null
const multiplasContasLigado = () => {
  if (!promessaConfig) {
    promessaConfig = api.get('/config')
      .then(resp => resp?.multiplas_contas === true)
      .catch(err => {
        console.log('[ConviteServicos] GET /config falhou, convite oculto | code:', err?.code)
        promessaConfig = null
        return false
      })
  }
  return promessaConfig
}

export default function ConviteCadastroServicos({ navigation }) {
  const { usuario } = useAuth()
  const [ligado, setLigado] = useState(false)
  // Começa true: só mostra depois de LER a marca, para o card nunca piscar para quem já
  // o fechou ou já criou a conta.
  const [oculto, setOculto] = useState(true)

  const ehPintor = usuario?.role === 'prestador' && usuario?.tipo_prestador === 'pintor'

  useEffect(() => {
    let vivo = true
    if (!ehPintor) return undefined
    multiplasContasLigado().then(v => { if (vivo) setLigado(v) })
    AsyncStorage.getItem(chave(usuario.id))
      .then(raw => { if (vivo) setOculto(raw === '1') })
      .catch(() => { if (vivo) setOculto(false) })
    return () => { vivo = false }
  }, [ehPintor, usuario?.id])

  // Relê a marca ao voltar do cadastro: a tela seguinte pode tê-la gravado, e o card
  // precisa sumir sem esperar uma remontagem do feed. O foco de navegação não chega a
  // este componente (ele vive no header da lista), então quem avisa é o listener da tela.
  useEffect(() => {
    if (!ehPintor || !navigation?.addListener) return undefined
    return navigation.addListener('focus', () => {
      AsyncStorage.getItem(chave(usuario.id)).then(raw => setOculto(raw === '1')).catch(() => {})
    })
  }, [ehPintor, usuario?.id, navigation])

  const dispensar = useCallback(() => {
    // Some já; a gravação falhar só faz o convite voltar na próxima abertura.
    setOculto(true)
    ocultarConviteServicos(usuario?.id)
  }, [usuario?.id])

  if (!ehPintor || !ligado || oculto) return null

  return (
    <View style={estilos.card}>
      <View style={estilos.topo}>
        <Text style={estilos.lampada}>💡</Text>
        <TouchableOpacity
          onPress={dispensar}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Fechar convite de cadastro de serviços"
        >
          <Text style={estilos.fechar}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={estilos.titulo}>Também faz pequenos reparos?</Text>
      <Text style={estilos.texto}>Tem cliente procurando em Serviços:</Text>
      <View style={estilos.chip}>
        <Text style={estilos.chipTexto}>🧱 Alvenaria – pequenos reparos</Text>
      </View>
      <Text style={estilos.texto}>Seus dados já vêm preenchidos: é só confirmar a especialidade e começar a receber esses pedidos também.</Text>
      <TouchableOpacity style={estilos.botao} onPress={() => navigation.navigate('CadastroServicos')} activeOpacity={0.85}>
        <Text style={estilos.botaoTexto}>Criar cadastro de serviços</Text>
      </TouchableOpacity>
    </View>
  )
}

const estilos = StyleSheet.create({
  // Azul-escuro da arte: o par infoSuave/infoBorda sobre o fundo do app dá o mesmo tom, e
  // o laranja do botão é a primária de sempre — o card informa, o botão age.
  card: { backgroundColor: cores.infoSuave, borderWidth: 1, borderColor: cores.infoBorda, borderRadius: raios.grande, padding: 16, marginBottom: 12 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  lampada: { fontSize: 24 },
  fechar: { fontSize: 16, color: cores.textoMedio, fontWeight: '700' },
  titulo: { fontSize: 16, fontWeight: '700', color: cores.textoForte, marginBottom: 6 },
  texto: { fontSize: 13, color: cores.textoForte, opacity: 0.85, lineHeight: 19, marginBottom: 8 },
  chip: { alignSelf: 'flex-start', backgroundColor: cores.primariaSuave, borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 10 },
  chipTexto: { fontSize: 13, fontWeight: '700', color: cores.primaria },
  botao: { backgroundColor: cores.primaria, borderRadius: raios.medio, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  botaoTexto: { fontSize: 14, fontWeight: '700', color: '#0A0A0A' },
})
