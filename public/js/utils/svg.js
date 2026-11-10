/**
 * Pequenos construtores de marcação SVG (como string).
 * Mantêm o código de desenho legível em vez de concatenações longas.
 */

export const pontosSvg = (pontos) => pontos.map(([x, y]) => `${x},${y}`).join(' ');

export const linha = (classe, x1, y1, x2, y2) =>
  `<line class="${classe}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;

export const texto = (classe, x, y, conteudo, atributos = '') =>
  `<text class="${classe}" x="${x}" y="${y}"${atributos}>${conteudo}</text>`;

export const girar = (graus, x, y) => ` transform="rotate(${graus} ${x} ${y})"`;

export const grupo = (classe, conteudo, atributos = '') => `<g class="${classe}"${atributos}>${conteudo}</g>`;
