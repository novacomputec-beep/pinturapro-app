import React, { useState, useCallback, useEffect } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { cores, raios } from '../utils/tema'
import { useAuth } from '../contexts/AuthContext'

// Soft-ask de notificação: um pedido NOSSO, com contexto, ANTES do diálogo do SO.
// O Android 13+ dá DUAS tentativas: a primeira recusa mantém canAskAgain true (o SO
// ainda exibe a justificativa), e só a SEGUNDA torna o bloqueio permanente
// (canAskAgain false). Mesmo assim só disparamos o diálogo do SO se a pessoa disser
// "sim" aqui; "agora não" não chega ao SO e não gasta tentativa nenhuma.
//
// Combina os dois padrões existentes: host acionado por ref de módulo, como o
// celebracaoRef do CelebracaoMatchHost, e o corpo <Modal> do ModalAvaliacao.
export const softAskRef = { mostrar: null }

// Persistência do soft-ask num ÚNICO key JSON (mantém a convenção de keys inline do
// arquivo; blob em vez de 3 keys irmãos, para leitura/escrita atômica):
//   { concedido: bool, shows: number, ultimoShowMs: number }
// concedido:true é gravado só quando o SO REALMENTE concedeu → nunca mais mostra.
// "Sim" seguido de recusa (ou de um diálogo dispensado) NÃO grava nada: o slot não é
// queimado por uma permissão que a pessoa não tem, e o soft-ask segue elegível para as
// exibições que ainda restam.
// "Agora não" NÃO grava nada permanente: declinar não pode virar um one-shot nosso.
// O soft-ask volta, respeitando um intervalo mínimo e um teto de exibições —
// declinar NÃO gasta a tentativa do SO.
const CHAVE_SOFTASK = 'softask_notificacao_respondido'
const ESPERA_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias entre exibições
const MAX_SHOWS = 3                        // após 3 exibições declinadas, para de vez

const lerEstadoSoftAsk = async () => {
  try {
    const raw = await SecureStore.getItemAsync(CHAVE_SOFTASK)
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  return { concedido: false, shows: 0, ultimoShowMs: 0 }
}
const gravarEstadoSoftAsk = async (estado) => {
  try { await SecureStore.setItemAsync(CHAVE_SOFTASK, JSON.stringify(estado)) } catch (e) {}
}

// Copy por vertical — obra e reparo mantêm nomenclatura distinta neste projeto.
const VARIANTES = {
  dono_obra:   { corpo: 'Avisamos na hora em que um profissional demonstrar interesse na sua obra.' },
  dono_reparo: { corpo: 'Avisamos na hora em que um profissional demonstrar interesse no seu serviço.' },
  pintor:      { corpo: 'Avisamos assim que surgir uma nova obra perto de você.' },
  reparador:   { corpo: 'Avisamos assim que surgir um novo serviço perto de você.' },
}

const SoftAskNotificacao = () => {
  const { garantirPermissaoConcedida, registrarPushToken } = useAuth()
  const [variante, setVariante] = useState(null) // null = escondido

  // Check AO VIVO antes de exibir: só aparece para quem ainda pode conceder
  // (status !== 'granted' && canAskAgain === true) e que ainda não respondeu.
  // Caso contrário no-op silencioso — concedidos não precisam, bloqueados
  // (canAskAgain false) são cuidados pelo BannerNotificacaoBloqueada (Fase 3), e
  // quem já respondeu não é perguntado de novo.
  const mostrar = useCallback(async (v) => {
    if (Platform.OS !== 'android') return
    if (!VARIANTES[v]) return
    try {
      // Check ao vivo PRIMEIRO: concedidos e bloqueados (canAskAgain false) retornam
      // aqui, antes de contar ou exibir qualquer coisa — nunca consomem um slot.
      const { granted, canAskAgain } = await Notifications.getPermissionsAsync()
      if (granted || canAskAgain === false) return

      const estado = await lerEstadoSoftAsk()
      if (estado.concedido) return                                                   // já disse "sim"
      if (estado.shows >= MAX_SHOWS) return                                          // teto de exibições
      if (estado.shows > 0 && Date.now() - estado.ultimoShowMs < ESPERA_MS) return   // < 7 dias

      // Vai EXIBIR: conta o show AGORA (incrementa NO SHOW, não a cada mostrar()).
      await gravarEstadoSoftAsk({ ...estado, shows: estado.shows + 1, ultimoShowMs: Date.now() })
      setVariante(v)
    } catch (err) {
      // Falha no check não deve exibir nada.
    }
  }, [])

  // Expõe via ref de módulo (padrão do CelebracaoMatchHost).
  useEffect(() => { softAskRef.mostrar = mostrar }, [mostrar])

  const aoAtivar = async () => {
    setVariante(null)
    // garantirPermissaoConcedida é o ÚNICO ponto que dispara o diálogo do SO.
    const concedida = await garantirPermissaoConcedida()
    if (!concedida) return
    // Só DEPOIS de o SO conceder é que o soft-ask se cala para sempre. Antes isto era
    // gravado ANTES do diálogo, então quem tocasse "Sim" e recusasse no SO — ou apenas
    // dispensasse o diálogo — perdia o soft-ask de vez, sem ter permissão nenhuma: o
    // pedido com contexto sumia e sobrava só a linha do Perfil. Agora esse desfecho não
    // grava nada e as exibições restantes (o teto e o intervalo seguem intactos)
    // continuam valendo.
    //
    // A releitura do estado acontece aqui, DEPOIS do await, e não antes: no meio do
    // diálogo do SO um novo mostrar() pode ter incrementado shows/ultimoShowMs, e
    // reaproveitar um objeto lido antes desfaria essa contagem.
    const estado = await lerEstadoSoftAsk()
    await gravarEstadoSoftAsk({ ...estado, concedido: true })
    registrarPushToken()
  }

  const aoRecusar = async () => {
    setVariante(null)
    // NÃO grava flag permanente. O show já foi contado (com timestamp) no momento da
    // exibição; a próxima vez respeitará o intervalo de 7 dias e o teto de 3. Declinar
    // NÃO gasta a tentativa do SO — nada de permissão é chamado aqui.
  }

  if (!variante) return null

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={aoRecusar}>
      <View style={estilos.backdrop}>
        <View style={estilos.card}>
          <Text style={estilos.titulo}>Ative as notificações 🔔</Text>
          <Text style={estilos.corpo}>{VARIANTES[variante].corpo}</Text>

          <TouchableOpacity style={estilos.cta} onPress={aoAtivar} activeOpacity={0.85}>
            <Text style={estilos.ctaTexto}>Sim, ativar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={estilos.depois} onPress={aoRecusar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={estilos.depoisTexto}>Agora não</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:        { width: '100%', maxWidth: 380, backgroundColor: cores.fundoCard, borderRadius: 24, borderWidth: 1, borderColor: cores.primaria, padding: 28, alignItems: 'center' },
  titulo:      { fontSize: 22, fontWeight: '800', color: cores.primaria, textAlign: 'center', marginBottom: 10, letterSpacing: -0.3 },
  corpo:       { fontSize: 14, color: cores.textoMedio, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  cta:         { backgroundColor: cores.primaria, borderRadius: raios.grande, paddingVertical: 16, paddingHorizontal: 28, width: '100%', alignItems: 'center', marginBottom: 12 },
  ctaTexto:    { color: '#0A0A0A', fontSize: 16, fontWeight: '800' },
  depois:      { paddingVertical: 8 },
  depoisTexto: { color: cores.textoFraco, fontSize: 13 },
})

export default SoftAskNotificacao
