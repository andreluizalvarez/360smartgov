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

## Deploy automático (servidor de produção)

O site oficial é <https://www.360smartgov.com.br> — nginx fazendo proxy para o
`server.js` no servidor `104.248.54.178`. O DNS fica no Registro.br e já aponta
para lá; **não é preciso mexer em DNS**.

A cada push no `master`, o workflow `.github/workflows/deploy.yml` conecta por SSH,
atualiza o código e reinicia o app — mas só depois que o workflow `CI` passar.

### Configuração inicial (uma vez só)

**1. Gere um par de chaves só para o deploy** (na sua máquina):

```bash
ssh-keygen -t ed25519 -C "deploy-github-actions" -f ~/.ssh/360smartgov_deploy -N ""
```

**2. Autorize a chave pública no servidor:**

```bash
ssh-copy-id -i ~/.ssh/360smartgov_deploy.pub USUARIO@104.248.54.178
```

**3. Cadastre os secrets** em *Settings › Secrets and variables › Actions › New repository secret*:

| Secret | O que é | Como descobrir |
|---|---|---|
| `SSH_USER` | usuário do servidor | o que você usa para entrar (`root`, `deploy`, `ubuntu`…) |
| `SSH_PRIVATE_KEY` | conteúdo de `~/.ssh/360smartgov_deploy` | `cat ~/.ssh/360smartgov_deploy` — copie tudo, inclusive as linhas `BEGIN`/`END` |
| `APP_PATH` | pasta do app no servidor | conecte por SSH e rode `pm2 info <app> \| grep cwd` ou `ls /var/www` |
| `RESTART_COMMAND` | comando que reinicia o app | `pm2 restart smartgov360` ou `sudo systemctl restart smartgov360` |

Opcionalmente, na aba *Variables*: `SSH_HOST` (padrão `104.248.54.178`) e `SSH_PORT` (padrão `22`).

**4. O app no servidor precisa ser um clone git.** Se não for, uma vez só:

```bash
cd /caminho/do/app
git init && git remote add origin https://github.com/andreluizalvarez/360smartgov.git
git fetch origin master && git reset --hard origin/master
```

### Depois disso

```bash
git push origin master   # CI valida, deploy publica, e o workflow confere o site no ar
```

Enquanto os secrets não estiverem cadastrados, o job de deploy fica inerte — não falha.

> O deploy roda `git reset --hard origin/master` no servidor: **alterações feitas
> direto lá são descartadas**. O `.env` não é afetado, por estar no `.gitignore`.

### Chaves de host

`.github/known_hosts` fixa a identidade do servidor, então o Actions não aceita
qualquer host que responda no IP. Se o servidor for reinstalado, regenere:

```bash
ssh-keyscan -t ed25519,rsa 104.248.54.178 > .github/known_hosts
```

### Verificação automática

`.github/workflows/ci.yml` valida a sintaxe e confirma que o servidor sobe.
Ao final do deploy, o workflow ainda faz um GET em produção para conferir que a
versão nova está mesmo no ar.

## Funcionalidades

- front-end estático: `index.html`, `login.html`, `preview.html`, `styles.css`, `script.js`, `preview.js`
- backend Node.js: `server.js` (autenticação em `auth.js`, ocorrências em `incidentes.js`)
- classificação por IA: `/api/classify` e `/api/classify-image`
- notificações ao cidadão: `/api/notify-user`
- ocorrências: `POST /api/incidentes` (abertura pública), `GET`/`PUT`/`DELETE /api/incidentes[/:id]` (painel, com sessão)

## Dados

Tudo o que o sistema grava fica em `dados/` (fora do git): `usuarios.json`,
`configuracao.json` (categorias e prioridades) e `incidentes.json` (ocorrências,
com a foto reduzida em base64). Faça backup dessa pasta no servidor.

O administrador por categoria só recebe do servidor as ocorrências das suas
categorias, e o servidor recusa alterações fora delas.

Ocorrências abertas por versões anteriores ficaram no navegador de quem as
registrou. Para enviá-las ao servidor, abra o site naquele navegador e rode no
console: `smartgovIncidentes.migrarLocaisParaServidor()`.

## Regras de notificação

- Uma nova notificação é enviada quando a ocorrência é confirmada na tela de prévia.
- Uma nova notificação é enviada quando o status da ocorrência é alterado no painel admin.
- E-mail e WhatsApp são disparados em paralelo quando os provedores estiverem configurados.

## Observação sobre Gmail

- Para Gmail SMTP, ative verificação em duas etapas na conta Google.
- Gere uma App Password e use no campo GMAIL_APP_PASSWORD.
- Não use a senha normal da conta Google no SMTP.
