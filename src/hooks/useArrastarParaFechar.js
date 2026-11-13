import { useRef, useMemo, useLayoutEffect } from 'react'
import { Animated, PanResponder } from 'react-native'

// Arrastar para baixo fecha a folha (bottom sheet). Um hook só para TODAS as folhas do app
// (FolhaGrupo, EditarCategoriasSheet, SheetDesfazerEscolha, SheetProfissionalDesistiu…) não
// divergirem no gesto:
//   - os `panHandlers` vão na alça e no cabeçalho da folha — nunca DIRETO no ScrollView/FlatList
//     de dentro, que continua rolando como sempre;
//   - opcional, na lista: `panHandlersLista` num View em volta do ScrollView + `aoRolarLista`
//     no onScroll dele (scrollEventThrottle 16) — o arraste só é tomado da lista quando ela está
//     no TOPO e o dedo vai para baixo; rolando, a lista é da lista;
//   - a folha (Animated.View com `estiloArraste` e onLayout={medirFolha}) acompanha o dedo para
//     baixo (nunca sobe além da posição de repouso);
//   - ao soltar: passou de 25% da altura da folha (LIMIAR_FRACAO; sem medida, LIMIAR_DISTANCIA
//     px), ou um puxão rápido (vy > LIMIAR_VELOCIDADE), chama `onFechar` — o Modal fecha com a
//     animação de sempre a partir de onde a folha estava; senão, volta com mola para o lugar.
//   - `onFechar` null/undefined = gesto desligado (folha travada enquanto envia, por exemplo):
//     nada acompanha o dedo.
//   - `visivel` zera a posição a cada abertura (a folha anterior pode ter fechado arrastada).
// O gesto só é tomado DEPOIS de alguns px de movimento vertical para baixo, então botões no
// cabeçalho (o "✕ Fechar") e as linhas da lista seguem recebendo o toque.
// Sem mudança visual: alça, títulos e margens ficam onde estão; só o container vira Animated.

export const LIMIAR_FRACAO = 0.25       // fração da altura da folha que fecha ao soltar
export const LIMIAR_DISTANCIA = 80      // px, enquanto a folha ainda não foi medida
export const LIMIAR_VELOCIDADE = 0.5    // px/ms (puxão rápido fecha mesmo com pouca distância)
const MINIMO_PARA_TOMAR = 4             // px para baixo antes de o gesto virar arraste (alça)
const MINIMO_PARA_TOMAR_LISTA = 8       // na lista, um pouco mais: toque e rolagem vêm antes

export default function useArrastarParaFechar(onFechar, visivel = true) {
  const translateY = useRef(new Animated.Value(0)).current
  const onFecharRef = useRef(onFechar)
  onFecharRef.current = onFechar
  const alturaRef = useRef(0)
  const noTopoRef = useRef(true)

  // Antes de pintar: a folha reaberta nasce no lugar, sem o deslocamento do arraste anterior.
  useLayoutEffect(() => { if (visivel) { translateY.setValue(0); noTopoRef.current = true } }, [visivel, translateY])

  const { pan, panLista } = useMemo(() => {
    const voltar = () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 20 }).start()
    const comuns = {
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        const limiar = alturaRef.current > 0 ? alturaRef.current * LIMIAR_FRACAO : LIMIAR_DISTANCIA
        if (g.dy > limiar || g.vy > LIMIAR_VELOCIDADE) {
          const fechar = onFecharRef.current
          if (fechar) { fechar(); return }
        }
        voltar()
      },
      onPanResponderTerminate: voltar,
    }
    const vertical = (g, minimo) => !!onFecharRef.current && g.dy > minimo && Math.abs(g.dy) > Math.abs(g.dx)
    return {
      pan: PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => vertical(g, MINIMO_PARA_TOMAR),
        ...comuns,
      }),
      // Captura: decide ANTES do ScrollView, mas só no topo e só para baixo.
      panLista: PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_, g) => noTopoRef.current && vertical(g, MINIMO_PARA_TOMAR_LISTA),
        ...comuns,
      }),
    }
  }, [translateY])

  const medirFolha = (e) => { alturaRef.current = e?.nativeEvent?.layout?.height || 0 }
  const aoRolarLista = (e) => { noTopoRef.current = (e?.nativeEvent?.contentOffset?.y ?? 0) <= 0 }

  return {
    panHandlers: pan.panHandlers,
    estiloArraste: { transform: [{ translateY }] },
    medirFolha,
    panHandlersLista: panLista.panHandlers,
    aoRolarLista,
  }
}
