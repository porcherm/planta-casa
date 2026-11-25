/**
 * Estado compartilhado da página: os dados do apartamento e o cômodo selecionado.
 *
 * Os componentes (planta 2D, painel, modelo 3D, passeio, editor) não conversam
 * entre si: todos leem daqui e se inscrevem para reagir às mudanças.
 * - observar(fn)       → a seleção mudou
 * - observarDados(fn)  → os dados da casa mudaram (ex.: pelo editor)
 */
export function criarStore(dadosIniciais, idInicial) {
  const ouvintesSelecao = new Set();
  const ouvintesDados = new Set();
  let dados = dadosIniciais;

  const existe = (id) => dados.comodos.some((c) => c.id === id);
  let selecionadoId = existe(idInicial) ? idInicial : dados.comodos[0].id;

  const inscrever = (lista, fn) => {
    lista.add(fn);
    return () => lista.delete(fn);
  };

  return {
    get dados() {
      return dados;
    },

    get selecionadoId() {
      return selecionadoId;
    },

    get comodoSelecionado() {
      return dados.comodos.find((c) => c.id === selecionadoId) || dados.comodos[0];
    },

    selecionar(id) {
      selecionadoId = id;
      ouvintesSelecao.forEach((fn) => fn(id));
    },

    /** Troca os dados (já normalizados) e avisa todos os componentes. */
    substituirDados(novos) {
      dados = novos;
      if (!existe(selecionadoId)) selecionadoId = dados.comodos[0].id;
      ouvintesDados.forEach((fn) => fn(dados));
    },

    /** Registra um ouvinte da seleção; retorna a função para cancelar. */
    observar: (fn) => inscrever(ouvintesSelecao, fn),

    /** Registra um ouvinte de mudança nos dados; retorna a função para cancelar. */
    observarDados: (fn) => inscrever(ouvintesDados, fn),
  };
}
