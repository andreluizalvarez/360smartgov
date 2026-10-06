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

  // Produtividade dos administradores de categoria, calculada a partir do
  // historico de cada ocorrencia (quem mudou o status ou registrou trabalho,
  // e quando). `dias` = 0 considera tudo.
  function produtividade(usuarios, dias = 30) {
    const todas = ler();
    const agora = Date.now();
    const inicio = dias > 0 ? agora - dias * 24 * 60 * 60 * 1000 : 0;
    const noPeriodo = (data) => {
      const t = Date.parse(data || '');
      return Number.isFinite(t) && t >= inicio && t <= agora;
    };

    const operadores = (usuarios || []).filter((u) => u.role !== papelAdminSistema);

    const linhas = operadores.map((usuario) => {
      const permitidas = new Set((usuario.allowedCategories || []).map(comparavel));
      const daCategoria = todas.filter((item) => permitidas.has(comparavel(item.category)));

      let mudancasStatus = 0;
      let atualizacoes = 0;
      let resolvidas = 0;
      let somaHorasResolucao = 0;
      let ultimaAtividade = null;
      const ocorrenciasTocadas = new Set();

      for (const item of todas) {
        const historico = Array.isArray(item.history) ? item.history : [];
        for (const entrada of historico) {
          if (!entrada || entrada.by !== usuario.username || !noPeriodo(entrada.at)) continue;
          ocorrenciasTocadas.add(item.id);
          if (!ultimaAtividade || entrada.at > ultimaAtividade) ultimaAtividade = entrada.at;

          if (entrada.type === 'work') {
            atualizacoes += 1;
          } else if (entrada.type === 'status') {
            mudancasStatus += 1;
            if (/para Resolvido$/i.test(entrada.text || '')) {
              resolvidas += 1;
              const abertura = Date.parse(item.createdAt || '');
              const fechamento = Date.parse(entrada.at || '');
              if (Number.isFinite(abertura) && Number.isFinite(fechamento) && fechamento >= abertura) {
                somaHorasResolucao += (fechamento - abertura) / 3600000;
              }
            }
          }
        }
      }

      return {
        id: usuario.id,
        username: usuario.username,
        categorias: usuario.allowedCategories || [],
        naCategoria: daCategoria.length,
        abertasNaCategoria: daCategoria.filter((item) => item.status !== 'Resolvido').length,
        novasNoPeriodo: daCategoria.filter((item) => noPeriodo(item.createdAt)).length,
        ocorrenciasTocadas: ocorrenciasTocadas.size,
        mudancasStatus,
        atualizacoes,
        acoes: mudancasStatus + atualizacoes,
        resolvidas,
        horasMediasResolucao: resolvidas ? Math.round((somaHorasResolucao / resolvidas) * 10) / 10 : null,
        ultimaAtividade
      };
    });

    linhas.sort((a, b) => b.resolvidas - a.resolvidas || b.acoes - a.acoes || a.username.localeCompare(b.username));

    const total = linhas.reduce((acc, linha) => {
      acc.acoes += linha.acoes;
      acc.resolvidas += linha.resolvidas;
      if (linha.acoes > 0) acc.ativos += 1;
      return acc;
    }, { acoes: 0, resolvidas: 0, ativos: 0 });

    const comMedia = linhas.filter((linha) => linha.horasMediasResolucao !== null);
    const horasMedias = comMedia.length
      ? Math.round((comMedia.reduce((acc, linha) => acc + linha.horasMediasResolucao * linha.resolvidas, 0)
          / comMedia.reduce((acc, linha) => acc + linha.resolvidas, 0)) * 10) / 10
      : null;

    return {
      dias,
      geradoEm: new Date(agora).toISOString(),
      resumo: { usuarios: linhas.length, ativos: total.ativos, acoes: total.acoes, resolvidas: total.resolvidas, horasMediasResolucao: horasMedias },
      usuarios: linhas
    };
  }

  return { listar, criar, atualizar, remover, limpar, produtividade, CAMPOS_EDITAVEIS };
}

module.exports = { criarIncidentes, STATUS_INICIAL };
