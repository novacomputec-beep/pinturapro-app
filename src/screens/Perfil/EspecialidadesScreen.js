import React, { useState, useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MAX_ESPECIALIDADES, normalizarEspecialidades } from '../../utils/categorias'
import { gruposComCategorias, contagemPorGrupo, SLUG_OUTROS, grupoObrasEspecialidades, ehEspecialidadeDeObra, TILE_OBRAS_ESPECIALIDADES } from '../../utils/gruposServico'
import { MolduraWizard, RodapeWizard, GradeGrupos, ChipsEscolhidos, FolhaGrupo } from '../DonoObra/CadastrarServicoPassos'
import { cores } from '../../utils/tema'

// Seleção das especialidades do prestador — de 1 a MAX_ESPECIALIDADES categorias da
// lista fechada do lado dele. Substitui o campo de texto livre do cadastro, onde
// "Hidráulica", "hidraulica" e "hidráulica " viravam três valores no banco.
//
// MÍNIMO 1 e teto de 5 existem pelo mesmo motivo: quem não escolhe nada não aparece em
// busca nenhuma, e quem marca todas não está dizendo nada sobre si.
//
// Devolve o resultado por navigation.navigate(origem, { especialidades }), NÃO por
// callback em params: função em rota não sobrevive ao Android reciclar o processo, e o
// estado de navegação restaurado traria um callback morto. Com params serializáveis a
// seleção atravessa o background/restore intacta.
//
// Uma tela só para QUALQUER conta profissional (Arte-Especialidades-Reparador +
// Arte-Fase2-Trabalhar): as mesmas peças do wizard de serviço — título laranja, grade de
// grupos com "N marcadas"/"Toque para ver", folha com exemplos e caixas grandes, tile largo
// "Outros", chips "Você faz (N de 5)" — e o tile em destaque "Obras de Construção Civil", que
// abre a mesma folha com os quatro papéis de obra. A API aceita a MESMA lista (serviços + os
// quatro de obra, teto de 5 no total) na conta de serviços (Fase 2a) e na conta de obra
// (Fase 2b): é marcando um serviço que a conta de obra passa a ver serviços, e vice-versa.
// Por isso as pills que a conta de obra tinha (só os quatro papéis) saíram, e o parâmetro
// `lado` que os chamadores ainda mandam não muda mais nada aqui.

// "Outros" (era "Outros serviços"): com o bloco de obras na mesma grade, o tile deixou de
// falar só de serviço.
export const TILE_OUTROS_ESPECIALIDADES = { id: SLUG_OUTROS, titulo: 'Outros', emoji: '➕', desc: 'Aceito pedidos de qualquer área' }
// Subtítulo da folha de qualquer grupo, inclusive o de obras: o teto é do TOTAL.
export const SUBTITULO_FOLHA_ESPECIALIDADES = `Marque o que você faz · até ${MAX_ESPECIALIDADES} no total`
export const AVISO_TETO = `Você já marcou ${MAX_ESPECIALIDADES}, o máximo. Para trocar, desmarque uma.`
export const AVISO_MINIMO = 'Você precisa ter pelo menos 1 especialidade.'

// Títulos por origem: o cadastro pergunta no futuro ("sabe fazer"), o Perfil no presente.
export const titulosEspecialidades = (origem) => (origem === 'Cadastro'
  ? { tituloTela: 'Suas especialidades', titulo: 'O que você sabe fazer?', subtitulo: `Marque de 1 a ${MAX_ESPECIALIDADES}, no total — são elas que dizem em que você aparece nas buscas.` }
  : { tituloTela: 'Minhas especialidades', titulo: 'O que você faz', subtitulo: `Marque de 1 a ${MAX_ESPECIALIDADES}, no total — são elas que dizem em que você aparece nas buscas.` })

// Aviso da folha e dos chips: teto atingido, ou nenhuma marcada. null quando está tudo bem.
export const avisoEspecialidades = (selecionadas) =>
  selecionadas.length >= MAX_ESPECIALIDADES ? AVISO_TETO : selecionadas.length === 0 ? AVISO_MINIMO : null

export default function EspecialidadesScreen({ navigation, route }) {
  // A seleção inicial é FILTRADA na entrada: valor legado de texto livre ("Faz tudo")
  // não vira pill, não entra na contagem e não ocupa vaga do teto. Ver
  // normalizarEspecialidades — o descarte é silencioso e assumido.
  const [selecionadas, setSelecionadas] = useState(
    () => normalizarEspecialidades(route.params?.selecionadas)
  )
  // Rota que abriu a tela; é para lá que o resultado volta.
  const origem = route.params?.origem

  const cheio = selecionadas.length >= MAX_ESPECIALIDADES

  // Atualização FUNCIONAL, e não `selecionadas.includes(...)` lido de fora: dois toques
  // no mesmo quadro leem a mesma lista antiga, e o segundo passaria pela checagem de
  // teto com a contagem pré-primeiro-toque. Aqui cada chamada recebe a lista já
  // atualizada pela anterior, então o teto vale toque a toque.
  const alternar = (slug) => {
    setSelecionadas((atuais) => {
      if (atuais.includes(slug)) return atuais.filter((s) => s !== slug)
      if (atuais.length >= MAX_ESPECIALIDADES) return atuais
      return [...atuais, slug]
    })
  }

  // navigate (e não goBack) porque é o navigate que carrega os params de volta. Como a
  // origem JÁ está na pilha, o navigate volta para a instância existente — não empilha uma
  // segunda cópia da tela de cadastro. `merge: true` é obrigatório: no React Navigation 6 o
  // navigate para uma tela já na pilha SUBSTITUI os params dela (não mescla), e sem a flag o
  // AdicionarPerfil perdia o `tipo` (voltava como "Tipo de perfil inválido.", bug da 1.1.9) e
  // o Cadastro perdia `social`. Com a flag só `especialidades` muda; o resto fica.
  const confirmar = () => {
    if (!selecionadas.length) return
    if (origem) navigation.navigate({ name: origem, params: { especialidades: selecionadas }, merge: true })
    else navigation.goBack()
  }

  // ─── Grade de grupos + folha ──────────────────────────────────────────────────────────
  const grupos = useMemo(() => gruposComCategorias(), [])
  // Bloco "Obras de Construção Civil" (Arte-Fase2-Trabalhar): os quatro papéis de obra, que
  // qualquer conta profissional pode marcar. Abre na MESMA folha dos grupos (grupoAberto recebe
  // este objeto) e conta no mesmo teto de 5.
  const grupoObras = useMemo(() => grupoObrasEspecialidades(), [])
  // Voltar do Android com a folha aberta fecha a folha (o Modal cuida); sem folha, sai SEM
  // devolver params, como o ← — o chamador mantém o que tinha.
  const [grupoAberto, setGrupoAberto] = useState(null)

  const t = titulosEspecialidades(origem)
  const aviso = avisoEspecialidades(selecionadas)
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <MolduraWizard
        passo={1}
        progresso={false}
        tituloTela={t.tituloTela}
        titulos={{ 1: { titulo: t.titulo, subtitulo: t.subtitulo } }}
        mostrarVoltar
        onVoltar={() => navigation.goBack()}
        rodape={<RodapeWizard rotulo="Confirmar →" onPress={confirmar} desabilitado={!selecionadas.length} nota={!selecionadas.length ? AVISO_MINIMO : null} />}
      >
        <GradeGrupos
          grupos={grupos}
          contagem={contagemPorGrupo(selecionadas)}
          outrosMarcado={selecionadas.includes(SLUG_OUTROS)}
          bloqueado={cheio}
          legendas
          tileOutros={TILE_OUTROS_ESPECIALIDADES}
          onAbrir={setGrupoAberto}
          onOutros={() => alternar(SLUG_OUTROS)}
          tileObras={TILE_OBRAS_ESPECIALIDADES}
          obrasMarcadas={selecionadas.filter(ehEspecialidadeDeObra).length}
          onObras={() => setGrupoAberto(grupoObras)}
        />
        <ChipsEscolhidos
          categorias={selecionadas}
          onRemover={alternar}
          rotulo="VOCÊ FAZ"
          limite={MAX_ESPECIALIDADES}
          textoLimite={AVISO_TETO}
          vazio="Toque num grupo acima e marque o que você faz."
        />
      </MolduraWizard>
      <FolhaGrupo
        visivel={grupoAberto != null}
        grupo={grupoAberto}
        selecionadas={selecionadas}
        onAlternar={alternar}
        onPronto={() => setGrupoAberto(null)}
        limite={MAX_ESPECIALIDADES}
        subtitulo={SUBTITULO_FOLHA_ESPECIALIDADES}
        aviso={aviso}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
})
