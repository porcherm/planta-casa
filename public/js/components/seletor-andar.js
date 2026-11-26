/**
 * Seletor do andar visível, na barra do palco (vale para todas as abas).
 *
 * - Só aparece quando a casa tem mais de um andar.
 * - Botões de baixo para cima (Subsolo · Térreo · Superior), com a cota do piso.
 * - Page Up / Page Down sobem e descem um andar (fora de campos de texto).
 * - Os botões "Subir/Descer andar" do Caminhar usam a mesma lógica.
 */
import { andarVizinho } from '../domain/andares.js';
import { $, escaparHtml } from '../utils/dom.js';

/** Cota em metros com sinal, ex.: "+2,85" / "−2,65" / "0,00". */
export function formatarCota(cm) {
  const m = Math.abs(cm / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (Math.abs(cm) < 0.5) return '0,00';
  return `${cm > 0 ? '+' : '−'}${m}`;
}

export function iniciarSeletorDeAndar(store) {
  const caixa = $('seletor-andar');
  const lista = $('seletor-andar-lista');

  function renderizar() {
    const { andares } = store.dados;
    const varios = andares.length > 1;
    caixa.hidden = !varios;
    $('passeio-andar').hidden = !varios;
    $('chip-fantasma').hidden = !varios;
    if (!varios) { lista.innerHTML = ''; return; }

    lista.innerHTML = andares.map((a) =>
      `<button type="button" class="andar-btn" data-andar="${escaparHtml(a.id)}" aria-pressed="false" ` +
      `title="${escaparHtml(a.nome)}: piso a ${formatarCota(a.cota)} m">${escaparHtml(a.nome)}</button>`).join('');
    marcar();
  }

  function marcar() {
    const atual = store.andarAtual;
    lista.querySelectorAll('.andar-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.andar === atual)));
    const acima = andarVizinho(store.dados, atual, 'acima');
    const abaixo = andarVizinho(store.dados, atual, 'abaixo');
    $('passeio-subir').disabled = !acima;
    $('passeio-descer').disabled = !abaixo;
    $('passeio-subir').textContent = acima ? `▲ Subir para ${acima.nome}` : '▲ Subir andar';
    $('passeio-descer').textContent = abaixo ? `▼ Descer para ${abaixo.nome}` : '▼ Descer andar';
    // A camada "andar de baixo" só faz sentido se houver um andar embaixo
    $('chip-fantasma').disabled = !abaixo;
  }

  function mudar(lado) {
    const vizinho = andarVizinho(store.dados, store.andarAtual, lado);
    if (vizinho) store.selecionarAndar(vizinho.id);
  }

  lista.addEventListener('click', (e) => {
    const b = e.target.closest('[data-andar]');
    if (b) store.selecionarAndar(b.dataset.andar);
  });
  $('passeio-subir').addEventListener('click', () => mudar('acima'));
  $('passeio-descer').addEventListener('click', () => mudar('abaixo'));

  const digitando = (alvo) => alvo.closest?.('input, textarea, select, [contenteditable="true"], dialog[open]');
  window.addEventListener('keydown', (e) => {
    if (store.dados.andares.length < 2 || digitando(e.target) || document.querySelector('dialog[open]')) return;
    if (e.key === 'PageUp') { e.preventDefault(); mudar('acima'); }
    if (e.key === 'PageDown') { e.preventDefault(); mudar('abaixo'); }
  });

  store.observarAndar(marcar);
  store.observarDados(renderizar);
  renderizar();
}
