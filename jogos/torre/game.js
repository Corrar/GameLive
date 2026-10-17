import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, corDoNick, avatar, animar,
  particulas, flutuar, tremer, pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';
import { criarCena, THREE, material, caixa, malha, texturaMaterial, texturaCanvas, textoJogo, fontesProntas,
  ceuDegrade, nuvens, rotulo, criarParticulas, mergeGeometries } from '../kit/cena3d.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = $('palco');
const transparente = !cfg.fundo || cfg.fundo === 'transparente';
aplicarFundo(cfg.fundo);
escalarPalco(palco);
ligarSom(cfg.som);
const avisar = avisos($('avisos'), { max: 3 });
if (cfg.titulo) $('titulo').textContent = cfg.titulo;
await fontesProntas();

const GIGANTE = cfg.blocoGigante ?? 5;
const DEMOLE = cfg.demolicao ?? 5;
const MAX_FILA = cfg.maxFila ?? 300;
const GIRO = cfg.giroCamera ?? .3;   // quanto a câmera gira em volta da torre (radianos)
const BH = .55;                      // altura de 1 bloco (unidades do mundo)
const PROFS = [1.88, 2, 2.12];       // profundidades do bloco comum (as bordas desencontradas fazem sombra de contato)
const BASE_Y = .56;                  // topo da laje de concreto
const LARGURAS = [2.4, 2.5, 2.6, 2.7, 2.8];
const GIG = { l: 3.7, p: 2.5 };
const JANELA = 44;                   // só os blocos do alto viram malha 3D; os de baixo ficam nos dados
const MAX_CACOS = 46;
const CORES = ['#3df2c2', '#ff3d7f', '#ffc23d', '#5b8cff', '#b06bff', '#ff7a3d'];
const r = (a, b) => a + Math.random() * (b - a);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

let blocos = [];   // pilha: {x, z, y, vy, alvo, w, p, h, vale, cor, quem, gigante, pousou, amasso, malha, placa}
let cacos = [];    // pedaços voando: {m, vx, vy, vz, wx, wy, wz, vida, placa}
let fila = [];     // ações esperando a vez: {acao, quem, n}
let espera = 0, anim = null;
let camF = BASE_Y, t = 0, contaCor = 0, ultimoSom = 0, flash = 0, giroExtra = 0, topoX = 0, foco = 0;
let recorde = lembrar('torre:recorde', 0);
if (!Number.isFinite(recorde)) recorde = 0;
let festejou = false;    // já comemorou o novo recorde desta subida
let alturaHud = 0, zonaAtual = 0, ultimaZona = 0, ultimaFesta = -1e9;
let somaAltura = 0;      // soma dos valores da pilha (sem percorrer o array a cada quadro)

const altura = () => somaAltura;
const topo = () => { const b = blocos.at(-1); return b ? b.alvo + b.h : BASE_Y; };

/* ---------- cena 3D ---------- */

const c3d = criarCena(palco, {
  cfg, fundo: transparente ? null : '#cdeaff', luz: 'dia',
  camera: { pos: [0, 2, 17.5], alvo: [0, .2, 0], fov: 40 },
  sol: { alcance: 8 },
  neblina: transparente ? null : { cor: '#cdeaff', perto: 40, longe: 320 }
});
const { cena, camera, sol, hemi, renderer } = c3d;
sol.shadow.radius = 2;   // sombra mais firme (contato entre as camadas de blocos)
const DIST = 17.5;
const part = criarParticulas(c3d, { max: 700 });
const vTmp = new THREE.Vector3();
const telaDe = (y, x = 0) => c3d.projetar(vTmp.set(x, y, 0)).y;

// fases do céu pela altura da câmera (em blocos): dia → pôr do sol → noite → espaço → galáxia.
// Cada troca fica centrada no limite da zona do HUD (ZONAS: 30, 60, 100, 200), então o texto bate com o céu.
const FASES = [
  { h: 0, a: '#1a56c4', b: '#5c9fe8', c: '#d4ecff', luz: '#fff4e0', li: 3.1, hc: '#c4e4ff', hg: '#557a3c', hi: .42, amb: .26, nuv: '#ffffff', est: 0, sol: 1, lua: 0, pl: 0, gal: 0, alto: .16, ly: 15, exp: 1 },
  { h: 25, a: '#1a56c4', b: '#5c9fe8', c: '#d4ecff', luz: '#fff0d8', li: 3.1, hc: '#c4e4ff', hg: '#557a3c', hi: .42, amb: .26, nuv: '#ffffff', est: 0, sol: 1, lua: 0, pl: 0, gal: 0, alto: .13, ly: 14, exp: 1 },
  { h: 35, a: '#2650b8', b: '#7aa2dc', c: '#ffe2b4', luz: '#ffe2bc', li: 3, hc: '#ffe2c4', hg: '#5a6a3c', hi: .44, amb: .28, nuv: '#fff1e0', est: 0, sol: 1, lua: 0, pl: 0, gal: 0, alto: .09, ly: 11, exp: 1 },
  { h: 46, a: '#36378e', b: '#c06c98', c: '#ffa058', luz: '#ffac6c', li: 2.7, hc: '#ffbe94', hg: '#46304e', hi: .5, amb: .34, nuv: '#ffc2a2', est: .05, sol: 1, lua: 0, pl: 0, gal: 0, alto: .035, ly: 7, exp: 1.05 },
  { h: 56, a: '#1b1652', b: '#5e2a68', c: '#d84c5a', luz: '#ff8c74', li: 2.1, hc: '#c48ab0', hg: '#2a1a3a', hi: .55, amb: .38, nuv: '#b98096', est: .12, sol: .45, lua: 0, pl: 0, gal: 0, alto: -.012, ly: 9, exp: 1.08 },
  { h: 64, a: '#03051a', b: '#0b1244', c: '#242e70', luz: '#b4c4ff', li: 1.8, hc: '#6a78ff', hg: '#140e2a', hi: .55, amb: .42, nuv: '#4e5890', est: 1, sol: 0, lua: 1, pl: 0, gal: 0, alto: -.2, ly: 15, exp: 1.12 },
  { h: 104, a: '#000002', b: '#020208', c: '#070a1c', luz: '#ffffff', li: 2.5, hc: '#4a5aa8', hg: '#06060c', hi: .45, amb: .4, nuv: '#30364e', est: 1, sol: 0, lua: .15, pl: 1, gal: .2, alto: -.2, ly: 13, exp: 1.12 },
  { h: 200, a: '#0a0322', b: '#1a0a3a', c: '#3a1260', luz: '#eadcff', li: 2.3, hc: '#9a6cff', hg: '#1a0a30', hi: .55, amb: .45, nuv: '#30244e', est: 1, sol: 0, lua: 0, pl: .45, gal: 1, alto: -.2, ly: 13, exp: 1.12 }
];
const CORES_FASE = ['a', 'b', 'c', 'luz', 'hc', 'hg', 'nuv'];
const NUMS_FASE = ['li', 'hi', 'amb', 'est', 'sol', 'lua', 'pl', 'gal', 'alto', 'ly', 'exp'];
for (const f of FASES) for (const k of CORES_FASE) f[k] = new THREE.Color(f[k]);
const fase = Object.fromEntries([...CORES_FASE.map(k => [k, new THREE.Color()]), ...NUMS_FASE.map(k => [k, 0])]);
function misturarFase(hb) {
  let i = 1;
  while (i < FASES.length - 1 && hb > FASES[i].h) i++;
  const p = FASES[i - 1], q = FASES[i], k = limitar((hb - p.h) / (q.h - p.h), 0, 1);
  for (const c of CORES_FASE) fase[c].lerpColors(p[c], q[c], k);
  for (const n of NUMS_FASE) fase[n] = p[n] + (q[n] - p[n]) * k;
}

/* ---------- céu (acompanha a câmera, como coisas muito distantes) ---------- */

const ceu = new THREE.Group();
cena.add(ceu);
const brilhoMat = (textura, cor = '#fff', aditivo = true) => new THREE.SpriteMaterial({
  map: textura, color: cor, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending
});
function radial(paradas, tam = 256) {
  return texturaCanvas(tam, tam, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (const [k, c] of paradas) g.addColorStop(k, c);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  }).textura;
}
// posição no céu: dx (lado, ~0,2 = beira da tela), alto (seno da elevação; a faixa visível sob o placar vai de -0,07 a 0,05), longe.
// O grupo do céu gira junto com a câmera, então os astros ficam sempre no quadro.
const noCeu = (obj, dx, alto, longe) => obj.position.set(dx, alto, -1).normalize().multiplyScalar(longe);

let cupula = null, estrelas = null, solDisco = null, lua = null, planeta = null, galaxia = null, cadentes = [], nebulosas = [], camadasNuvens = [];
if (!transparente) {
  cupula = ceuDegrade(c3d, { cores: ['#1a56c4', '#5c9fe8', '#d4ecff'] });
  cupula.renderOrder = -10;
  ceu.add(cupula);

  // estrelas que piscam (um único Points com shader); a maioria na frente da câmera, onde aparecem
  const N = 1800, pos = new Float32Array(N * 3), fases = new Float32Array(N), tams = new Float32Array(N);
  const pr = renderer.getPixelRatio();
  for (let i = 0; i < N; i++) {
    if (i < 1500) vTmp.set(r(-.5, .5), r(-.42, .3), -1);
    else vTmp.set(r(-1, 1), r(-.4, 1), r(-1, 1));
    vTmp.normalize().multiplyScalar(600);
    pos.set([vTmp.x, vTmp.y, vTmp.z], i * 3);
    fases[i] = r(0, 6.3);
    tams[i] = (Math.random() < .08 ? r(4, 6) : r(1.6, 3.4)) * pr * 1.4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('fase', new THREE.BufferAttribute(fases, 1));
  g.setAttribute('tam', new THREE.BufferAttribute(tams, 1));
  estrelas = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { tempo: { value: 0 }, alfa: { value: 0 } },
    vertexShader: `attribute float fase; attribute float tam; uniform float tempo; uniform float alfa; varying float a;
      void main(){ a = alfa * (.55 + .45 * sin(tempo * 2.2 + fase)); gl_PointSize = tam; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying float a; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vec3(1., .97, .92), a * smoothstep(.5, .05, d)); }`
  }));
  estrelas.frustumCulled = false;
  estrelas.renderOrder = -9;
  ceu.add(estrelas);

  // sol com halo
  solDisco = new THREE.Sprite(brilhoMat(radial([[0, '#fff'], [.13, '#fffbe8'], [.2, 'rgba(255,236,190,.85)'], [.34, 'rgba(255,190,110,.32)'], [.6, 'rgba(255,150,80,.08)'], [1, 'rgba(0,0,0,0)']])));
  solDisco.scale.setScalar(80);
  solDisco.renderOrder = -8;
  ceu.add(solDisco);

  // lua com crateras e brilho
  lua = new THREE.Sprite(brilhoMat(texturaCanvas(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
    g.addColorStop(0, 'rgba(200,210,255,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    const d = ctx.createRadialGradient(110, 110, 8, 128, 128, 56);
    d.addColorStop(0, '#ffffff'); d.addColorStop(1, '#d8d4ee');
    ctx.fillStyle = d; ctx.beginPath(); ctx.arc(128, 128, 54, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(150,145,190,.45)';
    for (const [x, y, rr] of [[112, 112, 12], [146, 136, 9], [122, 152, 7], [150, 106, 6], [100, 140, 5]]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill(); }
  }).textura, '#fff', false));
  lua.scale.setScalar(52);
  lua.renderOrder = -8;
  noCeu(lua, -.13, .025, 520);
  ceu.add(lua);

  // planeta com anel (esfera iluminada pelo sol da cena)
  planeta = new THREE.Group();
  const texPl = texturaCanvas(512, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    [['#ffc9a8', 0], ['#e7779a', .25], ['#b06bff', .45], ['#ffd6b0', .55], ['#c45cd8', .7], ['#6a2cb8', 1]].forEach(([c, k]) => g.addColorStop(k, c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * .12})`; ctx.fillRect(0, Math.random() * h, w, 1 + Math.random() * 6); }
  }).textura;
  const matPl = new THREE.MeshStandardMaterial({ map: texPl, roughness: .85, fog: false, transparent: true, emissive: '#3a1050', emissiveIntensity: .5 });
  planeta.add(new THREE.Mesh(new THREE.SphereGeometry(20, 48, 32), matPl));
  const texAnel = texturaCanvas(512, 512, (ctx) => {
    for (let k = 0; k < 60; k++) {
      const rr = 256 * (.6 + .4 * k / 60);
      ctx.strokeStyle = `rgba(${200 + Math.random() * 55},${170 + Math.random() * 60},${120 + Math.random() * 80},${.25 + Math.random() * .6})`;
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(256, 256, rr - 2, 0, 7); ctx.stroke();
    }
  }).textura;
  const anel = new THREE.Mesh(new THREE.RingGeometry(27, 46, 96, 1),
    new THREE.MeshStandardMaterial({ map: texAnel, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false, roughness: .8, emissive: '#ffd9a0', emissiveIntensity: .25, emissiveMap: texAnel }));
  anel.rotation.x = -1.2;
  planeta.add(anel);
  planeta.rotation.z = .35;
  noCeu(planeta, .13, -.01, 380);
  ceu.add(planeta);

  // galáxia em espiral e nebulosas
  galaxia = new THREE.Sprite(brilhoMat(texturaCanvas(512, 512, (ctx) => {
    const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    g.addColorStop(0, 'rgba(255,240,220,1)'); g.addColorStop(.12, 'rgba(255,170,220,.6)'); g.addColorStop(.5, 'rgba(120,80,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
    for (let braco = 0; braco < 2; braco++) for (let i = 0; i < 900; i++) {
      const k = i / 900, ang = braco * Math.PI + k * 9, raio = 18 + k * 220;
      const x = 256 + Math.cos(ang) * raio + r(-14, 14) * k, y = 256 + Math.sin(ang) * raio * .55 + r(-10, 10) * k;
      ctx.fillStyle = k < .3 ? 'rgba(255,220,240,.5)' : Math.random() < .5 ? 'rgba(160,140,255,.45)' : 'rgba(255,120,200,.4)';
      ctx.fillRect(x, y, 2 + Math.random() * 2, 2 + Math.random() * 2);
    }
  }).textura));
  galaxia.scale.set(150, 150, 1);
  galaxia.material.rotation = -.4;
  galaxia.renderOrder = -8;
  noCeu(galaxia, -.06, .08, 480);
  ceu.add(galaxia);
  const texNeb = radial([[0, 'rgba(255,255,255,.9)'], [.4, 'rgba(255,255,255,.35)'], [1, 'rgba(0,0,0,0)']], 128);
  for (const [dx, alto, cor, tam] of [[.14, .03, '#ff3d7f', 230], [-.15, -.03, '#5b8cff', 260], [.02, .1, '#7c5cff', 220]]) {
    const n = new THREE.Sprite(brilhoMat(texNeb, cor));
    n.scale.set(tam, tam * .7, 1);
    n.renderOrder = -8;
    noCeu(n, dx, alto, 500);
    ceu.add(n);
    nebulosas.push(n);
  }

  // estrelas cadentes
  const texRisco = texturaCanvas(256, 16, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.85, 'rgba(255,255,255,.9)'); g.addColorStop(1, '#fff');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(128, 8, 128, 4, 0, 0, 7); ctx.fill();
  }).textura;
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Sprite(brilhoMat(texRisco));
    s.scale.set(70, 2.2, 1);
    s.visible = false;
    s.userData = { vida: 0, v: new THREE.Vector3() };
    ceu.add(s);
    cadentes.push(s);
  }

  // nuvens fofas atrás da torre, em várias alturas (passam pela câmera enquanto ela sobe)
  for (const opc of [
    { qtd: 16, area: [-110, 110], altura: [4, 70], z: [-110, -40], vento: .9, escala: 1.7 },
    { qtd: 8, area: [-45, 45], altura: [6, 62], z: [-30, -16], vento: 1.3, escala: 1 }
  ]) {
    const grupo = nuvens(c3d, opc);
    const m = grupo.children[0].material;
    m.emissiveIntensity = .92;
    m.toneMapped = false;   // nuvem branca de verdade, sem o tom acinzentado do tone mapping
    m.transparent = true;   // para sumir aos poucos na subida para o espaço
    camadasNuvens.push({ grupo, m });
  }
}

/* ---------- terreno: morro gramado, árvores e laje de concreto ---------- */

const terreno = new THREE.Group();
cena.add(terreno);
const MORROS = [[-45, -70, 12, 22], [30, -95, 17, 28], [85, -60, 10, 20], [-100, -120, 20, 36], [0, -160, 16, 40],
  [125, -130, 19, 30], [-70, -32, 5, 14], [62, -28, 4.5, 12], [-150, -40, 12, 30], [160, -30, 10, 28]];
function alturaChao(x, z) {
  const d = Math.hypot(x, z);
  let y = -3.4 + 3.4 * (d < 4.2 ? 1 : Math.exp(-((d - 4.2) ** 2) / 110));
  for (const [mx, mz, mh, mr] of MORROS) y += mh * Math.exp(-((x - mx) ** 2 + (z - mz) ** 2) / (mr * mr));
  y += (Math.sin(x * .13) * Math.cos(z * .11) + Math.sin(x * .05 + z * .07)) * .4 * (1 - Math.exp(-(d * d) / 260));
  return y;
}
if (!transparente) {
  // malha com mais vértices perto da torre (espaçamento cresce para longe)
  const g = new THREE.PlaneGeometry(2, 2, 120, 120);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  const estica = (u) => Math.sign(u) * Math.abs(u) ** 2.1 * 360;
  for (let i = 0; i < p.count; i++) {
    const x = estica(p.getX(i)), z = estica(p.getZ(i));
    p.setXYZ(i, x, alturaChao(x, z), z);
    uv.setXY(i, x / 720 + .5, -z / 720 + .5);
  }
  g.computeVertexNormals();
  const grama = texturaMaterial('grama', { repetir: [110, 110] });
  const chaoM = malha(g, material('#ffffff', { mapa: grama.mapa, relevo: grama.relevo, escalaRelevo: .5, rugosidade: .95 }), { sombra: false });
  terreno.add(chaoM);

  // árvores: tronco, pinheiros e copas redondas (InstancedMesh, poucas chamadas)
  const geoTronco = new THREE.CylinderGeometry(.1, .16, 1.3, 7).translate(0, .65, 0);
  const geoPinho = mergeGeometries([new THREE.ConeGeometry(1, 1.9, 10).translate(0, .95, 0), new THREE.ConeGeometry(.74, 1.5, 10).translate(0, 1.85, 0),
    new THREE.ConeGeometry(.46, 1.1, 10).translate(0, 2.6, 0)]);
  const geoCopa = mergeGeometries([new THREE.IcosahedronGeometry(1, 2), new THREE.IcosahedronGeometry(.75, 2).translate(.6, -.2, .2),
    new THREE.IcosahedronGeometry(.7, 2).translate(-.55, -.15, -.2), new THREE.IcosahedronGeometry(.6, 2).translate(0, .5, -.1)]);
  const ARVORES = [[-7.2, -3, .95, 1], [-8.4, -7.2, 1.2, 0], [-4.6, -9.6, .9, 1], [7.4, -3.4, .9, 0], [8.8, -7.4, 1.15, 1], [5, -10.4, 1, 0],
    [-10.6, 1.4, 1.1, 1], [11, 1, 1, 1], [-12, -8.4, 1.4, 0], [12.6, -9.4, 1.5, 0], [-2.6, -12.5, 1.2, 0], [2.4, -14, 1, 1],
    [-15, -3, 1.3, 1], [15.6, -2.4, 1.2, 0], [-7.8, 4.6, 1, 0], [8.4, 4.8, 1.1, 1], [-18, -12, 1.6, 0], [18.5, -13, 1.5, 1],
    [-24, -20, 1.8, 0], [-14, -22, 1.6, 1], [-5, -24, 1.7, 0], [6, -21, 1.5, 0], [16, -24, 1.8, 1], [26, -18, 1.7, 0],
    [-30, -8, 1.6, 1], [31, -6, 1.6, 0], [-20, 6, 1.4, 0], [21, 7, 1.4, 1], [-36, -30, 2, 0], [38, -32, 2, 0], [0, -34, 2, 1], [-12, -40, 2, 0], [14, -42, 2.2, 0]];
  const nPinho = ARVORES.filter(a => !a[3]).length, nCopa = ARVORES.length - nPinho;
  const MOITAS = [[-2.9, 2.2, .45], [-3.4, 1.4, .35], [3.2, 2.4, .5], [3.8, 1.5, .32], [-4.6, -1, .5], [4.8, -.6, .45], [-1.8, -3.4, .4], [2, -3.6, .42]];
  const matArvore = material('#ffffff', { rugosidade: .85 });
  const troncos = new THREE.InstancedMesh(geoTronco, material('#6b4426', { rugosidade: .9 }), ARVORES.length);
  const pinhos = new THREE.InstancedMesh(geoPinho, matArvore, nPinho);
  const copas = new THREE.InstancedMesh(geoCopa, matArvore, nCopa + MOITAS.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), cor = new THREE.Color();
  const VERDES = ['#2f8a3e', '#3f9e45', '#277a3a', '#4cae4a', '#1f6e3a', '#5aa83c'];
  let ip = 0, ic = 0;
  ARVORES.forEach(([x, z, e, tipo], i) => {
    const y = alturaChao(x, z) - .05;
    q.setFromAxisAngle(vTmp.set(0, 1, 0), i * 1.7);
    troncos.setMatrixAt(i, m4.compose(vTmp.set(x, y, z), q, s.set(e, e, e)));
    cor.set(VERDES[i % VERDES.length]);
    if (tipo === 0) { pinhos.setMatrixAt(ip, m4.compose(vTmp.set(x, y + 1 * e, z), q, s.set(e, e, e))); pinhos.setColorAt(ip++, cor); }
    else { copas.setMatrixAt(ic, m4.compose(vTmp.set(x, y + 2.1 * e, z), q, s.set(e * 1.05, e * .95, e * 1.05))); copas.setColorAt(ic++, cor); }
  });
  MOITAS.forEach(([x, z, e], i) => {
    q.setFromAxisAngle(vTmp.set(0, 1, 0), i * 2.3);
    copas.setMatrixAt(ic, m4.compose(vTmp.set(x, alturaChao(x, z) + e * .45, z), q, s.set(e, e * .8, e)));
    copas.setColorAt(ic++, cor.set(VERDES[(i + 2) % VERDES.length]));
  });
  for (const im of [troncos, pinhos, copas]) { im.castShadow = true; im.receiveShadow = true; terreno.add(im); }

  // cones de obra perto da base
  const CONES = [[-3.1, 1.9], [3.3, 1.7], [-2.2, 2.6]];
  const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(.2, .62, 16).translate(0, .37, 0), material('#ff6a1a', { rugosidade: .35, verniz: .6 }), CONES.length);
  const pes = new THREE.InstancedMesh(new THREE.BoxGeometry(.42, .06, .42).translate(0, .03, 0), material('#222', { rugosidade: .6 }), CONES.length);
  CONES.forEach(([x, z], i) => {
    m4.makeTranslation(x, alturaChao(x, z), z);
    cones.setMatrixAt(i, m4); pes.setMatrixAt(i, m4);
  });
  for (const im of [cones, pes]) { im.castShadow = true; im.receiveShadow = true; terreno.add(im); }

  // caminho de terra até a obra
  const terra = texturaMaterial('terra', { repetir: [1, 7], tamanho: 256, semente: 9 });
  const gc = new THREE.PlaneGeometry(1.7, 15, 2, 30).rotateX(-Math.PI / 2);
  const pc = gc.attributes.position;
  for (let i = 0; i < pc.count; i++) {
    const z = pc.getZ(i) + 9.4, x = pc.getX(i) + Math.sin(z * .35) * .5 + .3;
    pc.setXYZ(i, x, alturaChao(x, z) + .035, z);
  }
  gc.computeVertexNormals();
  terreno.add(malha(gc, material('#ffffff', { mapa: terra.mapa, relevo: terra.relevo, escalaRelevo: .8, rugosidade: 1 }), { sombra: false }));

  // palete de madeira com tijolos empilhados
  const palete = new THREE.Group();
  const madeiraP = texturaMaterial('madeira', { repetir: [1, 1], tamanho: 256, semente: 3 });
  palete.add(malha(caixa(1.3, .16, 1.05, .02), material('#ffffff', { mapa: madeiraP.mapa, rugosidade: .8 })));
  palete.children[0].position.y = .08;
  const tijolos = new THREE.InstancedMesh(caixa(.56, .17, .26, .025), material('#b4552f', { rugosidade: .8 }), 26);
  let n = 0;
  for (let camada = 0; camada < 4; camada++) for (let i = 0; i < (camada === 3 ? 2 : 8); i++) {
    const giro = camada % 2, a = i % 2, b = Math.floor(i / 2);
    const x = giro ? -.42 + b * .28 : -.29 + a * .58, z = giro ? -.29 + a * .58 : -.39 + b * .26;
    q.setFromAxisAngle(vTmp.set(0, 1, 0), giro ? Math.PI / 2 : 0);
    tijolos.setMatrixAt(n, m4.compose(vTmp.set(x, .25 + camada * .175, z), q, s.set(1, 1, 1)));
    tijolos.setColorAt(n, cor.setHex(0xffffff).offsetHSL(0, 0, -(n % 3) * .06));
    n++;
  }
  tijolos.count = n;
  tijolos.castShadow = tijolos.receiveShadow = true;
  palete.add(tijolos);
  palete.position.set(2.5, alturaChao(2.5, 3.5), 3.5);
  palete.rotation.y = .35;
  terreno.add(palete);
}

// laje de concreto (fica até no modo transparente, como pedestal da torre)
const concreto = texturaMaterial('concreto', { repetir: [2, 1], tamanho: 256 });
const matConcreto = material('#ffffff', { mapa: concreto.mapa, relevo: concreto.relevo, escalaRelevo: .6, rugosidade: .85 });
const degrau = malha(caixa(5.3, .3, 4, .05), matConcreto);
degrau.position.y = .01;
const laje = malha(caixa(4.4, .42, 3.2, .06), matConcreto);
laje.position.y = .35;
terreno.add(degrau, laje);

/* ---------- blocos ---------- */

const torre = new THREE.Group();
cena.add(torre);
// tijolinhos com rejunte escuro da mesma cor e chanfro claro em cima (cor + relevo)
function texturaTijolo(cor, repetir, semente) {
  const base = new THREE.Color(cor), c = new THREE.Color();
  const desenhar = (relevo) => (ctx, w, h) => {
    let sd = semente;
    const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
    const lin = 8, col = 4, bh = h / lin, bw = w / col, j = 5;
    ctx.fillStyle = relevo ? '#1c1c1c' : `#${c.copy(base).offsetHSL(0, -.12, -.3).getHexString()}`;
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < lin; y++) for (let x = -1; x <= col; x++) {
      const x0 = x * bw + (y % 2) * bw / 2 + j / 2, y0 = y * bh + j / 2, ww = bw - j, hh = bh - j;
      const var_ = (rnd() - .5) * .1;
      const tom = (dl) => relevo ? `hsl(0 0% ${Math.round(72 + dl * 160)}%)` : `#${c.copy(base).offsetHSL((rnd() - .5) * .015, (rnd() - .5) * .06, var_ + dl).getHexString()}`;
      ctx.fillStyle = tom(0); ctx.fillRect(x0, y0, ww, hh);
      ctx.fillStyle = tom(.09); ctx.fillRect(x0, y0, ww, hh * .2);
      ctx.fillStyle = tom(-.07); ctx.fillRect(x0, y0 + hh * .82, ww, hh * .18);
    }
    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)';
      ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  };
  return {
    mapa: texturaCanvas(256, 256, desenhar(false), { repetir }).textura,
    relevo: texturaCanvas(256, 256, desenhar(true), { repetir, cores: false }).textura
  };
}
// sombra de contato: a luz ambiente escurece perto das bordas de cima e de baixo de cada bloco (onde encosta no vizinho)
const texContato = texturaCanvas(4, 128, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  [[0, '#3c3c3c'], [.17, '#ffffff'], [.85, '#ffffff'], [1, '#5a5a5a']].forEach(([k, c]) => g.addColorStop(k, c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}, { cores: false }).textura;
const matBlocos = CORES.map((cor, i) => {
  const tex = texturaTijolo(cor, [2, .5], 3 + i);
  const m = material('#ffffff', { mapa: tex.mapa, relevo: tex.relevo, escalaRelevo: 1.2, rugosidade: .45, verniz: .35 });
  m.aoMap = texContato;
  return m;
});
const texOuro = texturaTijolo('#ffc21a', [1.6, 1.4], 21);
const matOuro = material('#ffffff', { mapa: texOuro.mapa, relevo: texOuro.relevo, escalaRelevo: 1.2, metal: .75, rugosidade: .22, verniz: .7 });
matOuro.envMapIntensity = 2.6;

// placas com o nome de quem colocou: texturas recicladas (sem criar textura nova a cada bloco)
const geoPlaca = new THREE.PlaneGeometry(1, 1);
const placasLivres = [];
function darPlaca(b) {
  const p = placasLivres.pop() ?? (() => {
    const tex = texturaCanvas(512, 96, () => {});
    const m = new THREE.Mesh(geoPlaca, new THREE.MeshStandardMaterial({ map: tex.textura, emissiveMap: tex.textura, emissive: '#ffffff',
      emissiveIntensity: .45, transparent: true, depthWrite: false, roughness: .5, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.receiveShadow = true;
    m.renderOrder = 2;
    return { tex, m };
  })();
  const nome = String(b.quem ?? '').slice(0, 18);
  p.tex.atualizar((ctx, w, h) => textoJogo(ctx, nome, w / 2, h / 2 + 2, { tamanho: 70, larguraMax: w - 28, espessura: .24 }));
  const larg = b.gigante ? 3.1 : b.w - .25;
  p.m.scale.set(larg, larg * 96 / 512, 1);
  p.m.position.set(0, b.gigante ? -b.h * .26 : 0, b.p / 2 + .02);
  b.malha.add(p.m);
  b.placa = p;
}
function devolverPlaca(p) {
  if (!p) return;
  p.m.removeFromParent();
  placasLivres.push(p);
}

// "+5" em relevo dourado no bloco gigante (um material só para todos)
const matMais = new THREE.MeshStandardMaterial({
  map: texturaCanvas(256, 160, (ctx, w, h) => textoJogo(ctx, `+${GIGANTE}`, w / 2, h / 2, { tamanho: 130, espessura: .2 })).textura,
  transparent: true, depthWrite: false, roughness: .4, emissive: '#ffffff', emissiveIntensity: .25, polygonOffset: true, polygonOffsetFactor: -2
});
matMais.emissiveMap = matMais.map;

const comMalha = new Set();   // blocos que estão com malha na cena
function criarMalha(b) {
  const m = malha(b.gigante ? caixa(GIG.l, b.h, GIG.p, .12) : caixa(b.w, BH, b.p, .07), b.gigante ? matOuro : matBlocos[b.cor]);
  b.malha = m;
  if (b.gigante) {
    const mais = new THREE.Mesh(geoPlaca, matMais);
    mais.scale.set(1.5, .94, 1);
    mais.position.set(0, b.h * .14, GIG.p / 2 + .02);
    mais.renderOrder = 2;
    m.add(mais);
  }
  darPlaca(b);
  torre.add(m);
  comMalha.add(b);
  posicionar(b, 0, 0);
}
function soltarMalha(b) {
  if (!b.malha) return;
  devolverPlaca(b.placa);
  b.placa = null;
  b.malha.removeFromParent();
  b.malha = null;
  comMalha.delete(b);
}
// só os JANELA blocos do alto existem na cena; ao demolir, os de baixo voltam a ganhar malha
function ajustarJanela() {
  const n = blocos.length;
  for (const b of comMalha) if (b.i < n - JANELA || blocos[b.i] !== b) soltarMalha(b);
  for (let i = Math.max(0, n - JANELA); i < n; i++) if (!blocos[i].malha) criarMalha(blocos[i]);
}

// posição com balanço da torre e amasso ao pousar
function posicionar(b, onda, amp) {
  const m = b.malha;
  const frac = ((b.alvo - BASE_Y) / Math.max(1, topo() - BASE_Y)) ** 2;
  const esmaga = b.amasso ? Math.sin(b.amasso * Math.PI) * .2 * (b.amasso > .5 ? 1 : .5) : 0;
  const estica = b.pousou ? 0 : .06;
  const sy = 1 - esmaga + estica, sxz = 1 + esmaga * .6 - estica * .5;
  m.scale.set(sxz, sy, sxz);
  m.position.set(b.x + (b.pousou ? onda * amp * frac : 0), b.y + b.h * sy / 2, b.z);
  m.rotation.z = b.pousou ? -onda * .03 * frac : 0;
}

// "+1" que sobe do bloco (sprites reaproveitados, uma textura para todos)
const texMais1 = texturaCanvas(256, 128, (ctx, w, h) => textoJogo(ctx, '+1', w / 2, h / 2, { tamanho: 100, espessura: .22 })).textura;
const mais1 = Array.from({ length: 8 }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texMais1, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(1.1, .55, 1);
  s.visible = false;
  s.renderOrder = 12;
  s.userData.vida = 0;
  cena.add(s);
  return s;
});
let proxMais1 = 0;
function mostrarMais1(b) {
  const s = mais1[proxMais1++ % mais1.length];
  s.material.color.set(CORES[b.cor] ?? '#ffd23f');
  s.position.set(b.x + r(.7, 1.2), b.alvo + b.h + .35, .6);
  s.userData.vida = 1;
  s.visible = true;
}

// bandeira tremulando no topo
const bandeira = new THREE.Group();
{
  const mastro = malha(new THREE.CylinderGeometry(.035, .04, 1.5, 8).translate(0, .75, 0), material('#e4e8f5', { metal: .8, rugosidade: .3 }));
  const g = new THREE.PlaneGeometry(.95, .58, 12, 4).translate(.475, 1.18, 0);
  const pano = malha(g, material('#ff3d7f', { rugosidade: .75, lados: THREE.DoubleSide, brilho: .4 }));
  pano.userData.base = Float32Array.from(g.attributes.position.array);
  bandeira.add(mastro, pano);
  bandeira.userData.pano = pano;
  cena.add(bandeira);
}
function tremularBandeira() {
  const pano = bandeira.userData.pano, p = pano.geometry.attributes.position, base = pano.userData.base;
  for (let i = 0; i < p.count; i++) {
    const x = base[i * 3];
    p.setZ(i, Math.sin(x * 6 - t * 9) * .17 * x + Math.sin(base[i * 3 + 1] * 5 + t * 4) * .04 * x);
    p.setY(i, base[i * 3 + 1] - x * x * .06);
  }
  p.needsUpdate = true;
  pano.geometry.computeVertexNormals();
}

// anel dourado na altura do recorde
const anelRec = new THREE.Mesh(new THREE.TorusGeometry(2.35, .045, 8, 64),
  material('#ffd23f', { metal: .6, rugosidade: .3, emissivo: '#ffb800', intensidadeEmissiva: 1.4 }));
anelRec.rotation.x = Math.PI / 2;
const rotRec = rotulo('RECORDE', { cor: '#ffd23f', altura: .62 });
cena.add(anelRec, rotRec);
let rotRecValor = -1;   // valor desenhado no rótulo (a textura só é refeita quando ele aparece)
function marcarRecorde() {
  const y = BASE_Y + recorde * BH;
  anelRec.position.set(0, y, 0);
  rotRec.position.set(-1.2, y + .45, 1.8);
}
marcarRecorde();

// ondas de choque (anéis que crescem no impacto)
const ondas = Array.from({ length: 3 }, () => {
  const o = new THREE.Mesh(new THREE.RingGeometry(.84, 1, 64), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  o.rotation.x = -Math.PI / 2;
  o.visible = false;
  o.userData.vida = 0;
  cena.add(o);
  return o;
});
function onda(x, y, z, raio = 1, vel = 9) {
  const o = ondas.find(o => o.userData.vida <= 0) ?? ondas[0];
  o.position.set(x, y, z);
  o.scale.setScalar(raio);
  Object.assign(o.userData, { vida: 1, vel });
  o.visible = true;
}

/* ---------- bola de demolição e martelo ---------- */

const L = 7.4, RB = .95;
const bola = new THREE.Group();     // pivô (no alto, fora da tela)
const braco = new THREE.Group();    // gira em z (pêndulo)
bola.add(braco);
{
  const elos = [];
  for (let k = -50; k * .24 < L - .3; k++) {   // sobe bem além do pivô para a ponta nunca aparecer
    const g = new THREE.TorusGeometry(.13, .042, 6, 14);
    g.scale(1, 1.45, 1);
    if (k % 2) g.rotateY(Math.PI / 2);
    g.translate(0, -k * .24, 0);
    elos.push(g);
  }
  const matElo = material('#4a4f5c', { metal: 1, rugosidade: .35 });
  const corrente = malha(mergeGeometries(elos), matElo);
  const argola = malha(new THREE.CylinderGeometry(.16, .22, .34, 16).translate(0, -L + .08, 0), matElo);
  const esfera = malha(new THREE.SphereGeometry(RB, 40, 28), material('#596070', { metal: 1, rugosidade: .3, verniz: .3 }));
  esfera.position.y = -L - RB + .1;
  braco.add(corrente, argola, esfera);
  bola.userData.esfera = esfera;
}
const rotBola = rotulo('', { cor: '#fff', altura: .62 });
bola.add(rotBola);
bola.visible = false;
cena.add(bola);

const martelo = new THREE.Group();  // pivô no punho; rotation.z = 0 é o golpe (cabeça para baixo)
{
  const madeira = texturaMaterial('madeira', { repetir: [1, 3], tamanho: 256, semente: 5 });
  const cabo = malha(new THREE.CylinderGeometry(.15, .19, 4.6, 16).rotateZ(Math.PI / 2).translate(-2.3, 0, 0),
    material('#ffffff', { mapa: madeira.mapa, relevo: madeira.relevo, escalaRelevo: .6, rugosidade: .55, verniz: .4 }));
  const punho = malha(new THREE.CylinderGeometry(.21, .21, 1.1, 16).rotateZ(Math.PI / 2).translate(-.6, 0, 0), material('#24262e', { rugosidade: .8 }));
  const aco = material('#d4d8e2', { metal: 1, rugosidade: .22 });
  const cabeca = malha(new THREE.CylinderGeometry(.68, .68, 2.3, 32).translate(-4.7, 0, 0), aco);
  const cinta = material('#ffc23d', { metal: 1, rugosidade: .3 });
  const aros = [-.95, .95].map(y => { const a = malha(new THREE.CylinderGeometry(.72, .72, .16, 32).translate(-4.7, y, 0), cinta); return a; });
  martelo.add(cabo, punho, cabeca, ...aros);
}
const rotMartelo = rotulo('', { cor: '#ffd23f', altura: .68 });
cena.add(rotMartelo);
martelo.visible = false;
rotMartelo.visible = false;
cena.add(martelo);

/* ---------- HUD ---------- */

const ZONAS = [[0, '☀️ DIA'], [30, '🌅 PÔR DO SOL'], [60, '🌙 NOITE'], [100, '🚀 ESPAÇO'], [200, '🪐 GALÁXIA']];
const zonaDe = (h) => ZONAS.reduce((z, [min], i) => (h >= min ? i : z), 0);
const MARCOS = [10, 25, 50, 100, 250, 500, 1000];

// número da altura: conta até o valor novo (sem passar do alvo mesmo com quadros lentos)
// e diminui a fonte a partir de 4 dígitos para não invadir o troféu e o construtor
function contadorAltura(el) {
  let atual = 0, raf = 0;
  const escrever = (n) => {
    const txt = n.toLocaleString('pt-BR');
    if (txt === el.textContent) return;
    el.textContent = txt;
    const dig = String(Math.abs(n)).length;
    el.style.fontSize = dig >= 6 ? '118px' : dig === 5 ? '142px' : dig === 4 ? '178px' : '';
  };
  escrever(0);
  return (alvo) => {
    const de = atual, inicio = performance.now();
    cancelAnimationFrame(raf);
    const passo = () => {
      const k = limitar((performance.now() - inicio) / 450, 0, 1);
      atual = Math.round(de + (alvo - de) * (1 - (1 - k) ** 3));
      escrever(atual);
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    if (alvo !== de) animar(el);
  };
}
const paraAltura = contadorAltura($('altura'));
const combo = criarCombo({ janela: cfg.comboJanela ?? 5000 });
const ranking = criarRanking();
let timerCombo = 0, timerFaixa = 0, timerFesta = 0;
// recorde do troféu: a fonte também diminui com muitos dígitos (a coluna tem 270 px)
function escreverRecorde() {
  const el = $('recorde');
  el.textContent = recorde.toLocaleString('pt-BR');
  const dig = String(recorde).length;
  el.style.fontSize = dig >= 6 ? '56px' : dig === 5 ? '70px' : '';
}
escreverRecorde();
const yTopoTela = () => limitar(telaDe(topo(), topoX) - 90, 660, 1250);
const DESVIO_MARCO = 140;   // o marco sobe isso quando divide a tela com o "GIGANTE!"
let timerGuardar = 0;
// grava o recorde no máximo a cada 2 s (com rajada de rosas ele muda a cada bloco)
function salvarRecorde() {
  if (timerGuardar) return;
  timerGuardar = setTimeout(() => { timerGuardar = 0; guardar('torre:recorde', recorde); }, 2000);
}
addEventListener('pagehide', () => guardar('torre:recorde', recorde));

function faixa(classe, titulo, texto, ms = 2800) {
  document.querySelector('.vencedor')?.remove();
  clearTimeout(timerFaixa);
  const v = document.createElement('div');
  v.className = `vencedor ${classe}`.trim();
  const s = document.createElement('small');
  s.textContent = titulo;
  v.append(s, texto);
  palco.appendChild(v);
  timerFaixa = setTimeout(() => v.remove(), ms);
}

function festejarRecorde(h) {
  faixa('', 'NOVO RECORDE!', `🏆 ${h.toLocaleString('pt-BR')}`);
  part.confete({ area: [-6, 6], altura: camF + 1, z: [-3, 5], qtd: 260 });
  giroExtra = 1;
  tocar('vitoria');
  const caixaRec = $('caixaRec');
  caixaRec.classList.remove('festa'); void caixaRec.offsetWidth; caixaRec.classList.add('festa');
  clearTimeout(timerFesta);
  timerFesta = setTimeout(() => caixaRec.classList.remove('festa'), 3200);
}

// chamada sempre que a pilha muda: número grande, marcos, zona do céu e recorde.
// yGigante: onde o "GIGANTE!" acabou de aparecer (o marco vai para cima dele, sem sobrepor)
function atualizarHud(yGigante = null) {
  const h = altura();
  if (h === alturaHud) return;
  const antes = alturaHud;
  alturaHud = h;
  paraAltura(h);

  if (h > antes) {
    const m = Math.floor(h / 10) * 10;
    if (m > 0 && m > antes) {
      const y = yGigante === null ? yTopoTela() : yGigante - DESVIO_MARCO;
      flutuar(palco, { x: 540, y, texto: `${m} BLOCOS!`, cor: '#3df2c2', tamanho: 84 });
      tocar('combo', m / 10);
    }
  }

  const z = zonaDe(h);
  if (z !== zonaAtual) {
    $('zona').textContent = ZONAS[z][1];
    animar($('zona'));
    if (z > zonaAtual && performance.now() - ultimaZona > 15000 && !document.querySelector('.vencedor')) {
      ultimaZona = performance.now();
      faixa('zona', 'A torre chegou ao', ZONAS[z][1], 2400);
      tocar('virada');
    }
    zonaAtual = z;
  }

  if (h > recorde) {
    if (!festejou && recorde > 0 && performance.now() - ultimaFesta > 20000) {
      ultimaFesta = performance.now();
      festejarRecorde(h);
    }
    festejou = true;
    recorde = h;
    salvarRecorde();
    escreverRecorde();
    animar($('recorde'));
    marcarRecorde();
  } else if (h < recorde) festejou = false;
}

function mostrarConstrutor(ev, fez, cor) {
  const el = $('construtor');
  el.style.setProperty('--cor', cor);
  const quem = document.createElement('span');
  quem.className = 'quem txt-jogo';
  quem.textContent = ev.nome || ev.user || 'alguém';
  const efeito = document.createElement('span');
  efeito.className = 'fez txt-jogo brilho';
  efeito.textContent = fez;
  el.replaceChildren(avatar(ev, 'grande'), quem, efeito);
  animar(el);
}

function mostrarCombo(n, ganho) {
  if (n < 2) return;
  const el = $('combo');
  el.textContent = `COMBO x${n}`;
  el.classList.add('on');
  animar(el);
  clearTimeout(timerCombo);
  timerCombo = setTimeout(() => el.classList.remove('on'), 4000);
  tocar('combo', n);
  if (MARCOS.some(m => n - ganho < m && n >= m)) {
    particulas(palco, { x: 540, y: 510, qtd: 30, forca: 1.4, cores: ['#ffd23f', '#3df2c2', '#fff', '#ff3d7f'] });
    tremer(palco, true);
  }
}

function pintar(destaque = null) {
  const lista = ranking.top(3);
  if (!lista.length) {
    const li = document.createElement('li');
    li.className = 'vazio';
    li.textContent = 'Mande presentes e veja seu nome aqui!';
    $('ranking').replaceChildren(li);
    return;
  }
  pintarRanking($('ranking'), lista, { destaque });
}

/* ---------- regras ---------- */

function soltarBloco(quem, gigante) {
  const vale = gigante ? GIGANTE : 1;
  const alvo = topo();
  const b = { x: r(-.18, .18), z: gigante ? 0 : r(-.07, .07), y: alvo + 7.5, vy: -2, alvo,
    w: gigante ? GIG.l : LARGURAS[Math.floor(Math.random() * LARGURAS.length)], p: gigante ? GIG.p : PROFS[Math.floor(Math.random() * PROFS.length)],
    h: BH * vale, vale, cor: gigante ? -1 : contaCor++ % CORES.length, quem, gigante, pousou: false, amasso: 0, malha: null, placa: null, i: blocos.length };
  blocos.push(b);
  somaAltura += vale;
  ajustarJanela();
}

// blocos sem animação (tecla de teste para ver o céu lá no alto)
function construirJa(n, quem = 'teste') {
  for (let k = 0; k < n; k++) {
    const alvo = topo();
    blocos.push({ x: r(-.18, .18), z: r(-.07, .07), y: alvo, vy: 0, alvo, w: LARGURAS[k % LARGURAS.length], p: PROFS[k % PROFS.length], h: BH, vale: 1,
      cor: contaCor++ % CORES.length, quem, gigante: false, pousou: true, amasso: 0, malha: null, placa: null, i: blocos.length });
    somaAltura++;
  }
  ajustarJanela();
  camF = topo();   // antes do HUD: a festa do recorde solta o confete na altura da câmera
  atualizarHud();
}

function removerTopo(n) {
  const fora = [];
  let tirado = 0;
  while (blocos.length && tirado < n) {
    const b = blocos.pop();
    tirado += b.vale;
    somaAltura -= b.vale;
    fora.push(b);
  }
  return { fora, tirado };
}

// blocos derrubados viram pedaços com física simples; os de baixo (sem malha) só somem
function virarCacos(fora, vel) {
  for (const b of fora) {
    if (!b.malha || cacos.length >= MAX_CACOS) { soltarMalha(b); continue; }
    if (b.gigante) {
      // o gigante racha em 4
      const base = b.malha.position.clone();
      soltarMalha(b);
      for (let k = 0; k < 4; k++) {
        const m = malha(caixa(GIG.l / 2, b.h / 2, GIG.p, .1), matOuro);
        m.position.set(base.x + (k % 2 ? 1 : -1) * GIG.l / 4, base.y + (k < 2 ? -1 : 1) * b.h / 4, 0);
        torre.add(m);
        cacos.push({ m, ...vel(), vida: 2.4, placa: null });
      }
      continue;
    }
    cacos.push({ m: b.malha, ...vel(), vida: 2.4, placa: b.placa });
    comMalha.delete(b);
    b.malha = null;
    b.placa = null;
  }
}

function proximaAcao() {
  const a = fila.shift();
  if (a.acao === 'bloco' || a.acao === 'gigante') {
    soltarBloco(a.quem, a.acao === 'gigante');
    espera = a.acao === 'gigante' ? 0.35 : 0.12;
  } else if (a.acao === 'demolicao') {
    const lado = Math.random() < 0.5 ? -1 : 1;
    const n = DEMOLE * a.n;
    const yBate = Math.max(BASE_Y + BH, topo() - Math.min(n, altura()) * BH / 2);
    anim = { tipo: 'bola', t: 0, n, quem: a.quem, lado, bateu: false, yBate };
    rotBola.userData.trocar(String(a.quem).slice(0, 14));
    bola.visible = true;
  } else if (a.acao === 'martelo') {
    const h = altura();
    anim = { tipo: 'martelo', t: 0, n: h - Math.floor(h / 2 ** a.n), quem: a.quem, bateu: false, yBate: topo() };
    rotMartelo.userData.trocar(String(a.quem).slice(0, 14));
    martelo.visible = rotMartelo.visible = true;
  }
}

function impacto() {
  const a = anim;
  a.bateu = true;
  const { fora, tirado } = removerTopo(a.n);
  if (a.tipo === 'bola') {
    const dir = a.lado;
    virarCacos(fora, () => ({ vx: dir * r(5, 12), vy: r(1, 6), vz: r(-4, 1.5), wx: r(-2, 2), wy: r(-2, 2), wz: -dir * r(2, 5) }));
    const px = -dir * 1.3;
    part.explodir([px, a.yBate, .6], { cores: ['#ffc23d', '#ffffff', '#ff3d7f', '#ffe9a8'], qtd: 50, forca: 7, tamanho: .12, vida: .9 });
    poeira(px, a.yBate - .6, 40);
    onda(px, a.yBate, 0, 1.2, 10);
    c3d.tremer(.55, .5);
  } else {
    virarCacos(fora, () => { const lado = Math.random() < .5 ? -1 : 1; return { vx: lado * r(4, 11), vy: r(2, 7), vz: r(-6, .5), wx: r(-3, 3), wy: r(-2, 2), wz: -lado * r(1, 5) }; });
    part.explodir([0, a.yBate, .6], { cores: ['#ffc23d', '#ffffff', '#3df2c2', '#ff3d7f'], qtd: 80, forca: 10, tamanho: .13, vida: 1.1 });
    poeira(0, a.yBate - .3, 60);
    onda(0, a.yBate, 0, 1.4, 12); onda(0, a.yBate, 0, .4, 7);
    c3d.tremer(1, .7);
    flash = .8;
    tremer(palco, true);
  }
  ajustarJanela();
  tocar('impacto');
  const y = limitar(telaDe(a.yBate) - 60, 640, 1240);
  flutuar(palco, { x: 540, y, texto: tirado ? `−${tirado} 💥` : 'ERROU!', cor: '#ff4d6d', tamanho: tirado >= 10 ? 150 : 120 });
  particulas(palco, { x: 540, y, emoji: a.tipo === 'bola' ? '💥' : '🧱', qtd: 8, forca: 1.2 });
  atualizarHud();
}

function poeira(x, y, qtd) {
  part.explodir([x, y, .4], { cores: ['#e9e2d0', '#cfc6b0', '#b8ad96', '#f6f1e6'], qtd, forca: 3, tamanho: .1, vida: .8, gravidade: -5, subida: .6 });
}

/* ---------- eventos ---------- */

const EFEITO = {
  bloco: () => '+1 BLOCO', gigante: () => `+${GIGANTE} GIGANTE`,
  demolicao: () => `−${DEMOLE} BOLA`, martelo: () => 'MARTELO ½'
};

function aoEvento(ev) {
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao || !EFEITO[acao]) return;
  const q = Math.max(1, Math.min(50, Math.floor(ev.quantidade) || 1));
  const quem = ev.nome || ev.user || 'alguém';
  if (acao === 'bloco' || acao === 'gigante') for (let k = 0; k < q; k++) fila.push({ acao, quem, n: 1 });
  else fila.push({ acao, quem, n: q });
  if (fila.length > MAX_FILA) fila.splice(0, fila.length - MAX_FILA);

  const emoji = emojiDoPresente(ev.presenteNome);
  let efeito;
  if (acao === 'bloco' || acao === 'gigante') {
    const n = acao === 'gigante' ? q * GIGANTE : q;
    efeito = `+${n} ${n === 1 ? 'bloco' : 'blocos'}`;
    ranking.somar(ev, n, { cor: corDoNick(ev.user || quem) });
    pintar(ev.user);
    mostrarCombo(combo.registrar(ev.user || quem, n), n);
    mostrarConstrutor(ev, `+${n} 🧱`, corDoNick(ev.user || quem));
  } else {
    efeito = acao === 'demolicao' ? `💣 −${q * DEMOLE}` : (q > 1 ? `🔨 ×${q}` : '🔨 metade!');
    mostrarConstrutor(ev, efeito, '#ff4d6d');
  }
  particulas(palco, { x: 905, y: 200, emoji, qtd: Math.min(10, 2 + q), forca: 0.8 });
  avisar(html`<span>${emoji} <b>${quem}</b> ${q > 1 ? `${q}× ` : ''}<span class="mais">${efeito}</span></span>`);
}

/* ---------- simulação ---------- */

function atualizar(dt) {
  t += dt;
  espera -= dt;
  if (!anim && espera <= 0 && fila.length) proximaAcao();

  for (let i = Math.max(0, blocos.length - JANELA); i < blocos.length; i++) {
    const b = blocos[i];
    if (!b.pousou) {
      b.vy -= 34 * dt;
      b.y += b.vy * dt;
      if (b.y <= b.alvo) {
        b.y = b.alvo; b.pousou = true; b.amasso = 1;
        poeira(b.x, b.alvo + .05, b.gigante ? 46 : 10);
        if (b.gigante) {
          c3d.tremer(.35, .45);
          onda(b.x, b.alvo + .05, 0, 2, 8);
          tocar('impacto');
          const yG = limitar(telaDe(b.alvo + b.h) - 80, 640 + DESVIO_MARCO, 1250);
          if (!document.querySelector('.vencedor')) flutuar(palco, { x: 540, y: yG, texto: 'GIGANTE!', cor: '#ffd23f', tamanho: 110 });
          atualizarHud(yG);
        } else {
          mostrarMais1(b);
          if (t - ultimoSom > 0.08) { ultimoSom = t; tocar('ponto'); }
          atualizarHud();
        }
      }
    }
    b.amasso = Math.max(0, b.amasso - dt * 3.2);
  }

  if (anim) {
    anim.t += dt;
    const bate = 0.6;
    if (!anim.bateu && anim.t >= bate) impacto();
    if (anim.t > (anim.tipo === 'bola' ? 1.5 : 1.35)) {
      bola.visible = martelo.visible = rotMartelo.visible = false;
      anim = null;
      espera = 0.2;
    }
  }

  for (let i = cacos.length - 1; i >= 0; i--) {
    const c = cacos[i], m = c.m;
    c.vy -= 24 * dt;
    m.position.x += c.vx * dt; m.position.y += c.vy * dt; m.position.z += c.vz * dt;
    m.rotation.x += c.wx * dt; m.rotation.y += c.wy * dt; m.rotation.z += c.wz * dt;
    c.vida -= dt;
    if (c.vida <= 0 || m.position.y < camF - 14) {
      devolverPlaca(c.placa);
      m.removeFromParent();
      cacos.splice(i, 1);
    }
  }

  // a câmera fica no golpe até o impacto e logo depois desce até o novo topo (sem ficar no céu vazio)
  if (!anim || anim.t > .8) camF += (topo() - camF) * Math.min(1, dt * 3);
  flash = Math.max(0, flash - dt * 1.8);
  giroExtra = Math.max(0, giroExtra - dt * .25);
  // bola e martelo: a câmera recua e sobe um pouco para mostrar o golpe inteiro
  foco += ((anim ? 1 : 0) - foco) * Math.min(1, dt * (anim ? 6 : 1.5));
}

/* ---------- desenho 3D (a cada quadro) ---------- */

const alvoCam = new THREE.Vector3();
function desenhar(dt) {
  const h = altura();
  const hb = (camF - BASE_Y) / BH;
  misturarFase(hb);

  // torre balançando: mais no alto, mais com a altura
  const amp = Math.min(.85, h * .011);
  const ondaT = Math.sin(t * 1.3) + .3 * Math.sin(t * 3.1);
  let topoPousado = null;
  for (let i = Math.max(0, blocos.length - JANELA); i < blocos.length; i++) {
    const b = blocos[i];
    if (b.malha) posicionar(b, ondaT, amp);
    if (b.pousou) topoPousado = b;
  }
  if (topoPousado?.malha) {
    const m = topoPousado.malha;
    topoX = m.position.x;
    bandeira.visible = true;
    bandeira.position.set(m.position.x - topoPousado.w / 2 + .35, topoPousado.alvo + topoPousado.h * m.scale.y, -.5);
    bandeira.rotation.z = m.rotation.z;
    tremularBandeira();
  } else {
    topoX = 0;
    bandeira.visible = false;
  }

  // câmera: sobe com o topo e gira devagar em volta da torre
  const ang = .24 + GIRO * Math.sin(t * .09) + giroExtra * Math.sin(giroExtra * Math.PI) * .9;
  const dist = DIST + Math.min(2.5, h * .02) + foco * 5;
  camera.position.set(Math.sin(ang) * dist, camF + 1.3 + foco * 1.6, Math.cos(ang) * dist);
  alvoCam.set(topoX * .5, camF - .35 + foco * 1.4, 0);
  camera.lookAt(alvoCam);
  renderer.toneMappingExposure = fase.exp * (1 + flash * 1.4);

  // sol acompanha o topo (sombra sempre nítida perto da câmera)
  sol.target.position.set(0, camF - 1, 0);
  sol.position.set(12, fase.ly, 7).normalize().multiplyScalar(40).add(sol.target.position);
  sol.color.copy(fase.luz);
  sol.intensity = fase.li;
  hemi.color.copy(fase.hc);
  hemi.groundColor.copy(fase.hg);
  hemi.intensity = fase.hi;
  cena.environmentIntensity = fase.amb;

  // anel e rótulo do recorde só quando a torre está abaixo dele
  // só quando a torre está abaixo dele e o anel aparece abaixo do placar
  const mostraRec = recorde > 0 && h < recorde && !anim && telaDe(anelRec.position.y) > 600;
  anelRec.visible = rotRec.visible = mostraRec;
  if (mostraRec && rotRecValor !== recorde) {
    rotRecValor = recorde;
    rotRec.userData.trocar(`RECORDE ${recorde.toLocaleString('pt-BR')}`);
  }

  for (const s of mais1) {
    if (!s.visible) continue;
    s.userData.vida -= dt * 1.2;
    s.position.y += dt * 1.6;
    s.material.opacity = Math.min(1, s.userData.vida * 2);
    if (s.userData.vida <= 0) s.visible = false;
  }
  for (const o of ondas) {
    if (!o.visible) continue;
    o.userData.vida -= dt * 1.8;
    o.scale.multiplyScalar(1 + o.userData.vel * dt / Math.max(1, o.scale.x));
    o.material.opacity = Math.max(0, o.userData.vida) * .8;
    if (o.userData.vida <= 0) o.visible = false;
  }

  if (anim?.tipo === 'bola') desenharBola();
  else if (anim?.tipo === 'martelo') desenharMartelo();

  if (transparente) return;
  // céu, nuvens, estrelas e astros pela fase
  ceu.position.copy(camera.position);
  ceu.rotation.y = ang;
  const u = cupula.material.uniforms;
  u.a.value.copy(fase.a); u.b.value.copy(fase.b); u.c.value.copy(fase.c);
  cena.fog.color.copy(fase.c);
  const k = limitar((camF - 8) / 28, 0, 1);
  cena.fog.near = 40 - k * 22;
  cena.fog.far = 320 - k * 250;
  terreno.visible = camF < 42;
  // nuvens somem antes do espaço (lá em cima virariam manchas escuras atrás da torre e do planeta)
  const nv = 1 - limitar((hb - 70) / 14, 0, 1);
  for (const { grupo, m } of camadasNuvens) {
    grupo.visible = nv > .01;
    m.color.copy(fase.nuv); m.emissive.copy(fase.nuv);
    m.opacity = nv;
  }
  estrelas.visible = fase.est > .01;
  estrelas.material.uniforms.tempo.value = t;
  estrelas.material.uniforms.alfa.value = fase.est;
  solDisco.visible = fase.sol > .01 && fase.alto > -.06;
  if (solDisco.visible) {
    noCeu(solDisco, .12, fase.alto, 520);
    solDisco.material.color.copy(fase.luz);
    solDisco.material.opacity = fase.sol;
  }
  lua.visible = fase.lua > .01;
  lua.material.opacity = fase.lua;
  const pl = limitar((fase.pl - .55) / .45, 0, 1);   // aparece já perto do espaço
  planeta.visible = pl > .01;
  planeta.children[0].material.opacity = planeta.children[1].material.opacity = pl;
  planeta.rotation.y = t * .05;
  galaxia.visible = fase.gal > .01;
  galaxia.material.opacity = fase.gal;
  galaxia.material.rotation = -.4 + t * .01;
  for (const n of nebulosas) { n.visible = fase.gal > .01; n.material.opacity = fase.gal * .45; }

  // estrelas cadentes à noite
  if (fase.est > .6 && Math.random() < dt * .35) {
    const s = cadentes.find(s => !s.visible);
    if (s) {
      noCeu(s, r(-.15, .2), r(.01, .09), 520);
      const ang = r(.25, .5);
      s.userData.v.set(-Math.cos(ang), -Math.sin(ang), 0).multiplyScalar(r(180, 260));
      s.material.rotation = ang;
      s.userData.vida = 1;
      s.visible = true;
    }
  }
  for (const s of cadentes) {
    if (!s.visible) continue;
    s.userData.vida -= dt * 1.4;
    s.position.addScaledVector(s.userData.v, dt);
    s.material.opacity = Math.max(0, s.userData.vida);
    if (s.userData.vida <= 0) s.visible = false;
  }
}

function desenharBola() {
  const a = anim, s = a.lado;
  const ang = a.t < 0.6 ? -s * 1.35 * Math.cos(Math.PI / 2 * a.t / 0.6) : s * 0.75 * Math.sin(Math.PI / 2 * Math.min(1, (a.t - 0.6) / 0.45));
  const recolhe = Math.max(0, a.t - 1.05);
  bola.position.set(-s * 1.9, a.yBate + L + RB - .1 + recolhe * recolhe * 40, .35);
  braco.rotation.z = ang;
  bola.userData.esfera.rotation.y += .1;
  rotBola.position.set(Math.sin(ang) * (L + RB), -Math.cos(ang) * (L + RB) + RB + .9, .3);
}

// entra do alto já erguido, prepara, golpeia o topo (t = 0,6), quica e sobe sumindo
function desenharMartelo() {
  const a = anim, GX = 4.7, base = a.yBate + 1.15;
  let y, rot, esc = 1;
  if (a.t < .3) {
    const e = 1 - (1 - a.t / .3) ** 3;
    y = base + .4 + (1 - e) * 7; rot = -.55 - (1 - e) * .5;
  } else if (a.t < .45) {
    y = base + .4; rot = -.55 - (a.t - .3) / .15 * .2;
  } else if (a.t < .6) {
    const k = ((a.t - .45) / .15) ** 2;
    y = base + .4 * (1 - k); rot = -.75 * (1 - k);
  } else {
    const d = Math.min(1, (a.t - .6) / .75), sobe = Math.max(0, d - .2) / .8;
    y = base + Math.sin(Math.min(1, d * 4) * Math.PI) * .35 + sobe * sobe * 9;
    rot = -sobe * .9;
    esc = Math.max(.01, 1 - sobe * sobe);
  }
  martelo.position.set(GX, y, .5);
  martelo.rotation.z = rot;
  martelo.scale.setScalar(esc);
  rotMartelo.position.set(GX - 4.7 * Math.cos(rot), y - 4.7 * Math.sin(rot) + 1.8, 1);
  rotMartelo.material.opacity = esc;
}

/* ---------- início ---------- */

for (const [acao, refs] of Object.entries(cfg.acoes ?? {})) {
  if (!EFEITO[acao] || !refs?.length) continue;
  const nomePresente = typeof refs[0] === 'number' ? `#${refs[0]}` : String(refs[0]);
  const chip = document.createElement('div');
  chip.className = 'chip-presente';
  const emoji = document.createElement('span');
  emoji.className = 'emoji';
  emoji.textContent = emojiDoPresente(nomePresente);
  const efeito = document.createElement('span');
  efeito.className = 'efeito ' + (acao === 'bloco' || acao === 'gigante' ? 'bom' : 'ruim');
  efeito.textContent = EFEITO[acao]();
  const nome = document.createElement('span');
  nome.className = 'nome';
  nome.textContent = refs.map(x => (typeof x === 'number' ? '#' + x : x)).join(' / ');
  chip.append(emoji, efeito, nome);
  $('legenda').appendChild(chip);
}
pintar();

function falso(acao, quantidade = 1) {
  const ref = cfg.acoes?.[acao]?.[0];
  return eventoFalso(typeof ref === 'number'
    ? { presenteId: ref, presenteNome: acao, quantidade }
    : { presenteNome: String(ref ?? acao), quantidade });
}

function reiniciar() {
  for (const b of blocos) soltarMalha(b);
  for (const c of cacos) { devolverPlaca(c.placa); c.m.removeFromParent(); }
  blocos = []; cacos = []; fila = []; anim = null; somaAltura = 0;
  bola.visible = martelo.visible = rotMartelo.visible = false;
  combo.zerar();
  atualizarHud();
}

teclas({
  t: () => {
    const rajada = [['bloco', 5], ['bloco', 3], ['gigante', 1], ['bloco', 4], ['demolicao', 1], ['bloco', 5], ['gigante', 1], ['bloco', 2]];
    if (Math.random() < 0.25) rajada.push(['martelo', 1]);
    rajada.forEach(([acao, q], k) => setTimeout(() => aoEvento(falso(acao, q)), k * 220));
  },
  b: () => aoEvento(falso('bloco', 1)),
  g: () => aoEvento(falso('gigante', 1)),
  d: () => aoEvento(falso('demolicao', 1)),
  m: () => aoEvento(falso('martelo', 1)),
  k: () => construirJa(25),   // teste: +25 blocos na hora (para ver o céu mudar)
  r: () => { reiniciar(); avisar('🧱 Torre reiniciada!'); }
});

c3d.aoQuadro((dt) => { atualizar(dt); desenhar(dt); });
conectar(aoEvento);
