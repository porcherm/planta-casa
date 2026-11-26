/**
 * Peças comuns às duas vistas 3D (Modelo 3D e Caminhar):
 * renderer, cena com luzes e grade, e utilitários de tamanho e limpeza.
 * Depende do `THREE` global carregado pelo CDN (ver index.html).
 */
import { MODELO_3D } from '../../constants/visualizacao.js';
import { lerVariavelCss } from '../../utils/dom.js';

/** Cria renderer + cena dentro de `host`. Retorna null se o WebGL não estiver disponível. */
export function criarCenaBase(host) {
  if (!window.THREE) return null;

  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MODELO_3D.pixelRatioMax));
  renderer.outputEncoding = THREE.sRGBEncoding;
  host.appendChild(renderer.domElement);

  const fundo = new THREE.Color(lerVariavelCss('--canvas', '#ECE5D9'));
  const scene = new THREE.Scene();
  scene.background = fundo;
  scene.fog = new THREE.Fog(fundo, 24, 52);

  // Luz somando ~1: mais que isso estoura os tons claros do marfim para branco
  scene.add(new THREE.HemisphereLight(0xfbf8f3, 0xcdbfaa, 0.45));
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const sol = new THREE.DirectionalLight(0xffffff, 0.55);
  sol.position.set(6, 11, 5);
  scene.add(sol);
  const grade = new THREE.GridHelper(48, 96, 0xcdbfaa, 0xd8cdbd);
  grade.position.y = -0.06;
  scene.add(grade);

  const grupo = new THREE.Group();
  scene.add(grupo);

  return { renderer, scene, grupo, grade };
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
