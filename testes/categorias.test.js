// Regra: a classificacao NUNCA pode atribuir uma categoria que nao exista na
// lista cadastrada. E essa lista que popula as permissoes por administrador —
// uma categoria fora dela deixa a ocorrencia invisivel para todo mundo.
//
// Duas defesas cobrem isso:
//   1. o schema enviado a OpenAI usa `enum` + `strict`, entao a propria API
//      recusa qualquer valor fora da lista;
//   2. normalizeCategory() valida a resposta e mapeia para um item da lista.
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
  // Recorta so as funcoes de categoria: fora o Express e a inicializacao da
  // autenticacao, que este teste nao exercita.
  const trecho = codigo.slice(inicio, fim)
    .replace(/^app\.use\(.*$/gm, '')
    .replace(/^const auth = criarAuth.*$/gm, '')
    .replace(/^auth\.garantirAdminPadrao\(\);$/gm, '');

  // O recorte usa path/fs para localizar a configuracao persistida; aqui ela
  // nao existe, e as funcoes caem nos padroes — que e o que se quer testar.
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, debug() {} },
    path,
    fs,
    __dirname: RAIZ
  };
  vm.createContext(sandbox);
  vm.runInContext(
    trecho
      + '\n;globalThis.exp = { normalizeCategory, listaEfetivaDeCategorias,'
      + ' categoriaGenerica, esquemaDeClassificacao, DEFAULT_CATEGORIES };',
    sandbox
  );
  return sandbox.exp;
}

const { normalizeCategory, listaEfetivaDeCategorias, categoriaGenerica,
        esquemaDeClassificacao, DEFAULT_CATEGORIES } = carregarFuncoes();

const LISTA = listaEfetivaDeCategorias(DEFAULT_CATEGORIES);

console.log('\nO texto do modelo vira a categoria correspondente da lista');
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
  ['Mato alto', 'mato alto'],                     // fora das 8 categorias fixas antigas
  ['Pontos de dengue', 'pontos de dengue'],
  ['Poda', 'poda'],
  ['Enchentes', 'enchentes']
].forEach(([entrada, esperado]) => {
  const obtido = normalizeCategory(entrada, DEFAULT_CATEGORIES);
  ok(obtido === esperado, `"${entrada}" -> "${obtido}" (esperado "${esperado}")`);
});

console.log('\nO retorno NUNCA e uma categoria fora da lista');
[
  'Buraco', 'algo totalmente inventado', '', null, undefined, 'Outros',
  'Categoria Nova Que Nao Existe', '   ', '12345', 'Semaforo quebrado'
].forEach((entrada) => {
  const obtido = normalizeCategory(entrada, DEFAULT_CATEGORIES);
  ok(LISTA.includes(obtido), `${JSON.stringify(entrada)} -> "${obtido}" pertence a lista`);
});

console.log('\nA lista sempre oferece um destino para o que nao se encaixa');
{
  const semGenerica = ['buracos', 'poda'];
  const efetiva = listaEfetivaDeCategorias(semGenerica);
  ok(efetiva.includes('outros'), 'lista sem generica ganha "outros"');
  ok(efetiva.includes(categoriaGenerica(efetiva)), 'a generica pertence a propria lista');

  const comGenerica = ['buracos', 'Diversos'];
  ok(listaEfetivaDeCategorias(comGenerica).length === 2, 'lista que ja tem generica nao ganha outra');
  ok(categoriaGenerica(listaEfetivaDeCategorias(comGenerica)) === 'Diversos', 'reconhece a generica existente');
}

console.log('\nUma lista personalizada e respeitada, sem vazar a lista padrao');
{
  const proprios = ['Iluminação', 'Buracos e valas'];
  const efetiva = listaEfetivaDeCategorias(proprios);
  ['buraco', 'luz apagada', 'inventado', 'poda de arvore'].forEach((entrada) => {
    const obtido = normalizeCategory(entrada, proprios);
    ok(efetiva.includes(obtido), `"${entrada}" -> "${obtido}" pertence a lista informada`);
  });
  ok(normalizeCategory('buraco', proprios) === 'Buracos e valas', 'mapeia para o item personalizado');
}

console.log('\nO schema enviado a IA restringe a resposta a lista');
{
  const esquema = esquemaDeClassificacao(LISTA, ['Baixa', 'Média', 'Alta', 'Urgente']);
  const enumCategorias = esquema.json_schema.schema.properties.category.enum;
  ok(esquema.json_schema.strict === true, 'schema em modo strict');
  ok(esquema.json_schema.schema.additionalProperties === false, 'nao aceita campos extras');
  ok(Array.isArray(enumCategorias) && enumCategorias.length === LISTA.length,
    'o enum tem exatamente as categorias da lista');
  ok(enumCategorias.every((item) => LISTA.includes(item)), 'nenhum valor fora da lista no enum');
  ok(esquema.json_schema.schema.properties.priority.enum.length === 4, 'prioridades tambem restritas');
}

console.log(falhas === 0 ? '\nTodos os testes passaram.\n' : '\n' + falhas + ' teste(s) falharam.\n');
process.exit(falhas === 0 ? 0 : 1);
