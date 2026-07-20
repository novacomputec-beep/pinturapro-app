import React, { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, Linking, Image
} from 'react-native'
import api, { authService } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { BotaoSecundario, Separador, BadgeStatus } from '../../components'
import ModalExcluirConta from '../../components/ModalExcluirConta'
import { cores, espacos, raios } from '../../utils/tema'

const LinhaPerfil = ({ label, valor }) => (
  <View style={estilos.linhaWrap}>
    <Text style={estilos.linhaLabel}>{label}</Text>
    <Text style={estilos.linhaValor}>{valor || '—'}</Text>
  </View>
)

const ItemAcao = ({ titulo, onPress, perigo }) => (
  <TouchableOpacity style={estilos.itemAcao} onPress={onPress} activeOpacity={0.7}>
    <Text style={[estilos.itemAcaoTexto, perigo && { color: cores.perigo }]}>{titulo}</Text>
    <Text style={estilos.itemAcaoSeta}>→</Text>
  </TouchableOpacity>
)

export default function PerfilScreen({ navigation }) {
  const { usuario, assinatura, logout } = useAuth()
  const [dadosCompletos, setDadosCompletos] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [renovandoAssinatura, setRenovandoAssinatura] = useState(false)
  const [mostrarExcluir, setMostrarExcluir] = useState(false)

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
          const resposta = await authService.perfil()
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
      await api.delete('/conta/excluir', { data: { senha } })
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

  if (carregando) {
    return (
      <SafeAreaView style={estilos.container}>
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

  return (
    <SafeAreaView style={estilos.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

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
              <Image source={{ uri: fotoUrl }} style={estilos.avatarFoto} />
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
          {dados?.cidade && (
            <Text style={estilos.cidadeTexto}>📍 {dados.cidade}, MG</Text>
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
            <View style={estilos.assinaturaItem}>
              <Text style={estilos.assinaturaLabel}>Valor</Text>
              <Text style={[estilos.assinaturaValor, { color: cores.sucesso }]}>
                {isDono ? 'Gratuito' : (usuario?.tipo_prestador === 'pintor'
                  ? (assinatura?.plano === 'anual' ? 'R$ 83,25/mês' : 'R$ 99,90/mês')
                  : usuario?.role === 'prestador'
                    ? (assinatura?.plano === 'anual' ? 'R$ 41,58/mês' : 'R$ 49,90/mês')
                    : (assinatura?.plano === 'anual' ? 'R$ 83,25/mês' : 'R$ 99,90/mês'))}
              </Text>
            </View>
            {!isDono && vencimento && (
              <View style={estilos.assinaturaItem}>
                <Text style={estilos.assinaturaLabel}>Próximo vencimento</Text>
                <Text style={estilos.assinaturaValor}>{vencimento}</Text>
              </View>
            )}
          </View>
          {!isDono && (
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
          <Text style={estilos.secaoTitulo}>Dados profissionais</Text>
          <Separador estilo={{ marginBottom: 12 }} />
          <LinhaPerfil label="Telefone" valor={dados?.telefone} />
          <LinhaPerfil label="Cidade" valor={dados?.cidade ? `${dados.cidade}, MG` : null} />
          <LinhaPerfil label="Experiência" valor={dados?.anos_experiencia ? `${dados.anos_experiencia} anos` : null} />
          <LinhaPerfil label="Equipe" valor={dados?.tamanho_equipe ? `${dados.tamanho_equipe} profissionais` : null} />
          <LinhaPerfil
            label="Especialidades"
            valor={dados?.especialidades?.length ? dados.especialidades.join(', ') : null}
          />
        </View>

        <View style={estilos.acoesWrap}>
          <ItemAcao titulo="✏️ Editar perfil" onPress={() => navigation.navigate('EditarPerfil')} />
          <Separador />
          {ehPrestador && (
            <>
              <ItemAcao titulo="⭐ Avaliações recebidas" onPress={() => navigation.navigate('AvaliacoesRecebidas')} />
              <Separador />
            </>
          )}
          <ItemAcao titulo="🔒 Alterar senha" onPress={() => navigation.navigate('AlterarSenha')} />
          <Separador />
          <ItemAcao
            titulo="📄 Termos de uso"
            onPress={() => Linking.openURL('https://pinturapro-painel-production.up.railway.app/termos.html')}
          />
          <Separador />
          <ItemAcao
            titulo="🔐 Política de privacidade"
            onPress={() => Linking.openURL('https://pinturapro-painel-production.up.railway.app/privacidade.html')}
          />
          <Separador />
          <ItemAcao
            titulo="💬 Suporte"
            onPress={() => Linking.openURL('mailto:novacomputec@gmail.com?subject=Suporte PinturaPro')}
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
          <Text style={estilos.versaoTexto}>PinturaPro v1.0.0</Text>
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
  itemAcaoSeta: { fontSize: 14, color: cores.textoFraco },
  logoutWrap: { paddingHorizontal: espacos.tela, paddingBottom: 40 },
  versaoTexto: { textAlign: 'center', fontSize: 11, color: cores.textoMutado, marginTop: 16 },
})