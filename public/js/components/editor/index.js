/**
 * Aba "Editor": monta a planta visualmente, sem digitar coordenadas.
 *
 * - Arrastar cômodos (as bordas "grudam" nos vizinhos, já com a parede entre eles).
 * - Redimensionar pelas alças; mover os cantos das formas livres (sacadas).
 * - Clicar numa parede para colocar porta ou janela; arrastar para deslizá-las.
 * - Formulário com as propriedades do item selecionado.
 * - Desfazer/refazer, rascunho salvo no navegador e exportação do apartamento.js.
 *
 * O editor trabalha nos dados "crus" (formato do apartamento.js). A cada
 * alteração confirmada, normaliza e publica no store, e as outras abas
 * (2D, 3D, Caminhar, painel) se atualizam sozinhas.
 */
import { EDITOR, ZOOM, LIMIAR_ARRASTO_PX } from '../../constants/visualizacao.js';
import { normalizarDados } from '../../domain/normalizar.js';
import { verificarSobreposicoes } from '../../domain/validacao.js';
import { $, escaparHtml } from '../../utils/dom.js';
import { linha } from '../../utils/svg.js';
import { desenharPlanta, desenharMedidasDoComodo } from '../planta2d/desenho.js';
import { criarViewport } from '../planta2d/viewport.js';
import * as op from './operacoes.js';
import { serializarApartamento } from './serializar.js';
import { criarFormulario } from './formulario.js';

const CURSOR_ALCA = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};
const CAMPOS_NUMERICOS = new Set(['largura', 'comprimento', 'x', 'y', 'peDireito', 'parede', 'alturaPorta', 'peitoril', 'topo']);
const LISTA_DO_TIPO = { porta: 'portas', janela: 'janelas' };

export function iniciarEditor(store, dadosIniciais) {
  const svg = $('editor-svg');
  const dicaEl = $('editor-dica');
  const coordEl = $('editor-coord');
  const statusEl = $('editor-status');
  const viewport = criarViewport(svg);

  let dados = structuredClone(dadosIniciais);
  // Os ids crus passam a ser os mesmos usados no resto da página
  dados.comodos.forEach((c, i) => { c.id = store.dados.comodos[i].id; });
  const original = JSON.stringify(dados);
  const historico = { estados: [original], posicao: 0 };

  let normalizado = store.dados;
  let problemas = [];  // sobreposições e cômodos sem espaço para a parede
  let selecao = { tipo: 'comodo', id: store.selecionadoId }; // ou { tipo: 'porta'|'janela', indice } ou null
  let modo = null;     // 'porta' | 'janela' enquanto está adicionando
  let arrasto = null;
  let ativo = false;

  const formulario = criarFormulario($('editor-form'), { aoAlterar: alterarCampo, aoAcao: executarAcao });

  /** Quantos cm cabem em 1 px da tela (para alças e ímã terem tamanho constante na tela). */
  const cmPorPx = () => 1 / (svg.getScreenCTM()?.a || 1);
  const indiceDoComodo = (id) => dados.comodos.findIndex((c) => c.id === id);

  /* ---------- Desenho ---------- */

  function renderizar() {
    const resultado = normalizarDados(dados);
    if (!resultado.ok) { mostrarStatus(resultado.erro, 'erro'); return false; }
    normalizado = resultado.data;
    problemas = verificarSobreposicoes(normalizado);
    const { markup, viewBox } = desenharPlanta(normalizado, { prefixo: 'ed-' });
    svg.innerHTML = `${markup}<g id="ed-problemas"></g><g id="ed-sobreposicao"></g><g id="ed-fantasma"></g>`;
    viewport.definirBase(viewBox);
    desenharProblemas();
    desenharSelecao();
    mostrarAvisos();
    return true;
  }

  /** Contorno vermelho nos cômodos com problema. */
  function desenharProblemas() {
    const g = svg.querySelector('#ed-problemas');
    if (!g) return;
    const ids = new Set(problemas.flatMap((p) => p.ids));
    g.innerHTML = normalizado.comodos
      .filter((c) => ids.has(c.id))
      .map((c) => `<polygon class="ed-problema" points="${c.pontos.map(([x, y]) => `${x},${y}`).join(' ')}"/>`)
      .join('');
  }

  /** Lista de avisos no painel; clicar num aviso seleciona o primeiro cômodo dele. */
  function mostrarAvisos() {
    const caixa = $('editor-avisos');
    caixa.hidden = problemas.length === 0;
    if (!problemas.length) { caixa.innerHTML = ''; return; }
    const titulo = problemas.length === 1 ? '1 problema na planta' : `${problemas.length} problemas na planta`;
    caixa.innerHTML = `<span class="eyebrow">${titulo}</span><ul>` +
      problemas.map((p) => `<li><button type="button" data-id="${p.ids[0]}">${escaparHtml(p.mensagem)}</button></li>`).join('') +
      '</ul>';
  }

  $('editor-avisos').addEventListener('click', (e) => {
    const botao = e.target.closest('button[data-id]');
    if (botao) selecionar({ tipo: 'comodo', id: botao.dataset.id });
  });

  function desenharSelecao() {
    const idSel = selecao?.tipo === 'comodo' ? selecao.id : null;
    svg.querySelectorAll('.room').forEach((g) => g.classList.toggle('is-sel', g.dataset.id === idSel));
    const medidas = svg.querySelector('#ed-medidas-sel');
    const comodo = normalizado.comodos.find((c) => c.id === idSel);
    if (medidas) medidas.innerHTML = comodo ? desenharMedidasDoComodo(comodo, normalizado) : '';
    desenharSobreposicao();
  }

  /** Áreas de clique das portas/janelas e as alças do cômodo selecionado. */
  function desenharSobreposicao() {
    const g = svg.querySelector('#ed-sobreposicao');
    if (!g) return;
    const k = cmPorPx();
    let s = '';

    for (const [tipo, lista] of Object.entries(LISTA_DO_TIPO)) {
      normalizado[lista].forEach((a, i) => {
        const sel = selecao?.tipo === tipo && selecao.indice === i;
        s += `<line class="ed-abertura${sel ? ' is-sel' : ''}" data-lista="${lista}" data-indice="${i}" ` +
          `x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke-width="${18 * k}"/>`;
      });
    }

    const idSel = selecao?.tipo === 'comodo' ? selecao.id : null;
    const comodo = normalizado.comodos.find((c) => c.id === idSel);
    const cru = dados.comodos[indiceDoComodo(idSel)];
    if (comodo && cru) {
      const r = EDITOR.raioAlcaPx * k;
      const alca = (nome, x, y, cursor) =>
        `<circle class="ed-alca" data-alca="${nome}" cx="${x}" cy="${y}" r="${r}" style="cursor:${cursor}"/>`;
      if (op.ehRetangulo(cru)) {
        const { minX, minY, maxX, maxY } = comodo.bb;
        const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
        const pos = { nw: [minX, minY], n: [mx, minY], ne: [maxX, minY], e: [maxX, my], se: [maxX, maxY], s: [mx, maxY], sw: [minX, maxY], w: [minX, my] };
        for (const [nome, [x, y]] of Object.entries(pos)) s += alca(nome, x, y, CURSOR_ALCA[nome]);
      } else {
        comodo.pontos.forEach(([x, y], i) => { s += alca(`p${i}`, x, y, 'move'); });
      }
    }
    g.innerHTML = s;
  }

  /** Prévia da porta/janela que será criada no ponto do cursor. */
  function desenharFantasma(ponto) {
    const g = svg.querySelector('#ed-fantasma');
    if (!g) return;
    const achado = modo && ponto ? op.encontrarParede(dados, ponto, EDITOR.alcanceParedePx * cmPorPx()) : null;
    if (!achado) { g.innerHTML = ''; return; }
    const a = op.criarAbertura(modo, achado);
    g.innerHTML = linha('ed-fantasma', a.x1, a.y1, a.x2, a.y2).replace('/>', ` stroke-width="${8 * cmPorPx()}"/>`);
  }

  /* ---------- Seleção e formulário ---------- */

  function alvoSelecionado() {
    if (selecao?.tipo === 'comodo') {
      const i = indiceDoComodo(selecao.id);
      if (i >= 0) {
        const area = normalizado.comodos.find((c) => c.id === selecao.id)?.area;
        return { tipo: 'comodo', objeto: dados.comodos[i], indice: i, area };
      }
    }
    if (selecao && LISTA_DO_TIPO[selecao.tipo]) {
      const objeto = dados[LISTA_DO_TIPO[selecao.tipo]]?.[selecao.indice];
      if (objeto) return { tipo: selecao.tipo, objeto, indice: selecao.indice };
    }
    return { tipo: 'casa', objeto: dados };
  }

  function selecionar(nova) {
    selecao = nova;
    desenharSelecao();
    atualizarFormulario();
    atualizarDica();
    if (nova?.tipo === 'comodo' && nova.id !== store.selecionadoId) store.selecionar(nova.id);
  }

  /** Depois de desfazer/excluir, a seleção pode apontar para algo que não existe mais. */
  function validarSelecao() {
    if (alvoSelecionado().tipo === 'casa') selecao = null;
  }

  function atualizarFormulario() {
    formulario.renderizar(alvoSelecionado());
  }

  /* ---------- Confirmar, histórico e rascunho ---------- */

  /** Registra o estado atual: histórico, rascunho e publica para as outras abas. */
  function confirmar() {
    if (!renderizar()) return false;
    const estado = JSON.stringify(dados);
    if (estado !== historico.estados[historico.posicao]) {
      historico.estados = historico.estados.slice(0, historico.posicao + 1);
      historico.estados.push(estado);
      if (historico.estados.length > EDITOR.limiteHistorico) historico.estados.shift();
      historico.posicao = historico.estados.length - 1;
    }
    salvarRascunho(estado);
    store.substituirDados(normalizado);
    atualizarBotoesHistorico();
    return true;
  }

  function carregarEstado(json) {
    dados = JSON.parse(json);
    validarSelecao();
    renderizar();
    salvarRascunho(json);
    store.substituirDados(normalizado);
    atualizarFormulario();
    atualizarBotoesHistorico();
  }

  function desfazer() {
    if (historico.posicao === 0) return;
    carregarEstado(historico.estados[--historico.posicao]);
  }

  function refazer() {
    if (historico.posicao >= historico.estados.length - 1) return;
    carregarEstado(historico.estados[++historico.posicao]);
  }

  function atualizarBotoesHistorico() {
    $('ed-desfazer').disabled = historico.posicao === 0;
    $('ed-refazer').disabled = historico.posicao >= historico.estados.length - 1;
  }

  function salvarRascunho(estado) {
    try {
      if (estado === original) localStorage.removeItem(EDITOR.chaveRascunho);
      else localStorage.setItem(EDITOR.chaveRascunho, JSON.stringify({ dados: estado, quando: Date.now() }));
    } catch { /* navegador sem armazenamento: o editor funciona igual, só não guarda rascunho */ }
    atualizarStatus();
  }

  function lerRascunho() {
    try { return JSON.parse(localStorage.getItem(EDITOR.chaveRascunho)); } catch { return null; }
  }

  function apagarRascunho() {
    try { localStorage.removeItem(EDITOR.chaveRascunho); } catch { /* sem armazenamento */ }
  }

  function oferecerRascunho() {
    const rascunho = lerRascunho();
    if (!rascunho?.dados || rascunho.dados === original) return;
    const quando = new Date(rascunho.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    $('editor-rascunho-quando').textContent = quando;
    $('editor-rascunho').hidden = false;
    $('ed-rascunho-restaurar').onclick = () => {
      $('editor-rascunho').hidden = true;
      dados = JSON.parse(rascunho.dados);
      validarSelecao();
      confirmar();
      atualizarFormulario();
      viewport.ajustar();
      desenharSobreposicao();
    };
    $('ed-rascunho-descartar').onclick = () => {
      $('editor-rascunho').hidden = true;
      apagarRascunho();
    };
  }

  /* ---------- Mensagens ---------- */

  let temporizadorStatus = null;

  function mostrarStatus(texto, tipo = '') {
    statusEl.textContent = texto;
    statusEl.className = `ed-status ${tipo}`;
  }

  function atualizarStatus() {
    clearTimeout(temporizadorStatus);
    const alterado = JSON.stringify(dados) !== original;
    mostrarStatus(alterado
      ? 'Há alterações que ainda não estão no arquivo. Baixe o apartamento.js para guardá-las (um rascunho fica salvo neste navegador).'
      : 'Sem alterações em relação ao arquivo apartamento.js.', alterado ? 'aviso' : '');
  }

  function avisarRapido(texto, tipo = 'ok') {
    mostrarStatus(texto, tipo);
    clearTimeout(temporizadorStatus);
    temporizadorStatus = setTimeout(atualizarStatus, 3500);
  }

  function atualizarDica() {
    if (modo) {
      dicaEl.textContent = `Clique numa parede para colocar a ${modo} · Esc cancela`;
    } else if (selecao?.tipo === 'comodo') {
      dicaEl.textContent = 'Arraste para mover · bolinhas mudam o tamanho · setas movem 1 cm (Shift: 10) · Delete exclui';
    } else if (selecao) {
      dicaEl.textContent = `Arraste a ${selecao.tipo} para deslizá-la pela parede · Delete exclui`;
    } else {
      dicaEl.textContent = 'Clique num cômodo, porta ou janela para editar · arraste o fundo para navegar';
    }
  }

  /* ---------- Alterações pelo formulário ---------- */

  function alterarCampo(campo, valor, final) {
    const alvo = alvoSelecionado();
    const o = alvo.objeto;

    if (CAMPOS_NUMERICOS.has(campo)) {
      const n = Number(valor);
      if (valor === '' || !Number.isFinite(n)) return;
      if (alvo.tipo === 'comodo' && (campo === 'x' || campo === 'y')) {
        op.transladarComodo(dados, alvo.indice, campo === 'x' ? n - o.x : 0, campo === 'y' ? n - o.y : 0);
      } else if (alvo.tipo === 'comodo' && (campo === 'largura' || campo === 'comprimento')) {
        op.ajustarTamanho(dados, alvo.indice, campo, n);
      } else if (campo === 'largura') {
        op.definirLarguraAbertura(o, Math.max(20, n));
      } else {
        o[campo] = n;
      }
    } else if (campo === 'medido') {
      o.medido = Boolean(valor);
    } else if (valor === '' && (campo === 'nota' || campo === 'forma')) {
      delete o[campo];
    } else {
      o[campo] = valor;
    }

    if (alvo.tipo === 'porta' && campo === 'tipo') {
      if (valor === 'porta' || valor === 'entrada') { o.lado ||= 1; o.dobradica ||= 'inicio'; }
      else { delete o.lado; delete o.dobradica; }
    }

    renderizar();
    if (final) {
      confirmar();
      if (campo === 'tipo' || campo === 'nome') atualizarFormulario();
    }
  }

  function executarAcao(acao) {
    const alvo = alvoSelecionado();
    if (acao === 'excluir') { excluirSelecao(); return; }
    if (acao === 'inverter-lado' && alvo.tipo === 'porta') alvo.objeto.lado = alvo.objeto.lado === 1 ? -1 : 1;
    if (acao === 'trocar-dobradica' && alvo.tipo === 'porta') {
      alvo.objeto.dobradica = alvo.objeto.dobradica === 'fim' ? 'inicio' : 'fim';
    }
    confirmar();
  }

  function excluirSelecao() {
    const alvo = alvoSelecionado();
    if (alvo.tipo === 'casa') return;
    if (alvo.tipo === 'comodo') {
      if (dados.comodos.length === 1) { avisarRapido('A casa precisa de pelo menos um cômodo.', 'erro'); return; }
      op.removerComodo(dados, alvo.indice);
    } else {
      dados[LISTA_DO_TIPO[alvo.tipo]].splice(alvo.indice, 1);
    }
    selecao = null;
    confirmar();
    atualizarFormulario();
    atualizarDica();
  }

  /* ---------- Barra de ferramentas ---------- */

  function definirModo(novo) {
    modo = novo;
    $('ed-add-porta').setAttribute('aria-pressed', String(modo === 'porta'));
    $('ed-add-janela').setAttribute('aria-pressed', String(modo === 'janela'));
    svg.classList.toggle('modo-adicionar', Boolean(modo));
    desenharFantasma(null);
    atualizarDica();
  }

  function adicionar(funcao) {
    const i = funcao(dados);
    selecao = { tipo: 'comodo', id: dados.comodos[i].id };
    confirmar();
    viewport.ajustar();
    selecionar(selecao);
  }

  function colocarAbertura(ponto) {
    const achado = op.encontrarParede(dados, ponto, EDITOR.alcanceParedePx * cmPorPx());
    if (!achado) { dicaEl.textContent = 'Clique mais perto de uma parede de um cômodo (Esc cancela)'; return; }
    const lista = LISTA_DO_TIPO[modo];
    (dados[lista] ||= []).push(op.criarAbertura(modo, achado));
    const tipo = modo;
    definirModo(null);
    selecao = { tipo, indice: dados[lista].length - 1 };
    confirmar();
    selecionar(selecao);
  }

  function zoom(fator, x, y) {
    viewport.zoom(fator, x, y);
    desenharSobreposicao();
  }

  $('ed-add-comodo').addEventListener('click', () => adicionar(op.adicionarComodo));
  $('ed-add-sacada').addEventListener('click', () => adicionar(op.adicionarSacada));
  $('ed-add-porta').addEventListener('click', () => definirModo(modo === 'porta' ? null : 'porta'));
  $('ed-add-janela').addEventListener('click', () => definirModo(modo === 'janela' ? null : 'janela'));
  $('ed-desfazer').addEventListener('click', desfazer);
  $('ed-refazer').addEventListener('click', refazer);
  $('ed-zoom-mais').addEventListener('click', () => zoom(ZOOM.passoBotao));
  $('ed-zoom-menos').addEventListener('click', () => zoom(1 / ZOOM.passoBotao));
  $('ed-zoom-ajustar').addEventListener('click', () => { viewport.ajustar(); desenharSobreposicao(); });

  /* ---------- Salvar ---------- */

  $('ed-baixar').addEventListener('click', () => {
    const blob = new Blob([serializarApartamento(dados)], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: 'apartamento.js' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    avisarRapido('Arquivo baixado. Substitua public/js/constants/apartamento.js por ele.');
  });

  $('ed-copiar').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(serializarApartamento(dados));
      avisarRapido('Código copiado! Cole no lugar do conteúdo de apartamento.js.');
    } catch {
      avisarRapido('Não foi possível copiar neste navegador. Use "Baixar apartamento.js".', 'erro');
    }
  });

  $('ed-descartar').addEventListener('click', () => {
    if (JSON.stringify(dados) === original) return;
    if (!window.confirm('Descartar todas as alterações e voltar ao arquivo apartamento.js?')) return;
    dados = JSON.parse(original);
    validarSelecao();
    confirmar();
    apagarRascunho();
    atualizarFormulario();
    atualizarDica();
  });

  /* ---------- Mouse e toque na planta ---------- */

  const ponteiros = new Map();
  let pinca = null;

  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch { /* sem suporte */ }

    if (ponteiros.size === 2) {
      // Segundo dedo: cancela a edição em curso e vira zoom de pinça
      if (arrasto?.moveu && arrasto.tipo !== 'pan') { dados = JSON.parse(arrasto.inicio); renderizar(); }
      arrasto = null;
      const [a, b] = [...ponteiros.values()];
      pinca = { d0: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }

    const ponto = viewport.paraPlanta(e.clientX, e.clientY);
    if (!ponto) return;
    if (modo) { colocarAbertura(ponto); return; }

    const base = { cliente: [e.clientX, e.clientY], ultimo: [e.clientX, e.clientY], ponto, inicio: JSON.stringify(dados), moveu: false };
    const alca = e.target.closest('.ed-alca');
    const abertura = e.target.closest('.ed-abertura');
    const comodo = e.target.closest('.room');

    if (alca && selecao?.tipo === 'comodo') {
      const indice = indiceDoComodo(selecao.id);
      arrasto = { ...base, tipo: 'alca', alca: alca.dataset.alca, indice, ...contexto(indice) };
    } else if (abertura) {
      const tipo = abertura.dataset.lista === 'portas' ? 'porta' : 'janela';
      const indice = Number(abertura.dataset.indice);
      selecionar({ tipo, indice });
      arrasto = { ...base, tipo: 'abertura', lista: abertura.dataset.lista, indice };
    } else if (comodo) {
      selecionar({ tipo: 'comodo', id: comodo.dataset.id });
      const indice = indiceDoComodo(comodo.dataset.id);
      arrasto = { ...base, tipo: 'comodo', indice, ...contexto(indice) };
    } else {
      arrasto = { ...base, tipo: 'pan' };
    }
  });

  /** Vizinhos (para o ímã) e portas/janelas que acompanham o cômodo arrastado. */
  function contexto(indice) {
    const id = dados.comodos[indice].id;
    return {
      caixas: normalizado.comodos.filter((c) => c.id !== id).map((c) => c.bb),
      anexas: op.aberturasAnexas(dados, dados.comodos[indice]),
    };
  }

  svg.addEventListener('pointermove', (e) => {
    const ponto = viewport.paraPlanta(e.clientX, e.clientY);
    if (ponto) {
      coordEl.textContent = `x ${Math.round(ponto[0])} · y ${Math.round(ponto[1])} cm`;
      coordEl.hidden = false;
    }
    if (!ponteiros.has(e.pointerId)) { if (modo) desenharFantasma(ponto); return; }
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinca && ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinca.d0 > 0) zoom(d / pinca.d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinca.d0 = d;
      return;
    }
    if (!arrasto || !ponto) return;

    if (!arrasto.moveu && Math.hypot(e.clientX - arrasto.cliente[0], e.clientY - arrasto.cliente[1]) < LIMIAR_ARRASTO_PX) return;
    arrasto.moveu = true;

    if (arrasto.tipo === 'pan') {
      viewport.arrastar(e.clientX - arrasto.ultimo[0], e.clientY - arrasto.ultimo[1]);
      arrasto.ultimo = [e.clientX, e.clientY];
      return;
    }

    // Sempre parte do estado do início do arrasto: sem acúmulo de arredondamentos
    dados = JSON.parse(arrasto.inicio);
    const dx = ponto[0] - arrasto.ponto[0], dy = ponto[1] - arrasto.ponto[1];
    const opcoes = { caixas: arrasto.caixas, tolerancia: EDITOR.imaPx * cmPorPx(), anexas: arrasto.anexas };

    if (arrasto.tipo === 'comodo') {
      op.moverComodo(dados, arrasto.indice, dx, dy, opcoes);
    } else if (arrasto.tipo === 'alca' && arrasto.alca.startsWith('p')) {
      const v = Number(arrasto.alca.slice(1));
      const [x0, y0] = dados.comodos[arrasto.indice].pontos[v];
      op.moverVertice(dados, arrasto.indice, v, x0 + dx, y0 + dy, opcoes);
    } else if (arrasto.tipo === 'alca') {
      op.redimensionarComodo(dados, arrasto.indice, arrasto.alca, dx, dy, opcoes);
    } else if (arrasto.tipo === 'abertura') {
      op.moverAberturaNaParede(dados[arrasto.lista][arrasto.indice], dx, dy);
    }
    renderizar();
    formulario.atualizarValores(alvoSelecionado().objeto);
  });

  function soltar(e) {
    ponteiros.delete(e.pointerId);
    if (ponteiros.size < 2) pinca = null;
    if (!arrasto || ponteiros.size > 0) return;
    if (arrasto.tipo === 'pan' && !arrasto.moveu && e.type === 'pointerup') selecionar(null);
    else if (arrasto.moveu && arrasto.tipo !== 'pan') {
      confirmar();
      formulario.atualizarValores(alvoSelecionado().objeto);
    }
    arrasto = null;
  }
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  svg.addEventListener('pointerleave', () => { coordEl.hidden = true; desenharFantasma(null); });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom(e.deltaY < 0 ? ZOOM.passoRoda : 1 / ZOOM.passoRoda, e.clientX, e.clientY);
  }, { passive: false });

  /* ---------- Teclado ---------- */

  const digitando = (alvo) => alvo.closest?.('input, textarea, select, [contenteditable="true"]');

  window.addEventListener('keydown', (e) => {
    if (!ativo || digitando(e.target)) return;
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); return; }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); refazer(); return; }
    if (e.key === 'Escape') { if (modo) definirModo(null); else selecionar(null); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); excluirSelecao(); return; }

    const setas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (setas[e.key] && selecao?.tipo === 'comodo') {
      e.preventDefault();
      const passo = e.shiftKey ? 10 : 1;
      op.transladarComodo(dados, indiceDoComodo(selecao.id), setas[e.key][0] * passo, setas[e.key][1] * passo);
      confirmar();
      formulario.atualizarValores(alvoSelecionado().objeto);
    }
  });

  /* ---------- Sincronia com o resto da página ---------- */

  // Escolher um cômodo na lista do painel também o seleciona no editor
  store.observar((id) => {
    if (selecao?.tipo === 'comodo' && selecao.id === id) return;
    selecao = { tipo: 'comodo', id };
    if (ativo) { desenharSelecao(); atualizarFormulario(); atualizarDica(); }
  });

  oferecerRascunho();

  /* ---------- API usada pelas abas ---------- */

  return {
    ativar() {
      ativo = true;
      renderizar();
      atualizarFormulario();
      atualizarBotoesHistorico();
      atualizarStatus();
      atualizarDica();
    },
    desativar() {
      ativo = false;
      arrasto = null;
      definirModo(null);
    },
  };
}
