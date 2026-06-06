import React, { useState, useEffect } from 'react'
import {
  View, Text, TouchableOpacity, Modal,
  FlatList, ActivityIndicator, StyleSheet, TextInput,
} from 'react-native'
import { cores, raios, espacos } from '../utils/tema'

// Architecture note: pais is read-only (Brasil) for now.
// To support other countries: add a country picker step that sets `pais`,
// then conditionally fetch states from a country-specific source.
const IBGE_ESTADOS = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome'
const IBGE_MUNICIPIOS = (uf) =>
  `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`

export default function SeletorLocalidade({
  uf = '',
  cidade = '',
  onChange,
  erroEstado,
  erroCidade,
}) {
  const [estados, setEstados] = useState([])
  const [cidades, setCidades] = useState([])
  const [carregandoEstados, setCarregandoEstados] = useState(false)
  const [carregandoCidades, setCarregandoCidades] = useState(false)
  const [modalAberto, setModalAberto] = useState(null) // 'estado' | 'cidade'
  const [busca, setBusca] = useState('')

  useEffect(() => {
    setCarregandoEstados(true)
    fetch(IBGE_ESTADOS)
      .then(r => r.json())
      .then(data => setEstados(data.map(e => ({ sigla: e.sigla, nome: e.nome }))))
      .catch(() => {})
      .finally(() => setCarregandoEstados(false))
  }, [])

  useEffect(() => {
    if (!uf) { setCidades([]); return }
    setCarregandoCidades(true)
    fetch(IBGE_MUNICIPIOS(uf))
      .then(r => r.json())
      .then(data => setCidades(data.map(m => ({ id: m.id, nome: m.nome }))))
      .catch(() => {})
      .finally(() => setCarregandoCidades(false))
  }, [uf])

  const nomeEstado = estados.find(e => e.sigla === uf)?.nome ?? ''

  const handleEstado = (estado) => {
    setModalAberto(null)
    onChange({ pais: 'Brasil', uf: estado.sigla, estado: estado.nome, cidade: '' })
  }

  const handleCidade = (c) => {
    setModalAberto(null)
    onChange({ pais: 'Brasil', uf, estado: nomeEstado, cidade: c.nome })
  }

  return (
    <View style={{ marginBottom: 4 }}>

      {/* País — read-only until international expansion */}
      <Text style={estilos.label}>PAÍS</Text>
      <View style={[estilos.seletor, { opacity: 0.5 }]}>
        <Text style={estilos.seletorValor}>🇧🇷  Brasil</Text>
        <Text style={estilos.nota}>outros países em breve</Text>
      </View>

      {/* Estado */}
      <Text style={estilos.label}>ESTADO</Text>
      <TouchableOpacity
        style={[estilos.seletor, erroEstado && estilos.seletorErro]}
        onPress={() => setModalAberto('estado')}
        activeOpacity={0.8}
      >
        {carregandoEstados
          ? <ActivityIndicator size="small" color={cores.primaria} style={{ flex: 1 }} />
          : <Text style={uf ? estilos.seletorValor : estilos.placeholder}>
              {uf ? `${nomeEstado} (${uf})` : 'Selecione o estado'}
            </Text>
        }
        <Text style={estilos.chevron}>▾</Text>
      </TouchableOpacity>
      {erroEstado ? <Text style={estilos.erroTexto}>{erroEstado}</Text> : null}

      {/* Cidade */}
      <Text style={estilos.label}>CIDADE</Text>
      <TouchableOpacity
        style={[estilos.seletor, !uf && { opacity: 0.4 }, erroCidade && estilos.seletorErro]}
        onPress={() => { if (uf && !carregandoCidades) setModalAberto('cidade') }}
        activeOpacity={uf ? 0.8 : 1}
      >
        {carregandoCidades
          ? <ActivityIndicator size="small" color={cores.primaria} style={{ flex: 1 }} />
          : <Text style={cidade ? estilos.seletorValor : estilos.placeholder}>
              {cidade || (uf ? 'Selecione a cidade' : 'Selecione o estado primeiro')}
            </Text>
        }
        {!carregandoCidades && <Text style={estilos.chevron}>▾</Text>}
      </TouchableOpacity>
      {erroCidade ? <Text style={estilos.erroTexto}>{erroCidade}</Text> : null}

      {/* Bottom-sheet modal */}
      <Modal
        visible={modalAberto !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { setModalAberto(null); setBusca('') }}
      >
        <View style={estilos.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => { setModalAberto(null); setBusca('') }} activeOpacity={1} />
          <View style={estilos.sheet}>
            <View style={estilos.handle} />
            <Text style={estilos.sheetTitulo}>
              {modalAberto === 'estado' ? 'Selecione o estado' : 'Selecione a cidade'}
            </Text>
            <TextInput
              style={estilos.buscaInput}
              placeholder={modalAberto === 'estado' ? 'Buscar estado...' : 'Buscar cidade...'}
              placeholderTextColor={cores.textoMutado}
              value={busca}
              onChangeText={setBusca}
              autoCorrect={false}
            />
            <FlatList
              data={(modalAberto === 'estado' ? estados : cidades).filter(item => {
                const nome = modalAberto === 'estado'
                  ? `${item.nome} ${item.sigla}`
                  : item.nome
                return nome.toLowerCase().includes(busca.toLowerCase())
              })}
              keyExtractor={(item) => modalAberto === 'estado' ? item.sigla : String(item.id)}
              renderItem={({ item }) => {
                const ativo = modalAberto === 'estado' ? item.sigla === uf : item.nome === cidade
                return (
                  <TouchableOpacity
                    style={[estilos.opcao, ativo && estilos.opcaoAtiva]}
                    onPress={() => modalAberto === 'estado' ? handleEstado(item) : handleCidade(item)}
                  >
                    <Text style={[estilos.opcaoTexto, ativo && estilos.opcaoTextoAtivo]}>
                      {modalAberto === 'estado' ? `${item.nome} (${item.sigla})` : item.nome}
                    </Text>
                  </TouchableOpacity>
                )
              }}
              showsVerticalScrollIndicator
              initialNumToRender={25}
              maxToRenderPerBatch={30}
              windowSize={10}
            />
          </View>
        </View>
      </Modal>
    </View>
  )
}

const estilos = StyleSheet.create({
  label: {
    fontSize: 11,
    color: cores.textoFraco,
    letterSpacing: 0.5,
    marginBottom: 7,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  seletor: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: cores.fundoInput,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: raios.medio,
    paddingHorizontal: espacos.lg,
    paddingVertical: 13,
    marginBottom: 2,
  },
  seletorErro: { borderColor: cores.perigo },
  seletorValor: { flex: 1, fontSize: 14, color: cores.textoForte },
  placeholder: { flex: 1, fontSize: 14, color: cores.textoMutado },
  nota: { fontSize: 10, color: cores.textoMutado },
  chevron: { fontSize: 11, color: cores.textoFraco, marginLeft: 8 },
  erroTexto: { fontSize: 11, color: cores.perigo, marginTop: 4, marginBottom: 2 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: cores.fundoCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: '75%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: cores.borda,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetTitulo: {
    fontSize: 14, fontWeight: '600', color: cores.textoForte,
    textAlign: 'center',
    paddingHorizontal: 20, paddingBottom: 12, marginBottom: 4,
    borderBottomWidth: 0.5, borderBottomColor: cores.borda,
  },
  buscaInput: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: cores.fundoInput,
    borderWidth: 0.5,
    borderColor: cores.borda,
    borderRadius: raios.medio,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: cores.textoForte,
  },
  opcao: {
    paddingHorizontal: 20, paddingVertical: 15,
    borderBottomWidth: 0.5, borderBottomColor: cores.fundoElevado,
  },
  opcaoAtiva: { backgroundColor: cores.primariaSuave },
  opcaoTexto: { fontSize: 14, color: cores.textoMedio },
  opcaoTextoAtivo: { color: cores.primaria, fontWeight: '600' },
})
