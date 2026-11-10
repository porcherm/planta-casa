/**
 * Ponto de entrada: carrega e valida os dados, cria o estado compartilhado
 * e monta cada componente da página.
 *
 * Os dados são importados dinamicamente para que um erro de digitação no
 * arquivo (ex.: vírgula faltando) apareça na tela, e não só no console.
 */
import { normalizarDados } from './domain/normalizar.js';
import { criarStore } from './context/store.js';
import { renderizarCabecalho } from './components/cabecalho.js';
import { iniciarPlanta2D } from './components/planta2d/index.js';
import { iniciarPainel } from './components/painel.js';
import { iniciarModelo3D } from './components/modelo3d/index.js';
import { iniciarAbas } from './components/abas.js';
import { mostrarErroDeDados } from './components/erro.js';

async function carregarDados() {
  try {
    const { APARTAMENTO } = await import('./constants/apartamento.js');
    if (!APARTAMENTO) return { ok: false, erro: 'O arquivo precisa exportar "APARTAMENTO" (export const APARTAMENTO = { ... }).' };
    return normalizarDados(APARTAMENTO);
  } catch (e) {
    console.error(e);
    return { ok: false, erro: `O arquivo de dados tem um erro de escrita: ${e.message}. Procure vírgulas, chaves { } ou colchetes [ ] faltando.` };
  }
}

const resultado = await carregarDados();

if (!resultado.ok) {
  mostrarErroDeDados(resultado.erro);
} else {
  const store = criarStore(resultado.data, resultado.data.comodoInicial);
  renderizarCabecalho(store.dados);
  iniciarPlanta2D(store);
  iniciarPainel(store);
  iniciarAbas(iniciarModelo3D(store));
}
