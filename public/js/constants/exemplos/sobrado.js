/**
 * EXEMPLO: sobrado com subsolo (garagem), térreo e andar superior, ligados por
 * duas escadas. Copie o conteúdo deste arquivo para ../apartamento.js para ver
 * como funciona uma casa com mais de um andar.
 *
 * Como funcionam os andares:
 * - "andares" vai de BAIXO para CIMA. Cada andar tem os seus cômodos, portas e
 *   janelas, com as mesmas regras de uma planta de um andar só.
 * - Todos os andares usam o mesmo sistema de coordenadas: o ponto (0, 0) do
 *   térreo fica exatamente embaixo do (0, 0) do superior. Assim as paredes de
 *   um andar caem em cima das do outro.
 * - O andar com `referencia: true` fica no nível da rua (cota 0).
 * - A altura de cada andar é calculada: acima da referência soma pé-direito +
 *   laje; abaixo desconta. Aqui: superior a +2,85 m (270 + 15) e subsolo a −2,65 m (15 + 250).
 *   Para casas com meio-nível, informe `cota` (cm) no andar.
 * - `peDireito` e `laje` (espessura da laje embaixo do andar) são opcionais em
 *   cada andar; sem eles valem o pé-direito da casa e 15 cm.
 *
 * Como funcionam as escadas (lista "escadas"):
 * - `de` é o andar onde ela começa e `para`, o andar logo acima.
 * - x, y, largura e comprimento: o retângulo que ela ocupa na planta.
 * - `sobe`: para que lado se sobe ('norte' = para cima da planta, 'sul', 'leste', 'oeste').
 * - tipo: 'reta', 'L', 'U' ou 'caracol'. Em L, U e caracol, `giro` diz para que
 *   lado ela vira ('direita' ou 'esquerda'); em L e U, `lance` é a largura de cada lance.
 * - Os degraus são calculados sozinhos pela altura entre os andares (~17,5 cm cada).
 *   No andar de cima, a laje ganha o buraco da escada e o guarda-corpo.
 */
export const APARTAMENTO = {
  nome: 'Sobrado de exemplo',
  titulo: 'O sobrado, andar por andar',
  estado: 'exemplo',
  comodoInicial: 'sala',
  peDireito: 270,
  parede: 15,
  alturaPorta: 210,
  // Terreno em declive: na frente (norte) está no nível da rua; nos fundos (sul), 2,65 m abaixo,
  // na altura do subsolo, e é por lá que o portão da garagem abre
  terreno: { desce: 'sul', desnivel: 265 },
  telhado: { tipo: 'quatro-aguas', inclinacao: 30, beiral: 50 },

  andares: [
    {
      id: 'subsolo',
      nome: 'Subsolo',
      peDireito: 250,
      comodos: [
        { id: 'garagem', nome: 'Garagem', tipo: 'interno', x: 0, y: 0, largura: 560, comprimento: 600 },
        { id: 'deposito', nome: 'Depósito', tipo: 'interno', x: 575, y: 0, largura: 300, comprimento: 280 },
        { id: 'hall-subsolo', nome: 'Hall do subsolo', tipo: 'circulacao', x: 575, y: 295, largura: 300, comprimento: 305 },
      ],
      portas: [
        { nome: 'Portão da garagem', tipo: 'correr', x1: 80, y1: 607.5, x2: 400, y2: 607.5 },
        { nome: 'Garagem para o hall', tipo: 'porta', x1: 567.5, y1: 400, x2: 567.5, y2: 480, lado: 1, dobradica: 'inicio' },
        { nome: 'Depósito', tipo: 'porta', x1: 600, y1: 287.5, x2: 680, y2: 287.5, lado: -1, dobradica: 'inicio' },
      ],
      janelas: [],
    },
    {
      id: 'terreo',
      nome: 'Térreo',
      referencia: true,
      comodos: [
        { id: 'sala', nome: 'Sala', tipo: 'interno', x: 0, y: 0, largura: 560, comprimento: 600 },
        { id: 'cozinha', nome: 'Cozinha', tipo: 'interno', x: 575, y: 0, largura: 300, comprimento: 200 },
        // `rotulo` tira o nome de cima da escada, levando-o para a parte livre do hall
        { id: 'hall', nome: 'Hall de entrada', tipo: 'circulacao', x: 575, y: 215, largura: 300, comprimento: 385, rotulo: [725, 548] },
        { id: 'varanda', nome: 'Varanda', tipo: 'sacada', pontos: [[0, 615], [560, 615], [560, 735], [0, 735]] },
      ],
      portas: [
        { nome: 'Entrada', tipo: 'entrada', x1: 590, y1: 607.5, x2: 680, y2: 607.5, lado: -1, dobradica: 'inicio' },
        { nome: 'Sala para o hall', tipo: 'vao', x1: 567.5, y1: 350, x2: 567.5, y2: 560 },
        { nome: 'Sala para a cozinha', tipo: 'vao', x1: 567.5, y1: 30, x2: 567.5, y2: 170 },
        { nome: 'Cozinha para o hall', tipo: 'porta', x1: 590, y1: 207.5, x2: 650, y2: 207.5, lado: 1, dobradica: 'inicio' },
        { nome: 'Sala para a varanda', tipo: 'correr', x1: 60, y1: 607.5, x2: 380, y2: 607.5 },
      ],
      janelas: [
        { nome: 'Janela da sala', x1: -7.5, y1: 150, x2: -7.5, y2: 450, peitoril: 90, topo: 210 },
        { nome: 'Janela da cozinha', x1: 882.5, y1: 40, x2: 882.5, y2: 160, peitoril: 110, topo: 210 },
      ],
    },
    {
      id: 'superior',
      nome: 'Superior',
      peDireito: 260,
      laje: 15,
      comodos: [
        { id: 'suite', nome: 'Suíte', tipo: 'interno', x: 0, y: 0, largura: 560, comprimento: 380 },
        { id: 'banho-suite', nome: 'Banho da suíte', tipo: 'interno', x: 0, y: 395, largura: 560, comprimento: 205 },
        { id: 'quarto', nome: 'Quarto', tipo: 'interno', x: 575, y: 0, largura: 300, comprimento: 200 },
        { id: 'circulacao', nome: 'Circulação', tipo: 'circulacao', x: 575, y: 215, largura: 300, comprimento: 385, rotulo: [725, 548] },
        { id: 'sacada-suite', nome: 'Sacada da suíte', tipo: 'sacada', pontos: [[0, -135], [560, -135], [560, -15], [0, -15]] },
      ],
      portas: [
        { nome: 'Suíte', tipo: 'porta', x1: 567.5, y1: 300, x2: 567.5, y2: 380, lado: -1, dobradica: 'inicio' },
        { nome: 'Banho da suíte', tipo: 'porta', x1: 60, y1: 387.5, x2: 140, y2: 387.5, lado: 1, dobradica: 'inicio' },
        { nome: 'Quarto', tipo: 'porta', x1: 580, y1: 207.5, x2: 650, y2: 207.5, lado: -1, dobradica: 'inicio' },
        { nome: 'Suíte para a sacada', tipo: 'correr', x1: 100, y1: -7.5, x2: 460, y2: -7.5 },
      ],
      janelas: [
        { nome: 'Janela do quarto', x1: 882.5, y1: 40, x2: 882.5, y2: 160, peitoril: 100, topo: 210 },
        { nome: 'Janela do banho', x1: -7.5, y1: 450, x2: -7.5, y2: 540, peitoril: 150, topo: 210 },
      ],
    },
  ],

  escadas: [
    // Da garagem para a sala: reta, encostada na parede da direita da garagem, subindo "para cima"
    { id: 'escada-garagem', nome: 'Escada da garagem', tipo: 'reta', de: 'subsolo', para: 'terreo', x: 455, y: 150, largura: 90, comprimento: 392, sobe: 'norte' },
    // No hall: em U, sobe pela esquerda, faz o patamar no fundo e chega pela direita
    { id: 'escada-hall', nome: 'Escada do hall', tipo: 'U', de: 'terreo', para: 'superior', x: 665, y: 225, largura: 200, comprimento: 286, sobe: 'norte', giro: 'direita', lance: 90 },
  ],
};
