/**
 * Exporta a planta 2D como imagem PNG.
 *
 * Passos:
 * 1. Clona o SVG da tela, enquadrando a planta inteira (ignora o zoom atual).
 * 2. Copia os estilos calculados pelo CSS para atributos de cada elemento,
 *    porque um SVG transformado em imagem não enxerga as folhas de estilo da página.
 * 3. Embute as fontes (Google Fonts) como data URI, para o texto sair igual à tela.
 * 4. Desenha o SVG num <canvas> e baixa o resultado como .png.
 *
 * Respeita as camadas ligadas/desligadas ("Mostrar"), mas deixa de fora a
 * seleção, as medidas do cômodo selecionado e a régua, para a imagem sair limpa.
 */
import { lerVariavelCss } from '../../utils/dom.js';

/** Pixels por centímetro na imagem final (2 = uma planta de 10 m vira 2000 px). */
const ESCALA_PX_POR_CM = 2;

/** Propriedades de estilo que importam para desenhar o SVG. */
const PROPRIEDADES = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight',
  'letter-spacing', 'text-anchor',
];

/** Elementos que não entram na imagem (seleção e ferramentas). */
const IGNORAR = '#medidas-sel, #regua-g, .anel';

export async function exportarPng(svg, viewBox, nomeArquivo) {
  const clone = await prepararClone(svg, viewBox);
  const largura = Math.round(viewBox.w * ESCALA_PX_POR_CM);
  const altura = Math.round(viewBox.h * ESCALA_PX_POR_CM);
  clone.setAttribute('width', largura);
  clone.setAttribute('height', altura);

  const marcacao = new XMLSerializer().serializeToString(clone);
  const imagem = await carregarImagem(new Blob([marcacao], { type: 'image/svg+xml;charset=utf-8' }));

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = lerVariavelCss('--bg', '#04060b');
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(imagem, 0, 0, largura, altura);

  const png = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
  baixar(png, nomeArquivo);
}

/** Gera um nome de arquivo seguro a partir do nome da casa. */
export function nomeDoArquivo(nomeDaCasa) {
  const slug = String(nomeDaCasa)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `planta-${slug || 'casa'}.png`;
}

/* ---------- Etapas ---------- */

async function prepararClone(svg, viewBox) {
  // Tira a seleção por um instante para ler as cores "neutras" dos pisos
  const selecionados = [...svg.querySelectorAll('.room.is-sel')];
  selecionados.forEach((g) => g.classList.remove('is-sel'));
  let clone;
  try {
    clone = svg.cloneNode(true);
    copiarEstilos(svg, clone);
  } finally {
    selecionados.forEach((g) => g.classList.add('is-sel'));
  }

  clone.querySelectorAll(IGNORAR).forEach((el) => el.remove());
  clone.removeAttribute('class');
  clone.removeAttribute('style');
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);

  const estilo = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  estilo.textContent = await fontesEmbutidas();
  clone.insertBefore(estilo, clone.firstChild);
  return clone;
}

/**
 * Percorre o original e o clone em paralelo (mesma estrutura) e grava em cada
 * elemento do clone os estilos calculados no original. Elementos ocultos
 * (camadas desligadas) são removidos.
 */
function copiarEstilos(original, clone) {
  const origens = [original, ...original.querySelectorAll('*')];
  const destinos = [clone, ...clone.querySelectorAll('*')];
  const remover = [];

  origens.forEach((el, i) => {
    const destino = destinos[i];
    const calculado = getComputedStyle(el);
    if (calculado.display === 'none') { remover.push(destino); return; }
    const declaracoes = PROPRIEDADES
      .map((p) => [p, calculado.getPropertyValue(p)])
      .filter(([, v]) => v && v !== 'normal')
      .map(([p, v]) => `${p}:${v}`);
    destino.setAttribute('style', declaracoes.join(';'));
    destino.removeAttribute('class');
  });

  remover.forEach((el) => el.remove());
}

/* ---------- Fontes ---------- */

let cacheFontes = null;

/**
 * Baixa o CSS do Google Fonts usado pela página e troca cada url() de fonte
 * por um data URI. Só mantém o subconjunto latino (cobre português).
 * Se algo falhar (ex.: sem internet), devolve vazio e a imagem usa fontes do sistema.
 */
function fontesEmbutidas() {
  cacheFontes ??= (async () => {
    try {
      const link = document.querySelector('link[href*="fonts.googleapis.com/css"]');
      if (!link) return '';
      const css = await (await fetch(link.href)).text();
      const blocos = (css.match(/@font-face\s*{[^}]*}/g) || [])
        .filter((b) => /U\+0000-00FF/i.test(b));
      const urls = [...new Set(blocos.flatMap((b) => [...b.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1])))];
      const dataUris = Object.fromEntries(await Promise.all(urls.map(async (u) => [u, await paraDataUri(u)])));
      return blocos.map((b) => b.replace(/url\((https:[^)]+)\)/g, (_, u) => `url(${dataUris[u]})`)).join('\n');
    } catch (e) {
      console.warn('[Roomprint] Não foi possível embutir as fontes no PNG:', e);
      return '';
    }
  })();
  return cacheFontes;
}

async function paraDataUri(url) {
  const blob = await (await fetch(url)).blob();
  return new Promise((ok, erro) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(leitor.result);
    leitor.onerror = erro;
    leitor.readAsDataURL(blob);
  });
}

/* ---------- Utilitários ---------- */

function carregarImagem(blob) {
  const url = URL.createObjectURL(blob);
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Falha ao gerar a imagem da planta.')); };
    img.src = url;
  });
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
