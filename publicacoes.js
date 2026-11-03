// Publicacoes da Prefeitura (acoes, campanhas, avisos) exibidas na pagina
// inicial do cidadao e gerenciadas pela aba Publicacoes do painel. Ficam em
// dados/publicacoes.json; a imagem vai como data URL ja reduzida pelo painel.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIMITE_TITULO = 120;
const LIMITE_TEXTO = 1200;
const LIMITE_LINK = 500;
const LIMITE_IMAGEM = 2000000; // caracteres do data URL (~1,5 MB de imagem)

function texto(valor, limite) {
  return (valor === undefined || valor === null ? '' : valor).toString().trim().slice(0, limite);
}

function criarPublicacoes({ diretorioDados }) {
  const ARQUIVO = path.join(diretorioDados, 'publicacoes.json');

  function ler() {
    try {
      const lista = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
      return Array.isArray(lista) ? lista.filter((p) => p && typeof p === 'object' && p.id) : [];
    } catch (error) {
      return [];
    }
  }

  function salvar(lista) {
    fs.mkdirSync(diretorioDados, { recursive: true });
    const temporario = ARQUIVO + '.tmp';
    fs.writeFileSync(temporario, JSON.stringify(lista, null, 2), 'utf8');
    fs.renameSync(temporario, ARQUIVO);
  }

  // Campos ausentes mantem o valor atual (edicao parcial, ex.: so "ativo").
  function validar(dados, atual = {}) {
    const titulo = dados.titulo !== undefined ? texto(dados.titulo, LIMITE_TITULO) : (atual.titulo || '');
    if (!titulo) return { erro: 'Informe o título da publicação.', status: 400 };
    const corpo = dados.texto !== undefined ? texto(dados.texto, LIMITE_TEXTO) : (atual.texto || '');
    const link = dados.link !== undefined ? texto(dados.link, LIMITE_LINK) : (atual.link || '');
    if (link && !/^https?:\/\//i.test(link)) return { erro: 'O link precisa começar com http:// ou https://.', status: 400 };
    let imagem = atual.imagem || '';
    if (dados.imagem !== undefined) {
      imagem = (dados.imagem || '').toString();
      if (imagem && !/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(imagem)) {
        return { erro: 'A imagem precisa ser JPEG, PNG, WebP ou GIF.', status: 400 };
      }
      if (imagem.length > LIMITE_IMAGEM) return { erro: 'A imagem é grande demais (máximo de 1,5 MB).', status: 400 };
    }
    const ativo = dados.ativo !== undefined ? Boolean(dados.ativo) : (atual.ativo !== undefined ? Boolean(atual.ativo) : true);
    return { valores: { titulo, texto: corpo, link, imagem, ativo } };
  }

  function ordenar(lista) {
    return lista.slice().sort((a, b) => Date.parse(b.criadoEm || 0) - Date.parse(a.criadoEm || 0));
  }

  // O que a pagina inicial mostra: so as ativas, sem dados de quem publicou.
  function publicas() {
    return ordenar(ler().filter((p) => p.ativo)).map(({ id, titulo, texto: corpo, link, imagem, criadoEm }) => ({ id, titulo, texto: corpo, link, imagem, criadoEm }));
  }

  function listar() {
    return ordenar(ler());
  }

  function criar(dados, usuario) {
    const validacao = validar(dados || {});
    if (validacao.erro) return validacao;
    const agora = new Date().toISOString();
    const publicacao = { id: crypto.randomUUID(), ...validacao.valores, criadoEm: agora, atualizadoEm: agora, criadoPor: usuario?.username || '' };
    const lista = ler();
    lista.push(publicacao);
    salvar(lista);
    return { publicacao };
  }

  function atualizar(id, dados, usuario) {
    const lista = ler();
    const indice = lista.findIndex((p) => p.id === id);
    if (indice === -1) return { erro: 'Publicação não encontrada.', status: 404 };
    const validacao = validar(dados || {}, lista[indice]);
    if (validacao.erro) return validacao;
    lista[indice] = { ...lista[indice], ...validacao.valores, atualizadoEm: new Date().toISOString(), atualizadoPor: usuario?.username || '' };
    salvar(lista);
    return { publicacao: lista[indice] };
  }

  function remover(id) {
    const lista = ler();
    const restante = lista.filter((p) => p.id !== id);
    if (restante.length === lista.length) return { erro: 'Publicação não encontrada.', status: 404 };
    salvar(restante);
    return { removida: id };
  }

  return { publicas, listar, criar, atualizar, remover };
}

module.exports = { criarPublicacoes };
