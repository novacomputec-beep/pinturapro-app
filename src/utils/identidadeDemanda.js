// QUEM é o leitor no DETALHE de uma demanda (DetalheObra / DetalheReparo), por PESSOA.
//
// GET /obras/:id e GET /reparos/:id devolvem, ao lado da linha (pinturapro-api
// routes/index.js, identidadeNaDemanda):
//   conta_id      — a conta da pessoa que tem a proposta ou o match NESTA demanda. É como ela
//                   que a API monta o resto do detalhe e grava as ações (chegada, agenda,
//                   encerramento): para o profissional com duas contas (serviços e obra, mesmo
//                   CPF) pode ser a OUTRA conta, não a logada. Sem vínculo, dono e admin: a
//                   conta logada.
//   sou_escolhido — o match é de QUALQUER conta profissional da pessoa.
//   sou_dono      — criado_por é QUALQUER conta contratante da pessoa.
// As telas mesclam os três na linha (CAMPOS_IDENTIDADE) e perguntam aqui, em vez de comparar
// match_usuario_id / criado_por / *_por com o id da conta logada — que erra o lado sempre que
// a conta que age não é a que está logada.
//
// SEM os campos (API de antes deles, ou a linha que veio da lista/deep-link antes do primeiro
// GET) vale a comparação de sempre com a conta logada. Ids chegam número ou string conforme o
// endpoint: compara em String, com os != null ANTES — String(undefined) === String(undefined)
// casaria dois ids ausentes.

export const CAMPOS_IDENTIDADE = ['conta_id', 'sou_escolhido', 'sou_dono']

const mesmoId = (a, b) => a != null && b != null && String(a) === String(b)

// A linha com a identidade que veio AO LADO dela na resposta do detalhe — para as reconsultas
// que leem a resposta crua (a tela faz o mesmo no estado, em mesclarTopo).
export const comIdentidade = (resposta, linha) => {
  if (!linha || typeof linha !== 'object' || !resposta || typeof resposta !== 'object') return linha
  const extra = {}
  for (const k of CAMPOS_IDENTIDADE) if (k in resposta) extra[k] = resposta[k]
  return { ...linha, ...extra }
}

// A conta que AGE nesta demanda: é com ela que se compara quem declarou a chegada, quem
// propôs o horário e quem pediu o encerramento, e é ela que os blocos pós-match recebem.
export const contaNaDemanda = (demanda, usuario) => demanda?.conta_id ?? usuario?.id ?? null

export const ehDaMinhaConta = (id, demanda, usuario) => mesmoId(id, contaNaDemanda(demanda, usuario))

export const souDonoDaDemanda = (demanda, usuario) =>
  typeof demanda?.sou_dono === 'boolean' ? demanda.sou_dono : mesmoId(demanda?.criado_por, usuario?.id)

export const souEscolhidoNaDemanda = (demanda, usuario) =>
  typeof demanda?.sou_escolhido === 'boolean' ? demanda.sou_escolhido : mesmoId(demanda?.match_usuario_id, usuario?.id)
