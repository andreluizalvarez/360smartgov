# SmartGov 360 — aplicativo (Android e iOS)

App do cidadão em React Native com Expo. Usa **a mesma API do site**
(`https://www.360smartgov.com.br`): nada foi duplicado no servidor, e toda
ocorrência aberta pelo app aparece no painel da prefeitura normalmente.

## O que o app faz

| Aba | Funcionalidade | Equivalente no site |
|---|---|---|
| Registrar | Foto pela câmera ou galeria, análise pela IA (recusa fotos sem problema urbano, sugere categoria/título/descrição), categoria, localização precisa com mapa e marcador arrastável ou endereço manual, detalhes, contato, aceite LGPD, protocolo | Formulário em 5 passos da página inicial |
| Acompanhar | Consulta por protocolo com linha do tempo, "Meus protocolos" (gravados no aparelho), ocorrências recentes | Seção "Acompanhar" |
| Prefeitura | Publicações ativas ("Ações da Prefeitura") | Seção "Ações da Prefeitura" |
| Painel | Painel administrativo completo (login, ocorrências, mapa, secretarias, usuários, visão executiva, publicações), aberto dentro do app | `login.html` |
| Avaliar | Pesquisa de satisfação, aberta pelo link enviado por e-mail/WhatsApp | `avaliar.html?t=...` |

Notificações ao cidadão continuam por e-mail e WhatsApp, enviadas pelo servidor.

## Rodar em desenvolvimento

```bash
cd smartgov360
npm install
npx expo start
```

Leia o QR code com o app **Expo Go** (Android ou iPhone). Em Expo Go o mapa
Android já funciona; o painel, a câmera e a localização também.

## Gerar os aplicativos (EAS Build, na nuvem)

Pré-requisitos: conta gratuita em https://expo.dev, conta Apple Developer
(US$ 99/ano) e conta Google Play Console (US$ 25, uma vez).

```bash
npm install -g eas-cli
eas login
eas init                       # vincula o projeto à sua conta Expo (gera o projectId)
eas env:create --name GOOGLE_MAPS_ANDROID_KEY --value "SUA_CHAVE" --environment production --visibility secret

eas build --platform android --profile preview      # APK para testar no celular
eas build --platform android --profile production   # AAB para o Google Play
eas build --platform ios --profile production       # IPA para a App Store
eas submit --platform android
eas submit --platform ios
```

### Chave do Google Maps (Android)

O mapa do passo "Onde está o problema?" usa o **Maps SDK for Android**. Crie
uma chave no Google Cloud, restrita ao pacote `br.com.smartgov360.app` e à
impressão digital SHA-1 do build (`eas credentials`), e informe-a na variável
`GOOGLE_MAPS_ANDROID_KEY` (lida por `app.config.js`). No iOS o mapa é o Apple
Maps, sem chave. A geocodificação (endereço ↔ coordenada) usa o
geocodificador do próprio aparelho mais o OpenStreetMap, sem custo.

### Links do site que abrem no app

- `https://www.360smartgov.com.br/avaliar.html?t=TOKEN` → tela Avaliar
- `smartgov360://avaliar.html?t=TOKEN` (esquema próprio do app)

Para o link `https://` abrir direto no app (sem perguntar), publique no site:
- Android: `/.well-known/assetlinks.json` com o SHA-256 do certificado (`eas credentials`).
- iOS: `/.well-known/apple-app-site-association` com o Team ID da Apple.

## Estrutura

```
smartgov360/
  App.js                       navegação (abas + tela Avaliar) e links
  app.json / app.config.js     identidade, permissões, chave do Maps
  eas.json                     perfis de build
  src/api.js                   chamadas à API do site
  src/localizacao.js           GPS preciso + geocodificação (mesma lógica do site)
  src/componentes.js, tema.js  componentes visuais e cores do site
  src/screens/                 Registrar, Acompanhar, Publicacoes, Painel, Avaliar
```

## Limites conhecidos

- O servidor ainda não envia **notificações push**; o cidadão é avisado por
  e-mail e WhatsApp. Para push, o servidor precisaria guardar o token do
  aparelho por protocolo e chamar a API de push do Expo nas atualizações.
- No painel dentro do app, o download do PDF de produtividade abre no navegador.
