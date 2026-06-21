// Flags efêmeras de sessão — vivem em memória e zeram a cada login, logout
// ou relançamento do app (processo JS reiniciado). Usadas para mostrar avisos
// "uma única vez por sessão de login" sem persistir nada no dispositivo.

let bannerInteressadosExibido = false
let bannerInteressadosHomeExibido = false

// Flag da aba "Minhas Obras / Meus Reparos" (lista)
export const bannerInteressadosJaExibido = () => bannerInteressadosExibido
export const marcarBannerInteressadosExibido = () => { bannerInteressadosExibido = true }

// Flag independente da aba inicial do dono (Nova Obra / Novo Reparo), para o
// banner aparecer uma única vez em CADA aba por sessão de login.
export const bannerInteressadosHomeJaExibido = () => bannerInteressadosHomeExibido
export const marcarBannerInteressadosHomeExibido = () => { bannerInteressadosHomeExibido = true }

// Chamado pelo AuthContext em login/logout para reiniciar a sessão lógica.
export const resetarFlagsSessao = () => {
  bannerInteressadosExibido = false
  bannerInteressadosHomeExibido = false
}
