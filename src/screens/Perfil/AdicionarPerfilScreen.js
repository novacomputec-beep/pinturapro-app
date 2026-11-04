import React, { useState, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario } from '../../components'
import api from '../../services/api'
import { comRetry } from '../../utils/rede'
import { useAuth } from '../../contexts/AuthContext'
import { especialidadesPorLado, MAX_ESPECIALIDADES, rotuloComEmoji } from '../../utils/categorias'
import { perfilDoTipo, msgErroContas } from '../../utils/contas'
import { ocultarConviteServicos } from '../../components/ConviteCadastroServicos'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

// "Adicionar perfil" (Arte-Meus-Perfis): tela curta que cria a conta irmã do tipo pedido
// (route.params.tipo) com POST /auth/contas/:tipo. Nada é digitado — o servidor copia nome,
// CPF, telefone, e-mail, senha e cidade da conta atual. A única decisão, e só para os tipos
// profissionais, é a lista de especialidades do lado certo (reparador → serviços, pintor →
// construção). "Criar e entrar" grava a sessão da conta nova (loginComToken) com o payload
// de login que a API devolve — sem sair e entrar de novo, que era o caminho do
// CadastroServicosScreen (que segue existindo para o convite do feed de obras).
// O conteúdo é exportado para a Galeria.

export function AdicionarPerfilConteudo({ perfil, selecionadas, onAlternar }) {
  const lista = perfil?.profissional ? especialidadesPorLado(perfil.lado) : []
  const cheio = selecionadas.length >= MAX_ESPECIALIDADES
  return (
    <>
      <Text style={estilos.titulo}>{perfil?.icone} {perfil?.rotulo}</Text>
      <Text style={estilos.subtitulo}>Novo perfil no mesmo e-mail e senha.</Text>

      <View style={estilos.aviso}>
        <Text style={estilos.avisoTexto}>✅ Já aproveitamos do seu cadastro: nome, CPF, telefone, e-mail, senha e cidade.</Text>
      </View>

      {perfil?.profissional && (
        <>
          <Text style={estilos.secao}>ESPECIALIDADES</Text>
          <Text style={estilos.contador}>{selecionadas.length} de {MAX_ESPECIALIDADES} selecionadas</Text>
          <View style={estilos.grade}>
            {lista.map((c) => {
              const ativa = selecionadas.includes(c.slug)
              const bloqueada = cheio && !ativa
              return (
                <TouchableOpacity
                  key={c.slug}
                  style={[estilos.pill, ativa && estilos.pillAtiva, bloqueada && estilos.pillBloqueada]}
                  onPress={() => onAlternar(c.slug)}
                  disabled={bloqueada}
                  activeOpacity={0.7}
                >
                  <Text style={[estilos.pillTexto, ativa && estilos.pillTextoAtivo]}>{rotuloComEmoji(c)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          {!selecionadas.length && <Text style={estilos.dica}>Escolha pelo menos uma especialidade para continuar.</Text>}
        </>
      )}
    </>
  )
}

export default function AdicionarPerfilScreen({ navigation, route }) {
  const tipo = route?.params?.tipo
  const perfil = perfilDoTipo(tipo)
  const { usuario, loginComToken } = useAuth()
  const [selecionadas, setSelecionadas] = useState([])
  const [carregando, setCarregando] = useState(false)
  const enviandoRef = useRef(false)
  const montadoRef = useRef(true)
  useEffect(() => () => { montadoRef.current = false }, [])

  // Atualização funcional, como na EspecialidadesScreen: o teto vale toque a toque.
  const alternar = (slug) => {
    setSelecionadas((atuais) => {
      if (atuais.includes(slug)) return atuais.filter((s) => s !== slug)
      if (atuais.length >= MAX_ESPECIALIDADES) return atuais
      return [...atuais, slug]
    })
  }

  const precisaEsp = !!perfil?.profissional
  const podeCriar = !!perfil && (!precisaEsp || selecionadas.length > 0)

  const criar = async () => {
    if (enviandoRef.current || !podeCriar) return
    enviandoRef.current = true
    setCarregando(true)
    try {
      // comRetry como no CadastroServicosScreen: a regra de reenvio mora em utils/rede, e o
      // servidor serializa por e-mail/CPF e responde 409 à repetição — nunca duplica.
      const r = await comRetry(() => api.post(`/auth/contas/${tipo}`, precisaEsp ? { especialidades: selecionadas } : {}))
      // Conta de reparador criada: o convite do feed de obras não tem mais o que convidar.
      if (tipo === 'reparador') await ocultarConviteServicos(usuario?.id)
      if (!r?.token || !r?.usuario) throw { mensagem: 'Perfil criado, mas não foi possível entrar nele. Use "Trocar" em Meus perfis.' }
      // Entra no perfil novo: o AppNavigator muda a pilha pelo role do usuário novo.
      await loginComToken(r.token, r.usuario, r.assinatura, r.contas)
    } catch (err) {
      console.log('[AdicionarPerfil] falha ao criar | tipo:', tipo, '| status:', err?.status, '| code:', err?.code, '| codigo:', err?.codigo, '| msg:', err?.mensagem)
      if (err?.status === 409 && err?.codigo === 'tipo_duplicado' && tipo === 'reparador') await ocultarConviteServicos(usuario?.id)
      if (!montadoRef.current) return
      Alert.alert('Não foi possível criar', msgErroContas(err?.codigo) || err?.mensagem || 'Tente novamente.')
    } finally {
      enviandoRef.current = false
      if (montadoRef.current) setCarregando(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()} disabled={carregando}>
          <Text style={estilos.voltarIcone}>←</Text>
        </TouchableOpacity>
        {perfil ? (
          <>
            <AdicionarPerfilConteudo perfil={perfil} selecionadas={selecionadas} onAlternar={alternar} />
            <BotaoPrimario titulo="Criar e entrar" onPress={criar} carregando={carregando} desabilitado={!podeCriar} estilo={{ marginTop: espacos.sm }} />
            <Text style={estilos.rodape}>Você entra no perfil novo na hora. Para voltar a este, use "Meus perfis".</Text>
          </>
        ) : (
          <Text style={estilos.subtitulo}>Tipo de perfil inválido.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico },
  btnVoltar: { marginTop: 16, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  voltarIcone: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  titulo: { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 32, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, lineHeight: 20, marginBottom: 16 },
  // Caixa verde no tom do card de valor: é uma boa notícia, não um campo.
  aviso: { backgroundColor: cores.sucessoSuave, borderWidth: 1, borderColor: cores.sucessoBorda, borderRadius: raios.grande, padding: 14, marginBottom: 20 },
  avisoTexto: { fontSize: 14, color: cores.textoForte, lineHeight: 20 },
  secao: { fontSize: 11, color: cores.textoForte, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  contador: { fontSize: 12, fontWeight: '600', color: cores.primaria, marginBottom: 12 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  // Mesmas pills de duas colunas do CadastroServicosScreen.
  pill: { width: '48%', alignItems: 'center', backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 8 },
  pillAtiva: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  pillBloqueada: { opacity: 0.35 },
  pillTexto: { fontSize: 12, color: cores.textoMedio, textAlign: 'center' },
  pillTextoAtivo: { color: cores.fundo, fontWeight: '600' },
  dica: { fontSize: 12, color: cores.textoFraco, textAlign: 'center', marginBottom: espacos.sm },
  rodape: { fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 12, lineHeight: 18 },
})
