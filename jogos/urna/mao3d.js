// Mão direita realista que vota na urna.
// A pele é uma superfície só, sem emendas: palma, eminências, nós, tendões, dedos e polegar são formas de
// uma função de distância fundidas suavemente e convertidas em malha (surface nets) uma vez, na abertura.
// O indicador tem 3 ossos e dobra ao apertar; os outros dedos ficam fechados e o polegar dobrado por baixo.
// Eixos locais: dedos para -z, dorso para +y, polegar em -x, pulso em z = 0. Unidade ≈ 10 cm.
import { THREE, material, pele, texturaCanvas, texturaMaterial, malha } from '../kit/cena3d.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// união suave (k = largura da "solda" entre as formas)
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * .25;
}

// falange: cone de pontas arredondadas de a até b (raio r1 → r2), seção mais larga que alta
function falange(a, b, r1, r2, cima, achata = .86) {
  const eixo = b.clone().sub(a);
  const h = eixo.length();
  eixo.divideScalar(h);
  const u = cima.clone().addScaledVector(eixo, -cima.dot(eixo)).normalize();
  const s = new THREE.Vector3().crossVectors(eixo, u);
  const bb = (r1 - r2) / h, aa = Math.sqrt(1 - bb * bb);
  const { x: ax, y: ay, z: az } = a;
  const { x: ex, y: ey, z: ez } = eixo, { x: ux, y: uy, z: uz } = u, { x: sx, y: sy, z: sz } = s;
  return {
    a, b, eixo, u, s, h, r1, r2,
    d(x, y, z) {
      const px = x - ax, py = y - ay, pz = z - az;
      const ao = px * ex + py * ey + pz * ez;
      const cy = (px * ux + py * uy + pz * uz) / achata;
      const cx = px * sx + py * sy + pz * sz;
      const rad = Math.sqrt(cx * cx + cy * cy);
      const k = -bb * rad + aa * ao;
      let d;
      if (k < 0) d = Math.sqrt(rad * rad + ao * ao) - r1;
      else if (k > aa * h) d = Math.sqrt(rad * rad + (ao - h) * (ao - h)) - r2;
      else d = rad * aa + ao * bb - r1;
      return d * achata;
    }
  };
}

function esfera(c, r) {
  return (x, y, z) => Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2) - r;
}

// elipsoide (aproximação de distância), girado em y
function elipsoide(c, r, giroY = 0) {
  const co = Math.cos(giroY), se = Math.sin(giroY);
  return (x, y, z) => {
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const px = dx * co - dz * se, pz = dx * se + dz * co;
    const k0 = Math.sqrt((px / r.x) ** 2 + (dy / r.y) ** 2 + (pz / r.z) ** 2);
    const k1 = Math.sqrt((px / (r.x * r.x)) ** 2 + (dy / (r.y * r.y)) ** 2 + (pz / (r.z * r.z)) ** 2);
    return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -r.y;
  };
}

// palma: caixa arredondada que afina para o pulso, com o dorso arqueado e a palma em concha
function palma(x, y, z) {
  const f = .74 + .26 * suave(-.05, -.8, z);
  const px = x / f;
  const py = y + .03 + .055 * (px / .41) ** 2;
  const pz = z + .5;
  const r = .1;
  const qx = Math.abs(px) - .41 + r, qy = Math.abs(py) - .115 + r, qz = Math.abs(pz) - .47 + r;
  const fora = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2 + Math.max(qz, 0) ** 2);
  return (fora + Math.min(Math.max(qx, qy, qz), 0) - r) * .85;
}

/* ---------- forma da mão (pose de apontar) ---------- */

// nó (base), comprimento das falanges, raios (nó → ponta), dobras de cada junta (rad), abertura lateral
const DEDOS = [
  { base: V(-.29, -.005, -.97), comp: [.43, .25, .2], raios: [.087, .08, .073, .066], dobras: [.2, .26, .14], abre: .07 },
  { base: V(-.095, 0, -1.0), comp: [.47, .28, .21], raios: [.089, .083, .076, .068], dobras: [1.42, 1.72, .95], abre: .02 },
  { base: V(.1, -.012, -.975), comp: [.44, .26, .2], raios: [.085, .079, .072, .065], dobras: [1.48, 1.72, .95], abre: .06 },
  { base: V(.28, -.035, -.9), comp: [.35, .2, .18], raios: [.076, .07, .064, .058], dobras: [1.55, 1.66, .95], abre: .12 }
];
// polegar dobrado por baixo do indicador, encostado no médio: metacarpo (dentro da eminência), falange e ponta
const POLEGAR = { pontos: [V(-.25, -.1, -.13), V(-.45, -.2, -.46), V(-.45, -.32, -.72), V(-.31, -.415, -.875)], raios: [.15, .118, .108, .094] };

// esfera que envolve uma cadeia de pontos: longe dela, a distância até a esfera basta (e poupa contas)
function limite(pontos, folga) {
  const c = pontos.reduce((a, p) => a.add(p), V(0, 0, 0)).divideScalar(pontos.length);
  const r = Math.max(...pontos.map(p => p.distanceTo(c))) + folga;
  return (x, y, z) => Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2) - r;
}

function cadeia({ base, comp, raios, dobras, abre }) {
  const qAbre = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), abre);
  const lado = V(1, 0, 0).applyQuaternion(qAbre);
  const juntas = [base.clone()], segs = [], dirs = [], cimas = [];
  let p = base.clone(), ang = 0;
  comp.forEach((c, i) => {
    ang += dobras[i];
    const q = new THREE.Quaternion().setFromAxisAngle(lado, -ang).multiply(qAbre);
    const dir = V(0, 0, -1).applyQuaternion(q), cima = V(0, 1, 0).applyQuaternion(q);
    const fim = p.clone().addScaledVector(dir, c);
    segs.push(falange(p, fim, raios[i], raios[i + 1], cima));
    juntas.push(fim);
    dirs.push(dir); cimas.push(cima);
    p = fim;
  });
  // nó de cada junta um pouco saltado no dorso
  const bolhas = [1, 2].map(i => esfera(juntas[i].clone().addScaledVector(cimas[i], raios[i] * .32), raios[i] * .72));
  const lim = limite(juntas, raios[0]);
  const d = (x, y, z) => {
    const fora = lim(x, y, z);
    if (fora > .12) return fora;
    let v = segs[0].d(x, y, z);
    v = smin(v, segs[1].d(x, y, z), .025);
    v = smin(v, segs[2].d(x, y, z), .022);
    for (const b of bolhas) v = smin(v, b(x, y, z), .03);
    return v;
  };
  return { segs, juntas, dirs, cimas, lado, d, ponta: juntas[3], raioPonta: raios[3] };
}

function montarForma() {
  const dedos = DEDOS.map(cadeia);
  const [ind, med, ane, min] = dedos;
  const P = POLEGAR.pontos, R = POLEGAR.raios;
  const fora = V(-.75, .5, -.4);
  const pol = [0, 1, 2].map(i => falange(P[i], P[i + 1], R[i], R[i + 1], fora, .88));
  const limPol = limite(P, R[0]);
  const polegar = (x, y, z) => {
    const fora = limPol(x, y, z);
    if (fora > .12) return fora;
    return smin(smin(pol[0].d(x, y, z), pol[1].d(x, y, z), .04), pol[2].d(x, y, z), .03);
  };

  const tenar = elipsoide(V(-.27, -.11, -.32), V(.15, .12, .28), .5);
  const hipotenar = elipsoide(V(.3, -.09, -.46), V(.12, .1, .36), -.08);
  const pulso = falange(V(0, -.025, -.05), V(0, -.025, .62), .27, .285, V(0, 1, 0), .7);
  // cabeças dos metacarpos (os nós do dorso) e os tendões que vão do pulso até eles
  const nos = dedos.map((f, i) => esfera(f.juntas[0].clone().add(V(0, .045, .025)), [.082, .086, .08, .07][i]));
  const tendoes = dedos.map((f) => falange(V(f.juntas[0].x * .4, .055, -.18), f.juntas[0].clone().add(V(0, .06, .05)), .026, .03, V(0, 1, 0)));

  const limNos = limite(dedos.map(f => f.juntas[0]).concat([V(0, .05, -.2)]), .1);
  const base = (x, y, z) => {
    let d = palma(x, y, z);
    d = smin(d, tenar(x, y, z), .1);
    d = smin(d, hipotenar(x, y, z), .08);
    d = smin(d, pulso.d(x, y, z), .14);
    if (limNos(x, y, z) > .1) return d;
    for (const n of nos) d = smin(d, n(x, y, z), .05);
    for (const t of tendoes) d = smin(d, t.d(x, y, z), .05);
    return d;
  };
  const resto = (x, y, z) => smin(smin(base(x, y, z), polegar(x, y, z), .09),
    Math.min(med.d(x, y, z), ane.d(x, y, z), min.d(x, y, z)), .05);
  const total = (x, y, z) => smin(resto(x, y, z), ind.d(x, y, z), .05);
  return { dedos, ind, pol, polegar, resto, total };
}

/* ---------- malha a partir da função de distância (surface nets) ---------- */

const CANTOS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const ARESTAS = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

function superficie(sdf, min, max, passo) {
  const nx = Math.ceil((max.x - min.x) / passo) + 1, ny = Math.ceil((max.y - min.y) / passo) + 1, nz = Math.ceil((max.z - min.z) / passo) + 1;
  const campo = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  // blocos de 4³ pontos: longe da pele, o valor do centro do bloco já dá o sinal certo de todos
  const B = 4, limiar = passo * B * 1.4 + passo;
  for (let bk = 0; bk < nz; bk += B) for (let bj = 0; bj < ny; bj += B) for (let bi = 0; bi < nx; bi += B) {
    const fc = sdf(min.x + (bi + 1.5) * passo, min.y + (bj + 1.5) * passo, min.z + (bk + 1.5) * passo);
    const exato = Math.abs(fc) < limiar;
    for (let k = bk; k < Math.min(bk + B, nz); k++) for (let j = bj; j < Math.min(bj + B, ny); j++) for (let i = bi; i < Math.min(bi + B, nx); i++)
      campo[id(i, j, k)] = exato ? sdf(min.x + i * passo, min.y + j * passo, min.z + k * passo) : fc;
  }
  const cel = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [], v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let dentro = 0;
    for (let c = 0; c < 8; c++) { v[c] = campo[id(i + CANTOS[c][0], j + CANTOS[c][1], k + CANTOS[c][2])]; if (v[c] < 0) dentro++; }
    if (dentro === 0 || dentro === 8) continue;
    let sx = 0, sy = 0, sz = 0, q = 0;
    for (const [e0, e1] of ARESTAS) {
      if ((v[e0] < 0) === (v[e1] < 0)) continue;
      const t = v[e0] / (v[e0] - v[e1]), c0 = CANTOS[e0], c1 = CANTOS[e1];
      sx += c0[0] + t * (c1[0] - c0[0]); sy += c0[1] + t * (c1[1] - c0[1]); sz += c0[2] + t * (c1[2] - c0[2]); q++;
    }
    cel[id(i, j, k)] = pos.length / 3;
    pos.push(min.x + (i + sx / q) * passo, min.y + (j + sy / q) * passo, min.z + (k + sz / q) * passo);
  }
  const ind = [];
  const quad = (a, b, c, d, inverte) => { if (inverte) ind.push(a, c, b, a, d, c); else ind.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = campo[id(i, j, k)] < 0;
    if (a !== campo[id(i + 1, j, k)] < 0) quad(cel[id(i, j - 1, k - 1)], cel[id(i, j, k - 1)], cel[id(i, j, k)], cel[id(i, j - 1, k)], !a);
    if (a !== campo[id(i, j + 1, k)] < 0) quad(cel[id(i - 1, j, k - 1)], cel[id(i - 1, j, k)], cel[id(i, j, k)], cel[id(i, j, k - 1)], !a);
    if (a !== campo[id(i, j, k + 1)] < 0) quad(cel[id(i - 1, j - 1, k)], cel[id(i, j - 1, k)], cel[id(i, j, k)], cel[id(i - 1, j, k)], !a);
  }
  // leva cada vértice para a superfície e usa o gradiente como normal (sombreado liso);
  // gradiente por 4 amostras em tetraedro, que também dão o valor no ponto (média)
  const e = passo * .35, nor = new Float32Array(pos.length);
  for (let p = 0; p < pos.length; p += 3) {
    const x = pos[p], y = pos[p + 1], z = pos[p + 2];
    const a = sdf(x + e, y - e, z - e), b = sdf(x - e, y - e, z + e), c = sdf(x - e, y + e, z - e), d = sdf(x + e, y + e, z + e);
    const gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d;
    const gl = Math.hypot(gx, gy, gz) || 1, f = (a + b + c + d) / 4;
    const anda = Math.max(-passo, Math.min(passo, f / (gl / (4 * e))));
    pos[p] = x - gx / gl * anda; pos[p + 1] = y - gy / gl * anda; pos[p + 2] = z - gz / gl * anda;
    nor[p] = gx / gl; nor[p + 1] = gy / gl; nor[p + 2] = gz / gl;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(ind);
  return geo;
}

/* ---------- unhas ---------- */

let texUnha = null;
function texturaUnha() {
  // v = 0 na cutícula (lúnula clara), corpo rosado, borda livre branca na ponta
  texUnha ??= texturaCanvas(64, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, '#e7b4a9'); g.addColorStop(.12, '#ecbfb4'); g.addColorStop(.24, '#dc998d');
    g.addColorStop(.76, '#e1a296'); g.addColorStop(.83, '#eed0c5'); g.addColorStop(.89, '#f8efe7'); g.addColorStop(1, '#fbf6ef');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // bordas laterais um pouco mais escuras (prega da pele)
    const l = ctx.createLinearGradient(0, 0, w, 0);
    l.addColorStop(0, 'rgba(150,80,70,.35)'); l.addColorStop(.18, 'rgba(150,80,70,0)'); l.addColorStop(.82, 'rgba(150,80,70,0)'); l.addColorStop(1, 'rgba(150,80,70,.35)');
    ctx.fillStyle = l; ctx.fillRect(0, 0, w, h * .8);
  }).textura;
  return texUnha;
}

// placa da unha moldada sobre a última falange: raios saem do eixo do dedo e param na pele
function geoUnha(seg, sdf, { inicio = .2, alem = .55, abertura = 1.0, folga = .0055, nu = 11, nv = 13 } = {}) {
  const pos = [], uv = [], ind = [];
  const p = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let j = 0; j < nv; j++) {
    const v = j / (nv - 1);
    const ao = seg.h * inicio + v * (seg.h * (1 - inicio) + seg.r2 * alem);
    // cutícula em "U": a placa estreita perto da base
    const largura = v < .24 ? .3 + .7 * Math.sqrt(1 - ((.24 - v) / .24) ** 2) : 1;
    for (let i = 0; i < nu; i++) {
      const w = (i / (nu - 1)) * 2 - 1, phi = w * abertura * largura;
      dir.copy(seg.u).multiplyScalar(Math.cos(phi)).addScaledVector(seg.s, Math.sin(phi));
      const o = seg.a.clone().addScaledVector(seg.eixo, ao);
      let t0 = 0, t1 = .4;
      for (let it = 0; it < 22; it++) {
        const t = (t0 + t1) / 2;
        p.copy(o).addScaledVector(dir, t);
        if (sdf(p.x, p.y, p.z) < 0) t0 = t; else t1 = t;
      }
      p.copy(o).addScaledVector(dir, t1 + folga);
      pos.push(p.x, p.y, p.z);
      uv.push(i / (nu - 1), v);
    }
  }
  for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
    const a = j * nu + i, b = a + 1, c = a + nu + 1, d = a + nu;
    ind.push(a, b, c, a, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(ind);
  geo.computeVertexNormals();
  return geo;
}

/* ---------- a mão ---------- */

// passo: tamanho da grade da malha (menor = mais detalhe e mais triângulos)
export function criarMao({ corPele = '#c98d69', corManga = '#454b55', passo = .019 } = {}) {
  const raiz = new THREE.Group();     // posicionada de modo que a ponta do indicador caia no alvo
  raiz.name = 'mao';
  const mao = new THREE.Group();      // orientação do braço (giro)
  mao.rotation.order = 'YXZ';
  raiz.add(mao);

  const forma = montarForma();
  const { ind, dedos } = forma;
  const geo = superficie(forma.total, V(-.7, -.78, -2.02), V(.58, .27, 1.0), passo);

  // pesos dos ossos: cada vértice segue a forma mais próxima (mão ou uma das falanges do indicador),
  // com transição suave nas juntas
  const pos = geo.attributes.position, nor = geo.attributes.normal, nv = pos.count;
  const ossoIdx = new Uint16Array(nv * 4), ossoPeso = new Float32Array(nv * 4), cores = new Float32Array(nv * 3);
  const tau = .022;
  const partes = [forma.resto, ...ind.segs.map(s => s.d.bind(s))];
  const juntasCor = [];
  dedos.forEach((f, i) => {
    juntasCor.push([f.juntas[0].clone().add(V(0, .06, .02)), .07, .5]);
    juntasCor.push([f.juntas[1].clone().addScaledVector(f.cimas[1], .06), .05, .35]);
    juntasCor.push([f.juntas[2].clone().addScaledVector(f.cimas[2], .055), .04, .3]);
    juntasCor.push([f.ponta, .075, i === 0 ? .45 : .3]);
  });
  forma.pol.forEach((s) => juntasCor.push([s.b.clone().addScaledVector(s.u, .05), .055, .3]));
  for (let k = 0; k < nv; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const d = partes.map(f => f(x, y, z));
    const dm = Math.min(...d);
    const w = d.map(v => Math.exp(-(v - dm) / tau));
    const soma = w.reduce((a, b) => a + b, 0);
    for (let o = 0; o < 4; o++) { ossoIdx[k * 4 + o] = o; ossoPeso[k * 4 + o] = w[o] / soma; }
    // tom de pele: nós e pontas mais rosados, palma mais clara
    let r = 1, g = 1, b = 1;
    for (const [c, raio, forca] of juntasCor) {
      const q = Math.exp(-((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2) / (raio * raio)) * forca;
      g -= .17 * q; b -= .2 * q; r += .01 * q;
    }
    const baixo = Math.max(0, -nor.getY(k)) * suave(.3, -.2, z);
    r += .05 * baixo; g += .05 * baixo; b += .03 * baixo;
    cores[k * 3] = r; cores[k * 3 + 1] = g; cores[k * 3 + 2] = b;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ossoIdx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ossoPeso, 4));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));

  const mPele = pele(corPele);
  mPele.vertexColors = true;
  mPele.roughness = .5;
  const ossos = [new THREE.Bone()];
  ind.juntas.slice(0, 3).forEach((j, i) => {
    const o = new THREE.Bone();
    o.position.copy(j).sub(i ? ind.juntas[i - 1] : V(0, 0, 0));
    ossos[i].add(o);
    ossos.push(o);
  });
  const corpo = new THREE.SkinnedMesh(geo, mPele);
  corpo.castShadow = corpo.receiveShadow = true;
  corpo.frustumCulled = false;
  corpo.add(ossos[0]);
  corpo.bind(new THREE.Skeleton(ossos));
  mao.add(corpo);

  // unhas: indicador (presa ao último osso) e polegar
  const mUnha = material('#ffffff', { mapa: texturaUnha(), rugosidade: .28, verniz: .9 });
  const dInd = ind.d;
  const gUnha = geoUnha(ind.segs[2], dInd);
  gUnha.translate(-ind.juntas[2].x, -ind.juntas[2].y, -ind.juntas[2].z);
  const unha = malha(gUnha, mUnha, { sombra: false });
  ossos[3].add(unha);
  const unhaPol = malha(geoUnha(forma.pol[2], forma.polegar, { abertura: 1.05, inicio: .3, alem: .5 }), mUnha, { sombra: false });
  mao.add(unhaPol);

  // ponto da polpa do indicador que encosta na tecla
  const ponteira = new THREE.Object3D();
  const dir2 = ind.dirs[2], cima2 = ind.cimas[2];
  ponteira.position.copy(dir2).multiplyScalar(ind.segs[2].h)
    .add(dir2.clone().multiplyScalar(.6).addScaledVector(cima2, -.8).normalize().multiplyScalar(ind.raioPonta));
  ossos[3].add(ponteira);

  // punho da camisa com abotoadura e manga do paletó
  const tecido = texturaMaterial('tecido', { cor: corManga, repetir: [3, 6] });
  const mManga = material('#ffffff', { mapa: tecido.mapa, relevo: tecido.relevo, escalaRelevo: .02, rugosidade: .88 });
  const punho = malha(new THREE.CylinderGeometry(.325, .34, .38, 32), material('#f4f4f0', { rugosidade: .75 }));
  punho.rotation.x = Math.PI / 2; punho.position.z = .56; punho.scale.set(1.06, 1, .8);
  mao.add(punho);
  const abotoadura = malha(new THREE.SphereGeometry(.05, 12, 8), material('#d8b24a', { rugosidade: .25, metal: 1 }));
  abotoadura.position.set(-.35, .04, .6);
  mao.add(abotoadura);
  const manga = malha(new THREE.CylinderGeometry(.43, .52, 5, 32, 1, true), mManga);
  manga.rotation.x = Math.PI / 2; manga.position.z = 3.2; manga.scale.set(1.08, 1, .9);
  mao.add(manga);
  const bordaManga = malha(new THREE.TorusGeometry(.43, .035, 10, 40), mManga);
  bordaManga.position.z = .7; bordaManga.scale.set(1.08, .9, 1);
  mao.add(bordaManga);

  const lado = ind.lado, tmp = new THREE.Vector3();
  return {
    raiz,
    giro: mao.rotation,
    triangulos: geo.index.count / 3,
    // coloca a raiz para a polpa do indicador ficar em (x, y, z)
    posicionar(x, y, z) {
      raiz.updateMatrixWorld(true);
      ponteira.getWorldPosition(tmp);
      raiz.position.x += x - tmp.x;
      raiz.position.y += y - tmp.y;
      raiz.position.z += z - tmp.z;
    },
    // dobra extra do indicador (0 = pose do modelo; negativo estica, positivo dobra ao apertar)
    dobrar(k) {
      ossos[1].quaternion.setFromAxisAngle(lado, -.32 * k);
      ossos[2].quaternion.setFromAxisAngle(lado, -.45 * k);
      ossos[3].quaternion.setFromAxisAngle(lado, -.28 * k);
    }
  };
}
