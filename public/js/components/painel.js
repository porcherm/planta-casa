/**
 * Painel lateral: detalhes do cômodo selecionado + lista de cômodos com totais.
 */
import { TIPOS_COMODO } from '../constants/tipos.js';
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
}

function renderizarDetalhes(store) {
  const { dados } = store;
  const r = store.comodoSelecionado;
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
    'd-pe': tipo.externo ? 'Aberta' : formatarMetros(dados.peDireito),
    'd-par': semParedes ? '—' : formatarArea(r.perimetro * dados.peDireito),
    'd-nota-txt': r.nota || '',
    'sel-3d': r.nome,
  };
  for (const [id, valor] of Object.entries(campos)) $(id).textContent = valor;
  $('d-nota').hidden = !r.nota;

  $('lista').querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-current', b.dataset.id === r.id ? 'true' : 'false');
  });
}

function renderizarLista(dados) {
  let areaInterna = 0, areaSacadas = 0;

  $('lista').innerHTML = dados.comodos.map((r) => {
    if (TIPOS_COMODO[r.tipo].externo) areaSacadas += r.area;
    else areaInterna += r.area;

    const pendente = r.nota ? '<span class="dot" title="Tem informação pendente"></span>' : '';
    return `<li><button type="button" data-id="${r.id}">` +
      `<span class="r-nome">${escaparHtml(r.nome)}${pendente}</span>` +
      `<span class="r-area">${formatarArea(r.area)}</span>` +
      `<span class="r-med">${formatarDimensoes(r)} m</span></button></li>`;
  }).join('');

  const qtd = dados.comodos.length;
  $('area-total').textContent = formatarArea(areaInterna);
  $('area-sacadas').textContent = formatarArea(areaSacadas);
  $('r-count').textContent = `${qtd} ${qtd === 1 ? 'ESPAÇO' : 'ESPAÇOS'}`;
}
