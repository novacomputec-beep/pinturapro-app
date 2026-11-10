import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Input } from './index'
import { cores, espacos, raios } from '../utils/tema'
import { MAX_ESPECIALIDADES, rotuloEspecialidade } from '../utils/categorias'

// Peças do cadastro PROFISSIONAL, compartilhadas entre o cadastro novo (Auth/CadastroScreen,
// "Perfil profissional" + "Escolha seu plano") e o "Quero trabalhar" de quem já tem conta de
// dono (Perfil/AdicionarPerfilScreen). Viviam só no CadastroScreen; o AdicionarPerfil tinha uma
// grade própria de pills sem grupos — a divergência que este arquivo fecha: as duas telas
// montam o mesmo JSX, com os mesmos estilos, e a escolha de especialidades abre a MESMA
// EspecialidadesScreen (grupos, folhas, etiqueta NOVO).
//
// Estado fica em quem usa (cada tela tem seu rascunho/fluxo); aqui só apresentação + a
// consulta de CEP (ViaCEP + Nominatim), que também era cópia.

export const IndicadorPassos = ({ passo, total }) => (
  <View style={estilos.indicador}>
    {Array.from({ length: total }).map((_, i) => (
      <View key={i} style={[
        estilos.indicadorDot,
        i < passo - 1 && estilos.indicadorDotFeito,
        i === passo - 1 && estilos.indicadorDotAtivo,
      ]} />
    ))}
  </View>
)

// ViaCEP preenche cidade/UF/logradouro/bairro; Nominatim geocodifica (best-effort: lat/lng
// null quando não resolve). Lança em CEP inexistente ({ naoEncontrado: true }) e em falha de
// rede (erro cru) — quem chama decide o Alert.
export const consultarCep = async (cepLimpo) => {
  const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
  const dados = await resp.json()
  if (dados.erro) throw { naoEncontrado: true }
  const endereco = { cidade: dados.localidade || '', uf: dados.uf || '', logradouro: dados.logradouro || '', bairro: dados.bairro || '', latitude: null, longitude: null }
  try {
    const q = [dados.logradouro, dados.bairro, dados.localidade, dados.uf, 'Brasil'].filter(Boolean).join(', ')
    const geoResp = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { 'User-Agent': 'ProTudo/1.0' } }
    )
    const geoData = await geoResp.json()
    if (geoData.length > 0) { endereco.latitude = parseFloat(geoData[0].lat); endereco.longitude = parseFloat(geoData[0].lon) }
  } catch (err) {
    console.log('[consultarCep] geocode indisponível | msg:', err?.message)
  }
  return endereco
}

// CEP + logradouro/número/complemento/bairro, com a dica e o ✅ de "encontrado".
export const CamposEnderecoCep = ({ cep, onCep, buscandoCep, enderecoEncontrado, erroCep, logradouro, setLogradouro, numero, setNumero, complemento, setComplemento, bairro, setBairro }) => (
  <>
    <Text style={estilos.dicaCep}>Comece pelo CEP — endereço, estado e cidade são preenchidos automaticamente</Text>
    <View style={estilos.cepRow}>
      <Input label="CEP" placeholder="00000-000" value={cep} onChangeText={onCep} keyboardType="numeric" maxLength={8} erro={erroCep} estilo={{ flex: 1 }} />
      {buscandoCep && <ActivityIndicator color={cores.primaria} style={{ marginTop: 28, marginLeft: 12 }} />}
      {enderecoEncontrado && !buscandoCep && <Text style={estilos.cepOk}>✅</Text>}
    </View>
    <Input label="LOGRADOURO (rua/avenida)" placeholder="Preenchido pelo CEP" value={logradouro} onChangeText={setLogradouro} />
    <View style={estilos.duasColunas}>
      <Input label="NÚMERO" placeholder="Ex: 123" value={numero} onChangeText={setNumero} keyboardType="numeric" estilo={{ flex: 1 }} />
      <Input label="COMPLEMENTO" placeholder="Apto/bloco (opcional)" value={complemento} onChangeText={setComplemento} estilo={{ flex: 2 }} />
    </View>
    <Input label="BAIRRO" placeholder="Preenchido pelo CEP" value={bairro} onChangeText={setBairro} />
  </>
)

export const ORGAOS_RG = ['SSP', 'PC', 'PM', 'IFP', 'DETRAN', 'Outro']
export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

// Anos de experiência + equipe, campo de ABERTURA das especialidades (a escolha é na
// EspecialidadesScreen; o ✕ de cada pill remove aqui mesmo), RG + órgão + estado, código de
// indicação (opcional, validado no onBlur).
export const CamposProfissional = ({
  anosExp, setAnosExp, equipe, setEquipe,
  especialidades, onAbrirEspecialidades, onRemoverEspecialidade, erroEspecialidades,
  rg, setRg, rgOrgao, setRgOrgao, rgEstado, setRgEstado,
  codigoIndicacao, onChangeCodigoIndicacao, onBlurCodigoIndicacao, erroCodigoIndicacao, indicadoPor,
}) => (
  <>
    <View style={estilos.duasColunas}>
      <Input label="ANOS DE EXP." placeholder="Ex: 8" value={anosExp} onChangeText={setAnosExp} keyboardType="numeric" estilo={{ flex: 1 }} />
      <Input label="TAMANHO DA EQUIPE" placeholder="Nº de pessoas" value={equipe} onChangeText={setEquipe} keyboardType="numeric" estilo={{ flex: 1 }} />
    </View>
    <Text style={estilos.labelSecao}>ESPECIALIDADES (até {MAX_ESPECIALIDADES})</Text>
    <TouchableOpacity
      style={[estilos.campoEspecialidades, erroEspecialidades && estilos.campoEspecialidadesErro]}
      onPress={onAbrirEspecialidades}
      activeOpacity={0.7}
    >
      <Text style={especialidades.length ? estilos.campoEspTexto : estilos.campoEspPlaceholder}>
        {especialidades.length ? `${especialidades.length} selecionada${especialidades.length > 1 ? 's' : ''}` : 'Escolher especialidades'}
      </Text>
      <Text style={estilos.campoEspSeta}>→</Text>
    </TouchableOpacity>
    {!!erroEspecialidades && <Text style={estilos.erroEspecialidades}>{erroEspecialidades}</Text>}
    {!!especialidades.length && (
      <View style={estilos.espPills}>
        {especialidades.map((slug) => (
          <TouchableOpacity key={slug} style={estilos.espPill} onPress={() => onRemoverEspecialidade(slug)} activeOpacity={0.7}>
            <Text style={estilos.espPillTexto}>{rotuloEspecialidade(slug)}</Text>
            <Text style={estilos.espPillX}>✕</Text>
          </TouchableOpacity>
        ))}
      </View>
    )}
    <Input label="RG (somente números)" placeholder="000000000" value={rg} onChangeText={(t) => setRg(t.replace(/\D/g, '').slice(0, 9))} keyboardType="numeric" />
    <Text style={estilos.labelSecao}>ÓRGÃO EMISSOR DO RG</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {ORGAOS_RG.map((o) => (
        <TouchableOpacity key={o} style={[estilos.categoriaPill, rgOrgao === o && estilos.categoriaPillAtivo]} onPress={() => setRgOrgao(o)}>
          <Text style={[estilos.categoriaPillTexto, rgOrgao === o && estilos.categoriaPillTextoAtivo]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
    <Text style={estilos.labelSecao}>ESTADO EMISSOR DO RG</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
      {UFS.map((s) => (
        <TouchableOpacity key={s} style={[estilos.categoriaPill, rgEstado === s && estilos.categoriaPillAtivo]} onPress={() => setRgEstado(s)}>
          <Text style={[estilos.categoriaPillTexto, rgEstado === s && estilos.categoriaPillTextoAtivo]}>{s}</Text>
        </TouchableOpacity>
      ))}
    </View>
    {/* Indicação de colega (opcional). Maiúsculas e sem espaços, como o código é emitido;
        valida ao sair do campo e mostra quem indicou. */}
    <Input
      label="CÓDIGO DE INDICAÇÃO (opcional)"
      placeholder="Código do colega que te indicou"
      value={codigoIndicacao}
      onChangeText={(t) => onChangeCodigoIndicacao(t.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20))}
      onBlur={onBlurCodigoIndicacao}
      autoCapitalize="characters"
      autoCorrect={false}
      erro={erroCodigoIndicacao}
    />
    {!!indicadoPor && <Text style={estilos.indicacaoOk}>✓ Indicado por {indicadoPor}</Text>}
  </>
)

export const valoresPlano = (tipoConta) => (tipoConta === 'prestador' || tipoConta === 'reparador'
  ? { mensal: 'R$ 49,90', anual: 'R$ 41,58', anualTotal: 'R$ 499/ano' }
  : { mensal: 'R$ 99,90', anual: 'R$ 83,25', anualTotal: 'R$ 999/ano' })

// Passo "Escolha seu plano": dois cards (mensal / anual) + caixa do PagBank (some no iOS).
export const SeletorPlano = ({ tipoConta, planoSelecionado, setPlanoSelecionado, mostrarCobranca }) => {
  const valores = valoresPlano(tipoConta)
  const ehServicos = tipoConta === 'prestador' || tipoConta === 'reparador'
  return (
    <View>
      <Text style={estilos.planoSubtitulo}>
        Escolha o plano para acessar {ehServicos ? 'os pedidos disponíveis' : 'as obras disponíveis'}:
      </Text>
      <TouchableOpacity style={[estilos.planoCard, planoSelecionado === 'mensal' && estilos.planoCardAtivo]} onPress={() => setPlanoSelecionado('mensal')} activeOpacity={0.8}>
        <View style={[estilos.planoRadio, planoSelecionado === 'mensal' && estilos.planoRadioAtivo]}>
          {planoSelecionado === 'mensal' && <View style={estilos.planoRadioDot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={estilos.planoNome}>Plano Mensal</Text>
          <Text style={estilos.planoDesc}>Acesso completo</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={estilos.planoPreco}>{valores.mensal}</Text>
          <Text style={estilos.planoPeriodo}>/mês</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={[estilos.planoCard, planoSelecionado === 'anual' && estilos.planoCardAtivo]} onPress={() => setPlanoSelecionado('anual')} activeOpacity={0.8}>
        <View style={{ position: 'absolute', top: -10, right: 14 }}>
          <View style={estilos.planoDestaque}><Text style={estilos.planoDestaqueTexto}>Economize 2 meses</Text></View>
        </View>
        <View style={[estilos.planoRadio, planoSelecionado === 'anual' && estilos.planoRadioAtivo]}>
          {planoSelecionado === 'anual' && <View style={estilos.planoRadioDot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={estilos.planoNome}>Plano Anual</Text>
          <Text style={estilos.planoDesc}>Melhor custo-benefício</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={estilos.planoPreco}>{valores.anual}</Text>
          <Text style={estilos.planoPeriodo}>/mês · {valores.anualTotal}</Text>
        </View>
      </TouchableOpacity>
      {/* Menção à forma de pagamento: some no iOS (3.1.1), sem frase no lugar. */}
      {mostrarCobranca && (
        <View style={estilos.segurancaBox}>
          <Text style={estilos.segurancaIcone}>🔒</Text>
          <Text style={estilos.segurancaTexto}>Pagamento 100% seguro via PagBank. Cancele quando quiser.</Text>
        </View>
      )}
    </View>
  )
}

const estilos = StyleSheet.create({
  indicador: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  indicadorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: cores.fundoElevado },
  indicadorDotAtivo: { width: 20, borderRadius: 3, backgroundColor: cores.primaria },
  indicadorDotFeito: { backgroundColor: cores.sucesso },
  duasColunas: { flexDirection: 'row', gap: 12 },
  planoSubtitulo: { fontSize: 13, color: cores.textoMedio, marginBottom: 16 },
  planoCard: { backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.grande, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  planoCardAtivo: { borderColor: cores.primaria, backgroundColor: cores.primariaSuave },
  planoRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 0.5, borderColor: cores.borda, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  planoRadioAtivo: { borderColor: cores.primaria, backgroundColor: cores.primaria },
  planoRadioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#0A0A0A' },
  planoNome: { fontSize: 14, fontWeight: '600', color: cores.textoForte, marginBottom: 2 },
  planoDesc: { fontSize: 11, color: cores.textoFraco },
  planoPreco: { fontSize: 15, fontWeight: '700', color: cores.sucesso },
  planoPeriodo: { fontSize: 10, color: cores.textoFraco, textAlign: 'right' },
  planoDestaque: { backgroundColor: cores.primaria, borderRadius: raios.pill, paddingHorizontal: 10, paddingVertical: 3 },
  planoDestaqueTexto: { fontSize: 10, fontWeight: '700', color: '#0A0A0A' },
  segurancaBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: cores.fundoCard, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.medio, padding: 12, marginTop: 4 },
  segurancaIcone: { fontSize: 14 },
  segurancaTexto: { flex: 1, fontSize: 11, color: cores.textoFraco, lineHeight: 17 },
  labelSecao: { fontSize: 11, fontWeight: '600', color: cores.textoForte, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  // Mesma caixa do Input (fundo, borda, raio, padding) para o campo não parecer de outra
  // família só por abrir uma tela em vez de aceitar digitação.
  campoEspecialidades: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: cores.fundoCampo, borderWidth: 1.5, borderColor: cores.bordaCampo, borderRadius: raios.medio, paddingHorizontal: espacos.lg, paddingVertical: 13, marginTop: 7 },
  campoEspecialidadesErro: { borderColor: cores.perigo },
  campoEspTexto: { fontSize: 14, color: cores.textoForte },
  campoEspPlaceholder: { fontSize: 14, color: cores.placeholderCampo },
  campoEspSeta: { fontSize: 14, color: cores.textoFraco },
  erroEspecialidades: { color: cores.perigo, fontSize: 11, marginTop: 4 },
  espPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 4 },
  espPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: cores.primariaSuave, borderWidth: 0.5, borderColor: cores.primariaBorda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 6 },
  espPillTexto: { fontSize: 12, color: cores.textoForte },
  espPillX: { fontSize: 12, color: cores.primaria, fontWeight: '700' },
  categoriaPill: { backgroundColor: cores.fundoElevado, borderWidth: 0.5, borderColor: cores.borda, borderRadius: raios.pill, paddingHorizontal: 12, paddingVertical: 7 },
  categoriaPillAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  categoriaPillTexto: { fontSize: 12, color: cores.textoMedio },
  categoriaPillTextoAtivo: { color: '#0A0A0A', fontWeight: '600' },
  cepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cepOk: { fontSize: 20, marginTop: 28, marginLeft: 12 },
  // Confirmação do código de indicação, colada ao campo (o Input tem a própria margem).
  indicacaoOk: { fontSize: 12, color: cores.sucesso, fontWeight: '600', marginTop: -8, marginBottom: 14 },
  dicaCep: { fontSize: 11, color: cores.textoMedio, marginBottom: 10, marginTop: 12 },
})
