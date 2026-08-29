export const cores = {
  fundo:         '#0A0A0A',
  fundoCard:     '#111111',
  fundoInput:    '#111111',
  fundoElevado:  '#1A1A1A',
  borda:         '#222222',
  bordaFraca:    '#1A1A1A',

  primaria:      '#E8833A',  // laranja — cor principal
  primariaSuave: '#E8833A22',
  primariaBorda: '#E8833A44',

  // Azul da MARCA — o "P" do wordmark ProLar. Separado do `info` abaixo de propósito:
  // aquele é semântico (dica/destaque) e pode mudar sem mexer na marca. É o azul CLARO
  // do logo, não o navy do ícone, que somiria no #0A0A0A do fundo.
  marcaAzul:     '#4FB2FF',

  sucesso:       '#5DC98A',  // verde — valores e aprovações
  sucessoSuave:  '#5DC98A22',
  sucessoBorda:  '#5DC98A44',

  perigo:        '#E24B4A',
  perigoSuave:   '#E24B4A22',

  info:          '#3B82F6',  // azul — dicas/destaques informativos
  infoSuave:     '#3B82F622',
  infoBorda:     '#3B82F644',

  textoForte:    '#F0EDE6',
  textoMedio:    '#888888',
  textoFraco:    '#444444',
  textoMutado:   '#333333',

  branco:        '#FFFFFF',
  preto:         '#000000',
}

export const fontes = {
  regular:   'DM-Sans-Regular',
  medio:     'DM-Sans-Medium',
  titulo:    'Syne-Bold',
  tituloMed: 'Syne-SemiBold',
}

export const raios = {
  pequeno:  8,
  medio:    12,
  grande:   16,
  pill:     24,
}

export const espacos = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 28,
  tela: 20,
}

// Altura BASE da barra de abas — o inset inferior do aparelho é somado a ela em
// AppNavigator.js:584. Mora aqui, e não lá, porque deixou de ser medida só do navegador:
// um overlay ancorado ao rodapé precisa do mesmo número para parar EM CIMA da barra, e
// importá-lo do AppNavigator acoplaria o overlay à árvore de telas — o acoplamento que a
// extração do navigationRef existe para evitar.
export const alturas = {
  tabBar: 72,
  // Reserva para a BarraServicoEmAndamento, que flutua sobre o rodapé sem empurrar nada.
  // A barra não tem altura fixa (o conteúdo manda), então este é o pior caso medido: a
  // pílula "Abrir →" com 6 de padding em cima e embaixo sobre 12px de texto (~26) mais os
  // 10+10 da barra dá ~46, arredondado para 48.
  // Quem rola até o fim precisa alcançar o BOTÃO, não só enxergá-lo: sem esta folga o
  // "Encerrar serviço" ficava atrás da barra, e a única saída era não ter serviço em
  // andamento — exatamente quando o botão é necessário.
  barraServico: 48,
}

export const sombra = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.15,
  shadowRadius: 8,
  elevation: 4,
}

// Teto de largura para tablet: em telas de 10" o conteúdo de formulário/detalhe
// deixaria de ocupar a tela inteira e passa a centrar numa coluna de 520px. Entra
// como item extra no contentContainerStyle do ScrollView de topo; width: '100%'
// mantém o comportamento atual no celular (nunca é mais estreito que a tela).
export const LARGURA_MAXIMA = 520
export const larguraMaxima = { width: '100%', maxWidth: LARGURA_MAXIMA, alignSelf: 'center' }
