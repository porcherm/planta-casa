/**
 * Telhado (cobertura) sobre o andar mais alto.
 *
 * - 'nenhum' (padrão): sem telhado no 3D;
 * - 'laje': laje plana com platibanda (mureta) em volta;
 * - 'duas-aguas': dois panos inclinados, cumeeira no sentido do lado maior,
 *   e os oitões (triângulos de parede) nas pontas;
 * - 'quatro-aguas': quatro panos (dois trapézios e dois triângulos).
 *
 * O telhado cobre o retângulo dos cômodos internos do último andar, mais o
 * beiral. Formas em L ficam cobertas pelo retângulo inteiro (simplificação).
 * Sem DOM: dá para testar com Node.
 */
import { limites } from './geometria.js';

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);

export const TIPOS_TELHADO = {
  nenhum: 'Sem telhado',
  laje: 'Laje plana com platibanda',
  'duas-aguas': 'Duas águas',
  'quatro-aguas': 'Quatro águas',
};

export const TELHADO = { inclinacao: 30, beiral: 50, espessuraLaje: 15, platibanda: 80 };

export function normalizarTelhado(t) {
  if (!t || typeof t !== 'object') return { tipo: 'nenhum', inclinacao: TELHADO.inclinacao, beiral: TELHADO.beiral };
  return {
    tipo: TIPOS_TELHADO[t.tipo] ? t.tipo : 'nenhum',
    // Inclinação em %, como se fala em obra (30% = sobe 30 cm a cada 1 m)
    inclinacao: ehNumero(t.inclinacao) ? Math.min(100, Math.max(5, t.inclinacao)) : TELHADO.inclinacao,
    beiral: ehNumero(t.beiral) ? Math.min(150, Math.max(0, t.beiral)) : TELHADO.beiral,
  };
}

/**
 * Geometria do telhado em cm (x, y da planta; z = altura em relação à rua).
 * Retorna null sem telhado, ou:
 * - faces: [{ pontos: [[x, y, z], …], tipo: 'pano' | 'oitao' }] (polígonos planos);
 * - caixas: [{ x0, y0, x1, y1, z0, z1 }] (laje e platibanda).
 */
export function geometriaDoTelhado(casa) {
  const t = casa.telhado;
  if (!t || t.tipo === 'nenhum') return null;
  const topo = casa.andares[casa.andares.length - 1];
  const L = limites(topo.comodos, true);
  const meia = (casa.parede || 0) / 2;
  // Retângulo das paredes externas e o do beiral
  const p = { x0: L.minX - meia, y0: L.minY - meia, x1: L.maxX + meia, y1: L.maxY + meia };
  const z0 = topo.cota + topo.peDireito; // topo das paredes

  if (t.tipo === 'laje') {
    const e = TELHADO.espessuraLaje, alt = TELHADO.platibanda, esp = Math.max(casa.parede || 12, 10);
    const zl = z0 + e;
    return {
      faces: [],
      caixas: [
        { ...p, z0, z1: zl },
        { x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y0 + esp, z0: zl, z1: zl + alt },
        { x0: p.x0, y0: p.y1 - esp, x1: p.x1, y1: p.y1, z0: zl, z1: zl + alt },
        { x0: p.x0, y0: p.y0, x1: p.x0 + esp, y1: p.y1, z0: zl, z1: zl + alt },
        { x0: p.x1 - esp, y0: p.y0, x1: p.x1, y1: p.y1, z0: zl, z1: zl + alt },
      ],
    };
  }

  const b = t.beiral, k = t.inclinacao / 100;
  const B = { x0: p.x0 - b, y0: p.y0 - b, x1: p.x1 + b, y1: p.y1 + b };
  const ze = z0 - b * k; // o beiral desce um pouco abaixo do topo da parede
  const W = B.x1 - B.x0, D = B.y1 - B.y0;
  const aoLongoDeX = W >= D; // cumeeira no sentido do lado maior
  const meioVao = (aoLongoDeX ? D : W) / 2;
  const zc = ze + meioVao * k; // altura da cumeeira

  // Monta no sentido x e gira quando a cumeeira for no sentido y
  const P = (a, c, z) => (aoLongoDeX ? [a, c, z] : [c, a, z]);
  const [a0, a1, c0, c1] = aoLongoDeX ? [B.x0, B.x1, B.y0, B.y1] : [B.y0, B.y1, B.x0, B.x1];
  const cm = (c0 + c1) / 2;

  if (t.tipo === 'duas-aguas') {
    // Oitões no plano das paredes das pontas: triângulo do topo da parede até a cumeeira
    // (na linha da parede, o pano passa exatamente na altura do topo dela)
    const [w0, w1] = aoLongoDeX ? [p.x0, p.x1] : [p.y0, p.y1];
    const [d0, d1] = aoLongoDeX ? [p.y0, p.y1] : [p.x0, p.x1];
    const oitao = (w) => [P(w, d0, z0), P(w, d1, z0), P(w, cm, zc)];
    return {
      faces: [
        { tipo: 'pano', pontos: [P(a0, c0, ze), P(a1, c0, ze), P(a1, cm, zc), P(a0, cm, zc)] },
        { tipo: 'pano', pontos: [P(a0, c1, ze), P(a0, cm, zc), P(a1, cm, zc), P(a1, c1, ze)] },
        { tipo: 'oitao', pontos: oitao(w0) },
        { tipo: 'oitao', pontos: oitao(w1) },
      ],
      caixas: [],
    };
  }

  // Quatro águas: cumeeira menor que o lado maior, recuada meio vão em cada ponta
  const r0 = a0 + meioVao, r1 = a1 - meioVao;
  return {
    faces: [
      { tipo: 'pano', pontos: [P(a0, c0, ze), P(a1, c0, ze), P(r1, cm, zc), P(r0, cm, zc)] },
      { tipo: 'pano', pontos: [P(a1, c1, ze), P(a0, c1, ze), P(r0, cm, zc), P(r1, cm, zc)] },
      { tipo: 'pano', pontos: [P(a0, c1, ze), P(a0, c0, ze), P(r0, cm, zc)] },
      { tipo: 'pano', pontos: [P(a1, c0, ze), P(a1, c1, ze), P(r1, cm, zc)] },
    ],
    caixas: [],
  };
}

/** Altura mais alta do telhado (cm), para enquadrar a câmera; null sem telhado. */
export function alturaMaximaDoTelhado(casa) {
  const g = geometriaDoTelhado(casa);
  if (!g) return null;
  const zs = [...g.faces.flatMap((f) => f.pontos.map((q) => q[2])), ...g.caixas.map((c) => c.z1)];
  return Math.max(...zs);
}
