// Regressao: um admin restrito a uma categoria nao pode apagar as ocorrencias
// das demais ao abrir o painel.
//
// O bug original: refreshDashboard() filtrava as ocorrencias por permissao e
// repassava a lista filtrada a initMap() -> ensureIncidentCoordinates(), que
// gravava esse subconjunto por cima da base inteira. Quando o filtro nao casava
// com nada, gravava [] e apagava tudo.
//
// Rodar com: node testes/incidentes.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const CHAVE = 'smartgov360-incidents-v1';

let falhas = 0;
function ok(condicao, mensagem) {
  console.log((condicao ? '  ok  ' : ' FALHA') + ' ' + mensagem);
  if (!condicao) falhas += 1;
}

function criarStorage() {
  const dados = new Map();
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
    clear: () => dados.clear()
  };
}

const elementoFalso = () => ({
  value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, files: [], checked: false,
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, removeEventListener() {}, appendChild() {},
  querySelector: () => null, querySelectorAll: () => [], closest: () => null,
  insertAdjacentHTML() {}
});

// Carrega o script.js real num contexto com stubs de DOM.
function carregarScript() {
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, debug() {} },
    localStorage: criarStorage(),
    sessionStorage: criarStorage(),
    crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2, 10) },
    navigator: { userAgent: 'node', geolocation: null, permissions: null },
    location: { href: '' },
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    setTimeout, clearTimeout, setInterval, clearInterval,
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: elementoFalso, addEventListener() {}, body: elementoFalso()
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  // googleMapsLoaded e `let`, inacessivel de fora; este trecho expoe o cenario.
  const codigo = fs.readFileSync(path.join(RAIZ, 'script.js'), 'utf8')
    + '\n;globalThis.__abrirMapaComo = async function (listaFiltrada) {'
    + '\n  googleMapsLoaded = true;'
    + '\n  return ensureIncidentCoordinates(listaFiltrada);'
    + '\n};';

  vm.createContext(sandbox);
  vm.runInContext(codigo, sandbox, { filename: 'script.js' });
  return sandbox;
}

const baseDuasCategorias = () => ([
  { id: 'a1', title: 'Buraco na via', category: 'Buraco', priority: 'Urgente',
    status: 'Em análise', latitude: '-23.5', longitude: '-46.6', createdAt: new Date().toISOString() },
  { id: 'b2', title: 'Poste apagado', category: 'Iluminação pública', priority: 'Alta',
    status: 'Em análise', latitude: '-23.4', longitude: '-46.7', createdAt: new Date().toISOString() }
]);

const salvos = (s) => JSON.parse(s.localStorage.getItem(CHAVE) || '[]');

(async () => {
  console.log('\nCausa raiz: lista filtrada por permissao nao sobrescreve a base');
  {
    const s = carregarScript();
    s.localStorage.setItem(CHAVE, JSON.stringify(baseDuasCategorias()));
    // Admin de "Buraco" abre o painel: enxerga so a sua ocorrencia.
    await s.__abrirMapaComo([baseDuasCategorias()[0]]);
    const depois = salvos(s);
    ok(depois.length === 2, 'as 2 ocorrencias sobrevivem (ficaram ' + depois.length + ')');
    ok(depois.some((i) => i.id === 'b2'), 'a ocorrencia de outra categoria continua salva');
  }
  {
    const s = carregarScript();
    s.localStorage.setItem(CHAVE, JSON.stringify(baseDuasCategorias()));
    // Categoria do usuario nao casa com nenhuma ocorrencia: filtro devolve [].
    await s.__abrirMapaComo([]);
    const depois = salvos(s);
    ok(depois.length === 2, 'filtro sem resultado nao apaga nada (ficaram ' + depois.length + ')');
  }

  console.log('\nRede de seguranca: gravacao vazia acidental e recusada');
  {
    const s = carregarScript();
    s.localStorage.setItem(CHAVE, JSON.stringify(baseDuasCategorias()));
    const resultado = s.saveIncidents([]);
    ok(resultado === false, 'saveIncidents([]) e recusado');
    ok(salvos(s).length === 2, 'a base continua intacta');
  }

  console.log('\nLimpar tudo pelo painel continua permitido');
  {
    const s = carregarScript();
    s.localStorage.setItem(CHAVE, JSON.stringify(baseDuasCategorias()));
    const resultado = s.saveIncidents([], { permitirVazio: true });
    ok(resultado === true && salvos(s).length === 0, 'limpeza explicita funciona');
  }

  console.log('\nBackup e restauracao');
  {
    const s = carregarScript();
    s.localStorage.setItem(CHAVE, JSON.stringify(baseDuasCategorias()));
    s.saveIncidents([baseDuasCategorias()[0]]);  // reduz a base
    ok(s.window.smartgovIncidentes.verBackup().length === 2, 'backup guardou a versao anterior');
    s.window.smartgovIncidentes.restaurarBackup();
    ok(salvos(s).length === 2, 'restaurarBackup() devolve as ocorrencias');
  }

  console.log(falhas === 0 ? '\nTodos os testes passaram.\n' : '\n' + falhas + ' teste(s) falharam.\n');
  process.exit(falhas === 0 ? 0 : 1);
})();
