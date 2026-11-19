// Registro de ocorrencia em cinco passos, igual ao site: foto (analisada pela
// IA), categoria, local, detalhes e confirmacao com os dados de contato.
import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import MapView, { Circle, Marker } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Ajuda, Botao, Campo, Cartao, Chip, Mensagem, Titulo } from '../componentes';
import { CORES, ESPACO } from '../tema';
import { BASE_URL, classificarFoto, criarOcorrencia, obterConfiguracao } from '../api';
import {
  PRECISAO_AVISO_M, PRECISAO_BOA_M, coordenadaPorEndereco, distanciaEmMetros,
  enderecoPorCoordenada, obterPosicaoPrecisa, pedirPermissao, textoComparavel
} from '../localizacao';

export const CHAVE_MEUS_PROTOCOLOS = 'smartgov360.meus-protocolos';
const FOTO_LADO_MAXIMO = 1024;
const FOTO_QUALIDADE = 0.75;
const VERSAO_CONSENTIMENTO = '2026-10';
const CATEGORIA_GENERICA = 'outros';

const PASSOS = [
  'Tire ou envie uma foto do problema',
  'Qual é o problema?',
  'Onde está o problema?',
  'Confira os detalhes',
  'Confirme e envie'
];

const LOCAL_INICIAL = {
  modo: 'gps', localizado: false, lat: null, lng: null, precisao: 0, pontoAjustado: false, ruaLocalizada: '',
  cep: '', street: '', number: '', semNumero: false, neighborhood: '', city: '', state: '',
  msg: '', erro: false, buscando: false, negada: false
};

export default function RegistrarScreen({ navigation }) {
  const [passo, setPasso] = useState(1);
  const [config, setConfig] = useState({ categorias: [], prioridades: ['Baixa', 'Média', 'Alta', 'Urgente'] });
  const [foto, setFoto] = useState(null);           // { uri, base64 }
  const [analise, setAnalise] = useState(null);     // resposta da IA, com fotoToken
  const [analisando, setAnalisando] = useState(false);
  const [msgFoto, setMsgFoto] = useState({ texto: '', erro: false });
  const [categoria, setCategoria] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [local, setLocal] = useState(LOCAL_INICIAL);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msgEnvio, setMsgEnvio] = useState('');
  const [protocolo, setProtocolo] = useState(null);
  const [erros, setErros] = useState({});
  const mapaRef = useRef(null);
  const rolagemRef = useRef(null);
  const buscandoRef = useRef(false);

  useEffect(() => {
    obterConfiguracao().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    rolagemRef.current?.scrollTo({ y: 0, animated: true });
    if (passo === 3 && local.modo === 'gps' && !local.localizado && !local.negada) localizar();
  }, [passo]);

  // ------------------------------------------------------------ passo 1: foto
  async function reduzirFoto(asset) {
    const lado = Math.max(asset.width || 0, asset.height || 0);
    const contexto = ImageManipulator.manipulate(asset.uri);
    if (lado > FOTO_LADO_MAXIMO) {
      const escala = FOTO_LADO_MAXIMO / lado;
      contexto.resize({ width: Math.round(asset.width * escala), height: Math.round(asset.height * escala) });
    }
    const imagem = await contexto.renderAsync();
    const salva = await imagem.saveAsync({ compress: FOTO_QUALIDADE, format: SaveFormat.JPEG, base64: true });
    return { uri: salva.uri, base64: salva.base64 };
  }

  async function escolherFoto(daCamera) {
    setMsgFoto({ texto: '', erro: false });
    const permissao = daCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      setMsgFoto({ texto: daCamera ? 'Permita o acesso à câmera nas configurações do aparelho.' : 'Permita o acesso às fotos nas configurações do aparelho.', erro: true });
      return;
    }
    const opcoes = { quality: 0.9, exif: false, allowsEditing: false };
    const resultado = daCamera
      ? await ImagePicker.launchCameraAsync(opcoes)
      : await ImagePicker.launchImageLibraryAsync({ ...opcoes, mediaTypes: ['images'] });
    if (resultado.canceled || !resultado.assets?.length) return;

    try {
      const reduzida = await reduzirFoto(resultado.assets[0]);
      setFoto(reduzida);
      await analisarFoto(reduzida);
    } catch (error) {
      setMsgFoto({ texto: 'Não foi possível preparar a foto. Tente outra imagem.', erro: true });
    }
  }

  async function analisarFoto(imagem) {
    setAnalise(null);
    setAnalisando(true);
    setMsgFoto({ texto: 'Analisando a foto...', erro: false });
    const resultado = await classificarFoto(imagem.uri, config.categorias, config.prioridades);
    setAnalisando(false);
    if (resultado?.rejeitada) {
      setFoto(null);
      setMsgFoto({ texto: resultado.motivo, erro: true });
      return;
    }
    if (!resultado) {
      setMsgFoto({ texto: 'A verificação da foto está indisponível no momento. Tente de novo em instantes.', erro: true });
      return;
    }
    setAnalise(resultado);
    setCategoria(resultado.category || '');
    setPrioridade(resultado.priority || 'Média');
    if (resultado.title) setTitulo(resultado.title);
    if (resultado.description) setDescricao(resultado.description);
    setMsgFoto({ texto: 'Foto aceita. Categoria, título e descrição foram sugeridos a partir dela; você pode ajustar.', erro: false });
  }

  // ------------------------------------------------------------ passo 3: local
  function atualizarLocal(mudancas) {
    setLocal((atual) => ({ ...atual, ...(typeof mudancas === 'function' ? mudancas(atual) : mudancas) }));
  }

  async function localizar() {
    if (buscandoRef.current) return;
    buscandoRef.current = true;
    atualizarLocal({ buscando: true, msg: 'Obtendo localização...', erro: false });
    try {
      const permissao = await pedirPermissao();
      if (!permissao.concedida) {
        atualizarLocal({ negada: true, msg: 'A localização está bloqueada para o app. Libere nas configurações ou preencha o endereço manualmente.', erro: true });
        return;
      }
      let pos;
      try {
        pos = await obterPosicaoPrecisa();
      } catch (error) {
        atualizarLocal({ msg: 'Não foi possível obter sua localização. Tente de novo ou preencha o endereço manualmente.', erro: true });
        return;
      }
      const { latitude, longitude, accuracy } = pos.coords;
      const precisao = Number.isFinite(accuracy) ? accuracy : 0;
      const endereco = await enderecoPorCoordenada(latitude, longitude);
      if (!endereco) {
        atualizarLocal({ lat: latitude, lng: longitude, precisao, localizado: true, pontoAjustado: false, msg: 'Localização obtida, mas o endereço não foi encontrado. Preencha os campos abaixo.', erro: true });
        return;
      }
      atualizarLocal((atual) => {
        const numeroDigitado = atual.semNumero ? 'S/N' : atual.number.trim();
        const semNumero = !numeroDigitado && !endereco.number;
        const aproximada = precisao > PRECISAO_AVISO_M;
        return {
          lat: latitude, lng: longitude, precisao, localizado: true, pontoAjustado: false, ruaLocalizada: endereco.street,
          cep: endereco.cep, street: endereco.street, neighborhood: endereco.neighborhood, city: endereco.city, state: endereco.state,
          number: numeroDigitado && !atual.semNumero ? atual.number : (endereco.number || ''),
          msg: aproximada
            ? `Localização aproximada (erro de cerca de ${Math.round(precisao)} m). Confira o endereço e arraste o marcador no mapa até o ponto certo.`
            : (semNumero ? 'Localização obtida. Confira o endereço e informe o número.' : 'Endereço preenchido pela sua localização. Confira os dados antes de continuar.'),
          erro: false
        };
      });
      centralizarMapa(latitude, longitude, precisao);
    } finally {
      buscandoRef.current = false;
      atualizarLocal({ buscando: false });
    }
  }

  function centralizarMapa(lat, lng, precisao) {
    const delta = Math.max(0.0025, (precisao || 0) / 30000);
    mapaRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta }, 400);
  }

  async function marcadorArrastado(evento) {
    const { latitude, longitude } = evento.nativeEvent.coordinate;
    atualizarLocal({ lat: latitude, lng: longitude, precisao: 0, pontoAjustado: true, msg: 'Atualizando o endereço do ponto marcado...', erro: false });
    const endereco = await enderecoPorCoordenada(latitude, longitude);
    if (!endereco) {
      atualizarLocal({ msg: 'Não foi possível obter o endereço deste ponto. Confira os campos abaixo.', erro: true });
      return;
    }
    atualizarLocal({
      ruaLocalizada: endereco.street, cep: endereco.cep, street: endereco.street, number: endereco.number, semNumero: false,
      neighborhood: endereco.neighborhood, city: endereco.city, state: endereco.state,
      msg: endereco.number ? 'Endereço atualizado pelo ponto marcado. Confira os dados.' : 'Endereço atualizado. Informe o número.', erro: false
    });
  }

  // Se o cidadao corrigir a rua, ou informar o numero quando a leitura foi
  // aproximada, o ponto passa a seguir o endereco digitado. O marcador
  // arrastado prevalece.
  async function ajustarPontoPeloEndereco() {
    const l = local;
    if (l.modo !== 'gps' || !l.localizado || l.pontoAjustado || l.lat === null) return;
    const rua = l.street.trim();
    const numero = l.semNumero ? '' : l.number.trim();
    if (!rua || !numero) return;
    const ruaAlterada = textoComparavel(rua) !== textoComparavel(l.ruaLocalizada);
    if (!ruaAlterada && l.precisao <= PRECISAO_AVISO_M) return;

    const endereco = [rua, numero, l.city.trim(), l.state.trim(), 'Brasil'].filter(Boolean).join(', ');
    const coords = await coordenadaPorEndereco(endereco);
    if (!coords) return;
    if (distanciaEmMetros(l.lat, l.lng, coords.latitude, coords.longitude) > 5000) return;
    atualizarLocal({ lat: coords.latitude, lng: coords.longitude, precisao: 0, msg: 'Ponto do mapa ajustado para o endereço informado. Confira no mapa e arraste o marcador se preciso.', erro: false });
    centralizarMapa(coords.latitude, coords.longitude, 0);
  }

  // ------------------------------------------------------------ validacao
  function validarPasso(atual) {
    const novos = {};
    if (atual === 1) {
      if (!foto) novos.foto = 'Envie uma foto do problema para continuar.';
      else if (!analise) novos.foto = 'Aguarde a verificação da foto ou tente analisá-la de novo.';
    }
    if (atual === 2 && !categoria) novos.categoria = 'Escolha a categoria que melhor descreve o problema.';
    if (atual === 3) {
      if (local.modo === 'gps' && !local.localizado) novos.local = 'Use sua localização ou escolha preencher o endereço manualmente.';
      if (!local.street.trim()) novos.street = 'Informe o logradouro.';
      if (!local.semNumero && !local.number.trim()) novos.number = 'Informe o número ou marque "Sem número".';
      if (!local.city.trim()) novos.city = 'Informe a cidade.';
    }
    if (atual === 4 && !titulo.trim() && !descricao.trim()) novos.detalhes = 'Informe um título ou uma descrição do problema.';
    if (atual === 5) {
      if (!nome.trim()) novos.nome = 'Informe seu nome.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) novos.email = 'Informe um e-mail válido.';
      if (!aceite) novos.aceite = 'Para enviar, é preciso aceitar o termo de consentimento.';
    }
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  function proximo() {
    if (!validarPasso(passo)) return;
    setPasso((p) => Math.min(5, p + 1));
  }

  function voltar() {
    setErros({});
    setPasso((p) => Math.max(1, p - 1));
  }

  // ------------------------------------------------------------ envio
  async function enviar() {
    if (!validarPasso(5)) return;
    setEnviando(true);
    setMsgEnvio('Registrando a ocorrência...');
    const numero = local.semNumero ? 'S/N' : local.number.trim();
    const usaGps = local.modo === 'gps' && local.lat !== null;
    const ocorrencia = {
      name: nome.trim(),
      email: email.trim(),
      phone: telefone.trim(),
      title: titulo.trim(),
      category: categoria,
      priority: prioridade || 'Média',
      description: descricao.trim(),
      cep: local.cep.trim(),
      street: local.street.trim(),
      number: numero,
      neighborhood: local.neighborhood.trim(),
      city: local.city.trim(),
      state: local.state.trim(),
      address: [local.street.trim(), numero, local.neighborhood.trim(), local.city.trim(), local.state.trim()].filter(Boolean).join(', '),
      latitude: usaGps ? String(local.lat) : '',
      longitude: usaGps ? String(local.lng) : '',
      photoDataUrl: foto ? 'data:image/jpeg;base64,' + foto.base64 : '',
      fotoToken: analise?.fotoToken || '',
      consentimento: { aceito: true, em: new Date().toISOString(), versao: VERSAO_CONSENTIMENTO },
      status: 'Recebido',
      origem: 'app',
      createdAt: new Date().toISOString()
    };
    const resultado = await criarOcorrencia(ocorrencia);
    setEnviando(false);
    if (resultado.erro) {
      setMsgEnvio(resultado.erro);
      return;
    }
    setMsgEnvio('');
    const numeroProtocolo = resultado.incidente?.protocolo;
    setProtocolo(numeroProtocolo || 'registrado');
    await guardarProtocolo(numeroProtocolo, ocorrencia.title || ocorrencia.category);
  }

  async function guardarProtocolo(numero, tituloOcorrencia) {
    if (!Number.isInteger(numero)) return;
    try {
      const lista = JSON.parse((await AsyncStorage.getItem(CHAVE_MEUS_PROTOCOLOS)) || '[]');
      const nova = [{ protocolo: numero, title: tituloOcorrencia, createdAt: new Date().toISOString() }, ...lista.filter((i) => i.protocolo !== numero)].slice(0, 30);
      await AsyncStorage.setItem(CHAVE_MEUS_PROTOCOLOS, JSON.stringify(nova));
    } catch (error) {
      // Lista local e so conveniencia: o protocolo tambem vai por e-mail.
    }
  }

  function novaOcorrencia() {
    setPasso(1); setFoto(null); setAnalise(null); setMsgFoto({ texto: '', erro: false });
    setCategoria(''); setPrioridade(''); setLocal(LOCAL_INICIAL); setTitulo(''); setDescricao('');
    setAceite(false); setMsgEnvio(''); setProtocolo(null); setErros({});
  }

  // ------------------------------------------------------------ telas
  if (protocolo !== null) {
    return (
      <ScrollView style={s.tela} contentContainerStyle={s.conteudo}>
        <Cartao estilo={s.sucesso}>
          <Ionicons name="checkmark-circle" size={56} color={CORES.verde} style={{ alignSelf: 'center' }} />
          <Titulo estilo={{ textAlign: 'center' }}>Ocorrência registrada com sucesso!</Titulo>
          <Ajuda estilo={{ textAlign: 'center' }}>Guarde o número do protocolo para acompanhar o atendimento. Ele também foi enviado para o seu e-mail{telefone ? ' e WhatsApp' : ''}.</Ajuda>
          <View style={s.protocoloCaixa}>
            <Text style={s.protocoloRotulo}>Número de protocolo</Text>
            <Text style={s.protocoloNumero}>{Number.isInteger(protocolo) ? '#' + protocolo : protocolo}</Text>
            {Number.isInteger(protocolo) ? (
              <Botao tipo="link" titulo="Copiar número" onPress={() => Clipboard.setStringAsync(String(protocolo))} />
            ) : null}
          </View>
          <Botao titulo="Acompanhar esta ocorrência" onPress={() => navigation.navigate('Acompanhar', { protocolo: String(protocolo) })} estilo={{ marginBottom: 10 }} />
          <Botao tipo="secundario" titulo="Registrar nova ocorrência" onPress={novaOcorrencia} />
        </Cartao>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={s.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={rolagemRef} contentContainerStyle={s.conteudo} keyboardShouldPersistTaps="handled">
        <View style={s.passoCabecalho}>
          <Text style={s.passoContador}>Passo {passo} de 5</Text>
          <View style={s.barra}><View style={[s.barraCheia, { width: `${(passo / 5) * 100}%` }]} /></View>
        </View>
        <Cartao>
          <Titulo>{PASSOS[passo - 1]}</Titulo>

          {passo === 1 && (
            <View>
              <Ajuda>A foto é analisada na hora: verificamos se mostra um problema urbano e já sugerimos a categoria, o título e a descrição.</Ajuda>
              {foto ? <Image source={{ uri: foto.uri }} style={s.previa} resizeMode="cover" /> : (
                <View style={s.previaVazia}><Ionicons name="camera-outline" size={44} color={CORES.cinzaTexto} /><Text style={s.previaTexto}>Nenhuma foto escolhida</Text></View>
              )}
              <View style={s.linhaBotoes}>
                <Botao titulo="Tirar foto" onPress={() => escolherFoto(true)} desabilitado={analisando} estilo={s.meio} />
                <Botao tipo="secundario" titulo="Escolher da galeria" onPress={() => escolherFoto(false)} desabilitado={analisando} estilo={s.meio} />
              </View>
              {foto && !analise && !analisando ? <Botao tipo="link" titulo="Analisar a foto de novo" onPress={() => analisarFoto(foto)} /> : null}
              {foto && !analisando ? <Botao tipo="link" titulo="Remover foto" onPress={() => { setFoto(null); setAnalise(null); setMsgFoto({ texto: '', erro: false }); }} /> : null}
              <Mensagem texto={msgFoto.texto} erro={msgFoto.erro} />
              {erros.foto ? <Text style={s.erro}>{erros.foto}</Text> : null}
            </View>
          )}

          {passo === 2 && (
            <View>
              <Ajuda>{analise?.category ? 'A categoria foi sugerida a partir da foto. Troque se preferir.' : 'Selecione a categoria que melhor descreve a sua ocorrência.'}</Ajuda>
              <View style={s.chips}>
                {(config.categorias.length ? config.categorias : [CATEGORIA_GENERICA]).map((c) => (
                  <Chip key={c} titulo={c} selecionado={textoComparavel(c) === textoComparavel(categoria)} onPress={() => { setCategoria(c); setErros({}); }} />
                ))}
              </View>
              {erros.categoria ? <Text style={s.erro}>{erros.categoria}</Text> : null}
            </View>
          )}

          {passo === 3 && (
            <View>
              <Ajuda>Use a sua localização ou informe o endereço. Confira sempre o número.</Ajuda>
              <View style={s.chips}>
                <Chip titulo="Usar minha localização" selecionado={local.modo === 'gps'} onPress={() => { atualizarLocal({ modo: 'gps' }); if (!local.localizado) localizar(); }} />
                <Chip titulo="Informar o endereço" selecionado={local.modo === 'manual'} onPress={() => atualizarLocal({ modo: 'manual', msg: '', erro: false })} />
              </View>

              {local.modo === 'gps' && (
                <View>
                  <Mensagem texto={local.msg} erro={local.erro} />
                  {local.negada ? <Botao tipo="link" titulo="Abrir configurações do aparelho" onPress={() => Linking.openSettings()} /> : null}
                  {!local.buscando ? <Botao tipo="secundario" titulo={local.localizado ? 'Localizar de novo' : 'Usar minha localização'} onPress={localizar} estilo={{ marginBottom: 12 }} /> : null}
                  {local.localizado && local.lat !== null && (
                    <View>
                      <MapView
                        ref={mapaRef}
                        style={s.mapa}
                        initialRegion={{ latitude: local.lat, longitude: local.lng, latitudeDelta: 0.0025, longitudeDelta: 0.0025 }}
                        showsUserLocation
                        toolbarEnabled={false}
                      >
                        <Marker coordinate={{ latitude: local.lat, longitude: local.lng }} draggable onDragEnd={marcadorArrastado} title="Arraste para ajustar" />
                        {local.precisao > PRECISAO_BOA_M ? (
                          <Circle center={{ latitude: local.lat, longitude: local.lng }} radius={local.precisao} strokeColor="rgba(29,78,216,0.6)" fillColor="rgba(59,130,246,0.12)" />
                        ) : null}
                      </MapView>
                      <Ajuda>Arraste o marcador para ajustar o ponto exato. O endereço abaixo é atualizado.</Ajuda>
                    </View>
                  )}
                </View>
              )}

              {(local.modo === 'manual' || local.localizado) && (
                <View style={{ marginTop: 10 }}>
                  <Campo rotulo="CEP" value={local.cep} onChangeText={(v) => atualizarLocal({ cep: v })} placeholder="00000-000" keyboardType="numeric" />
                  <Campo rotulo="Logradouro" value={local.street} onChangeText={(v) => atualizarLocal({ street: v })} onEndEditing={ajustarPontoPeloEndereco} placeholder="Rua, avenida, travessa..." erro={erros.street} />
                  <Campo rotulo="Número" value={local.semNumero ? 'S/N' : local.number} onChangeText={(v) => atualizarLocal({ number: v })} onEndEditing={ajustarPontoPeloEndereco} placeholder="Ex.: 123" keyboardType="numeric" editable={!local.semNumero} erro={erros.number} />
                  <View style={s.linhaSwitch}>
                    <Switch value={local.semNumero} onValueChange={(v) => atualizarLocal({ semNumero: v, number: v ? '' : local.number })} trackColor={{ true: CORES.azulBorda }} thumbColor={local.semNumero ? CORES.azul : '#fff'} />
                    <Text style={s.switchTexto}>Sem número</Text>
                  </View>
                  <Campo rotulo="Bairro" value={local.neighborhood} onChangeText={(v) => atualizarLocal({ neighborhood: v })} placeholder="Bairro" />
                  <View style={s.linhaBotoes}>
                    <Campo rotulo="Cidade" value={local.city} onChangeText={(v) => atualizarLocal({ city: v })} placeholder="Cidade" estilo={[s.meio, { flex: 2 }]} erro={erros.city} />
                    <Campo rotulo="UF" value={local.state} onChangeText={(v) => atualizarLocal({ state: v.toUpperCase() })} placeholder="UF" maxLength={2} autoCapitalize="characters" estilo={[s.meio, { flex: 1 }]} />
                  </View>
                </View>
              )}
              {erros.local ? <Text style={s.erro}>{erros.local}</Text> : null}
            </View>
          )}

          {passo === 4 && (
            <View>
              <Ajuda>{analise?.title ? 'Título e descrição foram preenchidos a partir da foto. Ajuste como quiser.' : 'Descreva o problema para a equipe da Prefeitura.'}</Ajuda>
              <Campo rotulo="Título da ocorrência" value={titulo} onChangeText={setTitulo} maxLength={120} placeholder="Ex.: Buraco na rua" />
              <Campo rotulo="Descrição" value={descricao} onChangeText={setDescricao} maxLength={500} multiline placeholder="Descreva o problema: o que é, desde quando, pontos de referência." />
              {erros.detalhes ? <Text style={s.erro}>{erros.detalhes}</Text> : null}
            </View>
          )}

          {passo === 5 && (
            <View>
              <Ajuda>Verifique as informações antes de registrar.</Ajuda>
              <View style={s.resumo}>
                {foto ? <Image source={{ uri: foto.uri }} style={s.resumoFoto} /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={s.resumoTitulo}>{titulo || descricao || 'Ocorrência'}</Text>
                  <Text style={s.resumoLinha}>Categoria: <Text style={s.resumoValor}>{categoria}</Text></Text>
                  <Text style={s.resumoLinha}>Local: <Text style={s.resumoValor}>{[local.street, local.semNumero ? 'S/N' : local.number, local.neighborhood, local.city].filter(Boolean).join(', ')}</Text></Text>
                </View>
              </View>
              <Text style={s.subtitulo}>Seus dados para contato</Text>
              <Ajuda>Usados só para enviar o protocolo e as atualizações desta ocorrência.</Ajuda>
              <Campo rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Seu nome" autoCapitalize="words" erro={erros.nome} />
              <Campo rotulo="E-mail" value={email} onChangeText={setEmail} placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} erro={erros.email} />
              <Campo rotulo="WhatsApp (opcional)" value={telefone} onChangeText={setTelefone} placeholder="(11) 99999-9999" keyboardType="phone-pad" />
              <View style={s.linhaSwitch}>
                <Switch value={aceite} onValueChange={setAceite} trackColor={{ true: CORES.azulBorda }} thumbColor={aceite ? CORES.azul : '#fff'} />
                <Text style={s.consentimento}>
                  <Text style={{ fontWeight: '700' }}>Eu aceito</Text> que meus dados (nome, e-mail, telefone, foto e localização) sejam usados pela Prefeitura para atender esta solicitação e para me enviar atualizações sobre ela por e-mail e WhatsApp, conforme a{' '}
                  <Text style={s.link} onPress={() => Linking.openURL(BASE_URL + '/privacidade.html')}>Política de Privacidade</Text> (LGPD).
                </Text>
              </View>
              {erros.aceite ? <Text style={s.erro}>{erros.aceite}</Text> : null}
              <Mensagem texto={msgEnvio} erro={Boolean(msgEnvio) && !enviando} />
            </View>
          )}

          <View style={s.navegacao}>
            {passo > 1 ? <Botao tipo="link" titulo="← Voltar" onPress={voltar} desabilitado={enviando} /> : <View />}
            {passo < 5
              ? <Botao titulo="Próximo →" onPress={proximo} desabilitado={analisando || local.buscando} />
              : <Botao titulo="Enviar ocorrência" onPress={enviar} carregando={enviando} />}
          </View>
        </Cartao>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CORES.fundo },
  conteudo: { padding: ESPACO, paddingBottom: 40 },
  passoCabecalho: { marginBottom: 12 },
  passoContador: { color: CORES.cinzaTexto, fontWeight: '600', marginBottom: 6 },
  barra: { height: 6, backgroundColor: CORES.borda, borderRadius: 3, overflow: 'hidden' },
  barraCheia: { height: 6, backgroundColor: CORES.azul },
  previa: { width: '100%', height: 220, borderRadius: 12, marginVertical: 12, backgroundColor: CORES.borda },
  previaVazia: { height: 160, borderRadius: 12, marginVertical: 12, backgroundColor: CORES.fundo, borderWidth: 1, borderColor: CORES.borda, alignItems: 'center', justifyContent: 'center' },
  previaTexto: { color: CORES.cinzaTexto, marginTop: 6 },
  linhaBotoes: { flexDirection: 'row', gap: 10 },
  meio: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  mapa: { width: '100%', height: 240, borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  linhaSwitch: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  switchTexto: { color: CORES.tinta, fontSize: 15 },
  consentimento: { flex: 1, color: CORES.tinta, fontSize: 14, lineHeight: 20 },
  link: { color: CORES.azul, textDecorationLine: 'underline' },
  subtitulo: { fontSize: 16, fontWeight: '700', color: CORES.tinta, marginTop: 14 },
  resumo: { flexDirection: 'row', gap: 12, backgroundColor: CORES.azulClaro, borderRadius: 12, padding: 12, marginTop: 10 },
  resumoFoto: { width: 72, height: 72, borderRadius: 10 },
  resumoTitulo: { fontWeight: '700', color: CORES.tinta, marginBottom: 4 },
  resumoLinha: { color: CORES.cinzaTexto, fontSize: 13, lineHeight: 18 },
  resumoValor: { color: CORES.tinta },
  navegacao: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 },
  erro: { color: CORES.vermelho, marginTop: 8 },
  sucesso: { marginTop: 24, alignItems: 'stretch' },
  protocoloCaixa: { backgroundColor: CORES.azulClaro, borderRadius: 14, padding: 16, alignItems: 'center', marginVertical: 18 },
  protocoloRotulo: { color: CORES.cinzaTexto, fontWeight: '600' },
  protocoloNumero: { fontSize: 36, fontWeight: '800', color: CORES.azulEscuro, marginVertical: 4 }
});
