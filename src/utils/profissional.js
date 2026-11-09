// O que o PROFISSIONAL logado pode fazer (Fase 2, lado de trabalho unificado). Um só lugar
// para as perguntas que as abas, o feed, as listas e os hosts fazem, porque a resposta deixou
// de ser "é pintor ou é reparador?" — é a CAPACIDADE, que a API calcula por PESSOA (as contas
// profissionais do mesmo CPF; pinturapro-api utils/capacidadeObras, Fases 2a e 2b) e devolve
// em `usuario` no login, no perfil, em GET /auth/contas e ao salvar as especialidades:
//
//   pode_servicos — conta de serviços, OU conta de obra que marcou alguma especialidade de
//                   serviço, OU a outra conta profissional da pessoa pode.
//   pode_obras    — conta de obra, OU conta de serviços que marcou alguma especialidade de
//                   obra, OU a outra conta profissional da pessoa pode.
//   tem_interesses / tem_candidaturas — a pessoa já propôs em algum serviço / alguma obra.
//                   Quem tirou a especialidade com proposta ou match em andamento continua
//                   precisando ver as propostas (e, na obra, o chat).
//
// Sessão em cache de ANTES de um campo existir (undefined) cai na regra antiga, pelo tipo da
// conta — nunca abre um feed para quem a API recusaria.

const ehContaDeObra = (u) =>
  (u?.role === 'prestador' && u?.tipo_prestador === 'pintor') || u?.role === 'assinante'
const ehContaDeServicos = (u) => u?.role === 'prestador' && u?.tipo_prestador !== 'pintor'

export const ehProfissional = (u) => u?.role === 'prestador' || u?.role === 'assinante'

// Só role 'prestador': as rotas de serviço (e /reparos/meus-interesses) recusam o legado
// 'assinante', com ou sem campo.
export const podeServicos = (u) =>
  u?.role === 'prestador' && (typeof u?.pode_servicos === 'boolean' ? u.pode_servicos : ehContaDeServicos(u))

export const podeObras = (u) =>
  typeof u?.pode_obras === 'boolean' ? (u.pode_obras || ehContaDeObra(u)) : ehContaDeObra(u)

// Quem LÊ as listas de propostas ("Meus trabalhos", retomada, celebração, barra, indicação):
// quem pode aquele lado agora, ou quem já propôs nele antes.
export const leInteresses = (u) => podeServicos(u) || (u?.role === 'prestador' && u?.tem_interesses === true)
export const leCandidaturas = (u) => podeObras(u) || u?.tem_candidaturas === true

// Linhas de GET /reparos/meus-interesses e GET /candidaturas/minhas. As duas listas são da
// PESSOA: trazem as propostas de qualquer conta profissional dela, então o id da conta logada
// não diz mais de quem é a linha nem de quem é o match. A API manda os dois prontos:
//   conta_id        — a conta profissional (da pessoa) que fez ESTA proposta;
//   match_da_pessoa — o match da demanda é de uma conta dela.
// Sem os campos (API de antes da Fase 2b) vale a comparação de sempre, com a conta logada.
export const contaDaProposta = (item, usuario) => item?.conta_id ?? usuario?.id ?? null

export const matchDaPessoa = (item, usuario) => {
  if (typeof item?.match_da_pessoa === 'boolean') return item.match_da_pessoa
  const conta = contaDaProposta(item, usuario)
  return item?.match_usuario_id != null && conta != null && String(item.match_usuario_id) === String(conta)
}
