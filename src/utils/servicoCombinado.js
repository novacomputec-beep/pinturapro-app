import api, { candidaturasService } from '../services/api'
import { comRetry } from './rede'
import { leInteresses, leCandidaturas, matchDaPessoa } from './profissional'

// Serviço COMBINADO da pessoa (Arte-Excluir-Conta, 11/11/2026): a demanda aberta em que uma das
// contas profissionais dela é o profissional escolhido. Antes do passo EXCLUIR o Perfil avisa
// "Você tem um serviço combinado" e oferece ir até ele.
//
// Lê as MESMAS listas de "Meus trabalhos" (GET /reparos/meus-interesses e GET /candidaturas/
// minhas — por PESSOA, Fase 2b) e aplica a MESMA regra do "souDoMatch" dos cards (CardInteresse
// / CardCandidatura): proposta aceita + demanda viva (não encerrada, não expirada) + match da
// pessoa (match_da_pessoa da API; sem o campo, conta_id × match_usuario_id). Devolve a mais
// recente (as listas vêm do mais novo para o mais antigo), ou null.
//
// Nunca lança: falha de rede devolve null e a exclusão segue o fluxo de sempre — este aviso é
// uma cortesia, não uma trava.

const ACEITA = new Set(['aceito', 'aprovada'])

const vivo = (statusDemanda, expirada) => statusDemanda !== 'encerrada' && statusDemanda !== 'cancelada' && statusDemanda !== 'expirada' && !expirada

const reparoCombinado = (item, usuario) =>
  ACEITA.has(item?.status) && vivo(item?.reparo_status, !!(item?.reparo_expirada ?? item?.expirada)) && matchDaPessoa(item, usuario)

const obraCombinada = (item, usuario) =>
  ACEITA.has(item?.status) && vivo(item?.obra_status, !!(item?.obra_expirada ?? item?.expirada)) && matchDaPessoa(item, usuario)

// Nome curto do cliente: as listas não o trazem; o detalhe da demanda devolve dono_nome ao
// profissional do match (GET /reparos/:id, GET /obras/:id). Falha → null (o texto cai em
// "o cliente").
const nomeDoCliente = async (ehObra, id) => {
  try {
    const resp = await api.get(ehObra ? `/obras/${id}` : `/reparos/${id}`)
    const nome = String(resp?.dono_nome || resp?.reparo?.dono_nome || resp?.obra?.dono_nome || '').trim()
    return nome || null
  } catch (err) {
    console.log('[servicoCombinado] nome do cliente indisponível | code:', err?.code)
    return null
  }
}

// → { ehObra, id, titulo, nomeCliente } | null
export const buscarServicoCombinado = async (usuario) => {
  try {
    const [rs, cs] = await Promise.all([
      leInteresses(usuario) ? comRetry(() => api.get('/reparos/meus-interesses')).catch(() => null) : null,
      leCandidaturas(usuario) ? candidaturasService.minhas().catch(() => null) : null,
    ])
    const reparos = [...(rs?.ativos || []), ...(rs?.historico || [])].filter((i) => reparoCombinado(i, usuario))
    const obras = (Array.isArray(cs?.candidaturas) ? cs.candidaturas : []).filter((c) => obraCombinada(c, usuario))
    const quando = (x) => { const t = new Date(x?.match_feito_em || x?.criado_em).getTime(); return Number.isFinite(t) ? t : 0 }
    const candidatos = [
      ...reparos.map((i) => ({ ehObra: false, id: i.reparo_id, titulo: i.titulo, t: quando(i) })),
      ...obras.map((c) => ({ ehObra: true, id: c.obra_id, titulo: c.obra_titulo || c.titulo, t: quando(c) })),
    ].filter((x) => x.id != null).sort((a, b) => b.t - a.t)
    const alvo = candidatos[0]
    if (!alvo) return null
    return { ehObra: alvo.ehObra, id: alvo.id, titulo: alvo.titulo || null, nomeCliente: await nomeDoCliente(alvo.ehObra, alvo.id) }
  } catch (err) {
    console.log('[servicoCombinado] listas indisponíveis, exclusão segue sem o aviso | code:', err?.code)
    return null
  }
}
