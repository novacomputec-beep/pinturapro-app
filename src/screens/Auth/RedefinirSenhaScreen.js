import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario, Input } from '../../components'
import api from '../../services/api'
import { cores, espacos, raios, larguraMaxima } from '../../utils/tema'
import { comRetry } from '../../utils/rede'

// Fecha o fluxo de esqueci-senha, que antes terminava num beco: a EsqueciSenhaScreen
// mandava o código por e-mail e só oferecia "Voltar ao login" — não havia onde digitá-lo.
// Chega aqui automaticamente após o POST /auth/esqueci-senha dar certo, com o e-mail nos
// params para a pessoa não redigitar o que acabou de escrever.
//
// SEM auto-login no sucesso, por decisão do dono: redefiniu, volta ao Login e entra com a
// senha nova.
export default function RedefinirSenhaScreen({ navigation, route }) {
  const email = route.params?.email || ''
  const [codigo, setCodigo] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [erros, setErros] = useState({})

  // Sem e-mail não há o que redefinir — o único caminho até aqui passa o param, então
  // chegar sem ele é estado anômalo (deep link, restauração). Volta para o começo do
  // fluxo em vez de renderizar uma tela que só pode falhar.
  useEffect(() => {
    if (!email) navigation.replace('EsqueciSenha')
  }, [email, navigation])

  // Mesma régua do cadastro (CadastroScreen validarPasso1) e do AlterarSenha: senha
  // obrigatória e mínimo 8 caracteres, mensagens idênticas às de lá.
  const validar = () => {
    const novos = {}
    if (codigo.length !== 6) novos.codigo = 'Informe o código de 6 caracteres'
    if (!novaSenha.trim()) novos.novaSenha = 'Informe a nova senha'
    if (novaSenha.length < 8) novos.novaSenha = 'Mínimo 8 caracteres'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const handleRedefinir = async () => {
    if (!validar()) return
    setCarregando(true)
    try {
      await comRetry(() => api.post('/auth/redefinir-senha', {
        email,
        codigo,
        nova_senha: novaSenha,
      }))
      Alert.alert('Senha redefinida! 🎉', 'Agora é só entrar com a sua nova senha.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') }
      ])
    } catch (err) {
      console.log('[RedefinirSenha] falha ao redefinir | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      // A mensagem do servidor vai como veio: ela é DELIBERADAMENTE a mesma para código
      // errado, expirado e e-mail desconhecido. Traduzir para algo "mais claro" aqui
      // revelaria qual dos casos aconteceu — exatamente o que o backend evita.
      Alert.alert('Erro', err.mensagem || 'Não foi possível redefinir a senha.')
    } finally {
      setCarregando(false)
    }
  }

  // Reenvio = o MESMO POST /auth/esqueci-senha da tela anterior, para o mesmo e-mail.
  // Sucesso mantém a resposta neutra de lá ("se estiver cadastrado...") para não
  // confirmar existência de conta; erro (o servidor limita a frequência — 429) mostra a
  // mensagem do servidor, que não revela nada além do próprio limite.
  const handleReenviar = async () => {
    if (reenviando) return
    setReenviando(true)
    try {
      await api.post('/auth/esqueci-senha', { email })
      Alert.alert('Código reenviado 📧', `Se o e-mail ${email} estiver cadastrado, você receberá um novo código em breve.`)
    } catch (err) {
      console.log('[RedefinirSenha] falha ao reenviar código | status:', err.status, '| code:', err.code, '| msg:', err.mensagem)
      Alert.alert('Erro', err.mensagem || 'Não foi possível reenviar o código.')
    } finally {
      setReenviando(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[estilos.scroll, larguraMaxima]} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={estilos.btnVoltar} onPress={() => navigation.goBack()}>
            <Text style={{ color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false }}>←</Text>
          </TouchableOpacity>

          <Text style={estilos.titulo}>Redefinir{'\n'}sua senha</Text>
          <Text style={estilos.subtitulo}>
            Digite o código de 6 caracteres enviado para <Text style={{ color: cores.primaria }}>{email}</Text> e escolha a nova senha.
          </Text>

          <Input
            label="CÓDIGO"
            placeholder="ABC123"
            value={codigo}
            // Maiúsculas por conta da tela (o código é insensível a caixa para quem
            // digita) e sem espaço — colar do e-mail costuma trazer um junto.
            onChangeText={text => { setCodigo(text.replace(/\s/g, '').toUpperCase()); setErros(e => (e.codigo ? { ...e, codigo: null } : e)) }}
            autoCapitalize="characters"
            maxLength={6}
            erro={erros.codigo}
          />

          <View>
            <Input
              label="NOVA SENHA"
              placeholder="Mínimo 8 caracteres"
              value={novaSenha}
              onChangeText={setNovaSenha}
              secureTextEntry={!mostrar}
              erro={erros.novaSenha}
            />
            <TouchableOpacity style={estilos.olhoBtn} onPress={() => setMostrar(!mostrar)}>
              <Text style={estilos.olhoTexto}>{mostrar ? 'ocultar' : 'mostrar'}</Text>
            </TouchableOpacity>
          </View>

          <BotaoPrimario
            titulo="Redefinir senha →"
            onPress={handleRedefinir}
            carregando={carregando}
            estilo={{ marginTop: 8 }}
          />

          <TouchableOpacity
            style={{ alignItems: 'center', padding: 16, marginTop: 8 }}
            onPress={handleReenviar}
            disabled={reenviando}
          >
            <Text style={{ fontSize: 13, color: cores.textoFraco }}>
              {reenviando ? 'Reenviando...' : 'Não recebi o código · Reenviar'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// Cópia dos estilos das telas irmãs de Auth (EsqueciSenha/AlterarSenha) — mesmos nomes,
// mesmos valores. Não há StyleSheet compartilhado neste app.
const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 },
  btnVoltar: { marginTop: 60, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 36, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, marginBottom: 24, lineHeight: 20 },
  olhoBtn: { position: 'absolute', right: 14, bottom: 27 },
  olhoTexto: { fontSize: 12, color: cores.textoFraco },
})
