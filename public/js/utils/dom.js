/** Atalho para document.getElementById. */
export const $ = (id) => document.getElementById(id);

/** Lê uma variável CSS de :root, com valor de reserva se estiver vazia. */
export function lerVariavelCss(nome, reserva = '') {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return valor || reserva;
}

const ENTIDADES_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto antes de inserir em HTML/SVG montado como string. */
export const escaparHtml = (texto) => String(texto).replace(/[&<>"']/g, (c) => ENTIDADES_HTML[c]);
