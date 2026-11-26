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
import { verificarEscadas } from '../../domain/escadas.js';
import { verificarVazios } from '../../domain/andares.js';
import { TIPOS_COMODO, ESCADA } from '../../constants/tipos.js';
import {
  paraFormatoComAndares, comodosCrus, andarPorId, andarVizinho, criarAndar, removerAndar,
} from '../../domain/andares.js';
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

/** Resumo curto de um texto (hash djb2), para saber se o apartamento.js mudou. */
function impressaoDigital(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return `${texto.length}:${(h >>> 0).toString(36)}`;
}

/**
 * Os ids crus de andares e cômodos passam a ser os mesmos da versão normalizada
 * (que corrige ids repetidos ou com caracteres inválidos), para o editor e o resto
 * da página falarem do mesmo andar e do mesmo cômodo.
 */
function igualarIds(bruto, normalizado) {
  bruto.andares.forEach((a, i) => {
    a.id = normalizado.andares[i].id;
    (a.vazios || []).forEach((v, j) => { v.id = normalizado.andares[i].vazios[j].id; });
  });
  comodosCrus(bruto).forEach((c, i) => { c.id = normalizado.comodos[i].id; });
  // Escadas também: um id com espaço ou repetido é corrigido na normalização,
  // e o editor precisa achar a escada crua pelo mesmo id da desenhada
  (bruto.escadas || []).forEach((e, i) => {
    e.id = normalizado.escadas[i].id;
    e.de = normalizado.escadas[i].de;
    e.para = normalizado.escadas[i].para;
  });
}

export function iniciarEditor(store, dadosIniciais) {
  const svg = $('editor-svg');
  const dicaEl = $('editor-dica');
  const coordEl = $('editor-coord');
  const statusEl = $('editor-status');
  const viewport = criarViewport(svg);

  // O editor trabalha sempre no formato com andares (o arquivo pode estar no simples)
  let dados = paraFormatoComAndares(dadosIniciais);
  igualarIds(dados, store.dados);
  const original = JSON.stringify(dados);
  const historico = { estados: [original], posicao: 0 };

  let normalizado = store.dados;
  let andarId = store.andarAtual;
  let vista = store.andar;   // andar visível, normalizado (o que é desenhado e validado)
  let problemas = [];  // sobreposições e cômodos sem espaço para a parede
  let selecao = { tipo: 'comodo', id: store.selecionadoId }; // ou { tipo: 'porta'|'janela', indice } ou null
  let modo = null;     // 'porta' | 'janela' enquanto está adicionando
  let arrasto = null;
  let ativo = false;

  const formulario = criarFormulario($('editor-form'), { aoAlterar: alterarCampo, aoAcao: executarAcao });

  /** Quantos cm cabem em 1 px da tela (para alças e ímã terem tamanho constante na tela). */
  const cmPorPx = () => 1 / (svg.getScreenCTM()?.a || 1);

  /** Andar cru visível. As listas são as da casa: alterar aqui altera a casa. */
  function andarCru() {
    return dados.andares.find((a) => a.id === andarId) || dados.andares.find((a) => a.referencia) || dados.andares[0];
  }

  /** O que as operações recebem: as listas do andar visível e os dados gerais da casa. */
  function planta() {
    const a = andarCru();
    return { parede: dados.parede, comodos: a.comodos, portas: a.portas, janelas: a.janelas, comodosDaCasa: comodosCrus(dados) };
  }

  const indiceDoComodo = (id) => andarCru().comodos.findIndex((c) => c.id === id);

  /* ---------- Desenho ---------- */

  function renderizar() {
    const resultado = normalizarDados(dados);
    if (!resultado.ok) { mostrarStatus(resultado.erro, 'erro'); return false; }
    normalizado = resultado.data;
    vista = andarPorId(normalizado, andarCru().id);
    // Sobreposições do andar + avisos das escadas que tocam nele
    problemas = [
      ...verificarSobreposicoes(vista),
      ...verificarEscadas(normalizado, TIPOS_COMODO).filter((p) => p.andares.includes(vista.id)),
      ...verificarVazios(normalizado, TIPOS_COMODO).filter((p) => p.andares.includes(vista.id)),
    ];
    // Mesmo enquadramento em todos os andares e as paredes do andar de baixo, tracejadas, para alinhar
    const { markup, viewBox } = desenharPlanta(vista, {
      prefixo: 'ed-',
      casa: normalizado,
      fantasma: andarVizinho(normalizado, vista.id, 'abaixo'),
    });
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
    const contorno = (pontos) => `<polygon class="ed-problema" points="${pontos.map(([x, y]) => `${x},${y}`).join(' ')}"/>`;
    g.innerHTML = vista.comodos.filter((c) => ids.has(c.id)).map((c) => contorno(c.pontos)).join('') +
      normalizado.escadas.filter((e) => ids.has(e.id)).map((e) => contorno(e.geo.contorno)).join('') +
      (vista.vazios || []).filter((v) => ids.has(v.id)).map((v) => contorno(v.pontos)).join('');
  }

  /** Lista de avisos no painel; clicar num aviso seleciona o cômodo (ou a escada) dele. */
  function mostrarAvisos() {
    const caixa = $('editor-avisos');
    caixa.hidden = problemas.length === 0;
    if (!problemas.length) { caixa.innerHTML = ''; return; }
    const titulo = problemas.length === 1 ? '1 problema na planta' : `${problemas.length} problemas na planta`;
    caixa.innerHTML = `<span class="eyebrow">${titulo}</span><ul>` +
      problemas.map((p) => `<li><button type="button" data-id="${escaparHtml(p.ids[0])}" data-tipo="${p.tipo === 'escada' || p.tipo === 'vazio' ? p.tipo : 'comodo'}">` +
        `${escaparHtml(p.mensagem)}</button></li>`).join('') +
      '</ul>';
  }

  $('editor-avisos').addEventListener('click', (e) => {
    const botao = e.target.closest('button[data-id]');
    if (botao) selecionar({ tipo: botao.dataset.tipo, id: botao.dataset.id });
  });

  function desenharSelecao() {
    const idSel = selecao?.tipo === 'comodo' ? selecao.id : null;
    const escadaSel = selecao?.tipo === 'escada' ? selecao.id : null;
    svg.querySelectorAll('.room').forEach((g) => g.classList.toggle('is-sel', g.dataset.id === idSel));
    svg.querySelectorAll('.escada').forEach((g) => g.classList.toggle('is-sel', g.dataset.escada === escadaSel));
    const vazioSel = selecao?.tipo === 'vazio' ? selecao.id : null;
    svg.querySelectorAll('.vazio').forEach((g) => g.classList.toggle('is-sel', g.dataset.vazio === vazioSel));
    const medidas = svg.querySelector('#ed-medidas-sel');
    const comodo = vista.comodos.find((c) => c.id === idSel);
    if (medidas) medidas.innerHTML = comodo ? desenharMedidasDoComodo(comodo, vista) : '';
    desenharSobreposicao();
  }

  /** Áreas de clique das portas/janelas e as alças do cômodo selecionado. */
  function desenharSobreposicao() {
    const g = svg.querySelector('#ed-sobreposicao');
    if (!g) return;
    const k = cmPorPx();
    let s = '';

    for (const [tipo, lista] of Object.entries(LISTA_DO_TIPO)) {
      vista[lista].forEach((a, i) => {
        const sel = selecao?.tipo === tipo && selecao.indice === i;
        s += `<line class="ed-abertura${sel ? ' is-sel' : ''}" data-lista="${lista}" data-indice="${i}" ` +
          `x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" stroke-width="${18 * k}"/>`;
      });
    }

    const idSel = selecao?.tipo === 'comodo' ? selecao.id : null;
    const comodo = vista.comodos.find((c) => c.id === idSel);
    const cru = andarCru().comodos[indiceDoComodo(idSel)];
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
    const achado = modo && ponto ? op.encontrarParede(planta(), ponto, EDITOR.alcanceParedePx * cmPorPx()) : null;
    if (!achado) { g.innerHTML = ''; return; }
    const a = op.criarAbertura(modo, achado);
    g.innerHTML = linha('ed-fantasma', a.x1, a.y1, a.x2, a.y2).replace('/>', ` stroke-width="${8 * cmPorPx()}"/>`);
  }

  /* ---------- Seleção e formulário ---------- */

  function alvoSelecionado() {
    if (selecao?.tipo === 'comodo') {
      const i = indiceDoComodo(selecao.id);
      if (i >= 0) {
        const area = vista.comodos.find((c) => c.id === selecao.id)?.area;
        return { tipo: 'comodo', objeto: andarCru().comodos[i], indice: i, area };
      }
    }
    if (selecao && LISTA_DO_TIPO[selecao.tipo]) {
      const objeto = andarCru()[LISTA_DO_TIPO[selecao.tipo]]?.[selecao.indice];
      if (objeto) return { tipo: selecao.tipo, objeto, indice: selecao.indice };
    }
    if (selecao?.tipo === 'vazio') {
      const objeto = (andarCru().vazios || []).find((v) => v.id === selecao.id);
      const vazio = (vista.vazios || []).find((v) => v.id === selecao.id);
      if (objeto) return { tipo: 'vazio', objeto, area: vazio?.area };
    }
    if (selecao?.tipo === 'escada') {
      const objeto = (dados.escadas || []).find((e) => e.id === selecao.id);
      const escada = normalizado.escadas.find((e) => e.id === selecao.id);
      if (objeto) {
        const nomeDe = (id) => normalizado.andares.find((a) => a.id === id)?.nome ?? id;
        return { tipo: 'escada', objeto, escada, rota: escada ? `${nomeDe(escada.de)} → ${nomeDe(escada.para)}` : '' };
      }
    }
    // Configurações da casa; com mais de um andar, também as do andar visível
    const andar = dados.andares.length > 1 ? { cru: andarCru(), normalizado: vista, varios: true } : undefined;
    return { tipo: 'casa', objeto: dados, andar };
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

  /**
   * Registra o estado atual: histórico, rascunho e publica para as outras abas.
   * `opcoes.reenquadrar`: a casa mudou inteira (ex.: planta gerada por IA) e as vistas se reajustam.
   */
  function confirmar(opcoes) {
    if (!renderizar()) return false;
    const estado = JSON.stringify(dados);
    if (estado !== historico.estados[historico.posicao]) {
      historico.estados = historico.estados.slice(0, historico.posicao + 1);
      historico.estados.push(estado);
      if (historico.estados.length > EDITOR.limiteHistorico) historico.estados.shift();
      historico.posicao = historico.estados.length - 1;
    }
    salvarRascunho(estado);
    store.substituirDados(normalizado, opcoes);
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
    $('ed-andar-excluir').disabled = dados.andares.length < 2;
  }

  /*
   * Salvamento automático (localStorage), para não perder nada ao fechar a guia:
   * - grava a cada alteração confirmada e também ao sair da página (pagehide),
   *   o que cobre um campo em digitação ou um arrasto pela metade;
   * - guarda o histórico junto, então Desfazer/Refazer continua depois de reabrir;
   * - guarda uma "impressão digital" do apartamento.js usado como base. Ao reabrir,
   *   se o arquivo é o mesmo, as alterações voltam sozinhas; se o arquivo mudou
   *   desde então, a pessoa escolhe entre restaurar ou descartar.
   */
  const base = impressaoDigital(original);
  // Rascunhos salvos antes dos andares usavam o arquivo no formato simples como base
  const baseAntiga = (() => {
    const simples = structuredClone(dadosIniciais);
    if (Array.isArray(simples.comodos)) simples.comodos.forEach((c, i) => { c.id = store.dados.comodos[i].id; });
    return impressaoDigital(JSON.stringify(simples));
  })();
  let salvoEm = null;          // horário do último salvamento que deu certo
  let armazenamentoOk = true;   // false: navegador bloqueou (ex.: aba privada) → avisar antes de fechar
  let ultimoSalvo = original;

  function salvarRascunho(estado) {
    try {
      if (estado === original) {
        localStorage.removeItem(EDITOR.chaveRascunho);
        salvoEm = null;
      } else {
        const registro = { versao: 2, base, dados: estado, quando: Date.now() };
        try {
          localStorage.setItem(EDITOR.chaveRascunho, JSON.stringify({ ...registro, historico }));
        } catch {
          // Sem espaço para o histórico inteiro: guarda pelo menos a planta atual
          localStorage.setItem(EDITOR.chaveRascunho, JSON.stringify(registro));
        }
        salvoEm = new Date(registro.quando);
      }
      ultimoSalvo = estado;
      armazenamentoOk = true;
    } catch {
      armazenamentoOk = false; // navegador sem armazenamento: o editor funciona igual, só não guarda
    }
    atualizarStatus();
  }

  /** Grava o que estiver na tela ao sair da página, mesmo sem ter "confirmado". */
  function salvarAoSair() {
    const estado = JSON.stringify(dados);
    if (estado === ultimoSalvo || !normalizarDados(dados).ok) return;
    salvarRascunho(estado);
  }

  function lerRascunho() {
    try { return JSON.parse(localStorage.getItem(EDITOR.chaveRascunho)); } catch { return null; }
  }

  function apagarRascunho() {
    try { localStorage.removeItem(EDITOR.chaveRascunho); } catch { /* sem armazenamento */ }
    salvoEm = null;
  }

  /** Histórico salvo só vale se começa no mesmo arquivo e termina na planta salva. */
  function historicoValido(h, estado) {
    return Array.isArray(h?.estados) && h.estados.length > 0 && h.estados[0] === original &&
      Number.isInteger(h.posicao) && h.estados[h.posicao] === estado;
  }

  function aplicarRascunho(rascunho) {
    dados = JSON.parse(rascunho.dados);
    if (historicoValido(rascunho.historico, rascunho.dados)) {
      historico.estados = rascunho.historico.estados.slice(-EDITOR.limiteHistorico);
      historico.posicao = historico.estados.lastIndexOf(rascunho.dados);
    } else {
      historico.estados = [original, rascunho.dados];
      historico.posicao = 1;
    }
    validarSelecao();
    if (!renderizar()) return false;
    ultimoSalvo = rascunho.dados;
    salvoEm = new Date(rascunho.quando);
    store.substituirDados(normalizado, { reenquadrar: true });
    atualizarBotoesHistorico();
    if (ativo) { viewport.ajustar(); desenharSobreposicao(); atualizarFormulario(); }
    return true;
  }

  function mostrarAviso(texto, rotuloPrincipal, aoPrincipal, rotuloSecundario, aoSecundario) {
    const aviso = $('editor-rascunho');
    $('editor-rascunho-txt').textContent = texto;
    $('ed-rascunho-restaurar').textContent = rotuloPrincipal;
    $('ed-rascunho-descartar').textContent = rotuloSecundario;
    $('ed-rascunho-restaurar').onclick = () => { aviso.hidden = true; aoPrincipal(); };
    $('ed-rascunho-descartar').onclick = () => { aoSecundario(); };
    aviso.hidden = false;
  }

  /** Ao abrir a página: devolve as alterações salvas, ou pergunta se o arquivo mudou. */
  function recuperarRascunho() {
    const salvo = lerRascunho();
    if (!salvo?.dados) return;

    // Rascunho antigo (formato simples): passa para o formato com andares
    let rascunho;
    try { rascunho = { ...salvo, dados: JSON.stringify(paraFormatoComAndares(JSON.parse(salvo.dados))) }; } catch { return; }
    if (rascunho.dados === original) { apagarRascunho(); return; } // já está no arquivo

    let valido = false;
    try { valido = normalizarDados(JSON.parse(rascunho.dados)).ok; } catch { /* corrompido */ }
    if (!valido) return;

    const quando = new Date(rascunho.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

    if ((rascunho.base === base || rascunho.base === baseAntiga) && aplicarRascunho(rascunho)) {
      mostrarAviso(
        `Recuperamos as alterações que você fez em ${quando}. Elas ficam salvas automaticamente neste navegador.`,
        'Ok, continuar', () => {},
        'Voltar ao arquivo original', () => {
          if (!window.confirm('Descartar as alterações recuperadas e voltar ao arquivo apartamento.js? Dá para desfazer com Ctrl+Z enquanto a página estiver aberta.')) return;
          $('editor-rascunho').hidden = true;
          dados = JSON.parse(original);
          validarSelecao();
          confirmar({ reenquadrar: true });
          atualizarFormulario();
        },
      );
      return;
    }

    // O apartamento.js mudou desde que as alterações foram feitas: a pessoa decide
    mostrarAviso(
      `Há alterações salvas neste navegador em ${quando}, feitas sobre uma versão anterior do arquivo apartamento.js.`,
      'Restaurar alterações', () => {
        dados = JSON.parse(rascunho.dados);
        validarSelecao();
        confirmar({ reenquadrar: true });
        atualizarFormulario();
        if (ativo) { viewport.ajustar(); desenharSobreposicao(); }
      },
      'Descartar', () => { $('editor-rascunho').hidden = true; apagarRascunho(); },
    );
  }

  window.addEventListener('pagehide', salvarAoSair);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salvarAoSair(); });
  // Só pede confirmação ao fechar quando o salvamento automático não funciona
  window.addEventListener('beforeunload', (e) => {
    if (armazenamentoOk || JSON.stringify(dados) === original) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ---------- Mensagens ---------- */

  let temporizadorStatus = null;

  function mostrarStatus(texto, tipo = '') {
    statusEl.textContent = texto;
    statusEl.className = `ed-status ${tipo}`;
  }

  function atualizarStatus() {
    clearTimeout(temporizadorStatus);
    const alterado = JSON.stringify(dados) !== original;
    if (!alterado) { mostrarStatus('Sem alterações em relação ao arquivo apartamento.js.'); return; }
    if (!armazenamentoOk) {
      mostrarStatus('Este navegador não permite salvar automaticamente (aba privada?). Baixe o apartamento.js antes de fechar a guia, ou as alterações se perdem.', 'erro');
      return;
    }
    const hora = salvoEm ? salvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;
    mostrarStatus(`${hora ? `Salvo automaticamente neste navegador às ${hora}.` : 'Salvo automaticamente neste navegador.'} ` +
      'Para guardar de vez no projeto, baixe o apartamento.js.', 'ok');
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
    } else if (selecao?.tipo === 'escada') {
      dicaEl.textContent = 'Arraste a escada para posicioná-la · setas movem 1 cm (Shift: 10) · tipo e sentido no painel · Delete exclui';
    } else if (selecao?.tipo === 'vazio') {
      dicaEl.textContent = 'Arraste o vazio para posicioná-lo · setas movem 1 cm (Shift: 10) · medidas no painel · Delete exclui';
    } else if (selecao) {
      dicaEl.textContent = `Arraste a ${selecao.tipo} para deslizá-la pela parede · Delete exclui`;
    } else {
      dicaEl.textContent = 'Clique num cômodo, porta ou janela para editar · arraste o fundo para navegar';
    }
  }

  /* ---------- Alterações pelo formulário ---------- */

  /** Campos "andar:..." das configurações: mexem no andar visível. Vazio = automático. */
  function alterarCampoDoAndar(chave, valor, final) {
    const a = andarCru();
    if (chave === 'nome') {
      if (!String(valor).trim()) return;
      a.nome = String(valor).trim();
    } else if (chave === 'referencia') {
      // Só um andar fica no nível da rua
      dados.andares.forEach((outro) => { delete outro.referencia; });
      if (valor) a.referencia = true;
    } else if (valor === '') {
      delete a[chave];
    } else {
      const n = Number(valor);
      if (!Number.isFinite(n)) return;
      a[chave] = n;
    }
    renderizar();
    if (final) {
      confirmar();
      atualizarFormulario(); // cota e valores automáticos mudam
    }
  }

  /* ---------- Escadas ---------- */

  /** Lados da escada no sentido da subida: `lateral` (u) e `fundo` (v), em largura/comprimento. */
  const ladosDaEscada = (o) => (o.sobe === 'leste' || o.sobe === 'oeste'
    ? { lateral: 'comprimento', fundo: 'largura' }
    : { lateral: 'largura', fundo: 'comprimento' });

  /**
   * Ao trocar o tipo, dá à escada um tamanho que funciona: com `espelhos` degraus,
   * pisos de ~28 cm e lances de 90 cm (dá para ajustar depois).
   */
  function ajustarAoTipo(o, espelhos) {
    const { lateral, fundo } = ladosDaEscada(o);
    const p = ESCADA.pisoIdeal, l = o.lance ?? ESCADA.lance;
    const metade = Math.ceil((espelhos - 2) / 2) * p;
    delete o.volta;
    if (o.tipo === 'reta') {
      delete o.lance; delete o.giro;
      o[lateral] = l; o[fundo] = (espelhos - 1) * p;
    } else if (o.tipo === 'L') {
      o.lance = l; o.giro ??= 'direita';
      o[fundo] = metade + l; o[lateral] = Math.floor((espelhos - 2) / 2) * p + l;
    } else if (o.tipo === 'U') {
      o.lance = l; o.giro ??= 'direita';
      o[lateral] = 2 * l + 20; o[fundo] = metade + l;
    } else if (o.tipo === 'caracol') {
      delete o.lance; o.giro ??= 'direita'; o.volta = ESCADA.volta;
      o.largura = ESCADA.diametroCaracol; o.comprimento = ESCADA.diametroCaracol;
    }
  }

  function alterarCampoDaEscada(alvo, campo, valor, final) {
    const o = alvo.objeto;
    if (['x', 'y', 'largura', 'comprimento', 'lance', 'volta'].includes(campo)) {
      const n = Number(valor);
      if (valor === '' || !Number.isFinite(n)) return;
      if (campo !== 'x' && campo !== 'y' && n < (campo === 'volta' ? 90 : 30)) return;
      o[campo] = n;
    } else if (campo === 'nome') {
      if (!String(valor).trim()) return;
      o.nome = String(valor).trim();
    } else {
      o[campo] = valor;
      if (campo === 'tipo') ajustarAoTipo(o, alvo.escada?.geo.espelhos ?? 16);
    }
    renderizar();
    if (final) {
      confirmar();
      if (['tipo', 'nome', 'sobe'].includes(campo)) atualizarFormulario();
      else formulario.atualizarValores(o);
    }
  }

  /** Gira 90° no sentido horário, em torno do centro (largura e comprimento trocam). */
  function girarEscada(o) {
    const ordem = ['norte', 'leste', 'sul', 'oeste'];
    const cx = o.x + o.largura / 2, cy = o.y + o.comprimento / 2;
    o.sobe = ordem[(ordem.indexOf(o.sobe ?? 'norte') + 1) % 4];
    [o.largura, o.comprimento] = [o.comprimento, o.largura];
    o.x = Math.round(cx - o.largura / 2);
    o.y = Math.round(cy - o.comprimento / 2);
  }

  /** Escada do andar visível para o de cima, dentro do cômodo selecionado (ou do maior). */
  function adicionarEscada() {
    definirModo(null);
    const acima = andarVizinho(normalizado, vista.id, 'acima');
    if (!acima) {
      avisarRapido('A escada vai do andar visível para o andar de cima. Crie antes um andar acima (Andar → + Acima).', 'erro');
      return;
    }
    const espelhos = Math.max(2, Math.round((acima.cota - vista.cota) / ESCADA.espelhoIdeal));
    const internos = vista.comodos.filter((c) => !TIPOS_COMODO[c.tipo].externo);
    const comodo = internos.find((c) => selecao?.tipo === 'comodo' && c.id === selecao.id)
      || [...internos].sort((a, b) => b.area - a.area)[0] || vista.comodos[0];
    const usados = new Set((dados.escadas || []).map((e) => e.id));
    let n = (dados.escadas || []).length + 1;
    while (usados.has(`escada-${n}`)) n++;
    const nova = {
      id: `escada-${n}`, nome: n === 1 ? 'Escada' : `Escada ${n}`, tipo: 'reta',
      de: vista.id, para: acima.id,
      x: Math.round(comodo.bb.minX + 10), y: Math.round(comodo.bb.minY + 10),
      largura: ESCADA.lance, comprimento: (espelhos - 1) * ESCADA.pisoIdeal, sobe: 'norte',
    };
    (dados.escadas ||= []).push(nova);
    selecao = { tipo: 'escada', id: nova.id };
    if (!confirmar()) return;
    selecionar(selecao);
    avisarRapido(`Escada para "${acima.nome}" criada (${espelhos} degraus). Arraste para posicionar e escolha o tipo no painel.`);
  }

  /* ---------- Vazios (pé-direito duplo) ---------- */

  /** Move um vazio (retângulo ou forma livre); `naGrade` encaixa de 5 em 5 cm (arrasto). */
  function moverVazio(v, dx, dy, naGrade) {
    const g = (n) => (naGrade ? Math.round(n / EDITOR.grade) * EDITOR.grade : Math.round(n));
    if (Array.isArray(v.pontos)) {
      const ox = g(v.pontos[0][0] + dx) - v.pontos[0][0], oy = g(v.pontos[0][1] + dy) - v.pontos[0][1];
      v.pontos = v.pontos.map(([x, y]) => [x + ox, y + oy]);
    } else {
      v.x = g(v.x + dx);
      v.y = g(v.y + dy);
    }
  }

  /** Vazio no cômodo selecionado do andar visível (o de baixo ganha pé-direito duplo). */
  function adicionarVazio() {
    definirModo(null);
    const abaixo = andarVizinho(normalizado, vista.id, 'abaixo');
    if (!abaixo) {
      avisarRapido('O vazio é um recorte no piso: ele precisa de um andar embaixo. Vá para o andar de cima (ou crie um com Andar → + Acima).', 'erro');
      return;
    }
    const internos = vista.comodos.filter((c) => !TIPOS_COMODO[c.tipo].externo);
    const comodo = internos.find((c) => selecao?.tipo === 'comodo' && c.id === selecao.id)
      || [...internos].sort((a, b) => b.area - a.area)[0] || vista.comodos[0];
    const a = andarCru();
    const usados = new Set(dados.andares.flatMap((x) => (x.vazios || []).map((v) => v.id)));
    let n = 1;
    while (usados.has(`vazio-${n}`)) n++;
    const largura = Math.max(60, Math.min(300, Math.round(comodo.bb.w / 2)));
    const comprimento = Math.max(60, Math.min(300, Math.round(comodo.bb.h / 2)));
    const novo = {
      id: `vazio-${n}`, nome: n === 1 ? 'Vazio' : `Vazio ${n}`,
      x: Math.round(comodo.bb.minX + 10), y: Math.round(comodo.bb.minY + 10), largura, comprimento,
    };
    (a.vazios ||= []).push(novo);
    selecao = { tipo: 'vazio', id: novo.id };
    if (!confirmar()) return;
    selecionar(selecao);
    avisarRapido(`Vazio criado: o cômodo embaixo, no "${abaixo.nome}", ganha pé-direito duplo. Arraste para posicionar.`);
  }

  function alterarCampoDoVazio(alvo, campo, valor, final) {
    const o = alvo.objeto;
    if (campo === 'nome') {
      if (!String(valor).trim()) return;
      o.nome = String(valor).trim();
    } else {
      const n = Number(valor);
      if (valor === '' || !Number.isFinite(n)) return;
      if ((campo === 'largura' || campo === 'comprimento') && n < 30) return;
      o[campo] = n;
    }
    renderizar();
    if (final) { confirmar(); if (campo === 'nome') atualizarFormulario(); }
  }

  /** Campos "terreno:..." e "telhado:..." das configurações da casa. */
  function alterarCampoDaCasa(grupo, chave, valor, final) {
    if (grupo === 'terreno' && chave === 'desce' && !valor) {
      delete dados.terreno; // plano
    } else if (grupo === 'telhado' && chave === 'tipo' && valor === 'nenhum') {
      delete dados.telhado;
    } else {
      const o = (dados[grupo] ||= {});
      if (chave === 'desce' || chave === 'tipo') o[chave] = valor;
      else {
        const n = Number(valor);
        if (valor === '' || !Number.isFinite(n)) return;
        o[chave] = n;
      }
      // Desnível sem valor ainda: começa com o pé-direito padrão (terreno de um andar inteiro)
      if (grupo === 'terreno' && !o.desnivel) o.desnivel = dados.peDireito || 270;
    }
    renderizar();
    if (final) { confirmar(); atualizarFormulario(); }
  }

  function alterarCampo(campo, valor, final) {
    if (campo.startsWith('andar:')) { alterarCampoDoAndar(campo.slice(6), valor, final); return; }
    const [grupo, chave] = campo.split(':');
    if (chave && (grupo === 'terreno' || grupo === 'telhado')) { alterarCampoDaCasa(grupo, chave, valor, final); return; }
    const alvo = alvoSelecionado();
    if (alvo.tipo === 'escada') { alterarCampoDaEscada(alvo, campo, valor, final); return; }
    if (alvo.tipo === 'vazio') { alterarCampoDoVazio(alvo, campo, valor, final); return; }
    const o = alvo.objeto;

    if (CAMPOS_NUMERICOS.has(campo)) {
      const n = Number(valor);
      if (valor === '' || !Number.isFinite(n)) return;
      if (alvo.tipo === 'comodo' && (campo === 'x' || campo === 'y')) {
        op.transladarComodo(planta(), alvo.indice, campo === 'x' ? n - o.x : 0, campo === 'y' ? n - o.y : 0);
      } else if (alvo.tipo === 'comodo' && (campo === 'largura' || campo === 'comprimento')) {
        op.ajustarTamanho(planta(), alvo.indice, campo, n);
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
    if (acao === 'girar' && alvo.tipo === 'escada') {
      girarEscada(alvo.objeto);
      confirmar();
      atualizarFormulario();
      return;
    }
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
      if (andarCru().comodos.length === 1) {
        avisarRapido(dados.andares.length > 1 ? 'Cada andar precisa de pelo menos um cômodo.' : 'A casa precisa de pelo menos um cômodo.', 'erro');
        return;
      }
      op.removerComodo(planta(), alvo.indice);
    } else if (alvo.tipo === 'escada') {
      dados.escadas = dados.escadas.filter((e) => e !== alvo.objeto);
    } else if (alvo.tipo === 'vazio') {
      const a = andarCru();
      a.vazios = a.vazios.filter((v) => v !== alvo.objeto);
    } else {
      andarCru()[LISTA_DO_TIPO[alvo.tipo]].splice(alvo.indice, 1);
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
    const p = planta();
    const i = funcao(p);
    selecao = { tipo: 'comodo', id: p.comodos[i].id };
    confirmar();
    viewport.ajustar();
    selecionar(selecao);
  }

  function colocarAbertura(ponto) {
    const achado = op.encontrarParede(planta(), ponto, EDITOR.alcanceParedePx * cmPorPx());
    if (!achado) { dicaEl.textContent = 'Clique mais perto de uma parede de um cômodo (Esc cancela)'; return; }
    const lista = LISTA_DO_TIPO[modo];
    const andar = andarCru();
    (andar[lista] ||= []).push(op.criarAbertura(modo, achado));
    const tipo = modo;
    definirModo(null);
    selecao = { tipo, indice: andar[lista].length - 1 };
    confirmar();
    selecionar(selecao);
  }

  function zoom(fator, x, y) {
    viewport.zoom(fator, x, y);
    desenharSobreposicao();
  }

  $('ed-add-comodo').addEventListener('click', () => adicionar(op.adicionarComodo));
  $('ed-add-sacada').addEventListener('click', () => adicionar(op.adicionarSacada));
  $('ed-add-escada').addEventListener('click', adicionarEscada);
  $('ed-add-vazio').addEventListener('click', adicionarVazio);
  $('ed-add-porta').addEventListener('click', () => definirModo(modo === 'porta' ? null : 'porta'));
  $('ed-add-janela').addEventListener('click', () => definirModo(modo === 'janela' ? null : 'janela'));
  $('ed-desfazer').addEventListener('click', desfazer);
  $('ed-refazer').addEventListener('click', refazer);
  $('ed-zoom-mais').addEventListener('click', () => zoom(ZOOM.passoBotao));
  $('ed-zoom-menos').addEventListener('click', () => zoom(1 / ZOOM.passoBotao));
  $('ed-zoom-ajustar').addEventListener('click', () => { viewport.ajustar(); desenharSobreposicao(); });

  /* ---------- Andares ---------- */

  /** Cria um andar acima/abaixo do visível, já com o contorno dele, e passa a editá-lo. */
  function adicionarAndar(lado) {
    definirModo(null);
    const { andar, comodo } = criarAndar(dados, andarCru().id, lado);
    if (!confirmar({ reenquadrar: true })) return;
    store.selecionar(comodo.id); // troca o andar visível em toda a página
    selecionar({ tipo: 'comodo', id: comodo.id });
    avisarRapido(`Andar "${andar.nome}" criado com o contorno do andar ${lado === 'acima' ? 'de baixo' : 'de cima'}. ` +
      'Redimensione ou divida a "área" em cômodos.');
  }

  function excluirAndar() {
    const a = andarCru();
    const qtd = a.comodos.length;
    if (!window.confirm(`Excluir o andar "${a.nome}" e ${qtd === 1 ? 'o cômodo dele' : `os ${qtd} cômodos dele`}? Dá para desfazer com Ctrl+Z.`)) return;
    const resultado = removerAndar(dados, a.id);
    if (!resultado.ok) { avisarRapido(resultado.erro, 'erro'); return; }
    selecao = null;
    confirmar({ reenquadrar: true }); // o store volta para um andar que existe e avisa o editor
    atualizarFormulario();
    atualizarDica();
  }

  $('ed-andar-acima').addEventListener('click', () => adicionarAndar('acima'));
  $('ed-andar-abaixo').addEventListener('click', () => adicionarAndar('abaixo'));
  $('ed-andar-excluir').addEventListener('click', excluirAndar);
  // Ajustes do andar ficam nas configurações (aparecem com nada selecionado)
  $('ed-andar-ajustes').addEventListener('click', () => {
    selecionar(null);
    $('editor-form').querySelector('[data-campo="andar:nome"], [data-campo="peDireito"]')?.focus();
  });

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
    const escada = e.target.closest('.escada');
    const vazio = e.target.closest('.vazio');
    const comodo = e.target.closest('.room');

    if (alca && selecao?.tipo === 'comodo') {
      const indice = indiceDoComodo(selecao.id);
      arrasto = { ...base, tipo: 'alca', alca: alca.dataset.alca, indice, ...contexto(indice) };
    } else if (vazio) {
      selecionar({ tipo: 'vazio', id: vazio.dataset.vazio });
      arrasto = { ...base, tipo: 'vazio', id: vazio.dataset.vazio };
    } else if (escada) {
      selecionar({ tipo: 'escada', id: escada.dataset.escada });
      arrasto = { ...base, tipo: 'escada', id: escada.dataset.escada };
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
    const p = planta();
    const id = p.comodos[indice].id;
    return {
      caixas: vista.comodos.filter((c) => c.id !== id).map((c) => c.bb),
      anexas: op.aberturasAnexas(p, p.comodos[indice]),
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
    const p = planta(); // depois de recarregar `dados`: a vista precisa apontar para as listas novas
    const dx = ponto[0] - arrasto.ponto[0], dy = ponto[1] - arrasto.ponto[1];
    const opcoes = { caixas: arrasto.caixas, tolerancia: EDITOR.imaPx * cmPorPx(), anexas: arrasto.anexas };

    if (arrasto.tipo === 'comodo') {
      op.moverComodo(p, arrasto.indice, dx, dy, opcoes);
    } else if (arrasto.tipo === 'alca' && arrasto.alca.startsWith('p')) {
      const v = Number(arrasto.alca.slice(1));
      const [x0, y0] = p.comodos[arrasto.indice].pontos[v];
      op.moverVertice(p, arrasto.indice, v, x0 + dx, y0 + dy, opcoes);
    } else if (arrasto.tipo === 'alca') {
      op.redimensionarComodo(p, arrasto.indice, arrasto.alca, dx, dy, opcoes);
    } else if (arrasto.tipo === 'abertura') {
      op.moverAberturaNaParede(p[arrasto.lista][arrasto.indice], dx, dy);
    } else if (arrasto.tipo === 'vazio') {
      const v = (andarCru().vazios || []).find((x) => x.id === arrasto.id);
      if (v) moverVazio(v, dx, dy, true);
    } else if (arrasto.tipo === 'escada') {
      // A escada anda na grade de 5 cm (vale para os dois andares que ela liga)
      const e = dados.escadas.find((esc) => esc.id === arrasto.id);
      if (e) { e.x = Math.round((e.x + dx) / EDITOR.grade) * EDITOR.grade; e.y = Math.round((e.y + dy) / EDITOR.grade) * EDITOR.grade; }
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
    if (setas[e.key] && selecao?.tipo === 'vazio') {
      e.preventDefault();
      const v = (andarCru().vazios || []).find((x) => x.id === selecao.id);
      if (!v) return;
      const passo = e.shiftKey ? 10 : 1;
      moverVazio(v, setas[e.key][0] * passo, setas[e.key][1] * passo, false);
      confirmar();
      formulario.atualizarValores(v);
      return;
    }
    if (setas[e.key] && selecao?.tipo === 'escada') {
      e.preventDefault();
      const esc = (dados.escadas || []).find((x) => x.id === selecao.id);
      if (!esc) return;
      const passo = e.shiftKey ? 10 : 1;
      esc.x += setas[e.key][0] * passo;
      esc.y += setas[e.key][1] * passo;
      confirmar();
      formulario.atualizarValores(esc);
      return;
    }
    if (setas[e.key] && selecao?.tipo === 'comodo') {
      e.preventDefault();
      const passo = e.shiftKey ? 10 : 1;
      op.transladarComodo(planta(), indiceDoComodo(selecao.id), setas[e.key][0] * passo, setas[e.key][1] * passo);
      confirmar();
      formulario.atualizarValores(alvoSelecionado().objeto);
    }
  });

  /* ---------- Sincronia com o resto da página ---------- */

  // Trocar de andar em qualquer lugar da página troca o andar editado
  store.observarAndar((id) => {
    andarId = id;
    // Escada que não toca o andar novo deixa de estar selecionada (ela não aparece nele)
    if (selecao?.tipo === 'escada') {
      const esc = (dados.escadas || []).find((e) => e.id === selecao.id);
      if (!esc || (esc.de !== id && esc.para !== id)) selecao = null;
    }
    if (!ativo) { renderizar(); return; }
    definirModo(null);
    renderizar();
    viewport.ajustar();
    desenharSobreposicao();
    atualizarFormulario();
    atualizarDica();
  });

  // Escolher um cômodo na lista do painel também o seleciona no editor
  store.observar((id) => {
    if (selecao?.tipo === 'comodo' && selecao.id === id) return;
    selecao = { tipo: 'comodo', id };
    if (ativo) { desenharSelecao(); atualizarFormulario(); atualizarDica(); }
  });

  recuperarRascunho();

  /* ---------- API usada pelas abas ---------- */

  return {
    /**
     * Coloca uma planta pronta (ex.: gerada por IA). Entra no histórico como
     * qualquer alteração: Ctrl+Z volta à planta anterior.
     * `destino`: 'casa' troca a casa inteira; 'andar' troca só o andar visível;
     * 'acima' / 'abaixo' criam um andar novo com ela (a planta deve ter um andar só).
     * Retorna { ok: true, problemas } ou { ok: false, erro }.
     */
    importar(bruto, destino = 'casa') {
      const gerado = normalizarDados(bruto);
      if (!gerado.ok) return gerado;
      const anterior = JSON.stringify(dados);
      let alvoId = null;

      if (destino === 'casa') {
        dados = paraFormatoComAndares(bruto);
      } else {
        const [novo] = paraFormatoComAndares(bruto).andares;
        const alvo = destino === 'andar' ? andarCru() : criarAndar(dados, andarCru().id, destino).andar;
        Object.assign(alvo, { comodos: novo.comodos, portas: novo.portas, janelas: novo.janelas });
        if (Number(bruto.peDireito) > 0 && bruto.peDireito !== dados.peDireito) alvo.peDireito = bruto.peDireito;
        else delete alvo.peDireito;
        alvoId = alvo.id;
      }

      // Normaliza a casa toda (ids repetidos entre andares viram únicos aqui)
      const resultado = normalizarDados(dados);
      if (!resultado.ok) { dados = JSON.parse(anterior); return resultado; }
      igualarIds(dados, resultado.data);
      const doAlvo = (c) => !alvoId || c.andar === alvoId;
      const inicial = resultado.data.comodos.find((c) => doAlvo(c) && c.id === resultado.data.comodoInicial)
        || resultado.data.comodos.find(doAlvo);
      selecao = { tipo: 'comodo', id: inicial.id };
      andarId = inicial.andar;
      definirModo(null);
      if (!confirmar({ reenquadrar: true })) return { ok: false, erro: 'não foi possível desenhar a planta.' };
      viewport.ajustar();
      store.selecionar(selecao.id);
      if (ativo) { desenharSobreposicao(); atualizarFormulario(); atualizarDica(); }
      return { ok: true, problemas };
    },

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
