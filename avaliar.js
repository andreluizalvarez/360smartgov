// Pesquisa de satisfacao: pagina publica aberta pelo link unico enviado ao
// cidadao na conclusao da ocorrencia. So enxerga o minimo e grava uma vez.
const token = new URLSearchParams(window.location.search).get('t') || '';
const intro = document.getElementById('avaliar-intro');
const bloco = document.getElementById('avaliar-ocorrencia');
const form = document.getElementById('avaliar-form');
const mensagem = document.getElementById('avaliar-message');
const legenda = document.getElementById('nota-legenda');
const LEGENDAS = { 1: 'Muito ruim', 2: 'Ruim', 3: 'Regular', 4: 'Bom', 5: 'Excelente' };

function mostrar(texto, erro = false) {
  if (!mensagem) return;
  mensagem.textContent = texto;
  mensagem.classList.toggle('error', erro);
}

async function carregar() {
  if (!token) {
    if (intro) intro.textContent = 'Este link de avaliação é inválido. Verifique o e-mail que você recebeu.';
    return;
  }
  try {
    const resposta = await fetch(`/api/avaliacao/${encodeURIComponent(token)}`);
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      if (intro) intro.textContent = dados.error || 'Este link de avaliação é inválido.';
      return;
    }
    const o = dados.ocorrencia;
    document.getElementById('avaliar-titulo').textContent = o.title || '—';
    document.getElementById('avaliar-categoria').textContent = o.category || '—';
    document.getElementById('avaliar-status').textContent = o.status || '—';
    if (o.respostaConclusao) {
      document.getElementById('avaliar-resposta').textContent = o.respostaConclusao;
      document.getElementById('avaliar-resposta-wrap').hidden = false;
    }
    if (bloco) bloco.hidden = false;

    if (o.avaliada) {
      if (intro) intro.textContent = 'Esta solicitação já foi avaliada. Obrigado pela sua participação!';
      return;
    }
    if (o.status !== 'Concluído') {
      if (intro) intro.textContent = 'A avaliação fica disponível depois que a solicitação for concluída.';
      return;
    }
    if (intro) intro.textContent = 'Sua opinião ajuda a Prefeitura a melhorar os serviços. Leva menos de um minuto.';
    if (form) form.hidden = false;
  } catch (error) {
    if (intro) intro.textContent = 'Não foi possível carregar a avaliação. Tente novamente mais tarde.';
  }
}

if (form) {
  form.addEventListener('change', (event) => {
    if (event.target.name === 'nota' && legenda) legenda.textContent = LEGENDAS[event.target.value] || '';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nota = Number(new FormData(form).get('nota'));
    const comentario = (document.getElementById('comentario')?.value || '').trim();
    const botao = document.getElementById('avaliar-enviar');
    if (!nota) {
      mostrar('Escolha uma nota de 1 a 5.', true);
      return;
    }
    if (botao) botao.disabled = true;
    mostrar('Enviando...');
    try {
      const resposta = await fetch(`/api/avaliacao/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota, comentario })
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        mostrar(dados.error || 'Não foi possível enviar a avaliação.', true);
        if (botao) botao.disabled = false;
        return;
      }
      form.hidden = true;
      if (intro) intro.textContent = 'Avaliação enviada. Obrigado por ajudar a melhorar a cidade!';
      mostrar('');
    } catch (error) {
      mostrar('Não foi possível falar com o servidor.', true);
      if (botao) botao.disabled = false;
    }
  });
}

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
carregar();
