import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import api from '../../services/api'
import { comRetry } from '../../utils/rede'
import BannerErroCarregamento from '../../components/BannerErroCarregamento'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

// Estrelas somente-leitura. Reproduz a MESMA renderização visual do ModalAvaliacao
// (glifos ★/☆, laranja da marca), porque o modal não expõe as estrelas isoladamente e
// não devemos alterá-lo. `nota` é arredondada pelo chamador quando vier de uma média.
const Estrelas = ({ nota, tamanho = 15 }) => (
  <View style={{ flexDirection: 'row' }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Text key={n} style={{ fontSize: tamanho, marginRight: 2, color: n <= nota ? '#E8833A' : cores.textoFraco }}>
        {n <= nota ? '★' : '☆'}
      </Text>
    ))}
  </View>
)

// Uma linha da distribuição: quantas avaliações a nota recebeu. A barra é proporcional ao
// TOTAL (a soma das cinco faixas), e não ao maior balde: com o maior balde a faixa líder
// encostaria na largura toda mesmo valendo 30% das avaliações, o que lê como "quase todo
// mundo deu 5" — a barra tem de dizer que fatia do total é aquela nota.
//
// `total` já chega > 0 (o ramo vazio é tratado antes de renderizar qualquer linha), mas a
// guarda fica: uma divisão por zero aqui daria width: 'NaN%', que o RN descarta em silêncio
// e deixaria a trilha vazia sem explicação nenhuma.
const LinhaDistribuicao = ({ estrela, quantidade, total }) => {
  const fracao = total > 0 ? quantidade / total : 0
  return (
    <View style={estilos.distLinha}>
      <Text style={estilos.distEstrela}>{estrela} ★</Text>
      <View style={estilos.distTrilha}>
        <View style={[estilos.distBarra, { width: `${fracao * 100}%` }]} />
      </View>
      <Text style={estilos.distNumero}>{quantidade}</Text>
    </View>
  )
}

export default function AvaliacoesRecebidasScreen({ navigation }) {
  // A API devolve as cinco chaves ("1".."5") sempre preenchidas, inclusive com zero. O
  // estado inicial repete esse formato para que a tela nunca leia `undefined` de um balde
  // durante o primeiro carregamento nem depois de uma falha.
  const [distribuicao, setDistribuicao] = useState({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  const [media, setMedia] = useState(0)
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState(null)

  // A resposta é AGREGADA: { media, total, distribuicao }. Não há mais avaliacoes[], page
  // nem limit — a API deixou de devolver as avaliações uma a uma, então não há o que
  // paginar. media/total vêm da mesma fonte agregada dos cards de prestador, então batem
  // com o número mostrado ao contratante.
  //
  // A distribuição é normalizada balde a balde em vez de aceita como veio: o contrato
  // promete as cinco chaves zero-preenchidas, mas uma resposta truncada (ou um 304 sem
  // corpo, que este projeto trata como sucesso — ver api.js) entregaria `undefined` a uma
  // faixa e a linha renderizaria vazia em vez de zero.
  const buscar = async () => {
    try {
      const data = await comRetry(() => api.get('/avaliacoes/recebidas'))
      const d = data?.distribuicao
      setDistribuicao({
        1: Number(d?.['1']) || 0,
        2: Number(d?.['2']) || 0,
        3: Number(d?.['3']) || 0,
        4: Number(d?.['4']) || 0,
        5: Number(d?.['5']) || 0,
      })
      setMedia(Number(data?.media) || 0)
      setTotal(Number(data?.total) || 0)
      setErro(null)
    } catch (err) {
      console.log('[AvaliacoesRecebidas] falha ao carregar | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      setErro(err.mensagem || 'Não foi possível carregar suas avaliações.')
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }

  useFocusEffect(useCallback(() => { buscar() }, []))

  const onRefresh = () => { setAtualizando(true); buscar() }

  const Cabecalho = () => (
    <>
      <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
        <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
      </TouchableOpacity>
      <View style={estilos.header}>
        <Text style={estilos.titulo}>Avaliações recebidas</Text>
        {/* Resumo só quando há avaliações; o vazio é coberto pelo bloco dedicado abaixo. */}
        {total > 0 && (
          <View style={estilos.resumoRow}>
            <Text style={estilos.mediaNum}>{media.toFixed(1)}</Text>
            <Estrelas nota={Math.round(media)} tamanho={18} />
            <Text style={estilos.resumoTotal}>{total} {total === 1 ? 'avaliação' : 'avaliações'}</Text>
          </View>
        )}
      </View>
    </>
  )

  if (carregando) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
        <Cabecalho />
        <ActivityIndicator color={cores.primaria} style={{ marginTop: 40 }} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      {/* O vazio agora é decidido pelo TOTAL, não pelo tamanho de uma lista: sem
          avaliacoes[] não há mais comprimento a medir, e total === 0 é exatamente a mesma
          condição — com a vantagem de vir do próprio agregado que o cabeçalho já usa. */}
      {total === 0 ? (
        <>
          <Cabecalho />
          {/* Irmão do ramo vazio, nunca dentro dele: vazio POR FALHA mostra os dois. */}
          <BannerErroCarregamento mensagem={erro} onRetry={buscar} />
          <View style={estilos.vazio}>
            <Text style={estilos.vazioIcone}>⭐</Text>
            <Text style={estilos.vazioTitulo}>Nenhuma avaliação ainda</Text>
            <Text style={estilos.vazioSub}>
              Quando um cliente avaliar um serviço que você concluiu, a avaliação aparecerá aqui.
            </Text>
          </View>
        </>
      ) : (
        // ScrollView no lugar da FlatList: são cinco linhas fixas, sem virtualização a
        // fazer e sem chaves a extrair. O RefreshControl segue igual — é ele que mantém o
        // puxar-para-atualizar que a lista trazia.
        <ScrollView
          contentContainerStyle={[estilos.lista, larguraMaxima]}
          refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} tintColor={cores.primaria} />}
          showsVerticalScrollIndicator={false}
        >
          <Cabecalho />
          <BannerErroCarregamento mensagem={erro} onRetry={buscar} />
          {/* De 5 para 1, de cima para baixo: é a ordem em que se lê uma distribuição de
              notas, e põe a faixa que mais importa ao prestador na primeira linha. */}
          <View style={estilos.distBloco}>
            {[5, 4, 3, 2, 1].map((n) => (
              <LinhaDistribuicao key={n} estrela={n} quantidade={distribuicao[n] || 0} total={total} />
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container:    { flex: 1, backgroundColor: cores.fundo, paddingHorizontal: espacos.tela },
  btnVoltar:    { marginTop: 60, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  header:       { paddingBottom: 12 },
  titulo:       { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  resumoRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  mediaNum:     { fontSize: 22, fontWeight: '800', color: '#E8833A' },
  resumoTotal:  { fontSize: 13, color: cores.textoFraco },
  lista:        { paddingBottom: 32 + alturas.barraServico, paddingTop: 4 },
  distBloco:    { backgroundColor: cores.fundoCard, borderRadius: 16, borderWidth: 0.5, borderColor: cores.borda, padding: 16, gap: 12 },
  distLinha:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Largura FIXA nos dois rótulos das pontas: sem ela, "5 ★" e "12" mudariam de largura
  // conforme o número e as cinco trilhas começariam e terminariam em posições diferentes,
  // desalinhando justamente a comparação que a distribuição existe para permitir.
  distEstrela:  { width: 30, fontSize: 13, fontWeight: '700', color: cores.textoMedio },
  distTrilha:   { flex: 1, height: 8, borderRadius: 4, backgroundColor: cores.fundoElevado, overflow: 'hidden' },
  distBarra:    { height: '100%', borderRadius: 4, backgroundColor: '#E8833A' },
  distNumero:   { width: 32, fontSize: 13, fontWeight: '600', color: cores.textoForte, textAlign: 'right' },
  vazio:        { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 60 },
  vazioIcone:   { fontSize: 48, marginBottom: 16 },
  vazioTitulo:  { fontSize: 16, fontWeight: '600', color: cores.textoFraco, marginBottom: 8 },
  vazioSub:     { fontSize: 13, color: cores.textoMutado, textAlign: 'center', lineHeight: 20 },
})
