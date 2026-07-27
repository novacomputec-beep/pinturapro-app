// Injeta transformações do Cloudinary numa URL de IMAGEM já armazenada.
// Módulo puro (sem dependências), no mesmo espírito de utils/thumbnail.js: o
// ponto de injeção é o segmento /image/upload/ que todo secure_url carrega
// (utils/midia.js sobe para .../<image|video>/upload e guarda a URL devolvida).
//
//   f_auto  — o Cloudinary escolhe o formato (WebP/AVIF) pelo Accept do cliente.
//   q_auto  — qualidade por conteúdo, em vez de um número fixo.
//   c_limit — só REDUZ; nunca amplia um original menor que a largura pedida.
//
// Não mexe em vídeo: /video/upload/ não casa com /image/upload/, e o frame de
// capa já é tratado por thumbnailDeCapa. Também não mexe em URL que não seja do
// Cloudinary (o servidor pode devolver CDN/proxy) nem em URL já transformada —
// aplicar duas vezes empilharia f_auto,q_auto e mudaria o hash do cache.
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
