/**
 * Monta a cena 3D a partir dos dados do apartamento.
 * 1 unidade do three.js = 1 metro; o desenho fica centralizado na origem.
 * Depende do `THREE` global carregado pelo CDN (ver index.html).
 */
import { TIPOS_COMODO } from '../../constants/tipos.js';
import { MODELO_3D } from '../../constants/visualizacao.js';
import { limites, gerarParedes, folhaDaPorta } from '../../domain/geometria.js';
import { recortarAberturas, comprimentoDe } from '../../domain/escadas.js';
import { aberturasDaLaje } from '../../domain/andares.js';
import { alturaDoTerreno } from '../../domain/terreno.js';
import { geometriaDoTelhado } from '../../domain/telhado.js';
import { texturaDePiso, texturaDeTelha, texturaDeTerreno } from './acabamentos.js';
import { lerVariavelCss } from '../../utils/dom.js';

const cor = (valor) => new THREE.Color(valor);

function criarMateriais() {
  const padrao = (opcoes) => new THREE.MeshStandardMaterial({ metalness: 0, ...opcoes });
  return {
    parede: padrao({ color: cor(lerVariavelCss('--wall-3d', '#E6DDCE')), roughness: 0.92 }),
    guarda: padrao({ color: cor(lerVariavelCss('--rail', '#4F7698')), roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.55 }),
    vao: padrao({ color: cor(TIPOS_COMODO.circulacao.cor3d), roughness: 0.85 }),
    vidro: padrao({ color: cor(lerVariavelCss('--glass', '#7FA3BF')), roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.4 }),
    // Só tons da paleta: folha de porta em marfim escuro, moldura da janela losango em petróleo
    folhaPorta: padrao({ color: cor('#B8A88F'), roughness: 0.6 }),
    vidroFosco: padrao({ color: cor('#F3EEE6'), roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.9 }),
    madeira: padrao({ color: cor(lerVariavelCss('--petroleo', '#1B4E77')), roughness: 0.7 }),
    // Subsolo: paredes em tom de concreto, terreno em marfim escuro (tons da paleta)
    concreto: padrao({ color: cor('#C9C0B2'), roughness: 0.95 }),
    // Marfim mais escuro que o fundo, para o declive aparecer pela sombra
    terreno: padrao({ color: 0xffffff, map: texturaDeTerreno('#B9A88C'), roughness: 1, side: THREE.DoubleSide }),
    degrau: padrao({ color: cor('#D8CDBD'), roughness: 0.85 }),
    // Acabamentos: caixilho e corrimão em petróleo, batente em marfim escuro
    caixilho: padrao({ color: cor(lerVariavelCss('--petroleo', '#1B4E77')), roughness: 0.45, metalness: 0.25 }),
    batente: padrao({ color: cor('#B8A88F'), roughness: 0.6 }),
    corrimao: padrao({ color: cor(lerVariavelCss('--petroleo', '#1B4E77')), roughness: 0.4, metalness: 0.35 }),
    // Telhado em petróleo médio (tom da paleta), com telhas desenhadas, visível dos dois lados
    telhado: padrao({ color: 0xffffff, map: texturaDeTelha(lerVariavelCss('--rail', '#4F7698')), roughness: 0.7, side: THREE.DoubleSide }),
    oitao: padrao({ color: cor(lerVariavelCss('--wall-3d', '#E6DDCE')), roughness: 0.92, side: THREE.DoubleSide }),
    aresta: new THREE.LineBasicMaterial({ color: cor(lerVariavelCss('--petroleo', '#1B4E77')), transparent: true, opacity: 0.55 }),
  };
}

/**
 * Centro da planta em metros. A cena é deslocada por ele para ficar na origem.
 * Um ponto da planta (x, y) em cm vira (x/100 - cx, y/100 - cz) na cena.
 */
export function centroDaCena(dados) {
  const F = limites(dados.comodos, false);
  return { cx: (F.minX + F.w / 2) / 100, cz: (F.minY + F.h / 2) / 100 };
}

/**
 * Cria todas as peças dentro de `grupo` e devolve referências para as que
 * mudam depois (pisos para clique/destaque; paredes e afins para "paredes baixas").
 *
 * Cada andar fica num grupo próprio, levantado até a sua cota; dentro dele as
 * peças são montadas como se o piso estivesse em y = 0. Paredes, peitoris e
 * folhas guardam a altura cheia em `userData.alt` e o andar em `userData.andar`.
 *
 * Andares acima do primeiro ganham laje (o piso vira uma placa da espessura da
 * laje). Se algum andar fica abaixo da rua, entra um terreno na cota 0 com um
 * recorte no lugar do subsolo.
 */
export function construirCena(grupo, casa) {
  const pecas = { pisos: [], paredes: [], vergas: [], peitoris: [], folhas: [], andares: {}, terreno: null };
  const centro = centroDaCena(casa);
  const recursos = {
    mat: criarMateriais(),
    cubo: new THREE.BoxGeometry(1, 1, 1),
  };
  recursos.arestasCubo = new THREE.EdgesGeometry(recursos.cubo);
  const listas = ['pisos', 'paredes', 'vergas', 'peitoris', 'folhas'];

  casa.andares.forEach((andar, i) => {
    const g = new THREE.Group();
    g.name = `andar:${andar.id}`;
    g.position.y = andar.cota / 100;
    grupo.add(g);
    pecas.andares[andar.id] = g;
    const antes = Object.fromEntries(listas.map((k) => [k, pecas[k].length]));
    // A laje deste andar tem o buraco das escadas que chegam nele e dos vazios dele
    construirAndar(g, andar, centro, recursos, pecas, { comLaje: i > 0, aberturas: aberturasDaLaje(casa, andar.id) });
    for (const k of listas) pecas[k].slice(antes[k]).forEach((m) => { m.userData.andar = andar.id; });
    // Guarda-corpo em volta dos vazios (pé-direito duplo, mezanino)
    for (const v of andar.vazios || []) {
      const bordas = v.pontos.map((a, j) => ({ seg: [...a, ...v.pontos[(j + 1) % v.pontos.length]], abertaEmCima: false }));
      construirGuarda(g, bordas, centro, recursos);
    }
  });

  // Escadas: ficam no grupo do andar de onde saem; o guarda-corpo, no de chegada
  for (const e of casa.escadas || []) {
    const de = pecas.andares[e.de], para = pecas.andares[e.para];
    if (de) construirEscada(de, e, centro, recursos);
    if (para) construirGuardaDaEscada(para, e, centro, recursos);
  }

  pecas.terreno = construirTerreno(casa, centro, recursos.mat.terreno);
  if (pecas.terreno) grupo.add(pecas.terreno);
  const embasamento = construirEmbasamento(casa, centro, recursos);
  if (embasamento) (pecas.andares[casa.andares[0].id] || grupo).add(embasamento);
  pecas.telhado = construirTelhado(casa, centro, recursos);
  if (pecas.telhado) grupo.add(pecas.telhado);
  return pecas;
}

/**
 * Terreno: plano na cota 0 ou em desnível (ver domain/terreno.js), com um
 * buraco do tamanho da parte enterrada da casa. Null quando o terreno é plano
 * e nenhum andar fica abaixo da rua (aí a grade do chão basta).
 *
 * É uma malha de quadrados de 25 cm: cada vértice fica na altura do terreno, e
 * os quadrados que caem dentro do buraco ficam de fora.
 */
function construirTerreno(casa, { cx, cz }, material) {
  const enterrados = casa.andares.filter((a) => a.cota < 0);
  const inclinado = Boolean(casa.terreno?.desce);
  if (!enterrados.length && !inclinado) return null;
  const meia = (casa.parede || 12) / 2;
  const T = limites(casa.comodos, false);
  const L = limites(casa.comodos, true);
  // Buraco: a parte da casa abaixo da rua; sem subsolo, a projeção do primeiro andar
  const base = enterrados.length ? enterrados : [casa.andares[0]];
  const B = limites(base.flatMap((a) => a.comodos), false);
  const buraco = { minX: B.minX - meia, minY: B.minY - meia, maxX: B.maxX + meia, maxY: B.maxY + meia };
  const margem = 600, passo = 25;
  const x0 = T.minX - margem, y0 = T.minY - margem;
  const nx = Math.ceil((T.w + margem * 2) / passo), ny = Math.ceil((T.h + margem * 2) / passo);

  const posicoes = [], indices = [], uvs = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * passo, y = y0 + j * passo;
      posicoes.push(x / 100 - cx, alturaDoTerreno(casa.terreno, L, x, y) / 100 - 0.01, y / 100 - cz);
      uvs.push(x / 100, y / 100); // em metros, como os pisos
    }
  }
  const v = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const mx = x0 + (i + 0.5) * passo, my = y0 + (j + 0.5) * passo;
      if (mx > buraco.minX && mx < buraco.maxX && my > buraco.minY && my < buraco.maxY) continue;
      indices.push(v(i, j), v(i, j + 1), v(i + 1, j), v(i + 1, j), v(i, j + 1), v(i + 1, j + 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posicoes, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const terreno = new THREE.Mesh(geo, material);
  terreno.name = 'terreno';
  return terreno;
}

/**
 * Embasamento: num terreno em declive, onde o chão fica abaixo do primeiro
 * andar a casa não pode flutuar. Um bloco de concreto vai do ponto mais baixo
 * do terreno sob a casa até o piso. Null quando não precisa.
 */
function construirEmbasamento(casa, { cx, cz }, { mat, cubo, arestasCubo }) {
  if (!casa.terreno?.desce) return null;
  const baixo = casa.andares[0];
  const L = limites(casa.comodos, true);
  const B = limites(baixo.comodos, true);
  const meia = (casa.parede || 12) / 2;
  const cantos = [[B.minX - meia, B.minY - meia], [B.maxX + meia, B.minY - meia], [B.maxX + meia, B.maxY + meia], [B.minX - meia, B.maxY + meia]];
  const chao = Math.min(...cantos.map(([x, y]) => alturaDoTerreno(casa.terreno, L, x, y)));
  if (chao > baixo.cota - 2) return null; // o terreno já chega no piso
  const topo = baixo.cota - 0.5;
  const m = new THREE.Mesh(cubo, mat.concreto);
  m.scale.set((B.w + meia * 2) / 100, (topo - chao) / 100, (B.h + meia * 2) / 100);
  // Vai no grupo do primeiro andar (que já está na cota dele): altura relativa a ele
  m.position.set((B.minX + B.maxX) / 200 - cx, ((chao + topo) / 2 - baixo.cota) / 100, (B.minY + B.maxY) / 200 - cz);
  m.add(new THREE.LineSegments(arestasCubo, mat.aresta));
  m.name = 'embasamento';
  return m;
}

/**
 * Telhado (ver domain/telhado.js): panos e oitões como polígonos planos,
 * laje e platibanda como caixas. Fica num grupo próprio, para ligar/desligar.
 */
function construirTelhado(casa, { cx, cz }, { mat, cubo, arestasCubo }) {
  const g = geometriaDoTelhado(casa);
  if (!g) return null;
  const grupo = new THREE.Group();
  grupo.name = 'telhado';
  const paraCena = ([x, y, z]) => new THREE.Vector3(x / 100 - cx, z / 100, y / 100 - cz);

  for (const face of g.faces) {
    const pts = face.pontos.map(paraCena);
    // Coordenadas de textura no plano do pano, em metros: u ao longo do beiral,
    // v no sentido da caída da água (assim as telhas descem pelo pano)
    const U = new THREE.Vector3().subVectors(pts[1], pts[0]).normalize();
    const N = new THREE.Vector3().subVectors(pts[1], pts[0]).cross(new THREE.Vector3().subVectors(pts[2], pts[0])).normalize();
    const V = new THREE.Vector3().crossVectors(N, U);
    const uv = (p) => { const d = new THREE.Vector3().subVectors(p, pts[0]); return [d.dot(U), d.dot(V)]; };
    const posicoes = [], uvs = [];
    for (let k = 1; k < pts.length - 1; k++) {
      for (const p of [pts[0], pts[k], pts[k + 1]]) { posicoes.push(...p.toArray()); uvs.push(...uv(p)); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posicoes, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    const malha = new THREE.Mesh(geo, face.tipo === 'oitao' ? mat.oitao : mat.telhado);
    malha.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat.aresta));
    grupo.add(malha);
  }
  for (const c of g.caixas) {
    const m = new THREE.Mesh(cubo, mat.parede);
    m.scale.set((c.x1 - c.x0) / 100, (c.z1 - c.z0) / 100, (c.y1 - c.y0) / 100);
    m.position.set((c.x0 + c.x1) / 200 - cx, (c.z0 + c.z1) / 200, (c.y0 + c.y1) / 200 - cz);
    m.add(new THREE.LineSegments(arestasCubo, mat.aresta));
    grupo.add(m);
  }
  return grupo;
}

/** Forma do three.js a partir de pontos da planta (cm), já no sistema da cena. */
function formaDe(pontos, { cx, cz }) {
  return new THREE.Shape(pontos.map(([x, y]) => new THREE.Vector2(x / 100 - cx, -(y / 100 - cz))));
}

/** Placa vertical (extrusão para cima) de um polígono da planta, de `base` até `base + altura` (m). */
function placa(pontos, centro, altura, base, material) {
  const geo = new THREE.ExtrudeGeometry(formaDe(pontos, centro), { depth: altura, bevelEnabled: false });
  const m = new THREE.Mesh(geo, material);
  m.rotation.x = -Math.PI / 2;
  m.position.y = base;
  return m;
}

/**
 * Escada no grupo do andar de baixo (piso em y = 0). Reta, L e U: cada degrau
 * é um bloco maciço do chão até o topo dele, como escada de alvenaria.
 * Caracol: degraus finos em leque presos ao poste central.
 */
function construirEscada(grupo, e, centro, { mat }) {
  const g = e.geo;
  const caracol = e.tipo === 'caracol';
  for (const d of g.degraus) {
    const topo = d.altura / 100;
    const espessura = caracol ? 0.05 : topo;
    const m = placa(d.pontos, centro, espessura, topo - espessura, mat.degrau);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), mat.aresta));
    m.userData.escada = e.id;
    grupo.add(m);
  }
  if (caracol) {
    const h = g.desnivel / 100;
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(g.raioPoste / 100, g.raioPoste / 100, h, 16), mat.madeira);
    poste.position.set(g.centro[0] / 100 - centro.cx, h / 2, g.centro[1] / 100 - centro.cz);
    grupo.add(poste);
  }
  construirCorrimao(grupo, e, centro, mat.corrimao);
}

/** Tubo (cilindro) entre dois pontos da cena. */
function tubo(grupo, a, b, raio, material) {
  const v = new THREE.Vector3().subVectors(b, a);
  const comp = v.length();
  if (comp < 1e-4) return;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, comp, 8), material);
  m.position.copy(a).addScaledVector(v, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  grupo.add(m);
}

/**
 * Corrimão a 90 cm acima da linha dos degraus, do lado direito de quem sobe
 * (na caracol, pela borda de fora), com balaústres a cada ~1 m.
 * A altura acompanha a subida ao longo do caminho, de 0 ao desnível.
 */
function construirCorrimao(grupo, e, { cx, cz }, material) {
  const g = e.geo;
  const S = comprimentoDe(g.caminho);
  if (!S) return;
  const pontos = []; // [x, y (cm, planta), s (cm ao longo do caminho)]
  if (e.tipo === 'caracol') {
    // O caminho fica a 60% do raio: leva cada ponto para perto da borda de fora
    const k = (g.raio - 5) / g.raioCaminho;
    let s = 0;
    g.caminho.forEach((p, i) => {
      if (i) s += Math.hypot(p[0] - g.caminho[i - 1][0], p[1] - g.caminho[i - 1][1]);
      pontos.push([g.centro[0] + (p[0] - g.centro[0]) * k, g.centro[1] + (p[1] - g.centro[1]) * k, s]);
    });
  } else {
    const desvio = g.lance / 2 - 5;
    let s = 0;
    for (let i = 1; i < g.caminho.length; i++) {
      const [a, b] = [g.caminho[i - 1], g.caminho[i]];
      const comp = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ux = (b[0] - a[0]) / comp, uy = (b[1] - a[1]) / comp;
      const nx = -uy, ny = ux; // direita de quem anda (y da planta cresce para baixo)
      const passos = Math.max(1, Math.ceil(comp / 20));
      for (let k = i === 1 ? 0 : 1; k <= passos; k++) {
        const t = k / passos;
        pontos.push([a[0] + (b[0] - a[0]) * t + nx * desvio, a[1] + (b[1] - a[1]) * t + ny * desvio, s + comp * t]);
      }
      s += comp;
    }
  }
  const altura = MODELO_3D.alturaCorrimao, raio = MODELO_3D.raioCorrimao;
  const naCena = ([x, y, s], extra = 0) => new THREE.Vector3(x / 100 - cx, (g.desnivel * s / S) / 100 + altura + extra, y / 100 - cz);
  for (let i = 1; i < pontos.length; i++) tubo(grupo, naCena(pontos[i - 1]), naCena(pontos[i]), raio, material);
  // Balaústres: do degrau até o corrimão
  let proximo = 0;
  for (const p of pontos) {
    if (p[2] < proximo) continue;
    tubo(grupo, naCena(p, -altura), naCena(p), raio * 0.7, material);
    proximo = p[2] + 100;
  }
  tubo(grupo, naCena(pontos[pontos.length - 1], -altura), naCena(pontos[pontos.length - 1]), raio * 0.7, material);
}

/** Guarda-corpo em volta do buraco da escada no andar de cima (menos na borda de chegada). */
function construirGuardaDaEscada(grupo, e, centro, recursos) {
  construirGuarda(grupo, e.geo.bordas, centro, recursos);
}

/** Guarda-corpo de 1 m nas bordas fechadas em cima (escadas e vazios). */
function construirGuarda(grupo, bordas, { cx, cz }, { mat, cubo }) {
  for (const b of bordas) {
    if (b.abertaEmCima || b.interna) continue;
    const [x1, z1, x2, z2] = [b.seg[0] / 100 - cx, b.seg[1] / 100 - cz, b.seg[2] / 100 - cx, b.seg[3] / 100 - cz];
    const m = new THREE.Mesh(cubo, mat.guarda);
    m.scale.set(Math.hypot(x2 - x1, z2 - z1) + 0.04, 1.0, 0.04);
    m.position.set((x1 + x2) / 2, 0.5, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    grupo.add(m);
  }
}

/** Peças de um andar (planta de um andar só), com o piso em y = 0 do grupo. */
function construirAndar(grupo, dados, { cx, cz }, { mat, cubo, arestasCubo }, pecas, { comLaje, aberturas = [] }) {
  const esp = (dados.parede || 12) / 100;
  const peDireito = dados.peDireito / 100;
  const alturaPorta = dados.alturaPorta / 100;
  const laje = comLaje ? dados.laje / 100 : 0;
  // Andar todo abaixo da rua: paredes de concreto
  const materialParede = dados.cota + dados.peDireito <= 0 ? mat.concreto : mat.parede;

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

  /** Bloco de parede com contorno azul petróleo e registrado na lista indicada. */
  function blocoDeParede(segmento, altura, base, lista) {
    const m = bloco(segmento, materialParede, altura, base, esp, 0);
    m.add(new THREE.LineSegments(arestasCubo, mat.aresta));
    grupo.add(m);
    lista.push(m);
    return m;
  }

  // Pisos (nos andares de cima, a placa desce até a espessura da laje).
  // Onde chega uma escada, o piso vira pedaços em volta do buraco.
  for (const r of dados.comodos) {
    const pedacos = aberturas.length ? recortarAberturas(r.pontos, aberturas) : null;
    // Madeira nos cômodos, porcelanato na circulação, deck nas sacadas (texturas desenhadas na hora).
    // Com textura, a cor do material fica branca: o destaque da seleção tinge o piso de coral.
    const textura = texturaDePiso(r.tipo, TIPOS_COMODO[r.tipo].cor3d);
    const material = new THREE.MeshStandardMaterial({
      color: textura ? 0xffffff : cor(TIPOS_COMODO[r.tipo].cor3d), map: textura, roughness: textura && r.tipo === 'circulacao' ? 0.55 : 0.85, metalness: 0,
    });
    for (const pontos of pedacos ?? [r.pontos]) {
      const base = (TIPOS_COMODO[r.tipo].externo ? -0.05 : 0) - laje;
      const piso = placa(pontos, { cx, cz }, MODELO_3D.espessuraPiso + laje, base, material);
      piso.userData.id = r.id;
      grupo.add(piso);
      pecas.pisos.push(piso);
    }
  }

  // Paredes e guarda-corpos
  const { paredes, guardas } = gerarParedes(dados, true);
  for (const s of paredes) {
    // Já na altura do pé-direito (o modo "paredes baixas" do Modelo 3D reajusta depois)
    const m = bloco(s, materialParede, peDireito, 0, esp, esp);
    m.add(new THREE.LineSegments(arestasCubo, mat.aresta));
    m.userData.alt = peDireito;
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
  /**
   * Pedacinho de `cm` centímetros a partir de uma ponta do segmento (para montantes
   * e batentes): `deOnde` = 0 na ponta inicial, 1 na final, 0,5 no meio.
   */
  const trecho = ([x1, y1, x2, y2], deOnde, cm) => {
    const comp = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / comp, uy = (y2 - y1) / comp;
    const meio = deOnde * comp + (deOnde === 0 ? cm / 2 : deOnde === 1 ? -cm / 2 : 0);
    return [x1 + ux * (meio - cm / 2), y1 + uy * (meio - cm / 2), x1 + ux * (meio + cm / 2), y1 + uy * (meio + cm / 2)];
  };
  const PERFIL = 5; // cm: largura de caixilhos e batentes
  const fundo = esp + 0.02;
  /** Peça de acabamento (caixilho, batente): some junto com as vergas no modo "paredes baixas". */
  const acabamento = (seg, material, altura, base) => {
    const m = bloco(seg, material, altura, base, fundo, 0);
    grupo.add(m);
    pecas.vergas.push(m);
  };

  // Batentes: dois montantes e a travessa em cima, em volta de portas de abrir e de correr
  for (const p of dados.portas) {
    if (p.tipo === 'vao') continue;
    const seg = segmentoDa(p);
    acabamento(trecho(seg, 0, PERFIL), mat.batente, alturaPorta, 0);
    acabamento(trecho(seg, 1, PERFIL), mat.batente, alturaPorta, 0);
    acabamento(seg, mat.batente, PERFIL / 100, alturaPorta - PERFIL / 100);
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
    // Caixilho: moldura em volta do vidro e um montante no meio das janelas largas
    const altura = topo - peitoril, larguraCm = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
    acabamento(seg, mat.caixilho, PERFIL / 100, peitoril);
    acabamento(seg, mat.caixilho, PERFIL / 100, topo - PERFIL / 100);
    acabamento(trecho(seg, 0, PERFIL), mat.caixilho, altura, peitoril);
    acabamento(trecho(seg, 1, PERFIL), mat.caixilho, altura, peitoril);
    if (larguraCm > 110) acabamento(trecho(seg, 0.5, PERFIL * 0.8), mat.caixilho, altura, peitoril);
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
}
