import React, { useState, useMemo, useRef } from 'react'
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, PanResponder, StyleSheet, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import TelaPosMatch from '../../components/PosMatchFixo'
import { AvaliacaoConteudo } from '../../components/ModalAvaliacao'
import { CelebracaoAvaliacaoConteudo } from './AvaliacaoRecebidaScreen'
import { AjustarFotoConteudo } from '../../components/AjustarFoto'
import { cores, espacos, larguraMaxima } from '../../utils/tema'

// Galeria OCULTA dos estados do pós-match: a TelaPosMatch REAL (components/PosMatchFixo)
// com dados locais, um caso por página — fase × lado (dono/profissional) × variante, para
// serviço E obra. Entrada única: 7 toques na linha da versão do Perfil (qualquer conta).
// Nada aqui chama a API nem muda estado: todos os handlers são no-op. Serve para conferir
// no aparelho que cada estado cabe entre o cabeçalho e a barra de abas sem rolar.
//
// O cabeçalho tem a MESMA altura da topbar das telas de detalhe (botão 36 + 12 de padding em
// cima e embaixo) e o corpo usa o mesmo wrapper (corpo + larguraMaxima + flex:1), para a área
// útil ser idêntica à real. Anterior/Próximo nos botões ou por deslize horizontal.

const noop = () => {}
const H = 3600000
const MIN = 60000
const iso = (deltaMs) => new Date(Date.now() + deltaMs).toISOString()

const EU = 'eu'
const OUTRO = 'outro'

// selo_bem_avaliado: true exercita o "🏅 Bem avaliado" na linha da nota do mini card.
const PROFISSIONAL = { nome: 'Carlos Henrique da Silva', foto_url: null, avaliacoes_media: 4.8, avaliacoes_total: 23, selo_bem_avaliado: true, especialidades: ['eletrica', 'hidraulica'], telefone: '(11) 98765-4321' }
const CLIENTE = { nome: 'Maria Aparecida Souza', foto_url: null }

// Base da demanda por frente. Títulos e endereços propositalmente LONGOS: a tela corta em 1 linha.
const base = (frente) => frente === 'obra'
  ? { id: 1, titulo: 'Reforma completa da cozinha e da área de serviço com troca de piso', categoria: 'residencial', endereco_obra: 'Rua das Acácias, 1234, apto 52, bloco B — Jardim Paulista, São Paulo', cidade: 'São Paulo', bairro: 'Jardim Paulista', ponto_referencia: 'portão azul ao lado da padaria', valor: 18500, descricao: 'Descrição longa da obra.', dono_nome: CLIENTE.nome, match_usuario_id: OUTRO, match_feito_em: iso(-2 * H), expira_em: iso(26 * H), status: 'aberta' }
  : { id: 1, titulo: 'Trocar o chuveiro elétrico e revisar o disjuntor do banheiro da suíte', categorias: ['eletrica', 'hidraulica', 'marcenaria'], endereco_reparo: 'Rua das Acácias, 1234, apto 52, bloco B — Jardim Paulista, São Paulo', cidade: 'São Paulo', bairro: 'Jardim Paulista', ponto_referencia: 'portão azul ao lado da padaria', valor_estimado: 350, descricao: 'Descrição longa do serviço.', dono_nome: CLIENTE.nome, match_usuario_id: OUTRO, match_feito_em: iso(-2 * H), expira_em: iso(26 * H), status: 'aberta' }

// Cada caso: { fase, lado: 'dono' | 'pro', rotulo, demanda (patch), extra (patch das props) }.
// `propostaPor` diz quem fez a proposta pendente ('eu' | 'outro'); `cancel` 'mim' | 'meu'.
const CASOS = [
  // ── Dono ────────────────────────────────────────────────────────────────────────────
  { lado: 'dono', fase: 'aguardando', rotulo: 'Aguardando horário' },
  { lado: 'dono', fase: 'aguardando', rotulo: 'Aguardando · pedido de cancelamento p/ mim', cancel: 'mim' },
  { lado: 'dono', fase: 'aguardando', rotulo: 'Aguardando · meu pedido de cancelamento', cancel: 'meu' },
  { lado: 'dono', fase: 'proposto', rotulo: 'Horário proposto (recebido)', demanda: { chegada_pendente_em: iso(5 * H), chegada_proposta_por: OUTRO, sugestoes_restantes: 2 } },
  { lado: 'dono', fase: 'proposto', rotulo: 'Horário proposto (enviei)', demanda: { chegada_pendente_em: iso(5 * H), chegada_proposta_por: EU } },
  { lado: 'dono', fase: 'agendado', rotulo: 'Agendado', demanda: { chegada_prevista_em: iso(3 * H) } },
  { lado: 'dono', fase: 'agendado', rotulo: 'Agendado · vigia "o profissional veio?"', demanda: { chegada_prevista_em: iso(-40 * MIN), chegada_janela: 'agendado' }, vigia: true },
  { lado: 'dono', fase: 'agendado', rotulo: 'Agendado · reagendamento do outro', demanda: { chegada_prevista_em: iso(3 * H), chegada_pendente_em: iso(6 * H), chegada_proposta_por: OUTRO, sugestoes_restantes: 1 } },
  { lado: 'dono', fase: 'agendado', rotulo: 'Agendado · meu reagendamento', demanda: { chegada_prevista_em: iso(3 * H), chegada_pendente_em: iso(6 * H), chegada_proposta_por: EU } },
  { lado: 'dono', fase: 'a_caminho', rotulo: 'A caminho', demanda: { chegada_prevista_em: iso(25 * MIN), a_caminho_em: iso(-10 * MIN), prazo_chegada: iso(25 * MIN), tolerancia_ate: iso(40 * MIN), pedidos_atraso_restantes: 2 } },
  { lado: 'dono', fase: 'a_caminho', rotulo: 'A caminho · atrasado', demanda: { chegada_prevista_em: iso(-12 * MIN), a_caminho_em: iso(-50 * MIN), prazo_chegada: iso(-12 * MIN), tolerancia_ate: iso(3 * MIN), atrasado: true, pedidos_atraso_restantes: 2 } },
  { lado: 'dono', fase: 'a_caminho', rotulo: 'A caminho · pedido de atraso', demanda: { chegada_prevista_em: iso(20 * MIN), a_caminho_em: iso(-15 * MIN), prazo_chegada: iso(20 * MIN), tolerancia_ate: iso(35 * MIN), pedidos_atraso_restantes: 1, pedido_atraso: { minutos: 30, motivo: 'trânsito parado na avenida', status: 'pendente', responde_ate: iso(12 * MIN) } } },
  { lado: 'dono', fase: 'a_caminho', rotulo: 'A caminho · pedido de atraso + atrasado', demanda: { chegada_prevista_em: iso(-8 * MIN), a_caminho_em: iso(-45 * MIN), prazo_chegada: iso(-8 * MIN), tolerancia_ate: iso(7 * MIN), atrasado: true, pedidos_atraso_restantes: 1, pedido_atraso: { minutos: 30, motivo: 'trânsito parado na avenida', status: 'pendente', responde_ate: iso(12 * MIN) } } },
  { lado: 'dono', fase: 'a_caminho', rotulo: 'A caminho · chegada declarada', demanda: { chegada_prevista_em: iso(10 * MIN), a_caminho_em: iso(-30 * MIN), prazo_chegada: iso(10 * MIN), chegada_declarada_em: iso(-2 * MIN), chegada_declarada_por: OUTRO } },
  { lado: 'dono', fase: 'a_caminho', rotulo: 'A caminho · tolerância vencida', demanda: { chegada_prevista_em: iso(-30 * MIN), a_caminho_em: iso(-70 * MIN), prazo_chegada: iso(-30 * MIN), tolerancia_ate: iso(-15 * MIN), atrasado: true, chegada_janela: 'agendado', pedidos_atraso_restantes: 0 } },
  { lado: 'dono', fase: 'em_andamento', rotulo: 'Em andamento', demanda: { chegada_prevista_em: iso(-2 * H), a_caminho_em: iso(-2.5 * H), chegada_declarada_em: iso(-2 * H), chegada_confirmada_em: iso(-2 * H) } },
  { lado: 'dono', fase: 'em_andamento', rotulo: 'Em andamento · concluído pelo profissional', demanda: { chegada_prevista_em: iso(-2 * H), a_caminho_em: iso(-2.5 * H), chegada_confirmada_em: iso(-2 * H), encerramento_solicitado_por: OUTRO, encerramento_solicitado_em: iso(-20 * MIN) }, concluidoPeloOutro: true },
  { lado: 'dono', fase: 'em_andamento', rotulo: 'Em andamento · eu pedi o encerramento', demanda: { chegada_prevista_em: iso(-2 * H), a_caminho_em: iso(-2.5 * H), chegada_confirmada_em: iso(-2 * H), encerramento_solicitado_por: EU, encerramento_solicitado_em: iso(-20 * MIN) }, euSolicitei: true },
  // ── Profissional ────────────────────────────────────────────────────────────────────
  { lado: 'pro', fase: 'aguardando', rotulo: 'Aguardando horário' },
  { lado: 'pro', fase: 'aguardando', rotulo: 'Aguardando · pedido de cancelamento p/ mim', cancel: 'mim' },
  { lado: 'pro', fase: 'aguardando', rotulo: 'Aguardando · meu pedido de cancelamento', cancel: 'meu' },
  { lado: 'pro', fase: 'proposto', rotulo: 'Horário proposto (cliente contrapropôs)', demanda: { chegada_pendente_em: iso(5 * H), chegada_proposta_por: OUTRO, sugestoes_restantes: 2 } },
  { lado: 'pro', fase: 'proposto', rotulo: 'Horário proposto (enviei)', demanda: { chegada_pendente_em: iso(5 * H), chegada_proposta_por: EU } },
  { lado: 'pro', fase: 'agendado', rotulo: 'Agendado', demanda: { chegada_prevista_em: iso(3 * H) } },
  { lado: 'pro', fase: 'agendado', rotulo: 'Agendado · reagendamento do outro', demanda: { chegada_prevista_em: iso(3 * H), chegada_pendente_em: iso(6 * H), chegada_proposta_por: OUTRO, sugestoes_restantes: 1 } },
  { lado: 'pro', fase: 'agendado', rotulo: 'Agendado · meu reagendamento', demanda: { chegada_prevista_em: iso(3 * H), chegada_pendente_em: iso(6 * H), chegada_proposta_por: EU } },
  { lado: 'pro', fase: 'a_caminho', rotulo: 'A caminho', demanda: { chegada_prevista_em: iso(25 * MIN), a_caminho_em: iso(-10 * MIN), prazo_chegada: iso(25 * MIN), tolerancia_ate: iso(40 * MIN), pedidos_atraso_restantes: 2 } },
  { lado: 'pro', fase: 'a_caminho', rotulo: 'A caminho · atrasado', demanda: { chegada_prevista_em: iso(-12 * MIN), a_caminho_em: iso(-50 * MIN), prazo_chegada: iso(-12 * MIN), tolerancia_ate: iso(3 * MIN), atrasado: true, pedidos_atraso_restantes: 2 } },
  { lado: 'pro', fase: 'a_caminho', rotulo: 'A caminho · pedido de atraso pendente', demanda: { chegada_prevista_em: iso(20 * MIN), a_caminho_em: iso(-15 * MIN), prazo_chegada: iso(20 * MIN), tolerancia_ate: iso(35 * MIN), pedidos_atraso_restantes: 1, pedido_atraso: { minutos: 30, motivo: 'trânsito', status: 'pendente', responde_ate: iso(12 * MIN) } } },
  { lado: 'pro', fase: 'a_caminho', rotulo: 'A caminho · chegada declarada', demanda: { chegada_prevista_em: iso(10 * MIN), a_caminho_em: iso(-30 * MIN), prazo_chegada: iso(10 * MIN), chegada_declarada_em: iso(-2 * MIN), chegada_declarada_por: EU } },
  { lado: 'pro', fase: 'em_andamento', rotulo: 'Em andamento', demanda: { chegada_prevista_em: iso(-2 * H), a_caminho_em: iso(-2.5 * H), chegada_declarada_em: iso(-2 * H), chegada_confirmada_em: iso(-2 * H) } },
  { lado: 'pro', fase: 'em_andamento', rotulo: 'Em andamento · eu pedi o encerramento', demanda: { chegada_prevista_em: iso(-2 * H), a_caminho_em: iso(-2.5 * H), chegada_confirmada_em: iso(-2 * H), encerramento_solicitado_por: EU, encerramento_solicitado_em: iso(-20 * MIN) }, euSolicitei: true },
  // ── Avaliação do profissional pelo dono (ModalAvaliacao → AvaliacaoConteudo) ─────────
  { lado: 'dono', fase: 'avaliacao', rotulo: 'Avaliação · sem nota', nota: 0 },
  { lado: 'dono', fase: 'avaliacao', rotulo: 'Avaliação · 5 Excelente + etiquetas', nota: 5, etiquetas: 0 },
  { lado: 'dono', fase: 'avaliacao', rotulo: 'Avaliação · 3 Regular', nota: 3 },
  { lado: 'dono', fase: 'avaliacao', rotulo: 'Avaliação · 1 Péssimo', nota: 1 },
  { lado: 'dono', fase: 'avaliacao', rotulo: 'Avaliação · catálogo indisponível', nota: 4, semCatalogo: true },
  // ── Comemoração do profissional (AvaliacaoRecebidaScreen → CelebracaoAvaliacaoConteudo) ──
  { lado: 'pro', fase: 'celebracao', rotulo: 'Avaliação recebida · 5 + destaques do cliente', nota: 5, etiquetas: ['Resolveu de primeira', 'Pontual', 'Deixou tudo limpo'], doContrato: true, selo: true },
  { lado: 'pro', fase: 'celebracao', rotulo: 'Avaliação recebida · 4 + destaques do cliente', nota: 4, etiquetas: ['Pontual', 'Educado'], doContrato: true },
  { lado: 'pro', fase: 'celebracao', rotulo: 'Avaliação recebida · 5, destaques gerais (sem os do contrato)', nota: 5, etiquetas: ['Pontual', 'Educado', 'Caprichoso'], doContrato: false },
  { lado: 'pro', fase: 'celebracao', rotulo: 'Avaliação recebida · 3, sem etiquetas', nota: 3, etiquetas: [] },
]

// Catálogo LOCAL no formato de GET /config/etiquetas-avaliacao (só para a galeria): um grupo
// de reparo (elétrica/hidráulica), o de obra (construcao_pintura) e as universais por nível.
const CATALOGO_GALERIA = {
  niveis: [5, 4, 3, 2, 1].map((nota) => ({ nota, rotulo: { 5: 'Excelente', 4: 'Bom', 3: 'Regular', 2: 'Ruim', 1: 'Péssimo' }[nota] })),
  universais: {
    5: ['Pontual', 'Educado', 'Deixou tudo limpo'], 4: ['Pontual', 'Educado'], 3: ['Atrasou um pouco'],
    2: ['Atrasou', 'Deixou sujeira'], 1: ['Não compareceu', 'Falta de respeito'],
  },
  grupos: [
    { chave: 'eletrica_hidraulica', nome: 'Elétrica e hidráulica', especialidades: ['eletrica', 'hidraulica'],
      etiquetas: { 5: ['Resolveu de primeira', 'Explicou o problema'], 4: ['Resolveu o problema'], 3: ['Precisou voltar'], 2: ['Não resolveu tudo'], 1: ['Piorou o problema'] } },
    { chave: 'construcao_pintura', nome: 'Construção e pintura', especialidades: ['pintura', 'alvenaria'],
      etiquetas: { 5: ['Acabamento impecável', 'Cumpriu o prazo'], 4: ['Bom acabamento'], 3: ['Acabamento irregular'], 2: ['Atrasou a obra'], 1: ['Abandonou a obra'] } },
  ],
  max_por_avaliacao: 5,
}

// "Ajustar foto" (components/AjustarFoto) com uma imagem do próprio app: não depende de
// frente, entra uma vez só. Em modo demo: Concluir mostra o retângulo em pixels, Girar avisa.
const FOTO_EXEMPLO = require('../../../assets/escolha/escolha-trabalhar.png')
const CASOS_FOTO = [
  { lado: 'pro', fase: 'ajustar_foto', rotulo: 'Ajustar foto · perfil (1:1 circular)', modo: 'perfil' },
  { lado: 'pro', fase: 'ajustar_foto', rotulo: 'Ajustar foto · documento (livre)', modo: 'livre', dica: 'Arraste os cantos laranja até as bordas do documento (frente). Use dois dedos para aproximar.' },
  { lado: 'pro', fase: 'ajustar_foto', rotulo: 'Ajustar foto · selfie com documento (livre)', modo: 'livre', dica: 'Deixe seu rosto e o documento inteiros dentro do quadro.' },
]

// Props do AjustarFotoConteudo em modo demo (sem manipulador, sem arquivo gerado).
const propsAjustarFoto = (caso) => {
  const fonte = Image.resolveAssetSource(FOTO_EXEMPLO)
  return { uri: fonte.uri, largura: fonte.width, altura: fonte.height, modo: caso.modo, dica: caso.dica, demo: true, semInsets: true, onConcluir: noop, onCancelar: noop }
}

// Lista final: cada caso para serviço e para obra; os de foto, uma vez.
const TODOS = [...['servico', 'obra'].flatMap((frente) => CASOS.map((c) => ({ ...c, frente }))), ...CASOS_FOTO.map((c) => ({ ...c, frente: null }))]

// Monta as props da TelaPosMatch para um caso — o mesmo mapeamento das telas de detalhe,
// com handlers no-op e os mesmos gates (quem pode o quê) derivados dos dados.
const propsDoCaso = (caso) => {
  const souDono = caso.lado === 'dono'
  const demanda = { ...base(caso.frente), ...(caso.demanda || {}) }
  const ehObra = caso.frente === 'obra'
  const chegadaConfirmada = !!demanda.chegada_confirmada_em
  const chegadaAguardaConfirmacao = !!demanda.chegada_declarada_em && !chegadaConfirmada
  const chegadaNaoDeclarada = !demanda.chegada_declarada_em && !chegadaConfirmada
  const chegadaDeclaradaPorOutro = !!demanda.chegada_declarada_em && demanda.chegada_declarada_por != null && String(demanda.chegada_declarada_por) !== EU
  const podeDizerACaminho = !!demanda.chegada_prevista_em && new Date(demanda.chegada_prevista_em).getTime() - Date.now() < 24 * H
  const mostrarCancelamento = caso.fase === 'aguardando' || caso.fase === 'proposto' || caso.fase === 'agendado'
  const pedidoCancel = caso.cancel ? { por: caso.cancel === 'mim' ? OUTRO : EU, meu: caso.cancel === 'meu', motivo: 'imprevisto', detalhe: '', expira_em: iso(90 * MIN) } : null
  const nomeOutro = souDono ? 'Carlos' : 'Maria'
  const valor = ehObra ? demanda.valor : demanda.valor_estimado
  const telefone = souDono ? PROFISSIONAL.telefone : '(11) 91234-5678'
  return {
    fase: caso.fase,
    demanda,
    frente: caso.frente,
    souDono,
    valor,
    endereco: ehObra ? demanda.endereco_obra : demanda.endereco_reparo,
    pontoReferencia: demanda.ponto_referencia,
    outro: souDono ? PROFISSIONAL : { nome: demanda.dono_nome, foto_url: null },
    usuarioId: EU,
    onExpirar: undefined,
    agendamento: { nomeOutro, limite: demanda.expira_em, enviando: false, onPropor: noop, respondendo: false, onResponder: noop },
    agendado: { podeDizerACaminho, onACaminho: noop, enviandoACaminho: false, vigia: souDono && caso.vigia ? { onResponder: noop } : null },
    aCaminho: {
      telefone,
      onWhatsApp: noop,
      chegada: { naoDeclarada: chegadaNaoDeclarada, aguardaConfirmacao: chegadaAguardaConfirmacao, declaradaPorOutro: chegadaDeclaradaPorOutro, declaradaTexto: 'há 2 min', onChegada: noop, declarando: false, onContestar: noop },
      atraso: { onPedir: !souDono && chegadaNaoDeclarada ? noop : undefined, onResponder: souDono ? noop : undefined, respondendo: false },
      onNaoChegou: souDono && chegadaNaoDeclarada && demanda.chegada_janela === 'agendado' ? noop : undefined,
    },
    emAndamento: {
      telefone,
      onWhatsApp: noop,
      // Mesmos rótulos das telas: dono "Encerrar serviço/obra" (ninguém pediu), "Confirmar
      // conclusão e avaliar" (o profissional pediu), "Aguardando a outra parte" (eu pedi).
      rotuloBotao: caso.euSolicitei
        ? '⏳ Aguardando a outra parte'
        : souDono
          ? (caso.concluidoPeloOutro ? '✅ Confirmar conclusão e avaliar' : (ehObra ? '✅ Encerrar obra' : '✅ Encerrar serviço'))
          : '✅ Serviço concluído',
      onConcluir: noop,
      desabilitado: !!caso.euSolicitei,
      enviando: false,
      encerramentoOutro: souDono && caso.concluidoPeloOutro ? { nome: 'Carlos', solicitadoEm: demanda.encerramento_solicitado_em, automaticoEm: null } : null,
    },
    cancelamento: mostrarCancelamento ? { pedido: pedidoCancel, paraMim: caso.cancel === 'mim', nomeOutro, respondendo: false, onResponder: noop, onAbrir: noop, desabilitado: false } : null,
    links: { onReferencia: souDono ? noop : undefined, onDetalhes: noop, onContrato: noop, onDenunciar: caso.fase === 'em_andamento' ? noop : undefined },
  }
}

// Props do AvaliacaoConteudo para um caso de avaliação: o mesmo componente do ModalAvaliacao,
// com o catálogo local (ou {} quando o caso simula a API fora, o que cai em "a nota já basta").
const propsAvaliacao = (caso) => {
  const ehObra = caso.frente === 'obra'
  const demanda = base(caso.frente)
  const grupo = ehObra ? 'construcao_pintura' : 'eletrica_hidraulica'
  const g = CATALOGO_GALERIA.grupos.find((x) => x.chave === grupo)
  const etiquetasIniciais = caso.etiquetas != null && caso.nota
    ? [...(g.etiquetas[caso.nota] || []), ...(CATALOGO_GALERIA.universais[caso.nota] || [])].slice(0, 3)
    : []
  return {
    nomeAvaliado: PROFISSIONAL.nome,
    profissional: PROFISSIONAL,
    ehObra,
    demanda,
    catalogo: caso.semCatalogo ? { niveis: [], universais: {}, grupos: [] } : CATALOGO_GALERIA,
    notaInicial: caso.nota || 0,
    etiquetasIniciais,
    onEnviar: noop,
    onFechar: noop,
  }
}

// Dados prontos da comemoração do profissional; o compartilhar é no-op (nada sai do aparelho).
const propsCelebracao = (caso) => {
  const demanda = base(caso.frente)
  return {
    dados: {
      nome: PROFISSIONAL.nome, especialidade: 'Elétrica, Hidráulica', nota: caso.nota, etiquetas: caso.etiquetas || [],
      etiquetasDoContrato: !!caso.doContrato, valor: caso.frente === 'obra' ? demanda.valor : demanda.valor_estimado,
      media: PROFISSIONAL.avaliacoes_media, total: PROFISSIONAL.avaliacoes_total, selo: !!caso.selo,
    },
    onVerServicos: noop,
    compartilhar: noop,
  }
}

const NOMES_FASE = { aguardando: 'Aguardando', proposto: 'Proposto', agendado: 'Agendado', a_caminho: 'A caminho', em_andamento: 'Em andamento', avaliacao: 'Avaliação', celebracao: 'Avaliação recebida', ajustar_foto: 'Ajustar foto' }

export default function GaleriaEstadosScreen({ navigation }) {
  const [i, setI] = useState(0)
  const total = TODOS.length
  const caso = TODOS[i]
  const ir = (delta) => setI((atual) => (atual + delta + total) % total)
  // Deslize horizontal (> 40 px, mais horizontal que vertical) troca o caso; toques
  // continuam chegando aos botões, porque o responder só é pedido no movimento.
  const irRef = useRef(ir); irRef.current = ir
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 40 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => { if (g.dx < -40) irRef.current(1); else if (g.dx > 40) irRef.current(-1) },
  })).current

  // Props recalculadas por caso (as datas relativas são lidas na montagem da lista).
  const ehAvaliacao = caso.fase === 'avaliacao'
  const ehCelebracao = caso.fase === 'celebracao'
  const ehFoto = caso.fase === 'ajustar_foto'
  const props = useMemo(() => (
    ehFoto ? propsAjustarFoto(caso) : ehAvaliacao ? propsAvaliacao(caso) : ehCelebracao ? propsCelebracao(caso) : propsDoCaso(caso)
  ), [caso, ehFoto, ehAvaliacao, ehCelebracao])
  const rotulo = ehFoto
    ? `${i + 1}/${total} · ${caso.rotulo}`
    : `${i + 1}/${total} · ${caso.frente === 'obra' ? 'Obra' : 'Serviço'} · ${caso.lado === 'dono' ? 'Dono' : 'Profissional'} · ${caso.rotulo}`

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      {/* Mesma altura da topbar das telas de detalhe (36 + 12 + 12). */}
      <View style={estilos.topbar}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
          <Text style={estilos.btnVoltarTexto}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 8 }}>
          <Text style={estilos.rotulo} numberOfLines={1}>{rotulo}</Text>
          <Text style={estilos.rotuloSub} numberOfLines={1}>{NOMES_FASE[caso.fase]} · dados locais, sem API</Text>
        </View>
        <TouchableOpacity style={estilos.btnNav} onPress={() => ir(-1)} accessibilityRole="button" accessibilityLabel="Anterior">
          <Text style={estilos.btnNavTexto}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[estilos.btnNav, { marginLeft: 6 }]} onPress={() => ir(1)} accessibilityRole="button" accessibilityLabel="Próximo">
          <Text style={estilos.btnNavTexto}>›</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* O MESMO wrapper das telas de detalhe (corpo + larguraMaxima + flex:1). */}
        {/* No "Ajustar foto" o deslize é da própria tela (arrastar a foto): só os botões ‹ ›. */}
        <View style={[estilos.corpo, larguraMaxima, { flex: 1, paddingTop: 4, paddingBottom: 8 }, ehFoto && { paddingHorizontal: 0, paddingBottom: 0 }]} {...(ehFoto ? {} : pan.panHandlers)}>
          {ehFoto ? <AjustarFotoConteudo key={i} {...props} />
            : ehAvaliacao ? <AvaliacaoConteudo key={i} {...props} />
            : ehCelebracao ? <CelebracaoAvaliacaoConteudo key={i} {...props} />
            : <TelaPosMatch key={i} {...props} />}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: espacos.tela, paddingVertical: 12 },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnVoltarTexto: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  rotulo: { fontSize: 12, fontWeight: '700', color: cores.textoForte },
  rotuloSub: { fontSize: 10, color: cores.textoMedio },
  btnNav: { width: 36, height: 36, backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnNavTexto: { color: cores.primaria, fontSize: 22, fontWeight: '800', lineHeight: 26, includeFontPadding: false },
  corpo: { paddingHorizontal: espacos.tela, paddingBottom: 40 },
})
