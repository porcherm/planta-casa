/**
 * Componente do modelo 3D (three.js): cena, câmera, controles, clique nos
 * pisos e o botão "Paredes baixas".
 *
 * A cena só é criada na primeira vez que a aba 3D é aberta, e o loop de
 * renderização fica parado enquanto a aba está escondida.
 */
import { LIMIAR_ARRASTO_PX, MODELO_3D } from '../../constants/visualizacao.js';
import { limites } from '../../domain/geometria.js';
import { $, lerVariavelCss } from '../../utils/dom.js';
import { construirCena } from './construtor.js';

export function iniciarModelo3D(store) {
  const host = $('view3d');
  let cena = null; // criada sob demanda

  function threeDisponivel() {
    return Boolean(window.THREE && THREE.OrbitControls);
  }

  function mostrarFallback() {
    $('fallback-3d').hidden = false;
    return false;
  }

  /** Cria renderer, cena, luzes e controles. Retorna false se o 3D não estiver disponível. */
  function criar() {
    if (cena) return true;
    if (!threeDisponivel()) return mostrarFallback();

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { return mostrarFallback(); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MODELO_3D.pixelRatioMax));
    renderer.outputEncoding = THREE.sRGBEncoding;
    host.appendChild(renderer.domElement);

    const fundo = new THREE.Color(lerVariavelCss('--bg', '#04060b'));
    const scene = new THREE.Scene();
    scene.background = fundo;
    scene.fog = new THREE.Fog(fundo, 24, 52);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: 1.48, minDistance: 2, maxDistance: 34 });

    scene.add(new THREE.HemisphereLight(0xc4d4ff, 0x04060b, 0.6));
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const sol = new THREE.DirectionalLight(0xffffff, 0.85);
    sol.position.set(6, 11, 5);
    scene.add(sol);
    const grade = new THREE.GridHelper(48, 96, 0x1d3463, 0x0f1b33);
    grade.position.y = -0.06;
    scene.add(grade);

    const grupo = new THREE.Group();
    scene.add(grupo);

    cena = {
      renderer, scene, camera, controls,
      pecas: construirCena(grupo, store.dados),
      paredesBaixas: false,
      portasOcultas: false,
      rodando: false,
    };

    aplicarAlturaDasParedes();
    destacarSelecionado();
    posicionarCamera('iso');
    redimensionar();

    if ('ResizeObserver' in window) new ResizeObserver(redimensionar).observe(host);
    else window.addEventListener('resize', redimensionar);

    habilitarCliqueNosPisos();
    return true;
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

  function redimensionar() {
    if (!cena) return;
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    cena.renderer.setSize(width, height, false);
    cena.camera.aspect = width / height;
    cena.camera.updateProjectionMatrix();
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

  /* ---------- API usada pelas abas ---------- */

  return {
    ativar() {
      if (!criar()) return;
      redimensionar();
      if (!cena.rodando) { cena.rodando = true; loop(); }
    },
    desativar() {
      if (cena) cena.rodando = false;
    },
  };
}
