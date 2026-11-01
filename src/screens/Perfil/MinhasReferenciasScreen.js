import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario, BotaoSecundario } from '../../components'
import { useReferencias, ReferenciasCampos, MSG_REF } from '../../components/VerificacaoIdentidadeSheet'
import api from '../../services/api'
import { comRetry } from '../../utils/rede'
import { mascararTelefone } from '../../utils/telefone'
import { mostrarAviso } from '../../utils/deepLink'
import { useAuth } from '../../contexts/AuthContext'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

// "Minhas referências" (Perfil → só quando usuario.tem_referencias): as pessoas que o
// profissional indicou na verificação de identidade. GET /auth/referencias devolve
// { referencias: [{ nome, telefone }], problema }; `problema` (também em
// usuario.referencias_problema) é o motivo pelo qual o admin pediu correção. Com problema a
// tela já abre editando, com a faixa vermelha e o motivo. A edição reaproveita o
// useReferencias/ReferenciasCampos da VerificacaoIdentidadeSheet (a mesma régua da API) e
// grava com PUT /auth/referencias { referencias }. Ao salvar, revalida a sessão para o
// "Corrigir" sumir do Perfil.
// O miolo (MinhasReferenciasConteudo) não chama a API: a Galeria de estados o monta com
// dados locais.

const DICA = 'Pessoas que já contrataram você ou trabalharam com você. Elas não aparecem para os clientes.'

// Motivo da correção pelos valores EXATOS de `problema` da API: 'propria' (telefone do
// próprio profissional) e 'repetido' (as duas com o mesmo telefone). Qualquer outro valor
// não vazio recebe o pedido genérico; vazio/nulo é "sem problema".
const MOTIVOS = {
  propria:  'Ela tem o seu próprio telefone. Coloque o de outra pessoa que conheça seu trabalho.',
  repetido: 'As duas referências têm o mesmo telefone. Use pessoas diferentes.',
}
export const motivoProblema = (problema) => {
  if (problema == null || problema === '') return null
  return MOTIVOS[problema] || 'Confira os dados e salve de novo.'
}

// Telefone INTEIRO, formatado (xx) xxxxx-xxxx (ou (xx) xxxx-xxxx no fixo): são as referências
// do próprio usuário, nada é ocultado. mascararTelefone só aplica a máscara de formato.
const telefoneExibido = (v) => (v ? mascararTelefone(String(v)) : '')

// Valores iniciais do useReferencias a partir da lista do servidor.
const paraInicial = (refs) => ({
  ref1Nome: refs?.[0]?.nome || '',
  ref1Tel:  telefoneExibido(refs?.[0]?.telefone),
  ref2Nome: refs?.[1]?.nome || '',
  ref2Tel:  telefoneExibido(refs?.[1]?.telefone),
})

// Modo edição. Com problema os nomes já nascem "tocados", para o erro de nome próprio (se
// for o caso) aparecer sem blur. `onSalvar(refs)` recebe o hook para ler a lista e devolver
// a recusa do servidor ao campo certo.
const Editor = ({ usuario, referencias, problema, salvando, onSalvar, onCancelar }) => {
  const refs = useReferencias(usuario, paraInicial(referencias), { tocados: !!problema })
  const motivo = motivoProblema(problema)
  return (
    <>
      {motivo && (
        <View style={estilos.faixa}>
          <Text style={estilos.faixaTitulo}>Sua referência precisa ser corrigida.</Text>
          <Text style={estilos.faixaTexto}>{motivo}</Text>
        </View>
      )}
      <ReferenciasCampos refs={refs} />
      <Text style={estilos.dica}>{DICA}</Text>
      {refs.temErro && <Text style={estilos.avisoErros}>{MSG_REF.corrija}</Text>}
      <BotaoPrimario
        titulo="Salvar referências"
        onPress={() => { if (refs.validarObrigatorios()) onSalvar(refs) }}
        carregando={salvando}
        desabilitado={refs.temErro}
      />
      {onCancelar ? <BotaoSecundario titulo="Cancelar" onPress={onCancelar} estilo={{ marginTop: 10 }} /> : null}
    </>
  )
}

const Cartao = ({ indice, referencia }) => (
  <View style={estilos.card}>
    <Text style={estilos.cardTitulo}>Referência {indice + 1}{indice === 1 && !referencia ? ' (opcional)' : ''}</Text>
    {referencia ? (
      <>
        <Text style={estilos.cardNome}>{referencia.nome}</Text>
        <Text style={estilos.cardTel}>📞 {telefoneExibido(referencia.telefone)}</Text>
      </>
    ) : (
      <Text style={estilos.cardVazio}>Não informada</Text>
    )}
  </View>
)

export const MinhasReferenciasConteudo = ({ usuario, referencias, problema, editando, salvando, onEditar, onSalvar, onCancelar }) => {
  if (editando) {
    return <Editor usuario={usuario} referencias={referencias} problema={problema} salvando={salvando} onSalvar={onSalvar} onCancelar={onCancelar} />
  }
  return (
    <>
      <Cartao indice={0} referencia={referencias?.[0]} />
      <Cartao indice={1} referencia={referencias?.[1]} />
      <Text style={estilos.dica}>{DICA}</Text>
      <BotaoPrimario titulo="Editar referências" onPress={onEditar} />
    </>
  )
}

export default function MinhasReferenciasScreen({ navigation }) {
  const { usuario, revalidarSessao } = useAuth()
  const montadoRef = useRef(true)
  useEffect(() => () => { montadoRef.current = false }, [])
  const [carregando, setCarregando] = useState(true)
  const [erroCarga, setErroCarga] = useState(null)
  const [referencias, setReferencias] = useState([])
  const [problema, setProblema] = useState(usuario?.referencias_problema || null)
  const [editando, setEditando] = useState(!!usuario?.referencias_problema)
  const [salvando, setSalvando] = useState(false)

  const carregar = async () => {
    setCarregando(true)
    setErroCarga(null)
    try {
      const resp = await comRetry(() => api.get('/auth/referencias'), { timeout: true, servidor: true })
      if (!montadoRef.current) return
      const lista = Array.isArray(resp?.referencias) ? resp.referencias : []
      // O servidor é a fonte do problema; o usuario local cobre a resposta sem o campo.
      const prob = resp?.problema ?? usuario?.referencias_problema ?? null
      setReferencias(lista)
      setProblema(prob)
      if (prob) setEditando(true)
    } catch (err) {
      console.log('[MinhasReferencias] falha ao carregar | status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem)
      if (montadoRef.current) setErroCarga(err?.mensagem || 'Não foi possível carregar suas referências.')
    } finally {
      if (montadoRef.current) setCarregando(false)
    }
  }
  useEffect(() => { carregar() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // PUT idempotente (grava a mesma lista): repetir em timeout/5xx é inócuo.
  const salvar = async (refs) => {
    setSalvando(true)
    try {
      const lista = refs.lista()
      await comRetry(() => api.put('/auth/referencias', { referencias: lista }), { timeout: true, servidor: true })
      if (!montadoRef.current) return
      setReferencias(lista)
      setProblema(null)
      setEditando(false)
      mostrarAviso('Referências atualizadas')
      // Relê o perfil para usuario.referencias_problema cair e o "Corrigir" sumir do Perfil.
      // Best-effort: a gravação já aconteceu; uma falha aqui só adia o sumiço do badge.
      try { await revalidarSessao() } catch (e) {
        console.log('[MinhasReferencias] falha ao revalidar a sessão | msg:', e?.mensagem || e?.message)
      }
    } catch (err) {
      console.log('[MinhasReferencias] falha ao salvar | status:', err?.status, '| code:', err?.code, '| codigo:', err?.codigo, '| msg:', err?.mensagem)
      if (!refs.aplicarErroServidor(err)) Alert.alert('Erro', err?.mensagem || 'Não foi possível salvar suas referências.')
    } finally {
      if (montadoRef.current) setSalvando(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Text style={estilos.btnVoltarTexto}>←</Text>
          </TouchableOpacity>

          <Text style={estilos.titulo}>Minhas{'\n'}referências</Text>
          <Text style={estilos.subtitulo}>Indicadas na sua verificação de identidade.</Text>

          {carregando ? (
            <ActivityIndicator color={cores.primaria} style={{ marginTop: 32 }} />
          ) : erroCarga ? (
            <View style={estilos.card}>
              <Text style={estilos.cardVazio}>{erroCarga}</Text>
              <BotaoSecundario titulo="Tentar de novo" onPress={carregar} estilo={{ marginTop: 12 }} />
            </View>
          ) : (
            <MinhasReferenciasConteudo
              usuario={usuario}
              referencias={referencias}
              problema={problema}
              editando={editando}
              salvando={salvando}
              onEditar={() => setEditando(true)}
              onSalvar={salvar}
              // Com problema não há o que "ver": só salvar corrigido (ou voltar pela seta).
              onCancelar={problema ? undefined : () => setEditando(false)}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container:     { flex: 1, backgroundColor: cores.fundo },
  scroll:        { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico },
  btnVoltar:     { marginTop: 60, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  btnVoltarTexto:{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  titulo:        { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo:     { fontSize: 13, color: cores.textoFraco, marginBottom: 24 },
  card:          { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 16, marginBottom: 12 },
  cardTitulo:    { fontSize: 12, fontWeight: '600', color: cores.textoMedio, marginBottom: 8 },
  cardNome:      { fontSize: 15, fontWeight: '600', color: cores.textoForte, marginBottom: 4 },
  cardTel:       { fontSize: 13, color: cores.textoForte },
  cardVazio:     { fontSize: 13, color: cores.textoFraco },
  dica:          { fontSize: 12, color: cores.textoMedio, lineHeight: 18, marginTop: 4, marginBottom: 16 },
  faixa:         { backgroundColor: cores.perigoSuave, borderWidth: 1, borderColor: cores.perigo, borderRadius: raios.medio, padding: 12, marginBottom: 16 },
  faixaTitulo:   { fontSize: 13, fontWeight: '700', color: cores.perigo, marginBottom: 4 },
  faixaTexto:    { fontSize: 13, color: cores.textoForte, lineHeight: 18 },
  avisoErros:    { fontSize: 12, fontWeight: '600', color: cores.perigo, textAlign: 'center', marginBottom: 8 },
})
