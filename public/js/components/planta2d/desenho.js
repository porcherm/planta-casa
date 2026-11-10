/**
 * Funções puras que transformam os dados do apartamento em marcação SVG.
 * Não tocam no DOM: recebem dados e devolvem strings.
 */
import { TIPOS_COMODO } from '../../constants/tipos.js';
import { PLANTA_2D } from '../../constants/visualizacao.js';
import { limites, gerarParedes, folhaDaPorta } from '../../domain/geometria.js';
import { escaparHtml } from '../../utils/dom.js';
import { formatarMetros, formatarArea, formatarDimensoes } from '../../utils/formatar.js';
import { pontosSvg, linha, texto, girar, grupo } from '../../utils/svg.js';

/** Desenha a planta completa. Retorna a marcação e o viewBox inicial. */
export function desenharPlanta(dados) {
  const total = limites(dados.comodos, false);
  const interno = limites(dados.comodos, true);
  const m = PLANTA_2D.margem;
  const viewBox = { x: total.minX - m, y: total.minY - m, w: total.w + m * 2, h: total.h + m * 2 };
  const { paredes, guardas } = gerarParedes(dados);

  const markup = [
    desenharDefs(dados.comodos, interno),
    desenharGrade(viewBox),
    desenharPisos(dados.comodos),
    desenharVaos(dados),
    guardas.map((s) => linha('guarda', ...s)).join(''),
    paredes.map((s) => linha('parede', ...s)).join(''),
    grupo('cam-portas', dados.portas.map((p) => desenharPorta(p, interno)).join('')),
    dados.janelas.map(desenharJanela).join(''),
    grupo('cam-nomes', dados.comodos.map(desenharRotulo).join('')),
    desenharCotas(total, interno),
    // Camadas preenchidas depois, conforme a interação
    '<g id="medidas-sel" class="cam-cotas"></g><g id="regua-g"></g>',
  ].join('');

  return { markup, viewBox };
}

/* ---------- Fundo e pisos ---------- */

function desenharDefs(comodos, interno) {
  const origem = `x="${interno.minX}" y="${interno.minY}"`;
  const clips = comodos
    .map((r) => `<clipPath id="clip-${r.id}"><polygon points="${pontosSvg(r.pontos)}"/></clipPath>`)
    .join('');
  return '<defs>' +
    `<pattern id="g50" width="50" height="50" patternUnits="userSpaceOnUse" ${origem}><path class="g-fina" d="M50 0H0V50"/></pattern>` +
    `<pattern id="g100" width="100" height="100" patternUnits="userSpaceOnUse" ${origem}><path class="g-forte" d="M100 0H0V100"/></pattern>` +
    '<pattern id="hachura" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="hach" x1="0" y1="0" x2="0" y2="16"/></pattern>' +
    clips +
    '</defs>';
}

/** Grade bem maior que a vista, para continuar visível ao arrastar e afastar. */
function desenharGrade(vb) {
  const x = vb.x - vb.w * 4, y = vb.y - vb.h * 4, w = vb.w * 9, h = vb.h * 9;
  const ret = (padrao) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${padrao})"/>`;
  return grupo('cam-grade', ret('g50') + ret('g100'));
}

function desenharPisos(comodos) {
  return comodos.map((r) => {
    const pts = pontosSvg(r.pontos);
    const rotuloAcessivel = `${escaparHtml(r.nome)}, ${formatarArea(r.area)}`;
    return `<g class="room" data-id="${r.id}" tabindex="0" role="button" aria-label="${rotuloAcessivel}">` +
      `<polygon class="piso ${r.tipo}" points="${pts}"/>` +
      `<polygon class="anel" clip-path="url(#clip-${r.id})" points="${pts}"/></g>`;
  }).join('');
}

/** Preenche o piso no vão aberto (sem porta), cobrindo a espessura da parede. */
function desenharVaos(dados) {
  const meia = dados.parede / 2;
  if (!meia) return '';
  return dados.portas.filter((p) => p.tipo === 'vao').map((p) => {
    const vertical = p.x1 === p.x2;
    const x = Math.min(p.x1, p.x2) - (vertical ? meia : 0);
    const y = Math.min(p.y1, p.y2) - (vertical ? 0 : meia);
    const w = vertical ? meia * 2 : Math.abs(p.x2 - p.x1);
    const h = vertical ? Math.abs(p.y2 - p.y1) : meia * 2;
    return `<rect class="piso-vao" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  }).join('');
}

/* ---------- Portas e janelas ---------- */

function batente([x, y], horizontal) {
  return horizontal
    ? linha('porta-batente', x, y - 8, x, y + 8)
    : linha('porta-batente', x - 8, y, x + 8, y);
}

/** Porta de correr: duas folhas sobrepostas, deslocadas para lados opostos. */
function desenharPortaDeCorrer(a, b, horizontal) {
  const afast = 4;
  const comp = horizontal ? Math.abs(b[0] - a[0]) : Math.abs(b[1] - a[1]);
  const folha = comp * 0.58;
  if (horizontal) {
    const x0 = Math.min(a[0], b[0]);
    return linha('porta-linha', x0, a[1] - afast, x0 + folha, a[1] - afast) +
      linha('porta-linha', x0 + comp - folha, a[1] + afast, x0 + comp, a[1] + afast);
  }
  const y0 = Math.min(a[1], b[1]);
  return linha('porta-linha', a[0] - afast, y0, a[0] - afast, y0 + folha) +
    linha('porta-linha', a[0] + afast, y0 + comp - folha, a[0] + afast, y0 + comp);
}

/** Porta de abrir: folha a 90° + arco tracejado do giro. */
function desenharFolha(f, classe) {
  const produtoVetorial = (f.o[0] - f.h[0]) * (f.e[1] - f.h[1]) - (f.o[1] - f.h[1]) * (f.e[0] - f.h[0]);
  const sentido = produtoVetorial > 0 ? 1 : 0;
  return linha(classe, f.h[0], f.h[1], f.o[0], f.o[1]) +
    `<path class="porta-arco" d="M${f.o[0]} ${f.o[1]} A${f.w} ${f.w} 0 0 ${sentido} ${f.e[0]} ${f.e[1]}"/>`;
}

/** Texto "ENTRADA" do lado de fora do apartamento. */
function rotuloEntrada(a, b, horizontal, interno) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const cx = interno.minX + interno.w / 2, cy = interno.minY + interno.h / 2;
  if (horizontal) return texto('ent-txt', mx, my > cy ? my + 42 : my - 28, 'ENTRADA');
  return texto('ent-txt', mx > cx ? mx + 70 : mx - 70, my + 6, 'ENTRADA');
}

function desenharPorta(p, interno) {
  const horizontal = p.y1 === p.y2;
  const a = [p.x1, p.y1], b = [p.x2, p.y2];
  const batentes = batente(a, horizontal) + batente(b, horizontal);

  if (p.tipo === 'vao') return linha('porta-vao', ...a, ...b);
  if (p.tipo === 'correr') return desenharPortaDeCorrer(a, b, horizontal) + batentes;

  const classe = p.tipo === 'entrada' ? 'porta-ent' : 'porta-folha';
  const folha = folhaDaPorta(p);
  let s = folha
    ? desenharFolha(folha, classe)
    : linha(p.tipo === 'entrada' ? 'porta-ent' : 'porta-linha', ...a, ...b);
  s += batentes;
  if (p.tipo === 'entrada') s += rotuloEntrada(a, b, horizontal, interno);
  return s;
}

/** Janela: duas linhas de moldura, o vidro no meio e o fechamento nas pontas. */
function desenharJanela(j) {
  const o = 5;
  if (j.y1 === j.y2) {
    return linha('jan-moldura', j.x1, j.y1 - o, j.x2, j.y2 - o) +
      linha('jan-moldura', j.x1, j.y1 + o, j.x2, j.y2 + o) +
      linha('jan-vidro', j.x1, j.y1, j.x2, j.y2) +
      linha('jan-moldura', j.x1, j.y1 - o, j.x1, j.y1 + o) +
      linha('jan-moldura', j.x2, j.y2 - o, j.x2, j.y2 + o);
  }
  return linha('jan-moldura', j.x1 - o, j.y1, j.x2 - o, j.y2) +
    linha('jan-moldura', j.x1 + o, j.y1, j.x2 + o, j.y2) +
    linha('jan-vidro', j.x1, j.y1, j.x2, j.y2) +
    linha('jan-moldura', j.x1 - o, j.y1, j.x1 + o, j.y1) +
    linha('jan-moldura', j.x2 - o, j.y2, j.x2 + o, j.y2);
}

/* ---------- Rótulos e cotas ---------- */

function desenharRotulo(r) {
  const cx = r.rotulo ? r.rotulo[0] : r.bb.minX + r.bb.w / 2;
  const cy = r.rotulo ? r.rotulo[1] : r.bb.minY + r.bb.h / 2;
  const externo = TIPOS_COMODO[r.tipo].externo;
  const curto = Math.min(r.bb.w, r.bb.h) < PLANTA_2D.ladoCurto;
  const classeNome = 'lbl-nome' + ((curto || externo) ? ' sm' : '') + (externo ? ' ext' : '');
  const nome = escaparHtml(r.nome);
  const dimensoes = formatarDimensoes(r);
  const deitado = r.bb.w < PLANTA_2D.larguraRotuloDeitado && r.bb.h > r.bb.w;

  if (deitado) {
    return grupo('lbl',
      texto(classeNome, cx, curto ? cy + 6 : cy - 4, nome) +
      (curto ? '' : texto('lbl-med', cx, cy + 20, dimensoes)),
      girar(-90, cx, cy));
  }
  if (externo) {
    return grupo('lbl', texto(classeNome, cx, cy + 2, nome) + texto('lbl-med', cx, cy + 26, formatarArea(r.area)));
  }
  if (r.tipo === 'indefinido') {
    return grupo('lbl', texto('lbl-q', cx, cy + 10, '?'));
  }
  return grupo('lbl',
    texto(classeNome, cx, cy - 14, nome) +
    texto('lbl-med', cx, cy + 12, `${dimensoes} m`) +
    texto('lbl-area', cx, cy + 36, formatarArea(r.area)));
}

/** Cotas gerais da parte interna (estilo de prancha: traço inclinado nas pontas). */
function desenharCotas(total, I) {
  const yC = total.minY - PLANTA_2D.afastamentoCotas;
  const xC = total.minX - PLANTA_2D.afastamentoCotas;
  const t = 9;
  const meioY = I.minY + I.h / 2;

  const horizontal =
    linha('cota', I.minX, yC, I.maxX, yC) +
    linha('cota', I.minX - t, yC + t, I.minX + t, yC - t) +
    linha('cota', I.maxX - t, yC + t, I.maxX + t, yC - t) +
    texto('cota-txt', I.minX + I.w / 2, yC - 12, formatarMetros(I.w));

  const vertical =
    linha('cota', xC, I.minY, xC, I.maxY) +
    linha('cota', xC - t, I.minY + t, xC + t, I.minY - t) +
    linha('cota', xC - t, I.maxY + t, xC + t, I.maxY - t) +
    `<text class="cota-txt"${girar(-90, xC - 12, meioY)} x="${xC - 12}" y="${meioY}">${formatarMetros(I.h)}</text>`;

  return grupo('cam-cotas', horizontal + vertical);
}

/* ---------- Medidas do cômodo selecionado ---------- */

/** Medida de cada trecho de parede (em cm) do cômodo selecionado. */
export function desenharMedidasDoComodo(r, dados) {
  return r.reto ? medidasRetangulo(r, dados) : medidasPoligono(r);
}

const ROTULO_ABERTURA = { vao: 'vão ', janela: 'jan. ', porta: 'porta ' };

function medidasRetangulo(r, dados) {
  const b = r.bb, meia = dados.parede / 2, recuo = PLANTA_2D.recuoMedidas;
  const lados = [
    { horizontal: true, eixo: b.minY - meia, face: b.minY, inicio: b.minX, fim: b.maxX, dentro: 1 },
    { horizontal: true, eixo: b.maxY + meia, face: b.maxY, inicio: b.minX, fim: b.maxX, dentro: -1 },
    { horizontal: false, eixo: b.minX - meia, face: b.minX, inicio: b.minY, fim: b.maxY, dentro: 1 },
    { horizontal: false, eixo: b.maxX + meia, face: b.maxX, inicio: b.minY, fim: b.maxY, dentro: -1 },
  ];

  let s = '';
  for (const L of lados) {
    const pos = L.face + L.dentro * recuo;
    const posTexto = pos + L.dentro * (L.horizontal ? 17 : 6);

    for (const trecho of dividirLadoEmTrechos(L, dados)) {
      const comp = Math.round(trecho.e - trecho.s);
      const meio = (trecho.s + trecho.e) / 2;
      const classe = trecho.aberto ? 'med-txt ab' : 'med-txt';
      const rotulo = trecho.aberto ? ROTULO_ABERTURA[trecho.tipo] + comp : String(comp);

      if (L.horizontal) {
        s += linha('med-linha', trecho.s, pos, trecho.e, pos) +
          linha('med-linha', trecho.s, pos - 5, trecho.s, pos + 5) +
          linha('med-linha', trecho.e, pos - 5, trecho.e, pos + 5) +
          texto(classe, meio, posTexto, rotulo);
      } else {
        const x = posTexto + (L.dentro > 0 ? 11 : -1);
        s += linha('med-linha', pos, trecho.s, pos, trecho.e) +
          linha('med-linha', pos - 5, trecho.s, pos + 5, trecho.s) +
          linha('med-linha', pos - 5, trecho.e, pos + 5, trecho.e) +
          texto(classe, x, meio, rotulo, girar(-90, x, meio));
      }
    }
  }
  return s;
}

/** Divide um lado do cômodo em trechos de parede cheia e aberturas (portas, vãos, janelas). */
function dividirLadoEmTrechos(L, dados) {
  const naParede = (p) => L.horizontal
    ? (p.y1 === p.y2 && p.y1 === L.eixo)
    : (p.x1 === p.x2 && p.x1 === L.eixo);

  const aberturas = [
    ...dados.portas.map((p) => ({ p, tipo: p.tipo === 'vao' ? 'vao' : 'porta' })),
    ...dados.janelas.map((p) => ({ p, tipo: 'janela' })),
  ]
    .filter(({ p }) => naParede(p))
    .map(({ p, tipo }) => {
      const s0 = L.horizontal ? Math.min(p.x1, p.x2) : Math.min(p.y1, p.y2);
      const e0 = L.horizontal ? Math.max(p.x1, p.x2) : Math.max(p.y1, p.y2);
      return { s: Math.max(s0, L.inicio), e: Math.min(e0, L.fim), aberto: true, tipo };
    })
    .filter((o) => o.e - o.s > 0.5)
    .sort((m, n) => m.s - n.s);

  const trechos = [];
  let cursor = L.inicio;
  for (const o of aberturas) {
    if (o.s > cursor + 0.5) trechos.push({ s: cursor, e: o.s });
    if (o.s >= cursor - 0.5) { trechos.push(o); cursor = o.e; }
  }
  if (L.fim > cursor + 0.5) trechos.push({ s: cursor, e: L.fim });
  return trechos;
}

/** Para formas livres: só o comprimento de cada lado, puxado para o centro. */
function medidasPoligono(r) {
  const p = r.pontos, recuo = PLANTA_2D.recuoMedidas;
  const cx = p.reduce((soma, q) => soma + q[0], 0) / p.length;
  const cy = p.reduce((soma, q) => soma + q[1], 0) / p.length;

  let s = '';
  p.forEach((a, i) => {
    const b = p[(i + 1) % p.length];
    const comp = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (comp < 20) return;
    let mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const dx = cx - mx, dy = cy - my, dist = Math.hypot(dx, dy) || 1;
    mx += dx / dist * recuo;
    my += dy / dist * recuo + 5;
    const vertical = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]);
    s += texto('med-txt', mx, my, String(Math.round(comp)), vertical ? girar(-90, mx, my) : '');
  });
  return s;
}

/* ---------- Régua ---------- */

export function desenharRegua({ ativa, a, b, hover }) {
  if (!ativa || !a) return '';
  const fim = b || hover;
  let s = `<circle class="regua-pt" cx="${a[0]}" cy="${a[1]}" r="7"/>`;
  if (!fim) return s;

  const dist = Math.hypot(fim[0] - a[0], fim[1] - a[1]);
  const mx = (a[0] + fim[0]) / 2, my = (a[1] + fim[1]) / 2;
  const rotulo = formatarMetros(dist);
  const larguraCaixa = rotulo.length * 11 + 20;
  return s +
    linha('regua-linha', a[0], a[1], fim[0], fim[1]) +
    `<circle class="regua-pt" cx="${fim[0]}" cy="${fim[1]}" r="7"/>` +
    `<rect class="regua-caixa" x="${mx - larguraCaixa / 2}" y="${my - 34}" width="${larguraCaixa}" height="28" rx="6"/>` +
    texto('regua-txt', mx, my - 14, rotulo);
}
