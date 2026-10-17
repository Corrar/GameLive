// Cena 3D da Corrida do Chat: autódromo oval à noite, sob holofotes, com arquibancada e torcida,
// asfalto com faixas, zebras, pórtico de largada com semáforo e carros 3D (lataria com verniz na cor
// do piloto, rodas girando, faróis acesos, chamas de nitro). Unidade do mundo = 1 m.
// A lógica da corrida anda em "unidades de pista" (40 = 1 m), as mesmas do jogo 2D antigo.
import { THREE, criarCena, material, malha, caixa, texturaCanvas, textoJogo, texturaMaterial, chao,
  torcida as criarTorcida, criarParticulas, descartar, curvas, mergeGeometries } from '../kit/cena3d.js';
import { corDoNick, iniciais } from '../kit/efeitos.js';

/* ---------- traçado (unidades de pista; o centro do oval é a origem, y cresce para a câmera) ---------- */

export const K = 1 / 40;
export const R = 240, RETA = 640, MEIA = 100;         // raio das curvas, reta e meia largura do asfalto
export const ARCO = Math.PI * R, PER = 2 * RETA + 2 * ARCO;
export const FAIXAS = [-78, -26, 26, 78];             // deslocamento lateral de cada faixa (negativo = dentro)
const C1 = -RETA / 2, C2 = RETA / 2;
const ZEBRA = 18, MURO = 152;                         // largura da zebra; distância do muro ao centro do asfalto
const TAU = Math.PI * 2;
const CAMERA = { pos: [0, 43.7, 56.1], alvo: [0, 0, 4], fov: 30 };
const PODIO_Z = -5;                                   // pódio no gramado do meio, longe do pórtico
const CAM_PODIO = { pos: [0, 10.5, 17.8], alvo: [0, 1.7, PODIO_Z] };

// grade de largada: filas de 4, escalonadas, atrás da linha (s negativo)
export const grade = (i) => -Math.floor(i / 4) * 110 - (i % 2) * 30 - 50;

// s → ponto na linha central e direção do movimento (sentido horário visto de cima, largada no meio da reta esquerda)
export function ponto(s) {
  s = ((s % PER) + PER) % PER;
  if (s < RETA / 2) return { x: -R, y: -s, a: -Math.PI / 2 };
  s -= RETA / 2;
  if (s < ARCO) { const t = Math.PI + s / R; return { x: R * Math.cos(t), y: C1 + R * Math.sin(t), a: t + Math.PI / 2 }; }
  s -= ARCO;
  if (s < RETA) return { x: R, y: C1 + s, a: Math.PI / 2 };
  s -= RETA;
  if (s < ARCO) { const t = s / R; return { x: R * Math.cos(t), y: C2 + R * Math.sin(t), a: t + Math.PI / 2 }; }
  return { x: -R, y: C2 - (s - ARCO), a: -Math.PI / 2 };
}

// ponto da pista no mundo (metros), deslocado f unidades para o lado (f > 0 = para fora)
export function noMundo(s, f = 0) {
  const p = ponto(s);
  return { x: (p.x + f * Math.sin(p.a)) * K, z: (p.y - f * Math.cos(p.a)) * K, a: p.a };
}

// fita que acompanha o oval inteiro entre os deslocamentos f0 e f1 (alturas y0 e y1); v repete "vezes" na volta
function fita(f0, f1, y0, y1, vezes = 1, passos = 320) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= passos; i++) {
    const p = ponto(i / passos * PER), sn = Math.sin(p.a), cs = Math.cos(p.a);
    pos.push((p.x + f0 * sn) * K, y0, (p.y - f0 * cs) * K, (p.x + f1 * sn) * K, y1, (p.y - f1 * cs) * K);
    uv.push(0, i / passos * vezes, 1, i / passos * vezes);
    if (i < passos) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------- utilidades de geometria ---------- */

// sem índice: RoundedBox e as primitivas do three podem ser fundidas juntas
const plano = (g) => (g.index ? g.toNonIndexed() : g);
// cor por vértice: várias peças de cores diferentes viram um mesh só (um draw call)
function pintar(g, cor) {
  g = plano(g);
  const c = new THREE.Color(cor), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const bloco = (l, a, p, raio, x, y, z, seg = 1) => caixa(l, a, p, raio, seg).clone().translate(x, y, z);
// estreita o topo da peça no comprimento (para-brisa e vidro traseiro inclinados)
function afinar(g, k, recua = 0) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * k - recua);
  g.computeVertexNormals();
  return g;
}
function compartilhar(...itens) { for (const i of itens) i.userData.compartilhada = true; return itens[0]; }

/* ---------- carro (frente em +x; 2,2 m × 1,14 m) ---------- */

const ESCALA_CARRO = 1.1;
const RODAS = [[.7, .45], [.7, -.45], [-.7, .45], [-.7, -.45]];
const LUZES = [[1.1, .36, .33, '#fff6dc'], [1.1, .36, -.33, '#fff6dc'], [-1.105, .4, .33, '#ff2436'], [-1.105, .4, -.33, '#ff2436']];
const ESCAPES = [.26, -.26];

function geometriasCarro() {
  // lataria (pintada com a cor do piloto)
  const chassi = caixa(2.2, .3, .96, .1, 3).clone();
  const p = chassi.attributes.position;
  for (let i = 0; i < p.count; i++) { // capô caindo para o bico
    const x = p.getX(i), y = p.getY(i);
    if (x > .75 && y > -.05) p.setY(i, y - (x - .75) * .2);
  }
  chassi.computeVertexNormals();
  chassi.translate(0, .33, 0);
  const lataria = [chassi];
  for (const [x, z] of RODAS) lataria.push(bloco(.62, .26, .24, .08, x, .37, z * .92, 2)); // para-lamas
  lataria.push(afinar(caixa(.66, .06, .76, .03, 2).clone(), .78, .04).translate(-.22, .75, 0)); // teto
  const corpo = mergeGeometries(lataria);

  // detalhes (vidros escuros, aerofólio, faixas, escapamentos) com cor por vértice
  const d = [
    pintar(afinar(caixa(1.04, .3, .82, .1, 2).clone(), .7, .04).translate(-.18, .6, 0), '#0a0f1c'),
    pintar(bloco(.32, .05, 1.12, .02, -.98, .82, 0), '#121318'),
    pintar(bloco(.08, .3, .05, .02, -.98, .64, .36), '#121318'),
    pintar(bloco(.08, .3, .05, .02, -.98, .64, -.36), '#121318'),
    pintar(bloco(.22, .05, 1.08, .02, 1.04, .18, 0), '#121318'),
    pintar(bloco(.04, .1, .56, .015, 1.1, .29, 0), '#0c0d10'),
    pintar(bloco(.48, .012, .2, .004, .58, .487, 0), '#f6f6f6'),
    pintar(bloco(.46, .012, .2, .004, -.24, .786, 0), '#f6f6f6'),
    pintar(bloco(.26, .012, .2, .004, -.9, .487, 0), '#f6f6f6'),
    pintar(bloco(.32, .052, .2, .004, -.98, .825, 0), '#f6f6f6')
  ];
  for (const z of ESCAPES) d.push(pintar(new THREE.CylinderGeometry(.05, .055, .16, 10).rotateZ(Math.PI / 2).translate(-1.12, .22, z), '#8d939e'));
  const detalhe = mergeGeometries(d);

  // roda: pneu, aro pentagonal (dá para ver girando) e cubo
  const roda = mergeGeometries([
    pintar(new THREE.CylinderGeometry(.2, .2, .17, 20).rotateX(Math.PI / 2), '#141418'),
    pintar(new THREE.CylinderGeometry(.125, .125, .176, 5).rotateX(Math.PI / 2), '#d4d9e2'),
    pintar(new THREE.CylinderGeometry(.045, .045, .18, 8).rotateX(Math.PI / 2), '#2a2c33')
  ]);

  // chama do escapamento (aponta para trás, base no cano)
  const chamas = [];
  for (const z of ESCAPES) {
    chamas.push(pintar(new THREE.ConeGeometry(.09, .6, 10, 1, true).rotateZ(Math.PI / 2).translate(-.3, 0, z), '#ff5a14'));
    chamas.push(pintar(new THREE.ConeGeometry(.05, .36, 8, 1, true).rotateZ(Math.PI / 2).translate(-.18, 0, z), '#fff2a8'));
  }
  const chama = mergeGeometries(chamas);

  // coroa do líder
  const pecasCoroa = [pintar(new THREE.CylinderGeometry(.34, .3, .24, 20, 1, true), '#ffcf3a')];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU, x = Math.cos(a) * .33, z = Math.sin(a) * .33;
    pecasCoroa.push(pintar(new THREE.ConeGeometry(.085, .26, 8).translate(x, .25, z), '#ffcf3a'));
    pecasCoroa.push(pintar(new THREE.SphereGeometry(.055, 10, 8).translate(x, .4, z), '#ff2d55'));
  }
  const coroa = mergeGeometries(pecasCoroa);
  for (const g of [corpo, detalhe, roda, chama, coroa]) compartilhar(g);
  return { corpo, detalhe, roda, chama, coroa };
}

/* ---------- partículas que brilham (pontos com degradê, um draw call por sistema) ---------- */

function criarBrilhos(c3d, { max = 500, aditivo = true } = {}) {
  const pos = new Float32Array(max * 3), cor = new Float32Array(max * 4), tam = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  const atributo = (nome, arr, n) => {
    const a = new THREE.BufferAttribute(arr, n);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(nome, a);
    return a;
  };
  const aPos = atributo('position', pos, 3), aCor = atributo('cor', cor, 4), aTam = atributo('tam', tam, 1);
  const altura = c3d.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { escala: { value: altura / (2 * Math.tan(THREE.MathUtils.degToRad(c3d.camera.fov) / 2)) } },
    vertexShader: `attribute vec4 cor; attribute float tam; uniform float escala; varying vec4 vCor;
      void main() {
        vCor = cor;
        vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_PointSize = tam * escala / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying vec4 vCor;
      void main() {
        float d = length(gl_PointCoord - .5) * 2.;
        float a = 1. - smoothstep(${aditivo ? '0.' : '.35'}, 1., d);
        gl_FragColor = vec4(vCor.rgb, vCor.a * a ${aditivo ? '* a' : ''});
        #include <colorspace_fragment>
      }`
  });
  const pontos = new THREE.Points(geo, mat);
  pontos.frustumCulled = false;
  pontos.renderOrder = aditivo ? 6 : 5;
  c3d.cena.add(pontos);

  const vivas = [], fixos = [];
  const cores = new Map();
  const corDe = (c) => { if (!cores.has(c)) cores.set(c, new THREE.Color(c)); return cores.get(c); };
  const sorteio = (l) => l[Math.floor(Math.random() * l.length)];
  return {
    // nuvem de partículas: dir = direção principal (com abertura), senão sai para todo lado
    emitir(x, y, z, { qtd = 10, cores: lista = ['#ffffff'], fim = null, vel = 2, vida = .6, tam: t = [.4, .1], gravidade = 0,
      dir = null, abre = 1, arrasto = 1.5, subida = 0, alfa = 1, espalha = 0 } = {}) {
      for (let i = 0; i < qtd; i++) {
        if (vivas.length >= max - 120) return; // cheio: as novas esperam vaga (sem shift O(n))
        let vx, vy, vz;
        if (dir) { vx = dir.x + (Math.random() - .5) * abre; vy = dir.y + (Math.random() - .5) * abre; vz = dir.z + (Math.random() - .5) * abre; }
        else {
          const th = Math.random() * TAU, ph = Math.acos(2 * Math.random() - 1);
          vx = Math.sin(ph) * Math.cos(th); vy = Math.cos(ph); vz = Math.sin(ph) * Math.sin(th);
        }
        const v = vel * (.4 + Math.random() * .6), dur = vida * (.6 + Math.random() * .4);
        vivas.push({ x: x + (Math.random() - .5) * espalha, y, z: z + (Math.random() - .5) * espalha, vx: vx * v, vy: vy * v + subida, vz: vz * v,
          vida: dur, total: dur, t0: t[0], t1: t[1], g: gravidade, arrasto, alfa, c0: corDe(sorteio(lista)), c1: corDe(fim ?? sorteio(lista)) });
      }
    },
    // brilho parado só neste quadro (faróis, lanternas)
    fixo(x, y, z, cor, t, alfa = 1) { if (fixos.length < 120) fixos.push({ x, y, z, c: corDe(cor), t, alfa }); },
    passo(dt) {
      let n = 0;
      for (let i = vivas.length - 1; i >= 0; i--) {
        const p = vivas[i];
        // troca com a última e encurta (a ordem não importa)
        if ((p.vida -= dt) <= 0) { vivas[i] = vivas[vivas.length - 1]; vivas.pop(); continue; }
        const ar = Math.max(0, 1 - p.arrasto * dt);
        p.vx *= ar; p.vz *= ar; p.vy = p.vy * ar + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      }
      const escreve = (x, y, z, r, g, b, a, t) => {
        pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z;
        cor[n * 4] = r; cor[n * 4 + 1] = g; cor[n * 4 + 2] = b; cor[n * 4 + 3] = a;
        tam[n++] = t;
      };
      for (const p of vivas) {
        const k = p.vida / p.total, e = 1 - k;
        escreve(p.x, p.y, p.z, p.c0.r + (p.c1.r - p.c0.r) * e, p.c0.g + (p.c1.g - p.c0.g) * e, p.c0.b + (p.c1.b - p.c0.b) * e,
          p.alfa * Math.min(1, k * 2.5), p.t0 + (p.t1 - p.t0) * e);
      }
      for (const f of fixos) escreve(f.x, f.y, f.z, f.c.r, f.c.g, f.c.b, f.alfa, f.t);
      fixos.length = 0;
      geo.setDrawRange(0, n);
      aPos.needsUpdate = aCor.needsUpdate = aTam.needsUpdate = true;
    },
    limpar() { vivas.length = 0; }
  };
}

/* ---------- etiqueta do piloto: pílula com posição, avatar e nome, flutuando sobre o carro ---------- */

const ETQ_ALTURA = 1.08, ETQ_W = 512, ETQ_H = 136;
function criarEtiqueta(c) {
  const W = ETQ_W, H = ETQ_H;
  const t = texturaCanvas(W, H, () => {});
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.textura, transparent: true, depthWrite: false, depthTest: false }));
  sprite.center.set(.5, 0);
  sprite.geometry.userData.compartilhada = true; // geometria única de todos os sprites do three
  sprite.scale.set(ETQ_ALTURA * W / H, ETQ_ALTURA, 1);
  const nome = cortar(c.nome, 12);
  let img = null, pos = 0;
  const et = { sprite, larg: W, posicao(n) { if (n !== pos) { pos = n; desenhar(); } } };
  function desenhar() {
    t.atualizar((ctx) => {
      ctx.font = '400 54px "Lilita One", sans-serif';
      const larg = Math.min(W - 20, ctx.measureText(nome).width + 136);
      const x0 = (W - larg) / 2;
      // pílula escura com borda na cor do carro
      ctx.fillStyle = 'rgba(14,10,32,.92)';
      ctx.strokeStyle = c.cor;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.roundRect(x0, 22, larg, 100, 50); ctx.fill(); ctx.stroke();
      et.larg = larg;
      // avatar
      const ax = x0 + 52, ay = 72;
      ctx.beginPath(); ctx.arc(ax, ay, 44, 0, TAU); ctx.fillStyle = c.cor; ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(ax, ay, 37, 0, TAU); ctx.clip();
      if (img) ctx.drawImage(img, ax - 37, ay - 37, 74, 74);
      else {
        ctx.fillStyle = corDoNick(c.user); ctx.fillRect(ax - 40, ay - 40, 80, 80);
        textoJogo(ctx, iniciais(c.nome), ax, ay + 3, { tamanho: 34, sombra: false, cor: '#1a1030', contorno: 'rgba(0,0,0,0)', espessura: 0 });
      }
      ctx.restore();
      textoJogo(ctx, nome, x0 + 106, 76, { tamanho: 54, alinhar: 'left', larguraMax: larg - 124, espessura: .16 });
      // número da posição no canto da pílula
      if (pos) {
        ctx.beginPath(); ctx.arc(x0 + 16, 28, 25, 0, TAU);
        ctx.fillStyle = pos === 1 ? '#ffd23f' : '#ffffff'; ctx.fill();
        ctx.lineWidth = 5; ctx.strokeStyle = '#1a1030'; ctx.stroke();
        textoJogo(ctx, pos, x0 + 16, 30, { tamanho: 34, cor: '#1a1030', contorno: 'rgba(0,0,0,0)', espessura: 0, sombra: false });
      }
    });
  }
  desenhar();
  if (c.fotoUrl) {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.referrerPolicy = 'no-referrer';
    im.onload = () => { img = im; desenhar(); };
    im.src = c.fotoUrl;
  }
  return et;
}
const cortar = (nome, n) => { const l = Array.from(String(nome)); return l.length > n ? l.slice(0, n - 1).join('') + '…' : String(nome); };

/* ---------- cena ---------- */

export function criarPista3d(palco, cfg, { max = 12 } = {}) {
  const transparente = cfg.fundo === 'transparente';
  const cenario = !transparente && cfg.cenario !== false;
  const c3d = criarCena(palco, {
    cfg, luz: 'noite', exposicao: 1, camera: CAMERA,
    fundo: transparente ? null : cenario ? '#070b1c' : (cfg.fundo ?? '#0b0d17'),
    sol: { pos: [-27, 17, 8], alcance: 22 },
    neblina: cenario ? { cor: '#0a1030', perto: 85, longe: 175 } : null
  });
  const { cena, camera } = c3d;
  const baixa = c3d.qualidade.nome === 'baixa';
  // refletores do estádio: luz branca fria, forte, de cima; céu noturno azulado no preenchimento
  c3d.sol.color.set('#fff3e2');
  c3d.sol.intensity = 2.75;
  c3d.hemi.color.set('#6f80d8');
  c3d.hemi.groundColor.set('#141826');
  c3d.hemi.intensity = .38;
  if (cena.environment) cena.environmentIntensity = .42;

  const part = criarParticulas(c3d, { max: 500 });
  const brilho = criarBrilhos(c3d, { max: 700, aditivo: true });
  const fumaca = criarBrilhos(c3d, { max: 260, aditivo: false });
  const GEO = geometriasCarro();

  /* ---------- chão, asfalto, zebras, muro ---------- */
  if (cenario) {
    const grama = chao(c3d, { tipo: 'grama', cor: '#2f8a38', largura: 170, profundidade: 170, repetir: [34, 34], relevo: .03 });
    // grama cortada em faixas (claras e escuras) atravessando o estádio
    const cv = grama.material.map.image, g2 = cv.getContext('2d');
    g2.fillStyle = 'rgba(255,255,255,.075)';
    g2.fillRect(0, 0, cv.width, cv.height / 2);
    grama.material.map.needsUpdate = true;
  } else {
    // sem cenário: só a sombra dos carros num chão invisível
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: .35 }));
    sombra.rotation.x = -Math.PI / 2;
    sombra.receiveShadow = true;
    cena.add(sombra);
  }

  const voltaM = PER * K;
  const asf = texturaMaterial('asfalto', { cor: '#2d2f36', repetir: [1, 1], semente: 3 });
  {
    // faixas pintadas e o "trilho de borracha" por cima do granulado (u atravessa a pista, v acompanha)
    const cv = asf.mapa.image, g = cv.getContext('2d'), w = cv.width, h = cv.height;
    const borracha = g.createLinearGradient(w * .08, 0, w * .48, 0);
    borracha.addColorStop(0, 'rgba(0,0,0,0)'); borracha.addColorStop(.5, 'rgba(0,0,0,.16)'); borracha.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = borracha; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.fillRect(w * .012, 0, w * .022, h); g.fillRect(w * .966, 0, w * .022, h);
    g.fillStyle = 'rgba(255,255,255,.6)';
    for (const u of [.25, .5, .75]) g.fillRect(w * u - 4, 0, 8, h * .42);
    asf.mapa.needsUpdate = true;
  }
  const asfalto = malha(fita(-MEIA, MEIA, .02, .02, Math.round(voltaM / 4.2)),
    material('#ffffff', { mapa: asf.mapa, relevo: asf.relevo, escalaRelevo: .5, rugosidade: .74 }), { sombra: false });
  cena.add(asfalto);

  const zebraTex = texturaCanvas(32, 64, (ctx, w, h) => {
    ctx.fillStyle = '#c8141e'; ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = '#ecebe6'; ctx.fillRect(0, h / 2, w, h / 2);
  }, { repetir: [1, 1] }).textura;
  zebraTex.magFilter = THREE.NearestFilter;
  const zebras = malha(mergeGeometries([
    fita(-MEIA - ZEBRA, -MEIA, .065, .02, Math.round(voltaM * .82 / 1.7)),
    fita(MEIA, MEIA + ZEBRA, .02, .065, Math.round(voltaM * 1.18 / 1.7))
  ]), material('#ffffff', { mapa: zebraTex, rugosidade: .4, verniz: .4 }), { sombra: false });
  cena.add(zebras);

  // muro externo com placas de LED viradas para a pista
  const placas = texturaCanvas(1024, 64, (ctx) => {
    const FUNDOS = ['#e8343c', '#141833', '#ffd23f', '#2457ff'], TEXTOS = ['CORRIDA DO CHAT', 'COMENTE E CORRA', 'AO VIVO', 'NITRO TURBO'];
    FUNDOS.forEach((f, i) => {
      ctx.fillStyle = f; ctx.fillRect(i * 256, 0, 256, 64);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(i * 256, 0, 256, 6);
      textoJogo(ctx, TEXTOS[i], i * 256 + 128, 34, { tamanho: 34, larguraMax: 232, cor: i === 2 ? '#1a1030' : '#ffffff',
        contorno: i === 2 ? 'rgba(0,0,0,0)' : '#1a1030', espessura: i === 2 ? 0 : .14, sombra: false });
    });
  }, { repetir: [1, 1] }).textura;
  const muroFace = malha(fita(MURO, MURO, 0, .72, 8),
    material('#ffffff', { mapa: placas, emissivo: '#ffffff', intensidadeEmissiva: .55, rugosidade: .4 }), { recebe: true });
  muroFace.material.emissiveMap = placas;
  const muroResto = malha(mergeGeometries([fita(MURO, MURO + 9, .72, .72), fita(MURO + 9, MURO + 9, .72, 0)]),
    material('#b9bcc4', { rugosidade: .8 }));
  cena.add(muroFace, muroResto);

  // linha de chegada quadriculada e marcas da grade
  const xadrez = texturaCanvas(256, 36, (ctx) => {
    for (let i = 0; i < 14; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#f4f4f4' : '#111216'; ctx.fillRect(i * 256 / 14, j * 18, 256 / 14 + 1, 18); }
  }).textura;
  const linha = malha(new THREE.PlaneGeometry(MEIA * 2 * K, .72).rotateX(-Math.PI / 2),
    material('#ffffff', { mapa: xadrez, rugosidade: .5 }), { sombra: false });
  Object.assign(linha.material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  linha.position.set(-R * K, .025, 0);
  cena.add(linha);
  {
    const marcas = [];
    for (let i = 0; i < Math.max(12, max); i++) {
      const w = noMundo(grade(i) + 52, FAIXAS[i % 4]);
      marcas.push(new THREE.PlaneGeometry(.12, 1.05).rotateX(-Math.PI / 2).rotateY(-w.a).translate(w.x, .024, w.z));
    }
    const m = malha(mergeGeometries(marcas), material('#ffffff', { rugosidade: .6 }), { sombra: false });
    Object.assign(m.material, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    cena.add(m);
  }

  /* ---------- pórtico de largada com semáforo ---------- */
  // pórtico em balanço: uma coluna só, do lado de fora (o gramado do meio fica livre para o pódio)
  const XL = -R * K, VAO = (MEIA + ZEBRA + 16) * K, PONTA = XL + (MEIA + ZEBRA) * K;
  const XV = (XL - VAO - .3 + PONTA) / 2, LV = PONTA - (XL - VAO - .3);
  const portico = malha(mergeGeometries([
    bloco(.62, 4.1, .62, .08, XL - VAO, 2.05, 0),
    bloco(LV, .82, .46, .08, XV, 3.62, 0),
    caixa(1.5, .16, .2, .04, 1).clone().rotateZ(.62).translate(XL - VAO + .62, 3.02, 0) // mão-francesa
  ].map(plano)), material('#e9ecf2', { rugosidade: .35, metal: .5, verniz: .5 }));
  cena.add(portico);
  let estadoLuzes = null;
  const painel = texturaCanvas(1024, 112, () => {});
  function pintarPainel() {
    painel.atualizar((ctx, w, h) => {
      ctx.fillStyle = '#0d0f1c'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < w; i += 64) { ctx.fillStyle = (i / 64) % 2 ? '#141833' : '#10132a'; ctx.fillRect(i, 0, 64, h); }
      textoJogo(ctx, 'CHEGADA', w / 2, h / 2 + 4, { tamanho: 74, cor: '#ffd23f', espessura: .14 });
      // 3 pares de lâmpadas: acendem de fora para dentro na contagem; todas verdes no "JÁ"
      const acesas = estadoLuzes === null ? 0 : estadoLuzes === 0 ? 3 : 4 - estadoLuzes;
      [70, 160, 250].forEach((x, i) => {
        for (const lx of [x, w - x]) {
          const on = estadoLuzes === 0 || i < acesas;
          const cor = estadoLuzes === 0 ? '#3dff7a' : on ? '#ff2b2b' : '#3a1418';
          if (on) { const gl = ctx.createRadialGradient(lx, h / 2, 6, lx, h / 2, 52); gl.addColorStop(0, cor); gl.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gl; ctx.fillRect(lx - 52, 0, 104, h); }
          ctx.beginPath(); ctx.arc(lx, h / 2, 30, 0, TAU); ctx.fillStyle = cor; ctx.fill();
          ctx.lineWidth = 5; ctx.strokeStyle = '#05060c'; ctx.stroke();
        }
      });
    });
  }
  pintarPainel();
  const faixaPortico = new THREE.Mesh(new THREE.PlaneGeometry(LV - .2, .7),
    new THREE.MeshStandardMaterial({ map: painel.textura, emissiveMap: painel.textura, emissive: '#ffffff', emissiveIntensity: 1.1, roughness: .4 }));
  faixaPortico.position.set(XV, 3.62, .26);
  cena.add(faixaPortico);

  /* ---------- arquibancadas, torres de luz ---------- */
  let torcidas = [];
  const flashes = [];
  if (cenario) {
    const CORES_TORCIDA = ['#ff3d7f', '#3df2c2', '#ffd23f', '#5b8cff', '#ffffff', '#ff8a3d', '#b06bff', '#e8343c'];
    const mEstrutura = material('#3d4357', { rugosidade: .85 });
    function arquibancada(x, z, giro, porFileira, fileiras) {
      const t = criarTorcida(c3d, { fileiras, porFileira, origem: [-(porFileira - 1) * .41, .95, -.6], passoX: .82, passoZ: -1.1, subida: .6,
        cores: CORES_TORCIDA, arquibancada: '#4a5068' });
      // degraus fundidos num mesh só (um draw call por arquibancada)
      const degraus = t.degraus.children.map((d) => { d.updateMatrix(); return d.geometry.clone().applyMatrix4(d.matrix); });
      t.degraus.children.forEach((d) => d.geometry.dispose());
      const g = new THREE.Group();
      const largura = porFileira * .82 + 2, fundo = fileiras * 1.1;
      g.add(malha(mergeGeometries([
        ...degraus,
        new THREE.BoxGeometry(largura, .62, .5).translate(0, .31, 0),                       // mureta da frente
        new THREE.BoxGeometry(largura, fileiras * .6 + 2.2, .5).translate(0, (fileiras * .6 + 2.2) / 2, -fundo - .1) // parede do fundo
      ]), mEstrutura, { sombra: false }), t.corpos, t.cabecas);
      t.degraus.removeFromParent();
      g.position.set(x, 0, z);
      g.rotation.y = giro;
      cena.add(g);
      torcidas.push(t);
      flashes.push({ g, largura: porFileira * .82, fileiras });
    }
    const fil = baixa ? 6 : 9;
    arquibancada(0, -19.3, 0, 32, fil);
    arquibancada(-9.6, -15.6, Math.PI / 4, 11, fil - 1);
    arquibancada(9.6, -15.6, -Math.PI / 4, 11, fil - 1);
  }

  /* ---------- pódio (no gramado do meio, aparece no fim da corrida) ---------- */
  const podio = new THREE.Group();
  podio.position.z = PODIO_Z;
  podio.visible = false;
  cena.add(podio);
  const DEGRAUS = [{ x: 0, h: 1.15, cor: '#ffc93a', n: '1' }, { x: -1.78, h: .8, cor: '#d8dde8', n: '2' }, { x: 1.78, h: .55, cor: '#d98a4e', n: '3' }];
  const tapete = malha(caixa(5.6, .1, 3.1, .03).clone().translate(0, .05, 0), material('#8a1430', { rugosidade: .9, brilho: .5 }));
  podio.add(tapete);
  const degraus = DEGRAUS.map((d) => {
    const g = new THREE.Group();
    g.position.x = d.x;
    const m = malha(caixa(1.72, d.h, 2.4, .07).clone().translate(0, d.h / 2 + .1, 0), material(d.cor, { metal: .75, rugosidade: .28, verniz: .6 }));
    const num = texturaCanvas(128, 128, (ctx) => textoJogo(ctx, d.n, 64, 70, { tamanho: 104, cor: '#ffffff', espessura: .16 }));
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshStandardMaterial({ map: num.textura, transparent: true, roughness: .5 }));
    placa.position.set(0, Math.max(.55, d.h / 2 + .1), 1.215);
    g.add(m, placa);
    g.scale.y = .001;
    podio.add(g);
    return { ...d, g, t: 0, sobe: false };
  });
  let confeteEm = 0;

  /* ---------- efeitos reaproveitáveis ---------- */
  const efeitosAditivos = (cor) => new THREE.MeshBasicMaterial({ color: cor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const geoAnel = new THREE.TorusGeometry(1, .07, 8, 48).rotateX(Math.PI / 2);
  const aneis = Array.from({ length: 6 }, (_, i) => {
    const m = new THREE.Mesh(geoAnel, efeitosAditivos(i % 2 ? '#41d7ff' : '#b06bff'));
    m.visible = false; cena.add(m);
    return { m, t: 1 };
  });
  const degradeFeixe = texturaCanvas(4, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }).textura;
  const geoFeixe = new THREE.CylinderGeometry(.75, .75, 4.2, 24, 1, true).translate(0, 2.1, 0);
  const feixes = Array.from({ length: 2 }, () => {
    const mat = efeitosAditivos('#c08bff');
    mat.map = degradeFeixe; mat.side = THREE.DoubleSide;
    const m = new THREE.Mesh(geoFeixe, mat);
    m.visible = false; cena.add(m);
    return { m, t: 1 };
  });

  // poças de óleo: preto brilhante com reflexo furta-cor
  const matOleo = new THREE.MeshPhysicalMaterial({ color: '#040406', roughness: .04, metalness: .5, clearcoat: 1, clearcoatRoughness: .02,
    emissive: '#160a2e',
    iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 800], envMapIntensity: 2.2,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const geoPocas = [0, 1, 2].map((k) => {
    const forma = new THREE.Shape();
    for (let i = 0; i <= 28; i++) {
      const a = i / 28 * TAU, r = 1 + .18 * Math.sin(a * 3 + k * 2) + .1 * Math.sin(a * 5 + k);
      i ? forma.lineTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * .85) : forma.moveTo(Math.cos(a) * r * 1.15, Math.sin(a) * r * .85);
    }
    return new THREE.ShapeGeometry(forma, 6).rotateX(-Math.PI / 2);
  });
  const pocas = Array.from({ length: 8 }, (_, i) => {
    const m = malha(geoPocas[i % 3], matOleo, { sombra: false });
    m.visible = false; cena.add(m);
    return { m, vida: 0 };
  });

  // marcas de pneu (derrapagem), cada uma com a própria transparência para sumir aos poucos
  const MAX_MARCAS = 360;
  const geoMarca = new THREE.PlaneGeometry(.13, .3).rotateX(-Math.PI / 2);
  const alfaMarcas = new THREE.InstancedBufferAttribute(new Float32Array(MAX_MARCAS), 1);
  alfaMarcas.setUsage(THREE.DynamicDrawUsage);
  geoMarca.setAttribute('alfa', alfaMarcas);
  const marcas = new THREE.InstancedMesh(geoMarca, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute float alfa; varying float vA;
      void main() { vA = alfa; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`,
    fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(.02, .02, .025, vA * .5); }'
  }), MAX_MARCAS);
  marcas.frustumCulled = false;
  marcas.count = 0;
  const marcasInfo = [];
  let marcaProx = 0;
  cena.add(marcas);

  /* ---------- peças instanciadas de todos os carros ---------- */
  const mDetalhe = compartilhar(material('#ffffff', { rugosidade: .22, metal: .25, verniz: 1 }));
  mDetalhe.vertexColors = true;
  const mRoda = material('#ffffff', { rugosidade: .55, metal: .35 });
  mRoda.vertexColors = true;
  const rodas = new THREE.InstancedMesh(GEO.roda, mRoda, max * 4);
  rodas.castShadow = true;
  rodas.frustumCulled = false;
  const luzes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), max * 4);
  luzes.frustumCulled = false;
  const sombraTex = texturaCanvas(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,.85)'); g.addColorStop(.55, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }).textura;
  const sombras = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.9, 1.7).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: sombraTex, transparent: true, depthWrite: false, opacity: .75 }), max);
  sombras.frustumCulled = false;
  sombras.renderOrder = 1;
  cena.add(rodas, luzes, sombras);
  const mChama = compartilhar(efeitosAditivos('#ffffff'));
  mChama.vertexColors = true; mChama.side = THREE.DoubleSide;
  const mChamaTurbo = compartilhar(efeitosAditivos('#ff7ab8'));
  mChamaTurbo.vertexColors = true; mChamaTurbo.side = THREE.DoubleSide;
  // rastro de luz no asfalto atrás de quem está no nitro/turbo (aparece mesmo com a etiqueta por cima do carro)
  const rastroTex = texturaCanvas(128, 32, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.7, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const borda = ctx.createLinearGradient(0, 0, 0, h);
    borda.addColorStop(0, 'rgba(0,0,0,1)'); borda.addColorStop(.35, 'rgba(0,0,0,0)'); borda.addColorStop(.65, 'rgba(0,0,0,0)'); borda.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = borda; ctx.fillRect(0, 0, w, h);
  }).textura;
  const geoRastro = compartilhar(new THREE.PlaneGeometry(5.5, .95).rotateX(-Math.PI / 2).translate(-3.95, .2, 0));
  const mRastro = compartilhar(efeitosAditivos('#ff8a2a'));
  const mRastroTurbo = compartilhar(efeitosAditivos('#ff4f9a'));
  for (const m of [mRastro, mRastroTurbo]) { m.map = rastroTex; m.side = THREE.DoubleSide; }
  const coroa = malha(GEO.coroa, material('#ffffff', { metal: .85, rugosidade: .25, emissivo: '#3a2600', lados: THREE.DoubleSide }));
  coroa.material.vertexColors = true;
  coroa.visible = false;
  cena.add(coroa);

  /* ---------- carros ---------- */
  // guardar: chegou durante o pódio; fica escondido (sem etiqueta, sem efeito) até a próxima largada
  function adicionar(c, { cair = true, guardar = false } = {}) {
    const grupo = new THREE.Group();
    const corpo = new THREE.Group();
    // tinta um pouco mais escura que a cor do piloto: com luz forte e verniz ela continua saturada
    const mCor = material(new THREE.Color(c.cor).multiplyScalar(.62), { rugosidade: .34, metal: .05, verniz: .7 });
    mCor.envMapIntensity = .5;
    const lataria = malha(GEO.corpo, mCor), detalhe = malha(GEO.detalhe, mDetalhe);
    const chama = new THREE.Mesh(GEO.chama, mChama);
    chama.position.set(-1.18, .22, 0);
    chama.visible = false;
    const rastro = new THREE.Mesh(geoRastro, mRastro);
    rastro.visible = false;
    corpo.add(lataria, detalhe, chama);
    const etiqueta = criarEtiqueta(c);
    etiqueta.sprite.position.y = 1.45;
    grupo.add(corpo, rastro, etiqueta.sprite);
    cena.add(grupo);
    // a etiqueta nasce pequena e cresce: o ordenar() decide o tamanho (no pódio, nem aparece)
    c.v3d = { grupo, corpo, mCor, chama, rastro, etiqueta, f: FAIXAS[c.faixa], sAntes: c.s, roda: 0, queda: cair ? 1 : 0, surge: 0,
      escala: 0, alvoEscala: cam.modo === 'podio' || guardar ? 0 : .55, cx: .5, cy: 0, nivel: 0, fogo: 0, derrapa: 0,
      fase: Math.random() * 6, podio: null, guardado: guardar, brilhoEm: '' };
    etiqueta.sprite.scale.set(1e-4, 1e-4, 1);
    const w = noMundo(c.s, c.v3d.f);
    grupo.position.set(w.x, 0, w.z);
    grupo.visible = false; // aparece no próximo quadro, já no lugar certo
  }

  function remover(c) {
    const v = c.v3d;
    if (!v) return;
    const p = v.grupo.position;
    fumaca.emitir(p.x, .5, p.z, { qtd: 16, cores: ['#9aa0b2', '#c9cdd8'], vel: 2.5, vida: .9, tam: [.6, 1.6], alfa: .55, subida: 1.2 });
    part.explodir([p.x, .6, p.z], { cores: [c.cor, '#ffffff', '#9aa0b2'], qtd: 14, forca: 4, tamanho: .12 });
    descartar(v.grupo);
    c.v3d = null;
  }

  const m4 = new THREE.Matrix4(), m4b = new THREE.Matrix4(), v3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), e3 = new THREE.Euler(), s3 = new THREE.Vector3();
  const cor = new THREE.Color();
  let nRodas = 0, nLuzes = 0, nSombras = 0;

  function atualizarCarro(c, dt, t) {
    const v = c.v3d;
    if (v.guardado) { v.grupo.visible = false; return; }
    const df = (FAIXAS[c.faixa] - v.f) * Math.min(1, dt * 3.5);
    v.f += df;
    const w = noMundo(c.s, v.f);
    const ds = c.s - v.sAntes;
    v.sAntes = c.s;
    if (ds > 0 && ds < 200) v.roda += ds * K / .2;
    // troca de faixa: o bico aponta para onde o carro vai (ultrapassagem de verdade)
    const desvio = ds > .5 && ds < 200 && !c.giro ? Math.max(-.35, Math.min(.35, Math.atan2(df, ds))) : 0;
    v.desvio = (v.desvio ?? 0) + (desvio - (v.desvio ?? 0)) * Math.min(1, dt * 12);
    let x = w.x, y = 0, z = w.z, giro = -(w.a + (c.giro || 0)) + v.desvio;
    if (v.podio) {
      const P = v.podio;
      P.k = Math.min(1, P.k + dt / P.dur);
      const e = curvas.suave(Math.max(0, P.k));
      x = P.de.x + (P.para.x - P.de.x) * e;
      z = P.de.z + (P.para.z - P.de.z) * e;
      y = P.para.y * e + Math.sin(Math.max(0, P.k) * Math.PI) * 2.6;
      giro = P.de.giro + (P.para.giro - P.de.giro) * e;
      if (P.k >= 1 && !P.pousou) { P.pousou = true; poeira(x, P.para.y, z, c.cor); }
    }
    if (v.queda > 0) {
      v.queda = Math.max(0, v.queda - dt * 1.7);
      // largada em fila: quem ainda não é a vez fica escondido; cai de pouca altura, sem voar sobre a torcida
      v.grupo.visible = v.queda <= 1;
      if (!v.grupo.visible) return;
      const k = Math.min(1, v.queda);
      y += 2.4 * k * k;
      if (v.queda === 0) poeira(x, 0, z, c.cor);
    }
    v.surge = Math.max(0, v.surge - dt * 2.2);
    const pulo = Math.sin((c.pulso || 0) * Math.PI) * .35;
    v.grupo.visible = true;
    v.grupo.position.set(x, y, z);
    v.grupo.rotation.y = giro;
    v.grupo.scale.setScalar(ESCALA_CARRO * Math.max(.001, 1 - curvas.entrada(v.surge)));
    // suspensão: balanço leve; nariz sobe no nitro
    v.corpo.position.y = pulo + Math.sin(t * 23 + v.fase) * (c.nitro > 0 ? .02 : .007);
    v.corpo.rotation.z += (((c.nitro > 0) ? .06 : (c.turbo > 0) ? .025 : 0) - v.corpo.rotation.z) * Math.min(1, dt * 6);
    v.escala += (v.alvoEscala * (1 + (c.pulso || 0) * .35) - v.escala) * Math.min(1, dt * 10);
    v.etiqueta.sprite.scale.set(ETQ_ALTURA * ETQ_W / ETQ_H * v.escala + 1e-4, ETQ_ALTURA * v.escala + 1e-4, 1);
    // empilhada: sobe "nivel" alturas de etiqueta na tela (center.y negativo desloca o sprite para cima)
    v.cy += (-v.nivel * 1.06 - v.cy) * Math.min(1, dt * 8);
    v.etiqueta.sprite.center.y = v.cy;
    v.grupo.updateMatrixWorld(true);
    ancorarEtiqueta(v, dt);

    // rodas, faróis e sombra de contato (instanciados)
    for (const [rx, rz] of RODAS) {
      m4b.makeRotationZ(-v.roda).setPosition(rx, .2, rz);
      rodas.setMatrixAt(nRodas++, m4.multiplyMatrices(v.grupo.matrixWorld, m4b));
    }
    for (const [lx, ly, lz, lc] of LUZES) {
      m4b.compose(v3.set(lx, ly, lz), q4.identity(), s3.set(.04, .075, .21));
      luzes.setMatrixAt(nLuzes, m4.multiplyMatrices(v.corpo.matrixWorld, m4b));
      luzes.setColorAt(nLuzes++, cor.set(lc));
      v3.set(lx + Math.sign(lx) * .08, ly, lz).applyMatrix4(v.corpo.matrixWorld);
      brilho.fixo(v3.x, v3.y, v3.z, lx > 0 ? '#fff1c8' : '#ff2a2a', lx > 0 ? .95 : .6, lx > 0 ? .55 : .5);
    }
    const alto = Math.max(0, y);
    sombras.setMatrixAt(nSombras++, m4.compose(v3.set(x, .03, z), q4.setFromEuler(e3.set(0, giro, 0)), s3.setScalar(Math.max(.35, 1 - alto * .07) * v.grupo.scale.x)));

    // nitro: chamas e fogo saindo do escapamento; turbo: chama rosa
    const nitro = c.nitro > 0, turbo = !nitro && c.turbo > 0;
    v.chama.visible = v.rastro.visible = nitro || turbo;
    const emis = nitro ? '#ff6a00' : turbo ? '#ff3d7f' : '#000000';
    if (emis !== v.brilhoEm) { v.brilhoEm = emis; v.mCor.emissive.set(emis); }
    v.mCor.emissiveIntensity = nitro ? .35 + Math.random() * .15 : .2;
    if (v.chama.visible) {
      v.chama.material = nitro ? mChama : mChamaTurbo;
      v.rastro.material = nitro ? mRastro : mRastroTurbo;
      v.rastro.scale.x = (nitro ? 1 : .55) * (.9 + Math.random() * .2);
      v.chama.scale.set((nitro ? 1.7 : .8) * (.75 + Math.random() * .5), nitro ? 1.5 : 1, nitro ? 1.5 : 1);
      v.fogo += dt * (nitro ? 70 : 18);
      const tras = v3.set(-Math.cos(giro), 0, Math.sin(giro));
      while (v.fogo >= 1) {
        v.fogo -= 1;
        const lado = ESCAPES[Math.random() < .5 ? 0 : 1];
        const px = x - Math.cos(giro) * 1.25 + Math.sin(giro) * lado, pz = z + Math.sin(giro) * 1.25 + Math.cos(giro) * lado;
        if (nitro) brilho.emitir(px, y + .24, pz, { qtd: 1, cores: ['#fff3b0', '#ffd23f', '#ff9a3d'], fim: '#ff2200', vel: 6, vida: .45, tam: [.85, .15], dir: tras, abre: .7, subida: .6 });
        else brilho.emitir(px, y + .24, pz, { qtd: 1, cores: ['#ff7aa8', '#ffd1e3'], fim: '#ff3d7f', vel: 3, vida: .3, tam: [.32, .06], dir: tras, abre: .6 });
      }
      if (nitro && Math.random() < dt * 9) fumaca.emitir(x - Math.cos(giro) * 1.5, y + .35, z + Math.sin(giro) * 1.5, { qtd: 1, cores: ['#9aa0ae'], vel: .8, vida: .8, tam: [.35, 1.1], alfa: .22, subida: 1.1 });
    }
    // óleo: carro rodando, fumaça e marcas de pneu
    if (c.oleo > 0) {
      v.derrapa += dt;
      if (v.derrapa > .022) {
        v.derrapa = 0;
        for (const [rx, rz] of [RODAS[2], RODAS[3]]) {
          v3.set(rx, 0, rz).applyMatrix4(v.grupo.matrixWorld);
          marcar(v3.x, v3.z, giro);
        }
      }
      if (Math.random() < dt * 12) fumaca.emitir(x, .4, z, { qtd: 1, cores: ['#c4c8d2', '#e2e4ea'], vel: 1.2, vida: 1, tam: [.5, 1.5], alfa: .3, subida: 1.2, espalha: 1.2 });
    }
  }

  // a pílula escorrega para o lado de fora da pista e nunca sai da tela
  const PX_POR_M = 960 / Math.tan(THREE.MathUtils.degToRad(CAMERA.fov) / 2);
  function ancorarEtiqueta(v, dt) {
    const s = v.etiqueta.sprite;
    s.getWorldPosition(v3);
    const tela = c3d.projetar(v3);
    v3.applyMatrix4(camera.matrixWorldInverse);
    const px = ETQ_ALTURA * s.parent.scale.x * v.escala * PX_POR_M / Math.max(1, -v3.z) / ETQ_H; // px de tela por px da etiqueta
    const larg = v.etiqueta.larg, meio = (ETQ_W - larg) / 2;
    const lado = Math.max(-1, Math.min(1, (540 - tela.x) / 380)) * .3 * larg / ETQ_W;
    const min = ((ETQ_W + larg) / 2 - (1068 - tela.x) / px) / ETQ_W, max = ((tela.x - 12) / px + meio) / ETQ_W;
    const alvo = Math.max(min, Math.min(max, .5 + lado));
    v.cx += (alvo - v.cx) * Math.min(1, dt * 10 || 1);
    s.center.x = v.cx;
    // âncora e escala da pílula em tamanho cheio na tela (o ordenar() testa tamanhos e andares a partir daqui)
    const cheio = px / Math.max(.05, v.escala);
    v.caixa = { x: tela.x + (ETQ_W / 2 - v.cx * ETQ_W) * cheio, y: tela.y, k: cheio, larg };
  }
  // retângulo da pílula na tela com escala e andar dados (centro, largura e altura em px do palco)
  const retangulo = (r, esc, nivel) => ({ x: r.x, y: r.y - (64 + nivel * ETQ_H * 1.06) * r.k * esc, w: r.larg * r.k * esc, h: 100 * r.k * esc });
  // placar em HTML que as etiquetas não podem cobrir: topo, título e os chips de presente de cima
  const HUD = [{ x: 540, y: 90, w: 760, h: 180 }, { x: 103, y: 270, w: 200, h: 160 }, { x: 977, y: 270, w: 200, h: 160 }];
  const cruza = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 4 && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - 3;

  function marcar(x, z, giro) {
    const i = marcaProx;
    marcaProx = (marcaProx + 1) % MAX_MARCAS;
    marcasInfo[i] = { x, z, giro, vida: 4 };
    marcas.count = Math.max(marcas.count, i + 1);
    marcasAte = 4;
  }
  let marcasAte = 0; // segundos até a última marca sumir (depois disso o laço das marcas para)

  function poeira(x, y, z, corCarro) {
    fumaca.emitir(x, y + .15, z, { qtd: 12, cores: ['#c4c8d4', '#9aa0b2'], vel: 3.2, vida: .7, tam: [.4, 1.3], alfa: .5, dir: { x: 0, y: .15, z: 0 }, abre: 2.2 });
    brilho.emitir(x, y + .5, z, { qtd: 14, cores: [corCarro, '#ffffff'], vel: 4, vida: .5, tam: [.3, .05] });
  }

  /* ---------- câmera ---------- */
  const cam = { pos: new THREE.Vector3(...CAMERA.pos), alvo: new THREE.Vector3(...CAMERA.alvo), modo: 'pista', foco: 0 };
  const desejo = { pos: new THREE.Vector3(), alvo: new THREE.Vector3() };
  function moverCamera(dt, t) {
    if (cam.modo === 'podio') {
      desejo.pos.set(...CAM_PODIO.pos); desejo.alvo.set(...CAM_PODIO.alvo);
      desejo.pos.x += Math.sin(t * .4) * 1.2;
    } else {
      // balanço lento em volta do centro (paralaxe) e um leve olhar para o líder
      const ang = Math.sin(t * .13) * .012;
      desejo.alvo.set(...CAMERA.alvo);
      const dx = CAMERA.pos[0] - CAMERA.alvo[0], dz = CAMERA.pos[2] - CAMERA.alvo[2];
      desejo.pos.set(desejo.alvo.x + dx * Math.cos(ang) + dz * Math.sin(ang), CAMERA.pos[1], CAMERA.alvo[2] - dx * Math.sin(ang) + dz * Math.cos(ang));
    }
    // foco: aproximação curta nos momentos fortes, que se desfaz sozinha
    if (cam.foco > 0) {
      desejo.pos.lerp(desejo.alvo, .1 * cam.foco);
      cam.foco = Math.max(0, cam.foco - dt * 1.2);
    }
    const k = 1 - Math.exp(-dt * (cam.modo === 'podio' ? 1.6 : 1.2));
    cam.pos.lerp(desejo.pos, k);
    cam.alvo.lerp(desejo.alvo, k);
    camera.position.copy(cam.pos);
    c3d.mirar(cam.alvo.x, cam.alvo.y, cam.alvo.z);
  }
  camera.position.copy(cam.pos);

  /* ---------- quadro ---------- */
  let energia = .25, lider = null;
  function quadro(dt, t, carros, estado) {
    nRodas = nLuzes = nSombras = 0;
    for (const c of carros) if (c.v3d) atualizarCarro(c, dt, t);
    rodas.count = nRodas; luzes.count = nLuzes; sombras.count = nSombras;
    rodas.instanceMatrix.needsUpdate = luzes.instanceMatrix.needsUpdate = sombras.instanceMatrix.needsUpdate = true;
    if (luzes.instanceColor) luzes.instanceColor.needsUpdate = true;

    // coroa girando sobre a etiqueta do líder
    const L = lider?.v3d;
    coroa.visible = !!L && estado !== 'esperando';
    if (L) {
      const s = L.etiqueta.sprite;
      s.getWorldPosition(v3);
      // em cima do meio da pílula (que pode estar deslocada para não sair da tela)
      v3.x += (.5 - L.cx) * s.scale.x * L.grupo.scale.x;
      coroa.position.set(v3.x, v3.y + ETQ_ALTURA * L.escala * L.grupo.scale.x + .3 * Math.max(.5, L.escala) + Math.sin(t * 4) * .06, v3.z);
      coroa.scale.setScalar(1.9 * Math.max(.55, L.escala));
      coroa.rotation.y = t * 1.6;
    }

    // marcas de pneu clareando
    if (marcasAte > 0) {
      marcasAte -= dt;
      for (let i = 0; i < marcas.count; i++) {
        const m = marcasInfo[i];
        if (!m) continue;
        m.vida -= dt;
        const k = Math.max(0, m.vida / 4);
        marcas.setMatrixAt(i, m4.compose(v3.set(m.x, .028, m.z), q4.setFromEuler(e3.set(0, m.giro, 0)), s3.setScalar(k > 0 ? 1 : 0)));
        alfaMarcas.setX(i, Math.min(1, k * 1.5));
      }
      if (marcasAte <= 0) { marcas.count = 0; marcaProx = 0; marcasInfo.length = 0; }
      marcas.instanceMatrix.needsUpdate = alfaMarcas.needsUpdate = true;
    }

    for (const p of pocas) {
      if (!p.m.visible) continue;
      p.vida -= dt;
      const k = p.vida > 5.4 ? curvas.volta(Math.min(1, (6 - p.vida) / .6)) : Math.min(1, p.vida / .8);
      p.m.scale.setScalar(Math.max(.001, k * p.tam));
      if (p.vida <= 0) p.m.visible = false;
    }
    for (const a of aneis) {
      if (!a.m.visible) continue;
      a.t += dt / .85;
      if (a.t < 0) continue;
      a.m.scale.setScalar(.4 + curvas.saida(Math.min(1, a.t)) * 3.4);
      a.m.position.y = .2 + a.t * .8;
      a.m.material.opacity = Math.max(0, 1 - a.t) * .6;
      if (a.t >= 1) a.m.visible = false;
    }
    // pódio: degraus sobem um de cada vez (com sobra) e descem juntos
    if (podio.visible) {
      let algum = false;
      for (const d of degraus) {
        d.t += dt;
        if (d.sobe) d.g.scale.y = Math.max(.001, curvas.volta(Math.min(1, Math.max(0, d.t - d.atraso) / .7)));
        else d.g.scale.y = Math.max(.001, d.g.scale.y - dt * 2.2);
        algum ||= d.sobe || d.g.scale.y > .001;
      }
      if (!algum) podio.visible = false;
    }
    if (confeteEm > 0 && (confeteEm -= dt) <= 0) part.confete({ area: [-4.5, 4.5], altura: 8, z: [-2, 3], qtd: 240, tamanho: .14 });
    for (const f of feixes) {
      if (!f.m.visible) continue;
      f.t += dt / 1.1;
      f.m.scale.set(1 - f.t * .6, Math.min(1, f.t * 5), 1 - f.t * .6);
      f.m.material.opacity = Math.max(0, 1 - f.t) * .42;
      if (f.t >= 1) f.m.visible = false;
    }

    // torcida: mais agitada nos momentos fortes; flashes de celular
    energia += ((estado === 'fim' ? 1 : .22) - energia) * Math.min(1, dt * .8);
    for (const tc of torcidas) tc.animar(t, energia);
    for (const f of flashes) if (Math.random() < dt * (3 + energia * 8)) {
      const fila = Math.floor(Math.random() * f.fileiras);
      v3.set((Math.random() - .5) * f.largura, 1.9 + fila * .6, -.6 - fila * 1.1);
      f.g.localToWorld(v3);
      brilho.emitir(v3.x, v3.y, v3.z, { qtd: 1, cores: ['#ffffff'], vel: 0, vida: .14, tam: [.7, .3] });
    }
    moverCamera(dt, t);
    brilho.passo(dt);
    fumaca.passo(dt);
  }

  // ordem da corrida: número nas etiquetas, quem fica por cima, etiqueta compacta quando cobre a de alguém à frente
  function ordenar(lista) {
    lider = lista[0] ?? null;
    const ocupadas = [];
    lista.forEach((c, i) => {
      const v = c.v3d;
      if (!v) return;
      v.etiqueta.posicao(i + 1);
      v.etiqueta.sprite.renderOrder = 200 - i;
      if (v.podio) { v.alvoEscala = i === 0 ? .62 : .52; return; }
      if (cam.modo === 'podio') { v.alvoEscala = 0; return; } // no pódio só aparecem os 3 primeiros
      const r = v.caixa;
      if (!r) return;
      const cobre = ocupadas.some((o) => Math.abs(o.x - r.x) < (o.w + r.w) / 2 - 8 && Math.abs(o.y - r.y) < (o.h + r.h) / 2 - 6);
      if (i === 0 || !cobre) { ocupadas.push(r); v.alvoEscala = i === 0 ? 1.12 : 1; }
      else v.alvoEscala = .52;
    });
  }

  return {
    c3d,
    adicionar, remover, quadro, ordenar,
    // posição na tela (px do palco) de um ponto acima do carro
    tela(c, altura = 1) {
      const v = c.v3d;
      if (!v) return { x: 540, y: 900 };
      return c3d.projetar(v3.copy(v.grupo.position).setY(v.grupo.position.y + altura));
    },
    luzes(n) { if (n !== estadoLuzes) { estadoLuzes = n; pintarPainel(); } },
    agitar(forca = 1) { energia = Math.max(energia, forca); },
    foco(forca = .5) { cam.foco = Math.max(cam.foco, forca); },
    turbo(c, q) {
      const p = c.v3d?.grupo.position;
      if (!p) return;
      part.explodir([p.x, .9, p.z], { cores: ['#ff2d55', '#ff7aa8', '#ffd1e3', '#c8102e'], qtd: 10 + q * 6, forca: 4.5, tamanho: .16, vida: 1.2 });
      brilho.emitir(p.x, .7, p.z, { qtd: 16, cores: ['#ff7aa8', '#ffffff'], vel: 4, vida: .5, tam: [.4, .05] });
    },
    nitro(c) {
      const v = c.v3d;
      if (!v) return;
      const p = v.grupo.position;
      brilho.emitir(p.x, .5, p.z, { qtd: 46, cores: ['#fff3b0', '#ffd23f', '#ff8a3d'], fim: '#ff2200', vel: 7, vida: .55, tam: [.7, .1], subida: 1 });
      fumaca.emitir(p.x, .5, p.z, { qtd: 6, cores: ['#9aa0ae'], vel: 2, vida: .8, tam: [.5, 1.4], alfa: .25, subida: 1.2 });
      c3d.tremer(.2, .4);
    },
    oleo(c) {
      const v = c.v3d;
      if (!v) return;
      const p = v.grupo.position;
      const poca = pocas.find((k) => !k.m.visible) ?? pocas.reduce((a, b) => (a.vida < b.vida ? a : b));
      poca.m.visible = true; poca.vida = 6; poca.tam = 1.05 + Math.random() * .35;
      poca.m.position.set(p.x, .03, p.z);
      poca.m.rotation.y = Math.random() * TAU;
      part.explodir([p.x, .5, p.z], { cores: ['#0b0b10', '#2a2140', '#6b4cff', '#16161c'], qtd: 22, forca: 5, tamanho: .13, vida: 1 });
      fumaca.emitir(p.x, .5, p.z, { qtd: 8, cores: ['#6a6e7c'], vel: 2.4, vida: .7, tam: [.5, 1.3], alfa: .3, subida: 1.1 });
      c3d.tremer(.25, .45);
    },
    // de = posição antiga no mundo; o carro já foi colocado no novo lugar
    teleporte(c, de) {
      const v = c.v3d;
      if (!v) return;
      v.f = FAIXAS[c.faixa];
      v.sAntes = c.s;
      v.surge = 1;
      const para = noMundo(c.s, v.f);
      const livres = aneis.filter((a) => !a.m.visible);
      [[de, 0], [de, -.15], [para, -.1], [para, -.3]].forEach(([p, atraso], i) => {
        const a = livres[i];
        if (!a) return;
        a.m.visible = true; a.t = atraso / .85;
        a.m.position.set(p.x, .2, p.z);
        a.m.scale.setScalar(.001);
      });
      feixes.forEach((f, i) => { const p = i ? para : de; f.m.visible = true; f.t = 0; f.m.position.set(p.x, 0, p.z); });
      for (const p of [de, para]) {
        brilho.emitir(p.x, .8, p.z, { qtd: 22, cores: ['#b06bff', '#41d7ff', '#ff5ad1', '#ffffff'], vel: 5, vida: .7, tam: [.35, .05], subida: 1.2, alfa: .7 });
        part.explodir([p.x, .8, p.z], { cores: ['#b06bff', '#41d7ff', '#ff5ad1', '#ffffff'], qtd: 14, forca: 5, tamanho: .12 });
      }
      c3d.tremer(.12, .3);
    },
    // fim da corrida: pódio sobe no gramado do meio, os 3 primeiros pulam para os degraus e a câmera vai até lá
    vitoria(top3) {
      podio.visible = true;
      degraus.forEach((d, i) => Object.assign(d, { sobe: true, t: 0, atraso: .25 + (2 - i) * .2 }));
      top3.forEach((c, i) => {
        const v = c.v3d;
        if (!v) return;
        const d = DEGRAUS[i];
        v.podio = { k: -.5 - (2 - i) * .25, dur: 1.1, de: { x: v.grupo.position.x, z: v.grupo.position.z, giro: v.grupo.rotation.y },
          para: { x: d.x, y: d.h + .1, z: PODIO_Z + .1, giro: -Math.PI / 2 + (i ? (i === 1 ? .25 : -.25) : 0) } };
        // gira pelo caminho mais curto
        const dg = v.podio.para.giro - v.podio.de.giro;
        v.podio.para.giro = v.podio.de.giro + Math.atan2(Math.sin(dg), Math.cos(dg));
      });
      cam.modo = 'podio';
      energia = 1;
      c3d.tremer(.3, .6);
      confeteEm = 1.5;
    },
    novaCorrida(carros) {
      cam.modo = 'pista';
      degraus.forEach((d) => { d.sobe = false; });
      pocas.forEach((p) => { p.vida = Math.min(p.vida, .8); });
      carros.forEach((c, i) => {
        const v = c.v3d;
        if (!v) return;
        v.podio = null;
        v.f = FAIXAS[c.faixa];
        v.sAntes = c.s;
        v.queda = 1 + i * .06;
      });
    },
    limpar() { brilho.limpar(); fumaca.limpar(); }
  };
}
