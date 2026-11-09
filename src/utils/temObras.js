import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import api from '../services/api'

// "A PESSOA tem alguma obra?" (Fase 1, lado contratante unificado). É o que decide se a aba
// Mensagens (chat de obra) aparece nas abas do dono: quem nunca abriu obra não a vê.
//
// Fonte: GET /auth/contas → { contas, tem_obras } (pinturapro-api 72f30a6). `tem_obras` é por
// pessoa (mesmo CPF, qualquer conta contratante) e conta obra em qualquer status.
//
// Mora fora do AuthContext de propósito: é um dado de navegação, não de sessão, e gravá-lo em
// `usuario` trocaria a identidade do usuário a cada consulta (re-disparando tudo que depende
// dela) e o perderia a cada GET /auth/perfil. Aqui é um valor de módulo com ouvintes, por
// usuário, com cópia em disco para a aba não piscar na abertura seguinte.
//   - useTemObras(usuarioId): o hook das abas — lê a cópia, consulta o servidor e acompanha.
//   - marcarTemObras(usuarioId): otimista, para quem ACABOU de saber que há obra (publicou
//     uma, ou a lista de pedidos trouxe alguma). Nunca marca "não tem": só o servidor diz isso.
//   - temObrasAtual(): leitura síncrona para quem não é componente (roteador de notificações).

let valor = false
let donoDoValor = null
const ouvintes = new Set()

const chave = (usuarioId) => `tem_obras:${usuarioId}`

const publicar = (v) => {
  if (v === valor) return
  valor = v
  ouvintes.forEach((fn) => fn(v))
}

const persistir = (usuarioId, v) => {
  AsyncStorage.setItem(chave(usuarioId), v ? '1' : '0')
    .catch((err) => console.log('[temObras] falha ao gravar a cópia local | msg:', err?.message))
}

export const temObrasAtual = () => valor

export const marcarTemObras = (usuarioId) => {
  if (usuarioId == null || donoDoValor !== usuarioId) return
  publicar(true)
  persistir(usuarioId, true)
}

// Falhando, fica o que já se sabia: uma falha de rede não é notícia de que as obras sumiram.
export const atualizarTemObras = async (usuarioId) => {
  if (usuarioId == null) return
  try {
    const resp = await api.get('/auth/contas')
    // Corpo vazio (304) chega como string: sem objeto não há o que ler.
    if (!resp || typeof resp !== 'object') return
    // A resposta pode chegar depois de a sessão ter trocado de usuário: aí não vale mais.
    if (donoDoValor !== usuarioId) return
    const tem = resp.tem_obras === true
    publicar(tem)
    persistir(usuarioId, tem)
  } catch (err) {
    console.log('[temObras] falha ao consultar /auth/contas | status:', err?.status, '| code:', err?.code)
  }
}

export const useTemObras = (usuarioId) => {
  const [tem, setTem] = useState(donoDoValor === usuarioId ? valor : false)
  useEffect(() => {
    // Outro usuário entrou: o valor do anterior não pode vazar para as abas deste.
    if (donoDoValor !== usuarioId) { donoDoValor = usuarioId; valor = false }
    setTem(valor)
    ouvintes.add(setTem)
    if (usuarioId != null) {
      AsyncStorage.getItem(chave(usuarioId))
        .then((c) => { if (c === '1' && donoDoValor === usuarioId) publicar(true) })
        .catch((err) => console.log('[temObras] falha ao ler a cópia local | msg:', err?.message))
        .then(() => atualizarTemObras(usuarioId))
    }
    return () => { ouvintes.delete(setTem) }
  }, [usuarioId])
  return tem
}
