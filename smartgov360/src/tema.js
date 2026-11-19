// Mesmas cores do site do cidadao (cidadao.css), para o app e o site parecerem
// um unico servico da prefeitura.
export const CORES = {
  azul: '#1a66d6',
  azulEscuro: '#0f3d8a',
  azulClaro: '#e8f0fd',
  azulBorda: '#b9d1f7',
  fundo: '#f3f6fb',
  cinzaTexto: '#5b6b7c',
  tinta: '#152433',
  borda: '#dfe6ef',
  verde: '#1f9d55',
  amarelo: '#f0a92c',
  vermelho: '#c94b4b',
  branco: '#ffffff'
};

export const ESPACO = 16;
export const RAIO = 12;

export function corDoStatus(status) {
  if (status === 'Concluído') return CORES.verde;
  if (status === 'Em andamento') return CORES.amarelo;
  return CORES.azul;
}

const FUSO = 'America/Sao_Paulo';

export function dataCurta(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function dataHora(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return d.toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
}
