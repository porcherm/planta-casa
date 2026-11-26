/**
 * Operações do editor sobre os dados "crus" (o mesmo formato do apartamento.js).
 * Funções puras: recebem dados e devolvem/alteram dados, sem tocar no DOM.
 */
import { EDITOR } from '../../constants/visualizacao.js';

export const arredondar = (v) => Math.round(v * 10) / 10;
export const naGrade = (v) => Math.round(v / EDITOR.grade) * EDITOR.grade;
export const ehRetangulo = (c) => !Array.isArray(c.pontos);

/* ---------- Encaixe ("ímã") ---------- */

/**
 * Escolhe o candidato mais perto de `valor` dentro da tolerância.
 * Se nenhum estiver perto, encaixa na grade.
 */
export function encaixar(valor, candidatos, tolerancia) {
  let melhor = null, menor = tolerancia;
  for (const c of candidatos) {
    const d = Math.abs(c - valor);
    if (d <= menor) { melhor = c; menor = d; }
  }
  return melhor ?? naGrade(valor);
}

/**
 * Candidatos para a borda inicial (esquerda/topo) de uma caixa de tamanho `t`
 * que se move entre as `caixas` vizinhas, com parede `p` entre elas:
 * encostar depois (com parede), encostar antes (com parede) ou alinhar.
 */
function candidatosParaMover(caixas, eixo, t, p) {
  const [min, max] = eixo === 'x' ? ['minX', 'maxX'] : ['minY', 'maxY'];
  return caixas.flatMap((o) => [o[max] + p, o[min] - p - t, o[min], o[max] - t]);
}

/** Candidatos para uma borda que está sendo puxada (redimensionar). */
function candidatosParaBorda(caixas, eixo, ladoFinal, p) {
  const [min, max] = eixo === 'x' ? ['minX', 'maxX'] : ['minY', 'maxY'];
  return ladoFinal
    ? caixas.flatMap((o) => [o[min] - p, o[max]])   // borda direita/de baixo
    : caixas.flatMap((o) => [o[max] + p, o[min]]);  // borda esquerda/de cima
}

/* ---------- Paredes de um cômodo retangular ---------- */

/**
 * Os 4 lados de um retângulo cru, com o eixo da parede (no meio da espessura).
 * `dentro` aponta para dentro do cômodo (usado como `lado` das portas).
 */
export function ladosDoRetangulo(c, parede) {
  const m = parede / 2;
  const x2 = c.x + c.largura, y2 = c.y + c.comprimento;
  return [
    { lado: 'n', horizontal: true, eixo: c.y - m, inicio: c.x, fim: x2, dentro: 1 },
    { lado: 's', horizontal: true, eixo: y2 + m, inicio: c.x, fim: x2, dentro: -1 },
    { lado: 'w', horizontal: false, eixo: c.x - m, inicio: c.y, fim: y2, dentro: 1 },
    { lado: 'e', horizontal: false, eixo: x2 + m, inicio: c.y, fim: y2, dentro: -1 },
  ];
}

const LISTAS = ['portas', 'janelas'];

/** Portas e janelas apoiadas nas paredes de um cômodo retangular, com o lado de cada uma. */
export function aberturasAnexas(dados, comodo) {
  if (!ehRetangulo(comodo)) return [];
  const p = dados.parede || 0;
  const lados = ladosDoRetangulo(comodo, p);
  const anexas = [];
  for (const lista of LISTAS) {
    (dados[lista] || []).forEach((a, indice) => {
      const L = lados.find((l) => estaNoLado(a, l, p));
      if (L) anexas.push({ lista, indice, lado: L.lado });
    });
  }
  return anexas;
}

function estaNoLado(a, L, p) {
  const naLinha = L.horizontal
    ? a.y1 === a.y2 && Math.abs(a.y1 - L.eixo) < 0.5
    : a.x1 === a.x2 && Math.abs(a.x1 - L.eixo) < 0.5;
  if (!naLinha) return false;
  const a0 = L.horizontal ? Math.min(a.x1, a.x2) : Math.min(a.y1, a.y2);
  const a1 = L.horizontal ? Math.max(a.x1, a.x2) : Math.max(a.y1, a.y2);
  return a1 > L.inicio - p && a0 < L.fim + p;
}

function deslocarAbertura(a, dx, dy) {
  a.x1 = arredondar(a.x1 + dx); a.x2 = arredondar(a.x2 + dx);
  a.y1 = arredondar(a.y1 + dy); a.y2 = arredondar(a.y2 + dy);
}

/* ---------- Mover e redimensionar ---------- */

/**
 * Move o cômodo `indice` por (dx, dy) a partir da posição atual, encaixando
 * nas bordas dos vizinhos (`caixas`). Portas e janelas das paredes dele vão junto.
 */
export function moverComodo(dados, indice, dx, dy, { caixas, tolerancia, anexas = [] }) {
  const c = dados.comodos[indice];
  const p = dados.parede || 0;
  const bb = caixaCrua(c);
  const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
  const novoX = encaixar(bb.minX + dx, candidatosParaMover(caixas, 'x', w, p), tolerancia);
  const novoY = encaixar(bb.minY + dy, candidatosParaMover(caixas, 'y', h, p), tolerancia);
  const mx = novoX - bb.minX, my = novoY - bb.minY;

  if (ehRetangulo(c)) {
    c.x = arredondar(c.x + mx);
    c.y = arredondar(c.y + my);
  } else {
    c.pontos = c.pontos.map(([x, y]) => [arredondar(x + mx), arredondar(y + my)]);
    if (c.rotulo) c.rotulo = [arredondar(c.rotulo[0] + mx), arredondar(c.rotulo[1] + my)];
  }
  for (const { lista, indice: i } of anexas) deslocarAbertura(dados[lista][i], mx, my);
}

/**
 * Puxa uma alça do retângulo: 'n', 's', 'e', 'w' ou cantos ('ne', 'sw'…).
 * As aberturas da parede puxada acompanham a borda.
 */
export function redimensionarComodo(dados, indice, alca, dx, dy, { caixas, tolerancia, anexas = [] }) {
  const c = dados.comodos[indice];
  const p = dados.parede || 0;
  const min = EDITOR.tamanhoMinimo;
  let x1 = c.x, y1 = c.y, x2 = c.x + c.largura, y2 = c.y + c.comprimento;

  if (alca.includes('e')) x2 = Math.max(x1 + min, encaixar(x2 + dx, candidatosParaBorda(caixas, 'x', true, p), tolerancia));
  if (alca.includes('w')) x1 = Math.min(x2 - min, encaixar(x1 + dx, candidatosParaBorda(caixas, 'x', false, p), tolerancia));
  if (alca.includes('s')) y2 = Math.max(y1 + min, encaixar(y2 + dy, candidatosParaBorda(caixas, 'y', true, p), tolerancia));
  if (alca.includes('n')) y1 = Math.min(y2 - min, encaixar(y1 + dy, candidatosParaBorda(caixas, 'y', false, p), tolerancia));

  const deslocamento = {
    n: [0, y1 - c.y], s: [0, y2 - (c.y + c.comprimento)],
    w: [x1 - c.x, 0], e: [x2 - (c.x + c.largura), 0],
  };
  for (const { lista, indice: i, lado } of anexas) {
    if (alca.includes(lado)) deslocarAbertura(dados[lista][i], ...deslocamento[lado]);
  }

  Object.assign(c, { x: arredondar(x1), y: arredondar(y1), largura: arredondar(x2 - x1), comprimento: arredondar(y2 - y1) });
}

/** Move um cômodo retangular exatamente por (dx, dy), sem encaixe (usado pelo formulário e pelas setas). */
export function transladarComodo(dados, indice, dx, dy) {
  const c = dados.comodos[indice];
  if (!ehRetangulo(c)) return;
  for (const { lista, indice: i } of aberturasAnexas(dados, c)) deslocarAbertura(dados[lista][i], dx, dy);
  c.x = arredondar(c.x + dx);
  c.y = arredondar(c.y + dy);
}

/** Define largura/comprimento exatos; as aberturas das paredes direita/de baixo acompanham. */
export function ajustarTamanho(dados, indice, campo, valor) {
  const c = dados.comodos[indice];
  if (!ehRetangulo(c)) return;
  const novo = Math.max(EDITOR.tamanhoMinimo, valor);
  const lado = campo === 'largura' ? 'e' : 's';
  const delta = novo - c[campo];
  for (const { lista, indice: i, lado: l } of aberturasAnexas(dados, c)) {
    if (l === lado) deslocarAbertura(dados[lista][i], lado === 'e' ? delta : 0, lado === 's' ? delta : 0);
  }
  c[campo] = arredondar(novo);
}

/** Move um canto de uma forma livre (ex.: sacada). */
export function moverVertice(dados, indice, vertice, x, y, { caixas, tolerancia }) {
  const p = dados.parede || 0;
  const cx = caixas.flatMap((o) => [o.minX, o.maxX, o.minX - p, o.maxX + p]);
  const cy = caixas.flatMap((o) => [o.minY, o.maxY, o.minY - p, o.maxY + p]);
  dados.comodos[indice].pontos[vertice] = [arredondar(encaixar(x, cx, tolerancia)), arredondar(encaixar(y, cy, tolerancia))];
}

/** Desliza uma porta/janela ao longo da própria parede. */
export function moverAberturaNaParede(a, dx, dy) {
  const horizontal = a.y1 === a.y2;
  const comprimento = horizontal ? a.x2 - a.x1 : a.y2 - a.y1;
  if (horizontal) {
    const ini = naGrade(a.x1 + dx + comprimento / 2) - comprimento / 2;
    a.x1 = arredondar(ini); a.x2 = arredondar(ini + comprimento);
  } else {
    const ini = naGrade(a.y1 + dy + comprimento / 2) - comprimento / 2;
    a.y1 = arredondar(ini); a.y2 = arredondar(ini + comprimento);
  }
}

/** Muda a largura de uma porta/janela mantendo o centro. */
export function definirLarguraAbertura(a, largura) {
  const horizontal = a.y1 === a.y2;
  const [i, f] = horizontal ? ['x1', 'x2'] : ['y1', 'y2'];
  const sentido = a[f] >= a[i] ? 1 : -1;
  const centro = (a[i] + a[f]) / 2;
  a[i] = arredondar(centro - (sentido * largura) / 2);
  a[f] = arredondar(centro + (sentido * largura) / 2);
}

export const larguraAbertura = (a) => Math.round(Math.hypot(a.x2 - a.x1, a.y2 - a.y1));

/* ---------- Adicionar e remover ---------- */

/** Parede (de um cômodo retangular) mais perto do ponto, dentro do alcance. */
export function encontrarParede(dados, [px, py], alcance) {
  const p = dados.parede || 0;
  let melhor = null;
  dados.comodos.forEach((c) => {
    if (!ehRetangulo(c) || c.tipo === 'sacada') return;
    for (const L of ladosDoRetangulo(c, p)) {
      const ao = L.horizontal ? px : py, perp = L.horizontal ? py : px;
      const t = Math.max(L.inicio, Math.min(L.fim, ao));
      const dist = Math.hypot(ao - t, perp - L.eixo);
      if (dist <= alcance && (!melhor || dist < melhor.dist)) melhor = { L, ao: t, dist };
    }
  });
  return melhor;
}

/** Monta uma porta ou janela centrada em `ao` sobre a parede L. */
export function criarAbertura(tipo, { L, ao }) {
  const disponivel = L.fim - L.inicio;
  const desejada = tipo === 'janela' ? EDITOR.larguraJanela : EDITOR.larguraPorta;
  const largura = Math.max(20, Math.min(desejada, disponivel - 10));
  const centro = Math.max(L.inicio + largura / 2, Math.min(L.fim - largura / 2, naGrade(ao)));
  const [a, b] = [arredondar(centro - largura / 2), arredondar(centro + largura / 2)];
  const segmento = L.horizontal
    ? { x1: a, y1: L.eixo, x2: b, y2: L.eixo }
    : { x1: L.eixo, y1: a, x2: L.eixo, y2: b };
  return tipo === 'janela'
    ? { nome: 'Janela', ...segmento, peitoril: 100, topo: 210 }
    : { nome: 'Porta', tipo: 'porta', ...segmento, lado: L.dentro, dobradica: 'inicio' };
}

/**
 * Id único a partir de um nome (ex.: "Quarto 2" → "quarto-2").
 * Único na casa inteira: a vista de um andar traz `comodosDaCasa` com os de todos os andares.
 */
export function gerarId(dados, nome) {
  const base = String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'comodo';
  const usados = new Set((dados.comodosDaCasa || dados.comodos).map((c) => c.id));
  let id = base, n = 2;
  while (usados.has(id)) id = `${base}-${n++}`;
  return id;
}

function nomeUnico(dados, base) {
  const usados = new Set(dados.comodos.map((c) => c.nome));
  let nome = base, n = 2;
  while (usados.has(nome)) nome = `${base} ${n++}`;
  return nome;
}

/** Caixa de um cômodo cru (retângulo ou forma livre). */
export function caixaCrua(c) {
  if (ehRetangulo(c)) return { minX: c.x, minY: c.y, maxX: c.x + c.largura, maxY: c.y + c.comprimento };
  const xs = c.pontos.map((q) => q[0]), ys = c.pontos.map((q) => q[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function caixaDeTudo(dados, filtro = () => true) {
  const caixas = dados.comodos.filter(filtro).map(caixaCrua);
  if (!caixas.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    minX: Math.min(...caixas.map((b) => b.minX)), minY: Math.min(...caixas.map((b) => b.minY)),
    maxX: Math.max(...caixas.map((b) => b.maxX)), maxY: Math.max(...caixas.map((b) => b.maxY)),
  };
}

/** Novo cômodo retangular à direita dos existentes. Retorna o índice. */
export function adicionarComodo(dados) {
  const p = dados.parede || 0;
  const tudo = caixaDeTudo(dados, (c) => c.tipo !== 'sacada');
  const nome = nomeUnico(dados, 'Novo cômodo');
  dados.comodos.push({
    id: gerarId(dados, nome), nome, tipo: 'interno', medido: false,
    x: naGrade(tudo.maxX + p), y: naGrade(tudo.minY),
    largura: EDITOR.novoComodo.largura, comprimento: EDITOR.novoComodo.comprimento,
  });
  return dados.comodos.length - 1;
}

/** Nova sacada (forma livre) encostada embaixo dos cômodos. Retorna o índice. */
export function adicionarSacada(dados) {
  const p = dados.parede || 0;
  const tudo = caixaDeTudo(dados, (c) => c.tipo !== 'sacada');
  const nome = nomeUnico(dados, 'Sacada');
  const x = naGrade(tudo.minX), y = tudo.maxY + p;
  dados.comodos.push({
    id: gerarId(dados, nome), nome, tipo: 'sacada',
    pontos: [[x, y], [x + 300, y], [x + 300, y + 120], [x, y + 120]],
  });
  return dados.comodos.length - 1;
}

/**
 * Remove um cômodo e as portas/janelas que só existiam nas paredes dele
 * (as compartilhadas com um vizinho continuam).
 */
export function removerComodo(dados, indice) {
  const removido = dados.comodos[indice];
  const anexas = aberturasAnexas(dados, removido);
  dados.comodos.splice(indice, 1);
  const outras = dados.comodos.flatMap((c) => aberturasAnexas(dados, c).map((a) => `${a.lista}:${a.indice}`));
  const remover = anexas.filter((a) => !outras.includes(`${a.lista}:${a.indice}`));
  // Remove no lugar (de trás para frente): `dados` pode ser a vista de um andar,
  // e trocar a lista por outra deixaria a casa com a lista antiga
  for (const lista of LISTAS) {
    const indices = remover.filter((a) => a.lista === lista).map((a) => a.indice).sort((p, q) => q - p);
    for (const i of indices) dados[lista]?.splice(i, 1);
  }
}
