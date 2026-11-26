/**
 * EXEMPLO: casa com sala de pé-direito duplo e mezanino.
 * Copie o conteúdo deste arquivo para ../apartamento.js para ver como funcionam
 * os vazios (recortes na laje) e um telhado de duas águas.
 *
 * - O mezanino é um andar de cima que cobre a casa toda, mas com um "vazio" na
 *   frente: ali não há piso, e a sala de baixo fica com pé-direito duplo
 *   (2,80 + 0,15 + 2,40 = 5,35 m). Em volta do vazio entra um guarda-corpo.
 * - O vazio fica na lista `vazios` do andar onde está o recorte (o de cima):
 *   retângulo (x, y, largura, comprimento) ou `pontos`, como um cômodo.
 * - A escada em L sobe pela parede da direita e chega no mezanino virando à esquerda.
 */
export const APARTAMENTO = {
  nome: 'Casa com mezanino',
  titulo: 'A casa com mezanino, andar por andar',
  estado: 'exemplo',
  comodoInicial: 'estar',
  peDireito: 280,
  parede: 15,
  alturaPorta: 210,
  telhado: { tipo: 'duas-aguas', inclinacao: 35, beiral: 60 },

  andares: [
    {
      id: 'terreo',
      nome: 'Térreo',
      referencia: true,
      comodos: [
        { id: 'estar', nome: 'Estar e jantar', tipo: 'interno', x: 0, y: 0, largura: 600, comprimento: 620, rotulo: [200, 470] },
        { id: 'cozinha', nome: 'Cozinha', tipo: 'interno', x: 615, y: 0, largura: 300, comprimento: 300 },
        { id: 'lavabo', nome: 'Lavabo', tipo: 'interno', x: 615, y: 315, largura: 300, comprimento: 305 },
      ],
      portas: [
        { nome: 'Entrada', tipo: 'entrada', x1: 100, y1: 627.5, x2: 190, y2: 627.5, lado: -1, dobradica: 'inicio' },
        { nome: 'Estar para a cozinha', tipo: 'vao', x1: 607.5, y1: 30, x2: 607.5, y2: 270 },
        { nome: 'Lavabo', tipo: 'porta', x1: 607.5, y1: 420, x2: 607.5, y2: 490, lado: 1, dobradica: 'inicio' },
      ],
      janelas: [
        { nome: 'Janela alta da sala', x1: -7.5, y1: 360, x2: -7.5, y2: 580, peitoril: 60, topo: 260 },
        { nome: 'Janela da frente', x1: 260, y1: 627.5, x2: 560, y2: 627.5, peitoril: 40, topo: 260 },
        { nome: 'Janela da cozinha', x1: 922.5, y1: 60, x2: 922.5, y2: 220, peitoril: 110, topo: 210 },
      ],
    },
    {
      id: 'mezanino',
      nome: 'Mezanino',
      peDireito: 240,
      comodos: [
        { id: 'mezanino', nome: 'Mezanino', tipo: 'interno', x: 0, y: 0, largura: 600, comprimento: 620, rotulo: [150, 200] },
        { id: 'suite', nome: 'Suíte', tipo: 'interno', x: 615, y: 0, largura: 300, comprimento: 620 },
      ],
      portas: [
        { nome: 'Suíte', tipo: 'porta', x1: 607.5, y1: 160, x2: 607.5, y2: 240, lado: 1, dobradica: 'inicio' },
      ],
      janelas: [
        { nome: 'Janela da suíte', x1: 922.5, y1: 200, x2: 922.5, y2: 420, peitoril: 100, topo: 210 },
      ],
      vazios: [
        // Metade da frente da sala fica com pé-direito duplo
        { id: 'vazio-sala', nome: 'Vazio da sala', x: 0, y: 320, largura: 600, comprimento: 300 },
      ],
    },
  ],

  escadas: [
    // Sobe pela direita da sala (para cima da planta), faz o patamar no canto e chega virando à esquerda
    { id: 'escada', nome: 'Escada', tipo: 'L', de: 'terreo', para: 'mezanino', x: 300, y: 15, largura: 300, comprimento: 305, sobe: 'norte', giro: 'esquerda', lance: 90 },
  ],
};
