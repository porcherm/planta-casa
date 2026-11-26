/**
 * Peças comuns às duas vistas 3D (Modelo 3D e Caminhar):
 * renderer, cena com luzes e grade, e utilitários de tamanho e limpeza.
 * Depende do `THREE` global carregado pelo CDN (ver index.html).
 */
import { MODELO_3D } from '../../constants/visualizacao.js';
import { lerVariavelCss } from '../../utils/dom.js';
import { texturaDeCeu } from './acabamentos.js';

/**
 * Cria renderer + cena dentro de `host`. Retorna null se o WebGL não estiver disponível.
 * `sombras`: o sol projeta sombras suaves (Modelo 3D). No Caminhar ficam
 * desligadas: lá a luz vem de dentro, e o passeio fica mais leve.
 */
export function criarCenaBase(host, { sombras = false } = {}) {
  if (!window.THREE) return null;

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MODELO_3D.pixelRatioMax));
  renderer.outputEncoding = THREE.sRGBEncoding;
  // Tone mapping: comprime os claros em vez de estourar, como uma câmera faria
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = MODELO_3D.exposicao;
  if (sombras) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  host.appendChild(renderer.domElement);

  const fundo = new THREE.Color(lerVariavelCss('--canvas', '#ECE5D9'));
  const scene = new THREE.Scene();
  // Céu em degradê: marfim no horizonte, petróleo bem claro no alto
  scene.background = texturaDeCeu(lerVariavelCss('--canvas', '#ECE5D9'), '#C9D6E0');
  scene.fog = new THREE.Fog(fundo, 28, 60);

  // Luz do céu + do chão, um pouco de ambiente e o sol (o único que faz sombra)
  scene.add(new THREE.HemisphereLight(0xfbf8f3, 0xcdbfaa, MODELO_3D.luzCeu));
  scene.add(new THREE.AmbientLight(0xffffff, MODELO_3D.luzAmbiente));
  const sol = new THREE.DirectionalLight(0xfff6ea, MODELO_3D.luzSol);
  sol.position.set(6, 11, 5);
  if (sombras) {
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.02;
    sol.shadow.radius = 3;
  }
  scene.add(sol);
  scene.add(sol.target);
  // Chão em volta da casa: sem ele, o céu aparecia por baixo da grade. Ele
  // também recebe as sombras e some na névoa, no horizonte.
  const chao = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(MODELO_3D.corChao), roughness: 1, metalness: 0 }),
  );
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = -0.07;
  chao.receiveShadow = sombras;
  const grade = new THREE.GridHelper(48, 96, 0xcdbfaa, 0xd8cdbd);
  grade.position.y = -0.06;
  grade.add(chao); // aparece e some junto com a grade (o terreno toma o lugar dos dois)
  chao.position.y = -0.01;
  scene.add(grade);

  const grupo = new THREE.Group();
  scene.add(grupo);

  return { renderer, scene, grupo, grade, sol };
}

/**
 * Aponta o sol para o centro da casa e ajusta a "caixa" da sombra ao tamanho
 * dela (sombra nítida sem desperdiçar resolução). Também liga sombra em tudo o
 * que é opaco; vidro e guarda-corpo (transparentes) não fazem sombra.
 */
export function ajustarSombras(base, raio, alturaCentro = 0) {
  const { sol, grupo } = base;
  const r = Math.max(raio, 4);
  sol.target.position.set(0, alturaCentro, 0);
  sol.position.set(r * 0.9, alturaCentro + r * 1.6, r * 0.7);
  const cam = sol.shadow.camera;
  Object.assign(cam, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: r * 5 });
  cam.updateProjectionMatrix();
  grupo.traverse((o) => {
    if (!o.isMesh) return;
    const transparente = o.material?.transparent;
    o.castShadow = !transparente;
    o.receiveShadow = !transparente;
  });
}

/** Remove e libera da memória tudo o que está dentro do grupo. */
export function limparGrupo(grupo) {
  while (grupo.children.length) {
    const filho = grupo.children[0];
    grupo.remove(filho);
    filho.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material?.dispose) o.material.dispose();
    });
  }
}

/** Ajusta renderer e câmera ao tamanho do host; acompanha redimensionamentos. */
export function acompanharTamanho(host, renderer, camera) {
  function redimensionar() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  if ('ResizeObserver' in window) new ResizeObserver(redimensionar).observe(host);
  else window.addEventListener('resize', redimensionar);
  redimensionar();
  return redimensionar;
}
