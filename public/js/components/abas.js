/**
 * Alterna entre as abas do palco: Planta 2D, Modelo 3D, Caminhar e Editor.
 *
 * Cada aba diz quais elementos mostra; todos os outros ficam escondidos.
 * O controlador (quando existe) é ativado depois que os elementos aparecem,
 * porque 3D e editor precisam saber o tamanho real da área na tela.
 */
import { $ } from '../utils/dom.js';

export function iniciarAbas({ modelo3d, passeio, editor, corte }) {
  const ABAS = {
    '2d': { botao: 'tab-2d', mostrar: ['view-2d', 'bar-2d', 'painel-detalhe'] },
    '3d': { botao: 'tab-3d', mostrar: ['view-3d', 'painel-detalhe'], controlador: modelo3d },
    passeio: { botao: 'tab-passeio', mostrar: ['view-passeio', 'painel-detalhe'], controlador: passeio },
    editor: { botao: 'tab-editor', mostrar: ['view-editor', 'bar-editor', 'painel-editor'], controlador: editor },
    corte: { botao: 'tab-corte', mostrar: ['view-corte', 'bar-corte', 'painel-detalhe'], controlador: corte },
  };
  const todosOsElementos = [...new Set(Object.values(ABAS).flatMap((a) => a.mostrar))];
  let atual = '2d';

  // Endereço de cada aba (app.html#editor etc.), usado pelos links da página inicial
  const HASH_DA_ABA = { '2d': '2d', '3d': '3d', passeio: 'caminhar', editor: 'editor', corte: 'corte' };
  const ABA_DO_HASH = Object.fromEntries(Object.entries(HASH_DA_ABA).map(([aba, hash]) => [hash, aba]));

  function mostrar(nome) {
    const aba = ABAS[nome];
    ABAS[atual].controlador?.desativar();

    for (const id of todosOsElementos) $(id).hidden = !aba.mostrar.includes(id);
    for (const [chave, { botao }] of Object.entries(ABAS)) {
      $(botao).setAttribute('aria-pressed', String(chave === nome));
    }

    atual = nome;
    aba.controlador?.ativar();
    // replaceState não dispara hashchange nem cria entradas no histórico
    history.replaceState(null, '', `#${HASH_DA_ABA[nome]}`);
  }

  /** Abre a aba indicada no endereço, se houver uma. */
  function seguirHash() {
    const nome = ABA_DO_HASH[location.hash.slice(1)];
    if (nome && nome !== atual) mostrar(nome);
  }

  for (const [nome, { botao, controlador }] of Object.entries(ABAS)) {
    const el = $(botao);
    el.addEventListener('click', () => { if (nome !== atual) mostrar(nome); });
    // Adianta o que for pesado (ex.: baixar o three.js) assim que a pessoa mira na aba
    if (controlador?.preparar) {
      el.addEventListener('pointerenter', controlador.preparar, { once: true });
      el.addEventListener('focus', controlador.preparar, { once: true });
    }
  }

  window.addEventListener('hashchange', seguirHash);
  seguirHash();

  return {
    /** Abre uma aba por código (ex.: depois de gerar a planta por fotos). */
    mostrar(nome) {
      if (nome !== atual && ABAS[nome]) mostrar(nome);
    },
  };
}
