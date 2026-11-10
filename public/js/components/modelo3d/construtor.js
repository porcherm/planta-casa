/**
 * Monta a cena 3D a partir dos dados do apartamento.
 * 1 unidade do three.js = 1 metro; o desenho fica centralizado na origem.
 * Depende do `THREE` global carregado pelo CDN (ver index.html).
 */
import { TIPOS_COMODO } from '../../constants/tipos.js';
import { MODELO_3D } from '../../constants/visualizacao.js';
import { limites, gerarParedes, folhaDaPorta } from '../../domain/geometria.js';
import { lerVariavelCss } from '../../utils/dom.js';

const cor = (valor) => new THREE.Color(valor);

function criarMateriais() {
  const padrao = (opcoes) => new THREE.MeshStandardMaterial({ metalness: 0, ...opcoes });
  return {
    parede: padrao({ color: cor(lerVariavelCss('--wall', '#d6dff0')), roughness: 0.92 }),
    guarda: padrao({ color: cor(lerVariavelCss('--rail', '#7f93bd')), roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.55 }),
    vao: padrao({ color: cor(TIPOS_COMODO.circulacao.cor3d), roughness: 0.85 }),
    vidro: padrao({ color: cor(lerVariavelCss('--accent', '#4f86ff')), roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.32 }),
    folhaPorta: padrao({ color: cor('#b9c4d8'), roughness: 0.6 }),
    vidroFosco: padrao({ color: cor('#dfe7f3'), roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.9 }),
    madeira: padrao({ color: cor('#5b3b28'), roughness: 0.7 }),
    aresta: new THREE.LineBasicMaterial({ color: 0x4f86ff, transparent: true, opacity: 0.35 }),
  };
}

/**
 * Cria todas as peças dentro de `grupo` e devolve referências para as que
 * mudam depois (pisos para clique/destaque; paredes e afins para "paredes baixas").
 */
export function construirCena(grupo, dados) {
  const pecas = { pisos: [], paredes: [], vergas: [], peitoris: [], folhas: [] };

  const F = limites(dados.comodos, false);
  const cx = (F.minX + F.w / 2) / 100;
  const cz = (F.minY + F.h / 2) / 100;
  const esp = (dados.parede || 12) / 100;
  const peDireito = dados.peDireito / 100;
  const alturaPorta = dados.alturaPorta / 100;

  const mat = criarMateriais();
  const cubo = new THREE.BoxGeometry(1, 1, 1);
  const arestasCubo = new THREE.EdgesGeometry(cubo);

  /** Converte um segmento da planta (cm) em coordenadas da cena (m). */
  const paraCena = (s) => [s[0] / 100 - cx, s[1] / 100 - cz, s[2] / 100 - cx, s[3] / 100 - cz];

  /** Caixa ao longo de um segmento: comprimento × altura × espessura. */
  function bloco(segmento, material, altura, base, espessura, extra) {
    const [x1, z1, x2, z2] = paraCena(segmento);
    const m = new THREE.Mesh(cubo, material);
    m.scale.set(Math.hypot(x2 - x1, z2 - z1) + extra, altura, espessura);
    m.position.set((x1 + x2) / 2, base + altura / 2, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    return m;
  }

  /** Bloco de parede com contorno azul e registrado na lista indicada. */
  function blocoDeParede(segmento, altura, base, lista) {
    const m = bloco(segmento, mat.parede, altura, base, esp, 0);
    m.add(new THREE.LineSegments(arestasCubo, mat.aresta));
    grupo.add(m);
    lista.push(m);
    return m;
  }

  // Pisos
  for (const r of dados.comodos) {
    const forma = new THREE.Shape(r.pontos.map(([x, y]) => new THREE.Vector2(x / 100 - cx, -(y / 100 - cz))));
    const geo = new THREE.ExtrudeGeometry(forma, { depth: MODELO_3D.espessuraPiso, bevelEnabled: false });
    const piso = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cor(TIPOS_COMODO[r.tipo].cor3d), roughness: 0.85, metalness: 0 }));
    piso.rotation.x = -Math.PI / 2;
    piso.position.y = TIPOS_COMODO[r.tipo].externo ? -0.05 : 0;
    piso.userData.id = r.id;
    grupo.add(piso);
    pecas.pisos.push(piso);
  }

  // Paredes e guarda-corpos
  const { paredes, guardas } = gerarParedes(dados, true);
  for (const s of paredes) {
    const m = bloco(s, mat.parede, 1, 0, esp, esp);
    m.add(new THREE.LineSegments(arestasCubo, mat.aresta));
    grupo.add(m);
    pecas.paredes.push(m);
  }
  for (const s of guardas) grupo.add(bloco(s, mat.guarda, 1.05, -0.05, 0.04, 0.04));

  // Portas: piso no vão aberto, verga acima da porta e folha aberta
  const segmentoDa = (p) => [p.x1, p.y1, p.x2, p.y2];
  for (const p of dados.portas) {
    if (p.tipo === 'vao' && dados.parede) grupo.add(bloco(segmentoDa(p), mat.vao, 0.04, 0, esp, 0));
  }
  if (peDireito - alturaPorta > 0.02) {
    for (const p of dados.portas) {
      if (p.tipo !== 'vao') blocoDeParede(segmentoDa(p), peDireito - alturaPorta, alturaPorta, pecas.vergas);
    }
  }
  for (const p of dados.portas) {
    const f = folhaDaPorta(p);
    if (!f) continue;
    const m = bloco([f.h[0], f.h[1], f.o[0], f.o[1]], mat.folhaPorta, alturaPorta, 0, 0.04, 0);
    m.userData.alt = alturaPorta;
    grupo.add(m);
    pecas.folhas.push(m);
  }

  // Janelas
  for (const j of dados.janelas) {
    const seg = segmentoDa(j);
    const peitoril = j.peitoril / 100;
    const topo = Math.min(j.topo / 100, peDireito);

    if (j.forma === 'losango') {
      adicionarJanelaLosango(seg, peitoril, topo);
      continue;
    }
    if (peitoril > 0) blocoDeParede(seg, peitoril, 0, pecas.peitoris).userData.alt = peitoril;
    const vidro = bloco(seg, mat.vidro, topo - peitoril, peitoril, 0.02, 0);
    grupo.add(vidro);
    pecas.vergas.push(vidro);
    if (peDireito - topo > 0.02) blocoDeParede(seg, peDireito - topo, topo, pecas.vergas);
  }

  /** Janela quadrada girada 45°: moldura de madeira + vidro fosco. */
  function adicionarJanelaLosango(seg, peitoril, topo) {
    const [x1, z1, x2, z2] = paraCena(seg);
    const lado = Math.hypot(x2 - x1, z2 - z1) / Math.SQRT2;
    const giro = -Math.atan2(z2 - z1, x2 - x1);
    const peca = (material, tamanho, grossura) => {
      const m = new THREE.Mesh(cubo, material);
      m.rotation.order = 'YZX';
      m.rotation.set(0, giro, Math.PI / 4);
      m.scale.set(tamanho, tamanho, grossura);
      m.position.set((x1 + x2) / 2, (peitoril + topo) / 2, (z1 + z2) / 2);
      grupo.add(m);
      pecas.vergas.push(m);
    };
    peca(mat.madeira, lado + 0.08, esp + 0.02);
    peca(mat.vidroFosco, lado - 0.04, esp + 0.04);
  }

  return pecas;
}
