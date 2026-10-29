import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Modal, View, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores } from '../utils/tema'

// "Ajustar foto": o NOSSO recorte, no lugar do recorte do sistema (allowsEditing). Roda
// depois que o seletor/câmera do sistema devolve a uri, então não pede permissão de mídia
// nenhuma — só lê o arquivo que o expo-image-picker já copiou para o cache do app.
//   modo 'perfil' → quadro 1:1 com máscara circular (o arquivo sai QUADRADO)
//   modo 'livre'  → documentos e selfie: quadro livre, começa em 90% da imagem
// Gestos: pinça + arrastar na foto, 4 cantos laranja arrastáveis. Girar 90° e Desfazer.
// O corte e o giro são feitos pelo expo-image-manipulator sobre uma cópia NORMALIZADA da
// imagem (orientação aplicada e lado maior ≤ MAX_LADO): a tela mostra exatamente esses
// pixels, então a conta tela → pixel é direta (escala + deslocamento) e o giro vira uma
// nova imagem, não uma transformação de tela.

// Biblioteca NATIVA: binários anteriores a ela não a têm (OTA). require tardio, e quem chama
// usa cropperDisponivel() para cair no recorte do sistema de antes.
let manipulador
const carregarManipulador = () => {
  if (manipulador !== undefined) return manipulador
  try {
    const m = require('expo-image-manipulator')
    manipulador = m?.ImageManipulator && m?.SaveFormat ? m : null
  } catch (err) {
    console.log('[AjustarFoto] expo-image-manipulator indisponível neste binário | msg:', err?.message)
    manipulador = null
  }
  return manipulador
}
export const cropperDisponivel = () => !!carregarManipulador()

// Lado maior da cópia de trabalho. Fotos de 50 MP estourariam o bitmap da tela no Android;
// 2400 px sobra para foto de perfil e documento.
const MAX_LADO = 2400
const MARGEM = 24        // folga entre a foto ajustada e a borda da área, para os cantos
const QUADRO_MIN = 64    // menor lado do quadro, em pontos de tela
const ZOOM_MAX = 8
const HIT_CANTO = 44
const MAX_DESFAZER = 20

const limitar = (v, min, max) => Math.min(Math.max(v, min), max)

// Renderiza, salva e solta a referência nativa.
const salvar = async (ctx, compress) => {
  const M = carregarManipulador()
  const ref = await ctx.renderAsync()
  try {
    const r = await ref.saveAsync({ compress, format: M.SaveFormat.JPEG })
    return { uri: r.uri, w: r.width, h: r.height }
  } finally { ref.release?.() }
}

const normalizar = async (uri) => {
  const M = carregarManipulador()
  const ref = await M.ImageManipulator.manipulate(uri).renderAsync()
  const maior = Math.max(ref.width, ref.height)
  const k = maior > MAX_LADO ? MAX_LADO / maior : 1
  const largura = Math.round(ref.width * k)
  const altura = Math.round(ref.height * k)
  ref.release?.()
  const ctx = M.ImageManipulator.manipulate(uri)
  return salvar(k < 1 ? ctx.resize({ width: largura, height: altura }) : ctx, 1)
}

// ── Geometria (tudo em pontos da área da foto, origem no canto superior esquerdo) ──────

// Escala em que a foto inteira cabe na área com a margem (zoom 1).
const escalaBase = (img, vp) => Math.min((vp.w - 2 * MARGEM) / img.w, (vp.h - 2 * MARGEM) / img.h)

// Retângulo da foto na tela para uma vista { z, tx, ty } (deslocamento do centro).
export const retanguloFoto = (img, vp, vista) => {
  const s = escalaBase(img, vp) * vista.z
  const w = img.w * s
  const h = img.h * s
  return { x: vp.w / 2 + vista.tx - w / 2, y: vp.h / 2 + vista.ty - h / 2, w, h, s }
}

// Quadro inicial: 90% da foto (livre) ou um quadrado de 90% do lado menor (perfil), centrado.
export const quadroInicial = (img, vp, modo) => {
  const f = retanguloFoto(img, vp, { z: 1, tx: 0, ty: 0 })
  const w = modo === 'perfil' ? 0.9 * Math.min(f.w, f.h) : 0.9 * f.w
  const h = modo === 'perfil' ? w : 0.9 * f.h
  return { x: vp.w / 2 - w / 2, y: vp.h / 2 - h / 2, w, h }
}

// A foto tem de cobrir o quadro inteiro: zoom mínimo e deslocamento ficam presos a isso.
export const prenderVista = (img, vp, vista, quadro) => {
  const s0 = escalaBase(img, vp)
  const zMin = Math.max(quadro.w / (img.w * s0), quadro.h / (img.h * s0))
  const z = limitar(vista.z, zMin, Math.max(zMin, ZOOM_MAX))
  const w = img.w * s0 * z
  const h = img.h * s0 * z
  const tx = limitar(vista.tx, quadro.x + quadro.w - vp.w / 2 - w / 2, quadro.x - vp.w / 2 + w / 2)
  const ty = limitar(vista.ty, quadro.y + quadro.h - vp.h / 2 - h / 2, quadro.y - vp.h / 2 + h / 2)
  return { z, tx, ty }
}

// Quadro → retângulo em PIXELS da imagem de trabalho (o que vai para o crop).
export const retanguloEmPixels = (img, vp, vista, quadro, modo) => {
  const f = retanguloFoto(img, vp, vista)
  let originX = Math.round((quadro.x - f.x) / f.s)
  let originY = Math.round((quadro.y - f.y) / f.s)
  originX = limitar(originX, 0, img.w - 1)
  originY = limitar(originY, 0, img.h - 1)
  let width = limitar(Math.round(quadro.w / f.s), 1, img.w - originX)
  let height = limitar(Math.round(quadro.h / f.s), 1, img.h - originY)
  if (modo === 'perfil') { width = height = Math.min(width, height) }
  return { originX, originY, width, height }
}

// Arrasto de um canto: o canto OPOSTO fica parado; o quadro não sai da foto nem da área.
const CANTOS = [
  { id: 'se', dx: -1, dy: -1 },
  { id: 'sd', dx: 1, dy: -1 },
  { id: 'ie', dx: -1, dy: 1 },
  { id: 'id', dx: 1, dy: 1 },
]
export const moverCanto = (canto, q0, tx, ty, foto, vp, modo) => {
  const ax = canto.dx < 0 ? q0.x + q0.w : q0.x
  const ay = canto.dy < 0 ? q0.y + q0.h : q0.y
  const px = (canto.dx < 0 ? q0.x : q0.x + q0.w) + tx
  const py = (canto.dy < 0 ? q0.y : q0.y + q0.h) + ty
  const bx0 = Math.max(foto.x, 0), by0 = Math.max(foto.y, 0)
  const bx1 = Math.min(foto.x + foto.w, vp.w), by1 = Math.min(foto.y + foto.h, vp.h)
  const maxW = canto.dx < 0 ? ax - bx0 : bx1 - ax
  const maxH = canto.dy < 0 ? ay - by0 : by1 - ay
  let w = (px - ax) * canto.dx
  let h = (py - ay) * canto.dy
  if (modo === 'perfil') {
    const lado = limitar(Math.max(w, h), Math.min(QUADRO_MIN, maxW, maxH), Math.min(maxW, maxH))
    w = h = lado
  } else {
    w = limitar(w, Math.min(QUADRO_MIN, maxW), maxW)
    h = limitar(h, Math.min(QUADRO_MIN, maxH), maxH)
  }
  return { x: canto.dx < 0 ? ax - w : ax, y: canto.dy < 0 ? ay - h : ay, w, h }
}

// ── Tela ───────────────────────────────────────────────────────────────────────────────

const DICAS = {
  perfil: 'Arraste a foto e use dois dedos para aproximar. Deixe seu rosto dentro do círculo.',
  livre: 'Arraste os cantos laranja até as bordas. Use dois dedos para aproximar.',
}

// Conteúdo da tela (sem o Modal), para a Galeria de estados também usar.
// `demo`: imagem local com largura/altura conhecidas e nada de manipulador — Concluir só
// mostra o retângulo calculado, Girar avisa que não roda na galeria.
export function AjustarFotoConteudo({ uri, largura, altura, modo = 'livre', qualidade = 0.8, dica, onConcluir, onCancelar, demo = false, semInsets = false }) {
  const insetsReais = useSafeAreaInsets()
  const insets = semInsets ? { top: 0, bottom: 0 } : insetsReais
  const [img, setImg] = useState(demo ? { uri, w: largura, h: altura } : null)
  const [vp, setVp] = useState(null)
  const [vista, setVista] = useState({ z: 1, tx: 0, ty: 0 })
  const [quadro, setQuadro] = useState(null)
  const [pilha, setPilha] = useState([])
  const [ocupado, setOcupado] = useState(!demo)
  const montadoRef = useRef(true)
  useEffect(() => () => { montadoRef.current = false }, [])

  // Os gestos são criados uma vez e leem o estado mais recente por aqui.
  const atual = useRef({})
  atual.current = { img, vp, vista, quadro, ocupado }

  // Cópia de trabalho normalizada. Falhou → segue com a foto original, sem recorte, em vez
  // de perder a foto que a pessoa acabou de tirar.
  useEffect(() => {
    if (demo) return
    let vivo = true
    normalizar(uri)
      .then((r) => { if (vivo) { setImg(r); setOcupado(false) } })
      .catch((err) => {
        console.log('[AjustarFoto] falha ao preparar a foto | msg:', err?.message)
        if (vivo) onConcluir({ uri, width: largura, height: altura })
      })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri])

  // Quadro inicial quando a foto e a área já têm tamanho (e de novo após girar).
  useEffect(() => {
    if (img && vp && !quadro) { setVista({ z: 1, tx: 0, ty: 0 }); setQuadro(quadroInicial(img, vp, modo)) }
  }, [img, vp, quadro, modo])

  const empilhar = (estado) => setPilha((p) => [...p.slice(-(MAX_DESFAZER - 1)), estado])
  const instantaneo = () => ({ img: atual.current.img, vista: atual.current.vista, quadro: atual.current.quadro })
  const mudou = (a, b) => a.img !== b.img || a.quadro !== b.quadro ||
    a.vista.z !== b.vista.z || a.vista.tx !== b.vista.tx || a.vista.ty !== b.vista.ty

  const gestos = useMemo(() => {
    let inicio = null      // estado no começo do gesto (para o Desfazer)
    let pinca = null
    let arrasto = null
    const comecar = () => { if (!inicio) inicio = instantaneo() }
    const terminar = () => {
      if (inicio && !pinca && !arrasto) {
        const fim = instantaneo()
        if (mudou(inicio, fim)) empilhar(inicio)
        inicio = null
      }
    }
    const pinch = Gesture.Pinch().runOnJS(true)
      .onStart((e) => {
        const { vista: v } = atual.current
        comecar()
        pinca = { ...v, fx: e.focalX, fy: e.focalY }
      })
      .onUpdate((e) => {
        const { img: im, vp: area, quadro: q, ocupado: oc } = atual.current
        if (!pinca || !im || !area || !q || oc) return
        const z = prenderVista(im, area, { z: pinca.z * e.scale, tx: pinca.tx, ty: pinca.ty }, q).z
        const k = z / pinca.z
        // O ponto sob os dedos fica sob os dedos: centro novo = foco − (foco₀ − centro₀)·k.
        const cx = e.focalX - (pinca.fx - (area.w / 2 + pinca.tx)) * k
        const cy = e.focalY - (pinca.fy - (area.h / 2 + pinca.ty)) * k
        setVista(prenderVista(im, area, { z, tx: cx - area.w / 2, ty: cy - area.h / 2 }, q))
      })
      .onFinalize(() => { pinca = null; terminar() })
    const pan = Gesture.Pan().runOnJS(true).maxPointers(1)
      .onStart(() => { comecar(); arrasto = { ...atual.current.vista } })
      .onUpdate((e) => {
        const { img: im, vp: area, quadro: q, ocupado: oc } = atual.current
        if (!arrasto || pinca || !im || !area || !q || oc) return
        setVista(prenderVista(im, area, { z: atual.current.vista.z, tx: arrasto.tx + e.translationX, ty: arrasto.ty + e.translationY }, q))
      })
      .onFinalize(() => { arrasto = null; terminar() })
    const cantos = {}
    CANTOS.forEach((c) => {
      let q0 = null
      let antes = null
      cantos[c.id] = Gesture.Pan().runOnJS(true).minDistance(0)
        .onStart(() => { antes = instantaneo(); q0 = atual.current.quadro })
        .onUpdate((e) => {
          const { img: im, vp: area, vista: v, ocupado: oc } = atual.current
          if (!q0 || !im || !area || oc) return
          setQuadro(moverCanto(c, q0, e.translationX, e.translationY, retanguloFoto(im, area, v), area, modo))
        })
        .onFinalize(() => {
          if (antes && mudou(antes, instantaneo())) empilhar(antes)
          q0 = null; antes = null
        })
        .blocksExternalGesture(pan, pinch)
    })
    return { imagem: Gesture.Simultaneous(pinch, pan), cantos }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo])

  const desfazer = () => {
    if (ocupado || pilha.length === 0) return
    const ultimo = pilha[pilha.length - 1]
    setPilha((p) => p.slice(0, -1))
    setImg(ultimo.img); setVista(ultimo.vista); setQuadro(ultimo.quadro)
  }

  // Girar 90° (horário) = nova imagem de trabalho; o quadro volta ao inicial.
  const girar = async () => {
    if (ocupado || !img) return
    if (demo) { Alert.alert('Galeria', 'Girar usa o expo-image-manipulator e não roda com a imagem de exemplo.'); return }
    const antes = instantaneo()
    setOcupado(true)
    try {
      const M = carregarManipulador()
      const r = await salvar(M.ImageManipulator.manipulate(img.uri).rotate(90), 1)
      if (!montadoRef.current) return
      empilhar(antes)
      setImg(r); setQuadro(null)
    } catch (err) {
      console.log('[AjustarFoto] falha ao girar | msg:', err?.message)
      Alert.alert('Erro', 'Não foi possível girar a foto.')
    } finally { if (montadoRef.current) setOcupado(false) }
  }

  const concluir = async () => {
    if (ocupado || !img || !vp || !quadro) return
    const rect = retanguloEmPixels(img, vp, vista, quadro, modo)
    if (demo) { Alert.alert('Galeria', `Recorte: ${rect.width}×${rect.height} px a partir de (${rect.originX}, ${rect.originY}).`); return }
    setOcupado(true)
    try {
      const M = carregarManipulador()
      const r = await salvar(M.ImageManipulator.manipulate(img.uri).crop(rect), qualidade)
      onConcluir({ uri: r.uri, width: r.w, height: r.h })
    } catch (err) {
      console.log('[AjustarFoto] falha ao recortar | msg:', err?.message)
      if (montadoRef.current) setOcupado(false)
      Alert.alert('Erro', 'Não foi possível recortar a foto. Tente de novo.')
    }
  }

  const foto = img && vp ? retanguloFoto(img, vp, vista) : null
  const circular = modo === 'perfil'

  return (
    <GestureHandlerRootView style={estilos.tela}>
      <View style={[estilos.barraTopo, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onCancelar} style={estilos.botaoTopo} accessibilityRole="button" hitSlop={8}>
          <Text style={estilos.cancelar} maxFontSizeMultiplier={1.15}>✕ Cancelar</Text>
        </TouchableOpacity>
        <Text style={estilos.titulo} numberOfLines={1} maxFontSizeMultiplier={1.15}>Ajustar foto</Text>
        <TouchableOpacity onPress={concluir} disabled={ocupado} style={[estilos.botaoTopo, { alignItems: 'flex-end' }]} accessibilityRole="button" hitSlop={8}>
          <Text style={[estilos.concluir, ocupado && { opacity: 0.4 }]} maxFontSizeMultiplier={1.15}>✓ Concluir</Text>
        </TouchableOpacity>
      </View>

      <View style={estilos.dica}>
        <Text style={estilos.dicaTexto} numberOfLines={2} maxFontSizeMultiplier={1.15}>💡 {dica || DICAS[circular ? 'perfil' : 'livre']}</Text>
      </View>

      <GestureDetector gesture={gestos.imagem}>
        <View style={estilos.area} collapsable={false} onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout
          if (!vp || vp.w !== width || vp.h !== height) { setVp({ w: width, h: height }); setQuadro(null) }
        }}>
          {foto && (
            <Image source={{ uri: img.uri }} resizeMode="stretch" fadeDuration={0}
              style={{ position: 'absolute', left: foto.x, top: foto.y, width: foto.w, height: foto.h }} />
          )}
          {foto && quadro && (
            <>
              {circular ? (
                // Máscara circular sem SVG: um anel com borda grossa o bastante para cobrir a área
                // toda; a borda interna do anel é exatamente o círculo do quadro.
                <View pointerEvents="none" style={{
                  position: 'absolute',
                  left: quadro.x - vp.w - vp.h, top: quadro.y - vp.w - vp.h,
                  width: quadro.w + 2 * (vp.w + vp.h), height: quadro.h + 2 * (vp.w + vp.h),
                  borderRadius: quadro.w / 2 + vp.w + vp.h, borderWidth: vp.w + vp.h, borderColor: 'rgba(0,0,0,0.62)',
                }} />
              ) : (
                <>
                  <View pointerEvents="none" style={[estilos.sombra, { left: 0, top: 0, right: 0, height: quadro.y }]} />
                  <View pointerEvents="none" style={[estilos.sombra, { left: 0, top: quadro.y + quadro.h, right: 0, bottom: 0 }]} />
                  <View pointerEvents="none" style={[estilos.sombra, { left: 0, top: quadro.y, width: quadro.x, height: quadro.h }]} />
                  <View pointerEvents="none" style={[estilos.sombra, { left: quadro.x + quadro.w, top: quadro.y, right: 0, height: quadro.h }]} />
                </>
              )}
              {/* Quadro + grade dos terços. */}
              <View pointerEvents="none" style={[estilos.quadro, { left: quadro.x, top: quadro.y, width: quadro.w, height: quadro.h }]}>
                <View style={[estilos.linhaV, { left: '33.33%' }]} />
                <View style={[estilos.linhaV, { left: '66.66%' }]} />
                <View style={[estilos.linhaH, { top: '33.33%' }]} />
                <View style={[estilos.linhaH, { top: '66.66%' }]} />
              </View>
              {CANTOS.map((c) => {
                const cx = c.dx < 0 ? quadro.x : quadro.x + quadro.w
                const cy = c.dy < 0 ? quadro.y : quadro.y + quadro.h
                return (
                  <GestureDetector key={c.id} gesture={gestos.cantos[c.id]}>
                    <View collapsable={false} style={[estilos.cantoHit, { left: cx - HIT_CANTO / 2, top: cy - HIT_CANTO / 2 }]}>
                      <View style={[estilos.cantoBarraH, c.dx < 0 ? { left: HIT_CANTO / 2 - 2 } : { right: HIT_CANTO / 2 - 2 }, c.dy < 0 ? { top: HIT_CANTO / 2 - 2 } : { bottom: HIT_CANTO / 2 - 2 }]} />
                      <View style={[estilos.cantoBarraV, c.dx < 0 ? { left: HIT_CANTO / 2 - 2 } : { right: HIT_CANTO / 2 - 2 }, c.dy < 0 ? { top: HIT_CANTO / 2 - 2 } : { bottom: HIT_CANTO / 2 - 2 }]} />
                    </View>
                  </GestureDetector>
                )
              })}
            </>
          )}
          {ocupado && (
            <View style={estilos.carregando} pointerEvents="none">
              <ActivityIndicator size="large" color={cores.primaria} />
            </View>
          )}
        </View>
      </GestureDetector>

      <View style={[estilos.barraBase, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity onPress={girar} disabled={ocupado} style={estilos.acao} accessibilityRole="button">
          <Text style={[estilos.acaoIcone, ocupado && estilos.inativo]}>⟳</Text>
          <Text style={[estilos.acaoTexto, ocupado && estilos.inativo]} maxFontSizeMultiplier={1.15}>Girar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={desfazer} disabled={ocupado || pilha.length === 0} style={estilos.acao} accessibilityRole="button">
          <Text style={[estilos.acaoIcone, (ocupado || pilha.length === 0) && estilos.inativo]}>↶</Text>
          <Text style={[estilos.acaoTexto, (ocupado || pilha.length === 0) && estilos.inativo]} maxFontSizeMultiplier={1.15}>Desfazer</Text>
        </TouchableOpacity>
      </View>
    </GestureHandlerRootView>
  )
}

// Modal de tela cheia, edge-to-edge (as barras do sistema ficam por cima; os insets afastam
// o conteúdo). Renderizado DENTRO da árvore de quem chama — inclusive dentro do Modal da
// verificação —, porque no iOS um Modal irmão não abre por cima de outro já aberto.
export function AjustarFotoModal({ pedido, onFim }) {
  return (
    <Modal visible={!!pedido} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => onFim(null)}>
      {pedido ? (
        <AjustarFotoConteudo
          key={pedido.asset.uri}
          uri={pedido.asset.uri}
          largura={pedido.asset.width}
          altura={pedido.asset.height}
          modo={pedido.modo}
          qualidade={pedido.qualidade}
          dica={pedido.dica}
          onConcluir={(r) => onFim(r)}
          onCancelar={() => onFim(null)}
        />
      ) : null}
    </Modal>
  )
}

// ajustar(asset, { modo, qualidade, dica }) → Promise<{ uri, width, height } | null (cancelou)>.
// Sem o manipulador (binário antigo), devolve o próprio asset: quem chama já pediu o recorte
// do sistema nesse caso (ver cropperDisponivel).
export function useAjustarFoto() {
  const [pedido, setPedido] = useState(null)
  const resolverRef = useRef(null)
  const ajustar = useCallback((asset, opcoes = {}) => new Promise((resolve) => {
    if (!asset?.uri || !cropperDisponivel()) { resolve(asset || null); return }
    resolverRef.current?.(null)
    resolverRef.current = resolve
    setPedido({ asset, ...opcoes })
  }), [])
  const onFim = useCallback((resultado) => {
    const resolver = resolverRef.current
    resolverRef.current = null
    setPedido(null)
    resolver?.(resultado)
  }, [])
  return { ajustar, elementoAjustarFoto: <AjustarFotoModal pedido={pedido} onFim={onFim} /> }
}

const LARANJA = cores.primaria

const estilos = StyleSheet.create({
  tela:        { flex: 1, backgroundColor: '#050505' },
  barraTopo:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, backgroundColor: '#111113', borderBottomWidth: 0.5, borderBottomColor: '#222' },
  botaoTopo:   { flex: 1, paddingVertical: 6 },
  cancelar:    { color: '#E6E3DC', fontSize: 15, fontWeight: '600' },
  titulo:      { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center', flexShrink: 0 },
  concluir:    { color: LARANJA, fontSize: 15, fontWeight: '800' },
  dica:        { marginHorizontal: 14, marginTop: 10, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(232,131,58,0.12)', borderWidth: 0.5, borderColor: 'rgba(232,131,58,0.45)' },
  dicaTexto:   { color: '#F0D9C6', fontSize: 12.5, lineHeight: 17 },
  area:        { flex: 1, overflow: 'hidden' },
  sombra:      { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.62)' },
  quadro:      { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' },
  linhaV:      { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.45)' },
  linhaH:      { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.45)' },
  cantoHit:    { position: 'absolute', width: HIT_CANTO, height: HIT_CANTO },
  cantoBarraH: { position: 'absolute', width: 22, height: 4, borderRadius: 2, backgroundColor: LARANJA },
  cantoBarraV: { position: 'absolute', width: 4, height: 22, borderRadius: 2, backgroundColor: LARANJA },
  carregando:  { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  barraBase:   { flexDirection: 'row', justifyContent: 'space-evenly', paddingTop: 10, backgroundColor: '#111113', borderTopWidth: 0.5, borderTopColor: '#222' },
  acao:        { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 4 },
  acaoIcone:   { color: '#FFFFFF', fontSize: 22, lineHeight: 26 },
  acaoTexto:   { color: '#E6E3DC', fontSize: 12, fontWeight: '600', marginTop: 2 },
  inativo:     { opacity: 0.35 },
})
