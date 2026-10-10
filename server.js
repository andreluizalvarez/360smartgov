const express = require('express');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { criarAuth } = require('./auth');
const { criarIncidentes } = require('./incidentes');
require('dotenv').config();
const multer = require('multer');
const nodemailer = require('nodemailer');
const upload = multer();

let fetchFunc;
if (typeof fetch === 'function') {
  fetchFunc = fetch.bind(globalThis);
} else {
  fetchFunc = (...args) => import('node-fetch').then(mod => mod.default(...args));
}

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMAIL_PROVIDER = (process.env.EMAIL_PROVIDER || 'auto').toLowerCase();
const GMAIL_USER = (process.env.GMAIL_USER || '').trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const GMAIL_FROM_EMAIL = (process.env.GMAIL_FROM_EMAIL || '').trim();
const GMAIL_SMTP_PORT = Number(process.env.GMAIL_SMTP_PORT) || 0;   // 0 = tenta 465 e depois 587
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const BREVO_FROM_EMAIL = (process.env.BREVO_FROM_EMAIL || '').trim();
const BREVO_FROM_NAME = (process.env.BREVO_FROM_NAME || 'SmartGov 360').trim();
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const DEFAULT_CATEGORIES = [
  'iluminação pública',
  'buracos',
  'árvores caídas',
  'descarte irregular',
  'boca de lobo entupida',
  'semáforo',
  'sinalização',
  'vazamentos',
  'mato alto',
  'animais mortos',
  'pontos de dengue',
  'terrenos abandonados',
  'ônibus atrasado',
  'acessibilidade',
  'poda',
  'limpeza urbana',
  'danos em praças',
  'danos em escolas',
  'danos em UBS',
  'pichações',
  'enchentes'
];
const DEFAULT_PRIORITIES = ['Baixa', 'Média', 'Alta', 'Urgente'];

// Termos que ja servem de destino para o que nao se encaixa em nenhuma categoria.
const TERMOS_CATEGORIA_GENERICA = ['outros', 'outras', 'diversos', 'geral', 'nao classificado'];
const CATEGORIA_GENERICA_PADRAO = 'outros';

// A classificacao so pode usar categorias cadastradas. Como sempre precisa
// existir um destino para o que nao se encaixa, a lista efetiva ganha uma
// categoria generica quando nenhuma foi cadastrada.
function listaEfetivaDeCategorias(categorias) {
  const lista = Array.isArray(categorias) && categorias.length
    ? categorias.filter((item) => (item || '').toString().trim())
    : DEFAULT_CATEGORIES;

  const temGenerica = lista.some((item) => TERMOS_CATEGORIA_GENERICA.includes(textoComparavel(item)));
  return temGenerica ? lista : [...lista, CATEGORIA_GENERICA_PADRAO];
}

// A configuracao vive no servidor, nao no navegador: a lista de categorias
// precisa valer para todo mundo — o cidadao que preenche o formulario esta em
// outro navegador que nunca viu o que o administrador cadastrou.
const DIRETORIO_DADOS = path.join(__dirname, 'dados');
const ARQUIVO_CONFIG = path.join(DIRETORIO_DADOS, 'configuracao.json');

const auth = criarAuth({ diretorioDados: DIRETORIO_DADOS });
auth.garantirAdminPadrao();
const incidentes = criarIncidentes({ diretorioDados: DIRETORIO_DADOS, papelAdminSistema: auth.PAPEL_ADMIN_SISTEMA });

function lerConfiguracao() {
  try {
    const bruto = fs.readFileSync(ARQUIVO_CONFIG, 'utf8');
    const config = JSON.parse(bruto);
    return {
      categories: Array.isArray(config.categories) && config.categories.length
        ? config.categories : null,
      priorities: Array.isArray(config.priorities) && config.priorities.length
        ? config.priorities : null,
      atualizadoEm: config.atualizadoEm || null
    };
  } catch (error) {
    // Sem arquivo ainda (ou ilegivel): cai nos padroes.
    return { categories: null, priorities: null, atualizadoEm: null };
  }
}

function salvarConfiguracao({ categories, priorities }) {
  const atual = lerConfiguracao();
  const config = {
    categories: Array.isArray(categories) && categories.length
      ? categories.map((item) => item.toString().trim()).filter(Boolean)
      : atual.categories,
    priorities: Array.isArray(priorities) && priorities.length
      ? priorities.map((item) => item.toString().trim()).filter(Boolean)
      : atual.priorities,
    atualizadoEm: new Date().toISOString()
  };

  fs.mkdirSync(DIRETORIO_DADOS, { recursive: true });
  fs.writeFileSync(ARQUIVO_CONFIG, JSON.stringify(config, null, 2), 'utf8');
  return config;
}

// A lista salva no servidor tem precedencia sobre a enviada pelo cliente: um
// navegador com cache antigo nao pode classificar com categorias ja removidas.
function categoriasEmVigor(categoriasDoCliente) {
  const salvas = lerConfiguracao().categories;
  return listaEfetivaDeCategorias(salvas || categoriasDoCliente);
}

function prioridadesEmVigor(prioridadesDoCliente) {
  const salvas = lerConfiguracao().priorities;
  const lista = salvas || prioridadesDoCliente;
  return Array.isArray(lista) && lista.length ? lista : DEFAULT_PRIORITIES;
}

// O destino do que nao se encaixa — sempre um item da propria lista.
function categoriaGenerica(lista) {
  return lista.find((item) => TERMOS_CATEGORIA_GENERICA.includes(textoComparavel(item)))
    || CATEGORIA_GENERICA_PADRAO;
}

// Structured Outputs: com `enum` e `strict`, a propria API recusa qualquer
// valor fora da lista. E a garantia de que a IA nunca inventa uma categoria;
// normalizeCategory continua como segunda linha de defesa.
function esquemaDeClassificacao(categorias, prioridades) {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'classificacao_ocorrencia',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: categorias },
          priority: { type: 'string', enum: prioridades },
          title: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['category', 'priority', 'title', 'description'],
        additionalProperties: false
      }
    }
  };
}

app.use(express.static(path.join(__dirname)));
// A ocorrencia chega com a foto em base64 no corpo: o limite padrao de 100 kb nao basta.
app.use(express.json({ limit: '4mb' }));

function parseJsonFromText(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Não foi possível localizar JSON na resposta.');
  }
  return JSON.parse(jsonMatch[0]);
}

// Minusculas, sem acento e sem espacos nas pontas, para comparar textos livres.
function textoComparavel(valor) {
  return (valor || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Remove o plural simples, para aproximar "buraco" de "buracos".
function semPlural(palavra) {
  return palavra.replace(/(oes|aes|ais|eis|ns|s)$/, '');
}

// A categoria devolvida pelo modelo e texto livre e precisa virar um item da
// lista configurada — e ela que popula as permissoes de cada administrador.
// Uma categoria fora da lista deixaria a ocorrencia invisivel para todos.
function normalizeCategory(value, categorias) {
  const lista = listaEfetivaDeCategorias(categorias);
  const alvo = textoComparavel(value);
  if (!alvo) return categoriaGenerica(lista);

  // 1) Igual, ignorando caixa e acento.
  const exata = lista.find((item) => textoComparavel(item) === alvo);
  if (exata) return exata;

  // 2) Um contem o outro: cobre "buraco" -> "buracos" e
  //    "boca de lobo" -> "boca de lobo entupida".
  const contida = lista.find((item) => {
    const texto = textoComparavel(item);
    return texto.includes(alvo) || alvo.includes(texto);
  });
  if (contida) return contida;

  // 3) Palavra significativa em comum, ja sem plural:
  //    "arvore caida" -> "arvores caidas".
  const palavrasAlvo = alvo.split(/\s+/).filter((palavra) => palavra.length > 3).map(semPlural);
  if (palavrasAlvo.length) {
    const porPalavra = lista.find((item) => {
      const palavrasItem = textoComparavel(item).split(/\s+/).filter((palavra) => palavra.length > 3).map(semPlural);
      return palavrasItem.some((palavra) => palavrasAlvo.includes(palavra));
    });
    if (porPalavra) return porPalavra;
  }

  // Nada correspondeu: o destino continua sendo um item da lista.
  return categoriaGenerica(lista);
}

function normalizePriority(value) {
  if (!value) return 'Média';
  const normalized = value.toString().toLowerCase();
  if (normalized.includes('urgente')) return 'Urgente';
  if (normalized.includes('alta')) return 'Alta';
  if (normalized.includes('baixa')) return 'Baixa';
  return 'Média';
}

function normalizePhoneForWhatsApp(value) {
  if (!value) return null;
  const digits = value.toString().replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

function formatDateLabel(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

// Nome da prefeitura nas mensagens ao cidadao (ajustavel pelo .env).
const PREFEITURA_NOME = (process.env.PREFEITURA_NOME || 'Prefeitura Municipal de Ourinhos').trim();
const ASSINATURA_EMAIL = [PREFEITURA_NOME, 'Atendimento ao Cidadão – SmartGov 360'];

// "Rua Pará, Centro, Ourinhos – SP": logradouro, bairro, cidade – UF.
function localDaOcorrencia(incident) {
  const cidadeUf = [incident?.city, incident?.state].filter(Boolean).join(' – ');
  const partes = [incident?.street, incident?.neighborhood, cidadeUf].filter(Boolean);
  if (partes.length) return partes.join(', ');
  return incident?.address || 'Não informado';
}

function primeiroNome(nome) {
  const limpo = (nome || '').toString().trim();
  return limpo ? limpo.split(/\s+/)[0] : 'Cidadão';
}

function buildNotificationText(eventType, incident, actor, previousStatus, newStatus) {
  const title = incident?.title || 'Ocorrência';
  const category = incident?.category || 'Não informada';
  const status = incident?.status || newStatus || 'Não informado';
  const address = incident?.address || [incident?.street, incident?.number, incident?.neighborhood, incident?.city, incident?.state].filter(Boolean).join(', ') || 'Não informado';
  const citizenName = primeiroNome(incident?.name);

  if (eventType === 'status_changed') {
    const toStatus = newStatus || status;
    const local = localDaOcorrencia(incident);
    const chave = (toStatus || '').toString().trim().toLowerCase();
    // A "resposta" e a ultima atualizacao de atendimento registrada pelo
    // administrador na ocorrencia; sem ela, vai um texto padrao.
    const respostaDaPrefeitura = (incident?.workUpdate || '').toString().trim()
      || 'O atendimento da sua solicitação foi concluído pelo setor responsável.';

    // Assunto e paragrafos finais variam com o status; o corpo e o mesmo.
    const modelos = {
      'em andamento': {
        subject: 'Sua solicitação está em andamento – SmartGov 360',
        abertura: 'Temos uma atualização sobre sua solicitação:',
        fechamento: [
          'Sua solicitação já foi encaminhada ao setor responsável e as providências necessárias estão sendo analisadas ou executadas.',
          '',
          'Você será informado quando o atendimento for concluído.'
        ]
      },
      'concluído': {
        subject: 'Sua solicitação foi concluída – SmartGov 360',
        abertura: 'Sua solicitação recebeu uma resposta da Prefeitura.',
        fechamento: [
          'Resposta da Prefeitura:',
          respostaDaPrefeitura,
          '',
          'Agradecemos sua participação. Sua colaboração ajuda a Prefeitura a identificar problemas e melhorar os serviços da cidade.'
        ]
      }
    };
    const modelo = modelos[chave] || {
      subject: `Sua solicitação foi atualizada – SmartGov 360`,
      abertura: 'Temos uma atualização sobre sua solicitação:',
      fechamento: ['Você será informado sempre que houver uma nova atualização.']
    };

    const chaveTemplate = chave === 'em andamento' ? 'andamento' : (chave === 'concluído' ? 'concluido' : null);
    const variaveis = chaveTemplate === 'concluido'
      ? { 1: citizenName, 2: title, 3: local, 4: respostaDaPrefeitura }
      : { 1: citizenName, 2: title, 3: local };

    return {
      template: chaveTemplate ? { chave: chaveTemplate, variaveis } : null,
      subject: modelo.subject,
      emailText: [
        `Olá, ${citizenName}!`,
        '',
        modelo.abertura,
        '',
        `Solicitação: ${title}`,
        '',
        `Local: ${local}`,
        '',
        `Status: ${toStatus}`,
        '',
        ...modelo.fechamento,
        '',
        ...ASSINATURA_EMAIL
      ].join('\n'),
      whatsappText: `Olá, ${citizenName}! ${modelo.abertura} "${title}" – Local: ${local}. Status: ${toStatus}. ${modelo.fechamento.filter(Boolean).join(' ')} ${PREFEITURA_NOME} – SmartGov 360.`
    };
  }

  const local = localDaOcorrencia(incident);
  return {
    template: { chave: 'recebido', variaveis: { 1: citizenName, 2: title, 3: category, 4: local } },
    subject: 'Recebemos sua solicitação – SmartGov 360',
    emailText: [
      `Olá, ${citizenName}!`,
      '',
      'Sua solicitação foi recebida com sucesso pela Prefeitura.',
      '',
      `Solicitação: ${title}`,
      '',
      `Categoria: ${category}`,
      '',
      `Local: ${local}`,
      '',
      `Status: ${status}`,
      '',
      'A solicitação será encaminhada ao setor responsável para análise.',
      '',
      'Você será informado sempre que houver uma atualização.',
      '',
      ...ASSINATURA_EMAIL
    ].join('\n'),
    whatsappText: `Olá, ${citizenName}! Sua solicitação "${title}" foi recebida com sucesso pela Prefeitura. Categoria: ${category}. Local: ${local}. Status: ${status}. Você será informado sempre que houver uma atualização. ${PREFEITURA_NOME} – SmartGov 360.`
  };
}

const gmailTransporters = new Map();

// Nenhum envio pode segurar uma requisicao por mais que isto: o nginx corta em
// 60 s, e o cidadao nao deve esperar pela entrega do e-mail para ver a
// ocorrencia registrada.
const TEMPO_LIMITE_ENVIO_MS = 15000;

function comTempoLimite(promessa, ms, motivo) {
  let temporizador;
  const limite = new Promise((resolve) => {
    temporizador = setTimeout(() => resolve({ sent: false, reason: motivo }), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(temporizador));
}

// Dispara e-mail e WhatsApp em paralelo, cada um com o seu limite de tempo.
// Nunca rejeita: devolve o resultado de cada canal.
async function enviarNotificacao(eventType, incident, actor, previousStatus, newStatus) {
  const recipientEmail = incident?.email || '';
  const recipientPhone = incident?.phone || '';
  if (!incident || (!recipientEmail && !recipientPhone)) {
    return { ok: false, email: { sent: false, reason: 'Sem contato.' }, whatsapp: { sent: false, reason: 'Sem contato.' } };
  }

  const composed = buildNotificationText(eventType, incident, actor, previousStatus, newStatus);

  const [emailResult, whatsappResult] = await Promise.all([
    comTempoLimite(
      sendEmailNotification(recipientEmail, composed.subject, composed.emailText)
        .catch((error) => ({ sent: false, reason: error.message })),
      TEMPO_LIMITE_ENVIO_MS, 'Tempo esgotado ao enviar o e-mail.'
    ),
    comTempoLimite(
      sendWhatsAppNotification(recipientPhone, composed.whatsappText, composed.template)
        .catch((error) => ({ sent: false, reason: error.message })),
      TEMPO_LIMITE_ENVIO_MS, 'Tempo esgotado ao enviar o WhatsApp.'
    )
  ]);

  const ok = Boolean(emailResult.sent || whatsappResult.sent);
  if (!ok) {
    console.warn('[notificacao]', eventType, 'nao entregue:', emailResult.reason, '|', whatsappResult.reason);
  }
  return { ok, email: emailResult, whatsapp: whatsappResult };
}

function getGmailTransporter(porta) {
  if (gmailTransporters.has(porta)) {
    return gmailTransporters.get(porta);
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return null;
  }

  // Sem estes limites o nodemailer espera ate 2 minutos por uma conexao SMTP
  // que nunca abre (provedores de nuvem costumam bloquear a porta de saida),
  // e a requisicao fica pendurada ate o nginx cortar com 504.
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: porta,
    secure: porta === 465,          // 465 = TLS direto; 587 = STARTTLS
    requireTLS: porta !== 465,
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000
  });
  gmailTransporters.set(porta, transporter);
  return transporter;
}

// Erro de rede (porta bloqueada, sem rota), em oposicao a erro de credencial.
function erroDeConexaoSmtp(error) {
  const codigo = error?.code || '';
  return ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'EDNS', 'ENOTFOUND', 'EHOSTUNREACH'].includes(codigo)
    || /timeout/i.test(error?.message || '');
}

async function sendEmailViaGmail(toEmail, subject, text) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return { sent: false, reason: 'Gmail SMTP is not configured.' };
  }

  // Alguns provedores de nuvem bloqueiam a 465 mas nao a 587 (ou vice-versa):
  // sem porta fixa, tenta as duas antes de desistir.
  const portas = GMAIL_SMTP_PORT ? [GMAIL_SMTP_PORT] : [465, 587];
  let ultimoErro = null;

  for (const porta of portas) {
    const transporter = getGmailTransporter(porta);
    if (!transporter) break;
    try {
      const info = await transporter.sendMail({
        from: GMAIL_FROM_EMAIL || GMAIL_USER,
        to: toEmail,
        subject,
        text
      });
      return { sent: true, providerId: info?.messageId || null, porta };
    } catch (error) {
      ultimoErro = error;
      if (!erroDeConexaoSmtp(error)) break;   // credencial errada: nao adianta trocar de porta
      console.warn('[email] Gmail SMTP porta', porta, 'sem resposta:', error.code || error.message);
    }
  }

  const bloqueio = ultimoErro && erroDeConexaoSmtp(ultimoErro);
  return {
    sent: false,
    reason: bloqueio
      ? 'Sem conexão com smtp.gmail.com (portas ' + portas.join(' e ') + '). O servidor parece bloquear SMTP de saída; use um provedor por HTTPS (Brevo ou Resend).'
      : (ultimoErro?.message || 'Falha ao enviar pelo Gmail.')
  };
}

// Brevo (ex-Sendinblue): API por HTTPS na porta 443, funciona onde o SMTP e
// bloqueado. O remetente precisa estar verificado na conta Brevo.
async function sendEmailViaBrevo(toEmail, subject, text) {
  if (!BREVO_API_KEY || !BREVO_FROM_EMAIL) {
    return { sent: false, reason: 'Brevo is not configured.' };
  }

  const response = await fetchFunc('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    signal: AbortSignal.timeout(TEMPO_LIMITE_ENVIO_MS),
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { email: BREVO_FROM_EMAIL, name: BREVO_FROM_NAME },
      to: [{ email: toEmail }],
      subject,
      textContent: text
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { sent: false, reason: data?.message || ('Brevo respondeu ' + response.status) };
  }
  return { sent: true, providerId: data?.messageId || null };
}

async function sendEmailViaResend(toEmail, subject, text) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return { sent: false, reason: 'Resend is not configured.' };
  }

  const response = await fetchFunc('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(TEMPO_LIMITE_ENVIO_MS),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [toEmail],
      subject,
      text
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return { sent: false, reason: data?.message || 'Failed to send email.' };
  }
  return { sent: true, providerId: data?.id || null };
}

// Qual provedor de e-mail esta em uso. Em `auto`, os provedores por HTTPS vem
// antes do Gmail SMTP, porque funcionam em qualquer servidor.
function provedorDeEmail() {
  const canUseGmail = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
  const canUseResend = Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL);
  const canUseBrevo = Boolean(BREVO_API_KEY && BREVO_FROM_EMAIL);

  if (EMAIL_PROVIDER === 'nenhum' || EMAIL_PROVIDER === 'none') return { nome: 'nenhum', configurado: false };
  if (EMAIL_PROVIDER === 'gmail') return { nome: 'gmail', configurado: canUseGmail };
  if (EMAIL_PROVIDER === 'resend') return { nome: 'resend', configurado: canUseResend };
  if (EMAIL_PROVIDER === 'brevo') return { nome: 'brevo', configurado: canUseBrevo };
  if (canUseBrevo) return { nome: 'brevo', configurado: true };
  if (canUseResend) return { nome: 'resend', configurado: true };
  if (canUseGmail) return { nome: 'gmail', configurado: true };
  return { nome: 'nenhum', configurado: false };
}

async function sendEmailNotification(toEmail, subject, text) {
  if (!toEmail) {
    return { sent: false, reason: 'Recipient email not provided.' };
  }

  const provedor = provedorDeEmail();
  if (provedor.nome === 'gmail') return sendEmailViaGmail(toEmail, subject, text);
  if (provedor.nome === 'resend') return sendEmailViaResend(toEmail, subject, text);
  if (provedor.nome === 'brevo') return sendEmailViaBrevo(toEmail, subject, text);

  return { sent: false, reason: 'Nenhum provedor de e-mail configurado. Defina as credenciais do Brevo, Resend ou Gmail no .env.' };
}

// Tenta abrir uma conexao TCP: diz se a porta de saida esta liberada.
function testarConexao(host, port, ms = 5000) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    const socket = net.connect({ host, port });
    const fim = (ok, detalhe) => {
      socket.destroy();
      resolve({ host, port, ok, detalhe, ms: Date.now() - inicio });
    };
    socket.setTimeout(ms);
    socket.once('connect', () => fim(true, 'conectou'));
    socket.once('timeout', () => fim(false, 'sem resposta em ' + ms + ' ms (porta provavelmente bloqueada)'));
    socket.once('error', (error) => fim(false, error.code || error.message));
  });
}

// Diagnostico para o painel: provedor em uso e quais rotas de saida respondem.
async function diagnosticoDeEmail() {
  const provedor = provedorDeEmail();
  const alvos = [
    { nome: 'Gmail SMTP (TLS)', host: 'smtp.gmail.com', port: 465 },
    { nome: 'Gmail SMTP (STARTTLS)', host: 'smtp.gmail.com', port: 587 },
    { nome: 'Brevo API (HTTPS)', host: 'api.brevo.com', port: 443 },
    { nome: 'Resend API (HTTPS)', host: 'api.resend.com', port: 443 }
  ];
  const conexoes = await Promise.all(alvos.map(async (alvo) => ({ nome: alvo.nome, ...(await testarConexao(alvo.host, alvo.port)) })));

  return {
    provedor: provedor.nome,
    configurado: provedor.configurado,
    modo: EMAIL_PROVIDER,
    remetente: provedor.nome === 'gmail' ? (GMAIL_FROM_EMAIL || GMAIL_USER)
      : provedor.nome === 'resend' ? (RESEND_FROM_EMAIL || '')
      : provedor.nome === 'brevo' ? BREVO_FROM_EMAIL : '',
    whatsapp: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM),
    conexoes
  };
}

// ---------------------------------------------------- templates do WhatsApp
//
// Fora do sandbox, o WhatsApp so aceita texto livre nas 24 h seguintes a uma
// mensagem do cidadao. Como a prefeitura e quem inicia a conversa, cada
// notificacao precisa de um template aprovado pela Meta. Os templates sao
// criados pela aba Notificacoes do painel (Content API do Twilio) e os seus
// SIDs ficam em dados/whatsapp-templates.json.
const ARQUIVO_TEMPLATES = path.join(DIRETORIO_DADOS, 'whatsapp-templates.json');

function definicoesDeTemplates() {
  const assinatura = PREFEITURA_NOME + ' – Atendimento ao Cidadão – SmartGov 360';
  return {
    recebido: {
      titulo: 'Solicitação recebida',
      corpo: 'Olá, {{1}}! Sua solicitação foi recebida com sucesso pela Prefeitura.\n\nSolicitação: {{2}}\nCategoria: {{3}}\nLocal: {{4}}\nStatus: Recebido\n\nA solicitação será encaminhada ao setor responsável para análise. Você será informado sempre que houver uma atualização.\n\n' + assinatura,
      exemplos: { 1: 'Gian', 2: 'Buracos na rua com acúmulo de água', 3: 'Buracos', 4: 'Rua Pará, Centro, Ourinhos – SP' }
    },
    andamento: {
      titulo: 'Solicitação em andamento',
      corpo: 'Olá, {{1}}! Temos uma atualização sobre sua solicitação.\n\nSolicitação: {{2}}\nLocal: {{3}}\nStatus: Em andamento\n\nSua solicitação já foi encaminhada ao setor responsável e as providências necessárias estão sendo analisadas ou executadas. Você será informado quando o atendimento for concluído.\n\n' + assinatura,
      exemplos: { 1: 'Gian', 2: 'Buracos na rua com acúmulo de água', 3: 'Rua Pará, Centro, Ourinhos – SP' }
    },
    concluido: {
      titulo: 'Solicitação concluída',
      corpo: 'Olá, {{1}}! Sua solicitação recebeu uma resposta da Prefeitura.\n\nSolicitação: {{2}}\nLocal: {{3}}\nStatus: Concluído\n\nResposta da Prefeitura: {{4}}\n\nAgradecemos sua participação. Sua colaboração ajuda a Prefeitura a identificar problemas e melhorar os serviços da cidade.\n\n' + assinatura,
      exemplos: { 1: 'Gian', 2: 'Buracos na rua com acúmulo de água', 3: 'Rua Pará, Centro, Ourinhos – SP', 4: 'O serviço de reparo do pavimento foi realizado no local informado.' }
    }
  };
}

function lerTemplates() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO_TEMPLATES, 'utf8'));
    return dados && typeof dados === 'object' ? dados : {};
  } catch (error) {
    return {};
  }
}

function salvarTemplates(templates) {
  fs.mkdirSync(DIRETORIO_DADOS, { recursive: true });
  fs.writeFileSync(ARQUIVO_TEMPLATES, JSON.stringify(templates, null, 2), 'utf8');
}

function cabecalhoTwilio(json = false) {
  const basicToken = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const headers = { Authorization: `Basic ${basicToken}` };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

// Cria o conteudo no Twilio e pede a aprovacao da Meta para o WhatsApp.
async function criarTemplateNoTwilio(chave, definicao) {
  const nome = `smartgov_${chave}_${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}`;
  const criado = await fetchFunc('https://content.twilio.com/v1/Content', {
    method: 'POST',
    signal: AbortSignal.timeout(TEMPO_LIMITE_ENVIO_MS),
    headers: cabecalhoTwilio(true),
    body: JSON.stringify({
      friendly_name: nome,
      language: 'pt_BR',
      variables: Object.fromEntries(Object.entries(definicao.exemplos).map(([k, v]) => [String(k), v])),
      types: { 'twilio/text': { body: definicao.corpo } }
    })
  });
  const conteudo = await criado.json().catch(() => ({}));
  if (!criado.ok || !conteudo.sid) {
    throw new Error(conteudo.message || ('Twilio respondeu ' + criado.status + ' ao criar o template.'));
  }

  const pedido = await fetchFunc(`https://content.twilio.com/v1/Content/${conteudo.sid}/ApprovalRequests/whatsapp`, {
    method: 'POST',
    signal: AbortSignal.timeout(TEMPO_LIMITE_ENVIO_MS),
    headers: cabecalhoTwilio(true),
    body: JSON.stringify({ name: nome, category: 'UTILITY' })
  });
  const aprovacao = await pedido.json().catch(() => ({}));
  if (!pedido.ok) {
    throw new Error(aprovacao.message || ('Twilio respondeu ' + pedido.status + ' ao pedir a aprovação.'));
  }

  return { sid: conteudo.sid, nome, status: aprovacao.status || 'pending', criadoEm: new Date().toISOString() };
}

async function consultarAprovacaoTemplate(sid) {
  const resposta = await fetchFunc(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, {
    signal: AbortSignal.timeout(TEMPO_LIMITE_ENVIO_MS),
    headers: cabecalhoTwilio()
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) return { status: 'desconhecido', motivo: dados.message || ('HTTP ' + resposta.status) };
  const wa = dados.whatsapp || {};
  return { status: wa.status || 'desconhecido', motivo: wa.rejection_reason || null };
}

// Atualiza o status de cada template consultando o Twilio.
async function statusDosTemplates(consultar = true) {
  const salvos = lerTemplates();
  const definicoes = definicoesDeTemplates();
  const lista = [];
  for (const chave of Object.keys(definicoes)) {
    const item = salvos[chave];
    if (!item?.sid) {
      lista.push({ chave, titulo: definicoes[chave].titulo, status: 'nao_criado' });
      continue;
    }
    if (consultar && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      try {
        const atual = await consultarAprovacaoTemplate(item.sid);
        item.status = atual.status;
        item.motivo = atual.motivo;
      } catch (error) {
        item.motivo = 'Não foi possível consultar o Twilio: ' + error.message;
      }
    }
    lista.push({ chave, titulo: definicoes[chave].titulo, ...item });
  }
  if (consultar) salvarTemplates(salvos);
  return lista;
}

function templateAprovado(chave) {
  const item = lerTemplates()[chave];
  return item?.sid && item.status === 'approved' ? item.sid : null;
}

async function sendWhatsAppNotification(toPhone, text, template = null) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    return { sent: false, reason: 'WhatsApp provider is not configured.' };
  }

  const normalizedPhone = normalizePhoneForWhatsApp(toPhone);
  if (!normalizedPhone) {
    return { sent: false, reason: 'Recipient phone is invalid.' };
  }

  const params = new URLSearchParams();
  params.set('From', `whatsapp:${TWILIO_WHATSAPP_FROM}`);
  params.set('To', `whatsapp:${normalizedPhone}`);

  // Com template aprovado, a mensagem pode ser a primeira da conversa.
  const contentSid = template?.chave ? templateAprovado(template.chave) : null;
  let usouTemplate = false;
  if (contentSid) {
    params.set('ContentSid', contentSid);
    params.set('ContentVariables', JSON.stringify(
      Object.fromEntries(Object.entries(template.variaveis || {}).map(([k, v]) => [String(k), (v ?? '').toString().replace(/\s*\n+\s*/g, ' ').trim()]))
    ));
    usouTemplate = true;
  } else {
    params.set('Body', text);
  }

  const basicToken = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetchFunc(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    signal: AbortSignal.timeout(TEMPO_LIMITE_ENVIO_MS),
    headers: {
      Authorization: `Basic ${basicToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    return { sent: false, reason: explicarErroTwilio(data?.code, data?.message) };
  }

  // "sent" aqui significa aceito pelo Twilio (fila). A entrega ao aparelho e
  // confirmada depois, no status da mensagem (ver consultarStatusWhatsApp).
  return { sent: true, providerId: data?.sid || null, status: data?.status || 'queued', para: normalizedPhone, usouTemplate };
}

// Erros mais comuns do WhatsApp via Twilio, traduzidos para quem configura.
const ERROS_TWILIO = {
  63015: 'O número de destino não entrou no sandbox do Twilio. No WhatsApp, o destinatário precisa enviar "join <palavra-chave>" para o número do sandbox antes de receber mensagens.',
  63016: 'Fora da janela de 24 horas: o WhatsApp só aceita texto livre até 24 h depois da última mensagem do destinatário. Para a prefeitura iniciar a conversa é preciso um template aprovado pela Meta: crie-os nesta aba em "Templates do WhatsApp".',
  63007: 'O número remetente (TWILIO_WHATSAPP_FROM) não é um canal de WhatsApp válido nesta conta Twilio.',
  63003: 'O número de destino não tem WhatsApp.',
  63024: 'Número de destino inválido para o WhatsApp.',
  21211: 'Número de destino inválido.',
  21608: 'Conta Twilio de avaliação: só envia para números verificados na conta.',
  21610: 'O destinatário bloqueou o recebimento (respondeu STOP).',
  20003: 'Credenciais do Twilio recusadas: confira TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN.'
};

function explicarErroTwilio(codigo, mensagem) {
  const num = Number(codigo);
  const base = mensagem || ('Erro ' + (codigo || 'desconhecido') + ' do Twilio.');
  return ERROS_TWILIO[num] ? `${ERROS_TWILIO[num]} (Twilio ${num})` : base;
}

// Consulta o status atual de uma mensagem no Twilio (queued, sent, delivered,
// read, undelivered, failed) e o erro, se houver.
async function consultarStatusWhatsApp(sid) {
  const basicToken = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetchFunc(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages/${sid}.json`, {
    signal: AbortSignal.timeout(TEMPO_LIMITE_ENVIO_MS),
    headers: { Authorization: `Basic ${basicToken}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { status: 'desconhecido', erro: data?.message || ('HTTP ' + response.status) };
  return {
    status: data?.status || 'desconhecido',
    codigo: data?.error_code || null,
    erro: data?.error_code ? explicarErroTwilio(data.error_code, data.error_message) : null
  };
}

// Envia um WhatsApp de teste e acompanha o status por alguns segundos, para o
// painel mostrar se a mensagem chegou ou por que nao chegou.
async function testarWhatsApp(para) {
  const exemplos = definicoesDeTemplates().recebido.exemplos;
  const envio = await sendWhatsAppNotification(
    para,
    'SmartGov 360: mensagem de teste enviada pelo painel administrativo em ' + new Date().toLocaleString('pt-BR') + '.',
    { chave: 'recebido', variaveis: { ...exemplos, 2: 'Mensagem de teste do painel administrativo' } }
  ).catch((error) => ({ sent: false, reason: error.message }));

  if (!envio.sent || !envio.providerId) {
    return { sent: false, status: 'nao_enviado', reason: envio.reason || 'Falha ao enviar.' };
  }

  let ultimo = { status: envio.status || 'queued', codigo: null, erro: null };
  const finais = ['delivered', 'read', 'undelivered', 'failed'];
  for (let i = 0; i < 5 && !finais.includes(ultimo.status); i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      ultimo = await consultarStatusWhatsApp(envio.providerId);
    } catch (error) {
      break;
    }
  }

  const falhou = ['undelivered', 'failed'].includes(ultimo.status);
  return {
    sent: !falhou,
    sid: envio.providerId,
    para: envio.para,
    status: ultimo.status,
    codigo: ultimo.codigo,
    reason: ultimo.erro || (falhou ? 'O Twilio não conseguiu entregar a mensagem.' : null),
    remetente: TWILIO_WHATSAPP_FROM,
    sandbox: TWILIO_WHATSAPP_FROM === '+14155238886',
    usouTemplate: Boolean(envio.usouTemplate)
  };
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const resultado = auth.autenticar(username, password);
  if (resultado.erro) {
    return res.status(resultado.status).json({ error: resultado.erro });
  }
  return res.json(resultado);
});

// Confere se a sessao ainda vale e devolve o perfil atualizado.
app.get('/api/auth/me', auth.exigirAutenticacao, (req, res) => {
  return res.json({ usuario: req.usuario });
});

app.post('/api/auth/senha', auth.exigirAutenticacao, (req, res) => {
  const { senhaAtual, senhaNova } = req.body || {};
  const resultado = auth.alterarSenha(req.usuario.id, senhaAtual, senhaNova);
  if (resultado.erro) {
    return res.status(resultado.status).json({ error: resultado.erro });
  }
  return res.json(resultado);
});

// Diagnostico e teste de e-mail, para o administrador conferir a entrega sem
// precisar de acesso ao servidor.
app.get('/api/auth/email/diagnostico', auth.exigirAdminSistema, async (req, res) => {
  return res.json(await diagnosticoDeEmail());
});

app.post('/api/auth/email/teste', auth.exigirAdminSistema, async (req, res) => {
  const para = (req.body?.para || '').toString().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) {
    return res.status(400).json({ error: 'Informe um e-mail de destino válido.' });
  }

  const resultado = await comTempoLimite(
    sendEmailNotification(
      para,
      'SmartGov 360 — teste de envio de e-mail',
      'Este é um e-mail de teste enviado pelo painel administrativo do SmartGov 360 em ' + new Date().toLocaleString('pt-BR') + '.'
    ).catch((error) => ({ sent: false, reason: error.message })),
    TEMPO_LIMITE_ENVIO_MS + 5000, 'Tempo esgotado ao enviar o e-mail de teste.'
  );

  return res.status(resultado.sent ? 200 : 207).json({ provedor: provedorDeEmail().nome, ...resultado });
});

app.post('/api/auth/whatsapp/teste', auth.exigirAdminSistema, async (req, res) => {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    return res.status(207).json({ sent: false, status: 'nao_configurado', reason: 'WhatsApp (Twilio) não configurado no .env.' });
  }
  const para = normalizePhoneForWhatsApp(req.body?.para);
  if (!para) {
    return res.status(400).json({ error: 'Informe um telefone válido com DDD, por exemplo (11) 99999-9999.' });
  }
  const resultado = await comTempoLimite(
    testarWhatsApp(para),
    TEMPO_LIMITE_ENVIO_MS + 10000,
    'Tempo esgotado ao testar o WhatsApp.'
  );
  return res.status(resultado.sent ? 200 : 207).json(resultado);
});

app.get('/api/auth/whatsapp/templates', auth.exigirAdminSistema, async (req, res) => {
  const consultar = req.query.consultar !== '0';
  return res.json({ templates: await statusDosTemplates(consultar), configurado: Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM) });
});

app.post('/api/auth/whatsapp/templates/criar', auth.exigirAdminSistema, async (req, res) => {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return res.status(207).json({ ok: false, reason: 'WhatsApp (Twilio) não configurado no .env.' });
  }
  const salvos = lerTemplates();
  const definicoes = definicoesDeTemplates();
  const erros = [];
  for (const [chave, definicao] of Object.entries(definicoes)) {
    const atual = salvos[chave];
    // Ja aprovado ou aguardando: nao cria de novo.
    if (atual?.sid && ['approved', 'pending', 'received', 'submitted'].includes(atual.status)) continue;
    try {
      salvos[chave] = await criarTemplateNoTwilio(chave, definicao);
    } catch (error) {
      erros.push(definicao.titulo + ': ' + error.message);
    }
  }
  salvarTemplates(salvos);
  const templates = await statusDosTemplates(false);
  return res.status(erros.length ? 207 : 200).json({ ok: !erros.length, reason: erros.join(' | ') || null, templates });
});

app.get('/api/auth/usuarios', auth.exigirAdminSistema, (req, res) => {
  return res.json({ usuarios: auth.listarUsuarios() });
});

app.post('/api/auth/usuarios', auth.exigirAdminSistema, (req, res) => {
  const resultado = auth.criarUsuario(req.body || {});
  if (resultado.erro) {
    return res.status(resultado.status).json({ error: resultado.erro });
  }
  return res.status(201).json(resultado);
});

app.put('/api/auth/usuarios/:id', auth.exigirAdminSistema, (req, res) => {
  const resultado = auth.atualizarUsuario(req.params.id, req.body || {}, req.usuario.id);
  if (resultado.erro) {
    return res.status(resultado.status).json({ error: resultado.erro });
  }
  return res.json(resultado);
});

app.delete('/api/auth/usuarios/:id', auth.exigirAdminSistema, (req, res) => {
  const resultado = auth.removerUsuario(req.params.id, req.usuario.id);
  if (resultado.erro) {
    return res.status(resultado.status).json({ error: resultado.erro });
  }
  return res.json(resultado);
});

// ------------------------------------------------------------ ocorrencias
//
// Abertura e publica (o cidadao nao tem login). Leitura e alteracao exigem
// sessao, e o admin de categoria so enxerga e altera o que lhe cabe.
app.post('/api/incidentes', (req, res) => {
  const resultado = incidentes.criar(req.body || {});
  if (resultado.erro) {
    return res.status(resultado.status).json({ error: resultado.erro });
  }

  // A notificacao ao cidadao vai em segundo plano: a resposta nao espera o
  // e-mail, que pode demorar ou falhar sem que a ocorrencia deixe de existir.
  enviarNotificacao('incident_created', resultado.incidente).catch((error) => {
    console.warn('[notificacao] falha inesperada:', error);
  });

  return res.status(201).json(resultado);
});

app.get('/api/incidentes', auth.exigirAutenticacao, (req, res) => {
  return res.json({ incidentes: incidentes.listar(req.usuario) });
});

app.put('/api/incidentes/:id', auth.exigirAutenticacao, (req, res) => {
  const resultado = incidentes.atualizar(req.params.id, req.body || {}, req.usuario);
  if (resultado.erro) {
    return res.status(resultado.status).json({ error: resultado.erro });
  }
  return res.json(resultado);
});

app.delete('/api/incidentes/:id', auth.exigirAutenticacao, (req, res) => {
  const resultado = incidentes.remover(req.params.id, req.usuario);
  if (resultado.erro) {
    return res.status(resultado.status).json({ error: resultado.erro });
  }
  return res.json(resultado);
});

// Produtividade dos administradores de categoria (so admin do sistema).
app.get('/api/incidentes/produtividade', auth.exigirAdminSistema, (req, res) => {
  const dias = Math.max(0, Math.min(365, Number(req.query.dias ?? 30) || 0));
  return res.json(incidentes.produtividade(auth.listarUsuarios(), dias));
});

app.delete('/api/incidentes', auth.exigirAdminSistema, (req, res) => {
  return res.json(incidentes.limpar());
});

// Lista em vigor, consultada por qualquer navegador ao abrir o site.
app.get('/api/config', (req, res) => {
  const config = lerConfiguracao();
  return res.json({
    categories: listaEfetivaDeCategorias(config.categories),
    priorities: config.priorities || DEFAULT_PRIORITIES,
    atualizadoEm: config.atualizadoEm
  });
});

// Gravada pelo painel sempre que uma categoria e adicionada ou removida.
app.put('/api/config', auth.exigirAdminSistema, (req, res) => {
  const { categories, priorities } = req.body || {};

  if (categories !== undefined && (!Array.isArray(categories) || !categories.length)) {
    return res.status(400).json({ error: 'categories deve ser uma lista nao vazia.' });
  }
  if (priorities !== undefined && (!Array.isArray(priorities) || !priorities.length)) {
    return res.status(400).json({ error: 'priorities deve ser uma lista nao vazia.' });
  }

  try {
    const config = salvarConfiguracao({ categories, priorities });
    return res.json({
      categories: listaEfetivaDeCategorias(config.categories),
      priorities: config.priorities || DEFAULT_PRIORITIES,
      atualizadoEm: config.atualizadoEm
    });
  } catch (error) {
    console.error('Falha ao salvar a configuracao:', error);
    return res.status(500).json({ error: 'Nao foi possivel salvar a configuracao.' });
  }
});

app.post('/api/classify', async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key is not configured.' });
  }

  const { description, cep, street, number, neighborhood, city, state, categories, priorities } = req.body;
  const categoryList = categoriasEmVigor(categories);
  const priorityList = prioridadesEmVigor(priorities);
  const categoryText = categoryList.map((item) => `• ${item}`).join('; ');
  const priorityText = priorityList.join(', ');

  const prompt = `Esta chamada trata-se de um aplicativo de zeladoria pública. Classifique a descrição abaixo usando EXCLUSIVAMENTE uma das categorias desta lista, copiada exatamente como está escrita: ${categoryText}. Não crie categorias novas nem variações de escrita: se nada se encaixar, use "${categoriaGenerica(categoryList)}". Classifique a prioridade entre: ${priorityText}. Descrição: ${description}\nCEP: ${cep}\nLogradouro: ${street}\nNúmero: ${number}\nBairro: ${neighborhood}\nCidade: ${city}\nEstado: ${state}`;

  try {
    console.debug('OpenAI /chat/completions prompt:', prompt);
    const response = await fetchFunc('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um assistente que classifica ocorrências urbanas. Use somente as categorias fornecidas.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        response_format: esquemaDeClassificacao(categoryList, priorityList)
      })
    });

    const data = await response.json();
    console.debug('OpenAI /chat/completions raw response:', data);

    if (data.error) {
      return res.status(response.status || 500).json({
        error: 'Erro da API OpenAI.',
        details: data.error,
        raw_model_response: data
      });
    }

    const text = data.choices?.[0]?.message?.content || '';
    let parsed;

    try {
      parsed = parseJsonFromText(text);
    } catch (error) {
      return res.status(500).json({ error: 'Resposta do modelo não estava em JSON válido.', raw: text, raw_model_response: data });
    }

    return res.json({
      category: normalizeCategory(parsed.category, categoryList),
      priority: normalizePriority(parsed.priority),
      title: parsed.title || '',
      description: parsed.description || '',
      raw_model_text: text,
      raw_model_response: data
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao chamar a API da OpenAI.', details: error.message });
  }
});

app.post('/api/classify-image', upload.single('photo'), async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key is not configured.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded.' });
  }

  const { buffer, mimetype } = req.file;
  const base64 = buffer.toString('base64');
  const dataUrl = `data:${mimetype};base64,${base64}`;

  let categories;
  let priorities;

  try {
    categories = req.body.categories ? JSON.parse(req.body.categories) : DEFAULT_CATEGORIES;
  } catch (error) {
    categories = DEFAULT_CATEGORIES;
  }

  try {
    priorities = req.body.priorities ? JSON.parse(req.body.priorities) : DEFAULT_PRIORITIES;
  } catch (error) {
    priorities = DEFAULT_PRIORITIES;
  }

  priorities = prioridadesEmVigor(priorities);
  categories = categoriasEmVigor(categories);
  const categoryText = categories.map((item) => `• ${item}`).join('; ');
  const priorityText = priorities.join(', ');
  const promptText = `Esta chamada trata-se de um aplicativo de zeladoria pública. Utilize a foto enviada pelo usuário como evidência. Classifique a ocorrência usando EXCLUSIVAMENTE uma das categorias desta lista, copiada exatamente como está escrita: ${categoryText}. Não crie categorias novas nem variações de escrita: se nada se encaixar, use "${categoriaGenerica(categories)}". Classifique a prioridade entre: ${priorityText}.`;

  try {
    console.debug('OpenAI /responses promptText:', promptText);
    const response = await fetchFunc('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: promptText },
              { type: 'input_image', image_url: dataUrl }
            ]
          }
        ],
        temperature: 0,
        text: {
          format: {
            type: 'json_schema',
            ...esquemaDeClassificacao(categories, priorities).json_schema
          }
        }
      })
    });

    const data = await response.json();
    console.debug('OpenAI /responses raw response:', data);

    if (data.error) {
      return res.status(response.status || 500).json({
        error: 'Erro da API OpenAI.',
        details: data.error,
        raw_model_response: data
      });
    }

    const text = (data.output || [])
      .flatMap((item) => item.content || [])
      .filter((content) => content.type === 'output_text')
      .map((content) => content.text || '')
      .join('\n')
      .trim();

    let parsed;
    try {
      parsed = parseJsonFromText(text);
    } catch (error) {
      return res.status(500).json({ error: 'Resposta do modelo não estava em JSON válido.', raw: text });
    }

    return res.json({
      category: normalizeCategory(parsed.category, categories),
      priority: normalizePriority(parsed.priority),
      title: parsed.title || '',
      description: parsed.description || '',
      raw_model_text: text,
      raw_model_response: data
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao chamar a API da OpenAI.', details: error.message });
  }
});

app.post('/api/notify-user', async (req, res) => {
  const { eventType, incident, actor, previousStatus, newStatus } = req.body || {};
  const recipientEmail = incident?.email || '';
  const recipientPhone = incident?.phone || '';

  if (!incident || (!recipientEmail && !recipientPhone)) {
    return res.status(400).json({
      error: 'Incident and at least one contact (email or phone) are required.'
    });
  }

  const resultado = await enviarNotificacao(eventType, incident, actor, previousStatus, newStatus);
  return res.status(resultado.ok ? 200 : 207).json(resultado);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
