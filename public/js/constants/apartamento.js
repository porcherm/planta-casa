/**
 * ✏️  ESTE É O ARQUIVO QUE VOCÊ EDITA PARA DESENHAR A SUA CASA.
 *
 * O site inteiro (planta 2D, modelo 3D, áreas e lista) é gerado a partir daqui.
 * Ele já vem com uma casa de exemplo: vá trocando pelas medidas da sua casa,
 * salvando e recarregando a página (F5) a cada passo.
 * O passo a passo completo está no README, na seção "Faça a planta da sua casa".
 * Uma cópia intacta deste exemplo fica em ./exemplos/casa-simples.js.
 *
 * Resumo das regras:
 * - Todas as medidas são em centímetros.
 * - x cresce para a direita e y cresce para BAIXO (como numa folha de papel).
 * - Cômodos usam a medida interna (de parede a parede). Entre dois cômodos
 *   vizinhos fica a espessura da parede (`parede`, 12 cm aqui).
 * - Portas e janelas ficam no EIXO da parede (no meio da espessura dela).
 * - Retângulo: { x, y, largura, comprimento }. Forma livre: `pontos: [[x, y], ...]`.
 * - Dica: no site, passe o mouse sobre a planta para ver as coordenadas (x, y).
 *
 * Desenho do exemplo (medidas internas, paredes de 12 cm entre os cômodos):
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
  nome: 'Minha casa',
  titulo: 'Minha casa, cômodo por cômodo',
  estado: 'rascunho',             // 'rascunho' enquanto mede; 'real' quando terminar
  comodoInicial: 'sala',          // id do cômodo já selecionado ao abrir
  peDireito: 260,                 // altura do chão ao teto (cm)
  parede: 12,                     // espessura das paredes internas (cm)
  alturaPorta: 210,               // altura das portas (cm)

  comodos: [
    // tipo: 'interno' (padrão) | 'circulacao' | 'sacada' | 'indefinido'
    // medido: true = já medi com trena (o selo no topo conta quantos faltam)
    { id: 'sala', nome: 'Sala', tipo: 'interno', medido: true, x: 0, y: 0, largura: 400, comprimento: 350 },
    { id: 'quarto', nome: 'Quarto', tipo: 'interno', medido: true, x: 412, y: 0, largura: 300, comprimento: 350 },
    { id: 'cozinha', nome: 'Cozinha', tipo: 'interno', medido: false, x: 0, y: 362, largura: 400, comprimento: 220 },
    {
      id: 'banheiro', nome: 'Banheiro', tipo: 'interno', medido: false, x: 412, y: 362, largura: 300, comprimento: 220,
      nota: 'Exemplo de aviso: confirmar a altura da janela.',
    },
    // A sacada encosta na face de fora da parede de cima da Sala (y = -12)
    { id: 'sacada', nome: 'Sacada', tipo: 'sacada', pontos: [[0, -12], [400, -12], [400, -130], [0, -130]] },
  ],

  portas: [
    // tipo: 'porta' | 'entrada' | 'correr' | 'vao'
    // lado: para onde abre. Porta vertical: 1 = direita, -1 = esquerda. Horizontal: 1 = baixo, -1 = cima
    // dobradica: 'inicio' = no ponto (x1, y1) | 'fim' = no ponto (x2, y2)

    // Parede da esquerda da Sala: eixo em x = -6
    { nome: 'Entrada', tipo: 'entrada', x1: -6, y1: 120, x2: -6, y2: 210, lado: 1, dobradica: 'inicio' },
    // Entre Sala e Quarto: eixo em x = 406
    { nome: 'Quarto', tipo: 'porta', x1: 406, y1: 240, x2: 406, y2: 320, lado: 1, dobradica: 'fim' },
    // Entre Sala e Cozinha: eixo em y = 356, passagem sem porta
    { nome: 'Sala para a Cozinha', tipo: 'vao', x1: 100, y1: 356, x2: 300, y2: 356 },
    // Entre Quarto e Banheiro: eixo em y = 356, abre para baixo (para dentro do banheiro)
    { nome: 'Banheiro', tipo: 'porta', x1: 600, y1: 356, x2: 670, y2: 356, lado: 1, dobradica: 'inicio' },
    // Entre Sala e Sacada: eixo em y = -6
    { nome: 'Sala para a Sacada', tipo: 'correr', x1: 100, y1: -6, x2: 300, y2: -6 },
  ],

  janelas: [
    // peitoril / topo: altura (cm) da base e do topo da janela. forma: 'losango' (opcional)
    { nome: 'Janela do Quarto', x1: 480, y1: -6, x2: 640, y2: -6, peitoril: 100, topo: 210 },
    { nome: 'Janela da Cozinha', x1: 100, y1: 588, x2: 250, y2: 588, peitoril: 110, topo: 210 },
    { nome: 'Janela do Banheiro', x1: 718, y1: 420, x2: 718, y2: 500, peitoril: 150, topo: 210 },
  ],
};
