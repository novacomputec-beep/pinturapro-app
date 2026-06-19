// Flags efêmeras de sessão — vivem em memória e zeram a cada login, logout
// ou relançamento do app (processo JS reiniciado). Usadas para mostrar avisos
// "uma única vez por sessão de login" sem persistir nada no dispositivo.

let bannerInteressadosExibido = false

export const bannerInteressadosJaExibido = () => bannerInteressadosExibido
export const marcarBannerInteressadosExibido = () => { bannerInteressadosExibido = true }

// Chamado pelo AuthContext em login/logout para reiniciar a sessão lógica.
export const resetarFlagsSessao = () => {
  bannerInteressadosExibido = false
}
