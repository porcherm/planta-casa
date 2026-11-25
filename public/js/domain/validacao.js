/**
 * Problemas de desenho que os dados aceitam, mas que deixam a planta errada:
 * - "sobreposicao": dois cômodos ocupam o mesmo espaço;
 * - "sem-parede": dois cômodos internos vizinhos estão mais perto que a
 *   espessura da parede (a parede entre eles ficaria "dentro" de um cômodo).
 *
 * Recebe os dados já normalizados. Sem DOM: dá para testar com Node.
 */
import { TIPOS_COMODO } from '../constants/tipos.js';
import { pontoNoPoligono, distanciaAoSegmento } from './colisao.js';

const TOLERANCIA = 0.5; // cm

export function verificarSobreposicoes(dados) {
  const problemas = [];
  const { comodos } = dados;
  const parede = dados.parede || 0;

  for (let i = 0; i < comodos.length; i++) {
    for (let j = i + 1; j < comodos.length; j++) {
      const a = comodos[i], b = comodos[j];
      if (!caixasSeTocam(a.bb, b.bb)) continue;

      if (poligonosSeSobrepoem(a, b)) {
        problemas.push({ tipo: 'sobreposicao', ids: [a.id, b.id], mensagem: `${a.nome} e ${b.nome} se sobrepõem.` });
        continue;
      }

      const vizinhanca = folgaEntreRetangulos(a, b);
      if (!vizinhanca || parede <= 0 || vizinhanca.folga >= parede - TOLERANCIA || !precisamDeParede(a, b)) continue;
      if (passagemAberta(dados, vizinhanca)) continue;
      problemas.push({
        tipo: 'sem-parede',
        ids: [a.id, b.id],
        mensagem: `${a.nome} e ${b.nome} estão a ${Math.round(vizinhanca.folga)} cm; falta espaço para a parede de ${parede} cm.`,
      });
    }
  }
  return problemas;
}

/** Só cômodos internos com parede precisam do espaço entre eles. */
function precisamDeParede(a, b) {
  const temParede = (c) => !TIPOS_COMODO[c.tipo].externo && !TIPOS_COMODO[c.tipo].semParede;
  return temParede(a) && temParede(b);
}

/** Caixas que se encostam ou estão perto (filtro rápido antes das contas caras). */
function caixasSeTocam(p, q, margem = 50) {
  return p.minX < q.maxX + margem && q.minX < p.maxX + margem && p.minY < q.maxY + margem && q.minY < p.maxY + margem;
}

/**
 * Como dois retângulos se encaram: a folga entre eles, o trecho em comum
 * e os eixos das paredes de frente (onde ficariam portas e vãos).
 * Retorna null se não forem retângulos ou se não estiverem lado a lado.
 */
function folgaEntreRetangulos(a, b) {
  if (!a.reto || !b.reto) return null;
  const p = a.bb, q = b.bb;
  const comumX = [Math.max(p.minX, q.minX), Math.min(p.maxX, q.maxX)];
  const comumY = [Math.max(p.minY, q.minY), Math.min(p.maxY, q.maxY)];

  // Um ao lado do outro (paredes verticais de frente)
  if (comumY[1] - comumY[0] > TOLERANCIA) {
    const [esq, dir] = p.maxX <= q.minX + TOLERANCIA ? [p, q] : [q, p];
    const folga = dir.minX - esq.maxX;
    if (folga >= -TOLERANCIA) return { folga: Math.max(0, folga), horizontal: false, trecho: comumY, faces: [esq.maxX, dir.minX] };
  }
  // Um em cima do outro (paredes horizontais de frente)
  if (comumX[1] - comumX[0] > TOLERANCIA) {
    const [cima, baixo] = p.maxY <= q.minY + TOLERANCIA ? [p, q] : [q, p];
    const folga = baixo.minY - cima.maxY;
    if (folga >= -TOLERANCIA) return { folga: Math.max(0, folga), horizontal: true, trecho: comumX, faces: [cima.maxY, baixo.minY] };
  }
  return null;
}

/**
 * A passagem entre os dois está toda aberta (um vão ou uma porta cobrindo o
 * trecho em comum, no eixo da parede de um deles)? Então não há parede ali,
 * e a folga menor que a parede é proposital.
 */
function passagemAberta(dados, { horizontal, trecho, faces }) {
  const meia = (dados.parede || 0) / 2;
  const eixos = [faces[0] + meia, faces[1] - meia];
  return dados.portas.some((o) => {
    const naLinha = horizontal
      ? o.y1 === o.y2 && eixos.some((e) => Math.abs(o.y1 - e) < TOLERANCIA)
      : o.x1 === o.x2 && eixos.some((e) => Math.abs(o.x1 - e) < TOLERANCIA);
    if (!naLinha) return false;
    const [ini, fim] = horizontal ? [Math.min(o.x1, o.x2), Math.max(o.x1, o.x2)] : [Math.min(o.y1, o.y2), Math.max(o.y1, o.y2)];
    return ini <= trecho[0] + TOLERANCIA && fim >= trecho[1] - TOLERANCIA;
  });
}

/* ---------- Sobreposição de polígonos (inclusive formas em L) ---------- */

/**
 * Dois polígonos simples se sobrepõem (com área) se algum lado de um atravessa
 * um lado do outro, ou, quando não há cruzamento, se algum canto de um
 * (empurrado um pouco para dentro dele) cai dentro do outro. Os cantos da
 * região sobreposta são sempre cantos de um dos dois, então isso cobre faixas
 * finas, um cômodo dentro do outro e cômodos idênticos.
 */
function poligonosSeSobrepoem(a, b) {
  const pa = a.pontos, pb = b.pontos;
  for (const s of lados(pa)) for (const t of lados(pb)) if (seCruzam(s, t)) return true;
  return cantosPorDentro(pa).some((p) => dentroEstrito(p, pb))
    || cantosPorDentro(pb).some((p) => dentroEstrito(p, pa));
}

/** Cada canto deslocado 2 cm para dentro do próprio polígono (pela bissetriz). */
function cantosPorDentro(pontos, passo = 2) {
  const n = pontos.length;
  return pontos.map((v, i) => {
    const ant = pontos[(i - 1 + n) % n], prox = pontos[(i + 1) % n];
    const u1 = unitario(ant[0] - v[0], ant[1] - v[1]);
    const u2 = unitario(prox[0] - v[0], prox[1] - v[1]);
    let [bx, by] = unitario(u1[0] + u2[0], u1[1] + u2[1]);
    if (!bx && !by) [bx, by] = [-u1[1], u1[0]]; // lados alinhados: usa a perpendicular
    const candidato = [v[0] + bx * passo, v[1] + by * passo];
    // Em cantos "para dentro" (formas em L) a bissetriz aponta para fora: inverte
    return pontoNoPoligono(candidato[0], candidato[1], pontos) ? candidato : [v[0] - bx * passo, v[1] - by * passo];
  });
}

function unitario(x, y) {
  const n = Math.hypot(x, y);
  return n ? [x / n, y / n] : [0, 0];
}

const lados = (p) => p.map((q, i) => [q, p[(i + 1) % p.length]]);

/** Orientação do trio (positivo, negativo ou ~zero). */
function orientacao([ax, ay], [bx, by], [cx, cy]) {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return Math.abs(v) < 1e-6 ? 0 : Math.sign(v);
}

/** Cruzamento "de verdade": lados que só se encostam ou são colineares não contam. */
function seCruzam([a, b], [c, d]) {
  const o1 = orientacao(a, b, c), o2 = orientacao(a, b, d);
  const o3 = orientacao(c, d, a), o4 = orientacao(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Dentro do polígono e não em cima da borda. */
function dentroEstrito([x, y], pontos) {
  if (!pontoNoPoligono(x, y, pontos)) return false;
  return lados(pontos).every(([p, q]) => distanciaAoSegmento(x, y, [p[0], p[1], q[0], q[1]]) > TOLERANCIA);
}
