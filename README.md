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

## Deploy automático (Render)

O deploy é feito pelo Render a partir do branch `master`: **todo push publica uma nova versão**,
sem passo manual. A configuração está em `render.yaml`.

### Primeira configuração (uma vez só)

1. Acesse <https://dashboard.render.com/blueprints> e clique em **New Blueprint Instance**.
2. Conecte a conta do GitHub e selecione o repositório `360smartgov`.
3. O Render lê o `render.yaml` e pede o valor de cada variável marcada como `sync: false`.
   Preencha ao menos `OPENAI_API_KEY` — sem ela, a classificação por IA cai no
   fallback "Outros / Média". As demais são opcionais e podem ficar em branco.
4. Clique em **Apply**. O primeiro deploy leva alguns minutos.

As chaves ficam apenas no painel do Render, nunca no repositório.

### Depois disso

```bash
git push origin master   # o Render detecta e publica sozinho
```

Acompanhe em **Logs** e **Events** no painel do serviço.

> No plano gratuito o serviço hiberna após ~15 minutos sem acesso; a primeira
> requisição seguinte demora cerca de 50 segundos para responder.

### Verificação automática

O workflow `.github/workflows/ci.yml` roda a cada push: valida a sintaxe dos scripts
e confirma que o servidor sobe e responde. Ele não faz o deploy — quem publica é o Render.

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
