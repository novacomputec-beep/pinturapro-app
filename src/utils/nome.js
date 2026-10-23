// "Nome" que na verdade é um e-mail: tem "@" ou tem a forma algo@dominio.tld. Existe
// porque o campo de nome do cadastro e do perfil só exigia "não vazio", e profissionais
// chegaram às telas do dono com o e-mail no lugar do nome.
export const pareceEmail = (texto) => {
  const t = String(texto || '').trim()
  return t.includes('@') || /^[^\s]+@[^\s]+\.[^\s]+$/i.test(t)
}

export const MSG_NOME_NAO_EMAIL = 'Digite seu nome, não o e-mail.'
