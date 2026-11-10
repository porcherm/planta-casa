/**
 * Componente da planta 2D: desenha o SVG e liga zoom, arrasto, régua,
 * camadas e seleção de cômodos.
 */
import { ZOOM, TOLERANCIA_TRAVA_REGUA } from '../../constants/visualizacao.js';
import { $ } from '../../utils/dom.js';
import { formatarMetros } from '../../utils/formatar.js';
import { desenharPlanta, desenharMedidasDoComodo, desenharRegua } from './desenho.js';
import { criarViewport } from './viewport.js';
import { registrarGestos } from './gestos.js';

export function iniciarPlanta2D(store) {
  const svg = $('planta');
  const dicaEl = $('tag-2d');
  const viewport = criarViewport(svg);
  const regua = { ativa: false, a: null, b: null, hover: null };

  /* ---------- Desenho ---------- */

  function renderizar() {
    const { markup, viewBox } = desenharPlanta(store.dados);
    svg.innerHTML = markup;
    viewport.definirBase(viewBox);
    marcarSelecionado();
    atualizarRegua();
  }

  function marcarSelecionado() {
    svg.querySelectorAll('.room').forEach((g) => g.classList.toggle('is-sel', g.dataset.id === store.selecionadoId));
    const alvo = $('medidas-sel');
    if (alvo) alvo.innerHTML = desenharMedidasDoComodo(store.comodoSelecionado, store.dados);
  }

  /* ---------- Régua ---------- */

  function atualizarRegua() {
    const g = $('regua-g');
    if (g) g.innerHTML = desenharRegua(regua);
  }

  /** Ponto da régua em cm; trava na horizontal/vertical quando quase alinhado. */
  function pontoDaRegua(clienteX, clienteY) {
    const q = viewport.paraPlanta(clienteX, clienteY);
    if (!q) return null;
    const p = [Math.round(q[0]), Math.round(q[1])];
    if (regua.a && !regua.b) {
      const dx = p[0] - regua.a[0], dy = p[1] - regua.a[1];
      if (Math.abs(dy) < Math.abs(dx) * TOLERANCIA_TRAVA_REGUA) p[1] = regua.a[1];
      else if (Math.abs(dx) < Math.abs(dy) * TOLERANCIA_TRAVA_REGUA) p[0] = regua.a[0];
    }
    return p;
  }

  function marcarPontoDaRegua(e) {
    const p = pontoDaRegua(e.clientX, e.clientY);
    if (!p) return;
    if (!regua.a || regua.b) Object.assign(regua, { a: p, b: null, hover: null });
    else regua.b = p;
    atualizarRegua();
    atualizarDica();
  }

  function alternarRegua(botao) {
    Object.assign(regua, { ativa: !regua.ativa, a: null, b: null, hover: null });
    botao.setAttribute('aria-pressed', String(regua.ativa));
    svg.classList.toggle('regua', regua.ativa);
    atualizarRegua();
    atualizarDica();
  }

  /* ---------- Dica no rodapé da vista ---------- */

  function atualizarDica() {
    dicaEl.textContent = textoDaDica();
  }

  function textoDaDica() {
    if (!regua.ativa) return 'Toque num cômodo para ver as medidas de cada parede, em cm';
    if (!regua.a) return 'Régua: toque no primeiro ponto';
    if (!regua.b) return 'Régua: toque no segundo ponto';
    const d = Math.hypot(regua.b[0] - regua.a[0], regua.b[1] - regua.a[1]);
    return `Distância: ${formatarMetros(d)} (${Math.round(d)} cm) · toque de novo para medir outra`;
  }

  /* ---------- Coordenadas sob o cursor (ajuda a montar os dados) ---------- */

  const coordEl = $('coord-2d');

  function mostrarCoordenadas(e) {
    const q = viewport.paraPlanta(e.clientX, e.clientY);
    if (!q) return;
    coordEl.textContent = `x ${Math.round(q[0])} · y ${Math.round(q[1])} cm`;
    coordEl.hidden = false;
  }

  svg.addEventListener('pointerleave', () => { coordEl.hidden = true; });

  /* ---------- Eventos ---------- */

  registrarGestos(svg, {
    aoTocar(e, alvo) {
      if (regua.ativa) { marcarPontoDaRegua(e); return; }
      const comodo = alvo?.closest?.('.room');
      if (comodo) store.selecionar(comodo.dataset.id);
    },
    aoArrastar: (dx, dy) => viewport.arrastar(dx, dy),
    aoPincar: (fator, x, y) => viewport.zoom(fator, x, y),
    aoPairar(e) {
      mostrarCoordenadas(e);
      if (regua.ativa && regua.a && !regua.b) {
        regua.hover = pontoDaRegua(e.clientX, e.clientY);
        atualizarRegua();
      }
    },
  });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    viewport.zoom(e.deltaY < 0 ? ZOOM.passoRoda : 1 / ZOOM.passoRoda, e.clientX, e.clientY);
  }, { passive: false });

  // Acessibilidade: cômodos são focáveis e selecionáveis pelo teclado
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const comodo = e.target.closest('.room');
    if (comodo) { e.preventDefault(); store.selecionar(comodo.dataset.id); }
  });

  $('zoom-mais').addEventListener('click', () => viewport.zoom(ZOOM.passoBotao));
  $('zoom-menos').addEventListener('click', () => viewport.zoom(1 / ZOOM.passoBotao));
  $('zoom-ajustar').addEventListener('click', () => viewport.ajustar());
  $('regua-btn').addEventListener('click', (e) => alternarRegua(e.currentTarget));

  // Chips "Mostrar": cada um liga/desliga uma camada (nomes, cotas, portas, grade)
  document.querySelectorAll('[data-camada]').forEach((botao) => botao.addEventListener('click', () => {
    const ligado = botao.getAttribute('aria-pressed') !== 'true';
    botao.setAttribute('aria-pressed', String(ligado));
    svg.classList.toggle(`sem-${botao.dataset.camada}`, !ligado);
  }));

  store.observar(marcarSelecionado);
  renderizar();
  atualizarDica();
}
