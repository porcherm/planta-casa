/**
 * Andares: conversão entre o formato simples e o com andares, cotas e ids.
 * Rodar com: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paraFormatoComAndares, paraFormatoSimples, comodosCrus, andarDoComodo, contarAberturas } from '../public/js/domain/andares.js';
import { normalizarDados } from '../public/js/domain/normalizar.js';
import { verificarSobreposicoes } from '../public/js/domain/validacao.js';

const sala = (extra = {}) => ({ id: 'sala', nome: 'Sala', x: 0, y: 0, largura: 400, comprimento: 300, ...extra });
const quarto = (extra = {}) => ({ id: 'quarto', nome: 'Quarto', x: 0, y: 0, largura: 300, comprimento: 300, ...extra });

const sobrado = () => ({
  nome: 'Sobrado',
  peDireito: 270,
  parede: 15,
  andares: [
    { id: 'subsolo', nome: 'Subsolo', peDireito: 250, comodos: [{ id: 'garagem', nome: 'Garagem', x: 0, y: 0, largura: 500, comprimento: 600 }] },
    { id: 'terreo', nome: 'Térreo', referencia: true, comodos: [sala()], portas: [{ nome: 'Entrada', tipo: 'entrada', x1: 50, y1: 307, x2: 140, y2: 307 }] },
    { id: 'superior', nome: 'Superior', peDireito: 260, laje: 20, comodos: [quarto()], janelas: [{ x1: 0, y1: -7, x2: 120, y2: -7 }] },
  ],
});

test('formato simples vira um andar "Térreo" de referência, sem alterar o original', () => {
  const simples = { nome: 'Apê', comodos: [sala()], portas: [], janelas: [] };
  const copia = structuredClone(simples);
  const r = paraFormatoComAndares(simples);
  assert.deepEqual(simples, copia);
  assert.equal(r.comodos, undefined);
  assert.equal(r.andares.length, 1);
  assert.deepEqual(r.andares[0], { id: 'terreo', nome: 'Térreo', referencia: true, comodos: [sala()], portas: [], janelas: [] });
  assert.deepEqual(r.escadas, []);
});

test('formato com andares só completa as listas que faltam', () => {
  const r = paraFormatoComAndares(sobrado());
  assert.deepEqual(r.andares[0].portas, []);
  assert.deepEqual(r.andares[0].janelas, []);
  assert.equal(r.andares[2].janelas.length, 1);
});

test('volta ao formato simples só quando é um andar padrão', () => {
  const simples = { nome: 'Apê', comodos: [sala()], portas: [], janelas: [] };
  assert.deepEqual(paraFormatoSimples(paraFormatoComAndares(simples)), simples);

  const comPeDireito = paraFormatoComAndares(simples);
  comPeDireito.andares[0].peDireito = 300;
  assert.ok(Array.isArray(paraFormatoSimples(comPeDireito).andares), 'andar com ajuste próprio continua em "andares"');
  assert.ok(Array.isArray(paraFormatoSimples(sobrado()).andares), 'mais de um andar continua em "andares"');
});

test('cotas: referência em 0, acima soma pé-direito + laje, abaixo desconta', () => {
  const { ok, data } = normalizarDados(sobrado());
  assert.ok(ok);
  const [subsolo, terreo, superior] = data.andares;
  assert.equal(terreo.cota, 0);
  assert.equal(terreo.peDireito, 270, 'sem pé-direito próprio, herda o da casa');
  assert.equal(superior.cota, 270 + 20, 'pé-direito do térreo + laje do superior');
  assert.equal(subsolo.cota, -(15 + 250), 'laje do térreo (padrão 15) + pé-direito do subsolo');
  assert.deepEqual(data.andares.map((a) => a.ordem), [0, 1, 2]);
});

test('"cota" informada no andar vale mais que a conta (meio-nível)', () => {
  const casa = sobrado();
  casa.andares[2].cota = 150;
  assert.equal(normalizarDados(casa).data.andares[2].cota, 150);
});

test('sem "referencia", o andar "terreo" (ou o primeiro) vira a referência', () => {
  const casa = sobrado();
  delete casa.andares[1].referencia;
  const { data } = normalizarDados(casa);
  assert.equal(data.andares.find((a) => a.referencia).id, 'terreo');

  casa.andares[1].id = 'principal';
  assert.equal(normalizarDados(casa).data.andares[0].referencia, true);
});

test('cada cômodo sabe o seu andar e os ids são únicos na casa inteira', () => {
  const casa = sobrado();
  casa.andares[2].comodos.push(sala({ x: 400 }));
  const { data } = normalizarDados(casa);
  const ids = data.comodos.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, `ids repetidos: ${ids}`);
  assert.equal(data.comodos.find((c) => c.id === 'garagem').andar, 'subsolo');
  assert.equal(andarDoComodo(data, 'quarto').id, 'superior');
  assert.deepEqual(comodosCrus(casa).map((c) => c.id), ['garagem', 'sala', 'quarto', 'sala']);
  assert.deepEqual(contarAberturas(data), { portas: 1, janelas: 1 });
});

test('cômodos em andares diferentes não "se sobrepõem": a validação é por andar', () => {
  const { data } = normalizarDados(sobrado());
  for (const andar of data.andares) assert.deepEqual(verificarSobreposicoes(andar), []);
});

test('mensagens de erro claras', () => {
  const erro = (dados) => normalizarDados(dados).erro;
  assert.match(erro({ comodos: [] }), /Faltou a lista "comodos"/);
  assert.match(erro({ andares: [] }), /pelo menos um andar/);
  assert.match(erro({ comodos: [sala()], andares: [{ comodos: [sala()] }] }), /dentro de cada andar/);
  assert.match(erro({ andares: [{ nome: 'Vazio', comodos: [] }] }), /"Vazio" precisa de pelo menos um cômodo/);
  assert.match(erro({ andares: [{ referencia: true, comodos: [sala()] }, { referencia: true, comodos: [quarto()] }] }), /Só um andar pode ser a referência/);
});
