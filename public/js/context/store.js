/**
 * Estado compartilhado da página: os dados da casa, o andar visível e o cômodo selecionado.
 *
 * Os componentes (planta 2D, painel, modelo 3D, passeio, editor) não conversam
 * entre si: todos leem daqui e se inscrevem para reagir às mudanças.
 * - observar(fn)       → a seleção mudou
 * - observarAndar(fn)  → o andar visível mudou (avisado antes da seleção)
 * - observarDados(fn)  → os dados da casa mudaram (ex.: pelo editor)
 *
 * `dados` é a casa inteira (normalizada); `andar` é a planta do andar visível,
 * no formato de um andar só ({ comodos, portas, janelas, peDireito, ... }).
 */
import { andarPorId, andarReferencia } from '../domain/andares.js';

export function criarStore(dadosIniciais, idInicial) {
  const ouvintesSelecao = new Set();
  const ouvintesAndar = new Set();
  const ouvintesDados = new Set();
  let dados = dadosIniciais;

  const comodo = (id) => dados.comodos.find((c) => c.id === id);
  let selecionadoId = comodo(idInicial) ? idInicial : primeiroComodo(andarReferencia(dados)).id;
  let andarId = comodo(selecionadoId).andar;

  /** O cômodo inicial do andar (o da casa, se for dele) ou o primeiro. */
  function primeiroComodo(andar) {
    return andar.comodos.find((c) => c.id === dados.comodoInicial) || andar.comodos[0];
  }

  /** Troca o andar visível e avisa; retorna true se mudou. */
  function trocarAndar(id) {
    if (id === andarId) return false;
    andarId = id;
    ouvintesAndar.forEach((fn) => fn(id));
    return true;
  }

  const inscrever = (lista, fn) => {
    lista.add(fn);
    return () => lista.delete(fn);
  };

  return {
    get dados() {
      return dados;
    },

    /** Planta do andar visível. */
    get andar() {
      return andarPorId(dados, andarId);
    },

    get andarAtual() {
      return andarPorId(dados, andarId).id;
    },

    get selecionadoId() {
      return selecionadoId;
    },

    get comodoSelecionado() {
      return comodo(selecionadoId) || dados.comodos[0];
    },

    /** Seleciona um cômodo; se ele é de outro andar, esse andar passa a ser o visível. */
    selecionar(id) {
      const alvo = comodo(id);
      if (alvo) trocarAndar(alvo.andar);
      selecionadoId = id;
      ouvintesSelecao.forEach((fn) => fn(id));
    },

    /**
     * Mostra outro andar; a seleção vai para um cômodo dele. Os ouvintes da
     * seleção recebem `{ porTrocaDeAndar: true }` (ex.: o passeio mantém a posição).
     */
    selecionarAndar(id) {
      const andar = andarPorId(dados, id);
      if (!trocarAndar(andar.id)) return;
      if (comodo(selecionadoId)?.andar !== andar.id) {
        selecionadoId = primeiroComodo(andar).id;
        ouvintesSelecao.forEach((fn) => fn(selecionadoId, { porTrocaDeAndar: true }));
      }
    },

    /**
     * Troca os dados (já normalizados) e avisa todos os componentes.
     * `opcoes.reenquadrar`: a casa mudou inteira e as vistas devem se reajustar.
     */
    substituirDados(novos, opcoes = {}) {
      dados = novos;
      const anterior = andarId;
      if (!dados.andares.some((a) => a.id === andarId)) andarId = andarReferencia(dados).id;
      const atual = comodo(selecionadoId);
      if (!atual) selecionadoId = primeiroComodo(andarPorId(dados, andarId)).id;
      else andarId = atual.andar;
      // O andar visível pode ter sumido (ex.: desfazer a criação de um andar)
      if (andarId !== anterior) ouvintesAndar.forEach((fn) => fn(andarId));
      ouvintesDados.forEach((fn) => fn(dados, opcoes));
    },

    /** Registra um ouvinte da seleção; retorna a função para cancelar. */
    observar: (fn) => inscrever(ouvintesSelecao, fn),

    /** Registra um ouvinte de troca de andar; retorna a função para cancelar. */
    observarAndar: (fn) => inscrever(ouvintesAndar, fn),

    /** Registra um ouvinte de mudança nos dados; retorna a função para cancelar. */
    observarDados: (fn) => inscrever(ouvintesDados, fn),
  };
}
