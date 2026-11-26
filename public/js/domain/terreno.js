/**
 * Terreno: plano (padrão) ou em desnível.
 *
 * Em desnível, o terreno cai em linha reta de um lado da casa ao outro:
 * `{ desce: 'sul', desnivel: 265 }` = no lado norte ele está no nível da rua
 * (cota 0) e no lado sul, 2,65 m abaixo. Fora da casa ele fica reto (um platô
 * em cima e outro embaixo), como num terreno cortado para a construção.
 * Sem DOM: dá para testar com Node.
 */
import { DIRECOES_ESCADA } from '../constants/tipos.js';

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);

export function normalizarTerreno(t) {
  if (!t || typeof t !== 'object') return { desce: null, desnivel: 0 };
  const desce = DIRECOES_ESCADA[t.desce] ? t.desce : null;
  const desnivel = ehNumero(t.desnivel) && t.desnivel > 0 ? Math.min(t.desnivel, 2000) : 0;
  return desce && desnivel ? { desce, desnivel } : { desce: null, desnivel: 0 };
}

/**
 * Altura do terreno (cm, em relação à rua) no ponto (x, y) da planta.
 * `L` = limites da casa ({ minX, minY, maxX, maxY, w, h }).
 */
export function alturaDoTerreno(terreno, L, x, y) {
  if (!terreno?.desce) return 0;
  const t = {
    sul: (y - L.minY) / L.h,
    norte: (L.maxY - y) / L.h,
    leste: (x - L.minX) / L.w,
    oeste: (L.maxX - x) / L.w,
  }[terreno.desce];
  return -terreno.desnivel * Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
}
