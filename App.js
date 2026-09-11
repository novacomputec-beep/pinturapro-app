import 'react-native-gesture-handler'
import React, { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import AppNavigator from './src/navigation/AppNavigator'
import GlobalVencimentoBanner from './src/components/GlobalVencimentoBanner'
import BannerNotificacaoBloqueada from './src/components/BannerNotificacaoBloqueada'
import BarraServicoEmAndamento from './src/components/BarraServicoEmAndamento'
import { iniciarRastreamento, pararRastreamento } from './src/services/locationService'
import api from './src/services/api'

function RastreamentoController() {
  const { usuario } = useAuth()

  useEffect(() => {
    if (usuario?.role === 'prestador') {
      iniciarRastreamento()
    } else {
      pararRastreamento()
    }
    return () => {
      pararRastreamento()
    }
  }, [usuario])

  return null
}

// Pedido de permissão de notificação disparado pela SESSÃO, e não pela tela: mesmo
// desenho do RastreamentoController acima. Assim que existe usuário com papel que mapeia
// para uma variante conhecida, espera 4 s (a pessoa já vê a tela inicial) e chama
// garantirPermissaoConcedida DIRETO, sem o modal intermediário do soft-ask — o diálogo
// do SO aparece na hora. UMA vez por sessão: o ref guarda o disparo, então trocas de
// identidade do objeto `usuario` (refresh de perfil) não repetem o pedido. O logout
// zera o guard: a próxima sessão é outra sessão. Concedidos e bloqueados (canAskAgain
// false) já saem sem diálogo dentro do próprio garantirPermissaoConcedida. Se concedeu,
// registra o token na hora: o registrarPushToken do login rodou 1 s após a sessão, ANTES
// deste pedido, e sem esta chamada o token só nasceria na próxima abertura.
const varianteSoftAskDoUsuario = (u) => {
  if (!u) return null
  if (u.role === 'prestador') return u.tipo_prestador === 'pintor' ? 'pintor' : 'reparador'
  if (u.role === 'dono_obra') return u.tipo_dono === 'reparo' ? 'dono_reparo' : 'dono_obra'
  return null
}

function SoftAskController() {
  const { usuario, garantirPermissaoConcedida, registrarPushToken } = useAuth()
  const disparadoNaSessao = useRef(false)

  useEffect(() => {
    if (!usuario) {
      disparadoNaSessao.current = false
      return
    }
    const variante = varianteSoftAskDoUsuario(usuario)
    if (!variante || disparadoNaSessao.current) return
    const timer = setTimeout(async () => {
      disparadoNaSessao.current = true
      try {
        const concedida = await garantirPermissaoConcedida()
        if (concedida) registrarPushToken()
      } catch (err) {
        console.error('[SoftAsk] falha ao pedir permissão pela sessão | variante:', variante, '| msg:', err?.message, err)
      }
    }, 4000)
    return () => clearTimeout(timer)
  }, [usuario])

  return null
}

// Re-registro do push token ao voltar do 2º plano. Fecha o buraco de quem concede a
// permissão nas configurações do SO com o app aberto atrás: nada no app voltava a chamar
// registrarPushToken até o próximo cold start, login ou a linha do Perfil. Mesmo molde
// do WarmupController abaixo, mas COM gate de sessão (sem usuário não há bearer) e com
// throttle de 5 min: no iOS um simples banner/central de controle gera inactive→active,
// e sem o throttle cada um custaria consulta de permissão, canal Android e um POST.
// O registrarPushToken é prompt-free: este listener NUNCA levanta o diálogo do SO.
// O usuário vai num ref para o listener ser um só, montado uma vez, e ainda assim ler a
// sessão corrente — o mesmo motivo do disparadoNaSessao no SoftAskController.
const INTERVALO_REREGISTRO_PUSH_MS = 5 * 60 * 1000

function ReregistroPushController() {
  const { usuario, registrarPushToken } = useAuth()
  const usuarioRef = useRef(usuario)
  const registrarRef = useRef(registrarPushToken)
  const ultimoDisparoMs = useRef(0)

  useEffect(() => { usuarioRef.current = usuario }, [usuario])
  useEffect(() => { registrarRef.current = registrarPushToken }, [registrarPushToken])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active' || !usuarioRef.current) return
      const agora = Date.now()
      if (agora - ultimoDisparoMs.current < INTERVALO_REREGISTRO_PUSH_MS) return
      ultimoDisparoMs.current = agora
      Promise.resolve(registrarRef.current?.())
        .catch(err => console.error('[Push][resume] registrarPushToken falhou | msg:', err?.message, err))
    })
    return () => sub.remove()
  }, [])

  return null
}

// Warm-up ao voltar do 2º plano. NÃO é cold start do servidor: o Serverless está
// desligado e a API fica de pé (15,6 h de uptime observadas). O que morre é a
// CONEXÃO — enquanto o app está em 2º plano o SO/a rede derrubam o socket TCP
// ocioso, sem que o cliente saiba. O pool do axios continua achando que ele serve,
// e a PRIMEIRA requisição depois do retorno é entregue nesse socket morto: ela não
// falha na hora, morre em silêncio até estourar o timeout de 30 s — e essa vítima
// costuma ser a ação que o usuário acabou de tocar.
// Um GET /health descartável ao voltar à tela serve de para-raios: é ELE quem
// reutiliza o socket podre e leva o erro, forçando o pool a abrir uma conexão nova
// antes de o dedo chegar no botão. Por isso a falha aqui não é anomalia — é o
// caso de sucesso, e o log fica em console.log, não em console.error.
// Mesmo endpoint/padrão do warm-up que já existe no CadastroScreen e nas
// contrapropostas. SEM gate de sessão: um socket morto não distingue quem está
// logado, e pré-login a vítima seria o POST /auth/login.
// O listener só dispara em MUDANÇA de estado, então a montagem no boot não chama
// nada — ali a conexão é nova e o AuthContext já bate na API por conta própria.
function WarmupController() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        api.get('/health').catch(err => console.log('[Warmup] falha no /health (ok) | code:', err?.code, '| msg:', err?.mensagem))
      }
    })
    return () => sub.remove()
  }, [])

  return null
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" backgroundColor="#0A0A0A" />
        <RastreamentoController />
        <SoftAskController />
        <ReregistroPushController />
        <WarmupController />
        <BannerNotificacaoBloqueada />
        <GlobalVencimentoBanner />
        {/* Ancorada ao RODAPÉ, ao contrário dos dois acima: não disputa espaço com eles.
            Fica antes do AppNavigator como os banners — o zIndex 9999 dela já a põe sobre a
            árvore de telas, que não declara zIndex nenhum. */}
        <BarraServicoEmAndamento />
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  )
}