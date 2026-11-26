/**
 * "Planta por fotos": a pessoa envia de 1 a 5 fotos, a IA analisa e monta a
 * planta (2D, 3D e Caminhar se atualizam sozinhos). A planta gerada entra no
 * Editor como uma alteração comum: dá para ajustar, desfazer e baixar o
 * apartamento.js.
 *
 * Etapas da janela: envio → progresso → resultado (ou volta ao envio com o erro).
 */
import { IA } from '../../constants/ia.js';
import { TIPOS_COMODO } from '../../constants/tipos.js';
import { montarApartamento } from '../../domain/planta-ia.js';
import { contarAberturas } from '../../domain/andares.js';
import { $, escaparHtml } from '../../utils/dom.js';
import { formatarArea } from '../../utils/formatar.js';
import { prepararFoto } from './imagens.js';
import { carregarSdk, pedirPlanta } from './cliente.js';

const TEXTO_FASE = {
  preparando: 'Preparando as fotos…',
  enviando: 'Enviando as fotos…',
  analisando: 'A IA está analisando os cômodos e estimando as medidas…',
  desenhando: 'Montando a planta…',
};

export function iniciarFotosIA({ store, editor, abas }) {
  const dialogo = $('dialogo-ia');
  const entrada = $('ia-arquivos');
  const soltar = $('ia-soltar');
  const statusEl = $('ia-status');
  const chaveEl = $('ia-chave');
  const lembrarEl = $('ia-lembrar');

  /** Fotos escolhidas: { arquivo, url } (url = miniatura). */
  let fotos = [];
  let controle = null;     // AbortController da geração em curso
  let relogio = null;

  /* ---------- Etapas ---------- */

  function mostrarEtapa(nome) {
    for (const etapa of ['envio', 'progresso', 'resultado']) $(`ia-etapa-${etapa}`).hidden = etapa !== nome;
  }

  function mostrarStatus(texto, tipo = '') {
    statusEl.textContent = texto;
    statusEl.className = `dialogo-resumo ${tipo}`;
  }

  function abrir() {
    mostrarEtapa('envio');
    mostrarStatus('');
    chaveEl.value ||= lerChave();
    lembrarEl.checked = Boolean(lerChave());
    atualizarBotao();
    // Destino da planta: com um andar só, "o andar visível" é a casa inteira
    const varios = store.dados.andares.length > 1;
    const opcaoAndar = $('ia-destino').querySelector('option[value="andar"]');
    opcaoAndar.hidden = !varios;
    opcaoAndar.textContent = `Substituir só o andar "${store.andar.nome}"`;
    $('ia-destino').querySelector('option[value="acima"]').textContent = `Como um novo andar acima do "${store.andar.nome}"`;
    $('ia-destino').querySelector('option[value="abaixo"]').textContent = `Como um novo andar abaixo do "${store.andar.nome}" (subsolo)`;
    if (!varios && $('ia-destino').value === 'andar') $('ia-destino').value = 'casa';
    dialogo.showModal();
    carregarSdk().catch(() => {}); // adianta o download enquanto a pessoa escolhe as fotos
  }

  /* ---------- Fotos ---------- */

  function adicionar(arquivos) {
    const imagens = [...arquivos].filter((a) => a.type.startsWith('image/') || /\.(heic|heif)$/i.test(a.name));
    const ignoradas = arquivos.length - imagens.length;
    const espaco = IA.maxFotos - fotos.length;
    for (const arquivo of imagens.slice(0, espaco)) fotos.push({ arquivo, url: URL.createObjectURL(arquivo) });

    if (imagens.length > espaco) mostrarStatus(`Dá para enviar até ${IA.maxFotos} fotos; as extras ficaram de fora.`, 'erro');
    else if (ignoradas) mostrarStatus('Só imagens são aceitas; os outros arquivos ficaram de fora.', 'erro');
    else mostrarStatus('');
    renderizarMiniaturas();
  }

  function remover(indice) {
    URL.revokeObjectURL(fotos[indice].url);
    fotos.splice(indice, 1);
    mostrarStatus('');
    renderizarMiniaturas();
  }

  function renderizarMiniaturas() {
    $('ia-miniaturas').innerHTML = fotos.map((f, i) => `
      <li>
        <img src="${f.url}" alt="Foto ${i + 1}: ${escaparHtml(f.arquivo.name)}">
        <button type="button" class="ia-remover" data-indice="${i}" aria-label="Remover foto ${i + 1}">×</button>
      </li>`).join('');
    $('ia-contador').textContent = `${fotos.length} de ${IA.maxFotos} fotos`;
    soltar.hidden = fotos.length >= IA.maxFotos;
    atualizarBotao();
  }

  function atualizarBotao() {
    $('ia-gerar').disabled = fotos.length < IA.minFotos || !chaveEl.value.trim();
  }

  entrada.addEventListener('change', () => { adicionar(entrada.files); entrada.value = ''; });
  $('ia-miniaturas').addEventListener('click', (e) => {
    const botao = e.target.closest('.ia-remover');
    if (botao) remover(Number(botao.dataset.indice));
  });
  soltar.addEventListener('dragover', (e) => { e.preventDefault(); soltar.classList.add('arrastando'); });
  soltar.addEventListener('dragleave', () => soltar.classList.remove('arrastando'));
  soltar.addEventListener('drop', (e) => {
    e.preventDefault();
    soltar.classList.remove('arrastando');
    adicionar(e.dataTransfer.files);
  });

  /* ---------- Chave da API ---------- */

  function lerChave() {
    try { return localStorage.getItem(IA.chaveArmazenada) || ''; } catch { return ''; }
  }

  function guardarChave() {
    try {
      if (lembrarEl.checked) localStorage.setItem(IA.chaveArmazenada, chaveEl.value.trim());
      else localStorage.removeItem(IA.chaveArmazenada);
    } catch { /* navegador sem armazenamento: a chave vale só nesta visita */ }
  }

  chaveEl.addEventListener('input', atualizarBotao);
  lembrarEl.addEventListener('change', guardarChave);

  /* ---------- Gerar ---------- */

  async function gerar() {
    guardarChave();
    controle = new AbortController();
    const inicio = Date.now();
    mostrarEtapa('progresso');
    definirFase('preparando');
    relogio = setInterval(() => {
      const s = Math.round((Date.now() - inicio) / 1000);
      $('ia-tempo').textContent = s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
    }, 1000);
    $('ia-tempo').textContent = '0 s';

    try {
      const preparadas = await Promise.all(fotos.map((f) => prepararFoto(f.arquivo)));
      if (controle.signal.aborted) throw Object.assign(new Error('Geração cancelada.'), { cancelado: true });
      const resposta = await pedirPlanta({
        chave: chaveEl.value.trim(),
        fotos: preparadas,
        dicas: $('ia-dicas').value,
        aoProgredir: definirFase,
        sinal: controle.signal,
      });

      const montado = montarApartamento(resposta);
      if (!montado.ok) throw new Error(montado.erro);
      // Com vários andares, a planta gerada é a casa inteira (os outros destinos são para um andar)
      let destino = $('ia-destino').value;
      if (montado.bruto.andares && destino !== 'casa') {
        destino = 'casa';
        montado.avisos.unshift(`A IA encontrou ${montado.bruto.andares.length} andares, então a casa inteira foi substituída.`);
      }
      const importado = editor.importar(montado.bruto, destino);
      if (!importado.ok) throw new Error(`A planta gerada tem um problema: ${importado.erro}`);
      mostrarResultado(montado, importado.problemas);
    } catch (e) {
      mostrarEtapa('envio');
      mostrarStatus(e.message, e.cancelado ? '' : 'erro');
    } finally {
      clearInterval(relogio);
      controle = null;
    }
  }

  function definirFase(fase) {
    $('ia-fase').textContent = TEXTO_FASE[fase] || '';
  }

  function cancelar() {
    controle?.abort();
  }

  /* ---------- Resultado ---------- */

  function mostrarResultado({ observacoes, avisos }, problemas) {
    // Resume o que foi gerado: o andar que recebeu a planta (casas com andares) ou a casa
    const varios = store.dados.andares.length > 1;
    const dados = varios ? store.andar : store.dados;
    const internos = dados.comodos.filter((c) => !TIPOS_COMODO[c.tipo].externo);
    const area = internos.reduce((soma, c) => soma + c.area, 0);
    const { portas, janelas } = varios ? { portas: dados.portas.length, janelas: dados.janelas.length } : contarAberturas(dados);
    $('ia-resumo').textContent = (varios ? `${dados.nome}: ` : '') +
      `${dados.comodos.length} ${dados.comodos.length === 1 ? 'espaço' : 'espaços'} · ` +
      `${portas} ${portas === 1 ? 'porta' : 'portas'} · ` +
      `${janelas} ${janelas === 1 ? 'janela' : 'janelas'} · ` +
      `área interna de ${formatarArea(area)}`;

    $('ia-observacoes').textContent = observacoes || 'A IA não deixou observações.';
    const todos = [...avisos, ...problemas.map((p) => p.mensagem)];
    $('ia-avisos').hidden = todos.length === 0;
    $('ia-avisos-lista').innerHTML = todos.map((t) => `<li>${escaparHtml(t)}</li>`).join('');
    mostrarEtapa('resultado');
  }

  function irPara(aba) {
    dialogo.close();
    abas.mostrar(aba);
  }

  /* ---------- Botões ---------- */

  $('ia-abrir').addEventListener('click', abrir);
  $('ia-gerar').addEventListener('click', gerar);
  $('ia-fechar').addEventListener('click', () => dialogo.close());
  $('ia-parar').addEventListener('click', cancelar);
  $('ia-ver-2d').addEventListener('click', () => irPara('2d'));
  $('ia-ver-3d').addEventListener('click', () => irPara('3d'));
  $('ia-ver-editor').addEventListener('click', () => irPara('editor'));
  $('ia-nova').addEventListener('click', () => { mostrarEtapa('envio'); mostrarStatus(''); });

  // Fechar a janela (Esc ou botão) no meio da geração cancela o pedido
  dialogo.addEventListener('close', cancelar);
}
