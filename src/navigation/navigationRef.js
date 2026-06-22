import React from 'react'

// Ref compartilhada do NavigationContainer — extraída para evitar dependência
// circular entre AppNavigator e componentes que precisam navegar de fora da
// árvore de telas (ex.: CelebracaoMatchHost).
export const navigationRef = React.createRef()
