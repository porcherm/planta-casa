import { TIPOS_COMODO } from '../constants/tipos.js';

/**
 * Geometria da planta, sem nenhuma dependência de DOM ou three.js.
 * Um "segmento" é sempre [x1, y1, x2, y2] em centímetros.
 */

/** Caixa que envolve todos os cômodos (ou só os internos). */
export function limites(comodos, soInternos = false) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { tipo, bb } of comodos) {
    if (soInternos && TIPOS_COMODO[tipo].externo) continue;
    minX = Math.min(minX, bb.minX); minY = Math.min(minY, bb.minY);
    maxX = Math.max(maxX, bb.maxX); maxY = Math.max(maxY, bb.maxY);
  }
  if (!Number.isFinite(minX)) return limites(comodos, false);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Lados de um polígono como segmentos. */
function arestas(pontos) {
  return pontos.map((a, i) => {
    const b = pontos[(i + 1) % pontos.length];
    return [a[0], a[1], b[0], b[1]];
  });
}

/**
 * Agrupa segmentos horizontais/verticais pela linha em que estão.
 * Ex.: um segmento horizontal em y=100 vira { k: 'h|100', a: xMin, b: xMax }.
 * Segmentos inclinados retornam null.
 */
function chaveDaLinha(s) {
  if (s[1] === s[3]) return { k: `h|${s[1]}`, a: Math.min(s[0], s[2]), b: Math.max(s[0], s[2]) };
  if (s[0] === s[2]) return { k: `v|${s[0]}`, a: Math.min(s[1], s[3]), b: Math.max(s[1], s[3]) };
  return null;
}

/** Inverso de chaveDaLinha: volta de (linha, intervalo) para segmento. */
function segmentoDaChave(k, a, b) {
  const c = Number(k.slice(2));
  return k[0] === 'h' ? [a, c, b, c] : [c, a, c, b];
}

/** Une intervalos [a, b] que se sobrepõem. */
function unirIntervalos(lista) {
  const ordenados = [...lista].sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const [a, b] of ordenados) {
    const ultimo = out[out.length - 1];
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Remove dos intervalos os trechos cobertos pelos cortes. */
function subtrairIntervalos(intervalos, cortes) {
  let resto = intervalos.map((i) => i.slice());
  for (const [ca, cb] of cortes) {
    const proximo = [];
    for (const [a, b] of resto) {
      if (cb <= a || ca >= b) { proximo.push([a, b]); continue; }
      if (ca > a) proximo.push([a, ca]);
      if (cb < b) proximo.push([cb, b]);
    }
    resto = proximo;
  }
  return resto.filter(([a, b]) => b - a > 0.5);
}

const adicionar = (mapa, chave, valor) => (mapa[chave] = mapa[chave] || []).push(valor);

/**
 * Folha de uma porta de abrir, desenhada aberta a 90°.
 * h = dobradiça, e = outra ponta do vão, o = ponta da folha aberta, w = largura.
 * Retorna null para portas de correr, vãos ou portas sem lado definido.
 */
export function folhaDaPorta(p) {
  if (!p.lado || (p.tipo !== 'porta' && p.tipo !== 'entrada')) return null;
  const inicio = [p.x1, p.y1], fim = [p.x2, p.y2];
  const h = p.dobradica === 'fim' ? fim : inicio;
  const e = p.dobradica === 'fim' ? inicio : fim;
  const w = Math.hypot(e[0] - h[0], e[1] - h[1]);
  const o = p.y1 === p.y2 ? [h[0], h[1] + p.lado * w] : [h[0] + p.lado * w, h[1]];
  return { h, e, o, w };
}

/**
 * Gera os segmentos de parede (já com os vãos de portas/janelas recortados)
 * e os guarda-corpos das sacadas.
 *
 * @param {object} dados  dados normalizados do apartamento
 * @param {boolean} para3D  no 3D a janela em losango não recorta a parede
 *                          (ela é desenhada como uma peça própria)
 */
export function gerarParedes(dados, para3D = false) {
  const meiaParede = dados.parede / 2;
  const linhas = {};
  const paredes = [];
  const guardas = [];

  // 1) Contorno de cada cômodo interno, deslocado meia parede para fora
  for (const r of dados.comodos) {
    const tipo = TIPOS_COMODO[r.tipo];
    if (tipo.externo || tipo.semParede) continue;
    const { minX, minY, maxX, maxY } = r.bb;
    const contorno = r.reto
      ? [[minX - meiaParede, minY - meiaParede], [maxX + meiaParede, minY - meiaParede],
         [maxX + meiaParede, maxY + meiaParede], [minX - meiaParede, maxY + meiaParede]]
      : r.pontos;
    for (const s of arestas(contorno)) {
      const c = chaveDaLinha(s);
      if (c) adicionar(linhas, c.k, [c.a, c.b]);
      else paredes.push(s);
    }
  }
  for (const k in linhas) linhas[k] = unirIntervalos(linhas[k]);

  // 2) Recorta portas e janelas das paredes
  const aberturas = dados.portas.concat(dados.janelas.filter((j) => !(para3D && j.forma === 'losango')));
  const cortes = {};
  for (const p of aberturas) {
    const c = chaveDaLinha([p.x1, p.y1, p.x2, p.y2]);
    if (c) adicionar(cortes, c.k, [c.a, c.b]);
  }
  for (const k in linhas) {
    for (const [a, b] of subtrairIntervalos(linhas[k], cortes[k] || [])) paredes.push(segmentoDaChave(k, a, b));
  }

  // 3) Guarda-corpo das sacadas, exceto onde encostam numa parede
  for (const r of dados.comodos) {
    if (!TIPOS_COMODO[r.tipo].externo) continue;
    for (const s of arestas(r.pontos)) {
      const c = chaveDaLinha(s);
      if (!c) { guardas.push(s); continue; }
      // a sacada encosta na face de fora da parede: desconta a parede no eixo e a meia espessura para cada lado
      const orientacao = c.k[0], v = Number(c.k.slice(2));
      const encostadas = [v, v + meiaParede, v - meiaParede].flatMap((x) => linhas[`${orientacao}|${x}`] || []);
      for (const [a, b] of subtrairIntervalos([[c.a, c.b]], encostadas)) guardas.push(segmentoDaChave(c.k, a, b));
    }
  }

  return { paredes, guardas };
}
