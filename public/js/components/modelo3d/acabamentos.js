/**
 * Acabamentos do 3D: texturas desenhadas na hora (canvas), sem baixar imagens.
 *
 * Cada textura representa um pedaço real de material (ex.: 1,2 m × 1,2 m de
 * piso) e se repete. Como as coordenadas de textura dos pisos e do telhado já
 * estão em metros, `repeat = 1 / tamanho do pedaço` deixa tábuas e ladrilhos
 * no tamanho de verdade, qualquer que seja o cômodo.
 *
 * As cores partem dos tons da paleta (TIPOS_COMODO.cor3d etc.) com pequenas
 * variações, e o sorteio usa uma semente fixa: o desenho sai sempre igual.
 * Depende do `THREE` global.
 */

const cache = new Map();

/** Sorteio determinístico (mulberry32). */
function sorteio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cor hex clareada/escurecida (fator −1 … 1). */
function variar(hex, fator) {
  const n = parseInt(hex.slice(1), 16);
  const canal = (v) => Math.round(Math.max(0, Math.min(255, fator >= 0 ? v + (255 - v) * fator : v * (1 + fator))));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(canal);
  return `rgb(${r},${g},${b})`;
}

function criarTextura(chave, tamanhoPx, metros, desenhar) {
  if (cache.has(chave)) return cache.get(chave);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = tamanhoPx;
  desenhar(canvas.getContext('2d'), tamanhoPx);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metros, 1 / metros);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  cache.set(chave, t);
  return t;
}

/** Tábuas de madeira: 12 cm de largura, comprimentos variados e juntas desencontradas. */
function madeira(base) {
  return criarTextura(`madeira${base}`, 512, 1.2, (ctx, s) => {
    const r = sorteio(7);
    const linhas = 10, alt = s / linhas;
    for (let i = 0; i < linhas; i++) {
      let x = -r() * s * 0.6;
      while (x < s) {
        const comp = s * (0.45 + r() * 0.5);
        ctx.fillStyle = variar(base, (r() - 0.5) * 0.14);
        ctx.fillRect(x, i * alt, comp, alt);
        // veios finos
        ctx.globalAlpha = 0.07;
        ctx.strokeStyle = variar(base, -0.35);
        for (let v = 0; v < 4; v++) {
          const y = i * alt + alt * (0.2 + r() * 0.6);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + comp * 0.3, y + 2, x + comp * 0.6, y - 2, x + comp, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = variar(base, -0.28);
        ctx.fillRect(x, i * alt, 1.5, alt); // junta de topo
        x += comp;
      }
      ctx.fillStyle = variar(base, -0.25);
      ctx.fillRect(0, i * alt, s, 1.5); // junta lateral
    }
  });
}

/** Porcelanato 60 × 60 cm com rejunte fino e uma leve mancha. */
function porcelanato(base) {
  return criarTextura(`porcelanato${base}`, 512, 1.2, (ctx, s) => {
    const r = sorteio(11);
    const n = 2, lado = s / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = variar(base, (r() - 0.5) * 0.05);
        ctx.fillRect(i * lado, j * lado, lado, lado);
        for (let k = 0; k < 90; k++) {
          ctx.globalAlpha = 0.04;
          ctx.fillStyle = variar(base, r() > 0.5 ? 0.25 : -0.2);
          ctx.beginPath();
          ctx.arc(i * lado + r() * lado, j * lado + r() * lado, 4 + r() * 22, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = variar(base, 0.35);
    for (let i = 0; i <= n; i++) { ctx.fillRect(i * lado - 1.5, 0, 3, s); ctx.fillRect(0, i * lado - 1.5, s, 3); }
  });
}

/** Deck: tábuas estreitas (9 cm) com frestas. */
function deck(base) {
  return criarTextura(`deck${base}`, 512, 1.0, (ctx, s) => {
    const r = sorteio(3);
    const linhas = 11, alt = s / linhas;
    ctx.fillStyle = variar(base, -0.45);
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < linhas; i++) {
      ctx.fillStyle = variar(base, (r() - 0.5) * 0.12);
      ctx.fillRect(0, i * alt + 2, s, alt - 4);
    }
  });
}

/** Piso de um tipo de cômodo, a partir da cor base dele. */
export function texturaDePiso(tipo, corBase) {
  if (tipo === 'interno') return madeira('#CDB596');   // madeira clara, puxada para o marfim
  if (tipo === 'circulacao') return porcelanato(corBase);
  if (tipo === 'sacada') return deck(corBase);
  return null;
}

/** Telhas: faixas no sentido da caída da água, em fiadas. */
export function texturaDeTelha(base) {
  return criarTextura(`telha${base}`, 256, 1.0, (ctx, s) => {
    const r = sorteio(5);
    const colunas = 5, larg = s / colunas;
    for (let i = 0; i < colunas; i++) {
      const grad = ctx.createLinearGradient(i * larg, 0, (i + 1) * larg, 0);
      grad.addColorStop(0, variar(base, -0.25));
      grad.addColorStop(0.5, variar(base, 0.12 + (r() - 0.5) * 0.06));
      grad.addColorStop(1, variar(base, -0.25));
      ctx.fillStyle = grad;
      ctx.fillRect(i * larg, 0, larg, s);
    }
    ctx.fillStyle = variar(base, -0.4);
    for (let j = 0; j < 3; j++) ctx.fillRect(0, (j * s) / 3, s, 2); // fiadas
  });
}

/** Terreno: marfim terroso com pontinhos, para o declive não ficar chapado. */
export function texturaDeTerreno(base) {
  return criarTextura(`terreno${base}`, 256, 2.0, (ctx, s) => {
    const r = sorteio(13);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let k = 0; k < 1400; k++) {
      ctx.fillStyle = variar(base, (r() - 0.5) * 0.3);
      ctx.fillRect(r() * s, r() * s, 1 + r() * 2.5, 1 + r() * 2.5);
    }
  });
}

/** Céu: degradê vertical do marfim (horizonte) ao petróleo bem claro (alto). */
export function texturaDeCeu(horizonte, alto) {
  if (cache.has('ceu')) return cache.get('ceu');
  const canvas = document.createElement('canvas');
  canvas.width = 2; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, alto);
  grad.addColorStop(0.65, horizonte);
  grad.addColorStop(1, horizonte);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(canvas);
  t.encoding = THREE.sRGBEncoding;
  cache.set('ceu', t);
  return t;
}
