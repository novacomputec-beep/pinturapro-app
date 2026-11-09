import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import api from '../services/api'

// Dois sinais que decidem se a aba Mensagens (chat de OBRA) aparece, um por lado do app:
//
//   tem_obras        — DONO (Fase 1): a PESSOA tem alguma obra (mesmo CPF, qualquer conta
//                      contratante, obra em qualquer status). Quem nunca abriu obra não vê a aba.
//   tem_candidaturas — PROFISSIONAL (Fase 2): a PESSOA (qualquer conta profissional do mesmo
//                      CPF, Fase 2b da API) já se candidatou a alguma obra. Quem só
//                      faz serviço não vê a aba.
//
// Fonte dos dois: GET /auth/contas → { contas, tem_obras, pode_obras, tem_candidaturas }
// (pinturapro-api, Fases 1 e 2a). tem_candidaturas também vem em `usuario` no login e no
// perfil, e o hook do profissional parte desse valor.
//
// Moram fora do AuthContext de propósito: são dados de navegação, não de sessão, e gravá-los
// em `usuario` trocaria a identidade do usuário a cada consulta (re-disparando tudo que
// depende dela). Aqui cada um é um valor de módulo com ouvintes, por usuário, com cópia em
// disco para a aba não piscar na abertura seguinte. Para cada sinal:
//   - use…(usuarioId[, inicial]): o hook das abas — lê a cópia, consulta o servidor e acompanha.
//   - marcar…(usuarioId): otimista, para quem ACABOU de saber que é verdade (publicou uma
//     obra, a lista trouxe uma obra/candidatura). Nunca marca "não tem": só o servidor diz isso.
//   - …Atual(): leitura síncrona para quem não é componente (roteador de notificações).

const criarSinal = (campo) => {
  let valor = false
  let donoDoValor = null
  const ouvintes = new Set()

  const chave = (usuarioId) => `${campo}:${usuarioId}`

  const publicar = (v) => {
    if (v === valor) return
    valor = v
    ouvintes.forEach((fn) => fn(v))
  }

  const persistir = (usuarioId, v) => {
    AsyncStorage.setItem(chave(usuarioId), v ? '1' : '0')
      .catch((err) => console.log(`[${campo}] falha ao gravar a cópia local | msg:`, err?.message))
  }

  const atual = () => valor

  const marcar = (usuarioId) => {
    if (usuarioId == null || donoDoValor !== usuarioId) return
    publicar(true)
    persistir(usuarioId, true)
  }

  // Falhando, fica o que já se sabia: uma falha de rede não é notícia de que o dado mudou.
  const atualizar = async (usuarioId) => {
    if (usuarioId == null) return
    try {
      const resp = await api.get('/auth/contas')
      // Corpo vazio (304) chega como string: sem objeto não há o que ler.
      if (!resp || typeof resp !== 'object') return
      // API de antes do campo: ausente não é "false" — fica o que já se sabia.
      if (typeof resp[campo] !== 'boolean') return
      // A resposta pode chegar depois de a sessão ter trocado de usuário: aí não vale mais.
      if (donoDoValor !== usuarioId) return
      publicar(resp[campo])
      persistir(usuarioId, resp[campo])
    } catch (err) {
      console.log(`[${campo}] falha ao consultar /auth/contas | status:`, err?.status, '| code:', err?.code)
    }
  }

  // `inicial`: valor já conhecido da sessão (usuario.tem_candidaturas), para a aba nascer certa
  // sem esperar disco nem rede. Só sobe o valor — quem baixa é o servidor.
  const useSinal = (usuarioId, inicial = false) => {
    const [tem, setTem] = useState(donoDoValor === usuarioId ? valor || inicial === true : inicial === true)
    useEffect(() => {
      // Outro usuário entrou: o valor do anterior não pode vazar para as abas deste.
      if (donoDoValor !== usuarioId) { donoDoValor = usuarioId; valor = false }
      if (inicial === true) valor = true
      setTem(valor)
      ouvintes.add(setTem)
      if (usuarioId != null) {
        AsyncStorage.getItem(chave(usuarioId))
          .then((c) => { if (c === '1' && donoDoValor === usuarioId) publicar(true) })
          .catch((err) => console.log(`[${campo}] falha ao ler a cópia local | msg:`, err?.message))
          .then(() => atualizar(usuarioId))
      }
      return () => { ouvintes.delete(setTem) }
    }, [usuarioId, inicial])
    return tem
  }

  return { atual, marcar, atualizar, useSinal }
}

const obras = criarSinal('tem_obras')
export const temObrasAtual = obras.atual
export const marcarTemObras = obras.marcar
export const atualizarTemObras = obras.atualizar
export const useTemObras = obras.useSinal

const candidaturas = criarSinal('tem_candidaturas')
export const temCandidaturasAtual = candidaturas.atual
export const marcarTemCandidaturas = candidaturas.marcar
export const atualizarTemCandidaturas = candidaturas.atualizar
export const useTemCandidaturas = candidaturas.useSinal
