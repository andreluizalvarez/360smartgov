// Autenticacao no servidor para o painel administrativo.
//
// Ate aqui o login era so client-side: usuarios e senhas em texto plano no
// localStorage, e qualquer requisicao direta a API passava sem credencial.
// Este modulo move a verdade para o servidor — senhas com hash scrypt, sessao
// por token assinado e verificacao de papel em cada rota protegida.
//
// Sem dependencias externas: tudo com o modulo `crypto` nativo.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PAPEL_ADMIN_SISTEMA = 'system_admin';
const PAPEL_ADMIN_CATEGORIA = 'category_admin';

const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;   // 8 horas
const MAX_TENTATIVAS = 8;                        // por usuario, antes do bloqueio
const JANELA_BLOQUEIO_MS = 15 * 60 * 1000;       // 15 minutos

function criarAuth({ diretorioDados }) {
  const ARQUIVO_USUARIOS = path.join(diretorioDados, 'usuarios.json');
  const ARQUIVO_SEGREDO = path.join(diretorioDados, 'segredo.json');

  // ---------------------------------------------------------------- segredo

  // Assina os tokens. Vem do ambiente quando definido; senao e gerado uma vez
  // e guardado, para que as sessoes sobrevivam ao reinicio do processo.
  function obterSegredo() {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;

    try {
      return JSON.parse(fs.readFileSync(ARQUIVO_SEGREDO, 'utf8')).segredo;
    } catch (error) {
      const segredo = crypto.randomBytes(48).toString('hex');
      fs.mkdirSync(diretorioDados, { recursive: true });
      fs.writeFileSync(ARQUIVO_SEGREDO, JSON.stringify({ segredo }, null, 2), 'utf8');
      return segredo;
    }
  }

  // --------------------------------------------------------------- usuarios

  function lerUsuarios() {
    try {
      const lista = JSON.parse(fs.readFileSync(ARQUIVO_USUARIOS, 'utf8'));
      return Array.isArray(lista) ? lista : [];
    } catch (error) {
      return [];
    }
  }

  function salvarUsuarios(usuarios) {
    fs.mkdirSync(diretorioDados, { recursive: true });
    fs.writeFileSync(ARQUIVO_USUARIOS, JSON.stringify(usuarios, null, 2), 'utf8');
  }

  function gerarHash(senha, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
    return { salt, hash };
  }

  // Comparacao em tempo constante: o tempo de resposta nao revela quanto do
  // hash bateu.
  function senhaConfere(senha, usuario) {
    if (!usuario || !usuario.salt || !usuario.hash) return false;
    const tentativa = Buffer.from(crypto.scryptSync(senha, usuario.salt, 64).toString('hex'));
    const guardado = Buffer.from(usuario.hash);
    if (tentativa.length !== guardado.length) return false;
    return crypto.timingSafeEqual(tentativa, guardado);
  }

  function semSegredos(usuario) {
    if (!usuario) return null;
    const publico = { ...usuario };
    delete publico.hash;
    delete publico.salt;
    return publico;
  }

  // Na primeira execucao cria o administrador do sistema. A senha vem de
  // ADMIN_INITIAL_PASSWORD ou, na falta dela, e sorteada e impressa uma unica
  // vez no log: o site esta exposto na internet, e uma senha padrao conhecida
  // seria o mesmo que deixar o painel aberto.
  function garantirAdminPadrao() {
    const usuarios = lerUsuarios();
    if (usuarios.some((item) => item.role === PAPEL_ADMIN_SISTEMA)) return usuarios;

    const doAmbiente = (process.env.ADMIN_INITIAL_PASSWORD || '').trim();
    const senha = doAmbiente || crypto.randomBytes(9).toString('base64url');
    const credenciais = gerarHash(senha);

    usuarios.push({
      id: crypto.randomUUID(),
      username: 'admin',
      role: PAPEL_ADMIN_SISTEMA,
      allowedCategories: [],
      senhaPadrao: true,
      createdAt: new Date().toISOString(),
      salt: credenciais.salt,
      hash: credenciais.hash
    });
    salvarUsuarios(usuarios);

    if (doAmbiente) {
      console.warn('[auth] Administrador "admin" criado com a senha de ADMIN_INITIAL_PASSWORD.');
    } else {
      console.warn('[auth] ============================================================');
      console.warn('[auth] Administrador do sistema criado.');
      console.warn('[auth]   usuário: admin');
      console.warn('[auth]   senha:   ' + senha);
      console.warn('[auth] Esta senha aparece apenas aqui. Anote e troque no painel.');
      console.warn('[auth] ============================================================');
    }

    return usuarios;
  }

  // ----------------------------------------------------------------- tokens

  function assinar(dados) {
    return crypto.createHmac('sha256', obterSegredo()).update(dados).digest('base64url');
  }

  function emitirToken(usuario) {
    const conteudo = Buffer.from(JSON.stringify({
      id: usuario.id,
      username: usuario.username,
      role: usuario.role,
      exp: Date.now() + DURACAO_SESSAO_MS
    })).toString('base64url');

    return conteudo + '.' + assinar(conteudo);
  }

  function validarToken(token) {
    if (typeof token !== 'string' || !token.includes('.')) return null;

    const partes = token.split('.');
    const conteudo = partes[0];
    const assinatura = partes[1];
    if (!conteudo || !assinatura) return null;

    const esperada = Buffer.from(assinar(conteudo));
    const recebida = Buffer.from(assinatura);
    if (esperada.length !== recebida.length) return null;
    if (!crypto.timingSafeEqual(esperada, recebida)) return null;

    try {
      const dados = JSON.parse(Buffer.from(conteudo, 'base64url').toString('utf8'));
      if (!dados.exp || dados.exp < Date.now()) return null;

      // O papel vem do arquivo, nao do token: uma permissao revogada vale na hora.
      const usuario = lerUsuarios().find((item) => item.id === dados.id);
      return usuario ? semSegredos(usuario) : null;
    } catch (error) {
      return null;
    }
  }

  // ------------------------------------------------------------ forca bruta

  const tentativas = new Map();

  function estaBloqueado(username) {
    const registro = tentativas.get(username);
    if (!registro) return false;
    if (Date.now() - registro.desde > JANELA_BLOQUEIO_MS) {
      tentativas.delete(username);
      return false;
    }
    return registro.contagem >= MAX_TENTATIVAS;
  }

  function registrarFalha(username) {
    const registro = tentativas.get(username);
    if (!registro || Date.now() - registro.desde > JANELA_BLOQUEIO_MS) {
      tentativas.set(username, { contagem: 1, desde: Date.now() });
      return;
    }
    registro.contagem += 1;
  }

  // ------------------------------------------------------------ middlewares

  function tokenDaRequisicao(req) {
    const header = req.headers.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7) : '';
  }

  function exigirAutenticacao(req, res, next) {
    const usuario = validarToken(tokenDaRequisicao(req));
    if (!usuario) {
      return res.status(401).json({ error: 'Autenticação necessária.' });
    }
    req.usuario = usuario;
    return next();
  }

  function exigirAdminSistema(req, res, next) {
    return exigirAutenticacao(req, res, () => {
      if (req.usuario.role !== PAPEL_ADMIN_SISTEMA) {
        return res.status(403).json({ error: 'Ação restrita ao administrador do sistema.' });
      }
      return next();
    });
  }

  // ------------------------------------------------------------------ acoes

  function autenticar(username, senha) {
    const nome = (username || '').toString().trim();
    const chave = nome.toLowerCase();

    if (!nome || !senha) return { erro: 'Informe usuário e senha.', status: 400 };
    if (estaBloqueado(chave)) {
      return { erro: 'Muitas tentativas. Tente novamente em alguns minutos.', status: 429 };
    }

    const usuario = lerUsuarios().find((item) => item.username.toLowerCase() === chave);
    if (!usuario || !senhaConfere(senha, usuario)) {
      registrarFalha(chave);
      // Mensagem unica: nao revela se o usuario existe.
      return { erro: 'Usuário ou senha inválidos.', status: 401 };
    }

    tentativas.delete(chave);
    return { token: emitirToken(usuario), usuario: semSegredos(usuario) };
  }

  function criarUsuario(dados) {
    const nome = (dados.username || '').toString().trim();
    const senha = (dados.senha || '').toString();

    if (!nome) return { erro: 'Informe o nome de usuário.', status: 400 };
    if (senha.length < 6) {
      return { erro: 'A senha precisa ter ao menos 6 caracteres.', status: 400 };
    }

    const usuarios = lerUsuarios();
    if (usuarios.some((item) => item.username.toLowerCase() === nome.toLowerCase())) {
      return { erro: 'Já existe um usuário com esse nome.', status: 409 };
    }

    const papel = dados.role === PAPEL_ADMIN_SISTEMA ? PAPEL_ADMIN_SISTEMA : PAPEL_ADMIN_CATEGORIA;
    const credenciais = gerarHash(senha);
    const novo = {
      id: crypto.randomUUID(),
      username: nome,
      role: papel,
      allowedCategories: papel === PAPEL_ADMIN_CATEGORIA && Array.isArray(dados.allowedCategories)
        ? dados.allowedCategories : [],
      createdAt: new Date().toISOString(),
      salt: credenciais.salt,
      hash: credenciais.hash
    };

    usuarios.push(novo);
    salvarUsuarios(usuarios);
    return { usuario: semSegredos(novo) };
  }

  // Edita nome, papel, categorias e (opcionalmente) a senha de um usuario.
  // Senha vazia mantem a atual. Nao deixa o sistema ficar sem admin nem o
  // solicitante rebaixar o proprio perfil.
  function atualizarUsuario(id, dados, solicitanteId) {
    const usuarios = lerUsuarios();
    const indice = usuarios.findIndex((item) => item.id === id);
    if (indice === -1) return { erro: 'Usuário não encontrado.', status: 404 };

    const atual = usuarios[indice];
    const nome = (dados.username === undefined ? atual.username : dados.username).toString().trim();
    if (!nome) return { erro: 'Informe o nome de usuário.', status: 400 };

    if (usuarios.some((item) => item.id !== id && item.username.toLowerCase() === nome.toLowerCase())) {
      return { erro: 'Já existe um usuário com esse nome.', status: 409 };
    }

    const papel = dados.role === undefined
      ? atual.role
      : (dados.role === PAPEL_ADMIN_SISTEMA ? PAPEL_ADMIN_SISTEMA : PAPEL_ADMIN_CATEGORIA);

    if (atual.role === PAPEL_ADMIN_SISTEMA && papel !== PAPEL_ADMIN_SISTEMA) {
      if (atual.id === solicitanteId) {
        return { erro: 'Não é possível alterar o próprio perfil.', status: 400 };
      }
      if (!usuarios.some((item) => item.id !== id && item.role === PAPEL_ADMIN_SISTEMA)) {
        return { erro: 'É preciso manter ao menos um administrador do sistema.', status: 400 };
      }
    }

    const senha = (dados.senha || '').toString();
    if (senha && senha.length < 6) {
      return { erro: 'A senha precisa ter ao menos 6 caracteres.', status: 400 };
    }

    const atualizado = {
      ...atual,
      username: nome,
      role: papel,
      allowedCategories: papel === PAPEL_ADMIN_CATEGORIA
        ? (Array.isArray(dados.allowedCategories) ? dados.allowedCategories : atual.allowedCategories || [])
        : []
    };

    if (senha) {
      const credenciais = gerarHash(senha);
      atualizado.salt = credenciais.salt;
      atualizado.hash = credenciais.hash;
      atualizado.senhaPadrao = false;
    }

    usuarios[indice] = atualizado;
    salvarUsuarios(usuarios);
    return { usuario: semSegredos(atualizado) };
  }

  function removerUsuario(id, solicitanteId) {
    const usuarios = lerUsuarios();
    const alvo = usuarios.find((item) => item.id === id);
    if (!alvo) return { erro: 'Usuário não encontrado.', status: 404 };
    if (alvo.id === solicitanteId) {
      return { erro: 'Não é possível remover o próprio usuário.', status: 400 };
    }

    const restantes = usuarios.filter((item) => item.id !== id);
    if (!restantes.some((item) => item.role === PAPEL_ADMIN_SISTEMA)) {
      return { erro: 'É preciso manter ao menos um administrador do sistema.', status: 400 };
    }

    salvarUsuarios(restantes);
    return { removido: true };
  }

  function alterarSenha(id, senhaAtual, senhaNova) {
    const nova = (senhaNova || '').toString();
    if (nova.length < 6) {
      return { erro: 'A nova senha precisa ter ao menos 6 caracteres.', status: 400 };
    }

    const usuarios = lerUsuarios();
    const indice = usuarios.findIndex((item) => item.id === id);
    if (indice === -1) return { erro: 'Usuário não encontrado.', status: 404 };
    if (!senhaConfere((senhaAtual || '').toString(), usuarios[indice])) {
      return { erro: 'Senha atual incorreta.', status: 401 };
    }

    const credenciais = gerarHash(nova);
    usuarios[indice] = {
      ...usuarios[indice],
      salt: credenciais.salt,
      hash: credenciais.hash,
      senhaPadrao: false
    };
    salvarUsuarios(usuarios);
    return { alterada: true };
  }

  function listarUsuarios() {
    return lerUsuarios().map(semSegredos);
  }

  return {
    PAPEL_ADMIN_SISTEMA,
    PAPEL_ADMIN_CATEGORIA,
    garantirAdminPadrao,
    exigirAutenticacao,
    exigirAdminSistema,
    autenticar,
    criarUsuario,
    atualizarUsuario,
    removerUsuario,
    alterarSenha,
    listarUsuarios,
    validarToken
  };
}

module.exports = { criarAuth, PAPEL_ADMIN_SISTEMA, PAPEL_ADMIN_CATEGORIA };
