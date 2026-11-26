/**
 * Fase 2 (escadas): geometria dos quatro tipos, validação, recorte da laje,
 * colisão e o exemplo de sobrado com duas escadas.
 * Rodar com: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APARTAMENTO as SOBRADO } from '../public/js/constants/exemplos/sobrado.js';
import { normalizarDados } from '../public/js/domain/normalizar.js';
import { paraFormatoComAndares, criarAndar } from '../public/js/domain/andares.js';
import {
  geometriaDaEscada, verificarEscadas, recortarAberturas, progressoNoCaminho, comprimentoDe,
  dentroDoPoligono, anguloNaCaracol, escadasDoAndar, acompanharEscada, pontoLivreNoComodo,
} from '../public/js/domain/escadas.js';
import { obstaculosDeEscadasNoAndar, obstaculosDaEscada } from '../public/js/domain/colisao.js';
import { TIPOS_COMODO } from '../public/js/constants/tipos.js';
import { desenharPlanta } from '../public/js/components/planta2d/desenho.js';

const area = (p) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
const escada = (extra) => ({ x: 0, y: 0, sobe: 'norte', giro: 'direita', lance: 90, volta: 360, desnivel: 285, ...extra });

test('degraus: ~17,5 cm, o último degrau é o piso de cima, alturas crescentes', () => {
  for (const [tipo, largura, comprimento] of [['reta', 90, 420], ['L', 300, 305], ['U', 200, 290], ['caracol', 180, 180]]) {
    const g = geometriaDaEscada(escada({ tipo, largura, comprimento }));
    assert.equal(g.espelhos, 16, tipo);
    assert.equal(g.degraus.length, 15, `${tipo}: 15 pisos (o 16º degrau é o andar de cima)`);
    g.degraus.forEach((d, i) => assert.ok(Math.abs(d.altura - (i + 1) * g.espelho) < 1e-9, `${tipo}: altura do degrau ${i + 1}`));
    assert.equal(g.bordas.filter((b) => b.abertaEmbaixo).length > 0, true, `${tipo}: tem entrada`);
    assert.equal(g.bordas.filter((b) => b.abertaEmCima).length > 0, true, `${tipo}: tem chegada`);
  }
});

test('reta: degraus cobrem o contorno e o caminho vai da partida à chegada no sentido de "sobe"', () => {
  const g = geometriaDaEscada(escada({ tipo: 'reta', largura: 90, comprimento: 420 }));
  assert.ok(Math.abs(g.degraus.reduce((s, d) => s + area(d.pontos), 0) - area(g.contorno)) < 1e-6);
  assert.deepEqual(g.caminho, [[45, 420], [45, 0]], 'sobe para o norte (y diminui)');
  const leste = geometriaDaEscada(escada({ tipo: 'reta', largura: 420, comprimento: 90, sobe: 'leste' }));
  assert.deepEqual(leste.caminho, [[0, 45], [420, 45]]);
});

test('L e U: patamar entra como degrau; giro à esquerda espelha', () => {
  const L = geometriaDaEscada(escada({ tipo: 'L', largura: 300, comprimento: 305 }));
  assert.deepEqual(L.caminho.at(-1), [300, 45], 'L para a direita chega pela direita');
  const Le = geometriaDaEscada(escada({ tipo: 'L', largura: 300, comprimento: 305, giro: 'esquerda' }));
  assert.deepEqual(Le.caminho.at(-1), [0, 45], 'L para a esquerda chega pela esquerda');
  const U = geometriaDaEscada(escada({ tipo: 'U', largura: 200, comprimento: 290 }));
  assert.equal(U.caminho[0][1], 290);
  assert.equal(U.caminho.at(-1)[1], 290, 'U chega do mesmo lado em que começa');
  assert.ok(area(U.contorno) < 200 * 290, 'o poço entre os lances não faz parte do contorno');
});

test('caracol: ângulo medido a partir da partida, no sentido da subida', () => {
  const e = escada({ tipo: 'caracol', largura: 180, comprimento: 180 });
  assert.deepEqual([[90, 170], [170, 90], [90, 10], [10, 90]].map(([x, y]) => Math.round(anguloNaCaracol(e, x, y))), [0, 90, 180, 270]);
  const esquerda = { ...e, giro: 'esquerda' };
  assert.equal(Math.round(anguloNaCaracol(esquerda, 10, 90)), 90, 'girando para a esquerda, a esquerda vem primeiro');
});

test('recorte da laje: a área que sobra é a do piso menos o buraco; sem toque, null', () => {
  const piso = [[0, 0], [560, 0], [560, 600], [0, 600]];
  const buraco = [[455, 150], [545, 150], [545, 542], [455, 542]];
  const pedacos = recortarAberturas(piso, [buraco]);
  assert.ok(Math.abs(pedacos.reduce((s, p) => s + area(p), 0) - (area(piso) - area(buraco))) < 1e-6);
  assert.equal(recortarAberturas(piso, [[[700, 0], [800, 0], [800, 100], [700, 100]]]), null);
});

test('progresso no caminho: projeta o ponto na linha poligonal', () => {
  const linha = [[0, 0], [0, 100], [100, 100]];
  assert.equal(comprimentoDe(linha), 200);
  assert.equal(progressoNoCaminho(linha, 5, 50), 50);
  assert.equal(progressoNoCaminho(linha, 60, 95), 160);
});

test('sobrado: duas escadas confortáveis, dentro dos cômodos, sem avisos', () => {
  const { ok, erro, data } = normalizarDados(SOBRADO);
  assert.ok(ok, erro);
  assert.equal(data.escadas.length, 2);
  assert.deepEqual(verificarEscadas(data, TIPOS_COMODO), []);
  const hall = data.escadas.find((e) => e.id === 'escada-hall');
  assert.equal(hall.geo.espelhos, 16);
  assert.ok(Math.abs(hall.geo.piso - 28) < 0.01);
  assert.deepEqual(escadasDoAndar(data, 'terreo').saem.map((e) => e.id), ['escada-hall']);
  assert.deepEqual(escadasDoAndar(data, 'terreo').chegam.map((e) => e.id), ['escada-garagem']);
});

test('avisos: degrau curto, escada estreita e escada fora dos cômodos', () => {
  const bruto = paraFormatoComAndares(SOBRADO);
  Object.assign(bruto.escadas[0], { largura: 60, comprimento: 250, x: -100 });
  const { data } = normalizarDados(bruto);
  const msgs = verificarEscadas(data, TIPOS_COMODO).map((p) => p.mensagem).join('\n');
  assert.match(msgs, /piso de .* é curto/);
  assert.match(msgs, /lance de 60 cm é estreito/);
  assert.match(msgs, /sai dos cômodos do andar "Subsolo"/);
  assert.match(msgs, /sai dos cômodos do andar "Térreo"/);
});

test('erros: escada precisa ligar um andar ao de cima', () => {
  const erro = (escadas) => normalizarDados({ ...paraFormatoComAndares(SOBRADO), escadas }).erro;
  const base = { x: 0, y: 0, largura: 90, comprimento: 300 };
  assert.match(erro([{ ...base, de: 'terreo', para: 'sotao' }]), /"para" precisa ser o id de um andar/);
  assert.match(erro([{ ...base, de: 'superior', para: 'terreo' }]), /liga um andar ao andar logo acima/);
  assert.match(erro([{ ...base, de: 'subsolo', para: 'superior' }]), /liga um andar ao andar logo acima/);
  assert.match(erro([{ de: 'terreo', para: 'superior', x: 0, y: 0, largura: 90 }]), /"comprimento" precisa ser um número/);
});

test('andar novo entre dois andares ligados: a escada passa a chegar nele', () => {
  const bruto = paraFormatoComAndares(SOBRADO);
  const { andar } = criarAndar(bruto, 'terreo', 'acima');
  assert.equal(bruto.escadas.find((e) => e.id === 'escada-hall').para, andar.id);
  assert.ok(normalizarDados(bruto).ok);
});

test('colisão: no andar de baixo só se entra pela partida; no de cima, guarda-corpo menos na chegada', () => {
  const { data } = normalizarDados(SOBRADO);
  const e = data.escadas.find((x) => x.id === 'escada-garagem'); // reta: 4 bordas
  const centro = { cx: 0, cz: 0 };
  assert.equal(obstaculosDeEscadasNoAndar({ saem: [e], chegam: [] }, centro).length, 3, 'laterais + ponta de cima');
  assert.equal(obstaculosDeEscadasNoAndar({ saem: [], chegam: [e] }, centro).length, 3, 'laterais + ponta de baixo');
  assert.equal(obstaculosDaEscada(e, centro).length, 2, 'na escada: só as laterais');
  assert.ok(dentroDoPoligono(500, 300, e.geo.contorno));
});

/** Casa de dois andares com uma escada do tipo pedido, no meio de cômodos grandes. */
function casaComEscada(e) {
  const sala = (id) => ({ id, nome: id, x: 0, y: 0, largura: 1000, comprimento: 1000 });
  return normalizarDados({
    parede: 15,
    andares: [
      { id: 'terreo', nome: 'Térreo', referencia: true, comodos: [sala('baixo')] },
      { id: 'superior', nome: 'Superior', comodos: [sala('cima')] },
    ],
    escadas: [{ id: 'e', de: 'terreo', para: 'superior', x: 400, y: 300, sobe: 'norte', ...e }],
  }).data;
}

/** Pontos a cada 5 cm ao longo de uma linha poligonal. */
function amostrar(linha) {
  const pts = [];
  for (let i = 1; i < linha.length; i++) {
    const [a, b] = [linha[i - 1], linha[i]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
    for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  pts.push(linha.at(-1));
  return pts;
}

/** Estende a linha 30 cm para fora nas duas pontas (começa e termina fora da escada). */
function comFolga(linha) {
  const ext = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]); return [a[0] + (a[0] - b[0]) / d * 30, a[1] + (a[1] - b[1]) / d * 30]; };
  return [ext(linha[0], linha[1]), ...linha, ext(linha.at(-1), linha.at(-2))];
}

/** Anda pelos pontos a partir do andar dado; devolve o andar final e as frações vistas. */
function andarPor(casa, andar, pontos) {
  let estado = { andar, escada: null };
  const fracoes = [];
  for (const [x, y] of pontos) {
    estado = acompanharEscada(estado, casa, x, y);
    if (estado.escada) fracoes.push(estado.fracao);
  }
  return { andar: estado.andar, fracoes };
}

for (const [tipo, extra] of [
  ['reta', { largura: 90, comprimento: 420 }],
  ['L', { largura: 300, comprimento: 305, giro: 'esquerda' }],
  ['U', { largura: 200, comprimento: 290 }],
]) {
  test(`Caminhar (${tipo}): sobe do térreo ao superior e desce de volta`, () => {
    const casa = casaComEscada({ tipo, ...extra });
    const caminho = comFolga(casa.escadas[0].geo.caminho);
    const subida = andarPor(casa, 'terreo', amostrar(caminho));
    assert.equal(subida.andar, 'superior');
    assert.ok(subida.fracoes[0] < 0.05 && subida.fracoes.at(-1) > 0.95, 'começa embaixo e termina em cima');
    assert.ok(subida.fracoes.every((f, i) => i === 0 || f >= subida.fracoes[i - 1] - 1e-9), 'sempre subindo');

    const descida = andarPor(casa, 'superior', amostrar([...caminho].reverse()));
    assert.equal(descida.andar, 'terreo');

    // Entrou e voltou pela partida: continua no térreo
    const [a, b] = [caminho[0], caminho[2]];
    assert.equal(andarPor(casa, 'terreo', amostrar([a, b, a])).andar, 'terreo');
  });
}

test('Caminhar (caracol): uma volta inteira leva ao andar de cima, e o giro é somado sem pular', () => {
  const casa = casaComEscada({ tipo: 'caracol', largura: 180, comprimento: 180 });
  const g = casa.escadas[0].geo;
  const [cx, cy] = g.centro;
  const passo = g.volta / g.degraus.length;
  const no = (graus, r) => [cx + r * Math.sin(graus * Math.PI / 180), cy + r * Math.cos(graus * Math.PI / 180)];
  // Entra pela borda do primeiro degrau, gira até o fim e sai pela borda do último
  const ida = [no(passo / 4, g.raio + 30), no(passo / 4, g.raioCaminho)];
  for (let t = passo / 4; t <= g.volta - passo / 4; t += 5) ida.push(no(t, g.raioCaminho));
  ida.push(no(g.volta - passo / 4, g.raio + 30));
  const subida = andarPor(casa, 'terreo', amostrar(ida));
  assert.equal(subida.andar, 'superior');
  assert.ok(subida.fracoes.at(-1) > 0.95);
  assert.ok(subida.fracoes.every((f, i) => i === 0 || f >= subida.fracoes[i - 1] - 1e-9), 'o ângulo não volta a zero no meio');
  assert.equal(andarPor(casa, 'superior', amostrar([...ida].reverse())).andar, 'terreo');
});

test('ponto livre: fora da escada e dentro do cômodo', () => {
  const { data } = normalizarDados(SOBRADO);
  const hall = data.comodos.find((c) => c.id === 'hall');
  const escada = data.escadas.find((e) => e.id === 'escada-hall');
  const meio = [hall.bb.minX + hall.bb.w / 2, hall.bb.minY + hall.bb.h / 2];
  assert.ok(dentroDoPoligono(...meio, escada.geo.contorno), 'o meio do hall cai na escada');
  const p = pontoLivreNoComodo(hall, [escada.geo.contorno], meio);
  assert.ok(!dentroDoPoligono(...p, escada.geo.contorno));
  assert.ok(dentroDoPoligono(...p, hall.pontos));
});

test('2D: "SOBE" no andar de baixo (com corte), "DESCE" e guarda-corpo no de cima', () => {
  const { data } = normalizarDados(SOBRADO);
  const terreo = data.andares.find((a) => a.id === 'terreo');
  const { markup } = desenharPlanta(terreo, { casa: data });
  assert.match(markup, /data-escada="escada-hall"/);
  assert.match(markup, />SOBE</);
  assert.match(markup, /class="escada-corte"/);
  assert.match(markup, />DESCE</, 'a escada da garagem chega no térreo');
  assert.match(markup, /class="escada-guarda"/);
  assert.doesNotMatch(desenharPlanta(terreo).markup, /escada/, 'sem a casa, nada de escadas');
});
