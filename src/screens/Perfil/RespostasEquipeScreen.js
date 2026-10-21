import React, { useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, RefreshControl, ActivityIndicator, Linking, Alert
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import * as Notifications from 'expo-notifications'
import api from '../../services/api'
import { comRetry } from '../../utils/rede'
import { useAuth } from '../../contexts/AuthContext'
import { Separador } from '../../components'
import BannerErroCarregamento from '../../components/BannerErroCarregamento'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

// Caixa de entrada das respostas da equipe (GET /respostas-equipe). SÓ leitura: a API não
// tem endpoint de réplica do usuário, e esta tela não tem campo de resposta de propósito —
// quem quer continuar a conversa manda outra sugestão pelo botão 💡 do Perfil (rodapé).
//
// Cada linha traz a pergunta copiada (sugestão ou pedido de suporte), a resposta e um
// atalho opcional (`acao`), que vira um botão laranja no fim do card.

// dd/MM, como o formatarHora dos detalhes (DetalheReparoScreen:89). A linha só traz
// `criada_em` (a data da resposta): a sugestão original não vem com data própria, então o
// cabeçalho "Você perguntou" usa a mesma data — é a única que existe na resposta.
const formatarDiaMes = (d) => {
  if (!d) return ''
  const x = new Date(d)
  if (isNaN(x.getTime())) return ''
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
}

export default function RespostasEquipeScreen({ navigation }) {
  const { usuario, garantirPermissaoConcedida, registrarPushToken } = useAuth()
  const [respostas, setRespostas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState(null)
  // Ids já enviados a POST /lida nesta montagem: o foco refaz o GET, e sem isto cada
  // volta à tela repetiria o POST de toda linha que ainda não voltou marcada.
  const marcadasRef = useRef(new Set())

  // "Mostrada = lida": assim que a lista carrega, toda linha sem lida_em é marcada. A
  // rota é idempotente (COALESCE preserva a primeira leitura), por isso { timeout,
  // persistir } como no bloqueio de prestador — repetir leva ao mesmo estado. Falha só
  // loga: a leitura é um registro, não uma ação que a pessoa esteja esperando.
  const marcarLidas = (lista) => {
    lista.forEach((r) => {
      if (r.lida_em || marcadasRef.current.has(r.id)) return
      marcadasRef.current.add(r.id)
      comRetry(() => api.post(`/respostas-equipe/${r.id}/lida`), { timeout: true, persistir: true })
        .catch((err) => {
          marcadasRef.current.delete(r.id)
          console.log('[RespostasEquipe] falha ao marcar lida | id:', r.id, '| status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
        })
    })
  }

  const buscar = async () => {
    try {
      const data = await comRetry(() => api.get('/respostas-equipe'))
      const lista = data.respostas || []
      setRespostas(lista)
      setErro(null)
      marcarLidas(lista)
    } catch (err) {
      console.log('[RespostasEquipe] falha ao carregar | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      setErro(err.mensagem || 'Não foi possível carregar as respostas da equipe.')
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscar() }, []))

  const onRefresh = () => { setAtualizando(true); buscar() }

  // Mesmo fluxo do item "🔔 Ativar notificações" do Perfil (PerfilScreen.handleAtivarNotificacoes):
  // consulta ao vivo, bloqueio permanente manda às Configurações, e só garantirPermissaoConcedida
  // dispara o diálogo do SO — registrarPushToken vem depois do "sim".
  const ativarNotificacoes = async () => {
    let estado = null
    try { estado = await Notifications.getPermissionsAsync() } catch (err) {
      console.log('[RespostasEquipe] falha ao consultar permissão | msg:', err.message)
    }
    if (estado?.granted) {
      Alert.alert('Notificações ativadas', 'Você já recebe os avisos do ProTudo neste aparelho.')
      return
    }
    if (estado?.canAskAgain === false) {
      Alert.alert(
        'Notificações bloqueadas',
        'O aviso foi bloqueado nas configurações do aparelho, e só por lá é possível liberar.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Abrir Configurações', onPress: () => Linking.openSettings() },
        ],
      )
      return
    }
    const concedida = await garantirPermissaoConcedida()
    if (concedida) {
      await registrarPushToken().catch((err) => {
        console.log('[RespostasEquipe] falha ao registrar push | msg:', err?.message)
      })
    }
  }

  // Aba de cadastro do DONO. Varia com o navegador montado (AppNavigator): dono_reparo tem
  // "Novo Reparo", dono_obra tem "Nova Obra". Prestador não cadastra serviço — para ele o
  // atalho não existe (null = botão não renderiza), em vez de um navigate que cai no catch.
  const ehDono = usuario?.role === 'dono_obra'
  const abaNovoServico = !ehDono ? null
    : usuario?.tipo_dono === 'reparo' ? 'Novo Reparo'
    : usuario?.tipo_dono === 'pintura' ? 'Nova Obra'
    : null

  const acaoDoItem = (acao) => {
    if (acao === 'novo_servico') {
      if (!abaNovoServico) return null
      return { rotulo: '➕ Abrir “Novo serviço”', onPress: () => navigation.navigate(abaNovoServico) }
    }
    if (acao === 'completar_perfil') {
      return { rotulo: '👤 Completar meu perfil', onPress: () => navigation.navigate('EditarPerfil') }
    }
    if (acao === 'ativar_notificacoes') {
      return { rotulo: '🔔 Ativar notificações', onPress: ativarNotificacoes }
    }
    return null
  }

  const renderItem = ({ item }) => {
    const dia = formatarDiaMes(item.criada_em)
    const acao = acaoDoItem(item.acao)
    return (
      <View style={estilos.card}>
        {!!item.pergunta && (
          <>
            <Text style={estilos.perguntaLabel}>Você perguntou{dia ? ` · ${dia}` : ''}</Text>
            <Text style={estilos.perguntaTexto}>{item.pergunta}</Text>
            <Separador estilo={{ marginVertical: 12 }} />
          </>
        )}
        <Text style={estilos.respostaLabel}>💬 EQUIPE PROTUDO{dia ? ` · ${dia}` : ''}</Text>
        <Text style={estilos.respostaTexto}>{item.resposta}</Text>
        {acao && (
          <TouchableOpacity style={estilos.btnAcao} onPress={acao.onPress} activeOpacity={0.85}>
            <Text style={estilos.btnAcaoTexto}>{acao.rotulo}</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  const Cabecalho = (
    <View style={estilos.header}>
      <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
        <Text style={estilos.btnVoltarTexto}>←</Text>
      </TouchableOpacity>
      <Text style={estilos.titulo}>Respostas da equipe</Text>
      <Text style={estilos.subtitulo}>O que a equipe ProTudo respondeu às suas mensagens</Text>
      <BannerErroCarregamento mensagem={erro} onRetry={buscar} />
    </View>
  )

  const Rodape = (
    <Text style={estilos.rodape}>Tem outra dúvida? Envie pelo botão 💡 Sugestões, no seu Perfil.</Text>
  )

  if (carregando) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <FlatList
        data={respostas}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={Cabecalho}
        ListFooterComponent={Rodape}
        ListEmptyComponent={
          <View style={estilos.vazio}>
            <Text style={estilos.vazioIcone}>💬</Text>
            <Text style={estilos.vazioTitulo}>Nenhuma resposta ainda</Text>
            <Text style={estilos.vazioSub}>Quando a equipe responder uma sugestão ou pedido de suporte seu, a resposta aparece aqui.</Text>
          </View>
        }
        contentContainerStyle={[estilos.lista, larguraMaxima]}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container:     { flex: 1, backgroundColor: cores.fundo },
  lista:         { paddingHorizontal: espacos.tela, paddingBottom: 32 + alturas.barraServico },
  header:        { paddingTop: 8, paddingBottom: 16 },
  btnVoltar:     { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  btnVoltarTexto:{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, includeFontPadding: false },
  titulo:        { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  subtitulo:     { fontSize: 13, color: cores.textoFraco, marginTop: 2 },
  card:          { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 16 },
  perguntaLabel: { fontSize: 10, color: cores.textoMutado, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  perguntaTexto: { fontSize: 13, color: cores.textoMedio, fontStyle: 'italic', lineHeight: 19 },
  respostaLabel: { fontSize: 11, fontWeight: '700', color: cores.primaria, letterSpacing: 0.5, marginBottom: 6 },
  respostaTexto: { fontSize: 14, color: cores.textoForte, lineHeight: 21 },
  btnAcao:       { marginTop: 14, backgroundColor: cores.primaria, borderRadius: raios.medio, paddingVertical: 12, alignItems: 'center', width: '100%' },
  btnAcaoTexto:  { fontSize: 13, fontWeight: '700', color: '#0A0A0A' },
  rodape:        { fontSize: 12, color: cores.textoFraco, textAlign: 'center', lineHeight: 18, marginTop: 24, paddingHorizontal: 12 },
  vazio:         { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  vazioIcone:    { fontSize: 48, marginBottom: 16 },
  vazioTitulo:   { fontSize: 16, fontWeight: '600', color: cores.textoForte, marginBottom: 8 },
  vazioSub:      { fontSize: 13, color: cores.textoFraco, textAlign: 'center', lineHeight: 20 },
})
