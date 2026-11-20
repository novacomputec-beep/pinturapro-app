import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Modal, TouchableOpacity, StyleSheet, Alert, Animated } from 'react-native'
import { cores, raios } from '../utils/tema'
import { useSelecaoMidia, useUploadMidiaDemanda } from '../utils/midia'
import useArrastarParaFechar, { ZonaArraste, RaizGestosFolha } from '../hooks/useArrastarParaFechar'
import { LinhaCabecalhoFolha } from './BotaoFecharFolha'

// Adicionar foto/vídeo a um pedido JÁ PUBLICADO (detalhe do dono, reparo e obra). Reusa o
// MESMO picker e o MESMO upload do cadastro (utils/midia: useSelecaoMidia +
// useUploadMidiaDemanda) — mesmos limites (foto quality 0.6, vídeo de até 30 s, câmera e
// galeria). A diferença para o cadastro é só o momento do registro: lá ele espera o
// "Publicar"; aqui o pedido já existe, então assim que os arquivos escolhidos terminam de
// subir eles são registrados e a tela relê o detalhe (aoConcluir).
//
//   vertical   — 'reparo' | 'obra' (config do hook de upload).
//   demandaId  — id do pedido.
//   midias     — as mídias atuais do detalhe: a ORDEM das novas continua depois da maior
//                existente. O registro é idempotente por (id, ordem) — repetir uma ordem
//                SUBSTITUIRIA a mídia que já está lá.
//   aoConcluir — relê o detalhe (chamado depois do registro, com ou sem falha).
// Devolve { abrir, enviando, rotuloEnvio, folha }: `folha` é o Modal do picker, para a tela
// renderizar uma vez.
export function useAdicionarMidiaDemanda({ vertical, demandaId, midias, aoConcluir, logPrefix }) {
  const montadoRef = useRef(true)
  useEffect(() => () => { montadoRef.current = false }, [])
  const [picker, setPicker] = useState(false)
  const midia = useUploadMidiaDemanda({ vertical, montadoRef, logPrefix, avisarProntas: false })
  // Só aceita o que ESTA tela pediu: o useSelecaoMidia também entrega resultados "perdidos"
  // do picker (Activity destruída no Android), que podem ter nascido no cadastro de outro
  // pedido — e aqui o que chega é registrado na hora, sem um "Publicar" no meio.
  const lancadoRef = useRef(false)
  const receber = (entrada) => {
    if (!lancadoRef.current) return
    lancadoRef.current = false
    midia.adicionar(entrada)
  }
  const { usarCameraFoto, usarCameraVideo, usarGaleria } = useSelecaoMidia({ logPrefix, montadoRef, setMidias: receber })
  const escolher = (fn) => {
    setPicker(false)
    // Mesma folga do cadastro: o Modal precisa terminar de fechar antes da câmera/galeria.
    setTimeout(() => { lancadoRef.current = true; fn() }, 500)
  }

  const midiasRef = useRef(midias)
  midiasRef.current = midias
  const aoConcluirRef = useRef(aoConcluir)
  aoConcluirRef.current = aoConcluir
  const registrandoRef = useRef(false)

  // Todos os escolhidos já subiram (ou falharam): registra no pedido, limpa e relê o detalhe.
  useEffect(() => {
    const itens = midia.itens
    if (itens.length === 0 || registrandoRef.current) return
    if (itens.some(i => i.status === 'pendente' || i.status === 'enviando')) return
    registrandoRef.current = true
    const atuais = Array.isArray(midiasRef.current) ? midiasRef.current : []
    const base = Math.max(atuais.length, ...atuais.map(m => Number(m?.ordem) || 0))
    const lista = itens.map((item, i) => ({ ...item, ordem: base + i + 1 }))
    ;(async () => {
      let falhas = lista
      try { falhas = await midia.publicarMidias(demandaId, lista) } catch (err) {
        console.log(`${logPrefix} falha ao registrar mídias | msg:`, err?.message)
      }
      registrandoRef.current = false
      if (!montadoRef.current) return
      midia.resetar()
      if (falhas.length > 0) {
        // 409 da API (pedido que já não aceita mídia): a mensagem é a dela.
        const recusa = falhas.find(f => f.erroStatus === 409 && f.erroMensagem)
        if (recusa) Alert.alert('Não foi possível adicionar', recusa.erroMensagem)
        else {
          const temVideo = falhas.some(f => f.tipo === 'video')
          Alert.alert('Não foi possível enviar',
            `${falhas.length === lista.length ? 'As mídias não foram enviadas' : `${falhas.length} mídia(s) não foram enviadas`}. Tente novamente.` +
            (temVideo ? '\n\n📹 Vídeos grandes podem falhar em conexões lentas — tente novamente em Wi-Fi ou grave um vídeo mais curto.' : ''))
        }
      }
      aoConcluirRef.current?.()
    })()
    // midia.publicarMidias/resetar acompanham `itens`; o efeito reage só à lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midia.itens, demandaId])

  const total = midia.itens.length
  const enviando = total > 0
  const prontas = midia.itens.filter(i => i.status === 'enviada' || i.status === 'falha').length
  const rotuloEnvio = enviando ? `📤 Enviando ${Math.min(prontas + 1, total)} de ${total}…` : null

  const fechar = () => setPicker(false)
  const arraste = useArrastarParaFechar(fechar, picker)
  // O MESMO picker do cadastro: as três opções de sempre.
  const folha = (
    <Modal visible={picker} transparent animationType="slide" onRequestClose={fechar}>
      <RaizGestosFolha>
      <TouchableOpacity style={estilos.modalOverlay} activeOpacity={1} onPress={fechar}>
        <Animated.View style={[estilos.modalSheet, arraste.estiloArraste]} onLayout={arraste.medirFolha}>
          <ZonaArraste gesto={arraste.gesto}>
            <LinhaCabecalhoFolha onFechar={fechar}>
              <Text style={estilos.modalTitulo}>Adicionar mídia</Text>
            </LinhaCabecalhoFolha>
          </ZonaArraste>
          <TouchableOpacity style={estilos.modalOpcao} onPress={() => escolher(usarCameraFoto)}>
            <Text style={estilos.modalOpcaoTexto}>📷 Câmera — Foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.modalOpcao} onPress={() => escolher(usarCameraVideo)}>
            <Text style={estilos.modalOpcaoTexto}>🎬 Câmera — Vídeo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={estilos.modalOpcao} onPress={() => escolher(usarGaleria)}>
            <Text style={estilos.modalOpcaoTexto}>🖼️ Galeria</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[estilos.modalOpcao, { marginTop: 8 }]} onPress={fechar}>
            <Text style={[estilos.modalOpcaoTexto, { color: cores.textoFraco }]}>Cancelar</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
      </RaizGestosFolha>
    </Modal>
  )

  return { abrir: () => { if (!enviando) setPicker(true) }, enviando, rotuloEnvio, folha }
}

// Card azul "💡 Dica: adicione uma foto ou vídeo": pedido SEM mídia que já recebeu pergunta.
export const CardDicaAdicionarMidia = ({ onAdicionar, enviando, rotuloEnvio }) => (
  <View style={estilos.dica}>
    <Text style={estilos.dicaTitulo}>💡 Dica: adicione uma foto ou vídeo</Text>
    <Text style={estilos.dicaTexto}>Com uma foto ou vídeo, os profissionais entendem o serviço e mandam o preço certo mais rápido.</Text>
    <TouchableOpacity style={[estilos.dicaBotao, enviando && { opacity: 0.6 }]} onPress={onAdicionar} disabled={enviando} activeOpacity={0.85} accessibilityRole="button">
      <Text style={estilos.dicaBotaoTexto} maxFontSizeMultiplier={1.4}>{enviando ? rotuloEnvio : '📷 Adicionar foto ou vídeo'}</Text>
    </TouchableOpacity>
  </View>
)

// Tile tracejado laranja "＋ Adicionar foto ou vídeo", depois das miniaturas. `estilo` = o
// midiaItem da tela (mesmo tamanho dos tiles vizinhos).
export const TileAdicionarMidia = ({ onPress, enviando, rotuloEnvio, estilo }) => (
  <TouchableOpacity style={[estilo, estilos.tile, enviando && { opacity: 0.6 }]} onPress={onPress} disabled={enviando} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Adicionar foto ou vídeo">
    <Text style={estilos.tileTexto} maxFontSizeMultiplier={1.3}>{enviando ? rotuloEnvio : '＋ Adicionar foto ou vídeo'}</Text>
  </TouchableOpacity>
)

const estilos = StyleSheet.create({
  // Picker: os mesmos estilos do picker do cadastro (CadastrarReparoScreen/CadastrarObraScreen).
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: cores.fundoCard, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitulo: { fontSize: 16, fontWeight: '700', color: cores.textoForte, marginBottom: 16, textAlign: 'center' },
  modalOpcao: { backgroundColor: cores.fundoElevado, borderRadius: raios.medio, padding: 16, alignItems: 'center', marginBottom: 8 },
  modalOpcaoTexto: { fontSize: 15, color: cores.textoForte, fontWeight: '500' },
  dica: { backgroundColor: cores.infoSuave, borderWidth: 1, borderColor: cores.infoBorda, borderRadius: raios.medio, padding: 14, marginBottom: 20, gap: 6 },
  dicaTitulo: { fontSize: 14, fontWeight: '700', color: cores.info },
  dicaTexto: { fontSize: 13, color: cores.textoForte, lineHeight: 19 },
  dicaBotao: { backgroundColor: cores.info, borderRadius: raios.medio, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  dicaBotaoTexto: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  tile: { borderWidth: 1.5, borderColor: cores.primaria, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: 6, marginRight: 0 },
  tileTexto: { fontSize: 12, fontWeight: '700', color: cores.primaria, textAlign: 'center', lineHeight: 16 },
})
