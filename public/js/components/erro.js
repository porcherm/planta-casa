/**
 * Mostra na página um erro nos dados da planta, no lugar da área de trabalho.
 */
import { $ } from '../utils/dom.js';

export function mostrarErroDeDados(mensagem) {
  $('erro-dados-txt').textContent = mensagem;
  $('erro-dados').hidden = false;
  document.querySelector('.workspace').hidden = true;
  $('badge').hidden = true;
  console.error(`[Planta do Apê] ${mensagem}`);
}
