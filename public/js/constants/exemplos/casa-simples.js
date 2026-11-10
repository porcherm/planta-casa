/**
 * EXEMPLO: uma casa simples com 4 cômodos e uma sacada.
 * Copie o conteúdo deste arquivo para ../apartamento.js e vá trocando pelas
 * medidas da sua casa.
 *
 * Desenho (medidas internas, paredes de 12 cm entre os cômodos):
 *
 *          ┌───────── Sacada ─────────┐
 *          │                          │
 *   (0,0)  ├──────────────────────────┤┬─────────────────┐
 *          │                          ││                 │
 *  Entrada ┤         Sala             ││     Quarto      │
 *          │       400 × 350          ├┤    300 × 350    │
 *          │                          ││                 │
 *          ├──────[ vão aberto ]──────┤├──────[porta]────┤
 *          │        Cozinha           ││    Banheiro     │
 *          │       400 × 220          ││    300 × 220    │
 *          └──────────────────────────┘└─────────────────┘
 *
 * Contas que você vai repetir:
 *   x do Quarto   = 0 (x da Sala) + 400 (largura da Sala) + 12 (parede) = 412
 *   y da Cozinha  = 0 (y da Sala) + 350 (comprimento da Sala) + 12 (parede) = 362
 *   eixo da parede entre Sala e Quarto = 400 + 12/2 = 406
 *   eixo da parede entre Sala e Cozinha = 350 + 12/2 = 356
 */
export const APARTAMENTO = {
  nome: 'Casa de exemplo',
  titulo: 'Minha casa, cômodo por cômodo',
  estado: 'real',
  comodoInicial: 'sala',
  peDireito: 260,
  parede: 12,
  alturaPorta: 210,

  comodos: [
    { id: 'sala', nome: 'Sala', tipo: 'seco', medido: true, x: 0, y: 0, largura: 400, comprimento: 350 },
    { id: 'quarto', nome: 'Quarto', tipo: 'seco', medido: true, x: 412, y: 0, largura: 300, comprimento: 350 },
    { id: 'cozinha', nome: 'Cozinha', tipo: 'molhado', medido: true, x: 0, y: 362, largura: 400, comprimento: 220 },
    {
      id: 'banheiro', nome: 'Banheiro', tipo: 'molhado', medido: true, x: 412, y: 362, largura: 300, comprimento: 220,
      nota: 'Exemplo de aviso: confirmar a altura da janela.',
    },
    // A sacada encosta na face de fora da parede de cima da Sala (y = -12)
    { id: 'sacada', nome: 'Sacada', tipo: 'sacada', pontos: [[0, -12], [400, -12], [400, -130], [0, -130]] },
  ],

  portas: [
    // Parede da esquerda da Sala: eixo em x = -6. lado: 1 = abre para a direita (para dentro)
    { nome: 'Entrada', tipo: 'entrada', x1: -6, y1: 120, x2: -6, y2: 210, lado: 1, dobradica: 'inicio' },
    // Entre Sala e Quarto: eixo em x = 406
    { nome: 'Quarto', tipo: 'porta', x1: 406, y1: 240, x2: 406, y2: 320, lado: 1, dobradica: 'fim' },
    // Entre Sala e Cozinha: eixo em y = 356, sem porta
    { nome: 'Sala para a Cozinha', tipo: 'vao', x1: 100, y1: 356, x2: 300, y2: 356 },
    // Entre Quarto e Banheiro: eixo em y = 356. lado: 1 = abre para baixo (para dentro do banheiro)
    { nome: 'Banheiro', tipo: 'porta', x1: 600, y1: 356, x2: 670, y2: 356, lado: 1, dobradica: 'inicio' },
    // Entre Sala e Sacada: eixo em y = -6
    { nome: 'Sala para a Sacada', tipo: 'correr', x1: 100, y1: -6, x2: 300, y2: -6 },
  ],

  janelas: [
    { nome: 'Janela do Quarto', x1: 480, y1: -6, x2: 640, y2: -6, peitoril: 100, topo: 210 },
    { nome: 'Janela da Cozinha', x1: 100, y1: 588, x2: 250, y2: 588, peitoril: 110, topo: 210 },
    { nome: 'Janela do Banheiro', x1: 718, y1: 420, x2: 718, y2: 500, peitoril: 150, topo: 210 },
  ],
};
