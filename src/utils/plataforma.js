import { Platform } from 'react-native'

// Regras de loja que mudam o que a tela MOSTRA, decididas num lugar só.
//
// Apple, diretriz 3.1.1: um app iOS não pode exibir preço de assinatura digital, não pode
// levar a um checkout externo e não pode dizer onde pagar. A cobrança do profissional é
// via PagBank, fora do app, e isso fica como está no Android — no iOS as telas escondem a
// parte comercial e mostram só a frase abaixo. As telas leem ESTE flag, e não Platform.OS,
// para a regra ter um dono: quando a Apple mudar (ou entrar IAP), muda-se aqui.
//
// A lógica de assinatura (estado, chamadas à API, gate de acesso) NÃO passa por aqui —
// isto governa apresentação, não direito de acesso.
export const mostrarCobranca = Platform.OS !== 'ios'

// Frase ÚNICA que substitui qualquer CTA de pagamento no iOS. Sem URL, sem preço, sem
// marca, sem botão — é o máximo que a 3.1.1 permite dizer.
export const FRASE_ASSINATURA_EXTERNA = 'Sua assinatura é gerenciada fora do aplicativo.'
