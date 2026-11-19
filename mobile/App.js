// SmartGov 360 - app do cidadao (Android e iOS). Usa a mesma API do site
// www.360smartgov.com.br; o painel da prefeitura abre dentro do app.
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { CORES } from './src/tema';
import RegistrarScreen from './src/screens/RegistrarScreen';
import AcompanharScreen from './src/screens/AcompanharScreen';
import PublicacoesScreen from './src/screens/PublicacoesScreen';
import PainelScreen from './src/screens/PainelScreen';
import AvaliarScreen from './src/screens/AvaliarScreen';

const Tabs = createBottomTabNavigator();
const Pilha = createNativeStackNavigator();

const ICONES = {
  Registrar: 'camera',
  Acompanhar: 'search',
  Prefeitura: 'megaphone',
  Painel: 'briefcase'
};

function Cabecalho({ titulo }) {
  return (
    <View style={s.cabecalho}>
      <Image source={require('./assets/brasao-municipio.png')} style={s.brasao} resizeMode="contain" />
      <View>
        <Text style={s.marca}>SmartGov 360</Text>
        <Text style={s.subtitulo}>{titulo}</Text>
      </View>
    </View>
  );
}

function Abas() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerTitle: () => <Cabecalho titulo={TITULOS[route.name]} />,
        headerStyle: { backgroundColor: CORES.branco },
        headerShadowVisible: true,
        tabBarActiveTintColor: CORES.azul,
        tabBarInactiveTintColor: CORES.cinzaTexto,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons name={focused ? ICONES[route.name] : ICONES[route.name] + '-outline'} size={size} color={color} />
        )
      })}
    >
      <Tabs.Screen name="Registrar" component={RegistrarScreen} options={{ title: 'Registrar' }} />
      <Tabs.Screen name="Acompanhar" component={AcompanharScreen} options={{ title: 'Acompanhar' }} />
      <Tabs.Screen name="Prefeitura" component={PublicacoesScreen} options={{ title: 'Prefeitura' }} />
      <Tabs.Screen name="Painel" component={PainelScreen} options={{ title: 'Painel', headerShown: false }} />
    </Tabs.Navigator>
  );
}

const TITULOS = {
  Registrar: 'Registrar uma ocorrência',
  Acompanhar: 'Acompanhar atendimento',
  Prefeitura: 'Ações da Prefeitura',
  Painel: 'Painel da Prefeitura'
};

// Links do site abrem direto na tela certa: o link de avaliacao enviado por
// e-mail/WhatsApp (avaliar.html?t=...) e o de acompanhamento (?protocolo=...).
const linking = {
  prefixes: [Linking.createURL('/'), 'https://www.360smartgov.com.br', 'https://360smartgov.com.br'],
  config: {
    screens: {
      Abas: {
        screens: {
          Registrar: 'index.html',
          Acompanhar: 'acompanhar',
          Prefeitura: 'prefeitura',
          Painel: 'login.html'
        }
      },
      Avaliar: 'avaliar.html'
    }
  }
};

const tema = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: CORES.azul, background: CORES.fundo, card: CORES.branco, text: CORES.tinta, border: CORES.borda }
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking} theme={tema}>
        <StatusBar style="dark" />
        <Pilha.Navigator>
          <Pilha.Screen name="Abas" component={Abas} options={{ headerShown: false }} />
          <Pilha.Screen name="Avaliar" component={AvaliarScreen} options={{ title: 'Avaliar o atendimento', headerTintColor: CORES.azulEscuro }} />
        </Pilha.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brasao: { width: 34, height: 34 },
  marca: { fontWeight: '800', color: CORES.azulEscuro, fontSize: 16 },
  subtitulo: { color: CORES.cinzaTexto, fontSize: 12 }
});
