import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario } from '../../components'
import { CampoOutrosDescricao, temOutros, faltaOutrosDescricao, limparOutrosDescricao, MSG_OUTROS_OBRIGATORIA } from '../../components/OutrosDescricao'
import {
  especialidadesPorLado, MAX_ESPECIALIDADES,
  normalizarEspecialidades, rotuloComEmoji,
} from '../../utils/categorias'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

// Seleção das especialidades do prestador — de 1 a MAX_ESPECIALIDADES categorias da
// lista fechada de CATEGORIAS_SERVICO. Substitui o campo de texto livre do cadastro,
// onde "Hidráulica", "hidraulica" e "hidráulica " viravam três valores no banco.
//
// MÍNIMO 1 e teto de 5 existem pelo mesmo motivo: quem não escolhe nada não aparece em
// busca nenhuma, e quem marca as 21 não está dizendo nada sobre si.
//
// Devolve o resultado por navigation.navigate(origem, { especialidades }), NÃO por
// callback em params: função em rota não sobrevive ao Android reciclar o processo, e o
// estado de navegação restaurado traria um callback morto. Com params serializáveis a
// seleção atravessa o background/restore intacta.
export default function EspecialidadesScreen({ navigation, route }) {
  // A seleção inicial é FILTRADA na entrada: valor legado de texto livre ("Faz tudo")
  // não vira pill, não entra na contagem e não ocupa vaga do teto. Ver
  // normalizarEspecialidades — o descarte é silencioso e assumido.
  const [selecionadas, setSelecionadas] = useState(
    () => normalizarEspecialidades(route.params?.selecionadas)
  )
  // "Outros" com descrição (components/OutrosDescricao): o texto chega por param (o que a
  // conta já tem, ou o rascunho do cadastro) e volta junto da lista. Só é exigido enquanto
  // ➕ Outros estiver marcado; desmarcar não apaga o texto (remarcar o recupera) — quem
  // decide o que vai à API é o chamador, pelo temOutros da lista final.
  // `erroOutros` vem do chamador quando a API respondeu 400 OUTROS_DESCRICAO_OBRIGATORIA:
  // a tela reabre já com o erro no campo.
  const [outrosDescricao, setOutrosDescricao] = useState(() => String(route.params?.outrosDescricao ?? ''))
  const [erroOutros, setErroOutros] = useState(() => (route.params?.erroOutros ? MSG_OUTROS_OBRIGATORIA : null))
  useEffect(() => { if (route.params?.erroOutros) navigation.setParams({ erroOutros: undefined }) }, [route.params?.erroOutros, navigation])
  // Rota que abriu a tela; é para lá que o resultado volta.
  const origem = route.params?.origem
  // Lado vem por PARÂMETRO, não por contexto: esta tela é apresentacional e os dois
  // chamadores já sabem o lado (Cadastro pelo tipoConta, Perfil pelo tipo_prestador);
  // além disso, no cadastro o usuário nem está logado, então AuthContext não teria o dado.
  // Ausente cai na lista doméstica, o mesmo fallback da API.
  const lista = especialidadesPorLado(route.params?.lado)

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
  const outrosMarcado = temOutros(selecionadas)
  const faltaOutros = faltaOutrosDescricao(selecionadas, outrosDescricao)
  const mudarOutros = (t) => { setOutrosDescricao(t); if (erroOutros) setErroOutros(null) }

  const confirmar = () => {
    if (!selecionadas.length) return
    if (faltaOutros) { setErroOutros(MSG_OUTROS_OBRIGATORIA); return }
    // outrosDescricao vai SEMPRE (limpo): com "Outros" fora da lista o chamador manda null.
    if (origem) navigation.navigate(origem, { especialidades: selecionadas, outrosDescricao: limparOutrosDescricao(outrosDescricao) })
    else navigation.goBack()
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} keyboardShouldPersistTaps="handled">
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

        {/* Abaixo dos chips, só com ➕ Outros marcado. O botão segue tocável com o campo
            vazio: o toque mostra o erro no campo, em vez de um botão morto sem explicação. */}
        {outrosMarcado && (
          <CampoOutrosDescricao valor={outrosDescricao} onChange={mudarOutros} erro={erroOutros} />
        )}

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
      </KeyboardAvoidingView>
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
  // As quatro categoriaPill* são cópia das de CadastrarReparoScreen.js:468-471 — mesmos
  // valores, mesmos nomes, com UMA exceção: width 48% (duas colunas) em vez dos 31% (três)
  // de lá. Com três colunas, num aparelho de 360dp a área de texto da pill fica em ~74dp e
  // rótulos como "Manicure/pedicure" (~118dp) truncam; a 48% todos os 21 cabem inteiros.
  // Não há StyleSheet compartilhado neste app (o estilo já vivia duplicado em
  // CadastrarObra, CadastrarReparo, Cadastro e ModalDenuncia), então reaproveitar aqui é
  // copiar; extrair as quatro para components/ é outra tarefa.
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
