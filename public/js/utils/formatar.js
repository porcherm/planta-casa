/** Número no padrão brasileiro, sempre com 2 casas (ex.: 3,45). */
export const formatarNumero = (valor) =>
  valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Centímetros → metros (ex.: 345 → "3,45 m"). */
export const formatarMetros = (cm) => `${formatarNumero(cm / 100)} m`;

/** Centímetros quadrados → metros quadrados (ex.: 120000 → "12,00 m²"). */
export const formatarArea = (cm2) => `${formatarNumero(cm2 / 10000)} m²`;

/** Dimensões "L × C" em metros; "≈" quando o cômodo não é retangular. */
export const formatarDimensoes = (comodo) =>
  `${comodo.reto ? '' : '≈ '}${formatarNumero(comodo.bb.w / 100)} × ${formatarNumero(comodo.bb.h / 100)}`;
