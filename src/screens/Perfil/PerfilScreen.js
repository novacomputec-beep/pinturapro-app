import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, Linking
} from 'react-native'
import { authService } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { BotaoSecundario, Separador, BadgeStatus } from '../../components'
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

  useEffect(() => {
    const buscar = async () => {
      try {
        const resposta = await authService.perfil()
        setDadosCompletos(resposta.usuario)
      } catch {
        setDadosCompletos(usuario)
      } finally {
        setCarregando(false)
      }
    }
    buscar()
  }, [])

  const confirmarLogout = () => {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ])
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
  const vencimento = assinatura?.proximo_vencimento
    ? new Date(assinatura.proximo_vencimento).toLocaleDateString('pt-BR')
    : null

  return (
    <SafeAreaView style={estilos.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        <View style={estilos.header}>
          <Text style={estilos.headerTitulo}>Meu perfil</Text>
        </View>

        <View style={estilos.avatarArea}>
          <View style={estilos.avatarCirculo}>
            <Text style={estilos.avatarTexto}>{iniciais}</Text>
          </View>
          <Text style={estilos.nomeTexto}>{dados?.nome}</Text>
          <Text style={estilos.emailTexto}>{dados?.email}</Text>
          {dados?.cidade && (
            <Text style={estilos.cidadeTexto}>📍 {dados.cidade}, MG</Text>
          )}
        </View>

        <View style={estilos.assinaturaCard}>
          <View style={estilos.assinaturaHeader}>
            <Text style={estilos.assinaturaTitulo}>Assinatura</Text>
            <BadgeStatus status={assinatura?.status || 'encerrada'} />
          </View>
          <Separador estilo={{ marginVertical: 12 }} />
          <View style={estilos.assinaturaInfo}>
            <View style={estilos.assinaturaItem}>
              <Text style={estilos.assinaturaLabel}>Plano</Text>
              <Text style={estilos.assinaturaValor}>
                {assinatura?.plano === 'anual' ? 'Anual' : 'Mensal'}
              </Text>
            </View>
            <View style={estilos.assinaturaItem}>
              <Text style={estilos.assinaturaLabel}>Valor</Text>
              <Text style={[estilos.assinaturaValor, { color: cores.sucesso }]}>
                {usuario?.role === 'prestador'
                  ? (assinatura?.plano === 'anual' ? 'R$ 41,58/mês' : 'R$ 49,90/mês')
                  : (assinatura?.plano === 'anual' ? 'R$ 83,25/mês' : 'R$ 99,90/mês')}
              </Text>
            </View>
            {vencimento && (
              <View style={estilos.assinaturaItem}>
                <Text style={estilos.assinaturaLabel}>Próximo vencimento</Text>
                <Text style={estilos.assinaturaValor}>{vencimento}</Text>
              </View>
            )}
          </View>
          {(!assinatura || assinatura.status !== 'ativa') && (
            <TouchableOpacity style={estilos.btnRenovar}>
              <Text style={estilos.btnRenovarTexto}>Renovar assinatura →</Text>
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
          <ItemAcao
            titulo="✏️ Editar perfil"
            onPress={() => navigation.navigate('EditarPerfil')}
          />
          <Separador />
          <ItemAcao
            titulo="🔒 Alterar senha"
            onPress={() => navigation.navigate('AlterarSenha')}
          />
          <Separador />
          <ItemAcao
            titulo="📄 Termos de uso"
            onPress={() => Linking.openURL('https://pinturapro-painel-production.up.railway.app')}
          />
          <Separador />
          <ItemAcao
            titulo="💬 Suporte"
            onPress={() => Linking.openURL('mailto:novacomputec@gmail.com?subject=Suporte PinturaPro')}
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
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  header: { paddingHorizontal: espacos.tela, paddingTop: 8, paddingBottom: 16 },
  headerTitulo: { fontSize: 26, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5 },
  avatarArea: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: espacos.tela },
  avatarCirculo: { width: 72, height: 72, borderRadius: 36, backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarTexto: { fontSize: 22, fontWeight: '700', color: cores.primaria },
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