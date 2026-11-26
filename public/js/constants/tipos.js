/**
 * Catálogos de tipos usados pela validação, pela planta 2D e pelo modelo 3D.
 */

/**
 * Tipos de cômodo.
 * - externo: não recebe paredes (vira guarda-corpo) e não entra na área interna.
 * - semParede: não gera paredes ao redor.
 */
export const TIPOS_COMODO = {
  // Pisos do 3D em tons da paleta: marfim (cômodos) e petróleo claro (sacadas)
  interno: { rotulo: 'Cômodo', cor3d: '#D3C6B2' },
  circulacao: { rotulo: 'Circulação', cor3d: '#C2B39C' },
  sacada: { rotulo: 'Sacada', cor3d: '#A9BDCD', externo: true },
  indefinido: { rotulo: 'A confirmar', cor3d: '#D8CDBD', semParede: true },
};

export const TIPO_COMODO_PADRAO = 'interno';

/** Nomes antigos que continuam aceitos nos dados (compatibilidade). */
export const APELIDOS_TIPO_COMODO = {
  seco: 'interno',
  molhado: 'interno',
};

export const TIPOS_PORTA = ['porta', 'entrada', 'correr', 'vao'];

/** Estado geral das medidas, exibido no selo do cabeçalho. */
export const ESTADOS = {
  rascunho: { badge: 'Rascunho do desenho', ok: false },
  exemplo: { badge: 'Medidas de exemplo', ok: false },
  real: { badge: 'Medidas reais', ok: true },
};

/** Tipos de escada (rótulo exibido no editor). */
export const TIPOS_ESCADA = {
  reta: 'Reta',
  L: 'Em L (com patamar)',
  U: 'Em U (com patamar)',
  caracol: 'Caracol',
};

/** Para onde a escada sobe, na planta (y cresce para baixo). */
export const DIRECOES_ESCADA = {
  norte: 'Para cima da planta',
  leste: 'Para a direita',
  sul: 'Para baixo da planta',
  oeste: 'Para a esquerda',
};

/**
 * Medidas de escada (cm). Faixas de conforto usuais: espelho (altura do degrau)
 * de 16 a 18 cm, piso de 28 a 32 cm e a fórmula de Blondel (2 × espelho + piso)
 * entre 63 e 65 cm. Os avisos do editor usam uma faixa um pouco mais larga.
 */
export const ESCADA = {
  espelhoIdeal: 17.5,
  pisoIdeal: 28,
  lance: 90,
  volta: 360,
  /** Diâmetro da caracol nova: com 2 m, o piso na linha do caminho fica perto de 25 cm. */
  diametroCaracol: 200,
  raioPoste: 8,
  /** Altura do plano de corte da planta baixa: degraus acima dele saem tracejados. */
  alturaCorte: 140,
  limites: { espelhoMax: 19, pisoMin: 25, blondelMin: 60, blondelMax: 66, lanceMin: 70, caracolMin: 140 },
};

/** Valores usados quando o dado de entrada não informa o campo. */
export const PADROES = {
  peDireito: 260,
  alturaPorta: 210,
  peitoril: 100,
  topoJanela: 210,
  /** Espessura da laje entre um andar e o de baixo (cm). */
  laje: 15,
};
