import React, { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, AppState } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { navigationRef } from '../navigation/navigationRef'
import { perfilDe, tabsMontadas } from './RetomadaMatchHost'
import { textoFasePosMatch } from './Agendamento'
import { cores, raios, alturas } from '../utils/tema'

// Barra PERSISTENTE do serviço em andamento: enquanto existe um combinado de pé, o app
// oferece um caminho de volta para ele de qualquer aba. O RetomadaMatchHost leva a pessoa
// até lá UMA vez, na abertura e na volta do 2º plano; depois disso, quem navegou para outro
// lugar só reencontrava o serviço procurando na lista. Esta barra é o atalho que fica.
//
// Montada como o BannerNotificacaoBloqueada — overlay sem props em App.js, lê useAuth(),
// devolve null enquanto a condição não vale —, mas ancorada EMBAIXO: o topo já é dos dois
// banners de aviso, e esta não é um alerta, é um atalho. Um alerta interrompe; um atalho
// espera ser tocado.
//
// Os dados saem dos MESMOS predicados do RetomadaMatchHost (perfilDe/tabsMontadas): o que
// conta como "em andamento" e para onde se navega é uma decisão só. Duplicá-la faria a barra
// apontar para um lugar diferente do que a retomada da abertura escolhe, com os mesmos dados.
// Presença da barra, para telas com rodapé FIXO (CadastrarReparoScreen, o "Continuar" do
// wizard) reservarem a altura dela só enquanto ela existe — sem isto o botão ficava atrás da
// barra, ou a tela gastava 48 px à toa quando não há serviço em andamento. A barra publica
// depois de cada render (effect sem deps lendo um ref): hooks ficam antes dos `return null`
// e a ordem deles não muda. Nada do comportamento da barra depende disto.
const ouvintesPresenca = new Set()
let presencaAtual = false
const publicarPresenca = (v) => {
  if (v === presencaAtual) return
  presencaAtual = v
  ouvintesPresenca.forEach((fn) => fn(v))
}
export const useBarraServicoVisivel = () => {
  const [visivel, setVisivel] = useState(presencaAtual)
  useEffect(() => {
    ouvintesPresenca.add(setVisivel)
    setVisivel(presencaAtual)
    return () => { ouvintesPresenca.delete(setVisivel) }
  }, [])
  return visivel
}

const BarraServicoEmAndamento = () => {
  const { usuario, assinatura, mostrarBoasVindas } = useAuth()
  const { bottom } = useSafeAreaInsets()
  // Começa false a cada render; só vira true logo antes do return que desenha a barra.
  const presencaRef = useRef(false)
  presencaRef.current = false
  useEffect(() => { publicarPresenca(presencaRef.current) })
  useEffect(() => () => publicarPresenca(false), [])
  // Começa vazia: durante a consulta a barra não aparece, para nunca anunciar um serviço
  // antes de saber que ele existe. Mesma disciplina do `bloqueada` do banner de notificação.
  const [abertos, setAbertos] = useState([])
  // Segundo estado da MESMA barra (nunca uma segunda barra): demandas com proposta sem
  // resposta. Só um dos dois aparece — ver a precedência no render.
  const [aguardando, setAguardando] = useState([])
  // Rota atual em ESTADO, não lida direto do navigationRef na hora de renderizar: navegar não
  // re-renderiza este componente por si só (ele está fora da árvore de telas), então uma
  // leitura direta congelaria no valor da primeira montagem e a barra nunca sumiria.
  const [rota, setRota] = useState(null)
  const buscandoRef = useRef(false)
  const ultimaRef = useRef(0)

  // forcar=true (login / foreground) consulta já; a troca de tela passa pelo intervalo de
  // 15 s, senão cada toque numa aba viraria uma requisição. Mesmo par do CelebracaoMatchHost,
  // que roda nos mesmos três momentos.
  const buscar = useCallback(async (forcar = false) => {
    if (buscandoRef.current) return
    // Sem sessão, sem abas montadas ou sem perfil não há barra: ela navega para as abas e se
    // apoia na altura delas, então fora desse mundo não teria para onde levar. Limpa o estado
    // em vez de só sair — ao trocar de conta, o serviço da conta anterior não pode ficar na
    // tela da nova.
    if (!usuario || !tabsMontadas(usuario, assinatura, mostrarBoasVindas)) { setAbertos([]); setAguardando([]); return }
    const cfg = perfilDe(usuario)
    if (!cfg) { setAbertos([]); setAguardando([]); return }
    const agora = Date.now()
    if (!forcar && agora - ultimaRef.current < 15000) return
    ultimaRef.current = agora
    buscandoRef.current = true
    try {
      // O perfil principal mais as fontes extras (só o DONO as tem: as obras, ao lado dos
      // serviços — lado contratante unificado). Sem extras é uma requisição e uma resposta,
      // como sempre. Cada linha carrega a fonte de onde veio ({ f, x }), porque é a fonte
      // que sabe o destino, o vocabulário e o que conta como pendente — mesmo desenho do
      // RetomadaMatchHost.
      const fontes = [cfg, ...(cfg.extras || [])]
      const respostas = await Promise.all(fontes.map((f) => api.get(f.url)))
      const linhas = fontes.flatMap((f, i) => f.linhas(respostas[i]).map((x) => ({ f, x })))
      setAbertos(linhas.filter(({ f, x }) => f.emAndamento(x)))
      // Mesma resposta, sem requisição nova: a contagem de propostas sem resposta já vem
      // nas linhas do dono (candidaturas_pendentes / interesses_pendentes).
      // Fora da lista, por ordem: quem já tem match (a barra de "em andamento" ganha e
      // contá-la aqui inflaria o plural), encerrada e EXPIRADA — o servidor conta por id
      // da demanda, sem olhar o estado dela, e cobrar resposta sobre algo que o dono não
      // pode mais responder gasta a credibilidade da própria barra.
      setAguardando(linhas.filter(({ f, x }) =>
        (f.pendentes?.(x) ?? 0) > 0 &&
        !f.emAndamento(x) &&
        x.status !== 'encerrada' &&
        !x.expirada
      ))
    } catch (err) {
      // Mantém o que já estava na tela: a barra é um atalho, e uma falha de rede não é
      // notícia de que o serviço acabou. Somar a isso um sumiço da barra tiraria o caminho
      // de volta justamente de quem está com a conexão ruim.
      console.log('[BarraServico] falha ao buscar serviços em andamento | code:', err.code)
    } finally {
      buscandoRef.current = false
    }
  }, [usuario, assinatura, mostrarBoasVindas])

  // Login / troca de usuário / mudança de assinatura ou boas-vindas.
  useEffect(() => { buscar(true) }, [buscar])

  // Volta do 2º plano: o serviço pode ter sido encerrado pela outra parte com o app fora.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => { if (estado === 'active') buscar(true) })
    return () => sub.remove()
  }, [buscar])

  // Troca de tela/aba: é aqui que o match RECÉM-fechado aparece — quem acabou de aceitar não
  // volta ao 2º plano para ver a barra surgir. A consulta é throttled pelos 15 s de buscar();
  // a rota, não: ela é leitura local e precisa acompanhar cada navegação, senão a barra
  // demoraria até 15 s para sumir ao entrar no detalhe.
  // Sincroniza uma vez ao registrar, porque a primeira tela já está montada quando isto roda.
  useEffect(() => {
    const nav = navigationRef.current
    if (!nav?.addListener) return
    const sincronizar = () => {
      setRota(nav.getCurrentRoute?.() || null)
      buscar()
    }
    sincronizar()
    return nav.addListener('state', sincronizar)
  }, [buscar, usuario])

  if (!usuario) return null
  const cfg = perfilDe(usuario)
  if (!cfg) return null

  // PRECEDÊNCIA: um serviço em andamento manda na barra. É o compromisso já fechado, com
  // hora marcada e outra pessoa esperando; uma proposta sem resposta pode esperar o
  // próximo toque. Enquanto houver `abertos`, tudo abaixo se comporta exatamente como
  // antes — esta mudança só pode afetar a sessão que hoje não veria barra nenhuma.
  const emAndamento = abertos.length > 0
  const linhas = emAndamento ? abertos : aguardando
  if (linhas.length === 0) return null

  const um = linhas.length === 1
  // Já está no detalhe DESTA demanda: a barra não tem para onde levar e ainda flutua por cima
  // dos botões de ação da tela (encerrar, confirmar chegada). Some.
  // Os != null vêm ANTES da comparação em String, mesma disciplina dos flags de identidade
  // das telas de detalhe: dois ids ausentes viram String(undefined) dos dois lados e casariam,
  // escondendo a barra em qualquer detalhe que chegasse sem params.
  // Vale para QUALQUER uma das linhas da barra, não só quando há uma: com 2+ serviços a barra
  // flutuava por cima das telas únicas (Agendado / A caminho / Em andamento) do próprio serviço.
  // Detalhe e param são os da FONTE de cada linha: o dono tem serviços e obras na mesma barra.
  const noDetalheDesta = linhas.some(({ f, x }) => {
    const idRota = rota?.params?.[f.param]?.id
    const id = f.idDemanda(x)
    return rota?.name === f.detalhe && idRota != null && id != null && String(idRota) === String(id)
  })
  if (noDetalheDesta) return null

  // O vocabulário sai do param da fonte de cada linha ('reparo' | 'obra'), sem campo novo:
  // uma obra chama-se obra, e "1 serviço" soaria de outra tela. Com várias linhas de tipos
  // DIFERENTES (só o dono) o plural é "pedidos" — nem "obras" nem "serviços" cobre as duas.
  const primeira = linhas[0]
  const ehObra = primeira.f.param === 'obra'
  const misto = linhas.some(({ f }) => f.param !== primeira.f.param)
  const plural = misto ? 'pedidos' : ehObra ? 'obras' : 'serviços'
  // Título da linha quando há UMA. Pode faltar — as candidaturas do pintor nem sempre trazem
  // titulo (ver os guardas em DetalheObraScreen) —, e aí o rótulo genérico ainda cumpre o
  // papel da barra, que é levar de volta.
  // "interessado(s)" é o vocabulário que o dono já lê no banner de parabéns; não se inventa
  // "candidatura"/"proposta" aqui só porque o campo do servidor tem outro nome.
  // UM serviço com match e ainda sem "Estou a caminho": a barra diz a fase do agendamento
  // (components/Agendamento — sem proposta, proposta pendente, agendado), nos dois lados.
  // null depois do a_caminho_em (ou sem o campo, como nas linhas do profissional enquanto o
  // endpoint não o manda): aí vale o texto de sempre.
  const souDono = usuario.role === 'dono_obra'
  const fase = emAndamento && um ? textoFasePosMatch(primeira.x, souDono) : null
  const rotulo = emAndamento
    ? (um
        ? (fase
            ? `${fase}${primeira.x.titulo ? ` · ${primeira.x.titulo}` : ''}`
            : primeira.x.titulo
              ? `${ehObra ? 'Obra em andamento!' : 'Serviço em andamento!'} ${primeira.x.titulo}`
              : (ehObra ? 'Obra em andamento' : 'Serviço em andamento'))
        : `${linhas.length} ${plural} em andamento`)
    : (um
        ? `${primeira.x.titulo || (ehObra ? 'Obra' : 'Serviço')} · ${primeira.f.pendentes?.(primeira.x) ?? 0} interessado(s) aguardando resposta`
        : `${linhas.length} ${plural} com interessados aguardando`)

  // Uma leva ao detalhe; várias à lista, porque com mais de um combinado de pé não dá para
  // escolher pela pessoa. Mesma decisão (e mesma ordem de desistências) do RetomadaMatchHost.
  const abrir = () => {
    const nav = navigationRef.current
    if (!nav) return
    if (!um) { nav.navigate(cfg.tab); return }
    const { f, x } = primeira
    const id = f.idDemanda(x)
    // Sem id não dá para abrir o detalhe; a lista ainda é melhor que não fazer nada.
    if (id == null) { nav.navigate(f.tab); return }
    nav.navigate(f.tab, { screen: f.detalhe, params: { [f.param]: { id } }, initial: false })
  }

  presencaRef.current = true
  return (
    <TouchableOpacity
      style={[estilos.barra, { bottom: alturas.tabBar + bottom }]}
      onPress={abrir}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}. Toque para abrir.`}
    >
      {/* Emoji fora do rotulo, como sempre: o accessibilityLabel acima lê só o texto. */}
      <Text style={estilos.texto} numberOfLines={1}>{emAndamento ? (fase ? '' : '▶️ ') : '📬 '}{rotulo}</Text>
      {/* Uma leva ao detalhe ("Abrir"); várias levam à lista ("Ver"). */}
      <View style={estilos.pill}>
        <Text style={estilos.pillTexto}>{um ? 'Abrir →' : 'Ver →'}</Text>
      </View>
    </TouchableOpacity>
  )
}

const estilos = StyleSheet.create({
  // bottom sai do render (altura da barra de abas + inset do aparelho), o resto é fixo.
  // zIndex 9999 como os dois banners do topo: os três são overlays globais, e este ocupa a
  // borda oposta, então o empate nunca vira disputa — nenhum cobre o outro.
  barra: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: cores.primaria,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  // Preto sobre a laranja primária, como o texto de todo botão primário do app.
  texto: {
    color: '#0A0A0A',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  pill: {
    backgroundColor: '#0A0A0A',
    borderRadius: raios.pequeno,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillTexto: {
    color: cores.primaria,
    fontSize: 12,
    fontWeight: '700',
  },
})

export default BarraServicoEmAndamento
