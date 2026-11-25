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

/** Impressão em escala. Medidas do papel em milímetros. */
export const IMPRESSAO = {
  papeis: { A4: [210, 297], A3: [297, 420] },
  /** Margem da página em todos os lados. */
  margem: 10,
  /** Altura reservada embaixo para o carimbo (nome, escala, barra de escala). */
  carimbo: 22,
  /** Escalas de desenho técnico (1:N), da maior para a menor. */
  escalas: [50, 75, 100, 125, 150, 200, 250],
};

/** three.js é baixado só quando uma aba 3D é aberta (versão fixa, via CDN). */
export const THREE_CDN = [
  'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
];

export const MODELO_3D = {
  alturaParedesBaixas: 1.0,
  espessuraPiso: 0.04,
  pixelRatioMax: 2,
};

/** Passeio em primeira pessoa (aba "Caminhar"). Distâncias em metros. */
export const PASSEIO = {
  alturaOlhos: 1.6,
  /** "Corpo" da pessoa: não chega mais perto que isto de uma parede. */
  raio: 0.25,
  velocidade: 1.4,
  velocidadeCorrendo: 2.8,
  /** Radianos por pixel ao arrastar para olhar em volta. */
  sensibilidade: 0.004,
  /** Limite para olhar para cima/baixo (radianos, ~80°). */
  inclinacaoMax: 1.4,
  campoDeVisao: 70,
};

/** Editor visual. Distâncias em cm (salvo quando dito px). */
export const EDITOR = {
  /** Passo da grade de encaixe. */
  grade: 5,
  /** Distância (px na tela) em que bordas "grudam" nas dos vizinhos. */
  imaPx: 12,
  /** Distância (px na tela) para um clique "achar" uma parede. */
  alcanceParedePx: 30,
  /** Raio (px na tela) das alças de redimensionar. */
  raioAlcaPx: 7,
  tamanhoMinimo: 30,
  novoComodo: { largura: 300, comprimento: 300 },
  larguraPorta: 80,
  larguraJanela: 120,
  limiteHistorico: 100,
  chaveRascunho: 'roomprint:rascunho-editor',
};
