import React, { useState, useRef, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotaoPrimario } from '../../components'
import { IndicadorPassos, CamposEnderecoCep, CamposProfissional, SeletorPlano, consultarCep } from '../../components/CadastroProfissional'
import api from '../../services/api'
import { comRetry, mensagemErroRede } from '../../utils/rede'
import { useAuth } from '../../contexts/AuthContext'
import { normalizarEspecialidades } from '../../utils/categorias'
import { buscarIndicador } from '../../utils/indicacao'
import { mostrarCobranca } from '../../utils/plataforma'
import { perfilDoTipo, msgErroContas } from '../../utils/contas'
import { cores, espacos, raios, alturas, larguraMaxima } from '../../utils/tema'

// "Adicionar perfil" (Arte-Meus-Perfis): cria a conta irmã do tipo pedido (route.params.tipo)
// com POST /auth/contas/:tipo. O servidor copia da conta atual o que já se sabe — nome, CPF,
// telefone, e-mail, senha e cidade — e NADA disso é pedido de novo.
//
// Contratar (dono_reparo / dono_obra): tela curta, sem nenhum campo — o cadastro de dono não
// pergunta nada além do que a conta profissional já tem.
//
// Trabalhar (reparador / pintor): os MESMOS passos do cadastro profissional novo
// (Auth/CadastroScreen), menos o passo de dados pessoais, que já está preenchido:
//   1. "Perfil profissional" — CEP + endereço, anos de experiência, equipe, especialidades
//      (a MESMA EspecialidadesScreen do cadastro: grupos, folhas, etiqueta NOVO), RG + órgão +
//      estado, código de indicação — components/CadastroProfissional, o mesmo JSX do cadastro.
//   2. "Escolha seu plano" — só no caminho pago (Android fora do lançamento grátis), como lá.
// Antes esta tela tinha só uma grade própria de pills (sem grupos) e pulava tudo o mais.
//
// A API (pinturapro-api d826bdd, POST /auth/contas/:tipo) lê do corpo `especialidades` e `plano`;
// os outros campos profissionais vão no corpo também (anos_experiencia, tamanho_equipe, cep,
// latitude, longitude, logradouro, numero, complemento, bairro, rg, rg_orgao, rg_estado,
// codigo_indicacao) para a API passar a gravá-los — hoje ela copia esses da conta de origem.
//
// "Criar e entrar" grava a sessão da conta nova (loginComToken) com o payload de login que a API
// devolve — sem sair e entrar de novo. O conteúdo é exportado para a Galeria.

const ROTA = 'AdicionarPerfil'

export function AdicionarPerfilConteudo({ perfil, form }) {
  return (
    <>
      <Text style={estilos.titulo}>{perfil?.icone} {perfil?.rotulo}</Text>
      {/* Contratar é um perfil só (Fase 1): diz o que ele cobre, sem "serviço" ou "obra" sozinho. */}
      <Text style={estilos.subtitulo}>{perfil?.profissional ? 'Novo perfil no mesmo e-mail e senha.' : `${perfil?.descricao}. Novo perfil no mesmo e-mail e senha.`}</Text>

      <View style={estilos.aviso}>
        <Text style={estilos.avisoTexto}>✅ Já aproveitamos do seu cadastro: nome, CPF, telefone, e-mail, senha e cidade.</Text>
      </View>

      {perfil?.profissional && form ? (
        <>
          {form.cidade ? <Text style={estilos.cidadeFixa}>📍 {form.cidade}{form.uf ? ` — ${form.uf}` : ''} · cidade da sua conta</Text> : null}
          <CamposEnderecoCep
            cep={form.cep} onCep={form.onCep} buscandoCep={form.buscandoCep} enderecoEncontrado={form.enderecoEncontrado} erroCep={form.erros?.cep}
            logradouro={form.logradouro} setLogradouro={form.setLogradouro} numero={form.numero} setNumero={form.setNumero}
            complemento={form.complemento} setComplemento={form.setComplemento} bairro={form.bairro} setBairro={form.setBairro}
          />
          <CamposProfissional
            anosExp={form.anosExp} setAnosExp={form.setAnosExp} equipe={form.equipe} setEquipe={form.setEquipe}
            especialidades={form.especialidades}
            onAbrirEspecialidades={form.onAbrirEspecialidades}
            onRemoverEspecialidade={form.onRemoverEspecialidade}
            erroEspecialidades={form.erros?.especialidades}
            rg={form.rg} setRg={form.setRg} rgOrgao={form.rgOrgao} setRgOrgao={form.setRgOrgao} rgEstado={form.rgEstado} setRgEstado={form.setRgEstado}
            codigoIndicacao={form.codigoIndicacao}
            onChangeCodigoIndicacao={form.onChangeCodigoIndicacao}
            onBlurCodigoIndicacao={form.onBlurCodigoIndicacao}
            erroCodigoIndicacao={form.erros?.codigoIndicacao}
            indicadoPor={form.indicadoPor}
          />
        </>
      ) : null}
    </>
  )
}

// Galeria: o formulário profissional com especialidades já marcadas e handlers no-op.
const noop = () => {}
export const formDemo = (selecionadas = []) => ({
  cidade: 'Patos de Minas', uf: 'MG', cep: '', onCep: noop, buscandoCep: false, enderecoEncontrado: false, erros: {},
  logradouro: '', setLogradouro: noop, numero: '', setNumero: noop, complemento: '', setComplemento: noop, bairro: '', setBairro: noop,
  anosExp: '', setAnosExp: noop, equipe: '', setEquipe: noop, especialidades: selecionadas, onAbrirEspecialidades: noop, onRemoverEspecialidade: noop,
  rg: '', setRg: noop, rgOrgao: 'SSP', setRgOrgao: noop, rgEstado: '', setRgEstado: noop,
  codigoIndicacao: '', onChangeCodigoIndicacao: noop, onBlurCodigoIndicacao: noop, indicadoPor: null,
})

export default function AdicionarPerfilScreen({ navigation, route }) {
  const tipo = route?.params?.tipo
  const perfil = perfilDoTipo(tipo)
  const precisaEsp = !!perfil?.profissional
  const { usuario, loginComToken } = useAuth()
  const [carregando, setCarregando] = useState(false)
  const [erros, setErros] = useState({})
  const [passo, setPasso] = useState(1)
  const [lancamentoGratis, setLancamentoGratis] = useState(false)
  const enviandoRef = useRef(false)
  const montadoRef = useRef(true)
  const scrollRef = useRef(null)

  // Endereço: pré-preenchido com o que a conta atual tiver (o dono normalmente não tem CEP).
  const [cep, setCep] = useState(() => String(usuario?.cep || '').replace(/\D/g, ''))
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [enderecoEncontrado, setEnderecoEncontrado] = useState(false)
  const [logradouro, setLogradouro] = useState(usuario?.logradouro || '')
  const [numero, setNumero] = useState(usuario?.numero || '')
  const [complemento, setComplemento] = useState(usuario?.complemento || '')
  const [bairro, setBairro] = useState(usuario?.bairro || '')
  const [latitude, setLatitude] = useState(usuario?.latitude ?? null)
  const [longitude, setLongitude] = useState(usuario?.longitude ?? null)
  const [cidade, setCidade] = useState(usuario?.cidade || '')
  const [uf, setUf] = useState(usuario?.uf || '')
  // Perfil profissional.
  const [anosExp, setAnosExp] = useState(usuario?.anos_experiencia ? String(usuario.anos_experiencia) : '')
  const [equipe, setEquipe] = useState(usuario?.tamanho_equipe ? String(usuario.tamanho_equipe) : '')
  const [especialidades, setEspecialidades] = useState([])
  const [rg, setRg] = useState(usuario?.rg || '')
  const [rgOrgao, setRgOrgao] = useState(usuario?.rg_orgao || 'SSP')
  const [rgEstado, setRgEstado] = useState(usuario?.rg_estado || '')
  const [codigoIndicacao, setCodigoIndicacao] = useState('')
  const codigoIndicacaoRef = useRef('')
  const [indicadoPor, setIndicadoPor] = useState(null)
  const [planoSelecionado, setPlanoSelecionado] = useState('mensal')

  useEffect(() => {
    // Janela de lançamento (grátis): cosmético e fire-and-forget, como no cadastro — some o
    // passo do plano. Erro mantém false (passo do plano aparece no Android).
    api.get('/config/lancamento').then((r) => { if (montadoRef.current) setLancamentoGratis(!!r?.gratis) }).catch(() => {})
    return () => { montadoRef.current = false }
  }, [])

  // Retorno da EspecialidadesScreen, por params serializáveis (como no CadastroScreen).
  const especialidadesRetorno = route?.params?.especialidades
  useEffect(() => {
    if (especialidadesRetorno === undefined) return
    setEspecialidades(normalizarEspecialidades(especialidadesRetorno))
    setErros((e) => (e.especialidades ? { ...e, especialidades: undefined } : e))
  }, [especialidadesRetorno])

  // Plano só no caminho pago: Android fora do lançamento grátis (iOS: Apple 3.1.1).
  const temPasso2 = precisaEsp && mostrarCobranca && !lancamentoGratis
  const totalPassos = temPasso2 ? 2 : 1

  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }) }, [passo])

  const buscarCep = async (digitado) => {
    const limpo = digitado.replace(/\D/g, '')
    setCep(limpo); setLatitude(null); setLongitude(null); setEnderecoEncontrado(false)
    if (limpo.length !== 8) return
    setBuscandoCep(true)
    try {
      const e = await consultarCep(limpo)
      if (!montadoRef.current) return
      setCidade(e.cidade || cidade); setUf(e.uf || uf); setLogradouro(e.logradouro); setBairro(e.bairro)
      setEnderecoEncontrado(true)
      if (e.latitude != null) { setLatitude(e.latitude); setLongitude(e.longitude) }
    } catch (err) {
      if (err?.naoEncontrado) { Alert.alert('CEP não encontrado', 'Verifique o CEP informado.'); return }
      console.log('[AdicionarPerfil] falha ao buscar CEP | msg:', err?.message)
      Alert.alert('Erro', await mensagemErroRede('Não foi possível buscar o CEP. Verifique sua conexão.'))
    } finally {
      if (montadoRef.current) setBuscandoCep(false)
    }
  }

  const validarCodigoIndicacao = async () => {
    const codigo = codigoIndicacaoRef.current.trim().toUpperCase()
    if (!codigo) { setIndicadoPor(null); setErros((e) => ({ ...e, codigoIndicacao: undefined })); return }
    try {
      const nome = await buscarIndicador(codigo)
      if (!montadoRef.current || codigoIndicacaoRef.current.trim().toUpperCase() !== codigo) return
      setIndicadoPor(nome)
      setErros((e) => ({ ...e, codigoIndicacao: nome ? undefined : 'Código não encontrado' }))
    } catch (err) {
      console.log('[AdicionarPerfil] validação do código de indicação indisponível | code:', err?.code)
    }
  }

  // Mesmas regras do validarPasso2 do cadastro para o prestador (CPF/cidade já vêm da conta).
  const validarPasso1 = () => {
    const novos = {}
    if (!cep || cep.length !== 8) novos.cep = 'Informe um CEP válido'
    if (!especialidades.length) novos.especialidades = 'Escolha ao menos uma especialidade'
    setErros(novos)
    return Object.keys(novos).length === 0
  }

  const criar = async () => {
    if (enviandoRef.current || !perfil) return
    enviandoRef.current = true
    setCarregando(true)
    try {
      const corpo = precisaEsp ? {
        especialidades,
        plano: mostrarCobranca ? planoSelecionado : 'mensal',
        anos_experiencia: parseInt(anosExp) || 0,
        tamanho_equipe: parseInt(equipe) || 1,
        cep: cep || null, latitude, longitude,
        logradouro: logradouro.trim() || null, numero: numero.trim() || null, complemento: complemento.trim() || null, bairro: bairro.trim() || null,
        rg: rg.trim() || null, rg_orgao: rgOrgao, rg_estado: rgEstado || null,
        codigo_indicacao: codigoIndicacao.trim().toUpperCase() || null,
      } : {}
      // comRetry: a regra de reenvio mora em utils/rede, e o servidor serializa por e-mail/CPF e
      // responde 409 à repetição — nunca duplica.
      const r = await comRetry(() => api.post(`/auth/contas/${tipo}`, corpo))
      if (!r?.token || !r?.usuario) throw { mensagem: 'Perfil criado, mas não foi possível entrar nele. Use "Trocar" em Meus perfis.' }
      // Entra no perfil novo: o AppNavigator muda a pilha pelo role do usuário novo.
      await loginComToken(r.token, r.usuario, r.assinatura, r.contas)
    } catch (err) {
      console.log('[AdicionarPerfil] falha ao criar | tipo:', tipo, '| status:', err?.status, '| code:', err?.code, '| codigo:', err?.codigo, '| msg:', err?.mensagem)
      if (!montadoRef.current) return
      Alert.alert('Não foi possível criar', msgErroContas(err?.codigo) || err?.mensagem || 'Tente novamente.')
    } finally {
      enviandoRef.current = false
      if (montadoRef.current) setCarregando(false)
    }
  }

  const avancar = () => {
    if (precisaEsp && passo === 1 && !validarPasso1()) return
    if (passo < totalPassos) { setPasso(passo + 1); return }
    criar()
  }
  const voltar = () => { if (passo > 1) setPasso(passo - 1); else navigation.goBack() }

  const form = precisaEsp ? {
    cidade, uf, cep, onCep: buscarCep, buscandoCep, enderecoEncontrado, erros,
    logradouro, setLogradouro, numero, setNumero, complemento, setComplemento, bairro, setBairro,
    anosExp, setAnosExp, equipe, setEquipe,
    especialidades,
    onAbrirEspecialidades: () => navigation.navigate('Especialidades', { selecionadas: especialidades, lado: perfil?.lado === 'pintura' ? 'pintura' : 'reparo', origem: ROTA }),
    onRemoverEspecialidade: (slug) => setEspecialidades((atuais) => atuais.filter((s) => s !== slug)),
    rg, setRg, rgOrgao, setRgOrgao, rgEstado, setRgEstado,
    codigoIndicacao,
    onChangeCodigoIndicacao: (c) => { codigoIndicacaoRef.current = c; setCodigoIndicacao(c); setIndicadoPor(null); setErros((e) => ({ ...e, codigoIndicacao: undefined })) },
    onBlurCodigoIndicacao: validarCodigoIndicacao,
    indicadoPor,
  } : null

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={estilos.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'android' && Platform.Version < 35 ? undefined : 'padding'} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} contentContainerStyle={[estilos.scroll, larguraMaxima]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={estilos.btnVoltar} onPress={voltar} disabled={carregando}>
            <Text style={estilos.voltarIcone}>←</Text>
          </TouchableOpacity>
          {perfil ? (
            <>
              {precisaEsp && (
                <>
                  <Text style={estilos.passoLinha}>{`Passo ${passo} de ${totalPassos} — ${passo === 1 ? 'informações profissionais' : 'assinatura'}`}</Text>
                  <IndicadorPassos passo={passo} total={totalPassos} />
                </>
              )}
              {passo === 1
                ? <AdicionarPerfilConteudo perfil={perfil} form={form} />
                : (
                  <>
                    <Text style={estilos.titulo}>Escolha seu plano</Text>
                    <SeletorPlano tipoConta={tipo} planoSelecionado={planoSelecionado} setPlanoSelecionado={setPlanoSelecionado} mostrarCobranca={mostrarCobranca} />
                  </>
                )}
              <BotaoPrimario
                titulo={passo < totalPassos ? 'Continuar →' : 'Criar e entrar'}
                onPress={avancar}
                carregando={carregando}
                desabilitado={carregando}
                estilo={{ marginTop: espacos.lg }}
              />
              <Text style={estilos.rodape}>Você entra no perfil novo na hora. Para voltar a este, use "Meus perfis".</Text>
            </>
          ) : (
            <Text style={estilos.subtitulo}>Tipo de perfil inválido.</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const estilos = StyleSheet.create({
  container: { flex: 1, backgroundColor: cores.fundo },
  scroll: { flexGrow: 1, paddingHorizontal: espacos.tela, paddingBottom: 40 + alturas.barraServico },
  btnVoltar: { marginTop: 16, width: 36, height: 36, backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  voltarIcone: { color: cores.textoForte, fontSize: 20, fontWeight: '700', lineHeight: 24, textAlignVertical: 'center', includeFontPadding: false },
  passoLinha: { fontSize: 13, color: cores.textoFraco, marginBottom: 8 },
  titulo: { fontSize: 24, fontWeight: '700', color: cores.textoForte, letterSpacing: -0.5, lineHeight: 32, marginBottom: 6 },
  subtitulo: { fontSize: 13, color: cores.textoFraco, lineHeight: 20, marginBottom: 16 },
  // Caixa verde no tom do card de valor: é uma boa notícia, não um campo.
  aviso: { backgroundColor: cores.sucessoSuave, borderWidth: 1, borderColor: cores.sucessoBorda, borderRadius: raios.grande, padding: 14, marginBottom: 12 },
  avisoTexto: { fontSize: 14, color: cores.textoForte, lineHeight: 20 },
  // Cidade/UF já conhecidos: linha fixa no lugar do SeletorLocalidade do cadastro.
  cidadeFixa: { fontSize: 12, color: cores.textoMedio, marginBottom: 4 },
  rodape: { fontSize: 11, color: cores.textoMutado, textAlign: 'center', marginTop: 12, lineHeight: 18 },
})
