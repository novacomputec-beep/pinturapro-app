import * as Location from 'expo-location'
import api from './api'

let _locationSubscription = null
let _intervalId = null
const INTERVALO_MS = 15 * 60 * 1000 // 15 minutos

export async function iniciarRastreamento() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      console.log('Permissão de localização negada')
      return false
    }

    // Envia localização imediatamente
    await enviarLocalizacao()

    // Envia a cada 15 minutos
    _intervalId = setInterval(async () => {
      await enviarLocalizacao()
    }, INTERVALO_MS)

    return true
  } catch (err) {
    console.log('Erro ao iniciar rastreamento:', err)
    return false
  }
}

export async function pararRastreamento() {
  if (_locationSubscription) {
    _locationSubscription.remove()
    _locationSubscription = null
  }
  if (_intervalId) {
    clearInterval(_intervalId)
    _intervalId = null
  }
}

async function enviarLocalizacao() {
  try {
    const localizacao = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })
    await api.post('/prestadores/localizacao', {
      latitude: localizacao.coords.latitude,
      longitude: localizacao.coords.longitude,
    })
  } catch (err) {
    console.log('Erro ao enviar localização:', err)
  }
}