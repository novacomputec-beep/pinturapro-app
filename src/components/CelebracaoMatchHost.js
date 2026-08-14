import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import { cores, raios } from '../utils/tema'
import { navigationRef } from '../navigation/navigationRef'
import { carregarVistas, marcarVistas } from '../utils/celebracao'

// Título entre aspas da PRIMEIRA linha de um aviso agrupado, ou null quando ela não traz
// título — o ramo do pintor já convivia com isso, ver os guardas em :298 e :329. Só o
// primeiro de propósito: a contagem faz o resto do trabalho, e enfileirar todos os títulos
// estouraria o card (380px de largura, subtítulo de 14px).
// A concordância fica em quem chama, que é onde o substantivo está: "o serviço X" (m.) no
// ramo do reparador, "a obra X" (f.) no do pintor.
const nomeDe = (linhas) => (linhas[0]?.titulo ? `"${linhas[0].titulo}"` : null)

// Contrato finalizado do DONO ainda sem avaliação, para o lembrete que reaparece.
// `ja_avaliei` só existe no payload de contratos finalizados — a lista de demandas não o
// traz —, então não há como saber sem esta SEGUNDA requisição. Ela roda apenas quando a
// lista de demandas já provou que existe ao menos uma encerrada: quem nunca concluiu nada
// não paga requisição nenhuma.
//
// Devolve o MAIS RECENTE não avaliado, não o mais antigo: as rotas de contratos vêm
// ordenadas do mais novo para o mais antigo (com desempate por chave primária e LIMIT
// 200), e é o serviço recente que a pessoa ainda lembra — avaliação lembrada é avaliação
// útil. Um por vez, de propósito: o lembrete nomeia uma coisa só e nunca vira uma fila
// sobre o histórico inteiro.
//
// Falha aqui devolve null em vez de propagar: um lembrete que não pôde ser calculado não
// pode derrubar as celebrações de verdade que vêm antes dele.
const contratoNaoAvaliado = async (ehObra, naoVisto) => {
  try {
    const url = ehObra ? '/obras/meus-contratos-dono' : '/reparos/meus-contratos-dono'
    const resp = await api.get(url)
    const tipo = ehObra ? 'obra' : 'reparo'
    return (resp.contratos || []).find(c =>
      !c.ja_avaliei &&
      c.prestador_id != null &&
      naoVisto(`avaliacao_dispensada:${tipo}:${c.id}`)
    ) || null
  } catch (err) {
    console.log('[Celebracao] falha ao checar contratos não avaliados | code:', err?.code)
    return null
  }
}

// Detecta o match a comemorar para o usuário atual, conforme o papel. Retorna o
// primeiro evento ainda não visto (marca d'água local) ou null. Cada papel celebra
// o momento certo do funil: donos ao receber proposta; prestadores ao serem aceitos.
//
// Os eventos SEM marca d'água (chegada a confirmar, encerramento pendente) entram por
// último em cada papel, de propósito: repetem até serem resolvidos e, na frente dos
// demais, esconderiam todo o resto enquanto durassem. Atrás, os eventos de uma vez só
// disparam, ficam marcados e saem do caminho — na verificação seguinte eles aparecem.
// Entre os dois, a chegada vem antes por ser a etapa anterior do serviço. Os dois PODEM
// estar pendentes ao mesmo tempo: encerrar não depende da chegada confirmada (o detalhe
// só avisa, não trava), então dá para pedir o encerramento com a chegada ainda em
// aberto. Nesse caso o dono confirma a chegada primeiro e, na verificação seguinte, o
// encerramento aparece.
const detectar = async (usuario) => {
  const uid = usuario.id
  const vistas = await carregarVistas(uid)
  const naoVisto = (k) => !vistas.has(k)

  const ehDonoReparo = usuario.role === 'dono_obra' && usuario.tipo_dono === 'reparo'
  const ehDonoObra   = usuario.role === 'dono_obra' && usuario.tipo_dono !== 'reparo'
  const ehReparador  = usuario.role === 'prestador' && usuario.tipo_prestador !== 'pintor'
  const ehPintor     = (usuario.role === 'prestador' && usuario.tipo_prestador === 'pintor') || usuario.role === 'assinante'

  // Donos: a marca d'água é POR PROPOSTA (interesse/candidatura), não por reparo/obra.
  // Chavear por `reparo:${id}`/`obra:${id}` silenciava o item para sempre depois da 1ª
  // proposta — quem negociava e não fechava (o prestador recusa a contraproposta, p.ex.)
  // nunca mais era avisado das propostas seguintes daquele mesmo reparo/obra. A API
  // devolve o id da proposta pendente mais recente; enquanto ele mudar, o modal reaparece.

  // dono_reparo — um reparador demonstrou interesse
  if (ehDonoReparo) {
    const resp = await api.get('/reparos/minhas')
    const r = (resp.reparos || []).find(x =>
      x.interesse_pendente_recente_id != null && naoVisto(`interesse:${x.interesse_pendente_recente_id}`)
    )
    if (r) return {
      chave: `interesse:${r.interesse_pendente_recente_id}`, emoji: '🔔',
      titulo: 'Seu serviço recebeu uma proposta!',
      subtitulo: `"${r.titulo}" tem profissional(is) interessado(s). Veja e escolha o melhor!`,
      ctaTexto: 'Ver proposta',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: r }, initial: false }),
    }
    const matched = (resp.reparos || []).find(x =>
      x.match_feito_em && x.match_usuario_id && naoVisto(`reparo_match:${x.id}`)
    )
    if (matched) return {
      chave: `reparo_match:${matched.id}`, emoji: '🎉',
      titulo: 'Seu serviço vai ser realizado!',
      // A regra do encerramento vem junto: era uma tarja âmbar permanente ao lado do botão
      // nas duas telas de detalhe. Dita UMA vez, no momento em que o combinado nasce e às
      // duas partes, informa o mesmo sem ocupar a tela pelo resto do serviço.
      subtitulo: `Ótima notícia! Um profissional verificado fechou negócio para "${matched.titulo}". Combine os detalhes agora! Encerrem apenas depois que os dois confirmarem a chegada.`,
      ctaTexto: 'Ver detalhes',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: matched }, initial: false }),
    }
    // Serviço CONCLUÍDO — espelha o aviso que o profissional já recebe. Fecha o lado do
    // dono na única transição que não avisava nada: quando quem confirma por último é a
    // OUTRA parte, o encerramento acontece com o dono fora do app e a demanda apenas some
    // de "Meus Serviços" e reaparece em Contratos Finalizados, calada.
    // E o aviso não é só notícia: as duas ações do dono depois do serviço — avaliar e
    // bloquear — só existem naquele card, e quem não estava presente no encerramento nunca
    // era apontado para lá.
    // Recolhe TODOS de uma vez (chaves no plural): a marca d'água nasce vazia, então na
    // primeira abertura depois do lançamento o histórico inteiro conta como novidade.
    const fins = (resp.reparos || []).filter(x =>
      x.status === 'encerrada' && x.match_feito_em && naoVisto(`concluido:${x.id}`)
    )
    if (fins.length) return {
      chaves: fins.map(x => `concluido:${x.id}`), emoji: '🏁',
      titulo: fins.length === 1 ? 'Serviço concluído!' : 'Serviços concluídos!',
      subtitulo: fins.length === 1
        ? 'O serviço foi concluído pelas duas partes. Em Contratos Finalizados você pode avaliar o profissional e, se quiser, bloqueá-lo para futuros serviços.'
        : `${fins.length} serviços foram concluídos pelas duas partes. Em Contratos Finalizados você pode avaliar os profissionais e, se quiser, bloqueá-los para futuros serviços.`,
      ctaTexto: fins.length === 1 ? 'Avaliar profissional' : 'Avaliar profissionais',
      navegar: () => navigationRef.current?.navigate('Contratos Finalizados'),
    }
    // Chegada declarada e ainda não confirmada. semMarca pelo mesmo motivo do
    // encerramento: não é notícia para comemorar uma vez, é uma ação que falta. Ela NÃO
    // destrava nada — encerrar continua livre, e o detalhe apenas aconselha confirmar a
    // chegada antes. O valor do aviso é outro: o profissional declarou que chegou e está
    // esperando resposta, e sem isto o dono não fica sabendo que há algo a responder.
    // status !== 'encerrada' para não cobrar confirmação de serviço já fechado: reparo de
    // antes do fluxo de chegada podia encerrar com a declaração pendente para sempre.
    const cheg = (resp.reparos || []).find(x =>
      x.chegada_declarada_em != null && x.chegada_confirmada_em == null && x.status !== 'encerrada'
    )
    if (cheg) return {
      semMarca: true,
      chave: `chegada:${cheg.id}`, emoji: '🚶',
      titulo: 'Confirme a chegada',
      subtitulo: `O profissional de "${cheg.titulo}" aguarda a sua confirmação de que ele chegou ao local do serviço.`,
      ctaTexto: 'Confirmar chegada',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: cheg }, initial: false }),
    }
    const enc = (resp.reparos || []).find(x =>
      x.encerramento_solicitado_por != null && String(x.encerramento_solicitado_por) !== String(uid)
    )
    if (enc) return {
      semMarca: true,
      chave: `encerramento:${enc.id}`, emoji: '🤝',
      titulo: 'Confirme o encerramento',
      subtitulo: `O profissional marcou "${enc.titulo}" como concluído. O serviço só encerra quando você confirmar.`,
      ctaTexto: 'Confirmar encerramento',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: enc }, initial: false }),
    }
    // Lembrete de avaliação. semMarca porque é uma AÇÃO QUE FALTA, não notícia: o 🏁 acima
    // já anunciou a conclusão uma vez e saiu do caminho: quem dispensou com "Ver depois"
    // nunca mais era lembrado. Fica por último, como os demais semMarca, para não esconder
    // o que dispara uma vez só. Só custa a requisição extra quando há encerrada na lista.
    if ((resp.reparos || []).some(x => x.status === 'encerrada' && x.match_feito_em)) {
      const naoAvaliado = await contratoNaoAvaliado(false, naoVisto)
      if (naoAvaliado) return {
        semMarca: true,
        dispensavel: `avaliacao_dispensada:reparo:${naoAvaliado.id}`,
        chave: `avaliar:${naoAvaliado.id}`, emoji: '⭐', semConfete: true,
        titulo: 'Avalie o profissional',
        subtitulo: naoAvaliado.titulo
          ? `Como foi o serviço "${naoAvaliado.titulo}"? Sua avaliação ajuda outros solicitantes a escolher.`
          : 'Como foi o último serviço concluído? Sua avaliação ajuda outros solicitantes a escolher.',
        ctaTexto: 'Avaliar agora',
        navegar: () => navigationRef.current?.navigate('Contratos Finalizados'),
      }
    }
  }
  // dono_obra — um pintor/construtor se candidatou
  if (ehDonoObra) {
    const resp = await api.get('/obras/minhas')
    const o = (resp.obras || []).find(x =>
      x.candidatura_pendente_recente_id != null && naoVisto(`candidatura:${x.candidatura_pendente_recente_id}`)
    )
    if (o) return {
      chave: `candidatura:${o.candidatura_pendente_recente_id}`, emoji: '🔔',
      titulo: 'Sua obra recebeu uma proposta!',
      subtitulo: `"${o.titulo}" tem profissional(is) interessado(s). Veja e escolha o melhor!`,
      ctaTexto: 'Ver proposta',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: o }, initial: false }),
    }
    const matched = (resp.obras || []).find(x =>
      x.match_feito_em && x.match_usuario_id && naoVisto(`obra_match:${x.id}`)
    )
    if (matched) return {
      chave: `obra_match:${matched.id}`, emoji: '🎉',
      titulo: 'Sua obra vai ser realizada!',
      subtitulo: `Ótima notícia! Um profissional verificado fechou negócio para "${matched.titulo}". Combine os detalhes agora! Encerrem apenas depois que os dois confirmarem a chegada.`,
      ctaTexto: 'Ver detalhes',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: matched }, initial: false }),
    }
    // Obra CONCLUÍDA — espelha o ramo do dono_reparo, mesma posição (depois do match,
    // antes dos semMarca) e mesmo prefixo de marca d'água. Fecha a transição que não
    // avisava nada quando quem confirma por último é a outra parte, e aponta para o único
    // lugar onde o dono avalia e bloqueia: o card em Contratos Finalizados.
    const fins = (resp.obras || []).filter(x =>
      x.status === 'encerrada' && x.match_feito_em && naoVisto(`concluido:${x.id}`)
    )
    if (fins.length) return {
      chaves: fins.map(x => `concluido:${x.id}`), emoji: '🏁',
      titulo: fins.length === 1 ? 'Obra concluída!' : 'Obras concluídas!',
      subtitulo: fins.length === 1
        ? 'A obra foi concluída pelas duas partes. Em Contratos Finalizados você pode avaliar o profissional e, se quiser, bloqueá-lo para futuras obras.'
        : `${fins.length} obras foram concluídas pelas duas partes. Em Contratos Finalizados você pode avaliar os profissionais e, se quiser, bloqueá-los para futuras obras.`,
      ctaTexto: fins.length === 1 ? 'Avaliar profissional' : 'Avaliar profissionais',
      navegar: () => navigationRef.current?.navigate('Contratos Finalizados'),
    }
    // Espelha o ramo do dono_reparo acima: o profissional declarou que chegou e espera
    // resposta. Não destrava o encerramento (que segue livre) — serve para o dono saber
    // que há algo a responder.
    const cheg = (resp.obras || []).find(x =>
      x.chegada_declarada_em != null && x.chegada_confirmada_em == null && x.status !== 'encerrada'
    )
    if (cheg) return {
      semMarca: true,
      chave: `chegada:${cheg.id}`, emoji: '🚶',
      titulo: 'Confirme a chegada',
      subtitulo: `O profissional de "${cheg.titulo}" aguarda a sua confirmação de que ele chegou ao local do serviço.`,
      ctaTexto: 'Confirmar chegada',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: cheg }, initial: false }),
    }
    const enc = (resp.obras || []).find(x =>
      x.encerramento_solicitado_por != null && String(x.encerramento_solicitado_por) !== String(uid)
    )
    if (enc) return {
      semMarca: true,
      chave: `encerramento:${enc.id}`, emoji: '🤝',
      titulo: 'Confirme o encerramento',
      subtitulo: `O profissional marcou "${enc.titulo}" como concluída. A obra só encerra quando você confirmar.`,
      ctaTexto: 'Confirmar encerramento',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: enc }, initial: false }),
    }
    // Espelha o lembrete de avaliação do ramo do dono_reparo — mesma posição (último dos
    // semMarca), mesma gate de requisição e mesmo um-por-vez.
    if ((resp.obras || []).some(x => x.status === 'encerrada' && x.match_feito_em)) {
      const naoAvaliado = await contratoNaoAvaliado(true, naoVisto)
      if (naoAvaliado) return {
        semMarca: true,
        dispensavel: `avaliacao_dispensada:obra:${naoAvaliado.id}`,
        chave: `avaliar:${naoAvaliado.id}`, emoji: '⭐', semConfete: true,
        titulo: 'Avalie o profissional',
        subtitulo: naoAvaliado.titulo
          ? `Como foi a obra "${naoAvaliado.titulo}"? Sua avaliação ajuda outros solicitantes a escolher.`
          : 'Como foi a última obra concluída? Sua avaliação ajuda outros solicitantes a escolher.',
        ctaTexto: 'Avaliar agora',
        navegar: () => navigationRef.current?.navigate('Contratos Finalizados'),
      }
    }
  }
  // reparador — o dono aceitou sua proposta
  if (ehReparador) {
    const resp = await api.get('/reparos/meus-interesses')
    // Contraproposta pendente do dono — mais urgente, verifica ANTES do aceito.
    const cp = (resp.ativos || []).find(x => x.status === 'contraproposta_dono' && naoVisto(`contraproposta:${x.id}`))
    if (cp) return {
      tipo: 'contraproposta_prestador',
      chave: `contraproposta:${cp.id}`,
      titulo: '💬 Nova contraproposta!',
      mensagem: `O solicitante de "${cp.titulo}" fez uma contraproposta de R$ ${Number(cp.valor_contraproposta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Veja e responda!`,
      reparo_id: cp.reparo_id,
      interesse_id: cp.id,
    }
    // As DUAS grafias de aceite (ver STATUS_GRUPO em ContratosScreen.js:24), igual ao ramo
    // do pintor e ao gate de encerramento logo abaixo: sem 'aprovada' o profissional nunca
    // era parabenizado pelo serviço que ganhou.
    const it = (resp.ativos || []).find(x => (x.status === 'aceito' || x.status === 'aprovada') && naoVisto(`interesse:${x.id}`))
    if (it) return {
      chave: `interesse:${it.id}`, emoji: '🎉',
      titulo: 'Parabéns! Você conseguiu o serviço!',
      subtitulo: `O cliente aceitou sua proposta para "${it.titulo}". Combine os detalhes agora! Encerrem apenas depois que os dois confirmarem a chegada.`,
      ctaTexto: 'Ver detalhes',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: it.reparo_id } }, initial: false }),
    }
    // Serviço CONCLUÍDO — a entrega, que era o único momento do funil sem aviso nenhum.
    // Vem do HISTÓRICO, não de `ativos`: 'encerrada' é justamente o que move a linha para
    // lá, e é também o que a tira de "Meus Serviços". Sem isto o profissional descobria o
    // fim pela ausência — a linha sumia de uma lista e reaparecia noutra, calada.
    // Prefixo próprio: `encerramento:` já é do PEDIDO pendente, momento diferente (lá
    // falta uma ação dele; aqui não falta nada). Reusar a chave faria um silenciar o outro.
    // ANTES do encerramento semMarca logo abaixo, seguindo a regra do cabeçalho (:13):
    // evento de uma vez só na frente, dispara, fica marcado e sai do caminho.
    // Recolhe TODOS de uma vez (chaves no plural, como as recusas): a marca d'água nasce
    // vazia, então na primeira abertura depois do lançamento o histórico inteiro conta
    // como novidade. Um por verificação daria uma fila de "Parabéns!" por contrato antigo.
    const fins = (resp.historico || []).filter(x =>
      (x.status === 'aceito' || x.status === 'aprovada') && x.reparo_status === 'encerrada' &&
      naoVisto(`concluido:${x.id}`)
    )
    if (fins.length) return {
      chaves: fins.map(x => `concluido:${x.id}`), emoji: '🏁',
      titulo: 'Parabéns!',
      subtitulo: fins.length === 1
        ? 'O solicitante confirmou o encerramento do serviço. Se algo não correu bem, você pode denunciar em Contratos Finalizados.'
        : `Os solicitantes confirmaram o encerramento de ${fins.length} serviços. Se algo não correu bem, você pode denunciar em Contratos Finalizados.`,
      ctaTexto: fins.length === 1 ? 'Ver contrato' : 'Ver contratos',
      navegar: () => navigationRef.current?.navigate('Contratos Finalizados'),
    }
    // Exige o interesse ACEITO: a lista traz também propostas recusadas/pendentes do
    // mesmo reparo, e o pedido de encerramento só diz respeito a quem está no serviço.
    // As DUAS grafias de aceite (ver STATUS_GRUPO em ContratosScreen.js:24), como o ramo
    // do pintor logo abaixo já fazia: um aceite gravado como 'aprovada' não pode engolir
    // o aviso — sem ele o reparo fica parado esperando uma confirmação que o profissional
    // nunca é convidado a dar.
    const enc = (resp.ativos || []).find(x =>
      (x.status === 'aceito' || x.status === 'aprovada') && x.encerramento_solicitado_por != null &&
      String(x.encerramento_solicitado_por) !== String(uid)
    )
    if (enc) return {
      semMarca: true,
      chave: `encerramento:${enc.reparo_id}`, emoji: '🤝',
      titulo: 'Confirme o encerramento',
      subtitulo: `O solicitante marcou "${enc.titulo}" como concluído. O serviço só encerra quando você confirmar.`,
      ctaTexto: 'Confirmar encerramento',
      navegar: () => navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: enc.reparo_id } }, initial: false }),
    }
    // Recusa — ÚLTIMO do ramo. Vem do HISTÓRICO, não de `ativos`: é para lá que o interesse
    // recusado vai. Marca d'água normal (sem semMarca): avisa UMA vez e não insiste — repetir
    // "não foi dessa vez" a cada foco seria crueldade. O CTA leva ao feed de disponíveis
    // ('Reparos' é a aba do TabsPrestadorNavigator, AppNavigator.js:549): cumpre o "algo
    // melhor surgirá" levando a pessoa ao próximo serviço, em vez de só fechar o modal.
    // Recolhe TODAS as recusas ainda não vistas num aviso só. Com `.find()` cada verificação
    // levava uma recusa e marcava uma chave, então quem voltasse depois de várias derrotas
    // levava "não foi dessa vez" na cara uma vez por abertura do app até a fila esvaziar.
    const recs = (resp.historico || []).filter(x =>
      (x.status === 'recusado' || x.status === 'recusada') && naoVisto(`recusa:${x.id}`)
    )
    // Nomeia a demanda: sem isto o aviso dizia que uma proposta foi recusada mas não QUAL,
    // e este modal é o único lugar em que a recusa aparece — a linha recusada não é
    // destacada em "Meus Serviços", ela só passa a exibir "✗ Recusado" entre as outras.
    // Sem título disponível volta ao texto anterior, genérico mas correto.
    const nomeRec = nomeDe(recs)
    if (recs.length) return {
      semConfete: true,
      chaves: recs.map(x => `recusa:${x.id}`), emoji: '😔',
      titulo: 'Não foi dessa vez',
      subtitulo: recs.length === 1
        ? `Infelizmente o serviço${nomeRec ? ` ${nomeRec}` : ''} foi dado a outro profissional, mas não fique triste, ainda hoje algo melhor surgirá para você! 🙏`
        : `Infelizmente ${nomeRec ? `${nomeRec} e outros ${recs.length - 1}` : `${recs.length}`} serviços foram dados a outros profissionais, mas não fique triste, algo melhor surgirá para você! 🙏`,
      ctaTexto: 'Ver outros serviços',
      navegar: () => navigationRef.current?.navigate('Reparos'),
    }
  }
  // pintor/construtor — o dono aceitou sua candidatura
  if (ehPintor) {
    const resp = await api.get('/candidaturas/minhas')
    // Contraproposta pendente do dono — mais urgente, verifica ANTES do aceito.
    const cp = (resp.candidaturas || []).find(x => x.status === 'contraproposta_dono' && naoVisto(`contraproposta:${x.id}`))
    if (cp) return {
      tipo: 'contraproposta_prestador',
      chave: `contraproposta:${cp.id}`,
      titulo: '💬 Nova contraproposta!',
      mensagem: `O dono da obra "${cp.titulo}" fez uma contraproposta de R$ ${Number(cp.valor_contraproposta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Veja e responda!`,
      obra_id: cp.obra_id,
      candidatura_id: cp.id,
    }
    const c = (resp.candidaturas || []).find(x => (x.status === 'aceito' || x.status === 'aprovada') && naoVisto(`candidatura:${x.id}`))
    if (c) return {
      chave: `candidatura:${c.id}`, emoji: '🎉',
      titulo: 'Parabéns! Você conseguiu a obra!',
      subtitulo: `O cliente aceitou sua proposta${c.titulo ? ` para "${c.titulo}"` : ''}. Combine os detalhes agora! Encerrem apenas depois que os dois confirmarem a chegada.`,
      ctaTexto: 'Ver detalhes',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: c.obra_id } }, initial: false }),
    }
    // Obra CONCLUÍDA — espelha o ramo do reparador, mesma posição (antes do semMarca) e
    // mesmo prefixo de marca d'água. A diferença é a COLEÇÃO: /candidaturas/minhas devolve
    // uma lista só, sem o par ativos/histórico do meus-interesses, então o encerramento se
    // reconhece pelo obra_status da própria linha — o mesmo campo que ContratosScreen.js:60
    // usa para tirar a obra encerrada da lista em andamento.
    const fins = (resp.candidaturas || []).filter(x =>
      (x.status === 'aceito' || x.status === 'aprovada') && x.obra_status === 'encerrada' &&
      naoVisto(`concluido:${x.id}`)
    )
    if (fins.length) return {
      chaves: fins.map(x => `concluido:${x.id}`), emoji: '🏁',
      titulo: 'Parabéns!',
      subtitulo: fins.length === 1
        ? 'O dono confirmou o encerramento da obra. Se algo não correu bem, você pode denunciar em Contratos Finalizados.'
        : `Os donos confirmaram o encerramento de ${fins.length} obras. Se algo não correu bem, você pode denunciar em Contratos Finalizados.`,
      ctaTexto: fins.length === 1 ? 'Ver contrato' : 'Ver contratos',
      navegar: () => navigationRef.current?.navigate('Contratos Finalizados'),
    }
    // Mesmo motivo do reparador: só a candidatura aceita está no serviço.
    const enc = (resp.candidaturas || []).find(x =>
      (x.status === 'aceito' || x.status === 'aprovada') && x.encerramento_solicitado_por != null &&
      String(x.encerramento_solicitado_por) !== String(uid)
    )
    if (enc) return {
      semMarca: true,
      chave: `encerramento:${enc.obra_id}`, emoji: '🤝',
      titulo: 'Confirme o encerramento',
      subtitulo: `O dono${enc.titulo ? ` de "${enc.titulo}"` : ' da obra'} marcou o serviço como concluído. A obra só encerra quando você confirmar.`,
      ctaTexto: 'Confirmar encerramento',
      navegar: () => navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: enc.obra_id } }, initial: false }),
    }
    // Recusa — ÚLTIMO do ramo, espelhando o reparador. Aqui a lista é a mesma dos demais
    // (`candidaturas` já traz as recusadas), então não há coleção separada a consultar.
    // O CTA leva ao feed de disponíveis: 'Obras' é a aba do TabsPintorNavigator
    // (AppNavigator.js:526), o navegador montado para pintor E para assinante — os mesmos
    // dois papéis que caem neste ramo (ehPintor, :25).
    // Recolhe TODAS as recusas ainda não vistas num aviso só, como no ramo do reparador.
    // A forma plural fala em OBRAS (e concorda no feminino: "foram dadas"), acompanhando
    // o CTA "Ver outras obras" logo abaixo.
    const recs = (resp.candidaturas || []).filter(x =>
      (x.status === 'recusado' || x.status === 'recusada') && naoVisto(`recusa:${x.id}`)
    )
    // Mesmo motivo do ramo do reparador (:265): o aviso é o único lugar em que a recusa
    // aparece, e sem o nome não dizia de qual obra falava. "outras" no feminino, seguindo a
    // concordância que este ramo já mantém ("foram dadas", "Ver outras obras").
    const nomeRec = nomeDe(recs)
    if (recs.length) return {
      semConfete: true,
      chaves: recs.map(x => `recusa:${x.id}`), emoji: '😔',
      titulo: 'Não foi dessa vez',
      subtitulo: recs.length === 1
        ? `Infelizmente a obra${nomeRec ? ` ${nomeRec}` : ''} foi dada a outro profissional, mas não fique triste, ainda hoje algo melhor surgirá para você! 🙏`
        : `Infelizmente ${nomeRec ? `${nomeRec} e outras ${recs.length - 1}` : `${recs.length}`} obras foram dadas a outros profissionais, mas não fique triste, algo melhor surgirá para você! 🙏`,
      ctaTexto: 'Ver outras obras',
      navegar: () => navigationRef.current?.navigate('Obras'),
    }
  }
  return null
}

// Ref de módulo para acionar a verificação de celebração a partir de outras telas
// (ex.: logo após o prestador/pintor aceitar, sem depender de troca de foco/aba).
export const celebracaoRef = { verificar: null }

// Overlay de celebração de match. Montado uma vez no NavigationContainer; aparece
// automaticamente ao abrir o app, voltar ao foreground ou navegar entre abas.
export default function CelebracaoMatchHost() {
  const { usuario } = useAuth()
  const [evento, setEvento] = useState(null)
  const checandoRef = useRef(false)
  const ultimaRef = useRef(0)

  // forcar=true (login / foreground) checa já; senão, no máximo 1x a cada 15s para
  // não bater na API a cada troca de aba.
  const verificar = useCallback(async (forcar = false) => {
    if (!usuario || checandoRef.current) return
    const agora = Date.now()
    if (!forcar && agora - ultimaRef.current < 15000) return
    ultimaRef.current = agora
    checandoRef.current = true
    try {
      const ev = await detectar(usuario)
      // Marca como visto ao exibir → comemora exatamente uma vez, mesmo se só dispensar.
      // Exceto os eventos `semMarca` (encerramento pendente): não são notícia a comemorar
      // uma vez, e sim uma ação que falta. Ficam fora da marca d'água e reaparecem a cada
      // verificação até a outra parte deixar de estar esperando.
      // `chaves` (plural) para o evento que resume várias novidades numa só: todas caem
      // juntas, senão as não marcadas voltariam como um segundo aviso logo em seguida.
      if (ev) {
        if (!ev.semMarca) await marcarVistas(usuario.id, ev.chaves || [ev.chave])
        setEvento(ev)
      }
    } catch (e) {
      console.log('[Celebracao] falha ao verificar match | code:', e.code)
    } finally {
      checandoRef.current = false
    }
  }, [usuario])

  // Expõe verificar via ref de módulo para acionamento externo (outras telas).
  useEffect(() => { celebracaoRef.verificar = verificar }, [verificar])

  // Ao logar / abrir o app
  useEffect(() => { if (usuario) verificar(true) }, [usuario, verificar])

  // Ao voltar para o foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => { if (estado === 'active') verificar(true) })
    return () => sub.remove()
  }, [verificar])

  // Ao navegar entre abas/telas (sem nenhuma celebração já aberta)
  useEffect(() => {
    const nav = navigationRef.current
    if (!nav?.addListener) return
    const unsub = nav.addListener('state', () => { if (!evento) verificar() })
    return unsub
  }, [usuario, evento, verificar])

  if (!evento) return null

  const fechar = () => setEvento(null)
  // "Ver depois" precisa continuar significando DEPOIS, senão um lembrete semMarca não
  // lembra nada. Quem realmente não quer avaliar aquele contrato grava a dispensa na MESMA
  // marca d'água (outro prefixo de chave), e só aquele contrato some — os outros seguem
  // sendo lembrados. É por dispositivo, como o resto do celebracao.js.
  const dispensar = async () => {
    const chave = evento?.dispensavel
    setEvento(null)
    if (chave && usuario) await marcarVistas(usuario.id, [chave])
  }
  const irParaDetalhe = () => {
    const ev = evento
    setEvento(null)
    // Contrapropostas usam ids diretos (sem closure navegar); demais eventos trazem navegar().
    if (ev?.tipo === 'contraproposta_prestador') {
      if (ev.reparo_id) navigationRef.current?.navigate('Meus Reparos', { screen: 'DetalheReparo', params: { reparo: { id: ev.reparo_id } }, initial: false })
      else if (ev.obra_id) navigationRef.current?.navigate('Minhas Obras', { screen: 'DetalheObra', params: { obra: { id: ev.obra_id } }, initial: false })
      return
    }
    ev?.navegar?.()
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={fechar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          {/* O confete era incondicional — em cima do aviso de recusa ele soava como
              deboche ("🎉 ✨ 🎉" logo acima de "Não foi dessa vez"). Quem não quiser
              festa marca semConfete. */}
          {evento.semConfete ? null : <Text style={estilos.confete}>🎉   ✨   🎉</Text>}
          {evento.emoji ? <Text style={estilos.emoji}>{evento.emoji}</Text> : null}
          <Text style={estilos.titulo}>{evento.titulo}</Text>
          <Text style={estilos.subtitulo}>{evento.subtitulo || evento.mensagem}</Text>
          <TouchableOpacity style={estilos.cta} onPress={irParaDetalhe} activeOpacity={0.85}>
            <Text style={estilos.ctaTexto}>{evento.ctaTexto || 'Ver proposta'} →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.depois} onPress={fechar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={estilos.depoisTexto}>Ver depois</Text>
          </TouchableOpacity>
          {/* Terceira ação só nos eventos dispensáveis (hoje, o lembrete de avaliação):
              os demais não têm o que dispensar permanentemente. */}
          {evento.dispensavel ? (
            <TouchableOpacity style={estilos.depois} onPress={dispensar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={estilos.dispensarTexto}>Não quero avaliar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:       { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.primaria, padding: 28, alignItems: 'center' },
  confete:    { fontSize: 24, marginBottom: 4 },
  emoji:      { fontSize: 64, marginBottom: 8 },
  titulo:     { fontSize: 22, fontWeight: '800', color: cores.primaria, textAlign: 'center', marginBottom: 10, letterSpacing: -0.3 },
  subtitulo:  { fontSize: 14, color: cores.textoMedio, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  cta:        { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 12 },
  ctaTexto:   { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  depois:     { paddingVertical: 8 },
  depoisTexto:{ color: cores.textoFraco, fontSize: 13 },
  // Mais apagada que "Ver depois": é a saída definitiva, não deve competir com o CTA.
  dispensarTexto:{ color: cores.textoMutado, fontSize: 12 },
})
