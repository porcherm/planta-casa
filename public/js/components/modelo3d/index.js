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
      corte: false,          // "Só até este andar": esconde os andares acima do visível
      terrenoOculto: false,
      telhadoVisivel: false, // escondido de início, para dar para ver a casa por dentro
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
    $('corte-andar').hidden = store.dados.andares.length < 2;
    $('terreno-3d').hidden = !cena.pecas.terreno;
    $('telhado-3d').hidden = !cena.pecas.telhado;
    aplicarAndares();
    aplicarVisibilidadeDasPortas();
    destacarSelecionado();
  }

  /** Andares que aparecem: todos, ou (no modo corte) até o andar visível. */
  function andaresVisiveis() {
    const { andares } = store.dados;
    if (!cena?.corte) return andares;
    const limite = andares.findIndex((a) => a.id === store.andarAtual);
    return andares.slice(0, limite + 1);
  }

  /** Mostra/esconde andares e terreno; "paredes baixas" vale para o andar mais alto que aparece. */
  function aplicarAndares() {
    if (!cena) return;
    const visiveis = new Set(andaresVisiveis().map((a) => a.id));
    for (const [id, grupo] of Object.entries(cena.pecas.andares)) grupo.visible = visiveis.has(id);
    if (cena.pecas.terreno) cena.pecas.terreno.visible = !cena.terrenoOculto;
    cena.grade.visible = !cena.pecas.terreno; // com subsolo, o terreno faz o papel do chão
    // O telhado só aparece com todos os andares à mostra (no corte ele flutuaria)
    if (cena.pecas.telhado) {
      cena.pecas.telhado.visible = cena.telhadoVisivel && visiveis.size === store.dados.andares.length;
    }
    aplicarAlturaDasParedes();
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
      const visiveis = new Set(andaresVisiveis().map((a) => a.id));
      const acerto = raio.intersectObjects(cena.pecas.pisos.filter((p) => visiveis.has(p.userData.andar)))[0];
      if (acerto) store.selecionar(acerto.object.userData.id);
    });
  }

  function aplicarAlturaDasParedes() {
    if (!cena) return;
    const { pecas, paredesBaixas } = cena;
    // Só o andar mais alto que aparece fica com as paredes baixas (os de baixo
    // seguram a laje de cima). Cada peça sabe a sua altura cheia.
    const visiveis = andaresVisiveis();
    const topo = visiveis[visiveis.length - 1]?.id;
    const baixa = (m) => paredesBaixas && m.userData.andar === topo;
    const ajustarAltura = (m) => {
      const h = baixa(m) ? Math.min(m.userData.alt, MODELO_3D.alturaParedesBaixas) : m.userData.alt;
      m.scale.y = h;
      m.position.y = h / 2;
    };

    pecas.paredes.forEach(ajustarAltura);
    pecas.vergas.forEach((m) => { m.visible = !baixa(m); });
    [...pecas.peitoris, ...pecas.folhas].forEach(ajustarAltura);
  }

  /** Mostra ou esconde as folhas das portas (os vãos continuam abertos). */
  function aplicarVisibilidadeDasPortas() {
    if (!cena) return;
    cena.pecas.folhas.forEach((m) => { m.visible = !cena.portasOcultas; });
  }

  function destacarSelecionado() {
    if (!cena) return;
    // Pinta o piso selecionado de coral (somar brilho só clarearia o marfim)
    const destaque = new THREE.Color(lerVariavelCss('--accent', '#E4653C'));
    for (const piso of cena.pecas.pisos) {
      const selecionado = piso.userData.id === store.selecionadoId;
      piso.userData.corOriginal ??= piso.material.color.clone();
      piso.material.color.copy(selecionado ? destaque : piso.userData.corOriginal);
    }
  }

  /** 'iso' = vista em perspectiva; 'top' = vista de cima. */
  function posicionarCamera(modo) {
    if (!cena) return;
    const F = limites(store.dados.comodos, false);
    // Altura dos andares que aparecem; com um andar só, o enquadramento de sempre
    const visiveis = andaresVisiveis();
    const varios = store.dados.andares.length > 1;
    const base = Math.min(...visiveis.map((a) => a.cota)) / 100;
    const topo = Math.max(...visiveis.map((a) => a.cota + a.peDireito)) / 100;
    if (!varios) {
      const span = Math.max(F.w, F.h) / 100;
      if (modo === 'top') cena.camera.position.set(0, span * 1.75, 0.01);
      else cena.camera.position.set(span * 0.75, span * 1.0, span * 1.1);
      cena.controls.target.set(0, 0, 0);
    } else {
      // Casa alta: afasta a câmera o bastante para caber a "esfera" que envolve os andares
      const alvoY = (base + topo) / 2;
      const raio = Math.hypot(F.w / 100, F.h / 100, topo - base) / 2;
      const distancia = Math.min(raio * 2.7, cena.controls.maxDistance);
      if (modo === 'top') {
        cena.camera.position.set(0, topo + Math.hypot(F.w, F.h) / 100 * 1.2, 0.01);
      } else {
        const dir = new THREE.Vector3(0.75, 0.8, 1.1).normalize().multiplyScalar(distancia);
        cena.camera.position.set(dir.x, alvoY + dir.y, dir.z);
      }
      cena.controls.target.set(0, alvoY, 0);
    }
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
  /**
   * Leva a câmera para a altura do meio dos andares que aparecem, sem mudar o
   * ângulo nem a distância que a pessoa escolheu (só desliza na vertical).
   */
  function recentrarAltura() {
    if (!cena || store.dados.andares.length < 2) return;
    const visiveis = andaresVisiveis();
    const base = Math.min(...visiveis.map((a) => a.cota)) / 100;
    const topo = Math.max(...visiveis.map((a) => a.cota + a.peDireito)) / 100;
    const dy = (base + topo) / 2 - cena.controls.target.y;
    cena.controls.target.y += dy;
    cena.camera.position.y += dy;
    cena.controls.update();
  }

  $('corte-andar').addEventListener('click', (e) => {
    if (!cena) return;
    cena.corte = !cena.corte;
    aplicarAndares();
    recentrarAltura();
    e.currentTarget.setAttribute('aria-pressed', String(cena.corte));
  });
  $('telhado-3d').addEventListener('click', (e) => {
    if (!cena) return;
    cena.telhadoVisivel = !cena.telhadoVisivel;
    aplicarAndares();
    e.currentTarget.setAttribute('aria-pressed', String(cena.telhadoVisivel));
  });
  $('terreno-3d').addEventListener('click', (e) => {
    if (!cena) return;
    cena.terrenoOculto = !cena.terrenoOculto;
    aplicarAndares();
    e.currentTarget.setAttribute('aria-pressed', String(cena.terrenoOculto));
  });
  store.observar(destacarSelecionado);
  // No modo corte, trocar de andar muda o que aparece
  store.observarAndar(() => { if (cena?.corte) { aplicarAndares(); recentrarAltura(); } });
  store.observarDados((_, opcoes) => {
    reconstruir();
    if (opcoes?.reenquadrar) posicionarCamera('iso');
  });

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
