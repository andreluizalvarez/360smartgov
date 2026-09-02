// Regressao: a categoria devolvida pelo modelo precisa virar um item da lista
// configurada. E essa lista que popula as permissoes por administrador — uma
// categoria fora dela deixa a ocorrencia invisivel para todo mundo.
//
// O bug original: normalizeCategory() no server.js tinha 8 categorias fixas,
// com nomes divergentes da lista real ("Buraco" contra "buracos"), e ignorava
// por completo a lista recebida na requisicao.
//
// Rodar com: node testes/categorias.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');

let falhas = 0;
function ok(condicao, mensagem) {
  console.log((condicao ? '  ok  ' : ' FALHA') + ' ' + mensagem);
  if (!condicao) falhas += 1;
}

// Carrega so as funcoes puras do server.js, sem subir o Express.
function carregarFuncoes() {
  const codigo = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  const inicio = codigo.indexOf('const DEFAULT_CATEGORIES');
  const fim = codigo.indexOf('function normalizePhoneForWhatsApp');
  const trecho = codigo.slice(inicio, fim).replace(/^app\.use\(.*$/gm, '');

  const sandbox = { console: { log() {}, warn() {}, error() {}, debug() {} } };
  vm.createContext(sandbox);
  vm.runInContext(trecho + '\n;globalThis.__cat = normalizeCategory;'
    + '\n;globalThis.__lista = DEFAULT_CATEGORIES;', sandbox);
  return sandbox;
}

const { __cat: normalizeCategory, __lista: LISTA } = carregarFuncoes();

console.log('\nA categoria atribuida existe na lista configurada');
[
  ['Buraco', 'buracos'],                          // singular do modelo, plural na lista
  ['buracos', 'buracos'],
  ['Buraco na via', 'buracos'],
  ['Árvore caída', 'árvores caídas'],
  ['Boca de lobo', 'boca de lobo entupida'],
  ['Vazamento', 'vazamentos'],
  ['Iluminação pública', 'iluminação pública'],
  ['iluminacao publica', 'iluminação pública'],   // sem acento
  ['Semáforo', 'semáforo'],
  ['Descarte irregular', 'descarte irregular'],
  ['Mato alto', 'mato alto'],                     // fora das 8 fixas antigas
  ['Pontos de dengue', 'pontos de dengue'],
  ['Poda', 'poda'],
  ['Pichações', 'pichações'],
  ['Enchentes', 'enchentes']
].forEach(([entrada, esperado]) => {
  const obtido = normalizeCategory(entrada, LISTA);
  ok(obtido === esperado, `"${entrada}" -> "${obtido}" (esperado "${esperado}")`);
});

console.log('\nToda categoria atribuida e selecionavel na criacao do usuario');
['Buraco', 'Árvore caída', 'Vazamento', 'Mato alto', 'Poda'].forEach((entrada) => {
  const obtido = normalizeCategory(entrada, LISTA);
  ok(LISTA.includes(obtido) || obtido === 'Outros',
    `"${obtido}" esta na lista de categorias`);
});

console.log('\nCasos sem correspondencia caem em Outros');
[['', 'Outros'], [null, 'Outros'], ['xyzabc123', 'Outros']].forEach(([entrada, esperado]) => {
  const obtido = normalizeCategory(entrada, LISTA);
  ok(obtido === esperado, `${JSON.stringify(entrada)} -> "${obtido}"`);
});

console.log('\nUma lista personalizada e respeitada');
{
  const propria = ['Iluminação', 'Buracos e valas', 'Limpeza'];
  ok(normalizeCategory('buraco', propria) === 'Buracos e valas', 'usa a lista informada, nao a padrao');
  ok(normalizeCategory('poda de arvore', propria) === 'Outros', 'fora da lista informada vira Outros');
}

console.log(falhas === 0 ? '\nTodos os testes passaram.\n' : '\n' + falhas + ' teste(s) falharam.\n');
process.exit(falhas === 0 ? 0 : 1);
