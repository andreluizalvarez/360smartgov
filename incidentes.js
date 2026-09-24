// Ocorrencias gravadas no servidor.
//
// Ate aqui cada ocorrencia vivia so no localStorage do navegador de quem a
// registrou: o administrador so enxergava o que fora aberto naquele mesmo
// aparelho, e o limite de ~5 MB do navegador derrubava a gravacao de fotos.
// Este modulo guarda tudo em `dados/incidentes.json`, no mesmo molde de
// auth.js, e aplica as regras de permissao por categoria.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STATUS_INICIAL = 'Em análise';
const LIMITE_FOTO_CHARS = 2 * 1024 * 1024;   // data URL em base64 (~1,5 MB de imagem)
const LIMITE_TEXTO = 4000;
const LIMITE_CAMPO = 300;

// Campos que o painel pode alterar depois de aberta a ocorrencia.
const CAMPOS_EDITAVEIS = [
  'status', 'workUpdate', 'workUpdatedBy', 'workUpdatedAt', 'history',
  'latitude', 'longitude', 'category', 'priority'
];

function texto(valor, limite = LIMITE_CAMPO) {
  return (valor === undefined || valor === null ? '' : valor).toString().trim().slice(0, limite);
}

function comparavel(valor) {
  return texto(valor)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function criarIncidentes({ diretorioDados, papelAdminSistema }) {
  const ARQUIVO = path.join(diretorioDados, 'incidentes.json');

  function ler() {
    try {
      const lista = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
      return Array.isArray(lista) ? lista : [];
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

  function podeVer(usuario, incidente) {
    if (!usuario) return false;
    if (usuario.role === papelAdminSistema) return true;
    const permitidas = new Set((usuario.allowedCategories || []).map(comparavel));
    return permitidas.has(comparavel(incidente.category));
  }

  function listar(usuario) {
    return ler().filter((item) => podeVer(usuario, item));
  }

  // Aberta pelo cidadao, sem login: o servidor define id, status e data.
  function criar(dados) {
    const corpo = dados && typeof dados === 'object' ? dados : {};
    const titulo = texto(corpo.title);
    const descricao = texto(corpo.description, LIMITE_TEXTO);
    if (!titulo && !descricao) {
      return { erro: 'Informe um resumo ou uma descrição do problema.', status: 400 };
    }

    const foto = (corpo.photoDataUrl || '').toString();
    if (foto && !/^data:image\/[a-z0-9.+-]+;base64,/i.test(foto)) {
      return { erro: 'Foto em formato inválido.', status: 400 };
    }
    if (foto.length > LIMITE_FOTO_CHARS) {
      return { erro: 'A foto é grande demais. Envie uma imagem menor.', status: 413 };
    }

    const historico = Array.isArray(corpo.history) ? corpo.history.slice(0, 50) : [];

    const novo = {
      id: crypto.randomUUID(),
      name: texto(corpo.name),
      email: texto(corpo.email),
      phone: texto(corpo.phone),
      title: titulo,
      category: texto(corpo.category),
      priority: texto(corpo.priority),
      description: descricao,
      cep: texto(corpo.cep),
      street: texto(corpo.street),
      number: texto(corpo.number),
      neighborhood: texto(corpo.neighborhood),
      city: texto(corpo.city),
      state: texto(corpo.state),
      address: texto(corpo.address),
      latitude: texto(corpo.latitude),
      longitude: texto(corpo.longitude),
      photoDataUrl: foto,
      workUpdate: '',
      workUpdatedBy: '',
      workUpdatedAt: '',
      history: historico,
      status: STATUS_INICIAL,
      createdAt: new Date().toISOString()
    };

    const lista = ler();
    lista.unshift(novo);
    salvar(lista);
    return { incidente: novo };
  }

  function atualizar(id, campos, usuario) {
    const lista = ler();
    const indice = lista.findIndex((item) => item.id === id);
    if (indice === -1) return { erro: 'Ocorrência não encontrada.', status: 404 };
    if (!podeVer(usuario, lista[indice])) {
      return { erro: 'Você não tem permissão para alterar esta ocorrência.', status: 403 };
    }

    const mudancas = {};
    for (const campo of CAMPOS_EDITAVEIS) {
      if (campos && Object.prototype.hasOwnProperty.call(campos, campo)) {
        mudancas[campo] = campos[campo];
      }
    }
    if (mudancas.history !== undefined && !Array.isArray(mudancas.history)) {
      delete mudancas.history;
    }
    if (mudancas.workUpdate !== undefined) mudancas.workUpdate = texto(mudancas.workUpdate, LIMITE_TEXTO);
    if (mudancas.status !== undefined) mudancas.status = texto(mudancas.status);

    // Um admin de categoria nao pode mover a ocorrencia para fora do que enxerga.
    if (mudancas.category !== undefined) {
      const futuro = { ...lista[indice], category: mudancas.category };
      if (!podeVer(usuario, futuro)) {
        return { erro: 'Você não tem permissão para mover a ocorrência para essa categoria.', status: 403 };
      }
    }

    lista[indice] = { ...lista[indice], ...mudancas, updatedAt: new Date().toISOString() };
    salvar(lista);
    return { incidente: lista[indice] };
  }

  function remover(id, usuario) {
    const lista = ler();
    const alvo = lista.find((item) => item.id === id);
    if (!alvo) return { erro: 'Ocorrência não encontrada.', status: 404 };
    if (!podeVer(usuario, alvo)) {
      return { erro: 'Você não tem permissão para remover esta ocorrência.', status: 403 };
    }
    salvar(lista.filter((item) => item.id !== id));
    return { removido: true };
  }

  function limpar() {
    const quantidade = ler().length;
    salvar([]);
    return { removidas: quantidade };
  }

  return { listar, criar, atualizar, remover, limpar, CAMPOS_EDITAVEIS };
}

module.exports = { criarIncidentes, STATUS_INICIAL };
