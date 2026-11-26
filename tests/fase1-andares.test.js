/**
 * Fase 1 (andares empilhados): exemplo de sobrado, criar/excluir andares,
 * enquadramento comum no 2D e o store ao desfazer um andar.
 * Rodar com: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APARTAMENTO as SOBRADO } from '../public/js/constants/exemplos/sobrado.js';
import { normalizarDados } from '../public/js/domain/normalizar.js';
import { verificarSobreposicoes } from '../public/js/domain/validacao.js';
import { paraFormatoComAndares, criarAndar, removerAndar, andarVizinho, areaInterna } from '../public/js/domain/andares.js';
import { TIPOS_COMODO } from '../public/js/constants/tipos.js';
import { desenharPlanta } from '../public/js/components/planta2d/desenho.js';
import { criarStore } from '../public/js/context/store.js';
import { serializarApartamento } from '../public/js/components/editor/serializar.js';

const casa = () => normalizarDados(SOBRADO).data;

test('sobrado de exemplo: três andares nas cotas certas e sem problemas de desenho', () => {
  const { ok, erro, data } = normalizarDados(SOBRADO);
  assert.ok(ok, erro);
  assert.deepEqual(data.andares.map((a) => [a.id, a.cota]), [['subsolo', -265], ['terreo', 0], ['superior', 285]]);
  for (const andar of data.andares) assert.deepEqual(verificarSobreposicoes(andar), [], `problemas no ${andar.nome}`);
  assert.equal(andarVizinho(data, 'terreo', 'acima').id, 'superior');
  assert.equal(andarVizinho(data, 'subsolo', 'abaixo'), null);
  assert.ok(areaInterna(data.comodos, TIPOS_COMODO) > areaInterna(data.andares[1].comodos, TIPOS_COMODO));
});

test('criar andar acima: entra logo depois, com o contorno interno do de baixo', () => {
  const bruto = paraFormatoComAndares(SOBRADO);
  const { andar, comodo } = criarAndar(bruto, 'superior', 'acima');
  assert.equal(bruto.andares.at(-1), andar);
  assert.equal(andar.nome, '2º pavimento', 'segundo andar acima do térreo');
  // Contorno dos cômodos internos do superior (sem a sacada): x 0..875, y 0..600
  assert.deepEqual([comodo.x, comodo.y, comodo.largura, comodo.comprimento], [0, 0, 875, 600]);
  const { ok, erro, data } = normalizarDados(bruto);
  assert.ok(ok, erro);
  assert.equal(data.andares.at(-1).cota, 285 + 260 + 15);
  const ids = data.comodos.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('criar andar abaixo do subsolo: entra antes e fica mais fundo', () => {
  const bruto = paraFormatoComAndares(SOBRADO);
  const { andar } = criarAndar(bruto, 'subsolo', 'abaixo');
  assert.equal(bruto.andares[0], andar);
  assert.equal(andar.nome, 'Subsolo 2');
  const { data } = normalizarDados(bruto);
  assert.equal(data.andares[0].cota, -265 - 15 - 270, 'laje do subsolo + pé-direito padrão');
});

test('nome do andar novo segue a posição: topo, fundo ou entre dois andares', () => {
  const simples = paraFormatoComAndares({ comodos: [{ nome: 'Sala', x: 0, y: 0, largura: 300, comprimento: 300 }] });
  assert.equal(criarAndar(simples, 'terreo', 'acima').andar.nome, 'Superior');
  assert.equal(criarAndar(simples, 'terreo', 'abaixo').andar.nome, 'Subsolo');
  // Agora: Subsolo · Térreo · Superior. Entre o térreo e o superior:
  assert.equal(criarAndar(simples, 'terreo', 'acima').andar.nome, 'Andar intermediário');
  assert.deepEqual(simples.andares.map((a) => a.nome), ['Subsolo', 'Térreo', 'Andar intermediário', 'Superior']);
});

test('excluir andar: protege o nível da rua e o único andar; leva junto as escadas dele', () => {
  const bruto = paraFormatoComAndares(SOBRADO);
  bruto.escadas = [{ id: 'e1', de: 'terreo', para: 'superior' }, { id: 'e2', de: 'subsolo', para: 'terreo' }];
  assert.equal(removerAndar(bruto, 'terreo').ok, false);
  assert.ok(removerAndar(bruto, 'superior').ok);
  assert.deepEqual(bruto.escadas.map((e) => e.id), ['e2']);
  assert.deepEqual(bruto.andares.map((a) => a.id), ['subsolo', 'terreo']);

  const unico = paraFormatoComAndares({ comodos: [{ nome: 'Sala', x: 0, y: 0, largura: 300, comprimento: 300 }] });
  delete unico.andares[0].referencia;
  assert.equal(removerAndar(unico, 'terreo').ok, false);
});

test('2D: todos os andares com o mesmo enquadramento; paredes do andar de baixo opcionais', () => {
  const c = casa();
  const caixas = c.andares.map((a) => desenharPlanta(a, { casa: c }).viewBox);
  for (const vb of caixas) assert.deepEqual(vb, caixas[0]);
  assert.notDeepEqual(desenharPlanta(c.andares[2]).viewBox, caixas[0], 'sem a casa, cada andar teria o seu');

  const { markup } = desenharPlanta(c.andares[1], { casa: c, fantasma: c.andares[0] });
  assert.match(markup, /class="cam-fantasma"/);
  assert.match(markup, /class="fantasma"/);
  assert.doesNotMatch(desenharPlanta(c.andares[1], { casa: c }).markup, /cam-fantasma/);
});

test('store: se o andar visível some (ex.: desfazer), volta ao nível da rua e avisa', () => {
  const bruto = paraFormatoComAndares(SOBRADO);
  const { comodo } = criarAndar(bruto, 'superior', 'acima');
  const store = criarStore(normalizarDados(bruto).data, comodo.id);
  assert.equal(store.andar.nome, '2º pavimento');
  const avisos = [];
  store.observarAndar((id) => avisos.push(id));
  store.substituirDados(casa());
  assert.deepEqual(avisos, ['terreo']);
  assert.equal(store.comodoSelecionado.andar, 'terreo');
});

test('sobrado exportado como apartamento.js volta igual', async () => {
  const texto = serializarApartamento(paraFormatoComAndares(SOBRADO));
  const relido = (await import(`data:text/javascript,${encodeURIComponent(texto)}`)).APARTAMENTO;
  assert.deepEqual(normalizarDados(relido).data, casa());
});
