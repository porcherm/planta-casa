/**
 * "Planta por fotos": o que a IA recebe como instrução, o formato exato da
 * resposta (JSON Schema) e a conversão dessa resposta para o formato do
 * apartamento.js.
 *
 * A IA descreve portas e janelas de um jeito fácil de acertar ("parede de
 * cima da Sala, a 40 cm do canto, 80 cm de largura"); as coordenadas no eixo
 * da parede são calculadas aqui. Sem DOM: dá para testar com Node.
 */
import { PADROES } from '../constants/tipos.js';

const LADOS = ['cima', 'baixo', 'esquerda', 'direita'];

/** Formato da resposta, garantido pela API (structured outputs). */
export const ESQUEMA_RESPOSTA = {
  type: 'object',
  additionalProperties: false,
  required: ['nome', 'peDireito', 'parede', 'andares', 'comodos', 'portas', 'janelas', 'observacoes'],
  properties: {
    nome: { type: 'string', description: 'Nome curto para o imóvel, ex.: "Apartamento de 2 quartos".' },
    peDireito: { type: 'number', description: 'Altura do piso ao teto, em cm.' },
    parede: { type: 'number', description: 'Espessura das paredes internas, em cm.' },
    andares: {
      type: 'array',
      description: 'Andares do imóvel, de BAIXO para CIMA. Apartamento ou casa térrea: um andar só.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'nome', 'nivelDaRua'],
        properties: {
          id: { type: 'string', description: 'Identificador curto, ex.: "terreo", "superior", "subsolo".' },
          nome: { type: 'string', description: 'Nome exibido, ex.: "Térreo", "Superior", "Subsolo".' },
          nivelDaRua: { type: 'boolean', description: 'true só no andar que fica no nível da rua (o térreo).' },
        },
      },
    },
    comodos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'andar', 'nome', 'tipo', 'x', 'y', 'largura', 'comprimento', 'confianca', 'observacao'],
        properties: {
          id: { type: 'string', description: 'Identificador curto, sem espaços nem acentos, ex.: "quarto-1".' },
          andar: { type: 'string', description: 'id do andar onde fica o cômodo (um dos ids de "andares").' },
          nome: { type: 'string', description: 'Nome exibido, em português, ex.: "Quarto 1".' },
          tipo: { type: 'string', enum: ['interno', 'circulacao', 'sacada'] },
          x: { type: 'number', description: 'Canto de cima à esquerda, em cm.' },
          y: { type: 'number', description: 'Canto de cima à esquerda, em cm.' },
          largura: { type: 'number', description: 'Medida interna no eixo x (esquerda → direita), em cm.' },
          comprimento: { type: 'number', description: 'Medida interna no eixo y (cima → baixo), em cm.' },
          confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          observacao: { type: 'string', description: 'De onde saiu a medida, ou "" se não houver nada a dizer.' },
        },
      },
    },
    portas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['comodo', 'parede', 'inicio', 'largura', 'tipo', 'abreParaDentro'],
        properties: {
          comodo: { type: 'string', description: 'id do cômodo de referência.' },
          parede: { type: 'string', enum: LADOS },
          inicio: { type: 'number', description: 'Distância, em cm, do canto de cima (paredes esquerda/direita) ou do canto esquerdo (paredes cima/baixo) até o começo da porta.' },
          largura: { type: 'number', description: 'Largura do vão, em cm.' },
          tipo: { type: 'string', enum: ['porta', 'entrada', 'correr', 'vao'] },
          abreParaDentro: { type: 'boolean', description: 'A folha abre para dentro do cômodo de referência?' },
        },
      },
    },
    janelas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['comodo', 'parede', 'inicio', 'largura', 'peitoril', 'topo'],
        properties: {
          comodo: { type: 'string', description: 'id do cômodo onde fica a janela.' },
          parede: { type: 'string', enum: LADOS },
          inicio: { type: 'number', description: 'Mesma regra de "inicio" das portas, em cm.' },
          largura: { type: 'number', description: 'Em cm.' },
          peitoril: { type: 'number', description: 'Altura do piso até a base da janela, em cm.' },
          topo: { type: 'number', description: 'Altura do piso até o topo da janela, em cm.' },
        },
      },
    },
    observacoes: {
      type: 'string',
      description: 'Para a pessoa, em português e em poucas frases: o que foi estimado e como, o que foi suposto e o que vale conferir com trena.',
    },
  },
};

/** Instruções fixas (prompt de sistema). */
export const INSTRUCOES = `Você monta plantas baixas a partir de fotos. A pessoa envia de 1 a 5 imagens da casa ou apartamento dela: fotos dos cômodos, ou uma foto de uma planta impressa, de um croqui à mão ou de uma tela com a planta. A sua resposta vira uma planta 2D e um modelo 3D num site, e a pessoa depois ajusta tudo num editor visual. Então vale mais uma planta coerente e completa, com as incertezas bem explicadas, do que uma resposta vazia.

Sistema de coordenadas (1 unidade = 1 cm):
- x cresce para a direita e y cresce para BAIXO; (x, y) de um cômodo é o canto de cima à esquerda.
- largura e comprimento são medidas INTERNAS, de parede a parede.
- Entre dois cômodos vizinhos há sempre uma parede de espessura "parede". Ex.: com parede de 12, um cômodo em x = 0 com largura 400 tem o vizinho da direita em x = 412; um cômodo em y = 0 com comprimento 350 tem o vizinho de baixo em y = 362. Cômodos nunca se sobrepõem.
- Integração sem parede (ex.: sala e cozinha americana) também fica a uma "parede" de distância e ganha uma "porta" do tipo "vao" ocupando toda a parede em comum.
- Use só retângulos. Um cômodo em L vira dois retângulos ligados por um "vao".
- Sacada/varanda é um cômodo do tipo "sacada", também afastado de "parede" do cômodo em que encosta. Corredores e halls são "circulacao".
- Comece a casa perto de (0, 0) e use números inteiros.

Casas com mais de um andar (sobrado, subsolo, mezanino):
- Liste os andares em "andares", de baixo para cima, e marque "nivelDaRua" só no térreo. Apartamento ou casa térrea: um andar só (ex.: { "id": "terreo", "nome": "Térreo", "nivelDaRua": true }).
- Todos os andares usam o MESMO sistema de coordenadas: um ponto (x, y) do térreo fica exatamente embaixo do mesmo (x, y) do andar de cima. Alinhe as paredes externas dos andares umas sobre as outras.
- Cada cômodo diz em "andar" em que andar está. Portas e janelas ficam no andar do cômodo de referência delas.
- A escada aparece como um cômodo do tipo "circulacao" (ex.: "Escada") nos dois andares, no mesmo lugar. Diga nas observações que a escada em si é desenhada depois, no editor.
- Plantas impressas costumam ter um desenho por pavimento ("Térreo", "Pavimento superior"): use as cotas e a posição das paredes externas para alinhar um sobre o outro.

Portas e janelas:
- Cada porta aparece uma vez só, mesmo ficando entre dois cômodos; descreva-a a partir de um cômodo interno (nunca da sacada).
- "parede" diz em qual lado do cômodo ela fica; "inicio" é a distância do canto de cima (paredes esquerda/direita) ou do canto esquerdo (paredes cima/baixo) até o começo do vão. O vão tem que caber inteiro na parede.
- Tipos: "entrada" (porta da rua, só uma), "porta" (de abrir), "correr" e "vao" (passagem aberta). Portas de banheiro e de quarto costumam abrir para dentro deles.

Como estimar as medidas:
- Se alguma imagem tiver cotas escritas (planta, croqui, anotações), use esses números: eles valem mais do que qualquer estimativa e a confiança é "alta".
- As dicas escritas pela pessoa também valem mais do que a sua estimativa.
- Sem cotas, estime pelas referências da foto: porta interna ~80 cm de largura e 210 cm de altura, porta de entrada ~90 cm, pé-direito comum ~260 cm, bancada de cozinha ~90 cm de altura e ~60 cm de profundidade, cama de casal 138×188 cm, cama de solteiro 88×188 cm, vaso sanitário ~70 cm de profundidade, box ~90×90 cm, piso e azulejo com tamanhos padrão (60×60, 45×45...), tomadas a ~30 cm do chão. Conte placas de piso quando der. Nesses casos a confiança é "media", ou "baixa" quando a referência é fraca.
- Use as fotos para descobrir quais cômodos se encostam: portas que aparecem em mais de uma foto, a vista de um cômodo para outro, a posição das janelas. Se não der para saber, escolha uma disposição plausível para o tipo de imóvel e diga isso nas observações.
- Cômodos que não aparecem nas fotos não devem ser inventados; a exceção é um corredor ou hall necessário para ligar os que aparecem (com confiança "baixa").
- Se as imagens não mostrarem nenhum ambiente interno (por exemplo, uma paisagem), devolva um único cômodo genérico de 300×300 e explique o problema nas observações.

Escreva nomes e observações em português do Brasil.`;

/** Texto que vai junto com as fotos. */
export function montarPedido(quantidadeFotos, dicas) {
  const texto = quantidadeFotos === 1
    ? 'Monte a planta baixa a partir da foto acima.'
    : `Monte a planta baixa a partir das ${quantidadeFotos} fotos acima.`;
  const extra = dicas?.trim()
    ? `\n\nDicas da pessoa sobre o imóvel (valem mais que estimativas):\n${dicas.trim()}`
    : '';
  return texto + extra;
}

/* ---------- Resposta da IA → apartamento.js ---------- */

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);
const inteiro = (v) => Math.round(v);
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const ROTULO_CONFIANCA = { alta: 'alta', media: 'média', baixa: 'baixa' };

/**
 * Converte a resposta da IA no objeto APARTAMENTO "cru" (o mesmo formato do
 * apartamento.js). Itens que não fazem sentido são descartados com um aviso.
 * Retorna { ok: true, bruto, observacoes, avisos } ou { ok: false, erro }.
 */
export function montarApartamento(resposta) {
  if (!resposta || typeof resposta !== 'object' || !Array.isArray(resposta.comodos)) {
    return { ok: false, erro: 'A IA devolveu uma resposta num formato inesperado.' };
  }
  const avisos = [];
  const parede = ehNumero(resposta.parede) && resposta.parede >= 5 && resposta.parede <= 40 ? inteiro(resposta.parede) : 12;
  const peDireito = ehNumero(resposta.peDireito) && resposta.peDireito >= 200 && resposta.peDireito <= 600
    ? inteiro(resposta.peDireito) : PADROES.peDireito;

  const comodos = [];
  const porId = new Map();
  for (const c of resposta.comodos) {
    const nome = String(c?.nome || '').trim() || `Cômodo ${comodos.length + 1}`;
    if (![c?.x, c?.y, c?.largura, c?.comprimento].every(ehNumero) || c.largura < 20 || c.comprimento < 20) {
      avisos.push(`"${nome}" veio sem medidas válidas e ficou de fora.`);
      continue;
    }
    let id = String(c.id || nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || `comodo-${comodos.length + 1}`;
    while (porId.has(id)) id += '-2';

    const confianca = ROTULO_CONFIANCA[c.confianca] || 'baixa';
    const observacao = String(c.observacao || '').trim();
    const comodo = {
      id,
      andarIA: String(c.andar || ''),
      nome,
      tipo: ['interno', 'circulacao', 'sacada'].includes(c.tipo) ? c.tipo : 'interno',
      medido: false,
      x: inteiro(c.x),
      y: inteiro(c.y),
      largura: inteiro(c.largura),
      comprimento: inteiro(c.comprimento),
      nota: `Estimado pela IA (confiança ${confianca})${observacao ? `: ${observacao}` : '.'}`,
    };
    comodos.push(comodo);
    porId.set(id, comodo);
    if (c.id && c.id !== id) porId.set(String(c.id), comodo); // portas citam o id original
  }
  if (!comodos.length) return { ok: false, erro: 'A IA não conseguiu identificar nenhum cômodo nas fotos.' };

  const portas = [];
  for (const p of Array.isArray(resposta.portas) ? resposta.portas : []) {
    const seg = segmentoNaParede(p, porId, parede, avisos, 'porta');
    if (!seg) continue;
    const tipo = ['porta', 'entrada', 'correr', 'vao'].includes(p.tipo) ? p.tipo : 'porta';
    const porta = { nome: nomeDaAbertura(tipo, seg.comodo), tipo, ...seg.coords };
    if (tipo === 'porta' || tipo === 'entrada') {
      porta.lado = p.abreParaDentro === false ? -seg.paraDentro : seg.paraDentro;
      porta.dobradica = 'inicio';
    }
    portas.push({ ...porta, andarIA: seg.comodo.andarIA });
  }

  const janelas = [];
  for (const j of Array.isArray(resposta.janelas) ? resposta.janelas : []) {
    const seg = segmentoNaParede(j, porId, parede, avisos, 'janela');
    if (!seg) continue;
    const peitoril = ehNumero(j.peitoril) && j.peitoril >= 0 && j.peitoril < peDireito ? inteiro(j.peitoril) : PADROES.peitoril;
    const topo = ehNumero(j.topo) && j.topo > peitoril && j.topo <= peDireito ? inteiro(j.topo) : Math.max(peitoril + 20, PADROES.topoJanela);
    janelas.push({ nome: `Janela - ${seg.comodo.nome}`, ...seg.coords, peitoril, topo, andarIA: seg.comodo.andarIA });
  }

  const geral = {
    nome: String(resposta.nome || '').trim() || 'Minha casa',
    titulo: 'Planta gerada por IA a partir de fotos',
    estado: 'rascunho',
    comodoInicial: (comodos.find((c) => c.tipo === 'interno') || comodos[0]).id,
    peDireito,
    parede,
    alturaPorta: PADROES.alturaPorta,
  };
  const semAndar = ({ andarIA, ...resto }) => resto;
  const andares = organizarAndares(resposta.andares, comodos, avisos);

  // Um andar só: o formato simples de sempre
  if (andares.length <= 1) {
    const bruto = { ...geral, comodos: comodos.map(semAndar), portas: portas.map(semAndar), janelas: janelas.map(semAndar) };
    return { ok: true, bruto, observacoes: String(resposta.observacoes || '').trim(), avisos };
  }

  // Vários andares: cada cômodo, porta e janela vai para o andar dele
  const doAndar = (lista, id) => lista.filter((item) => item.andarIA === id).map(semAndar);
  const bruto = {
    ...geral,
    andares: andares.map((a) => ({
      id: a.id, nome: a.nome, ...(a.referencia ? { referencia: true } : {}),
      comodos: doAndar(comodos, a.id), portas: doAndar(portas, a.id), janelas: doAndar(janelas, a.id),
    })).filter((a) => a.comodos.length),
    escadas: [],
  };
  return { ok: true, bruto, observacoes: String(resposta.observacoes || '').trim(), avisos };
}

/**
 * Andares da resposta, de baixo para cima, com ids limpos. Cômodos que citam um
 * andar que não existe vão para o primeiro (com aviso). Exatamente um andar
 * fica no nível da rua: o marcado pela IA, senão o "térreo", senão o primeiro.
 */
function organizarAndares(lista, comodos, avisos) {
  const andares = [];
  const ids = new Set();
  for (const a of Array.isArray(lista) ? lista : []) {
    let id = String(a?.id || a?.nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || `andar-${andares.length + 1}`;
    while (ids.has(id)) id += '-2';
    ids.add(id);
    andares.push({ id, original: String(a?.id ?? ''), nome: String(a?.nome || '').trim() || `Andar ${andares.length + 1}`, rua: a?.nivelDaRua === true });
  }
  if (andares.length <= 1) return andares;

  // Cômodos apontam para o id que a IA usou; troca pelo id limpo
  const porOriginal = new Map(andares.map((a) => [a.original, a.id]));
  let orfaos = 0;
  for (const c of comodos) {
    const id = porOriginal.get(c.andarIA) ?? (ids.has(c.andarIA) ? c.andarIA : null);
    if (!id) orfaos++;
    c.andarIA = id ?? andares[0].id;
  }
  if (orfaos) avisos.push(`${orfaos} cômodo(s) não diziam o andar e foram para o "${andares[0].nome}".`);

  const marcados = andares.filter((a) => a.rua);
  const ref = marcados[0] || andares.find((a) => /t[eé]rreo/i.test(a.nome)) || andares[0];
  return andares.map((a) => ({ id: a.id, nome: a.nome, referencia: a === ref }));
}

/**
 * Converte "parede de cima do cômodo X, a N cm do canto" no segmento x1/y1/x2/y2
 * sobre o eixo da parede (borda do cômodo + parede / 2), como o apartamento.js espera.
 * `paraDentro` é o valor de `lado` que faz a folha abrir para dentro do cômodo.
 */
function segmentoNaParede(item, porId, parede, avisos, oQue) {
  const comodo = porId.get(String(item?.comodo));
  if (!comodo) { avisos.push(`Uma ${oQue} citava um cômodo que não existe e ficou de fora.`); return null; }
  if (!LADOS.includes(item.parede) || !ehNumero(item.largura) || item.largura < 20) {
    avisos.push(`Uma ${oQue} de "${comodo.nome}" veio sem posição válida e ficou de fora.`);
    return null;
  }
  const horizontal = item.parede === 'cima' || item.parede === 'baixo';
  const comprimentoParede = horizontal ? comodo.largura : comodo.comprimento;
  const largura = inteiro(Math.min(item.largura, comprimentoParede));
  const inicio = inteiro(limitar(ehNumero(item.inicio) ? item.inicio : 0, 0, comprimentoParede - largura));
  const meia = parede / 2;
  const { x, y } = comodo;
  const fimX = x + comodo.largura, fimY = y + comodo.comprimento;

  const coords = {
    cima: { x1: x + inicio, y1: y - meia, x2: x + inicio + largura, y2: y - meia },
    baixo: { x1: x + inicio, y1: fimY + meia, x2: x + inicio + largura, y2: fimY + meia },
    esquerda: { x1: x - meia, y1: y + inicio, x2: x - meia, y2: y + inicio + largura },
    direita: { x1: fimX + meia, y1: y + inicio, x2: fimX + meia, y2: y + inicio + largura },
  }[item.parede];
  // Porta horizontal: 1 = abre para baixo; vertical: 1 = abre para a direita
  const paraDentro = item.parede === 'cima' || item.parede === 'esquerda' ? 1 : -1;
  return { comodo, coords, paraDentro };
}

function nomeDaAbertura(tipo, comodo) {
  if (tipo === 'entrada') return 'Entrada';
  if (tipo === 'vao') return `Passagem - ${comodo.nome}`;
  if (tipo === 'correr') return `Porta de correr - ${comodo.nome}`;
  return `Porta - ${comodo.nome}`;
}
