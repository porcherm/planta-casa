/**
 * Estado compartilhado da página: os dados do apartamento e o cômodo selecionado.
 *
 * Os componentes (planta 2D, painel, modelo 3D) não conversam entre si:
 * todos leem daqui e se inscrevem com `observar` para reagir à seleção.
 */
export function criarStore(dados, idInicial) {
  const ouvintes = new Set();
  const existe = (id) => dados.comodos.some((c) => c.id === id);
  let selecionadoId = existe(idInicial) ? idInicial : dados.comodos[0].id;

  return {
    dados,

    get selecionadoId() {
      return selecionadoId;
    },

    get comodoSelecionado() {
      return dados.comodos.find((c) => c.id === selecionadoId) || dados.comodos[0];
    },

    selecionar(id) {
      selecionadoId = id;
      ouvintes.forEach((fn) => fn(id));
    },

    /** Registra um ouvinte; retorna a função para cancelar a inscrição. */
    observar(fn) {
      ouvintes.add(fn);
      return () => ouvintes.delete(fn);
    },
  };
}
