import { TIPOS_COMODO, TIPO_COMODO_PADRAO, APELIDOS_TIPO_COMODO, TIPOS_PORTA, ESTADOS, PADROES } from '../constants/tipos.js';

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const temCoordenadas = (o) => o && ['x1', 'y1', 'x2', 'y2'].every((k) => ehNumero(o[k]));
const ehSegmentoReto = (o) => o.x1 === o.x2 || o.y1 === o.y2;

class ErroDeDados extends Error {}
const falhar = (mensagem) => { throw new ErroDeDados(mensagem); };

/**
 * Valida e completa os dados brutos do apartamento.
 * Retorna { ok: true, data } ou { ok: false, erro } com uma mensagem amigável.
 */
export function normalizarDados(bruto) {
  try {
    return { ok: true, data: normalizar(bruto) };
  } catch (e) {
    if (e instanceof ErroDeDados) return { ok: false, erro: e.message };
    throw e;
  }
}

function normalizar(d) {
  if (!d || typeof d !== 'object') falhar('O texto precisa ser um objeto JSON com a lista "comodos".');
  if (!Array.isArray(d.comodos) || !d.comodos.length) falhar('Faltou a lista "comodos" com pelo menos um cômodo.');

  return {
    nome: String(d.nome || 'Minha casa'),
    titulo: String(d.titulo || 'Minha casa, cômodo por cômodo'),
    comodoInicial: typeof d.comodoInicial === 'string' ? d.comodoInicial : '',
    estado: ESTADOS[d.estado] ? d.estado : (d.exemplo === true ? 'exemplo' : 'real'),
    peDireito: Number(d.peDireito) > 0 ? Number(d.peDireito) : PADROES.peDireito,
    parede: ehNumero(d.parede) && d.parede >= 0 ? d.parede : 0,
    alturaPorta: ehNumero(d.alturaPorta) && d.alturaPorta > 0 ? d.alturaPorta : PADROES.alturaPorta,
    comodos: normalizarComodos(d.comodos),
    portas: (Array.isArray(d.portas) ? d.portas : []).map(normalizarPorta),
    janelas: (Array.isArray(d.janelas) ? d.janelas : []).map(normalizarJanela),
  };
}

function normalizarComodos(lista) {
  const idsUsados = new Set();
  return lista.map((c, i) => {
    const n = i + 1;
    if (!c || typeof c.nome !== 'string' || !c.nome.trim()) falhar(`O cômodo ${n} está sem "nome".`);
    const nome = c.nome.trim();

    let id = String(c.id || `comodo-${n}`).replace(/[^a-zA-Z0-9_-]/g, '-');
    while (idsUsados.has(id)) id += `-${n}`;
    idsUsados.add(id);

    const rotulo = Array.isArray(c.rotulo) && ehNumero(c.rotulo[0]) && ehNumero(c.rotulo[1])
      ? [c.rotulo[0], c.rotulo[1]]
      : null;

    return medirComodo({
      id,
      nome,
      tipo: resolverTipo(c.tipo),
      pontos: lerPontos(c, nome),
      rotulo,
      nota: typeof c.nota === 'string' ? c.nota : '',
      medido: c.medido === true,
    });
  });
}

/** Tipo válido do cômodo; aceita apelidos antigos e cai no padrão se não reconhecer. */
function resolverTipo(tipo) {
  const nome = APELIDOS_TIPO_COMODO[tipo] || tipo;
  return TIPOS_COMODO[nome] ? nome : TIPO_COMODO_PADRAO;
}

/** Aceita `pontos` (forma livre) ou x/y/largura/comprimento (retângulo). */
function lerPontos(c, nome) {
  if (Array.isArray(c.pontos)) {
    const valido = c.pontos.length >= 3 &&
      c.pontos.every((p) => Array.isArray(p) && p.length === 2 && ehNumero(p[0]) && ehNumero(p[1]));
    if (!valido) falhar(`"${nome}": "pontos" precisa ser uma lista de pares [x, y] com pelo menos 3 cantos.`);
    return c.pontos.map(([x, y]) => [x, y]);
  }
  for (const campo of ['x', 'y', 'largura', 'comprimento']) {
    if (!ehNumero(c[campo])) falhar(`"${nome}": o campo "${campo}" precisa ser um número em centímetros (ou use "pontos").`);
  }
  if (c.largura <= 0 || c.comprimento <= 0) falhar(`"${nome}": largura e comprimento precisam ser maiores que zero.`);
  const { x, y, largura: w, comprimento: h } = c;
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

function normalizarPorta(p) {
  if (!temCoordenadas(p)) falhar('Cada porta precisa de "x1", "y1", "x2" e "y2" em centímetros.');
  if (!ehSegmentoReto(p)) falhar(`A porta "${p.nome || '?'}" precisa ficar numa parede reta (mesmo x ou mesmo y nas duas pontas).`);
  return {
    nome: String(p.nome || ''),
    tipo: TIPOS_PORTA.includes(p.tipo) ? p.tipo : 'porta',
    x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2,
    lado: (p.lado === 1 || p.lado === -1) ? p.lado : 0,
    dobradica: p.dobradica === 'fim' ? 'fim' : 'inicio',
  };
}

function normalizarJanela(j) {
  if (!temCoordenadas(j)) falhar('Cada janela precisa de "x1", "y1", "x2" e "y2" em centímetros.');
  if (!ehSegmentoReto(j)) falhar(`A janela "${j.nome || '?'}" precisa ficar numa parede reta.`);
  const peitoril = ehNumero(j.peitoril) && j.peitoril >= 0 ? j.peitoril : PADROES.peitoril;
  const topo = ehNumero(j.topo) && j.topo > peitoril ? j.topo : Math.max(peitoril + 20, PADROES.topoJanela);
  return {
    nome: String(j.nome || ''),
    x1: j.x1, y1: j.y1, x2: j.x2, y2: j.y2,
    peitoril,
    topo,
    forma: j.forma === 'losango' ? 'losango' : '',
  };
}

/**
 * Calcula área (fórmula do laço), perímetro, caixa delimitadora (bb)
 * e se o cômodo é um retângulo alinhado aos eixos (reto).
 */
export function medirComodo(comodo) {
  const p = comodo.pontos;
  let somaLaco = 0, perimetro = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let reto = p.length === 4;

  p.forEach((atual, i) => {
    const prox = p[(i + 1) % p.length];
    somaLaco += atual[0] * prox[1] - prox[0] * atual[1];
    perimetro += Math.hypot(prox[0] - atual[0], prox[1] - atual[1]);
    if (atual[0] !== prox[0] && atual[1] !== prox[1]) reto = false;
    minX = Math.min(minX, atual[0]); minY = Math.min(minY, atual[1]);
    maxX = Math.max(maxX, atual[0]); maxY = Math.max(maxY, atual[1]);
  });

  return {
    ...comodo,
    area: Math.abs(somaLaco) / 2,
    perimetro,
    reto,
    bb: { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY },
  };
}
