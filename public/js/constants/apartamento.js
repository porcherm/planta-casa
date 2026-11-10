/**
 * ✏️  ESTE É O ARQUIVO QUE VOCÊ EDITA PARA DESENHAR A SUA CASA.
 *
 * O site inteiro (planta 2D, modelo 3D, áreas e lista) é gerado a partir daqui.
 * O passo a passo completo está no README, na seção "Faça a planta da sua casa".
 * Um modelo bem simples para começar está em ./exemplos/casa-simples.js.
 *
 * Resumo das regras:
 * - Todas as medidas são em centímetros.
 * - x cresce para a direita e y cresce para BAIXO (como numa folha de papel).
 * - Cômodos usam a medida interna (de parede a parede). Entre dois cômodos
 *   vizinhos fica a espessura da parede (`parede`, 12 cm aqui).
 * - Portas e janelas ficam no EIXO da parede (no meio da espessura dela).
 * - Retângulo: { x, y, largura, comprimento }. Forma livre: `pontos: [[x, y], ...]`.
 * - Dica: no site, passe o mouse sobre a planta para ver as coordenadas (x, y).
 */
export const APARTAMENTO = {
  nome: 'Meu apartamento',
  titulo: 'O apartamento, cômodo por cômodo',
  estado: 'rascunho',
  comodoInicial: 'sala',
  peDireito: 242,
  parede: 12,
  alturaPorta: 205,

  comodos: [
    { id: 'quarto3', nome: 'Quarto 3', tipo: 'seco', medido: true, x: 312, y: 0, largura: 490, comprimento: 345 },
    { id: 'quarto2', nome: 'Quarto 2', tipo: 'seco', medido: true, x: 0, y: 108, largura: 300, comprimento: 380 },
    { id: 'banheiro1', nome: 'Banheiro 1', tipo: 'molhado', medido: true, x: 0, y: 500, largura: 300, comprimento: 125 },
    { id: 'lavanderia', nome: 'Lavanderia', tipo: 'molhado', medido: true, x: 185, y: 637, largura: 115, comprimento: 220 },
    { id: 'corredor', nome: 'Corredor', tipo: 'circulacao', medido: true, x: 312, y: 357, largura: 100, comprimento: 450 },
    { id: 'banheiro2', nome: 'Banheiro 2', tipo: 'molhado', medido: true, x: 424, y: 357, largura: 375, comprimento: 138 },
    { id: 'quarto1', nome: 'Quarto 1', tipo: 'seco', medido: true, x: 424, y: 507, largura: 380, comprimento: 290 },
    { id: 'sala', nome: 'Sala', tipo: 'seco', medido: true, x: 312, y: 809, largura: 495, comprimento: 420 },
    { id: 'cozinha', nome: 'Cozinha', tipo: 'molhado', medido: true, x: 0, y: 869, largura: 300, comprimento: 460 },
    {
      id: 'sacada1', nome: 'Sacada 1', tipo: 'sacada',
      pontos: [[819, 804], [909, 804], [944, 839], [944, 1199], [909, 1234], [819, 1234]],
    },
    {
      id: 'sacada2', nome: 'Sacada 2', tipo: 'sacada',
      pontos: [[-10, 96], [-10, 16], [25, -19], [300, -19], [300, 96]],
      rotulo: [145, 38],
    },
    {
      id: 'sacada3', nome: 'Sacada 3', tipo: 'sacada',
      pontos: [[306, -12], [306, -137], [904, -137], [939, -102], [939, 343], [904, 378], [811, 378], [811, 351], [814, 351], [814, -12]],
      rotulo: [600, -75],
    },
  ],

  /**
   * tipo: 'porta' | 'entrada' | 'correr' | 'vao'
   * lado: para que lado a folha abre (1 ou -1); dobradica: 'inicio' | 'fim'
   */
  portas: [
    { nome: 'Entrada', tipo: 'entrada', x1: 322, y1: 1235, x2: 402, y2: 1235, lado: -1, dobradica: 'inicio' },
    { nome: 'Corredor aberto para a sala', tipo: 'vao', x1: 306, y1: 803, x2: 418, y2: 803 },
    { nome: 'Porta do corredor (abre para dentro do corredor)', tipo: 'porta', x1: 322, y1: 813, x2: 402, y2: 813, lado: -1, dobradica: 'inicio' },
    { nome: 'Cozinha (correr, 82 cm)', tipo: 'correr', x1: 306, y1: 889, x2: 306, y2: 971 },
    { nome: 'Cozinha (serviço, 82 cm, abre para fora)', tipo: 'porta', x1: 306, y1: 1246, x2: 306, y2: 1328, lado: 1, dobradica: 'inicio' },
    { nome: 'Lavanderia', tipo: 'porta', x1: 200, y1: 863, x2: 280, y2: 863 },
    { nome: 'Sala para a Sacada 1', tipo: 'correr', x1: 813, y1: 919, x2: 813, y2: 1132 },
    { nome: 'Quarto 2', tipo: 'porta', x1: 306, y1: 362, x2: 306, y2: 442, lado: -1, dobradica: 'fim' },
    { nome: 'Quarto 3', tipo: 'porta', x1: 312, y1: 351, x2: 392, y2: 351, lado: -1, dobradica: 'inicio' },
    { nome: 'Quarto 2 para a Sacada 2 (correr)', tipo: 'correr', x1: 70, y1: 102, x2: 230, y2: 102 },
    { nome: 'Quarto 3 para a Sacada 3 (correr)', tipo: 'correr', x1: 427, y1: -6, x2: 687, y2: -6 },
    { nome: 'Banheiro 2 (pelo Quarto 3, abre para fora)', tipo: 'porta', x1: 550, y1: 351, x2: 620, y2: 351, lado: -1, dobradica: 'inicio' },
    { nome: 'Banheiro 1', tipo: 'porta', x1: 306, y1: 545, x2: 306, y2: 615, lado: -1, dobradica: 'fim' },
    { nome: 'Quarto 1', tipo: 'porta', x1: 418, y1: 517, x2: 418, y2: 592, lado: 1, dobradica: 'inicio' },
  ],

  /** peitoril e topo: alturas (cm) da base e do topo do vidro. */
  janelas: [
    { nome: 'Janela do Quarto 1', x1: 810, y1: 546, x2: 810, y2: 744, peitoril: 80, topo: 197 },
    { nome: 'Janela do Banheiro 1', x1: 20, y1: 631, x2: 128, y2: 631, peitoril: 130, topo: 210 },
    { nome: 'Janela da Cozinha', x1: 10, y1: 863, x2: 160, y2: 863, peitoril: 120, topo: 210 },
    { nome: 'Janela do Banheiro 2 (losango)', forma: 'losango', x1: 805, y1: 376, x2: 805, y2: 476, peitoril: 130, topo: 230 },
  ],
};
