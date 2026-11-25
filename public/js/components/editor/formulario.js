/**
 * Formulário de propriedades do editor (painel lateral).
 * Mostra os campos do item selecionado: casa, cômodo, porta ou janela.
 *
 * Avisa o editor por dois callbacks:
 * - aoAlterar(campo, valor, final): `final` = false enquanto digita, true ao confirmar.
 * - aoAcao(acao): botões como excluir, inverter abertura…
 */
import { TIPOS_COMODO } from '../../constants/tipos.js';
import { escaparHtml } from '../../utils/dom.js';
import { formatarArea } from '../../utils/formatar.js';
import { ehRetangulo, larguraAbertura } from './operacoes.js';

const TIPOS_PORTA = {
  porta: 'Porta de abrir',
  entrada: 'Porta de entrada',
  correr: 'Porta de correr',
  vao: 'Vão (sem porta)',
};

const ROTULOS_ESTADO = { rascunho: 'Rascunho', exemplo: 'Exemplo', real: 'Medidas reais' };

/* ---------- Construtores de campos ---------- */

const atributo = (nome, valor) => (valor == null ? '' : ` ${nome}="${valor}"`);

function campo(rotulo, nome, valor, { tipo = 'text', min, passo, sufixo, largo } = {}) {
  return `<label class="ed-campo${largo ? ' largo' : ''}"><span>${rotulo}${sufixo ? ` <small>(${sufixo})</small>` : ''}</span>` +
    `<input type="${tipo}" data-campo="${nome}" value="${escaparHtml(valor ?? '')}"${atributo('min', min)}${atributo('step', passo)}></label>`;
}

function escolha(rotulo, nome, valor, opcoes, { largo } = {}) {
  const itens = Object.entries(opcoes)
    .map(([v, texto]) => `<option value="${v}"${v === valor ? ' selected' : ''}>${escaparHtml(texto)}</option>`)
    .join('');
  return `<label class="ed-campo${largo ? ' largo' : ''}"><span>${rotulo}</span><select data-campo="${nome}">${itens}</select></label>`;
}

const marcador = (rotulo, nome, marcado) =>
  `<label class="ed-check largo"><input type="checkbox" data-campo="${nome}"${marcado ? ' checked' : ''}> ${rotulo}</label>`;

const botao = (rotulo, acao, classe = '') =>
  `<button type="button" class="btn sm ${classe}" data-acao="${acao}">${rotulo}</button>`;

const cm = { tipo: 'number', passo: 1, sufixo: 'cm' };

/* ---------- Telas por tipo de seleção ---------- */

function telaCasa(casa) {
  return {
    titulo: 'Casa',
    campos: [
      campo('Nome', 'nome', casa.nome, { largo: true }),
      campo('Título da página', 'titulo', casa.titulo, { largo: true }),
      escolha('Situação', 'estado', casa.estado || 'real', ROTULOS_ESTADO, { largo: true }),
      campo('Pé-direito', 'peDireito', casa.peDireito, { ...cm, min: 100 }),
      campo('Espessura das paredes', 'parede', casa.parede, { ...cm, min: 0 }),
      campo('Altura das portas', 'alturaPorta', casa.alturaPorta, { ...cm, min: 100 }),
    ],
    acoes: [],
    dica: 'Clique num cômodo, porta ou janela para editar. Use os botões acima da planta para adicionar.',
  };
}

function telaComodo(c, area) {
  const tipos = Object.fromEntries(Object.entries(TIPOS_COMODO).map(([k, t]) => [k, t.rotulo]));
  const campos = [
    campo('Nome', 'nome', c.nome, { largo: true }),
    escolha('Tipo', 'tipo', c.tipo || 'interno', tipos, { largo: true }),
  ];
  if (ehRetangulo(c)) {
    campos.push(
      campo('Largura', 'largura', c.largura, { ...cm, min: 30 }),
      campo('Comprimento', 'comprimento', c.comprimento, { ...cm, min: 30 }),
      campo('Posição x', 'x', c.x, cm),
      campo('Posição y', 'y', c.y, cm),
    );
  }
  campos.push(
    marcador('Medido com trena', 'medido', c.medido === true),
    campo('Aviso', 'nota', c.nota, { largo: true }),
  );
  return {
    titulo: c.nome,
    subtitulo: area,
    campos,
    acoes: [botao('Excluir cômodo', 'excluir', 'perigo')],
    dica: ehRetangulo(c)
      ? 'Arraste para mover; puxe as bolinhas para mudar o tamanho. As bordas grudam na distância da parede.'
      : 'Forma livre: arraste os cantos para mudar o formato, ou arraste por dentro para mover.',
  };
}

function telaPorta(p) {
  const deAbrir = p.tipo === 'porta' || p.tipo === 'entrada';
  return {
    titulo: p.nome || 'Porta',
    campos: [
      campo('Nome', 'nome', p.nome, { largo: true }),
      escolha('Tipo', 'tipo', p.tipo || 'porta', TIPOS_PORTA, { largo: true }),
      campo('Largura', 'largura', larguraAbertura(p), { ...cm, min: 20 }),
    ],
    acoes: [
      ...(deAbrir ? [botao('Inverter abertura', 'inverter-lado'), botao('Trocar dobradiça', 'trocar-dobradica')] : []),
      botao('Excluir porta', 'excluir', 'perigo'),
    ],
    dica: 'Arraste a porta para deslizá-la pela parede.',
  };
}

function telaJanela(j) {
  return {
    titulo: j.nome || 'Janela',
    campos: [
      campo('Nome', 'nome', j.nome, { largo: true }),
      escolha('Formato', 'forma', j.forma || '', { '': 'Retangular', losango: 'Losango (45°)' }, { largo: true }),
      campo('Largura', 'largura', larguraAbertura(j), { ...cm, min: 20 }),
      campo('Peitoril', 'peitoril', j.peitoril, { ...cm, min: 0 }),
      campo('Topo', 'topo', j.topo, { ...cm, min: 20 }),
    ],
    acoes: [botao('Excluir janela', 'excluir', 'perigo')],
    dica: 'Arraste a janela para deslizá-la pela parede.',
  };
}

/** Valor atual de um campo, para atualizar o formulário durante o arrasto. */
function valorDoCampo(objeto, nome) {
  if (nome === 'largura' && 'x1' in objeto) return larguraAbertura(objeto);
  return objeto[nome];
}

/* ---------- Componente ---------- */

export function criarFormulario(container, { aoAlterar, aoAcao }) {
  let objetoAtual = null;

  const valorDe = (el) => (el.type === 'checkbox' ? el.checked : el.value);

  container.addEventListener('input', (e) => {
    const el = e.target.closest('[data-campo]');
    if (el && el.type !== 'checkbox') aoAlterar(el.dataset.campo, valorDe(el), false);
  });
  container.addEventListener('change', (e) => {
    const el = e.target.closest('[data-campo]');
    if (el) aoAlterar(el.dataset.campo, valorDe(el), true);
  });
  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-acao]');
    if (b) aoAcao(b.dataset.acao);
  });

  return {
    /**
     * @param {{tipo: 'casa'|'comodo'|'porta'|'janela', objeto: object, area?: number}} alvo
     */
    renderizar({ tipo, objeto, area }) {
      objetoAtual = objeto;
      const tela = {
        casa: () => telaCasa(objeto),
        comodo: () => telaComodo(objeto, area != null ? formatarArea(area) : ''),
        porta: () => telaPorta(objeto),
        janela: () => telaJanela(objeto),
      }[tipo]();

      container.innerHTML =
        `<div class="ed-cabeca"><span class="eyebrow">${{ casa: 'Configurações gerais', comodo: 'Cômodo', porta: 'Porta', janela: 'Janela' }[tipo]}</span>` +
        `<h2>${escaparHtml(tela.titulo || '—')}</h2>${tela.subtitulo ? `<span class="ed-sub">${tela.subtitulo}</span>` : ''}</div>` +
        `<div class="ed-campos">${tela.campos.join('')}</div>` +
        (tela.acoes.length ? `<div class="ed-acoes">${tela.acoes.join('')}</div>` : '') +
        `<p class="ed-dica">${tela.dica}</p>`;
    },

    /** Atualiza os valores mostrados sem redesenhar (não mexe no campo em edição). */
    atualizarValores(objeto = objetoAtual) {
      if (!objeto) return;
      container.querySelectorAll('input[data-campo]').forEach((el) => {
        if (el === document.activeElement || el.type === 'checkbox') return;
        const v = valorDoCampo(objeto, el.dataset.campo);
        el.value = v ?? '';
      });
    },
  };
}
