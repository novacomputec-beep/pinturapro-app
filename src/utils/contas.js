import AsyncStorage from '@react-native-async-storage/async-storage'

// Múltiplas contas da mesma pessoa (Arte-Meus-Perfis). O que NÃO é tela mora aqui: os 4
// tipos de cadastro, o tipo da conta atual, a lista pronta para a tela "Meus perfis" e a
// memória do último perfil usado por aparelho.
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
// Lado contratante UNIFICADO (Fase 1, Arte-Fase1-Contratar): as duas contas contratantes
// (dono_reparo e dono_obra) do mesmo CPF veem e gerenciam os mesmos serviços e obras, então
// as telas mostram UM perfil "Contratar". Os dois tipos seguem existindo na API e aqui (é o
// tipo que vai no login/trocar/criar); só o rótulo é um.
// Lado de TRABALHO unificado (Fase 2, Arte-Fase2-Trabalhar): o mesmo desenho — as duas contas
// profissionais (reparador e pintor) seguem existindo na API, mas as telas mostram UM perfil
// "Trabalhar". A conta de serviços (reparador) também pode marcar especialidades de obra;
// `lado` continua dizendo qual lista de especialidades a API aceita em cada conta.
export const TIPOS_PERFIL = [
  { tipo: 'reparador',   icone: '🧰', rotulo: 'Quero trabalhar',                  descricao: 'Serviços e obras', profissional: true,  lado: 'reparo' },
  { tipo: 'dono_reparo', icone: '🤝', rotulo: 'Quero contratar',                  descricao: 'Serviços, obras e reformas', profissional: false, lado: null },
  { tipo: 'dono_obra',   icone: '🤝', rotulo: 'Quero contratar',                  descricao: 'Serviços, obras e reformas', profissional: false, lado: null },
  { tipo: 'pintor',      icone: '🧰', rotulo: 'Quero trabalhar',                  descricao: 'Serviços e obras', profissional: true,  lado: 'pintura' },
]

export const perfilDoTipo = (tipo) => TIPOS_PERFIL.find((t) => t.tipo === tipo) || null

// Os tipos contratantes, na ordem de preferência quando nenhum foi usado por último.
export const TIPOS_CONTRATAR = ['dono_reparo', 'dono_obra']
export const ehTipoContratar = (tipo) => TIPOS_CONTRATAR.includes(tipo)

// Qual conta contratante o card único "Contratar" usa, entre as que a pessoa TEM (`tipos`):
// a última contratante usada neste aparelho, senão dono_reparo, senão dono_obra. null sem
// nenhuma (aí o card cria uma — ver TIPO_CONTRATAR_NOVO).
export const contaContratar = (tipos, ultimoContratar) => {
  const tem = TIPOS_CONTRATAR.filter((t) => (tipos || []).includes(t))
  if (!tem.length) return null
  return ultimoContratar && tem.includes(ultimoContratar) ? ultimoContratar : tem[0]
}
// Tipo criado pelo "Adicionar" do card Contratar quando a pessoa não tem conta contratante.
export const TIPO_CONTRATAR_NOVO = 'dono_reparo'

// O mesmo trio para o card único "Trabalhar": os tipos profissionais na ordem de preferência
// (a conta de serviços primeiro — é a que alcança serviços E obras), a escolha entre os que a
// pessoa tem (última profissional usada, senão reparador, senão pintor) e o tipo que o
// "Adicionar" cria.
export const TIPOS_TRABALHAR = ['reparador', 'pintor']
export const ehTipoTrabalhar = (tipo) => TIPOS_TRABALHAR.includes(tipo)
export const contaTrabalhar = (tipos, ultimoTrabalhar) => {
  const tem = TIPOS_TRABALHAR.filter((t) => (tipos || []).includes(t))
  if (!tem.length) return null
  return ultimoTrabalhar && tem.includes(ultimoTrabalhar) ? ultimoTrabalhar : tem[0]
}
export const TIPO_TRABALHAR_NOVO = 'reparador'

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

// Lista da tela: os perfis na ordem da arte, cada um com o estado
//   'em_uso'    — a conta logada;
//   'trocar'    — existe em `contas` (POST /auth/trocar-conta);
//   'adicionar' — não existe (POST /auth/contas/:tipo).
// A conta atual SEMPRE conta como existente, mesmo que `contas` ainda não tenha chegado
// (sessão em cache de antes deste campo): a tela nunca oferece "Adicionar" o próprio tipo.
// São DOIS perfis, um por lado: "Contratar" (`contratar: true`) e "Trabalhar"
// (`trabalhar: true`). O `tipo` de cada um é a conta a usar daquele lado — a logada (em uso),
// a escolhida por contaContratar/contaTrabalhar (trocar) ou TIPO_*_NOVO (adicionar).
// `ultimoContratar` / `ultimoTrabalhar`: lerUltimoTipoContratar / lerUltimoTipoTrabalhar.
export const listarPerfis = (usuario, ultimoContratar = null, ultimoTrabalhar = null) => {
  const atual = tipoDaConta(usuario)
  const existentes = new Set([...tiposDasContas(usuario?.contas), ...(atual ? [atual] : [])])
  const lado = (ehDoLado, escolher, ultimo, novo, marca) => {
    const tipo = ehDoLado(atual) ? atual : escolher([...existentes], ultimo) || novo
    return {
      ...perfilDoTipo(tipo),
      [marca]: true,
      estado: ehDoLado(atual) ? 'em_uso' : existentes.has(tipo) ? 'trocar' : 'adicionar',
    }
  }
  return [
    lado(ehTipoContratar, contaContratar, ultimoContratar, TIPO_CONTRATAR_NOVO, 'contratar'),
    lado(ehTipoTrabalhar, contaTrabalhar, ultimoTrabalhar, TIPO_TRABALHAR_NOVO, 'trabalhar'),
  ]
}

// ── Último perfil usado, por aparelho e por e-mail ─────────────────────────────────────
// Gravado no login, ao trocar de perfil e ao "Criar e entrar" (AuthContext). No PRÓXIMO login
// do mesmo e-mail com 2+ contas, se o tipo salvo ainda existe entre as `contas` devolvidas, o
// AuthContext repete o login com ele e entra direto — o "Entrar como:" só aparece sem tipo
// salvo ou com o tipo que não existe mais. Sobrevive ao logout DE PROPÓSITO: o ponto é o
// próximo login ser direto. AsyncStorage, não SecureStore: tipo não é credencial. Best-effort
// nos dois sentidos — falhar só faz o "Entrar como:" voltar.
const CHAVE_ULTIMO_TIPO = 'ultimo_tipo_conta'
const chaveUltimoTipo = (email) => `${CHAVE_ULTIMO_TIPO}:${String(email || '').trim().toLowerCase()}`

export const lerUltimoTipo = async (email) => {
  if (!email) return null
  try {
    const v = await AsyncStorage.getItem(chaveUltimoTipo(email))
    return v && TIPOS_PERFIL.some((t) => t.tipo === v) ? v : null
  } catch (err) {
    console.log('[contas] falha ao ler o último perfil | msg:', err?.message)
    return null
  }
}

// Última conta CONTRATANTE usada (dono_reparo | dono_obra), em chave própria: o "último
// perfil" acima pode ser um profissional, e o card único "Contratar" precisa saber qual das
// duas contas contratantes a pessoa usou por último. Gravada junto, no mesmo gravarUltimoTipo.
const chaveUltimoContratar = (email) => `ultimo_tipo_contratar:${String(email || '').trim().toLowerCase()}`

export const lerUltimoTipoContratar = async (email) => {
  if (!email) return null
  try {
    const v = await AsyncStorage.getItem(chaveUltimoContratar(email))
    return ehTipoContratar(v) ? v : null
  } catch (err) {
    console.log('[contas] falha ao ler o último perfil contratante | msg:', err?.message)
    return null
  }
}

// Última conta PROFISSIONAL usada (reparador | pintor), pelo mesmo motivo, para o card único
// "Trabalhar".
const chaveUltimoTrabalhar = (email) => `ultimo_tipo_trabalhar:${String(email || '').trim().toLowerCase()}`

export const lerUltimoTipoTrabalhar = async (email) => {
  if (!email) return null
  try {
    const v = await AsyncStorage.getItem(chaveUltimoTrabalhar(email))
    return ehTipoTrabalhar(v) ? v : null
  } catch (err) {
    console.log('[contas] falha ao ler o último perfil profissional | msg:', err?.message)
    return null
  }
}

export const gravarUltimoTipo = async (email, tipo) => {
  if (!email || !tipo) return
  try {
    await AsyncStorage.setItem(chaveUltimoTipo(email), tipo)
    if (ehTipoContratar(tipo)) await AsyncStorage.setItem(chaveUltimoContratar(email), tipo)
    if (ehTipoTrabalhar(tipo)) await AsyncStorage.setItem(chaveUltimoTrabalhar(email), tipo)
  } catch (err) {
    console.log('[contas] falha ao gravar o último perfil | msg:', err?.message)
  }
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
