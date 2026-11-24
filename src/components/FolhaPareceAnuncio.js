import React from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, Animated, Share } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'
import useArrastarParaFechar, { ZonaArraste, RaizGestosFolha } from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'
import { meuCodigoIndicacao, linkDeIndicacao } from '../utils/indicacao'

// Folha "📢 Isto parece um anúncio" (arte salvar-e-anuncio-previa-v2): aparece no "Publicar" do
// cadastro de serviço/obra quando a API marca o texto como anúncio de quem OFERECE serviço
// (suspeita_anuncio) e NÃO cria o pedido. Três saídas:
//   - "📤 Compartilhar meu perfil": folha de compartilhar do sistema com o link do perfil;
//   - "É um pedido de verdade, publicar": a tela reenvia com confirmar_pedido_real: true;
//   - "Cancelar" (✕, toque fora, voltar, arrastar): fecha, o formulário fica como está.
// Mesmo molde visual da FolhaDicaFoto.
//
// Contrato lido aqui (as duas formas razoáveis da recusa): erro com codigo 'SUSPEITA_ANUNCIO'
// ou corpo com suspeita_anuncio: true — num 4xx (chega como erro, corpo em `dados`) ou num 200
// sem `id`. O link do perfil vem do mesmo corpo, em `link_perfil`.
export const ehSuspeitaAnuncio = (x) =>
  x?.codigo === 'SUSPEITA_ANUNCIO' || x?.suspeita_anuncio === true || x?.dados?.suspeita_anuncio === true
export const linkPerfilDe = (x) => {
  const l = x?.link_perfil ?? x?.dados?.link_perfil
  return typeof l === 'string' && l.trim() ? l.trim() : null
}

// Sem link do perfil na resposta, vai o link de convite da pessoa (protudo.app.br/baixar?c=…),
// que é o que o app tem de público para ela hoje.
export const compartilharPerfil = async (linkPerfil) => {
  let link = linkPerfil
  if (!link) {
    const codigo = await meuCodigoIndicacao()
    link = codigo ? linkDeIndicacao(codigo) : 'https://protudo.app.br/baixar'
  }
  try {
    await Share.share({ message: `Conheça o meu perfil no ProTudo, com as minhas especialidades e avaliações: ${link}` })
  } catch (err) {
    console.log('[FolhaPareceAnuncio] compartilhar cancelado/falhou | msg:', err?.message)
  }
}

const N = ({ children }) => <Text style={estilos.negrito}>{children}</Text>

export default function FolhaPareceAnuncio({ visivel, linkPerfil, onPublicar, onFechar }) {
  const insets = useSafeAreaInsets()
  const { gesto, estiloArraste, medirFolha } = useArrastarParaFechar(onFechar, !!visivel)
  if (!visivel) return null
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onFechar}>
      <RaizGestosFolha>
      <View style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityLabel="Fechar" />
        <Animated.View style={[estilos.sheet, { paddingBottom: insets.bottom + 20 }, estiloArraste]} onLayout={medirFolha}>
          <ZonaArraste gesto={gesto} style={{ alignSelf: 'stretch' }}>
            <View style={estilos.alca} />
            <LinhaCabecalhoFolha onFechar={onFechar}>
              <Text style={estilos.titulo}>📢 Isto parece um anúncio</Text>
            </LinhaCabecalhoFolha>
            <Text style={estilos.corpo}>Aqui os <N>pedidos</N> são de quem quer <N>contratar</N> um serviço.</Text>
            <Text style={[estilos.corpo, { marginBottom: 20 }]}>Quer divulgar o seu trabalho? Compartilhe o seu <N>perfil do ProTudo</N> no WhatsApp e no Instagram. Ele mostra as suas especialidades e avaliações.</Text>
          </ZonaArraste>
          <TouchableOpacity style={estilos.cta} onPress={() => compartilharPerfil(linkPerfil)} activeOpacity={0.85} accessibilityRole="button">
            <Text style={estilos.ctaTexto} maxFontSizeMultiplier={1.4}>📤 Compartilhar meu perfil</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.secundario} onPress={onPublicar} activeOpacity={0.85} accessibilityRole="button">
            <Text style={estilos.secundarioTexto} maxFontSizeMultiplier={1.4}>É um pedido de verdade, publicar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.cancelar} onPress={onFechar} activeOpacity={0.7} accessibilityRole="button">
            <Text style={estilos.cancelarTexto} maxFontSizeMultiplier={1.4}>Cancelar</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
      </RaizGestosFolha>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: espacos.tela, paddingTop: 12, alignItems: 'center', ...larguraMaxima },
  alca:            { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 18 },
  titulo:          { fontSize: 20, fontWeight: '800', color: cores.textoForte, letterSpacing: -0.3, marginBottom: 10 },
  corpo:           { fontSize: 14, color: cores.textoMedio, lineHeight: 21, marginBottom: 14 },
  negrito:         { fontWeight: '700', color: cores.textoForte },
  cta:             { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 10 },
  ctaTexto:        { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  secundario:      { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.grande, paddingVertical: 15, paddingHorizontal: 28, width: '100%', alignItems: 'center' },
  secundarioTexto: { color: cores.textoForte, fontSize: 15, fontWeight: '600' },
  cancelar:        { paddingVertical: 14, paddingHorizontal: 28, alignItems: 'center' },
  cancelarTexto:   { color: cores.textoMedio, fontSize: 14 },
})
