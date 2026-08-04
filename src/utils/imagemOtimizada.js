// Injeta transformações do Cloudinary numa URL de IMAGEM já armazenada.
// Módulo puro (sem dependências), no mesmo espírito de utils/thumbnail.js: o
// ponto de injeção é o segmento /image/upload/ que todo secure_url carrega
// (utils/midia.js sobe para .../<image|video>/upload e guarda a URL devolvida).
//
//   f_auto  — o Cloudinary escolhe o formato (WebP/AVIF) pelo Accept do cliente.
//   q_auto  — qualidade por conteúdo, em vez de um número fixo.
//   c_limit — só REDUZ; nunca amplia um original menor que a largura pedida.
//
// `otimizar` não mexe em vídeo: /video/upload/ não casa com /image/upload/, o frame
// de capa é tratado por thumbnailDeCapa e o vídeo em si por videoOtimizado (no fim
// deste arquivo). Também não mexe em URL que não seja do Cloudinary (o servidor pode
// devolver CDN/proxy) nem em URL já transformada — aplicar duas vezes empilharia
// f_auto,q_auto e mudaria o hash do cache.
const TRANSFORMACAO = 'f_auto,q_auto'

export const otimizar = (url, largura) => {
  // Cobre null/undefined e qualquer coisa que não seja string, sem lançar.
  if (typeof url !== 'string') return url
  if (!url.includes('res.cloudinary.com')) return url
  if (!url.includes('/image/upload/')) return url   // vídeo ou path inesperado
  if (url.includes('f_auto')) return url            // idempotente
  const escala = largura ? `,c_limit,w_${largura}` : ''
  return url.replace('/image/upload/', `/image/upload/${TRANSFORMACAO}${escala}/`)
}

// Larguras por uso. Avatares são exibidos entre 34dp e ~96dp; 400px cobre 3x com
// folga. Mídia da demanda aparece em tira e em fullscreen; 1000px atende ambos.
// A visualização em tela cheia não limita largura — o original manda, já que é
// onde o usuário amplia para inspecionar o serviço.
export const avatar = (url) => otimizar(url, 400)
export const media  = (url) => otimizar(url, 1000)
export const full   = (url) => otimizar(url)

// ─── VÍDEO ───────────────────────────────────────────────────
// Mesmo mecanismo do otimizar acima, no segmento /video/upload/: é o player em tela
// cheia que consome isto, o único ponto do app que baixa o vídeo de verdade (o resto
// mostra um frame estático, via thumbnailDeCapa). Sem transformação, o que chega é o
// original que saiu do aparelho de quem publicou — resolução e bitrate de câmera.
//
//   q_auto  — qualidade por conteúdo, como nas imagens.
//   c_limit — só REDUZ; um vídeo já menor que 720 de largura passa intacto.
//   w_720   — teto de largura. Suficiente para o player, que ocupa metade da altura
//             da tela, e sem f_auto de propósito: trocar o contêiner mudaria a
//             extensão .mp4 que a URL carrega e que o expo-av recebe.
const TRANSFORMACAO_VIDEO = 'q_auto,c_limit,w_720'

export const videoOtimizado = (url) => {
  // Mesmas saídas do otimizar, na mesma ordem: não-string, não-Cloudinary, path
  // inesperado (uma FOTO, ou um proxy), e idempotência — reaplicar empilharia a
  // transformação e trocaria o hash do cache.
  if (typeof url !== 'string') return url
  if (!url.includes('res.cloudinary.com')) return url
  if (!url.includes('/video/upload/')) return url
  if (url.includes('q_auto')) return url
  return url.replace('/video/upload/', `/video/upload/${TRANSFORMACAO_VIDEO}/`)
}
