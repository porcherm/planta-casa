/**
 * Aba "Corte": a vista em corte da casa (seção vertical), gerada dos dados.
 *
 * - AA (horizontal): a linha passa em y = posição e o corte é visto de baixo da planta.
 * - BB (vertical): a linha passa em x = posição e o corte é visto da esquerda.
 * - O controle "Posição" (ou um clique no mapa do canto) muda onde a linha passa.
 *
 * O desenho é em cm (1 unidade do SVG = 1 cm), com a altura para cima.
 */
import { gerarCorte, faixaDoCorte, posicaoInicialDoCorte } from '../../domain/corte.js';
import { limites } from '../../domain/geometria.js';
import { ZOOM } from '../../constants/visualizacao.js';
import { $, escaparHtml } from '../../utils/dom.js';
import { formatarMetros } from '../../utils/formatar.js';
import { pontosSvg, linha, texto } from '../../utils/svg.js';
import { criarViewport } from '../planta2d/viewport.js';
import { registrarGestos } from '../planta2d/gestos.js';
import { exportarPng, nomeDoArquivo } from '../planta2d/exportar.js';
import { formatarCota } from '../seletor-andar.js';

const retangulo = (classe, { a, b, z0, z1 }) =>
  `<rect class="${classe}" x="${a}" y="${-z1}" width="${b - a}" height="${z1 - z0}"/>`;

/** Marcação SVG do corte (pura: recebe o corte já calculado). */
export function desenharCorte(corte, titulo) {
  const L = corte.limites;
  const s = [];
  s.push('<defs><pattern id="corte-hachura" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<line class="corte-hach" x1="0" y1="0" x2="0" y2="14"/></pattern></defs>');

  // Linhas de nível (fundo) e terreno
  for (const n of corte.niveis) s.push(linha('corte-nivel', L.uMin, -n.z, L.uMax, -n.z));
  for (const perfil of corte.terreno) {
    const fundo = [[perfil[perfil.length - 1][0], L.zMin], [perfil[0][0], L.zMin]];
    s.push(`<polygon class="corte-terra" points="${pontosSvg([...perfil, ...fundo].map(([u, z]) => [u, -z]))}"/>`);
    s.push(`<polyline class="corte-terreno" points="${pontosSvg(perfil.map(([u, z]) => [u, -z]))}"/>`);
  }

  // O que foi cortado: lajes, paredes, vergas/peitoris, cobertura (cheios em petróleo)
  for (const r of [...corte.lajes, ...corte.paredes, ...corte.vergas, ...corte.cobertura]) s.push(retangulo('corte-cheio', r));
  for (const r of corte.degraus) s.push(retangulo('corte-degrau', r));
  for (const r of corte.guardas) s.push(retangulo('corte-guarda', r));
  for (const v of corte.vidros) s.push(linha('corte-vidro', v.u, -v.z0, v.u, -v.z1));
  for (const t of corte.telhado) {
    const [[u1, z1], [u2, z2]] = t.pontos;
    s.push(linha(t.tipo === 'oitao' ? 'corte-oitao' : 'corte-telhado', u1, -z1, u2, -z2));
  }

  // Textos: cômodos, níveis (à esquerda) e pé-direito de cada andar (à direita)
  for (const r of corte.rotulos) s.push(texto('corte-rotulo', r.u, -r.z, escaparHtml(r.texto)));
  const xNivel = L.uMin + 30, xCota = L.uMax - 40;
  for (const n of corte.niveis) {
    s.push(`<path class="corte-marca" d="M${xNivel} ${-n.z} l-9 -14 h18 z"/>`);
    s.push(texto('corte-nivel-txt', xNivel + 16, -n.z - 6, `${formatarCota(n.z)} ${escaparHtml(n.nome)}`));
    s.push(linha('corte-cota', xCota, -n.z, xCota, -(n.z + n.peDireito)) +
      linha('corte-cota', xCota - 8, -n.z + 8, xCota + 8, -n.z - 8) +
      linha('corte-cota', xCota - 8, -(n.z + n.peDireito) + 8, xCota + 8, -(n.z + n.peDireito) - 8));
    const meio = -(n.z + n.peDireito / 2);
    s.push(`<text class="corte-cota-txt" x="${xCota - 10}" y="${meio}" transform="rotate(-90 ${xCota - 10} ${meio})">${formatarMetros(n.peDireito)}</text>`);
  }
  s.push(texto('corte-titulo', L.uMin + 20, -L.zMax + 36, escaparHtml(titulo)));
  return s.join('');
}

/** Mapa pequeno: os cômodos de todos os andares e a linha do corte. */
function desenharMapa(casa, direcao, posicao) {
  const T = limites(casa.comodos, false);
  const m = 60;
  const vb = { x: T.minX - m, y: T.minY - m, w: T.w + m * 2, h: T.h + m * 2 };
  const pisos = casa.andares.map((a, i) => a.comodos.map((r) =>
    `<polygon class="mapa-comodo${i === 0 ? ' base' : ''}" points="${pontosSvg(r.pontos)}"/>`).join('')).join('');
  const [x1, y1, x2, y2] = direcao === 'horizontal'
    ? [vb.x, posicao, vb.x + vb.w, posicao]
    : [posicao, vb.y, posicao, vb.y + vb.h];
  const letra = direcao === 'horizontal' ? 'A' : 'B';
  return {
    viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
    markup: `<rect class="mapa-fundo" x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}"/>${pisos}` +
      linha('mapa-linha', x1, y1, x2, y2) +
      texto('mapa-letra', direcao === 'horizontal' ? x1 + 30 : x1 + 34, direcao === 'horizontal' ? y1 + 44 : y1 + 50, letra) +
      texto('mapa-letra', direcao === 'horizontal' ? x2 - 30 : x2 + 34, direcao === 'horizontal' ? y2 + 44 : y2 - 20, letra),
  };
}

export function iniciarCorte(store) {
  const svg = $('corte-svg');
  const mapa = $('corte-mapa');
  const controle = $('corte-pos');
  const viewport = criarViewport(svg);
  let direcao = 'horizontal';
  let posicao = null;
  let ativo = false;
  let desatualizado = true;

  const nomeDoCorte = () => (direcao === 'horizontal' ? 'Corte AA' : 'Corte BB');

  function desenhar({ reenquadrar = false } = {}) {
    const casa = store.dados;
    const [min, max] = faixaDoCorte(casa, direcao);
    if (posicao == null || posicao < min || posicao > max) posicao = posicaoInicialDoCorte(casa, direcao);
    Object.assign(controle, { min, max });
    controle.value = posicao;
    const eixo = direcao === 'horizontal' ? 'y' : 'x';
    $('corte-pos-txt').textContent = `${eixo} = ${posicao} cm`;

    const corte = gerarCorte(casa, { direcao, posicao });
    const L = corte.limites;
    svg.innerHTML = desenharCorte(corte, `${nomeDoCorte()} · ${casa.nome}`);
    viewport.definirBase({ x: L.uMin, y: -L.zMax, w: L.uMax - L.uMin, h: L.zMax - L.zMin });
    if (reenquadrar) viewport.ajustar();

    const m = desenharMapa(casa, direcao, posicao);
    mapa.setAttribute('viewBox', m.viewBox);
    mapa.innerHTML = m.markup;
    $('corte-dica').textContent = direcao === 'horizontal'
      ? `Linha do corte em y = ${posicao} cm, vista de baixo da planta · clique no mapa para mudar`
      : `Linha do corte em x = ${posicao} cm, vista da esquerda da planta · clique no mapa para mudar`;
    desatualizado = false;
  }

  function mudarDirecao(nova) {
    if (nova === direcao) return;
    direcao = nova;
    posicao = null;
    $('corte-h').setAttribute('aria-pressed', String(direcao === 'horizontal'));
    $('corte-v').setAttribute('aria-pressed', String(direcao === 'vertical'));
    desenhar({ reenquadrar: true });
  }

  $('corte-h').addEventListener('click', () => mudarDirecao('horizontal'));
  $('corte-v').addEventListener('click', () => mudarDirecao('vertical'));
  controle.addEventListener('input', () => { posicao = Number(controle.value); desenhar(); });

  // Clique (ou arrasto) no mapa: a linha vai para lá
  mapa.addEventListener('pointerdown', (e) => {
    const moverPara = (ev) => {
      const ctm = mapa.getScreenCTM();
      if (!ctm) return;
      const p = mapa.createSVGPoint();
      p.x = ev.clientX; p.y = ev.clientY;
      const q = p.matrixTransform(ctm.inverse());
      const [min, max] = faixaDoCorte(store.dados, direcao);
      posicao = Math.round(Math.min(max, Math.max(min, direcao === 'horizontal' ? q.y : q.x)) / 5) * 5;
      desenhar();
    };
    moverPara(e);
    mapa.setPointerCapture?.(e.pointerId);
    const mover = (ev) => moverPara(ev);
    const soltar = () => { mapa.removeEventListener('pointermove', mover); mapa.removeEventListener('pointerup', soltar); };
    mapa.addEventListener('pointermove', mover);
    mapa.addEventListener('pointerup', soltar);
  });

  registrarGestos(svg, {
    aoTocar: () => {},
    aoArrastar: (dx, dy) => viewport.arrastar(dx, dy),
    aoPincar: (fator, x, y) => viewport.zoom(fator, x, y),
    aoPairar: () => {},
  });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    viewport.zoom(e.deltaY < 0 ? ZOOM.passoRoda : 1 / ZOOM.passoRoda, e.clientX, e.clientY);
  }, { passive: false });
  $('corte-zoom-mais').addEventListener('click', () => viewport.zoom(ZOOM.passoBotao));
  $('corte-zoom-menos').addEventListener('click', () => viewport.zoom(1 / ZOOM.passoBotao));
  $('corte-ajustar').addEventListener('click', () => viewport.ajustar());
  $('corte-png').addEventListener('click', async (e) => {
    const botao = e.currentTarget;
    botao.disabled = true;
    try {
      await exportarPng(svg, viewport.obterBase(), nomeDoArquivo(`${store.dados.nome} ${nomeDoCorte()}`));
    } catch (erro) {
      console.error(erro);
      $('corte-dica').textContent = 'Não foi possível gerar o PNG neste navegador.';
    } finally {
      botao.disabled = false;
    }
  });

  store.observarDados(() => { if (ativo) desenhar(); else desatualizado = true; });

  return {
    ativar() {
      ativo = true;
      if (desatualizado || posicao == null) desenhar({ reenquadrar: true });
    },
    desativar() { ativo = false; },
  };
}
