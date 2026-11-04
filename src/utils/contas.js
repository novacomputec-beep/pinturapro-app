// Múltiplas contas da mesma pessoa (Arte-Meus-Perfis). O que NÃO é tela mora aqui: os 4
// tipos de cadastro, o tipo da conta atual e a lista pronta para a tela "Meus perfis".
//
// Contrato com a API (pinturapro-api e53ffae):
//   GET  /auth/perfil         → { usuario, assinatura, contas: [{ id, tipo, nome }] } — o
//                               AuthContext guarda `contas` dentro de usuario.contas.
//   POST /auth/trocar-conta   → body { tipo }; devolve o payload do login (token, usuario,
//                               assinatura, contas) da conta daquele tipo, sem pedir senha.
//   POST /auth/contas/:tipo   → body { especialidades } (só profissional); cria a conta irmã
//                               copiando nome, CPF, telefone, e-mail, senha e cidade, e devolve
//                               o payload do login da conta nova (201). 409 tipo_duplicado /
//                               limite_contas / cpf_duplicado / email_duplicado; 403
//                               multiplas_contas_desligada quando a chave está desligada.
// O TIPO é derivado de role/tipo_dono/tipo_prestador — a MESMA regra de tipoDaLinha em
// utils/tipoConta.js da API: pintor e construtor são o mesmo tipo ('pintor').

// Ordem e rótulos da arte. `lado` é o das listas de especialidade (utils/categorias):
// 'reparo' → CATEGORIAS_SERVICO, 'pintura' → CATEGORIAS_CONSTRUCAO; donos não escolhem.
export const TIPOS_PERFIL = [
  { tipo: 'reparador',   icone: '🔧', rotulo: 'Prestadora/Prestador de serviços', descricao: 'Serviços gerais e domésticos', profissional: true,  lado: 'reparo' },
  { tipo: 'dono_reparo', icone: '🛠️', rotulo: 'Preciso de um serviço',            descricao: 'Contratar um serviço doméstico', profissional: false, lado: null },
  { tipo: 'dono_obra',   icone: '🏠', rotulo: 'Preciso de uma obra',              descricao: 'Contratar obra, reforma ou pintura', profissional: false, lado: null },
  { tipo: 'pintor',      icone: '🖌️', rotulo: 'Construtor/pintor',                descricao: 'Obras, construção e pintura', profissional: true,  lado: 'pintura' },
]

export const perfilDoTipo = (tipo) => TIPOS_PERFIL.find((t) => t.tipo === tipo) || null

// Tipo canônico da conta logada (espelho de tipoDaLinha). 'assinante' (legado) conta como
// pintor, o produto original; qualquer outra coisa volta null.
export const tipoDaConta = (usuario) => {
  if (!usuario) return null
  if (usuario.role === 'prestador' || usuario.role === 'assinante') return usuario.tipo_prestador === 'reparador' ? 'reparador' : 'pintor'
  if (usuario.role === 'dono_obra') return usuario.tipo_dono === 'reparo' ? 'dono_reparo' : 'dono_obra'
  return null
}

// Tipos presentes em `contas` (item como objeto { tipo } ou string, como no EntrarComo).
export const tiposDasContas = (contas) =>
  (Array.isArray(contas) ? contas : []).map((c) => (typeof c === 'string' ? c : c?.tipo)).filter(Boolean)

// Lista da tela: os 4 tipos na ordem da arte, cada um com o estado
//   'em_uso'    — a conta logada;
//   'trocar'    — existe em `contas` (POST /auth/trocar-conta);
//   'adicionar' — não existe (POST /auth/contas/:tipo).
// A conta atual SEMPRE conta como existente, mesmo que `contas` ainda não tenha chegado
// (sessão em cache de antes deste campo): a tela nunca oferece "Adicionar" o próprio tipo.
export const listarPerfis = (usuario) => {
  const atual = tipoDaConta(usuario)
  const existentes = new Set([...tiposDasContas(usuario?.contas), ...(atual ? [atual] : [])])
  return TIPOS_PERFIL.map((t) => ({
    ...t,
    estado: t.tipo === atual ? 'em_uso' : existentes.has(t.tipo) ? 'trocar' : 'adicionar',
  }))
}

// Mensagens por `codigo` dos erros de criar/trocar (mesma convenção do cadastro). Não há
// formulário para corrigir, então cada uma diz o que a pessoa PODE fazer a seguir.
export const MSG_ERRO_CONTAS = {
  tipo_duplicado: 'Você já tem um perfil deste tipo com este e-mail. Toque em "Trocar" para usá-lo.',
  limite_contas: 'Este e-mail já atingiu o limite de perfis por pessoa.',
  cpf_duplicado: 'Seu CPF já está em outro cadastro. Entre pelo login com o e-mail daquela conta.',
  email_duplicado: 'Este e-mail já está em outro cadastro.',
  multiplas_contas_desligada: 'Criar outro perfil está indisponível no momento. Tente mais tarde.',
  conta_tipo_inexistente: 'Você ainda não tem um perfil deste tipo. Toque em "Adicionar".',
  tipo_invalido: 'Tipo de perfil inválido.',
}
export const msgErroContas = (codigo) =>
  (typeof codigo === 'string' && Object.prototype.hasOwnProperty.call(MSG_ERRO_CONTAS, codigo) ? MSG_ERRO_CONTAS[codigo] : null)
