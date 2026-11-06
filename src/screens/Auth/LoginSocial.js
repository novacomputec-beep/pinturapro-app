import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Linking, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as AppleAuthentication from 'expo-apple-authentication'
import { BotaoPrimario } from '../../components'
import LogoGoogle from '../../components/LogoGoogle'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { cores, raios, espacos, larguraMaxima } from '../../utils/tema'
import { mostrarCobranca } from '../../utils/plataforma'
import { appleDisponivel, obterCredencialSocial, mensagemErroSocial, NOME_PROVEDOR } from '../../services/loginSocial'

// "Continuar com Google/Apple" compartilhado pela LoginScreen e pela SplashScreen
// (Arte-Login-Google-Apple): UM fluxo, UM par de botões, UMA tela de pagamento pendente.
// A tela que usa decide só onde os botões ficam e o texto do divisor.

// Pós-login comum (senha e social): profissional sem assinatura ativa ganha a cobrança.
// linkPagamento != null troca a tela pela TelaPagamentoPendente (quem usa renderiza).
export function useAssinaturaPosLogin() {
  const [linkPagamento, setLinkPagamento] = useState(null)
  const tratarAssinatura = async (resposta) => {
    if (resposta?.assinatura?.status === 'pendente' || !resposta?.assinatura) {
      if (resposta?.usuario?.role === 'prestador' || resposta?.usuario?.role === 'assinante') {
        try {
          const pagamento = await api.post('/pagamentos/criar-assinatura', { plano: 'mensal' })
          // No iOS a chamada acima continua (a assinatura nasce do mesmo jeito), mas o
          // link não vira tela: a 3.1.1 proíbe o checkout externo. Quem acolhe esse
          // usuário é a PagamentoPendenteScreen, que no iOS mostra só a frase.
          if (pagamento.init_point && mostrarCobranca) {
            setLinkPagamento(pagamento.init_point)
          }
        } catch (err) {
          console.log('[Login] falha ao criar assinatura pós-login | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
        }
      }
    }
  }
  return { linkPagamento, setLinkPagamento, tratarAssinatura }
}

// Sem `tipo`: abre o diálogo do provedor (cancelou → nada acontece) e manda a credencial a
// POST /auth/social via AuthContext.loginSocial. Com conta: o mesmo caminho do login por
// senha — último perfil lembrado entra direto; 2+ contas sem lembrado chamam onEscolher
// (a tela mostra o "Entrar como:" e repete com `tipo`, reaproveitando a credencial guardada,
// sem novo diálogo). Sem conta: abre o cadastro completo com nome/e-mail travados e o
// ticket no lugar da senha. onSessao(resposta) roda depois de a sessão ter sido gravada.
export function useLoginSocial({ navigation, onEscolher, onSessao, ocupado = false }) {
  const { loginSocial } = useAuth()
  const [carregandoSocial, setCarregandoSocial] = useState(null)   // provedor cujo botão gira
  const [temApple, setTemApple] = useState(false)                  // iOS 13+ com a capability
  const credencialRef = useRef(null)                                // { provedor, id_token, nome }

  useEffect(() => {
    let vivo = true
    appleDisponivel().then((ok) => { if (vivo) setTemApple(ok) })
    return () => { vivo = false }
  }, [])

  const handleSocial = async (provedor, tipo, setTipoCarregando) => {
    if (ocupado || carregandoSocial) return
    let credencial = tipo ? credencialRef.current : null
    if (!credencial) {
      setCarregandoSocial(provedor)
      try {
        credencial = await obterCredencialSocial(provedor)
      } catch (err) {
        console.log('[Login] falha no diálogo do provedor | provedor:', provedor, '| code:', err?.code, '| msg:', err?.message)
        const msg = mensagemErroSocial(err, provedor)
        if (msg) Alert.alert(`Não foi possível entrar com ${NOME_PROVEDOR[provedor]}`, msg)
        setCarregandoSocial(null)
        return
      }
      if (!credencial) { setCarregandoSocial(null); return }   // cancelou: silêncio
      credencialRef.current = credencial
    }
    if (tipo) setTipoCarregando?.(tipo)
    else setCarregandoSocial(provedor)
    try {
      const resposta = await loginSocial(credencial, tipo)
      if (resposta?.novo) {
        credencialRef.current = null
        navigation.navigate('Cadastro', { social: { provedor, nome: resposta.nome || null, email: resposta.email, ticket: resposta.ticket } })
        return
      }
      if (resposta?.escolher) {
        onEscolher?.({ provedor, contas: resposta.contas, ultimoTipo: resposta.ultimoTipo || null })
        return
      }
      credencialRef.current = null
      await onSessao?.(resposta)
    } catch (err) {
      console.log('[Login] falha no login social | provedor:', provedor, '| status:', err?.status, '| codigo:', err?.codigo, '| code:', err?.code, '| msg:', err?.mensagem || err?.message)
      // Resposta da API (401 token recusado, 403 desativada…): a credencial não serve mais.
      if (err?.status) credencialRef.current = null
      const msg = mensagemErroSocial(err, provedor)
      if (msg) Alert.alert(`Não foi possível entrar com ${NOME_PROVEDOR[provedor]}`, msg)
    } finally {
      setCarregandoSocial(null)
      setTipoCarregando?.(null)
    }
  }

  const limparCredencial = () => { credencialRef.current = null }
  return { carregandoSocial, temApple, handleSocial, limparCredencial }
}

// Google no estilo escuro oficial (fundo #131314, borda #8E918F, texto #E3E3E3, "G" em quatro
// cores) e, só no iOS que tem o recurso, o botão oficial da Apple logo abaixo no mesmo escuro
// (BLACK, com o mesmo aro #8E918F). Enquanto um gira, o outro fica desligado. altura: 48 por
// padrão; a tela de boas-vindas compacta passa 44.
export function BotoesSociais({ carregandoSocial, temApple, desabilitado, onGoogle, onApple, estilo, altura = 48 }) {
  const travado = !!carregandoSocial || !!desabilitado
  return (
    <View style={estilo}>
      <TouchableOpacity
        style={[estilos.btnGoogle, { height: altura }, carregandoSocial && carregandoSocial !== 'google' && { opacity: 0.6 }]}
        onPress={onGoogle}
        disabled={travado}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Continuar com Google"
      >
        {carregandoSocial === 'google' ? <ActivityIndicator color="#E3E3E3" /> : (
          <>
            <LogoGoogle size={20} />
            <Text style={estilos.btnGoogleTexto}>Continuar com Google</Text>
          </>
        )}
      </TouchableOpacity>
      {temApple ? (
        <View style={[estilos.appleWrap, carregandoSocial && { opacity: 0.6 }]} pointerEvents={travado ? 'none' : 'auto'}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={raios.grande}
            style={[estilos.btnApple, { height: altura }]}
            onPress={onApple}
          />
        </View>
      ) : null}
    </View>
  )
}

// Profissional que entrou sem assinatura ativa e ganhou um link de cobrança (só onde
// mostrarCobranca). "Pagar depois" devolve a tela de origem.
export function TelaPagamentoPendente({ link, onDepois }) {
  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.pagContainer}>
      <ScrollView contentContainerStyle={[estilos.pagScroll, larguraMaxima]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>💳</Text>
        <Text style={estilos.pagTitulo}>Pagamento pendente</Text>
        <Text style={estilos.pagSubtitulo}>
          Sua conta foi criada! Para acessar as obras disponíveis, finalize seu pagamento.
        </Text>
        <BotaoPrimario
          titulo="Pagar agora via PagBank →"
          onPress={() => Linking.openURL(link)}
          estilo={{ marginBottom: 12, width: '100%' }}
        />
        <TouchableOpacity style={estilos.btnDepois} onPress={onDepois}>
          <Text style={estilos.btnDepoisTexto}>Pagar depois</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 20, lineHeight: 18, paddingHorizontal: 20 }}>
          Após o pagamento ser confirmado, seu acesso será ativado automaticamente.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  // Botões sociais no escuro oficial do Google (#131314 / #8E918F / #E3E3E3); a Apple abaixo
  // com o mesmo aro, 8 entre eles.
  // Raio raios.grande (16): o mesmo do BotaoPrimario, para os quatro botões empilhados da tela
  // de boas-vindas terem o mesmo contorno.
  btnGoogle:       { borderRadius: raios.grande, backgroundColor: '#131314', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: '#8E918F' },
  btnGoogleTexto:  { fontSize: 15, fontWeight: '600', color: '#E3E3E3' },
  appleWrap:       { marginTop: 8, borderRadius: raios.grande, borderWidth: 1, borderColor: '#8E918F', overflow: 'hidden' },
  btnApple:        { width: '100%' },
  // Tela de pagamento pendente: o que a LoginScreen desenhava inline.
  pagContainer:    { flex: 1, backgroundColor: cores.fundo },
  pagScroll:       { flexGrow: 1, justifyContent: 'center', paddingHorizontal: espacos.tela, paddingBottom: 40, alignItems: 'center', paddingTop: 60 },
  pagTitulo:       { fontSize: 20, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, marginBottom: 6, lineHeight: 26, textAlign: 'center' },
  pagSubtitulo:    { fontSize: 13, color: cores.textoFraco, marginBottom: 32, textAlign: 'center' },
  btnDepois:       { padding: 14, alignItems: 'center' },
  btnDepoisTexto:  { fontSize: 14, color: cores.textoFraco },
})
