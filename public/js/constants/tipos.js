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

/** Valores usados quando o dado de entrada não informa o campo. */
export const PADROES = {
  peDireito: 260,
  alturaPorta: 210,
  peitoril: 100,
  topoJanela: 210,
};
