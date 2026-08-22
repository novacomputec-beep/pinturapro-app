import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario } from '../../components'
import { CATEGORIAS_SERVICO, rotuloComEmoji } from '../../utils/categorias'
import { cores, espacos, raios, alturas } from '../../utils/tema'

// Seleção das especialidades do prestador — de 1 a 5 categorias da lista fechada de
// CATEGORIAS_SERVICO. Substitui o campo de texto livre do cadastro, onde "Hidráulica",
// "hidraulica" e "hidráulica " viravam três valores distintos no banco.
//
// MÍNIMO 1 e MÁXIMO 5, e os dois limites existem pelo mesmo motivo: quem não escolhe
// nada não aparece em busca nenhuma, e quem marca as 21 não está dizendo nada sobre si.
const MAX = 5

export default function EspecialidadesScreen({ navigation, route }) {
  // A seleção inicial chega por params e é copiada para o estado local: enquanto a
  // pessoa mexe, nada volta para o chamador. É o que faz o voltar do topo/gesto
  // devolver a seleção ORIGINAL sem precisar de "descartar alterações?".
  const [selecionadas, setSelecionadas] = useState(() => route.params?.selecionadas ?? [])
  const aoConfirmar = route.params?.aoConfirmar

  const cheio = selecionadas.length >= MAX

  // Atualização FUNCIONAL, e não `selecionadas.includes(...)` lido de fora: dois toques
  // no mesmo quadro leem o mesmo estado antigo, e o segundo passaria pela checagem de
  // teto com a contagem pré-primeiro-toque. Aqui cada chamada recebe a lista já
  // atualizada pela anterior, então o teto vale toque a toque.
  const alternar = (slug) => {
    setSelecionadas((atuais) => {
      if (atuais.includes(slug)) return atuais.filter((s) => s !== slug)
      if (atuais.length >= MAX) return atuais
      return [...atuais, slug]
    })
  }

  const confirmar = () => {
    if (!selecionadas.length) return
    if (aoConfirmar) aoConfirmar(selecionadas)
    navigation.goBack()
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <ScrollView contentContainerStyle={estilos.scroll}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
          <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
        </TouchableOpacity>

        <Text style={estilos.titulo}>Suas{'\n'}especialidades</Text>
        <Text style={estilos.subtitulo}>Escolha de 1 a {MAX} — são elas que dizem em que você aparece nas buscas</Text>

        <Text style={estilos.contador}>{selecionadas.length} de {MAX} selecionadas</Text>

        <View style={estilos.grade}>
          {CATEGORIAS_SERVICO.map((c) => {
            const ativa = selecionadas.includes(c.slug)
            // Só as NÃO escolhidas apagam ao encher: as escolhidas seguem tocáveis para
            // a pessoa poder trocar uma pela outra sem ter que limpar tudo antes.
            const bloqueada = cheio && !ativa
            return (
              <TouchableOpacity
                key={c.slug}
                style={[estilos.categoriaPill, ativa && estilos.categoriaPillAtivo, bloqueada && estilos.pillBloqueada]}
                onPress={() => alternar(c.slug)}
                disabled={bloqueada}
                activeOpacity={0.7}
              >
                <Text style={[estilos.categoriaPillTexto, ativa && estilos.categoriaPillTextoAtivo]} numberOfLines={1}>
                  {rotuloComEmoji(c)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* A explicação só aparece quando o botão está travado: com algo escolhido ela
            seria ruído sobre uma ação que já funciona. */}
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
  // As quatro categoriaPill* são cópia literal das de CadastrarReparoScreen.js:468-471 —
  // mesmos valores, mesmos nomes. Não há StyleSheet compartilhado neste app (o estilo já
  // vivia duplicado em CadastrarObra, CadastrarReparo, Cadastro e ModalDenuncia), então
  // reaproveitar aqui é copiar; extrair as quatro para components/ é outra tarefa.
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
