/**
 * Escadas: ligam um andar ("de") ao andar logo acima ("para").
 *
 * Uma escada ocupa um retângulo na planta (x, y, largura, comprimento) e sobe
 * num sentido (`sobe`: norte, sul, leste ou oeste). A partir disso e da
 * diferença de altura entre os andares, este módulo calcula tudo o que as
 * outras partes usam, sem DOM nem three.js:
 * - os degraus (polígonos, cada um com a altura do seu topo);
 * - o contorno (também é o buraco na laje do andar de cima);
 * - a linha do caminho (setas na planta e a subida no Caminhar);
 * - as bordas do contorno: por onde se entra embaixo, por onde se sai em cima
 *   e quais ficam fechadas (parede ou guarda-corpo).
 *
 * Tipos:
 * - reta: um lance só;
 * - L: dois lances a 90° com um patamar quadrado no canto;
 * - U: dois lances lado a lado, em sentidos opostos, com um patamar no fundo;
 * - caracol: degraus em leque em volta de um poste central.
 *
 * Os cálculos usam um quadro local: `v` cresce no sentido da subida e `u` para a
 * direita de quem sobe. `giro: 'esquerda'` espelha o desenho (vira para a esquerda).
 */
import { TIPOS_ESCADA, DIRECOES_ESCADA, ESCADA } from '../constants/tipos.js';

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);

/* ---------- Normalização ---------- */

/**
 * Valida e completa as escadas. `andares` já normalizados (com cota e ordem).
 * `falhar(mensagem)` interrompe a normalização com uma mensagem amigável.
 */
export function normalizarEscadas(lista, andares, falhar) {
  if (lista === undefined) return [];
  if (!Array.isArray(lista)) falhar('"escadas" precisa ser uma lista.');
  const ids = new Set();
  return lista.map((e, i) => {
    const n = i + 1;
    if (!e || typeof e !== 'object') falhar(`A escada ${n} precisa ser um objeto { de, para, x, y, largura, comprimento }.`);
    const nome = typeof e.nome === 'string' && e.nome.trim() ? e.nome.trim() : `Escada ${n}`;
    const de = andares.find((a) => a.id === e.de);
    const para = andares.find((a) => a.id === e.para);
    if (!de) falhar(`"${nome}": "de" precisa ser o id de um andar (o andar onde a escada começa).`);
    if (!para) falhar(`"${nome}": "para" precisa ser o id de um andar (o andar onde a escada chega).`);
    if (para.ordem !== de.ordem + 1) falhar(`"${nome}": a escada liga um andar ao andar logo acima ("de" embaixo, "para" em cima).`);
    for (const campo of ['x', 'y', 'largura', 'comprimento']) {
      if (!ehNumero(e[campo])) falhar(`"${nome}": o campo "${campo}" precisa ser um número em centímetros.`);
    }
    if (e.largura <= 0 || e.comprimento <= 0) falhar(`"${nome}": largura e comprimento precisam ser maiores que zero.`);
    const desnivel = para.cota - de.cota;
    if (desnivel <= 0) falhar(`"${nome}": o andar "${para.nome}" precisa ficar acima do "${de.nome}".`);

    let id = String(e.id || `escada-${n}`).replace(/[^a-zA-Z0-9_-]/g, '-');
    while (ids.has(id)) id += `-${n}`;
    ids.add(id);

    const base = {
      id, nome,
      tipo: TIPOS_ESCADA[e.tipo] ? e.tipo : 'reta',
      de: de.id, para: para.id,
      x: e.x, y: e.y, largura: e.largura, comprimento: e.comprimento,
      sobe: DIRECOES_ESCADA[e.sobe] ? e.sobe : 'norte',
      giro: e.giro === 'esquerda' ? 'esquerda' : 'direita',
      lance: ehNumero(e.lance) && e.lance > 0 ? e.lance : ESCADA.lance,
      volta: ehNumero(e.volta) ? Math.min(720, Math.max(90, e.volta)) : ESCADA.volta,
      desnivel,
    };
    return { ...base, geo: geometriaDaEscada(base) };
  });
}

/* ---------- Quadro local ---------- */

/**
 * W = medida lateral (u), D = medida no sentido da subida (v), `o` = canto de
 * partida (atrás e à esquerda de quem sobe), U e V = direções na planta.
 */
export function quadroDaEscada({ x, y, largura: L, comprimento: C, sobe }) {
  switch (sobe) {
    case 'sul': return { W: L, D: C, o: [x + L, y], U: [-1, 0], V: [0, 1] };
    case 'leste': return { W: C, D: L, o: [x, y], U: [0, 1], V: [1, 0] };
    case 'oeste': return { W: C, D: L, o: [x + L, y + C], U: [0, -1], V: [-1, 0] };
    default: return { W: L, D: C, o: [x, y + C], U: [1, 0], V: [0, -1] }; // norte
  }
}

/** Ponto da planta para (u, v) local; com giro à esquerda, u é espelhado. */
function conversor(e) {
  const q = quadroDaEscada(e);
  const espelhar = e.giro === 'esquerda';
  const P = (u, v) => {
    const uu = espelhar ? q.W - u : u;
    return [q.o[0] + uu * q.U[0] + v * q.V[0], q.o[1] + uu * q.U[1] + v * q.V[1]];
  };
  return { ...q, P };
}

const retangulo = (P, u0, v0, u1, v1) => [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];

/** Bordas de um polígono, marcadas: entrada (embaixo), chegada (em cima) ou fechada. */
function bordasDoContorno(contorno, marcar) {
  return contorno.map((a, i) => {
    const b = contorno[(i + 1) % contorno.length];
    const { embaixo = false, emCima = false } = marcar(a, b, i) || {};
    return { seg: [a[0], a[1], b[0], b[1]], abertaEmbaixo: embaixo, abertaEmCima: emCima };
  });
}

/** Divide `restantes` degraus entre dois lances, proporcional ao comprimento de cada um. */
function dividir(restantes, L1, L2) {
  if (restantes <= 1) return [Math.max(restantes, 0), 0];
  const k1 = Math.min(restantes - 1, Math.max(1, Math.round(restantes * L1 / (L1 + L2))));
  return [k1, restantes - k1];
}

/* ---------- Geometria ---------- */

/**
 * Degraus, contorno, caminho e bordas de uma escada (dados já completos, com `desnivel`).
 * Retorna também: espelhos (quantos degraus sobem), espelho e piso (cm), lance,
 * comprimentoCaminho (cm) e, na caracol, centro, raio e raio do caminho.
 */
export function geometriaDaEscada(e) {
  const espelhos = Math.max(2, Math.round(e.desnivel / ESCADA.espelhoIdeal));
  const espelho = e.desnivel / espelhos;
  const pisos = espelhos - 1; // o último degrau é o piso do andar de cima
  const c = conversor(e);
  const { W, D, P } = c;
  const geo = { espelhos, espelho, desnivel: e.desnivel };

  if (e.tipo === 'caracol') return Object.assign(geo, geometriaCaracol(e, c, pisos, espelho));

  const degraus = [];
  const degrau = (pts, i) => degraus.push({ pontos: pts, altura: i * espelho, indice: i });

  if (e.tipo === 'reta') {
    const p = D / pisos;
    for (let i = 1; i <= pisos; i++) degrau(retangulo(P, 0, (i - 1) * p, W, i * p), i);
    const contorno = retangulo(P, 0, 0, W, D);
    return Object.assign(geo, {
      lance: W, piso: p, degraus, contorno,
      caminho: [P(W / 2, 0), P(W / 2, D)],
      // bordas: 0 = partida (v=0), 2 = chegada (v=D)
      bordas: bordasDoContorno(contorno, (_, __, i) => (i === 0 ? { embaixo: true } : i === 2 ? { emCima: true } : null)),
    });
  }

  if (e.tipo === 'L') {
    const l = Math.min(e.lance, W, D);
    const L1 = Math.max(D - l, 1), L2 = Math.max(W - l, 1);
    const [k1, k2] = dividir(pisos - 1, L1, L2);
    const p1 = L1 / Math.max(k1, 1), p2 = L2 / Math.max(k2, 1);
    for (let i = 1; i <= k1; i++) degrau(retangulo(P, 0, (i - 1) * p1, l, i * p1), i);
    degrau(retangulo(P, 0, D - l, l, D), k1 + 1); // patamar
    for (let j = 1; j <= k2; j++) degrau(retangulo(P, l + (j - 1) * p2, D - l, l + j * p2, D), k1 + 1 + j);
    const contorno = [P(0, 0), P(l, 0), P(l, D - l), P(W, D - l), P(W, D), P(0, D)];
    return Object.assign(geo, {
      lance: l, piso: Math.min(p1, p2), degraus, contorno,
      caminho: [P(l / 2, 0), P(l / 2, D - l / 2), P(W, D - l / 2)],
      bordas: bordasDoContorno(contorno, (_, __, i) => (i === 0 ? { embaixo: true } : i === 3 ? { emCima: true } : null)),
    });
  }

  // U: dois lances lado a lado; entre eles pode haver um vão ("poço")
  const l = Math.min(e.lance, W / 2, D);
  const L = Math.max(D - l, 1);
  const [k1, k2] = dividir(pisos - 1, L, L);
  const p1 = L / Math.max(k1, 1), p2 = L / Math.max(k2, 1);
  for (let i = 1; i <= k1; i++) degrau(retangulo(P, 0, (i - 1) * p1, l, i * p1), i);
  degrau(retangulo(P, 0, D - l, W, D), k1 + 1); // patamar no fundo, na largura toda
  for (let j = 1; j <= k2; j++) degrau(retangulo(P, W - l, L - (j - 1) * p2, W, L - j * p2), k1 + 1 + j);
  const poco = W - 2 * l > 0.5;
  const contorno = poco
    ? [P(0, 0), P(l, 0), P(l, D - l), P(W - l, D - l), P(W - l, 0), P(W, 0), P(W, D), P(0, D)]
    : retangulo(P, 0, 0, W, D);
  const chegada = poco ? 4 : null;
  return Object.assign(geo, {
    lance: l, piso: Math.min(p1, p2), degraus, contorno,
    caminho: [P(l / 2, 0), P(l / 2, D - l / 2), P(W - l / 2, D - l / 2), P(W - l / 2, 0)],
    bordas: poco
      ? bordasDoContorno(contorno, (_, __, i) => (i === 0 ? { embaixo: true } : i === chegada ? { emCima: true } : null))
      // Sem poço, entrada e chegada ficam na mesma borda (v = 0), uma em cada metade
      : bordasSemPoco(contorno, P, W, l, D),
  });
}

/**
 * U sem poço: a borda de partida (v = 0) é dividida em entrada (esquerda) e
 * chegada (direita), e entre os dois lances entra uma divisória (`interna`):
 * sem ela, daria para passar de lado do começo de um lance para o fim do outro.
 * A divisória só conta como obstáculo; não vira guarda-corpo no desenho.
 */
function bordasSemPoco(contorno, P, W, l, D) {
  const bordas = bordasDoContorno(contorno, () => null).slice(1);
  const [a, b] = [P(0, 0), P(W - l, 0)];
  const [c, d] = [P(W - l, 0), P(W, 0)];
  const [m0, m1] = [P(W - l, 0), P(W - l, D - l)];
  return [
    { seg: [a[0], a[1], b[0], b[1]], abertaEmbaixo: true, abertaEmCima: false },
    { seg: [c[0], c[1], d[0], d[1]], abertaEmbaixo: false, abertaEmCima: true },
    { seg: [m0[0], m0[1], m1[0], m1[1]], abertaEmbaixo: false, abertaEmCima: false, interna: true },
    ...bordas,
  ];
}

/** Caracol: degraus em leque, poste no meio; o caminho é um arco a 60% do raio. */
function geometriaCaracol(e, { W, D, P }, pisos, espelho) {
  const R = Math.min(W, D) / 2;
  const r0 = Math.min(ESCADA.raioPoste, R / 4);
  const rc = R * 0.6;
  const graus = e.volta;
  const passo = graus / pisos;
  // θ = 0 aponta para a partida (v = 0); cresce girando para a direita de quem sobe
  const ponto = (theta, r) => {
    const t = theta * Math.PI / 180;
    return P(W / 2 + r * Math.sin(t), D / 2 - r * Math.cos(t));
  };
  const arco = (t0, t1, r) => {
    const n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / 6));
    return Array.from({ length: n + 1 }, (_, k) => ponto(t0 + (t1 - t0) * k / n, r));
  };
  const degraus = [];
  for (let i = 1; i <= pisos; i++) {
    const t0 = (i - 1) * passo, t1 = i * passo;
    degraus.push({ pontos: [...arco(t0, t1, R), ...arco(t1, t0, r0)], altura: i * espelho, indice: i });
  }
  // Contorno: círculo de 36 lados; bordas de entrada/chegada são as do primeiro/último degrau
  const lados = 36;
  const contorno = Array.from({ length: lados }, (_, k) => ponto(k * 360 / lados, R));
  const dentroDe = (meio, t0, t1) => {
    const m = ((meio % 360) + 360) % 360, a = ((t0 % 360) + 360) % 360;
    const largura = t1 - t0;
    return ((m - a + 360) % 360) <= largura;
  };
  const bordas = contorno.map((a, k) => {
    const b = contorno[(k + 1) % lados];
    const meio = (k + 0.5) * 360 / lados;
    return {
      seg: [a[0], a[1], b[0], b[1]],
      abertaEmbaixo: dentroDe(meio, -passo / 2, passo),
      abertaEmCima: dentroDe(meio, graus - passo, graus + passo / 2),
    };
  });
  const centro = P(W / 2, D / 2);
  return {
    lance: R - r0,
    piso: rc * (passo * Math.PI / 180),
    degraus, contorno, bordas,
    caminho: arco(0, graus, rc),
    centro, raio: R, raioPoste: r0, raioCaminho: rc, volta: graus,
  };
}

/**
 * Ângulo (graus, 0–360) de um ponto da planta no quadro da caracol: 0 = partida,
 * crescendo no sentido da subida (usado pelo Caminhar para saber quanto já subiu).
 */
export function anguloNaCaracol(e, x, y) {
  const q = quadroDaEscada(e);
  const dx = x - (q.o[0] + q.W / 2 * q.U[0] + q.D / 2 * q.V[0]);
  const dy = y - (q.o[1] + q.W / 2 * q.U[1] + q.D / 2 * q.V[1]);
  let u = dx * q.U[0] + dy * q.U[1];
  const v = dx * q.V[0] + dy * q.V[1];
  if (e.giro === 'esquerda') u = -u;
  const graus = Math.atan2(u, -v) * 180 / Math.PI;
  return (graus + 360) % 360;
}

/* ---------- Consultas ---------- */

/** Comprimento de uma linha poligonal. */
export function comprimentoDe(linha) {
  let s = 0;
  for (let i = 1; i < linha.length; i++) s += Math.hypot(linha[i][0] - linha[i - 1][0], linha[i][1] - linha[i - 1][1]);
  return s;
}

/** Distância ao longo do caminho (cm) do ponto do caminho mais perto de (x, y). */
export function progressoNoCaminho(linha, x, y) {
  let melhor = { d: Infinity, s: 0 };
  let acumulado = 0;
  for (let i = 1; i < linha.length; i++) {
    const [ax, ay] = linha[i - 1], [bx, by] = linha[i];
    const dx = bx - ax, dy = by - ay, comp2 = dx * dx + dy * dy;
    const t = comp2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / comp2)) : 0;
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    const comp = Math.sqrt(comp2);
    if (d < melhor.d) melhor = { d, s: acumulado + t * comp };
    acumulado += comp;
  }
  return melhor.s;
}

/** Ponto dentro de polígono (regra par-ímpar). */
export function dentroDoPoligono(x, y, pontos) {
  let dentro = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const [xi, yi] = pontos[i], [xj, yj] = pontos[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function caixa(pontos) {
  const xs = pontos.map((p) => p[0]), ys = pontos.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * Recorta aberturas (ex.: o buraco da escada na laje) de um piso.
 * Retorna null se nenhuma abertura toca o piso; senão, a lista de retângulos
 * que sobram (o piso é dividido numa grade pelas coordenadas dos dois
 * polígonos, e as células de cada linha são juntadas).
 */
export function recortarAberturas(pontos, aberturas) {
  const bb = caixa(pontos);
  const tocam = aberturas.filter((a) => {
    const c = caixa(a);
    return c.minX < bb.maxX && c.maxX > bb.minX && c.minY < bb.maxY && c.maxY > bb.minY;
  });
  if (!tocam.length) return null;

  const dentroDaFaixa = (v, min, max) => v >= min && v <= max;
  const coords = (eixo, min, max) => [...new Set([...pontos, ...tocam.flat()]
    .map((p) => Math.round(p[eixo] * 100) / 100)
    .filter((v) => dentroDaFaixa(v, min, max)))].sort((a, b) => a - b);
  const xs = coords(0, bb.minX, bb.maxX), ys = coords(1, bb.minY, bb.maxY);

  const pedacos = [];
  for (let j = 0; j < ys.length - 1; j++) {
    const cy = (ys[j] + ys[j + 1]) / 2;
    let atual = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cheio = dentroDoPoligono(cx, cy, pontos) && !tocam.some((a) => dentroDoPoligono(cx, cy, a));
      if (!cheio) { atual = null; continue; }
      if (atual) { atual[1][0] = xs[i + 1]; atual[2][0] = xs[i + 1]; continue; }
      atual = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]];
      pedacos.push(atual);
    }
  }
  return pedacos;
}

/** Escadas que saem do andar (começam nele) e que chegam nele. */
export function escadasDoAndar(casa, idAndar) {
  return {
    saem: casa.escadas.filter((e) => e.de === idAndar),
    chegam: casa.escadas.filter((e) => e.para === idAndar),
  };
}

/* ---------- Subir e descer (Caminhar) ---------- */

const normalizarGraus = (g) => ((((g % 360) + 540) % 360) - 180); // para (−180, 180]

/** Ângulo inicial na caracol: perto de 0 quem entra embaixo, perto do giro total quem entra em cima. */
function anguloDeEntrada(e, x, y, deCima) {
  const a = anguloNaCaracol(e, x, y);
  if (!deCima) return a > 180 ? a - 360 : a;
  return e.geo.volta + normalizarGraus(a - e.geo.volta);
}

/** Quanto da escada já foi subido: 0 = embaixo, 1 = em cima. */
function fracaoSubida(e, theta, x, y) {
  const f = e.tipo === 'caracol'
    ? theta / e.geo.volta
    : progressoNoCaminho(e.geo.caminho, x, y) / comprimentoDe(e.geo.caminho);
  return Math.max(0, Math.min(1, f));
}

/**
 * Acompanha quem anda pela casa (posição em cm) em relação às escadas.
 * `estado` = { andar, escada: null | { id, theta } } → devolve o novo estado e
 * `fracao` (quanto da escada já subiu, para a altura dos olhos).
 * - fora da escada: entra se pisar no contorno de uma escada do andar (as
 *   bordas fechadas são obstáculos, então só dá para entrar pela partida, no
 *   andar de baixo, ou pela chegada, no de cima);
 * - na escada: acompanha a subida (na caracol, somando o quanto girou) e, ao
 *   sair do contorno, passa para o andar de cima se subiu mais da metade.
 */
export function acompanharEscada(estado, casa, x, y) {
  if (!estado.escada) {
    const { saem, chegam } = escadasDoAndar(casa, estado.andar);
    const e = [...saem, ...chegam].find((esc) => dentroDoPoligono(x, y, esc.geo.contorno));
    if (!e) return { andar: estado.andar, escada: null, fracao: 0 };
    const theta = e.tipo === 'caracol' ? anguloDeEntrada(e, x, y, e.para === estado.andar) : 0;
    return { andar: estado.andar, escada: { id: e.id, theta }, fracao: fracaoSubida(e, theta, x, y) };
  }
  const e = casa.escadas.find((esc) => esc.id === estado.escada.id);
  if (!e) return { andar: estado.andar, escada: null, fracao: 0 };
  let { theta } = estado.escada;
  // Na caracol, soma o quanto girou desde o último passo (sem pular de 359° para 0°)
  if (e.tipo === 'caracol') theta += normalizarGraus(anguloNaCaracol(e, x, y) - theta);
  const fracao = fracaoSubida(e, theta, x, y);
  if (dentroDoPoligono(x, y, e.geo.contorno)) return { andar: estado.andar, escada: { id: e.id, theta }, fracao };
  return { andar: fracao > 0.5 ? e.para : e.de, escada: null, fracao: 0 };
}

/**
 * Ponto do cômodo para colocar alguém (cm): o mais perto de `preferido` que
 * fique dentro do cômodo e a pelo menos `folga` cm de qualquer escada.
 */
export function pontoLivreNoComodo(comodo, contornos, preferido, folga = 40) {
  const livre = ([x, y]) => dentroDoPoligono(x, y, comodo.pontos) &&
    !contornos.some((c) => dentroDoPoligono(x, y, c) || distanciaAoContorno(x, y, c) < folga);
  if (livre(preferido)) return preferido;
  const { minX, minY, maxX, maxY } = comodo.bb;
  let melhor = null;
  for (let x = minX + 5; x < maxX; x += 10) {
    for (let y = minY + 5; y < maxY; y += 10) {
      if (!livre([x, y])) continue;
      const d = Math.hypot(x - preferido[0], y - preferido[1]);
      if (!melhor || d < melhor.d) melhor = { d, p: [x, y] };
    }
  }
  return melhor ? melhor.p : preferido;
}

function distanciaAoContorno(x, y, pontos) {
  let min = Infinity;
  pontos.forEach((a, i) => {
    const b = pontos[(i + 1) % pontos.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], comp2 = dx * dx + dy * dy;
    const t = comp2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / comp2)) : 0;
    min = Math.min(min, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
  });
  return min;
}

/* ---------- Avisos (conforto e posição) ---------- */

const cm = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Avisos sobre as escadas: degraus altos ou curtos, fórmula de Blondel fora da
 * faixa, escada estreita e escada que sai dos cômodos de um dos andares.
 * Cada aviso diz em quais andares aparece (`andares`).
 */
export function verificarEscadas(casa, tiposComodo) {
  const L = ESCADA.limites;
  const problemas = [];
  for (const e of casa.escadas) {
    const g = e.geo;
    const avisar = (mensagem) => problemas.push({ tipo: 'escada', ids: [e.id], andares: [e.de, e.para], mensagem: `${e.nome}: ${mensagem}` });
    const blondel = 2 * g.espelho + g.piso;
    if (g.espelho > L.espelhoMax) avisar(`degraus de ${cm(g.espelho)} cm são altos (confortável: até 18 cm).`);
    if (g.piso < L.pisoMin) {
      avisar(`piso de ${cm(g.piso)} cm é curto (confortável: 28 a 32 cm). ` +
        (e.tipo === 'caracol' ? 'Aumente o diâmetro ou o giro total.' : 'Dê mais comprimento à escada.'));
    }
    else if (blondel < L.blondelMin || blondel > L.blondelMax) {
      avisar(`2 × espelho + piso = ${cm(blondel)} cm (confortável: de 63 a 65 cm).`);
    }
    if (e.tipo === 'caracol') {
      if (g.raio * 2 < L.caracolMin) avisar(`caracol de ${cm(g.raio * 2)} cm de diâmetro é apertada (confortável: a partir de 140 cm).`);
    } else if (g.lance < L.lanceMin) {
      avisar(`lance de ${cm(g.lance)} cm é estreito (confortável: a partir de 80 cm).`);
    }
    for (const idAndar of [e.de, e.para]) {
      const andar = casa.andares.find((a) => a.id === idAndar);
      if (!andar) continue;
      const internos = andar.comodos.filter((c) => !tiposComodo[c.tipo].externo);
      const meio = caixa(g.contorno);
      const cx = (meio.minX + meio.maxX) / 2, cy = (meio.minY + meio.maxY) / 2;
      // Cada canto, puxado 1 cm para dentro, precisa cair em algum cômodo interno
      const fora = g.contorno.some(([x, y]) => {
        const d = Math.hypot(cx - x, cy - y) || 1;
        const px = x + (cx - x) / d, py = y + (cy - y) / d;
        return !internos.some((c) => dentroDoPoligono(px, py, c.pontos));
      });
      if (fora) {
        problemas.push({
          tipo: 'escada', ids: [e.id], andares: [idAndar],
          mensagem: `${e.nome}: sai dos cômodos do andar "${andar.nome}". Ela precisa ficar dentro de um cômodo nos dois andares.`,
        });
      }
    }
  }
  return problemas;
}
