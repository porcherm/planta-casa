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
import {
  gerarObstaculos, moverComColisao, pontoNoPoligono, obstaculosDeEscadasNoAndar, obstaculosDaEscada,
} from '../../domain/colisao.js';
import { escadasDoAndar, recortarAberturas, acompanharEscada, pontoLivreNoComodo } from '../../domain/escadas.js';
import { andarPorId, aberturasDoTeto } from '../../domain/andares.js';
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

  // Estado de quem caminha (em metros, no sistema da cena) e o andar em que está
  const pessoa = { x: 0, z: 0, guinada: 0, inclinacao: 0, andar: null };
  const pressionadas = new Set();
  let correndo = false;
  let obstaculosPorAndar = new Map(); // id do andar → obstáculos (cada andar colide só com os seus)
  let obstaculosPorEscada = new Map(); // id da escada → obstáculos de quem está nela
  let centro = { cx: 0, cz: 0 };
  // Na escada: { escada, theta (graus girados, na caracol), fracao (0 embaixo … 1 em cima) }
  let naEscada = null;

  const andarDaPessoa = () => andarPorId(store.dados, pessoa.andar);
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
    const { andares, telhado, terreno } = construirCena(cena.grupo, dados);
    if (telhado) telhado.visible = false; // por dentro, o que se vê são os tetos
    cena.grade.visible = !terreno; // com terreno (subsolo ou declive), ele é o chão
    centro = centroDaCena(dados);
    obstaculosPorAndar = new Map();
    obstaculosPorEscada = new Map();
    naEscada = null;
    const paraCena = (s) => [s[0] / 100 - centro.cx, s[1] / 100 - centro.cz, s[2] / 100 - centro.cx, s[3] / 100 - centro.cz];
    for (const andar of dados.andares) {
      const escadas = escadasDoAndar(dados, andar.id);
      // O teto tem os buracos das escadas que sobem e dos vazios do andar de cima
      adicionarTetos(andares[andar.id], andar, aberturasDoTeto(dados, andar.id));
      // Guarda-corpo dos vazios deste andar: ninguém cai no pé-direito duplo
      const guardaDosVazios = (andar.vazios || []).flatMap((v) => v.pontos.map((a, j) => {
        const b = v.pontos[(j + 1) % v.pontos.length];
        return { seg: paraCena([a[0], a[1], b[0], b[1]]), meia: 0.03 };
      }));
      obstaculosPorAndar.set(andar.id, [
        ...gerarObstaculos(andar, centro), ...obstaculosDeEscadasNoAndar(escadas, centro), ...guardaDosVazios,
      ]);
    }
    for (const e of dados.escadas) obstaculosPorEscada.set(e.id, obstaculosDaEscada(e, centro));
  }

  /**
   * Teto em cada cômodo interno do andar, para a sensação de estar dentro de casa.
   * Onde uma escada sobe para o andar de cima, o teto tem o buraco dela.
   */
  function adicionarTetos(grupo, andar, aberturas) {
    const material = new THREE.MeshBasicMaterial({ color: '#E6DDCE', side: THREE.DoubleSide });
    const { cx, cz } = centro;
    for (const r of andar.comodos) {
      if (TIPOS_COMODO[r.tipo].externo) continue;
      const pedacos = aberturas.length ? recortarAberturas(r.pontos, aberturas) : null;
      for (const pontos of pedacos ?? [r.pontos]) {
        const forma = new THREE.Shape(pontos.map(([x, y]) => new THREE.Vector2(x / 100 - cx, -(y / 100 - cz))));
        const teto = new THREE.Mesh(new THREE.ShapeGeometry(forma), material);
        teto.rotation.x = -Math.PI / 2;
        // 5 mm abaixo da laje de cima: no mesmo plano, os dois "brigariam" na tela (listras)
        teto.position.y = andar.peDireito / 100 - 0.005;
        grupo.add(teto);
      }
    }
  }

  /* ---------- Escadas ---------- */

  const emCm = () => [(pessoa.x + centro.cx) * 100, (pessoa.z + centro.cz) * 100];

  /**
   * Depois de cada passo: entra na escada, acompanha a subida ou sai dela
   * (a regra fica em domain/escadas.js). Retorna true enquanto está na escada.
   */
  function atualizarEscada() {
    const [x, y] = emCm();
    const antes = naEscada;
    const r = acompanharEscada({ andar: andarDaPessoa().id, escada: naEscada && { id: naEscada.escada.id, theta: naEscada.theta } },
      store.dados, x, y);
    if (r.escada) {
      naEscada = { escada: store.dados.escadas.find((e) => e.id === r.escada.id), theta: r.escada.theta, fracao: r.fracao };
      if (!antes) atualizarRotulo();
      return true;
    }
    naEscada = null;
    if (antes) {
      // Saiu da escada: no andar de cima ou de volta no de baixo
      pessoa.andar = r.andar;
      comodoAtual = null;
      atualizarComodoAtual();
      atualizarRotulo();
    }
    return false;
  }

  /* ---------- Posição ---------- */

  /** Onde não dá para pôr alguém parado num andar: escadas que tocam nele e os vazios dele. */
  function areasProibidas(idAndar) {
    const { saem, chegam } = escadasDoAndar(store.dados, idAndar);
    const vazios = andarPorId(store.dados, idAndar).vazios || [];
    return [...saem, ...chegam].map((e) => e.geo.contorno).concat(vazios.map((v) => v.pontos));
  }

  /**
   * Coloca a pessoa no meio do cômodo (ou no ponto do rótulo, em formas livres),
   * fora das escadas que houver nele (senão o primeiro passo cairia no meio dos degraus).
   */
  function irPara(comodo) {
    if (!comodo) return;
    const preferido = comodo.rotulo || [comodo.bb.minX + comodo.bb.w / 2, comodo.bb.minY + comodo.bb.h / 2];
    const [x, y] = pontoLivreNoComodo(comodo, areasProibidas(comodo.andar), preferido);
    pessoa.x = x / 100 - centro.cx;
    pessoa.z = y / 100 - centro.cz;
    pessoa.andar = comodo.andar;
    naEscada = null;
    comodoAtual = comodo.id;
    atualizarRotulo();
  }

  /** Descobre em que cômodo (do andar da pessoa) ela está e sincroniza com o painel. */
  function atualizarComodoAtual() {
    const x = (pessoa.x + centro.cx) * 100, y = (pessoa.z + centro.cz) * 100;
    const achado = andarDaPessoa().comodos.find((c) => pontoNoPoligono(x, y, c.pontos));
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
    if (naEscada) {
      const e = naEscada.escada;
      rotuloLocal.textContent = `${e.nome} · ${andarPorId(store.dados, e.de).nome} ↔ ${andarPorId(store.dados, e.para).nome}`;
      return;
    }
    const comodo = store.dados.comodos.find((c) => c.id === comodoAtual);
    const andar = store.dados.andares.length > 1 ? ` · ${andarDaPessoa().nome}` : '';
    rotuloLocal.textContent = (comodo ? comodo.nome : 'fora dos cômodos') + andar;
  }

  /**
   * Trocou de andar (seletor, Page Up/Down ou "Subir/Descer"): se houver um
   * cômodo no mesmo ponto do outro andar, a pessoa fica onde está, só que lá.
   * (Até a fase das escadas, é assim que se muda de andar caminhando.)
   */
  function ficarNoMesmoPonto(id) {
    const x = (pessoa.x + centro.cx) * 100, y = (pessoa.z + centro.cz) * 100;
    const achado = andarPorId(store.dados, id).comodos.find((c) => pontoNoPoligono(x, y, c.pontos));
    if (!achado) return false;
    // Em cima de uma escada ou de um vazio do outro andar, não: vai para um ponto livre do cômodo
    if (areasProibidas(id).some((p) => pontoNoPoligono(x, y, p))) return false;
    pessoa.andar = id;
    naEscada = null;
    comodoAtual = null;
    atualizarComodoAtual(); // seleciona o cômodo onde a pessoa ficou
    return true;
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
    const obstaculos = naEscada
      ? obstaculosPorEscada.get(naEscada.escada.id) || []
      : obstaculosPorAndar.get(andarDaPessoa().id) || [];
    // Na escada o corpo é um pouco mais fino: lances de 80 cm continuam passáveis
    const raio = naEscada ? Math.min(PASSEIO.raio, 0.2) : PASSEIO.raio;
    [pessoa.x, pessoa.z] = moverComColisao(pessoa.x, pessoa.z, dx, dz, raio, obstaculos);
    if (!atualizarEscada()) atualizarComodoAtual();
  }

  function posicionarCamera() {
    const andar = andarDaPessoa();
    const olhos = Math.min(PASSEIO.alturaOlhos, andar.peDireito / 100 - 0.15);
    let altura = andar.cota / 100 + olhos;
    if (naEscada) {
      // Sobe aos poucos, acompanhando os degraus, do piso de baixo ao de cima
      const e = naEscada.escada;
      altura = andarPorId(store.dados, e.de).cota / 100 + (e.geo.desnivel / 100) * naEscada.fracao + olhos;
    }
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
  store.observar((id, { porTrocaDeAndar } = {}) => {
    if (id === selecaoPropria) { selecaoPropria = null; return; }
    if (!cena) return;
    if (porTrocaDeAndar && ficarNoMesmoPonto(store.comodoSelecionado.andar)) return;
    irPara(store.comodoSelecionado);
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
