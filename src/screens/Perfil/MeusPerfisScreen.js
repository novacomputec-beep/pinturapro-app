import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import api, { authService } from '../../services/api'
import { comRetry } from '../../utils/rede'
import { useAuth } from '../../contexts/AuthContext'
import { listarPerfis, msgErroContas, lerUltimoTipoContratar } from '../../utils/contas'
import { CARTOES_TIPO, CartaoEscolha } from '../Auth/EscolhaPerfil'
import { cores, espacos, alturas, larguraMaxima } from '../../utils/tema'

// "Meus perfis" (Arte-Meus-Perfis): os perfis da mesma pessoa, lidos de usuario.contas (GET
// /auth/perfil, guardado pelo AuthContext). Cards no molde do "Entrar como:" (CartaoEscolha
// de EscolhaPerfil: ilustração, rótulo, título, borda azul = contratar / laranja =
// trabalhar), na ordem contratar, serviço-trabalhar, obra-trabalhar. O rótulo é "ÁREA · AÇÃO": a área em
// branco e a ação na cor do lado. A conta logada fica com borda verde, ✓ verde e a tag
// "EM USO" numa linha sob o título, sem toque; as que existem no mesmo e-mail trocam ao
// toque (POST /auth/trocar-conta e loginComToken, sem senha); as que faltam mostram ＋ e
// abrem a AdicionarPerfilScreen. Ao abrir, relê o perfil (best-effort) para a lista refletir
// uma conta criada em outro aparelho; falhando, fica com o que a sessão já tem. O conteúdo é
// exportado para a Galeria.

// Fase 1 (Arte-Fase1-Contratar): o lado contratante é UM card — "SERVIÇOS E OBRAS ·
// CONTRATAR" —, primeiro da lista; depois os dois profissionais. listarPerfis já devolve os
// três, com o `tipo` da conta contratante a usar no card único.
const AREA = { dono_reparo: 'SERVIÇOS E OBRAS', dono_obra: 'SERVIÇOS E OBRAS', reparador: 'SERVIÇOS', pintor: 'OBRAS' }
const ACAO = { contratar: 'CONTRATAR', trabalhar: 'TRABALHAR' }
const ROTULO_ESTADO = { em_uso: 'Em uso', trocar: 'Trocar para', adicionar: 'Adicionar' }

export function MeusPerfisConteudo({ perfis, trocando, onTrocar, onAdicionar }) {
  const ordenados = [
    perfis.find((p) => p.contratar),
    perfis.find((p) => p.tipo === 'reparador'),
    perfis.find((p) => p.tipo === 'pintor'),
  ].filter(Boolean)
  return (
    <>
      <Text style={estilos.titulo}>Meus perfis</Text>
      <Text style={estilos.subtitulo}>Um e-mail, uma senha. Troque de perfil sem sair da conta.</Text>
      {ordenados.map((p) => {
        const c = CARTOES_TIPO[p.tipo]
        const emUso = p.estado === 'em_uso'
        const adicionar = p.estado === 'adicionar'
        const rotuloTexto = `${AREA[p.tipo]} · ${ACAO[c.lado]}`
        return (
          <CartaoEscolha
            key={p.tipo}
            cor={c.cor}
            corBorda={emUso ? cores.sucesso : undefined}
            imagem={c.imagem}
            rotulo={<><Text style={{ color: cores.textoForte }}>{AREA[p.tipo]}</Text> · {ACAO[c.lado]}</>}
            tamanhoRotulo={14}
            titulo={c.titulo}
            etiquetaAbaixo={emUso ? 'EM USO' : null}
            iconeSeta={emUso ? 'check' : adicionar ? 'plus' : 'arrow-right'}
            corSeta={emUso ? cores.sucesso : undefined}
            onPress={() => (adicionar ? onAdicionar(p.tipo) : onTrocar(p.tipo))}
            disabled={emUso || !!trocando}
            carregando={trocando === p.tipo}
            accessibilityLabel={`${ROTULO_ESTADO[p.estado]} ${rotuloTexto}: ${c.titulo}`}
          />
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

  // Última conta contratante usada neste aparelho: decide para qual das duas o card único
  // "Contratar" troca quando a pessoa tem ambas. Até a leitura voltar vale a ordem padrão.
  const [ultimoContratar, setUltimoContratar] = useState(null)
  useEffect(() => {
    let vivo = true
    lerUltimoTipoContratar(usuario?.email).then((t) => { if (vivo) setUltimoContratar(t) })
    return () => { vivo = false }
  }, [usuario?.email])

  const perfis = listarPerfis(usuario, ultimoContratar)

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
  // Os cards são o CartaoEscolha (EscolhaPerfil): nenhum estilo de card mora aqui.
})
