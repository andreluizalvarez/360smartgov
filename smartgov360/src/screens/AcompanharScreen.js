// Acompanhamento pelo numero de protocolo, lista dos protocolos abertos neste
// aparelho e ocorrencias recentes da cidade, como na pagina inicial do site.
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Ajuda, Botao, Campo, Cartao, Etiqueta, Mensagem, Titulo } from '../componentes';
import { CORES, ESPACO, dataCurta } from '../tema';
import { consultarProtocolo, ocorrenciasRecentes } from '../api';
import { CHAVE_MEUS_PROTOCOLOS } from './RegistrarScreen';

function LinhaDoTempo({ o }) {
  const etapa = (status) => (o.etapas || []).find((e) => e.status === status);
  const emAndamento = etapa('Em andamento');
  const concluido = o.status === 'Concluído' ? (etapa('Concluído') || { at: o.concluidoEm }) : null;
  const itens = [
    { titulo: 'Recebido', data: dataCurta(o.createdAt), texto: 'Sua ocorrência foi recebida pela prefeitura.', estado: 'feito' },
    {
      titulo: 'Em andamento', data: emAndamento ? dataCurta(emAndamento.at) : '',
      texto: emAndamento ? 'A equipe responsável foi designada.' : 'Aguardando o encaminhamento ao setor responsável.',
      estado: emAndamento && concluido ? 'feito' : emAndamento ? 'atual' : 'pendente'
    },
    {
      titulo: 'Concluído', data: concluido ? dataCurta(concluido.at) : '',
      texto: concluido ? (o.respostaConclusao || 'Atendimento concluído.') : 'Você será avisado quando o serviço for concluído.',
      estado: concluido ? 'feito' : 'pendente'
    },
    {
      titulo: 'Avalie o atendimento', data: '',
      texto: o.avaliada ? 'Obrigado pela sua avaliação' + (o.nota ? ` (${o.nota}/5).` : '.') : (concluido ? 'Use o link enviado para o seu e-mail ou WhatsApp.' : 'Disponível após a conclusão.'),
      estado: o.avaliada ? 'feito' : 'pendente'
    }
  ];
  return (
    <View style={s.linhaTempo}>
      {itens.map((item, i) => (
        <View key={item.titulo} style={s.etapa}>
          <View style={s.colunaPonto}>
            <View style={[s.ponto, item.estado === 'feito' && s.pontoFeito, item.estado === 'atual' && s.pontoAtual]} />
            {i < itens.length - 1 ? <View style={[s.traco, item.estado === 'feito' && s.tracoFeito]} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 14 }}>
            <Text style={[s.etapaTitulo, item.estado === 'pendente' && { color: CORES.cinzaTexto }]}>{item.titulo}</Text>
            {item.data ? <Text style={s.etapaData}>{item.data}</Text> : null}
            <Text style={s.etapaTexto}>{item.texto}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function AcompanharScreen({ route, navigation }) {
  const [numero, setNumero] = useState('');
  const [consultando, setConsultando] = useState(false);
  const [erro, setErro] = useState('');
  const [ocorrencia, setOcorrencia] = useState(null);
  const [detalhes, setDetalhes] = useState(false);
  const [meus, setMeus] = useState([]);
  const [recentes, setRecentes] = useState([]);

  const buscar = useCallback(async (valor) => {
    const limpo = (valor || '').toString().replace(/\D/g, '');
    setNumero(limpo);
    setErro('');
    setOcorrencia(null);
    setDetalhes(false);
    if (!limpo) {
      setErro('Digite o número do protocolo.');
      return;
    }
    setConsultando(true);
    const resultado = await consultarProtocolo(limpo);
    setConsultando(false);
    if (resultado.erro) setErro(resultado.erro);
    else setOcorrencia(resultado.ocorrencia);
  }, []);

  useEffect(() => {
    const doLink = route.params?.protocolo;
    if (doLink) {
      buscar(doLink);
      navigation.setParams({ protocolo: undefined });
    }
  }, [route.params?.protocolo]);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(CHAVE_MEUS_PROTOCOLOS).then((v) => setMeus(JSON.parse(v || '[]'))).catch(() => setMeus([]));
    ocorrenciasRecentes().then(setRecentes).catch(() => {});
  }, []));

  const local = ocorrencia ? [ocorrencia.street, ocorrencia.neighborhood, [ocorrencia.city, ocorrencia.state].filter(Boolean).join(' - ')].filter(Boolean).join(', ') : '';

  return (
    <ScrollView style={s.tela} contentContainerStyle={s.conteudo} keyboardShouldPersistTaps="handled">
      <Cartao>
        <Titulo>Acompanhar ocorrência</Titulo>
        <Ajuda>Digite o número de protocolo que você recebeu por e-mail ou WhatsApp.</Ajuda>
        <View style={s.linhaBusca}>
          <Campo value={numero} onChangeText={setNumero} placeholder="Ex.: 1023" keyboardType="numeric" estilo={{ flex: 1, marginBottom: 0 }} onSubmitEditing={() => buscar(numero)} returnKeyType="search" />
          <Botao titulo="Consultar" onPress={() => buscar(numero)} carregando={consultando} />
        </View>
        <Mensagem texto={erro} erro />
        {ocorrencia && (
          <View style={s.resultado}>
            <View style={s.cabecalho}>
              <View style={{ flex: 1 }}>
                <Text style={s.protocolo}>#{ocorrencia.protocolo}</Text>
                <Text style={s.tituloOcorrencia}>{ocorrencia.title || 'Ocorrência'}</Text>
                <Text style={s.data}>{dataCurta(ocorrencia.createdAt)}</Text>
              </View>
              <Etiqueta status={ocorrencia.status} />
            </View>
            <LinhaDoTempo o={ocorrencia} />
            <Pressable onPress={() => setDetalhes((d) => !d)} style={s.detalhesBotao}>
              <Text style={s.detalhesTexto}>{detalhes ? 'Ocultar detalhes' : 'Ver detalhes da ocorrência'}</Text>
              <Ionicons name={detalhes ? 'chevron-up' : 'chevron-down'} size={18} color={CORES.azul} />
            </Pressable>
            {detalhes && (
              <View style={s.detalhes}>
                <Text style={s.detalheLinha}><Text style={s.detalheRotulo}>Categoria: </Text>{ocorrencia.category || '—'}</Text>
                <Text style={s.detalheLinha}><Text style={s.detalheRotulo}>Endereço: </Text>{local || '—'}</Text>
                <Text style={s.detalheLinha}><Text style={s.detalheRotulo}>Descrição: </Text>{ocorrencia.description || '—'}</Text>
                {ocorrencia.respostaConclusao ? <Text style={s.detalheLinha}><Text style={s.detalheRotulo}>Resposta da Prefeitura: </Text>{ocorrencia.respostaConclusao}</Text> : null}
              </View>
            )}
          </View>
        )}
      </Cartao>

      {meus.length > 0 && (
        <Cartao>
          <Titulo>Meus protocolos</Titulo>
          <Ajuda>Ocorrências registradas neste aparelho. Toque para consultar.</Ajuda>
          {meus.map((item) => (
            <Pressable key={item.protocolo} onPress={() => buscar(String(item.protocolo))} style={s.item}>
              <Ionicons name="document-text-outline" size={22} color={CORES.azul} />
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitulo}>#{item.protocolo} · {item.title || 'Ocorrência'}</Text>
                <Text style={s.itemSub}>{dataCurta(item.createdAt)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={CORES.cinzaTexto} />
            </Pressable>
          ))}
        </Cartao>
      )}

      <Cartao>
        <Titulo>Ocorrências recentes</Titulo>
        {recentes.length === 0 ? <Ajuda>Ainda não há ocorrências registradas.</Ajuda> : recentes.map((i) => (
          <Pressable key={i.protocolo} onPress={() => buscar(String(i.protocolo))} style={s.item}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitulo}>{i.title || 'Ocorrência'}</Text>
              <Text style={s.itemSub}>#{i.protocolo} · {i.neighborhood || i.city || ''} · {dataCurta(i.createdAt)}</Text>
            </View>
            <Etiqueta status={i.status} />
          </Pressable>
        ))}
      </Cartao>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CORES.fundo },
  conteudo: { padding: ESPACO, paddingBottom: 40 },
  linhaBusca: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginTop: 10 },
  resultado: { marginTop: 16, borderTopWidth: 1, borderTopColor: CORES.borda, paddingTop: 14 },
  cabecalho: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  protocolo: { fontSize: 22, fontWeight: '800', color: CORES.azulEscuro },
  tituloOcorrencia: { fontSize: 16, color: CORES.tinta, fontWeight: '600' },
  data: { color: CORES.cinzaTexto, fontSize: 13 },
  linhaTempo: { marginTop: 4 },
  etapa: { flexDirection: 'row', gap: 12 },
  colunaPonto: { alignItems: 'center', width: 18 },
  ponto: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: CORES.borda, backgroundColor: CORES.branco, marginTop: 3 },
  pontoFeito: { backgroundColor: CORES.verde, borderColor: CORES.verde },
  pontoAtual: { backgroundColor: CORES.amarelo, borderColor: CORES.amarelo },
  traco: { flex: 1, width: 2, backgroundColor: CORES.borda, marginVertical: 2 },
  tracoFeito: { backgroundColor: CORES.verde },
  etapaTitulo: { fontWeight: '700', color: CORES.tinta },
  etapaData: { color: CORES.cinzaTexto, fontSize: 12 },
  etapaTexto: { color: CORES.cinzaTexto, fontSize: 13, lineHeight: 18 },
  detalhesBotao: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  detalhesTexto: { color: CORES.azul, fontWeight: '600' },
  detalhes: { backgroundColor: CORES.fundo, borderRadius: 12, padding: 12 },
  detalheLinha: { color: CORES.tinta, lineHeight: 20, marginBottom: 4 },
  detalheRotulo: { fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CORES.borda },
  itemTitulo: { color: CORES.tinta, fontWeight: '600' },
  itemSub: { color: CORES.cinzaTexto, fontSize: 12, marginTop: 2 }
});
