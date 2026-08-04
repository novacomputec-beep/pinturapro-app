// Thumbnail da capa de uma demanda (obra/reparo), compartilhado pelos dois feeds.
// Módulo puro de propósito: sem dependências, para que o feed não arraste a pilha
// de upload (ImagePicker/expo-av/SecureStore) de utils/midia.js só por causa disto.
// Vive fora das telas porque a cópia verbatim entre FeedObras e FeedReparos é
// exatamente a divergência que já mordeu este projeto antes.

// Frame estático extraído do vídeo, no lugar do placeholder genérico.
//   so_0   — primeiro frame. A ausência de so_ NÃO equivale a so_0: o padrão do
//            Cloudinary devolve outro frame (medido: 46.129 b vs 55.953 b no mesmo
//            asset), então o offset é explícito para o thumbnail ser determinístico.
//   c_fill — o alvo tem proporção fixa; o vídeo quase nunca tem a mesma.
// As dimensões são do CHAMADOR porque os dois alvos não têm nem tamanho nem
// proporção em comum: o thumb do feed é 64dp quadrado, o tile da tira de mídia do
// detalhe é 160x120dp. Pedir 192x192 para o tile do detalhe entregaria menos da
// metade da largura necessária e ainda cortaria o frame em quadrado para exibi-lo
// deitado. O padrão continua sendo o do feed, então nenhuma chamada existente muda.
const FRAME_FEED = { largura: 192, altura: 192 }

// Tile da tira "Fotos e vídeos" das telas de detalhe: 160x120dp (estilos.midiaItem)
// x3 para telas 3x. Vive aqui, e não nas telas, para que os dois detalhes peçam
// exatamente o mesmo recorte — a divergência entre cópias é o que este módulo existe
// para evitar.
export const FRAME_TILE_DETALHE = { largura: 480, altura: 360 }

// Vídeos sobem por /video/upload (utils/midia.js), logo TODA capa de vídeo carrega
// esse segmento — o que torna esta função independente de como a API escolhe a
// foto_capa. O resource_type continua "video" no path: trocar para /image/upload
// aponta para outro namespace e 404a.
//
// Devolve a URL de uma IMAGEM em qualquer caso:
//   foto  -> inalterada
//   vídeo -> frame extraído
//   nada  -> null (o chamador cai no emoji da categoria)
export const thumbnailDeCapa = (fotoCapa, { largura, altura } = FRAME_FEED) => {
  if (!fotoCapa) return null
  // Casa o segmento de path, não a palavra solta: uma FOTO chamada
  // "meu-video-final.jpg" não pode ser confundida com um vídeo.
  if (!fotoCapa.includes('/video/upload/')) return fotoCapa
  const transformacao = `so_0,w_${largura || FRAME_FEED.largura},h_${altura || FRAME_FEED.altura},c_fill,q_auto`
  return fotoCapa
    .replace('/video/upload/', `/video/upload/${transformacao}/`)
    .replace(/\.(mp4|mov|webm|m4v|avi|mkv|3gp)(\?.*)?$/i, '.jpg$2')
}
