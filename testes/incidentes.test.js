// Ocorrencias gravadas no servidor.
//
// Antes disto cada ocorrencia vivia so no localStorage do navegador de quem a
// abriu, e um admin restrito a uma categoria chegou a apagar as demais ao
// abrir o painel (a lista filtrada era gravada por cima da base). Com a base
// no servidor esse bug deixa de existir por construcao: o cliente nunca grava
// a lista inteira, so envia alteracoes de uma ocorrencia por vez, e o servidor
// confere a permissao por categoria em cada uma.
//
// Rodar com: node testes/incidentes.test.js
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIR_DADOS = path.join(RAIZ, 'dados');
const PORTA = 3996;

let falhas = 0;
function ok(condicao, mensagem) {
  console.log((condicao ? '  ok  ' : ' FALHA') + ' ' + mensagem);
  if (!condicao) falhas += 1;
}

function pedir(metodo, caminho, corpo, token) {
  return new Promise((resolve, reject) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const headers = {};
    if (dados) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(dados);
    }
    if (token) headers.Authorization = 'Bearer ' + token;

    const req = http.request(
      { host: '127.0.0.1', port: PORTA, path: caminho, method: metodo, headers },
      (res) => {
        let bruto = '';
        res.on('data', (parte) => { bruto += parte; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(bruto); } catch (error) { json = null; }
          resolve({ status: res.statusCode, corpo: json });
        });
      }
    );
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

// Como pedir(), mas devolve o corpo bruto (para arquivos binarios).
function pedirBruto(metodo, caminho, token) {
  return new Promise((resolve, reject) => {
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: metodo, headers }, (res) => {
      const partes = [];
      res.on('data', (parte) => partes.push(parte));
      res.on('end', () => resolve({ status: res.statusCode, tipo: res.headers['content-type'] || '', disposicao: res.headers['content-disposition'] || '', corpo: Buffer.concat(partes) }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await pedir('GET', '/api/config');
      if (r.status === 200) return;
    } catch (error) { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('servidor nao respondeu');
}

(async () => {
  // Preserva os dados reais: o teste roda com um diretorio limpo.
  const backup = fs.existsSync(DIR_DADOS)
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'dados-'))
    : null;
  if (backup) {
    fs.cpSync(DIR_DADOS, backup, { recursive: true });
    fs.rmSync(DIR_DADOS, { recursive: true, force: true });
  }

  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(PORTA), ADMIN_INITIAL_PASSWORD: 'admin123', OPENAI_API_KEY: '', EMAIL_PROVIDER: 'nenhum' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  servidor.stderr.on('data', (d) => console.log('[servidor]', d.toString().trim().slice(0, 200)));

  const restaurar = () => {
    servidor.kill();
    try {
      fs.rmSync(DIR_DADOS, { recursive: true, force: true });
      if (backup) {
        fs.cpSync(backup, DIR_DADOS, { recursive: true });
        fs.rmSync(backup, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('falha ao restaurar os dados:', error);
    }
  };

  try {
    await esperarServidor();

    const login = await pedir('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    const token = login.corpo.token;

    console.log('\nAbertura pelo cidadao, sem login');
    let buraco;
    let poste;
    {
      const vazia = await pedir('POST', '/api/incidentes', { name: 'x', consentimento: { aceito: true } });
      ok(vazia.status === 400, 'ocorrencia sem resumo nem descricao e recusada');

      const semConsentimento = await pedir('POST', '/api/incidentes', { title: 'Sem aceite', category: 'Buraco' });
      ok(semConsentimento.status === 400 && /LGPD/.test(semConsentimento.corpo.error), 'sem o aceite do termo (LGPD) a ocorrencia e recusada');

      const r1 = await pedir('POST', '/api/incidentes', {
        name: 'Maria', email: 'maria@email.com', title: 'Buraco na via', category: 'Buraco',
        priority: 'Urgente', description: 'Buraco grande', latitude: '-23.5', longitude: '-46.6',
        photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQ', status: 'Concluída', id: 'forjado',
        consentimento: { aceito: true, versao: '2026-10' }
      });
      ok(r1.corpo.incidente.consentimento?.aceito === true && r1.corpo.incidente.consentimento.em, 'o consentimento fica registrado com data');
      ok(r1.status === 201, 'POST /api/incidentes grava sem token');
      buraco = r1.corpo.incidente;
      ok(buraco.id !== 'forjado' && buraco.status === 'Recebido', 'id e status iniciais sao definidos pelo servidor');
      ok(buraco.photoDataUrl.startsWith('data:image/jpeg'), 'a foto e guardada');
      ok(buraco.protocolo === 1001, 'a primeira ocorrencia recebe o protocolo 1001');

      const r2 = await pedir('POST', '/api/incidentes', {
        title: 'Poste apagado', category: 'Iluminação pública', priority: 'Alta', description: 'Sem luz', consentimento: { aceito: true }
      });
      poste = r2.corpo.incidente;
      ok(r2.status === 201 && poste.id, 'segunda ocorrencia gravada');
      ok(poste.protocolo === 1002, 'o protocolo e sequencial');

      console.log('\nAcompanhamento publico por protocolo');
      {
        const nada = await pedir('GET', '/api/protocolo/999999');
        ok(nada.status === 404, 'protocolo inexistente responde 404');
        const invalido = await pedir('GET', '/api/protocolo/abc');
        ok(invalido.status === 400, 'protocolo sem numero responde 400');
        const consulta = await pedir('GET', '/api/protocolo/1001');
        ok(consulta.status === 200 && consulta.corpo.ocorrencia.title === 'Buraco na via' && consulta.corpo.ocorrencia.status === 'Recebido', 'consulta publica devolve titulo e status');
        const o = consulta.corpo.ocorrencia;
        ok(o.name === undefined && o.email === undefined && o.phone === undefined && o.photoDataUrl === undefined && o.avaliacaoToken === undefined, 'sem dados pessoais, foto ou token de avaliacao');
        const recentes = await pedir('GET', '/api/incidentes/recentes');
        ok(recentes.status === 200 && recentes.corpo.incidentes.length === 2 && recentes.corpo.incidentes[0].protocolo === 1002, 'recentes lista as ultimas, mais nova primeiro');
        ok(recentes.corpo.incidentes[0].photoDataUrl === undefined && recentes.corpo.incidentes[0].name === undefined, 'recentes sem foto nem dados pessoais');
      }

      const fotoInvalida = await pedir('POST', '/api/incidentes', { title: 'x', photoDataUrl: 'http://evil/x.jpg', consentimento: { aceito: true } });
      ok(fotoInvalida.status === 400, 'foto que nao e data URL de imagem e recusada');

      const fotoGrande = await pedir('POST', '/api/incidentes', {
        title: 'x', photoDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(2 * 1024 * 1024 + 10), consentimento: { aceito: true }
      });
      ok(fotoGrande.status === 413, 'foto acima do limite responde 413');

      const arquivo = JSON.parse(fs.readFileSync(path.join(DIR_DADOS, 'incidentes.json'), 'utf8'));
      ok(arquivo.length === 2 && arquivo[0].id === poste.id, 'dados/incidentes.json guarda as ocorrencias, mais recente primeiro');
    }

    console.log('\nLeitura exige sessao');
    {
      const semToken = await pedir('GET', '/api/incidentes');
      ok(semToken.status === 401, 'GET /api/incidentes sem token responde 401');

      const lista = await pedir('GET', '/api/incidentes', null, token);
      ok(lista.status === 200 && lista.corpo.incidentes.length === 2, 'admin do sistema ve as 2 ocorrencias');
    }

    console.log('\nAdmin de categoria so enxerga e altera a sua categoria');
    let tokenOperador;
    {
      const criado = await pedir('POST', '/api/auth/usuarios', {
        username: 'operador', senha: 'segredo123', role: 'category_admin', allowedCategories: ['buraco']
      }, token);
      ok(criado.status === 201, 'usuario de categoria criado');
      const loginOp = await pedir('POST', '/api/auth/login', { username: 'operador', password: 'segredo123' });
      tokenOperador = loginOp.corpo.token;

      const lista = await pedir('GET', '/api/incidentes', null, tokenOperador);
      ok(lista.corpo.incidentes.length === 1 && lista.corpo.incidentes[0].id === buraco.id, 'lista filtrada pela categoria (sem diferenciar acento e caixa)');

      const outra = await pedir('PUT', '/api/incidentes/' + poste.id, { status: 'Concluído' }, tokenOperador);
      ok(outra.status === 403, 'alterar ocorrencia de outra categoria responde 403');

      const mover = await pedir('PUT', '/api/incidentes/' + buraco.id, { category: 'Iluminação pública' }, tokenOperador);
      ok(mover.status === 403, 'nao pode mover a ocorrencia para categoria que nao enxerga');

      const propria = await pedir('PUT', '/api/incidentes/' + buraco.id, {
        status: 'Em andamento',
        history: [{ id: 'h1', type: 'status', text: 'Status alterado de Recebido para Em andamento', by: 'operador', at: new Date().toISOString() }]
      }, tokenOperador);
      ok(propria.status === 200 && propria.corpo.incidente.status === 'Em andamento', 'altera o status da propria categoria');
      ok(propria.corpo.incidente.history.length === 1, 'o historico enviado e guardado');
      const etapas = (await pedir('GET', '/api/protocolo/1001')).corpo.ocorrencia.etapas;
      ok(etapas.length === 1 && etapas[0].status === 'Em andamento' && etapas[0].at, 'o acompanhamento publico mostra a etapa com data');

      const removerOutra = await pedir('DELETE', '/api/incidentes/' + poste.id, null, tokenOperador);
      ok(removerOutra.status === 403, 'nao remove ocorrencia de outra categoria');

      const limparTudo = await pedir('DELETE', '/api/incidentes', null, tokenOperador);
      ok(limparTudo.status === 403, 'so admin do sistema limpa tudo');

      const depois = await pedir('GET', '/api/incidentes', null, token);
      ok(depois.corpo.incidentes.length === 2, 'nada foi apagado pelo admin de categoria');
    }

    console.log('\nProdutividade por administrador de categoria');
    {
      const semToken = await pedir('GET', '/api/incidentes/produtividade');
      ok(semToken.status === 401, 'produtividade sem token responde 401');
      const comoOperador = await pedir('GET', '/api/incidentes/produtividade', null, tokenOperador);
      ok(comoOperador.status === 200 && comoOperador.corpo.usuarios.every((u) => u.username === 'operador'), 'admin de categoria acessa a produtividade, mas so a propria');

      const agora = new Date().toISOString();
      const resolver = await pedir('PUT', '/api/incidentes/' + buraco.id, {
        status: 'Concluído',
        respostaConclusao: 'O reparo do pavimento foi realizado.',
        history: [
          { id: 'h1', type: 'status', text: 'Status alterado de Recebido para Em andamento', by: 'operador', at: agora },
          { id: 'h2', type: 'work', text: 'Equipe no local', by: 'operador', at: agora },
          { id: 'h3', type: 'status', text: 'Status alterado de Em andamento para Concluído', by: 'operador', at: agora }
        ]
      }, tokenOperador);
      ok(resolver.status === 200, 'operador conclui a ocorrencia com historico');
      ok(resolver.corpo.incidente.respostaConclusao === 'O reparo do pavimento foi realizado.' && resolver.corpo.incidente.concluidoEm, 'a conclusao guarda a resposta ao cidadao e a data');
      const tokenAvaliacao = resolver.corpo.incidente.avaliacaoToken;
      ok(typeof tokenAvaliacao === 'string' && tokenAvaliacao.length > 10, 'a conclusao gera o token da pesquisa de satisfacao');

      console.log('\nPesquisa de satisfacao (publica)');
      {
        const invalida = await pedir('GET', '/api/avaliacao/nao-existe');
        ok(invalida.status === 404, 'token invalido responde 404');
        const consulta = await pedir('GET', '/api/avaliacao/' + tokenAvaliacao);
        ok(consulta.status === 200 && consulta.corpo.ocorrencia.title === 'Buraco na via' && consulta.corpo.ocorrencia.avaliada === false, 'o link mostra so titulo, categoria, status e resposta');
        ok(consulta.corpo.ocorrencia.email === undefined && consulta.corpo.ocorrencia.photoDataUrl === undefined, 'nao expoe dados pessoais nem a foto');
        const notaRuim = await pedir('POST', '/api/avaliacao/' + tokenAvaliacao, { nota: 9 });
        ok(notaRuim.status === 400, 'nota fora de 1..5 e recusada');
        const avaliada = await pedir('POST', '/api/avaliacao/' + tokenAvaliacao, { nota: 4, comentario: 'Demorou um pouco, mas resolveu.' });
        ok(avaliada.status === 201 && avaliada.corpo.avaliacao.nota === 4, 'avaliacao gravada');
        const repetida = await pedir('POST', '/api/avaliacao/' + tokenAvaliacao, { nota: 1 });
        ok(repetida.status === 409, 'segunda avaliacao e recusada');
        const noPainel = (await pedir('GET', '/api/incidentes', null, token)).corpo.incidentes.find((i) => i.id === buraco.id);
        ok(noPainel.avaliacao?.nota === 4 && noPainel.avaliacao.comentario.includes('resolveu'), 'o painel enxerga a avaliacao');
      }

      const invalido = await pedir('PUT', '/api/incidentes/' + buraco.id, { status: 'Qualquer coisa' }, token);
      ok(invalido.status === 400, 'status fora da lista e recusado');

      const antigoNome = await pedir('PUT', '/api/incidentes/' + buraco.id, { status: 'Resolvido' }, token);
      ok(antigoNome.status === 200 && antigoNome.corpo.incidente.status === 'Concluído', 'nome antigo "Resolvido" vira "Concluído"');
      const antigoInicial = await pedir('PUT', '/api/incidentes/' + buraco.id, { status: 'Em análise' }, token);
      ok(antigoInicial.corpo.incidente.status === 'Recebido', 'nome antigo "Em análise" vira "Recebido"');
      await pedir('PUT', '/api/incidentes/' + buraco.id, { status: 'Concluído' }, token);

      const prod = await pedir('GET', '/api/incidentes/produtividade?dias=30', null, token);
      ok(prod.status === 200, 'admin do sistema consulta a produtividade');
      const linha = prod.corpo.usuarios.find((u) => u.username === 'operador');
      ok(Boolean(linha), 'o operador aparece na lista');
      ok(linha.resolvidas === 1 && linha.mudancasStatus === 2 && linha.atualizacoes === 1 && linha.acoes === 3, 'conta resolvidas, mudancas de status e atualizacoes');
      ok(linha.ocorrenciasTocadas === 1 && linha.naCategoria === 1 && linha.abertasNaCategoria === 0, 'conta ocorrencias tocadas e abertas na categoria');
      ok(typeof linha.horasMediasResolucao === 'number' && linha.horasMediasResolucao >= 0, 'calcula o tempo medio de resolucao');
      ok(linha.avaliacoes === 1 && linha.notaMedia === 4 && prod.corpo.resumo.notaMedia === 4, 'a nota do cidadao entra na produtividade');

      const propria = await pedir('GET', '/api/incidentes/produtividade?dias=30', null, tokenOperador);
      ok(propria.status === 200 && propria.corpo.usuarios.length === 1 && propria.corpo.usuarios[0].username === 'operador', 'admin de categoria ve so a propria secretaria');
      const umSo = await pedir('GET', '/api/incidentes/produtividade?dias=30&usuario=' + linha.id, null, token);
      ok(umSo.corpo.usuarios.length === 1 && umSo.corpo.resumo.usuarios === 1, 'admin do sistema filtra a produtividade por usuario');
      const pdfIndividual = await pedirBruto('GET', '/api/incidentes/produtividade/pdf?dias=30&usuario=' + linha.id, token);
      ok(pdfIndividual.status === 200 && /produtividade-operador-30dias/.test(pdfIndividual.disposicao), 'PDF individual por secretaria');
      const pdfOperador = await pedirBruto('GET', '/api/incidentes/produtividade/pdf?dias=30', tokenOperador);
      ok(pdfOperador.status === 200 && /produtividade-operador-/.test(pdfOperador.disposicao), 'admin de categoria exporta o proprio PDF');

      console.log('\nVisao executiva');
      {
        const semToken = await pedir('GET', '/api/incidentes/executivo');
        ok(semToken.status === 401, 'visao executiva sem token responde 401');
        const operadorVe = await pedir('GET', '/api/incidentes/executivo', null, tokenOperador);
        ok(operadorVe.status === 403, 'admin de categoria nao acessa a visao executiva');
        const exec = await pedir('GET', '/api/incidentes/executivo?dias=30', null, token);
        ok(exec.status === 200 && exec.corpo.totais.historico === 2 && exec.corpo.totais.abertas === 1, 'totais da cidade');
        ok(exec.corpo.porCategoria.length === 2 && exec.corpo.porCategoria[0].total === 1, 'ocorrencias por categoria');
        ok(exec.corpo.secretarias.some((s) => s.username === 'operador' && s.concluidasNoPeriodo === 1), 'secretarias com concluidas no periodo');
        ok(exec.corpo.totais.notaMedia === 4 && exec.corpo.totais.avaliacoes === 1, 'nota media da cidade');
        ok(Array.isArray(exec.corpo.serie) && exec.corpo.serie.length === 30 && exec.corpo.serie[29].recebidas === 2, 'serie diaria com as recebidas de hoje');
        ok(exec.corpo.totais.concluidas === 1 && typeof exec.corpo.secretarias[0].taxaConclusao === 'number', 'concluidas totais e taxa por secretaria');
        const resumo = await pedir('POST', '/api/incidentes/executivo/resumo', { dias: 30 }, token);
        ok(resumo.status === 503 && /OPENAI/.test(resumo.corpo.error), 'sem chave da IA o resumo explica a indisponibilidade');
      }
      ok(prod.corpo.resumo.resolvidas === 1 && prod.corpo.resumo.ativos === 1, 'resumo agrega os usuarios');
      ok(!prod.corpo.usuarios.some((u) => u.username === 'admin'), 'o admin do sistema nao entra na medicao');

      const pdfSemToken = await pedir('GET', '/api/incidentes/produtividade/pdf');
      ok(pdfSemToken.status === 401, 'PDF sem token responde 401');
      const pdfUsuarioInexistente = await pedir('GET', '/api/incidentes/produtividade/pdf?usuario=nao-existe', null, token);
      ok(pdfUsuarioInexistente.status === 404, 'PDF de usuario inexistente responde 404');
      const pdf = await pedirBruto('GET', '/api/incidentes/produtividade/pdf?dias=30', token);
      ok(pdf.status === 200 && /application\/pdf/.test(pdf.tipo) && pdf.corpo.slice(0, 4).toString() === '%PDF', 'PDF do relatorio e gerado');
      ok(/produtividade-30dias-/.test(pdf.disposicao), 'nome do arquivo traz o periodo');
      ok(pdf.corpo.length > 2000, 'o PDF tem conteudo');

      const antigo = await pedir('GET', '/api/incidentes/produtividade?dias=0', null, token);
      ok(antigo.corpo.usuarios.find((u) => u.username === 'operador').resolvidas === 1, 'dias=0 considera todo o historico');

      // devolve a ocorrencia ao estado anterior para os testes seguintes
      await pedir('PUT', '/api/incidentes/' + buraco.id, { status: 'Em andamento' }, token);
    }

    console.log('\nAlteracoes so tocam os campos permitidos');
    {
      const r = await pedir('PUT', '/api/incidentes/' + poste.id, {
        latitude: '-23.4', longitude: '-46.7', name: 'Hacker', createdAt: '1999-01-01', photoDataUrl: 'data:image/png;base64,xx'
      }, token);
      ok(r.status === 200 && r.corpo.incidente.latitude === '-23.4', 'coordenadas geocodificadas sao gravadas');
      ok(r.corpo.incidente.name === '' && r.corpo.incidente.createdAt === poste.createdAt && r.corpo.incidente.photoDataUrl === '', 'nome, data de abertura e foto nao mudam pela edicao');

      const inexistente = await pedir('PUT', '/api/incidentes/nao-existe', { status: 'x' }, token);
      ok(inexistente.status === 404, 'id inexistente responde 404');

      const trabalho = await pedir('PUT', '/api/incidentes/' + poste.id, {
        workUpdate: 'Equipe enviada', workUpdatedBy: 'admin', workUpdatedAt: new Date().toISOString()
      }, token);
      ok(trabalho.status === 200 && trabalho.corpo.incidente.workUpdate === 'Equipe enviada', 'atualizacao de trabalho gravada');
    }

    console.log('\nRemocao e limpeza');
    {
      const remover = await pedir('DELETE', '/api/incidentes/' + poste.id, null, token);
      ok(remover.status === 200, 'admin do sistema remove uma ocorrencia');
      const lista = await pedir('GET', '/api/incidentes', null, token);
      ok(lista.corpo.incidentes.length === 1, 'sobrou 1');

      const limpar = await pedir('DELETE', '/api/incidentes', null, token);
      ok(limpar.status === 200 && limpar.corpo.removidas === 1, 'limpar tudo remove o restante');
      const vazia = await pedir('GET', '/api/incidentes', null, token);
      ok(vazia.corpo.incidentes.length === 0, 'lista vazia depois da limpeza');
    }
  } finally {
    restaurar();
  }

  console.log(falhas === 0 ? '\nTodos os testes passaram.\n' : '\n' + falhas + ' teste(s) falharam.\n');
  process.exit(falhas === 0 ? 0 : 1);
})();
