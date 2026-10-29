import { useEffect, useRef, useCallback } from 'react'
import { AppState } from 'react-native'
import * as Notifications from 'expo-notifications'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { navigationRef } from '../navigation/navigationRef'

// Redirecionamento para o serviço em andamento: quem tem match fechado e ainda não
// encerrado abre o app NELE, e não na aba inicial — que para o dono é um formulário em
// branco ("Novo Reparo"/"Nova Obra") e para o prestador é o feed das demandas dos outros.
// Com mais de um em andamento não dá para escolher pela pessoa: leva à lista.
//
// Roda em DOIS momentos: no login/abertura (uma vez por usuário) e a cada volta do 2º
// plano. O foreground importa porque é a transição típica de quem está trabalhando —
// atendeu uma ligação, olhou o mapa, voltou —, e é justamente aí que a pessoa quer o
// serviço na frente. Para não sequestrar a tela, as desistências:
//   1. não está na tela de pouso, voltando do 2º plano: em qualquer outra tela (detalhe,
//      lista, perfil, um cadastro empilhado) a pessoa escolheu estar ali, e voltar de uma
//      ligação não desfaz essa escolha. Só no foreground — no login não há escolha anterior
//      a preservar —, e conferida duas vezes, antes e depois do fetch. Para o DONO a tela
//      de pouso é o formulário de cadastro, e dela só se desiste enquanto ele está EM USO:
//      algo digitado, mídia anexada ou a câmera/galeria ainda não devolvida (ver `cadastro`
//      abaixo). Enviado ou limpo o formulário, o redirecionamento volta a valer na mesma
//      sessão. (A regra "só da tela de pouso pristina", de ac8ccddf, marcava qualquer
//      passagem pelo formulário e silenciava o redirecionamento pelo resto da sessão.)
//   2. notificação, só no arranque frio: se o app SUBIU de um toque, aquele destino é mais
//      específico e já está a caminho (AppNavigator.js:723). Nos outros disparos não se
//      pergunta: a resposta seria aquele mesmo toque, já navegado, pelo resto do processo.
//
// Separado do CelebracaoMatchHost embora leia os mesmos dados, porque as decisões são
// diferentes: lá é "comemorar uma vez" (com marca d'água em disco); aqui é "onde a pessoa
// deveria estar agora". Compartilhar o fetch amarraria o roteamento à marca d'água da
// celebração — um match já comemorado deixaria de redirecionar.

// Nome da tela de pouso de cada papel (`telaInicial` no perfil abaixo): a raiz da PRIMEIRA
// aba do navegador dele, que é onde o app cai sem intervenção. É o único lugar de onde o
// retorno do 2º plano redireciona — ver a regra em checar().

// As duas grafias de aceite (ver STATUS_GRUPO em ContratosScreen.js:24). Sem 'aprovada'
// o profissional que fechou pelo endpoint legado nunca seria retomado.
const ACEITO = ['aceito', 'aprovada']

// Um perfil por papel: de onde ler, o que conta como "em andamento", qual id abrir e para
// onde navegar. Os pares aba/tela são os mesmos que o roteador de notificações usa.
// Exportado (como o celebracaoRef sai do CelebracaoMatchHost) porque a BarraServicoEmAndamento
// responde à MESMA pergunta — quais serviços estão de pé e para onde levam. Duas cópias
// divergiriam no dia seguinte: a barra apontaria para um lugar e a retomada da abertura para
// outro, com o mesmo usuário e os mesmos dados.
export const perfilDe = (u) => {
  if (u.role === 'dono_obra' && u.tipo_dono === 'reparo') return {
    url: '/reparos/minhas',
    linhas: (r) => r.reparos || [],
    // Dono: a demanda é dele. Match fechado e ainda não encerrada.
    emAndamento: (x) => !!x.match_feito_em && x.match_usuario_id != null && x.status !== 'encerrada',
    // Propostas ainda sem resposta do dono. Definido SÓ nos perfis de dono: prestador não
    // recebe proposta, e omitir (em vez de devolver 0) deixa isso explícito no formato.
    // O servidor conta 'pendente' e 'contraproposta_dono' — contraproposta dos dois lados
    // entra, que é o que o dono precisa responder.
    pendentes: (x) => Number(x.interesses_pendentes) || 0,
    idDemanda: (x) => x.id,
    tab: 'Meus Reparos', detalhe: 'DetalheReparo', param: 'reparo',
    telaInicial: 'CadastrarReparoMain',
    // Fontes ADICIONAIS do mesmo perfil: o dono_reparo também pode ter obras (saída
    // "Pedreiro ou ajudante" de Alvenaria), e um match de obra merece a mesma retomada.
    // Cada extra traz seu próprio destino porque a tela de detalhe muda; a aba é a mesma
    // "Meus Reparos", onde DetalheObra está registrado. Só a retomada lê `extras`; a
    // BarraServicoEmAndamento ignora a chave e segue como antes.
    extras: [{
      url: '/obras/minhas',
      linhas: (r) => r.obras || [],
      emAndamento: (x) => !!x.match_feito_em && x.match_usuario_id != null && x.status !== 'encerrada',
      idDemanda: (x) => x.id,
      tab: 'Meus Reparos', detalhe: 'DetalheObra', param: 'obra',
    }],
  }
  if (u.role === 'dono_obra' && u.tipo_dono === 'pintura') return {
    url: '/obras/minhas',
    linhas: (r) => r.obras || [],
    emAndamento: (x) => !!x.match_feito_em && x.match_usuario_id != null && x.status !== 'encerrada',
    // Mesma razão do perfil de reparo acima; aqui o campo é candidaturas_pendentes.
    pendentes: (x) => Number(x.candidaturas_pendentes) || 0,
    idDemanda: (x) => x.id,
    tab: 'Minhas Obras', detalhe: 'DetalheObra', param: 'obra',
    telaInicial: 'CadastrarObraMain',
  }
  if (u.role === 'prestador' && u.tipo_prestador !== 'pintor') return {
    url: '/reparos/meus-interesses',
    linhas: (r) => r.ativos || [],
    // Prestador: a linha é a PROPOSTA dele. Em andamento = proposta aceita num reparo
    // que segue aberto; o id a abrir é o do reparo, não o do interesse.
    emAndamento: (x) => ACEITO.includes(x.status) && x.reparo_status !== 'encerrada',
    idDemanda: (x) => x.reparo_id,
    tab: 'Meus Reparos', detalhe: 'DetalheReparo', param: 'reparo',
    telaInicial: 'FeedReparosMain',
  }
  if ((u.role === 'prestador' && u.tipo_prestador === 'pintor') || u.role === 'assinante') return {
    url: '/candidaturas/minhas',
    linhas: (r) => r.candidaturas || [],
    emAndamento: (x) => ACEITO.includes(x.status) && x.obra_status !== 'encerrada',
    idDemanda: (x) => x.obra_id,
    tab: 'Minhas Obras', detalhe: 'DetalheObra', param: 'obra',
    telaInicial: 'FeedMain',
  }
  return null
}

// As abas existem? O Stack raiz monta UM ramo só (AppNavigator.js:738): sem assinatura
// 'ativa' quem está montado é Verificacao/Pagamento, com boas-vindas pendentes é a tela
// de boas-vindas, e o dono sem tipo_dono cai num stack de nomes diferentes. Em qualquer
// desses casos os nomes de aba abaixo não resolvem — melhor não tentar navegar.
// Exportado pelo mesmo motivo do perfilDe: a barra do rodapé navega para as mesmas abas e
// se ancora na altura delas, então sem tabs montadas ela não tem para onde levar nem em cima
// de que se apoiar.
export const tabsMontadas = (u, assinatura, mostrarBoasVindas) => {
  if (u.role === 'dono_obra') return u.tipo_dono === 'reparo' || u.tipo_dono === 'pintura'
  return assinatura?.status === 'ativa' && !mostrarBoasVindas
}

// Estado do cadastro do DONO, informado por quem o conhece. A tela de pouso do dono É o
// formulário de cadastro, e o redirecionamento do 2º plano desiste enquanto ele está em uso
// — a pessoa está preenchendo um pedido, não parada na tela em que o app a deixou. Dois
// sinais, cada um de uma fonte:
//   pickerAberto  (a) câmera/galeria lançada de um cadastro e ainda não devolvida. A captura
//                     no Android põe o app em 2º plano; a volta é o pior momento para trocar
//                     de tela. Curto: cai sozinho pouco depois do resultado, porque o 'active'
//                     e a resposta do picker correm na mesma ponte e não há ordem garantida
//                     entre eles (utils/midia.js).
//   comConteudo   (b) o formulário FOCADO tem algo digitado ou mídia anexada
//                     (CadastrarReparoScreen / CadastrarObraScreen). Cai sozinho ao enviar
//                     (campos limpos), ao sair da tela ou ao perder o foco.
// Só são lidos com a rota atual na tela de pouso: fora dela o redirecionamento já desistiu.
export const cadastro = { pickerAberto: false, comConteudo: false }

// Quanto a marca do picker sobrevive ao resultado. Cobre a troca de ordem entre o 'active'
// do AppState e a resolução da promise do picker; o foreground checa ANTES do fetch, então
// o que importa é a marca ainda estar de pé nesse instante.
const PICKER_DEVOLVIDO_MS = 2000
let timerPicker = null
export const pickerLancado = () => {
  clearTimeout(timerPicker)
  cadastro.pickerAberto = true
}
export const pickerDevolvido = () => {
  clearTimeout(timerPicker)
  timerPicker = setTimeout(() => { cadastro.pickerAberto = false }, PICKER_DEVOLVIDO_MS)
}
const cadastroOcupado = () => cadastro.pickerAberto || cadastro.comConteudo

// Arranque frio: o app SUBIU agora. Vale por processo — e não por montagem do componente
// nem por usuário —, porque é exatamente esse o alcance de getLastNotificationResponseAsync:
// ela responde "este processo foi aberto por um toque?", e a resposta não muda mais depois.
// Só a primeira passagem pelo caminho de login/abertura pode ter vindo desse toque; um
// logout/login seguinte acontece com o app já aberto na mão da pessoa.
let arranqueFrio = true

export default function RetomadaMatchHost() {
  const { usuario, assinatura, mostrarBoasVindas } = useAuth()
  // Guarda por usuário, não booleano de módulo: logar em outra conta na mesma sessão é
  // uma nova abertura do ponto de vista de quem entrou.
  const jaRodouRef = useRef(null)
  // Uma checagem por vez: dois foregrounds seguidos (ou foreground logo após o login)
  // disparariam dois fetches e dois navigate concorrentes.
  const rodandoRef = useRef(false)

  const checar = useCallback(async (deForeground, deArranqueFrio) => {
    if (rodandoRef.current) return
    if (usuario?.id == null) return
    if (!tabsMontadas(usuario, assinatura, mostrarBoasVindas)) return
    const cfg = perfilDe(usuario)
    if (!cfg) return

    // Desistência do 2º plano (regra 1 do cabeçalho), ANTES do fetch, de propósito: sem
    // decisão a tomar não se gasta requisição — e o foreground é frequente. Só redireciona
    // da TELA DE POUSO (CadastrarReparoMain / CadastrarObraMain para o dono, o feed para o
    // profissional); nela, o dono ainda fica se o formulário está em uso.
    const desistir = () => {
      const rota = navigationRef.current?.getCurrentRoute?.()?.name
      return rota !== cfg.telaInicial || cadastroOcupado()
    }
    if (deForeground && desistir()) return

    rodandoRef.current = true
    try {
      // App aberto por TOQUE em notificação: aquele destino ganha. Ele é mais específico
      // ("este reparo, agora") e o roteador já o está executando com 500ms de atraso
      // (AppNavigator.js:723) — sem esta saída, quem venceria a corrida dependeria da
      // latência do fetch abaixo. Sair ANTES do api.get também poupa a requisição que
      // seria descartada.
      // Se a consulta em si falhar, cai no catch e NÃO redireciona: entre atropelar a
      // notificação e não retomar nada, não retomar é o lado seguro.
      //
      // SÓ no arranque frio, porque a pergunta que essa API responde é sobre o processo,
      // não sobre este momento: ela devolve o último toque enquanto o processo viver. Um
      // toque em notificação de manhã calaria a retomada em todo foreground e em todo
      // login do resto do dia — um destino que já foi navegado há horas, bloqueando um
      // redirecionamento que não disputa nada com ele.
      if (deArranqueFrio) {
        const respostaNotificacao = await Notifications.getLastNotificationResponseAsync()
        if (respostaNotificacao) return
      }

      // O perfil principal mais as fontes extras (só o dono_reparo as tem). Sem extras a
      // lista tem um item e o caminho é o de sempre: uma requisição, uma resposta. Cada
      // linha aberta carrega a fonte de onde veio, porque é a fonte que sabe o destino.
      const fontes = [cfg, ...(cfg.extras || [])]
      const respostas = await Promise.all(fontes.map(f => api.get(f.url)))
      const abertos = fontes.flatMap((f, i) => f.linhas(respostas[i]).filter(f.emAndamento).map(x => ({ f, x })))
      if (abertos.length === 0) return

      const nav = navigationRef.current
      if (!nav) return

      // Reconfere DEPOIS do fetch: entre a requisição e a navegação a pessoa pode ter saído
      // da tela de pouso, e o resultado do picker ou a primeira letra digitada podem ter
      // chegado nesse meio tempo. A decisão vale para onde ela está agora.
      if (deForeground && desistir()) return

      if (abertos.length > 1) { nav.navigate(cfg.tab); return }

      const { f, x } = abertos[0]
      const id = f.idDemanda(x)
      // Sem id não dá para abrir o detalhe; a lista ainda é melhor que a aba inicial.
      if (id == null) { nav.navigate(f.tab); return }
      nav.navigate(f.tab, { screen: f.detalhe, params: { [f.param]: { id } }, initial: false })
    } catch (err) {
      // Silencioso: isto é uma comodidade, não um fluxo. Falhando, a pessoa fica onde
      // estava — que é exatamente o comportamento anterior a este componente.
      console.log('[RetomadaMatch] falha ao checar serviços em andamento | code:', err.code)
    } finally {
      rodandoRef.current = false
    }
  }, [usuario, assinatura, mostrarBoasVindas])

  // Login / abertura — uma vez por usuário.
  useEffect(() => {
    const uid = usuario?.id
    if (uid == null) return
    if (jaRodouRef.current === String(uid)) return
    // Marca ANTES de chamar: uma tentativa por usuário nesta execução, mesmo que a
    // checagem desista lá dentro. Sem isto, uma mudança posterior de assinatura ou de
    // boas-vindas re-dispararia este caminho no meio do uso.
    jaRodouRef.current = String(uid)
    // A primeira passagem é a abertura do app; da segunda em diante o que mudou foi o
    // usuário — alguém saiu e entrou noutra conta com o app na mão, e essa entrada merece
    // a mesma retomada de sempre, sem o toque de notificação que abriu o processo mandar
    // nela. Baixa a marca antes de chamar, para que a desistência lá dentro não a deixe
    // pendurada e o próximo login herde o arranque frio.
    const primeiraAbertura = arranqueFrio
    arranqueFrio = false
    checar(false, primeiraAbertura)
  }, [usuario?.id, checar])

  // Volta do 2º plano. Sem guarda de "uma vez": aqui a repetição é o ponto — o estado do
  // serviço muda enquanto o app está fora. Quem evita o incômodo são as desistências
  // dentro de checar(), não um contador.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => { if (estado === 'active') checar(true) })
    return () => sub.remove()
  }, [checar])

  return null
}
