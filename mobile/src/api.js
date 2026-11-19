// Cliente da API do SmartGov 360. O app usa exatamente a mesma API do site:
// nada e duplicado no servidor, e toda ocorrencia aberta pelo app aparece no
// painel da prefeitura como se tivesse sido aberta pelo site.

export const BASE_URL = 'https://www.360smartgov.com.br';

async function lerJson(resposta) {
  try {
    return await resposta.json();
  } catch (error) {
    return {};
  }
}

async function get(caminho) {
  const resposta = await fetch(BASE_URL + caminho);
  const corpo = await lerJson(resposta);
  return { ok: resposta.ok, status: resposta.status, corpo };
}

async function postJson(caminho, dados) {
  const resposta = await fetch(BASE_URL + caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados)
  });
  const corpo = await lerJson(resposta);
  return { ok: resposta.ok, status: resposta.status, corpo };
}

// Categorias e prioridades cadastradas pelo administrador no painel.
export async function obterConfiguracao() {
  const { ok, corpo } = await get('/api/config');
  if (!ok) throw new Error(corpo.error || 'Não foi possível carregar as categorias.');
  return {
    categorias: Array.isArray(corpo.categories) ? corpo.categories : [],
    prioridades: Array.isArray(corpo.priorities) ? corpo.priorities : ['Baixa', 'Média', 'Alta', 'Urgente']
  };
}

// Envia a foto para a IA: ela confere se mostra um problema urbano e sugere
// categoria, prioridade, titulo e descricao. O `fotoToken` devolvido prova,
// no envio da ocorrencia, que esta mesma foto passou pela verificacao.
export async function classificarFoto(uri, categorias, prioridades) {
  const form = new FormData();
  form.append('photo', { uri, name: 'foto.jpg', type: 'image/jpeg' });
  form.append('categories', JSON.stringify(categorias));
  form.append('priorities', JSON.stringify(prioridades));

  const resposta = await fetch(BASE_URL + '/api/classify-image', { method: 'POST', body: form });
  const corpo = await lerJson(resposta);
  if (resposta.status === 422) {
    return { rejeitada: true, motivo: corpo.error || 'A foto não foi aceita.' };
  }
  if (!resposta.ok) return null;
  return corpo;
}

// Classificacao pela descricao, usada quando a foto nao trouxe sugestao.
export async function classificarTexto(dados) {
  const { ok, corpo } = await postJson('/api/classify', dados);
  if (!ok) return null;
  return corpo;
}

export async function criarOcorrencia(ocorrencia) {
  const { ok, corpo } = await postJson('/api/incidentes', ocorrencia);
  if (!ok) return { erro: corpo.error || 'Não foi possível registrar a ocorrência. Tente novamente.' };
  return { incidente: corpo.incidente };
}

export async function consultarProtocolo(numero) {
  const limpo = (numero || '').toString().replace(/\D/g, '');
  if (!limpo) return { erro: 'Digite o número do protocolo.' };
  const { ok, corpo } = await get('/api/protocolo/' + encodeURIComponent(limpo));
  if (!ok) return { erro: corpo.error || 'Protocolo não encontrado.' };
  return { ocorrencia: corpo.ocorrencia };
}

export async function ocorrenciasRecentes() {
  const { ok, corpo } = await get('/api/incidentes/recentes');
  return ok && Array.isArray(corpo.incidentes) ? corpo.incidentes : [];
}

export async function publicacoesAtivas() {
  const { ok, corpo } = await get('/api/publicacoes');
  return ok && Array.isArray(corpo.publicacoes) ? corpo.publicacoes : [];
}

export async function consultarAvaliacao(token) {
  const { ok, corpo } = await get('/api/avaliacao/' + encodeURIComponent(token));
  if (!ok) return { erro: corpo.error || 'Este link de avaliação é inválido.' };
  return { ocorrencia: corpo.ocorrencia };
}

export async function registrarAvaliacao(token, nota, comentario) {
  const { ok, corpo } = await postJson('/api/avaliacao/' + encodeURIComponent(token), { nota, comentario });
  if (!ok) return { erro: corpo.error || 'Não foi possível enviar a avaliação.' };
  return { avaliacao: corpo.avaliacao };
}
