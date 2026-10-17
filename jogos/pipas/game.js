import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  teclas, eventoFalso } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, corDoNick, iniciais, avatar, animar, contador,
  particulas, flutuar, confete, pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';
import { THREE, criarCena, material, texturaCanvas, textoJogo, nuvens, criarParticulas, fontesProntas,
  descartar, curvas, mergeGeometries } from '../kit/cena3d.js';
import { criarCeu, criarEstrelas, criarBairro, lugaresVisiveis } from './cenario3d.js';

const cfg = await carregarConfig();
const MAX = cfg.maxPipas ?? 30;
const ESCUDO_MAX = cfg.escudoMax ?? 5;
const MARCOS = [10, 25, 50, 100];
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');

// "ceu" (padrão) desenha o pôr do sol; "transparente" ou outra cor CSS deixam só os telhados
const fundo = cfg.fundo ?? 'ceu';
const comCeu = fundo === 'ceu';
const transparente = !fundo || fundo === 'transparente';
aplicarFundo(comCeu ? '#24154f' : fundo);
escalarPalco(palco);
ligarSom(cfg.som);
const avisar = avisos($('avisos'), { max: 2, duracao: 2600 });
const combo = criarCombo({ janela: cfg.janelaCombo ?? 6000 });
const ranking = criarRanking();
const contaCeu = contador($('noCeu'));
const contaCortes = contador($('cortes'));
const TAU = Math.PI * 2;
await fontesProntas();

/* ---------- legenda dos presentes ---------- */
const EFEITO = { crescer: ['🛡️', '+ESCUDO'], tempestade: ['⛈️', 'TEMPESTADE'] };
for (const [acao, refs] of Object.entries(cfg.acoes ?? {})) {
  if (!refs?.length) continue;
  const [padrao, efeito] = EFEITO[acao] ?? ['✂️', `CORTA ${cfg.cortes?.[acao] ?? 1}`];
  const chip = document.createElement('div');
  chip.className = 'chip-presente';
  const e = document.createElement('span');
  e.className = 'emoji';
  e.textContent = cfg.emojis?.[acao] ?? (typeof refs[0] === 'string' ? emojiDoPresente(refs[0], padrao) : padrao);
  const t = document.createElement('span');
  t.className = 'efeito';
  t.textContent = efeito;
  chip.append(e, t);
  $('legenda').appendChild(chip);
}

/* ---------- cena 3D: vista de uma laje no fim de tarde ---------- */
const CAM = { pos: new THREE.Vector3(0, 14, 12), alvo: new THREE.Vector3(0, 16.4, -30), fov: 50 };
const c3d = criarCena(palco, {
  cfg, luz: 'por-do-sol', fundo: transparente ? null : comCeu ? '#24154f' : fundo,
  camera: { pos: CAM.pos.toArray(), alvo: CAM.alvo.toArray(), fov: CAM.fov },
  sol: { alcance: 52 }, exposicao: 1,
  neblina: comCeu ? { cor: '#cf7f7c', perto: 60, longe: 400 } : null
});
const { cena, camera } = c3d;
const sombras = c3d.qualidade.sombras;

// câmera de referência parada: posiciona pipas e lajes pela tela, sem a tremida nem o balanço
const camRef = camera.clone();
camRef.updateMatrixWorld();
function paraMundo(sx, sy, dist, alvo = new THREE.Vector3()) {
  alvo.set(sx / 540 - 1, 1 - sy / 960, .5).unproject(camRef).sub(camRef.position).normalize();
  return alvo.multiplyScalar(dist).add(camRef.position);
}

// sol baixo à direita, no horizonte; a luz vem mais de lado e um pouco mais alta (sombras atravessando as lajes)
const dirSol = paraMundo(760, 1000, 1).sub(camRef.position).normalize();
const az = Math.atan2(dirSol.x, -dirSol.z) + THREE.MathUtils.degToRad(55), el = THREE.MathUtils.degToRad(26);
const dirLuz = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
const ALVO_SOMBRA = new THREE.Vector3(0, 3, -66);
c3d.sol.position.copy(ALVO_SOMBRA).addScaledVector(dirLuz, 110);
c3d.sol.target.position.copy(ALVO_SOMBRA);
c3d.sol.color.set('#ffb27a');
c3d.sol.shadow.camera.far = 260;
c3d.sol.shadow.camera.updateProjectionMatrix();
c3d.hemi.color.set('#ffb5a6');
c3d.hemi.groundColor.set('#4a3262');
const LUZ = { sol: 2.5, hemi: 1.05 };

let ceu = null, estrelas = null, nuvensRosa = null;
if (comCeu) {
  ceu = criarCeu(cena, dirSol);
  estrelas = criarEstrelas(cena, c3d.qualidade.escala);
  // reflexos do próprio céu do pôr do sol (caixas d'água, vidros, coroa)
  const pm = new THREE.PMREMGenerator(c3d.renderer);
  const soCeu = new THREE.Scene();
  soCeu.add(new THREE.Mesh(ceu.geometry, ceu.material));
  cena.environment?.dispose();
  cena.environment = pm.fromScene(soCeu, 0, 1, 1000).texture;
  cena.environmentIntensity = .8;
  pm.dispose();
  nuvensRosa = nuvens(c3d, { qtd: 7, area: [-80, 80], altura: [30, 55], z: [-200, -140], vento: .9, cor: '#ffc0d2', escala: 2.8 });
  // nuvens de fim de tarde: Lambert (mais barato que PBR) com brilho rosado
  const velho = nuvensRosa.children[0].material;
  const rosa = new THREE.MeshLambertMaterial({ color: '#ffc6d6', emissive: '#ff9fb8', emissiveIntensity: .55 });
  for (const n of nuvensRosa.children) n.material = rosa;
  velho.dispose();
}
// fundo transparente (por cima da câmera da live): sem rua e sem as casas de perto, só uma faixa de
// lajes no horizonte que some num degradê antes do placar; quem empina fica só nessa faixa
const bairro = criarBairro(cena, { comFundo: comCeu, comChao: !transparente, perto: transparente ? 62 : 0, sombras });
const lugares = lugaresVisiveis(bairro, camRef, transparente ? { yMax: 1250 } : undefined);
if (transparente) {
  const mascara = 'linear-gradient(to bottom, #000 1240px, transparent 1370px)';
  c3d.canvas.style.webkitMaskImage = c3d.canvas.style.maskImage = mascara;
}

// tempestade: duas camadas de nuvem carregada (planos com textura macia), chuva instanciada
// e luz do relâmpago (sempre na cena, para não recompilar shaders)
// a textura emenda dos lados (rola com o vento) e as bolhas cabem inteiras na altura; um degradê
// apaga em cima e embaixo, para a nuvem nunca terminar numa linha reta
const texTempestade = texturaCanvas(1024, 256, (c, w, h) => {
  for (let i = 0; i < 120; i++) {
    const f = Math.random(), x = Math.random() * w, r = (26 + Math.random() * 56) * (.7 + f * .5);
    const y = Math.min(h - r - 6, h * (.32 + f * .3));
    for (const dx of [-w, 0, w]) {
      if (x + dx + r < 0 || x + dx - r > w) continue;
      const g = c.createRadialGradient(x + dx, y - r * .3, 0, x + dx, y, r);
      g.addColorStop(0, 'rgba(92,88,120,.95)'); g.addColorStop(.55, 'rgba(52,49,74,.8)'); g.addColorStop(1, 'rgba(30,28,46,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x + dx, y, r, 0, TAU); c.fill();
    }
  }
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.22, 'rgba(0,0,0,1)'); g.addColorStop(.55, 'rgba(0,0,0,1)'); g.addColorStop(.97, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'destination-in';
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
}, { repetir: [1, 1] });
// máscara parada (não rola com a nuvem): apaga as bordas dos lados do plano
const mascaraTempestade = texturaCanvas(64, 4, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#000'); g.addColorStop(.18, '#fff'); g.addColorStop(.82, '#fff'); g.addColorStop(1, '#000');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}, { cores: false });
const camadasTempestade = [[80, 22, -70, 38.5], [120, 30, -110, 50]].map(([l, a, z, y], i) => {
  const t = texTempestade.textura.clone();
  t.repeat.set(i ? 1.3 : 1, 1);
  t.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(l, a), new THREE.MeshBasicMaterial({ map: t, alphaMap: mascaraTempestade.textura,
    transparent: true, opacity: 0, depthWrite: false, fog: false, color: i ? '#8c88a8' : '#ffffff' }));
  m.position.set(0, y, z);
  m.lookAt(CAM.pos);
  m.renderOrder = -5 + i * -1;
  m.visible = false;
  cena.add(m);
  return m;
});
const NCHUVA = 650;
const chuva = new THREE.InstancedMesh(new THREE.BoxGeometry(.02, 1, .02),
  new THREE.MeshBasicMaterial({ color: '#c9d6ff', transparent: true, opacity: 0, depthWrite: false }), NCHUVA);
chuva.frustumCulled = false;
chuva.visible = false;
cena.add(chuva);
const gotas = Array.from({ length: NCHUVA }, () => {
  const z = -6 - Math.random() * 40, d = 12 - z;
  const x = (Math.random() - .5) * 2 * (d * .28 + 1);
  return { x, x0: x, y: Math.random() * 34, z, v: 26 + Math.random() * 12 };
});
const luzFlash = new THREE.PointLight('#ffd9a0', 0, 0, 1);
cena.add(luzFlash);

// bando de passarinhos cruzando o pôr do sol (um InstancedMesh, asas batendo pela escala)
const passaros = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .25, -1, .35, -.15, 0, .05, -.2, 0, 0, .25, 0, .05, -.2, 1, .35, -.15], 3));
  g.computeVertexNormals();
  const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: '#2a1630', side: THREE.DoubleSide }), 9);
  m.frustumCulled = false;
  cena.add(m);
  const bando = Array.from({ length: 9 }, (_, i) => ({ dx: (i % 3) * 2.2 - (i > 2 ? 1.5 : 0), dy: Math.floor(i / 3) * -1.1 + Math.random() * .4, fase: Math.random() * TAU }));
  let x = -90;
  return (dt, t) => {
    x += dt * 4.5;
    if (x > 90) x = -90 - Math.random() * 60;
    for (let i = 0; i < bando.length; i++) {
      const b = bando[i], bate = Math.sin(t * 9 + b.fase);
      _m.compose(_v.set(x + b.dx, 46 + b.dy + Math.sin(t * .7 + b.fase) * .4, -150), _q.identity(), _w.set(.9, .9 * (.25 + .75 * Math.abs(bate)) * Math.sign(bate || 1), .9));
      m.setMatrixAt(i, _m);
    }
    m.instanceMatrix.needsUpdate = true;
  };
})();

/* ---------- peças compartilhadas das pipas ---------- */
const ESCALA = .95;
const PONTE = new THREE.Vector3(0, -.12, -.1);   // onde a linha prende (frente da pipa)
const RABO = new THREE.Vector3(0, -1.15, .02);   // onde a rabiola prende
const arco = (x) => .16 * (x / .85) ** 2;         // vareta de cima curvada para trás

const GEO_VARETAS = (() => {
  const vert = new THREE.CylinderGeometry(.022, .022, 2.15, 6);
  vert.translate(0, -.075, .03);
  const pts = [-.85, -.42, 0, .42, .85].map((x) => new THREE.Vector3(x, .2, arco(x) + .03));
  const cruz = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, .02, 5, false);
  const g = mergeGeometries([vert.toNonIndexed(), cruz.toNonIndexed()]);
  return g;
})();
const MAT_VARETA = material('#d8b57a', { rugosidade: .55 });
const GEO_ESCUDO = new THREE.SphereGeometry(1.18, 24, 12);
// bolha de escudo: cor somada (brilho) e alfa "por cima", para funcionar também no fundo transparente
const MAT_ESCUDO = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false,
  blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  uniforms: { cor: { value: new THREE.Color('#14d9b0') }, forca: { value: 1 } },
  vertexShader: `varying vec3 vN; varying vec3 vV;
    void main(){
      vec4 p = vec4(position, 1.); vec3 n = normal;
      #ifdef USE_INSTANCING
        p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
      #endif
      vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * n); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: 'uniform vec3 cor; uniform float forca; varying vec3 vN; varying vec3 vV; void main(){ float k = (pow(1. - abs(dot(vN, vV)), 2.6) * .85 + .03) * forca; gl_FragColor = vec4(cor * k, clamp(k, 0., 1.)); }'
});
// varetas e bolhas de escudo de todas as pipas: um InstancedMesh cada (2 chamadas de desenho no total)
const instanciado = (geo, mat, n) => {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.frustumCulled = false;
  m.count = 0;
  cena.add(m);
  return m;
};
const MAXV = MAX + 16;
const varetas = instanciado(GEO_VARETAS, MAT_VARETA, MAXV);
const escudos = instanciado(GEO_ESCUDO, MAT_ESCUDO, MAXV);
escudos.renderOrder = 12;

// vela em losango: grade 6×6 esticada nos quatro cantos (ondula vértice por vértice)
function geometriaVela() {
  const N = 6, g = new THREE.PlaneGeometry(1, 1, N, N);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const base = new Float32Array(pos.count * 2);
  const C = { topo: [0, 1], dir: [.85, .2], baixo: [0, -1.15], esq: [-.85, .2] };
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    const x = (1 - u) * v * C.topo[0] + u * v * C.dir[0] + u * (1 - v) * C.baixo[0] + (1 - u) * (1 - v) * C.esq[0];
    const y = (1 - u) * v * C.topo[1] + u * v * C.dir[1] + u * (1 - v) * C.baixo[1] + (1 - u) * (1 - v) * C.esq[1];
    base[i * 2] = x; base[i * 2 + 1] = y;
    pos.setXYZ(i, x, y, arco(x));
    uv.setXY(i, (x + .85) / 1.7, (y + 1.15) / 2.15);
  }
  g.computeVertexNormals();
  return { geo: g, base };
}

// papel de seda com o desenho do dono (5 estilos), fibras e luz do sol atravessando
function texturaVela(p) {
  return texturaCanvas(128, 160, (c, w, h) => {
    const X = (x) => (x + .85) / 1.7 * w, Y = (y) => (1 - (y + 1.15) / 2.15) * h;
    const losango = (k = 1) => {
      c.beginPath();
      c.moveTo(X(0), Y(.2 + .8 * k)); c.lineTo(X(.85 * k), Y(.2)); c.lineTo(X(0), Y(.2 - 1.35 * k)); c.lineTo(X(-.85 * k), Y(.2));
      c.closePath();
    };
    c.fillStyle = '#1a1030'; c.fillRect(0, 0, w, h);
    c.save(); losango(); c.clip();
    c.fillStyle = p.cor; c.fillRect(0, 0, w, h);
    c.fillStyle = p.cor2;
    const cx = X(0), cy = Y(.2);
    if (p.estilo === 0) c.fillRect(cx, 0, w, h);
    else if (p.estilo === 1) { c.fillRect(0, 0, cx, cy); c.fillRect(cx, cy, w, h); }
    else if (p.estilo === 2) { c.fillRect(cx - w * .13, 0, w * .26, h); c.fillStyle = p.cor3; c.fillRect(0, cy - h * .06, w, h * .12); }
    else if (p.estilo === 3) { losango(.6); c.fill(); c.fillStyle = p.cor3; losango(.28); c.fill(); }
    else {
      c.lineWidth = w * .11; c.strokeStyle = p.cor2;
      for (let k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(cx + k * w * .32 - w, cy - w); c.lineTo(cx + k * w * .32 + w, cy + w); c.stroke(); }
    }
    c.globalAlpha = .08; c.strokeStyle = '#fff'; c.lineWidth = 1;
    for (let i = 0; i < 36; i++) { const y = (i / 36) * h + Math.random() * 4; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + (Math.random() - .5) * 18); c.stroke(); }
    c.globalAlpha = 1;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,240,200,.3)'); g.addColorStop(.5, 'rgba(255,240,200,0)'); g.addColorStop(1, 'rgba(40,10,40,.2)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.restore();
    losango(); c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = 'rgba(26,16,48,.85)'; c.stroke();
  });
}

const cortarNome = (nome, n = 12) => { const l = Array.from(nome); return l.length > n ? l.slice(0, n - 1).join('') + '…' : nome; };

// etiqueta acima da pipa: avatar, nome, cortes e escudos (sprite que olha para a câmera).
// Com o céu cheio ela encolhe para só o avatar (recorte da mesma textura, ver arrumarRotulos)
function criarRotulo(p) {
  const t = texturaCanvas(512, 128, () => {});
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.textura, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  sprite.renderOrder = 20;
  sprite.visible = false;
  cena.add(sprite);
  p.rotulo = { sprite, t, img: null, chave: '', ax: .5, u0: 0, u1: 1, so: 0, soAlvo: 0 };
  if (p.fotoUrl) carregarFoto(p, p.fotoUrl);
  desenharRotulo(p);
}
function carregarFoto(p, url) {
  const img = new Image();
  img.crossOrigin = 'anonymous'; // sem CORS a foto não carrega e fica a inicial (não suja o canvas da textura)
  img.referrerPolicy = 'no-referrer';
  img.onload = () => { if (!p.removida) { p.rotulo.img = img; desenharRotulo(p); } };
  img.src = url;
}
function desenharRotulo(p) {
  const ehLider = p.user === lider;
  const chave = `${p.nome}|${p.cortes}|${p.escudo}|${ehLider}|${!!p.rotulo.img}`;
  if (chave === p.rotulo.chave) return;
  p.rotulo.chave = chave;
  const extras = (p.cortes ? ` ✂️${p.cortes}` : '') + (p.escudo ? ` 🛡️${p.escudo}` : '');
  p.rotulo.t.atualizar((c, W) => {
    const nome = cortarNome(p.nome);
    c.font = '400 54px "Lilita One", sans-serif';
    const wNome = c.measureText(nome).width;
    c.font = '400 40px "Lilita One", sans-serif';
    const wExtra = extras ? c.measureText(extras).width : 0;
    const larg = Math.min(W - 8, 100 + wNome + wExtra), x0 = (W - larg) / 2;
    const ax = x0 + 44, ay = 64;
    // faixa útil da textura: inteira (u0..u1) e só o avatar (ax ± 50 px)
    Object.assign(p.rotulo, { ax: ax / W, u0: Math.max(0, x0 - 6) / W, u1: Math.min(W, x0 + larg + 6) / W });
    c.beginPath(); c.arc(ax, ay, 42, 0, TAU); c.fillStyle = ehLider ? '#ffd23f' : p.cor; c.fill();
    c.lineWidth = 5; c.strokeStyle = '#1a1030'; c.stroke();
    c.save(); c.beginPath(); c.arc(ax, ay, 34, 0, TAU); c.clip();
    if (p.rotulo.img) c.drawImage(p.rotulo.img, ax - 34, ay - 34, 68, 68);
    else {
      c.fillStyle = corDoNick(p.user); c.fillRect(ax - 34, ay - 34, 68, 68);
      textoJogo(c, iniciais(p.nome), ax, ay + 3, { tamanho: 34, cor: '#1a1030', contorno: 'rgba(0,0,0,0)', espessura: 0, sombra: false });
    }
    c.restore();
    textoJogo(c, nome, x0 + 96, 64, { tamanho: 54, alinhar: 'left', cor: ehLider ? '#ffd23f' : '#fff', espessura: .22 });
    if (extras) textoJogo(c, extras, x0 + 96 + wNome, 68, { tamanho: 40, alinhar: 'left', cor: '#ffe9a8', espessura: .22 });
  });
}

// coroa de ouro do 1º do ranking
const coroa = (() => {
  const ouro = material('#ffcc3d', { metal: 1, rugosidade: .22, emissivo: '#ff9d00', intensidadeEmissiva: .45, lados: THREE.DoubleSide });
  const joia = material('#ff2d6f', { verniz: 1, rugosidade: .1, emissivo: '#ff2d6f', intensidadeEmissiva: .6 });
  const partesOuro = [new THREE.CylinderGeometry(.5, .44, .32, 28, 1, true).toNonIndexed()];
  const partesJoia = [];
  const aro = new THREE.TorusGeometry(.47, .05, 8, 28).toNonIndexed();
  aro.rotateX(Math.PI / 2); aro.translate(0, -.16, 0);
  partesOuro.push(aro);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    const ponta = new THREE.ConeGeometry(.13, .42, 8).toNonIndexed();
    ponta.translate(Math.sin(a) * .47, .36, Math.cos(a) * .47);
    partesOuro.push(ponta);
    const bola = new THREE.SphereGeometry(.07, 12, 8).toNonIndexed();
    bola.translate(Math.sin(a) * .47, .6, Math.cos(a) * .47);
    partesJoia.push(bola);
    const pedra = new THREE.SphereGeometry(.075, 12, 8).toNonIndexed();
    pedra.scale(1, 1, .5); pedra.translate(Math.sin(a + .63) * .49, 0, Math.cos(a + .63) * .49);
    partesJoia.push(pedra);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(partesOuro), ouro), new THREE.Mesh(mergeGeometries(partesJoia), joia));
  g.visible = false;
  cena.add(g);
  return g;
})();

/* ---------- quem empina: pessoas instanciadas nas lajes ---------- */
const PELES = ['#f1c9a5', '#e0a882', '#c68a62', '#a86f4c', '#8a5638', '#6b4129'];
const CALCAS = ['#2b2f45', '#3a3a3a', '#1f3b5c', '#4a3b2a', '#5a2a3a'];
const MAXP = MAX + 12;
const empinadores = (() => {
  const capsula = (r, a, x, y, rz = 0) => { const g = new THREE.CapsuleGeometry(r, a, 4, 10); g.rotateZ(rz); g.translate(x, y, 0); return g; };
  const pernas = mergeGeometries([capsula(.085, .56, -.1, .42), capsula(.085, .56, .1, .42)]);
  const tronco = mergeGeometries([capsula(.2, .34, 0, 1.06), capsula(.055, .44, -.27, .98, -.12)]);
  const cabeca = new THREE.SphereGeometry(.145, 16, 12); cabeca.translate(0, 1.6, 0);
  const cabelo = new THREE.SphereGeometry(.155, 16, 8, 0, TAU, 0, Math.PI * .5); cabelo.rotateX(-.3); cabelo.translate(0, 1.63, -.01);
  const braco = capsula(.055, .5, 0, .3);
  const partes = {};
  for (const [nome, geo] of Object.entries({ pernas, tronco, cabeca, cabelo, braco })) {
    const m = new THREE.InstancedMesh(geo, material('#ffffff', { rugosidade: nome === 'cabelo' ? .5 : .8 }), MAXP);
    m.castShadow = sombras; m.receiveShadow = sombras;
    m.count = 0;
    m.frustumCulled = false;
    cena.add(m);
    partes[nome] = m;
  }
  return partes;
})();

/* ---------- fitas: linhas, rabiolas e brilhos num Mesh dinâmico cada ---------- */
function criarFitas(max, mat, comAlfa) {
  const n4 = comAlfa ? 4 : 3;
  const pos = new Float32Array(max * 3), cor = new Float32Array(max * n4);
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aCor = new THREE.BufferAttribute(cor, n4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos);
  geo.setAttribute('color', aCor);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  cena.add(mesh);
  let n = 0;
  const lados = [], alfas = [];
  const tg = new THREE.Vector3(), olho = new THREE.Vector3(), cam = new THREE.Vector3();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
  function vert(v, c, a) {
    pos[n * 3] = v.x; pos[n * 3 + 1] = v.y; pos[n * 3 + 2] = v.z;
    cor[n * n4] = c.r; cor[n * n4 + 1] = c.g; cor[n * n4 + 2] = c.b;
    if (comAlfa) cor[n * 4 + 3] = a;
    n++;
  }
  return {
    mesh,
    comecar() { n = 0; camera.getWorldPosition(cam); },
    // faixa virada para a câmera ao longo dos pontos; larg(i, dist) e alfa(i) podem ser funções
    linha(pts, larg, c, alfa = 1) {
      const m = pts.length;
      if (m < 2 || n + (m - 1) * 6 > max) return;
      for (let i = 0; i < m; i++) {
        tg.subVectors(pts[Math.min(m - 1, i + 1)], pts[Math.max(0, i - 1)]);
        olho.subVectors(cam, pts[i]);
        const w = (typeof larg === 'function' ? larg(i, olho.length()) : larg) / 2;
        (lados[i] ??= new THREE.Vector3()).crossVectors(tg, olho).normalize().multiplyScalar(w);
        alfas[i] = typeof alfa === 'function' ? alfa(i) : alfa;
      }
      for (let i = 0; i < m - 1; i++) {
        A.addVectors(pts[i], lados[i]); B.subVectors(pts[i], lados[i]);
        C.addVectors(pts[i + 1], lados[i + 1]); D.subVectors(pts[i + 1], lados[i + 1]);
        vert(A, c, alfas[i]); vert(B, c, alfas[i]); vert(C, c, alfas[i + 1]);
        vert(C, c, alfas[i + 1]); vert(B, c, alfas[i]); vert(D, c, alfas[i + 1]);
      }
    },
    tri(a, b, d, c, alfa = 1) { if (n + 3 <= max) { vert(a, c, alfa); vert(b, c, alfa); vert(d, c, alfa); } },
    terminar() {
      geo.setDrawRange(0, n);
      aPos.clearUpdateRanges(); aPos.addUpdateRange(0, n * 3); aPos.needsUpdate = true;
      aCor.clearUpdateRanges(); aCor.addUpdateRange(0, n * n4); aCor.needsUpdate = true;
    }
  };
}
const fitasLinha = criarFitas(9000, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), true);
const fitasRabo = criarFitas(9000, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), false);
const fitasBrilho = criarFitas(3000, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending, toneMapped: false, fog: false }), true);
fitasLinha.mesh.renderOrder = 5;
fitasBrilho.mesh.renderOrder = 15;

/* ---------- faíscas, clarões e partículas ---------- */
const part = criarParticulas(c3d, { max: 500 });
const MAXF = 360;
const faiscas = new THREE.InstancedMesh(new THREE.BoxGeometry(.07, .07, 1),
  new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), MAXF);
faiscas.frustumCulled = false;
faiscas.count = 0;
faiscas.setColorAt(0, new THREE.Color());
cena.add(faiscas);
const listaFaiscas = [], poolFaiscas = [];
function faiscar(pos, qtd, cores, forca = 9) {
  for (let i = 0; i < qtd && listaFaiscas.length < MAXF; i++) {
    const f = poolFaiscas.pop() ?? { p: new THREE.Vector3(), v: new THREE.Vector3(), vida: 0, total: 0, cor: new THREE.Color() };
    f.p.copy(pos);
    f.v.randomDirection().multiplyScalar(forca * (.35 + Math.random() * .65)).y += forca * .25;
    f.vida = f.total = .35 + Math.random() * .4;
    f.cor.set(cores[i % cores.length]);
    listaFaiscas.push(f);
  }
}
const texBrilho = texturaCanvas(128, 128, (c) => {
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
});
const claroes = Array.from({ length: 8 }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texBrilho.textura, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  s.visible = false;
  s.renderOrder = 16;
  cena.add(s);
  return { s, vida: 0, total: 1, tam: 1 };
});
function clarao(pos, cor, tam, vida = .45) {
  const c = claroes.reduce((a, b) => (b.vida < a.vida ? b : a));
  c.s.position.copy(pos);
  c.s.material.color.set(cor);
  Object.assign(c, { vida, total: vida, tam });
}
function acenderLuz(pos, cor, forca) {
  luzFlash.position.copy(pos);
  luzFlash.color.set(cor);
  luzFlash.intensity = Math.max(luzFlash.intensity, forca);
}

/* ---------- som do trovão (ruído grave filtrado) ---------- */
// O kit não tem som de ruído, então o trovão usa um contexto de áudio próprio, criado uma vez só.
// Se o navegador bloquear o áudio (página sem clique), ele espera um clique ou tecla para destravar
// em vez de tentar de novo (e encher o console de avisos) a cada raio. No OBS o áudio já começa liberado.
let audioTrovao = null, ruido = null, ultimoTrovao = 0;
function contextoTrovao() {
  if (audioTrovao === null) {
    try { audioTrovao = new AudioContext(); } catch { audioTrovao = false; }
    if (audioTrovao) {
      const destravar = () => { if (audioTrovao.state !== 'running') audioTrovao.resume().catch(() => {}); };
      addEventListener('pointerdown', destravar, { once: true });
      addEventListener('keydown', destravar, { once: true });
    }
  }
  return audioTrovao?.state === 'running' ? audioTrovao : null;
}
function trovao(forte = 1) {
  if (cfg.som === false || performance.now() - ultimoTrovao < 260) return;
  ultimoTrovao = performance.now();
  const a = contextoTrovao();
  if (!a) return;
  if (!ruido) {
    const n = Math.floor(a.sampleRate * 1.8);
    ruido = a.createBuffer(1, n, a.sampleRate);
    const d = ruido.getChannelData(0);
    let ult = 0;
    for (let i = 0; i < n; i++) { ult = (ult + .045 * (Math.random() * 2 - 1)) / 1.045; d[i] = ult * 3.2; }
  }
  const src = a.createBufferSource(), filtro = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  src.buffer = ruido;
  filtro.type = 'lowpass'; filtro.frequency.value = 420;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(.55 * forte, t + .025);
  g.gain.exponentialRampToValueAtTime(.001, t + 1.7);
  src.connect(filtro).connect(g).connect(a.destination);
  src.start(t);
}

/* ---------- estado ---------- */
let pipas = [];        // voando | caindo | saindo
let ataques = [];      // cerol indo de uma pipa até a linha da outra
let raios = [];
let linhasSoltas = []; // pedaço de linha que sobra na mão de quem empina depois do corte
let tempestade = 0, tempSuave = 0, flash = 0, vento = 0, ventoX = 0, totalCortes = 0, ultimoTreme = 0, ultimoImpacto = 0;
let lider = null, noCeu = -1, flutuando = 0;
let destaque = null; // usuário mostrado no cartão do último presente
const camExtra = { fov: 0 };

const voando = () => pipas.filter((p) => p.estado === 'voando');
const embaralhar = (l) => l.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((v) => v[1]);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UM = new THREE.Vector3(1, 1, 1), CIMA = new THREE.Vector3(0, 1, 0), FRENTE = new THREE.Vector3(0, 0, 1);

function matiz(user) {
  let h = 0;
  for (const ch of String(user)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

// posição na tela (px do palco) de um ponto 3D, para os efeitos em HTML
const naTela = (v) => c3d.projetar(v);

// texto flutuante do kit, com teto para a tempestade não encher a tela de DOM
function flutua(opcoes) {
  if (flutuando >= 10) return;
  flutuando++;
  setTimeout(() => flutuando--, 1150);
  // não deixa subir por cima da legenda do topo
  flutuar(palco, { ...opcoes, y: Math.max(640, Math.min(1500, opcoes.y)) });
}

// faixa do céu onde as pipas ficam (px do palco): entre a legenda dos presentes e o horizonte
const CEU = { x0: 110, x1: 970, y0: 570, y1: 1150 };
// lugar no céu longe das outras pipas (melhor de 28 sorteios, medido na tela); a etiqueta é larga, então
// pipas lado a lado precisam de mais folga que uma em cima da outra, e pipa grande (Rose) pede mais espaço
function lugarLivre() {
  const outras = voando();
  let melhor = null, md = -1;
  for (let i = 0; i < 28; i++) {
    const x = CEU.x0 + Math.random() * (CEU.x1 - CEU.x0), y = CEU.y0 + Math.random() * (CEU.y1 - CEU.y0);
    let d = 9999;
    for (const p of outras) d = Math.min(d, Math.max(Math.abs(p.hx - x) / 190, Math.abs(p.hy - y) / 115) / p.tam);
    if (d > md) { md = d; melhor = { x, y }; }
  }
  return melhor;
}

// laje livre mais perto (na tela) de onde a pipa vai ficar
function escolherLaje(hx) {
  const alvo = Math.min(1000, Math.max(80, 540 + (hx - 540) * .85 + (Math.random() - .5) * 180));
  let melhor = null, md = Infinity;
  for (const l of lugares) {
    const d = Math.abs(l.sx - alvo) + (l.dono ? 4000 : 0) + l.extras * 1000;
    if (d < md) { md = d; melhor = l; }
  }
  return melhor;
}

// linha da mão até a pipa, esticada pelo vento: pouca barriga e só a que cabe na subida
// (calculada em atualizarPipas), para a linha nunca descer abaixo da mão antes de subir
function pontoLinha(p, u, alvo = new THREE.Vector3()) {
  const k = 4 * u * (1 - u);
  return alvo.lerpVectors(p.mao, p.ponte, u).add(_w.set(ventoX * .3 * k, -p.barriga * k, 0));
}

function soltarPipa(ev) {
  const agora = performance.now();
  let p = pipas.find((k) => k.user === ev.user && k.estado === 'voando');
  if (p) {
    p.ultimo = agora; p.pulo = 1;
    if (ev.foto && ev.foto !== p.fotoUrl) { p.fotoUrl = ev.foto; carregarFoto(p, ev.foto); }
    return p;
  }
  const vivas = voando();
  if (vivas.length >= MAX) vivas.sort((a, b) => a.ultimo - b.ultimo)[0].estado = 'saindo';
  const { x, y } = lugarLivre();
  const h = matiz(ev.user);
  const nome = String(ev.nome || ev.user);
  const laje = escolherLaje(x);
  const ocupada = !!laje?.dono;
  if (laje && !ocupada) laje.dono = ev.user;
  const pe = laje ? laje.pos.clone() : paraMundo(x, 1300, 70);
  // todas as lajes com gente: fica do lado de quem já está lá, sem sair da laje (folga medida no cenário)
  if (ocupada) pe.x += (laje.extras++ % 2 ? -1 : 1) * laje.folga;
  p = {
    user: ev.user, nome, fotoUrl: ev.foto, h,
    cor: `hsl(${h}, 92%, 58%)`, cor2: `hsl(${(h + 150) % 360}, 92%, 62%)`, cor3: `hsl(${(h + 60) % 360}, 95%, 70%)`, estilo: h % 5,
    hx: x, hy: y, casa: paraMundo(x, y, 25 + Math.random() * 17),
    laje: ocupada ? null : laje, lajeExtra: ocupada ? laje : null, pe, mao: pe.clone().add(_v.set(0, 1.9, 0)),
    pos: new THREE.Vector3(), ponte: new THREE.Vector3(), ancora: new THREE.Vector3(),
    camisa: new THREE.Color().setHSL(h / 360, .7, .5), pele: new THREE.Color(PELES[h % PELES.length]),
    calca: new THREE.Color(CALCAS[h % CALCAS.length]), cabelo: new THREE.Color(h % 4 ? '#1c140f' : '#6a4325'),
    fase: Math.random() * TAU, tam: 1, escala: ESCALA, escudo: 0, estado: 'voando', ultimo: agora, subida: 0, pulo: 0, barriga: 0,
    inc: 0, rot: 0, giro: 0, manobra: 0, ladoManobra: 1, vel: new THREE.Vector3(), queda: 0, sumir: 1, alvejado: 0, cortes: 0, removida: false
  };
  // cores das fitinhas da rabiola (guardadas para não converter texto em cor a cada quadro)
  p.coresFita = [new THREE.Color(p.cor), COR_BRANCA, new THREE.Color(p.cor2)];
  p.pos.copy(p.mao);
  // pipa 3D: vela que ondula (varetas e bolha de escudo ficam nos InstancedMesh compartilhados)
  const grupo = new THREE.Group();
  grupo.rotation.order = 'YXZ';
  const { geo, base } = geometriaVela();
  const tex = texturaVela(p);
  const vela = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex.textura, emissiveMap: tex.textura, emissive: '#ffffff',
    emissiveIntensity: .55, roughness: .7, side: THREE.DoubleSide }));
  grupo.add(vela);
  grupo.position.copy(p.pos);
  grupo.scale.setScalar(.2);
  cena.add(grupo);
  Object.assign(p, { grupo, vela, base });
  // rabiola: corrente de pontos com inércia (verlet)
  p.rabo = Array.from({ length: 11 }, () => p.pos.clone());
  p.raboAnt = p.rabo.map((v) => v.clone());
  p.pedaco = null;
  criarRotulo(p);
  pipas.push(p);
  avisar(html`🪁 <b>${nome}</b> soltou a pipa`);
  tocar('tecla');
  return p;
}

function removerPipa(p) {
  p.removida = true;
  if (p.laje?.dono === p.user) p.laje.dono = null;
  if (p.lajeExtra) p.lajeExtra.extras = Math.max(0, p.lajeExtra.extras - 1);
  descartar(p.grupo);
  const s = p.rotulo.sprite;
  s.removeFromParent();
  s.material.map.dispose();
  s.material.dispose();
}

/* ---------- cartão "último presente" e ranking ---------- */
function mostrarDestaque(p, acao) {
  destaque = p.user;
  const card = $('destaque');
  card.style.setProperty('--cor', p.cor);
  $('destaqueAvatar').replaceChildren(avatar({ user: p.user, nome: p.nome, foto: p.fotoUrl }));
  $('destaqueQuem').textContent = p.nome;
  $('destaqueAcao').textContent = acao;
  atualizarComboDestaque();
  animar(card);
}

function atualizarComboDestaque() {
  const n = destaque ? combo.atual(destaque) : 0;
  const el = $('destaqueCombo');
  if (n >= 2) { el.textContent = `COMBO x${n}`; el.classList.add('on'); animar(el); }
  else el.classList.remove('on');
}

function mostrarRanking(novo = null) {
  const top = ranking.top(5);
  lider = top[0]?.user ?? null;
  for (const p of pipas) desenharRotulo(p);
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'ranking-item vazio';
    li.textContent = 'Ninguém cortou ainda. Mande ✨ e corte a primeira!';
    return $('ranking').replaceChildren(li);
  }
  pintarRanking($('ranking'), top, { destaque: novo });
}

// empurrão de câmera nos momentos fortes
function sacudirCamera(fov = -4, forca = .2) {
  c3d.tremer(forca, .5);
  c3d.tween(camExtra, { fov }, 260, curvas.saida).then(() => c3d.tween(camExtra, { fov: 0 }, 900, curvas.suave));
}

// conta um corte para o autor: ranking, combo e marcos
function contarCorte(autor) {
  totalCortes++;
  contaCortes(totalCortes);
  autor.cortes++;
  desenharRotulo(autor);
  ranking.somar({ user: autor.user, nome: autor.nome, foto: autor.fotoUrl }, 1, { cor: autor.cor });
  mostrarRanking(autor.user);
  const n = combo.registrar(autor.user);
  if (autor.user === destaque) atualizarComboDestaque();
  const tela = naTela(autor.pos);
  if (n >= 2) {
    tocar('combo', n);
    flutua({ x: tela.x, y: tela.y - 120 * autor.tam, texto: `COMBO x${n}`, cor: '#ffd23f', tamanho: 60 });
  }
  if (MARCOS.includes(n)) {
    tocar('vitoria');
    confete(palco, { qtd: 70 });
    part.confete({ area: [-9, 9], altura: 20, z: [-14, -2] });
    sacudirCamera(-5, .3);
    flutua({ x: 540, y: 900, texto: `${n} SEGUIDAS!`, cor: '#ffd23f', tamanho: 120 });
    particulas(palco, { x: tela.x, y: tela.y, qtd: 24, forca: 1.4, cores: [autor.cor, '#ffd23f', '#fff'] });
  }
}

function cortar(alvo, autor, forcar = false) {
  if (alvo.estado !== 'voando') return;
  const pt = pontoLinha(alvo, .8);
  const tela = naTela(pt);
  if (alvo.escudo > 0 && !forcar) {
    alvo.escudo--; alvo.tam = Math.max(1, alvo.tam - .08);
    alvo.brilhoEscudo = 1;
    desenharRotulo(alvo);
    faiscar(alvo.pos, 26, ['#3df2c2', '#ffffff', '#9ffff0'], 7);
    clarao(alvo.pos, '#3df2c2', 4, .4);
    const t = naTela(alvo.pos);
    flutua({ x: t.x, y: t.y - 90, texto: '🛡️ AGUENTOU!', cor: '#3df2c2', tamanho: 54 });
    tocar('tique');
    return;
  }
  alvo.estado = 'caindo';
  alvo.vel.set((Math.random() - .5) * 3, 2, (Math.random() - .3) * 2);
  alvo.giro = (Math.random() < .5 ? -1 : 1) * (4 + Math.random() * 3);
  // o pedaço de linha que vai junto com a pipa, e o que sobra na mão
  alvo.pedaco = Array.from({ length: 8 }, (_, i) => new THREE.Vector3().lerpVectors(alvo.ponte, pt, i / 7));
  alvo.pedacoAnt = alvo.pedaco.map((v) => v.clone());
  linhasSoltas.push({ p: alvo, mao: alvo.mao, corte: pt.clone(), v: 1.3 });
  // faísca no ponto em que a linha arrebentou
  faiscar(pt, 44, ['#fff6c0', '#ffd23f', '#ff9a3d', '#ffffff'], 11);
  clarao(pt, '#ffd98a', 5, .45);
  acenderLuz(pt, '#ffcf80', 45);
  part.explodir(alvo.pos, { cores: [alvo.cor, alvo.cor2, '#ffffff'], qtd: 22, forca: 4, tamanho: .16, gravidade: -9, subida: 1.5 });
  flutua({ x: tela.x, y: tela.y - 30, texto: 'CORTOU!', cor: '#ff3d7f', tamanho: 68 });
  const agora = performance.now();
  if (agora - ultimoImpacto > 120) { tocar('impacto'); ultimoImpacto = agora; c3d.tremer(.04, .25); }
  contarCorte(autor);
}

/* ---------- eventos ---------- */
// rivais para um ataque: primeiro os que ninguém mirou ainda, depois os já mirados (com o céu todo
// marcado o golpe entra na fila: se o alvo cair antes, ele procura outra pipa no ar, ver trocarAlvo)
function escolherAlvos(autor, n) {
  const rivais = embaralhar(voando().filter((k) => k !== autor));
  rivais.sort((a, b) => a.alvejado - b.alvejado);
  return rivais.slice(0, n);
}
// o alvo deste golpe já caiu ou saiu: passa para outro rival no ar (null se o céu esvaziou)
function trocarAlvo(golpe, autor) {
  golpe.alvo.alvejado--;
  golpe.alvo = escolherAlvos(autor, 1)[0] ?? null;
  if (golpe.alvo) golpe.alvo.alvejado++;
  return golpe.alvo;
}

function aoEvento(ev) {
  if (!ev.user) return;
  if (ev.tipo === 'comentario') return void soltarPipa(ev);
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao) return;
  const p = soltarPipa(ev);
  const q = Math.max(1, ev.quantidade | 0);
  const tela = naTela(p.estado === 'voando' && p.subida > .5 ? p.pos : p.casa);
  if (acao === 'crescer') {
    p.tam = Math.min(1.4, p.tam + .08 * q);
    p.escudo = Math.min(ESCUDO_MAX, p.escudo + q);
    p.brilhoEscudo = 1;
    desenharRotulo(p);
    particulas(palco, { x: tela.x, y: tela.y, emoji: emojiDoPresente(ev.presenteNome, '🛡️'), qtd: Math.min(8, 2 + q * 2), forca: .7 });
    flutua({ x: tela.x, y: tela.y - 110 * p.tam, texto: `+${q} 🛡️`, cor: '#3df2c2', tamanho: 58 });
    tocar('ponto');
    mostrarDestaque(p, `🛡️ ESCUDO x${p.escudo}`);
  } else if (acao === 'tempestade') {
    const rivais = escolherAlvos(p, Infinity);
    const n = Math.ceil(rivais.length * (1 - .5 ** q));
    tempestade = Math.min(8, tempestade + 2.5 + n * .15);
    rivais.slice(0, n).forEach((alvo, i) => { alvo.alvejado++; raios.push({ alvo, autor: p, t: -(.5 + i * .16), pts: null, galho: null }); });
    flutua({ x: 540, y: 820, texto: '⛈️ TEMPESTADE!', cor: '#b9c8ff', tamanho: 110 });
    c3d.tremer(.15, .6);
    tocar('virada');
    trovao(.6);
    mostrarDestaque(p, n ? `⛈️ RAIO EM ${n}` : '⛈️ TEMPESTADE');
  } else {
    const n = (cfg.cortes?.[acao] ?? 1) * q;
    const alvos = escolherAlvos(p, n);
    particulas(palco, { x: tela.x, y: tela.y, emoji: emojiDoPresente(ev.presenteNome, '✂️'), qtd: Math.min(6, 2 + q), forca: .6 });
    mostrarDestaque(p, alvos.length ? `✂️ VAI CORTAR ${alvos.length}` : '✂️ SEM RIVAIS');
    if (!alvos.length) return avisar(html`✂️ <b>${p.nome}</b> afiou a linha… sem rivais`);
    alvos.forEach((alvo, i) => { alvo.alvejado++; ataques.push({ de: p, alvo, t: -i * .28, dur: .5, fim: false }); });
    if (alvos.length >= 3) sacudirCamera(-2, .08);
  }
}

/* ---------- quadro a quadro ---------- */
function zigue(de, ate, passos = 11, abertura = 1.6) {
  const pts = [];
  for (let i = 0; i <= passos; i++) {
    const f = i / passos, k = i && i < passos ? abertura * (1 - f * .5) : 0;
    pts.push(new THREE.Vector3().lerpVectors(de, ate, f).add(_v.set((Math.random() - .5) * k, (Math.random() - .5) * k * .4, (Math.random() - .5) * k)));
  }
  return pts;
}

// corrente com inércia: rabiola e pedaço de linha (o primeiro ponto segue a âncora)
function corrente(pts, ant, ancora, comp, dt, forca) {
  pts[0].copy(ancora);
  const dt2 = dt * dt;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    _v.subVectors(p, ant[i]).multiplyScalar(.9);
    ant[i].copy(p);
    p.add(_v).addScaledVector(forca(i), dt2);
  }
  for (let it = 0; it < 3; it++) for (let i = 1; i < pts.length; i++) {
    _v.subVectors(pts[i], pts[i - 1]);
    const d = _v.length() || 1e-4;
    pts[i].copy(pts[i - 1]).addScaledVector(_v, comp / d);
  }
}

const forcaRabo = new THREE.Vector3();
const COR_LINHA = new THREE.Color('#fff4e0'), COR_ESCUDO = new THREE.Color('#7dffe0'), COR_OURO = new THREE.Color('#ffe08a');
const COR_CORDA = new THREE.Color('#2a1c30'), COR_BRANCA = new THREE.Color('#ffffff');
const COR_CEROL = new THREE.Color('#ff3d7f'), COR_NUCLEO = new THREE.Color('#ffe6ef'), COR_RAIO = new THREE.Color('#9fb4ff');
const vetores = (n) => Array.from({ length: n }, () => new THREE.Vector3());
const ptsLinha = vetores(18), ptsSolta = vetores(12), ptsCerol = vetores(6);
const _camPos = new THREE.Vector3(), _tela = new THREE.Vector3(), _alvoRaio = new THREE.Vector3(), _corFaisca = new THREE.Color();
const _lado = new THREE.Vector3(), _eixo = new THREE.Vector3(), _A = new THREE.Vector3(), _B = new THREE.Vector3(), _C = new THREE.Vector3();
// forças da rabiola e do pedaço de linha solto (funções fixas, sem criar closure por pipa a cada quadro)
let _rp = null, _rt = 0;
const forcaRaboFn = (i) => forcaRabo.set(ventoX * 1.2 + Math.sin(_rt * 7 + i * .8 + _rp.fase) * 4, -9, 2.2);
const forcaPedacoFn = () => forcaRabo.set(ventoX, -6, 0);
let nVoando = 0;
// meia largura (em u da textura) do recorte "só o avatar" da etiqueta
const U_AVATAR = 50 / 512;

function atualizarPipas(dt, t) {
  camera.getWorldPosition(_camPos);
  // céu cheio: pipas e etiquetas um pouco menores para embolar menos
  const aperto = Math.min(1, Math.max(0, (noCeu - 12) / 18));
  const multidao = 1 - aperto * .2;
  const escalaCeu = ESCALA * (1 - aperto * .15);
  let nV = 0, nE = 0, voam = 0, sairam = false;
  for (const p of pipas) {
    const g = p.grupo;
    p.escala += (escalaCeu * p.tam - p.escala) * Math.min(1, dt * 3);
    const s = p.escala;
    if (p.estado === 'voando') {
      voam++;
      p.subida = Math.min(1, p.subida + dt / 1.4);
      p.pulo = Math.max(0, p.pulo - dt * 2);
      const e = 1 - (1 - p.subida) ** 3;
      _v.set(p.casa.x + ventoX * (.6 + (p.casa.y - 8) * .03) + Math.sin(t * 1.2 + p.fase) * .3,
        p.casa.y + Math.sin(t * 1.6 + p.fase * 1.3) * .22 + Math.sin(p.pulo * Math.PI) * .9,
        p.casa.z + Math.sin(t * .7 + p.fase) * .4);
      p.pos.lerpVectors(p.mao, _v, e);
      p.pos.y += Math.sin(e * Math.PI) * 2.5;
      // cabeçada: de vez em quando quem empina dá um puxão e a pipa varre para o lado
      if (p.manobra > 0) p.manobra = Math.max(0, p.manobra - dt / 1.6);
      else if (p.subida >= 1 && Math.random() < dt * .045) { p.manobra = 1; p.ladoManobra = Math.random() < .5 ? -1 : 1; }
      const m = Math.sin((1 - p.manobra) * Math.PI) * (p.manobra > 0);
      p.pos.x += m * 1.4 * p.ladoManobra;
      p.pos.y -= m * .7;
      p.inc = ventoX * .1 + Math.sin(t * 1.2 + p.fase) * .12 + Math.sin((1 - p.manobra) * TAU) * .9 * (p.manobra > 0) * p.ladoManobra;
      g.rotation.set(.5 + Math.sin(t * 1.6 + p.fase) * .06, Math.atan2(p.pos.x - p.mao.x, p.pos.z - p.mao.z) * .4, p.inc);
      g.scale.setScalar(s * (.25 + .75 * e));
    } else if (p.estado === 'caindo') {
      p.queda += dt;
      p.vel.y = Math.max(p.vel.y - 8 * dt, -7);
      p.vel.x += (ventoX * .7 - p.vel.x) * dt * .8;
      p.pos.addScaledVector(p.vel, dt);
      p.rot += p.giro * dt;
      g.rotation.set(.5 + Math.sin(p.rot * .7) * .7, Math.sin(p.rot * .4) * .6, p.inc + p.rot);
      if (p.pos.y < 2.5 || p.queda > 4.5) p.sumir -= dt * 2.5;
      g.scale.setScalar(s * Math.max(0, p.sumir));
    } else {
      p.pos.y += 5 * dt;
      p.sumir -= dt * 1.3;
      g.scale.setScalar(s * Math.max(0, p.sumir));
    }
    g.position.copy(p.pos);
    g.updateMatrixWorld(true);
    p.ponte.copy(PONTE).applyMatrix4(g.matrixWorld);
    p.ancora.copy(RABO).applyMatrix4(g.matrixWorld);
    if (nV < MAXV) varetas.setMatrixAt(nV++, g.matrixWorld);

    // papel ondulando, mais solto longe das varetas (e muito mais quando cai)
    const pos = p.vela.geometry.attributes.position, b = p.base;
    const amp = p.estado === 'caindo' ? .16 : .045 + Math.abs(ventoX) * .01 + tempSuave * .05;
    for (let i = 0; i < pos.count; i++) {
      const x = b[i * 2], y = b[i * 2 + 1];
      const solto = Math.min(1, Math.abs(x) / .45) * Math.min(1, Math.abs(y - .2) / .5);
      pos.setZ(i, arco(x) + Math.sin(t * 9 + p.fase * 3 + y * 4 + x * 2.5) * amp * solto);
    }
    pos.needsUpdate = true;
    p.vela.geometry.computeVertexNormals();

    // escudo pulsando (bolha centrada um pouco abaixo do meio da pipa)
    p.brilhoEscudo = Math.max(0, (p.brilhoEscudo ?? 0) - dt * 2);
    if (p.escudo > 0 && p.estado === 'voando' && nE < MAXV) {
      const k = 1 + .04 * Math.sin(t * 5 + p.fase) + p.brilhoEscudo * .15;
      _m.makeScale(k, k, k).setPosition(0, -.1, 0).premultiply(g.matrixWorld);
      escudos.setMatrixAt(nE++, _m);
    }

    // barriga da linha: no máximo um quinto da subida (não desce abaixo da mão) e bem menor quando a
    // pipa está mais perto da câmera que quem empina (a perspectiva aumentaria a barriga e viraria um "U")
    if (p.estado === 'voando') {
      const comp = p.mao.distanceTo(p.ponte), subida = Math.max(0, p.ponte.y - p.mao.y);
      const perto = Math.min(1, (_camPos.distanceTo(p.ponte) / Math.max(1, _camPos.distanceTo(p.mao))) ** 2);
      p.barriga = Math.min(comp * .05 * perto, subida * .2);
    }

    // rabiola
    _rp = p; _rt = t;
    corrente(p.rabo, p.raboAnt, p.ancora, .21 * s, dt, forcaRaboFn);
    if (p.pedaco) corrente(p.pedaco, p.pedacoAnt, p.ponte, .55, dt, forcaPedacoFn);

    // etiqueta: tamanho quase constante na tela; aparece quando a pipa chega lá em cima (senão as
    // etiquetas de quem acabou de soltar nascem empilhadas em cima dos telhados) e some quando ela cai
    const r = p.rotulo, sp = r.sprite;
    const alt = .04 * 30 * (_camPos.distanceTo(p.pos) / 30) ** .8 * multidao;
    r.so += (r.soAlvo - r.so) * Math.min(1, dt * 8);
    const u0 = r.u0 + (r.ax - U_AVATAR - r.u0) * r.so, u1 = r.u1 + (r.ax + U_AVATAR - r.u1) * r.so;
    sp.material.map.offset.x = u0;
    sp.material.map.repeat.x = u1 - u0;
    sp.scale.set(alt * 4 * (u1 - u0), alt, 1);
    sp.position.copy(p.pos).y += 1.05 * s * Math.max(.25, Math.min(1, p.subida * 2)) + alt * .38;
    sp.material.opacity = p.estado === 'voando' ? Math.min(1, Math.max(0, (p.subida - .4) * 2.5)) : Math.max(0, sp.material.opacity - dt * 4);
    sp.visible = sp.material.opacity > .01;
    r.dxAvatar = (r.ax - (u0 + u1) / 2) * alt * 4;
    p.altRotulo = alt;
    if (p.sumir <= 0 || p.pos.y > 80) sairam = true;
  }
  varetas.count = nV;
  escudos.count = nE;
  varetas.instanceMatrix.needsUpdate = true;
  escudos.instanceMatrix.needsUpdate = true;
  nVoando = voam;
  arrumarRotulos(dt);
  if (sairam) {
    for (const p of pipas) if (p.sumir <= 0 || p.pos.y > 80) removerPipa(p);
    pipas = pipas.filter((p) => !p.removida);
  }
}

// Etiquetas que se cobrem na tela: o líder e quem agiu por último ficam com o nome inteiro (e por cima),
// as outras encolhem para só o avatar. A conta usa o lugar de descanso de cada pipa no céu (hx, hy), não a
// posição do balanço: a decisão só muda quando entra, sai ou cresce uma pipa, ou quando alguém age.
// Perto da borda da tela a etiqueta escorrega para dentro, para o nome não ficar cortado.
const ordemRotulos = [], caixas = [];
const prioridade = (a, b) => (b.user === lider) - (a.user === lider) || b.ultimo - a.ultimo;
const MARGEM = 14;
const dentro = (x, w) => Math.min(Math.max(x, MARGEM + w), 1080 - MARGEM - w);
function arrumarRotulos(dt) {
  ordemRotulos.length = 0;
  for (const p of pipas) {
    if (p.estado === 'voando' && p.rotulo.sprite.visible) ordemRotulos.push(p);
    else p.rotulo.sprite.center.x = .5;
  }
  ordemRotulos.sort(prioridade);
  const tanMeio = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let n = 0;
  for (let k = 0; k < ordemRotulos.length; k++) {
    const p = ordemRotulos[k], r = p.rotulo, sp = r.sprite, alt = p.altRotulo;
    sp.renderOrder = 80 - Math.min(k, 59);
    const prof = -_tela.copy(sp.position).applyMatrix4(camera.matrixWorldInverse).z;
    if (prof < .5) continue;
    const ppm = 960 / (tanMeio * prof); // px do palco por metro nessa profundidade
    const sy = p.hy - (sp.position.y - p.pos.y) * ppm;
    const h = alt * ppm * .36, folga = r.soAlvo ? 12 : -6;
    const wInteira = (r.u1 - r.u0) * alt * 2 * ppm, wAvatar = U_AVATAR * alt * 4 * ppm;
    let sx = dentro(p.hx, wInteira), livre = true;
    for (let i = 0; i < n; i += 4) {
      if (sx - wInteira - folga < caixas[i + 2] && sx + wInteira + folga > caixas[i] && sy - h - folga < caixas[i + 3] && sy + h + folga > caixas[i + 1]) { livre = false; break; }
    }
    // depois de trocar, segura o estado um pouco (uma pipa nova chegando não faz as outras piscarem)
    r.trava = Math.max(0, (r.trava ?? 0) - dt);
    if (r.trava > 0) livre = !r.soAlvo;
    else if (livre === !!r.soAlvo) r.trava = 1.5;
    r.soAlvo = livre ? 0 : 1;
    const w = livre ? wInteira : wAvatar;
    if (!livre) sx = dentro(p.hx, w);
    caixas[n++] = sx - w; caixas[n++] = sy - h; caixas[n++] = sx + w; caixas[n++] = sy + h;
    // desloca o desenho do sprite (sem mexer na posição dele) até caber na tela, pela largura de agora
    _tela.copy(sp.position).project(camera);
    const x = (_tela.x + 1) * 540, larg = sp.scale.x * ppm, dx = dentro(x, larg / 2) - x;
    sp.center.x = larg > 1 ? .5 - dx / larg : .5;
    r.dxAvatarTela = dx / ppm;
  }
}

// pessoas nas lajes: de frente para a pipa, braço erguido segurando a linha
function atualizarEmpinadores(t) {
  let n = 0;
  const E = empinadores;
  for (const p of pipas) {
    if (n >= MAXP) break;
    const rot = Math.atan2(p.pos.x - p.pe.x, p.pos.z - p.pe.z);
    _q.setFromAxisAngle(CIMA, rot);
    _m.compose(p.pe, _q, UM);
    for (const k of ['pernas', 'tronco', 'cabeca', 'cabelo']) E[k].setMatrixAt(n, _m);
    E.pernas.setColorAt(n, p.calca);
    E.tronco.setColorAt(n, p.camisa);
    E.cabeca.setColorAt(n, p.pele);
    E.cabelo.setColorAt(n, p.cabelo);
    E.braco.setColorAt(n, p.pele);
    // ombro direito e direção do braço (puxando a linha de leve)
    const ombro = _v.set(.27, 1.36, 0).applyQuaternion(_q).add(p.pe);
    const dir = _w.subVectors(p.estado === 'voando' ? p.ponte : p.pos, ombro).normalize();
    if (p.estado !== 'voando') dir.lerp(FRENTE, .5).normalize();
    dir.y += Math.sin(t * 3.2 + p.fase) * .06;
    dir.normalize();
    E.braco.setMatrixAt(n, _m.compose(ombro, _q.setFromUnitVectors(CIMA, dir), UM));
    p.mao.copy(ombro).addScaledVector(dir, .62);
    n++;
  }
  for (const k in E) {
    E[k].count = n;
    E[k].instanceMatrix.needsUpdate = true;
    if (E[k].instanceColor) E[k].instanceColor.needsUpdate = true;
  }
}

const largLinha = (i, d) => d * .0015;
const alfaCerol = (i) => .25 + i * .08, alfaNucleo = (i) => .5 + i * .1;
const CORES_CEROL = ['#ff3d7f', '#ffd23f'];

function desenharFitas(t) {
  fitasLinha.comecar();
  fitasRabo.comecar();
  fitasBrilho.comecar();
  // linhas da mão até a pipa
  for (const p of pipas) {
    if (p.estado !== 'voando') continue;
    for (let i = 0; i < ptsLinha.length; i++) pontoLinha(p, i / (ptsLinha.length - 1), ptsLinha[i]);
    const cor = p.escudo ? COR_ESCUDO : p.user === lider ? COR_OURO : COR_LINHA;
    fitasLinha.linha(ptsLinha, largLinha, cor, p.escudo ? .9 : .78);
  }
  // pedaço que cai junto com a pipa cortada
  for (const p of pipas) if (p.pedaco && p.estado === 'caindo') fitasLinha.linha(p.pedaco, largLinha, COR_LINHA, Math.max(0, p.sumir) * .7);
  // linha que sobrou na mão, caindo frouxa
  for (const l of linhasSoltas) {
    const queda = (1.3 - l.v) * 7;
    for (let i = 0; i < 12; i++) {
      const u = i / 11, k = 4 * u * (1 - u);
      ptsSolta[i].lerpVectors(l.mao, l.corte, u * (1 - (1.3 - l.v) * .25)).add(_v.set(ventoX * .4 * k, -(queda * u * u + 2 * k), 0));
    }
    fitasLinha.linha(ptsSolta, largLinha, COR_LINHA, .7 * l.v / 1.3);
  }
  // rabiolas com fitinhas em laço
  for (const p of pipas) {
    const s = p.escala * Math.max(0, Math.min(1, p.sumir)) * (p.estado === 'voando' ? .25 + .75 * Math.min(1, p.subida * 1.5) : 1);
    if (s <= .01) continue;
    fitasRabo.linha(p.rabo, .035 * s, COR_CORDA);
    for (let i = 2; i < p.rabo.length; i += 2) {
      const c = p.rabo[i];
      _eixo.subVectors(p.rabo[i - 1], p.rabo[Math.min(p.rabo.length - 1, i + 1)]).normalize();
      _lado.crossVectors(_eixo, _v.subVectors(_camPos, c)).normalize();
      const abre = (.22 + .05 * Math.sin(t * 11 + i + p.fase)) * s, cor = p.coresFita[(i >> 1) % 3];
      for (let sinal = -1; sinal <= 1; sinal += 2) {
        _A.copy(c).addScaledVector(_lado, sinal * abre).addScaledVector(_eixo, .11 * s);
        _B.copy(c).addScaledVector(_lado, sinal * abre).addScaledVector(_eixo, -.11 * s);
        fitasRabo.tri(c, _A, _B, cor);
      }
    }
  }
  // cerol: linha brilhante indo até a linha do rival
  for (const a of ataques) {
    if (a.t < 0 || a.de.estado !== 'voando') continue;
    const f = Math.min(1, a.t / a.dur);
    pontoLinha(a.alvo, .8, _C);
    for (let i = 0; i < 6; i++) ptsCerol[i].lerpVectors(a.de.ponte, _C, f * i / 5);
    fitasBrilho.linha(ptsCerol, .2, COR_CEROL, alfaCerol);
    fitasBrilho.linha(ptsCerol, .05, COR_NUCLEO, alfaNucleo);
    if (Math.random() < .6) faiscar(ptsCerol[5], 2, CORES_CEROL, 3);
  }
  // relâmpagos
  for (const r of raios) {
    if (!r.pts) continue;
    const k = Math.max(0, 1 - r.t / .35);
    fitasBrilho.linha(r.pts, .9, COR_RAIO, .35 * k);
    fitasBrilho.linha(r.pts, .14, COR_BRANCA, k);
    if (r.galho) { fitasBrilho.linha(r.galho, .45, COR_RAIO, .3 * k); fitasBrilho.linha(r.galho, .07, COR_BRANCA, .8 * k); }
  }
  fitasLinha.terminar();
  fitasRabo.terminar();
  fitasBrilho.terminar();
}

function atualizarEfeitos(dt) {
  // faíscas esticadas na direção do movimento
  let n = 0;
  for (let i = listaFaiscas.length - 1; i >= 0; i--) {
    const f = listaFaiscas[i];
    f.vida -= dt;
    if (f.vida <= 0) { poolFaiscas.push(f); listaFaiscas[i] = listaFaiscas[listaFaiscas.length - 1]; listaFaiscas.pop(); continue; }
    f.v.y -= 14 * dt;
    f.v.multiplyScalar(1 - 1.4 * dt);
    f.p.addScaledVector(f.v, dt);
  }
  for (const f of listaFaiscas) {
    const k = f.vida / f.total, vel = f.v.length();
    _q.setFromUnitVectors(FRENTE, _v.copy(f.v).divideScalar(vel || 1));
    faiscas.setMatrixAt(n, _m.compose(f.p, _q, _w.set(1, 1, Math.max(.1, vel * .05))));
    faiscas.setColorAt(n, _corFaisca.copy(f.cor).multiplyScalar(k));
    n++;
  }
  faiscas.count = n;
  faiscas.instanceMatrix.needsUpdate = true;
  if (faiscas.instanceColor) faiscas.instanceColor.needsUpdate = true;
  for (const c of claroes) {
    c.vida = Math.max(0, c.vida - dt);
    c.s.visible = c.vida > 0;
    if (!c.s.visible) continue;
    const k = c.vida / c.total;
    c.s.material.opacity = k;
    c.s.scale.setScalar(c.tam * (1.5 - .5 * k));
  }
  luzFlash.intensity *= Math.exp(-dt * 9);
  if (luzFlash.intensity < .05) luzFlash.intensity = 0;
}

function atualizarTempo(dt, t) {
  tempSuave += (Math.min(1, tempestade) - tempSuave) * Math.min(1, dt * 2.5);
  const k = tempSuave;
  if (ceu) {
    ceu.material.uniforms.tempestade.value = k * .9;
    ceu.material.uniforms.flash.value = flash;
  }
  if (estrelas) estrelas.material.opacity = .75 * (1 - k);
  if (nuvensRosa) nuvensRosa.children[0].material.emissiveIntensity = .55 * (1 - k * .8);
  if (cena.fog) cena.fog.color.copy(_corNeblina).lerp(_corTemp, k * .85);
  c3d.sol.intensity = LUZ.sol * (1 - .75 * k) + flash * 1.5;
  c3d.hemi.intensity = LUZ.hemi * (1 - .35 * k) + flash * 2.2;
  camadasTempestade.forEach((m, i) => {
    m.visible = k > .01;
    m.material.opacity = Math.min(transparente ? .8 : 1, k * 1.15); // por cima da câmera deixa ver um pouco
    m.material.map.offset.x += dt * (.006 + i * .003) * (1 + Math.abs(ventoX));
    m.material.color.set(i ? '#8c88a8' : '#ffffff').lerp(_corRaio, flash * .8);
  });
  chuva.visible = k > .02;
  if (chuva.visible) {
    chuva.material.opacity = .42 * k;
    _q.setFromAxisAngle(FRENTE, .14 + ventoX * .05);
    for (let i = 0; i < NCHUVA; i++) {
      const g = gotas[i];
      g.y -= g.v * dt;
      g.x -= g.v * dt * .14;
      if (g.y < 0) { g.y += 34; g.x = g.x0 + 3 + (Math.random() - .5) * 2; }
      chuva.setMatrixAt(i, _m.compose(_v.set(g.x, g.y, g.z), _q, UM));
    }
    chuva.instanceMatrix.needsUpdate = true;
  }
  $('clarao').style.opacity = String(flash * .22);
}
const _corTemp = new THREE.Color('#3a3a55'), _corRaio = new THREE.Color('#e8eeff'), _corNeblina = new THREE.Color('#cf7f7c');

function atualizarCamera(t) {
  camera.position.set(CAM.pos.x + Math.sin(t * .23) * .2, CAM.pos.y + Math.sin(t * .31) * .08, CAM.pos.z);
  camera.lookAt(CAM.alvo.x + Math.sin(t * .19) * .25, CAM.alvo.y + tempSuave * .6, CAM.alvo.z);
  const fov = CAM.fov + camExtra.fov + tempSuave * 1.5;
  if (Math.abs(camera.fov - fov) > .001) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

function atualizarCoroa(t) {
  const p = lider && pipas.find((k) => k.user === lider && k.estado === 'voando' && k.subida > .4);
  coroa.visible = !!p;
  if (!p) return;
  const sp = p.rotulo.sprite;
  coroa.position.copy(sp.position);
  coroa.position.x += p.rotulo.dxAvatar + (p.rotulo.dxAvatarTela ?? 0);
  coroa.position.y += p.altRotulo * .42 + Math.sin(t * 3) * .05;
  coroa.scale.setScalar(p.altRotulo * .62);
  coroa.rotation.set(-.15, t * 1.2, 0);
}

c3d.aoQuadro((dt, t) => {
  vento = Math.sin(t * .33) * 55 + Math.sin(t * .91 + 1) * 20 + (tempestade > 0 ? Math.sin(t * 3) * 40 : 0);
  ventoX = vento / 55;
  atualizarCamera(t);
  if (comCeu) passaros(dt, t);
  atualizarPipas(dt, t);
  atualizarEmpinadores(t);

  for (const a of ataques) {
    a.t += dt;
    if (a.t < 0) continue;
    // o alvo caiu antes (outro corte): o cerol sai de novo atrás de outra pipa
    if (a.alvo.estado !== 'voando') {
      if (!trocarAlvo(a, a.de)) { a.fim = true; continue; }
      a.t = 0;
    }
    if (a.t >= a.dur) {
      a.fim = true;
      a.alvo.alvejado--;
      cortar(a.alvo, a.de);
    }
  }
  if (ataques.some((a) => a.fim)) ataques = ataques.filter((a) => !a.fim);

  for (const r of raios) {
    r.t += dt;
    if (r.t >= 0 && !r.pts) {
      if (r.alvo.estado !== 'voando' && !trocarAlvo(r, r.autor)) { r.t = 1; continue; }
      r.alvo.alvejado--;
      const alvo = _alvoRaio.copy(r.alvo.pos);
      const topo = new THREE.Vector3(alvo.x + (Math.random() - .5) * 12, 37, alvo.z - 28 - Math.random() * 10);
      r.pts = zigue(topo, alvo);
      const meio = r.pts[4];
      r.galho = zigue(meio, meio.clone().add(_v.set((Math.random() - .5) * 8, -5 - Math.random() * 3, (Math.random() - .5) * 4)), 5, 1);
      flash = 1;
      acenderLuz(alvo, '#b9c8ff', 90);
      clarao(alvo, '#cfd9ff', 7, .5);
      faiscar(alvo, 24, ['#ffffff', '#b9c8ff', '#7d9bff'], 10);
      const agora = performance.now();
      if (agora - ultimoTreme > 220) { c3d.tremer(.35, .45); ultimoTreme = agora; trovao(1); }
      cortar(r.alvo, r.autor, true);
    }
  }
  if (raios.length) raios = raios.filter((r) => r.t < .35);

  tempestade = Math.max(0, tempestade - dt);
  flash = Math.max(0, flash - dt * 3);
  if (linhasSoltas.length) linhasSoltas = linhasSoltas.filter((l) => (l.v -= dt) > 0);
  MAT_ESCUDO.uniforms.forca.value = .8 + .25 * Math.sin(t * 5);
  atualizarTempo(dt, t);
  desenharFitas(t);
  atualizarEfeitos(dt);
  atualizarCoroa(t);

  const n = nVoando;
  if (n !== noCeu) { contaCeu(n, n > noCeu && noCeu >= 0); noCeu = n; }
  $('convite').hidden = pipas.length > 0;
});

/* ---------- teclas de teste ---------- */
const NICKS_TESTE = ['ana.voa', 'beto_rx', 'cami.zz', 'davi.mp4', 'eli_jogos', 'fefe.art', 'gui.k', 'hana__', 'igor.tt', 'juju.lima', 'lari.vlog', 'nina.fps'];
function presenteFalso(acao, user, q = 1 + Math.floor(Math.random() * 3)) {
  const ref = cfg.acoes?.[acao]?.[0];
  if (ref === undefined) return null;
  return eventoFalso(typeof ref === 'number'
    ? { presenteId: ref, presenteNome: 'presente', quantidade: q, user, nome: user }
    : { presenteNome: String(ref), quantidade: q, user, nome: user });
}
function rajada() {
  const nicks = embaralhar(NICKS_TESTE);
  nicks.slice(0, 10).forEach((n, i) =>
    setTimeout(() => aoEvento(eventoFalso({ tipo: 'comentario', texto: 'subiu!', user: n, nome: n })), i * 120));
  Object.keys(cfg.acoes ?? {}).forEach((a, i) =>
    setTimeout(() => { const ev = presenteFalso(a, nicks[i]); if (ev) aoEvento(ev); }, 1600 + i * 600));
}
// C: a mesma pessoa corta várias seguidas (testa o combo)
function rajadaDeCortes() {
  const quem = NICKS_TESTE[Math.floor(Math.random() * NICKS_TESTE.length)];
  const acao = Object.keys(cfg.cortes ?? {})[0] ?? 'cortar';
  for (let i = 0; i < 4; i++) setTimeout(() => { const ev = presenteFalso(acao, quem, 1); if (ev) aoEvento(ev); }, i * 700);
}
// E: tempestade na hora (testa chuva, raios e tremida)
function tempestadeTeste() {
  const quem = NICKS_TESTE[Math.floor(Math.random() * NICKS_TESTE.length)];
  const ev = presenteFalso('tempestade', quem, 1);
  if (ev) aoEvento(ev);
}

teclas({
  t: rajada,
  c: rajadaDeCortes,
  e: tempestadeTeste,
  r: () => {
    for (const p of pipas) removerPipa(p);
    pipas = []; ataques = []; raios = []; linhasSoltas = []; listaFaiscas.length = 0;
    for (const l of lugares) { l.dono = null; l.extras = 0; }
    ranking.zerar(); combo.zerar(); tempestade = 0; totalCortes = 0; contaCortes(0, false);
    mostrarRanking();
  }
});

mostrarRanking();
conectar(aoEvento);
