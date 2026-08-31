import React, { useState, useCallback, useEffect } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, Linking, Image
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import * as Application from 'expo-application'
import api, { authService } from '../../services/api'
import { comRetry } from '../../utils/rede'
import { mascararTelefone } from '../../utils/telefone'
import { useAuth } from '../../contexts/AuthContext'
import { BotaoSecundario, Separador, BadgeStatus } from '../../components'
import ModalExcluirConta from '../../components/ModalExcluirConta'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'
import { mostrarCobranca, FRASE_ASSINATURA_EXTERNA } from '../../utils/plataforma'
import { avatar } from '../../utils/imagemOtimizada'
import { normalizarEspecialidades, rotulosEspecialidades } from '../../utils/categorias'

// Lidos do build nativo, não de app.json: com `appVersionSource: "remote"` no eas.json
// o versionCode é gerado pelo EAS e não existe em nenhum arquivo do repositório, então
// a única fonte é o próprio APK/AAB instalado. Constantes, não estado: o valor não muda
// enquanto o app está aberto. Fora de um build nativo (Expo Go) as duas vêm null, e aí
// cada trecho ausente simplesmente não é exibido em vez de virar "vnull".
const versaoNativa = Application.nativeApplicationVersion
const buildNativo = Application.nativeBuildVersion
const textoVersao = [
  'ProTudo',
  versaoNativa && `v${versaoNativa}`,
  buildNativo && `(build ${buildNativo})`,
].filter(Boolean).join(' ')

const LinhaPerfil = ({ label, valor }) => (
  <View style={estilos.linhaWrap}>
    <Text style={estilos.linhaLabel}>{label}</Text>
    <Text style={estilos.linhaValor}>{valor || '—'}</Text>
  </View>
)

// `estado` é opcional: só as linhas que refletem uma condição do aparelho (hoje, a
// permissão de notificação) mostram um rótulo antes da seta. As demais seguem idênticas.
const ItemAcao = ({ titulo, onPress, perigo, estado, estadoCor }) => (
  <TouchableOpacity style={estilos.itemAcao} onPress={onPress} activeOpacity={0.7}>
    <Text style={[estilos.itemAcaoTexto, perigo && { color: cores.perigo }]}>{titulo}</Text>
    <View style={estilos.itemAcaoDireita}>
      {!!estado && <Text style={[estilos.itemAcaoEstado, estadoCor && { color: estadoCor }]}>{estado}</Text>}
      <Text style={estilos.itemAcaoSeta}>→</Text>
    </View>
  </TouchableOpacity>
)

export default function PerfilScreen({ navigation, route }) {
  const { usuario, assinatura, logout, garantirPermissaoConcedida, registrarPushToken } = useAuth()
  const [dadosCompletos, setDadosCompletos] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [renovandoAssinatura, setRenovandoAssinatura] = useState(false)
  const [mostrarExcluir, setMostrarExcluir] = useState(false)
  const [permNotif, setPermNotif] = useState(null)
  // Resultado do ÚLTIMO registrarPushToken disparado por esta tela (null = ainda não
  // houve toque nesta montagem). Só o toque no item alimenta isto: os registros de
  // boot/login não passam por aqui e continuam invisíveis.
  const [resultadoPush, setResultadoPush] = useState(null)

  // Salva a seleção que volta da EspecialidadesScreen. Mesmo caminho do EditarPerfil:
  // authService.atualizarPerfil -> PUT /auth/perfil, com comRetry { timeout, servidor }
  // porque a gravação é idempotente (grava os mesmos campos) e repetir é inócuo.
  //
  // Manda SÓ `especialidades`, como o EditarPerfil manda só nome/telefone/cidade: o
  // PUT desta API trata chave ausente como 'não mexa', e é por isso que salvar lá nunca
  // apagou os campos que a tela não edita. Reenviar o resto daqui seria pior — o que a
  // tela tem em mãos é a cópia carregada no último foco, e devolvê-la sobrescreveria com
  // valor velho qualquer campo alterado noutro lugar nesse meio-tempo.
  const [salvandoEsp, setSalvandoEsp] = useState(false)
  const espRetorno = route.params?.especialidades
  useEffect(() => {
    if (!espRetorno) return
    const lista = normalizarEspecialidades(espRetorno)
    navigation.setParams({ especialidades: undefined })
    if (!lista.length) return
    let vivo = true
    const salvar = async () => {
      setSalvandoEsp(true)
      try {
        await comRetry(() => authService.atualizarPerfil({ especialidades: lista }), { timeout: true, servidor: true })
        if (vivo) setDadosCompletos(d => (d ? { ...d, especialidades: lista } : d))
      } catch (err) {
        console.log('[Perfil] falha ao salvar especialidades | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
        Alert.alert('Erro', err.mensagem || 'Não foi possível salvar suas especialidades.')
      } finally {
        if (vivo) setSalvandoEsp(false)
      }
    }
    salvar()
    return () => { vivo = false }
  }, [espRetorno])

  const handleRenovarAssinatura = async () => {
    setRenovandoAssinatura(true)
    try {
      const resposta = await api.post('/pagamentos/criar-assinatura', { plano: assinatura?.plano || 'mensal' })
      if (resposta?.init_point) {
        await Linking.openURL(resposta.init_point)
      } else {
        Alert.alert('Erro', 'Não foi possível gerar o link de pagamento. Tente novamente.')
      }
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível conectar ao servidor. Tente novamente.')
    } finally {
      setRenovandoAssinatura(false)
    }
  }

  // Rebusca o perfil a CADA foco da tela (não só na montagem). Ao voltar de
  // "Editar perfil", o nome/telefone/cidade/foto recém-salvos passam a ser
  // refletidos aqui. Antes o fetch rodava só on-mount, então esta cópia local
  // (dadosCompletos) ficava defasada e — por ter precedência sobre o contexto
  // em `dados = dadosCompletos || usuario` — exibia o nome antigo mesmo após
  // salvar com sucesso.
  useFocusEffect(
    useCallback(() => {
      const buscar = async () => {
        try {
          const resposta = await comRetry(() => authService.perfil())
          setDadosCompletos(resposta.usuario)
        } catch (err) {
          console.log('[Perfil] falha ao buscar perfil | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
          setDadosCompletos(usuario)
        } finally {
          setCarregando(false)
        }
      }
      buscar()
    }, [])
  )

  // Estado AO VIVO da permissão de notificação, reconsultado a cada foco: a pessoa pode
  // ter mudado o ajuste nas Configurações do sistema e voltado para o app.
  // Esta linha NÃO passa pelo soft-ask e não toca no contador dele (shows/ultimoShowMs):
  // existe justamente para quem quer resolver isso por conta própria — inclusive depois
  // de o soft-ask ter esgotado as 3 exibições ou de ter sido declinado.
  const verificarPermissaoNotif = useCallback(async () => {
    try {
      // `status` entra junto: é ele que separa "nunca perguntamos" ('undetermined') de
      // "recusou" ('denied'), que o par granted/canAskAgain sozinho confunde.
      const { granted, canAskAgain, status } = await Notifications.getPermissionsAsync()
      setPermNotif({ granted, canAskAgain, status })
    } catch (err) {
      console.log('[Perfil] falha ao consultar permissão de notificação | msg:', err.message)
      setPermNotif(null)
    }
  }, [])

  useFocusEffect(useCallback(() => { verificarPermissaoNotif() }, [verificarPermissaoNotif]))

  const handleAtivarNotificacoes = async () => {
    // Reconsulta no toque: o estado em memória pode ser de minutos atrás.
    let estado = permNotif
    try { estado = await Notifications.getPermissionsAsync() } catch (err) {
      console.log('[Perfil] falha ao reconsultar permissão | msg:', err.message)
    }
    if (estado?.granted) {
      Alert.alert('Notificações ativadas', 'Você já recebe os avisos do ProTudo neste aparelho.')
      return
    }
    // canAskAgain false = bloqueio permanente do SO. O app não consegue mais pedir; só as
    // Configurações do aparelho revertem. Explica antes de jogar a pessoa para fora do app.
    if (estado?.canAskAgain === false) {
      Alert.alert(
        'Notificações bloqueadas',
        'O aviso foi bloqueado nas configurações do aparelho, e só por lá é possível liberar.',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Abrir Configurações', onPress: () => Linking.openSettings() },
        ],
      )
      return
    }
    // Ainda dá para pedir: garantirPermissaoConcedida é o ÚNICO ponto que dispara o diálogo
    // do SO, e registrarPushToken só faz sentido depois do "sim" — mesma dupla do soft-ask.
    const concedida = await garantirPermissaoConcedida()
    if (concedida) {
      // .catch defensivo: hoje registrarPushToken não rejeita (configurarCanalAndroid
      // engole as próprias falhas), mas o await em :169 é o único sem try/catch — se um
      // dia rejeitar, vira uma linha de erro aqui em vez de unhandled rejection.
      const resultado = await registrarPushToken()
        .catch(err => ({ ok: false, motivo: 'erro_token', detalhe: err?.message }))
      setResultadoPush(resultado || null)
    }
    verificarPermissaoNotif()
  }

  const confirmarLogout = () => {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ])
  }

  // Exclusão definitiva da conta. O ModalExcluirConta captura a senha e exibe
  // erros inline; aqui fazemos a chamada autenticada e mapeamos os status do
  // backend para mensagens amigáveis. Ao lançar um erro, o modal o mostra e
  // mantém-se aberto para nova tentativa. Em caso de sucesso, deslogamos — o
  // navegador troca para a stack de autenticação (Login) automaticamente.
  const handleExcluirConta = async (senha) => {
    try {
      // { timeout: true }: a exclusão é IDEMPOTENTE — senha errada é 401 e 4xx nunca é
      // reexecutado, então o retry não insiste numa credencial inválida nem repete uma
      // exclusão já efetivada. Cobrir o timeout importa especialmente aqui: um socket
      // ocioso morto trava 30 s e o modal devolve "não foi possível excluir" para uma
      // conta que estava intacta — a pessoa tenta de novo achando que falhou.
      // { servidor } fica FORA: um 5xx prova que a requisição chegou.
      await comRetry(() => api.delete('/conta/excluir', { data: { senha } }), { timeout: true, persistir: true })
    } catch (err) {
      console.log('[Perfil] falha ao excluir conta | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      const msg =
        err.status === 401 ? 'Senha incorreta. Verifique e tente novamente.' :
        err.status === 400 ? 'Informe sua senha para confirmar a exclusão.' :
        err.status === 404 ? 'Conta não encontrada. Faça login novamente.' :
        err.mensagem || 'Não foi possível excluir a conta. Tente novamente.'
      throw new Error(msg)
    }
    setMostrarExcluir(false)
    await logout()
    Alert.alert('Conta excluída', 'Sua conta e todos os dados associados foram removidos permanentemente.')
  }

  const dados = dadosCompletos || usuario

  // "Cidade, UF" a partir do que o perfil realmente traz. Antes a UF era um 'MG' fixo no
  // JSX, que mentia para quem mora em qualquer outro estado — e o cadastro sempre enviou
  // a UF de verdade (CadastroScreen.js:797), então o dado já estava aqui, só não era lido.
  // Sem UF, cai para a cidade sozinha: o filter(Boolean) tira também a vírgula, porque
  // "Uberlândia," pendurada num campo é pior do que só o nome da cidade.
  const cidadeComUf = dados?.cidade
    ? [dados.cidade, dados.uf].filter(Boolean).join(', ')
    : null

  if (carregando) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
        <ActivityIndicator color={cores.primaria} size="large" style={{ flex: 1 }} />
      </SafeAreaView>
    )
  }

  const iniciais = dados?.nome?.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const fotoUrl = dados?.foto_url || usuario?.foto_url
  const vencimento = assinatura?.proximo_vencimento
    ? new Date(assinatura.proximo_vencimento).toLocaleDateString('pt-BR')
    : null
  const isDono = usuario?.role === 'dono_obra'
  // "Avaliações recebidas" é só para quem RECEBE avaliações (prestadores: reparador e
  // pintor/construtor — role 'prestador' ou o legado 'assinante'). Donos dão avaliações,
  // não as recebem por aqui, então não veem a entrada.
  const ehPrestador = usuario?.role === 'prestador' || usuario?.role === 'assinante'
  // Só o dono de reparo ganha a seta de voltar nesta tela compartilhada: sua aba
  // "Perfil" não tem outra forma de retornar à lista. Os demais papéis (pintor,
  // prestador, dono de obra) NÃO são afetados — a seta não é renderizada para eles.
  const ehDonoReparo = isDono && usuario?.tipo_dono === 'reparo'
  // Rótulo do estado da permissão. null = ainda consultando (ou falha na consulta): melhor
  // não mostrar rótulo nenhum do que afirmar algo errado sobre a permissão.
  // 'Permitir' (e não 'Desativadas') para quem NUNCA foi perguntado: 'undetermined' é o
  // estado de todo aparelho recém-instalado, e anunciar "Desativadas" ali afirmava uma
  // recusa que nunca houve — além de esconder que esta linha é justamente a porta para
  // conceder. 'Desativadas' fica reservado a quem viu o diálogo e recusou.
  // O verbo é OUTRO de propósito: o título da linha já diz "Ativar notificações", e
  // repetir "Ativar" no rótulo de estado lia como eco em vez de ação.
  const estadoNotifTexto = permNotif == null
    ? ''
    : permNotif.granted ? 'Ativadas'
    : permNotif.canAskAgain === false ? 'Bloqueadas'
    : permNotif.status === 'undetermined' ? 'Permitir'
    : 'Desativadas'
  // A cor segue a MESMA ordem de ramos do rótulo acima, para que os dois não possam
  // divergir. 'Ativar' ganha a cor primária, e não o cinza de 'Desativadas': é o único
  // dos quatro estados que é um CONVITE — um toque resolve —, enquanto os outros três
  // relatam uma situação já estabelecida.
  const estadoNotifCor = permNotif == null
    ? null
    : permNotif.granted ? cores.sucesso
    : permNotif.canAskAgain === false ? cores.perigo
    : permNotif.status === 'undetermined' ? cores.primaria
    : cores.textoFraco
  // Desfecho do registro do token, distinto da permissão acima: dá para ter permissão
  // concedida e mesmo assim nenhum token no servidor (Expo fora do ar, POST falhando).
  // O token aparece só como prefixo — é credencial do aparelho, não vai inteiro na tela.
  const textoResultadoPush = !resultadoPush
    ? ''
    : resultadoPush.ok ? `Registrado: ${String(resultadoPush.token || '').slice(0, 24)}…`
    : resultadoPush.motivo === 'negada' ? 'Permissão negada — token não gerado'
    : resultadoPush.motivo === 'bloqueada' ? 'Bloqueada nas configurações do aparelho'
    : resultadoPush.motivo === 'erro_consulta' ? 'Falha ao consultar a permissão'
    : resultadoPush.motivo === 'erro_token' ? 'Falha ao gerar o token no Expo'
    : resultadoPush.motivo === 'erro_envio'
      ? `Falha ao enviar ao servidor${resultadoPush.status ? ` (${resultadoPush.status})` : ''}`
      : ''

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <ScrollView contentContainerStyle={larguraMaxima} showsVerticalScrollIndicator={false}>

        <View style={estilos.header}>
          {ehDonoReparo && (
            <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.navigate('Meus Reparos')}>
              <Text style={estilos.btnVoltarTexto}>←</Text>
            </TouchableOpacity>
          )}
          <Text style={estilos.headerTitulo}>Meu perfil</Text>
        </View>

        <View style={estilos.avatarArea}>
          <TouchableOpacity
            style={estilos.avatarWrap}
            onPress={() => navigation.navigate('EditarPerfil')}
            activeOpacity={0.8}
          >
            {fotoUrl ? (
              <Image source={{ uri: avatar(fotoUrl) }} style={estilos.avatarFoto} />
            ) : (
              <View style={estilos.avatarCirculo}>
                <Text style={estilos.avatarTexto}>{iniciais}</Text>
              </View>
            )}
            <View style={estilos.avatarBotaoEditar}>
              <Text style={{ fontSize: 11 }}>✏️</Text>
            </View>
          </TouchableOpacity>
          <Text style={estilos.nomeTexto}>{dados?.nome}</Text>
          <Text style={estilos.emailTexto}>{dados?.email}</Text>
          {cidadeComUf && (
            <Text style={estilos.cidadeTexto}>📍 {cidadeComUf}</Text>
          )}
        </View>

        <View style={estilos.assinaturaCard}>
          <View style={estilos.assinaturaHeader}>
            <Text style={estilos.assinaturaTitulo}>{isDono ? 'Assinatura Gratuita' : 'Assinatura'}</Text>
            <BadgeStatus status={isDono ? 'ativa' : (assinatura?.status || 'encerrada')} />
          </View>
          <Separador estilo={{ marginVertical: 12 }} />
          <View style={estilos.assinaturaInfo}>
            <View style={estilos.assinaturaItem}>
              <Text style={estilos.assinaturaLabel}>Plano</Text>
              <Text style={estilos.assinaturaValor}>
                {isDono ? 'Perene' : (assinatura?.plano === 'anual' ? 'Anual' : 'Mensal')}
              </Text>
            </View>
            {/* Preço de assinatura digital não aparece no iOS (3.1.1); a linha some inteira. */}
            {(isDono || mostrarCobranca) && (
            <View style={estilos.assinaturaItem}>
              <Text style={estilos.assinaturaLabel}>Valor</Text>
              <Text style={[estilos.assinaturaValor, { color: cores.sucesso }]}>
                {isDono ? 'Gratuito' : assinatura?.tipo === 'gratuito' ? 'grátis' : (usuario?.tipo_prestador === 'pintor'
                  ? (assinatura?.plano === 'anual' ? 'R$ 83,25/mês' : 'R$ 99,90/mês')
                  : usuario?.role === 'prestador'
                    ? (assinatura?.plano === 'anual' ? 'R$ 41,58/mês' : 'R$ 49,90/mês')
                    : (assinatura?.plano === 'anual' ? 'R$ 83,25/mês' : 'R$ 99,90/mês'))}
              </Text>
            </View>
            )}
            {!isDono && assinatura?.tipo !== 'gratuito' && vencimento && (
              <View style={estilos.assinaturaItem}>
                <Text style={estilos.assinaturaLabel}>Próximo vencimento</Text>
                <Text style={estilos.assinaturaValor}>{vencimento}</Text>
              </View>
            )}
          </View>
          {/* No iOS o CTA de pagamento vira a frase — sem botão, sem link (3.1.1). */}
          {!isDono && assinatura?.tipo !== 'gratuito' && !mostrarCobranca && (
            <Text style={[estilos.assinaturaLabel, { textAlign: 'center', marginTop: 12 }]}>{FRASE_ASSINATURA_EXTERNA}</Text>
          )}
          {!isDono && assinatura?.tipo !== 'gratuito' && mostrarCobranca && (
            <TouchableOpacity
              style={[estilos.btnRenovar, renovandoAssinatura && { opacity: 0.6 }]}
              onPress={handleRenovarAssinatura}
              disabled={renovandoAssinatura}
            >
              <Text style={estilos.btnRenovarTexto}>
                {renovandoAssinatura ? 'Aguarde...' : assinatura?.status === 'ativa' ? 'Renovar assinatura →' : 'Pagar agora →'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={estilos.secaoCard}>
          <Text style={estilos.secaoTitulo}>{ehPrestador ? 'Dados profissionais' : 'Dados pessoais'}</Text>
          <Separador estilo={{ marginBottom: 12 }} />
          <LinhaPerfil label="Telefone" valor={dados?.telefone ? mascararTelefone(dados.telefone) : null} />
          <LinhaPerfil label="Cidade" valor={cidadeComUf} />
          {/* Campos só de prestador — donos (role 'dono_obra') não têm e não devem vê-los. */}
          {ehPrestador && (
            <>
              <LinhaPerfil label="Experiência" valor={dados?.anos_experiencia ? `${dados.anos_experiencia} anos` : null} />
              <LinhaPerfil label="Equipe" valor={dados?.tamanho_equipe ? `${dados.tamanho_equipe} profissionais` : null} />
              <LinhaPerfil
                label="Especialidades"
                valor={rotulosEspecialidades(dados?.especialidades)}
              />
            </>
          )}
        </View>

        <View style={estilos.acoesWrap}>
          <ItemAcao titulo="✏️ Editar perfil" onPress={() => navigation.navigate('EditarPerfil')} />
          <Separador />
          {ehPrestador && (
            <>
              <ItemAcao
                titulo="🛠 Minhas especialidades"
                estado={salvandoEsp ? 'Salvando...' : String(normalizarEspecialidades(dados?.especialidades).length)}
                onPress={() => navigation.navigate('Especialidades', { selecionadas: normalizarEspecialidades(dados?.especialidades), lado: dados?.tipo_prestador === 'pintor' ? 'pintura' : 'reparo', origem: 'PerfilMain' })}
              />
              <Separador />
            </>
          )}
          {/* Para TODOS os papéis: dono e prestador dependem igualmente de push (interesse
              recebido, proposta aceita, encerramento). Sem gate de role e sem gate do
              soft-ask — é a porta sempre disponível para resolver a permissão. */}
          <ItemAcao
            titulo="🔔 Ativar notificações"
            estado={estadoNotifTexto}
            estadoCor={estadoNotifCor}
            onPress={handleAtivarNotificacoes}
          />
          {/* Irmão do ItemAcao, não filho: o ItemAcao é uma linha horizontal usada por
              outros sete itens desta tela e não tem lugar para uma segunda linha. */}
          {!!textoResultadoPush && <Text style={estilos.notifResultado}>{textoResultadoPush}</Text>}
          <Separador />
          {ehPrestador && (
            <>
              <ItemAcao titulo="⭐ Avaliações recebidas" onPress={() => navigation.navigate('AvaliacoesRecebidas')} />
              <Separador />
            </>
          )}
          <ItemAcao titulo="🔒 Alterar senha" onPress={() => navigation.navigate('AlterarSenha')} />
          <Separador />
          <ItemAcao titulo="💡 Sugestões" onPress={() => navigation.navigate('Sugestoes')} />
          <Separador />
          {/* Navegação interna, e não Linking.openURL. As duas linhas abriam páginas no
              host do painel no Railway: marca PinturaPro antiga, fora do app, no Chrome e
              sem caminho de volta — quem tocasse aqui só regressava pelo botão do sistema.
              As telas locais já existem, já estão com a marca ProTudo e os endereços
              @prolar.pro.br, e já trazem topbar com voltar; o que faltava era registro do
              lado logado, feito agora no PerfilStack (AppNavigator:534-556). São as MESMAS
              duas telas que a Splash abre — nenhuma cópia do texto legal foi criada.
              As páginas públicas em prolar.pro.br seguem no ar e intocadas: elas atendem o
              Play Console e quem chega de fora, que é outro caminho. */}
          <ItemAcao
            titulo="📄 Termos de uso"
            onPress={() => navigation.navigate('Termos')}
          />
          <Separador />
          <ItemAcao
            titulo="🔐 Política de privacidade"
            onPress={() => navigation.navigate('Privacidade')}
          />
          <Separador />
          <ItemAcao
            titulo="💬 Suporte"
            onPress={() => Linking.openURL('mailto:novacomputec@gmail.com?subject=Suporte ProTudo')}
          />
          <Separador />
          <ItemAcao
            titulo="🗑️ Excluir minha conta"
            perigo
            onPress={() => setMostrarExcluir(true)}
          />
        </View>

        <View style={estilos.logoutWrap}>
          <BotaoSecundario
            titulo="Sair da conta"
            onPress={confirmarLogout}
            estilo={{ borderColor: cores.perigo + '44' }}
          />
          <Text style={estilos.creditoTexto}>By Nova Computec Informática</Text>
          <Text style={estilos.versaoTexto}>{textoVersao}</Text>
        </View>

      </ScrollView>

      <ModalExcluirConta
        visivel={mostrarExcluir}
        onConfirmar={handleExcluirConta}
        onFechar={() => setMostrarExcluir(false)}
      />
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: { paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 16 },
  btnVoltar: { width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  btnVoltarTexto: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, includeFontPadding: false },
  headerTitulo: { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  avatarArea: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: espacos.tela },
  avatarWrap: { position: 'relative', marginBottom: 14 },
  avatarCirculo: { width: 80, height: 80, borderRadius: 40, backgroundColor: cores.primariaSuave, borderWidth: 2, borderColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  avatarFoto: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: cores.primaria },
  avatarTexto: { fontSize: 24, fontWeight: '700', color: cores.primaria },
  avatarBotaoEditar: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: cores.fundo },
  nomeTexto: { fontSize: 18, fontWeight: '700', color: cores.textoForte, marginBottom: 4 },
  emailTexto: { fontSize: 13, color: cores.textoFraco, marginBottom: 4 },
  cidadeTexto: { fontSize: 12, color: cores.textoMutado },
  assinaturaCard: { marginHorizontal: espacos.tela, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  assinaturaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assinaturaTitulo: { fontSize: 14, fontWeight: '600', color: cores.textoMedio },
  assinaturaInfo: { gap: 10 },
  assinaturaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assinaturaLabel: { fontSize: 12, color: cores.textoFraco },
  assinaturaValor: { fontSize: 13, fontWeight: '500', color: cores.textoForte },
  btnRenovar: { marginTop: 14, borderTopWidth: 0.5, borderTopColor: cores.bordaFraca, paddingTop: 12, alignItems: 'center' },
  btnRenovarTexto: { fontSize: 13, color: cores.primaria, fontWeight: '500' },
  secaoCard: { marginHorizontal: espacos.tela, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 16, marginBottom: 16 },
  secaoTitulo: { fontSize: 13, fontWeight: '600', color: cores.textoMedio, marginBottom: 12 },
  linhaWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: cores.bordaFraca },
  linhaLabel: { fontSize: 12, color: cores.textoFraco },
  linhaValor: { fontSize: 13, color: cores.textoForte, textAlign: 'right', flex: 1, marginLeft: 16 },
  acoesWrap: { marginHorizontal: espacos.tela, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, overflow: 'hidden', marginBottom: 16 },
  itemAcao: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  itemAcaoTexto: { fontSize: 14, color: cores.textoForte },
  itemAcaoDireita: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemAcaoEstado: { fontSize: 12, fontWeight: '600', color: cores.textoFraco },
  itemAcaoSeta: { fontSize: 14, color: cores.textoFraco },
  notifResultado: { fontSize: 12, color: cores.textoFraco, paddingHorizontal: 16, paddingBottom: 12, marginTop: -6 },
  logoutWrap: { paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico },
  // O respiro de 16 passou para o crédito, que agora abre o bloco; a versão fica logo
  // abaixo dele, com o espaçamento de linha em vez do de bloco.
  creditoTexto: { textAlign: 'center', fontSize: 11, color: cores.textoMutado, marginTop: 16 },
  versaoTexto: { textAlign: 'center', fontSize: 11, color: cores.textoMutado, marginTop: 2 },
})