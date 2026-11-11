// Lista de interessados/candidatos que o DONO vê no detalhe (DetalheReparo / DetalheObra),
// 11/11/2026. A API devolve TODAS as linhas de interesse_reparos / candidaturas da demanda; só
// três grupos têm lugar na tela:
//   - card selecionável: 'pendente' e 'contraproposta_dono' (ainda em decisão) e o aceito
//     ('aceito'/'aprovada' — o escolhido, ou o aceite legado);
//   - linha ✗ apagada: 'recusado'/'recusada' (o dono já decidiu; fica para reconhecer quem é);
//   - FORA da lista: 'cancelado'/'cancelada' (o profissional saiu, o dono cancelou ou o admin
//     agiu — a desistência dele, quando é dele, vive em "QUEM DESISTIU"), 'expirado'/'expirada'
//     e quem está em prestadores_bloqueados da demanda (lista negra do dono, qualquer status).
// Antes, um 'cancelado' que não estava em `desistencias` (ex.: bloqueado pelo dono) voltava
// como card completo, com proposta e botões — era escolhível de novo.
const STATUS_FORA = new Set(['cancelado', 'cancelada', 'expirado', 'expirada'])
const STATUS_RECUSADO = new Set(['recusado', 'recusada'])

export const estaBloqueado = (demanda, usuarioId) =>
  usuarioId != null && Array.isArray(demanda?.prestadores_bloqueados) &&
  demanda.prestadores_bloqueados.some((b) => b != null && String(b) === String(usuarioId))

export const ehRecusado = (item) => STATUS_RECUSADO.has(item?.status)

// Quem aparece na lista do dono (card ou linha ✗): tudo menos cancelado/expirado e bloqueados.
// Status desconhecido fica (como antes), para uma grafia nova da API não sumir com um
// interessado em silêncio; o render decide card × linha ✗ por ehRecusado.
export const interessadosVisiveis = (lista, demanda) =>
  (Array.isArray(lista) ? lista : []).filter((i) => i && !STATUS_FORA.has(i.status) && !estaBloqueado(demanda, i.usuario_id))
