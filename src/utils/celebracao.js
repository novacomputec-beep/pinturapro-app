import AsyncStorage from '@react-native-async-storage/async-storage'

// Marca d'água local (por usuário) das celebrações de match já exibidas. Garante
// que cada novo match seja comemorado uma única vez por dispositivo, sobrevivendo
// a relançamentos do app. É por-dispositivo: ao logar em outro aparelho, um match
// antigo pode comemorar uma vez — comportamento aceito (sem custo de backend).
const chave = (uid) => `celebracao_vistas:${uid}`

export const carregarVistas = async (uid) => {
  try {
    const raw = await AsyncStorage.getItem(chave(uid))
    return new Set(JSON.parse(raw || '[]'))
  } catch {
    return new Set()
  }
}

export const marcarVista = async (uid, item) => {
  try {
    const vistas = await carregarVistas(uid)
    vistas.add(item)
    await AsyncStorage.setItem(chave(uid), JSON.stringify([...vistas]))
  } catch {
    // falha de storage não deve quebrar o fluxo — no pior caso a celebração repete
  }
}
