// Regressao: adicionar ou remover categorias no painel precisa refletir
// imediatamente na lista enviada a IA — inclusive para o cidadao, que usa
// outro navegador e nunca viu o localStorage do administrador.
//
// Sobe o servidor de verdade e exercita GET/PUT /api/config. A escrita exige
// administrador do sistema, entao o teste autentica antes.
//
// Rodar com: node testes/config.test.js
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIR_DADOS = path.join(RAIZ, 'dados');
const ARQUIVO_CONFIG = path.join(DIR_DADOS, 'configuracao.json');
const PORTA = 3999;

let falhas = 0;
function ok(condicao, mensagem) {
  console.log((condicao ? '  ok  ' : ' FALHA') + ' ' + mensagem);
  if (!condicao) falhas += 1;
}

// Token do administrador; acompanha as requisicoes depois do login.
let token = '';

function pedir(metodo, caminho, corpo) {
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
        let texto = '';
        res.on('data', (c) => (texto += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, corpo: JSON.parse(texto) }); }
          catch (e) { resolve({ status: res.statusCode, corpo: texto }); }
        });
      }
    );
    req.on('error', reject);
    if (dados) req.write(dados);
    req.end();
  });
}

async function esperarServidor() {
  for (let i = 0; i < 60; i += 1) {
    try { await pedir('GET', '/api/config'); return true; }
    catch (e) { await new Promise((r) => setTimeout(r, 300)); }
  }
  return false;
}

(async () => {
  // Roda com um diretorio de dados limpo e devolve o original ao final.
  const backupDir = fs.existsSync(DIR_DADOS)
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'dados-'))
    : null;
  if (backupDir) {
    fs.cpSync(DIR_DADOS, backupDir, { recursive: true });
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
      if (backupDir) {
        fs.cpSync(backupDir, DIR_DADOS, { recursive: true });
        fs.rmSync(backupDir, { recursive: true, force: true });
      }
    } catch (e) { /* ambiente de teste */ }
  };

  try {
    if (!await esperarServidor()) {
      console.log(' FALHA o servidor nao subiu');
      restaurar();
      process.exit(1);
    }

    const login = await pedir('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    if (login.status !== 200) {
      console.log(' FALHA nao foi possivel autenticar para os testes');
      restaurar();
      process.exit(1);
    }
    token = login.corpo.token;

    console.log('\nSem configuracao salva, vale a lista padrao');
    {
      const { status, corpo } = await pedir('GET', '/api/config');
      ok(status === 200, 'GET /api/config responde 200');
      ok(Array.isArray(corpo.categories) && corpo.categories.length > 5, 'devolve a lista padrao');
      ok(corpo.categories.includes('outros'), 'inclui o destino generico');
    }

    console.log('\nAdicionar uma categoria reflete na lista em vigor');
    {
      const nova = ['buracos', 'iluminação pública', 'ruído excessivo'];
      const put = await pedir('PUT', '/api/config', { categories: nova });
      ok(put.status === 200, 'PUT /api/config responde 200');
      ok(put.corpo.categories.includes('ruído excessivo'), 'a categoria nova aparece');

      // Um navegador que nunca viu essa lista consulta o servidor.
      const { corpo } = await pedir('GET', '/api/config');
      ok(corpo.categories.includes('ruído excessivo'), 'outro navegador ja recebe a categoria nova');
    }

    console.log('\nRemover uma categoria some da lista em vigor');
    {
      await pedir('PUT', '/api/config', { categories: ['buracos', 'iluminação pública'] });
      const { corpo } = await pedir('GET', '/api/config');
      ok(!corpo.categories.includes('ruído excessivo'), 'a categoria removida sumiu');
      ok(corpo.categories.includes('buracos'), 'as demais continuam');
    }

    console.log('\nA configuracao sobrevive ao reinicio do servidor');
    {
      ok(fs.existsSync(ARQUIVO_CONFIG), 'gravou em dados/configuracao.json');
      const salvo = JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, 'utf8'));
      ok(salvo.categories.includes('buracos'), 'o arquivo tem a lista atual');
      ok(Boolean(salvo.atualizadoEm), 'registra quando foi alterada');
    }

    console.log('\nListas invalidas sao recusadas');
    {
      const vazia = await pedir('PUT', '/api/config', { categories: [] });
      ok(vazia.status === 400, 'lista vazia devolve 400');
      const texto = await pedir('PUT', '/api/config', { categories: 'buracos' });
      ok(texto.status === 400, 'valor que nao e lista devolve 400');

      // A recusa nao pode ter destruido a configuracao boa.
      const { corpo } = await pedir('GET', '/api/config');
      ok(corpo.categories.includes('buracos'), 'a configuracao anterior continua intacta');
    }

    console.log('\nAs prioridades seguem a mesma regra');
    {
      const put = await pedir('PUT', '/api/config', { priorities: ['Baixa', 'Alta'] });
      ok(put.status === 200 && put.corpo.priorities.length === 2, 'prioridades sao salvas');
      const { corpo } = await pedir('GET', '/api/config');
      ok(corpo.priorities.length === 2, 'e devolvidas na consulta');
      ok(corpo.categories.includes('buracos'), 'salvar prioridades nao apaga as categorias');
    }
  } finally {
    restaurar();
  }

  console.log(falhas === 0 ? '\nTodos os testes passaram.\n' : '\n' + falhas + ' teste(s) falharam.\n');
  process.exit(falhas === 0 ? 0 : 1);
})();
