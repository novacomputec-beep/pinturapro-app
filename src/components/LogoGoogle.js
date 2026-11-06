import React from 'react'
import { Image } from 'react-native'

// O "G" oficial do Google em quatro cores (guia de marca do "Sign in with Google"), para o
// botão "Continuar com Google". PNG em 1x/2x/3x (assets/logo-google*.png, 20/40/60 px),
// rasterizado dos caminhos oficiais — sem módulo nativo de SVG.
export default function LogoGoogle({ size = 20 }) {
  return (
    <Image
      source={require('../../assets/logo-google.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel="Google"
    />
  )
}
