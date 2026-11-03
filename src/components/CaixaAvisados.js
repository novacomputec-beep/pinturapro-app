import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { cores, raios } from '../utils/tema'

// Arte-Avisados: o dono de um pedido ABERTO e SEM match vê quantos profissionais da área
// foram avisados do pedido (demanda.profissionais_avisados). Três estados, decididos por
// modoAvisados a partir dos interessados e da idade do pedido:
//   'novo'  — sem interessados, menos de 24h desde criado_em: caixa azul 📣, "eles costumam
//             responder ao longo do dia";
//   'dica'  — sem interessados, 24h ou mais: caixa laranja 💡 com os atalhos "Aumentar
//             valor" / "Aumentar tempo" (os fluxos de sempre da tela) e "Manter meu valor",
//             que dispensa a dica DESTE pedido (marca local, por id) e devolve a caixa azul;
//   'linha' — com interessados: uma linha pequena "📣 N profissionais avisados" dentro do
//             card da demanda (LinhaAvisados), sem caixa.
// O número só aparece quando é de dez para cima: abaixo disso (ou ausente) o texto sai sem
// ele — "Profissionais da sua área foram avisados" —, porque "3 profissionais avisados"
// desanima em vez de tranquilizar.

export const MIN_AVISADOS_COM_NUMERO = 10
const H24 = 24 * 3600000

// N pronto para exibir, ou null quando é para omitir (ausente, ilegível ou abaixo do piso).
export const numeroAvisados = (valor) => {
  const n = Number(valor)
  return Number.isFinite(n) && n >= MIN_AVISADOS_COM_NUMERO ? Math.floor(n) : null
}

// Qual dos três estados vale — ou null quando a arte não se aplica (pedido não aberto,
// com match). dicaMantida null é "ainda não li a marca": cai na azul, que não tem ação
// nenhuma, para a laranja nunca piscar para quem já a dispensou. criado_em ilegível
// conta como recente: sem saber a idade, a caixa que pede paciência é a mais segura.
export const modoAvisados = ({ aberta, interessados, criadoEm, agora, dicaMantida }) => {
  if (!aberta) return null
  if (interessados > 0) return 'linha'
  const criado = criadoEm ? new Date(criadoEm).getTime() : NaN
  const passou24h = Number.isFinite(criado) && agora - criado >= H24
  if (!passou24h || dicaMantida !== false) return 'novo'
  return 'dica'
}

// Marca local do "Manter meu valor", por frente e id da demanda (mesma disciplina do
// ConviteCadastroServicos: a gravação é best-effort, falhar só faz a dica voltar).
const CHAVE = 'dica_avisados_mantida'
const chave = (frente, id) => `${CHAVE}:${frente}:${id}`

export const useDicaAvisadosMantida = (frente, id) => {
  const [mantida, setMantida] = useState(null)
  useEffect(() => {
    let vivo = true
    setMantida(null)
    if (id == null) return undefined
    AsyncStorage.getItem(chave(frente, id))
      .then((raw) => { if (vivo) setMantida(raw === '1') })
      .catch(() => { if (vivo) setMantida(false) })
    return () => { vivo = false }
  }, [frente, id])
  const manter = useCallback(() => {
    setMantida(true)
    if (id == null) return
    AsyncStorage.setItem(chave(frente, id), '1').catch(() => {})
  }, [frente, id])
  return [mantida, manter]
}

// Linha pequena para dentro do card da demanda (estado 'linha'). `solta` é para quando o
// card de valor não existe (pedido sem valor): sai como linha avulsa abaixo do título.
export function LinhaAvisados({ avisados, solta }) {
  const n = numeroAvisados(avisados)
  return (
    <Text style={[estilos.linha, solta && estilos.linhaSolta]}>
      📣 {n != null ? `${n} profissionais avisados` : 'Profissionais da sua área foram avisados'}
    </Text>
  )
}

export function CaixaAvisados({ modo, avisados, onAumentarValor, onAumentarTempo, podeAumentarValor = true, podeAumentarTempo = true, onManter }) {
  const n = numeroAvisados(avisados)
  const dica = modo === 'dica'
  const cor = dica ? cores.primaria : cores.info
  return (
    <View style={[estilos.caixa, dica ? estilos.caixaDica : estilos.caixaNovo]}>
      <View style={estilos.topo}>
        <Text style={estilos.icone}>{dica ? '💡' : '📣'}</Text>
        <View style={{ flex: 1 }}>
          {n != null && <Text style={[estilos.numero, { color: cor }]}>{n}</Text>}
          <Text style={[estilos.titulo, { color: cor }]}>
            {dica
              ? (n != null ? 'profissionais avisados, ainda sem propostas' : 'Profissionais avisados, ainda sem propostas')
              : (n != null ? 'profissionais da sua área já foram avisados' : 'Profissionais da sua área foram avisados')}
          </Text>
        </View>
      </View>
      <Text style={estilos.texto}>
        {dica
          ? 'Aqui quem define o preço é você. Pedidos com valor um pouco maior costumam atrair mais profissionais, mas você também pode dar mais tempo ou manter como está.'
          : 'Eles costumam responder ao longo do dia. Você recebe um aviso a cada novo interessado.'}
      </Text>
      {dica && (
        <>
          <View style={estilos.acoes}>
            <TouchableOpacity
              style={[estilos.btnAcao, !podeAumentarValor && estilos.desabilitado]}
              onPress={onAumentarValor}
              disabled={!podeAumentarValor}
              activeOpacity={0.8}
            >
              <Text style={estilos.btnAcaoTexto}>Aumentar valor</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[estilos.btnAcao, !podeAumentarTempo && estilos.desabilitado]}
              onPress={onAumentarTempo}
              disabled={!podeAumentarTempo}
              activeOpacity={0.8}
            >
              <Text style={estilos.btnAcaoTexto}>Aumentar tempo</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={estilos.btnManter} onPress={onManter} activeOpacity={0.8}>
            <Text style={estilos.btnManterTexto}>Manter meu valor</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  caixa: { borderWidth: 1, borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  caixaNovo: { backgroundColor: cores.infoSuave, borderColor: cores.infoBorda },
  caixaDica: { backgroundColor: cores.primariaSuave, borderColor: cores.primariaBorda },
  topo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  icone: { fontSize: 28, lineHeight: 34 },
  numero: { fontSize: 32, fontWeight: '800', lineHeight: 36, letterSpacing: -0.5 },
  titulo: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  texto: { fontSize: 13, color: cores.textoMedio, lineHeight: 19 },
  acoes: { flexDirection: 'row', gap: 10, marginTop: 14 },
  // Mesma pílula dos botões "Aumentar tempo"/"Aumentar o valor" da tela de detalhe.
  btnAcao: { flex: 1, backgroundColor: '#2a2200', borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.medio, paddingVertical: 12, alignItems: 'center' },
  btnAcaoTexto: { fontSize: 13, fontWeight: '700', color: cores.primaria },
  desabilitado: { opacity: 0.5 },
  btnManter: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  btnManterTexto: { fontSize: 13, fontWeight: '600', color: cores.textoMedio },
  // Dentro do card verde de valor: mesma régua da nota "Pagamento acertado…".
  linha: { fontSize: 11, color: cores.sucesso, fontWeight: '600', lineHeight: 16, marginTop: 6 },
  linhaSolta: { marginTop: 0, marginBottom: 12 },
})
