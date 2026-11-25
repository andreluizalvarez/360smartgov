// Painel da prefeitura (login, ocorrencias, mapa, secretarias, usuarios,
// visao executiva, publicacoes): e o mesmo painel do site, aberto dentro do
// app. Assim toda funcionalidade nova do painel chega ao app sem nova versao
// nas lojas.
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Botao } from '../componentes';
import { CORES } from '../tema';
import { BASE_URL } from '../api';

const URL_PAINEL = BASE_URL + '/login.html';

export default function PainelScreen() {
  const webRef = useRef(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [podeVoltar, setPodeVoltar] = useState(false);

  function aoNavegar(pedido) {
    // Links externos (politica, sites de terceiros) e os relatorios em PDF
    // abrem no navegador do aparelho, que mostra, imprime e compartilha.
    if (!pedido.url.startsWith(BASE_URL) || pedido.url.includes('/produtividade/pdf/')) {
      Linking.openURL(pedido.url).catch(() => {});
      return false;
    }
    return true;
  }

  return (
    <View style={s.tela}>
      <View style={s.barra}>
        <Pressable onPress={() => webRef.current?.goBack()} disabled={!podeVoltar} style={s.icone} accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={22} color={podeVoltar ? CORES.azulEscuro : CORES.borda} />
        </Pressable>
        <Text style={s.titulo}>Painel da Prefeitura</Text>
        <Pressable onPress={() => webRef.current?.reload()} style={s.icone} accessibilityLabel="Recarregar">
          <Ionicons name="refresh" size={22} color={CORES.azulEscuro} />
        </Pressable>
        <Pressable onPress={() => Linking.openURL(URL_PAINEL)} style={s.icone} accessibilityLabel="Abrir no navegador">
          <Ionicons name="open-outline" size={22} color={CORES.azulEscuro} />
        </Pressable>
      </View>

      {falhou ? (
        <View style={s.erro}>
          <Ionicons name="cloud-offline-outline" size={44} color={CORES.cinzaTexto} />
          <Text style={s.erroTexto}>Não foi possível abrir o painel. Verifique sua conexão.</Text>
          <Botao titulo="Tentar de novo" onPress={() => { setFalhou(false); setCarregando(true); webRef.current?.reload(); }} />
        </View>
      ) : (
        <WebView
          ref={webRef}
          source={{ uri: URL_PAINEL }}
          style={s.web}
          onLoadStart={() => setCarregando(true)}
          onLoadEnd={() => setCarregando(false)}
          onError={() => { setCarregando(false); setFalhou(true); }}
          onNavigationStateChange={(estado) => setPodeVoltar(estado.canGoBack)}
          onShouldStartLoadWithRequest={aoNavegar}
          geolocationEnabled
          domStorageEnabled
          javaScriptEnabled
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          mediaPlaybackRequiresUserAction={false}
          {...(Platform.OS === 'android' ? { mixedContentMode: 'never' } : {})}
        />
      )}
      {carregando && !falhou ? <ActivityIndicator style={s.carregando} color={CORES.azul} size="large" /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, backgroundColor: CORES.branco },
  barra: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: CORES.borda, backgroundColor: CORES.branco },
  titulo: { flex: 1, fontWeight: '700', color: CORES.tinta, fontSize: 16, marginLeft: 4 },
  icone: { padding: 8 },
  web: { flex: 1 },
  carregando: { position: 'absolute', top: '45%', left: 0, right: 0 },
  erro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  erroTexto: { color: CORES.cinzaTexto, textAlign: 'center' }
});
