// Autenticacao no servidor.
//
// Antes disto o painel era so client-side: usuarios e senhas em texto plano no
// localStorage, e as rotas da API aceitavam qualquer requisicao. Estes testes
// sobem o servidor de verdade e verificam que o acesso administrativo agora
// depende de credencial valida.
//
// Rodar com: node testes/auth.test.js
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const DIR_DADOS = path.join(RAIZ, 'dados');
const PORTA = 3998;

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
  // Preserva os dados reais: o teste roda com um diretorio limpo.
  const backup = fs.existsSync(DIR_DADOS)
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'dados-'))
    : null;
  if (backup) {
    fs.cpSync(DIR_DADOS, backup, { recursive: true });
    fs.rmSync(DIR_DADOS, { recursive: true, force: true });
  }

  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, env: { ...process.env, PORT: String(PORTA), ADMIN_INITIAL_PASSWORD: 'admin123' }, stdio: ['ignore', 'pipe', 'pipe']
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
    } catch (e) { /* ambiente de teste */ }
  };

  let token = '';

  try {
    if (!await esperarServidor()) {
      console.log(' FALHA o servidor nao subiu');
      restaurar();
      process.exit(1);
    }

    console.log('\nSem credencial, as rotas administrativas sao recusadas');
    {
      const put = await pedir('PUT', '/api/config', { categories: ['invadido'] });
      ok(put.status === 401, 'PUT /api/config sem token responde 401');

      const usuarios = await pedir('GET', '/api/auth/usuarios');
      ok(usuarios.status === 401, 'GET /api/auth/usuarios sem token responde 401');

      const criar = await pedir('POST', '/api/auth/usuarios', { username: 'x', senha: 'segredo1' });
      ok(criar.status === 401, 'POST /api/auth/usuarios sem token responde 401');

      // O mais importante: a recusa nao pode ter alterado nada.
      const config = await pedir('GET', '/api/config');
      ok(!config.corpo.categories.includes('invadido'), 'a configuracao nao foi alterada');
    }

    console.log('\nLogin');
    {
      const errado = await pedir('POST', '/api/auth/login', { username: 'admin', password: 'errada' });
      ok(errado.status === 401, 'senha errada responde 401');
      ok(!errado.corpo.token, 'nao devolve token');

      const inexistente = await pedir('POST', '/api/auth/login', { username: 'ninguem', password: 'x' });
      ok(inexistente.corpo.error === errado.corpo.error, 'mensagem nao revela se o usuario existe');

      const certo = await pedir('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
      ok(certo.status === 200 && Boolean(certo.corpo.token), 'credencial correta devolve token');
      ok(certo.corpo.usuario.role === 'system_admin', 'devolve o papel do usuario');
      ok(certo.corpo.usuario.hash === undefined && certo.corpo.usuario.salt === undefined,
        'nao expoe hash nem salt');
      token = certo.corpo.token;
    }

    console.log('\nA senha nao fica guardada em texto plano');
    {
      const arquivo = fs.readFileSync(path.join(DIR_DADOS, 'usuarios.json'), 'utf8');
      ok(!arquivo.includes('admin123'), 'a senha nao aparece no arquivo de usuarios');
      const salvo = JSON.parse(arquivo)[0];
      ok(Boolean(salvo.hash) && Boolean(salvo.salt), 'guarda hash e salt');
      ok(salvo.password === undefined, 'nao existe campo password');
    }

    console.log('\nToken invalido ou adulterado nao passa');
    {
      const adulterado = token.slice(0, -3) + 'aaa';
      const r1 = await pedir('GET', '/api/auth/usuarios', null, adulterado);
      ok(r1.status === 401, 'assinatura adulterada responde 401');

      const inventado = Buffer.from(JSON.stringify({
        id: crypto.randomUUID(), username: 'admin', role: 'system_admin', exp: Date.now() + 60000
      })).toString('base64url') + '.assinaturaFalsa';
      const r2 = await pedir('PUT', '/api/config', { categories: ['x'] }, inventado);
      ok(r2.status === 401, 'token forjado sem a chave responde 401');

      const r3 = await pedir('GET', '/api/auth/usuarios', null, 'qualquer.coisa');
      ok(r3.status === 401, 'token sem sentido responde 401');
    }

    console.log('\nCom credencial valida, as rotas funcionam');
    {
      const put = await pedir('PUT', '/api/config', { categories: ['buracos', 'poda'] }, token);
      ok(put.status === 200, 'PUT /api/config autenticado responde 200');
      ok(put.corpo.categories.includes('poda'), 'a alteracao foi aplicada');

      const eu = await pedir('GET', '/api/auth/me', null, token);
      ok(eu.status === 200 && eu.corpo.usuario.username === 'admin', 'GET /api/auth/me devolve o perfil');
    }

    console.log('\nAdministrador de categoria nao altera a configuracao');
    {
      const criado = await pedir('POST', '/api/auth/usuarios', {
        username: 'operador', senha: 'segredo123', role: 'category_admin', allowedCategories: ['buracos']
      }, token);
      ok(criado.status === 201, 'admin do sistema cria usuario de categoria');

      const login = await pedir('POST', '/api/auth/login', { username: 'operador', password: 'segredo123' });
      ok(login.status === 200, 'o novo usuario consegue entrar');
      const tokenOperador = login.corpo.token;

      const put = await pedir('PUT', '/api/config', { categories: ['tudo meu'] }, tokenOperador);
      ok(put.status === 403, 'PUT /api/config com papel de categoria responde 403');

      const listar = await pedir('GET', '/api/auth/usuarios', null, tokenOperador);
      ok(listar.status === 403, 'nao pode listar usuarios');

      const config = await pedir('GET', '/api/config');
      ok(!config.corpo.categories.includes('tudo meu'), 'a configuracao seguiu intacta');
    }

    console.log('\nEdicao de usuario');
    {
      const lista = (await pedir('GET', '/api/auth/usuarios', null, token)).corpo.usuarios;
      const operador = lista.find((u) => u.username === 'operador');
      const admin = lista.find((u) => u.username === 'admin');

      const semToken = await pedir('PUT', '/api/auth/usuarios/' + operador.id, { username: 'x' });
      ok(semToken.status === 401, 'PUT /api/auth/usuarios sem token responde 401');

      const inexistente = await pedir('PUT', '/api/auth/usuarios/nao-existe', { username: 'x' }, token);
      ok(inexistente.status === 404, 'id inexistente responde 404');

      const repetido = await pedir('PUT', '/api/auth/usuarios/' + operador.id, { username: 'Admin' }, token);
      ok(repetido.status === 409, 'renomear para um nome ja usado e recusado');

      const curta = await pedir('PUT', '/api/auth/usuarios/' + operador.id, { senha: '123' }, token);
      ok(curta.status === 400, 'senha nova curta e recusada');

      const proprio = await pedir('PUT', '/api/auth/usuarios/' + admin.id, { role: 'category_admin' }, token);
      ok(proprio.status === 400, 'nao permite rebaixar o proprio perfil');

      const editado = await pedir('PUT', '/api/auth/usuarios/' + operador.id, {
        username: 'operadora', role: 'category_admin', allowedCategories: ['poda']
      }, token);
      ok(editado.status === 200, 'edita nome e categorias');
      ok(editado.corpo.usuario.username === 'operadora' && editado.corpo.usuario.allowedCategories[0] === 'poda', 'a resposta traz os dados novos');
      ok(editado.corpo.usuario.hash === undefined && editado.corpo.usuario.salt === undefined, 'a resposta nao expoe o hash');

      const depois = (await pedir('GET', '/api/auth/usuarios', null, token)).corpo.usuarios;
      ok(depois.some((u) => u.username === 'operadora') && !depois.some((u) => u.username === 'operador'), 'a lista reflete a edicao');

      const senhaMantida = await pedir('POST', '/api/auth/login', { username: 'operadora', password: 'segredo123' });
      ok(senhaMantida.status === 200, 'sem senha no corpo a senha atual e mantida');

      const trocaSenha = await pedir('PUT', '/api/auth/usuarios/' + operador.id, { senha: 'outraSenha9' }, token);
      ok(trocaSenha.status === 200, 'admin redefine a senha de outro usuario');
      const loginNovo = await pedir('POST', '/api/auth/login', { username: 'operadora', password: 'outraSenha9' });
      ok(loginNovo.status === 200, 'a senha redefinida vale');

      const promovido = await pedir('PUT', '/api/auth/usuarios/' + operador.id, { role: 'system_admin' }, token);
      ok(promovido.status === 200 && promovido.corpo.usuario.allowedCategories.length === 0, 'promover a admin do sistema limpa as categorias');

      const volta = await pedir('PUT', '/api/auth/usuarios/' + operador.id, {
        username: 'operador', role: 'category_admin', allowedCategories: ['buracos']
      }, token);
      ok(volta.status === 200, 'volta ao perfil de categoria');
    }

    console.log('\nRegras de cadastro e remocao');
    {
      const curta = await pedir('POST', '/api/auth/usuarios', { username: 'fraco', senha: '123' }, token);
      ok(curta.status === 400, 'senha curta e recusada');

      const repetido = await pedir('POST', '/api/auth/usuarios', { username: 'operador', senha: 'segredo123' }, token);
      ok(repetido.status === 409, 'nome de usuario repetido e recusado');

      const usuarios = (await pedir('GET', '/api/auth/usuarios', null, token)).corpo.usuarios;
      const admin = usuarios.find((u) => u.username === 'admin');
      const proprio = await pedir('DELETE', '/api/auth/usuarios/' + admin.id, null, token);
      ok(proprio.status === 400, 'nao permite remover o proprio usuario');

      const operador = usuarios.find((u) => u.username === 'operador');
      const remocao = await pedir('DELETE', '/api/auth/usuarios/' + operador.id, null, token);
      ok(remocao.status === 200, 'remove outro usuario');

      const depois = (await pedir('GET', '/api/auth/usuarios', null, token)).corpo.usuarios;
      ok(!depois.some((u) => u.username === 'operador'), 'o usuario removido sumiu');
    }

    console.log('\nTroca de senha');
    {
      const errada = await pedir('POST', '/api/auth/senha', { senhaAtual: 'errada', senhaNova: 'novaSenha1' }, token);
      ok(errada.status === 401, 'senha atual incorreta e recusada');

      const curta = await pedir('POST', '/api/auth/senha', { senhaAtual: 'admin123', senhaNova: '123' }, token);
      ok(curta.status === 400, 'nova senha curta e recusada');

      const trocada = await pedir('POST', '/api/auth/senha', { senhaAtual: 'admin123', senhaNova: 'novaSenha1' }, token);
      ok(trocada.status === 200, 'troca de senha valida funciona');

      const antiga = await pedir('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
      ok(antiga.status === 401, 'a senha antiga deixa de valer');

      const nova = await pedir('POST', '/api/auth/login', { username: 'admin', password: 'novaSenha1' });
      ok(nova.status === 200, 'a senha nova vale');
    }

    console.log('\nO formulario publico continua aberto');
    {
      const config = await pedir('GET', '/api/config');
      ok(config.status === 200, 'GET /api/config nao exige login');
    }
  } finally {
    restaurar();
  }

  console.log(falhas === 0 ? '\nTodos os testes passaram.\n' : '\n' + falhas + ' teste(s) falharam.\n');
  process.exit(falhas === 0 ? 0 : 1);
})();
