/**
 * Catálogos de tipos usados pela validação, pela planta 2D e pelo modelo 3D.
 */

/**
 * Tipos de cômodo.
 * - externo: não recebe paredes (vira guarda-corpo) e não entra na área interna.
 * - semParede: não gera paredes ao redor.
 */
export const TIPOS_COMODO = {
  seco: { rotulo: 'Área seca', cor3d: '#21406f' },
  molhado: { rotulo: 'Área molhada', cor3d: '#1b5372' },
  circulacao: { rotulo: 'Circulação', cor3d: '#172a4c' },
  sacada: { rotulo: 'Sacada', cor3d: '#132744', externo: true },
  indefinido: { rotulo: 'A confirmar', cor3d: '#141c2c', semParede: true },
};

export const TIPO_COMODO_PADRAO = 'seco';

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
