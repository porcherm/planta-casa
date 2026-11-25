/**
 * Colisão simples em 2D para o passeio em primeira pessoa.
 * A pessoa é um círculo; paredes, janelas e guarda-corpos são segmentos com espessura.
 * Sem DOM nem three.js: dá para testar com Node.
 */
import { gerarParedes } from './geometria.js';

/** Distância de um ponto (px, pz) até o segmento [ax, az, bx, bz]. */
export function distanciaAoSegmento(px, pz, [ax, az, bx, bz]) {
  const dx = bx - ax, dz = bz - az;
  const comp2 = dx * dx + dz * dz;
  const t = comp2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / comp2)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/**
 * Obstáculos em metros, já no sistema da cena (centralizado em cx, cz).
 * Portas e vãos ficam livres; janelas bloqueiam (exceto a losango, que já é parede no 3D).
 */
export function gerarObstaculos(dados, { cx, cz }) {
  const { paredes, guardas } = gerarParedes(dados, true);
  const meiaParede = (dados.parede || 12) / 200;
  const paraCena = (s) => [s[0] / 100 - cx, s[1] / 100 - cz, s[2] / 100 - cx, s[3] / 100 - cz];
  const janelas = dados.janelas.filter((j) => j.forma !== 'losango').map((j) => [j.x1, j.y1, j.x2, j.y2]);

  return [
    ...paredes.map((s) => ({ seg: paraCena(s), meia: meiaParede })),
    ...janelas.map((s) => ({ seg: paraCena(s), meia: meiaParede })),
    ...guardas.map((s) => ({ seg: paraCena(s), meia: 0.02 })),
  ];
}

export function colide(x, z, raio, obstaculos) {
  return obstaculos.some((o) => distanciaAoSegmento(x, z, o.seg) < raio + o.meia);
}

/**
 * Move de (x, z) por (dx, dz). Se bater, tenta cada eixo separado,
 * o que faz a pessoa "deslizar" encostada na parede em vez de travar.
 */
export function moverComColisao(x, z, dx, dz, raio, obstaculos) {
  if (!colide(x + dx, z + dz, raio, obstaculos)) return [x + dx, z + dz];
  let nx = x, nz = z;
  if (!colide(x + dx, z, raio, obstaculos)) nx = x + dx;
  if (!colide(nx, z + dz, raio, obstaculos)) nz = z + dz;
  return [nx, nz];
}

/** Ponto dentro de polígono (regra par-ímpar). */
export function pontoNoPoligono(x, y, pontos) {
  let dentro = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const [xi, yi] = pontos[i], [xj, yj] = pontos[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
