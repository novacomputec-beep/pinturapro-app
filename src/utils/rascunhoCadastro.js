import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'

// Fonte única das chaves e helpers do rascunho de cadastro. Três consumidores
// dependem disto (CadastroScreen, SplashScreen, AuthContext); centralizar evita
// que as chaves divirjam entre eles.
//
// Distribuição por sensibilidade:
//  - RASCUNHO_KEY (AsyncStorage): campos NÃO sensíveis do formulário + o passo +
//    o carimbo de tempo _ts (usado para a janela de validade).
//  - RASCUNHO_SENHA_KEY (SecureStore): a senha (mesmo mecanismo cifrado do token).
//  - RASCUNHO_FOTOS_KEY (SecureStore): as secure_urls das fotos de verificação —
//    PII (documentos), por isso NUNCA no AsyncStorage. Só secure_urls duráveis do
//    Cloudinary; jamais URIs locais file://.
export const RASCUNHO_KEY = 'cadastro_rascunho_v1'
export const RASCUNHO_SENHA_KEY = 'cadastro_rascunho_senha_v1'
export const RASCUNHO_FOTOS_KEY = 'cadastro_rascunho_fotos_v1'

// Janela de validade do rascunho: passado esse tempo, é tratado como inexistente.
export const RASCUNHO_VALIDADE_MS = 24 * 60 * 60 * 1000 // 24h

// Limpa TODO o rascunho (AsyncStorage + ambas as chaves SecureStore). Best-effort:
// cada remoção é isolada para que uma falha não impeça as outras.
export const limparRascunhoCadastro = async () => {
  try { await AsyncStorage.removeItem(RASCUNHO_KEY) } catch (e) {}
  try { await SecureStore.deleteItemAsync(RASCUNHO_SENHA_KEY) } catch (e) {}
  try { await SecureStore.deleteItemAsync(RASCUNHO_FOTOS_KEY) } catch (e) {}
}

// Estado do rascunho para o resume de cold-start:
//   'nenhum'   — não há rascunho salvo
//   'fresco'   — existe e está dentro da janela de 24h (deve oferecer retomar)
//   'expirado' — existe mas passou de 24h (o chamador deve limpar em silêncio)
// Nunca lança; qualquer erro de leitura/parse é tratado como 'nenhum'.
export const estadoRascunhoCadastro = async () => {
  try {
    const bruto = await AsyncStorage.getItem(RASCUNHO_KEY)
    if (!bruto) return 'nenhum'
    const s = JSON.parse(bruto)
    const ts = Number(s?._ts)
    if (!ts || (Date.now() - ts) > RASCUNHO_VALIDADE_MS) return 'expirado'
    return 'fresco'
  } catch (e) {
    return 'nenhum'
  }
}
