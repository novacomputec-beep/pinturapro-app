import React, { useState, useRef, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import api, { authService } from '../../services/api'
import { comRetry } from '../../utils/rede'
import { useAuth } from '../../contexts/AuthContext'
import { listarPerfis, msgErroContas } from '../../utils/contas'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

// "Meus perfis" (Arte-Meus-Perfis): os 4 tipos de cadastro da mesma pessoa, lidos de
// usuario.contas (GET /auth/perfil, guardado pelo AuthContext). A conta logada aparece em
// verde "Em uso"; as que existem no mesmo e-mail ganham "Trocar" (POST /auth/trocar-conta e
// loginComToken, sem senha); as que faltam ganham "Adicionar", que abre a AdicionarPerfilScreen.
// Ao abrir, relê o perfil (best-effort) para a lista refletir uma conta criada em outro
// aparelho; falhando, fica com o que a sessão já tem. O conteúdo é exportado para a Galeria.

const ROTULO_BOTAO = { em_uso: 'Em uso', trocar: 'Trocar', adicionar: 'Adicionar' }

export function MeusPerfisConteudo({ perfis, trocando, onTrocar, onAdicionar }) {
  return (
    <>
      <Text style={estilos.titulo}>Meus perfis</Text>
      <Text style={estilos.subtitulo}>Um e-mail, uma senha, até quatro perfis. Troque de perfil sem sair da conta.</Text>
      {perfis.map((p) => {
        const emUso = p.estado === 'em_uso'
        const trocar = p.estado === 'trocar'
        const ocupado = trocando === p.tipo
        return (
          <View key={p.tipo} style={[estilos.card, emUso && estilos.cardEmUso]}>
            <Text style={estilos.cardIcone}>{p.icone}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[estilos.cardTitulo, emUso && { color: cores.sucesso }]} maxFontSizeMultiplier={1.3}>{p.rotulo}</Text>
              <Text style={estilos.cardDesc} maxFontSizeMultiplier={1.3}>{p.descricao}</Text>
            </View>
            {emUso ? (
              <View style={estilos.chipEmUso}><Text style={estilos.chipEmUsoTexto}>✓ {ROTULO_BOTAO.em_uso}</Text></View>
            ) : (
              <TouchableOpacity
                style={[estilos.btn, trocar ? estilos.btnTrocar : estilos.btnAdicionar, !!trocando && { opacity: 0.6 }]}
                onPress={() => (trocar ? onTrocar(p.tipo) : onAdicionar(p.tipo))}
                disabled={!!trocando}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`${ROTULO_BOTAO[p.estado]} ${p.rotulo}`}
              >
                {ocupado
                  ? <ActivityIndicator color={trocar ? cores.fundo : cores.primaria} />
                  : <Text style={[estilos.btnTexto, trocar ? estilos.btnTrocarTexto : estilos.btnAdicionarTexto]}>{ROTULO_BOTAO[p.estado]}</Text>}
              </TouchableOpacity>
            )}
          </View>
        )
      })}
    </>
  )
}

export default function MeusPerfisScreen({ navigation }) {
  const { usuario, loginComToken, setUsuario } = useAuth()
  const [trocando, setTrocando] = useState(null)
  const montadoRef = useRef(true)
  useEffect(() => () => { montadoRef.current = false }, [])

  // Relê `contas` ao focar: a lista pode ter mudado em outro aparelho, e o cache da sessão
  // de antes deste campo não a tem. Só `contas` muda na sessão — nada de boas-vindas/push.
  useFocusEffect(useCallback(() => {
    let vivo = true
    authService.perfil()
      .then((r) => { if (vivo && Array.isArray(r?.contas)) setUsuario((prev) => (prev ? { ...prev, contas: r.contas } : prev)) })
      .catch((err) => console.log('[MeusPerfis] perfil não recarregou, lista da sessão | code:', err?.code))
    return () => { vivo = false }
  }, [setUsuario]))

  const perfis = listarPerfis(usuario)

  const trocar = async (tipo) => {
    if (trocando) return
    setTrocando(tipo)
    try {
      // comRetry: trocar é idempotente (só monta a sessão da conta pedida); a regra de
      // reenvio mora em utils/rede.
      const r = await comRetry(() => api.post('/auth/trocar-conta', { tipo }))
      if (!r?.token || !r?.usuario) throw { mensagem: 'Resposta inesperada ao trocar de perfil.' }
      // Troca a sessão inteira: o AppNavigator muda a pilha pelo role do usuário novo.
      await loginComToken(r.token, r.usuario, r.assinatura, r.contas)
    } catch (err) {
      console.log('[MeusPerfis] falha ao trocar | status:', err?.status, '| code:', err?.code, '| codigo:', err?.codigo, '| msg:', err?.mensagem)
      if (!montadoRef.current) return
      Alert.alert('Não foi possível trocar', msgErroContas(err?.codigo) || err?.mensagem || 'Tente novamente.')
    } finally {
      if (montadoRef.current) setTrocando(null)
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()} disabled={!!trocando}>
          <Text style={estilos.voltarIcone}>←</Text>
        </TouchableOpacity>
        <MeusPerfisConteudo
          perfis={perfis}
          trocando={trocando}
          onTrocar={trocar}
          onAdicionar={(tipo) => navigation.navigate('AdicionarPerfil', { tipo })}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico },
  btnVoltar: { marginTop: 16, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  voltarIcone: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, lineHeight: 20, marginBottom: 20 },
  // Card no molde do "Entrar como:", só que com o botão à direita no lugar do toque no card.
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda, borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  cardEmUso: { backgroundColor: cores.sucessoSuave, borderColor: cores.sucessoBorda },
  cardIcone: { fontSize: 28 },
  cardTitulo: { fontSize: 15, fontWeight: '700', color: cores.textoForte, lineHeight: 20 },
  cardDesc: { fontSize: 12, color: cores.textoMedio, lineHeight: 16, marginTop: 2 },
  chipEmUso: { backgroundColor: cores.sucesso, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chipEmUsoTexto: { fontSize: 12, fontWeight: '800', color: cores.fundo },
  btn: { minWidth: 92, alignItems: 'center', justifyContent: 'center', borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 9 },
  btnTrocar: { backgroundColor: cores.primaria },
  btnAdicionar: { backgroundColor: cores.fundoElevado, borderWidth: 1, borderColor: cores.primaria },
  btnTexto: { fontSize: 13, fontWeight: '800' },
  btnTrocarTexto: { color: cores.fundo },
  btnAdicionarTexto: { color: cores.primaria },
})
