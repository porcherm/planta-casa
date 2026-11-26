/**
 * Store (andar visível e seleção), exportação do apartamento.js e operações do
 * editor sobre a vista de um andar.
 * Rodar com: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarDados } from '../public/js/domain/normalizar.js';
import { paraFormatoComAndares } from '../public/js/domain/andares.js';
import { criarStore } from '../public/js/context/store.js';
import { serializarApartamento } from '../public/js/components/editor/serializar.js';
import { removerComodo, gerarId } from '../public/js/components/editor/operacoes.js';
import { APARTAMENTO } from '../public/js/constants/apartamento.js';

const ret = (id, x, y, w = 300, h = 300) => ({ id, nome: id, x, y, largura: w, comprimento: h });

const sobrado = () => ({
  nome: 'Sobrado',
  parede: 12,
  andares: [
    { id: 'terreo', nome: 'Térreo', referencia: true, comodos: [ret('sala', 0, 0), ret('cozinha', 312, 0)] },
    { id: 'superior', nome: 'Superior', comodos: [ret('quarto', 0, 0), ret('banho', 312, 0)] },
  ],
});

/** Importa o texto de um apartamento.js como módulo, como o site faz. */
async function importarTexto(texto) {
  const modulo = await import(`data:text/javascript,${encodeURIComponent(texto)}`);
  return modulo.APARTAMENTO;
}

test('selecionar um cômodo de outro andar troca o andar, avisando antes da seleção', () => {
  const store = criarStore(normalizarDados(sobrado()).data, 'sala');
  assert.equal(store.andarAtual, 'terreo');
  const eventos = [];
  store.observarAndar((id) => eventos.push(`andar:${id}`));
  store.observar((id) => eventos.push(`selecao:${id}`));

  store.selecionar('quarto');
  assert.deepEqual(eventos, ['andar:superior', 'selecao:quarto']);
  assert.equal(store.andar.id, 'superior');
  assert.deepEqual(store.andar.comodos.map((c) => c.id), ['quarto', 'banho']);
});

test('trocar de andar leva a seleção para um cômodo daquele andar', () => {
  const store = criarStore(normalizarDados(sobrado()).data, 'cozinha');
  store.selecionarAndar('superior');
  assert.equal(store.selecionadoId, 'quarto');
  store.selecionarAndar('terreo');
  assert.equal(store.comodoSelecionado.andar, 'terreo');
});

test('substituir os dados mantém andar e seleção quando ainda existem', () => {
  const store = criarStore(normalizarDados(sobrado()).data, 'banho');
  const novo = sobrado();
  novo.andares[1].comodos[1].largura = 250;
  store.substituirDados(normalizarDados(novo).data);
  assert.equal(store.andarAtual, 'superior');
  assert.equal(store.selecionadoId, 'banho');
  assert.equal(store.comodoSelecionado.bb.w, 250);
});

test('apartamento.js de um andar só é exportado no formato simples e volta igual', async () => {
  const texto = serializarApartamento(paraFormatoComAndares(APARTAMENTO));
  assert.doesNotMatch(texto, /andares:/);
  const relido = await importarTexto(texto);
  assert.deepEqual(normalizarDados(relido).data, normalizarDados(APARTAMENTO).data);
});

test('casa com andares é exportada com "andares" e volta igual', async () => {
  const texto = serializarApartamento(paraFormatoComAndares(sobrado()));
  assert.match(texto, /andares: \[/);
  const relido = await importarTexto(texto);
  assert.deepEqual(normalizarDados(relido).data, normalizarDados(sobrado()).data);
});

test('operações do editor na vista de um andar alteram a casa (listas no lugar)', () => {
  const casa = paraFormatoComAndares(sobrado());
  const superior = casa.andares[1];
  superior.portas.push({ nome: 'Banho', tipo: 'porta', x1: 306, y1: 50, x2: 306, y2: 130 });
  const vista = { parede: casa.parede, comodos: superior.comodos, portas: superior.portas, janelas: superior.janelas,
    comodosDaCasa: casa.andares.flatMap((a) => a.comodos) };

  removerComodo(vista, 0);
  assert.deepEqual(casa.andares[1].comodos.map((c) => c.id), ['banho']);
  assert.equal(casa.andares[1].portas.length, 1, 'porta compartilhada com o banho continua');
  assert.equal(casa.andares[0].comodos.length, 2, 'o outro andar não muda');

  assert.equal(gerarId(vista, 'Sala'), 'sala-2', 'id único na casa, não só no andar');
});
