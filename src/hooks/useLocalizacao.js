import { useState, useEffect, useRef } from 'react'
import * as Location from 'expo-location'

export const useLocalizacao = () => {
  const [coordenadas, setCoordenadas] = useState(null)
  const [permissao, setPermissao] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    const obterLocalizacao = async () => {
      setCarregando(true)
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        setPermissao(status)
        if (status === 'granted') {
          const local = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced
          })
          setCoordenadas({
            latitude: local.coords.latitude,
            longitude: local.coords.longitude
          })
        }
      } catch (err) {
        console.log('Erro ao obter localização:', err)
      } finally {
        setCarregando(false)
      }
    }
    obterLocalizacao()
  }, [tentativa])

  const reobter = () => setTentativa(t => t + 1)

  return { coordenadas, permissao, carregando, reobter }
}