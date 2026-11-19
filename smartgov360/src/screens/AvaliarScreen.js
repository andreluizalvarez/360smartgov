// Pesquisa de satisfacao: aberta pelo link unico (www.360smartgov.com.br/avaliar.html?t=...)
// enviado ao cidadao na conclusao. Mesmas regras da pagina do site.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Ajuda, Botao, Campo, Cartao, Etiqueta, Mensagem, Titulo } from '../componentes';
import { CORES, ESPACO } from '../tema';
import { consultarAvaliacao, registrarAvaliacao } from '../api';

const LEGENDAS = { 1: 'Muito ruim', 2: 'Ruim', 3: 'Regular', 4: 'Bom', 5: 'Excelente' };

export default function AvaliarScreen({ route }) {
  const token = (route.params?.t || '').toString().trim();
  const [intro, setIntro] = useState('Carregando...');
  const [ocorrencia, setOcorrencia] = useState(null);
  const [podeAvaliar, setPodeAvaliar] = useState(false);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState({ texto: '', erro: false });

  useEffect(() => {
    if (!token) {
      setIntro('Para avaliar um atendimento, abra o link de avaliação enviado para o seu e-mail ou WhatsApp quando a ocorrência for concluída.');
      return;
    }
    consultarAvaliacao(token).then((r) => {
      if (r.erro) {
        setIntro(r.erro);
        return;
      }
      const o = r.ocorrencia;
      setOcorrencia(o);
      if (o.avaliada) setIntro('Esta solicitação já foi avaliada. Obrigado pela sua participação!');
      else if (o.status !== 'Concluído') setIntro('A avaliação fica disponível depois que a solicitação for concluída.');
      else {
        setIntro('Sua opinião ajuda a Prefeitura a melhorar os serviços. Leva menos de um minuto.');
        setPodeAvaliar(true);
      }
    }).catch(() => setIntro('Não foi possível carregar a avaliação. Tente novamente mais tarde.'));
  }, [token]);

  async function enviar() {
    if (!nota) {
      setMsg({ texto: 'Escolha uma nota de 1 a 5 estrelas.', erro: true });
      return;
    }
    setEnviando(true);
    const r = await registrarAvaliacao(token, nota, comentario.trim());
    setEnviando(false);
    if (r.erro) {
      setMsg({ texto: r.erro, erro: true });
      return;
    }
    setPodeAvaliar(false);
    setIntro('Avaliação enviada. Obrigado pela sua participação!');
    setMsg({ texto: '', erro: false });
  }

  return (
    <ScrollView style={s.tela} contentContainerStyle={s.conteudo} keyboardShouldPersistTaps="handled">
      <Cartao>
        <Titulo>Avalie o atendimento</Titulo>
        <Ajuda>{intro}</Ajuda>
        {ocorrencia && (
          <View style={s.resumo}>
            <Text style={s.resumoTitulo}>{ocorrencia.title || '—'}</Text>
            <Text style={s.resumoLinha}>Categoria: {ocorrencia.category || '—'}</Text>
            <View style={{ marginTop: 6 }}><Etiqueta status={ocorrencia.status} /></View>
            {ocorrencia.respostaConclusao ? <Text style={[s.resumoLinha, { marginTop: 8 }]}><Text style={{ fontWeight: '700' }}>Resposta da Prefeitura: </Text>{ocorrencia.respostaConclusao}</Text> : null}
          </View>
        )}
        {podeAvaliar && (
          <View style={{ marginTop: 16 }}>
            <Text style={s.pergunta}>Como você avalia o atendimento?</Text>
            <View style={s.estrelas}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setNota(n)} accessibilityLabel={`${n} estrela${n > 1 ? 's' : ''}`} hitSlop={6}>
                  <Ionicons name={n <= nota ? 'star' : 'star-outline'} size={40} color={n <= nota ? CORES.amarelo : CORES.cinzaTexto} />
                </Pressable>
              ))}
            </View>
            <Text style={s.legenda}>{LEGENDAS[nota] || ' '}</Text>
            <Campo rotulo="Comentário (opcional)" value={comentario} onChangeText={setComentario} multiline maxLength={1000} placeholder="Conte como foi o atendimento." />
            <Mensagem texto={msg.texto} erro={msg.erro} />
            <Botao titulo="Enviar avaliação" onPress={enviar} carregando={enviando} />
          </View>
        )}
      </Cartao>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CORES.fundo },
  conteudo: { padding: ESPACO, paddingBottom: 40 },
  resumo: { backgroundColor: CORES.azulClaro, borderRadius: 12, padding: 12, marginTop: 12 },
  resumoTitulo: { fontWeight: '700', color: CORES.tinta, fontSize: 16 },
  resumoLinha: { color: CORES.tinta, marginTop: 2, lineHeight: 20 },
  pergunta: { fontWeight: '700', color: CORES.tinta, fontSize: 16, marginBottom: 8 },
  estrelas: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  legenda: { textAlign: 'center', color: CORES.cinzaTexto, marginVertical: 8, minHeight: 18 }
});
