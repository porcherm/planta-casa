/**
 * Formulário de propriedades do editor (painel lateral).
 * Mostra os campos do item selecionado: casa, cômodo, porta ou janela.
 *
 * Avisa o editor por dois callbacks:
 * - aoAlterar(campo, valor, final): `final` = false enquanto digita, true ao confirmar.
 * - aoAcao(acao): botões como excluir, inverter abertura…
 */
import { TIPOS_COMODO, TIPOS_ESCADA, DIRECOES_ESCADA } from '../../constants/tipos.js';
import { TIPOS_TELHADO, TELHADO } from '../../domain/telhado.js';
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

/** Cota em metros com sinal, para leitura: "+2,85 m", "−2,65 m", "0,00 m". */
function textoCota(cm) {
  if (Math.abs(cm) < 0.5) return '0,00 m';
  const m = Math.abs(cm / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cm > 0 ? '+' : '−'}${m} m`;
}

/**
 * Campos do andar visível. Os nomes têm o prefixo "andar:" para o editor saber
 * que mexem no andar, e não na casa. Campo vazio = valor automático.
 */
function camposDoAndar({ cru, normalizado, varios }) {
  const auto = (v) => `automático: ${v}`;
  return [
    `<div class="ed-secao largo"><span class="eyebrow">Este andar</span>` +
      `<span class="ed-sub">piso a ${textoCota(normalizado.cota)}${normalizado.referencia ? ' · nível da rua' : ''}</span></div>`,
    campo('Nome do andar', 'andar:nome', cru.nome, { largo: true }),
    campoComDica('Pé-direito do andar', 'andar:peDireito', cru.peDireito, auto(`${normalizado.peDireito} cm`), { ...cm, min: 100 }),
    ...(varios ? [
      campoComDica('Laje embaixo dele', 'andar:laje', cru.laje, auto(`${normalizado.laje} cm`), { ...cm, min: 0 }),
      campoComDica('Altura do piso (cota)', 'andar:cota', cru.cota, auto(textoCota(normalizado.cota)), { ...cm }),
      marcador('Este andar fica no nível da rua (cota 0)', 'andar:referencia', normalizado.referencia),
    ] : []),
  ];
}

/** Campo numérico que pode ficar vazio: o placeholder mostra o valor automático. */
function campoComDica(rotulo, nome, valor, dica, opcoes) {
  return campo(rotulo, nome, valor, opcoes).replace('<input ', `<input placeholder="${escaparHtml(dica)}" `);
}

/** Terreno (plano ou em desnível) e telhado do 3D e do corte. */
function camposTerrenoETelhado(casa) {
  const desce = casa.terreno?.desce || '';
  const tipoTelhado = casa.telhado?.tipo || 'nenhum';
  const descidas = { '': 'Plano', norte: 'Desce para cima da planta', sul: 'Desce para baixo da planta', leste: 'Desce para a direita', oeste: 'Desce para a esquerda' };
  return [
    '<div class="ed-secao largo"><span class="eyebrow">Terreno e telhado</span>' +
      '<span class="ed-sub">aparecem no Modelo 3D e no Corte</span></div>',
    escolha('Terreno', 'terreno:desce', desce, descidas, { largo: !desce }),
    ...(desce ? [campo('Desnível', 'terreno:desnivel', casa.terreno?.desnivel, { ...cm, min: 10 })] : []),
    escolha('Telhado', 'telhado:tipo', tipoTelhado, TIPOS_TELHADO, { largo: true }),
    ...(tipoTelhado === 'duas-aguas' || tipoTelhado === 'quatro-aguas' ? [
      campo('Inclinação', 'telhado:inclinacao', casa.telhado?.inclinacao ?? TELHADO.inclinacao, { tipo: 'number', passo: 1, sufixo: '%', min: 5 }),
      campo('Beiral', 'telhado:beiral', casa.telhado?.beiral ?? TELHADO.beiral, { ...cm, min: 0 }),
    ] : []),
  ];
}

/** Vazio: recorte no piso deste andar (o cômodo de baixo ganha pé-direito duplo). */
function telaVazio(v, area) {
  const retangular = !Array.isArray(v.pontos);
  return {
    titulo: v.nome || 'Vazio',
    subtitulo: area,
    campos: [
      campo('Nome', 'nome', v.nome, { largo: true }),
      ...(retangular ? [
        campo('Largura', 'largura', v.largura, { ...cm, min: 30 }),
        campo('Comprimento', 'comprimento', v.comprimento, { ...cm, min: 30 }),
        campo('Posição x', 'x', v.x, cm),
        campo('Posição y', 'y', v.y, cm),
      ] : []),
    ],
    acoes: [botao('Excluir vazio', 'excluir', 'perigo')],
    dica: 'O vazio tira o piso deste trecho do andar: o cômodo de baixo fica com pé-direito duplo, ' +
      'e em volta do vazio entra um guarda-corpo. Ele precisa ficar dentro de um cômodo deste andar (num mezanino, o cômodo é o próprio mezanino).',
  };
}

function telaCasa(casa, andar) {
  const varios = andar?.varios;
  return {
    titulo: 'Casa',
    campos: [
      campo('Nome', 'nome', casa.nome, { largo: true }),
      campo('Título da página', 'titulo', casa.titulo, { largo: true }),
      escolha('Situação', 'estado', casa.estado || 'real', ROTULOS_ESTADO, { largo: true }),
      campo(varios ? 'Pé-direito padrão' : 'Pé-direito', 'peDireito', casa.peDireito, { ...cm, min: 100 }),
      campo('Espessura das paredes', 'parede', casa.parede, { ...cm, min: 0 }),
      campo('Altura das portas', 'alturaPorta', casa.alturaPorta, { ...cm, min: 100 }),
      ...(andar ? camposDoAndar(andar) : []),
      ...camposTerrenoETelhado(casa),
    ],
    acoes: [],
    dica: varios
      ? 'Clique num cômodo, porta ou janela para editar. Para mudar de andar, use o seletor "Andar" acima da planta (ou Page Up / Page Down).'
      : 'Clique num cômodo, porta ou janela para editar. Use os botões acima da planta para adicionar, inclusive um andar acima ou abaixo.',
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

const um = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Escada: tipo, sentido, medidas e os números que saem delas (degraus, espelho,
 * piso e a fórmula de Blondel), para a pessoa ver na hora se ficou confortável.
 */
function telaEscada(e, normalizada, rota) {
  const g = normalizada?.geo;
  const tipo = e.tipo || 'reta';
  const lateral = e.sobe === 'leste' || e.sobe === 'oeste' ? 'Comprimento' : 'Largura';
  const campos = [
    campo('Nome', 'nome', e.nome, { largo: true }),
    escolha('Tipo', 'tipo', tipo, TIPOS_ESCADA, { largo: true }),
    escolha('Sobe', 'sobe', e.sobe || 'norte', DIRECOES_ESCADA),
    ...(tipo !== 'reta' ? [escolha('Vira para', 'giro', e.giro || 'direita', { direita: 'A direita', esquerda: 'A esquerda' })] : []),
    campo('Largura', 'largura', e.largura, { ...cm, min: 30 }),
    campo('Comprimento', 'comprimento', e.comprimento, { ...cm, min: 30 }),
    ...(tipo === 'L' || tipo === 'U' ? [campo('Largura do lance', 'lance', e.lance ?? 90, { ...cm, min: 50 })] : []),
    ...(tipo === 'caracol' ? [campo('Giro total', 'volta', e.volta ?? 360, { tipo: 'number', passo: 15, sufixo: 'graus', min: 90 })] : []),
    campo('Posição x', 'x', e.x, cm),
    campo('Posição y', 'y', e.y, cm),
  ];
  const resumo = g
    ? `${rota} · ${g.espelhos} degraus de ${um(g.espelho)} cm · piso ${um(g.piso)} cm · 2e + p = ${um(2 * g.espelho + g.piso)} cm`
    : rota;
  return {
    titulo: e.nome || 'Escada',
    subtitulo: escaparHtml(resumo),
    campos,
    acoes: [botao('Girar 90°', 'girar'), botao('Excluir escada', 'excluir', 'perigo')],
    dica: `"Largura" e "Comprimento" são o espaço que a escada ocupa na planta (${lateral.toLowerCase()} = de lado a lado de quem sobe). ` +
      'Os degraus se ajustam sozinhos à altura entre os andares. Confortável: degraus de 16 a 18 cm, piso de 28 a 32 cm e 2e + p entre 63 e 65 cm. ' +
      'No andar de cima, a laje ganha o buraco e o guarda-corpo.',
  };
}

/** Valor atual de um campo, para atualizar o formulário durante o arrasto. */
function valorDoCampo(objeto, nome, andarCru) {
  if (nome.startsWith('andar:')) return andarCru?.[nome.slice(6)];
  const [grupo, chave] = nome.split(':');
  if (chave) return objeto[grupo]?.[chave];
  if (nome === 'largura' && 'x1' in objeto) return larguraAbertura(objeto);
  return objeto[nome];
}

/* ---------- Componente ---------- */

export function criarFormulario(container, { aoAlterar, aoAcao }) {
  let objetoAtual = null;
  let andarAtual = null; // andar cru (para os campos "andar:...")

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
     * @param {{tipo: 'casa'|'comodo'|'porta'|'janela', objeto: object, area?: number,
     *          andar?: {cru: object, normalizado: object, varios: boolean}}} alvo
     */
    renderizar({ tipo, objeto, area, andar, escada, rota }) {
      objetoAtual = objeto;
      andarAtual = andar?.cru ?? null;
      const tela = {
        escada: () => telaEscada(objeto, escada, rota),
        vazio: () => telaVazio(objeto, area != null ? formatarArea(area) : ''),
        casa: () => telaCasa(objeto, andar),
        comodo: () => telaComodo(objeto, area != null ? formatarArea(area) : ''),
        porta: () => telaPorta(objeto),
        janela: () => telaJanela(objeto),
      }[tipo]();

      container.innerHTML =
        `<div class="ed-cabeca"><span class="eyebrow">${{ casa: 'Configurações gerais', comodo: 'Cômodo', porta: 'Porta', janela: 'Janela', escada: 'Escada', vazio: 'Vazio' }[tipo]}</span>` +
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
        const v = valorDoCampo(objeto, el.dataset.campo, andarAtual);
        el.value = v ?? '';
      });
    },
  };
}
