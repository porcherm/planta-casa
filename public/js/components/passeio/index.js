/**
 * Aba "Caminhar": passeio em primeira pessoa dentro da casa.
 *
 * - Teclado: WASD ou setas para andar, Shift para correr.
 * - Mouse/toque: arrastar para olhar em volta.
 * - Celular: botões na tela para andar.
 * - Colide com paredes, janelas e guarda-corpos; passa pelas portas.
 * - Ao entrar num cômodo, ele fica selecionado no painel. Escolher um cômodo
 *   na lista leva você até ele.
 */
import { PASSEIO } from '../../constants/visualizacao.js';
import { TIPOS_COMODO } from '../../constants/tipos.js';
import { gerarObstaculos, moverComColisao, pontoNoPoligono } from '../../domain/colisao.js';
import { $ } from '../../utils/dom.js';
import { construirCena, centroDaCena } from '../modelo3d/construtor.js';
import { criarCenaBase, limparGrupo, acompanharTamanho } from '../modelo3d/cena-base.js';
import { carregarThree, aguardarThree } from '../modelo3d/carregar-three.js';

/** Teclas → direção de movimento [frente, lado]. */
const TECLAS = {
  KeyW: [1, 0], ArrowUp: [1, 0],
  KeyS: [-1, 0], ArrowDown: [-1, 0],
  KeyA: [0, -1], ArrowLeft: [0, -1],
  KeyD: [0, 1], ArrowRight: [0, 1],
};

export function iniciarPasseio(store) {
  const host = $('passeio-host');
  const rotuloLocal = $('passeio-local');
  let cena = null; // criada sob demanda
  let ativo = false;

  // Estado de quem caminha (em metros, no sistema da cena)
  const pessoa = { x: 0, z: 0, guinada: 0, inclinacao: 0 };
  const pressionadas = new Set();
  let correndo = false;
  let obstaculos = [];
  let centro = { cx: 0, cz: 0 };
  let comodoAtual = null;
  let selecaoPropria = null; // evita "teleportar" quando a própria caminhada muda a seleção

  /* ---------- Cena ---------- */

  function criar() {
    if (cena) return true;
    const base = criarCenaBase(host);
    if (!base) { $('fallback-passeio').hidden = false; return false; }

    const camera = new THREE.PerspectiveCamera(PASSEIO.campoDeVisao, 1, 0.05, 200);
    camera.rotation.order = 'YXZ';
    // Luz que acompanha a pessoa, para os cômodos não ficarem escuros sob o teto
    const lanterna = new THREE.PointLight(0xffffff, 0.55, 9);
    camera.add(lanterna);
    base.scene.add(camera);

    cena = { ...base, camera, rodando: false, ultimoQuadro: 0 };
    reconstruir();
    irPara(store.comodoSelecionado);
    cena.redimensionar = acompanharTamanho(host, cena.renderer, camera);
    habilitarOlhar(cena.renderer.domElement);
    return true;
  }

  function reconstruir() {
    if (!cena) return;
    const { dados } = store;
    limparGrupo(cena.grupo);
    construirCena(cena.grupo, dados);
    adicionarTetos(cena.grupo, dados);
    centro = centroDaCena(dados);
    obstaculos = gerarObstaculos(dados, centro);
  }

  /** Teto em cada cômodo interno, para a sensação de estar dentro de casa. */
  function adicionarTetos(grupo, dados) {
    const material = new THREE.MeshBasicMaterial({ color: '#E6DDCE', side: THREE.DoubleSide });
    const { cx, cz } = centroDaCena(dados);
    for (const r of dados.comodos) {
      if (TIPOS_COMODO[r.tipo].externo) continue;
      const forma = new THREE.Shape(r.pontos.map(([x, y]) => new THREE.Vector2(x / 100 - cx, -(y / 100 - cz))));
      const teto = new THREE.Mesh(new THREE.ShapeGeometry(forma), material);
      teto.rotation.x = -Math.PI / 2;
      teto.position.y = dados.peDireito / 100;
      grupo.add(teto);
    }
  }

  /* ---------- Posição ---------- */

  /** Coloca a pessoa no meio do cômodo (ou no ponto do rótulo, em formas livres). */
  function irPara(comodo) {
    if (!comodo) return;
    const [x, y] = comodo.rotulo || [comodo.bb.minX + comodo.bb.w / 2, comodo.bb.minY + comodo.bb.h / 2];
    pessoa.x = x / 100 - centro.cx;
    pessoa.z = y / 100 - centro.cz;
    comodoAtual = comodo.id;
    atualizarRotulo();
  }

  /** Descobre em que cômodo a pessoa está e sincroniza com o painel. */
  function atualizarComodoAtual() {
    const x = (pessoa.x + centro.cx) * 100, y = (pessoa.z + centro.cz) * 100;
    const achado = store.dados.comodos.find((c) => pontoNoPoligono(x, y, c.pontos));
    const id = achado?.id ?? null;
    if (id === comodoAtual) return;
    comodoAtual = id;
    atualizarRotulo();
    if (id && id !== store.selecionadoId) {
      selecaoPropria = id;
      store.selecionar(id);
    }
  }

  function atualizarRotulo() {
    const comodo = store.dados.comodos.find((c) => c.id === comodoAtual);
    rotuloLocal.textContent = comodo ? comodo.nome : 'fora dos cômodos';
  }

  /* ---------- Movimento ---------- */

  function andar(dt) {
    let frente = 0, lado = 0;
    for (const codigo of pressionadas) {
      const [f, l] = TECLAS[codigo] || [0, 0];
      frente += f;
      lado += l;
    }
    if (!frente && !lado) return;

    const norma = Math.hypot(frente, lado);
    const passo = (correndo ? PASSEIO.velocidadeCorrendo : PASSEIO.velocidade) * dt / norma;
    // A câmera olha para -z quando a guinada é 0
    const seno = Math.sin(pessoa.guinada), cosseno = Math.cos(pessoa.guinada);
    const dx = (-seno * frente + cosseno * lado) * passo;
    const dz = (-cosseno * frente - seno * lado) * passo;
    [pessoa.x, pessoa.z] = moverComColisao(pessoa.x, pessoa.z, dx, dz, PASSEIO.raio, obstaculos);
    atualizarComodoAtual();
  }

  function posicionarCamera() {
    const altura = Math.min(PASSEIO.alturaOlhos, store.dados.peDireito / 100 - 0.15);
    cena.camera.position.set(pessoa.x, altura, pessoa.z);
    cena.camera.rotation.set(pessoa.inclinacao, pessoa.guinada, 0);
  }

  function loop(agora) {
    if (!cena?.rodando) return;
    const dt = Math.min((agora - (cena.ultimoQuadro || agora)) / 1000, 0.05);
    cena.ultimoQuadro = agora;
    andar(dt);
    posicionarCamera();
    cena.renderer.render(cena.scene, cena.camera);
    requestAnimationFrame(loop);
  }

  /* ---------- Controles ---------- */

  /** Arrastar (mouse ou dedo) gira a cabeça. */
  function habilitarOlhar(canvas) {
    let anterior = null;
    canvas.addEventListener('pointerdown', (e) => {
      anterior = { x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* sem suporte */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!anterior) return;
      pessoa.guinada -= (e.clientX - anterior.x) * PASSEIO.sensibilidade;
      pessoa.inclinacao = Math.max(-PASSEIO.inclinacaoMax, Math.min(PASSEIO.inclinacaoMax,
        pessoa.inclinacao - (e.clientY - anterior.y) * PASSEIO.sensibilidade));
      anterior = { x: e.clientX, y: e.clientY };
    });
    const soltar = () => { anterior = null; };
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);
  }

  const digitando = (alvo) => alvo.closest?.('input, textarea, select, [contenteditable="true"]');

  window.addEventListener('keydown', (e) => {
    if (!ativo || digitando(e.target)) return;
    if (e.key === 'Shift') correndo = true;
    if (TECLAS[e.code]) { pressionadas.add(e.code); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') correndo = false;
    pressionadas.delete(e.code);
  });
  window.addEventListener('blur', () => { pressionadas.clear(); correndo = false; });

  // Botões na tela (celular): segurar = andar
  document.querySelectorAll('[data-passo]').forEach((botao) => {
    const codigo = botao.dataset.passo;
    const soltar = () => pressionadas.delete(codigo);
    botao.addEventListener('pointerdown', (e) => { e.preventDefault(); pressionadas.add(codigo); });
    botao.addEventListener('pointerup', soltar);
    botao.addEventListener('pointerleave', soltar);
    botao.addEventListener('pointercancel', soltar);
  });

  $('passeio-reiniciar').addEventListener('click', () => {
    pessoa.guinada = 0;
    pessoa.inclinacao = 0;
    irPara(store.comodoSelecionado);
  });

  // Escolher um cômodo fora do passeio (lista, 2D, 3D) leva a pessoa até ele
  store.observar((id) => {
    if (id === selecaoPropria) { selecaoPropria = null; return; }
    if (cena) irPara(store.comodoSelecionado);
  });
  store.observarDados(() => {
    if (!cena) return;
    reconstruir();
    irPara(store.comodoSelecionado);
  });

  /* ---------- API usada pelas abas ---------- */

  return {
    /** Começa a baixar o three.js antes do clique (ao passar o mouse na aba). */
    preparar: () => carregarThree().catch(() => {}),

    async ativar() {
      ativo = true;
      if (!cena && !(await aguardarThree($('carregando-passeio'), $('fallback-passeio')))) return;
      if (!ativo || !criar()) return; // a pessoa pode ter trocado de aba durante o download
      cena.redimensionar();
      if (!cena.rodando) {
        cena.rodando = true;
        cena.ultimoQuadro = 0;
        requestAnimationFrame(loop);
      }
    },
    desativar() {
      ativo = false;
      pressionadas.clear();
      if (cena) cena.rodando = false;
    },
  };
}
