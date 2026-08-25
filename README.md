# SmartGov 360

Aplicação demo de cadastro de ocorrências com backend Node.js para classificação via OpenAI e notificações ao cidadão.

## Instalação

1. Instale dependências:

```bash
npm install
```

2. Configure as variáveis em `.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here

# E-mail via Google (Gmail SMTP)
EMAIL_PROVIDER=gmail
GMAIL_USER=seuemail@gmail.com
GMAIL_APP_PASSWORD=sua_app_password_do_google
GMAIL_FROM_EMAIL=seuemail@gmail.com

# Opcional: e-mail (Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=SmartGov <no-reply@seudominio.com>

# Opcional: WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=+14155238886
```

3. Inicie o servidor:

```bash
npm start
```

4. Abra no navegador:

```text
http://localhost:3000
```

## Funcionalidades

- front-end estático: `index.html`, `login.html`, `preview.html`, `styles.css`, `script.js`, `preview.js`
- backend Node.js: `server.js`
- classificação por IA: `/api/classify` e `/api/classify-image`
- notificações ao cidadão: `/api/notify-user`

## Regras de notificação

- Uma nova notificação é enviada quando a ocorrência é confirmada na tela de prévia.
- Uma nova notificação é enviada quando o status da ocorrência é alterado no painel admin.
- E-mail e WhatsApp são disparados em paralelo quando os provedores estiverem configurados.

## Observação sobre Gmail

- Para Gmail SMTP, ative verificação em duas etapas na conta Google.
- Gere uma App Password e use no campo GMAIL_APP_PASSWORD.
- Não use a senha normal da conta Google no SMTP.
