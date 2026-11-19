// "Acoes da Prefeitura": campanhas, servicos e novidades publicadas pelo painel.
import React, { useCallback, useState } from 'react';
import { Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Ajuda, Botao, Cartao, Titulo } from '../componentes';
import { CORES, ESPACO, dataCurta } from '../tema';
import { publicacoesAtivas } from '../api';

export default function PublicacoesScreen() {
  const [lista, setLista] = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setLista(await publicacoesAtivas());
    } catch (error) {
      setLista([]);
    } finally {
      setAtualizando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  return (
    <ScrollView
      style={s.tela}
      contentContainerStyle={s.conteudo}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
    >
      <Titulo>Ações da Prefeitura</Titulo>
      <Ajuda estilo={{ marginBottom: 14 }}>Campanhas, serviços e novidades da Prefeitura para você.</Ajuda>

      {lista === null ? <Ajuda>Carregando...</Ajuda> : null}
      {lista && lista.length === 0 ? (
        <Cartao estilo={{ alignItems: 'center' }}>
          <Ionicons name="megaphone-outline" size={40} color={CORES.cinzaTexto} />
          <Ajuda estilo={{ textAlign: 'center', marginTop: 8 }}>Nenhuma publicação no momento. Volte em breve.</Ajuda>
        </Cartao>
      ) : null}

      {(lista || []).map((p) => (
        <Cartao key={p.id} estilo={{ padding: 0, overflow: 'hidden' }}>
          {p.imagem ? <Image source={{ uri: p.imagem }} style={s.imagem} resizeMode="cover" /> : null}
          <View style={{ padding: ESPACO }}>
            <Text style={s.titulo}>{p.titulo}</Text>
            {p.criadoEm ? <Text style={s.data}>{dataCurta(p.criadoEm)}</Text> : null}
            {p.texto ? <Text style={s.texto}>{p.texto}</Text> : null}
            {p.link ? <Botao tipo="secundario" titulo="Saiba mais" onPress={() => Linking.openURL(p.link)} estilo={{ marginTop: 12 }} /> : null}
          </View>
        </Cartao>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CORES.fundo },
  conteudo: { padding: ESPACO, paddingBottom: 40 },
  imagem: { width: '100%', height: 180, backgroundColor: CORES.borda },
  titulo: { fontSize: 17, fontWeight: '700', color: CORES.tinta },
  data: { color: CORES.cinzaTexto, fontSize: 12, marginTop: 2, marginBottom: 8 },
  texto: { color: CORES.tinta, lineHeight: 21 }
});
