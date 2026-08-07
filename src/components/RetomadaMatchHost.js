import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { navigationRef } from '../navigation/navigationRef'

// Redirecionamento de UMA vez por abertura/login: quem tem serviço em andamento (match
// fechado e ainda não encerrado) abre o app NELE, e não na aba inicial — que para o dono
// é um formulário em branco ("Novo Reparo"/"Nova Obra") e para o prestador é o feed das
// demandas dos outros. Com mais de um em andamento não dá para escolher pela pessoa:
// leva à lista, onde ela escolhe.
//
// NÃO reage ao foreground — de propósito não existe listener de AppState aqui. Voltar ao
// app depois de atender uma ligação não pode sequestrar a tela em que a pessoa estava.
// Dispara só quando usuario.id MUDA: cold start com sessão salva, ou login.
//
// E cede a vez à notificação: se o app foi aberto por um toque, aquele destino é mais
// específico do que "seu serviço em andamento" e já está a caminho — a checagem que
// desiste está no início do efeito, antes do fetch.
//
// Separado do CelebracaoMatchHost embora leia os mesmos dados, porque as decisões são
// diferentes: lá é "comemorar uma vez" (com marca d'água em disco); aqui é "onde a pessoa
// deveria estar agora". Compartilhar o fetch amarraria o roteamento à marca d'água da
// celebração — um match já comemorado deixaria de redirecionar.

// As duas grafias de aceite (ver STATUS_GRUPO em ContratosScreen.js:24). Sem 'aprovada'
// o profissional que fechou pelo endpoint legado nunca seria retomado.
const ACEITO = ['aceito', 'aprovada']

// Um perfil por papel: de onde ler, o que conta como "em andamento", qual id abrir e para
// onde navegar. Os pares aba/tela são os mesmos que o roteador de notificações usa.
const perfilDe = (u) => {
  if (u.role === 'dono_obra' && u.tipo_dono === 'reparo') return {
    url: '/reparos/minhas',
    linhas: (r) => r.reparos || [],
    // Dono: a demanda é dele. Match fechado e ainda não encerrada.
    emAndamento: (x) => !!x.match_feito_em && x.match_usuario_id != null && x.status !== 'encerrada',
    idDemanda: (x) => x.id,
    tab: 'Meus Reparos', detalhe: 'DetalheReparo', param: 'reparo',
  }
  if (u.role === 'dono_obra' && u.tipo_dono === 'pintura') return {
    url: '/obras/minhas',
    linhas: (r) => r.obras || [],
    emAndamento: (x) => !!x.match_feito_em && x.match_usuario_id != null && x.status !== 'encerrada',
    idDemanda: (x) => x.id,
    tab: 'Minhas Obras', detalhe: 'DetalheObra', param: 'obra',
  }
  if (u.role === 'prestador' && u.tipo_prestador !== 'pintor') return {
    url: '/reparos/meus-interesses',
    linhas: (r) => r.ativos || [],
    // Prestador: a linha é a PROPOSTA dele. Em andamento = proposta aceita num reparo
    // que segue aberto; o id a abrir é o do reparo, não o do interesse.
    emAndamento: (x) => ACEITO.includes(x.status) && x.reparo_status !== 'encerrada',
    idDemanda: (x) => x.reparo_id,
    tab: 'Meus Reparos', detalhe: 'DetalheReparo', param: 'reparo',
  }
  if ((u.role === 'prestador' && u.tipo_prestador === 'pintor') || u.role === 'assinante') return {
    url: '/candidaturas/minhas',
    linhas: (r) => r.candidaturas || [],
    emAndamento: (x) => ACEITO.includes(x.status) && x.obra_status !== 'encerrada',
    idDemanda: (x) => x.obra_id,
    tab: 'Minhas Obras', detalhe: 'DetalheObra', param: 'obra',
  }
  return null
}

// As abas existem? O Stack raiz monta UM ramo só (AppNavigator.js:738): sem assinatura
// 'ativa' quem está montado é Verificacao/Pagamento, com boas-vindas pendentes é a tela
// de boas-vindas, e o dono sem tipo_dono cai num stack de nomes diferentes. Em qualquer
// desses casos os nomes de aba abaixo não resolvem — melhor não tentar navegar.
const tabsMontadas = (u, assinatura, mostrarBoasVindas) => {
  if (u.role === 'dono_obra') return u.tipo_dono === 'reparo' || u.tipo_dono === 'pintura'
  return assinatura?.status === 'ativa' && !mostrarBoasVindas
}

export default function RetomadaMatchHost() {
  const { usuario, assinatura, mostrarBoasVindas } = useAuth()
  // Guarda por usuário, não booleano de módulo: logar em outra conta na mesma sessão é
  // uma nova abertura do ponto de vista de quem entrou.
  const jaRodouRef = useRef(null)

  useEffect(() => {
    const uid = usuario?.id
    if (uid == null) return
    if (jaRodouRef.current === String(uid)) return
    // Marca ANTES de qualquer saída: uma tentativa por usuário por execução, mesmo quando
    // desistimos aqui. Sem isto, uma mudança posterior de assinatura/boas-vindas
    // dispararia o redirecionamento no meio do uso.
    jaRodouRef.current = String(uid)

    if (!tabsMontadas(usuario, assinatura, mostrarBoasVindas)) return
    const cfg = perfilDe(usuario)
    if (!cfg) return

    ;(async () => {
      try {
        // App aberto por TOQUE em notificação: aquele destino ganha, sempre. Ele é mais
        // específico ("este reparo, agora") e o roteador já o está executando com 500ms
        // de atraso (AppNavigator.js:711) — sem esta saída, quem venceria a corrida
        // dependeria da latência do fetch abaixo. Sair ANTES do api.get também poupa a
        // requisição que seria descartada.
        // Se a consulta em si falhar, cai no catch e NÃO redireciona: entre atropelar a
        // notificação e não retomar nada, não retomar é o lado seguro.
        const respostaNotificacao = await Notifications.getLastNotificationResponseAsync()
        if (respostaNotificacao) return

        const resp = await api.get(cfg.url)
        const abertos = cfg.linhas(resp).filter(cfg.emAndamento)
        if (abertos.length === 0) return

        const nav = navigationRef.current
        if (!nav) return

        if (abertos.length > 1) { nav.navigate(cfg.tab); return }

        const id = cfg.idDemanda(abertos[0])
        // Sem id não dá para abrir o detalhe; a lista ainda é melhor que a aba inicial.
        if (id == null) { nav.navigate(cfg.tab); return }
        nav.navigate(cfg.tab, { screen: cfg.detalhe, params: { [cfg.param]: { id } }, initial: false })
      } catch (err) {
        // Silencioso: isto é uma comodidade, não um fluxo. Falhando, a pessoa fica na aba
        // inicial de sempre — que é exatamente o comportamento anterior a este componente.
        console.log('[RetomadaMatch] falha ao checar serviços em andamento | code:', err.code)
      }
    })()
  }, [usuario?.id, assinatura?.status, mostrarBoasVindas])

  return null
}
