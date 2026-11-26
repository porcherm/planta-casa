/**
 * Corte (seção vertical) da casa, gerado a partir dos dados.
 *
 * Uma linha reta atravessa a planta: horizontal (y = posição) ou vertical
 * (x = posição). O corte mostra o que essa linha "fatia" em todos os andares:
 * lajes, paredes (com portas e janelas), degraus, guarda-corpos, os nomes dos
 * cômodos, o terreno e o telhado, além dos níveis de cada andar.
 *
 * Tudo sai em duas coordenadas, em cm: `u` ao longo da linha do corte (x no
 * corte horizontal, y no vertical) e `z`, a altura em relação à rua.
 * Sem DOM: dá para testar com Node.
 */
import { TIPOS_COMODO } from '../constants/tipos.js';
import { gerarParedes, limites } from './geometria.js';
import { aberturasDaLaje } from './andares.js';
import { alturaDoTerreno } from './terreno.js';
import { geometriaDoTelhado } from './telhado.js';

const ESPESSURA_CONTRAPISO = 10; // laje do andar mais baixo, sobre o chão
const ESPESSURA_FORRO = 12;      // laje de cobertura do último andar

/**
 * Trechos [a, b] (em u) em que a linha corta o interior de um polígono.
 * `horizontal` = linha y = c (u = x); senão, linha x = c (u = y).
 */
export function trechosNaLinha(pontos, c, horizontal) {
  const cc = c + 0.013; // evita passar exatamente por um vértice
  const cortes = [];
  pontos.forEach((p, i) => {
    const q = pontos[(i + 1) % pontos.length];
    const [pv, qv, pu, qu] = horizontal ? [p[1], q[1], p[0], q[0]] : [p[0], q[0], p[1], q[1]];
    if ((pv > cc) !== (qv > cc)) cortes.push(pu + (cc - pv) * (qu - pu) / (qv - pv));
  });
  cortes.sort((m, n) => m - n);
  const trechos = [];
  for (let i = 0; i + 1 < cortes.length; i += 2) if (cortes[i + 1] - cortes[i] > 0.5) trechos.push([cortes[i], cortes[i + 1]]);
  return trechos;
}

/** União de trechos que se encostam ou se sobrepõem. */
function unir(trechos) {
  const ordenados = [...trechos].sort((m, n) => m[0] - n[0]);
  const out = [];
  for (const [a, b] of ordenados) {
    const ultimo = out[out.length - 1];
    if (ultimo && a <= ultimo[1] + 0.5) ultimo[1] = Math.max(ultimo[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Trechos menos os cortes. */
function subtrair(trechos, cortes) {
  let resto = trechos.map((t) => t.slice());
  for (const [ca, cb] of cortes) {
    resto = resto.flatMap(([a, b]) => {
      if (cb <= a || ca >= b) return [[a, b]];
      return [[a, ca], [cb, b]].filter(([x, y]) => y - x > 0.5);
    });
  }
  return resto;
}

/**
 * Gera o corte. `opcoes` = { direcao: 'horizontal' | 'vertical', posicao (cm) }.
 * Retorna listas de peças prontas para desenhar (ver o fim da função).
 */
export function gerarCorte(casa, { direcao = 'horizontal', posicao }) {
  const horizontal = direcao === 'horizontal';
  const c = posicao;
  const T = limites(casa.comodos, false);
  const L = limites(casa.comodos, true);
  const parede = casa.parede || 0;
  const meia = parede / 2;

  const lajes = [], paredes = [], vergas = [], vidros = [], guardas = [], degraus = [], rotulos = [], niveis = [];

  casa.andares.forEach((andar, i) => {
    const base = andar.cota, topo = andar.cota + andar.peDireito;
    const nome = andar.nome;

    // Laje embaixo do andar: onde a linha passa por cômodos, menos escadas e vazios
    const piso = unir(andar.comodos.flatMap((r) => trechosNaLinha(r.pontos, c, horizontal)));
    const buracos = aberturasDaLaje(casa, andar.id).flatMap((p) => trechosNaLinha(p, c, horizontal));
    const espessura = i === 0 ? ESPESSURA_CONTRAPISO : andar.laje;
    for (const [a, b] of subtrair(piso, buracos)) lajes.push({ a, b, z0: base - espessura, z1: base, andar: andar.id });

    // Laje de cobertura no último andar (o telhado em laje já desenha a dele)
    if (i === casa.andares.length - 1 && casa.telhado?.tipo !== 'laje') {
      const internos = unir(andar.comodos.filter((r) => !TIPOS_COMODO[r.tipo].externo).flatMap((r) => trechosNaLinha(r.pontos, c, horizontal)));
      for (const [a, b] of internos) lajes.push({ a: a - meia, b: b + meia, z0: topo, z1: topo + ESPESSURA_FORRO, andar: andar.id });
    }

    // Paredes que a linha atravessa (as do mesmo sentido da linha só se ela passa dentro delas)
    const { paredes: segs, guardas: segsGuarda } = gerarParedes(andar);
    const atravessa = (s) => {
      const [x1, y1, x2, y2] = s;
      const [v1, v2, u1, u2] = horizontal ? [y1, y2, x1, x2] : [x1, x2, y1, y2];
      if (Math.abs(v1 - v2) < 1e-6) {
        // paralela à linha: só conta se a linha passa dentro da espessura da parede
        return Math.abs(v1 - c) < meia ? [Math.min(u1, u2), Math.max(u1, u2)] : null;
      }
      if ((c - v1) * (c - v2) > 0) return null;
      const u = u1 + (c - v1) * (u2 - u1) / (v2 - v1);
      return [u - meia, u + meia];
    };
    for (const s of segs) {
      const t = atravessa(s);
      if (t) paredes.push({ a: t[0], b: t[1], z0: base, z1: topo, andar: andar.id });
    }
    for (const s of segsGuarda) {
      const t = atravessa(s);
      if (t) guardas.push({ a: (t[0] + t[1]) / 2 - 2, b: (t[0] + t[1]) / 2 + 2, z0: base, z1: base + 105, andar: andar.id });
    }
    // Guarda-corpo em volta dos vazios e dos buracos de escada deste andar
    const bordasComGuarda = [
      ...(andar.vazios || []).flatMap((v) => v.pontos.map((p, k) => [...p, ...v.pontos[(k + 1) % v.pontos.length]])),
      ...(casa.escadas || []).filter((e) => e.para === andar.id).flatMap((e) => e.geo.bordas.filter((b) => !b.abertaEmCima && !b.interna).map((b) => b.seg)),
    ];
    for (const s of bordasComGuarda) {
      const t = atravessa(s);
      if (!t || t[1] - t[0] > parede + 1) continue; // paralela à linha: não aparece cortada
      guardas.push({ a: (t[0] + t[1]) / 2 - 2, b: (t[0] + t[1]) / 2 + 2, z0: base, z1: base + 100, andar: andar.id });
    }

    // Portas e janelas que a linha atravessa: verga em cima, peitoril embaixo, vidro no meio
    const naLinha = (o) => atravessa([o.x1, o.y1, o.x2, o.y2]);
    for (const p of andar.portas) {
      const t = naLinha(p);
      if (!t || p.tipo === 'vao') continue;
      if (andar.peDireito - andar.alturaPorta > 2) vergas.push({ a: t[0], b: t[1], z0: base + andar.alturaPorta, z1: topo, andar: andar.id });
    }
    for (const j of andar.janelas) {
      const t = naLinha(j);
      if (!t) continue;
      if (j.peitoril > 0) vergas.push({ a: t[0], b: t[1], z0: base, z1: base + j.peitoril, andar: andar.id });
      const alto = Math.min(j.topo, andar.peDireito);
      if (andar.peDireito - alto > 2) vergas.push({ a: t[0], b: t[1], z0: base + alto, z1: topo, andar: andar.id });
      vidros.push({ u: (t[0] + t[1]) / 2, z0: base + j.peitoril, z1: base + alto, andar: andar.id });
    }

    // Nome de cada cômodo cortado, no meio da altura
    for (const r of andar.comodos) {
      for (const [a, b] of trechosNaLinha(r.pontos, c, horizontal)) {
        if (b - a < 60) continue;
        rotulos.push({ u: (a + b) / 2, z: base + Math.min(andar.peDireito, 250) / 2, texto: r.nome, andar: andar.id });
      }
    }

    niveis.push({ z: base, nome, peDireito: andar.peDireito, andar: andar.id });
  });

  // Degraus: maciços do piso de baixo até o topo de cada um (na caracol, placas finas)
  for (const e of casa.escadas || []) {
    const de = casa.andares.find((a) => a.id === e.de);
    if (!de) continue;
    for (const d of e.geo.degraus) {
      for (const [a, b] of trechosNaLinha(d.pontos, c, horizontal)) {
        const topo = de.cota + d.altura;
        degraus.push({ a, b, z0: e.tipo === 'caracol' ? topo - 5 : de.cota, z1: topo, escada: e.id });
      }
    }
  }

  // Terreno: perfil ao longo da linha, só fora da casa (dentro, quem manda é o subsolo)
  const [uMin, uMax] = horizontal ? [T.minX, T.maxX] : [T.minY, T.maxY];
  const margem = 300;
  const casaNaLinha = unir(casa.andares[0].comodos.flatMap((r) => trechosNaLinha(r.pontos, c, horizontal)))
    .map(([a, b]) => [a - meia, b + meia]);
  const foraDaCasa = subtrair([[uMin - margem, uMax + margem]], casaNaLinha);
  const alturaEm = (u) => alturaDoTerreno(casa.terreno, L, horizontal ? u : c, horizontal ? c : u);
  const terreno = foraDaCasa.map(([a, b]) => {
    const n = Math.max(2, Math.ceil((b - a) / 25));
    return Array.from({ length: n + 1 }, (_, k) => { const u = a + (b - a) * k / n; return [u, alturaEm(u)]; });
  });

  // Telhado: cada pano/oitão cortado pela linha vira um segmento; laje e platibanda, retângulos
  const telhado = [], cobertura = [];
  const g = geometriaDoTelhado(casa);
  if (g) {
    for (const face of g.faces) {
      const pts = [];
      face.pontos.forEach((p, k) => {
        const q = face.pontos[(k + 1) % face.pontos.length];
        const [pv, qv] = horizontal ? [p[1], q[1]] : [p[0], q[0]];
        if ((pv - c) * (qv - c) > 0 || pv === qv) return;
        const t = (c - pv) / (qv - pv);
        const pu = horizontal ? p[0] : p[1], qu = horizontal ? q[0] : q[1];
        pts.push([pu + t * (qu - pu), p[2] + t * (q[2] - p[2])]);
      });
      if (pts.length >= 2) telhado.push({ tipo: face.tipo, pontos: pts.slice(0, 2) });
    }
    for (const cx of g.caixas) {
      const [v0, v1, a, b] = horizontal ? [cx.y0, cx.y1, cx.x0, cx.x1] : [cx.x0, cx.x1, cx.y0, cx.y1];
      if (c >= v0 && c <= v1) cobertura.push({ a, b, z0: cx.z0, z1: cx.z1 });
    }
  }

  // Limites do desenho
  const zs = [
    ...casa.andares.map((a) => a.cota - (a.laje || ESPESSURA_CONTRAPISO)),
    ...casa.andares.map((a) => a.cota + a.peDireito + ESPESSURA_FORRO),
    ...telhado.flatMap((t) => t.pontos.map((p) => p[1])), ...cobertura.map((r) => r.z1),
    ...terreno.flat().map((p) => p[1]),
  ];
  return {
    direcao, posicao: c,
    lajes, paredes, vergas, vidros, guardas, degraus, rotulos, niveis, terreno, telhado, cobertura,
    limites: { uMin: uMin - margem, uMax: uMax + margem, zMin: Math.min(...zs) - 60, zMax: Math.max(...zs) + 40 },
  };
}

/** Faixa em que a linha do corte pode andar (cm), para o controle deslizante. */
export function faixaDoCorte(casa, direcao) {
  const T = limites(casa.comodos, false);
  return direcao === 'horizontal' ? [Math.ceil(T.minY), Math.floor(T.maxY)] : [Math.ceil(T.minX), Math.floor(T.maxX)];
}

/** Posição inicial: pelo meio da primeira escada (o corte mais informativo), ou pelo meio da casa. */
export function posicaoInicialDoCorte(casa, direcao) {
  const e = (casa.escadas || [])[0];
  if (e) {
    const xs = e.geo.contorno.map((p) => p[0]), ys = e.geo.contorno.map((p) => p[1]);
    const meio = direcao === 'horizontal' ? (Math.min(...ys) + Math.max(...ys)) / 2 : (Math.min(...xs) + Math.max(...xs)) / 2;
    return Math.round(meio);
  }
  const [a, b] = faixaDoCorte(casa, direcao);
  return Math.round((a + b) / 2);
}
