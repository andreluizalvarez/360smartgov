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
// A foto vai em base64 dentro de um JSON, como no envio da ocorrencia: o
// envio como arquivo (multipart) falhava no iPhone antes de chegar ao servidor.
export async function classificarFoto(base64, categorias, prioridades) {
  const corpo = JSON.stringify({ photoBase64: base64, categories: categorias, priorities: prioridades });

  // A analise leva alguns segundos; com sinal fraco, desiste em 60 s em vez
  // de deixar a tela presa. Uma falha de rede tenta mais uma vez.
  let ultimoErro;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 60000);
    try {
      const resposta = await fetch(BASE_URL + '/api/classify-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: corpo,
        signal: controle.signal
      });
      const corpo = await lerJson(resposta);
      if (resposta.status === 422) {
        return { rejeitada: true, motivo: corpo.error || 'A foto não foi aceita.' };
      }
      if (resposta.status === 413) {
        return { rejeitada: true, motivo: 'A foto ficou grande demais para enviar. Tente outra foto.' };
      }
      if (!resposta.ok) return null;
      return corpo;
    } catch (error) {
      ultimoErro = error;
    } finally {
      clearTimeout(limite);
    }
  }
  throw ultimoErro;
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
