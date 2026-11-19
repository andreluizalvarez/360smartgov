// Localizacao do cidadao: mesma logica do site (script.js), adaptada ao celular.
// A primeira posicao que o aparelho devolve costuma vir da rede, com erro de
// centenas de metros; por isso a posicao e observada por alguns segundos e fica
// a leitura mais precisa.
import * as Location from 'expo-location';

export const PRECISAO_BOA_M = 25;
export const PRECISAO_AVISO_M = 100;
const ESPERA_MS = 12000;

export async function pedirPermissao() {
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  return { concedida: status === 'granted', podePedirDeNovo: canAskAgain };
}

export function obterPosicaoPrecisa() {
  return new Promise((resolve, reject) => {
    let melhor = null;
    let assinatura = null;
    let timer = null;
    let encerrado = false;

    const concluir = (erro) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(timer);
      if (assinatura) assinatura.remove();
      if (melhor) resolve(melhor);
      else reject(erro || new Error('Tempo esgotado ao obter a localização.'));
    };

    timer = setTimeout(() => concluir(), ESPERA_MS);

    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (pos) => {
        if (encerrado) return;
        const erroAtual = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 9999;
        const erroMelhor = melhor && Number.isFinite(melhor.coords.accuracy) ? melhor.coords.accuracy : 9999;
        if (!melhor || erroAtual < erroMelhor) melhor = pos;
        if (erroAtual <= PRECISAO_BOA_M) concluir();
      },
      (erro) => {
        if (!melhor) concluir(erro);
        else concluir();
      }
    ).then((sub) => {
      assinatura = sub;
      // Se ja encerrou enquanto a assinatura era criada, libera na hora.
      if (encerrado) sub.remove();
    }).catch((erro) => concluir(erro));
  });
}

// Estados por nome, como o geocodificador do Android devolve, para a sigla
// usada no site.
const UF = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceara': 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO', 'maranhao': 'MA', 'mato grosso': 'MT',
  'mato grosso do sul': 'MS', 'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
  'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
  'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
  'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO'
};

export function textoComparavel(texto) {
  return (texto || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function siglaDoEstado(valor) {
  const t = (valor || '').toString().trim();
  if (!t) return '';
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return UF[textoComparavel(t)] || t;
}

function limpo(valor) {
  return (valor === undefined || valor === null ? '' : valor).toString().trim();
}

// Geocodificador do proprio aparelho (Apple no iOS, Google no Android): sem
// chave de API e sem custo.
async function enderecoNativo(lat, lng) {
  try {
    const lista = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const e = lista && lista[0];
    if (!e) return null;
    return {
      cep: limpo(e.postalCode),
      street: limpo(e.street),
      number: limpo(e.streetNumber),
      neighborhood: limpo(e.district),
      city: limpo(e.city || e.subregion),
      state: siglaDoEstado(e.region)
    };
  } catch (error) {
    return null;
  }
}

// Reserva: OpenStreetMap, como no site. Costuma trazer o bairro quando o
// geocodificador nativo nao traz.
async function enderecoNominatim(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'SmartGov360App/1.0 (contato: www.360smartgov.com.br)' } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const a = data.address || {};
    return {
      cep: limpo(a.postcode),
      street: limpo(a.road || a.pedestrian || a.cycleway),
      number: limpo(a.house_number),
      neighborhood: limpo(a.suburb || a.neighbourhood || a.village),
      city: limpo(a.city || a.town || a.village || a.county),
      state: siglaDoEstado(a.state)
    };
  } catch (error) {
    return null;
  }
}

// Combina as duas fontes: cada campo vem da primeira que o tiver. O numero da
// reserva so vale se ela estiver falando da mesma rua.
export async function enderecoPorCoordenada(lat, lng) {
  const [nativo, osm] = await Promise.all([enderecoNativo(lat, lng), enderecoNominatim(lat, lng)]);
  if (!nativo && !osm) return null;
  const principal = nativo || {};
  const reserva = osm || {};
  const campo = (nome) => principal[nome] || reserva[nome] || '';
  const mesmaRua = !principal.street || !reserva.street || textoComparavel(principal.street) === textoComparavel(reserva.street);
  return {
    cep: campo('cep'),
    street: campo('street'),
    number: mesmaRua ? campo('number') : (principal.number || ''),
    neighborhood: campo('neighborhood'),
    city: campo('city'),
    state: campo('state')
  };
}

export async function coordenadaPorEndereco(endereco) {
  try {
    const lista = await Location.geocodeAsync(endereco);
    const p = lista && lista[0];
    return p ? { latitude: p.latitude, longitude: p.longitude } : null;
  } catch (error) {
    return null;
  }
}

export function distanciaEmMetros(lat1, lng1, lat2, lng2) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
