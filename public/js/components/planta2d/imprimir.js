/**
 * Impressão da planta 2D em escala (1:50, 1:75, 1:100…), pronta para "Salvar como PDF".
 *
 * Como funciona:
 * - A planta é redesenhada num SVG com largura e altura em milímetros. Como o
 *   desenho é em centímetros, na escala 1:N cada 1 cm real vira 10/N mm no papel.
 * - Um bloco #impressao (escondido na tela) recebe a planta, o carimbo e a barra
 *   de escala; o CSS de impressão esconde todo o resto e usa fundo branco.
 * - O tamanho da página (@page) é definido na hora, conforme papel e orientação.
 */
import { IMPRESSAO } from '../../constants/visualizacao.js';
import { TIPOS_COMODO } from '../../constants/tipos.js';
import { $, escaparHtml } from '../../utils/dom.js';
import { formatarArea } from '../../utils/formatar.js';
import { desenharPlanta } from './desenho.js';
import { andarVizinho, areaInterna } from '../../domain/andares.js';
import { formatarCota } from '../seletor-andar.js';

/** Tamanho no papel (mm) de uma medida real em cm, na escala 1:N. */
const emMm = (cm, escala) => (cm * 10) / escala;

/** Área útil da folha (mm), já sem margens e sem o carimbo. */
function areaUtil(papel, orientacao) {
  const [curto, longo] = IMPRESSAO.papeis[papel];
  const [w, h] = orientacao === 'paisagem' ? [longo, curto] : [curto, longo];
  return { w: w - IMPRESSAO.margem * 2, h: h - IMPRESSAO.margem * 2 - IMPRESSAO.carimbo };
}

/**
 * Escolhe escala e orientação.
 * @param {{w:number,h:number}} desenho  tamanho real do desenho, em cm
 * @param {{papel:string, orientacao:'auto'|'retrato'|'paisagem', escala:'auto'|number}} pedido
 * @returns {{escala:number, orientacao:string, papel:string, largura:number, altura:number, cabe:boolean}}
 */
export function escolherLayout(desenho, { papel, orientacao, escala }) {
  // Tenta primeiro a orientação que combina com o formato do desenho
  const preferida = desenho.w > desenho.h ? ['paisagem', 'retrato'] : ['retrato', 'paisagem'];
  const orientacoes = orientacao === 'auto' ? preferida : [orientacao];
  const escalas = escala === 'auto' ? IMPRESSAO.escalas : [escala];

  const montar = (n, o) => {
    const largura = emMm(desenho.w, n), altura = emMm(desenho.h, n);
    const util = areaUtil(papel, o);
    return { escala: n, orientacao: o, papel, largura, altura, cabe: largura <= util.w && altura <= util.h };
  };

  for (const n of escalas) {
    for (const o of orientacoes) {
      const opcao = montar(n, o);
      if (opcao.cabe) return opcao;
    }
  }
  // Nada coube: devolve a menor escala pedida, na orientação preferida, avisando
  return montar(escalas[escalas.length - 1], orientacoes[0]);
}

/** Barra de escala (SVG em mm) com 5 trechos alternados petróleo/branco. */
function desenharBarraDeEscala(escala) {
  const trechoM = escala <= 60 ? 0.5 : escala <= 125 ? 1 : 2;
  const trechoMm = emMm(trechoM * 100, escala);
  const n = 5, altura = 2.2, topo = 3.6;
  const total = trechoMm * n;
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<rect x="${i * trechoMm}" y="${topo}" width="${trechoMm}" height="${altura}" fill="${i % 2 ? '#fff' : '#1B4E77'}" stroke="#1B4E77" stroke-width="0.2"/>`;
  }
  for (let i = 0; i <= n; i++) {
    const rotulo = `${(i * trechoM).toLocaleString('pt-BR')}${i === n ? ' m' : ''}`;
    s += `<text x="${i * trechoMm}" y="2.6" font-size="2.6" text-anchor="${i === 0 ? 'start' : i === n ? 'end' : 'middle'}" fill="#0F2233">${rotulo}</text>`;
  }
  return `<svg class="imp-barra" width="${total + 0.4}mm" height="${topo + altura + 0.4}mm" viewBox="-0.2 0 ${total + 0.4} ${topo + altura + 0.4}">${s}</svg>`;
}

function descricaoLayout(l) {
  const tamanho = `${Math.round(l.largura)} × ${Math.round(l.altura)} mm`;
  if (l.cabe) return `Escala 1:${l.escala} · ${l.papel} ${l.orientacao} · a planta ocupa ${tamanho} na folha.`;
  return `Não cabe em ${l.papel} na escala 1:${l.escala} (precisaria de ${tamanho}). Escolha uma escala menor, papel A3 ou "Automática".`;
}

export function iniciarImpressao(store) {
  const dialogo = $('dialogo-imprimir');
  const resumo = $('imp-resumo');

  const pedido = () => ({
    papel: $('imp-papel').value,
    orientacao: $('imp-orientacao').value,
    escala: $('imp-escala').value === 'auto' ? 'auto' : Number($('imp-escala').value),
  });

  const varios = () => store.dados.andares.length > 1;
  /** Andares que vão para o papel: o visível, ou todos (uma folha cada). */
  const andaresParaImprimir = () =>
    (varios() && $('imp-andares').value === 'todos' ? store.dados.andares : [store.andar]);

  // Todos os andares usam o enquadramento da casa: mesma escala e mesma posição em todas as folhas
  const desenhar = (andar, prefixo = 'imp-') => desenharPlanta(andar, {
    prefixo,
    casa: store.dados,
    fantasma: andarVizinho(store.dados, andar.id, 'abaixo'),
  });

  function atualizarResumo() {
    const layout = escolherLayout(desenhar(store.andar).viewBox, pedido());
    const folhas = andaresParaImprimir().length;
    resumo.textContent = descricaoLayout(layout) + (folhas > 1 ? ` ${folhas} folhas, uma por andar.` : '');
    resumo.classList.toggle('erro', !layout.cabe);
  }

  /** Uma folha: a planta de um andar e o carimbo. */
  function montarFolha(andar, i, layout, camadas) {
    const prefixo = `imp-${i}-`;
    const { markup, viewBox } = desenhar(andar, prefixo);
    const { dados } = store;
    const area = areaInterna(andar.comodos, TIPOS_COMODO);
    const qual = varios() ? ` · ${escaparHtml(andar.nome)} (piso a ${formatarCota(andar.cota)} m)` : '';
    return '<div class="imp-folha">' +
      `<svg class="imp-planta ${camadas}" width="${layout.largura}mm" height="${layout.altura}mm" data-prefixo="${prefixo}" ` +
      `viewBox="${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}" xmlns="http://www.w3.org/2000/svg">${markup}</svg>` +
      '<div class="imp-carimbo">' +
        `<div class="imp-titulo"><strong>${escaparHtml(dados.nome)}</strong><span>Planta baixa${qual} · medidas internas em cm</span></div>` +
        `<div class="imp-escala">${desenharBarraDeEscala(layout.escala)}<span>Escala 1:${layout.escala} · ${layout.papel}</span></div>` +
        `<div class="imp-info"><span>Área interna${varios() ? ' do andar' : ''}: ${formatarArea(area)}</span>` +
        `<span>${new Date().toLocaleDateString('pt-BR')} · Roomprint</span></div>` +
      '</div></div>';
  }

  /** Monta o bloco que só aparece na impressão (uma folha por andar escolhido). */
  function montarImpressao(layout) {
    // Respeita as camadas desligadas em "Mostrar" na planta 2D
    const camadas = [...$('planta').classList].filter((c) => c.startsWith('sem-')).join(' ');

    let bloco = $('impressao');
    if (!bloco) {
      bloco = Object.assign(document.createElement('div'), { id: 'impressao' });
      bloco.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bloco);
    }
    bloco.innerHTML = andaresParaImprimir().map((a, i) => montarFolha(a, i, layout, camadas)).join('');
    // Cada folha tem os seus padrões (ids com prefixo próprio): a hachura de "a confirmar" aponta para o dela
    bloco.querySelectorAll('svg[data-prefixo]').forEach((svg) => {
      svg.querySelectorAll('.piso.indefinido').forEach((p) => { p.style.fill = `url(#${svg.dataset.prefixo}hachura)`; });
    });

    let pagina = $('imp-pagina');
    if (!pagina) {
      pagina = Object.assign(document.createElement('style'), { id: 'imp-pagina' });
      document.head.appendChild(pagina);
    }
    const [curto, longo] = IMPRESSAO.papeis[layout.papel];
    const [w, h] = layout.orientacao === 'paisagem' ? [longo, curto] : [curto, longo];
    pagina.textContent = `@page { size: ${w}mm ${h}mm; margin: ${IMPRESSAO.margem}mm; }`;
    // Cada folha ocupa a página toda: planta centralizada e carimbo no pé (1 mm de folga
    // evita que arredondamentos do navegador empurrem o carimbo para a página seguinte)
    bloco.querySelectorAll('.imp-folha').forEach((f) => { f.style.height = `${h - IMPRESSAO.margem * 2 - 1}mm`; });
  }

  $('imprimir-btn').addEventListener('click', () => {
    $('imp-andares-campo').hidden = !varios();
    atualizarResumo();
    dialogo.showModal();
  });
  dialogo.addEventListener('change', atualizarResumo);
  $('imp-cancelar').addEventListener('click', () => dialogo.close());
  $('imp-confirmar').addEventListener('click', () => {
    const layout = escolherLayout(desenhar(store.andar).viewBox, pedido());
    montarImpressao(layout);
    dialogo.close();
    // Espera o diálogo fechar e o bloco ser desenhado antes de abrir a impressão
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  });
}
