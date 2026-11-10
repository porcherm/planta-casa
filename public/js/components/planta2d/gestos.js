import { LIMIAR_ARRASTO_PX } from '../../constants/visualizacao.js';

/**
 * Traduz eventos de ponteiro (mouse, toque, caneta) em gestos de alto nível:
 * - toque simples (sem arrastar)  → aoTocar(evento, alvoOriginal)
 * - arrastar com um dedo/mouse     → aoArrastar(dx, dy)
 * - pinça com dois dedos           → aoPincar(fator, centroX, centroY)
 * - mouse passando sem clicar      → aoPairar(evento)
 */
export function registrarGestos(elemento, { aoTocar, aoArrastar, aoPincar, aoPairar }) {
  const toques = new Map();
  let gesto = null;

  const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  elemento.addEventListener('pointerdown', (e) => {
    toques.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (toques.size === 1) {
      gesto = { tipo: 'um', x0: e.clientX, y0: e.clientY, moveu: false, alvo: e.target };
    } else if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      gesto = { tipo: 'pinca', d0: distancia(a, b) };
    }
    try { elemento.setPointerCapture(e.pointerId); } catch { /* navegador sem suporte */ }
  });

  elemento.addEventListener('pointermove', (e) => {
    if (!toques.has(e.pointerId)) { aoPairar(e); return; }

    const anterior = toques.get(e.pointerId);
    const atual = { x: e.clientX, y: e.clientY };
    toques.set(e.pointerId, atual);

    if (gesto?.tipo === 'um') {
      if (!gesto.moveu && distancia(atual, { x: gesto.x0, y: gesto.y0 }) < LIMIAR_ARRASTO_PX) return;
      gesto.moveu = true;
      elemento.classList.add('arrastando');
      aoArrastar(atual.x - anterior.x, atual.y - anterior.y);
    } else if (gesto?.tipo === 'pinca' && toques.size === 2) {
      const [a, b] = [...toques.values()];
      const d = distancia(a, b);
      if (gesto.d0 > 0) aoPincar(d / gesto.d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
      gesto.d0 = d;
    }
  });

  function encerrar(e) {
    const g = gesto;
    toques.delete(e.pointerId);
    if (toques.size === 0) {
      if (g?.tipo === 'um' && !g.moveu && e.type === 'pointerup') aoTocar(e, g.alvo);
      gesto = null;
      elemento.classList.remove('arrastando');
    } else if (toques.size === 1) {
      // Saiu da pinça: o dedo que ficou continua arrastando
      const [p] = [...toques.values()];
      gesto = { tipo: 'um', x0: p.x, y0: p.y, moveu: true };
    }
  }
  elemento.addEventListener('pointerup', encerrar);
  elemento.addEventListener('pointercancel', encerrar);
}
