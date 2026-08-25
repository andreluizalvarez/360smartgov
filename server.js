const express = require('express');
const path = require('path');
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
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
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

app.use(express.static(path.join(__dirname)));
app.use(express.json());

function parseJsonFromText(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Não foi possível localizar JSON na resposta.');
  }
  return JSON.parse(jsonMatch[0]);
}

function normalizeCategory(value) {
  if (!value) return 'Outros';
  const normalized = value.toString().toLowerCase();
  if (normalized.includes('ilumina') || normalized.includes('lâmpada') || normalized.includes('luz')) return 'Iluminação pública';
  if (normalized.includes('buraco')) return 'Buraco';
  if (normalized.includes('árvore')) return 'Árvore caída';
  if (normalized.includes('descarte')) return 'Descarte irregular';
  if (normalized.includes('boca') || normalized.includes('lobo')) return 'Boca de lobo';
  if (normalized.includes('vazamento')) return 'Vazamento';
  if (normalized.includes('semáforo') || normalized.includes('semaforo')) return 'Semáforo';
  if (normalized.includes('limpeza') || normalized.includes('lixo') || normalized.includes('varri')) return 'Limpeza urbana';
  return 'Outros';
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

function buildNotificationText(eventType, incident, actor, previousStatus, newStatus) {
  const title = incident?.title || 'Ocorrência';
  const category = incident?.category || 'Não informada';
  const status = incident?.status || newStatus || 'Não informado';
  const address = incident?.address || [incident?.street, incident?.number, incident?.neighborhood, incident?.city, incident?.state].filter(Boolean).join(', ') || 'Não informado';
  const citizenName = incident?.name || 'Cidadão';
  const createdAt = formatDateLabel(incident?.createdAt);

  if (eventType === 'status_changed') {
    const fromStatus = previousStatus || 'Não informado';
    const toStatus = newStatus || status;
    const by = actor || 'equipe administrativa';

    return {
      subject: `SmartGov 360: status atualizado para "${toStatus}"`,
      emailText: [
        `Olá, ${citizenName}!`,
        '',
        `Sua ocorrência "${title}" teve atualização de status.`,
        `Status anterior: ${fromStatus}`,
        `Novo status: ${toStatus}`,
        `Categoria: ${category}`,
        `Endereço: ${address}`,
        `Atualizado por: ${by}`,
        '',
        'Mensagem automática do SmartGov 360.'
      ].join('\n'),
      whatsappText: `SmartGov 360: sua ocorrência "${title}" mudou de status (${fromStatus} -> ${toStatus}). Categoria: ${category}. Atualizado por: ${by}.`
    };
  }

  return {
    subject: 'SmartGov 360: ocorrência registrada com sucesso',
    emailText: [
      `Olá, ${citizenName}!`,
      '',
      `Recebemos sua ocorrência "${title}" com sucesso.`,
      `Categoria: ${category}`,
      `Prioridade: ${incident?.priority || 'Não informada'}`,
      `Status inicial: ${status}`,
      `Endereço: ${address}`,
      `Data de abertura: ${createdAt}`,
      '',
      'Mensagem automática do SmartGov 360.'
    ].join('\n'),
    whatsappText: `SmartGov 360: ocorrência "${title}" aberta com sucesso. Status inicial: ${status}. Categoria: ${category}.`
  };
}

let gmailTransporter = null;

function getGmailTransporter() {
  if (gmailTransporter) {
    return gmailTransporter;
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return null;
  }

  gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD
    }
  });

  return gmailTransporter;
}

async function sendEmailViaGmail(toEmail, subject, text) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return { sent: false, reason: 'Gmail SMTP is not configured.' };
  }

  const transporter = getGmailTransporter();
  if (!transporter) {
    return { sent: false, reason: 'Gmail SMTP is not configured.' };
  }

  const info = await transporter.sendMail({
    from: GMAIL_FROM_EMAIL || GMAIL_USER,
    to: toEmail,
    subject,
    text
  });

  return { sent: true, providerId: info?.messageId || null };
}

async function sendEmailViaResend(toEmail, subject, text) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return { sent: false, reason: 'Resend is not configured.' };
  }

  const response = await fetchFunc('https://api.resend.com/emails', {
    method: 'POST',
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

async function sendEmailNotification(toEmail, subject, text) {
  if (!toEmail) {
    return { sent: false, reason: 'Recipient email not provided.' };
  }

  const canUseGmail = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
  const canUseResend = Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL);

  if (EMAIL_PROVIDER === 'gmail' || (EMAIL_PROVIDER === 'auto' && canUseGmail)) {
    return sendEmailViaGmail(toEmail, subject, text);
  }

  if (EMAIL_PROVIDER === 'resend' || (EMAIL_PROVIDER === 'auto' && canUseResend)) {
    return sendEmailViaResend(toEmail, subject, text);
  }

  return { sent: false, reason: 'No email provider configured. Set Gmail or Resend credentials.' };
}

async function sendWhatsAppNotification(toPhone, text) {
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
  params.set('Body', text);

  const basicToken = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetchFunc(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    return { sent: false, reason: data?.message || 'Failed to send WhatsApp message.' };
  }

  return { sent: true, providerId: data?.sid || null };
}

app.post('/api/classify', async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OpenAI API key is not configured.' });
  }

  const { description, cep, street, number, neighborhood, city, state, categories, priorities } = req.body;
  const categoryList = Array.isArray(categories) && categories.length ? categories : DEFAULT_CATEGORIES;
  const priorityList = Array.isArray(priorities) && priorities.length ? priorities : DEFAULT_PRIORITIES;
  const categoryText = categoryList.map((item) => `• ${item}`).join('; ');
  const priorityText = priorityList.join(', ');

  const prompt = `Para fazer a chamada da API do ChatGPT, utilizar o texto abaixo. Esta chamada trata-se de um aplicativo de zeladoria pública. Quero que identifique esta descrição e a classifique entre ${categoryText}. Classifique a prioridade entre: ${priorityText}. Retorne APENAS JSON válido no formato {"category":"...","priority":"...","title":"...","description":"..."}. Descrição: ${description}\nCEP: ${cep}\nLogradouro: ${street}\nNúmero: ${number}\nBairro: ${neighborhood}\nCidade: ${city}\nEstado: ${state}`;

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
          { role: 'system', content: 'Você é um assistente que classifica ocorrências urbanas.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0
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
      category: normalizeCategory(parsed.category),
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

  if (!Array.isArray(categories) || !categories.length) {
    categories = DEFAULT_CATEGORIES;
  }
  if (!Array.isArray(priorities) || !priorities.length) {
    priorities = DEFAULT_PRIORITIES;
  }
  const categoryText = categories.map((item) => `• ${item}`).join('; ');
  const priorityText = priorities.join(', ');
  const promptText = `Para fazer a chamada da API do ChatGPT, utilizar o texto abaixo. Esta chamada trata-se de um aplicativo de zeladoria pública. Utilize a foto enviada pelo usuário como evidência. Quero que identifique esta imagem e a classifique entre ${categoryText}. Classifique a prioridade entre: ${priorityText}. Retorne APENAS JSON válido no formato {"category":"...","priority":"...","title":"...","description":"..."}.`;

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
        temperature: 0
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
      category: normalizeCategory(parsed.category),
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

  const composed = buildNotificationText(eventType, incident, actor, previousStatus, newStatus);

  const [emailResult, whatsappResult] = await Promise.all([
    sendEmailNotification(recipientEmail, composed.subject, composed.emailText).catch((error) => ({ sent: false, reason: error.message })),
    sendWhatsAppNotification(recipientPhone, composed.whatsappText).catch((error) => ({ sent: false, reason: error.message }))
  ]);

  const success = emailResult.sent || whatsappResult.sent;
  return res.status(success ? 200 : 207).json({
    ok: success,
    email: emailResult,
    whatsapp: whatsappResult
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
