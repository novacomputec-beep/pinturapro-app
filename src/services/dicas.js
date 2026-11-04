import AsyncStorage from '@react-native-async-storage/async-storage'
import api from './api'
import { comRetry } from '../utils/rede'

// "💡 Dicas do ProTudo" (Arte-Dicas): regras e atalhos da plataforma, por lado da conta,
// agrupados por tema. Contrato (pinturapro-api 1f355db, utils/dicas.js):
//   GET /dicas → { lado: 'cliente'|'profissional', total, temas: [{ tema, icone, ordem,
//                  dicas: [{ id, ordem, texto, acao, novo_ate, nova }] }] }
//   texto aceita **negrito**; acao ∈ ativar_avisos | meus_pedidos | editar_perfil |
//   especialidades | meus_perfis (atalho abaixo da dica); nova = novo_ate ainda não passou.
// O lado vem da conta logada (o servidor decide), então a mesma chamada serve a todos.
//
// Quais dicas a pessoa JÁ VIU fica no aparelho (AsyncStorage, por usuário): a API não guarda
// isso, e é dessa lista que sai o badge "N novas" do Perfil. Uma dica conta como vista quando
// o TEMA dela é aberto (DicasTemaScreen). Nenhuma dica vira popup em outra tela — só aqui.
//
// Uma requisição por processo (promise guardada, como gruposCategorias): o Perfil lê o
// contador a cada foco sem bater na API toda vez; a tela de Dicas força a releitura.

let promessaDicas = null

const normalizar = (resp) => {
  const temas = Array.isArray(resp?.temas) ? resp.temas : []
  return {
    lado: resp?.lado || null,
    temas: temas
      .map((t) => ({
        tema: String(t?.tema ?? '').trim(),
        icone: String(t?.icone ?? '').trim() || '💡',
        ordem: Number(t?.ordem) || 0,
        dicas: (Array.isArray(t?.dicas) ? t.dicas : [])
          .filter((d) => d && d.id != null && String(d.texto ?? '').trim())
          .map((d) => ({ id: String(d.id), ordem: Number(d.ordem) || 0, texto: String(d.texto).trim(), acao: d.acao || null, nova: d.nova === true })),
      }))
      .filter((t) => t.tema && t.dicas.length > 0),
  }
}

// { forcar: true } relê mesmo com resposta em cache (tela de Dicas e puxar-para-atualizar).
// Falha NÃO fica em cache: a próxima chamada tenta de novo; quem chama trata o erro.
export const buscarDicas = ({ forcar = false } = {}) => {
  if (!promessaDicas || forcar) {
    promessaDicas = comRetry(() => api.get('/dicas'))
      .then(normalizar)
      .catch((err) => {
        promessaDicas = null
        throw err
      })
  }
  return promessaDicas
}

export const limparCacheDicas = () => { promessaDicas = null }

// ── Dicas vistas, por aparelho e por usuário ────────────────────────────────────────────
const CHAVE_VISTAS = 'dicas_vistas'
const chaveVistas = (usuarioId) => `${CHAVE_VISTAS}:${String(usuarioId ?? '').trim()}`

export const lerDicasVistas = async (usuarioId) => {
  if (usuarioId == null) return new Set()
  try {
    const bruto = await AsyncStorage.getItem(chaveVistas(usuarioId))
    const lista = bruto ? JSON.parse(bruto) : []
    return new Set(Array.isArray(lista) ? lista.map(String) : [])
  } catch (err) {
    console.log('[dicas] falha ao ler as dicas vistas | msg:', err?.message)
    return new Set()
  }
}

// Acrescenta `ids` ao que já foi visto (nunca remove). Best-effort: falhar só mantém o badge.
export const marcarDicasVistas = async (usuarioId, ids) => {
  if (usuarioId == null || !Array.isArray(ids) || ids.length === 0) return
  try {
    const atual = await lerDicasVistas(usuarioId)
    for (const id of ids) atual.add(String(id))
    await AsyncStorage.setItem(chaveVistas(usuarioId), JSON.stringify([...atual]))
  } catch (err) {
    console.log('[dicas] falha ao gravar as dicas vistas | msg:', err?.message)
  }
}

export const idsDoTema = (tema) => (tema?.dicas || []).map((d) => String(d.id))

// Quantas dicas do tema (ou de todos) ainda não foram vistas.
export const contarNovas = (temas, vistas) =>
  (Array.isArray(temas) ? temas : []).reduce((n, t) => n + idsDoTema(t).filter((id) => !vistas?.has(id)).length, 0)

export const rotuloNovas = (n) => (n === 1 ? '1 nova' : `${n} novas`)
