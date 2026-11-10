/**
 * Ajustes visuais e de interação da planta 2D e do modelo 3D.
 * Distâncias da planta em centímetros (1 unidade do SVG = 1 cm).
 */

export const PLANTA_2D = {
  /** Margem ao redor do desenho dentro do viewBox. */
  margem: 100,
  /** Distância das cotas gerais até o desenho. */
  afastamentoCotas: 45,
  /** Recuo das medidas de parede para dentro do cômodo selecionado. */
  recuoMedidas: 30,
  /** Abaixo deste lado (cm), o nome do cômodo usa fonte menor. */
  ladoCurto: 125,
  /** Cômodos mais estreitos que isto (e mais altos que largos) têm o rótulo girado. */
  larguraRotuloDeitado: 170,
};

export const ZOOM = {
  /** Quanto pode afastar além do enquadramento inicial. */
  maxAfastar: 1.6,
  /** Quanto pode aproximar em relação ao enquadramento inicial. */
  maxAproximar: 12,
  passoBotao: 1.3,
  passoRoda: 1.15,
};

/** Deslocamento (px) a partir do qual um toque vira arrasto. */
export const LIMIAR_ARRASTO_PX = 6;

/** A régua "trava" na horizontal/vertical quando o desvio é menor que isto. */
export const TOLERANCIA_TRAVA_REGUA = 0.08;

export const MODELO_3D = {
  alturaParedesBaixas: 1.0,
  espessuraPiso: 0.04,
  pixelRatioMax: 2,
};
