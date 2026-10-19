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

const STATUS_INICIAL = 'Recebido';
const STATUS_FINAL = 'Concluído';
const STATUS_VALIDOS = [STATUS_INICIAL, 'Em andamento', STATUS_FINAL];

// Nomes antigos gravados antes da troca: continuam legiveis sem migrar o
// arquivo a mao.
const STATUS_ANTIGOS = { 'em análise': STATUS_INICIAL, 'em analise': STATUS_INICIAL, 'resolvido': STATUS_FINAL };

function normalizarStatus(valor) {
  const bruto = (valor === undefined || valor === null ? '' : valor).toString().trim();
  const antigo = STATUS_ANTIGOS[bruto.toLowerCase()];
  if (antigo) return antigo;
  const conhecido = STATUS_VALIDOS.find((item) => item.toLowerCase() === bruto.toLowerCase());
  return conhecido || bruto;
}
const LIMITE_FOTO_CHARS = 2 * 1024 * 1024;   // data URL em base64 (~1,5 MB de imagem)
const LIMITE_TEXTO = 4000;
const LIMITE_CAMPO = 300;

// Campos que o painel pode alterar depois de aberta a ocorrencia.
const CAMPOS_EDITAVEIS = [
  'status', 'workUpdate', 'workUpdatedBy', 'workUpdatedAt', 'history',
  'latitude', 'longitude', 'category', 'priority', 'respostaConclusao'
];

// Versao do termo de consentimento (LGPD) aceito no formulario.
const VERSAO_CONSENTIMENTO = '2026-10';

function diasDesde(iso, agora = Date.now()) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? Math.max(0, (agora - t) / 86400000) : null;
}

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

  const PRIMEIRO_PROTOCOLO = 1001;

  function ler() {
    let lista;
    try {
      lista = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
      if (!Array.isArray(lista)) return [];
    } catch (error) {
      return [];
    }
    lista = lista.map((item) => (item && typeof item === 'object' ? { ...item, status: normalizarStatus(item.status) || STATUS_INICIAL } : item));

    // Ocorrencias anteriores ao protocolo recebem um numero na ordem de abertura.
    if (lista.some((item) => item && !Number.isInteger(item.protocolo))) {
      let proximo = Math.max(PRIMEIRO_PROTOCOLO - 1, ...lista.map((item) => Number(item?.protocolo) || 0)) + 1;
      const semProtocolo = lista.filter((item) => item && !Number.isInteger(item.protocolo))
        .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
      for (const item of semProtocolo) item.protocolo = proximo++;
      salvar(lista);
    }
    return lista;
  }

  function proximoProtocolo(lista) {
    return Math.max(PRIMEIRO_PROTOCOLO - 1, ...lista.map((item) => Number(item?.protocolo) || 0)) + 1;
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

    // LGPD: sem o aceite do termo a ocorrencia nao e gravada.
    const consentimento = corpo.consentimento && typeof corpo.consentimento === 'object' ? corpo.consentimento : null;
    if (!consentimento || consentimento.aceito !== true) {
      return { erro: 'É preciso aceitar o termo de consentimento para o uso dos dados (LGPD).', status: 400 };
    }

    const historico = Array.isArray(corpo.history) ? corpo.history.slice(0, 50) : [];

    const lista = ler();
    const novo = {
      id: crypto.randomUUID(),
      protocolo: proximoProtocolo(lista),
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
      respostaConclusao: '',
      concluidoEm: '',
      avaliacaoToken: '',
      avaliacao: null,
      consentimento: {
        aceito: true,
        em: new Date().toISOString(),
        versao: texto(consentimento.versao) || VERSAO_CONSENTIMENTO
      },
      createdAt: new Date().toISOString()
    };

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
    if (mudancas.status !== undefined) {
      mudancas.status = normalizarStatus(texto(mudancas.status));
      if (!STATUS_VALIDOS.includes(mudancas.status)) {
        return { erro: 'Status inválido. Use: ' + STATUS_VALIDOS.join(', ') + '.', status: 400 };
      }
    }

    // Um admin de categoria nao pode mover a ocorrencia para fora do que enxerga.
    if (mudancas.category !== undefined) {
      const futuro = { ...lista[indice], category: mudancas.category };
      if (!podeVer(usuario, futuro)) {
        return { erro: 'Você não tem permissão para mover a ocorrência para essa categoria.', status: 403 };
      }
    }

    if (mudancas.respostaConclusao !== undefined) {
      mudancas.respostaConclusao = texto(mudancas.respostaConclusao, LIMITE_TEXTO);
    }

    // Ao concluir: registra quando, e gera o link unico da pesquisa de satisfacao.
    const atual = lista[indice];
    if (mudancas.status === STATUS_FINAL && atual.status !== STATUS_FINAL) {
      mudancas.concluidoEm = new Date().toISOString();
      if (!atual.avaliacaoToken) mudancas.avaliacaoToken = crypto.randomBytes(18).toString('base64url');
    }

    lista[indice] = { ...atual, ...mudancas, updatedAt: new Date().toISOString() };
    salvar(lista);
    return { incidente: lista[indice] };
  }

  // ------------------------------------------------ acompanhamento publico
  //
  // Pelo numero do protocolo qualquer pessoa ve o andamento, sem dados
  // pessoais nem a foto: titulo, categoria, local aproximado, status e datas.
  function publico(item) {
    const historico = Array.isArray(item.history) ? item.history : [];
    const etapas = historico
      .filter((h) => h && h.type === 'status' && /para (.+)$/.test(h.text || ''))
      .map((h) => ({ status: normalizarStatus((h.text.match(/para (.+)$/) || [])[1]), at: h.at }))
      .filter((e) => STATUS_VALIDOS.includes(e.status));
    return {
      protocolo: item.protocolo,
      title: item.title,
      category: item.category,
      status: item.status,
      createdAt: item.createdAt,
      concluidoEm: item.concluidoEm || '',
      street: item.street,
      neighborhood: item.neighborhood,
      city: item.city,
      state: item.state,
      description: item.description,
      respostaConclusao: item.respostaConclusao || '',
      avaliada: Boolean(item.avaliacao),
      nota: item.avaliacao?.nota ?? null,
      etapas
    };
  }

  function consultarProtocolo(numero) {
    const n = Number((numero || '').toString().replace(/\D/g, ''));
    if (!Number.isInteger(n) || n < 1) return { erro: 'Informe o número do protocolo.', status: 400 };
    const item = ler().find((i) => i.protocolo === n);
    if (!item) return { erro: 'Protocolo não encontrado. Confira o número no e-mail que você recebeu.', status: 404 };
    return { ocorrencia: publico(item) };
  }

  function recentes(limite = 6) {
    return ler().slice(0, limite).map((item) => ({
      protocolo: item.protocolo,
      title: item.title,
      category: item.category,
      status: item.status,
      neighborhood: item.neighborhood,
      city: item.city,
      createdAt: item.createdAt
    }));
  }

  // ------------------------------------------------ pesquisa de satisfacao
  //
  // O cidadao recebe, na conclusao, um link com um token unico. A pagina
  // publica so enxerga o minimo (titulo e status) e grava uma unica avaliacao.
  function porTokenDeAvaliacao(token) {
    const limpo = (token || '').toString().trim();
    if (!limpo) return null;
    return ler().find((item) => item.avaliacaoToken && item.avaliacaoToken === limpo) || null;
  }

  function consultarAvaliacao(token) {
    const item = porTokenDeAvaliacao(token);
    if (!item) return { erro: 'Link de avaliação inválido.', status: 404 };
    return {
      ocorrencia: {
        title: item.title,
        category: item.category,
        status: item.status,
        concluidoEm: item.concluidoEm || '',
        respostaConclusao: item.respostaConclusao || '',
        avaliada: Boolean(item.avaliacao)
      }
    };
  }

  function registrarAvaliacao(token, dados) {
    const lista = ler();
    const limpo = (token || '').toString().trim();
    const indice = limpo ? lista.findIndex((item) => item.avaliacaoToken && item.avaliacaoToken === limpo) : -1;
    if (indice === -1) return { erro: 'Link de avaliação inválido.', status: 404 };
    if (lista[indice].status !== STATUS_FINAL) return { erro: 'A ocorrência ainda não foi concluída.', status: 409 };
    if (lista[indice].avaliacao) return { erro: 'Esta ocorrência já foi avaliada. Obrigado!', status: 409 };

    const nota = Number(dados?.nota);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
      return { erro: 'Informe uma nota de 1 a 5.', status: 400 };
    }

    lista[indice] = {
      ...lista[indice],
      avaliacao: { nota, comentario: texto(dados?.comentario, 1000), em: new Date().toISOString() },
      updatedAt: new Date().toISOString()
    };
    salvar(lista);
    return { avaliacao: lista[indice].avaliacao };
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
  function produtividade(usuarios, dias = 30, { somenteUsuarioId = null } = {}) {
    const todas = ler();
    const agora = Date.now();
    const inicio = dias > 0 ? agora - dias * 24 * 60 * 60 * 1000 : 0;
    const noPeriodo = (data) => {
      const t = Date.parse(data || '');
      return Number.isFinite(t) && t >= inicio && t <= agora;
    };

    const operadores = (usuarios || [])
      .filter((u) => u.role !== papelAdminSistema)
      .filter((u) => !somenteUsuarioId || u.id === somenteUsuarioId);

    const linhas = operadores.map((usuario) => {
      const permitidas = new Set((usuario.allowedCategories || []).map(comparavel));
      const daCategoria = todas.filter((item) => permitidas.has(comparavel(item.category)));

      let mudancasStatus = 0;
      let atualizacoes = 0;
      let resolvidas = 0;
      let somaHorasResolucao = 0;
      let ultimaAtividade = null;
      let somaNotas = 0;
      let avaliacoes = 0;
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
            if (/para (Resolvido|Concluído|Concluido)$/i.test(entrada.text || '')) {
              resolvidas += 1;
              const abertura = Date.parse(item.createdAt || '');
              const fechamento = Date.parse(entrada.at || '');
              if (Number.isFinite(abertura) && Number.isFinite(fechamento) && fechamento >= abertura) {
                somaHorasResolucao += (fechamento - abertura) / 3600000;
              }
              if (item.avaliacao && Number.isFinite(Number(item.avaliacao.nota))) {
                somaNotas += Number(item.avaliacao.nota);
                avaliacoes += 1;
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
        abertasNaCategoria: daCategoria.filter((item) => item.status !== STATUS_FINAL).length,
        concluidasNaCategoria: daCategoria.filter((item) => item.status === STATUS_FINAL && noPeriodo(item.concluidoEm || item.updatedAt)).length,
        novasNoPeriodo: daCategoria.filter((item) => noPeriodo(item.createdAt)).length,
        ocorrenciasTocadas: ocorrenciasTocadas.size,
        mudancasStatus,
        atualizacoes,
        acoes: mudancasStatus + atualizacoes,
        resolvidas,
        horasMediasResolucao: resolvidas ? Math.round((somaHorasResolucao / resolvidas) * 10) / 10 : null,
        avaliacoes,
        notaMedia: avaliacoes ? Math.round((somaNotas / avaliacoes) * 10) / 10 : null,
        ultimaAtividade
      };
    });

    linhas.sort((a, b) => b.resolvidas - a.resolvidas || b.acoes - a.acoes || a.username.localeCompare(b.username));

    const total = linhas.reduce((acc, linha) => {
      acc.acoes += linha.acoes;
      acc.resolvidas += linha.resolvidas;
      acc.avaliacoes += linha.avaliacoes;
      acc.somaNotas += (linha.notaMedia || 0) * linha.avaliacoes;
      if (linha.acoes > 0) acc.ativos += 1;
      return acc;
    }, { acoes: 0, resolvidas: 0, ativos: 0, avaliacoes: 0, somaNotas: 0 });

    const comMedia = linhas.filter((linha) => linha.horasMediasResolucao !== null);
    const horasMedias = comMedia.length
      ? Math.round((comMedia.reduce((acc, linha) => acc + linha.horasMediasResolucao * linha.resolvidas, 0)
          / comMedia.reduce((acc, linha) => acc + linha.resolvidas, 0)) * 10) / 10
      : null;

    return {
      dias,
      geradoEm: new Date(agora).toISOString(),
      resumo: {
        usuarios: linhas.length, ativos: total.ativos, acoes: total.acoes, resolvidas: total.resolvidas,
        horasMediasResolucao: horasMedias,
        avaliacoes: total.avaliacoes,
        notaMedia: total.avaliacoes ? Math.round((total.somaNotas / total.avaliacoes) * 10) / 10 : null
      },
      usuarios: linhas
    };
  }

  // ------------------------------------------------ visao executiva
  //
  // Numeros agregados da cidade para o prefeito: status, tempo de resposta,
  // problemas e bairros mais frequentes, atrasos por secretaria (usuario de
  // categoria) e as ocorrencias abertas ha mais tempo. E tambem a base de
  // dados reais que o resumo por IA recebe.
  function visaoExecutiva(usuarios, dias = 30, { limiteAtrasoDias = 7 } = {}) {
    const todas = ler();
    const agora = Date.now();
    const inicio = dias > 0 ? agora - dias * 86400000 : 0;
    const noPeriodo = (iso) => {
      const t = Date.parse(iso || '');
      return Number.isFinite(t) && t >= inicio && t <= agora;
    };
    const doPeriodo = todas.filter((item) => noPeriodo(item.createdAt));
    const abertas = todas.filter((item) => item.status !== STATUS_FINAL);
    const concluidasNoPeriodo = todas.filter((item) => item.status === STATUS_FINAL && noPeriodo(item.concluidoEm || item.updatedAt));

    const contar = (lista, chave) => {
      const mapa = new Map();
      for (const item of lista) {
        const valor = texto(chave(item)) || 'Não informado';
        mapa.set(valor, (mapa.get(valor) || 0) + 1);
      }
      return [...mapa.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
    };

    const porCategoria = contar(doPeriodo, (i) => i.category).map((c) => ({
      ...c,
      abertas: abertas.filter((i) => comparavel(i.category) === comparavel(c.nome)).length
    }));
    const porBairro = contar(doPeriodo, (i) => i.neighborhood || i.city);

    const horas = concluidasNoPeriodo
      .map((i) => (Date.parse(i.concluidoEm || i.updatedAt || '') - Date.parse(i.createdAt || '')) / 3600000)
      .filter((h) => Number.isFinite(h) && h >= 0);
    const horasMedias = horas.length ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10 : null;

    const dataCurta = (iso) => (iso ? iso.slice(0, 10) : '');
    const resumir = (i) => ({
      id: i.id,
      protocolo: i.protocolo,
      title: i.title,
      category: i.category,
      priority: i.priority,
      bairro: i.neighborhood || i.city || '',
      status: i.status,
      criadaEm: dataCurta(i.createdAt),
      atualizadaEm: dataCurta(i.updatedAt || i.createdAt),
      concluidaEm: dataCurta(i.concluidoEm),
      diasAberta: Math.floor(diasDesde(i.createdAt, agora) || 0)
    });

    // Criterios (tambem exibidos no painel):
    // - atrasada: aberta ha mais de `limiteAtrasoDias` dias (padrao 7);
    // - critica: atrasada E (prioridade Alta/Urgente OU aberta ha mais de 15 dias).
    const LIMITE_CRITICA_DIAS = 15;
    const prioridadeAlta = (p) => /urgente|alta/i.test(p || '');
    const atrasadas = abertas
      .map(resumir)
      .filter((i) => i.diasAberta >= limiteAtrasoDias)
      .sort((a, b) => b.diasAberta - a.diasAberta);
    const criticas = atrasadas
      .filter((i) => prioridadeAlta(i.priority) || i.diasAberta >= LIMITE_CRITICA_DIAS)
      .map((i) => ({
        ...i,
        motivo: [prioridadeAlta(i.priority) ? 'prioridade ' + i.priority : null, i.diasAberta >= LIMITE_CRITICA_DIAS ? 'aberta há ' + i.diasAberta + ' dias' : null].filter(Boolean).join(' e ')
      }));

    const secretarias = (usuarios || [])
      .filter((u) => u.role !== papelAdminSistema)
      .map((u) => {
        const permitidas = new Set((u.allowedCategories || []).map(comparavel));
        const suas = todas.filter((i) => permitidas.has(comparavel(i.category)));
        const suasAbertas = suas.filter((i) => i.status !== STATUS_FINAL);
        const suasAtrasadas = suasAbertas.filter((i) => (diasDesde(i.createdAt, agora) || 0) >= limiteAtrasoDias);
        const concluidas = suas.filter((i) => i.status === STATUS_FINAL && noPeriodo(i.concluidoEm || i.updatedAt));
        const notas = suas.filter((i) => i.avaliacao).map((i) => Number(i.avaliacao.nota));
        return {
          id: u.id,
          username: u.username,
          categorias: u.allowedCategories || [],
          total: suas.length,
          abertas: suasAbertas.length,
          atrasadas: suasAtrasadas.length,
          concluidasNoPeriodo: concluidas.length,
          maisAntigaDias: suasAbertas.length ? Math.floor(Math.max(...suasAbertas.map((i) => diasDesde(i.createdAt, agora) || 0))) : 0,
          notaMedia: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null
        };
      })
      .sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas);

    const notas = todas.filter((i) => i.avaliacao).map((i) => Number(i.avaliacao.nota));

    // Serie diaria de recebidas e concluidas (ate 90 dias) para o grafico.
    const diasSerie = Math.min(dias > 0 ? dias : 90, 90);
    const serie = [];
    const chaveDia = (iso) => {
      const t = Date.parse(iso || '');
      if (!Number.isFinite(t)) return null;
      const d = new Date(t);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const recebidasPorDia = new Map();
    const concluidasPorDia = new Map();
    for (const item of todas) {
      const r = chaveDia(item.createdAt);
      if (r) recebidasPorDia.set(r, (recebidasPorDia.get(r) || 0) + 1);
      if (item.status === STATUS_FINAL) {
        const c = chaveDia(item.concluidoEm || item.updatedAt);
        if (c) concluidasPorDia.set(c, (concluidasPorDia.get(c) || 0) + 1);
      }
    }
    for (let i = diasSerie - 1; i >= 0; i--) {
      const d = new Date(agora - i * 86400000);
      const chave = chaveDia(d.toISOString());
      serie.push({ dia: chave, recebidas: recebidasPorDia.get(chave) || 0, concluidas: concluidasPorDia.get(chave) || 0 });
    }

    for (const s of secretarias) {
      s.taxaConclusao = s.total ? Math.round(((s.total - s.abertas) / s.total) * 100) : null;
    }

    return {
      dias,
      limiteAtrasoDias,
      serie,
      geradoEm: new Date(agora).toISOString(),
      totais: {
        historico: todas.length,
        noPeriodo: doPeriodo.length,
        abertas: abertas.length,
        recebidas: abertas.filter((i) => i.status === STATUS_INICIAL).length,
        emAndamento: abertas.filter((i) => i.status === 'Em andamento').length,
        concluidasNoPeriodo: concluidasNoPeriodo.length,
        concluidas: todas.filter((i) => i.status === STATUS_FINAL).length,
        taxaConclusao: doPeriodo.length ? Math.round((doPeriodo.filter((i) => i.status === STATUS_FINAL).length / doPeriodo.length) * 100) : null,
        horasMediasConclusao: horasMedias,
        atrasadas: atrasadas.length,
        criticas: criticas.length,
        notaMedia: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null,
        avaliacoes: notas.length
      },
      porCategoria: porCategoria.slice(0, 10),
      porBairro: porBairro.slice(0, 10),
      secretarias,
      hoje: dataCurta(new Date(agora).toISOString()),
      criterios: { atrasada: 'aberta há mais de ' + limiteAtrasoDias + ' dias', critica: 'atrasada e com prioridade Alta/Urgente, ou aberta há mais de ' + LIMITE_CRITICA_DIAS + ' dias' },
      atrasadas: atrasadas.slice(0, 40),
      criticas: criticas.slice(0, 40),
      recentes: doPeriodo.slice(0, 60).map((i) => ({ ...resumir(i), nota: i.avaliacao?.nota ?? null }))
    };
  }

  return {
    listar, criar, atualizar, remover, limpar, produtividade, visaoExecutiva,
    consultarAvaliacao, registrarAvaliacao, consultarProtocolo, recentes,
    CAMPOS_EDITAVEIS, STATUS_VALIDOS, VERSAO_CONSENTIMENTO
  };
}

module.exports = { criarIncidentes, STATUS_INICIAL, STATUS_FINAL, STATUS_VALIDOS, normalizarStatus };
