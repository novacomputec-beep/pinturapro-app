import React, { useRef, useMemo, useLayoutEffect } from 'react'
import { Animated, View, StyleSheet } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'

// Arrastar para baixo fecha a folha (bottom sheet). Um hook só para TODAS as folhas do app
// (FolhaGrupo, EditarCategoriasSheet, SheetDesfazerEscolha, SheetProfissionalDesistiu…).
//
// Por que react-native-gesture-handler e não PanResponder (build 1.2.2, Android): a zona do
// arraste era um <View {...panHandlers}> sem fundo — com a New Architecture (Fabric) uma View
// só de layout é ACHATADA, então o toque na área vazia do cabeçalho caía no container da
// folha e nunca chegava ao PanResponder (só a barrinha de 4px e as letras do título pegavam).
// Agora o gesto é um Pan nativo do RNGH num View com collapsable={false}, o mesmo caminho do
// AjustarFoto, que já funciona dentro de Modal.
//
// Uso em cada folha:
//   const { gesto, estiloArraste, medirFolha } = useArrastarParaFechar(onFechar, visivel)
//   <Modal …><RaizGestosFolha>          ← GestureHandlerRootView DENTRO do Modal (janela própria no Android)
//     <Animated.View style={[…, estiloArraste]} onLayout={medirFolha}>
//       <ZonaArraste gesto={gesto}>alça + título + "✕ Fechar"</ZonaArraste>   ← mín. 48px
//       …lista (fora da zona: rola normal)…
//
//   - a folha acompanha o dedo para baixo (nunca sobe além do repouso);
//   - ao soltar: passou de 25% da altura (LIMIAR_FRACAO; sem medida, LIMIAR_DISTANCIA px) ou
//     puxão rápido (velocityY > LIMIAR_VELOCIDADE px/s) → onFechar; senão volta com mola;
//   - `onFechar` null/undefined = gesto desligado (folha travada enquanto envia);
//   - `visivel` zera a posição a cada abertura;
//   - o Pan só ativa depois de MINIMO_PARA_TOMAR px PARA BAIXO, então o toque no "✕ Fechar"
//     e em botões do cabeçalho continua chegando a eles.

export const LIMIAR_FRACAO = 0.25       // fração da altura da folha que fecha ao soltar
export const LIMIAR_DISTANCIA = 80      // px, enquanto a folha ainda não foi medida
export const LIMIAR_VELOCIDADE = 500    // px/s (puxão rápido fecha mesmo com pouca distância)
const MINIMO_PARA_TOMAR = 6             // px para baixo antes de o gesto ativar
const ALTURA_MIN_ZONA = 48              // a zona do arraste nunca é menor que isto

export default function useArrastarParaFechar(onFechar, visivel = true) {
  const translateY = useRef(new Animated.Value(0)).current
  const onFecharRef = useRef(onFechar)
  onFecharRef.current = onFechar
  const alturaRef = useRef(0)
  const ligado = !!onFechar

  // Antes de pintar: a folha reaberta nasce no lugar, sem o deslocamento do arraste anterior.
  useLayoutEffect(() => { if (visivel) translateY.setValue(0) }, [visivel, translateY])

  const gesto = useMemo(() => {
    const voltar = () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 20 }).start()
    let fechou = false
    return Gesture.Pan()
      .runOnJS(true)
      .enabled(ligado)
      .activeOffsetY(MINIMO_PARA_TOMAR)
      .failOffsetX([-24, 24])
      .onStart(() => { fechou = false })
      .onUpdate((e) => translateY.setValue(Math.max(0, e.translationY)))
      .onEnd((e) => {
        const limiar = alturaRef.current > 0 ? alturaRef.current * LIMIAR_FRACAO : LIMIAR_DISTANCIA
        const fechar = onFecharRef.current
        if (fechar && (e.translationY > limiar || e.velocityY > LIMIAR_VELOCIDADE)) { fechou = true; fechar(); return }
        voltar()
      })
      .onFinalize(() => { if (!fechou) voltar() })
  }, [ligado, translateY])

  const medirFolha = (e) => { alturaRef.current = e?.nativeEvent?.layout?.height || 0 }

  return { gesto, estiloArraste: { transform: [{ translateY }] }, medirFolha }
}

// Zona do arraste: alça + título + "✕ Fechar". collapsable={false} impede o achatamento que
// escondia a área do toque; sem `gesto` (a Galeria de estados) é só um View.
export function ZonaArraste({ gesto, style, children }) {
  const corpo = <View collapsable={false} style={[estilos.zona, style]}>{children}</View>
  return gesto ? <GestureDetector gesture={gesto}>{corpo}</GestureDetector> : corpo
}

// Raiz do RNGH DENTRO de cada Modal: no Android o Modal é uma janela nativa à parte, fora da
// raiz do app, e sem esta raiz os gestos do RNGH não chegam lá.
export function RaizGestosFolha({ children }) {
  return <GestureHandlerRootView style={estilos.raiz}>{children}</GestureHandlerRootView>
}

const estilos = StyleSheet.create({
  zona: { minHeight: ALTURA_MIN_ZONA },
  raiz: { flex: 1 },
})
