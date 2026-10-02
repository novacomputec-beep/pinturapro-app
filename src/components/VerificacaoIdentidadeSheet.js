import React, { useState, useEffect, useRef } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Pressable, AppState, KeyboardAvoidingView, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BotaoPrimario, BotaoSecundario, Input } from './index'
import api, { authService } from '../services/api'
import { comRetry } from '../utils/rede'
import { mascararTelefone } from '../utils/telefone'
import { recuperarMidiasPendentes } from '../utils/midia'
import { useAuth } from '../contexts/AuthContext'
import { cores, raios, espacos, larguraMaxima } from '../utils/tema'

// Verificação de identidade NA PRIMEIRA PROPOSTA. As três fotos (documento frente, verso
// e selfie), a chave PIX e as referências saíram do cadastro: o prestador entra, vê o feed e só é chamado a se
// identificar quando vai enviar a primeira proposta/interesse. Este arquivo concentra o
// que era do passo 4 do CadastroScreen (seletor de foto + upload) e o portão usado pelas
// telas de detalhe.

// Sobe a mídia direto ao Cloudinary com retry resiliente e SILENCIOSO.
// Até 3 tentativas (1 + MAX_UPLOAD_RETRIES) com backoff exponencial + jitter,
// cobrindo falhas de transporte (onerror/ontimeout) E respostas de erro HTTP do
// Cloudinary (4xx/5xx com corpo { error }). Só rejeita após esgotar todas.
const MAX_UPLOAD_RETRIES = 2
const UPLOAD_TIMEOUT = 45000

// true  = tenta o NOSSO endpoint (POST /upload/midia) e, se falhar, cai no direto-Cloudinary.
// false = usa só o direto-Cloudinary (revert instantâneo, sem rebuild).
const USAR_UPLOAD_ENDPOINT = true
const backoffUpload = (n) => Math.min(1000 * Math.pow(2, n) + Math.random() * 1000, 15000)
const xhrUpload = (url, form) => new Promise((resolve, reject) => {
  const attempt = (n) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.timeout = UPLOAD_TIMEOUT
    const retryOu = (rejeitar) => { if (n < MAX_UPLOAD_RETRIES) setTimeout(() => attempt(n + 1), backoffUpload(n)); else rejeitar() }
    xhr.onload = () => {
      let parsed = null
      try { parsed = JSON.parse(xhr.responseText) }
      catch (e) {
        console.log('[xhrUpload] falha ao parsear resposta JSON | tentativa:', n, '| status:', xhr.status)
        return retryOu(() => reject(new Error('Resposta inválida do servidor de upload')))
      }
      // Cloudinary devolve 4xx/5xx com corpo { error: {...} }; trata como falha retentável
      if (xhr.status >= 400 || parsed?.error) {
        console.log('[xhrUpload] erro HTTP do Cloudinary | tentativa:', n, '| status:', xhr.status, '| msg:', parsed?.error?.message)
        return retryOu(() => reject(new Error(parsed?.error?.message || `Erro ${xhr.status} no upload da mídia`)))
      }
      resolve(parsed)
    }
    xhr.onerror   = () => retryOu(() => reject(new Error('Falha na conexão com o servidor de upload')))
    xhr.ontimeout = () => retryOu(() => reject(new Error('Tempo esgotado no upload da mídia')))
    xhr.send(form)
  }
  attempt(0)
})

const uploadDiretoCloudinary = async (uri, tipo) => {
  const params = await comRetry(() => api.get('/upload/assinatura-publica'), { timeout: true, servidor: true })
  const cloudForm = new FormData()
  cloudForm.append('file', { uri, type: 'image/jpeg', name: `${tipo}.jpg` })
  cloudForm.append('timestamp', String(params.timestamp))
  cloudForm.append('signature', params.signature)
  cloudForm.append('api_key', params.api_key)
  cloudForm.append('folder', params.folder)
  // O Cloudinary recalcula a assinatura sobre TUDO que o cliente manda (menos file/
  // api_key), então cada parâmetro extra só pode ir se o servidor o assinou — e a
  // presença dele na resposta é o único sinal disso.
  if (params.allowed_formats != null) cloudForm.append('allowed_formats', String(params.allowed_formats))
  if (params.max_file_size != null) cloudForm.append('max_file_size', String(params.max_file_size))
  const cloudData = await xhrUpload(`https://api.cloudinary.com/v1_1/${params.cloud_name}/image/upload`, cloudForm)
  if (cloudData.error || !cloudData.secure_url) throw new Error(cloudData.error?.message || `Erro no upload de ${tipo}`)
  return cloudData.secure_url
}

const uploadViaEndpoint = async (uri, tipo) => {
  const form = new FormData()
  form.append('arquivo', { uri, type: 'image/jpeg', name: `${tipo}.jpg` })
  const resp = await api.uploadMidiaPublica(form)
  if (!resp?.secure_url) throw new Error(resp?.erro || `Resposta sem secure_url no upload de ${tipo}`)
  return resp.secure_url
}

// Tenta o endpoint e, em QUALQUER falha, cai no método direto-Cloudinary — nunca pior
// que antes. Só rejeita se AMBOS falharem.
const uploadFotoVerificacao = async (uri, tipo) => {
  if (!USAR_UPLOAD_ENDPOINT) return uploadDiretoCloudinary(uri, tipo)
  try {
    return await uploadViaEndpoint(uri, tipo)
  } catch (errEndpoint) {
    console.log(`[Verificacao] endpoint /upload/midia falhou p/ ${tipo} — fallback direto-Cloudinary | msg:`, errEndpoint?.message)
    return uploadDiretoCloudinary(uri, tipo)
  }
}

const OPCOES_FOTO = { allowsEditing: true, aspect: [4, 3], quality: 0.6, maxWidth: 1200, maxHeight: 1200 }

const SLOTS = [
  { tipo: 'doc_frente', campo: 'verificacao_doc_frente_url', icone: '📷', rotulo: 'Documento\nfrente' },
  { tipo: 'doc_verso',  campo: 'verificacao_doc_verso_url',  icone: '📷', rotulo: 'Documento\nverso' },
  { tipo: 'selfie',     campo: 'verificacao_selfie_url',     icone: '🤳', rotulo: 'Selfie com o documento' },
]

const MSG_EM_ANALISE = 'Seus documentos estão em análise. Assim que aprovarmos, você recebe um aviso e já pode enviar sua proposta.'

// Reprovado não reabre a sheet: reenviar as mesmas fotos não resolve. Quem fala é o
// servidor (mensagem dele quando houver), e o caminho é o suporte.
const alertarReprovado = (mensagem) => Alert.alert(
  'Verificação não aprovada',
  `${mensagem || 'Sua verificação de identidade não foi aprovada.'}\n\nFale com o suporte.`
)

// Portão da proposta/interesse. `liberada()` vai ANTES do POST: abre a sheet para quem
// nunca enviou documentos ('nao_solicitada'), avisa quem está em análise ('pendente') e
// libera qualquer outro status — inclusive ausente, que é o de quem se cadastrou com as
// fotos. `tratouErro(err)` é a rede de segurança para o 403 VERIFICACAO_NECESSARIA: o
// servidor é a fonte da verdade, e o usuario local pode estar velho.
// O perfil é relido sem revalidarSessao de propósito: aqui só interessa o status da
// verificação, sem reavaliar boas-vindas nem reagendar o registro de push.
const SEM_RESPOSTA = Symbol('sem_resposta')

export const useVerificacaoIdentidade = () => {
  const { usuario, setUsuario } = useAuth()
  const [aberta, setAberta] = useState(false)

  // `seFalhar`: o que devolver quando o GET /auth/perfil não responde. Por omissão, o
  // status em cache.
  const statusAtualizado = async (seFalhar = usuario?.verificacao_status) => {
    try {
      const perfil = await comRetry(() => authService.perfil())
      const status = perfil?.usuario?.verificacao_status
      if (status) setUsuario(prev => (prev ? { ...prev, verificacao_status: status } : prev))
      return status
    } catch (err) {
      console.log('[Verificacao] falha ao reler o perfil | status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem)
      return seFalhar
    }
  }

  const liberada = async () => {
    let status = usuario?.verificacao_status
    // 'pendente'/'reprovado' podem já ter mudado no servidor desde o último perfil.
    if (status === 'pendente' || status === 'reprovado') status = await statusAtualizado()
    // Cache sem status (sessão anterior a este campo): quem decide é o perfil FRESCO, que
    // também fica salvo no usuario local — assim quem já está aprovado nunca vê a sheet.
    // Se o perfil não respondeu, não dá para afirmar nada: libera, e o servidor decide
    // (o 403 VERIFICACAO_NECESSARIA cai no tratouErro).
    else if (status == null) {
      status = await statusAtualizado(SEM_RESPOSTA)
      if (status === SEM_RESPOSTA) return true
    }
    // Só quando a API também não devolve status vale como 'nao_solicitada'.
    if (status == null || status === 'nao_solicitada') { setAberta(true); return false }
    if (status === 'pendente') { Alert.alert('Verificação em análise', MSG_EM_ANALISE); return false }
    if (status === 'reprovado') { alertarReprovado(); return false }
    return true
  }

  const tratouErro = async (err) => {
    if (err?.status !== 403 || err?.codigo !== 'VERIFICACAO_NECESSARIA') return false
    const status = await statusAtualizado()
    if (status === 'pendente') Alert.alert('Verificação em análise', MSG_EM_ANALISE)
    else if (status === 'reprovado') alertarReprovado(err?.mensagem)
    else setAberta(true)
    return true
  }

  return { aberta, fechar: () => setAberta(false), liberada, tratouErro }
}

const SlotFoto = ({ slot, estado, largo, onPress }) => {
  const enviada = !!estado.url
  return (
    <TouchableOpacity
      style={[estilos.slot, largo && estilos.slotLargo, enviada && estilos.slotEnviado, estado.erro && estilos.slotErro]}
      onPress={onPress}
      disabled={estado.uploadando}
      activeOpacity={0.8}
    >
      {estado.uploadando ? (
        <ActivityIndicator color={cores.primaria} />
      ) : (
        <Text style={[estilos.slotIcone, enviada && { color: cores.sucesso }]}>{enviada ? '✓' : estado.erro ? '⚠' : slot.icone}</Text>
      )}
      <Text style={[estilos.slotRotulo, enviada && { color: cores.sucesso }]}>{slot.rotulo}</Text>
      {estado.uploadando ? <Text style={estilos.slotStatus}>Enviando…</Text>
        : estado.erro ? <Text style={[estilos.slotStatus, { color: cores.perigo }]}>Falha no envio — tentar novamente</Text>
        : null}
    </TouchableOpacity>
  )
}

const SLOT_VAZIO = { uri: null, url: null, uploadando: false, erro: false }

// Espera pela aprovação depois do envio: relê o perfil a cada 4 s, por até 60 s.
const INTERVALO_CONFERENCIA_MS = 4000
const LIMITE_CONFERENCIA_MS = 60000

// `onConcluido`: "Voltar aos serviços". `onAprovado`: "Enviar minha proposta" — a tela
// que abriu a sheet retoma ali a proposta/interesse que o usuário tinha começado.
export default function VerificacaoIdentidadeSheet({ visivel, onFechar, onConcluido, onAprovado }) {
  const { setUsuario } = useAuth()
  const insets = useSafeAreaInsets()
  const montadoRef = useRef(true)
  const [fotos, setFotos] = useState({ doc_frente: SLOT_VAZIO, doc_verso: SLOT_VAZIO, selfie: SLOT_VAZIO })
  const [pixReembolso, setPixReembolso] = useState('')
  const [ref1Nome, setRef1Nome] = useState('')
  const [ref1Tel, setRef1Tel] = useState('')
  const [ref2Nome, setRef2Nome] = useState('')
  const [ref2Tel, setRef2Tel] = useState('')
  const [erros, setErros] = useState({})
  const [enviando, setEnviando] = useState(false)
  // 'form' → 'conferindo' → 'aprovado' | 'reprovado' | 'demorou'
  const [fase, setFase] = useState('form')
  // Slot de foto em captura (frente/verso/selfie): a recuperação pós-destruição da
  // Activity (getPendingResultAsync) usa isto para rotear a foto perdida ao slot certo.
  const slotFotoPendenteRef = useRef(null)

  useEffect(() => () => { montadoRef.current = false }, [])

  const atualizar = (tipo, parcial) => {
    if (montadoRef.current) setFotos(f => ({ ...f, [tipo]: { ...f[tipo], ...parcial } }))
  }

  // Sobe assim que a foto é escolhida: ao tocar em "Enviar para verificação" as URLs
  // já estão prontas, e a falha aparece no próprio slot, com retry por toque.
  const subir = async (tipo, uri) => {
    atualizar(tipo, { uri, url: null, uploadando: true, erro: false })
    try {
      const url = await uploadFotoVerificacao(uri, tipo)
      atualizar(tipo, { url, uploadando: false })
    } catch (err) {
      console.log(`[Verificacao] upload falhou (endpoint + fallback) p/ ${tipo} | msg:`, err?.message)
      atualizar(tipo, { uploadando: false, erro: true })
    }
  }

  // Recuperação pós-destruição da Activity (Android sob pressão de memória): se a
  // câmera/galeria foi morta durante a captura, o expo-image-picker guarda o resultado
  // e o entrega via getPendingResultAsync. Reusa a MESMA lógica da criação de obra/reparo
  // (src/utils/midia.js, sem duplicar), roteando a foto recuperada ao slot em captura.
  useEffect(() => {
    const aoReceber = (assets) => {
      const uri = assets?.[0]?.uri
      const tipo = slotFotoPendenteRef.current
      if (!uri || !tipo || !montadoRef.current) return
      slotFotoPendenteRef.current = null
      subir(tipo, uri)
    }
    recuperarMidiasPendentes({ logPrefix: '[Verificacao]', montadoRef, aoReceber })
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recuperarMidiasPendentes({ logPrefix: '[Verificacao]', montadoRef, aoReceber })
    })
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selecionarFoto = (tipo) => {
    // Distingue um cancelamento involuntário (retorno quase instantâneo, sem asset —
    // Activity morta por falta de memória) de um cancelamento real do usuário.
    const lancar = async (origem, abrir) => {
      slotFotoPendenteRef.current = tipo
      const t0 = Date.now()
      try {
        const resultado = await abrir()
        if (!resultado.canceled && resultado.assets?.length) {
          subir(tipo, resultado.assets[0].uri)
        } else if (resultado.canceled && Date.now() - t0 < 1000) {
          Alert.alert('Não foi possível abrir', 'O app pode estar com pouca memória neste momento. Se as fotos pararem de abrir, feche o aplicativo completamente e abra de novo.')
        }
      } catch (err) {
        console.log(`[Verificacao] launch ${origem} (${tipo}) rejeitou | msg:`, err?.message)
        Alert.alert('Não foi possível abrir', 'Tente novamente. Se o problema continuar, feche o aplicativo completamente e abra de novo.')
      } finally {
        // Só limpa se a promessa retornou de fato; se a Activity foi morta, ela nunca
        // resolve e o ref permanece p/ a recuperação via getPendingResultAsync.
        slotFotoPendenteRef.current = null
      }
    }
    Alert.alert('Adicionar foto', 'Como deseja adicionar a foto?', [
      {
        text: '📷 Tirar foto agora',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permissão necessária', 'Precisamos de acesso à câmera.')
            return
          }
          lancar('camera', () => ImagePicker.launchCameraAsync(OPCOES_FOTO))
        }
      },
      {
        text: '🖼️ Escolher da galeria',
        onPress: () => lancar('galeria', () => ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], ...OPCOES_FOTO })),
      },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  const aoTocarSlot = (tipo) => {
    const f = fotos[tipo]
    if (f.erro && f.uri) subir(tipo, f.uri)
    else selecionarFoto(tipo)
  }

  const prontas = SLOTS.every(s => !!fotos[s.tipo].url)

  // Mesmas exigências do antigo passo 4 do cadastro: PIX e referência 1 obrigatórios.
  const validarCampos = () => {
    const novos = {}
    if (!pixReembolso.trim()) novos.pixReembolso = 'Informe sua chave PIX para eventual reembolso'
    if (!ref1Nome.trim()) novos.ref1Nome = 'Informe o nome da referência 1'
    if (!ref1Tel.trim()) novos.ref1Tel = 'Informe o telefone da referência 1'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const enviar = async () => {
    if (enviando || !prontas) return
    if (!validarCampos()) return
    setEnviando(true)
    try {
      const referencias = [{ nome: ref1Nome.trim(), telefone: ref1Tel.trim() }]
      if (ref2Nome.trim()) referencias.push({ nome: ref2Nome.trim(), telefone: ref2Tel.trim() })
      const corpo = { pix_reembolso: pixReembolso.trim(), referencias }
      SLOTS.forEach(s => { corpo[s.campo] = fotos[s.tipo].url })
      const resp = await comRetry(() => api.post('/auth/verificacao', corpo))
      const status = resp?.usuario?.verificacao_status || resp?.verificacao_status || 'pendente'
      setUsuario(prev => (prev ? { ...prev, verificacao_status: status } : prev))
      if (montadoRef.current) setFase(status === 'aprovado' || status === 'reprovado' ? status : 'conferindo')
    } catch (err) {
      console.log('[Verificacao] POST /auth/verificacao FALHOU | status:', err?.status, '| code:', err?.code, '| codigo:', err?.codigo, '| msg:', err?.mensagem)
      // Recusas de campo do servidor voltam para o próprio campo, não para um alerta.
      if (err?.codigo === 'PIX_OBRIGATORIO') setErros(e => ({ ...e, pixReembolso: err?.mensagem || 'Informe sua chave PIX para eventual reembolso' }))
      else if (err?.codigo === 'REFERENCIAS_OBRIGATORIAS') setErros(e => ({ ...e, ref1Nome: err?.mensagem || 'Informe ao menos uma referência com nome e telefone' }))
      // 409: o servidor não aceita novo envio (reprovado). Fecha a sheet e aponta o suporte.
      else if (err?.status === 409) { onFechar(); alertarReprovado(err?.mensagem) }
      else Alert.alert('Erro', err?.mensagem || 'Não foi possível enviar seus documentos. Tente novamente.')
    } finally {
      if (montadoRef.current) setEnviando(false)
    }
  }

  // Enquanto a tela "Conferindo seus dados…" está aberta, relê o perfil até o status sair
  // de 'pendente' ou o prazo acabar. Uma falha de leitura não encerra nada: só passa a vez
  // para a próxima volta. Fechar a sheet (ou sair da tela) cancela.
  useEffect(() => {
    if (fase !== 'conferindo' || !visivel) return
    let ativo = true
    let timer = null
    const inicio = Date.now()
    const conferir = async () => {
      let status
      try {
        status = (await authService.perfil())?.usuario?.verificacao_status
      } catch (err) {
        console.log('[Verificacao] falha ao conferir o status | status:', err?.status, '| code:', err?.code, '| msg:', err?.mensagem)
      }
      if (!ativo) return
      if (status === 'aprovado' || status === 'reprovado') {
        setUsuario(prev => (prev ? { ...prev, verificacao_status: status } : prev))
        setFase(status)
        return
      }
      if (Date.now() - inicio >= LIMITE_CONFERENCIA_MS) { setFase('demorou'); return }
      timer = setTimeout(conferir, INTERVALO_CONFERENCIA_MS)
    }
    timer = setTimeout(conferir, INTERVALO_CONFERENCIA_MS)
    return () => { ativo = false; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase, visivel])

  const fechar = () => { if (!enviando) onFechar() }
  const concluir = () => { onFechar(); onConcluido?.() }
  const seguirComProposta = () => { onFechar(); onAprovado?.() }

  if (fase !== 'form') {
    const aprovado = fase === 'aprovado'
    return (
      <Modal visible={visivel} animationType="fade" statusBarTranslucent onRequestClose={concluir}>
        <View style={[estilos.enviadoTela, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
          {fase === 'conferindo' && (
            <View style={estilos.enviadoMiolo}>
              <ActivityIndicator size="large" color={cores.primaria} style={estilos.enviadoSpinner} />
              <Text style={estilos.titulo}>Conferindo seus dados…</Text>
              <Text style={estilos.texto}>Leva poucos segundos. Não precisa sair desta tela.</Text>
              <View style={estilos.pill}>
                <Text style={estilos.pillTexto}>🟠 Em análise</Text>
              </View>
              <Text style={estilos.textoFraco}>Se demorar, avisamos por notificação e você pode voltar aos serviços.</Text>
            </View>
          )}
          {fase === 'demorou' && (
            <View style={estilos.enviadoMiolo}>
              <Text style={estilos.enviadoIcone}>⏳</Text>
              <Text style={estilos.titulo}>Ainda estamos conferindo</Text>
              <View style={estilos.pill}>
                <Text style={estilos.pillTexto}>🟠 Em análise</Text>
              </View>
              <Text style={estilos.textoFraco}>Está demorando mais que o normal. Avisamos por notificação e você pode voltar aos serviços.</Text>
            </View>
          )}
          {aprovado && (
            <View style={estilos.enviadoMiolo}>
              <Text style={estilos.enviadoIcone}>✅</Text>
              <Text style={estilos.titulo}>Identidade confirmada!</Text>
              <Text style={estilos.texto}>Tudo certo. Agora é só enviar sua proposta para o cliente.</Text>
              <View style={[estilos.pill, estilos.pillVerde]}>
                <Text style={[estilos.pillTexto, { color: cores.sucesso }]}>✓ Profissional verificado</Text>
              </View>
            </View>
          )}
          {fase === 'reprovado' && (
            <View style={estilos.enviadoMiolo}>
              <Text style={estilos.enviadoIcone}>⚠️</Text>
              <Text style={estilos.titulo}>Verificação não aprovada</Text>
              <Text style={estilos.texto}>{'Sua verificação de identidade não foi aprovada.\n\nFale com o suporte.'}</Text>
            </View>
          )}
          {aprovado
            ? <BotaoPrimario titulo="Enviar minha proposta" onPress={seguirComProposta} estilo={estilos.botao} />
            : <BotaoSecundario titulo="Voltar aos serviços" onPress={concluir} estilo={estilos.botao} />}
        </View>
      </Modal>
    )
  }

  return (
    <Modal visible={visivel} transparent animationType="slide" statusBarTranslucent onRequestClose={fechar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={estilos.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} />
        <View style={[estilos.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={estilos.alca} />
          <ScrollView contentContainerStyle={estilos.sheetScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={estilos.titulo}>🪪 Confirme sua identidade</Text>
            <Text style={estilos.texto}>Só na sua primeira proposta. É o que dá segurança aos clientes.</Text>
            <View style={estilos.slotsRow}>
              <SlotFoto slot={SLOTS[0]} estado={fotos.doc_frente} onPress={() => aoTocarSlot('doc_frente')} />
              <SlotFoto slot={SLOTS[1]} estado={fotos.doc_verso} onPress={() => aoTocarSlot('doc_verso')} />
            </View>
            <SlotFoto slot={SLOTS[2]} estado={fotos.selfie} largo onPress={() => aoTocarSlot('selfie')} />

            <View style={estilos.campos}>
              <Input
                label="CHAVE PIX (CPF, e-mail, telefone ou chave aleatória)"
                placeholder="Ex: 000.000.000-00"
                value={pixReembolso}
                onChangeText={setPixReembolso}
                erro={erros.pixReembolso}
              />
              <Text style={estilos.campoLabel}>Referência 1 *</Text>
              <Input label="NOME" placeholder="Nome completo" value={ref1Nome} onChangeText={setRef1Nome} erro={erros.ref1Nome} />
              <Input label="TELEFONE" placeholder="(34) 99999-9999" value={ref1Tel} onChangeText={(t) => setRef1Tel(mascararTelefone(t))} keyboardType="phone-pad" erro={erros.ref1Tel} />
              <Text style={estilos.campoLabel}>Referência 2 (opcional)</Text>
              <Input label="NOME" placeholder="Nome completo" value={ref2Nome} onChangeText={setRef2Nome} />
              <Input label="TELEFONE" placeholder="(34) 99999-9999" value={ref2Tel} onChangeText={(t) => setRef2Tel(mascararTelefone(t))} keyboardType="phone-pad" />
            </View>

            <View style={estilos.lgpd}>
              <Text style={estilos.lgpdTexto}>🔒 Usado só para verificação. Protegido pela LGPD.</Text>
            </View>
          </ScrollView>
          <BotaoPrimario
            titulo="Enviar para verificação"
            onPress={enviar}
            carregando={enviando}
            desabilitado={!prontas}
            estilo={estilos.botao}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const estilos = StyleSheet.create({
  backdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: cores.fundoCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: espacos.tela, paddingTop: 12, maxHeight: '92%', ...larguraMaxima },
  alca:           { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: cores.bordaCampo, marginBottom: 16 },
  sheetScroll:    { alignItems: 'center', paddingBottom: 16 },
  campos:         { width: '100%', marginTop: 16 },
  campoLabel:     { fontSize: 12, fontWeight: '600', color: cores.textoMedio, marginTop: 8, marginBottom: 8 },
  titulo:         { fontSize: 20, fontWeight: '700', color: cores.textoForte, textAlign: 'center', letterSpacing: -0.3, marginBottom: 8 },
  texto:          { fontSize: 13, color: cores.textoForte, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  slotsRow:       { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 12 },
  slot:           { flex: 1, minHeight: 112, borderWidth: 1.5, borderStyle: 'dashed', borderColor: cores.bordaCampo, borderRadius: raios.medio, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 6 },
  slotLargo:      { flex: 0, width: '100%' },
  slotEnviado:    { borderStyle: 'solid', borderColor: cores.sucesso, backgroundColor: cores.sucessoSuave },
  slotErro:       { borderColor: cores.perigo },
  slotIcone:      { fontSize: 26, color: cores.textoForte },
  slotRotulo:     { fontSize: 12, color: cores.textoForte, textAlign: 'center', lineHeight: 16 },
  slotStatus:     { fontSize: 11, fontWeight: '600', color: cores.textoMedio, textAlign: 'center' },
  lgpd:           { width: '100%', borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, backgroundColor: cores.fundo, padding: 12, marginTop: 12 },
  lgpdTexto:      { fontSize: 12, color: cores.textoForte },
  botao:          { width: '100%' },
  enviadoTela:    { flex: 1, backgroundColor: cores.fundo, paddingHorizontal: espacos.tela },
  enviadoMiolo:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  enviadoIcone:   { fontSize: 52, marginBottom: 16 },
  pill:           { backgroundColor: cores.primariaSuave, borderWidth: 1, borderColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 24 },
  pillTexto:      { fontSize: 12, fontWeight: '700', color: cores.primaria },
  pillVerde:      { backgroundColor: cores.sucessoSuave, borderColor: cores.sucesso },
  enviadoSpinner: { marginBottom: 20, transform: [{ scale: 1.4 }] },
  textoFraco:     { fontSize: 12, color: cores.textoMedio, textAlign: 'center', lineHeight: 18 },
})
