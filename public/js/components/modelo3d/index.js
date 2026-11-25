/**
 * Componente do modelo 3D (three.js): cena, câmera orbital, clique nos
 * pisos e os botões "Paredes baixas" e "Ocultar portas".
 *
 * A cena só é criada na primeira vez que a aba 3D é aberta, e o loop de
 * renderização fica parado enquanto a aba está escondida.
 */
import { LIMIAR_ARRASTO_PX, MODELO_3D } from '../../constants/visualizacao.js';
import { limites } from '../../domain/geometria.js';
import { $, lerVariavelCss } from '../../utils/dom.js';
import { construirCena } from './construtor.js';
import { criarCenaBase, limparGrupo, acompanharTamanho } from './cena-base.js';
import { carregarThree, aguardarThree } from './carregar-three.js';

export function iniciarModelo3D(store) {
  const host = $('view3d');
  let cena = null; // criada sob demanda
  let ativo = false;

  function mostrarFallback() {
    $('fallback-3d').hidden = false;
    return false;
  }

  /** Cria renderer, cena e controles. Retorna false se o 3D não estiver disponível. */
  function criar() {
    if (cena) return true;
    if (!window.THREE?.OrbitControls) return mostrarFallback();
    const base = criarCenaBase(host);
    if (!base) return mostrarFallback();

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    const controls = new THREE.OrbitControls(camera, base.renderer.domElement);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: 1.48, minDistance: 2, maxDistance: 34 });

    cena = {
      ...base, camera, controls,
      pecas: null,
      paredesBaixas: false,
      portasOcultas: false,
      rodando: false,
    };

    reconstruir();
    posicionarCamera('iso');
    cena.redimensionar = acompanharTamanho(host, cena.renderer, camera);
    habilitarCliqueNosPisos();
    return true;
  }

  /** (Re)monta as peças a partir dos dados atuais, mantendo os modos ligados. */
  function reconstruir() {
    if (!cena) return;
    limparGrupo(cena.grupo);
    cena.pecas = construirCena(cena.grupo, store.dados);
    aplicarAlturaDasParedes();
    aplicarVisibilidadeDasPortas();
    destacarSelecionado();
  }

  /** Clique (sem arrastar) num piso seleciona o cômodo. */
  function habilitarCliqueNosPisos() {
    const canvas = cena.renderer.domElement;
    const raio = new THREE.Raycaster();
    const ponteiro = new THREE.Vector2();
    let inicio = null;

    canvas.addEventListener('pointerdown', (e) => { inicio = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!inicio || Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > LIMIAR_ARRASTO_PX) return;
      const r = canvas.getBoundingClientRect();
      ponteiro.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raio.setFromCamera(ponteiro, cena.camera);
      const acerto = raio.intersectObjects(cena.pecas.pisos)[0];
      if (acerto) store.selecionar(acerto.object.userData.id);
    });
  }

  function aplicarAlturaDasParedes() {
    if (!cena) return;
    const { pecas, paredesBaixas } = cena;
    const h = paredesBaixas ? MODELO_3D.alturaParedesBaixas : store.dados.peDireito / 100;
    const ajustarAltura = (m, altura) => { m.scale.y = altura; m.position.y = altura / 2; };

    pecas.paredes.forEach((m) => ajustarAltura(m, h));
    pecas.vergas.forEach((m) => { m.visible = !paredesBaixas; });
    [...pecas.peitoris, ...pecas.folhas].forEach((m) => ajustarAltura(m, Math.min(m.userData.alt || h, h)));
  }

  /** Mostra ou esconde as folhas das portas (os vãos continuam abertos). */
  function aplicarVisibilidadeDasPortas() {
    if (!cena) return;
    cena.pecas.folhas.forEach((m) => { m.visible = !cena.portasOcultas; });
  }

  function destacarSelecionado() {
    if (!cena) return;
    const destaque = new THREE.Color(lerVariavelCss('--accent', '#4f86ff'));
    for (const piso of cena.pecas.pisos) {
      const selecionado = piso.userData.id === store.selecionadoId;
      piso.material.emissive.copy(selecionado ? destaque : new THREE.Color(0x000000));
      piso.material.emissiveIntensity = selecionado ? 0.45 : 0;
    }
  }

  /** 'iso' = vista em perspectiva; 'top' = vista de cima. */
  function posicionarCamera(modo) {
    if (!cena) return;
    const F = limites(store.dados.comodos, false);
    const span = Math.max(F.w, F.h) / 100;
    if (modo === 'top') cena.camera.position.set(0, span * 1.75, 0.01);
    else cena.camera.position.set(span * 0.75, span * 1.0, span * 1.1);
    cena.controls.target.set(0, 0, 0);
    cena.controls.update();
  }

  function loop() {
    if (!cena?.rodando) return;
    cena.controls.update();
    cena.renderer.render(cena.scene, cena.camera);
    requestAnimationFrame(loop);
  }

  /* ---------- Eventos ---------- */

  $('cam-iso').addEventListener('click', () => posicionarCamera('iso'));
  $('cam-top').addEventListener('click', () => posicionarCamera('top'));
  $('paredes').addEventListener('click', (e) => {
    if (!cena) return;
    cena.paredesBaixas = !cena.paredesBaixas;
    aplicarAlturaDasParedes();
    e.currentTarget.setAttribute('aria-pressed', String(cena.paredesBaixas));
  });
  $('portas-3d').addEventListener('click', (e) => {
    if (!cena) return;
    cena.portasOcultas = !cena.portasOcultas;
    aplicarVisibilidadeDasPortas();
    e.currentTarget.setAttribute('aria-pressed', String(cena.portasOcultas));
  });
  store.observar(destacarSelecionado);
  store.observarDados(reconstruir);

  /* ---------- API usada pelas abas ---------- */

  return {
    /** Começa a baixar o three.js antes do clique (ao passar o mouse na aba). */
    preparar: () => carregarThree().catch(() => {}),

    async ativar() {
      ativo = true;
      if (!cena && !(await aguardarThree($('carregando-3d'), $('fallback-3d')))) return;
      if (!ativo || !criar()) return; // a pessoa pode ter trocado de aba durante o download
      cena.redimensionar();
      if (!cena.rodando) { cena.rodando = true; loop(); }
    },
    desativar() {
      ativo = false;
      if (cena) cena.rodando = false;
    },
  };
}
