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

/** Barra de escala (SVG em mm) com 5 trechos alternados preto/branco. */
function desenharBarraDeEscala(escala) {
  const trechoM = escala <= 60 ? 0.5 : escala <= 125 ? 1 : 2;
  const trechoMm = emMm(trechoM * 100, escala);
  const n = 5, altura = 2.2, topo = 3.6;
  const total = trechoMm * n;
  let s = '';
  for (let i = 0; i < n; i++) {
    s += `<rect x="${i * trechoMm}" y="${topo}" width="${trechoMm}" height="${altura}" fill="${i % 2 ? '#fff' : '#111'}" stroke="#111" stroke-width="0.2"/>`;
  }
  for (let i = 0; i <= n; i++) {
    const rotulo = `${(i * trechoM).toLocaleString('pt-BR')}${i === n ? ' m' : ''}`;
    s += `<text x="${i * trechoMm}" y="2.6" font-size="2.6" text-anchor="${i === 0 ? 'start' : i === n ? 'end' : 'middle'}" fill="#111">${rotulo}</text>`;
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

  const desenhar = () => desenharPlanta(store.dados, { prefixo: 'imp-' });

  function atualizarResumo() {
    const layout = escolherLayout(desenhar().viewBox, pedido());
    resumo.textContent = descricaoLayout(layout);
    resumo.classList.toggle('erro', !layout.cabe);
  }

  /** Monta o bloco que só aparece na impressão. */
  function montarImpressao(layout) {
    const { markup, viewBox } = desenhar();
    const { dados } = store;
    const areaInterna = dados.comodos.filter((c) => !TIPOS_COMODO[c.tipo].externo).reduce((s, c) => s + c.area, 0);
    // Respeita as camadas desligadas em "Mostrar" na planta 2D
    const camadas = [...$('planta').classList].filter((c) => c.startsWith('sem-')).join(' ');

    let bloco = $('impressao');
    if (!bloco) {
      bloco = Object.assign(document.createElement('div'), { id: 'impressao' });
      bloco.setAttribute('aria-hidden', 'true');
      document.body.appendChild(bloco);
    }
    bloco.innerHTML =
      `<svg class="imp-planta ${camadas}" width="${layout.largura}mm" height="${layout.altura}mm" ` +
      `viewBox="${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}" xmlns="http://www.w3.org/2000/svg">${markup}</svg>` +
      '<div class="imp-carimbo">' +
        `<div class="imp-titulo"><strong>${escaparHtml(dados.nome)}</strong><span>Planta baixa · medidas internas em cm</span></div>` +
        `<div class="imp-escala">${desenharBarraDeEscala(layout.escala)}<span>Escala 1:${layout.escala} · ${layout.papel}</span></div>` +
        `<div class="imp-info"><span>Área interna: ${formatarArea(areaInterna)}</span>` +
        `<span>${new Date().toLocaleDateString('pt-BR')} · Roomprint</span></div>` +
      '</div>';

    let pagina = $('imp-pagina');
    if (!pagina) {
      pagina = Object.assign(document.createElement('style'), { id: 'imp-pagina' });
      document.head.appendChild(pagina);
    }
    const [curto, longo] = IMPRESSAO.papeis[layout.papel];
    const [w, h] = layout.orientacao === 'paisagem' ? [longo, curto] : [curto, longo];
    pagina.textContent = `@page { size: ${w}mm ${h}mm; margin: ${IMPRESSAO.margem}mm; }`;
    // Ocupa a folha toda: planta centralizada e carimbo no pé da página (1 mm de folga
    // evita que arredondamentos do navegador empurrem o carimbo para uma 2ª página)
    bloco.style.height = `${h - IMPRESSAO.margem * 2 - 1}mm`;
  }

  $('imprimir-btn').addEventListener('click', () => {
    atualizarResumo();
    dialogo.showModal();
  });
  dialogo.addEventListener('change', atualizarResumo);
  $('imp-cancelar').addEventListener('click', () => dialogo.close());
  $('imp-confirmar').addEventListener('click', () => {
    const layout = escolherLayout(desenhar().viewBox, pedido());
    montarImpressao(layout);
    dialogo.close();
    // Espera o diálogo fechar e o bloco ser desenhado antes de abrir a impressão
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  });
}
