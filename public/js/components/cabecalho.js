/**
 * Cabeçalho: nome do apartamento e selo com o progresso das medições.
 */
import { TIPOS_COMODO, ESTADOS } from '../constants/tipos.js';
import { $ } from '../utils/dom.js';

export function renderizarCabecalho(dados) {
  const estado = ESTADOS[dados.estado];
  const internos = dados.comodos.filter((c) => !TIPOS_COMODO[c.tipo].externo && c.tipo !== 'indefinido');
  const medidos = internos.filter((c) => c.medido).length;
  const todosMedidos = internos.length > 0 && medidos === internos.length;

  $('nome-ape').textContent = dados.nome;
  $('titulo').textContent = dados.titulo;
  document.title = `${dados.nome} · Roomprint`;
  $('badge-txt').textContent = (dados.estado === 'rascunho' && medidos)
    ? `Medidos: ${medidos} de ${internos.length} cômodos`
    : estado.badge;
  $('badge-dot').classList.toggle('ok', estado.ok || todosMedidos);
}
