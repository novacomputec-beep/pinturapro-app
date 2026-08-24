import 'react-native-gesture-handler'
import React, { useRef, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Linking, Alert, Image } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import * as Notifications from 'expo-notifications'
import { useAuth } from '../contexts/AuthContext'
import { cores, raios, alturas } from '../utils/tema'
import { TelaAviso, BotaoPrimario } from '../components'
import { Feather } from '@expo/vector-icons'
import api from '../services/api'
import { navigationRef } from './navigationRef'
import { avatar } from '../utils/imagemOtimizada'
import CelebracaoMatchHost from '../components/CelebracaoMatchHost'
import SoftAskNotificacao from '../components/SoftAskNotificacao'
import RetomadaMatchHost from '../components/RetomadaMatchHost'
import BoasVindasPrestadorScreen from '../screens/BoasVindasPrestadorScreen'

// Auth
import SplashScreen        from '../screens/Auth/SplashScreen'
import LoginScreen         from '../screens/Auth/LoginScreen'
import CadastroScreen      from '../screens/Auth/CadastroScreen'
import EsqueciSenhaScreen  from '../screens/Auth/EsqueciSenhaScreen'
import RedefinirSenhaScreen from '../screens/Auth/RedefinirSenhaScreen'
import TermosScreen        from '../screens/Auth/TermosScreen'
import PrivacidadeScreen   from '../screens/Auth/PrivacidadeScreen'

// App — Pintor
import FeedObrasScreen     from '../screens/Obra/FeedObrasScreen'
import DetalheObraScreen   from '../screens/Obra/DetalheObraScreen'
import ContratosScreen     from '../screens/Contratos/ContratosScreen'
import ContratosFinalizadosScreen from '../screens/Contratos/ContratosFinalizadosScreen'
import MensagensScreen     from '../screens/Mensagens/MensagensScreen'
import PerfilScreen        from '../screens/Perfil/PerfilScreen'
import EditarPerfilScreen  from '../screens/Perfil/EditarPerfilScreen'
import AlterarSenhaScreen  from '../screens/Perfil/AlterarSenhaScreen'
import SugestoesScreen     from '../screens/Perfil/SugestoesScreen'
import EspecialidadesScreen from '../screens/Perfil/EspecialidadesScreen'
import AvaliacoesRecebidasScreen from '../screens/Perfil/AvaliacoesRecebidasScreen'

// App — Prestador
import FeedReparosScreen      from '../screens/Reparos/FeedReparosScreen'
import DetalheReparoScreen    from '../screens/Reparos/DetalheReparoScreen'
import MeusInteressesScreen   from '../screens/Reparos/MeusInteressesScreen'

// App — Dono de Obra
import MinhasObrasScreen      from '../screens/DonoObra/MinhasObrasScreen'
import CadastrarObraScreen    from '../screens/DonoObra/CadastrarObraScreen'
import CadastrarReparoScreen  from '../screens/DonoObra/CadastrarReparoScreen'

const Stack                = createNativeStackNavigator()
const Tab                  = createBottomTabNavigator()
const FeedStack            = createNativeStackNavigator()
const ReparoStack          = createNativeStackNavigator()
const DonoStack            = createNativeStackNavigator()
const PerfilStack          = createNativeStackNavigator()
const NovoReparoStack      = createNativeStackNavigator()
const MeusReparosStack     = createNativeStackNavigator()
const NovaObraStack        = createNativeStackNavigator()
const MinhasObrasStack     = createNativeStackNavigator()
const MeusInteressesStack  = createNativeStackNavigator()
const MinhasObrasInteresseStack = createNativeStackNavigator()
const ContratosFinObraStack     = createNativeStackNavigator()
const ContratosFinReparoStack   = createNativeStackNavigator()
const ContratosFinDonoReparoStack = createNativeStackNavigator()
const ContratosFinDonoObraStack   = createNativeStackNavigator()
const DonoReparoTab        = createBottomTabNavigator()
const DonoObraTab          = createBottomTabNavigator()

export { navigationRef }

// Contexto do usuário atual para roteamento de notificações ciente do papel/subtipo.
// Os nomes de aba variam por navegador montado (pintor vs reparador vs dono), então
// resolvemos o destino com base neste contexto antes de navegar.
let usuarioContexto = null
export const setUsuarioContexto = (u) => { usuarioContexto = u }

const navegarParaNotificacao = (data) => {
  if (!navigationRef.current || !data?.tipo) return
  const u = usuarioContexto || {}
  const usaTabsPintor    = u.role === 'assinante' || (u.role === 'prestador' && u.tipo_prestador === 'pintor')
  const usaTabsReparador = u.role === 'prestador' && u.tipo_prestador !== 'pintor'
  const ehPrestador      = usaTabsPintor || usaTabsReparador
  const ehDonoReparo     = u.role === 'dono_obra' && u.tipo_dono === 'reparo'
  // Donos com navegador de abas (reparo/pintura) possuem a aba "Contratos Finalizados".
  // O fallback (tipo_dono indefinido) usa um stack sem essa aba.
  const ehDonoComAba     = u.role === 'dono_obra' && (u.tipo_dono === 'reparo' || u.tipo_dono === 'pintura')

  // Aba de itens em andamento conforme o navegador montado para este usuário
  const tabEmAndamento =
    usaTabsPintor    ? 'Minhas Obras' :
    usaTabsReparador ? 'Meus Reparos' :
    ehDonoReparo     ? 'Meus Reparos' :
                       'Minhas Obras'   // dono de obra (pintura/fallback)

  const navegar = (nome) => navigationRef.current.navigate(nome)
  try {
    // Alertas de expiração (obra/reparo): cobrem por prefixo TODOS os marcos
    // (…_6h/_60/_30/_15) e o legado …_sem_interessados — deep-link direto ao detalhe.
    // Só navega com o id presente; sem id, cai no switch (que não trata estes tipos)
    // e não faz nada, em vez de abrir o detalhe com id indefinido.
    if (data.tipo.startsWith('obra_expirando') && data.obra_id) {
      navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } }, initial: false })
      return
    }
    if (data.tipo.startsWith('reparo_expirando') && data.reparo_id) {
      navigationRef.current.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } }, initial: false })
      return
    }
    switch (data.tipo) {
      // Feed
      case 'nova_obra':
        navegar('Obras'); break
      case 'novo_reparo':
        navegar('Reparos'); break
      // Mensagens
      case 'nova_mensagem':
        navegar('Mensagens'); break
      // Itens finalizados (encerrados): prestador e dono (com aba) veem em "Contratos Finalizados";
      // o dono fallback (sem a aba) cai na lista em andamento.
      case 'obra_encerrada':
      case 'reparo_encerrado':
        navegar((ehPrestador || ehDonoComAba) ? 'Contratos Finalizados' : tabEmAndamento); break
      // Match fechado (candidatura/proposta aceita) — deep-link direto p/ o detalhe.
      // 'match_obra'/'match_reparo' são o MESMO fato com outro nome (o par fechou) e por
      // isso compartilham o destino: um id só, da vertical certa, sem probe cruzado.
      case 'candidatura_aceita':
      case 'match_obra':
        if (data.obra_id) navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } }, initial: false })
        else navegar(tabEmAndamento)
        break
      case 'interesse_aceito':
      case 'match_reparo':
        if (data.reparo_id) navigationRef.current.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } }, initial: false })
        else navegar(tabEmAndamento)
        break
      // Proposta NOVA recebida (dono) — deep-link direto ao detalhe, que é onde vive a
      // lista de candidatos/interessados. Cair só na aba deixava o dono numa lista cujo
      // único indício é o contador "N profissional(is) interessado(s)": não diz QUAL
      // demanda recebeu a proposta nem leva até ela. Mesma forma de 'candidatura_aceita'.
      case 'nova_candidatura':
        if (data.obra_id) navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } }, initial: false })
        else navegar(tabEmAndamento)
        break
      case 'novo_interesse':
        if (data.reparo_id) navigationRef.current.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } }, initial: false })
        else navegar(tabEmAndamento)
        break
      // Contraproposta do dono — deep-link direto ao detalhe (reparo ou obra) p/ o prestador responder
      case 'contraproposta_dono':
        if (data.reparo_id) navigationRef.current.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } }, initial: false })
        else if (data.obra_id) navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } }, initial: false })
        else navegar(tabEmAndamento)
        break
      // Demanda próxima: quem recebe ainda NÃO está envolvido com ela, então o item vive
      // no feed de disponíveis — e é por lá que se chega ao detalhe. Mandar para
      // "Meus Reparos"/"Minhas Obras" cairia numa lista onde a demanda não aparece.
      case 'reparo_proximo':
        if (data.reparo_id) navigationRef.current.navigate('Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } }, initial: false })
        else navegar('Reparos')
        break
      case 'obra_proxima':
        if (data.obra_id) navigationRef.current.navigate('Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } }, initial: false })
        else navegar('Obras')
        break
      // Resultado da moderação da obra — deep-link ao detalhe para o DONO. Em 'obra_recusada'
      // este é o único caminho até ela: a obra recusada não aparece em "Minhas Obras", então
      // sem o id o dono não tem como abrir o motivo da recusa.
      case 'obra_aprovada':
      case 'obra_recusada':
        if (data.obra_id) navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } }, initial: false })
        else navegar(tabEmAndamento)
        break
      // Faltam 5 min no cronômetro do match — dono_reparo vai direto ao detalhe p/ aumentar prazo ou aguardar
      case 'reparo_5min_restantes':
        if (data.reparo_id) navigationRef.current.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } }, initial: false })
        else navegar(tabEmAndamento)
        break
      // Mesmo marco do lado da obra: o dono decide entre aumentar o prazo e esperar, e as
      // duas coisas estão no detalhe.
      case 'obra_5min_restantes':
        if (data.obra_id) navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } }, initial: false })
        else navegar(tabEmAndamento)
        break
      // Negociação da CHEGADA (janela proposta → aceita/recusada → chegada declarada →
      // confirmada) e o match expirado. Todos vão ao DETALHE da demanda, porque é lá que
      // cada lado age: o dono responde à janela, confirma a chegada ou aumenta o prazo; o
      // profissional propõe outra janela depois de uma recusa. Cair na lista deixaria a
      // pessoa a um toque da ação sem dizer QUAL item está esperando por ela — o mesmo
      // motivo que já tirou 'nova_candidatura' da lista.
      // Quem escolhe a aba é o par obra/reparo, não o papel: 'Meus Reparos' atende
      // reparador E dono_reparo, 'Minhas Obras' atende pintor E dono_obra. Mesma forma de
      // 'contraproposta_dono', que também chega aos dois lados.
      case 'chegada_prevista':
      case 'chegada_prevista_pendente':
      case 'chegada_prevista_aceita':
      case 'chegada_prevista_recusada':
      case 'chegada_declarada':
      case 'chegada_confirmada':
      // match_expirado passava meses sem rota, caindo no default: o dono era avisado de
      // que o profissional não chegou e o toque não abria nada. O detalhe é onde ele
      // aumenta o prazo ou espera um novo interessado.
      case 'match_expirado':
      // Encerramento em DUAS etapas: quem recebe este aviso é a OUTRA parte, e o botão que
      // confirma vive no detalhe — é lá que rotuloEncerrar vira "✅ Confirmar encerramento".
      // Chega aos dois lados e nos dois tipos de demanda, como 'contraproposta_dono'.
      case 'encerramento_solicitado':
      // Baixo engajamento: o dono é avisado de que a demanda atraiu pouca gente. O que dá
      // para fazer a respeito — rever o valor, aumentar o prazo, reler a descrição — está
      // todo no detalhe; a lista só diria que a demanda continua lá.
      case 'baixo_engajamento':
      case 'baixo_engajamento_reparo':
      // Negociação de TEMPO (pedir mais minutos, perguntar quantos, aceitar, recusar) e a
      // contraproposta de valor. Estavam na lista, que é o pior destino possível para eles:
      // cada um destes avisos existe porque FALTA uma resposta, e os botões que respondem
      // ("✅ Aceito"/"❌ Não aceito", "Informar tempo", aceitar/recusar a contra-oferta)
      // vivem TODOS no detalhe. Cair na lista deixava a pessoa a um toque da ação sem dizer
      // qual demanda a espera — o mesmo motivo que já tirou 'nova_candidatura' de lá.
      // Entram no probe reparo_id → obra_id porque chegam nas duas verticais e aos dois
      // lados: quem pede tempo é o profissional, quem responde é o dono.
      case 'pedido_tempo':
      case 'perguntar_tempo':
      case 'aprovar_tempo':
      case 'tempo_aceito':
      case 'tempo_recusado':
      case 'contra_oferta':
        if (data.reparo_id) navigationRef.current.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: data.reparo_id } }, initial: false })
        else if (data.obra_id) navigationRef.current.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: data.obra_id } }, initial: false })
        else navegar(tabEmAndamento)
        break
      // Estado da CONTA, não de uma demanda: o que se faz a respeito (ler o motivo,
      // regularizar, conferir a assinatura) vive no Perfil, e nenhum id de obra/reparo
      // acompanha esses avisos. O fallback do dono sem abas não tem a aba Perfil — mesma
      // ressalva de 'obra_encerrada' acima —, então cai na lista em andamento.
      case 'conta_suspensa':
      case 'conta_liberada':
      // Verificação de documentos e assinatura: mesmo destino e mesma razão — o que se faz
      // a respeito (reenviar documento, renovar, pagar) está no Perfil, e nenhum destes
      // avisos traz id de demanda para deep-link.
      // Ressalva estrutural: o Stack raiz monta UM ramo só (:693). Enquanto a assinatura
      // não está 'ativa', quem está montado é Verificacao ou Pagamento e as abas NÃO
      // existem — então 'Perfil' não resolve e o navigate cai no catch, que loga. Não há
      // perda: nesses estados a tela de bloqueio já é exatamente a que trata o assunto.
      // Os casos que chegam com as abas montadas ('verificacao_aprovada',
      // 'assinatura_vence_amanha') acertam o Perfil, que é onde vive o botão de renovar.
      case 'verificacao_aprovada':
      case 'verificacao_reprovada':
      case 'assinatura_expirada':
      case 'assinatura_vence_amanha':
        navegar((ehPrestador || ehDonoComAba) ? 'Perfil' : tabEmAndamento); break
      // Boas-vindas não pede resposta: pede começar a usar. O prestador cai no feed de
      // demandas disponíveis, que é onde ele age; o dono cai na própria lista. (Se o flag
      // de boas-vindas ainda estiver ligado, quem está montado é BoasVindasPrestador e o
      // navigate não resolve — mas aí a tela em foco já é a do próprio aviso.)
      case 'boas_vindas':
        navegar(usaTabsPintor ? 'Obras' : usaTabsReparador ? 'Reparos' : tabEmAndamento); break
      // Desfechos que NÃO pedem ação: a proposta foi recusada, ou aprovada pelo endpoint
      // legado. Não há botão a apertar no detalhe, e abrir a demanda de quem acabou de ser
      // recusado é insistir onde já não há o que fazer — a lista mostra o novo estado e
      // deixa a pessoa seguir para a próxima.
      case 'interesse_recusado':
      case 'candidatura_recusada':
      case 'candidatura_aprovada':
        navegar(tabEmAndamento); break
      // Tipo desconhecido: não navega, mas DEIXA RASTRO. 'reparo_proximo' e 'obra_proxima'
      // passaram meses sem rota nenhuma e ninguém percebeu, porque cair fora do switch era
      // silencioso — o toque simplesmente não fazia nada. Log, não erro ao usuário.
      default:
        console.log('[notificacao] tipo sem rota | tipo:', data.tipo, '| payload:', JSON.stringify(data))
    }
  } catch (err) {
    console.log('Erro ao navegar para notificação:', err)
  }
}

// A aba Perfil mostra a FOTO do usuário no lugar do boneco genérico: é a única aba que
// aponta para algo que é DELE, e o próprio rosto se reconhece antes de qualquer ícone.
// Serve as quatro tab bars do app (pintor, prestador, dono de reparo, dono de obra) —
// todas passam por aqui, então a foto entra nas quatro de uma vez.
const TabIcone = ({ nome, focado }) => {
  const mapa = { Obras: '🏗️', 'Contratos Finalizados': '✅', Mensagens: '💬', Perfil: '👤', Reparos: '🔧', 'Novo Reparo': '➕', 'Meus Reparos': '📋', 'Nova Obra': '🖌️', 'Minhas Obras': '📋' }
  const { usuario } = useAuth()
  // Rede de segurança da foto, como nos cards do feed: a URL pode não renderizar (link
  // quebrado, mídia removida, transformação recusada). Sem isto sobraria um círculo vazio.
  const [fotoFalhou, setFotoFalhou] = React.useState(false)
  const foto = nome === 'Perfil' ? usuario?.foto_url : null
  // Zera a marca de falha quando a foto muda (upload novo, troca de conta): sem isto a
  // aba ficaria presa no emoji até o app reiniciar, mesmo com uma URL boa no lugar.
  React.useEffect(() => { setFotoFalhou(false) }, [foto])

  // Sem foto (conta nova) ou foto que falhou: cai no ícone de sempre, com o mesmo
  // tratamento de cor/opacidade das outras abas.
  if (foto && !fotoFalhou) {
    return (
      <Image
        source={{ uri: avatar(foto) }}
        style={{
          width: 24, height: 24, borderRadius: 12,
          // Uma foto não aceita o tint que marca as outras abas como ativas, então quem
          // assume o papel é o anel — mesma primária, mesma leitura, só que no perímetro.
          // A borda existe nos DOIS estados e só troca de cor: como o RN a desenha por
          // dentro da caixa, manter a largura impede a foto de mudar de tamanho ao focar.
          borderWidth: 2,
          borderColor: focado ? cores.primaria : 'transparent',
          // 0.5, e não os 0.3 dos emojis: um rosto naquele nível vira mancha sobre o
          // fundo escuro. Continua claramente abaixo do estado ativo, que é o que importa.
          opacity: focado ? 1 : 0.5,
        }}
        onError={() => setFotoFalhou(true)}
      />
    )
  }
  return (
    <Text style={{ fontSize: 20, opacity: focado ? 1 : 0.3, color: focado ? cores.primaria : cores.textoFraco }}>
      {mapa[nome] || '●'}
    </Text>
  )
}

function PagamentoPendenteScreen() {
  const { logout, usuario, assinatura, revalidarSessao } = useAuth()
  const [link, setLink] = React.useState(null)
  const [carregando, setCarregando] = React.useState(true)
  const [verificando, setVerificando] = React.useState(false)
  const [erro, setErro] = React.useState(null)
  const mountedRef = React.useRef(true)
  React.useEffect(() => () => { mountedRef.current = false }, [])

  const buscarLink = React.useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const plano = assinatura?.plano || 'mensal'
      // Timeout de 20s: se a requisição travar sem resolver/rejeitar, força a rejeição
      // para que o catch rode e a tela não fique presa em "Gerando link...".
      // SEM comRetry, de propósito: este POST cria um checkout pagável. O retry de rede
      // parte do princípio de que a requisição não chegou ao servidor, mas o caso oposto
      // — chegou, o checkout foi criado e só a RESPOSTA se perdeu — é indistinguível do
      // lado do app, e nele a repetição gera um segundo link cobrável. Uma tentativa só;
      // falhando, o usuário decide pelo botão "Tentar novamente".
      const pagamento = await Promise.race([
        api.post('/pagamentos/criar-assinatura', { plano }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout_criar_assinatura')), 20000))
      ])
      if (pagamento.init_point) {
        if (mountedRef.current) setLink(pagamento.init_point)
        Linking.openURL(pagamento.init_point).catch(err => console.log('[AppNavigator] falha ao abrir URL de pagamento | msg:', err.message))
      } else {
        if (mountedRef.current) setErro('Link de pagamento não retornado. Toque em "Tentar novamente".')
      }
    } catch (err) {
      console.log('[AppNavigator] falha ao buscar link de pagamento | status:', err.status, '| code:', err.code, '| msg:', err.mensagem || err.message)
      const msg = err?.mensagem || err?.erro || err?.message || 'Não foi possível gerar o link de pagamento.'
      if (mountedRef.current) setErro(msg)
    } finally {
      if (mountedRef.current) setCarregando(false)
    }
  }, [assinatura?.plano])

  React.useEffect(() => { buscarLink() }, [])

  // "Já paguei — verificar acesso" (tela de pagamento). Sempre dá feedback: revalida a
  // sessão e decide a mensagem pelo status REAL de assinatura devolvido por GET /auth/perfil
  // (ativa | pendente_verificacao | outro), nunca por suposição. Nunca um no-op silencioso.
  const verificarPagamento = async () => {
    setVerificando(true)
    try {
      // Refresh COMPLETO da sessão (boas-vindas + flags + push), não só usuario/assinatura.
      const { assinatura: a } = await revalidarSessao()
      const status = a?.status
      if (status === 'ativa') {
        // Aprovado: o AppNavigator troca de tela automaticamente (o app abre). O próprio
        // avanço é o feedback — não exibimos alerta para não sobrepor a transição.
        return
      }
      if (status === 'pendente_verificacao') {
        Alert.alert(
          'Cadastro em análise',
          'Seu cadastro está em análise. Assim que for aprovado (em até 1 hora), seu acesso será liberado.'
        )
        return
      }
      // Qualquer outro status (expirada, cancelada, pendente, sem assinatura): pagamento
      // ainda não confirmado pela plataforma.
      Alert.alert(
        'Pagamento ainda não confirmado',
        'Ainda não identificamos seu pagamento. Se você acabou de pagar, aguarde alguns minutos e toque novamente em "Já paguei — verificar acesso".'
      )
    } catch (err) {
      console.log('[AppNavigator] falha ao verificar pagamento | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert(
        'Não foi possível verificar',
        'Tivemos um problema ao verificar seu acesso. Verifique sua conexão e tente novamente.'
      )
    } finally { setVerificando(false) }
  }

  const valorMensal = assinatura?.valor_mensal
    ? `R$ ${Number(assinatura.valor_mensal).toFixed(2).replace('.', ',')}`
    : usuario?.role === 'prestador' ? 'R$ 49,90' : 'R$ 99,90'

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: cores.fundo }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <TelaAviso
          icone={<Feather name="credit-card" size={34} color={cores.primaria} />}
          corIcone="primaria"
          titulo={assinatura?.status === 'expirada' ? 'Renove sua assinatura' : 'Finalize seu pagamento'}
        >
          <Text style={{ fontSize: 22, fontWeight: '700', color: cores.primaria, marginBottom: 24 }}>
            {valorMensal}/mês
          </Text>

          {carregando && (
            <Text style={{ fontSize: 14, color: cores.textoFraco, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              Gerando link de pagamento...
            </Text>
          )}

          {/* perigoSuave/perigo no lugar do #3a1a1a / #f4433644 / #f44336 que estavam
              cravados aqui — era o único ponto das três telas fora da paleta. */}
          {erro && !carregando && (
            <View style={{ backgroundColor: cores.perigoSuave, borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.medio, padding: 14, width: '100%', marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: cores.perigo, textAlign: 'center', lineHeight: 20 }}>{erro}</Text>
            </View>
          )}

          {link ? (
            <>
              <Text style={{ fontSize: 13, color: cores.textoFraco, textAlign: 'center', lineHeight: 20, marginBottom: 16 }}>
                Você está sendo redirecionado. Se não abriu automaticamente, toque no botão abaixo.
              </Text>
              <BotaoPrimario
                titulo="Abrir página de pagamento →"
                onPress={() => Linking.openURL(link).catch(err => console.log('[AppNavigator] falha ao abrir link de pagamento | msg:', err.message))}
                estilo={{ width: '100%', marginBottom: 12 }}
              />
            </>
          ) : !carregando && (
            <BotaoPrimario
              titulo="Tentar novamente →"
              onPress={buscarLink}
              estilo={{ width: '100%', marginBottom: 12 }}
            />
          )}

          {/* Secundário: continua o botão de fundoCard de sempre. Só o principal virou
              BotaoPrimario, senão a tela teria dois laranjas competindo. */}
          <TouchableOpacity
            style={{ backgroundColor: cores.fundoCard, borderRadius: raios.medio, padding: 14, width: '100%', alignItems: 'center', marginBottom: 12, borderWidth: 0.5, borderColor: cores.borda }}
            onPress={verificarPagamento}
            disabled={verificando}
          >
            <Text style={{ fontSize: 14, color: verificando ? cores.textoFraco : cores.textoForte }}>
              {verificando ? 'Verificando...' : 'Já paguei — verificar acesso'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout} style={{ padding: 14 }}>
            <Text style={{ fontSize: 13, color: cores.textoFraco }}>Sair da conta</Text>
          </TouchableOpacity>
        </TelaAviso>
      </ScrollView>
    </SafeAreaView>
  )
}

function VerificacaoPendenteScreen() {
  const { logout, revalidarSessao, assinatura } = useAuth()
  const [verificando, setVerificando] = React.useState(false)
  // Conta gratuita (janela de lançamento): a API marca assinatura.tipo === 'gratuito'.
  // Nesse caso a tela troca a copy de pagamento por "aguardando aprovação". Qualquer
  // outro tipo (pago, null ou ausente) mantém a copy original byte-idêntica.
  const ehGratuito = assinatura?.tipo === 'gratuito'

  // "Já paguei — verificar acesso" (tela pós-pagamento, aguardando aprovação do admin).
  // Sempre dá feedback: revalida a sessão e decide a mensagem pelo status REAL devolvido por
  // GET /auth/perfil. Nesta tela o desfecho esperado é 'pendente_verificacao' até a aprovação.
  const verificarPagamento = async () => {
    setVerificando(true)
    try {
      // Refresh COMPLETO da sessão (boas-vindas + flags + push), não só usuario/assinatura.
      const { assinatura: a } = await revalidarSessao()
      const status = a?.status
      if (status === 'ativa') {
        // Aprovado: o AppNavigator troca de tela automaticamente (o app abre). O próprio
        // avanço é o feedback — não exibimos alerta para não sobrepor a transição.
        return
      }
      if (status === 'pendente_verificacao') {
        Alert.alert(
          'Cadastro em análise',
          'Seu cadastro está em análise. Assim que for aprovado (em até 1 hora), seu acesso será liberado.'
        )
        return
      }
      // Qualquer outro status (expirada, cancelada, pendente, sem assinatura): pagamento
      // ainda não confirmado pela plataforma.
      Alert.alert(
        'Pagamento ainda não confirmado',
        'Ainda não identificamos seu pagamento. Se você acabou de pagar, aguarde alguns minutos e toque novamente em "Já paguei — verificar acesso".'
      )
    } catch (err) {
      console.log('[AppNavigator] falha ao verificar pagamento | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert(
        'Não foi possível verificar',
        'Tivemos um problema ao verificar seu acesso. Verifique sua conexão e tente novamente.'
      )
    } finally { setVerificando(false) }
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: cores.fundo }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <TelaAviso
          icone={<Feather name="check" size={34} color={cores.sucesso} />}
          corIcone="sucesso"
          titulo={ehGratuito ? 'Cadastro enviado!' : 'Pagamento efetuado com sucesso'}
          texto={ehGratuito
            ? 'Estamos analisando seus dados — isso pode levar até uma hora. Você será avisado assim que for aprovado.'
            : 'Em instantes aprovaremos seu cadastro — isto pode levar até uma hora'}
        >
          {/* titulo com o rótulo condicional, e NÃO carregando: o carregando do
              BotaoPrimario troca o texto por um ActivityIndicator, e a string
              "Verificando..." desapareceria da tela. desabilitado dá o mesmo bloqueio
              de toque que o disabled antigo, preservando o texto. */}
          <BotaoPrimario
            titulo={verificando ? 'Verificando...' : (ehGratuito ? 'Verificar acesso' : 'Já paguei — verificar acesso')}
            onPress={verificarPagamento}
            desabilitado={verificando}
            estilo={{ width: '100%', marginBottom: 12 }}
          />
          <TouchableOpacity onPress={logout} style={{ padding: 14 }}>
            <Text style={{ fontSize: 13, color: cores.textoFraco }}>Sair da conta</Text>
          </TouchableOpacity>
        </TelaAviso>
      </ScrollView>
    </SafeAreaView>
  )
}

// Stack do Perfil (compartilhado entre pintor e prestador)
//
// Termos e Privacidade entram AQUI, e não no Stack raiz logado, porque o empilhamento é o
// que decide para onde o gesto de voltar leva. Dentro do PerfilStack o Perfil continua na
// pilha por baixo, então voltar devolve a pessoa exatamente à linha que ela tocou —
// mesmo comportamento do EditarPerfil e do AlterarSenha, que são os vizinhos diretos.
// No Stack raiz a tela cobriria a barra de abas inteira e o retorno cairia na raiz da aba,
// perdendo a posição de rolagem do Perfil.
//
// Os MESMOS dois componentes ficam registrados no ramo deslogado (:827-828) para a entrada
// da Splash. São dois REGISTROS da mesma tela, não duas telas: os componentes são
// importados uma vez no topo deste arquivo e nada do texto legal foi copiado.
const PerfilStackNavigator = () => (
  <PerfilStack.Navigator screenOptions={{ headerShown: false }}>
    <PerfilStack.Screen name="PerfilMain"   component={PerfilScreen} />
    <PerfilStack.Screen name="EditarPerfil" component={EditarPerfilScreen} />
    <PerfilStack.Screen name="AlterarSenha" component={AlterarSenhaScreen} />
    <PerfilStack.Screen name="Especialidades" component={EspecialidadesScreen} />
    <PerfilStack.Screen name="Sugestoes"    component={SugestoesScreen} />
    <PerfilStack.Screen name="AvaliacoesRecebidas" component={AvaliacoesRecebidasScreen} />
    <PerfilStack.Screen name="Termos"       component={TermosScreen} />
    <PerfilStack.Screen name="Privacidade"  component={PrivacidadeScreen} />
  </PerfilStack.Navigator>
)

// Stack do Feed de Pintores
const FeedStackNavigator = () => (
  <FeedStack.Navigator screenOptions={{ headerShown: false }}>
    <FeedStack.Screen name="FeedMain"    component={FeedObrasScreen} />
    <FeedStack.Screen name="DetalheObra" component={DetalheObraScreen} />
  </FeedStack.Navigator>
)

// Stack do Feed de Reparos
const ReparoStackNavigator = () => (
  <ReparoStack.Navigator screenOptions={{ headerShown: false }}>
    <ReparoStack.Screen name="FeedReparosMain" component={FeedReparosScreen} />
    <ReparoStack.Screen name="DetalheReparo"   component={DetalheReparoScreen} />
  </ReparoStack.Navigator>
)

// Stack de Meus Interesses (prestador)
const MeusInteressesNavigator = () => (
  <MeusInteressesStack.Navigator screenOptions={{ headerShown: false }}>
    <MeusInteressesStack.Screen name="MeusInteressesMain" component={MeusInteressesScreen} />
    <MeusInteressesStack.Screen name="DetalheReparo"      component={DetalheReparoScreen} />
  </MeusInteressesStack.Navigator>
)

// Stack: Minhas Obras (pintor — candidaturas/negociações em andamento)
const MinhasObrasInteresseNavigator = () => (
  <MinhasObrasInteresseStack.Navigator screenOptions={{ headerShown: false }}>
    <MinhasObrasInteresseStack.Screen name="MinhasObrasMain" component={ContratosScreen} />
    <MinhasObrasInteresseStack.Screen name="DetalheObra"     component={DetalheObraScreen} />
  </MinhasObrasInteresseStack.Navigator>
)

// Stack: Contratos Finalizados (pintor — obras concluídas)
const ContratosFinObraNavigator = () => (
  <ContratosFinObraStack.Navigator screenOptions={{ headerShown: false }}>
    <ContratosFinObraStack.Screen name="ContratosFinObraMain" component={ContratosFinalizadosScreen} initialParams={{ tipo: 'obra' }} />
    <ContratosFinObraStack.Screen name="DetalheObra"          component={DetalheObraScreen} />
  </ContratosFinObraStack.Navigator>
)

// Stack: Contratos Finalizados (reparador — reparos concluídos)
const ContratosFinReparoNavigator = () => (
  <ContratosFinReparoStack.Navigator screenOptions={{ headerShown: false }}>
    <ContratosFinReparoStack.Screen name="ContratosFinReparoMain" component={ContratosFinalizadosScreen} initialParams={{ tipo: 'reparo' }} />
    <ContratosFinReparoStack.Screen name="DetalheReparo"          component={DetalheReparoScreen} />
  </ContratosFinReparoStack.Navigator>
)

// Stack: Contratos Finalizados (dono_reparo — reparos concluídos onde contratou um prestador)
const ContratosFinDonoReparoNavigator = () => (
  <ContratosFinDonoReparoStack.Navigator screenOptions={{ headerShown: false }}>
    <ContratosFinDonoReparoStack.Screen name="ContratosFinDonoReparoMain" component={ContratosFinalizadosScreen} initialParams={{ tipo: 'reparo', perfil: 'dono' }} />
    <ContratosFinDonoReparoStack.Screen name="DetalheReparo"              component={DetalheReparoScreen} />
  </ContratosFinDonoReparoStack.Navigator>
)

// Stack: Contratos Finalizados (dono_obra — obras concluídas onde contratou um prestador)
const ContratosFinDonoObraNavigator = () => (
  <ContratosFinDonoObraStack.Navigator screenOptions={{ headerShown: false }}>
    <ContratosFinDonoObraStack.Screen name="ContratosFinDonoObraMain" component={ContratosFinalizadosScreen} initialParams={{ tipo: 'obra', perfil: 'dono' }} />
    <ContratosFinDonoObraStack.Screen name="DetalheObra"              component={DetalheObraScreen} />
  </ContratosFinDonoObraStack.Navigator>
)

// Estilo compartilhado da barra de abas. Deriva a reserva inferior do inset da barra
// de navegação do sistema (Android 15 edge-to-edge / notch iOS) via useSafeAreaInsets,
// restaurando o inset que o React Navigation aplicaria sozinho e que o height fixo
// anterior (72) anulava. Mantém o mesmo tamanho visível (72 - 8 - 14 = 50) somando o
// inset a height e paddingBottom. Chamado dentro de componentes sob o SafeAreaProvider raiz.
const useTabBarStyle = () => {
  const { bottom } = useSafeAreaInsets()
  return {
    backgroundColor: cores.fundo,
    borderTopWidth: 0.5,
    borderTopColor: cores.bordaFraca,
    height: alturas.tabBar + bottom,
    paddingBottom: 14 + bottom,
    paddingTop: 8,
  }
}

// Tabs do Pintor
const TabsPintorNavigator = () => {
  const tabBarStyle = useTabBarStyle()
  return (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle,
      tabBarActiveTintColor: cores.primaria,
      tabBarInactiveTintColor: cores.textoFraco,
      tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
      tabBarIcon: ({ focused }) => <TabIcone nome={route.name} focado={focused} />,
    })}
  >
    <Tab.Screen name="Obras"                 component={FeedStackNavigator} options={{ title: 'Obras disponíveis' }} />
    <Tab.Screen name="Minhas Obras"          component={MinhasObrasInteresseNavigator} />
    <Tab.Screen name="Contratos Finalizados" component={ContratosFinObraNavigator} options={{ title: 'Finalizados' }} />
    <Tab.Screen name="Mensagens"             component={MensagensScreen} />
    <Tab.Screen name="Perfil"                component={PerfilStackNavigator} options={{ title: 'Perfil' }} />
  </Tab.Navigator>
  )
}

// Tabs do Prestador (Reparos, Meus Reparos, Contratos Finalizados, Perfil) — sem Mensagens:
// a tela é obra-only (candidaturas + /mensagens/obra/:id) e a aba só existe nos navegadores
// de pintura (TabsPintorNavigator, DonoObraTabNavigator).
const TabsPrestadorNavigator = () => {
  const tabBarStyle = useTabBarStyle()
  return (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle,
      tabBarActiveTintColor: cores.primaria,
      tabBarInactiveTintColor: cores.textoFraco,
      tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
      tabBarIcon: ({ focused }) => <TabIcone nome={route.name} focado={focused} />,
    })}
  >
    <Tab.Screen name="Reparos"               component={ReparoStackNavigator}    options={{ title: 'Serviços disponíveis' }} />
    <Tab.Screen name="Meus Reparos"          component={MeusInteressesNavigator} options={{ title: 'Meus Serviços' }} />
    <Tab.Screen name="Contratos Finalizados" component={ContratosFinReparoNavigator} options={{ title: 'Finalizados' }} />
    <Tab.Screen name="Perfil"                component={PerfilStackNavigator}    options={{ title: 'Perfil' }} />
  </Tab.Navigator>
  )
}

// Tab: Novo Reparo (dono_reparo)
const NovoReparoTabStack = () => (
  <NovoReparoStack.Navigator screenOptions={{ headerShown: false }}>
    <NovoReparoStack.Screen name="CadastrarReparoMain" component={CadastrarReparoScreen} />
  </NovoReparoStack.Navigator>
)

// Tab: Meus Reparos (dono_reparo)
const MeusReparosTabStack = () => (
  <MeusReparosStack.Navigator screenOptions={{ headerShown: false }}>
    <MeusReparosStack.Screen name="ListaReparos" component={MinhasObrasScreen} initialParams={{ soAba: 'reparos' }} />
    <MeusReparosStack.Screen name="DetalheReparo" component={DetalheReparoScreen} />
  </MeusReparosStack.Navigator>
)

// Tab Navigator para dono de reparo
const donoTabOpts = {
  headerShown: false,
  tabBarActiveTintColor: cores.primaria,
  tabBarInactiveTintColor: cores.textoFraco,
  tabBarLabelStyle: { fontSize: 10, marginTop: 2 },
}
const DonoReparoTabNavigator = () => {
  const tabBarStyle = useTabBarStyle()
  return (
  <DonoReparoTab.Navigator screenOptions={({ route }) => ({ ...donoTabOpts, tabBarStyle, tabBarIcon: ({ focused }) => <TabIcone nome={route.name} focado={focused} /> })}>
    {/* `title` muda SÓ o rótulo visível; o name segue 'Novo Reparo' porque é a chave de
        rota usada por navigate() e pelo mapa de ícones do TabIcone (route.name). */}
    <DonoReparoTab.Screen name="Novo Reparo"   component={NovoReparoTabStack} options={{ title: 'Novo Serviço' }} />
    <DonoReparoTab.Screen name="Meus Reparos"  component={MeusReparosTabStack} options={{ title: 'Meus Serviços' }} />
    <DonoReparoTab.Screen name="Contratos Finalizados" component={ContratosFinDonoReparoNavigator} options={{ title: 'Finalizados' }} />
    <DonoReparoTab.Screen name="Perfil"        component={PerfilStackNavigator} options={{ title: 'Perfil' }} />
  </DonoReparoTab.Navigator>
  )
}

// Tab: Nova Obra (dono_obra)
const NovaObraTabStack = () => (
  <NovaObraStack.Navigator screenOptions={{ headerShown: false }}>
    <NovaObraStack.Screen name="CadastrarObraMain" component={CadastrarObraScreen} />
  </NovaObraStack.Navigator>
)

// Tab: Minhas Obras (dono_obra)
const MinhasObrasTabStack = () => (
  <MinhasObrasStack.Navigator screenOptions={{ headerShown: false }}>
    <MinhasObrasStack.Screen name="ListaObras"   component={MinhasObrasScreen} initialParams={{ soAba: 'obras' }} />
    <MinhasObrasStack.Screen name="DetalheObra"  component={DetalheObraScreen} />
    <MinhasObrasStack.Screen name="DetalheReparo" component={DetalheReparoScreen} />
  </MinhasObrasStack.Navigator>
)

// Tab Navigator para dono de pintura
const DonoObraTabNavigator = () => {
  const tabBarStyle = useTabBarStyle()
  return (
  <DonoObraTab.Navigator screenOptions={({ route }) => ({ ...donoTabOpts, tabBarStyle, tabBarIcon: ({ focused }) => <TabIcone nome={route.name} focado={focused} /> })}>
    <DonoObraTab.Screen name="Nova Obra"      component={NovaObraTabStack} />
    <DonoObraTab.Screen name="Minhas Obras"   component={MinhasObrasTabStack} />
    <DonoObraTab.Screen name="Contratos Finalizados" component={ContratosFinDonoObraNavigator} options={{ title: 'Finalizados' }} />
    <DonoObraTab.Screen name="Mensagens"      component={MensagensScreen} />
    <DonoObraTab.Screen name="Perfil"         component={PerfilStackNavigator} options={{ title: 'Perfil' }} />
  </DonoObraTab.Navigator>
  )
}

// Stack do Dono de Obra (fallback para tipo_dono não definido)
const DonoObraNavigator = () => (
  <DonoStack.Navigator screenOptions={{ headerShown: false }}>
    <DonoStack.Screen name="MinhasObras"      component={MinhasObrasScreen} />
    <DonoStack.Screen name="CadastrarObra"    component={CadastrarObraScreen} />
    <DonoStack.Screen name="CadastrarReparo"  component={CadastrarReparoScreen} />
    <DonoStack.Screen name="DetalheObra"      component={DetalheObraScreen} />
    <DonoStack.Screen name="DetalheReparo"    component={DetalheReparoScreen} />
    <DonoStack.Screen name="EditarPerfil"     component={EditarPerfilScreen} />
    <DonoStack.Screen name="AlterarSenha"     component={AlterarSenhaScreen} />
  </DonoStack.Navigator>
)

export default function AppNavigator() {
  const { usuario, assinatura, carregando, mostrarBoasVindas } = useAuth()
  const respostaNotificacaoRef = useRef(null)

  // Mantém o contexto do usuário disponível para o roteador de notificações (deep-links)
  useEffect(() => { setUsuarioContexto(usuario) }, [usuario])

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(resposta => {
      if (resposta?.notification?.request?.content?.data) {
        setTimeout(() => navegarParaNotificacao(resposta.notification.request.content.data), 500)
      }
    }).catch(err => console.log('[AppNavigator] falha ao ler a última resposta de notificação | msg:', err?.message))

    respostaNotificacaoRef.current = Notifications.addNotificationResponseReceivedListener(resposta => {
      navegarParaNotificacao(resposta.notification.request.content.data)
    })

    return () => respostaNotificacaoRef.current?.remove()
  }, [])

  if (carregando) return null
  if (usuario && assinatura === null) return null

  return (
    <NavigationContainer ref={navigationRef}>
      {/* ANTES do Stack.Navigator de propósito: o softAskRef só é preenchido no useEffect
          deste componente, e o React roda os efeitos na ordem da árvore (filhos primeiro,
          irmãos na ordem em que aparecem). Montado depois do navegador, o ref ainda era
          null quando o useFocusEffect da tela inicial rodava — a chamada com `?.` virava
          um no-op silencioso e o soft-ask nunca aparecia na primeira abertura, só depois
          de trocar de aba e voltar. Não muda empilhamento: este componente devolve `null`
          ou um <Modal>, que o RN apresenta em janela nativa própria, acima de toda a
          hierarquia de views independentemente da posição na árvore. */}
      {usuario && <SoftAskNotificacao />}
      <Stack.Navigator screenOptions={{ headerShown: false, statusBarTranslucent: false, statusBarColor: '#0A0A0A', statusBarStyle: 'light' }}>
        {usuario ? (
          usuario.role === 'dono_obra' ? (
            usuario.tipo_dono === 'reparo' ? (
              <Stack.Screen name="DonoReparoApp" component={DonoReparoTabNavigator} />
            ) : usuario.tipo_dono === 'pintura' ? (
              <Stack.Screen name="DonoObraApp" component={DonoObraTabNavigator} />
            ) : (
              <Stack.Screen name="DonoApp" component={DonoObraNavigator} />
            )
          ) : usuario.role === 'prestador' ? (
            assinatura?.status === 'ativa' ? (
              // Prestador recém-aprovado vê a tela de boas-vindas única antes das
              // abas. Ao confirmar, o flag limpa e cai direto no feed (aba inicial).
              mostrarBoasVindas ? (
                <Stack.Screen name="BoasVindasPrestador" component={BoasVindasPrestadorScreen} options={{ gestureEnabled: false }} />
              ) : usuario.tipo_prestador === 'pintor' ? (
                <Stack.Screen name="App" component={TabsPintorNavigator} />
              ) : (
                <Stack.Screen name="PrestadorApp" component={TabsPrestadorNavigator} />
              )
            ) : assinatura?.status === 'pendente_verificacao' ? (
              <Stack.Screen name="Verificacao" component={VerificacaoPendenteScreen} />
            ) : (
              <Stack.Screen name="Pagamento" component={PagamentoPendenteScreen} />
            )
          ) : (
            assinatura?.status === 'ativa' ? (
              <Stack.Screen name="App" component={TabsPintorNavigator} />
            ) : assinatura?.status === 'pendente_verificacao' ? (
              <Stack.Screen name="Verificacao" component={VerificacaoPendenteScreen} />
            ) : (
              <Stack.Screen name="Pagamento" component={PagamentoPendenteScreen} />
            )
          )
        ) : (
          <>
            <Stack.Screen name="Splash"        component={SplashScreen} />
            <Stack.Screen name="Login"         component={LoginScreen} />
            <Stack.Screen name="Cadastro"      component={CadastroScreen} />
            <Stack.Screen name="EsqueciSenha"  component={EsqueciSenhaScreen} />
            <Stack.Screen name="RedefinirSenha" component={RedefinirSenhaScreen} />
            <Stack.Screen name="Termos"        component={TermosScreen} />
            <Stack.Screen name="Privacidade"   component={PrivacidadeScreen} />
            {/* Mesmo registro-duplo de Termos/Privacidade acima: a tela é a MESMA
                (importada uma vez no topo), registrada nos dois ramos porque o cadastro
                vive no ramo deslogado e o Perfil no logado. Sem isto, o campo do
                cadastro não teria para onde navegar. */}
            <Stack.Screen name="Especialidades" component={EspecialidadesScreen} />
          </>
        )}
      </Stack.Navigator>
      {usuario && <CelebracaoMatchHost />}
      {/* Devolve null: só observa o login/abertura e, se houver um serviço em andamento,
          navega uma vez. Fica depois do navegador porque precisa dele montado para que o
          navigationRef resolva — ao contrário do soft-ask acima, que precisa do efeito
          rodando ANTES do primeiro foco. */}
      {usuario && <RetomadaMatchHost />}
    </NavigationContainer>
  )
}