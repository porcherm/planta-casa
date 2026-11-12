import { ZOOM } from '../../constants/visualizacao.js';

/**
 * Controla o viewBox do SVG: enquadramento, zoom e arrasto.
 * `base` é o enquadramento inicial; `atual` é o que está na tela.
 */
export function criarViewport(svg) {
  let base = null;
  let atual = null;

  const aplicar = () => {
    if (atual) svg.setAttribute('viewBox', `${atual.x} ${atual.y} ${atual.w} ${atual.h}`);
  };

  /** Converte coordenadas da tela (px) para coordenadas da planta (cm). */
  function paraPlanta(clienteX, clienteY) {
    const matriz = svg.getScreenCTM();
    if (!matriz) return null;
    const ponto = svg.createSVGPoint();
    ponto.x = clienteX;
    ponto.y = clienteY;
    const q = ponto.matrixTransform(matriz.inverse());
    return [q.x, q.y];
  }

  return {
    paraPlanta,

    /** Enquadramento da planta inteira (independe do zoom atual). */
    obterBase: () => (base ? { ...base } : null),

    definirBase(viewBox) {
      base = viewBox;
      if (!atual) atual = { ...base };
      aplicar();
    },

    /** Zoom por um fator, mantendo fixo o ponto sob o cursor (ou o centro). */
    zoom(fator, clienteX, clienteY) {
      if (!atual || !base) return;
      const novaLargura = Math.min(base.w * ZOOM.maxAfastar, Math.max(base.w / ZOOM.maxAproximar, atual.w / fator));
      const k = novaLargura / atual.w;
      const centro = (clienteX == null ? null : paraPlanta(clienteX, clienteY))
        || [atual.x + atual.w / 2, atual.y + atual.h / 2];
      atual = {
        x: centro[0] - (centro[0] - atual.x) * k,
        y: centro[1] - (centro[1] - atual.y) * k,
        w: atual.w * k,
        h: atual.h * k,
      };
      aplicar();
    },

    /** Move a vista acompanhando o dedo/mouse (deslocamento em px). */
    arrastar(dxTela, dyTela) {
      const matriz = svg.getScreenCTM();
      if (!matriz || !atual) return;
      atual.x -= dxTela / matriz.a;
      atual.y -= dyTela / matriz.d;
      aplicar();
    },

    /** Volta ao enquadramento inicial. */
    ajustar() {
      if (!base) return;
      atual = { ...base };
      aplicar();
    },
  };
}
