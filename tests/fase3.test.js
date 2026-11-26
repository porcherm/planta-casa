/**
 * Fase 3: vazios (pé-direito duplo), terreno em desnível, telhado, corte e a
 * planta por fotos com vários andares.
 * Rodar com: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APARTAMENTO as SOBRADO } from '../public/js/constants/exemplos/sobrado.js';
import { APARTAMENTO as MEZANINO } from '../public/js/constants/exemplos/casa-mezanino.js';
import { APARTAMENTO } from '../public/js/constants/apartamento.js';
import { normalizarDados } from '../public/js/domain/normalizar.js';
import { paraFormatoComAndares, aberturasDaLaje, aberturasDoTeto, peDireitoDuplo, verificarVazios } from '../public/js/domain/andares.js';
import { alturaDoTerreno, normalizarTerreno } from '../public/js/domain/terreno.js';
import { geometriaDoTelhado, normalizarTelhado } from '../public/js/domain/telhado.js';
import { gerarCorte, trechosNaLinha, faixaDoCorte, posicaoInicialDoCorte } from '../public/js/domain/corte.js';
import { montarApartamento } from '../public/js/domain/planta-ia.js';
import { limites } from '../public/js/domain/geometria.js';
import { TIPOS_COMODO } from '../public/js/constants/tipos.js';
import { desenharPlanta } from '../public/js/components/planta2d/desenho.js';
import { serializarApartamento } from '../public/js/components/editor/serializar.js';

const casa = (bruto) => { const r = normalizarDados(bruto); assert.ok(r.ok, r.erro); return r.data; };

/* ---------- Vazios ---------- */

test('vazio: é buraco na laje do mezanino e no teto do térreo; a sala ganha pé-direito duplo', () => {
  const c = casa(MEZANINO);
  assert.equal(aberturasDaLaje(c, 'mezanino').length, 2, 'escada + vazio');
  assert.equal(aberturasDoTeto(c, 'terreo').length, 2);
  assert.equal(aberturasDaLaje(c, 'terreo').length, 0);
  assert.equal(peDireitoDuplo(c, c.comodos.find((x) => x.id === 'estar')), 280 + 15 + 240);
  assert.equal(peDireitoDuplo(c, c.comodos.find((x) => x.id === 'cozinha')), null);
  assert.deepEqual(verificarVazios(c, TIPOS_COMODO), []);
});

test('vazio: avisos quando sai do cômodo ou não tem andar embaixo', () => {
  const b = paraFormatoComAndares(MEZANINO);
  b.andares[1].vazios[0].x = -200;
  b.andares[0].vazios = [{ id: 'v-terreo', x: 10, y: 10, largura: 100, comprimento: 100 }];
  const msgs = verificarVazios(casa(b), TIPOS_COMODO).map((p) => p.mensagem).join('\n');
  assert.match(msgs, /sai dos cômodos do andar "Mezanino"/);
  assert.match(msgs, /não há andar embaixo/);
});

test('vazio no 2D: "VAZIO" no andar dele, projeção "pé-direito duplo" no de baixo', () => {
  const c = casa(MEZANINO);
  const [terreo, mez] = c.andares;
  assert.match(desenharPlanta(mez, { casa: c }).markup, /data-vazio="vazio-sala"[\s\S]*>VAZIO</);
  assert.match(desenharPlanta(terreo, { casa: c }).markup, /pé-direito duplo/);
});

test('vazio vai e volta no apartamento.js; casa de um andar sem vazios continua no formato simples', async () => {
  const texto = serializarApartamento(paraFormatoComAndares(MEZANINO));
  assert.match(texto, /vazios: \[/);
  assert.match(texto, /telhado: \{ tipo: 'duas-aguas'/);
  const relido = (await import(`data:text/javascript,${encodeURIComponent(texto)}`)).APARTAMENTO;
  assert.deepEqual(normalizarDados(relido).data, casa(MEZANINO));
  assert.doesNotMatch(serializarApartamento(paraFormatoComAndares(APARTAMENTO)), /vazios|andares/);
});

/* ---------- Terreno ---------- */

test('terreno: plano por padrão; em desnível cai em linha reta e fica reto fora da casa', () => {
  assert.deepEqual(normalizarTerreno(undefined), { desce: null, desnivel: 0 });
  assert.deepEqual(normalizarTerreno({ desce: 'diagonal', desnivel: 100 }), { desce: null, desnivel: 0 });
  const t = { desce: 'sul', desnivel: 300 };
  const L = { minX: 0, minY: 0, maxX: 1000, maxY: 600, w: 1000, h: 600 };
  assert.equal(alturaDoTerreno(t, L, 500, 0), -0);
  assert.equal(alturaDoTerreno(t, L, 500, 300), -150);
  assert.equal(alturaDoTerreno(t, L, 500, 600), -300);
  assert.equal(alturaDoTerreno(t, L, 500, 900), -300, 'platô embaixo');
  assert.equal(alturaDoTerreno(t, L, 500, -500), -0, 'platô em cima');
  assert.equal(alturaDoTerreno({ desce: 'leste', desnivel: 100 }, L, 1000, 0), -100);
});

/* ---------- Telhado ---------- */

test('telhado: sem telhado por padrão; inclinação e beiral limitados', () => {
  assert.equal(geometriaDoTelhado(casa(APARTAMENTO)), null);
  assert.deepEqual(normalizarTelhado({ tipo: 'duas-aguas', inclinacao: 500, beiral: -3 }), { tipo: 'duas-aguas', inclinacao: 100, beiral: 0 });
});

test('telhado: duas águas sobe a inclinação certa, com cumeeira no sentido do lado maior', () => {
  const c = casa(MEZANINO);
  const g = geometriaDoTelhado(c);
  const panos = g.faces.filter((f) => f.tipo === 'pano');
  assert.equal(panos.length, 2);
  assert.equal(g.faces.filter((f) => f.tipo === 'oitao').length, 2);
  const zs = panos.flatMap((f) => f.pontos.map((p) => p[2]));
  const topo = c.andares[1].cota + c.andares[1].peDireito;
  const L = limites(c.andares[1].comodos, true);
  // Vão = lado menor + paredes + beirais; a cumeeira sobe meio vão × 35%
  const vao = Math.min(L.w, L.h) + 15 + 120;
  const beiral = topo + 10 - 60 * 0.35; // 10 cm de estrutura acima das paredes
  assert.ok(Math.abs(Math.min(...zs) - beiral) < 1e-6, 'beiral um pouco abaixo do topo da parede');
  assert.ok(Math.abs(Math.max(...zs) - (beiral + (vao / 2) * 0.35)) < 1e-6, 'altura da cumeeira');
});

test('telhado: quatro águas tem quatro panos; laje plana tem laje + quatro platibandas', () => {
  assert.equal(geometriaDoTelhado(casa(SOBRADO)).faces.length, 4);
  const b = paraFormatoComAndares(SOBRADO);
  b.telhado = { tipo: 'laje' };
  const g = geometriaDoTelhado(casa(b));
  assert.equal(g.faces.length, 0);
  assert.equal(g.caixas.length, 5);
});

/* ---------- Corte ---------- */

test('corte: trechos de uma linha num polígono (inclusive em L)', () => {
  const L = [[0, 0], [400, 0], [400, 100], [100, 100], [100, 300], [0, 300]];
  assert.deepEqual(trechosNaLinha(L, 50, true).map((t) => t.map(Math.round)), [[0, 400]]);
  assert.deepEqual(trechosNaLinha(L, 200, true).map((t) => t.map(Math.round)), [[0, 100]]);
  assert.deepEqual(trechosNaLinha(L, 250, false).map((t) => t.map(Math.round)), [[0, 100]]);
  assert.deepEqual(trechosNaLinha(L, 500, true), []);
});

test('corte do sobrado pela escada da garagem: lajes, paredes, degraus, níveis, terreno e telhado', () => {
  const c = casa(SOBRADO);
  const corte = gerarCorte(c, { direcao: 'horizontal', posicao: 300 });
  assert.deepEqual(corte.niveis.map((n) => n.z), [-265, 0, 285]);
  assert.ok(corte.degraus.length >= 1, 'a linha passa pela escada da garagem');
  // A laje do térreo tem o buraco da escada da garagem (x 455..545)
  const lajeTerreo = corte.lajes.filter((l) => l.andar === 'terreo' && l.z1 === 0);
  assert.ok(lajeTerreo.every((l) => l.b <= 455.5 || l.a >= 544.5), 'sem laje sobre a escada');
  assert.ok(corte.paredes.some((p) => p.andar === 'subsolo'));
  assert.ok(corte.terreno.length >= 1 && corte.terreno.flat().some(([, z]) => z < -100), 'terreno em desnível');
  assert.ok(corte.telhado.length >= 2);
  assert.ok(corte.limites.zMax > 600 && corte.limites.zMin < -265);
});

test('corte da casa com mezanino pelo vazio: sem laje do mezanino sobre a sala', () => {
  const c = casa(MEZANINO);
  const corte = gerarCorte(c, { direcao: 'vertical', posicao: 200 }); // x = 200, atravessa o vazio (y 320..620)
  const lajeMez = corte.lajes.filter((l) => l.andar === 'mezanino' && l.z1 === 295);
  assert.ok(lajeMez.length >= 1);
  assert.ok(lajeMez.every((l) => l.b <= 320.5 || l.a >= 619.5), 'o vazio não tem laje');
  assert.ok(corte.guardas.some((g) => g.andar === 'mezanino' && Math.abs((g.a + g.b) / 2 - 320) < 1), 'guarda-corpo na borda do vazio');
  const [min, max] = faixaDoCorte(c, 'vertical');
  assert.ok(min <= 0 && max >= 900);
  assert.ok(Math.abs(posicaoInicialDoCorte(c, 'horizontal') - 167.5) < 1, 'passa pelo meio da escada');
});

/* ---------- IA com vários andares ---------- */

const respostaIA = (andares, comodos) => ({
  nome: 'Sobrado', peDireito: 270, parede: 15, andares, observacoes: '', portas: [], janelas: [],
  comodos: comodos.map(([id, andar, x, y]) => ({ id, andar, nome: id, tipo: 'interno', x, y, largura: 300, comprimento: 300, confianca: 'media', observacao: '' })),
});

test('IA: um andar só continua no formato simples', () => {
  const r = montarApartamento(respostaIA([{ id: 'terreo', nome: 'Térreo', nivelDaRua: true }], [['sala', 'terreo', 0, 0]]));
  assert.ok(r.ok);
  assert.ok(Array.isArray(r.bruto.comodos));
  assert.equal(r.bruto.andares, undefined);
  assert.equal(r.bruto.comodos[0].andarIA, undefined, 'campo interno não vai para o arquivo');
});

test('IA: vários andares viram "andares", com o nível da rua marcado e cômodos no andar certo', () => {
  const r = montarApartamento(respostaIA(
    [{ id: 'Térreo!', nome: 'Térreo', nivelDaRua: false }, { id: 'sup', nome: 'Superior', nivelDaRua: false }],
    [['sala', 'Térreo!', 0, 0], ['quarto', 'sup', 0, 0], ['perdido', 'sotao', 315, 0]],
  ));
  assert.ok(r.ok);
  const { andares } = r.bruto;
  assert.deepEqual(andares.map((a) => a.id), ['terreo', 'sup']);
  assert.equal(andares[0].referencia, true, 'o "Térreo" vira o nível da rua');
  assert.deepEqual(andares[0].comodos.map((c) => c.id), ['sala', 'perdido']);
  assert.deepEqual(andares[1].comodos.map((c) => c.id), ['quarto']);
  assert.match(r.avisos.join(' '), /não diziam o andar/);
  assert.ok(normalizarDados(r.bruto).ok);
});
