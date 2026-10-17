// Base 3D dos jogos (three.js): cena com luz realista, sombras e reflexos, mais peças prontas
// (céu, chão com textura, bonecos articulados, torcida, rótulos com avatar, partículas, animações).
// O placar e os avisos continuam em HTML por cima do canvas; projetar() liga os dois mundos.
// Cada jogo declara no HTML o import map de "three" e "three/addons/" (ver jogos/urna/index.html).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { ehDemo } from './kit.js';
import { corDoNick, iniciais } from './efeitos.js';

export { THREE, RoundedBoxGeometry, mergeGeometries };
export const LARGURA = 1080, ALTURA = 1920;

/* ---------- qualidade ---------- */

const QUALIDADES = {
  alta: { escala: 1, sombras: true, mapa: 2048, aa: true },
  media: { escala: .75, sombras: true, mapa: 1024, aa: true },
  baixa: { escala: .5, sombras: false, mapa: 512, aa: false }
};

// "qualidade" do config.json, trocável por ?qualidade=baixa na URL (PC fraco no OBS).
export function qualidadeDe(cfg = {}) {
  const daUrl = new URLSearchParams(location.search).get('qualidade');
  const nome = daUrl ?? cfg.qualidade ?? (ehDemo(location.href) ? 'media' : 'alta');
  return { nome, ...(QUALIDADES[nome] ?? QUALIDADES.alta) };
}

/* ---------- animação (tweens) ---------- */

export const curvas = {
  linear: (k) => k,
  saida: (k) => 1 - (1 - k) ** 3,
  entrada: (k) => k ** 3,
  suave: (k) => k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2,
  volta: (k) => { const c = 1.70158; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; },
  elastico: (k) => k === 0 || k === 1 ? k : 2 ** (-10 * k) * Math.sin((k * 10 - .75) * (2 * Math.PI / 3)) + 1
};

/* ---------- cena ---------- */

// criarCena(palco, opções) → objeto com renderer, cena, camera, laço de quadros e utilidades.
//   camera: { pos:[x,y,z], alvo:[x,y,z], fov }
//   fundo: cor do fundo, ou null para transparente (sobrepor na câmera da live)
//   luz: 'estudio' | 'dia' | 'por-do-sol' | 'noite' (presets de sol + céu/chão + reflexos)
//   sol: { pos:[x,y,z], alcance } — área coberta pela sombra do sol (metade do lado, em unidades)
export function criarCena(palco, { cfg = {}, camera: cam = {}, fundo = '#000', luz = 'estudio', sol: solOpc = {},
  exposicao = 1, neblina = null, ambiente = true } = {}) {
  const q = qualidadeDe(cfg);
  const renderer = new THREE.WebGLRenderer({ antialias: q.aa, alpha: fundo === null, powerPreference: 'high-performance' });
  renderer.setPixelRatio(q.escala);
  renderer.setSize(LARGURA, ALTURA, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposicao;
  renderer.shadowMap.enabled = q.sombras;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'cena3d';
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${LARGURA}px;height:${ALTURA}px;z-index:0`;
  palco.prepend(canvas);

  const cena = new THREE.Scene();
  if (fundo !== null) cena.background = new THREE.Color(fundo);
  if (neblina) cena.fog = new THREE.Fog(neblina.cor, neblina.perto, neblina.longe);

  // reflexos de estúdio em tudo que é PBR (metal, plástico, verniz)
  if (ambiente) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    cena.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    cena.environmentIntensity = LUZES[luz]?.reflexo ?? .6;
    pmrem.dispose();
  }

  const preset = LUZES[luz] ?? LUZES.estudio;
  const hemi = new THREE.HemisphereLight(preset.ceu, preset.chao, preset.hemi);
  cena.add(hemi);
  const sol = new THREE.DirectionalLight(preset.sol, preset.intensidade);
  sol.position.set(...(solOpc.pos ?? preset.pos));
  sol.castShadow = q.sombras;
  const alcance = solOpc.alcance ?? 12;
  Object.assign(sol.shadow.camera, { left: -alcance, right: alcance, top: alcance, bottom: -alcance, near: .5, far: 200 });
  sol.shadow.mapSize.set(q.mapa, q.mapa);
  sol.shadow.bias = -.0004;
  sol.shadow.normalBias = .02;
  sol.shadow.radius = 4;
  cena.add(sol, sol.target);
  if (solOpc.alvo) sol.target.position.set(...solOpc.alvo);

  // câmera dentro de um "rig": tremer() mexe no rig e a câmera continua mirando o alvo
  const camera = new THREE.PerspectiveCamera(cam.fov ?? 35, LARGURA / ALTURA, .1, 2000);
  const rig = new THREE.Group();
  rig.add(camera);
  cena.add(rig);
  const alvo = new THREE.Vector3(...(cam.alvo ?? [0, 0, 0]));
  camera.position.set(...(cam.pos ?? [0, 4, 14]));
  camera.lookAt(alvo);

  const relogio = new THREE.Timer();
  const quadros = new Set();
  const tweens = new Set();
  let tremor = 0, tremorDecai = 0, t = 0, rodando = true, raf = 0;

  function quadro(agora) {
    raf = requestAnimationFrame(quadro);
    relogio.update(agora);
    const dt = Math.min(relogio.getDelta(), 1 / 20);
    t += dt;
    for (const tw of tweens) tw.passo(dt);
    for (const fn of quadros) fn(dt, t);
    if (tremor > 0) {
      tremor = Math.max(0, tremor - tremorDecai * dt);
      const f = tremor * tremor;
      rig.position.set((Math.random() - .5) * f, (Math.random() - .5) * f, (Math.random() - .5) * f * .5);
    } else rig.position.set(0, 0, 0);
    renderer.render(cena, camera);
  }
  raf = requestAnimationFrame(quadro);

  const v = new THREE.Vector3();
  const c3d = {
    THREE, renderer, cena, camera, rig, alvo, sol, hemi, canvas, qualidade: q,
    get tempo() { return t; },
    // fn(dt, t) a cada quadro; devolve a função que remove
    aoQuadro(fn) { quadros.add(fn); return () => quadros.delete(fn); },
    // tremida de câmera; forca ~ unidades do mundo no pico
    tremer(forca = .25, duracao = .4) { tremor = Math.max(tremor, Math.sqrt(forca)); tremorDecai = tremor / duracao; },
    // anima propriedades numéricas: tween(obj.position, { y: 2 }, 300, curvas.saida) → Promise
    tween(obj, para, ms, curva = curvas.saida) {
      const de = {};
      for (const k in para) de[k] = obj[k];
      return new Promise((resolve) => {
        let dec = 0;
        const tw = {
          passo(dt) {
            dec += dt * 1000;
            const k = Math.min(1, dec / ms), e = curva(k);
            for (const p in para) obj[p] = de[p] + (para[p] - de[p]) * e;
            if (k >= 1) { tweens.delete(tw); resolve(); }
          }
        };
        tweens.add(tw);
      });
    },
    esperar(ms) { return c3d.tween({ x: 0 }, { x: 1 }, ms, curvas.linear); },
    // posição na tela do palco (px de 1080×1920) de um ponto ou objeto 3D, para efeitos em HTML
    projetar(alvoProj) {
      if (alvoProj.isObject3D) alvoProj.getWorldPosition(v); else v.copy(alvoProj);
      v.project(camera);
      return { x: (v.x + 1) / 2 * LARGURA, y: (1 - v.y) / 2 * ALTURA, visivel: v.z < 1 };
    },
    mirar(x, y, z) { alvo.set(x, y, z); camera.lookAt(alvo); },
    pausar() { rodando = false; cancelAnimationFrame(raf); },
    continuar() { if (!rodando) { rodando = true; raf = requestAnimationFrame(quadro); } }
  };
  // para depuração e para os scripts de captura medirem a cena
  window.__cena3d = c3d;
  return c3d;
}

const LUZES = {
  estudio: { ceu: '#fff3e0', chao: '#5a3a22', hemi: .4, sol: '#fff1dc', intensidade: 2.8, pos: [6, 14, 10], reflexo: .5 },
  dia: { ceu: '#bfe3ff', chao: '#4c7a3a', hemi: .55, sol: '#fff2dc', intensidade: 3.2, pos: [12, 22, 10], reflexo: .35 },
  'por-do-sol': { ceu: '#ffb98a', chao: '#3b2a4a', hemi: .7, sol: '#ffb070', intensidade: 2.4, pos: [-14, 9, 6], reflexo: .5 },
  noite: { ceu: '#5b6cff', chao: '#120c24', hemi: .45, sol: '#c9d6ff', intensidade: 1.4, pos: [8, 18, 6], reflexo: .45 }
};

/* ---------- materiais e geometrias ---------- */

// Material PBR. verniz > 0 usa MeshPhysicalMaterial (plástico brilhante, carro, tinta).
export function material(cor, { rugosidade = .55, metal = 0, verniz = 0, emissivo = null, intensidadeEmissiva = 1,
  mapa = null, relevo = null, escalaRelevo = 1, transparente = false, opacidade = 1, lados = THREE.FrontSide, brilho = 0 } = {}) {
  const Tipo = verniz || brilho ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Tipo({ color: cor, roughness: rugosidade, metalness: metal, map: mapa, side: lados,
    transparent: transparente, opacity: opacidade });
  if (verniz) { m.clearcoat = verniz; m.clearcoatRoughness = .12; }
  if (brilho) { m.sheen = brilho; m.sheenColor = new THREE.Color('#ffd9c7'); m.sheenRoughness = .5; }
  if (relevo) { m.bumpMap = relevo; m.bumpScale = escalaRelevo; }
  if (emissivo) { m.emissive = new THREE.Color(emissivo); m.emissiveIntensity = intensidadeEmissiva; }
  return m;
}

// Pele com leve brilho de "veludo" (sheen), para mãos e rostos.
export function pele(cor = '#e0a882') {
  return material(cor, { rugosidade: .52, brilho: .6 });
}

const caixas = new Map();
// Caixa de cantos arredondados (cacheada por medida; marcada como compartilhada para descartar() não apagar).
export function caixa(l, a, p, raio = Math.min(l, a, p) * .12, segmentos = 3) {
  const k = `${l}|${a}|${p}|${raio}|${segmentos}`;
  if (!caixas.has(k)) {
    const g = new RoundedBoxGeometry(l, a, p, segmentos, raio);
    g.userData.compartilhada = true;
    caixas.set(k, g);
  }
  return caixas.get(k);
}

// Tira o objeto da cena e libera geometrias, materiais e texturas (jogos rodam horas: sem isso a memória cresce).
// Geometrias/materiais com userData.compartilhada são mantidos.
export function descartar(obj) {
  obj.removeFromParent();
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.compartilhada) o.geometry.dispose();
    for (const m of [o.material].flat().filter(Boolean)) {
      if (m.userData.compartilhada) continue;
      for (const k of ['map', 'bumpMap', 'emissiveMap', 'alphaMap', 'normalMap', 'roughnessMap']) m[k]?.dispose();
      m.dispose();
    }
  });
}

// Mesh que projeta e recebe sombra.
export function malha(geo, mat, { sombra = true, recebe = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = sombra;
  m.receiveShadow = recebe;
  return m;
}

/* ---------- texturas desenhadas em canvas ---------- */

let fontesOk = null;
// Espera as fontes do kit antes de desenhar texto em canvas (senão sai a fonte padrão).
export function fontesProntas() {
  fontesOk ??= Promise.all([
    document.fonts.load('400 64px "Lilita One"'),
    document.fonts.load('800 64px "Baloo 2"'),
    document.fonts.load('700 64px "Baloo 2"')
  ]).catch(() => {});
  return fontesOk;
}

// Textura a partir de um canvas 2D; atualizar() redesenha (ex.: tela da urna, placar no telão).
export function texturaCanvas(largura, altura, desenhar, { repetir = null, cores = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  const textura = new THREE.CanvasTexture(canvas);
  if (cores) textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 8;
  if (repetir) {
    textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
    textura.repeat.set(...repetir);
  }
  const t = {
    textura, canvas, ctx,
    atualizar(fn = desenhar) { ctx.clearRect(0, 0, largura, altura); fn?.(ctx, largura, altura); textura.needsUpdate = true; }
  };
  t.atualizar();
  return t;
}

// Texto de jogo no canvas 2D: fonte display, contorno grosso e sombra dura (como .txt-jogo).
export function textoJogo(ctx, texto, x, y, { tamanho = 64, cor = '#fff', contorno = '#1a1030', alinhar = 'center',
  base = 'middle', fonte = '"Lilita One"', peso = 400, espessura = .2, sombra = true, larguraMax } = {}) {
  ctx.save();
  ctx.font = `${peso} ${tamanho}px ${fonte}, "Baloo 2", sans-serif`;
  ctx.textAlign = alinhar;
  ctx.textBaseline = base;
  ctx.lineJoin = 'round';
  const s = String(texto);
  if (sombra) { ctx.fillStyle = contorno; ctx.strokeStyle = contorno; ctx.lineWidth = tamanho * espessura; ctx.strokeText(s, x, y + tamanho * .08, larguraMax); }
  ctx.strokeStyle = contorno;
  ctx.lineWidth = tamanho * espessura;
  ctx.strokeText(s, x, y, larguraMax);
  ctx.fillStyle = cor;
  ctx.fillText(s, x, y, larguraMax);
  ctx.restore();
}

// Ruído determinístico para texturas procedurais.
function aleatorio(semente) {
  let s = semente >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Texturas procedurais realistas: 'madeira' | 'grama' | 'concreto' | 'asfalto' | 'tijolo' | 'tecido' | 'parede' | 'pista' | 'terra'.
// Devolve { mapa, relevo } (cor e relevo) já em repetição.
export function texturaMaterial(tipo, { cor = null, repetir = [1, 1], tamanho = 512, semente = 7 } = {}) {
  const r = aleatorio(semente);
  const cria = (cores) => texturaCanvas(tamanho, tamanho, (ctx, w, h) => DESENHOS[tipo](ctx, w, h, r, cor ?? undefined, cores), { repetir, cores });
  const mapa = cria(true).textura;
  const rr = aleatorio(semente); // mesmo desenho em tons de cinza para o relevo
  const relevo = texturaCanvas(tamanho, tamanho, (ctx, w, h) => {
    DESENHOS[tipo](ctx, w, h, rr, cor ?? undefined, true);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const g = img.data[i] * .3 + img.data[i + 1] * .59 + img.data[i + 2] * .11;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
  }, { repetir, cores: false }).textura;
  return { mapa, relevo };
}

function salpicar(ctx, w, h, r, qtd, cores, tam = [1, 3], alfa = [.05, .25]) {
  for (let i = 0; i < qtd; i++) {
    ctx.globalAlpha = alfa[0] + r() * (alfa[1] - alfa[0]);
    ctx.fillStyle = cores[Math.floor(r() * cores.length)];
    const s = tam[0] + r() * (tam[1] - tam[0]);
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

const DESENHOS = {
  madeira(ctx, w, h, r, cor = '#a8662f') {
    ctx.fillStyle = cor; ctx.fillRect(0, 0, w, h);
    // tábuas com veios ondulados
    const tabuas = 4;
    for (let t = 0; t < tabuas; t++) {
      const y0 = t * h / tabuas;
      ctx.fillStyle = `rgba(${r() < .5 ? '255,220,170' : '60,25,5'},${.05 + r() * .08})`;
      ctx.fillRect(0, y0, w, h / tabuas);
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = `rgba(70,30,8,${.08 + r() * .18})`;
        ctx.lineWidth = .6 + r() * 1.8;
        ctx.beginPath();
        const yy = y0 + r() * h / tabuas, amp = 1 + r() * 4, fase = r() * 6;
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, yy + Math.sin(x / (40 + r() * 6) + fase) * amp);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,15,0,.55)';
      ctx.fillRect(0, y0, w, 2);
      if (r() < .7) { // nó da madeira
        const nx = r() * w, ny = y0 + h / tabuas * (.3 + r() * .4);
        for (let k = 6; k > 0; k--) { ctx.strokeStyle = `rgba(60,22,4,${.12})`; ctx.beginPath(); ctx.ellipse(nx, ny, k * 4, k * 1.6, 0, 0, 7); ctx.stroke(); }
      }
    }
  },
  grama(ctx, w, h, r, cor = '#3f8f3a') {
    ctx.fillStyle = cor; ctx.fillRect(0, 0, w, h);
    salpicar(ctx, w, h, r, 9000, ['#357a30', '#5fae4f', '#4a9a40', '#77c060', '#3a8434'], [1, 3], [.15, .45]);
    for (let i = 0; i < 2600; i++) { // folhinhas
      ctx.strokeStyle = r() < .5 ? 'rgba(120,200,90,.35)' : 'rgba(25,70,25,.35)';
      ctx.beginPath(); const x = r() * w, y = r() * h; ctx.moveTo(x, y); ctx.lineTo(x + (r() - .5) * 3, y - 3 - r() * 5); ctx.stroke();
    }
  },
  concreto(ctx, w, h, r, cor = '#9a9a96') {
    ctx.fillStyle = cor; ctx.fillRect(0, 0, w, h);
    salpicar(ctx, w, h, r, 14000, ['#7d7d79', '#b6b6b1', '#8a8a86', '#c8c8c2'], [1, 3], [.1, .4]);
    salpicar(ctx, w, h, r, 120, ['#6d6d69'], [3, 9], [.08, .2]);
  },
  asfalto(ctx, w, h, r, cor = '#3a3b40') {
    ctx.fillStyle = cor; ctx.fillRect(0, 0, w, h);
    salpicar(ctx, w, h, r, 22000, ['#2a2b2f', '#55565c', '#45464b', '#6a6b70', '#1e1f22'], [1, 2.4], [.3, .8]);
  },
  pista(ctx, w, h, r, cor = '#c4492f') { // piso emborrachado de atletismo
    ctx.fillStyle = cor; ctx.fillRect(0, 0, w, h);
    salpicar(ctx, w, h, r, 26000, ['#b0402a', '#d75a3c', '#b84330', '#e06a48', '#9c3520'], [1, 2.2], [.2, .5]);
  },
  terra(ctx, w, h, r, cor = '#7a5532') {
    ctx.fillStyle = cor; ctx.fillRect(0, 0, w, h);
    salpicar(ctx, w, h, r, 16000, ['#5e3f22', '#8f6a44', '#6b4a2b', '#a07a50'], [1, 3], [.2, .6]);
  },
  tijolo(ctx, w, h, r, cor = '#b0563a') {
    ctx.fillStyle = '#d8cbb8'; ctx.fillRect(0, 0, w, h);
    const lin = 8, col = 4, bh = h / lin, bw = w / col;
    for (let y = 0; y < lin; y++) for (let x = -1; x < col; x++) {
      const ox = (y % 2) * bw / 2;
      const c = new THREE.Color(cor).offsetHSL((r() - .5) * .03, (r() - .5) * .1, (r() - .5) * .12);
      ctx.fillStyle = `#${c.getHexString()}`;
      ctx.fillRect(x * bw + ox + 3, y * bh + 3, bw - 6, bh - 6);
    }
    salpicar(ctx, w, h, r, 6000, ['#000', '#fff'], [1, 2], [.03, .12]);
  },
  tecido(ctx, w, h, r, cor = '#4a4f57') { // trama de terno
    ctx.fillStyle = cor; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { ctx.fillStyle = `rgba(255,255,255,${.02 + r() * .04})`; ctx.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 3) { ctx.fillStyle = `rgba(0,0,0,${.03 + r() * .05})`; ctx.fillRect(x, 0, 1, h); }
  },
  parede(ctx, w, h, r, cor = '#e08a3c') { // reboco pintado
    ctx.fillStyle = cor; ctx.fillRect(0, 0, w, h);
    salpicar(ctx, w, h, r, 12000, ['#ffffff', '#000000'], [1, 4], [.015, .06]);
  }
};

/* ---------- cenário ---------- */

// Céu físico (espalhamento da luz do sol). elevacao em graus acima do horizonte.
// brilho controla a exposição só do céu (o shader devolve HDR forte); nuvens 0..1 liga as nuvens do shader.
// azimute 0 = sol atrás da câmera padrão (que olha para -z); 180 = sol de frente (contraluz).
export function ceuFisico(c3d, { elevacao = 18, azimute = 20, turbidez = 6, rayleigh = 2, escala = 900, brilho = .35, nuvens: cobertura = .35 } = {}) {
  const ceu = new Sky();
  ceu.scale.setScalar(escala);
  ceu.material.fragmentShader = ceu.material.fragmentShader
    .replace('uniform float time;', 'uniform float time;\nuniform float brilhoCeu;')
    .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * brilhoCeu, 1.0 );');
  const u = ceu.material.uniforms;
  u.brilhoCeu = { value: brilho };
  u.cloudCoverage.value = cobertura;
  c3d.aoQuadro((dt) => { u.time.value += dt; });
  u.turbidity.value = turbidez;
  u.rayleigh.value = rayleigh;
  u.mieCoefficient.value = .005;
  u.mieDirectionalG.value = .8;
  const sol = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevacao), THREE.MathUtils.degToRad(azimute));
  u.sunPosition.value.copy(sol);
  c3d.cena.add(ceu);
  return ceu;
}

// Céu em degradê (cúpula), mais barato e com cores escolhidas: [topo, meio, horizonte].
export function ceuDegrade(c3d, { cores = ['#2a5bd7', '#6fa8ff', '#ffe2b8'], raio = 800 } = {}) {
  // sem tone mapping: as cores do céu saem exatamente como escolhidas
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { a: { value: new THREE.Color(cores[0]) }, b: { value: new THREE.Color(cores[1]) }, c: { value: new THREE.Color(cores[2]) } },
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 a; uniform vec3 b; uniform vec3 c; varying vec3 p;
      void main(){
        float h = clamp(p.y, -0.2, 1.0);
        vec3 col = h > .25 ? mix(b, a, smoothstep(.25, 1., h)) : mix(c, b, smoothstep(-.05, .25, h));
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }`
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(raio, 32, 16), mat);
  c3d.cena.add(m);
  return m;
}

// Chão com textura procedural e sombra.
export function chao(c3d, { tipo = 'grama', cor, largura = 200, profundidade = 200, repetir = [20, 20], rugosidade = .9, y = 0, relevo = .04 } = {}) {
  const tex = texturaMaterial(tipo, { cor, repetir });
  const m = malha(new THREE.PlaneGeometry(largura, profundidade),
    material('#ffffff', { mapa: tex.mapa, relevo: tex.relevo, escalaRelevo: relevo, rugosidade }), { sombra: false });
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  c3d.cena.add(m);
  return m;
}

// Nuvens fofas (esferas fundidas), que andam devagar com o vento.
export function nuvens(c3d, { qtd = 8, area = [-60, 60], altura = [18, 30], z = [-80, -40], vento = .6, cor = '#ffffff', escala = 1 } = {}) {
  const r = aleatorio(11);
  const mat = material(cor, { rugosidade: 1, emissivo: cor, intensidadeEmissiva: .25 });
  const grupo = new THREE.Group();
  for (let i = 0; i < qtd; i++) {
    const partes = [];
    const n = 5 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const g = new THREE.SphereGeometry((1.6 + r() * 2.2) * escala, 16, 12);
      g.translate((k - n / 2) * 1.9 * escala, r() * 1.2 * escala, (r() - .5) * 2 * escala);
      partes.push(g);
    }
    const nuvem = new THREE.Mesh(mergeGeometries(partes), mat);
    nuvem.scale.y = .7;
    nuvem.position.set(area[0] + r() * (area[1] - area[0]), altura[0] + r() * (altura[1] - altura[0]), z[0] + r() * (z[1] - z[0]));
    grupo.add(nuvem);
  }
  c3d.cena.add(grupo);
  c3d.aoQuadro((dt) => {
    for (const n of grupo.children) {
      n.position.x += vento * dt;
      if (n.position.x > area[1] + 15) n.position.x = area[0] - 15;
    }
  });
  return grupo;
}

// Holofote com cone de luz visível (estádio, arena, palco).
export function holofote(c3d, { pos = [0, 20, 0], alvo = [0, 0, 0], cor = '#fff4d6', intensidade = 400, angulo = .35, cone = true, sombra = false } = {}) {
  const luz = new THREE.SpotLight(cor, intensidade, 0, angulo, .5, 1.6);
  luz.position.set(...pos);
  luz.target.position.set(...alvo);
  luz.castShadow = sombra && c3d.qualidade.sombras;
  c3d.cena.add(luz, luz.target);
  let feixe = null;
  if (cone) {
    const dist = new THREE.Vector3(...pos).distanceTo(new THREE.Vector3(...alvo));
    const g = new THREE.ConeGeometry(Math.tan(angulo) * dist, dist, 32, 1, true);
    g.translate(0, -dist / 2, 0);
    g.rotateX(-Math.PI / 2);
    // feixe mais forte perto da lâmpada e sumindo até o chão
    feixe = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { cor: { value: new THREE.Color(cor) }, forca: { value: .16 } },
      vertexShader: 'varying float v; void main(){ v = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 cor; uniform float forca; varying float v; void main(){ gl_FragColor = vec4(cor * forca * pow(v, 1.6), 1.); }'
    }));
    feixe.position.set(...pos);
    feixe.lookAt(...alvo);
    c3d.cena.add(feixe);
  }
  return { luz, feixe };
}

/* ---------- personagens ---------- */

const PELES = ['#f1c9a5', '#e0a882', '#c68a62', '#a86f4c', '#8a5638', '#6b4129'];
const CABELOS = ['#1c140f', '#3b2416', '#6a4325', '#c49a5a', '#e2c27a', '#8b2f1e'];

// Boneco articulado (estilizado, proporção de jogo) com material PBR.
// Juntas em userData.juntas: quadril, tronco, pescoco, cabeca, ombroE/D, cotoveloE/D, coxaE/D, joelhoE/D.
// Gire as juntas em .rotation.x (frente/trás) e .rotation.z (abrir) para animar. Altura total ~1.8.
export function boneco({ pele: corPele = PELES[1], camisa = '#2ad08f', calca = '#2b2f45', cabelo = CABELOS[0],
  sapato = '#f2f2f2', faixa = null, cabecao = 1.15, numero = null, semente = 1 } = {}) {
  const mPele = pele(corPele);
  const mCamisa = material(camisa, { rugosidade: .75, verniz: .1 });
  const mCalca = material(calca, { rugosidade: .85 });
  const mCabelo = material(cabelo, { rugosidade: .6, verniz: .2 });
  const mSapato = material(sapato, { rugosidade: .4, verniz: .4 });
  const mBranco = material('#ffffff', { rugosidade: .2, verniz: .6 });
  const mPreto = material('#151018', { rugosidade: .2, verniz: .8 });
  const raiz = new THREE.Group();
  const J = {};
  const junta = (nome, pai, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); pai.add(g); J[nome] = g; return g; };
  const peca = (geo, mat, pai, x = 0, y = 0, z = 0) => { const m = malha(geo, mat); m.position.set(x, y, z); pai.add(m); return m; };

  const quadril = junta('quadril', raiz, 0, .92, 0);
  peca(new THREE.CapsuleGeometry(.2, .12, 6, 12), mCalca, quadril, 0, -.02, 0).scale.set(1.25, 1, .9);
  const tronco = junta('tronco', quadril, 0, .08, 0);
  const torso = peca(new THREE.CapsuleGeometry(.24, .34, 8, 16), mCamisa, tronco, 0, .3, 0);
  torso.scale.set(1.12, 1, .78);
  if (numero != null) {
    const t = texturaCanvas(128, 128, (ctx) => textoJogo(ctx, numero, 64, 70, { tamanho: 84, cor: '#fff', espessura: .14 }));
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(.26, .26), new THREE.MeshStandardMaterial({ map: t.textura, transparent: true, roughness: .7 }));
    placa.position.set(0, .32, .2);
    tronco.add(placa);
  }
  const pescoco = junta('pescoco', tronco, 0, .64, 0);
  peca(new THREE.CylinderGeometry(.07, .08, .12, 12), mPele, pescoco, 0, .02, 0);
  const cabeca = junta('cabeca', pescoco, 0, .1, 0);
  cabeca.scale.setScalar(cabecao);
  peca(new THREE.SphereGeometry(.2, 32, 24), mPele, cabeca, 0, .17, 0).scale.set(1, 1.08, 1);
  const r = aleatorio(semente);
  const topo = peca(new THREE.SphereGeometry(.208, 24, 16, 0, Math.PI * 2, 0, Math.PI * (.42 + r() * .12)), mCabelo, cabeca, 0, .19, -.008);
  topo.rotation.x = -.25;
  if (faixa) { const f = peca(new THREE.TorusGeometry(.2, .03, 8, 32), material(faixa, { rugosidade: .7 }), cabeca, 0, .25, 0); f.rotation.x = Math.PI / 2 - .2; }
  for (const lado of [-1, 1]) {
    peca(new THREE.SphereGeometry(.045, 16, 12), mBranco, cabeca, .075 * lado, .2, .17).scale.set(1, 1.15, .6);
    peca(new THREE.SphereGeometry(.022, 12, 8), mPreto, cabeca, .075 * lado, .2, .195);
    const sob = peca(new THREE.BoxGeometry(.075, .018, .02), mCabelo, cabeca, .075 * lado, .265, .18);
    sob.rotation.z = -.15 * lado;
    peca(new THREE.SphereGeometry(.045, 12, 8), mPele, cabeca, .2 * lado, .17, 0).scale.set(.5, 1, .8); // orelha
  }
  peca(new THREE.SphereGeometry(.035, 12, 8), mPele, cabeca, 0, .15, .2); // nariz
  const boca = peca(new THREE.TorusGeometry(.045, .011, 6, 16, Math.PI), material('#7a2a2a', { rugosidade: .5 }), cabeca, 0, .09, .185);
  boca.rotation.z = Math.PI;
  J.boca = boca;

  for (const [s, lado] of [['E', 1], ['D', -1]]) {
    const ombro = junta('ombro' + s, tronco, .3 * lado, .52, 0);
    peca(new THREE.SphereGeometry(.085, 16, 12), mCamisa, ombro);
    peca(new THREE.CapsuleGeometry(.065, .22, 6, 12), mCamisa, ombro, 0, -.15, 0);
    const cotovelo = junta('cotovelo' + s, ombro, 0, -.3, 0);
    peca(new THREE.CapsuleGeometry(.055, .2, 6, 12), mPele, cotovelo, 0, -.13, 0);
    peca(new THREE.SphereGeometry(.07, 16, 12), mPele, cotovelo, 0, -.28, .01).scale.set(.9, 1, .8); // mão
    const coxa = junta('coxa' + s, quadril, .11 * lado, -.04, 0);
    peca(new THREE.CapsuleGeometry(.085, .28, 6, 12), mCalca, coxa, 0, -.2, 0);
    const joelho = junta('joelho' + s, coxa, 0, -.4, 0);
    peca(new THREE.CapsuleGeometry(.07, .28, 6, 12), mCalca, joelho, 0, -.2, 0);
    peca(caixa(.13, .09, .26, .04), mSapato, joelho, 0, -.42, .05);
  }
  raiz.userData.juntas = J;
  raiz.userData.materiais = { camisa: mCamisa, pele: mPele, calca: mCalca };
  return raiz;
}

// Poses prontas. fase em radianos (avança com o tempo); forca 0..1.
export const poses = {
  correr(b, fase, forca = 1) {
    const J = b.userData.juntas, s = Math.sin(fase), c = Math.cos(fase);
    J.coxaE.rotation.x = s * .9 * forca; J.coxaD.rotation.x = -s * .9 * forca;
    J.joelhoE.rotation.x = (.4 + Math.max(0, -c) * 1.2) * forca; J.joelhoD.rotation.x = (.4 + Math.max(0, c) * 1.2) * forca;
    J.ombroE.rotation.x = -s * 1.0 * forca; J.ombroD.rotation.x = s * 1.0 * forca;
    J.cotoveloE.rotation.x = -1.3 * forca; J.cotoveloD.rotation.x = -1.3 * forca;
    J.tronco.rotation.x = .25 * forca;
    J.quadril.position.y = .92 + Math.abs(c) * .07 * forca;
  },
  parado(b, t = 0) {
    const J = b.userData.juntas;
    for (const k of ['coxaE', 'coxaD', 'joelhoE', 'joelhoD', 'ombroE', 'ombroD', 'cotoveloE', 'cotoveloD', 'tronco']) J[k].rotation.set(0, 0, 0);
    J.ombroE.rotation.z = .12; J.ombroD.rotation.z = -.12;
    J.tronco.rotation.x = Math.sin(t * 2) * .02;
    J.quadril.position.y = .92;
  },
  comemorar(b, t) {
    const J = b.userData.juntas, pulo = Math.abs(Math.sin(t * 7));
    J.ombroE.rotation.set(0, 0, 2.6 + Math.sin(t * 14) * .2); J.ombroD.rotation.set(0, 0, -2.6 - Math.sin(t * 14) * .2);
    J.cotoveloE.rotation.x = 0; J.cotoveloD.rotation.x = 0;
    J.coxaE.rotation.x = J.coxaD.rotation.x = -pulo * .3; J.joelhoE.rotation.x = J.joelhoD.rotation.x = pulo * .6;
    J.quadril.position.y = .92 + pulo * .35;
  },
  puxar(b, esforco = 1, t = 0) { // inclinado para trás segurando uma corda à frente
    const J = b.userData.juntas, tremor = Math.sin(t * 30) * .02 * esforco;
    J.tronco.rotation.x = -.45 * esforco + tremor;
    J.ombroE.rotation.set(-1.25, 0, .15); J.ombroD.rotation.set(-1.25, 0, -.15);
    J.cotoveloE.rotation.x = J.cotoveloD.rotation.x = -.35;
    J.coxaE.rotation.x = -.55 * esforco; J.coxaD.rotation.x = .35 * esforco;
    J.joelhoE.rotation.x = .5 * esforco; J.joelhoD.rotation.x = .25 * esforco;
    J.quadril.position.y = .92 - .12 * esforco;
  },
  guarda(b, t = 0) { // luta: punhos na frente do rosto, gingando
    const J = b.userData.juntas, g = Math.sin(t * 5);
    J.ombroE.rotation.set(-1.1, 0, .35); J.ombroD.rotation.set(-1.1, 0, -.35);
    J.cotoveloE.rotation.x = J.cotoveloD.rotation.x = -1.9;
    J.coxaE.rotation.x = -.25; J.coxaD.rotation.x = .25; J.joelhoE.rotation.x = J.joelhoD.rotation.x = .3;
    J.tronco.rotation.x = .12; J.quadril.position.y = .88 + g * .025;
  }
};

/* ---------- torcida ---------- */

// Torcida em arquibancada com InstancedMesh (centenas de pessoas a custo baixo).
// cores: cor da camisa por pessoa ou função (i, coluna, fileira) → cor. animar(t, energia, filtro?) faz pular/acenar.
export function torcida(c3d, { fileiras = 6, porFileira = 30, origem = [-15, 0, -10], passoX = 1, passoZ = -1.1, subida = .55,
  cores = ['#ff3d7f', '#3df2c2', '#ffd23f', '#7c5cff', '#ffffff', '#ff8a1f'], escala = 1, arquibancada = '#8a8f9c' } = {}) {
  const n = fileiras * porFileira;
  const corpoG = new THREE.CapsuleGeometry(.22 * escala, .32 * escala, 4, 8);
  const cabecaG = new THREE.SphereGeometry(.18 * escala, 12, 8);
  const corpos = new THREE.InstancedMesh(corpoG, material('#ffffff', { rugosidade: .8 }), n);
  const cabecas = new THREE.InstancedMesh(cabecaG, material('#ffffff', { rugosidade: .6 }), n);
  corpos.castShadow = cabecas.castShadow = false;
  corpos.receiveShadow = cabecas.receiveShadow = true;
  const r = aleatorio(5);
  const base = [];
  const cor = new THREE.Color();
  for (let f = 0; f < fileiras; f++) for (let i = 0; i < porFileira; i++) {
    const k = f * porFileira + i;
    const x = origem[0] + i * passoX + (r() - .5) * .3, y = origem[1] + f * subida, z = origem[2] + f * passoZ;
    base.push({ x, y, z, fase: r() * 6, ritmo: 4 + r() * 4, lado: x < 0 ? 'A' : 'B', coluna: i, fileira: f });
    cor.set(typeof cores === 'function' ? cores(k, i, f) : cores[Math.floor(r() * cores.length)]);
    corpos.setColorAt(k, cor);
    cabecas.setColorAt(k, cor.set(PELES[Math.floor(r() * PELES.length)]));
  }
  // degraus da arquibancada
  const degraus = new THREE.Group();
  const mDegrau = material(arquibancada, { rugosidade: .9 });
  const largura = porFileira * passoX + 2;
  for (let f = 0; f < fileiras; f++) {
    const d = malha(new THREE.BoxGeometry(largura, subida, Math.abs(passoZ)), mDegrau, { sombra: false });
    d.position.set(origem[0] + (porFileira - 1) * passoX / 2, origem[1] + f * subida - subida / 2 - .35 * escala, origem[2] + f * passoZ);
    degraus.add(d);
  }
  c3d.cena.add(degraus, corpos, cabecas);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  function animar(t, energia = .3, filtro = null) {
    for (let k = 0; k < n; k++) {
      const b = base[k];
      const e = filtro && !filtro(b) ? .15 : energia;
      const pulo = Math.max(0, Math.sin(t * b.ritmo + b.fase)) * .35 * e * escala;
      p.set(b.x, b.y + .25 * escala + pulo, b.z);
      corpos.setMatrixAt(k, m.compose(p, q, s));
      p.y += .42 * escala;
      cabecas.setMatrixAt(k, m.compose(p, q, s));
    }
    corpos.instanceMatrix.needsUpdate = cabecas.instanceMatrix.needsUpdate = true;
  }
  animar(0, 0);
  return { corpos, cabecas, degraus, pessoas: base, animar };
}

/* ---------- rótulos (sprites que sempre olham para a câmera) ---------- */

// Rótulo de texto 3D. altura = altura em unidades do mundo. trocar(texto) redesenha.
export function rotulo(texto, { tamanho = 72, cor = '#fff', contorno = '#1a1030', altura = .6, fundo = null, larguraMax = 900 } = {}) {
  const pad = Math.round(tamanho * .45);
  const t = texturaCanvas(1024, Math.round(tamanho * 1.7), () => {});
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.textura, transparent: true, depthWrite: false }));
  function trocar(novo, opcoes = {}) {
    const o = { cor, contorno, fundo, ...opcoes };
    const ctx = t.ctx;
    ctx.font = `400 ${tamanho}px "Lilita One", sans-serif`;
    const w = Math.min(larguraMax, ctx.measureText(String(novo)).width) + pad * 2;
    t.atualizar((c, W, H) => {
      if (o.fundo) {
        c.fillStyle = o.fundo;
        c.beginPath(); c.roundRect((W - w) / 2, 4, w, H - 8, H / 2); c.fill();
      }
      textoJogo(c, novo, W / 2, H / 2, { tamanho, cor: o.cor, contorno: o.contorno, larguraMax });
    });
    sprite.scale.set(altura * t.canvas.width / t.canvas.height, altura, 1);
  }
  trocar(texto);
  sprite.userData.trocar = trocar;
  sprite.renderOrder = 10;
  return sprite;
}

// Avatar redondo com nome embaixo (foto da live quando o servidor da foto permite, senão iniciais).
export function rotuloAvatar({ user, nome, foto } = {}, { cor = '#ffffff', altura = 1, mostrarNome = true } = {}) {
  const W = 256, H = mostrarNome ? 330 : 256;
  const t = texturaCanvas(W, H, () => {});
  const nick = nome || user || '?';
  const fundoAvatar = corDoNick(user || nome);
  function desenhar(img) {
    t.atualizar((c) => {
      c.save();
      c.beginPath(); c.arc(128, 124, 112, 0, Math.PI * 2); c.fillStyle = cor; c.fill();
      c.beginPath(); c.arc(128, 124, 98, 0, Math.PI * 2); c.clip();
      if (img) c.drawImage(img, 30, 26, 196, 196);
      else { c.fillStyle = fundoAvatar; c.fillRect(0, 0, W, 256); textoJogo(c, iniciais(nick), 128, 130, { tamanho: 92, sombra: false, cor: '#1a1030', contorno: 'rgba(0,0,0,0)', espessura: 0 }); }
      c.restore();
      if (mostrarNome) textoJogo(c, nick, 128, 290, { tamanho: 46, larguraMax: 250 });
    });
  }
  desenhar(null);
  if (foto) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => desenhar(img);
    img.src = foto;
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.textura, transparent: true, depthWrite: false }));
  sprite.scale.set(altura * W / H, altura, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/* ---------- partículas e confete 3D ---------- */

// Sistema de partículas instanciado: explodir(pos, opções) e confete(opções).
export function criarParticulas(c3d, { max = 900 } = {}) {
  const geo = new THREE.BoxGeometry(1, 1, .25);
  const mat = new THREE.MeshStandardMaterial({ roughness: .5, metalness: .1, emissive: '#ffffff', emissiveIntensity: .15 });
  const inst = new THREE.InstancedMesh(geo, mat, max);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.frustumCulled = false;
  inst.count = 0;
  c3d.cena.add(inst);
  const vivas = [];
  const cor = new THREE.Color(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  function nova(o) { if (vivas.length < max) vivas.push(o); }
  c3d.aoQuadro((dt) => {
    for (let i = vivas.length - 1; i >= 0; i--) {
      const a = vivas[i];
      a.vida -= dt;
      if (a.vida <= 0 || a.y < a.chao) { vivas.splice(i, 1); continue; }
      a.vy += a.g * dt;
      a.vx *= 1 - a.arrasto * dt; a.vy *= 1 - a.arrasto * dt; a.vz *= 1 - a.arrasto * dt;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      a.rx += a.wx * dt; a.ry += a.wy * dt;
      if (a.flutua) a.x += Math.sin(a.vida * 6 + a.rx) * dt * .8;
    }
    inst.count = vivas.length;
    for (let i = 0; i < vivas.length; i++) {
      const a = vivas[i];
      const k = Math.min(1, a.vida / a.vidaTotal * 3);
      q.setFromEuler(e.set(a.rx, a.ry, 0));
      inst.setMatrixAt(i, m.compose(p.set(a.x, a.y, a.z), q, s.set(a.tam, a.tam * a.alongar, a.tam).multiplyScalar(k)));
      inst.setColorAt(i, cor.set(a.cor));
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  });
  return {
    explodir(pos, { cores = ['#ffd23f', '#ff3d7f', '#3df2c2', '#ffffff'], qtd = 40, forca = 6, tamanho = .14, vida = 1.1, gravidade = -16, subida = 3 } = {}) {
      const [x, y, z] = pos.isVector3 ? [pos.x, pos.y, pos.z] : pos;
      for (let i = 0; i < qtd; i++) {
        const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI, v = forca * (.4 + Math.random() * .8);
        nova({ x, y, z, vx: Math.cos(th) * Math.sin(ph) * v, vy: Math.cos(ph) * v * .6 + subida, vz: Math.sin(th) * Math.sin(ph) * v,
          rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - .5) * 20, wy: (Math.random() - .5) * 20,
          g: gravidade, arrasto: .6, vida, vidaTotal: vida, tam: tamanho * (.6 + Math.random() * .8), alongar: 1,
          cor: cores[i % cores.length], chao: -50 });
      }
    },
    confete({ cores = ['#ffd23f', '#ff3d7f', '#3df2c2', '#7c5cff', '#ffffff'], qtd = 220, area = [-8, 8], altura = 14, z = [-2, 4], tamanho = .16 } = {}) {
      for (let i = 0; i < qtd; i++) {
        const vida = 4 + Math.random() * 2;
        nova({ x: area[0] + Math.random() * (area[1] - area[0]), y: altura + Math.random() * 6, z: z[0] + Math.random() * (z[1] - z[0]),
          vx: (Math.random() - .5) * 1.5, vy: -1 - Math.random() * 2, vz: (Math.random() - .5),
          rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - .5) * 14, wy: (Math.random() - .5) * 14,
          g: -1.2, arrasto: 1.2, vida, vidaTotal: vida, tam: tamanho, alongar: 1.6, cor: cores[i % cores.length], chao: -50, flutua: true });
      }
    }
  };
}
