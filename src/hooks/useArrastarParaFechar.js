import { useRef, useMemo, useLayoutEffect } from 'react'
import { Animated, PanResponder } from 'react-native'

// Arrastar para baixo fecha a folha (bottom sheet). Um hook só para TODAS as folhas do app
// (FolhaGrupo, EditarCategoriasSheet, SheetDesfazerEscolha, SheetProfissionalDesistiu…) não
// divergirem no gesto:
//   - os `panHandlers` vão SÓ na alça e no cabeçalho da folha — nunca no ScrollView/FlatList
//     de dentro, que continua rolando como sempre;
//   - a folha (Animated.View com `estiloArraste`) acompanha o dedo para baixo (nunca sobe
//     além da posição de repouso);
//   - ao soltar: mais de LIMIAR_DISTANCIA px, ou um puxão rápido (vy > LIMIAR_VELOCIDADE),
//     chama `onFechar` — o Modal fecha com a animação de sempre a partir de onde a folha
//     estava; senão, volta com mola para o lugar.
//   - `onFechar` null/undefined = gesto desligado (folha travada enquanto envia, por exemplo):
//     nada acompanha o dedo.
//   - `visivel` zera a posição a cada abertura (a folha anterior pode ter fechado arrastada).
// O gesto só é tomado DEPOIS de alguns px de movimento vertical para baixo, então botões no
// cabeçalho (o "✕" da folha de detalhes) seguem recebendo o toque.
// Sem mudança visual: alça, títulos e margens ficam onde estão; só o container vira Animated.

export const LIMIAR_DISTANCIA = 80      // px arrastados que fecham ao soltar
export const LIMIAR_VELOCIDADE = 0.5    // px/ms (puxão rápido fecha mesmo com pouca distância)
const MINIMO_PARA_TOMAR = 4             // px para baixo antes de o gesto virar arraste

export default function useArrastarParaFechar(onFechar, visivel = true) {
  const translateY = useRef(new Animated.Value(0)).current
  const onFecharRef = useRef(onFechar)
  onFecharRef.current = onFechar

  // Antes de pintar: a folha reaberta nasce no lugar, sem o deslocamento do arraste anterior.
  useLayoutEffect(() => { if (visivel) translateY.setValue(0) }, [visivel, translateY])

  const pan = useMemo(() => {
    const voltar = () => Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4, speed: 20 }).start()
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => !!onFecharRef.current && g.dy > MINIMO_PARA_TOMAR && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > LIMIAR_DISTANCIA || g.vy > LIMIAR_VELOCIDADE) {
          const fechar = onFecharRef.current
          if (fechar) { fechar(); return }
        }
        voltar()
      },
      onPanResponderTerminate: voltar,
    })
  }, [translateY])

  return { panHandlers: pan.panHandlers, estiloArraste: { transform: [{ translateY }] } }
}
