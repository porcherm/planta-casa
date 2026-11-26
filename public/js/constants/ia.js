/**
 * Ajustes da função "Planta por fotos" (IA que monta a planta a partir de fotos).
 */
export const IA = {
  /** SDK oficial da Anthropic, baixado só quando a pessoa gera uma planta (versão fixa). */
  sdkUrl: 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.5.0/+esm',
  modelo: 'claude-opus-5-5',
  /** Raciocínio espacial com várias fotos: vale pensar mais. */
  esforco: 'high',
  maxTokens: 64000,
  /** Se o modelo recusar o pedido, a API tenta de novo com outro modelo (no mesmo pedido). */
  betaFallback: 'server-side-fallback-2026-07-01',

  minFotos: 1,
  maxFotos: 5,
  /** Lado maior da foto enviada (px): bom para ler cotas escritas sem pesar no envio. */
  ladoMaximoPx: 2000,
  qualidadeJpeg: 0.85,

  chaveArmazenada: 'roomprint:chave-anthropic',
};
