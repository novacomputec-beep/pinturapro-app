import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { tipoDaConta, tiposDasContas, lerUltimoTipo, gravarUltimoTipo, tipoDoLadoUnico } from '../utils/contas'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import Constants from 'expo-constants'
import { authService } from '../services/api'
import api from '../services/api'
import { comRetry } from '../utils/rede'
import { limparRascunhoCadastro } from '../utils/rascunhoCadastro'
import { emitirPushRecebido } from '../utils/eventosPush'

const AuthContext = createContext({})

// E-mail do último login BEM-SUCEDIDO, para a tela de login vir preenchida depois de um
// logout. Exportada porque duas telas dependem da mesma chave (aqui e a LoginScreen): é a
// disciplina do rascunhoCadastro.js — chave em UM lugar só, para os dois lados não
// divergirem num typo silencioso, em que a escrita continua funcionando e a leitura
// simplesmente nunca acha nada.
//
// Vai no SecureStore, e não no AsyncStorage, apenas por vizinhança com o 'token' que já
// mora lá; um e-mail não é segredo. Sobrevive ao logout DE PROPÓSITO — é o ponto do
// recurso —, e por isso o logout continua apagando só o 'token'. A senha JAMAIS entra
// aqui: o que é guardado é identificação, nunca credencial.
export const CHAVE_ULTIMO_EMAIL = 'ultimo_email'

// Cópia local do último { usuario, assinatura } de uma sessão válida, para o boot seguir
// SEM rede. Antes só o token era guardado, então qualquer falha do GET /auth/perfil no
// boot — inclusive avião, socket morto ou 5xx — apagava o token e mandava para o login:
// falha de rede lida como falha de autenticação. Agora só 401/403 (o servidor REJEITANDO
// o token) derruba a sessão; o resto segue com esta cópia até a próxima sincronização.
//
// AsyncStorage, e não SecureStore: perfil não é credencial (o token continua no
// SecureStore), e o SecureStore avisa acima de 2 KB por valor — um perfil com
// especialidades e endereço passa disso. Mesmo módulo do rascunhoCadastro.js.
// Escrita best-effort: falhar aqui nunca pode derrubar um login que o servidor aceitou.
const CHAVE_SESSAO_CACHE = 'sessao_cache'
const gravarSessaoCache = async (usuario, assinatura) => {
  try {
    await AsyncStorage.setItem(CHAVE_SESSAO_CACHE, JSON.stringify({ usuario, assinatura: assinatura ?? null }))
  } catch (err) {
    console.log('[AuthContext] falha ao gravar cache da sessão | msg:', err?.message)
  }
}
const lerSessaoCache = async () => {
  try {
    const raw = await AsyncStorage.getItem(CHAVE_SESSAO_CACHE)
    return raw ? JSON.parse(raw) : null
  } catch (err) {
    console.log('[AuthContext] falha ao ler cache da sessão | msg:', err?.message)
    return null
  }
}
const limparSessaoCache = async () => {
  try { await AsyncStorage.removeItem(CHAVE_SESSAO_CACHE) } catch (e) {}
}

// Boas-vindas únicas para prestadores recém-aprovados: o backend devolve
// boas_vindas_exibida no usuario (login e perfil). Mostra só uma vez, para
// Múltiplas contas (Arte-Meus-Perfis): a API devolve `contas` ([{ id, tipo, nome }]) ao LADO
// de `usuario` no perfil, no login e ao trocar/criar conta. O app guarda a lista DENTRO do
// usuário (usuario.contas), para o cache da sessão e as telas lerem de um lugar só. Sem
// lista na resposta, o usuário segue como veio (cache antigo, resposta sem o campo).
const comContas = (usuario, contas) =>
  (usuario && Array.isArray(contas)) ? { ...usuario, contas } : usuario

// prestador com assinatura ativa que ainda não viu a tela. Nunca para donos.
const deveExibirBoasVindas = (usuario, assinatura) =>
  usuario?.role === 'prestador' &&
  assinatura?.status === 'ativa' &&
  usuario?.boas_vindas_exibida === false

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

const configurarCanalAndroid = async () => {
  if (Platform.OS !== 'android') return
  // O canal 'default' antigo foi criado com sound: true (booleano) — tipo inválido
  // que o nativo lê como string, vira null e registra o canal SEM som. Canais são
  // imutáveis, então editá-lo não conserta quem já o tem: some com o antigo e cria
  // um id NOVO (nunca recriar o mesmo id) com sound: 'default' (string → som padrão do
  // sistema). O mesmo raciocínio valeu para o NOME: 'default_v2' nasceu como "ProLar" e,
  // imutável, seguiria "ProLar" nas configurações de quem já tinha o app — daí o
  // 'default_v3', que nasce "ProTudo". Convenção do id: sufixo _vN, sempre crescente.
  // Os deletes vão em try PRÓPRIO, um por id: em instalação nova nenhum dos dois existe,
  // e uma falha aqui jamais pode abortar a criação do 'default_v3' abaixo. Apagar o v2
  // é o que evita dois canais lado a lado nas configurações do Android.
  for (const antigo of ['default', 'default_v2']) {
    try {
      await Notifications.deleteNotificationChannelAsync(antigo)
    } catch (err) {
      console.log(`[Push] canal antigo "${antigo}" ausente ou não removido (ok) | msg:`, err?.message)
    }
  }
  try {
    await Notifications.setNotificationChannelAsync('default_v3', {
      name: 'ProTudo',
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
  // Id do usuário da sessão CORRENTE, lido pelas funções de push. É um ref, e não o
  // state `usuario`, porque registrarPushToken roda de closures antigas (setTimeout do
  // login, retentativas, listener de AppState) que enxergariam o state de quando foram
  // criadas. Atualizado NA HORA em cada troca de sessão (antes do registro disparar) e
  // sincronizado do state como rede de segurança para o setUsuario exposto no contexto.
  const usuarioIdRef = useRef(null)
  // Retentativa em curso do registrarPushToken: { timer, usuarioId }. Uma só por vez —
  // uma chamada nova (tentativa 0) cancela a agendada, e logout/unmount também.
  const retentativaPushRef = useRef(null)

  const cancelarRetentativaPush = () => {
    if (retentativaPushRef.current?.timer) clearTimeout(retentativaPushRef.current.timer)
    retentativaPushRef.current = null
  }

  useEffect(() => { usuarioIdRef.current = usuario?.id ?? null }, [usuario])

  // Mantém a cópia local em dia com QUALQUER caminho que mude a sessão — login, cadastro,
  // revalidação, restore e os setUsuario/setAssinatura expostos às telas (boas-vindas,
  // edição de perfil). Um só ponto de escrita, em vez de um em cada chamador. Com usuario
  // nulo não grava: o logout é quem limpa, e nulo não é "sessão vazia" a preservar.
  useEffect(() => {
    if (usuario) gravarSessaoCache(usuario, assinatura)
  }, [usuario, assinatura])

  useEffect(() => {
    configurarCanalAndroid()
    const restaurarSessao = async () => {
      let u = null, a = null
      try {
        const token = await SecureStore.getItemAsync('token')
        if (token) {
          try {
            const perfil = await comRetry(() => authService.perfil())
            u = comContas(perfil.usuario, perfil.contas)
            a = perfil.assinatura
            usuarioIdRef.current = u?.id ?? null
            registrarPushToken()
          } catch (err) {
            // Só 401/403 é o servidor dizendo que ESTE token não vale (expirado, revogado,
            // conta desativada, usuário inexistente — o middleware `autenticar` da API
            // responde 401 "Usuário não encontrado" e 403 "Conta desativada"): aí sim o
            // token e a cópia local vão embora. 404/410 entram no mesmo grupo por defesa —
            // a API não os emite hoje no GET /auth/perfil, mas significariam "esta conta
            // não existe mais", nunca "a rede falhou". Rede, timeout, 429 e 5xx não dizem
            // nada sobre o token — a sessão segue com a última cópia válida, e o token fica
            // para a próxima sincronização. Sem cópia (primeiro boot depois desta mudança,
            // ou cache perdido) a tela de login aparece, mas o token NÃO é apagado: uma
            // abertura com rede volta a restaurar a sessão sozinha.
            const rejeitado = [401, 403, 404, 410].includes(err.status)
            if (rejeitado) {
              console.log('[AuthContext] token rejeitado pelo servidor — sessão encerrada | status:', err.status, '| codigo:', err.codigo, '| msg:', err.mensagem)
              await SecureStore.deleteItemAsync('token')
              await limparSessaoCache()
            } else {
              const cache = await lerSessaoCache()
              if (cache?.usuario) {
                u = cache.usuario
                a = cache.assinatura ?? null
                usuarioIdRef.current = u?.id ?? null
                console.log('[AuthContext] perfil indisponível no boot — seguindo com a sessão em cache | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
                registrarPushToken()
              } else {
                console.log('[AuthContext] perfil indisponível no boot e sem cache — token mantido, login exibido | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
              }
            }
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
      // Push em PRIMEIRO PLANO: repassa às telas montadas (o detalhe relê a demanda do id).
      emitirPushRecebido(notificacao.request.content?.data)
    })

    notificacaoRespostaRef.current = Notifications.addNotificationResponseReceivedListener(resposta => {
      const data = resposta.notification.request.content.data
      console.log('Notificação tocada:', data)
    })

    return () => {
      notificacaoRecebidaRef.current?.remove()
      notificacaoRespostaRef.current?.remove()
      cancelarRetentativaPush()
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
  // A chave leva o id do usuário: em aparelho compartilhado, o 'concedida' gravado por
  // uma conta não pode suprimir o report da conta seguinte. Sem id (sessão ainda não
  // resolvida) cai na chave global antiga — a chave antiga não é migrada, só fica sem uso.
  const CHAVE_STATUS_PUSH = 'push_status_reportado'
  const chaveStatusPush = () => {
    const id = usuarioIdRef.current
    return id != null ? `${CHAVE_STATUS_PUSH}:${id}` : CHAVE_STATUS_PUSH
  }
  const reportarStatusPush = (status) => {
    ;(async () => {
      try {
        const chave = chaveStatusPush()
        if (status === 'concedida') {
          const anterior = await SecureStore.getItemAsync(chave)
          if (anterior === 'concedida') return
        }
        await comRetry(() => api.post('/auth/push-status', { status }))
        await SecureStore.setItemAsync(chave, status)
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

  // Retentativa com backoff depois de erro_token / erro_envio: 3 tentativas no total
  // (a original + 2), em 30 s e depois 60 s. Só esses dois motivos — os de permissão
  // não mudam sozinhos, e erro_consulta é falha do próprio SO. A retentativa fica presa
  // ao usuário que a agendou: se a sessão mudou (logout cancela, mas a checagem cobre
  // uma troca rápida de conta), ela não dispara sob o bearer de outra pessoa.
  const MAX_TENTATIVAS_PUSH = 3
  const atrasoRetentativaPush = (tentativa) => 30000 * Math.pow(2, tentativa)
  const agendarRetentativaPush = (tentativa, motivo) => {
    const usuarioId = usuarioIdRef.current
    if (usuarioId == null || tentativa + 1 >= MAX_TENTATIVAS_PUSH) return false
    cancelarRetentativaPush()
    const atraso = atrasoRetentativaPush(tentativa)
    const timer = setTimeout(() => {
      retentativaPushRef.current = null
      if (usuarioIdRef.current !== usuarioId) return
      registrarPushToken({ tentativa: tentativa + 1 })
    }, atraso)
    retentativaPushRef.current = { timer, usuarioId }
    console.log('[Push] retentativa agendada | motivo:', motivo, '| tentativa:', tentativa + 2, 'de', MAX_TENTATIVAS_PUSH, '| em ms:', atraso)
    return true
  }

  const registrarPushToken = async ({ tentativa = 0 } = {}) => {
    // Uma chamada nova (login, soft-ask, Perfil, resume) supersede qualquer retentativa
    // pendente: nunca duas cadeias em paralelo sobre o mesmo POST.
    if (tentativa === 0) cancelarRetentativaPush()

    // O canal precisa existir ANTES de pedir o token no Android 8+.
    await configurarCanalAndroid()

    // PROMPT-FREE: só consulta, NUNCA chama requestPermissionsAsync — pedir permissão
    // é responsabilidade do soft-ask (garantirPermissaoConcedida), num momento de
    // relevância. O par (status, canAskAgain) — só do getPermissionsAsync, sem request —
    // separa os três desfechos negativos abaixo; canAskAgain default true = a alegação
    // mais fraca.
    let status
    let canAskAgain = true
    try {
      const atual = await Notifications.getPermissionsAsync()
      status = atual.status
      canAskAgain = atual.canAskAgain
    } catch (err) {
      console.error('[Push] falha ao consultar permissão de notificação | msg:', err?.message, err)
      reportarStatusPush('erro_consulta')
      return { ok: false, motivo: 'erro_consulta', detalhe: err?.message }
    }
    if (status !== 'granted') {
      // Três desfechos, não dois. 'undetermined' no Android significa que o app NUNCA
      // pediu a permissão: o expo grava em SharedPreferences que já perguntou
      // (PermissionsService.didAsk) e só devolve 'denied' depois disso — e no caso
      // undetermined o canAskAgain vem true por definição, então testar só ele
      // classificava como 'negada' quem jamais viu um diálogo. Era o estado de TODO
      // usuário recém-cadastrado, e o servidor não tinha como separar "ainda não
      // perguntamos" de "recusou": os dois chegavam como 'negada', o primeiro
      // acionável (basta pedir na hora certa) e o segundo não.
      const motivo = status === 'undetermined' ? 'nao_solicitada'
        : canAskAgain === false ? 'bloqueada'
        : 'negada'
      console.error('[Push] permissão de notificação NÃO concedida | status:', status, '| motivo:', motivo, '— token não será gerado')
      reportarStatusPush(motivo)
      return { ok: false, motivo }
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
      console.error('[Push] getExpoPushTokenAsync FALHOU | projectId:', projectId, '| tentativa:', tentativa + 1, '| msg:', err?.message, err)
      reportarStatusPush('erro_token')
      const retentativa = agendarRetentativaPush(tentativa, 'erro_token')
      return { ok: false, motivo: 'erro_token', detalhe: err?.message, retentativa }
    }

    try {
      // comRetry como as vizinhas (push-status, :127): era a ÚNICA chamada deste fluxo
      // sem retry, e uma falha transitória de rede derrubava as notificações em silêncio
      // até o próximo login. Gravar o token é idempotente — o destino é um ESTADO, não um
      // recurso novo —, então { timeout } também cobre a variante que some sem resposta.
      // `plataforma` diz ao painel em qual loja este token vive ('ios' | 'android'). Só esses
      // dois valores entram no corpo: fora deles (web, por exemplo) o campo é omitido e o
      // payload fica igual ao de sempre.
      const plataforma = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined
      await comRetry(() => api.post('/auth/push-token', plataforma ? { token: pushToken, plataforma } : { token: pushToken }), { timeout: true })
      console.log('[Push] token registrado com sucesso | projectId:', projectId, '| token:', pushToken)
      return { ok: true, token: pushToken }
    } catch (err) {
      console.error('[Push] POST /auth/push-token FALHOU | status:', err?.status, '| code:', err?.code, '| tentativa:', tentativa + 1, '| msg:', err?.mensagem || err?.message, err)
      reportarStatusPush('erro_envio')
      const retentativa = agendarRetentativaPush(tentativa, 'erro_envio')
      return { ok: false, motivo: 'erro_envio', detalhe: err?.mensagem || err?.message, status: err?.status, retentativa }
    }
  }

  const login = async (email, senha, tipo) => {
    let resposta = await authService.login(email, senha, tipo)
    // Múltiplas contas no mesmo e-mail: sem `tipo` e com 2+ itens em `contas`, a sessão NÃO
    // é gravada — a LoginScreen mostra o "Entrar como:" e repete o login com o tipo
    // escolhido. Sem o campo `contas`, ou com 1 conta só, segue o fluxo de sempre.
    if (!tipo && Array.isArray(resposta?.contas) && resposta.contas.length >= 2) {
      // Último perfil usado neste aparelho (utils/contas): se ainda existe entre as contas
      // devolvidas, repete o login com ele e entra direto, sem "Entrar como:". Falhando a
      // repetição (conta sumiu entre as duas chamadas, rede), volta a resposta com `contas`
      // e a LoginScreen mostra a escolha como antes.
      //
      // A API devolve `token` (da conta mais antiga) JUNTO de `contas`; devolver a resposta
      // inteira deixava a LoginScreen sem reação, porque ela só mostra a escolha sem token.
      // Por isso a saída para a escolha é só `{ contas }`: sessão não gravada, token fora.
      //
      // Sem perfil lembrado que sirva, a escolha só aparece quando a pessoa tem os DOIS lados
      // (Contratar e Trabalhar): com todas as contas do mesmo lado entra direto na última usada
      // daquele lado, senão na primeira (utils/contas.tipoDoLadoUnico).
      const salvo = await lerUltimoTipo(email)
      const escolha = { contas: resposta.contas }
      const tipos = tiposDasContas(resposta.contas)
      const direto = salvo && tipos.includes(salvo) ? salvo : await tipoDoLadoUnico(email, tipos)
      if (!direto) return escolha
      try {
        resposta = await authService.login(email, senha, direto)
      } catch (err) {
        console.log('[AuthContext] login direto falhou, mostrando a escolha | tipo:', direto, '| status:', err?.status, '| codigo:', err?.codigo)
        return escolha
      }
      if (Array.isArray(resposta?.contas) && !resposta?.token) return resposta
    }
    await gravarSessao(email, resposta)
    return resposta
  }

  // "Continuar com Google/Apple": `credencial` = { provedor, id_token, nome } (services/
  // loginSocial). Mesmo caminho do login por senha a partir da resposta — POST /auth/social
  // responde byte a byte como /auth/login quando o e-mail tem conta — com duas saídas a mais:
  //   { novo: true, nome, email, ticket }  → sem conta: a tela abre o cadastro com o ticket.
  //   { escolher: true, contas, email, ultimoTipo } → 2+ contas e nenhum perfil lembrado que
  //     sirva: a tela mostra o "Entrar como:" e repete com `tipo` (o token NÃO é gravado).
  // A credencial é reaproveitada na repetição (o id_token vale ~1h no Google, 10 min na Apple).
  const loginSocial = async (credencial, tipo) => {
    let resposta = await authService.loginSocial({ ...credencial, ...(tipo ? { tipo } : {}) })
    if (resposta?.novo) return resposta
    const email = String(resposta?.usuario?.email || '').trim().toLowerCase()
    if (!tipo && Array.isArray(resposta?.contas) && resposta.contas.length >= 2) {
      const salvo = await lerUltimoTipo(email)
      const escolha = { escolher: true, contas: resposta.contas, email, ultimoTipo: salvo || null }
      // Mesma regra do login por senha: perfil lembrado, senão o lado único, senão a escolha.
      const tipos = tiposDasContas(resposta.contas)
      const direto = salvo && tipos.includes(salvo) ? salvo : await tipoDoLadoUnico(email, tipos)
      if (!direto) return escolha
      try {
        resposta = await authService.loginSocial({ ...credencial, tipo: direto })
      } catch (err) {
        console.log('[AuthContext] login social direto falhou, mostrando a escolha | tipo:', direto, '| status:', err?.status, '| codigo:', err?.codigo)
        return escolha
      }
      if (!resposta?.token) return escolha
    }
    await gravarSessao(email, resposta)
    return resposta
  }

  // Grava a sessão de uma resposta de login (senha ou social) que trouxe `token`.
  const gravarSessao = async (email, resposta) => {
    // Defensivo: em aparelho compartilhado, um login (de qualquer usuário) descarta
    // um eventual rascunho de cadastro pré-auth que tenha ficado, para não ressurgir
    // para outra pessoa. Best-effort, não bloqueia o login.
    limparRascunhoCadastro().catch(() => {})
    await SecureStore.setItemAsync('token', resposta.token)
    // Só depois do authService.login ter voltado sem erro: o e-mail guardado é o do último
    // login que DEU CERTO, então uma tentativa com e-mail errado não passa a preencher a
    // tela para sempre.
    //
    // A normalização é repetida aqui em vez de confiar na que a LoginScreen já faz (:33).
    // Não é redundância inútil: `login` é uma função do contexto e qualquer chamador futuro
    // a alcança sem passar por aquela tela — e um e-mail gravado com espaço ou maiúscula
    // voltaria assim ao campo. Sendo idempotente, quem já normalizou não perde nada.
    //
    // Best-effort e isolado: gravar isto é conveniência, e uma falha do SecureStore não
    // pode derrubar um login que o servidor já aceitou.
    try {
      await SecureStore.setItemAsync(CHAVE_ULTIMO_EMAIL, String(email || '').trim().toLowerCase())
    } catch (err) {
      console.log('[AuthContext] falha ao guardar o último e-mail (login segue) | msg:', err?.message)
    }
    usuarioIdRef.current = resposta.usuario?.id ?? null
    setUsuario(comContas(resposta.usuario, resposta.contas))
    setAssinatura(resposta.assinatura)
    setMostrarBoasVindas(deveExibirBoasVindas(resposta.usuario, resposta.assinatura))
    setTimeout(() => registrarPushToken(), 1000)
    // Memória do perfil que entrou: é ela que faz o próximo login deste e-mail ser direto.
    gravarUltimoTipo(email, tipoDaConta(resposta.usuario))
  }

  // Função usada após cadastro, trocar de perfil e adicionar perfil — recebe token e dados
  // diretamente. `contas` (payload do login) vai para usuario.contas quando vier.
  const loginComToken = async (token, usuarioDados, assinaturaDados, contas) => {
    await SecureStore.setItemAsync('token', token)
    usuarioIdRef.current = usuarioDados?.id ?? null
    setUsuario(comContas(usuarioDados, contas))
    // Trocar de perfil e "Criar e entrar" passam por aqui: o perfil novo vira o lembrado.
    gravarUltimoTipo(usuarioDados?.email, tipoDaConta(usuarioDados))
    setAssinatura(assinaturaDados || null)
    setMostrarBoasVindas(deveExibirBoasVindas(usuarioDados, assinaturaDados || null))
    setTimeout(() => registrarPushToken(), 1000)
  }

  const logout = async () => {
    // Retentativa pendente morreria sob o bearer errado (ou sem bearer): cancela ANTES
    // de tocar no token, e zera o id para uma retentativa em voo não se agendar de novo.
    cancelarRetentativaPush()
    usuarioIdRef.current = null
    // O push_token NÃO é limpo no servidor de propósito. O token identifica o APARELHO,
    // não a sessão, e a mesma pessoa costuma ter mais de uma conta (dono e prestador,
    // por exemplo) no mesmo celular: sair de uma para entrar na outra não pode silenciar
    // a conta que acabou de sair. Aqui só se destrói a sessão local; o servidor continua
    // com o token da conta e o próximo login registra o mesmo token na conta seguinte.
    await SecureStore.deleteItemAsync('token')
    await limparSessaoCache()
    // O último perfil usado (utils/contas) fica DE PROPÓSITO: o próximo login é direto.
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
    const { usuario: lido, assinatura, contas } = await comRetry(() => authService.perfil())
    const usuario = comContas(lido, contas)
    usuarioIdRef.current = usuario?.id ?? null
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
      loginSocial,
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