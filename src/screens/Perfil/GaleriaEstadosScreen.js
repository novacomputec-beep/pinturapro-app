import React, { useState, useMemo, useRef } from 'react'
import { View, Text, TouchableOpacity, KeyboardAvoidingView, Platform, PanResponder, StyleSheet, Image, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import TelaPosMatch from '../../components/PosMatchFixo'
import { AvaliacaoConteudo } from '../../components/ModalAvaliacao'
import { CelebracaoAvaliacaoConteudo } from './AvaliacaoRecebidaScreen'
import { AjustarFotoConteudo } from '../../components/AjustarFoto'
import { ReferenciasDemo } from '../../components/VerificacaoIdentidadeSheet'
import { MinhasReferenciasConteudo } from './MinhasReferenciasScreen'
import { AvisarPedidoConteudo } from '../../components/AvisarPedidoSheet'
import { CaixaAvisados, LinhaAvisados } from '../../components/CaixaAvisados'
import { CaixaIndicar } from '../../components/Indicacao'
import { ConvidarColegaConteudo } from './ConvidarColegaScreen'
import { MeusPerfisConteudo } from './MeusPerfisScreen'
import { EntrarComoConteudo } from '../Auth/EntrarComoScreen'
import { AdicionarPerfilConteudo } from './AdicionarPerfilScreen'
import { EditarCategoriasConteudo } from '../../components/EditarCategoriasSheet'
import { DicasConteudo } from './DicasScreen'
import { DicasTemaConteudo } from './DicasTemaScreen'
import { CardPerguntasDono, CaixaPerguntaInteressado, perguntaDoAutor, perguntasTemAutor } from '../../components/PerguntasDemanda'
import { MAX_CATEGORIAS_DEMANDA } from '../../utils/categorias'
import { listarPerfis, perfilDoTipo } from '../../utils/contas'
import { BotaoPrimario } from '../../components'
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

// Referências da verificação de identidade (components/VerificacaoIdentidadeSheet) com o
// PROFISSIONAL como usuário logado: o nome e o telefone dele disparam "própria"/"seu telefone".
const CASOS_REFS = [
  { lado: 'pro', fase: 'verificacao_refs', rotulo: 'Referências · própria + seu telefone + incompleto', inicial: { ref1Nome: PROFISSIONAL.nome, ref1Tel: PROFISSIONAL.telefone, ref2Nome: 'Ana Lúcia Ferreira', ref2Tel: '(11) 9876' } },
  { lado: 'pro', fase: 'verificacao_refs', rotulo: 'Referências · ref 2 com o mesmo telefone da 1', inicial: { ref1Nome: 'José Roberto Lima', ref1Tel: '(11) 91234-5678', ref2Nome: 'Ana Lúcia Ferreira', ref2Tel: '(11) 91234-5678' } },
  { lado: 'pro', fase: 'verificacao_refs', rotulo: 'Referências · ref 2 pela metade (telefone incompleto)', inicial: { ref1Nome: 'José Roberto Lima', ref1Tel: '(11) 91234-5678', ref2Nome: 'Ana Lúcia Ferreira', ref2Tel: '(11) 9876' } },
  { lado: 'pro', fase: 'verificacao_refs', rotulo: 'Referências · tudo válido (verde)', inicial: { ref1Nome: 'José Roberto Lima', ref1Tel: '(11) 91234-5678', ref2Nome: 'Ana Lúcia Ferreira', ref2Tel: '(11) 99876-5432' } },
]
const propsReferencias = (caso) => ({ usuario: { nome: PROFISSIONAL.nome, telefone: PROFISSIONAL.telefone }, inicial: caso.inicial })

// Tela "Minhas referências" (Perfil → MinhasReferenciasScreen → MinhasReferenciasConteudo):
// visualização, edição e o pedido de correção do admin, com dados locais e handlers no-op.
const REFS_SALVAS = [{ nome: 'José Roberto Lima', telefone: '(11) 91234-5678' }, { nome: 'Ana Lúcia Ferreira', telefone: '(11) 99876-5432' }]
const CASOS_MINHAS_REFS = [
  { lado: 'pro', fase: 'minhas_refs', rotulo: 'Minhas referências · visualização', referencias: REFS_SALVAS },
  { lado: 'pro', fase: 'minhas_refs', rotulo: 'Minhas referências · editando', referencias: REFS_SALVAS, editando: true },
  { lado: 'pro', fase: 'minhas_refs', rotulo: 'Minhas referências · corrigir (telefone próprio)', referencias: [{ nome: 'José Roberto Lima', telefone: PROFISSIONAL.telefone }, REFS_SALVAS[1]], problema: 'propria', editando: true },
]
const propsMinhasRefs = (caso) => ({
  usuario: { nome: PROFISSIONAL.nome, telefone: PROFISSIONAL.telefone },
  referencias: caso.referencias,
  problema: caso.problema || null,
  editando: !!caso.editando,
  salvando: false,
  onEditar: noop,
  onSalvar: noop,
  onCancelar: caso.problema ? undefined : noop,
})

// Sheet "Seu pedido foi publicado! 🎉" (components/AvisarPedidoSheet), que aparece ao dono
// logo após publicar sem permissão de notificação: o estado que ainda pede ao SO e o
// bloqueado (canAskAgain false), que ensina o caminho das Configurações. Handlers no-op.
const CASOS_AVISAR = [
  { lado: 'dono', fase: 'avisar_pedido', rotulo: 'Avisar pedido · pedir permissão', modo: 'pedir' },
  { lado: 'dono', fase: 'avisar_pedido', rotulo: 'Avisar pedido · bloqueada (abrir ajustes)', modo: 'bloqueado' },
]
const propsAvisar = (caso) => ({ modo: caso.modo, onAvisar: noop, onAgoraNao: noop, onAbrirAjustes: noop })

// Arte-Avisados (components/CaixaAvisados), no detalhe do DONO de pedido aberto sem match:
// azul (recente), laranja (24h sem proposta, com os atalhos) e a linha dentro do card de
// valor (com interessados). N abaixo de 10 ou ausente sai sem número. Handlers no-op.
const CASOS_AVISADOS = [
  { lado: 'dono', fase: 'avisados', rotulo: 'Avisados · pedido recente (azul, N=23)', modo: 'novo', avisados: 23 },
  { lado: 'dono', fase: 'avisados', rotulo: 'Avisados · pedido recente, N < 10 (sem número)', modo: 'novo', avisados: 4 },
  { lado: 'dono', fase: 'avisados', rotulo: 'Avisados · 24h sem propostas (laranja, N=23)', modo: 'dica', avisados: 23 },
  { lado: 'dono', fase: 'avisados', rotulo: 'Avisados · 24h sem propostas, N ausente', modo: 'dica', avisados: null },
  { lado: 'dono', fase: 'avisados', rotulo: 'Avisados · com interessados (linha no card)', modo: 'linha', avisados: 23 },
]
const propsAvisados = (caso) => ({ modo: caso.modo, avisados: caso.avisados })

// Trecho do detalhe do dono em volta da arte: o card verde de valor (onde a linha entra) e,
// abaixo, a caixa seguida do título da lista vazia — a posição real, entre card e lista.
function DemoAvisados({ modo, avisados }) {
  const demanda = base('servico')
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={estilos.cardValor}>
        <Text style={estilos.cardValorLabel}>💰 VALOR PROPOSTO</Text>
        <Text style={estilos.cardValorValor}>R$ {demanda.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text>
        <View style={estilos.cardValorDivisor} />
        <Text style={estilos.cardValorNota}>Pagamento acertado direto com o profissional.{'\n'}O app não recebe valores.</Text>
        {modo === 'linha' && <LinhaAvisados avisados={avisados} />}
      </View>
      <Text style={estilos.tituloDemanda}>{demanda.titulo}</Text>
      {modo !== 'linha' && (
        <CaixaAvisados modo={modo} avisados={avisados} onAumentarValor={noop} onAumentarTempo={noop} onManter={noop} />
      )}
      <Text style={estilos.secaoTitulo}>🔧 Profissionais interessados ({modo === 'linha' ? 2 : 0})</Text>
      {modo !== 'linha' && (
        <View style={estilos.vazio}>
          <Text style={estilos.vazioTexto}>Nenhum profissional demonstrou interesse ainda.{'\n'}Aguarde as notificações!</Text>
        </View>
      )}
    </ScrollView>
  )
}

// Arte-Indicar (components/Indicacao), no detalhe do PROFISSIONAL de pedido aberto sem match:
// a caixa verde acima do "Tenho interesse". Variantes da mensagem: com valor e bairro, sem
// valor, sem bairro (cai na cidade). O botão abre o WhatsApp de verdade com a mensagem
// montada dos dados locais — nada sai da tela sem o toque.
const CASOS_INDICAR = [
  { lado: 'pro', fase: 'indicar', rotulo: 'Indicar · serviço com valor e bairro (com código)', frente: 'servico', codigo: 'AB12CD' },
  { lado: 'pro', fase: 'indicar', rotulo: 'Indicar · obra sem valor (sem código)', frente: 'obra', demanda: { valor: null }, codigo: '' },
  { lado: 'pro', fase: 'indicar', rotulo: 'Indicar · serviço sem bairro (usa a cidade)', frente: 'servico', demanda: { bairro: null }, codigo: 'AB12CD' },
]
const propsIndicar = (caso) => ({ demanda: { ...base(caso.frente), ...(caso.demanda || {}) }, codigo: caso.codigo, ehObra: caso.frente === 'obra' })

// Trecho do detalhe do profissional em volta da arte: a caixa e, abaixo, o botão de interesse
// com o aviso — a posição real, logo acima do "Tenho interesse".
function DemoIndicar({ demanda, codigo, ehObra }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={estilos.tituloDemanda}>{demanda.titulo}</Text>
      <CaixaIndicar demanda={demanda} codigo={codigo} />
      <BotaoPrimario titulo={ehObra ? 'Tenho interesse nesta obra →' : 'Tenho interesse neste serviço →'} onPress={noop} />
      <Text style={estilos.avisoInteresse}>Ao demonstrar interesse, suas informações profissionais serão enviadas ao solicitante.</Text>
    </ScrollView>
  )
}

// "Convide um colega" (ConvidarColegaConteudo) nos dois estados: janela de lançamento grátis
// (neutro, sem prêmio) e fora dela (card "O que você ganha" + meses/selo). Dados locais,
// compartilhar e copiar no-op.
const CASOS_CONVITE = [
  { lado: 'pro', fase: 'convite', rotulo: 'Convidar colega · janela grátis (sem prêmio)', lancamentoGratis: true },
  { lado: 'pro', fase: 'convite', rotulo: 'Convidar colega · fora da janela (com prêmio)', lancamentoGratis: false },
]
const propsConvite = (caso) => ({
  dados: { codigo: 'AB12CD', link: 'https://protudo.app.br/baixar?c=AB12CD', indicados: 2, aprovados: 1, mesesGanhos: 1, paraSelo: 2, embaixador: false },
  carregando: false,
  erro: null,
  onRetry: null,
  lancamentoGratis: caso.lancamentoGratis,
  onConvidar: noop,
  onCopiar: noop,
})

// Arte-Meus-Perfis (ordem da Arte-Meus-Perfis-Ordem: serviço-contratar, serviço-trabalhar,
// obra-contratar, obra-trabalhar): "Meus perfis" (MeusPerfisConteudo) com a conta em uso
// (borda verde, ✓ e "EM USO" sob o título), as que existem (seta, trocam ao toque) e as que
// faltam (＋), e "Adicionar perfil" (AdicionarPerfilConteudo) para um tipo profissional
// (seletor do lado certo) e um dono (sem seletor). Handlers no-op.
const CASOS_PERFIS = [
  { lado: 'pro', fase: 'perfis', rotulo: 'Meus perfis · só reparador em uso (2º card, 3 com ＋)', usuario: { role: 'prestador', tipo_prestador: 'reparador', contas: [{ tipo: 'reparador' }] } },
  { lado: 'dono', fase: 'perfis', rotulo: 'Meus perfis · dono de serviço em uso (1º card) + reparador', usuario: { role: 'dono_obra', tipo_dono: 'reparo', contas: [{ tipo: 'reparador' }, { tipo: 'dono_reparo' }] } },
  { lado: 'dono', fase: 'perfis', rotulo: 'Meus perfis · dono de obra com os 4, trocando para pintor', usuario: { role: 'dono_obra', tipo_dono: 'pintura', contas: [{ tipo: 'reparador' }, { tipo: 'dono_reparo' }, { tipo: 'dono_obra' }, { tipo: 'pintor' }] }, trocando: 'pintor' },
  { lado: 'pro', fase: 'perfis', rotulo: 'Meus perfis · pintor em uso (último card) + os 2 donos', usuario: { role: 'prestador', tipo_prestador: 'pintor', contas: [{ tipo: 'pintor' }, { tipo: 'dono_reparo' }, { tipo: 'dono_obra' }] } },
  { lado: 'pro', fase: 'adicionar', rotulo: 'Adicionar perfil · serviços (2 marcadas)', tipo: 'reparador', selecionadas: ['eletrica', 'hidraulica'] },
  { lado: 'pro', fase: 'adicionar', rotulo: 'Adicionar perfil · construtor/pintor (vazio)', tipo: 'pintor', selecionadas: [] },
  { lado: 'dono', fase: 'adicionar', rotulo: 'Adicionar perfil · preciso de um serviço', tipo: 'dono_reparo', selecionadas: [] },
]
const propsPerfis = (caso) => caso.fase === 'perfis'
  ? { perfis: listarPerfis(caso.usuario), trocando: caso.trocando || null, onTrocar: noop, onAdicionar: noop }
  : { perfil: perfilDoTipo(caso.tipo), selecionadas: caso.selecionadas, onAlternar: noop }

// Arte-Entrar-Como: o miolo do "Entrar como:" (EntrarComoConteudo) com só os lados que a
// pessoa tem, a tag "ÚLTIMO USADO", o spinner no card que está entrando e um tipo que esta
// versão do app não conhece. Handlers no-op.
const CASOS_ENTRAR_COMO = [
  { lado: 'pro', fase: 'entrar_como', rotulo: 'Entrar como · reparador + dono de serviço (último usado)', contas: [{ tipo: 'reparador' }, { tipo: 'dono_reparo' }], ultimoTipo: 'reparador' },
  { lado: 'pro', fase: 'entrar_como', rotulo: 'Entrar como · os 4, entrando como pintor', contas: [{ tipo: 'reparador' }, { tipo: 'dono_reparo' }, { tipo: 'dono_obra' }, { tipo: 'pintor' }], ultimoTipo: 'dono_obra', tipoCarregando: 'pintor' },
  { lado: 'dono', fase: 'entrar_como', rotulo: 'Entrar como · só contratar (2 donos)', contas: ['dono_reparo', 'dono_obra'] },
  { lado: 'pro', fase: 'entrar_como', rotulo: 'Entrar como · tipo desconhecido no fim', contas: [{ tipo: 'pintor' }, { tipo: 'sindico' }] },
]
const propsEntrarComo = (caso) => ({ contas: caso.contas, tipoCarregando: caso.tipoCarregando || null, ultimoTipo: caso.ultimoTipo || null, onEscolher: noop })

function DemoAdicionar(props) {
  const precisaEsp = !!props.perfil?.profissional
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <AdicionarPerfilConteudo {...props} />
      <BotaoPrimario titulo="Criar e entrar" onPress={noop} desabilitado={precisaEsp && !props.selecionadas.length} />
    </ScrollView>
  )
}

// Arte-Editar-Categorias: a folha "Categorias do pedido" (EditarCategoriasConteudo) do dono de
// pedido aberto sem match. Seleção e busca são estado LOCAL do demo (a folha real também os
// guarda); "Salvar e avisar" é no-op. Casos: sem mudança (botão apagado), uma categoria nova
// (verde com ＋), no limite com busca filtrando.
const CASOS_CATEGORIAS = [
  { lado: 'dono', fase: 'editar_categorias', rotulo: 'Categorias do pedido · sem mudança', originais: ['eletrica', 'hidraulica'], selecionadas: ['eletrica', 'hidraulica'], busca: '' },
  { lado: 'dono', fase: 'editar_categorias', rotulo: 'Categorias do pedido · 1 nova (verde ＋)', originais: ['eletrica'], selecionadas: ['eletrica', 'hidraulica'], busca: '' },
  { lado: 'dono', fase: 'editar_categorias', rotulo: `Categorias do pedido · no limite (${MAX_CATEGORIAS_DEMANDA}) + busca`, originais: ['eletrica', 'hidraulica'], selecionadas: ['eletrica', 'hidraulica', 'eletronica'], busca: 'el' },
]
const propsCategorias = (caso) => ({ originais: caso.originais, selecionadasIniciais: caso.selecionadas, buscaInicial: caso.busca })

function DemoEditarCategorias({ originais, selecionadasIniciais, buscaInicial }) {
  const [selecionadas, setSelecionadas] = useState(selecionadasIniciais)
  const [busca, setBusca] = useState(buscaInicial)
  const alternar = (slug) => setSelecionadas((atual) => (
    atual.includes(slug) ? atual.filter((c) => c !== slug) : atual.length >= MAX_CATEGORIAS_DEMANDA ? atual : [...atual, slug]
  ))
  return (
    <View style={[estilos.sheet, { alignItems: 'stretch' }]}>
      <EditarCategoriasConteudo originais={originais} selecionadas={selecionadas} busca={busca} onBusca={setBusca} onAlternar={alternar} onSalvar={noop} />
    </View>
  )
}

// Arte-Dicas: a lista de temas (DicasConteudo) e os cards de um tema (DicasTemaConteudo), com
// dados locais no formato de GET /dicas. `vistas` é o conjunto de ids já vistos: os temas
// mostram "N novas" e o tema aberto mostra "NOVO" (nova: true) e os links de ação (no-op).
const TEMAS_DICAS = [
  { tema: 'Publicar o pedido', icone: '📝', ordem: 1, dicas: [
    { id: 'd1', ordem: 1, texto: 'Até 3 categorias. **Marcar "Outros"** faz o aviso chegar a todos os profissionais da cidade.', acao: null, nova: false },
    { id: 'd2', ordem: 2, texto: 'Esqueceu uma área? **Acrescente a categoria**: só os profissionais novos são avisados.', acao: 'meus_pedidos', nova: true },
    { id: 'd3', ordem: 3, texto: '**Obra passa por análise** antes de aparecer, e o prazo só começa a contar depois de aprovada.', acao: null, nova: false },
  ] },
  { tema: 'Prazo e valor', icone: '💰', ordem: 2, dicas: [
    { id: 'd4', ordem: 1, texto: 'Antes de vencer, você recebe **3 alertas**, só se ninguém tiver se interessado.', acao: null, nova: false },
    { id: 'd5', ordem: 2, texto: '**Aumentar o prazo** avisa só quem já se interessou; não reenvia o pedido para todos.', acao: 'meus_pedidos', nova: false },
  ] },
  { tema: 'Receber pedidos', icone: '📲', ordem: 3, dicas: [
    { id: 'd6', ordem: 1, texto: 'Os avisos chegam **só da sua cidade**. Mantenha a cidade certa.', acao: 'editar_perfil', nova: false },
    { id: 'd7', ordem: 2, texto: 'Notificações desligadas = só e-mail, e mais devagar. **Ative os avisos.**', acao: 'ativar_avisos', nova: true },
  ] },
]
const CASOS_DICAS = [
  { lado: 'dono', fase: 'dicas', rotulo: 'Dicas · lista de temas (3 novas)', vistas: ['d1', 'd3', 'd4', 'd5'] },
  { lado: 'dono', fase: 'dicas', rotulo: 'Dicas · tudo visto (sem badge)', vistas: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'] },
  { lado: 'dono', fase: 'dicas', rotulo: 'Dicas · carregando', carregando: true },
  { lado: 'dono', fase: 'dica_tema', rotulo: 'Dicas · tema com NOVO e link', tema: 0 },
  { lado: 'pro', fase: 'dica_tema', rotulo: 'Dicas · tema do profissional (ativar avisos)', tema: 2 },
]
const propsDicas = (caso) => caso.fase === 'dicas'
  ? { temas: caso.carregando ? [] : TEMAS_DICAS, vistas: new Set(caso.vistas || []), carregando: !!caso.carregando, erro: null, onRetry: null, onAbrirTema: noop }
  : { tema: TEMAS_DICAS[caso.tema], onAcao: noop, acaoDisponivel: null }

// Arte-Quem-Perguntou (visão do DONO): as perguntas com autor (linha de iniciais + nome +
// etiqueta) no CardPerguntasDono, e três cards de interessado — um que perguntou e aguarda
// resposta, um que não perguntou e um já respondido. `posMatch` tira o "Responder →".
const PERGUNTAS_DEMO = [
  { id: 'p1', autor_id: 'u1', autor_nome: 'Carlos Henrique da Silva', autor_candidato: true, pergunta: 'O material já está comprado ou preciso levar?', resposta: null },
  { id: 'p2', autor_id: 'u2', autor_nome: 'João Pedro Santos', autor_candidato: false, pergunta: 'Tem escada no local?', resposta: 'Sim, tem uma escada de 6 degraus na área de serviço.' },
]
const INTERESSADOS_DEMO = [
  { usuario_id: 'u1', nome: 'Carlos Henrique da Silva' },
  { usuario_id: 'u3', nome: 'Maria Aparecida Souza' },
  { usuario_id: 'u2', nome: 'João Pedro Santos' },
]
const CASOS_QUEM_PERGUNTOU = [
  { lado: 'dono', fase: 'quem_perguntou', rotulo: 'Quem perguntou · aberto (pendente + respondida + sem pergunta)' },
  { lado: 'dono', fase: 'quem_perguntou', rotulo: 'Quem perguntou · pós-match (sem "Responder →")', posMatch: true },
]
const propsQuemPerguntou = (caso) => ({ posMatch: !!caso.posMatch })

function DemoQuemPerguntou({ posMatch }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <CardPerguntasDono perguntas={PERGUNTAS_DEMO} respondendoId={null} onResponder={noop} />
      <Text style={estilos.secaoTitulo}>🔧 Profissionais interessados ({INTERESSADOS_DEMO.length})</Text>
      {INTERESSADOS_DEMO.map((item) => (
        <View key={item.usuario_id} style={estilos.cardInteressado}>
          <Text style={estilos.cardInteressadoNome}>{item.nome}</Text>
          <Text style={estilos.cardInteressadoMeta}>⭐ 4.8 (23 avaliações) · 📍 São Paulo</Text>
          <CaixaPerguntaInteressado
            pergunta={perguntaDoAutor(PERGUNTAS_DEMO, item.usuario_id)}
            atribuivel={perguntasTemAutor(PERGUNTAS_DEMO)}
            podeResponder={!posMatch}
            onResponder={noop}
          />
        </View>
      ))}
    </ScrollView>
  )
}

// Lista final: cada caso para serviço e para obra; os de foto, referências e aviso, uma vez.
const TODOS = [
  ...['servico', 'obra'].flatMap((frente) => CASOS.map((c) => ({ ...c, frente }))),
  ...CASOS_FOTO.map((c) => ({ ...c, frente: null })),
  ...CASOS_REFS.map((c) => ({ ...c, frente: null })),
  ...CASOS_MINHAS_REFS.map((c) => ({ ...c, frente: null })),
  ...CASOS_AVISAR.map((c) => ({ ...c, frente: null })),
  ...CASOS_AVISADOS.map((c) => ({ ...c, frente: null })),
  ...CASOS_INDICAR,
  ...CASOS_CONVITE.map((c) => ({ ...c, frente: null })),
  ...CASOS_PERFIS.map((c) => ({ ...c, frente: null })),
  ...CASOS_ENTRAR_COMO.map((c) => ({ ...c, frente: null })),
  ...CASOS_CATEGORIAS.map((c) => ({ ...c, frente: null })),
  ...CASOS_DICAS.map((c) => ({ ...c, frente: null })),
  ...CASOS_QUEM_PERGUNTOU.map((c) => ({ ...c, frente: null })),
]

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

const NOMES_FASE = { aguardando: 'Aguardando', proposto: 'Proposto', agendado: 'Agendado', a_caminho: 'A caminho', em_andamento: 'Em andamento', avaliacao: 'Avaliação', celebracao: 'Avaliação recebida', ajustar_foto: 'Ajustar foto', verificacao_refs: 'Verificação · referências', minhas_refs: 'Minhas referências', avisar_pedido: 'Avisar pedido publicado', avisados: 'Profissionais avisados', indicar: 'Indicar o ProTudo', convite: 'Convidar colega', perfis: 'Meus perfis', adicionar: 'Adicionar perfil', entrar_como: 'Entrar como', editar_categorias: 'Categorias do pedido', dicas: 'Dicas do ProTudo', dica_tema: 'Dicas · tema', quem_perguntou: 'Quem perguntou' }

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
  const ehRefs = caso.fase === 'verificacao_refs'
  const ehMinhasRefs = caso.fase === 'minhas_refs'
  const ehAvisar = caso.fase === 'avisar_pedido'
  const ehAvisados = caso.fase === 'avisados'
  const ehIndicar = caso.fase === 'indicar'
  const ehConvite = caso.fase === 'convite'
  const ehPerfis = caso.fase === 'perfis' || caso.fase === 'adicionar'
  const ehEntrarComo = caso.fase === 'entrar_como'
  const ehCategorias = caso.fase === 'editar_categorias'
  const ehDicas = caso.fase === 'dicas' || caso.fase === 'dica_tema'
  const ehQuemPerguntou = caso.fase === 'quem_perguntou'
  const props = useMemo(() => (
    ehQuemPerguntou ? propsQuemPerguntou(caso) : ehDicas ? propsDicas(caso) : ehCategorias ? propsCategorias(caso) : ehEntrarComo ? propsEntrarComo(caso) : ehPerfis ? propsPerfis(caso) : ehConvite ? propsConvite(caso) : ehIndicar ? propsIndicar(caso) : ehAvisados ? propsAvisados(caso) : ehAvisar ? propsAvisar(caso) : ehMinhasRefs ? propsMinhasRefs(caso) : ehRefs ? propsReferencias(caso) : ehFoto ? propsAjustarFoto(caso) : ehAvaliacao ? propsAvaliacao(caso) : ehCelebracao ? propsCelebracao(caso) : propsDoCaso(caso)
  ), [caso, ehQuemPerguntou, ehDicas, ehCategorias, ehEntrarComo, ehPerfis, ehConvite, ehIndicar, ehAvisados, ehAvisar, ehMinhasRefs, ehRefs, ehFoto, ehAvaliacao, ehCelebracao])
  const rotulo = ehFoto || ehRefs || ehMinhasRefs || ehAvisar || ehAvisados || ehIndicar || ehConvite || ehPerfis || ehEntrarComo || ehCategorias || ehDicas || ehQuemPerguntou
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
        {/* O sheet de aviso é ancorado ao rodapé, como o Modal real: fundo escurecido e a folha
            com os cantos de cima arredondados, para conferir a altura que ele ocupa na tela. */}
        <View style={[estilos.corpo, larguraMaxima, { flex: 1, paddingTop: 4, paddingBottom: 8 }, (ehFoto || ehAvisar || ehCategorias) && { paddingHorizontal: 0, paddingBottom: 0 }, (ehAvisar || ehCategorias) && estilos.fundoSheet]} {...(ehFoto ? {} : pan.panHandlers)}>
          {ehAvisar ? <View key={i} style={estilos.sheet}><AvisarPedidoConteudo {...props} /></View>
            : ehCategorias ? <DemoEditarCategorias key={i} {...props} />
            : ehQuemPerguntou ? <DemoQuemPerguntou key={i} {...props} />
            : caso.fase === 'dicas' ? <ScrollView key={i} showsVerticalScrollIndicator={false}><DicasConteudo {...props} /></ScrollView>
            : caso.fase === 'dica_tema' ? <ScrollView key={i} showsVerticalScrollIndicator={false}><DicasTemaConteudo {...props} /></ScrollView>
            : caso.fase === 'perfis' ? <ScrollView key={i} showsVerticalScrollIndicator={false}><MeusPerfisConteudo {...props} /></ScrollView>
            : ehEntrarComo ? <ScrollView key={i} showsVerticalScrollIndicator={false}><EntrarComoConteudo {...props} /></ScrollView>
            : caso.fase === 'adicionar' ? <DemoAdicionar key={i} {...props} />
            : ehConvite ? <ScrollView key={i} showsVerticalScrollIndicator={false}><ConvidarColegaConteudo {...props} /></ScrollView>
            : ehIndicar ? <DemoIndicar key={i} {...props} />
            : ehAvisados ? <DemoAvisados key={i} {...props} />
            : ehMinhasRefs ? <ScrollView key={i} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><MinhasReferenciasConteudo {...props} /></ScrollView>
            : ehRefs ? <ReferenciasDemo key={i} {...props} />
            : ehFoto ? <AjustarFotoConteudo key={i} {...props} />
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
  // Mesmos valores do backdrop/sheet do AvisarPedidoSheet (sem o inset inferior: aqui a
  // barra de abas não existe e a folha encosta no rodapé da área útil).
  fundoSheet: { backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: espacos.tela, paddingTop: 12, paddingBottom: 20, alignItems: 'center', width: '100%' },
  // Cópia dos valorDestaque*/titulo/secaoTitulo/vazioInteressados de DetalheReparoScreen,
  // só o bastante para a arte de avisados aparecer no lugar em que vive.
  cardValor: { backgroundColor: cores.sucessoSuave, borderRadius: 16, padding: 16, marginBottom: 16 },
  cardValorLabel: { fontSize: 10, color: cores.sucesso, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  cardValorValor: { fontSize: 24, fontWeight: '700', color: cores.sucesso },
  cardValorDivisor: { height: 1, backgroundColor: cores.sucesso, opacity: 0.2, marginTop: 12, marginBottom: 8 },
  cardValorNota: { fontSize: 11, color: cores.sucesso, fontWeight: '500', lineHeight: 16 },
  tituloDemanda: { fontSize: 20, fontWeight: '700', color: cores.textoForte, lineHeight: 26, marginBottom: 16 },
  secaoTitulo: { fontSize: 11, fontWeight: '600', color: cores.textoFraco, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  vazio: { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 24, alignItems: 'center', marginBottom: 16 },
  vazioTexto: { fontSize: 13, color: cores.textoMedio, textAlign: 'center', lineHeight: 20 },
  // Cópia do `aviso` sob o "Tenho interesse" das telas de detalhe.
  avisoInteresse: { fontSize: 11, color: cores.textoFraco, textAlign: 'center', marginTop: 10, lineHeight: 16 },
  // Card de interessado reduzido (interessadoCard dos detalhes), só o bastante para a caixa
  // "💬 Perguntou" aparecer onde vive.
  cardInteressado: { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 14, marginBottom: 10 },
  cardInteressadoNome: { fontSize: 15, fontWeight: '700', color: cores.textoForte, marginBottom: 2 },
  cardInteressadoMeta: { fontSize: 12, color: cores.textoMedio },
})
