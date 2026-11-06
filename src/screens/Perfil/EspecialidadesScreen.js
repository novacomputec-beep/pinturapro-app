import React, { useState, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario } from '../../components'
import {
  especialidadesPorLado, MAX_ESPECIALIDADES,
  normalizarEspecialidades, rotuloComEmoji,
} from '../../utils/categorias'
import { gruposComCategorias, contagemPorGrupo, SLUG_OUTROS } from '../../utils/gruposServico'
import { MolduraWizard, RodapeWizard, GradeGrupos, ChipsEscolhidos, FolhaGrupo } from '../DonoObra/CadastrarServicoPassos'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

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
// Lado REPARO (Arte-Especialidades-Reparador): as mesmas peças do wizard de serviço —
// título laranja, grade de grupos com "N marcadas"/"Toque para ver", folha com exemplos e
// caixas grandes, tile largo "Outros serviços", chips "Você faz (N de 5)". Lado PINTURA
// (obra): as pills de sempre, intocadas.

export const TILE_OUTROS_ESPECIALIDADES = { id: SLUG_OUTROS, titulo: 'Outros serviços', emoji: '➕', desc: 'Aceito pedidos de qualquer área' }
export const AVISO_TETO = `Você já marcou ${MAX_ESPECIALIDADES}, o máximo. Para trocar, desmarque uma.`
export const AVISO_MINIMO = 'Você precisa ter pelo menos 1 especialidade.'

// Títulos por origem: o cadastro pergunta no futuro ("sabe fazer"), o Perfil no presente.
export const titulosEspecialidades = (origem) => (origem === 'Cadastro'
  ? { tituloTela: 'Suas especialidades', titulo: 'O que você sabe fazer?', subtitulo: `Escolha de 1 a ${MAX_ESPECIALIDADES} — são elas que dizem em que você aparece nas buscas.` }
  : { tituloTela: 'Minhas especialidades', titulo: 'O que você faz', subtitulo: `Escolha de 1 a ${MAX_ESPECIALIDADES} — são elas que dizem em que você aparece nas buscas.` })

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
  // Lado vem por PARÂMETRO, não por contexto: esta tela é apresentacional e os dois
  // chamadores já sabem o lado (Cadastro pelo tipoConta, Perfil pelo tipo_prestador);
  // além disso, no cadastro o usuário nem está logado, então AuthContext não teria o dado.
  // Ausente cai na lista doméstica, o mesmo fallback da API.
  const lado = route.params?.lado
  const lista = especialidadesPorLado(lado)
  const ehReparo = lado !== 'pintura'

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
  // origem JÁ está na pilha, o navigate volta para a instância existente e só mescla os
  // params — não empilha uma segunda cópia da tela de cadastro.
  const confirmar = () => {
    if (!selecionadas.length) return
    if (origem) navigation.navigate(origem, { especialidades: selecionadas })
    else navigation.goBack()
  }

  // ─── Lado reparo: grade de grupos + folha ─────────────────────────────────────────────
  const grupos = useMemo(() => gruposComCategorias(), [])
  // Voltar do Android com a folha aberta fecha a folha (o Modal cuida); sem folha, sai SEM
  // devolver params, como o ← — o chamador mantém o que tinha.
  const [grupoAberto, setGrupoAberto] = useState(null)

  if (ehReparo) {
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
          subtitulo={`Marque o que você faz · até ${MAX_ESPECIALIDADES} no total`}
          aviso={aviso}
        />
      </SafeAreaView>
    )
  }

  // ─── Lado pintura (obra): as pills de sempre ──────────────────────────────────────────
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]}>
        {/* Voltar comum: sai SEM devolver params, então o chamador mantém o que tinha. */}
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
        </TouchableOpacity>

        <Text style={estilos.titulo}>Suas{'\n'}especialidades</Text>
        <Text style={estilos.subtitulo}>Escolha de 1 a {MAX_ESPECIALIDADES} — são elas que dizem em que você aparece nas buscas</Text>

        <Text style={estilos.contador}>{selecionadas.length} de {MAX_ESPECIALIDADES} selecionadas</Text>

        <View style={estilos.grade}>
          {lista.map((c) => {
            const ativa = selecionadas.includes(c.slug)
            // Só as NÃO escolhidas apagam ao encher: as escolhidas seguem tocáveis para
            // a pessoa trocar uma pela outra sem ter que limpar tudo antes.
            const bloqueada = cheio && !ativa
            return (
              <TouchableOpacity
                key={c.slug}
                style={[estilos.categoriaPill, ativa && estilos.categoriaPillAtivo, bloqueada && estilos.pillBloqueada]}
                onPress={() => alternar(c.slug)}
                disabled={bloqueada}
                activeOpacity={0.7}
              >
                <Text style={[estilos.categoriaPillTexto, ativa && estilos.categoriaPillTextoAtivo]}>
                  {rotuloComEmoji(c)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* A explicação só aparece com o botão travado: com algo escolhido ela seria
            ruído sobre uma ação que já funciona. */}
        {!selecionadas.length && (
          <Text style={estilos.aviso}>Escolha pelo menos uma especialidade para continuar.</Text>
        )}

        <BotaoPrimario
          titulo="Confirmar →"
          onPress={confirmar}
          desabilitado={!selecionadas.length}
          estilo={{ marginTop: espacos.sm }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico },
  btnVoltar: { marginTop: 60, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 24 },
  contador: { fontSize: 12, fontWeight: '600', color: cores.primaria, marginBottom: 12 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  // As quatro categoriaPill* são cópia das de CadastrarReparoScreen (antes do wizard) —
  // mesmos valores, mesmos nomes. Só o lado de obra (pintura) ainda as usa.
  categoriaPill: { width: '31%', alignItems: 'center', backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
  categoriaPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  categoriaPillTexto: { fontSize: 12, color: cores.textoMedio, textAlign: 'center' },
  categoriaPillTextoAtivo: { color: cores.fundo, fontWeight: '600' },
  // Único acréscimo às pills: o estado "teto atingido". Não é um estado NOVO da pill —
  // é a mesma pill inativa com opacidade reduzida, para ler como indisponível e não
  // como uma quinta variação de cor.
  pillBloqueada: { opacity: 0.35 },
  aviso: { fontSize: 12, color: cores.textoFraco, textAlign: 'center', marginBottom: espacos.sm },
})
