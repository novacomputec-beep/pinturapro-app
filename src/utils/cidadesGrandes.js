// Municípios brasileiros com MAIS DE 500 MIL habitantes no Censo 2022 do IBGE (41), como
// nome + UF. Único uso hoje: o texto da indicação pelo WhatsApp (utils/indicacao) — em cidade
// grande "em Belo Horizonte" diz pouco, então o bairro do pedido entra junto. Lista fixa de
// propósito: muda só a cada censo.
export const CIDADES_MAIS_500_MIL = [
  { cidade: 'São Paulo', uf: 'SP' },
  { cidade: 'Rio de Janeiro', uf: 'RJ' },
  { cidade: 'Brasília', uf: 'DF' },
  { cidade: 'Fortaleza', uf: 'CE' },
  { cidade: 'Salvador', uf: 'BA' },
  { cidade: 'Belo Horizonte', uf: 'MG' },
  { cidade: 'Manaus', uf: 'AM' },
  { cidade: 'Curitiba', uf: 'PR' },
  { cidade: 'Recife', uf: 'PE' },
  { cidade: 'Goiânia', uf: 'GO' },
  { cidade: 'Porto Alegre', uf: 'RS' },
  { cidade: 'Belém', uf: 'PA' },
  { cidade: 'Guarulhos', uf: 'SP' },
  { cidade: 'Campinas', uf: 'SP' },
  { cidade: 'São Luís', uf: 'MA' },
  { cidade: 'Maceió', uf: 'AL' },
  { cidade: 'Campo Grande', uf: 'MS' },
  { cidade: 'São Gonçalo', uf: 'RJ' },
  { cidade: 'Teresina', uf: 'PI' },
  { cidade: 'João Pessoa', uf: 'PB' },
  { cidade: 'São Bernardo do Campo', uf: 'SP' },
  { cidade: 'Duque de Caxias', uf: 'RJ' },
  { cidade: 'Nova Iguaçu', uf: 'RJ' },
  { cidade: 'Natal', uf: 'RN' },
  { cidade: 'Santo André', uf: 'SP' },
  { cidade: 'Osasco', uf: 'SP' },
  { cidade: 'Sorocaba', uf: 'SP' },
  { cidade: 'Uberlândia', uf: 'MG' },
  { cidade: 'Ribeirão Preto', uf: 'SP' },
  { cidade: 'São José dos Campos', uf: 'SP' },
  { cidade: 'Cuiabá', uf: 'MT' },
  { cidade: 'Jaboatão dos Guararapes', uf: 'PE' },
  { cidade: 'Contagem', uf: 'MG' },
  { cidade: 'Joinville', uf: 'SC' },
  { cidade: 'Feira de Santana', uf: 'BA' },
  { cidade: 'Aracaju', uf: 'SE' },
  { cidade: 'Londrina', uf: 'PR' },
  { cidade: 'Juiz de Fora', uf: 'MG' },
  { cidade: 'Florianópolis', uf: 'SC' },
  { cidade: 'Aparecida de Goiânia', uf: 'GO' },
  { cidade: 'Serra', uf: 'ES' },
]

// Sem acento, sem caixa, espaços colapsados: "BELO  horizonte" e "Belo Horizonte" casam.
const chave = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
const CHAVES = new Set(CIDADES_MAIS_500_MIL.map((c) => `${chave(c.cidade)}|${chave(c.uf)}`))

// Nome E UF precisam casar: há homônimos pequenos (Santo André/PB, Belém/PB, Campo Grande/AL).
// Pedido sem UF não casa — cai no texto só com a cidade.
export const ehCidadeMais500Mil = (cidade, uf) => CHAVES.has(`${chave(cidade)}|${chave(uf)}`)

// Lugar do pedido no texto da indicação:
//   cidade grande + bairro → "no bairro <bairro>, em <cidade>"
//   demais                 → "em <cidade>" (sem cidade no pedido, a do profissional)
//   sem cidade nenhuma     → '' (a parte do lugar sai; nunca um país, nunca o bairro sozinho —
//                            há bairro chamado "Brasil" em Patos de Minas)
const limpo = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
export const lugarDaIndicacao = ({ bairro, cidade, uf, cidadeUsuario }) => {
  const c = limpo(cidade)
  if (!c) {
    const cu = limpo(cidadeUsuario)
    return cu ? `em ${cu}` : ''
  }
  const b = limpo(bairro)
  return b && ehCidadeMais500Mil(c, uf) ? `no bairro ${b}, em ${c}` : `em ${c}`
}
