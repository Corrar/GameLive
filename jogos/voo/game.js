import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';
import { emojiDoPresente, criarCombo, criarRanking, avatar, animar, particulas,
  flutuar, tremer, pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';
import { criarCena, THREE, material, malha, caixa, mergeGeometries, texturaCanvas, texturaMaterial, nuvens,
  rotulo, rotuloAvatar, criarParticulas, descartar, fontesProntas } from '../kit/cena3d.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
aplicarFundo(cfg.fundo);
escalarPalco(palco);
ligarSom(cfg.som);
const transparente = !cfg.fundo || cfg.fundo === 'transparente';
const cenario = !transparente && cfg.cenario !== false;
const avisar = avisos($('avisos'), { max: 2 });

const META = cfg.meta ?? 1000000;
const DPS = cfg.distanciaPorSegundo ?? 700;
const TURVA = cfg.turvaSegundos ?? 6, CAOS = cfg.caosSegundos ?? 8, FATOR = cfg.caosFator ?? 0.55;
const RAIO = cfg.rosquinhaRaio ?? 180;
const MARCO = cfg.marcoDistancia ?? 100000;
const BONUS_QUEDA = cfg.pontosPorQueda ?? 5;
// a simulação continua em px do palco (1080×1920); a cena 3D converte com S (1 unidade = 100 px)
const W = 1080, CHAO = 1560, BX = 330, R = 30, TETO = 380;
const G = 2500, PULO = -860, VEL = 440, ESPAC = 560, LARG = 170, VAO = 450;
const MIN_C = 740, MAX_C = 1290, MEIO = (MIN_C + MAX_C) / 2;   // vãos entre o HUD e o chão
const PASSO = 1 / 120;
const r = (a, b) => a + Math.random() * (b - a);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.floor(n).toLocaleString('pt-BR');

let t = 0, camX = 0, dist = 0, estado = 'voando', caiuT = 0;
let ave, obst = [], fila = [];
let ultimoX = 0, ultimoCentro = MEIO;
let turvaAte = 0, turvaAutor = null, caosAte = 0, caosAutor = null;
let ruido = 0, ruidoAte = 0, iaEspera = 0, flash = 0, raio = 0;
let voo = 0, quedas = 0, recordeNoInicio = 0, avisouRecorde = false, proximoMarco = MARCO;
let recorde = lembrar('voo:recorde', 0);
if (!Number.isFinite(recorde)) recorde = 0;
let recordeSalvo = recorde;

const ranking = criarRanking();
const combo = criarCombo({ janela: 5000 });
const MARCOS_COMBO = [10, 25, 50, 100];

function reiniciar() {
  estado = 'voando';
  dist = 0;
  obst = [];
  ultimoX = camX + W - 200;
  ultimoCentro = MEIO;
  ave = { y: MEIO, vy: PULO * 0.6, asa: 0, fase: 0, giro: 0, piscaEm: t + r(2, 4) };
  voo++;
  recordeNoInicio = recorde;
  avisouRecorde = false;
  proximoMarco = MARCO;
  $('voo').textContent = `VOO ${voo}`;
  animar($('voo'));
}

/* ---------- mundo ---------- */

const roscaY = (o) => o.y0 + Math.sin(t * 1.9 + o.fase) * o.amp;

function gerar() {
  const esp = fila.shift();
  const caos = t < caosAte;
  if (esp?.tipo === 'rosquinha') {
    obst.push({ tipo: 'rosquinha', x: ultimoX + 620, y0: 1020, amp: 200, fase: r(0, 6), r: RAIO, autor: esp.autor, giro: r(0, 6) });
    ultimoX += 680;
    return;
  }
  const extra = esp?.tipo === 'cano';
  const salto = (Math.random() < 0.5 ? -1 : 1) * (extra ? r(250, 400) : caos ? r(150, 420) : r(0, 300));
  let c = ultimoCentro + salto;
  if (c < MIN_C || c > MAX_C) c = ultimoCentro - salto;
  c = limitar(c, MIN_C, MAX_C);
  ultimoX += extra ? 400 : ESPAC;
  ultimoCentro = c;
  obst.push({ tipo: 'cano', x: ultimoX, centro: c, vao: caos ? VAO * FATOR : VAO, autor: extra ? esp.autor : null });
}

/* ---------- IA ---------- */

function alvoIA() {
  const bx = camX + BX;
  const o = obst.find(o => (o.tipo === 'cano' ? o.x + LARG : o.x + o.r) > bx - R);
  if (!o) return MEIO;
  if (o.tipo === 'cano') return o.centro + Math.min(65, o.vao * 0.15);
  const ry = roscaY(o);
  o.lado ??= ry > o.y0 ? -1 : 1;   // escolhe o lado uma vez: por cima (-1) ou por baixo (1)
  return limitar(ry + o.lado * (o.r + 130), TETO + 100, CHAO - 120);
}

function ia(dt) {
  const turva = t < turvaAte;
  // com visão turva a IA enxerga o vão no lugar errado e reage mais devagar
  if (turva && t > ruidoAte) { ruido = r(-150, 150); ruidoAte = t + 0.5; }
  iaEspera -= dt;
  if (iaEspera > 0) return;
  iaEspera = turva ? 0.12 : 0;
  const alvo = alvoIA() + (turva ? ruido : 0);
  if (ave.y > alvo && ave.vy >= 0) { ave.vy = PULO; ave.asa = 0.35; }
}

/* ---------- colisão e queda ---------- */

function bateRet(cx, cy, x0, y0, x1, y1) {
  const dx = cx - limitar(cx, x0, x1), dy = cy - limitar(cy, y0, y1);
  return dx * dx + dy * dy < R * R;
}

function colisao() {
  const bx = camX + BX, by = ave.y;
  if (by + R > CHAO) return bater(null);
  for (const o of obst) {
    if (o.tipo === 'cano') {
      if (bx + R < o.x || bx - R > o.x + LARG) continue;
      const cima = o.centro - o.vao / 2, baixo = o.centro + o.vao / 2;
      if (bateRet(bx, by, o.x, -2000, o.x + LARG, cima) || bateRet(bx, by, o.x, baixo, o.x + LARG, CHAO)) return bater(o.autor);
    } else if (Math.hypot(bx - o.x, by - roscaY(o)) < o.r * 0.9 + R) return bater(o.autor);
  }
}

function bater(autor) {
  estado = 'caiu';
  caiuT = 0;
  quedas++;
  const quem = autor ?? (t < caosAte ? caosAutor : t < turvaAte ? turvaAutor : null);
  penas.explodir(aveMundo(), 60);
  ave.vy = -720;
  flash = 0.9;
  foco = 1;
  c3d.tremer(0.45, 0.7);
  salvarRecorde();
  tocar('impacto');
  tremer(palco, true);

  $('quedas').textContent = fmt(quedas);
  animar($('quedas'));
  if (quem) {
    const p = ranking.somar(quem, BONUS_QUEDA);
    p.derrubou = (p.derrubou ?? 0) + 1;
    pintar(quem.user);
    flutuar(palco, { x: 540, y: 1090, texto: `+${BONUS_QUEDA} DERRUBOU!`, cor: '#ff3d7f', tamanho: 64 });
  }
  faixa({
    classe: 'queda', cor: '#ff3d7f', grande: quem ? '💥 DERRUBOU!' : '💥 BATEU!',
    pessoa: quem, rotulo: quem ? `aos ${fmt(dist)} m` : `a IA vacilou aos ${fmt(dist)} m`
  });
}

function salvarRecorde() {
  if (recorde !== recordeSalvo) { guardar('voo:recorde', recorde); recordeSalvo = recorde; }
}

function chegouNaMeta() {
  const v = document.createElement('div');
  v.className = 'vencedor';
  const s = document.createElement('small');
  s.textContent = '🏆 A IA chegou na meta!';
  v.append(s, fmt(META) + ' m');
  palco.appendChild(v);
  setTimeout(() => v.remove(), 5000);
  brilhos.confete({ area: [-6, 6], altura: 15, z: [-3, 3], qtd: 260 });
  tocar('vitoria');
  dist = 0;
  proximoMarco = MARCO;
}

/* ---------- conquistas durante o voo ---------- */

function conquistas() {
  if (!avisouRecorde && recordeNoInicio > 0 && dist > recordeNoInicio) {
    avisouRecorde = true;
    flutuar(palco, { x: 540, y: 620, texto: '🏆 NOVO RECORDE!', cor: '#ffd23f', tamanho: 96 });
    particulas(palco, { x: 110, y: 70, qtd: 22, cores: ['#ffd23f', '#fff', '#ffb02e'] });
    brilhos.explodir(aveMundo(), { cores: ['#ffd23f', '#fff6c8', '#ffb02e'], qtd: 40, forca: 5, tamanho: .12 });
    animar($('trofeu'));
    tocar('virada');
  }
  if (dist >= proximoMarco) {
    const mil = proximoMarco / 1000;
    flutuar(palco, { x: 540, y: 600, texto: `${fmt(mil)} MIL!`, cor: '#3df2c2', tamanho: 110 });
    animar($('distBox'));
    tocar('ponto');
    proximoMarco += MARCO;
  }
}

/* ---------- passo da simulação ---------- */

function passo(dt) {
  t += dt;
  if (estado === 'voando') {
    camX += VEL * dt;
    dist += DPS * dt;
    if (dist > recorde) recorde = Math.min(META, dist);
    conquistas();
    if (dist >= META) chegouNaMeta();
    while (ultimoX + ESPAC < camX + W + 300) gerar();
    ia(dt);
    ave.vy = Math.min(ave.vy + G * dt, 1300);
    ave.y += ave.vy * dt;
    if (ave.y < TETO) { ave.y = TETO; ave.vy = Math.max(0, ave.vy); }
    ave.asa = Math.max(0, ave.asa - dt);
    ave.fase += dt * (ave.asa > 0 ? 34 : 11);
    if (t > ave.piscaEm + 0.14) ave.piscaEm = t + r(2, 5);
    // caos aperta os vãos que ainda estão à frente do pássaro
    for (const o of obst) {
      if (o.tipo !== 'cano' || o.x < camX + BX + 80) continue;
      const alvo = t < caosAte ? VAO * FATOR : VAO;
      o.vao += (alvo - o.vao) * Math.min(1, dt * 3);
    }
    colisao();
  } else {
    // queda: o pássaro gira e despenca até o chão
    caiuT += dt;
    ave.vy = Math.min(ave.vy + G * 1.1 * dt, 1600);
    ave.y += ave.vy * dt;
    ave.giro += dt * 9;
    if (ave.y > CHAO - R) { ave.y = CHAO - R; ave.vy = ave.vy > 300 ? -ave.vy * 0.35 : 0; ave.giro *= 0.9; }
    ave.fase += dt * 50;
    if (caiuT > 2.3) reiniciar();
  }
  obst = obst.filter(o => o.x + 400 > camX);
  flash = Math.max(0, flash - dt * 2);
  raio = Math.max(0, raio - dt);
  if (t < caosAte && raio <= 0 && Math.random() < dt * 1.3) raio = 0.18;
}

/* ================= cena 3D ================= */

await fontesProntas();
const S = 0.01;                                   // px do palco → unidades do mundo
const wx = (x) => (x - camX - W / 2) * S;         // x do mundo (câmera fica parada; o mundo anda)
const wy = (y) => (CHAO - y) * S;                 // chão em y = 0, teto em 11,8
const mod = (a, n) => ((a % n) + n) % n;
const enrolar = (x, P) => mod(x + P / 2, P) - P / 2;
const EXPO = 1.12;
const CAM = { pos: [0, 3.5, 26.4], alvo: [0, 5.94, 0], fov: 40 };   // de lado e um pouco de baixo; chão do jogo em y=1560 px

const c3d = criarCena(palco, {
  cfg, fundo: transparente ? null : cfg.fundo, luz: 'por-do-sol', ambiente: false, exposicao: EXPO,
  camera: CAM, sol: { pos: [18, 12, 6], alvo: [-2, 2, -4], alcance: 16 },
  neblina: cenario ? { cor: '#e9927c', perto: 60, longe: 520 } : null
});
const { cena, camera, sol, hemi, renderer } = c3d;
sol.color.set('#ffc49a');
sol.intensity = 3.3;
hemi.color.set('#ffb3a6');
hemi.groundColor.set('#3a2c55');
hemi.intensity = 0.6;

function semente(s) { return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// pinta a geometria inteira com uma cor (para fundir peças num só desenho)
function pintarGeo(geo, cor) {
  const c = new THREE.Color(cor), n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* ---------- céu do entardecer (com sol) e reflexos ---------- */

camera.updateMatrixWorld();
const dirSol = new THREE.Vector3(.42, .08, .5).unproject(camera).sub(camera.position).normalize();
const matCeu = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
  uniforms: {
    sol: { value: dirSol }, mistura: { value: 0 }, clarao: { value: 0 },
    cHoriz: { value: new THREE.Color('#ffd08a') }, cLaranja: { value: new THREE.Color('#ff8f5a') },
    cRosa: { value: new THREE.Color('#d6508f') }, cRoxo: { value: new THREE.Color('#5a2c8c') },
    cTopo: { value: new THREE.Color('#1e1550') }, cMistura: { value: new THREE.Color('#3a1470') }
  },
  vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform vec3 sol, cHoriz, cLaranja, cRosa, cRoxo, cTopo, cMistura; uniform float mistura, clarao; varying vec3 p;
    void main(){
      vec3 d = normalize(p); float h = d.y;
      vec3 col = mix(cHoriz, cLaranja, smoothstep(0., .06, h));
      col = mix(col, cRosa, smoothstep(.05, .13, h));
      col = mix(col, cRoxo, smoothstep(.12, .25, h));
      col = mix(col, cTopo, smoothstep(.24, .4, h));
      col = mix(col, cMistura * (.6 + h), mistura);
      float s = max(dot(d, sol), 0.);
      col += vec3(1., .55, .3) * (pow(s, 10.) * .25 + pow(s, 60.) * .45 + pow(s, 600.) * .8);
      col = mix(col, vec3(1., .97, .86), smoothstep(.9993, .99955, s));
      col += clarao * vec3(.75, .62, 1.);
      gl_FragColor = vec4(col, 1.);
      #include <colorspace_fragment>
    }`
});
if (cenario) {
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), matCeu);
  ceu.renderOrder = -2;
  cena.add(ceu);
  // estrelas aparecendo no alto
  const r1 = semente(3), pos = [];
  for (let i = 0; i < 220; i++) {
    const h = .2 + r1() * .7, a = Math.PI * (.7 + r1() * 1.6), c = Math.sqrt(1 - h * h);
    pos.push(Math.cos(a) * c * 850, h * 850, Math.sin(a) * c * 850);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cena.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff6e8', size: 3, sizeAttenuation: false, fog: false,
    transparent: true, opacity: .75, depthWrite: false })));
}
{ // reflexos do céu do entardecer nos materiais com verniz (canos, pássaro)
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), matCeu));
  const piso = new THREE.Mesh(new THREE.CircleGeometry(100, 24), new THREE.MeshBasicMaterial({ color: '#2c3b2a' }));
  piso.rotation.x = -Math.PI / 2;
  piso.position.y = -2;
  env.add(piso);
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(env, .03, .1, 500).texture;
  cena.environmentIntensity = .55;
  pmrem.dispose();
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  piso.material.dispose();
}

/* ---------- paralaxe: montanhas, cidade, árvores (o mundo inteiro anda; a perspectiva faz a paralaxe) ---------- */

const camadas = [];   // malhas repetidas de período P: duas cópias cobrem toda a largura visível
function camadaRepetida(geo, mat, P) {
  const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
  cena.add(a, b);
  camadas.push({ a, b, P });
}

// cordilheira: relevo periódico em x (senos com ciclos inteiros em P), cume no meio da faixa de profundidade
function cordilheira({ z, prof, P, altura, cor, sem, segX = 150 }) {
  const geo = new THREE.PlaneGeometry(P, prof, segX, 10);
  geo.rotateX(-Math.PI / 2);
  const rr = semente(sem), f = Array.from({ length: 6 }, () => rr() * 6.28);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / P * Math.PI * 2, zz = p.getZ(i) / (prof / 2);
    let h = .5 + .25 * Math.sin(2 * x + f[0]) + .14 * Math.sin(5 * x + f[1]) + .08 * Math.sin(11 * x + f[2])
      + .05 * Math.abs(Math.sin(23 * x + f[3])) + .025 * Math.sin(47 * x + f[4] + zz * 3);
    h *= Math.max(0, 1 - zz * zz) ** .8;
    p.setY(i, Math.max(0, h) * altura - .5);
    p.setZ(i, p.getZ(i) + z);
  }
  geo.computeVertexNormals();
  camadaRepetida(geo, material(cor, { rugosidade: .95 }), P);
}

// textura de fachada (tingida pela cor de cada prédio) e luz das janelas acesas
const CEL = 8;   // 8×8 janelas por textura
const fachada = texturaCanvas(512, 512, (ctx) => {
  ctx.fillStyle = '#d9d2e4'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2500; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * .08})`; ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3); }
  for (let y = 0; y < CEL; y++) {
    ctx.fillStyle = 'rgba(40,30,60,.25)'; ctx.fillRect(0, y * 64 + 58, 512, 6);   // laje entre andares
    for (let x = 0; x < CEL; x++) { ctx.fillStyle = '#262a40'; ctx.fillRect(x * 64 + 16, y * 64 + 12, 32, 40); }
  }
}, { repetir: [1, 1] }).textura;
const luzJanelas = texturaCanvas(512, 512, (ctx) => {
  const rr = semente(21);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < CEL; y++) for (let x = 0; x < CEL; x++) {
    if (rr() > .42) continue;
    const g = ctx.createLinearGradient(0, y * 64 + 12, 0, y * 64 + 52);
    const quente = rr() < .8;
    g.addColorStop(0, quente ? '#ffe2a0' : '#bfe8ff'); g.addColorStop(1, quente ? '#ff9e3d' : '#6fb2ff');
    ctx.fillStyle = g; ctx.fillRect(x * 64 + 16, y * 64 + 12, 32, 40);
  }
}, { repetir: [1, 1] }).textura;

function cidade({ z: [z0, z1], P, alt: [h0, h1], larg: [l0, l1], cores, sem, cel = 1.1 }) {
  const rr = semente(sem), partes = [];
  const uv = (geo, w, h, d) => {
    const a = geo.attributes.uv, ox = Math.floor(rr() * CEL) / CEL, oy = Math.floor(rr() * CEL) / CEL;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) { a.setXY(i, .01, .01); continue; }   // teto e base sem janela
      const lado = f < 2 ? d : w;
      a.setXY(i, a.getX(i) * lado / (cel * CEL) + ox, a.getY(i) * h / (cel * 1.15 * CEL) + oy);
    }
  };
  const semJanela = (geo) => { const a = geo.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, .01, .01); return geo; };
  let x = -P / 2;
  while (x < P / 2 - 1) {
    const w = Math.min(l0 + rr() * (l1 - l0), P / 2 - x), h = h0 + rr() ** 1.6 * (h1 - h0), d = 3 + rr() * 3;
    const zz = z0 + rr() * (z1 - z0), cor = new THREE.Color(cores[Math.floor(rr() * cores.length)]);
    const caixaP = new THREE.BoxGeometry(w, h, d);
    uv(caixaP, w, h, d);
    caixaP.translate(x + w / 2, h / 2, zz);
    partes.push(pintarGeo(caixaP, cor));
    const topo = cor.clone().multiplyScalar(.7);
    if (rr() < .45) { // caixa d'água
      const cx = new THREE.CylinderGeometry(.45, .45, .9, 10);
      cx.translate(x + w * (.25 + rr() * .5), h + .45, zz);
      partes.push(pintarGeo(semJanela(cx), topo));
    }
    if (rr() < .4) { // antena
      const an = new THREE.BoxGeometry(.08, 2 + rr() * 2.5, .08);
      an.translate(x + w * (.2 + rr() * .6), h + an.parameters.height / 2, zz);
      partes.push(pintarGeo(semJanela(an), topo));
    }
    const pl = new THREE.BoxGeometry(w + .2, .25, d + .2);   // platibanda
    pl.translate(x + w / 2, h + .12, zz);
    partes.push(pintarGeo(semJanela(pl), topo));
    x += w + .15 + rr() * 1.2;
  }
  const mat = new THREE.MeshStandardMaterial({ map: fachada, emissiveMap: luzJanelas, emissive: '#ffffff', emissiveIntensity: 1.15,
    vertexColors: true, roughness: .85 });
  camadaRepetida(mergeGeometries(partes), mat, P);
}

// árvores, arbustos e tufos de grama: instâncias reposicionadas a cada quadro (cada uma com seu período)
const instanciados = [];
function espalhar(inst, itens) {
  inst.frustumCulled = false;
  const cor = new THREE.Color();
  itens.forEach((it, i) => inst.setColorAt(i, cor.set(it.cor)));
  instanciados.push({ inst, itens });
  cena.add(inst);
}
const mtx = new THREE.Matrix4(), qtn = new THREE.Quaternion(), eul = new THREE.Euler(), esc = new THREE.Vector3(), pos3 = new THREE.Vector3();

function blobGeo(sem, n = 4) {
  const rr = semente(sem), partes = [];
  for (let k = 0; k < n; k++) {
    const g = new THREE.IcosahedronGeometry(.55 + rr() * .3, 2);
    g.translate((rr() - .5) * .9, (rr() - .3) * .5, (rr() - .5) * .7);
    partes.push(g);
  }
  return mergeGeometries(partes);
}

if (cenario) {
  cordilheira({ z: -265, prof: 60, P: 160, altura: 44, cor: '#8a4a96', sem: 4 });
  cordilheira({ z: -165, prof: 40, P: 100, altura: 22, cor: '#62357a', sem: 9 });
  cidade({ z: [-96, -84], P: 64, alt: [5, 15], larg: [2.6, 5.5], cores: ['#5a4378', '#4a3a6c', '#6b4a7e', '#3f3560'], sem: 5, cel: .95 });
  cidade({ z: [-52, -42], P: 44, alt: [3, 9.5], larg: [2.2, 4.2], cores: ['#43305e', '#38294f', '#4d3566', '#2f2648'], sem: 8, cel: .8 });

  // árvores e arbustos entre a cidade e os canos
  const rr = semente(13), copas = [], troncos = [];
  const verdes = ['#2f6b35', '#3b7d3a', '#2a5e33', '#467f3c', '#356f2f'];
  for (let i = 0; i < 9; i++) { // árvores
    const s = .55 + rr() * .4, x = (i + rr() * .6) * 36 / 9, z = -11 - rr() * 10;
    troncos.push({ x, y: 0, z, P: 36, sx: s, sy: 2.2 * s, sz: s, cor: '#5a3b26' });
    copas.push({ x, y: 2.4 * s, z, P: 36, sx: s * 1.1, sy: s * 1.25, sz: s * 1.1, giro: rr() * 6, cor: verdes[i % 5] });
  }
  for (let i = 0; i < 16; i++) { // arbustos
    const s = .3 + rr() * .3;
    copas.push({ x: rr() * 28, y: .3 * s, z: -3.5 - rr() * 5, P: 28, sx: s * 1.3, sy: s, sz: s * 1.1, giro: rr() * 6, cor: verdes[(i + 2) % 5] });
  }
  for (let i = 0; i < 22; i++) { // fileira distante, mais escura
    const s = .55 + rr() * .5;
    copas.push({ x: rr() * 46, y: 1.3 * s + .3, z: -28 - rr() * 8, P: 46, sx: s * 1.2, sy: s * 1.4, sz: s * 1.2, giro: rr() * 6, cor: '#2b4a33' });
  }
  const tronco = new THREE.CylinderGeometry(.12, .2, 1, 8);
  tronco.translate(0, .5, 0);
  const mT = new THREE.InstancedMesh(tronco, material('#ffffff', { rugosidade: .9 }), troncos.length);
  const mC = new THREE.InstancedMesh(blobGeo(2), material('#ffffff', { rugosidade: .8 }), copas.length);
  for (const m of [mT, mC]) { m.castShadow = true; m.receiveShadow = true; }
  espalhar(mT, troncos);
  espalhar(mC, copas);
}

/* ---------- chão com grama ---------- */

const texGrama = texturaMaterial('grama', { cor: '#4a9a3c', repetir: [1, 1], semente: 3 });
const texTerra = texturaMaterial('terra', { cor: '#7a4a2a', repetir: [1, 1], semente: 6 });
const rolar = [];   // texturas que andam com o mundo: [textura, tamanho do ladrilho em unidades]
function chaoPlano(largura, prof, z, ladrilho) {
  const mapa = texGrama.mapa.clone(), relevo = texGrama.relevo.clone();
  for (const tx of [mapa, relevo]) { tx.repeat.set(largura / ladrilho, prof / ladrilho); tx.needsUpdate = true; rolar.push([tx, ladrilho]); }
  const m = malha(new THREE.PlaneGeometry(largura, prof), material('#ffffff', { mapa, relevo, escalaRelevo: .05, rugosidade: .95 }), { sombra: false });
  m.rotation.x = -Math.PI / 2;
  m.position.z = z;
  cena.add(m);
  return m;
}
if (cenario) chaoPlano(460, 345, -158, 5);
else {
  // sem cenário (ou fundo transparente): só uma faixa de chão com grama e barranco de terra
  chaoPlano(40, 6, 0, 5);
  const mapa = texTerra.mapa.clone();
  mapa.repeat.set(8, 1); mapa.needsUpdate = true; rolar.push([mapa, 5]);
  const barranco = malha(new THREE.PlaneGeometry(40, 5), material('#ffffff', { mapa, rugosidade: 1 }), { sombra: false });
  barranco.position.set(0, -2.5, 3);
  cena.add(barranco);
}
{ // tufos de grama em 3D perto dos canos
  const rr = semente(31), laminas = [];
  for (let k = 0; k < 7; k++) {
    const g = new THREE.ConeGeometry(.045, .35 + rr() * .3, 3);
    g.translate(0, g.parameters.height / 2, 0);
    g.rotateZ((rr() - .5) * .7); g.rotateX((rr() - .5) * .5);
    g.translate((rr() - .5) * .3, 0, (rr() - .5) * .3);
    laminas.push(g);
  }
  const tufo = mergeGeometries(laminas);
  const itens = [], verdes = ['#5fae4f', '#4a9a40', '#77c060', '#3f8a38'];
  for (let i = 0; i < 120; i++) {
    const s = .7 + rr() * .8;
    const z = cenario ? 3.5 - rr() * 9 : 2.6 - rr() * 5.2;   // sem cenário, só em cima da faixa de chão
    itens.push({ x: rr() * 26, y: 0, z, P: 26, sx: s, sy: s, sz: s, giro: rr() * 6, cor: verdes[i % 4] });
  }
  const mG = new THREE.InstancedMesh(tufo, material('#ffffff', { rugosidade: .8 }), itens.length);
  mG.receiveShadow = true;
  espalhar(mG, itens);
}

/* ---------- nuvens em camadas ---------- */

const ceuNuvens = [];
if (cenario) {
  for (const opc of [
    { qtd: 4, area: [-50, 50], altura: [30, 44], z: [-130, -100], cor: '#ffd6e2', escala: 1.1 },
    { qtd: 4, area: [-90, 90], altura: [70, 100], z: [-280, -230], cor: '#ffc2cf', escala: 2.4 }
  ]) {
    const grupo = nuvens(c3d, { ...opc, vento: 0 });
    grupo.children[0].material.fog = false;
    grupo.children[0].material.emissiveIntensity = .45;
    const P = opc.area[1] - opc.area[0] + 30;
    for (const n of grupo.children) ceuNuvens.push({ n, base: n.position.x, P, vento: .35 + Math.random() * .3 });
  }
}

/* ---------- canos 3D (instanciados) ---------- */

const MAX_CANOS = 16;
const RC = LARG / 2 * S;              // raio do cano: 0,85
const corpoGeo = new THREE.CylinderGeometry(RC, RC, 1, 40, 1, true);
// tampa torneada: boca escura para o lado do vão, borda com chanfro
const perfil = [[.001, .3], [.74, .3], [.76, .28], [.76, .05], [.8, 0], [.97, 0], [1.015, .02], [1.03, .07], [1.03, .49], [1.015, .54],
  [.97, .56], [.86, .56]];
const tampaGeo = new THREE.LatheGeometry(perfil.map(([x, y]) => new THREE.Vector2(x, y)), 40);
{
  const n = tampaGeo.attributes.position.count, cores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const j = i % perfil.length, v = j < 4 ? .1 : 1; cores.set([v, v, v], i * 3); }
  tampaGeo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
}
const anelGeo = new THREE.TorusGeometry(RC + .02, .06, 10, 40);
anelGeo.rotateX(Math.PI / 2);
const mCano = () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: .3, metalness: .2, clearcoat: 1, clearcoatRoughness: .07 });
const corpos = new THREE.InstancedMesh(corpoGeo, mCano(), MAX_CANOS * 2);
const tampas = new THREE.InstancedMesh(tampaGeo, Object.assign(mCano(), { vertexColors: true }), MAX_CANOS * 2);
const aneis = new THREE.InstancedMesh(anelGeo, material('#ffffff', { rugosidade: .25, metal: .9 }), MAX_CANOS * 2);
for (const m of [corpos, tampas, aneis]) {
  m.castShadow = m.receiveShadow = true;
  m.frustumCulled = false;
  m.count = 0;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color());
  cena.add(m);
}
const COR = {
  corpo: new THREE.Color('#33b33f'), tampa: new THREE.Color('#47cc4a'), anel: new THREE.Color('#1f7a2a'),
  corpoChat: new THREE.Color('#ff3d7f'), tampaChat: new THREE.Color('#ff6a9c'), anelChat: new THREE.Color('#ffd23f'),
  alerta1: new THREE.Color('#ffd23f'), alerta2: new THREE.Color('#b06bff')
};
const VIRA = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
const SEM_GIRO = new THREE.Quaternion();
function por(inst, i, x, y, z, sy, q, cor) {
  inst.setMatrixAt(i, mtx.compose(pos3.set(x, y, z), q, esc.set(1, sy, 1)));
  inst.setColorAt(i, cor);
}

/* ---------- rosquinha gigante 3D ---------- */

const rosquinhaGeo = (() => {
  const RR = RAIO * S, maior = RR * .67, tubo = RR * .33;
  const massa = pintarGeo(new THREE.TorusGeometry(maior, tubo, 22, 56), '#d48a44');
  // cobertura: mesmo toro um pouco maior; a parte de trás afunda dentro da massa com borda escorrida
  const cob = new THREE.TorusGeometry(maior, tubo * 1.07, 22, 56);
  const p = cob.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = Math.atan2(y, x);
    const cx = Math.cos(u) * maior, cy = Math.sin(u) * maior;
    const lim = .56 + .14 * Math.sin(u * 7 + 1) + .07 * Math.sin(u * 13);
    if (z / (tubo * 1.07) < lim) p.setXYZ(i, cx + (x - cx) * .9, cy + (y - cy) * .9, z * .9);
  }
  pintarGeo(cob, '#ff4f8b');
  const partes = [massa, cob], rr = semente(17), cores = ['#3df2c2', '#ffd23f', '#ffffff', '#5b8cff', '#ff8a1f'];
  for (let k = 0; k < 46; k++) {
    const u = rr() * Math.PI * 2, v = Math.PI / 2 + (rr() - .5) * 1.4, rad = maior + tubo * 1.08 * Math.cos(v);
    const g = new THREE.CapsuleGeometry(.035, .13, 2, 6);
    g.rotateZ(rr() * 6); g.rotateX(rr() * 6);
    g.translate(Math.cos(u) * rad, Math.sin(u) * rad, tubo * 1.08 * Math.sin(v));
    partes.push(pintarGeo(g, cores[k % cores.length]));
  }
  return mergeGeometries(partes.map(g => g.toNonIndexed()));
})();
const matRosquinha = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: .5, clearcoat: .7, clearcoatRoughness: .2 });

/* ---------- extras de cada obstáculo (rosquinha, plaquinha com avatar de quem mandou) ---------- */

const extras = new Map();
function extrasDe(o) {
  let e = extras.get(o);
  if (e) return e;
  e = {};
  if (o.tipo === 'rosquinha') {
    e.malha = malha(rosquinhaGeo, matRosquinha);
    cena.add(e.malha);
  }
  if (o.autor) {
    e.placa = rotuloAvatar(o.autor, { cor: o.tipo === 'cano' ? '#ff3d7f' : '#ffd23f', altura: 1.35 });
    cena.add(e.placa);
  }
  extras.set(o, e);
  return e;
}
function limparExtras() {
  const vivos = new Set(obst);
  for (const [o, e] of extras) {
    if (vivos.has(o)) continue;
    if (e.malha) e.malha.removeFromParent();   // geometria e material são compartilhados
    if (e.placa) descartar(e.placa);           // textura própria (avatar)
    extras.delete(o);
  }
}

/* ---------- pássaro 3D ---------- */

function criarAve() {
  const raiz = new THREE.Group();
  raiz.name = 'ave';
  const corpo = new THREE.Group();
  raiz.add(corpo);
  const m = {
    amarelo: material('#ffd93a', { rugosidade: .38, verniz: .8 }),
    barriga: material('#fff4cf', { rugosidade: .5, verniz: .4 }),
    rosa: material('#ff3d7f', { rugosidade: .4, verniz: .7 }),
    asa: material('#ff5b93', { rugosidade: .42, verniz: .6 }),
    bico: material('#ff8a26', { rugosidade: .3, verniz: .9 }),
    branco: material('#ffffff', { rugosidade: .3, verniz: .6, emissivo: '#ffffff', intensidadeEmissiva: .12 }),
    preto: material('#140d1e', { rugosidade: .08, verniz: 1 }),
    bochecha: material('#ff7aa8', { rugosidade: .7 }),
    oculos: material('#0d0a14', { rugosidade: .05, metal: .3, verniz: 1 }),
    gota: material('#8fdcff', { rugosidade: .05, verniz: 1, transparente: true, opacidade: .85 })
  };
  const peca = (geo, mat, pai, x = 0, y = 0, z = 0, sombra = true) => {
    const p = malha(geo, mat, { sombra, recebe: true });
    p.position.set(x, y, z);
    pai.add(p);
    return p;
  };
  const esfera = (r, sx = 1, sy = 1, sz = 1, seg = 24) => new THREE.SphereGeometry(r, seg, Math.round(seg * .7)).scale(sx, sy, sz);
  const nosDois = (fn) => mergeGeometries([fn(1), fn(-1)]);   // mesma peça dos dois lados (z+ e z-)

  peca(esfera(.5, 1.04, .88, .84, 40), m.amarelo, corpo);
  peca(esfera(.3, 1.05, .68, .9), m.barriga, corpo, .15, -.18, .12, false);
  peca(nosDois(l => esfera(.075, 1, .6, .4).translate(.3, -.05, .33 * l)), m.bochecha, corpo, 0, 0, 0, false);

  // olhos grandes (grupo escala para piscar e arregalar)
  const olhos = new THREE.Group();
  olhos.position.set(.2, .13, 0);
  corpo.add(olhos);
  peca(nosDois(l => esfera(.17, 1, 1.05, .8).translate(0, 0, .29 * l)), m.branco, olhos, 0, 0, 0, false);
  const pupilas = peca(nosDois(l => esfera(.072, 1, 1.15, .5).translate(.07, .005, (.29 + .118) * l)), m.preto, olhos, 0, 0, 0, false);
  const reflexo = peca(nosDois(l => esfera(.026).translate(.095, .06, (.29 + .135) * l)),
    material('#ffffff', { emissivo: '#ffffff', intensidadeEmissiva: 1.5 }), olhos, 0, 0, 0, false);
  const sobrancelhas = peca(nosDois(l => new THREE.CapsuleGeometry(.024, .17, 3, 8).rotateZ(Math.PI / 2 + .35).translate(.2, .33, .31 * l)),
    m.preto, corpo, 0, 0, 0, false);

  // bico em duas partes (abre no susto)
  const bicoCima = new THREE.Group(), bicoBaixo = new THREE.Group();
  bicoCima.position.set(.42, .02, 0); bicoBaixo.position.set(.4, -.07, 0);
  corpo.add(bicoCima, bicoBaixo);
  peca(new THREE.ConeGeometry(.13, .4, 24).rotateZ(-Math.PI / 2).scale(1, .75, .85).translate(.19, 0, 0), m.bico, bicoCima);
  peca(new THREE.ConeGeometry(.095, .27, 20).rotateZ(-Math.PI / 2).scale(1, .7, .8).translate(.12, 0, 0),
    material('#e8621c', { rugosidade: .35, verniz: .8 }), bicoBaixo);

  // crista com três penas
  const crista = new THREE.Group();
  crista.position.set(.02, .36, 0);
  corpo.add(crista);
  peca(mergeGeometries([[-.1, .55, .9], [0, .12, 1.1], [.1, -.32, .95]].map(([x, a, s]) =>
    esfera(.06, 1, 2.3 * s, .7).translate(0, .11 * s, 0).rotateZ(a).translate(x * .8, 0, 0))), m.rosa, crista);

  // asas: remo de penas colado no flanco; pivô no ombro, abre para fora e bate para cima e para baixo
  const asaGeo = mergeGeometries([
    esfera(1, .25, .15, .055).translate(-.19, 0, 0),
    ...[[-.38, .06, .14, 1], [-.43, -.02, -.02, 1.1], [-.39, -.1, -.18, .9]].map(([x, y, a, s]) =>
      esfera(1, .17 * s, .055, .04).rotateZ(a).translate(x, y, 0))
  ]);
  const asas = [1, -1].map((l) => {
    const g = new THREE.Group();
    g.position.set(0, .06, .4 * l);
    corpo.add(g);
    peca(asaGeo, m.asa, g);
    return g;
  });

  // cauda em leque e pezinhos recolhidos
  const cauda = new THREE.Group();
  cauda.position.set(-.44, .05, 0);
  corpo.add(cauda);
  peca(mergeGeometries([.5, .12, -.28].map((a, k) =>
    esfera(1, .2, .07, .05).translate(-.16, 0, 0).rotateZ(a).translate(0, 0, (k - 1) * .04))),
  m.rosa, cauda);
  peca(nosDois(l => new THREE.CapsuleGeometry(.035, .14, 3, 8).rotateZ(1.2).translate(-.02, -.42, .12 * l)), m.bico, corpo);

  // óculos escuros (visão turva) e gota de suor (susto)
  const oculos = new THREE.Group();
  oculos.position.copy(olhos.position);
  corpo.add(oculos);
  peca(nosDois(l => caixa(.34, .22, .05, .05).clone().translate(.05, .01, .42 * l)), m.oculos, oculos, 0, 0, 0, false);
  peca(nosDois(l => new THREE.BoxGeometry(.36, .035, .035).translate(-.16, .05, .4 * l)), m.oculos, oculos, 0, 0, 0, false);
  peca(new THREE.BoxGeometry(.04, .04, .86).translate(.22, .07, 0), m.oculos, oculos, 0, 0, 0, false);
  oculos.visible = false;
  const gota = new THREE.Group();
  gota.position.set(-.1, .5, .25);
  corpo.add(gota);
  peca(esfera(.055, 1, 1, 1, 12), m.gota, gota, 0, 0, 0, false);
  peca(new THREE.ConeGeometry(.052, .1, 12).translate(0, .07, 0), m.gota, gota, 0, 0, 0, false);
  gota.visible = false;

  raiz.scale.setScalar(1.2);
  cena.add(raiz);
  return { raiz, corpo, olhos, pupilas, reflexo, sobrancelhas, bicoCima, bicoBaixo, crista, asas, cauda, oculos, gota };
}
const ave3d = criarAve();
const avePos = new THREE.Vector3();
// o pássaro fica um pouco à frente do plano dos canos (z) para nunca sumir atrás deles
function aveMundo() { return avePos.set(wx(camX + BX), Math.max(wy(ave.y), .5), 1.1); }
const alerta = rotulo('!!', { cor: '#ffd23f', altura: 1.1, tamanho: 96 });
alerta.visible = false;
cena.add(alerta);

/* ---------- penas 3D (explosão na batida) ---------- */

const penas = (() => {
  const forma = new THREE.Shape();
  forma.moveTo(0, -.17);
  forma.quadraticCurveTo(.075, -.06, .04, .13);
  forma.quadraticCurveTo(0, .19, -.04, .13);
  forma.quadraticCurveTo(-.075, -.06, 0, -.17);
  const geo = new THREE.ShapeGeometry(forma, 5);
  const max = 180;
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .6, emissive: '#ffffff', emissiveIntensity: .3 }), max);
  inst.frustumCulled = false;
  inst.castShadow = true;
  inst.count = 0;
  inst.setColorAt(0, new THREE.Color());
  cena.add(inst);
  const vivas = [], cores = ['#ffd23f', '#ff3d7f', '#ffffff', '#ffe08a', '#ff9f3d'].map(c => new THREE.Color(c));
  return {
    explodir(p, qtd) {
      for (let k = 0; k < qtd; k++) {
        if (vivas.length >= max) vivas.shift();
        const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1), v = r(2.5, 10);
        vivas.push({ x: p.x, y: p.y, z: p.z, vx: Math.cos(th) * Math.sin(ph) * v, vy: Math.cos(ph) * v * .8 + 2.5, vz: Math.sin(th) * Math.sin(ph) * v,
          rx: r(0, 6), ry: r(0, 6), rz: r(0, 6), wx: r(-6, 6), wy: r(-8, 8), fase: r(0, 6), vida: r(1.8, 3.2), tam: r(.7, 1.5), cor: cores[k % cores.length] });
      }
    },
    passo(dt, dx) {
      for (let i = vivas.length - 1; i >= 0; i--) {
        const a = vivas[i];
        a.vida -= dt;
        if (a.vida <= 0) { vivas.splice(i, 1); continue; }
        const ar = Math.min(1, 2.6 * dt);
        a.vx -= a.vx * ar; a.vz -= a.vz * ar; a.vy -= a.vy * ar;
        a.vy -= 3.2 * dt;   // cai devagar, planando
        a.x += (a.vx + Math.sin(a.vida * 5 + a.fase) * .9) * dt - dx;
        a.y += a.vy * dt; a.z += a.vz * dt;
        if (a.y < .03) { a.y = .03; a.vy = 0; a.vx *= .5; a.wx = a.wy = 0; }
        a.rx += a.wx * dt; a.ry += a.wy * dt;
      }
      inst.count = vivas.length;
      vivas.forEach((a, i) => {
        const k = Math.min(1, a.vida / .4) * a.tam;
        qtn.setFromEuler(eul.set(a.rx, a.ry, a.rz + Math.sin(a.vida * 7 + a.fase) * .6));
        inst.setMatrixAt(i, mtx.compose(pos3.set(a.x, a.y, a.z), qtn, esc.set(k, k, k)));
        inst.setColorAt(i, a.cor);
      });
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
  };
})();
const brilhos = criarParticulas(c3d, { max: 400 });

/* ---------- raios do caos ---------- */

const raios = [0, 1, 2].map((k) => {
  const rr = semente(40 + k), pts = [];
  let x = 0, y = 46;
  pts.push([x, y]);
  while (y > 0) { x += (rr() - .5) * 7; y -= 3 + rr() * 4; pts.push([x, Math.max(0, y)]); }
  const pos = [], cor = [];
  for (const [larg, c] of [[2.2, [.45, .25, .8]], [.32, [1, 1, 1]]]) {   // brilho roxo largo + núcleo branco
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], w0 = larg * (1 - i / pts.length * .6), w1 = larg * (1 - (i + 1) / pts.length * .6);
      pos.push(x0 - w0 / 2, y0, 0, x0 + w0 / 2, y0, 0, x1 - w1 / 2, y1, 0, x0 + w0 / 2, y0, 0, x1 + w1 / 2, y1, 0, x1 - w1 / 2, y1, 0);
      for (let j = 0; j < 6; j++) cor.push(...c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide }));
  m.visible = false;
  cena.add(m);
  return m;
});
let raioAtual = null;

/* ---------- quadro: sincroniza a cena com a simulação ---------- */

const NEBLINA = {
  base: { cor: new THREE.Color('#e9927c'), perto: 60, longe: 520 },
  turva: { cor: new THREE.Color('#f3cf96'), perto: 12, longe: 150 },
  caos: { cor: new THREE.Color('#4b2087'), perto: 18, longe: 170 }
};
const CEU_CAOS = new THREE.Color('#3a1470'), CEU_TURVA = new THREE.Color('#e8b98a');
const HEMI = { base: new THREE.Color('#ffb3a6'), caos: new THREE.Color('#a77bff') };
let foco = 0, rolagem = 0, camAntes = 0;

function desenhar3d(dt) {
  const s = camX * S, dx = s - camAntes;
  camAntes = s;
  const caos = t < caosAte, turva = t < turvaAte;

  // fundo em paralaxe
  for (const c of camadas) {
    const o = enrolar(-s, c.P);
    c.a.position.x = o - c.P / 2;
    c.b.position.x = o + c.P / 2;
  }
  for (const { inst, itens } of instanciados) {
    itens.forEach((it, i) => {
      qtn.setFromEuler(eul.set(0, it.giro ?? 0, 0));
      inst.setMatrixAt(i, mtx.compose(pos3.set(enrolar(it.x - s, it.P), it.y, it.z), qtn, esc.set(it.sx, it.sy, it.sz)));
    });
    inst.instanceMatrix.needsUpdate = true;
  }
  for (const c of ceuNuvens) c.n.position.x = enrolar(c.base - s - t * c.vento, c.P);
  for (const [tx, lad] of rolar) tx.offset.x = mod(s / lad, 1);

  // canos e rosquinhas
  let n = 0;
  const pisca = Math.sin(t * 20) > 0;
  for (const o of obst) {
    if (o.tipo === 'cano') {
      const x = wx(o.x + LARG / 2);
      if (x < -10 || x > 10 || n >= MAX_CANOS) continue;
      const yC = wy(o.centro - o.vao / 2), yB = wy(o.centro + o.vao / 2);
      const chat = !!o.autor, apertado = o.vao < VAO * 0.9 && caos;
      const cTampa = apertado ? (pisca ? COR.alerta1 : COR.alerta2) : chat ? COR.tampaChat : COR.tampa;
      const cCorpo = chat ? COR.corpoChat : COR.corpo, cAnel = chat ? COR.anelChat : COR.anel;
      const topo = 21, base = -.3, yc0 = yC + .5, yb1 = yB - .5;
      por(corpos, n * 2, x, (yc0 + topo) / 2, 0, topo - yc0, SEM_GIRO, cCorpo);
      por(corpos, n * 2 + 1, x, (base + yb1) / 2, 0, Math.max(.01, yb1 - base), SEM_GIRO, cCorpo);
      por(tampas, n * 2, x, yC, 0, 1, SEM_GIRO, cTampa);
      por(tampas, n * 2 + 1, x, yB, 0, 1, VIRA, cTampa);
      por(aneis, n * 2, x, yC + .95, 0, 1, SEM_GIRO, cAnel);
      por(aneis, n * 2 + 1, x, yB - .95, 0, 1, SEM_GIRO, cAnel);
      n++;
      if (chat) {
        const e = extrasDe(o);
        const yPlaca = o.centro + o.vao / 2 + 160 < 1480 ? o.centro + o.vao / 2 + 130 : o.centro - o.vao / 2 - 130;
        e.placa.position.set(x, wy(yPlaca), 1.3);
      }
    } else {
      const e = extrasDe(o), x = wx(o.x), y = wy(roscaY(o));
      e.malha.position.set(x, y, 0);
      e.malha.rotation.set(.22, Math.sin(t * .9 + o.fase) * .35, -(o.giro + t * .8));
      e.placa?.position.set(x, y + o.r * S + .85, .6);
    }
  }
  for (const m of [corpos, tampas, aneis]) {
    m.count = n * 2;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  limparExtras();

  // pássaro
  const caido = estado === 'caiu', susto = caido || caos;
  const A = ave3d;
  A.raiz.position.copy(aveMundo());
  if (caido) {
    A.corpo.rotation.set(Math.sin(ave.giro * .7) * .6, 0, -ave.giro);
  } else {
    A.corpo.rotation.set(0, 0, -limitar(ave.vy / 1100, -0.45, 1.0));
  }
  const bate = Math.sin(ave.fase);
  const ang = caido ? .2 + bate * 1.2 : .25 + bate * .9;
  A.asas[0].rotation.set(-.35 - bate * .25, .2, -ang);
  A.asas[1].rotation.set(.35 + bate * .25, -.2, -ang);
  A.corpo.position.y = Math.cos(ave.fase) * .03;
  A.cauda.rotation.z = Math.sin(ave.fase + 1) * .12;
  A.crista.rotation.z = susto ? Math.sin(t * 30) * .2 : Math.sin(t * 3) * .05;
  const pisca2 = !susto && t > ave.piscaEm && t < ave.piscaEm + 0.14;
  A.olhos.scale.set(susto ? 1.18 : 1, pisca2 ? .12 : susto ? 1.18 : 1, 1);
  A.pupilas.scale.setScalar(susto ? .62 : 1);
  A.pupilas.position.x = susto ? Math.sin(t * 40) * .012 + .03 : 0;
  A.reflexo.visible = !pisca2 && !(turva && !caido);
  A.sobrancelhas.visible = susto;
  const abre = susto ? .45 : .05;
  A.bicoCima.rotation.z = abre / 2;
  A.bicoBaixo.rotation.z = -abre;
  A.oculos.visible = turva && !caido;
  A.gota.visible = susto;
  A.gota.position.y = .5 + Math.abs(Math.sin(t * 6)) * .05;
  alerta.visible = caido && caiuT < 1.2;
  if (alerta.visible) alerta.position.set(avePos.x + .1, avePos.y + 1.1, 1.4);

  penas.passo(dt, dx);

  // clima: neblina e luz mudam com visão turva e caos
  const k = 1 - Math.exp(-dt * 3);
  const alvoN = turva ? NEBLINA.turva : caos ? NEBLINA.caos : NEBLINA.base;
  if (cena.fog) {
    cena.fog.color.lerp(alvoN.cor, k);
    cena.fog.near += (alvoN.perto - cena.fog.near) * k;
    cena.fog.far += (alvoN.longe - cena.fog.far) * k;
  }
  matCeu.uniforms.mistura.value += ((caos ? .6 : turva ? .5 : 0) - matCeu.uniforms.mistura.value) * k;
  matCeu.uniforms.cMistura.value.lerp(caos ? CEU_CAOS : CEU_TURVA, k);
  hemi.color.lerp(caos ? HEMI.caos : HEMI.base, k);

  // raio: clarão no céu e um relâmpago atrás da cidade
  if (raio > 0.17 && cenario) {
    raioAtual && (raioAtual.visible = false);
    raioAtual = raios[Math.floor(Math.random() * raios.length)];
    raioAtual.position.set(r(-14, 14), 0, -60);
    raioAtual.scale.x = Math.random() < .5 ? -1 : 1;
  }
  if (raioAtual) {
    raioAtual.visible = raio > 0;
    raioAtual.material.opacity = Math.min(1, raio / .1);
  }
  matCeu.uniforms.clarao.value = raio > 0 ? raio * 2.2 : 0;
  renderer.toneMappingExposure = EXPO + flash * .8 + raio * 2.5;

  // câmera: aproxima um pouco na batida e balança no caos
  foco = Math.max(0, foco - dt * .9);
  rolagem += ((caos ? Math.sin(t * 2.3) * .045 : 0) - rolagem) * k;
  const f = Math.sin(Math.min(1, foco) * Math.PI / 2) * .22;
  camera.position.set(CAM.pos[0] + (avePos.x - CAM.pos[0]) * f * .5, CAM.pos[1] + (avePos.y - CAM.pos[1]) * f * .3, CAM.pos[2] * (1 - f * .35));
  camera.lookAt(CAM.alvo[0] + (avePos.x - CAM.alvo[0]) * f, CAM.alvo[1] + (avePos.y - CAM.alvo[1]) * f, 0);
  camera.rotateZ(rolagem);
  if (caos) c3d.tremer(.05, .2);
}

/* ---------- HUD ---------- */

let filtro = '', ultimoTexto = '';
function atualizarHud() {
  const d = fmt(dist);
  if (d !== ultimoTexto) { $('dist').textContent = ultimoTexto = d; }
  const rc = fmt(recorde);
  if ($('recorde').textContent !== rc) $('recorde').textContent = rc;
  const p = Math.min(1, dist / META), pr = Math.min(1, recorde / META);
  $('progresso').style.width = (p * 100).toFixed(2) + '%';
  $('marcaAve').style.left = `calc(25px + (100% - 50px) * ${p.toFixed(4)})`;
  $('marcaRec').style.left = `calc(25px + (100% - 50px) * ${pr.toFixed(4)})`;
  const pct = (p * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  if ($('pct').textContent !== pct) $('pct').textContent = pct;
  const f = t < turvaAte ? 'blur(7px) saturate(1.4)' : '';
  if (f !== filtro) c3d.canvas.style.filter = filtro = f;
}

function atualizarEfeitos() {
  const chips = [];
  if (t < turvaAte) chips.push([`${EMOJI.turva} TURVA ${Math.ceil(turvaAte - t)}s`, '#e0a800']);
  if (t < caosAte) chips.push([`${EMOJI.caos} CAOS ${Math.ceil(caosAte - t)}s`, '#8a3dff']);
  const canos = fila.filter(f => f.tipo === 'cano').length, roscas = fila.length - canos;
  if (canos) chips.push([`${EMOJI.cano} +${canos} ${canos === 1 ? 'CANO' : 'CANOS'}`, '#e8306f']);
  if (roscas) chips.push([`${EMOJI.rosquinha} +${roscas}`, '#e8306f']);
  const chave = chips.map(c => c[0]).join('|');
  if (chave !== efeitosAntes) {
    efeitosAntes = chave;
    $('efeitos').replaceChildren(...chips.map(([texto, cor]) => {
      const d = document.createElement('div');
      d.textContent = texto; d.style.background = cor;
      return d;
    }));
  }
  salvarRecorde();
}
let efeitosAntes = '';

function pintar(destaque = null) {
  const top = ranking.top(4);
  if (!top.length) {
    const v = document.createElement('li');
    v.className = 'ranking-vazio';
    v.textContent = 'Mande um presente e derrube o pássaro!';
    $('ranking').replaceChildren(v);
    return;
  }
  pintarRanking($('ranking'), top, { destaque });
}

// faixa grande no meio da tela: ataque do chat ou queda (nome só via textContent)
let faixaTimer = 0;
function faixa({ classe, cor, grande, pessoa, rotulo: legenda }) {
  palco.querySelector('.faixa')?.remove();
  clearTimeout(faixaTimer);
  const f = document.createElement('div');
  f.className = `faixa ${classe}`;
  f.style.setProperty('--cor', cor);
  const g = document.createElement('span');
  g.className = 'grande txt-jogo brilho';
  g.textContent = grande;
  f.append(g);
  if (pessoa) {
    const q = document.createElement('div');
    q.className = 'quem';
    const n = document.createElement('div');
    n.className = 'nome txt-jogo';
    const s = document.createElement('small');
    s.textContent = legenda;
    n.append(pessoa.nome || pessoa.user, s);
    q.append(avatar(pessoa, 'grande'), n);
    f.append(q);
  } else if (legenda) {
    const s = document.createElement('div');
    s.className = 'nome txt-jogo';
    s.style.cssText = 'text-align:center;max-width:none;margin-top:10px;font-size:46px';
    s.textContent = legenda;
    f.append(s);
  }
  palco.appendChild(f);
  faixaTimer = setTimeout(() => f.remove(), 2450);
}

/* ---------- eventos ---------- */

const ROTULOS = { cano: '+1 cano', turva: 'visão turva', rosquinha: 'rosquinha gigante', caos: 'caos!' };
const PADRAO = { cano: '🌹', turva: '🕶️', rosquinha: '🍩', caos: '🌌' };
const EMOJI = {};
for (const acao of Object.keys(ROTULOS)) {
  const ref = cfg.acoes?.[acao]?.[0];
  EMOJI[acao] = typeof ref === 'string' ? emojiDoPresente(ref, PADRAO[acao]) : PADRAO[acao];
}

function aoEvento(ev) {
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao || !ROTULOS[acao]) return;
  const q = Math.max(1, Math.min(30, Math.floor(ev.quantidade) || 1));
  const quem = { user: ev.user || ev.nome || 'alguém', nome: ev.nome || ev.user || 'alguém', foto: ev.foto || '' };
  if (acao === 'cano' || acao === 'rosquinha') {
    for (let k = 0; k < q; k++) fila.push({ tipo: acao, autor: quem });
    if (fila.length > 40) fila.splice(0, fila.length - 40);
    flutuar(palco, { x: 820, y: 1190 + r(-40, 40), texto: acao === 'cano' ? `+${q} ${q === 1 ? 'CANO' : 'CANOS'}` : `+${q} 🍩`, cor: '#ff5e94', tamanho: 76 });
    particulas(palco, { x: 1000, y: 1190, emoji: EMOJI[acao], qtd: Math.min(8, 2 + q) });
    tocar('tecla');
  } else if (acao === 'turva') {
    turvaAte = Math.min(Math.max(turvaAte, t) + TURVA * q, t + 30);
    turvaAutor = quem;
    faixa({ classe: 'turva', cor: '#ffd23f', grande: `${EMOJI.turva} VISÃO TURVA!`, pessoa: quem, rotulo: `${q}× ${ev.presenteNome} · ${Math.round(turvaAte - t)}s` });
    tocar('virada');
  } else {
    caosAte = Math.min(Math.max(caosAte, t) + CAOS * q, t + 40);
    caosAutor = quem;
    faixa({ classe: 'caos', cor: '#b06bff', grande: `${EMOJI.caos} CAOS!`, pessoa: quem, rotulo: `vãos apertados · ${Math.round(caosAte - t)}s` });
    tremer(palco, true);
    c3d.tremer(.3, .5);
    tocar('virada');
  }

  ranking.somar(quem, q);
  pintar(quem.user);

  const total = combo.registrar(quem.user, q);
  if (total >= 3 && total > q) {
    flutuar(palco, { x: 540, y: 1340, texto: `COMBO x${total}`, cor: '#ffd23f', tamanho: 80 });
    tocar('combo', total);
    const marco = MARCOS_COMBO.find(m => total >= m && total - q < m);
    if (marco) {
      particulas(palco, { x: 540, y: 1340, qtd: 30, forca: 1.4 });
      particulas(palco, { x: 540, y: 1340, emoji: EMOJI[acao], qtd: 10, forca: 1.6 });
      tremer(palco);
    }
  }

  const efeito = acao === 'cano' ? `+${q} ${q === 1 ? 'cano' : 'canos'}` : acao === 'rosquinha' ? `${q}× rosquinha gigante`
    : acao === 'turva' ? `visão turva ${Math.round(turvaAte - t)}s` : `caos ${Math.round(caosAte - t)}s`;
  avisar(html`<span>${EMOJI[acao]} <b>${quem.nome}</b> ${q}× ${ev.presenteNome} → <span class="mais">${efeito}</span></span>`);
  atualizarEfeitos();
}

/* ---------- início ---------- */

for (const [acao, refs] of Object.entries(cfg.acoes ?? {})) {
  if (!ROTULOS[acao]) continue;
  const item = document.createElement('div');
  item.className = 'item';
  const em = document.createElement('span');
  em.className = 'emoji';
  em.textContent = EMOJI[acao];
  const txt = document.createElement('div');
  txt.className = 'txt';
  const nome = document.createElement('b');
  nome.textContent = refs.map(x => (typeof x === 'number' ? '#' + x : x)).join(' / ');
  const ef = document.createElement('span');
  ef.textContent = ROTULOS[acao].toUpperCase();
  txt.append(nome, ef);
  item.append(em, txt);
  $('legenda').appendChild(item);
}
$('meta').textContent = '🏁 ' + fmt(META);
pintar();

function falso(acao, quantidade = 1) {
  const ref = cfg.acoes?.[acao]?.[0];
  return eventoFalso(typeof ref === 'number'
    ? { presenteId: ref, presenteNome: acao, quantidade }
    : { presenteNome: String(ref ?? acao), quantidade });
}

teclas({
  t: () => {
    const rajada = [['cano', 3], ['turva', 1], ['rosquinha', 1], ['cano', 2], ['caos', 1]];
    rajada.forEach(([acao, q], k) => setTimeout(() => aoEvento(falso(acao, q)), k * 300));
  },
  r: () => { fila = []; turvaAte = caosAte = 0; reiniciar(); },
  x: () => { if (estado === 'voando') bater(null); }
});

reiniciar();
setInterval(atualizarEfeitos, 250);
// um único laço: a simulação anda em passos fixos e a cena 3D acompanha
let acumulado = 0;
c3d.aoQuadro((dt) => {
  acumulado += dt;
  while (acumulado >= PASSO) { passo(PASSO); acumulado -= PASSO; }
  desenhar3d(dt);
  atualizarHud();
});
conectar(aoEvento);
