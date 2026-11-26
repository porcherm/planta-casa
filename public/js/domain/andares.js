/**
 * Andares da casa.
 *
 * Formatos aceitos no apartamento.js:
 * - simples (uma folha só):  { comodos, portas, janelas, ... }
 * - com andares:             { andares: [{ id, nome, comodos, portas, janelas, ... }], escadas, ... }
 *
 * Internamente o programa sempre trabalha com andares. Cada andar normalizado
 * tem o mesmo formato de uma planta de um andar só ({ comodos, portas, janelas,
 * parede, peDireito, alturaPorta }), por isso paredes, desenho 2D, colisão e
 * validação funcionam andar por andar sem saber que existem outros.
 *
 * Sem DOM: dá para testar com Node.
 */
import { dentroDoPoligono } from './escadas.js';

/** Andar criado quando o arquivo usa o formato simples. */
export const ANDAR_UNICO = { id: 'terreo', nome: 'Térreo' };

const LISTAS = ['comodos', 'portas', 'janelas'];

/**
 * Converte os dados crus para o formato com andares (cópia; não altera o original).
 * Não valida nada: quem valida é o normalizador.
 */
export function paraFormatoComAndares(bruto) {
  if (!bruto || typeof bruto !== 'object') return bruto;
  const copia = structuredClone(bruto);

  if (Array.isArray(copia.andares)) {
    for (const andar of copia.andares) {
      if (andar && typeof andar === 'object') for (const lista of LISTAS) andar[lista] ??= [];
    }
    copia.escadas ??= [];
    return copia;
  }

  const andar = { ...ANDAR_UNICO, referencia: true };
  for (const lista of LISTAS) {
    andar[lista] = copia[lista] ?? (lista === 'comodos' ? undefined : []);
    delete copia[lista];
  }
  return { ...copia, andares: [andar], escadas: copia.escadas ?? [] };
}

/**
 * Volta ao formato simples quando a casa tem um andar só, sem nada além do
 * padrão. Assim quem não usa andares continua com o arquivo de sempre.
 */
export function paraFormatoSimples(bruto) {
  const andares = bruto?.andares;
  if (!Array.isArray(andares) || andares.length !== 1 || bruto.escadas?.length) return bruto;
  const [andar] = andares;
  const extras = Object.keys(andar).filter((k) => !LISTAS.includes(k) && !(k in ANDAR_UNICO) && k !== 'referencia' &&
    !(k === 'vazios' && !andar.vazios?.length));
  if (extras.length || andar.id !== ANDAR_UNICO.id || andar.nome !== ANDAR_UNICO.nome) return bruto;

  const { andares: _, escadas: __, ...casa } = bruto;
  const simples = { ...casa };
  for (const lista of LISTAS) simples[lista] = andar[lista];
  return simples;
}

/** Todos os cômodos crus da casa, na ordem dos andares (a mesma da normalização). */
export function comodosCrus(bruto) {
  return paraListaDeAndares(bruto).flatMap((a) => a.comodos || []);
}

function paraListaDeAndares(bruto) {
  return Array.isArray(bruto?.andares) ? bruto.andares : [{ comodos: bruto?.comodos }];
}

/* ---------- Consultas sobre os dados normalizados ---------- */

/** O andar de referência (cota 0, o nível da rua). */
export function andarReferencia(casa) {
  return casa.andares.find((a) => a.referencia) || casa.andares[0];
}

/** Andar pelo id; se não existir, o de referência. */
export function andarPorId(casa, id) {
  return casa.andares.find((a) => a.id === id) || andarReferencia(casa);
}

/** Andar onde fica um cômodo (pelo id do cômodo). */
export function andarDoComodo(casa, idComodo) {
  const comodo = casa.comodos.find((c) => c.id === idComodo);
  return comodo ? andarPorId(casa, comodo.andar) : andarReferencia(casa);
}

/** Totais de portas e janelas da casa inteira. */
export function contarAberturas(casa) {
  return casa.andares.reduce((t, a) => ({ portas: t.portas + a.portas.length, janelas: t.janelas + a.janelas.length }), { portas: 0, janelas: 0 });
}

/** Andar logo acima / abaixo (ou null). Os andares vêm de baixo para cima. */
export function andarVizinho(casa, id, lado) {
  const i = casa.andares.findIndex((a) => a.id === id);
  if (i < 0) return null;
  return casa.andares[lado === 'acima' ? i + 1 : i - 1] || null;
}

/** Andar que fica abaixo do nível da rua (pelo menos em parte). */
export const ehEnterrado = (andar) => andar.cota < 0;

/** Área interna (sem sacadas) de uma lista de cômodos normalizados. */
export function areaInterna(comodos, tipos) {
  return comodos.filter((c) => !tipos[c.tipo].externo).reduce((s, c) => s + c.area, 0);
}

/* ---------- Buracos na laje: escadas e vazios ---------- */

/** Buracos na laje (piso) de um andar: as escadas que chegam nele e os vazios dele. */
export function aberturasDaLaje(casa, idAndar) {
  const andar = casa.andares.find((a) => a.id === idAndar);
  return [
    ...(casa.escadas || []).filter((e) => e.para === idAndar).map((e) => e.geo.contorno),
    ...(andar?.vazios || []).map((v) => v.pontos),
  ];
}

/** Buracos no teto de um andar: os da laje do andar de cima. */
export function aberturasDoTeto(casa, idAndar) {
  const acima = andarVizinho(casa, idAndar, 'acima');
  return acima ? aberturasDaLaje(casa, acima.id) : [];
}

/**
 * Pé-direito duplo: se há um vazio no andar de cima sobre este cômodo, devolve
 * a altura livre total (pé-direito daqui + laje + pé-direito de cima), senão null.
 */
export function peDireitoDuplo(casa, comodo) {
  const andar = casa.andares.find((a) => a.id === comodo.andar);
  const acima = andar && andarVizinho(casa, andar.id, 'acima');
  if (!acima?.vazios?.length) return null;
  const sobre = acima.vazios.some((v) => v.bb.minX < comodo.bb.maxX && v.bb.maxX > comodo.bb.minX &&
    v.bb.minY < comodo.bb.maxY && v.bb.maxY > comodo.bb.minY &&
    (dentroDoPoligono(...centroDe(v.bb), comodo.pontos) || dentroDoPoligono(...centroDe(comodo.bb), v.pontos)));
  return sobre ? acima.cota + acima.peDireito - andar.cota : null;
}

const centroDe = (bb) => [(bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2];

/** Avisos dos vazios: precisam de um andar embaixo e de ficar dentro dos cômodos do próprio andar. */
export function verificarVazios(casa, tiposComodo) {
  const problemas = [];
  for (const andar of casa.andares) {
    for (const v of andar.vazios || []) {
      const avisar = (mensagem) => problemas.push({ tipo: 'vazio', ids: [v.id], andares: [andar.id], mensagem: `${v.nome}: ${mensagem}` });
      if (!andarVizinho(casa, andar.id, 'abaixo')) { avisar('não há andar embaixo para o vazio se abrir.'); continue; }
      const internos = andar.comodos.filter((c) => !tiposComodo[c.tipo].externo);
      const [cx, cy] = centroDe(v.bb);
      const fora = v.pontos.some(([x, y]) => {
        const d = Math.hypot(cx - x, cy - y) || 1;
        return !internos.some((c) => dentroDoPoligono(x + (cx - x) / d, y + (cy - y) / d, c.pontos));
      });
      if (fora) avisar(`sai dos cômodos do andar "${andar.nome}". O vazio é um recorte no piso de um cômodo.`);
    }
  }
  return problemas;
}

/* ---------- Edição de andares (dados crus, formato com andares) ---------- */

/** Caixa (cm) dos cômodos crus internos; se não houver, de todos. */
function caixaDosComodos(comodos) {
  const caixas = comodos.map((c) => {
    if (Array.isArray(c.pontos)) {
      const xs = c.pontos.map((p) => p[0]), ys = c.pontos.map((p) => p[1]);
      return { externo: c.tipo === 'sacada', minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    return { externo: c.tipo === 'sacada', minX: c.x, minY: c.y, maxX: c.x + c.largura, maxY: c.y + c.comprimento };
  });
  const usadas = caixas.some((b) => !b.externo) ? caixas.filter((b) => !b.externo) : caixas;
  if (!usadas.length) return { minX: 0, minY: 0, maxX: 300, maxY: 300 };
  return {
    minX: Math.min(...usadas.map((b) => b.minX)), minY: Math.min(...usadas.map((b) => b.minY)),
    maxX: Math.max(...usadas.map((b) => b.maxX)), maxY: Math.max(...usadas.map((b) => b.maxY)),
  };
}

/** Texto sem acentos, minúsculo e com hífens (para ids). */
const paraId = (texto) => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function unico(base, usados, separador) {
  let valor = base, n = 2;
  while (usados.has(valor)) valor = `${base}${separador}${n++}`;
  return valor;
}

/**
 * Nome sugerido para um andar novo, pela posição em que ele entra:
 * no topo, "Superior" e depois "2º pavimento", "3º pavimento"…; no fundo,
 * "Subsolo", "Subsolo 2"…; entre dois andares, "Andar intermediário".
 * `posicao` é o índice que o andar novo vai ocupar (de baixo para cima).
 */
function nomeDoNovoAndar(bruto, posicao) {
  const nomes = new Set(bruto.andares.map((a) => a.nome));
  const total = bruto.andares.length + 1;
  const ref = Math.max(0, bruto.andares.findIndex((a) => a.referencia || a.id === 'terreo'));
  const refDepois = posicao <= ref ? ref + 1 : ref; // a referência "sobe" se o novo entra embaixo dela
  let base;
  if (posicao === total - 1 && posicao > refDepois) {
    const nivel = posicao - refDepois;
    base = nivel === 1 ? 'Superior' : `${nivel}º pavimento`;
  } else if (posicao === 0 && posicao < refDepois) {
    const nivel = refDepois - posicao;
    base = nivel === 1 ? 'Subsolo' : `Subsolo ${nivel}`;
  } else {
    base = 'Andar intermediário';
  }
  return unico(base, nomes, ' ');
}

/**
 * Cria um andar acima ou abaixo de `idVizinho`, já com um cômodo "Área do andar"
 * com o contorno interno do vizinho (quase todo sobrado tem a mesma projeção;
 * depois é só dividir). Altera `bruto` e devolve { andar, comodo }.
 */
export function criarAndar(bruto, idVizinho, lado) {
  const i = bruto.andares.findIndex((a) => a.id === idVizinho);
  if (i < 0) throw new Error(`Andar "${idVizinho}" não existe.`);
  const vizinho = bruto.andares[i];
  const posicao = lado === 'acima' ? i + 1 : i;
  const nome = nomeDoNovoAndar(bruto, posicao);
  const id = unico(paraId(nome) || 'andar', new Set(bruto.andares.map((a) => a.id)), '-');

  const caixa = caixaDosComodos(vizinho.comodos);
  const idsComodos = new Set(comodosCrus(bruto).map((c) => c.id));
  const comodo = {
    id: unico(`area-${id}`, idsComodos, '-'),
    nome: `Área do ${nome.toLowerCase()}`,
    tipo: 'interno',
    medido: false,
    x: caixa.minX, y: caixa.minY,
    largura: Math.max(30, caixa.maxX - caixa.minX), comprimento: Math.max(30, caixa.maxY - caixa.minY),
  };
  const andar = { id, nome, comodos: [comodo], portas: [], janelas: [] };
  const abaixo = bruto.andares[posicao - 1], acima = bruto.andares[posicao];
  bruto.andares.splice(posicao, 0, andar);
  // Escada que ligava os dois andares agora chega no andar novo (ela só liga vizinhos)
  if (abaixo && acima) {
    for (const e of bruto.escadas || []) if (e.de === abaixo.id && e.para === acima.id) e.para = id;
  }
  return { andar, comodo };
}

/**
 * Remove um andar (e as escadas que chegavam nele). Não remove o único andar
 * nem o de referência. Devolve { ok, erro? }.
 */
export function removerAndar(bruto, id) {
  const i = bruto.andares.findIndex((a) => a.id === id);
  if (i < 0) return { ok: false, erro: 'Esse andar não existe.' };
  if (bruto.andares.length === 1) return { ok: false, erro: 'A casa precisa de pelo menos um andar.' };
  if (bruto.andares[i].referencia) {
    return { ok: false, erro: 'Este é o andar no nível da rua. Marque outro andar como nível da rua antes de excluir este.' };
  }
  bruto.andares.splice(i, 1);
  if (Array.isArray(bruto.escadas)) bruto.escadas = bruto.escadas.filter((e) => e.de !== id && e.para !== id);
  return { ok: true };
}
