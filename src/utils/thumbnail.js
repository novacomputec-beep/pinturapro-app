// Thumbnail da capa de uma demanda (obra/reparo), compartilhado pelos dois feeds.
// Módulo puro de propósito: sem dependências, para que o feed não arraste a pilha
// de upload (ImagePicker/expo-av/SecureStore) de utils/midia.js só por causa disto.
// Vive fora das telas porque a cópia verbatim entre FeedObras e FeedReparos é
// exatamente a divergência que já mordeu este projeto antes.

// Frame estático extraído do vídeo, no lugar do placeholder genérico.
//   so_0  — primeiro frame. A ausência de so_ NÃO equivale a so_0: o padrão do
//           Cloudinary devolve outro frame (medido: 46.129 b vs 55.953 b no mesmo
//           asset), então o offset é explícito para o thumbnail ser determinístico.
//   192px — 64dp do thumb em telas 3x.
//   c_fill — o thumb é quadrado; o vídeo quase nunca é.
const TRANSFORMACAO_FRAME = 'so_0,w_192,h_192,c_fill,q_auto'

// Vídeos sobem por /video/upload (utils/midia.js), logo TODA capa de vídeo carrega
// esse segmento — o que torna esta função independente de como a API escolhe a
// foto_capa. O resource_type continua "video" no path: trocar para /image/upload
// aponta para outro namespace e 404a.
//
// Devolve a URL de uma IMAGEM em qualquer caso:
//   foto  -> inalterada
//   vídeo -> frame extraído
//   nada  -> null (o chamador cai no emoji da categoria)
export const thumbnailDeCapa = (fotoCapa) => {
  if (!fotoCapa) return null
  // Casa o segmento de path, não a palavra solta: uma FOTO chamada
  // "meu-video-final.jpg" não pode ser confundida com um vídeo.
  if (!fotoCapa.includes('/video/upload/')) return fotoCapa
  return fotoCapa
    .replace('/video/upload/', `/video/upload/${TRANSFORMACAO_FRAME}/`)
    .replace(/\.(mp4|mov|webm|m4v|avi|mkv|3gp)(\?.*)?$/i, '.jpg$2')
}
