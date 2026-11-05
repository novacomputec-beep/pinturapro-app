import { Platform } from 'react-native'
import { GoogleSignin, statusCodes, isErrorWithCode } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'

// "Continuar com Google" / "Continuar com Apple" (Arte-Login-Google-Apple): só a parte do
// PROVEDOR. Cada função devolve a credencial que POST /auth/social (API,
// controllers/authController.loginSocial) verifica — { provedor, id_token, nome } — ou null
// quando a pessoa cancelou no diálogo (a tela não mostra nada). Quem decide o que fazer com a
// resposta (sessão, "Entrar como", cadastro via ticket) é AuthContext.loginSocial + LoginScreen.
//
// Google: biblioteca "Original" do @react-native-google-signin (Credential Manager no Android,
// SDK nativo no iOS). O id_token sai com audience = webClientId, que é o que a API confere.
// Apple: expo-apple-authentication; o identity token é o JWT que a API valida contra as chaves
// públicas da Apple. Nome e e-mail só vêm na PRIMEIRA autorização — por isso o nome é
// mandado junto no POST, e a API guarda o `sub` para as próximas.

export const GOOGLE_WEB_CLIENT_ID = '592909036534-mco08mbsdbsouppbqdjfesi2t1gra3he.apps.googleusercontent.com'
export const GOOGLE_IOS_CLIENT_ID = '592909036534-2dh75e9op84ek9h6p3k4mlog1fjk1pf3.apps.googleusercontent.com'

export const NOME_PROVEDOR = { google: 'Google', apple: 'Apple' }

let googleConfigurado = false
const configurarGoogle = () => {
  if (googleConfigurado) return
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID })
  googleConfigurado = true
}

const credencialGoogle = async () => {
  configurarGoogle()
  // Android sem Play Services (ou desatualizado): abre o diálogo de atualização e lança
  // PLAY_SERVICES_NOT_AVAILABLE, que vira mensagem amigável abaixo. No iOS resolve true.
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  const resposta = await GoogleSignin.signIn()
  if (resposta?.type !== 'success') return null              // 'cancelled' (ou 'noSavedCredentialFound')
  const idToken = resposta.data?.idToken
  if (!idToken) throw new Error('Google não devolveu id_token')
  // A sessão que vale é a da API; a do SDK só serviria para o próximo toque pular o seletor
  // de conta — e quem tem duas contas Google quer o seletor. Best-effort.
  GoogleSignin.signOut().catch(() => {})
  return { provedor: 'google', id_token: idToken, nome: resposta.data?.user?.name || null }
}

// iOS 13+ com a capability ligada (app.json ios.usesAppleSignIn). Android/Web: false, e o botão
// não aparece. Nunca lança.
export const appleDisponivel = async () => {
  if (Platform.OS !== 'ios') return false
  try { return await AppleAuthentication.isAvailableAsync() } catch (err) { return false }
}

const credencialApple = async () => {
  let credencial
  try {
    credencial = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })
  } catch (err) {
    if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') return null
    throw err
  }
  if (!credencial?.identityToken) throw new Error('Apple não devolveu identity token')
  const nome = [credencial.fullName?.givenName, credencial.fullName?.familyName].filter(Boolean).join(' ').trim() || null
  return { provedor: 'apple', id_token: credencial.identityToken, nome }
}

// null = cancelou. Lança nos demais erros (SDK ou aparelho); a mensagem vem de mensagemErroSocial.
export const obterCredencialSocial = (provedor) => (provedor === 'apple' ? credencialApple() : credencialGoogle())

// Texto do alerta para QUALQUER erro do fluxo (SDK do provedor ou POST /auth/social). null = o
// erro é um cancelamento disfarçado (nada a mostrar). A mensagem da API (`erro` do corpo, que o
// interceptor expõe em err.mensagem) vem primeiro: 401 "Não foi possível validar o login com
// Google.", 400 email_ausente "O provedor não informou um e-mail...", 403 "Conta desativada".
export const mensagemErroSocial = (err, provedor) => {
  const nome = NOME_PROVEDOR[provedor] || 'o provedor'
  if (isErrorWithCode(err)) {
    switch (err.code) {
      case statusCodes.SIGN_IN_CANCELLED: return null
      case statusCodes.IN_PROGRESS: return `Já há um login com ${nome} em andamento. Aguarde um instante.`
      case statusCodes.PLAY_SERVICES_NOT_AVAILABLE: return 'Este aparelho está sem o Google Play Services atualizado. Entre com e-mail e senha.'
      default: break
    }
  }
  if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') return null
  if (err?.status && err?.mensagem) return err.mensagem
  if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED') return 'Sem conexão. Verifique sua internet e tente de novo.'
  return `Não foi possível entrar com ${nome}. Tente de novo ou entre com e-mail e senha.`
}
