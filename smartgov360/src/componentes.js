import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CORES, ESPACO, RAIO } from './tema';

// Botao principal (azul), secundario (contorno) ou de texto (link).
export function Botao({ titulo, onPress, tipo = 'primario', desabilitado = false, carregando = false, estilo }) {
  const estilos = [s.botao, tipo === 'secundario' && s.botaoSecundario, tipo === 'link' && s.botaoLink, (desabilitado || carregando) && s.botaoDesabilitado, estilo];
  const corTexto = tipo === 'primario' ? CORES.branco : CORES.azul;
  return (
    <Pressable onPress={onPress} disabled={desabilitado || carregando} style={({ pressed }) => [estilos, pressed && { opacity: 0.85 }]} accessibilityRole="button">
      {carregando ? <ActivityIndicator color={corTexto} /> : <Text style={[s.botaoTexto, { color: corTexto }]}>{titulo}</Text>}
    </Pressable>
  );
}

export function Campo({ rotulo, ajuda, erro, estilo, ...props }) {
  return (
    <View style={[s.campo, estilo]}>
      {rotulo ? <Text style={s.rotulo}>{rotulo}</Text> : null}
      <TextInput
        placeholderTextColor="#98a6b5"
        style={[s.entrada, props.multiline && s.entradaMultilinha, erro && s.entradaErro, props.editable === false && s.entradaBloqueada]}
        {...props}
      />
      {erro ? <Text style={s.erro}>{erro}</Text> : ajuda ? <Text style={s.ajuda}>{ajuda}</Text> : null}
    </View>
  );
}

export function Mensagem({ texto, erro = false, estilo }) {
  if (!texto) return null;
  return (
    <View style={[s.mensagem, erro ? s.mensagemErro : s.mensagemOk, estilo]}>
      <Text style={[s.mensagemTexto, erro && { color: CORES.vermelho }]}>{texto}</Text>
    </View>
  );
}

// Opcao selecionavel (categoria, nota, modo de endereco).
export function Chip({ titulo, selecionado, onPress, estilo }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, selecionado && s.chipSelecionado, estilo]} accessibilityRole="button" accessibilityState={{ selected: selecionado }}>
      <Text style={[s.chipTexto, selecionado && s.chipTextoSelecionado]}>{titulo}</Text>
    </Pressable>
  );
}

export function Cartao({ children, estilo }) {
  return <View style={[s.cartao, estilo]}>{children}</View>;
}

export function Titulo({ children, estilo }) {
  return <Text style={[s.titulo, estilo]}>{children}</Text>;
}

export function Ajuda({ children, estilo }) {
  return <Text style={[s.ajuda, estilo]}>{children}</Text>;
}

export function Etiqueta({ status }) {
  const cor = status === 'Concluído' ? CORES.verde : status === 'Em andamento' ? CORES.amarelo : CORES.azul;
  return (
    <View style={[s.etiqueta, { backgroundColor: cor + '22', borderColor: cor }]}>
      <Text style={[s.etiquetaTexto, { color: cor }]}>{status}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  botao: {
    backgroundColor: CORES.azul,
    borderRadius: RAIO,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48
  },
  botaoSecundario: { backgroundColor: CORES.branco, borderWidth: 1.5, borderColor: CORES.azul },
  botaoLink: { backgroundColor: 'transparent', paddingHorizontal: 8 },
  botaoDesabilitado: { opacity: 0.55 },
  botaoTexto: { fontSize: 16, fontWeight: '700' },
  campo: { marginBottom: 14 },
  rotulo: { fontSize: 14, fontWeight: '600', color: CORES.tinta, marginBottom: 6 },
  entrada: {
    borderWidth: 1,
    borderColor: CORES.borda,
    borderRadius: RAIO,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: CORES.tinta,
    backgroundColor: CORES.branco
  },
  entradaMultilinha: { minHeight: 110, textAlignVertical: 'top' },
  entradaErro: { borderColor: CORES.vermelho },
  entradaBloqueada: { backgroundColor: CORES.fundo, color: CORES.cinzaTexto },
  ajuda: { fontSize: 13, color: CORES.cinzaTexto, marginTop: 6, lineHeight: 18 },
  erro: { fontSize: 13, color: CORES.vermelho, marginTop: 6 },
  mensagem: { borderRadius: RAIO, padding: 12, marginVertical: 10, borderWidth: 1 },
  mensagemOk: { backgroundColor: CORES.azulClaro, borderColor: CORES.azulBorda },
  mensagemErro: { backgroundColor: '#fdecec', borderColor: '#f3b9b9' },
  mensagemTexto: { color: CORES.tinta, fontSize: 14, lineHeight: 20 },
  chip: {
    borderWidth: 1.5,
    borderColor: CORES.borda,
    backgroundColor: CORES.branco,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
    marginBottom: 8
  },
  chipSelecionado: { borderColor: CORES.azul, backgroundColor: CORES.azulClaro },
  chipTexto: { color: CORES.tinta, fontSize: 15, textTransform: 'capitalize' },
  chipTextoSelecionado: { color: CORES.azulEscuro, fontWeight: '700' },
  cartao: {
    backgroundColor: CORES.branco,
    borderRadius: 16,
    padding: ESPACO,
    borderWidth: 1,
    borderColor: CORES.borda,
    marginBottom: ESPACO
  },
  titulo: { fontSize: 20, fontWeight: '800', color: CORES.tinta, marginBottom: 6 },
  etiqueta: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  etiquetaTexto: { fontSize: 12, fontWeight: '700' }
});
