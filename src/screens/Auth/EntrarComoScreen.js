import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Image, BackHandler } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { cores, larguraMaxima } from '../../utils/tema'
import { contaContratar, ehTipoContratar, lerUltimoTipoContratar } from '../../utils/contas'
import {
  COR_TRABALHAR, COR_CONTRATAR, CARTOES_TIPO, ROTULO_LADO, FundoBrilhos, CartaoEscolha, CaixaAviso, BotaoVoltar, Wordmark,
  estilosEscolha as s,
} from './EscolhaPerfil'

// Ordem dos lados e dos tipos dentro de cada lado (a mesma da escolha de perfil do cadastro).
const LADOS = ['trabalhar', 'contratar']
const TIPOS_CONHECIDOS = Object.keys(CARTOES_TIPO)

// Item de `contas` pode vir como string ou como objeto com `tipo` — o valor lido aqui é o
// MESMO que volta para o POST /auth/login, sem tradução.
const tipoDe = (conta) => (typeof conta === 'string' ? conta : conta?.tipo)

// Miolo da tela (título, cabeçalhos por lado, cards e rodapé), exportado para a Galeria.
// Só aparecem os lados e os tipos que a pessoa TEM; `ultimoTipo` (utils/contas) ganha a
// tag "ÚLTIMO USADO". Tipo que a API devolveu e esta versão do app não conhece aparece no
// fim, com o próprio nome, em vez de sumir e deixar a conta inalcançável.
// O lado CONTRATAR tem UM card só (Fase 1), mesmo com as duas contas contratantes no e-mail:
// entra na última contratante usada (`ultimoTipo` se for uma delas, senão `ultimoContratar`),
// senão dono_reparo, senão dono_obra — utils/contas.contaContratar.
export function EntrarComoConteudo({ contas, tipoCarregando, ultimoTipo, ultimoContratar, onEscolher }) {
  const tipos = (contas || []).map(tipoDe).filter(Boolean)
  const contratar = contaContratar(tipos, ehTipoContratar(ultimoTipo) ? ultimoTipo : ultimoContratar)
  const lados = LADOS
    .map(lado => ({ lado, tipos: TIPOS_CONHECIDOS.filter(t => CARTOES_TIPO[t].lado === lado && tipos.includes(t) && (!ehTipoContratar(t) || t === contratar)) }))
    .filter(l => l.tipos.length > 0)
  const desconhecidos = tipos.filter(t => !TIPOS_CONHECIDOS.includes(t))
  const ocupado = !!tipoCarregando

  const card = (tipo, c) => (
    <CartaoEscolha
      key={tipo}
      cor={c.cor}
      imagem={c.imagem}
      icone={c.icone}
      rotulo={c.rotulo}
      tamanhoRotulo={14}
      titulo={c.titulo}
      etiqueta={tipo === ultimoTipo || (ehTipoContratar(tipo) && ehTipoContratar(ultimoTipo)) ? 'ÚLTIMO USADO' : null}
      onPress={() => onEscolher(tipo)}
      disabled={ocupado}
      carregando={tipoCarregando === tipo}
    />
  )

  return (
    <>
      <Text style={s.tituloCentro} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Como você quer entrar?</Text>
      <Text style={s.subtituloCentro}>Você tem mais de um cadastro com este e-mail</Text>

      {lados.map(l => (
        <View key={l.lado}>
          <Text style={[estilos.secao, { color: CARTOES_TIPO[l.tipos[0]].cor }]} maxFontSizeMultiplier={1.5}>{ROTULO_LADO[l.lado]}</Text>
          {l.tipos.map(t => card(t, CARTOES_TIPO[t]))}
        </View>
      ))}

      {desconhecidos.map(t => card(t, { cor: cores.textoFraco, icone: '👤', rotulo: 'CONTA', titulo: t }))}

      <CaixaAviso icone="refresh-cw" titulo="Dá para trocar depois">
        No Perfil, em "Meus perfis", sem digitar a senha.
      </CaixaAviso>
    </>
  )
}

// Tela "Entrar como:" — renderizada pela LoginScreen (não é rota) quando o login devolve
// 2+ contas. E-mail e senha ficam no estado da LoginScreen; daqui só sai o tipo escolhido.
// Visual da escolha de perfil do cadastro: mesmos halos, logo com o voltar sobreposto, cards.
// `email` (opcional): o do login, para ler a última conta CONTRATANTE usada neste aparelho —
// só importa quando o e-mail tem as duas e o último perfil geral não é uma delas.
export default function EntrarComoScreen({ contas, tipoCarregando, ultimoTipo, email, onEscolher, onVoltar }) {
  // Voltar do Android retorna ao login em vez de sair da pilha.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onVoltar(); return true })
    return () => sub.remove()
  }, [onVoltar])

  const [ultimoContratar, setUltimoContratar] = useState(null)
  useEffect(() => {
    let vivo = true
    lerUltimoTipoContratar(email).then((t) => { if (vivo) setUltimoContratar(t) })
    return () => { vivo = false }
  }, [email])

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={s.tela}>
      <FundoBrilhos corTopo={COR_TRABALHAR} corBaixo={COR_CONTRATAR} />
      <ScrollView contentContainerStyle={[s.scroll, larguraMaxima]} showsVerticalScrollIndicator={false}>
        <View style={s.topo}>
          <BotaoVoltar onPress={onVoltar} estilo={s.btnVoltarTopo} disabled={!!tipoCarregando} />
          <View style={s.logoWrap}>
            <Image source={require('../../../assets/logo.png')} style={s.logo} resizeMode="contain" />
            <Wordmark tamanho={26} />
          </View>
        </View>
        <EntrarComoConteudo contas={contas} tipoCarregando={tipoCarregando} ultimoTipo={ultimoTipo} ultimoContratar={ultimoContratar} onEscolher={onEscolher} />
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  // Cabeçalho de cada lado, na cor do lado — único estilo próprio desta tela.
  secao: { fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
})
