/**
 * Painel lateral: detalhes do cômodo selecionado + lista de cômodos com totais.
 */
import { TIPOS_COMODO } from '../constants/tipos.js';
import { andarDoComodo, areaInterna, peDireitoDuplo } from '../domain/andares.js';
import { $, escaparHtml } from '../utils/dom.js';
import { formatarMetros, formatarArea, formatarDimensoes } from '../utils/formatar.js';

export function iniciarPainel(store) {
  const lista = $('lista');

  lista.addEventListener('click', (e) => {
    const botao = e.target.closest('button');
    if (botao) store.selecionar(botao.dataset.id);
  });

  renderizarLista(store.dados);
  renderizarDetalhes(store);
  store.observar(() => renderizarDetalhes(store));
  store.observarDados((dados) => {
    renderizarLista(dados);
    renderizarDetalhes(store);
  });
}

function renderizarDetalhes(store) {
  const r = store.comodoSelecionado;
  const andar = andarDoComodo(store.dados, r.id);
  // Cada andar tem o seu pé-direito; com um vazio em cima, vale a altura livre até o teto de cima
  const duplo = peDireitoDuplo(store.dados, r);
  const peDireito = duplo ?? andar.peDireito;
  $('d-pe-t').textContent = duplo ? 'Pé-direito duplo' : 'Pé-direito';
  $('d-andar').textContent = store.dados.andares.length > 1 ? ` · ${andar.nome}` : '';
  const tipo = TIPOS_COMODO[r.tipo];
  const semParedes = tipo.externo || r.tipo === 'indefinido';

  const campos = {
    'd-nome': r.nome,
    'd-tipo': tipo.rotulo,
    'd-larg-t': r.reto ? 'Largura' : 'Largura máxima',
    'd-comp-t': r.reto ? 'Comprimento' : 'Comprimento máximo',
    'd-larg': formatarMetros(r.bb.w),
    'd-comp': formatarMetros(r.bb.h),
    'd-area': formatarArea(r.area),
    'd-per': formatarMetros(r.perimetro),
    'd-pe': tipo.externo ? 'Aberta' : formatarMetros(peDireito),
    'd-par': semParedes ? '—' : formatarArea(r.perimetro * peDireito),
    'd-nota-txt': r.nota || '',
    'sel-3d': r.nome,
  };
  for (const [id, valor] of Object.entries(campos)) $(id).textContent = valor;
  $('d-nota').hidden = !r.nota;

  $('lista').querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-current', b.dataset.id === r.id ? 'true' : 'false');
  });
}

function itemDaLista(r) {
  const pendente = r.nota ? '<span class="dot" title="Tem informação pendente"></span>' : '';
  return `<li><button type="button" data-id="${r.id}">` +
    `<span class="r-nome">${escaparHtml(r.nome)}${pendente}</span>` +
    `<span class="r-area">${formatarArea(r.area)}</span>` +
    `<span class="r-med">${formatarDimensoes(r)} m</span></button></li>`;
}

function renderizarLista(dados) {
  const externos = dados.comodos.filter((c) => TIPOS_COMODO[c.tipo].externo);
  const areaSacadas = externos.reduce((s, c) => s + c.area, 0);
  const total = areaInterna(dados.comodos, TIPOS_COMODO);
  const varios = dados.andares.length > 1;

  // Com mais de um andar, a lista vem agrupada (de cima para baixo, como num prédio),
  // com a área interna de cada andar no título do grupo
  $('lista').innerHTML = varios
    ? [...dados.andares].reverse().map((a) =>
      `<li class="r-andar"><span>${escaparHtml(a.nome)}</span>` +
      `<span>${formatarArea(areaInterna(a.comodos, TIPOS_COMODO))}</span></li>` +
      a.comodos.map(itemDaLista).join('')).join('')
    : dados.comodos.map(itemDaLista).join('');

  const qtd = dados.comodos.length;
  $('area-total-t').textContent = varios ? 'Área construída' : 'Área interna';
  $('area-total').textContent = formatarArea(total);
  $('area-sacadas').textContent = formatarArea(areaSacadas);
  $('r-count').textContent = `${qtd} ${qtd === 1 ? 'ESPAÇO' : 'ESPAÇOS'}`;
}
