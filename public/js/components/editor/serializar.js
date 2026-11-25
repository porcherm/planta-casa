/**
 * Transforma os dados do editor no texto de um apartamento.js,
 * no mesmo formato legível que se escreveria à mão (um item por linha).
 */

const ORDEM = {
  casa: ['nome', 'titulo', 'estado', 'comodoInicial', 'peDireito', 'parede', 'alturaPorta'],
  comodo: ['id', 'nome', 'tipo', 'medido', 'x', 'y', 'largura', 'comprimento', 'pontos', 'rotulo', 'nota'],
  porta: ['nome', 'tipo', 'x1', 'y1', 'x2', 'y2', 'lado', 'dobradica'],
  janela: ['nome', 'forma', 'x1', 'y1', 'x2', 'y2', 'peitoril', 'topo'],
};

const LISTAS = { comodos: 'comodo', portas: 'porta', janelas: 'janela' };

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

export function serializarApartamento(dados) {
  const data = new Date().toLocaleDateString('pt-BR');
  const linhas = [
    '/**',
    ` * Planta gerada pelo editor visual do Roomprint em ${data}.`,
    ' * Para usar: substitua public/js/constants/apartamento.js por este arquivo.',
    ' * Regras e campos: veja o README, seção "Faça a planta da sua casa".',
    ' */',
    'export const APARTAMENTO = {',
  ];

  const gerais = chavesOrdenadas(dados, ORDEM.casa).filter((k) => !(k in LISTAS));
  for (const k of gerais) linhas.push(`  ${k}: ${literal(dados[k])},`);

  for (const [lista, tipo] of Object.entries(LISTAS)) {
    linhas.push('', `  ${lista}: [`);
    for (const item of dados[lista] || []) {
      linhas.push(`    ${objetoEmLinha(item, chavesOrdenadas(item, ORDEM[tipo]))},`);
    }
    linhas.push('  ],');
  }

  linhas.push('};', '');
  return linhas.join('\n');
}
