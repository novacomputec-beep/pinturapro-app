import { useState, useEffect } from 'react'
import * as Location from 'expo-location'

// Distância haversine (km) entre dois pontos
export const distanciaKm = (lat1, lon1, lat2, lon2) => {
  const toRad = x => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const formatarDistancia = (km) =>
  km < 1 ? 'menos de 1 km' : `${Math.round(km)} km de você`

// Distância do usuário (coords) até um item com latitude/longitude; null quando faltar dado
export const distanciaItemKm = (coords, item) =>
  coords && item?.latitude != null && item?.longitude != null
    ? distanciaKm(coords.lat, coords.lng, parseFloat(item.latitude), parseFloat(item.longitude))
    : null

// Carrega a localização do usuário para exibir distância — sem solicitar nova permissão:
// só usa se já concedida (ex.: pelo filtro por raio). Retorna [coords, setCoords] para que
// telas que obtêm um GPS fresco (feeds com filtro por raio) possam atualizar o valor.
export function useCoordsUsuario() {
  const [coords, setCoords] = useState(null)
  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync()
        if (status !== 'granted') return
        const loc = await Location.getLastKnownPositionAsync() ||
          await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        if (loc && ativo) setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      } catch (err) {
        console.log('[useCoordsUsuario] localização indisponível para distância | msg:', err.message)
      }
    })()
    return () => { ativo = false }
  }, [])
  return [coords, setCoords]
}
