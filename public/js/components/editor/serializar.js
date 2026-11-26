/**
 * Transforma os dados do editor no texto de um apartamento.js,
 * no mesmo formato legível que se escreveria à mão (um item por linha).
 *
 * Casa de um andar só sai no formato simples (comodos/portas/janelas na casa);
 * com mais andares, sai com a lista "andares" e as "escadas".
 */
import { paraFormatoSimples } from '../../domain/andares.js';

const ORDEM = {
  casa: ['nome', 'titulo', 'estado', 'comodoInicial', 'peDireito', 'parede', 'alturaPorta', 'terreno', 'telhado'],
  vazio: ['id', 'nome', 'x', 'y', 'largura', 'comprimento', 'pontos'],
  andar: ['id', 'nome', 'referencia', 'cota', 'peDireito', 'laje'],
  comodo: ['id', 'nome', 'tipo', 'medido', 'x', 'y', 'largura', 'comprimento', 'pontos', 'rotulo', 'nota'],
  porta: ['nome', 'tipo', 'x1', 'y1', 'x2', 'y2', 'lado', 'dobradica'],
  janela: ['nome', 'forma', 'x1', 'y1', 'x2', 'y2', 'peitoril', 'topo'],
  escada: ['id', 'nome', 'tipo', 'de', 'para', 'x', 'y', 'largura', 'comprimento', 'sobe', 'giro', 'lance', 'volta'],
};

const LISTAS = { comodos: 'comodo', portas: 'porta', janelas: 'janela', vazios: 'vazio' };
/** Listas que só aparecem no arquivo quando têm algo. */
const OPCIONAIS = new Set(['vazios']);
const ESTRUTURA = new Set([...Object.keys(LISTAS), 'andares', 'escadas']);

const vazio = (v) => v === undefined || v === null || v === '';

function literal(v) {
  if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  if (Array.isArray(v)) return `[${v.map(literal).join(', ')}]`;
  if (v && typeof v === 'object') return objetoEmLinha(v, Object.keys(v));
  return String(v);
}

/** Chaves na ordem preferida e, depois, as demais (para não perder nada). */
function chavesOrdenadas(obj, ordem) {
  return [...ordem.filter((k) => k in obj), ...Object.keys(obj).filter((k) => !ordem.includes(k))]
    .filter((k) => !vazio(obj[k]));
}

function objetoEmLinha(obj, chaves) {
  return `{ ${chaves.map((k) => `${k}: ${literal(obj[k])}`).join(', ')} }`;
}

/** Listas de cômodos, portas e janelas, recuadas em `nivel` espaços. */
function escreverListas(linhas, origem, nivel) {
  const r = ' '.repeat(nivel);
  for (const [lista, tipo] of Object.entries(LISTAS)) {
    if (OPCIONAIS.has(lista) && !origem[lista]?.length) continue;
    linhas.push('', `${r}${lista}: [`);
    for (const item of origem[lista] || []) {
      linhas.push(`${r}  ${objetoEmLinha(item, chavesOrdenadas(item, ORDEM[tipo]))},`);
    }
    linhas.push(`${r}],`);
  }
}

export function serializarApartamento(entrada) {
  const dados = paraFormatoSimples(entrada);
  const data = new Date().toLocaleDateString('pt-BR');
  const linhas = [
    '/**',
    ` * Planta gerada pelo editor visual do Roomprint em ${data}.`,
    ' * Para usar: substitua public/js/constants/apartamento.js por este arquivo.',
    ' * Regras e campos: veja o README, seção "Faça a planta da sua casa".',
    ' */',
    'export const APARTAMENTO = {',
  ];

  const gerais = chavesOrdenadas(dados, ORDEM.casa).filter((k) => !ESTRUTURA.has(k));
  for (const k of gerais) linhas.push(`  ${k}: ${literal(dados[k])},`);

  if (Array.isArray(dados.andares)) {
    // De baixo para cima; cada andar tem os seus cômodos, portas e janelas
    linhas.push('', '  andares: [');
    for (const andar of dados.andares) {
      linhas.push('    {');
      for (const k of chavesOrdenadas(andar, ORDEM.andar).filter((c) => !ESTRUTURA.has(c))) {
        linhas.push(`      ${k}: ${literal(andar[k])},`);
      }
      escreverListas(linhas, andar, 6);
      linhas.push('    },');
    }
    linhas.push('  ],', '', '  escadas: [');
    for (const e of dados.escadas || []) linhas.push(`    ${objetoEmLinha(e, chavesOrdenadas(e, ORDEM.escada))},`);
    linhas.push('  ],');
  } else {
    escreverListas(linhas, dados, 2);
  }

  linhas.push('};', '');
  return linhas.join('\n');
}
