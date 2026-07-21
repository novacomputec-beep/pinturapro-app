import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import * as SecureStore from 'expo-secure-store'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { authService } from '../services/api'
import api from '../services/api'
import { resetarFlagsSessao } from '../utils/sessao'
import { comRetry } from '../utils/rede'
import { limparRascunhoCadastro } from '../utils/rascunhoCadastro'

const AuthContext = createContext({})

// Boas-vindas únicas para prestadores recém-aprovados: o backend devolve
// boas_vindas_exibida no usuario (login e perfil). Mostra só uma vez, para
// prestador com assinatura ativa que ainda não viu a tela. Nunca para donos.
const deveExibirBoasVindas = (usuario, assinatura) =>
  usuario?.role === 'prestador' &&
  assinatura?.status === 'ativa' &&
  usuario?.boas_vindas_exibida === false

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

const configurarCanalAndroid = async () => {
  if (Platform.OS !== 'android') return
  // O canal 'default' antigo foi criado com sound: true (booleano) — tipo inválido
  // que o nativo lê como string, vira null e registra o canal SEM som. Canais são
  // imutáveis, então editá-lo não conserta quem já o tem: some com o antigo e cria
  // um id NOVO ('default_v2', nunca recriar o mesmo id) com sound: 'default'
  // (string → som padrão do sistema).
  // O delete vai em try PRÓPRIO: em instalação nova o canal não existe, e uma falha
  // aqui jamais pode abortar a criação do 'default_v2' abaixo.
  try {
    await Notifications.deleteNotificationChannelAsync('default')
  } catch (err) {
    console.log('[Push] canal antigo "default" ausente ou não removido (ok) | msg:', err?.message)
  }
  try {
    await Notifications.setNotificationChannelAsync('default_v2', {
      name: 'PinturaPro',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E8833A',
      sound: 'default',
    })
  } catch (err) {
    console.error('[Push] falha ao configurar canal Android | msg:', err?.message, err)
  }
}

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null)
  const [assinatura, setAssinatura] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [mostrarBoasVindas, setMostrarBoasVindas] = useState(false)
  const notificacaoRecebidaRef = useRef(null)
  const notificacaoRespostaRef = useRef(null)

  useEffect(() => {
    configurarCanalAndroid()
    const restaurarSessao = async () => {
      let u = null, a = null
      try {
        const token = await SecureStore.getItemAsync('token')
        if (token) {
          try {
            const perfil = await comRetry(() => authService.perfil())
            u = perfil.usuario
            a = perfil.assinatura
            registrarPushToken()
          } catch (err) {
            console.log('[AuthContext] falha ao restaurar sessão (perfil) | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
            await SecureStore.deleteItemAsync('token')
          }
        }
      } catch (err) {
        console.log('[AuthContext] falha ao ler token do SecureStore | msg:', err.message)
        await SecureStore.deleteItemAsync('token')
      } finally {
        setUsuario(u)
        setAssinatura(a)
        setMostrarBoasVindas(deveExibirBoasVindas(u, a))
        setCarregando(false)
      }
    }
    restaurarSessao()

    notificacaoRecebidaRef.current = Notifications.addNotificationReceivedListener(notificacao => {
      console.log('Notificação recebida:', notificacao.request.content)
    })

    notificacaoRespostaRef.current = Notifications.addNotificationResponseReceivedListener(resposta => {
      const data = resposta.notification.request.content.data
      console.log('Notificação tocada:', data)
    })

    return () => {
      notificacaoRecebidaRef.current?.remove()
      notificacaoRespostaRef.current?.remove()
    }
  }, [])

  // Reporta ao servidor o resultado do registro de push, para o backend distinguir
  // 'sem token' entre negada / bloqueada / erro / concedida — hoje invisível
  // (push_token NULL conflava tudo). Fire-and-forget e BLINDADO: roda numa IIFE
  // destacada com try/catch cobrindo todo o corpo, então nunca pode lançar para
  // dentro de registrarPushToken nem bloquear a aquisição do token.
  // Dedupe SÓ do 'concedida': é o estado dos usuários saudáveis, que bootam todo dia —
  // sem isso, um POST por boot sem sinal novo. Os três estados negativos SEMPRE
  // reportam: num aparelho compartilhado, o negativo do 2º usuário jamais pode ser
  // suprimido pelo 'concedida' do 1º (é a mentira que o report existe para evitar).
  // O guard é gravado SÓ DEPOIS do POST ok — um envio perdido nunca vira permanente.
  const CHAVE_STATUS_PUSH = 'push_status_reportado'
  const reportarStatusPush = (status) => {
    ;(async () => {
      try {
        if (status === 'concedida') {
          const anterior = await SecureStore.getItemAsync(CHAVE_STATUS_PUSH)
          if (anterior === 'concedida') return
        }
        await comRetry(() => api.post('/auth/push-status', { status }))
        await SecureStore.setItemAsync(CHAVE_STATUS_PUSH, status)
      } catch (err) {
        console.error('[Push][status] falha ao reportar | status:', status, '| msg:', err?.mensagem || err?.message, err)
      }
    })()
  }

  // Pede a permissão de notificação ao SO — o ÚNICO ponto que chama
  // requestPermissionsAsync. Consulta o estado e, se ainda dá para pedir, dispara o
  // diálogo; captura canAskAgain das DUAS fontes; reporta o status e devolve se ficou
  // concedida. Chamado só pelo soft-ask ("Sim, ativar"), num momento de relevância —
  // NUNCA no boot/login, para não gastar a única tentativa do SO num diálogo sem
  // contexto (o bug que a Fase 2 corrige).
  const garantirPermissaoConcedida = async () => {
    let status
    let canAskAgain = true
    try {
      const atual = await Notifications.getPermissionsAsync()
      status = atual.status
      canAskAgain = atual.canAskAgain
      if (status !== 'granted' && atual.canAskAgain !== false) {
        const solicitado = await Notifications.requestPermissionsAsync()
        status = solicitado.status
        canAskAgain = solicitado.canAskAgain
      }
    } catch (err) {
      console.error('[Push] falha ao obter/solicitar permissão de notificação | msg:', err?.message, err)
      reportarStatusPush('erro_registro')
      return false
    }
    if (status !== 'granted') {
      console.error('[Push] permissão de notificação NÃO concedida | status:', status)
      reportarStatusPush(canAskAgain === false ? 'bloqueada' : 'negada')
      return false
    }
    reportarStatusPush('concedida')
    return true
  }

  const registrarPushToken = async () => {
    // O canal precisa existir ANTES de pedir o token no Android 8+.
    await configurarCanalAndroid()

    // PROMPT-FREE: só consulta, NUNCA chama requestPermissionsAsync — pedir permissão
    // é responsabilidade do soft-ask (garantirPermissaoConcedida), num momento de
    // relevância. canAskAgain (só do getPermissionsAsync, sem request) distingue
    // 'bloqueada' de 'negada'; default true = a alegação mais fraca.
    let status
    let canAskAgain = true
    try {
      const atual = await Notifications.getPermissionsAsync()
      status = atual.status
      canAskAgain = atual.canAskAgain
    } catch (err) {
      console.error('[Push] falha ao consultar permissão de notificação | msg:', err?.message, err)
      reportarStatusPush('erro_registro')
      return
    }
    if (status !== 'granted') {
      console.error('[Push] permissão de notificação NÃO concedida | status:', status, '— token não será gerado')
      reportarStatusPush(canAskAgain === false ? 'bloqueada' : 'negada')
      return
    }
    reportarStatusPush('concedida')

    // projectId: caminho correto é extra.eas.projectId (não extra.projectId).
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      || Constants.easConfig?.projectId
      || 'bf289259-dbe3-429f-9032-dcaca21f0a8a'

    let pushToken
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })
      pushToken = tokenData.data
    } catch (err) {
      console.error('[Push] getExpoPushTokenAsync FALHOU | projectId:', projectId, '| msg:', err?.message, err)
      reportarStatusPush('erro_registro')
      return
    }

    try {
      await api.post('/auth/push-token', { token: pushToken })
      console.log('[Push] token registrado com sucesso | projectId:', projectId, '| token:', pushToken)
    } catch (err) {
      console.error('[Push] POST /auth/push-token FALHOU | status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem || err?.message, err)
      reportarStatusPush('erro_registro')
    }
  }

  const login = async (email, senha) => {
    const resposta = await authService.login(email, senha)
    resetarFlagsSessao()
    // Defensivo: em aparelho compartilhado, um login (de qualquer usuário) descarta
    // um eventual rascunho de cadastro pré-auth que tenha ficado, para não ressurgir
    // para outra pessoa. Best-effort, não bloqueia o login.
    limparRascunhoCadastro().catch(() => {})
    await SecureStore.setItemAsync('token', resposta.token)
    setUsuario(resposta.usuario)
    setAssinatura(resposta.assinatura)
    setMostrarBoasVindas(deveExibirBoasVindas(resposta.usuario, resposta.assinatura))
    setTimeout(() => registrarPushToken(), 1000)
    return resposta
  }

  // Função usada após cadastro — recebe token e dados diretamente
  const loginComToken = async (token, usuarioDados, assinaturaDados) => {
    resetarFlagsSessao()
    await SecureStore.setItemAsync('token', token)
    setUsuario(usuarioDados)
    setAssinatura(assinaturaDados || null)
    setMostrarBoasVindas(deveExibirBoasVindas(usuarioDados, assinaturaDados || null))
    setTimeout(() => registrarPushToken(), 1000)
  }

  const logout = async () => {
    resetarFlagsSessao()
    // Best-effort e NÃO bloqueante: limpa o push_token no servidor ANTES de
    // destruir o token local, fechando a colisão de token em aparelho compartilhado
    // (RELATORIO.txt #2). O header é fixado explicitamente porque o SecureStore é
    // apagado logo abaixo — o interceptor poderia não encontrar mais o token.
    // Dispara e segue; qualquer falha só é logada e nunca impede o logout local.
    try {
      const token = await SecureStore.getItemAsync('token')
      if (token) {
        api.post('/auth/push-token/clear', {}, { headers: { Authorization: `Bearer ${token}` } })
          .catch(err => console.log('[Push] falha ao limpar push_token no logout | msg:', err?.mensagem || err?.message))
      }
    } catch (err) {
      console.log('[Push] erro ao ler token para limpar push_token no logout | msg:', err?.message)
    }
    await SecureStore.deleteItemAsync('token')
    setUsuario(null)
    setAssinatura(null)
    setMostrarBoasVindas(false)
  }

  // Confirma as boas-vindas no backend (uma vez) e limpa o flag local. O flag é
  // limpo mesmo se o POST falhar para o usuário não ficar preso na tela — se
  // falhar, o backend ainda terá boas_vindas_exibida=false e mostrará na próxima
  // sessão. comRetry cobre falha transitória de rede (request não chegou).
  const confirmarBoasVindas = async () => {
    try {
      await comRetry(() => api.post('/auth/boas-vindas-confirmada'))
    } catch (err) {
      console.log('[AuthContext] falha ao confirmar boas-vindas | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
    } finally {
      setUsuario(prev => (prev ? { ...prev, boas_vindas_exibida: true } : prev))
      setMostrarBoasVindas(false)
    }
  }

  // Revalida a sessão sem precisar de logout/login: refaz GET /auth/perfil e
  // reaplica TODO o estado de sessão (usuario, assinatura, boas-vindas, flags e
  // push), exatamente como o login. Usada pela tela "Já paguei" para que o
  // prestador recém-aprovado entre no app já com boas-vindas e feed corretos,
  // em vez do refresh parcial antigo que exigia relogar (B72).
  const revalidarSessao = async () => {
    const { usuario, assinatura } = await comRetry(() => authService.perfil())
    resetarFlagsSessao()
    setUsuario(usuario)
    setAssinatura(assinatura)
    setMostrarBoasVindas(deveExibirBoasVindas(usuario, assinatura))
    setTimeout(() => registrarPushToken(), 1000)
    return { usuario, assinatura }
  }

  const assinaturaAtiva = assinatura?.status === 'ativa'

  return (
    <AuthContext.Provider value={{
      usuario,
      assinatura,
      assinaturaAtiva,
      carregando,
      mostrarBoasVindas,
      confirmarBoasVindas,
      revalidarSessao,
      login,
      loginComToken,
      logout,
      setUsuario,
      setAssinatura,
      garantirPermissaoConcedida,
      registrarPushToken,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)