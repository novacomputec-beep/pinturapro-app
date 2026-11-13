import React, { useState, useEffect, useRef } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, TextInput, ScrollView, KeyboardAvoidingView, Platform, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import useArrastarParaFechar from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'
import { paraSeletor, CATEGORIAS_SERVICO, MAX_CATEGORIAS_DEMANDA, rotuloCategoria } from '../utils/categorias'

// Bottom sheet "Categorias do pedido" (Arte-Editar-Categorias): o DONO de um reparo ABERTO e
// ainda sem profissional escolhido troca as categorias do pedido — o mesmo seletor de pills do
// cadastro (CadastrarReparoScreen), com até MAX_CATEGORIAS_DEMANDA (3), mais um campo de busca.
// As categorias que ENTRAM (marcadas e ausentes da lista original) ficam verdes com "＋": são
// elas que disparam o aviso aos profissionais (PATCH /reparos/dono/:id/categorias, API
// pinturapro-api e53ffae — adicionar avisa quem ainda não foi avisado; remover não avisa ninguém).
//
// Mesma divisão de trabalho do ModalAumentarValor: o PATCH é do pai, via onSalvar(categorias),
// que resolve quando deu certo (o pai fecha e recarrega) e rejeita/alerta quando não; aqui só a
// seleção, a busca e a trava de toque duplo. O miolo é exportado (EditarCategoriasConteudo)
// para a Galeria de estados.

const CATEGORIAS = paraSeletor(CATEGORIAS_SERVICO)

// Busca sem acento e sem caixa: "eletr" acha "⚡ Elétrica". Mesma normalização do
// VerificacaoIdentidadeSheet.
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const mesmaLista = (a, b) => a.length === b.length && a.every((x) => b.includes(x))

// "Elétrica, Hidráulica e Pintura" para o toast de avisados; rótulo do mapa, nunca o slug.
export const listarRotulos = (slugs) => {
  const r = (Array.isArray(slugs) ? slugs : []).map(rotuloCategoria).filter(Boolean)
  if (r.length <= 1) return r.join('')
  return `${r.slice(0, -1).join(', ')} e ${r[r.length - 1]}`
}

// Conteúdo puro (sem Modal): o sheet real e a Galeria usam o MESMO miolo.
//   originais    — as categorias do pedido hoje (as que entrarem a mais ficam verdes com ＋);
//   selecionadas — a escolha atual; onAlternar(slug) marca/desmarca;
//   busca/onBusca — o campo de busca; onSalvar — "Salvar e avisar"; salvando trava tudo.
//   arraste — panHandlers de useArrastarParaFechar (só o sheet real passa): alça e cabeçalho.
//   onFechar — a pílula "✕ Fechar" à direita do título; travada enquanto salva, como o toque fora.
export const EditarCategoriasConteudo = ({ originais, selecionadas, busca, onBusca, onAlternar, onSalvar, salvando = false, arraste, onFechar }) => {
  const noLimite = selecionadas.length >= MAX_CATEGORIAS_DEMANDA
  const termo = semAcento(busca)
  const visiveis = termo ? CATEGORIAS.filter((c) => semAcento(c.label).includes(termo)) : CATEGORIAS
  const mudou = !mesmaLista(selecionadas, originais)
  const podeSalvar = selecionadas.length > 0 && mudou && !salvando
  return (
    <>
      <View {...(arraste || {})}>
        <View style={estilos.alca} />
        <LinhaCabecalhoFolha onFechar={onFechar} desabilitado={salvando}>
          <Text style={estilos.titulo}>Categorias do pedido</Text>
        </LinhaCabecalhoFolha>
        <Text style={estilos.corpo}>Escolha até {MAX_CATEGORIAS_DEMANDA}. Os profissionais das categorias novas são avisados na hora.</Text>
      </View>

      <TextInput
        style={estilos.busca}
        value={busca}
        onChangeText={onBusca}
        placeholder="🔍 Buscar categoria"
        placeholderTextColor={cores.placeholderCampo}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        editable={!salvando}
        accessibilityLabel="Buscar categoria"
      />

      <View style={estilos.cabecalho}>
        <Text style={estilos.contador}>{selecionadas.length} de {MAX_CATEGORIAS_DEMANDA} escolhidas</Text>
        {noLimite && <Text style={estilos.limite}>Limite atingido</Text>}
      </View>

      {/* Lista rolável de altura limitada: a folha precisa caber com o teclado aberto e ainda
          deixar o botão à vista; com a busca filtrando, poucas pills ficam na tela. */}
      <ScrollView style={estilos.lista} contentContainerStyle={estilos.pills} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {visiveis.map((c) => {
          const ativa = selecionadas.includes(c.id)
          const nova = ativa && !originais.includes(c.id)
          const bloqueada = !ativa && noLimite
          return (
            <TouchableOpacity
              key={c.id}
              style={[estilos.pill, ativa && estilos.pillAtiva, nova && estilos.pillNova, bloqueada && estilos.pillBloqueada]}
              onPress={() => onAlternar(c.id)}
              disabled={bloqueada || salvando}
              accessibilityRole="button"
              accessibilityState={{ selected: ativa, disabled: bloqueada }}
              accessibilityLabel={nova ? `${c.label}, nova` : c.label}
            >
              <Text style={[estilos.pillTexto, ativa && estilos.pillTextoAtiva, nova && estilos.pillTextoNova]} numberOfLines={1}>
                {nova ? `＋ ${c.label}` : c.label}
              </Text>
            </TouchableOpacity>
          )
        })}
        {visiveis.length === 0 && <Text style={estilos.vazio}>Nenhuma categoria com "{String(busca).trim()}".</Text>}
      </ScrollView>

      <TouchableOpacity
        style={[estilos.cta, !podeSalvar && estilos.ctaDesabilitado]}
        onPress={onSalvar}
        disabled={!podeSalvar}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Salvar e avisar"
      >
        <Text style={estilos.ctaTexto} maxFontSizeMultiplier={1.4}>{salvando ? 'Salvando…' : 'Salvar e avisar'}</Text>
      </TouchableOpacity>
    </>
  )
}

// visivel: abre/fecha. categorias: a lista atual do pedido (reposta a cada abertura, como o
// ModalAumentarValor repõe o mínimo). onSalvar(lista): promise do pai — resolvida, o pai já
// fechou; rejeitada, o pai já alertou e a folha fica aberta com a escolha para tentar de novo.
export default function EditarCategoriasSheet({ visivel, categorias, onSalvar, onFechar }) {
  const insets = useSafeAreaInsets()
  const [selecionadas, setSelecionadas] = useState([])
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const salvandoRef = useRef(false)
  const originais = Array.isArray(categorias) ? categorias : []

  useEffect(() => {
    if (visivel) {
      setSelecionadas(originais)
      setBusca('')
      setSalvando(false)
      salvandoRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel])

  const alternar = (slug) => {
    setSelecionadas((atual) => {
      if (atual.includes(slug)) return atual.filter((c) => c !== slug)
      if (atual.length >= MAX_CATEGORIAS_DEMANDA) return atual
      return [...atual, slug]
    })
  }

  const salvar = async () => {
    if (salvandoRef.current || selecionadas.length === 0) return
    salvandoRef.current = true
    setSalvando(true)
    try {
      await onSalvar(selecionadas)
    } catch (err) {
      // O pai já alertou; aqui só se solta a trava para a pessoa tentar de novo.
      console.log('[EditarCategorias] salvar não concluiu | code:', err?.code)
    } finally {
      salvandoRef.current = false
      setSalvando(false)
    }
  }

  // Arrastar para baixo fecha como o toque fora e o voltar do Android — e, como eles, fica
  // desligado enquanto salva.
  const { panHandlers, estiloArraste, medirFolha } = useArrastarParaFechar(salvando ? null : onFechar, !!visivel)

  return (
    <Modal visible={!!visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={salvando ? undefined : onFechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={salvando ? undefined : onFechar} accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.sheet, { paddingBottom: insets.bottom + 20 }, estiloArraste]} onLayout={medirFolha}>
          <EditarCategoriasConteudo
            originais={originais}
            selecionadas={selecionadas}
            busca={busca}
            onBusca={setBusca}
            onAlternar={alternar}
            onSalvar={salvar}
            salvando={salvando}
            arraste={panHandlers}
            onFechar={onFechar}
          />
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  // Mesma casca do AvisarPedidoSheet.
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: espacos.tela, paddingTop: 12, ...larguraMaxima },
  alca:            { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 16 },
  titulo:          { fontSize: 20, fontWeight: '800', color: cores.textoForte, letterSpacing: -0.3, marginBottom: 6 },
  corpo:           { fontSize: 13, color: cores.textoMedio, lineHeight: 19, marginBottom: 14 },
  busca:           { backgroundColor: cores.fundoCampo, borderWidth: 1, borderColor: cores.bordaCampo, borderRadius: raios.medio, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: cores.textoForte, marginBottom: 12 },
  cabecalho:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  contador:        { fontSize: 11, color: cores.textoMedio, fontWeight: '600', fontVariant: ['tabular-nums'] },
  limite:          { fontSize: 11, color: cores.primaria, fontWeight: '600' },
  lista:           { maxHeight: 260, marginBottom: 14 },
  // Pills na medida das de CATEGORIA do cadastro (31% de largura, paddingVertical 7, rótulo 12).
  pills:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  pill:            { width: '31%', alignItems: 'center', backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 7 },
  pillAtiva:       { backgroundColor: cores.primaria, borderColor: cores.primaria },
  // Categoria que ENTRA: verde, com ＋ — é a que vai avisar profissionais.
  pillNova:        { backgroundColor: cores.sucesso, borderColor: cores.sucesso },
  pillBloqueada:   { opacity: 0.4 },
  pillTexto:       { fontSize: 12, color: cores.textoMedio, textAlign: 'center' },
  pillTextoAtiva:  { color: '#0A0A0A', fontWeight: '600' },
  pillTextoNova:   { color: '#0A0A0A', fontWeight: '700' },
  vazio:           { width: '100%', fontSize: 13, color: cores.textoFraco, textAlign: 'center', paddingVertical: 16 },
  cta:             { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center' },
  ctaDesabilitado: { opacity: 0.5 },
  ctaTexto:        { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
})
