import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native'
import { cores, raios, espacos } from '../utils/tema'

// "Outros" com descrição (arte Arte-Outros). Quem marca ➕ Outros nas especialidades diz, em
// poucas palavras, o que faz — é esse texto que permite casar o pedido certo com a pessoa.
// Vai à API como `outros_descricao`, junto de `especialidades`, no cadastro do prestador
// (POST /auth/cadastro e POST /auth/contas/reparador) e em Minhas especialidades
// (PUT /auth/perfil). Obrigatório enquanto "Outros" estiver marcado: o servidor responde
// 400 OUTROS_DESCRICAO_OBRIGATORIA e as telas mapeiam esse código para o campo.
//
// Tudo que as quatro telas compartilham mora aqui — o slug, o teto, as mensagens, o campo
// e o banner do Perfil — para não nascerem quatro cópias que depois divergem.
export const SLUG_OUTROS = 'outros'
export const MAX_OUTROS_DESCRICAO = 40
export const CODIGO_OUTROS_OBRIGATORIA = 'OUTROS_DESCRICAO_OBRIGATORIA'
export const MSG_OUTROS_OBRIGATORIA = 'Conte o que você faz em "Outros" para continuar.'
export const DICA_OUTROS = 'Em poucas palavras. Ex.: design de cartazes, conserto de bicicleta, afiação de facas.'
export const TEXTO_BANNER_OUTROS = 'Conte o que você faz em "Outros" para receber pedidos certos para você.'

export const temOutros = (especialidades) => Array.isArray(especialidades) && especialidades.includes(SLUG_OUTROS)
export const limparOutrosDescricao = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_OUTROS_DESCRICAO)
// Falta a descrição: "Outros" marcado e texto vazio — a condição do bloqueio ao salvar.
export const faltaOutrosDescricao = (especialidades, descricao) => temOutros(especialidades) && !limparOutrosDescricao(descricao)
// Perfil: usuário com "Outros" entre as especialidades e sem outros_descricao → banner + "Completar".
export const perfilPrecisaOutros = (usuario) => faltaOutrosDescricao(usuario?.especialidades, usuario?.outros_descricao)
// 400 do servidor com o código da descrição obrigatória (api.js expõe `codigo` do corpo).
export const ehErroOutrosObrigatoria = (err) => err?.status === 400 && err?.codigo === CODIGO_OUTROS_OBRIGATORIA

// Caixa abaixo dos chips. `erro`: texto em vermelho sob o campo (validação local ou o 400).
export const CampoOutrosDescricao = ({ valor, onChange, erro, autoFocus = false, estilo }) => {
  const texto = String(valor ?? '')
  return (
    <View style={[estilos.caixa, erro && estilos.caixaErro, estilo]}>
      <Text style={estilos.titulo}>Em "Outros", o que você faz?</Text>
      <Text style={estilos.dica}>{DICA_OUTROS}</Text>
      <TextInput
        style={[estilos.campo, erro && estilos.campoErro]}
        value={texto}
        onChangeText={(t) => onChange(t.slice(0, MAX_OUTROS_DESCRICAO))}
        maxLength={MAX_OUTROS_DESCRICAO}
        placeholder="O que você faz"
        placeholderTextColor={cores.placeholderCampo}
        autoFocus={autoFocus}
        autoCapitalize="sentences"
        returnKeyType="done"
        accessibilityLabel='Em "Outros", o que você faz?'
      />
      <View style={estilos.rodape}>
        <Text style={[estilos.erro, !erro && { opacity: 0 }]} numberOfLines={2}>{erro || ' '}</Text>
        <Text style={[estilos.contador, texto.length >= MAX_OUTROS_DESCRICAO && { color: cores.primaria }]}>{texto.length}/{MAX_OUTROS_DESCRICAO}</Text>
      </View>
    </View>
  )
}

// Banner do Perfil: convite laranja (não é erro), toque leva a Minhas especialidades.
export const BannerCompletarOutros = ({ onPress, estilo }) => (
  <TouchableOpacity style={[estilos.banner, estilo]} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
    <Text style={estilos.bannerIcone}>➕</Text>
    <Text style={estilos.bannerTexto}>{TEXTO_BANNER_OUTROS}</Text>
    <Text style={estilos.bannerSeta}>→</Text>
  </TouchableOpacity>
)

// Galeria de estados: dois chips de contexto (➕ Outros marcado) e o campo com estado local
// editável — vazio, preenchido ou com o erro do 400. Nada aqui chama a API.
export const OutrosDescricaoDemo = ({ inicial = '', erro = null }) => {
  const [texto, setTexto] = useState(inicial)
  return (
    <View>
      <View style={estilos.demoChips}>
        <View style={estilos.demoChip}><Text style={estilos.demoChipTexto}>🧵 Costura</Text></View>
        <View style={[estilos.demoChip, estilos.demoChipAtivo]}><Text style={[estilos.demoChipTexto, estilos.demoChipTextoAtivo]}>➕ Outros</Text></View>
      </View>
      <CampoOutrosDescricao valor={texto} onChange={setTexto} erro={erro} />
    </View>
  )
}

const estilos = StyleSheet.create({
  caixa:          { backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.primariaBorda, borderRadius: raios.grande, padding: 14, marginBottom: espacos.lg },
  caixaErro:      { borderColor: cores.perigo },
  titulo:         { fontSize: 15, fontWeight: '700', color: cores.textoForte, marginBottom: 4 },
  dica:           { fontSize: 12, color: cores.textoMedio, lineHeight: 17, marginBottom: 10 },
  // Mesma caixa do Input (components/index.js) para o campo ser da mesma família.
  campo:          { backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: raios.medio, paddingHorizontal: espacos.lg, paddingVertical: 13, fontSize: 14, color: cores.textoForte },
  campoErro:      { borderColor: cores.perigo },
  rodape:         { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  erro:           { flex: 1, color: cores.perigo, fontSize: 11, lineHeight: 15 },
  contador:       { fontSize: 11, color: cores.textoMedio, fontWeight: '600' },
  banner:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: espacos.tela, marginBottom: 16, backgroundColor: cores.primariaSuave, borderWidth: 1, borderColor: cores.primariaBorda, borderRadius: raios.grande, paddingHorizontal: 14, paddingVertical: 12 },
  bannerIcone:    { fontSize: 18 },
  bannerTexto:    { flex: 1, fontSize: 13, color: cores.textoForte, lineHeight: 18 },
  bannerSeta:     { fontSize: 14, color: cores.primaria, fontWeight: '700' },
  demoChips:      { flexDirection: 'row', gap: 8, marginBottom: 16 },
  demoChip:       { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
  demoChipAtivo:  { backgroundColor: cores.primaria, borderColor: cores.primaria },
  demoChipTexto:  { fontSize: 12, color: cores.textoMedio },
  demoChipTextoAtivo: { color: cores.fundo, fontWeight: '600' },
})
