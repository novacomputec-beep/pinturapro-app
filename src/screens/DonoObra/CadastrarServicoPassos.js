import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { BotaoPrimario, Input, SeletorLocalidade, PainelMidiaDemanda } from '../../components'
import { LinhaCabecalhoFolha } from '../../components/BotaoFecharFolha'
import useArrastarParaFechar from '../../hooks/useArrastarParaFechar'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'
import { CATEGORIAS_SERVICO, CATEGORIAS_CONSTRUCAO, MAX_CATEGORIAS_DEMANDA, LOCAIS_ATENDIMENTO } from '../../utils/categorias'
import { TILE_OUTROS, SLUG_OUTROS } from '../../utils/gruposServico'

// Peças APRESENTACIONAIS do wizard "Cadastrar serviço" (Arte-Cadastrar-Servico), em 4 passos:
// grupos → detalhes → prazo e valor → endereço. A tela (CadastrarReparoScreen) é dona de todo
// o estado, das validações e do envio — aqui só render, alimentado por props. A Galeria de
// estados renderiza as mesmas peças com dados locais.

export const TOTAL_PASSOS = 4

export const TITULOS_PASSO = {
  1: { titulo: 'Do que você precisa?', subtitulo: `Escolha até ${MAX_CATEGORIAS_DEMANDA} categorias. Quanto mais certas, mais profissionais recebem o seu pedido.` },
  2: { titulo: 'Conte o que precisa',  subtitulo: 'Um título curto, a descrição e, se ajudar, um vídeo ou fotos.' },
  3: { titulo: 'Para quando?',         subtitulo: 'O prazo para começar e quanto você quer pagar.' },
  4: { titulo: 'Onde é?',              subtitulo: 'O endereço do serviço. Comece pelo CEP.' },
}

export const URGENCIAS = [
  { id: 1,   label: '🔴 1 hora',      desc: 'Urgência máxima' },
  { id: 2,   label: '🟠 2 horas',     desc: 'Muito urgente'   },
  { id: 4,   label: '🟡 4 horas',     desc: 'Urgente'         },
  { id: 8,   label: '🟢 8 horas',     desc: 'Hoje'            },
  { id: 12,  label: '🔵 12 horas',    desc: 'Ainda hoje'      },
  { id: 24,  label: '📅 Amanhã',      desc: 'Sem pressa'      },
  { id: 168, label: '📆 Esta semana', desc: 'Flexível'        },
  { id: 720, label: '🗓️ Este mês',     desc: 'Sem urgência'    },
  { id: 1440, label: '📋 Mês que vem', desc: 'Pode esperar'    },
]

// Serviços E os quatro papéis de obra: os chips "VOCÊ FAZ" das especialidades mostram os dois
// (Fase 2). No cadastro de pedido só entram slugs de serviço, então nada muda lá.
const CATEGORIA_POR_SLUG = new Map([...CATEGORIAS_SERVICO, ...CATEGORIAS_CONSTRUCAO].map((c) => [c.slug, c]))

// Tile largo de obras do passo 1 do "Cadastrar pedido" (Arte-Fase1-Contratar): a porta para o
// cadastro de obra, junto dos grupos de serviço. Os exemplos são os da arte.
export const TILE_OBRAS = { emoji: '🏗️', titulo: 'Obras de Construção Civil', desc: 'Pintura, reforma, construção, pedreiro' }

// ─── Moldura: cabeçalho com barra de progresso, miolo rolável e rodapé fixo ───────────────
// O rodapé fica FORA da ScrollView e dentro do KeyboardAvoidingView: visível sempre, com o
// teclado aberto e em tela baixa. reservaInferior: altura extra (a barra "Agendado" flutua
// sobre o rodapé da aba; a tela passa alturas.barraServico só enquanto ela existe).
// tituloTela: o título grande e laranja da tela ("Cadastrar serviço" / "Cadastrar obra"), ao
// lado do ←; a pergunta do passo (titulos[passo]) vem menor, abaixo da barra de progresso.
// titulos: mapa passo → { titulo, subtitulo } (TITULOS_PASSO por padrão; a obra passa o seu).
// progresso=false: sem "Passo N de 4" nem barra (telas de um passo só, como as especialidades).
export function MolduraWizard({ passo, tituloTela = 'Cadastrar serviço', titulos = TITULOS_PASSO, onVoltar, mostrarVoltar, children, rodape, scrollRef, reservaInferior = 0, acimaDoTitulo, progresso = true }) {
  const t = titulos[passo] || titulos[1]
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} contentContainerStyle={[estilos.scroll, larguraMaxima]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={estilos.cabecalhoLinha}>
          {mostrarVoltar ? (
            <TouchableOpacity style={estilos.btnVoltar} onPress={onVoltar} accessibilityRole="button" accessibilityLabel="Voltar">
              <Text style={estilos.btnVoltarTexto}>←</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={estilos.tituloTela} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{tituloTela}</Text>
        </View>
        {progresso ? (
          <>
            <Text style={estilos.passoDe}>Passo {passo} de {TOTAL_PASSOS}</Text>
            <BarraProgresso passo={passo} />
          </>
        ) : null}
        {acimaDoTitulo}
        <Text style={estilos.titulo}>{t.titulo}</Text>
        <Text style={estilos.subtitulo}>{t.subtitulo}</Text>
        {children}
      </ScrollView>
      <View style={[estilos.rodape, larguraMaxima, { paddingBottom: 12 + reservaInferior }]}>
        {rodape}
      </View>
    </KeyboardAvoidingView>
  )
}

export const BarraProgresso = ({ passo }) => (
  <View style={estilos.progresso} accessibilityLabel={`Passo ${passo} de ${TOTAL_PASSOS}`}>
    {Array.from({ length: TOTAL_PASSOS }).map((_, i) => (
      <View key={i} style={[estilos.progressoSegmento, i < passo && estilos.progressoFeito]} />
    ))}
  </View>
)

// Botão grande do rodapé. `nota`: texto curto acima dele (o "Enviando mídias…" do envio).
export const RodapeWizard = ({ rotulo, onPress, carregando, desabilitado, nota }) => (
  <>
    {nota ? <Text style={estilos.rodapeNota}>{nota}</Text> : null}
    <BotaoPrimario titulo={rotulo} onPress={onPress} carregando={carregando} desabilitado={desabilitado} estilo={estilos.rodapeBotao} />
  </>
)

// ─── Passo 1: grade de grupos + chips escolhidos + sugestões ──────────────────────────────
// grupos: gruposComCategorias(). contagem: { idGrupo: n } das marcadas. bloqueado: no limite
// (os tiles sem marcada apagam, o de um grupo com marcada segue abrindo para desmarcar).
// tileOutros: { titulo, desc, emoji } do tile largo (TILE_OUTROS por padrão; as especialidades
// passam "Outros serviços"). legendas: linha "N marcada(s)" / "Toque para ver" em cada tile.
// onObras: desenha o tile largo em destaque (borda e gradiente laranja) ENTRE os grupos e o
// tile "Outros"; o toque chama onObras. Dois usos:
//   - "Cadastrar pedido" do dono (Arte-Fase1-Contratar): TILE_OBRAS, abre o cadastro de obra.
//     Não é categoria: não marca, não conta no limite e segue ativo com o limite atingido.
//   - Especialidades do profissional (Arte-Fase2-Trabalhar): tileObras próprio e
//     obrasMarcadas = quantas das especialidades de obra estão marcadas — a linha de baixo
//     vira "N marcada(s) · <desc>" e, sem nenhuma marcada e no limite, o tile apaga como os
//     grupos (com alguma marcada segue abrindo, para desmarcar).
export function GradeGrupos({ grupos, contagem, outrosMarcado, bloqueado, onAbrir, onOutros, tileOutros = TILE_OUTROS, legendas = false, onObras, tileObras = TILE_OBRAS, obrasMarcadas }) {
  const contaObras = typeof obrasMarcadas === 'number'
  const obrasApagado = contaObras && bloqueado && obrasMarcadas === 0
  const descObras = contaObras && obrasMarcadas > 0
    ? `${obrasMarcadas} marcada${obrasMarcadas > 1 ? 's' : ''} · ${tileObras.desc}`
    : tileObras.desc
  return (
    <View style={estilos.grade}>
      {grupos.map((g) => {
        const n = contagem?.[g.id] || 0
        const apagado = bloqueado && n === 0
        return (
          <TouchableOpacity
            key={g.id}
            style={[estilos.tile, n > 0 && estilos.tileAtivo, apagado && estilos.tileApagado]}
            onPress={() => onAbrir(g)}
            disabled={apagado}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: n > 0, disabled: apagado }}
            accessibilityLabel={`${g.titulo}${n ? `, ${n} marcada${n > 1 ? 's' : ''}` : ''}`}
          >
            {n > 0 ? <View style={estilos.tileBadge}><Text style={estilos.tileBadgeTexto}>{n}</Text></View> : null}
            <Text style={estilos.tileEmoji}>{g.emoji}</Text>
            <Text style={[estilos.tileTitulo, n > 0 && { color: cores.primaria }]} numberOfLines={2}>{g.titulo}</Text>
            {legendas ? <Text style={[estilos.tileLegenda, n > 0 && { color: cores.primaria }]}>{n > 0 ? `${n} marcada${n > 1 ? 's' : ''}` : 'Toque para ver'}</Text> : null}
          </TouchableOpacity>
        )
      })}
      {onObras ? (
        <TouchableOpacity
          style={[estilos.tileObras, obrasApagado && estilos.tileApagado]}
          onPress={onObras}
          disabled={obrasApagado}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!obrasApagado }}
          accessibilityLabel={`${tileObras.titulo}: ${descObras}`}
        >
          <LinearGradient colors={['#3A2110', '#1E140C', '#141110']} locations={[0, 0.6, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={estilos.tileObrasMiolo}>
            <Text style={estilos.tileEmoji}>{tileObras.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[estilos.tileTitulo, estilos.tileObrasTitulo]}>{tileObras.titulo}</Text>
              <Text style={[estilos.tileDesc, contaObras && obrasMarcadas > 0 && { color: cores.primaria }]}>{descObras}</Text>
            </View>
            <Text style={estilos.tileObrasSeta}>→</Text>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[estilos.tileLargo, outrosMarcado && estilos.tileAtivo, bloqueado && !outrosMarcado && estilos.tileApagado]}
        onPress={onOutros}
        disabled={bloqueado && !outrosMarcado}
        activeOpacity={0.8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!outrosMarcado }}
      >
        <Text style={estilos.tileEmoji}>{tileOutros.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[estilos.tileTitulo, { textAlign: 'left' }, outrosMarcado && { color: cores.primaria }]}>{tileOutros.titulo}</Text>
          <Text style={estilos.tileDesc}>{tileOutros.desc}</Text>
        </View>
        <Caixa marcada={!!outrosMarcado} />
      </TouchableOpacity>
    </View>
  )
}

// Chips das categorias escolhidas (com ✕), na ordem em que entraram, mais o contador.
// rotulo/limite/textoLimite: "ESCOLHIDAS · N de 3" por padrão; as especialidades passam
// "VOCÊ FAZ", 5 e o aviso próprio. vazio: texto quando não há nenhuma.
export function ChipsEscolhidos({ categorias, onRemover, rotulo = 'ESCOLHIDAS', limite = MAX_CATEGORIAS_DEMANDA, textoLimite, vazio = 'Toque num grupo acima para escolher.' }) {
  const noLimite = categorias.length >= limite
  return (
    <View style={estilos.chipsBloco}>
      <View style={estilos.chipsCabecalho}>
        <Text style={estilos.label}>{rotulo}</Text>
        <Text style={[estilos.contador, noLimite && { color: cores.primaria }]}>{categorias.length} de {limite}</Text>
      </View>
      {categorias.length === 0 ? (
        <Text style={estilos.chipsVazio}>{vazio}</Text>
      ) : (
        <View style={estilos.chips}>
          {categorias.map((slug) => {
            const c = CATEGORIA_POR_SLUG.get(slug)
            return (
              <TouchableOpacity key={slug} style={estilos.chip} onPress={() => onRemover(slug)} accessibilityRole="button" accessibilityLabel={`Remover ${c?.rotulo || slug}`}>
                <Text style={estilos.chipTexto}>{c ? `${c.emoji} ${c.rotulo}` : slug}</Text>
                <Text style={estilos.chipX}>✕</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
      {noLimite ? <Text style={estilos.limite}>{textoLimite || `Limite de ${limite} categorias atingido`}</Text> : null}
    </View>
  )
}

// Card azul "Também podem atender este pedido" — o mesmo de antes, só mudou de arquivo.
export function Sugestoes({ sugestoes, onAdicionar }) {
  if (!sugestoes?.length) return null
  return (
    <View style={estilos.sugestaoCard}>
      <Text style={estilos.sugestaoTitulo}>💡 Também podem atender este pedido:</Text>
      <View style={estilos.chips}>
        {sugestoes.map((c) => (
          <TouchableOpacity key={c.slug} style={estilos.sugestaoChip} onPress={() => onAdicionar(c.slug)} activeOpacity={0.7}>
            <Text style={estilos.sugestaoChipTexto}>+ {c.emoji} {c.rotulo}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const Caixa = ({ marcada, apagada }) => (
  <View style={[estilos.caixa, marcada && estilos.caixaMarcada, apagada && { opacity: 0.35 }]}>
    {marcada ? <Text style={estilos.caixaCheck}>✓</Text> : null}
  </View>
)

// Conteúdo da folha de um grupo: linhas grandes (emoji, nome, exemplos, caixa) e "Pronto".
// `selecionadas` são TODAS as marcadas (o contador do botão é o total do pedido).
// limite/subtitulo: 3 e "no pedido" por padrão; as especialidades passam 5 e o seu texto.
// aviso: linha âmbar sob o subtítulo (teto atingido / mínimo de 1), decidida por quem usa.
// arraste: os panHandlers de useArrastarParaFechar (só a FolhaGrupo real passa; a Galeria não)
// — vão na alça e no cabeçalho, nunca na lista, que continua rolando.
// onFechar: a pílula "✕ Fechar" à direita do título (BotaoFecharFolha) — o mesmo fechamento do
// toque fora (onPronto na folha real; a Galeria passa o seu).
export function FolhaGrupoConteudo({ grupo, selecionadas, onAlternar, onPronto, limite = MAX_CATEGORIAS_DEMANDA, subtitulo, aviso, arraste, onFechar }) {
  const total = selecionadas.length
  const noLimite = total >= limite
  return (
    <>
      <View {...(arraste || {})}>
        <View style={estilos.alca} />
        <LinhaCabecalhoFolha onFechar={onFechar}>
          <Text style={estilos.folhaTitulo}>{grupo.emoji} {grupo.titulo}</Text>
        </LinhaCabecalhoFolha>
        <Text style={estilos.folhaSub}>{subtitulo || `Marque o que precisa · até ${limite} no pedido`}</Text>
        {aviso ? <Text style={estilos.folhaAviso}>{aviso}</Text> : null}
      </View>
      <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
        {grupo.categorias.map((c) => {
          const marcada = selecionadas.includes(c.slug)
          const apagada = !marcada && noLimite
          return (
            <TouchableOpacity
              key={c.slug}
              style={[estilos.linha, marcada && estilos.linhaMarcada, apagada && { opacity: 0.45 }]}
              onPress={() => onAlternar(c.slug)}
              disabled={apagada}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: marcada, disabled: apagada }}
              accessibilityLabel={c.rotulo}
            >
              <Text style={estilos.linhaEmoji}>{c.emoji}</Text>
              <View style={{ flex: 1 }}>
                <View style={estilos.linhaNomeLinha}>
                  <Text style={[estilos.linhaNome, marcada && { color: cores.primaria }]}>{c.rotulo}</Text>
                  {/* Etiqueta verde das categorias recém-chegadas (NOVAS_SERVICO em utils/gruposServico). */}
                  {c.nova ? <View style={estilos.tagNovo}><Text style={estilos.tagNovoTexto}>NOVO</Text></View> : null}
                </View>
                {c.exemplos ? <Text style={estilos.linhaExemplos} numberOfLines={2}>{c.exemplos}</Text> : null}
              </View>
              <Caixa marcada={marcada} />
            </TouchableOpacity>
          )
        })}
      </ScrollView>
      <BotaoPrimario titulo={`Pronto · ${total} ${total === 1 ? 'escolhida' : 'escolhidas'}`} onPress={onPronto} estilo={{ marginTop: 12 }} />
    </>
  )
}

// A folha como Modal de verdade (a tela). O toque fora, o voltar do Android e o arraste para
// baixo (alça/cabeçalho) fecham como o "Pronto": o que está marcado fica — não há escolha
// obrigatória aqui.
export function FolhaGrupo({ visivel, grupo, selecionadas, onAlternar, onPronto, limite, subtitulo, aviso }) {
  const insets = useSafeAreaInsets()
  const { panHandlers, estiloArraste } = useArrastarParaFechar(onPronto, !!visivel)
  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={onPronto}>
      <View style={estilos.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onPronto} accessibilityRole="button" accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.folha, { paddingBottom: insets.bottom + 20 }, estiloArraste]}>
          {grupo ? <FolhaGrupoConteudo grupo={grupo} selecionadas={selecionadas} onAlternar={onAlternar} onPronto={onPronto} limite={limite} subtitulo={subtitulo} aviso={aviso} arraste={panHandlers} onFechar={onPronto} /> : null}
        </Animated.View>
      </View>
    </Modal>
  )
}

// ─── Passo 2: título, descrição (com o aviso de contato), mídia ───────────────────────────
// rotuloTitulo/placeholderTitulo/rotuloDescricao: "do serviço" (padrão) ou "da obra".
export function PassoDetalhes({ titulo, descricao, onTitulo, onDescricao, erros, registrarY, midia, rotuloTitulo = 'TÍTULO DO SERVIÇO', placeholderTitulo = 'Ex: Instalar 3 tomadas na sala', rotuloDescricao = 'DESCRIÇÃO DO SERVIÇO' }) {
  return (
    <>
      <View onLayout={registrarY?.('titulo')}>
        <Input label={rotuloTitulo} placeholder={placeholderTitulo} value={titulo} onChangeText={onTitulo} erro={erros?.titulo} estiloInput={estilos.tituloBordaAzul} />
      </View>
      <View onLayout={registrarY?.('descricao')}>
        <Input label={rotuloDescricao} placeholder="Descreva detalhadamente o que precisa ser feito..." value={descricao} onChangeText={onDescricao} erro={erros?.descricao} multiline numberOfLines={4} avisoContato />
      </View>
      <PainelMidiaDemanda itens={midia.itens} onRemover={midia.onRemover} onReenviar={midia.onReenviar} acoes={{ onGravarVideo: midia.onGravarVideo, onTirarFotos: midia.onTirarFotos, onGaleria: midia.onGaleria }} />
    </>
  )
}

// ─── Passo 3: prazo (9 opções, as mesmas) + valor em destaque ─────────────────────────────
export function PassoPrazoValor({ urgencia, onUrgencia, valor, onValor, erros, registrarY }) {
  return (
    <>
      <View onLayout={registrarY?.('urgencia')}>
        <Text style={estilos.label}>⏰ PRAZO PARA INICIAR O SERVIÇO</Text>
        {erros?.urgencia ? <Text style={estilos.erroTexto}>{erros.urgencia}</Text> : null}
        <View style={estilos.urgenciasGrid}>
          {URGENCIAS.map((u) => (
            <TouchableOpacity key={u.id} style={[estilos.urgenciaCard, urgencia === u.id && estilos.urgenciaCardAtivo]} onPress={() => onUrgencia(u.id)} accessibilityRole="radio" accessibilityState={{ selected: urgencia === u.id }}>
              <Text style={estilos.urgenciaLabel}>{u.label}</Text>
              <Text style={estilos.urgenciaDesc}>{u.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View onLayout={registrarY?.('valorEstimado')}>
        <Text style={estilos.secaoTitulo}>Quanto quer pagar?</Text>
        <View style={[estilos.valorCaixa, erros?.valorEstimado && { borderColor: cores.perigo }]}>
          <Text style={estilos.valorPrefixo}>R$</Text>
          <Input
            placeholder="0,00"
            value={valor}
            onChangeText={onValor}
            keyboardType="numeric"
            estilo={estilos.valorInputWrap}
            estiloInput={estilos.valorInput}
            accessibilityLabel="Quanto você quer pagar, em reais"
          />
        </View>
        {erros?.valorEstimado ? <Text style={estilos.erroTexto}>{erros.valorEstimado}</Text> : null}
        <Text style={estilos.valorNota}>Os profissionais podem aceitar o seu valor ou sugerir outro. Você escolhe.</Text>
      </View>
    </>
  )
}

// ─── Passo 4: endereço (os mesmos campos e regras de sempre, CEP primeiro) ────────────────
// rotuloLocal/rotuloCep: "do serviço" (padrão) ou "da obra".
export function PassoEndereco({ cep, onCep, buscandoCep, enderecoEncontrado, pontoReferencia, onPontoReferencia, logradouro, onLogradouro, numero, onNumero, complemento, onComplemento, bairro, onBairro, uf, cidade, onLocalidade, erros, registrarY, rodapeTexto, rotuloLocal = '📍 LOCALIZAÇÃO DO SERVIÇO', rotuloCep = 'CEP DO LOCAL DO SERVIÇO' }) {
  return (
    <>
      <Text style={estilos.label}>{rotuloLocal}</Text>
      <Text style={estilos.dicaCep}>Comece pelo CEP — estado e cidade são preenchidos automaticamente</Text>
      <View style={estilos.cepRow} onLayout={registrarY?.('cep')}>
        <Input label={rotuloCep} placeholder="00000-000" value={cep} onChangeText={onCep} keyboardType="numeric" maxLength={8} erro={erros?.cep} estilo={{ flex: 1 }} />
        {buscandoCep && <ActivityIndicator color={cores.primaria} style={{ marginTop: 28, marginLeft: 12 }} />}
        {enderecoEncontrado && !buscandoCep && <Text style={estilos.cepOk}>✅</Text>}
      </View>
      {/* Sempre visível: é em endereço difícil (CEP geral) que a referência mais ajuda. */}
      <Input label="PONTO DE REFERÊNCIA (opcional)" placeholder="Ex: portão azul, em frente à padaria" value={pontoReferencia} onChangeText={onPontoReferencia} />
      {enderecoEncontrado && (
        <>
          {/* Editável: em cidade de "CEP geral" o ViaCEP não devolve logradouro. */}
          <View onLayout={registrarY?.('logradouro')}>
            <Input label="LOGRADOURO (rua/avenida)" placeholder="Preenchido pelo CEP — ou digite a rua" value={logradouro} onChangeText={onLogradouro} erro={erros?.logradouro} />
          </View>
          <View style={estilos.duasColunas} onLayout={registrarY?.('numero')}>
            <Input label="NÚMERO" placeholder="Ex: 123" value={numero} onChangeText={onNumero} keyboardType="numeric" erro={erros?.numero} estilo={{ flex: 1 }} />
            <Input label="COMPLEMENTO" placeholder="Ap, sala..." value={complemento} onChangeText={onComplemento} estilo={{ flex: 1 }} />
          </View>
          <Input label="BAIRRO" value={bairro} onChangeText={onBairro} />
          {logradouro.trim() !== '' && (
            <View style={estilos.geoConfirm}>
              <Text style={estilos.geoConfirmTexto}>📍 Endereço completo — profissionais próximos serão notificados!</Text>
            </View>
          )}
        </>
      )}
      <View onLayout={registrarY?.('uf', 'cidade')}>
        <SeletorLocalidade uf={uf} cidade={cidade} onChange={onLocalidade} erroEstado={erros?.uf} erroCidade={erros?.cidade} />
      </View>
      {rodapeTexto}
    </>
  )
}

// Textos de confirmação acima do "Publicar pedido" (os mesmos de antes).
export const AvisosPublicar = () => (
  <>
    <Text style={[estilos.avisoUpload, { fontSize: 15, fontWeight: '700', lineHeight: 22 }]}>Confira os dados antes de publicar!</Text>
    <Text style={estilos.avisoUpload}>⏳ A publicação pode demorar até 1 minuto. Não saia da tela até ser notificado!</Text>
    <Text style={estilos.aviso}>Seu serviço será publicado imediatamente e profissionais qualificados da sua região poderão demonstrar interesse.</Text>
  </>
)

// ─── Passo 1, beleza/cuidados: "Onde vai ser o atendimento?" ─────────────────────────────
// Só aparece quando alguma categoria marcada está em CATEGORIAS_CUIDADO; aí é obrigatória.
// Três linhas grandes (mesmo molde das linhas da folha do grupo), escolha única.
export function CaixaLocalAtendimento({ valor, onEscolher, erro }) {
  return (
    <View style={[estilos.localCaixa, erro && { borderColor: cores.perigo }]} accessibilityRole="radiogroup">
      <Text style={estilos.localCaixaTitulo}>📍 Onde vai ser o atendimento?</Text>
      {erro ? <Text style={estilos.erroTexto}>{erro}</Text> : null}
      {LOCAIS_ATENDIMENTO.map((o) => {
        const marcada = valor === o.id
        return (
          <TouchableOpacity
            key={o.id}
            style={[estilos.linha, marcada && estilos.linhaMarcada]}
            onPress={() => onEscolher(o.id)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: marcada }}
          >
            <Text style={estilos.linhaEmoji}>{o.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={estilos.linhaNome}>{o.titulo}</Text>
              {o.subtitulo ? <Text style={estilos.linhaExemplos}>{o.subtitulo}</Text> : null}
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export const PASSO_DO_CAMPO = {
  categorias: 1, localAtendimento: 1,
  titulo: 2, descricao: 2,
  urgencia: 3, valorEstimado: 3,
  cep: 4, logradouro: 4, numero: 4, uf: 4, cidade: 4,
}

export { SLUG_OUTROS }

// ─── OBRA (Arte-Cadastrar-Obra): a mesma moldura, com as peças que só a obra tem ──────────
export const TITULOS_PASSO_OBRA = {
  1: { titulo: 'Que tipo de obra?',   subtitulo: 'Escolha um tipo. Ele diz aos profissionais certos que a obra existe.' },
  2: { titulo: 'Conte sobre a obra',  subtitulo: 'Um título curto, a descrição e, se ajudar, um vídeo ou fotos.' },
  3: { titulo: 'Quando começa?',      subtitulo: 'O prazo para o início e quanto você quer pagar.' },
  4: { titulo: 'Onde é a obra?',      subtitulo: 'O endereço da obra. Comece pelo CEP.' },
}

export const PASSO_DO_CAMPO_OBRA = {
  categoria: 1,
  titulo: 2, descricao: 2,
  prazo: 3, dataInicial: 3, valorEstimado: 3,
  cep: 4, logradouro: 4, numero: 4, uf: 4, cidade: 4,
}

// Grade 2 colunas de escolha ÚNICA (tipos de obra), cada tile com emoji, nome e a linha de
// exemplos; o tile largo do fim é "Outro tipo de obra". tipos: tiposObraComExemplos().
export function GradeTiposObra({ tipos, tileOutros, selecionado, onEscolher }) {
  return (
    <View style={estilos.grade} accessibilityRole="radiogroup">
      {tipos.map((t) => {
        const ativo = selecionado === t.slug
        return (
          <TouchableOpacity
            key={t.slug}
            style={[estilos.tile, estilos.tileObra, ativo && estilos.tileAtivo]}
            onPress={() => onEscolher(t.slug)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: ativo }}
            accessibilityLabel={t.rotulo}
          >
            {ativo ? <View style={estilos.tileCheck}><Text style={estilos.caixaCheck}>✓</Text></View> : null}
            <Text style={estilos.tileEmoji}>{t.emoji}</Text>
            <Text style={[estilos.tileTitulo, ativo && { color: cores.primaria }]} numberOfLines={1}>{t.rotulo}</Text>
            {t.exemplos ? <Text style={estilos.tileExemplos} numberOfLines={2}>{t.exemplos}</Text> : null}
          </TouchableOpacity>
        )
      })}
      <TouchableOpacity
        style={[estilos.tileLargo, selecionado === tileOutros.id && estilos.tileAtivo]}
        onPress={() => onEscolher(tileOutros.id)}
        activeOpacity={0.8}
        accessibilityRole="radio"
        accessibilityState={{ selected: selecionado === tileOutros.id }}
      >
        <Text style={estilos.tileEmoji}>{tileOutros.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[estilos.tileTitulo, { textAlign: 'left' }, selecionado === tileOutros.id && { color: cores.primaria }]}>{tileOutros.titulo}</Text>
          <Text style={estilos.tileDesc}>{tileOutros.desc}</Text>
        </View>
        <Caixa marcada={selecionado === tileOutros.id} />
      </TouchableOpacity>
    </View>
  )
}

// Passo 3 da obra: os 6 prazos de sempre (3 por linha, "Defina a data" abre o campo de data
// dd/mm/aaaa) + o valor em destaque com a mesma nota do serviço.
export function PassoPrazoValorObra({ prazos, prazo, onPrazo, dataInicial, onDataInicial, valor, onValor, erros, registrarY }) {
  const linhas = []
  for (let i = 0; i < prazos.length; i += 3) linhas.push(prazos.slice(i, i + 3))
  return (
    <>
      <View onLayout={registrarY?.('prazo')}>
        <Text style={estilos.label}>⏰ PRAZO PARA INICIAR O SERVIÇO</Text>
        {erros?.prazo ? <Text style={estilos.erroTexto}>{erros.prazo}</Text> : null}
        <View style={estilos.prazosGrid}>
          {linhas.map((linha, i) => (
            <View key={i} style={estilos.prazoLinha}>
              {linha.map((p) => (
                <TouchableOpacity key={p.id} style={[estilos.prazoCard, prazo === p.id && estilos.urgenciaCardAtivo]} onPress={() => onPrazo(p.id)} accessibilityRole="radio" accessibilityState={{ selected: prazo === p.id }}>
                  <Text style={estilos.urgenciaLabel}>{p.label}</Text>
                  <Text style={estilos.urgenciaDesc}>{p.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
        {prazo === 'data' && (
          <View onLayout={registrarY?.('dataInicial')}>
            <Input label="DATA INICIAL DA OBRA" placeholder="dd/mm/aaaa" value={dataInicial} onChangeText={onDataInicial} keyboardType="numeric" maxLength={10} erro={erros?.dataInicial} />
          </View>
        )}
      </View>
      <View onLayout={registrarY?.('valorEstimado')}>
        <Text style={estilos.secaoTitulo}>Quanto quer pagar?</Text>
        <View style={[estilos.valorCaixa, erros?.valorEstimado && { borderColor: cores.perigo }]}>
          <Text style={estilos.valorPrefixo}>R$</Text>
          <Input placeholder="0,00" value={valor} onChangeText={onValor} keyboardType="numeric" estilo={estilos.valorInputWrap} estiloInput={estilos.valorInput} accessibilityLabel="Valor oferecido para a obra, em reais" />
        </View>
        {erros?.valorEstimado ? <Text style={estilos.erroTexto}>{erros.valorEstimado}</Text> : null}
        <Text style={estilos.valorNota}>Os profissionais podem aceitar o seu valor ou sugerir outro. Você escolhe.</Text>
      </View>
    </>
  )
}

// Uma caixa calma, acima do "Publicar obra", no lugar dos três avisos laranja.
export const CaixaAvisosObra = () => (
  <View style={estilos.caixaCalma}>
    <Text style={estilos.caixaCalmaTitulo}>Antes de publicar</Text>
    <Text style={estilos.caixaCalmaTexto}>• Confira os dados.</Text>
    <Text style={estilos.caixaCalmaTexto}>• Sua obra passa por uma breve aprovação. Depois, os profissionais qualificados da sua região são avisados.</Text>
    <Text style={estilos.caixaCalmaTexto}>• Publicar leva até 1 minuto. Fique nesta tela até o aviso.</Text>
  </View>
)

const estilos = StyleSheet.create({
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 24, paddingTop: 12 },
  // Cabeçalho: ← e o título da tela lado a lado (28, peso 900, laranja da arte), depois
  // "Passo N de 4" pequeno em cinza e a barra; a pergunta do passo vem menor (22).
  cabecalhoLinha: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnVoltarTexto: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  tituloTela: { flex: 1, fontSize: 28, fontWeight: '900', color: '#E08A44', letterSpacing: -0.5, lineHeight: 34 },
  passoDe: { fontSize: 12, color: cores.textoMedio, fontWeight: '700', letterSpacing: 0.3, marginBottom: 6 },
  progresso: { flexDirection: 'row', gap: 6, marginBottom: 18 },
  progressoSegmento: { flex: 1, height: 6, borderRadius: 3, backgroundColor: cores.fundoElevado },
  progressoFeito: { backgroundColor: cores.primaria },
  titulo: { fontSize: 22, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.4, lineHeight: 28, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 16, lineHeight: 20 },
  // Rodapé fixo: linha fina em cima, mesmo fundo da tela.
  rodape: { paddingHorizontal: espacos.tela, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: cores.borda, backgroundColor: cores.fundo },
  rodapeBotao: { marginTop: 0 },
  rodapeNota: { fontSize: 12, color: cores.primaria, textAlign: 'center', marginBottom: 8, fontWeight: '600', lineHeight: 18 },
  label: { fontSize: 11, color: cores.textoForte, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  erroTexto: { fontSize: 11, color: cores.perigo, marginBottom: 8 },
  // Grade 2 colunas: tiles grandes (emoji 32, título 14) e o tile largo de "Outros".
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  tile: { width: '48%', flexGrow: 1, minHeight: 104, backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.grande, alignItems: 'center', justifyContent: 'center', padding: 12, gap: 8 },
  tileAtivo: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  tileApagado: { opacity: 0.4 },
  tileEmoji: { fontSize: 32, lineHeight: 38 },
  tileTitulo: { fontSize: 14, fontWeight: '600', color: cores.textoForte, textAlign: 'center', lineHeight: 19 },
  tileDesc: { fontSize: 12, color: cores.textoMedio, lineHeight: 17, marginTop: 2 },
  tileLegenda: { fontSize: 11, color: cores.textoMedio, textAlign: 'center', marginTop: -2 },
  folhaAviso: { fontSize: 12, color: '#FFC107', lineHeight: 17, marginTop: -6, marginBottom: 12, fontWeight: '600' },
  tileBadge: { position: 'absolute', top: 8, right: 8, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tileBadgeTexto: { fontSize: 12, fontWeight: '800', color: '#0A0A0A' },
  tileLargo: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.grande, padding: 14 },
  // Tile de obras: a borda e o raio ficam no Touchable, que recorta o gradiente (mesmo molde
  // do CartaoEscolha); o gradiente só carrega o padding. Laranja da arte, do canto para o fundo.
  tileObras: { width: '100%', borderWidth: 1.5, borderColor: cores.primaria, borderRadius: raios.grande, overflow: 'hidden' },
  tileObrasMiolo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  tileObrasTitulo: { textAlign: 'left', fontSize: 15, fontWeight: '700', color: '#F2C9A5' },
  tileObrasSeta: { fontSize: 18, fontWeight: '700', color: cores.primaria },
  // Tiles da obra: mais altos (têm a linha de exemplos) e com o ✓ no canto quando escolhidos.
  tileObra: { minHeight: 128, gap: 4 },
  tileExemplos: { fontSize: 11, color: cores.textoMedio, textAlign: 'center', lineHeight: 15 },
  tileCheck: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  prazosGrid: { gap: 8, marginBottom: 12 },
  prazoLinha: { flexDirection: 'row', gap: 8 },
  prazoCard: { flex: 1, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12 },
  caixaCalma: { backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, padding: 14, marginTop: 8, marginBottom: 8 },
  caixaCalmaTitulo: { fontSize: 13, fontWeight: '700', color: cores.textoForte, marginBottom: 6 },
  caixaCalmaTexto: { fontSize: 12, color: cores.textoMedio, lineHeight: 18 },
  chipsBloco: { marginBottom: 16 },
  chipsCabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contador: { fontSize: 11, color: cores.textoMedio, fontWeight: '600', marginBottom: 8, fontVariant: ['tabular-nums'] },
  chipsVazio: { fontSize: 12, color: cores.textoMedio, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 8 },
  chipTexto: { fontSize: 13, color: '#0A0A0A', fontWeight: '600' },
  chipX: { fontSize: 12, color: '#0A0A0A', fontWeight: '800' },
  limite: { fontSize: 12, color: cores.primaria, fontWeight: '600', marginTop: 8 },
  sugestaoCard: { backgroundColor: cores.info + '14', borderWidth: 1, borderColor: cores.info, borderRadius: raios.medio, padding: 12, marginTop: -4, marginBottom: 16 },
  sugestaoTitulo: { fontSize: 12, fontWeight: '700', color: cores.info, marginBottom: 8 },
  sugestaoChip: { borderWidth: 1, borderStyle: 'dashed', borderColor: cores.info, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 6 },
  sugestaoChipTexto: { fontSize: 12, color: cores.info, fontWeight: '600' },
  // Folha do grupo (mesmo molde das outras folhas: fundoCard, cantos 24, alça).
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  folha: { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: espacos.tela, paddingTop: 12, maxHeight: '88%', ...larguraMaxima },
  alca: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 14 },
  folhaTitulo: { fontSize: 20, fontWeight: '800', color: cores.textoForte, letterSpacing: -0.3, marginBottom: 2 },
  folhaSub: { fontSize: 12, color: cores.textoMedio, marginBottom: 12 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, marginBottom: 8, minHeight: 64 },
  linhaMarcada: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  linhaEmoji: { fontSize: 26, width: 34, textAlign: 'center' },
  linhaNomeLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  linhaNome: { fontSize: 15, fontWeight: '700', color: cores.textoForte },
  tagNovo: { backgroundColor: cores.sucessoSuave, borderWidth: 1, borderColor: cores.sucesso, borderRadius: raios.pill, paddingHorizontal: 7, paddingVertical: 1 },
  tagNovoTexto: { fontSize: 10, fontWeight: '800', color: cores.sucesso, letterSpacing: 0.5 },
  linhaExemplos: { fontSize: 12, color: cores.textoMedio, lineHeight: 17, marginTop: 2 },
  caixa: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: cores.bordaCampo, alignItems: 'center', justifyContent: 'center' },
  caixaMarcada: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  caixaCheck: { fontSize: 16, fontWeight: '800', color: '#0A0A0A', lineHeight: 20 },
  localCaixa: { backgroundColor: cores.primariaSuave, borderWidth: 1.5, borderColor: cores.primaria, borderRadius: raios.medio, padding: 12, marginBottom: 16 },
  localCaixaTitulo: { fontSize: 16, fontWeight: '800', color: cores.textoForte, marginBottom: 10 },
  // Passo 2
  tituloBordaAzul: { borderColor: cores.info, borderWidth: 1.5 },
  // Passo 3
  urgenciasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  urgenciaCard: { width: '31%', flexGrow: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, paddingHorizontal: 8, paddingVertical: 10 },
  urgenciaCardAtivo: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  urgenciaLabel: { fontSize: 12, fontWeight: '600', color: cores.textoForte, marginBottom: 2, textAlign: 'center' },
  urgenciaDesc: { fontSize: 10, color: cores.textoFraco, textAlign: 'center' },
  secaoTitulo: { fontSize: 20, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.3, marginBottom: 10 },
  valorCaixa: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.fundoInput, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: raios.grande, paddingHorizontal: 16 },
  valorPrefixo: { fontSize: 22, fontWeight: '700', color: cores.textoFraco },
  valorInputWrap: { flex: 1, marginBottom: 0 },
  valorInput: { borderWidth: 0, backgroundColor: 'transparent', fontSize: 28, fontWeight: '700', paddingHorizontal: 0, height: 64 },
  valorNota: { fontSize: 12, color: cores.textoMedio, lineHeight: 18, marginTop: 10, marginBottom: 16 },
  // Passo 4
  cepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cepOk: { fontSize: 20, marginTop: 28, marginLeft: 12 },
  dicaCep: { fontSize: 11, color: cores.textoMedio, marginBottom: 10, marginTop: -2 },
  duasColunas: { flexDirection: 'row', gap: 12 },
  geoConfirm: { backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: cores.sucesso, borderRadius: raios.medio, padding: 10, marginBottom: 16 },
  geoConfirmTexto: { fontSize: 12, color: cores.sucesso, textAlign: 'center' },
  aviso: { fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 12, lineHeight: 18 },
  avisoUpload: { fontSize: 12, color: cores.primaria, textAlign: 'center', marginTop: 12, marginBottom: 4, fontWeight: '600', lineHeight: 18 },
})
