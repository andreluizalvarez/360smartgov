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
    env: { ...process.env, PORT: String(PORTA), ADMIN_INITIAL_PASSWORD: 'admin123' },
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
      const vazia = await pedir('POST', '/api/incidentes', { name: 'x' });
      ok(vazia.status === 400, 'ocorrencia sem resumo nem descricao e recusada');

      const r1 = await pedir('POST', '/api/incidentes', {
        name: 'Maria', email: 'maria@email.com', title: 'Buraco na via', category: 'Buraco',
        priority: 'Urgente', description: 'Buraco grande', latitude: '-23.5', longitude: '-46.6',
        photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQ', status: 'Concluída', id: 'forjado'
      });
      ok(r1.status === 201, 'POST /api/incidentes grava sem token');
      buraco = r1.corpo.incidente;
      ok(buraco.id !== 'forjado' && buraco.status === 'Em análise', 'id e status iniciais sao definidos pelo servidor');
      ok(buraco.photoDataUrl.startsWith('data:image/jpeg'), 'a foto e guardada');

      const r2 = await pedir('POST', '/api/incidentes', {
        title: 'Poste apagado', category: 'Iluminação pública', priority: 'Alta', description: 'Sem luz'
      });
      poste = r2.corpo.incidente;
      ok(r2.status === 201 && poste.id, 'segunda ocorrencia gravada');

      const fotoInvalida = await pedir('POST', '/api/incidentes', { title: 'x', photoDataUrl: 'http://evil/x.jpg' });
      ok(fotoInvalida.status === 400, 'foto que nao e data URL de imagem e recusada');

      const fotoGrande = await pedir('POST', '/api/incidentes', {
        title: 'x', photoDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(2 * 1024 * 1024 + 10)
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

      const outra = await pedir('PUT', '/api/incidentes/' + poste.id, { status: 'Concluída' }, tokenOperador);
      ok(outra.status === 403, 'alterar ocorrencia de outra categoria responde 403');

      const mover = await pedir('PUT', '/api/incidentes/' + buraco.id, { category: 'Iluminação pública' }, tokenOperador);
      ok(mover.status === 403, 'nao pode mover a ocorrencia para categoria que nao enxerga');

      const propria = await pedir('PUT', '/api/incidentes/' + buraco.id, {
        status: 'Em andamento',
        history: [{ id: 'h1', type: 'status', text: 'Status alterado', by: 'operador', at: new Date().toISOString() }]
      }, tokenOperador);
      ok(propria.status === 200 && propria.corpo.incidente.status === 'Em andamento', 'altera o status da propria categoria');
      ok(propria.corpo.incidente.history.length === 1, 'o historico enviado e guardado');

      const removerOutra = await pedir('DELETE', '/api/incidentes/' + poste.id, null, tokenOperador);
      ok(removerOutra.status === 403, 'nao remove ocorrencia de outra categoria');

      const limparTudo = await pedir('DELETE', '/api/incidentes', null, tokenOperador);
      ok(limparTudo.status === 403, 'so admin do sistema limpa tudo');

      const depois = await pedir('GET', '/api/incidentes', null, token);
      ok(depois.corpo.incidentes.length === 2, 'nada foi apagado pelo admin de categoria');
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
