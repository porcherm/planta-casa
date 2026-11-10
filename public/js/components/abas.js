/**
 * Alterna entre a planta 2D e o modelo 3D.
 */
import { $ } from '../utils/dom.js';

export function iniciarAbas(modelo3d) {
  function mostrar(aba) {
    const em3d = aba === '3d';
    $('tab-2d').setAttribute('aria-pressed', String(!em3d));
    $('tab-3d').setAttribute('aria-pressed', String(em3d));
    $('view-2d').hidden = em3d;
    $('bar-2d').hidden = em3d;
    $('view-3d').hidden = !em3d;

    if (em3d) modelo3d.ativar();
    else modelo3d.desativar();
  }

  $('tab-2d').addEventListener('click', () => mostrar('2d'));
  $('tab-3d').addEventListener('click', () => mostrar('3d'));
}
