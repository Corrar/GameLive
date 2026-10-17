import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, criarTimes, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, avatar, animar, particulas, flutuar,
  pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';
import { criarCena, THREE, material, caixa, malha, texturaCanvas, textoJogo, fontesProntas, ceuDegrade,
  holofote, rotulo, criarParticulas, mergeGeometries } from '../kit/cena3d.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
// "cenario" (padrão) monta o terraço com a cidade ao entardecer; outra cor vira fundo liso e "transparente" sobrepõe a live
const cenario = (cfg.fundo ?? 'cenario') === 'cenario';
const transparente = !cenario && (!cfg.fundo || cfg.fundo === 'transparente');
aplicarFundo(cenario ? '#1b1446' : cfg.fundo);
escalarPalco(palco);
ligarSom(cfg.som);
// com cor sólida (chroma key) o véu sairia junto no recorte: some; no transparente fica leve
if (!cenario) palco.querySelector('.veu').style.opacity = transparente ? .55 : 0;

const TIMES = cfg.times;
const META = cfg.meta ?? 2000;
const BLOCOS = cfg.blocos ?? {};
const VENCEDOR_MS = 5000;
const PASSOS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const MARCOS = [10, 25, 50, 100, 250, 500];
const OURO = '#ffd23f', CONTORNO = '#1a1030';
const fmt = (n) => Math.floor(n).toLocaleString('pt-BR');

// medidas do mundo 3D (unidades ≈ metros; 1 unidade ≈ 100 px na altura das torres)
const TORRE_X = [-2.35, 2.35], LARG = 2.9, PROF = 2.6;
const BASE = .55;            // altura do pedestal: a torre começa aqui
const VISTA = 6.5;           // altura que corresponde à "faixa" de blocos visível
const ESP_MIN = .3;          // espessura mínima de uma laje (a laje vale 1, 2, 5, 10... blocos)
const ESP_GEO = .5, FOLGA = .04;
const MAX_LAJES = 26, MAX_CAINDO = 40, MAX_PO = 100, MAX_REGUA = 5;
const Z_META = -2.3, LARG_META = 9.6;
// enquanto a meta está longe, a linha tracejada fica abaixo do topo da vista (longe do nome do último presenteador no HUD)
const META_LONGE = VISTA - .45;

TIMES.forEach((t, i) => {
  palco.style.setProperty('--cor' + i, t.cor);
  $('nome' + i).textContent = t.nome;
  $('letra' + i).textContent = cfg.palavras[i ? 'B' : 'A'][0];
});
$('titulo').textContent = cfg.titulo ?? 'TORRES RIVAIS';

// legenda dos presentes: metade à esquerda, metade à direita do avatar
const acoes = Object.entries(cfg.acoes ?? {}).slice(0, 4);
acoes.forEach(([acao, refs], k) => {
  const ref = refs[0];
  const chip = document.createElement('div');
  chip.className = 'chip-presente';
  const emoji = document.createElement('span');
  emoji.className = 'emoji';
  emoji.textContent = cfg.emojis?.[acao] ?? (typeof ref === 'number' ? '🎁' : emojiDoPresente(ref));
  const efeito = document.createElement('span');
  efeito.className = 'efeito';
  efeito.textContent = `+${fmt(BLOCOS[acao] ?? 0)}`;
  chip.append(emoji, efeito);
  $('presentes' + (k < Math.ceil(acoes.length / 2) ? 0 : 1)).appendChild(chip);
});

const times = criarTimes(cfg.palavras);
const salvo = lembrar('torres-rivais:placar', null);
let placar = Array.isArray(salvo) && salvo.length === 2 && salvo.every(Number.isFinite) ? salvo : [0, 0];
// alt: placar lógico; pousado: o que já caiu na torre; vis: altura desenhada (persegue pousado)
let alt = [0, 0], pousado = [0, 0], vis = [0, 0], guardado = [0, 0];
let faixa = 40, fim = null, aviso = null, vencedor = -1, foco = null, clarao = 0;
let rodadaMvp = new Map();   // quem mais construiu nesta rodada (para a faixa de vencedor)
const fila = [], caindo = [];
const impacto = [0, 0];
const avisar = avisos($('avisos'), { max: 3 });
const combo = criarCombo({ janela: 4000 });
const ranking = criarRanking();
// placar que conta até o valor novo; quem anda é o laço único da cena (passoContadores no aoQuadro)
function contadorBlocos(el, duracao = 450) {
  const c = { atual: 0, de: 0, valor: 0, inicio: 0 };
  el.textContent = fmt(0);
  const definir = (valor, pular = true) => {
    if (pular && valor !== c.atual) animar(el);
    Object.assign(c, { de: c.atual, valor, inicio: performance.now() });
  };
  definir.passo = (agora) => {
    if (c.atual === c.valor) return;
    const k = Math.min(1, Math.max(0, (agora - c.inicio) / duracao));
    c.atual = k >= 1 ? c.valor : Math.round(c.de + (c.valor - c.de) * (1 - (1 - k) ** 3));
    el.textContent = fmt(Math.max(0, c.atual));
  };
  return definir;
}
const contadores = [contadorBlocos($('blocos0')), contadorBlocos($('blocos1'))];
const timerCombo = [0, 0];
const ultimoNome = [0, 0], ultimoAndar = [0, 0];
let ultimoArranhaCeu = 0;
const idx = (t) => t === 'A' ? 0 : 1;
const lider = () => alt[0] === alt[1] ? -1 : alt[0] > alt[1] ? 0 : 1;

function hud(pular = true) {
  alt.forEach((a, i) => {
    contadores[i](a, pular);
    const p = Math.min(100, a / META * 100);
    $('pct' + i).textContent = `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    $('trofeu' + i).textContent = placar[i];
  });
  $('rodada').textContent = `RODADA ${placar[0] + placar[1] + 1}`;
}

/* ---------- cena 3D ---------- */

await fontesProntas();
const CAM = { pos: new THREE.Vector3(0, 7.6, 25.5), alvo: new THREE.Vector3(0, 5.35, 0) };
const c3d = criarCena(palco, {
  cfg, fundo: transparente ? null : cenario ? '#1b1446' : cfg.fundo, luz: 'por-do-sol', exposicao: 1.05,
  camera: { pos: CAM.pos.toArray(), alvo: CAM.alvo.toArray(), fov: 41 },
  // sol baixo atrás das torres e um pouco à esquerda (o pôr do sol do fundo): as sombras vêm para a frente e caem
  // no piso visível entre e diante dos pedestais, em vez de saírem do quadro pela direita
  sol: { pos: [-4, 7.5, -9], alvo: [0, 2.6, 0], alcance: 10 },
  neblina: cenario ? { cor: '#b9608a', perto: 50, longe: 290 } : null
});
const { cena } = c3d;
c3d.sol.color.set('#ffd2a6');
c3d.sol.intensity = 4.4;
c3d.hemi.color.set('#ffb8a8');
c3d.hemi.groundColor.set('#2c2048');
c3d.hemi.intensity = .28;
cena.environmentIntensity = .28;
// luz de recorte lilás vinda de trás, rasante (contorna as lajes sem clarear o piso por cima das sombras)
const contraluz = new THREE.DirectionalLight('#a68aff', .75);
contraluz.position.set(7, 4, -14);
// luz de frente quase horizontal: dá cor à face das lajes e quase não toca o piso
const frente = new THREE.DirectionalLight('#ffd6c0', 1);
frente.position.set(2, 2.5, 20);
cena.add(contraluz, frente);

// ruído determinístico (cenário igual a cada abertura)
function aleatorio(semente) {
  let s = semente >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// mancha redonda suave (brilho no chão, sol)
const texBrilho = texturaCanvas(128, 128, (ctx) => {
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.45, 'rgba(255,255,255,.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
}).textura;

/* céu, sol, estrelas, cidade e holofotes (só no cenário) */

let holofotes = [], antenas = null;
if (cenario) {
  ceuDegrade(c3d, { cores: ['#160d40', '#4f2783', '#ff9a6c'] });

  // sol se pondo atrás da cidade, entre as torres
  const texSol = texturaCanvas(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,250,225,1)');
    g.addColorStop(.12, 'rgba(255,236,170,1)');
    g.addColorStop(.16, 'rgba(255,190,120,.75)');
    g.addColorStop(.4, 'rgba(255,130,110,.28)');
    g.addColorStop(1, 'rgba(255,110,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }).textura;
  const sol = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSol, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  sol.scale.setScalar(250);
  sol.position.set(0, 7.6 + 520 * Math.tan(.2 * Math.PI / 180), -520);
  cena.add(sol);

  // estrelas no alto do céu
  const r = aleatorio(9);
  const pos = [];
  for (let k = 0; k < 260; k++) {
    const az = (r() - .5) * 1.4, el = .2 + r() * .55, d = 700;
    pos.push(Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, -Math.cos(az) * Math.cos(el) * d);
  }
  const gEst = new THREE.BufferGeometry();
  gEst.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  cena.add(new THREE.Points(gEst, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, fog: false,
    transparent: true, opacity: .85, depthWrite: false })));

  montarCidade();
  // holofotes no parapeito varrendo o céu
  for (const lado of [-1, 1]) {
    const h = holofote(c3d, { pos: [lado * 7.6, .9, -10.6], alvo: [lado * 4, 120, -60], cor: '#ffe6c4', angulo: .05, intensidade: 0 });
    h.luz.visible = false;
    h.feixe.material.uniforms.forca.value = .2;
    holofotes.push({ ...h, lado, alvo: new THREE.Vector3() });
  }
}

// Cidade inteira numa malha só: prédios com janelas acesas (textura repetida em escala de andar).
function montarCidade() {
  const r = aleatorio(21);
  const JW = 7.2, JH = 14.4;   // uma repetição da textura = 8 janelas × 16 andares
  const janelas = (acesas) => texturaCanvas(512, 1024, (ctx) => {
    const rr = aleatorio(5);
    ctx.fillStyle = acesas ? '#000' : '#3a2c5a';
    ctx.fillRect(0, 0, 512, 1024);
    if (!acesas) {
      for (let k = 0; k < 9000; k++) {
        ctx.fillStyle = rr() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)';
        ctx.fillRect(rr() * 512, rr() * 1024, 2, 2);
      }
    }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const v = rr(), luz = v < .36, fria = rr() < .15;
      const cor = luz ? (fria ? '#9fd0ff' : ['#ffb64d', '#ffcf73', '#ff9f45'][Math.floor(rr() * 3)]) : null;
      if (acesas) { if (cor) { ctx.fillStyle = cor; ctx.fillRect(x * 64 + 16, y * 64 + 12, 32, 42); } continue; }
      ctx.fillStyle = cor ?? (rr() < .5 ? '#1d1830' : '#262040');
      ctx.fillRect(x * 64 + 16, y * 64 + 12, 32, 42);
    }
  }, { repetir: [1, 1], cores: true }).textura;
  const mapa = janelas(false), luzes = janelas(true);
  const partes = [];
  const tons = ['#d9d2ff', '#ffd9e6', '#cfe0ff', '#f0e2ff', '#ffe4cf'].map(c => new THREE.Color(c));
  const altos = [];
  const predio = (x, z, w, d, topo) => {
    const h = topo + 90;   // a base fica bem abaixo do terraço
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, ou = Math.floor(r() * 8) / 8, ov = Math.floor(r() * 16) / 16;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const n = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(n, .01, .995); continue; }   // teto: cor da parede
      uv.setXY(n, ou + uv.getX(n) * (f < 2 ? d : w) / JW, ov + uv.getY(n) * h / JH);
    }
    const tom = tons[Math.floor(r() * tons.length)];
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(24).fill(0).flatMap(() => [tom.r, tom.g, tom.b]), 3));
    g.translate(x, topo - h / 2, z);
    partes.push(g);
  };
  const bairro = (qtd, x0, x1, z0, z1, t0, t1, vao = 0) => {
    for (let k = 0; k < qtd; k++) {
      const x = x0 + r() * (x1 - x0);
      if (Math.abs(x) < vao) continue;
      predio(x, z0 + r() * (z1 - z0), 12 + r() * 14, 10 + r() * 12, t0 + r() * (t1 - t0));
    }
  };
  bairro(14, -70, 70, -48, -85, -7, 5);
  bairro(26, -130, 130, -90, -160, -5, 20, 14);
  bairro(44, -280, 280, -170, -330, 4, 42, 30);
  // arranha-céus nas laterais, com antena e luz vermelha piscando
  for (const [x, z, topo] of [[-46, -150, 52], [-92, -230, 62], [52, -170, 58], [104, -250, 70], [-160, -300, 50], [170, -310, 56]]) {
    predio(x, z, 15 + r() * 4, 15, topo);
    const ant = new THREE.CylinderGeometry(.3, .5, 14, 6);
    ant.translate(x, topo + 7, z);
    ant.deleteAttribute('uv');
    ant.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(ant.attributes.position.count * 2).fill(.995), 2));
    ant.setAttribute('color', new THREE.Float32BufferAttribute(new Array(ant.attributes.position.count * 3).fill(.6), 3));
    partes.push(ant.toNonIndexed());
    altos.push([x, topo + 14.3, z]);
  }
  const geo = mergeGeometries(partes.map(g => g.index ? g.toNonIndexed() : g));
  partes.forEach(g => g.dispose());
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: mapa, emissiveMap: luzes, emissive: '#ffffff', emissiveIntensity: .95,
    roughness: .82, metalness: .1, vertexColors: true }));
  m.matrixAutoUpdate = false;
  cena.add(m);
  antenas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b3b', fog: false }), altos.length);
  altos.forEach((p, k) => antenas.setMatrixAt(k, new THREE.Matrix4().makeTranslation(...p)));
  cena.add(antenas);
}

/* terraço: piso, parapeito com neon dos times, pedestais com placa */

if (cenario) {
  // piso de lajotas de concreto (1 × 1), com juntas e leve variação de tom
  const lajotas = texturaCanvas(512, 512, (ctx, w, h) => {
    const r = aleatorio(3), n = 4, t = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 128 + r() * 20;
      ctx.fillStyle = `rgb(${v + 10},${v + 4},${v + 26})`;
      ctx.fillRect(x * t, y * t, t, t);
    }
    for (let k = 0; k < 16000; k++) {
      ctx.fillStyle = r() < .5 ? 'rgba(255,255,255,.07)' : 'rgba(20,10,40,.09)';
      ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    ctx.fillStyle = 'rgba(28,18,48,.6)';
    for (let k = 0; k <= n; k++) { ctx.fillRect(k * t - 2, 0, 4, h); ctx.fillRect(0, k * t - 2, w, 4); }
  }, { repetir: [9, 7] }).textura;
  // reflexo de ambiente próprio e fraco no piso: o ambiente de estúdio clareava as sombras
  const piso = malha(new THREE.PlaneGeometry(36, 28), new THREE.MeshStandardMaterial({ map: lajotas, bumpMap: lajotas, bumpScale: 1.2, roughness: .72,
    envMap: cena.environment, envMapIntensity: .08 }), { sombra: false });
  piso.rotation.x = -Math.PI / 2;
  piso.position.z = 3.5;
  cena.add(piso);
  const mParapeito = material('#5d5470', { rugosidade: .85 });
  const parapeito = malha(new THREE.BoxGeometry(36, .9, .5), mParapeito, { sombra: false });
  parapeito.position.set(0, .45, -10.75);
  cena.add(parapeito);
  // aparelhos de ar-condicionado perto do parapeito
  const mAr = material('#b9b3c9', { metal: .5, rugosidade: .45 });
  const mGrade = material('#2a2638', { metal: .6, rugosidade: .5 });
  for (const [x, z, ry] of [[-6.1, -8.6, .25], [6.4, -7.9, -.3]]) {
    const ar = malha(caixa(1.7, 1.05, 1.25, .08), mAr);
    ar.position.set(x, .525, z);
    ar.rotation.y = ry;
    const ventoinha = malha(new THREE.CylinderGeometry(.42, .42, .06, 24), mGrade);
    ventoinha.position.set(x, 1.06, z);
    cena.add(ar, ventoinha);
  }
  // neon no topo do parapeito: metade de cada time
  TIMES.forEach((t, i) => {
    const neon = new THREE.Mesh(new THREE.BoxGeometry(18, .09, .12), material(t.cor, { emissivo: t.cor, intensidadeEmissiva: 2.2 }));
    neon.position.set(i ? 9 : -9, .95, -10.6);
    cena.add(neon);
  });
} else {
  // sem cenário: só a sombra das torres no "chão" invisível
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.ShadowMaterial({ opacity: .35 }));
  sombra.rotation.x = -Math.PI / 2;
  sombra.receiveShadow = true;
  cena.add(sombra);
}

const mPedestal = material('#2a2142', { rugosidade: .35, verniz: .6 });
// luz do friso de neon no chão: só uma faixa estreita colada na borda do pedestal (não pinta por cima da sombra)
const POCA = [6.4, 5.6];
const texPoca = texturaCanvas(256, 224, (ctx, w, h) => {
  const pw = (LARG + .7) / POCA[0] * w, ph = (PROF + .7) / POCA[1] * h;
  ctx.strokeStyle = '#fff';
  ctx.shadowColor = '#fff';
  for (const [blur, lw, a] of [[30, 10, .5], [12, 6, .8]]) {
    ctx.shadowBlur = blur;
    ctx.lineWidth = lw;
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.roundRect((w - pw) / 2, (h - ph) / 2, pw, ph, 6); ctx.stroke();
  }
}).textura;
const placas = TIMES.map((t, i) => {
  const ped = malha(caixa(LARG + .7, BASE, PROF + .7, .08), mPedestal);
  ped.position.set(TORRE_X[i], BASE / 2, 0);
  // friso de neon do time contornando o pedestal (logo abaixo do tampo)
  const friso = new THREE.Mesh(caixa(LARG + .76, .07, PROF + .76, .03), material(t.cor, { emissivo: t.cor, intensidadeEmissiva: 1.6 }));
  friso.position.set(TORRE_X[i], BASE - .11, 0);
  // brilho do time no chão em volta do pedestal
  const poca = new THREE.Mesh(new THREE.PlaneGeometry(...POCA), new THREE.MeshBasicMaterial({ map: texPoca, color: t.cor,
    transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  poca.rotation.x = -Math.PI / 2;
  poca.position.set(TORRE_X[i], .015, 0);
  // placa "COMENTE A · 👥 n" na frente do pedestal
  const tex = texturaCanvas(1024, 128, () => {});
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(LARG + .5, (LARG + .5) / 8), new THREE.MeshBasicMaterial({ map: tex.textura, transparent: true, toneMapped: false }));
  placa.position.set(TORRE_X[i], BASE / 2 - .01, (PROF + .7) / 2 + .012);
  cena.add(ped, friso, placa);
  if (!transparente) cena.add(poca);
  return { tex, n: -1 };
});

function pintarPlaca(i, n) {
  placas[i].n = n;
  placas[i].tex.atualizar((ctx, w, h) => {
    ctx.fillStyle = CONTORNO;
    ctx.beginPath(); ctx.roundRect(8, 8, w - 16, h - 16, 52); ctx.fill();
    ctx.fillStyle = TIMES[i].cor;
    ctx.beginPath(); ctx.roundRect(16, 16, w - 32, h - 32, 44); ctx.fill();
    textoJogo(ctx, `COMENTE ${cfg.palavras[i ? 'B' : 'A'][0]} · 👥 ${n}`, w / 2, h / 2 + 2, { tamanho: 70, espessura: .16, larguraMax: w - 80 });
  });
}

// telão opcional atrás da torre: "imagem" no time do config.json (URL ou arquivo na pasta do jogo)
function telao(i, url) {
  new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const W = 4.4, H = 5.6;
    // "cobrir": recorta a imagem para preencher a tela sem distorcer
    const ai = tex.image.width / tex.image.height, ap = W / H;
    if (ai > ap) { tex.repeat.set(ap / ai, 1); tex.offset.set((1 - ap / ai) / 2, 0); } else { tex.repeat.set(1, ai / ap); tex.offset.set(0, (1 - ai / ap) / 2); }
    const g = new THREE.Group();
    const moldura = malha(caixa(W + .32, H + .32, .24, .08), material('#1d1730', { metal: .6, rugosidade: .35 }));
    const borda = new THREE.Mesh(caixa(W + .5, H + .5, .1, .06), material(TIMES[i].cor, { emissivo: TIMES[i].cor, intensidadeEmissiva: 1.4 }));
    borda.position.z = -.1;
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, color: '#e6e0ea', toneMapped: false }));
    tela.position.z = .125;
    g.add(borda, moldura, tela);
    for (const lado of [-1, 1]) {
      const perna = malha(new THREE.CylinderGeometry(.09, .09, 1.4, 10), material('#3a3350', { metal: .7, rugosidade: .4 }));
      perna.position.set(lado * W * .32, -H / 2 - .7, -.05);
      g.add(perna);
    }
    g.position.set(TORRE_X[i] * 1.16, 1.4 + H / 2 + .16, -5.4);
    cena.add(g);
  }, undefined, () => console.warn(`imagem do ${TIMES[i].nome} não carregou (o servidor precisa liberar CORS)`));
}
TIMES.forEach((t, i) => t.imagem && telao(i, t.imagem));

/* torres: todas as lajes numa InstancedMesh (cor por instância) */

const geoLaje = caixa(LARG, ESP_GEO, PROF, .075);
const mLaje = material('#ffffff', { verniz: 1, rugosidade: .32 });
const torres = new THREE.InstancedMesh(geoLaje, mLaje, MAX_LAJES * 2);
const lajesCaindo = new THREE.InstancedMesh(geoLaje, mLaje, MAX_CAINDO);
for (const m of [torres, lajesCaindo]) {
  m.castShadow = m.receiveShadow = true;
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let k = 0; k < m.count; k++) m.setColorAt(k, new THREE.Color('#fff'));
  m.count = 0;
  cena.add(m);
}
// tons de cada time (lajes alternam um pouco de brilho, como peças empilhadas)
const TONS = TIMES.map(t => [-.07, -.03, 0, .035, -.05, .015].map(d => new THREE.Color(t.cor).offsetHSL(0, .08, d - .08)));
const sorte = (r, k) => { const x = Math.sin(r * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
let unidade = VISTA / faixa;
const passoDe = () => PASSOS.find(p => p * unidade >= ESP_MIN) ?? PASSOS.at(-1);
const topoTorre = (i) => BASE + vis[i] * unidade;
const espessura = () => Math.min(.8, passoDe() * unidade);

function montarTorres() {
  const passo = passoDe(), esp = passo * unidade;
  let n = 0;
  for (const i of [0, 1]) {
    const linhas = vis[i] / passo, cheias = Math.floor(linhas);
    const amassa = 1 - impacto[i] * .05;   // a torre "amassa" um pouco quando uma laje pousa
    for (let r = 0; r <= cheias && r < MAX_LAJES; r++) {
      const e = (r < cheias ? esp : (linhas - cheias) * esp) * amassa;
      if (e < .015) break;
      const eh = Math.max(.012, e - FOLGA);
      const y = BASE + r * esp * amassa + eh / 2;
      P.set(TORRE_X[i] + (sorte(r, 1) - .5) * .1, y, (sorte(r, 2) - .5) * .08);
      Q.setFromEuler(E.set(0, (sorte(r, 3) - .5) * .05, 0));
      S.set(1 + impacto[i] * .025, eh / ESP_GEO, 1 + impacto[i] * .025);
      torres.setMatrixAt(n, M.compose(P, Q, S));
      torres.setColorAt(n, TONS[i][Math.floor(sorte(r, 4) * 6)]);
      n++;
    }
  }
  torres.count = n;
  torres.instanceMatrix.needsUpdate = true;
  if (torres.instanceColor) torres.instanceColor.needsUpdate = true;
}

/* lajes caindo: quicam no topo, levantam poeira e só então somam na torre */

function derrubar(i, n, k, tipo) {
  const doTime = fila.filter(f => f.i === i);
  // chuva de presentes: com a fila cheia, os blocos entram na última laje que ainda vai cair
  if (doTime.length >= 24) {
    const u = doTime.at(-1);
    u.n += n;
    if (tipo !== 'normal') Object.assign(u, { tipo, ultimo: true });
    return;
  }
  const intervalo = tipo === 'galaxia' ? .07 : .1;
  const atrasoBase = doTime.reduce((a, f) => Math.max(a, f.atraso), 0);
  let resto = n;
  for (let j = 0; j < k; j++) {
    const parte = j === k - 1 ? resto : Math.round(n / k);
    resto -= parte;
    fila.push({ i, n: parte, atraso: atrasoBase + j * intervalo, tipo, ultimo: j === k - 1 });
  }
}

// altura do mundo (no plano das torres, z = 0) que aparece na linha yTela do palco
const raio = new THREE.Raycaster(), planoTorres = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), NDC = new THREE.Vector2(), VT = new THREE.Vector3();
function alturaNaTela(x, yTela) {
  c3d.camera.updateMatrixWorld();
  const v = VT.set(x, 0, 0).project(c3d.camera);
  NDC.set(v.x, 1 - 2 * yTela / 1920);
  raio.setFromCamera(NDC, c3d.camera);
  return raio.ray.intersectPlane(planoTorres, v) ? v.y : Infinity;
}
const TELA_LIVRE = 800;   // px: acima disso fica o HUD (placar, presentes, avatar); as lajes nascem abaixo

function soltarLaje(f) {
  if (caindo.length >= MAX_CAINDO) return;   // excesso: a torre recebe direto (ver pendentes)
  const topo = topoTorre(f.i), esp = espessura(), x = TORRE_X[f.i] + (Math.random() - .5) * .3;
  const teto = Math.min(BASE + VISTA + .9, alturaNaTela(x, TELA_LIVRE) - esp);
  const y = Math.max(topo + .9, Math.min(teto, topo + 3.1 + Math.random() * .5));
  caindo.push({ ...f, x, z: (Math.random() - .5) * .2, y, vy: -2 - Math.random() * 2, idade: 0,
    rx: (Math.random() - .5) * .14, ry: (Math.random() - .5) * .24, rz: (Math.random() - .5) * .26, quiques: 0, esp,
    cor: TONS[f.i][Math.floor(Math.random() * 6)] });
}

function pousar(b) {
  const i = b.i, topo = topoTorre(i);
  pousado[i] = Math.min(alt[i], pousado[i] + b.n);
  impacto[i] = Math.min(1, impacto[i] + (b.tipo === 'normal' ? .45 : .8));
  poeira(TORRE_X[i], topo, 0, b.tipo === 'normal' ? 5 : 9, b.tipo === 'normal' ? .9 : 1.15);
  if (!b.ultimo) return;
  if (b.tipo === 'galaxia') {
    c3d.tremer(.55, .8);
    fx.explodir([TORRE_X[i], topo + .4, 0], { cores: [TIMES[i].cor, OURO, '#ffffff'], qtd: 110, forca: 9, tamanho: .17, vida: 1.4 });
    onda(TORRE_X[i], topo + .05, 0, TIMES[i].cor, 5);
    onda(TORRE_X[i], topo + .05, 0, '#ffffff', 3.2);
    poeira(TORRE_X[i], BASE + .05, 0, 12, 1.4);
    tocar('impacto');
  } else if (b.tipo === 'andar') {
    c3d.tremer(.22, .4);
    fx.explodir([TORRE_X[i], topo + .3, 0], { cores: [TIMES[i].cor, OURO, '#ffffff'], qtd: 45, forca: 6 });
    onda(TORRE_X[i], topo + .05, 0, TIMES[i].cor, 3.2);
  }
}

function atualizarQuedas(dt) {
  for (let k = fila.length - 1; k >= 0; k--) {
    if ((fila[k].atraso -= dt) <= 0) { soltarLaje(fila[k]); fila.splice(k, 1); }
  }
  for (let k = caindo.length - 1; k >= 0; k--) {
    const b = caindo[k];
    b.idade += dt;
    b.vy -= 34 * dt;
    b.y += b.vy * dt;
    const am = Math.exp(-dt * 2.5);
    b.rx *= am; b.rz *= am;
    const topo = topoTorre(b.i);
    if (b.y <= topo && b.vy < 0) {
      b.y = topo;
      if (b.quiques >= 1 || b.vy > -4.5) { caindo.splice(k, 1); pousar(b); continue; }
      b.vy *= -.3;
      b.quiques++;
      b.rz = (Math.random() - .5) * .16;
      b.x += (Math.random() - .5) * .12;
      poeira(b.x, topo, b.z, 2, .6);
    }
  }
  caindo.forEach((b, n) => {
    // entra crescendo (não "brota" do nada no ar)
    const e = Math.min(1, b.idade / .18), k = .35 + .65 * (1 - (1 - e) ** 3);
    P.set(b.x, b.y + b.esp / 2, b.z);
    Q.setFromEuler(E.set(b.rx, b.ry, b.rz));
    S.set(k, Math.max(.05, b.esp - FOLGA) / ESP_GEO * k, k);
    lajesCaindo.setMatrixAt(n, M.compose(P, Q, S));
    lajesCaindo.setColorAt(n, b.cor);
  });
  lajesCaindo.count = caindo.length;
  lajesCaindo.instanceMatrix.needsUpdate = true;
  if (lajesCaindo.instanceColor) lajesCaindo.instanceColor.needsUpdate = true;
  // sem nada pendente para um time, a torre fica exatamente com o placar
  for (const i of [0, 1]) if (!fila.some(f => f.i === i) && !caindo.some(b => b.i === i)) pousado[i] = alt[i];
}

/* poeira: tufos macios (planos virados para a câmera, sem luz) que se abrem e se desfazem; e ondas de choque */

// tufo de pó: várias manchas radiais sobrepostas, sem contorno
const texPo = texturaCanvas(128, 128, (ctx) => {
  const r = aleatorio(7);
  const mancha = (x, y, raio, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, raio);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(.45, `rgba(255,255,255,${a * .5})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  };
  mancha(64, 64, 62, .8);
  for (let k = 0; k < 8; k++) {
    const a = r() * Math.PI * 2, d = 8 + r() * 20;
    mancha(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 20 + r() * 18, .55);
  }
}).textura;
const geoPo = new THREE.PlaneGeometry(1, 1);
const alfaPo = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PO), 1);
alfaPo.setUsage(THREE.DynamicDrawUsage);
geoPo.setAttribute('alfa', alfaPo);
const mPo = new THREE.MeshBasicMaterial({ map: texPo, transparent: true, depthWrite: false });
// opacidade por tufo (atributo "alfa" de cada instância)
mPo.onBeforeCompile = (s) => {
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float alfa;\nvarying float vAlfa;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlfa = alfa;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlfa;')
    .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vAlfa;');
};
const po = new THREE.InstancedMesh(geoPo, mPo, MAX_PO);
po.frustumCulled = false;
po.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
for (let k = 0; k < MAX_PO; k++) po.setColorAt(k, new THREE.Color('#fff'));
po.count = 0;
cena.add(po);
const nuvensPo = [];
// tons quentes do pôr do sol
const CORES_PO = ['#ffcaa2', '#f6b994', '#ffd9bf', '#eeb09a'].map(c => new THREE.Color(c));
const QZ = new THREE.Quaternion(), EIXO_Z = new THREE.Vector3(0, 0, 1);
function poeira(x, y, z, qtd, forca = 1) {
  for (let k = 0; k < qtd && nuvensPo.length < MAX_PO; k++) {
    const a = Math.random() * Math.PI * 2, borda = .45 + Math.random() * .1;
    const vida = .9 + Math.random() * .7;
    nuvensPo.push({ x: x + Math.cos(a) * LARG * borda, y: y + Math.random() * .1, z: z + Math.sin(a) * PROF * borda,
      vx: Math.cos(a) * (1 + Math.random()) * forca, vy: .2 + Math.random() * .5, vz: Math.sin(a) * (1 + Math.random()) * forca,
      r: (.1 + Math.random() * .14) * forca, giro: Math.random() * Math.PI * 2, vg: (Math.random() - .5) * 1.2, vida, total: vida,
      cor: CORES_PO[Math.floor(Math.random() * CORES_PO.length)] });
  }
}
function atualizarPoeira(dt) {
  for (let k = nuvensPo.length - 1; k >= 0; k--) {
    const p = nuvensPo[k];
    if ((p.vida -= dt) <= 0) { nuvensPo.splice(k, 1); continue; }
    const am = Math.exp(-dt * 2.4);
    p.vx *= am; p.vz *= am; p.vy *= Math.exp(-dt * 1.2);
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.giro += p.vg * dt;
  }
  const qCam = c3d.camera.quaternion;
  nuvensPo.forEach((p, n) => {
    const f = 1 - p.vida / p.total;
    const s = p.r * 3.4 * (.4 + .6 * (1 - (1 - f) ** 2.5));   // abre rápido e continua se espalhando
    Q.copy(qCam).multiply(QZ.setFromAxisAngle(EIXO_Z, p.giro));
    po.setMatrixAt(n, M.compose(P.set(p.x, p.y, p.z), Q, S.set(s, s, s)));
    po.setColorAt(n, p.cor);
    alfaPo.array[n] = .7 * Math.min(1, f / .08) * (1 - f) ** 1.5;
  });
  po.count = nuvensPo.length;
  po.instanceMatrix.needsUpdate = true;
  if (po.instanceColor) po.instanceColor.needsUpdate = true;
  alfaPo.needsUpdate = true;
}

const geoOnda = new THREE.RingGeometry(.86, 1, 64);
const ondas = [0, 1, 2].map(() => {
  const m = new THREE.Mesh(geoOnda, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  cena.add(m);
  return { m, vida: 0, max: 1 };
});
function onda(x, y, z, cor, max) {
  const o = ondas.find(o => o.vida <= 0) ?? ondas.reduce((a, b) => a.vida < b.vida ? a : b);
  Object.assign(o, { vida: 1, max });
  o.m.position.set(x, y, z);
  o.m.material.color.set(cor);
  o.m.visible = true;
}
function atualizarOndas(dt) {
  for (const o of ondas) {
    if (o.vida <= 0) continue;
    o.vida -= dt * 1.5;
    o.m.scale.setScalar(.6 + o.max * (1 - Math.max(0, o.vida) ** 3));
    o.m.material.opacity = Math.max(0, o.vida) * .9;
    if (o.vida <= 0) o.m.visible = false;
  }
}

const fx = criarParticulas(c3d, { max: 700 });

/* bandeiras no topo (tremulando) e coroa no time que lidera */

const mMastro = material('#eef0ff', { metal: .8, rugosidade: .25 });
const mOuro = material('#ffc23a', { metal: 1, rugosidade: .22 });
const bandeiras = TIMES.map((t, i) => {
  const g = new THREE.Group();
  const lado = i ? 1 : -1;   // cada bandeira tremula para fora
  const mastro = malha(new THREE.CylinderGeometry(.035, .035, 1.3, 10), mMastro);
  mastro.position.y = .65;
  const ponta = malha(new THREE.SphereGeometry(.07, 14, 10), mOuro);
  ponta.position.y = 1.32;
  const geo = new THREE.PlaneGeometry(.95, .58, 12, 6);
  geo.translate(.475, 0, 0);
  const pano = malha(geo, material(TONS[i][0], { rugosidade: .75, lados: THREE.DoubleSide, brilho: .4 }));
  pano.position.set(0, 1.0, 0);
  pano.scale.x = lado;
  pano.rotation.y = lado * -.55;   // de lado para a câmera, o tremular aparece no contorno
  g.add(mastro, ponta, pano);
  g.position.set(TORRE_X[i] + lado * (LARG / 2 - .28), BASE, -PROF / 2 + .3);
  cena.add(g);
  return { g, geo, base: Float32Array.from(geo.attributes.position.array) };
});
function tremular(t) {
  bandeiras.forEach((b, i) => {
    b.g.position.y = topoTorre(i);
    const p = b.geo.attributes.position, a = p.array;
    for (let k = 0; k < p.count; k++) {
      const x = b.base[k * 3], y = b.base[k * 3 + 1];
      const f = x / .95;
      a[k * 3 + 2] = Math.sin(x * 6 - t * 7.5 + i * 2) * .14 * f + Math.sin(y * 5 + t * 4) * .03 * f;
      a[k * 3 + 1] = y - f * f * .05 + Math.sin(x * 4 - t * 6) * .015 * f;
    }
    p.needsUpdate = true;
    b.geo.computeVertexNormals();
  });
}

function criarCoroa() {
  const partes = [];
  partes.push(new THREE.CylinderGeometry(.42, .37, .28, 32, 1, true));
  for (const [y, r] of [[-.14, .375], [.14, .42]]) {
    const anel = new THREE.TorusGeometry(r, .04, 8, 36);
    anel.rotateX(Math.PI / 2);
    anel.translate(0, y, 0);
    partes.push(anel);
  }
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2;
    const pico = new THREE.ConeGeometry(.1, .36, 12);
    pico.translate(Math.cos(a) * .4, .32, Math.sin(a) * .4);
    const bola = new THREE.SphereGeometry(.055, 12, 8);
    bola.translate(Math.cos(a) * .4, .52, Math.sin(a) * .4);
    partes.push(pico, bola);
  }
  const g = new THREE.Group();
  const ouro = malha(mergeGeometries(partes), material('#ffc93c', { metal: 1, rugosidade: .2, lados: THREE.DoubleSide }));
  const gemas = [];
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 + Math.PI / 5;
    const gema = new THREE.SphereGeometry(.06, 12, 8);
    gema.scale(1, 1.25, .6);
    gema.rotateY(-a + Math.PI / 2);
    gema.translate(Math.cos(a) * .41, 0, Math.sin(a) * .41);
    gemas.push(gema);
  }
  const pedras = malha(mergeGeometries(gemas), material('#ff2d55', { verniz: 1, rugosidade: .1, emissivo: '#ff2d55', intensidadeEmissiva: .35 }));
  g.add(ouro, pedras);
  g.scale.setScalar(0);
  cena.add(g);
  return g;
}
const coroa = criarCoroa();
let coroaX = 0, coroaY = BASE, coroaEscala = 0;

/* linha de meta: faixa quadriculada entre dois postes + plano de laser na altura da meta.
   Enquanto a meta está acima da vista, fica só uma linha tracejada no alto com a placa "META ▲". */

const ALT_META = .5;
const texXadrez = texturaCanvas(2048, 94, (ctx, w, h) => {
  const q = h / 2;
  for (let x = 0, k = 0; x < w; x += q, k++) {
    ctx.fillStyle = k % 2 ? '#ffffff' : CONTORNO; ctx.fillRect(x, 0, q, q);
    ctx.fillStyle = k % 2 ? CONTORNO : '#ffffff'; ctx.fillRect(x, q, q, q);
  }
}).textura;
const texTraco = texturaCanvas(128, 16, (ctx) => { ctx.fillStyle = OURO; ctx.fillRect(0, 0, 80, 16); }, { repetir: [Math.round(LARG_META * 4), 1] }).textura;
const placaMeta = (real) => texturaCanvas(640, 120, (ctx, w, h) => {
  ctx.fillStyle = CONTORNO;
  ctx.beginPath(); ctx.roundRect(6, 6, w - 12, h - 12, (h - 12) / 2); ctx.fill();
  ctx.strokeStyle = OURO; ctx.lineWidth = 7; ctx.stroke();
  textoJogo(ctx, `🏁 META ${fmt(META)}${real ? '' : ' ▲'}`, w / 2, h / 2 + 3, { tamanho: 66, cor: OURO, espessura: .12, sombra: false, larguraMax: w - 60 });
}).textura;
const texPlacaPerto = placaMeta(true), texPlacaLonge = placaMeta(false);
const meta = new THREE.Group();
const faixaMeta = new THREE.Mesh(new THREE.PlaneGeometry(LARG_META, ALT_META),
  new THREE.MeshStandardMaterial({ map: texXadrez, emissiveMap: texXadrez, emissive: '#ffffff', emissiveIntensity: .55, roughness: .5 }));
const mFriso = material(OURO, { emissivo: OURO, intensidadeEmissiva: 1.6 });
const frisos = [-1, 1].map(s => {
  const friso = new THREE.Mesh(caixa(LARG_META, .06, .08, .02), mFriso);
  friso.position.y = s * (ALT_META / 2 + .03);
  return friso;
});
const traco = new THREE.Mesh(new THREE.PlaneGeometry(LARG_META, .07), new THREE.MeshBasicMaterial({ map: texTraco, transparent: true, fog: false, toneMapped: false }));
const mPlaca = new THREE.MeshBasicMaterial({ map: texPlacaLonge, transparent: true, fog: false, toneMapped: false });
const placaM = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9 * 120 / 640), mPlaca);
placaM.position.z = .03;
const brilhoMeta = new THREE.Mesh(new THREE.PlaneGeometry(LARG_META + 2, 2.4), new THREE.MeshBasicMaterial({ map: texBrilho, color: OURO,
  transparent: true, opacity: .4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
brilhoMeta.position.z = -.05;
const laser = new THREE.Mesh(new THREE.PlaneGeometry(LARG_META, 5.4), new THREE.MeshBasicMaterial({ color: OURO, transparent: true,
  opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
laser.rotation.x = -Math.PI / 2;
laser.position.z = 2.6;
meta.add(brilhoMeta, faixaMeta, ...frisos, traco, placaM, laser);
meta.position.z = Z_META;
cena.add(meta);
// postes da meta: dentro do quadro e só até um pouco acima da linha (não sobem para o HUD)
const ALT_POSTE = BASE + META_LONGE + .35;
for (const s of [-1, 1]) {
  const poste = malha(new THREE.CylinderGeometry(.05, .07, ALT_POSTE, 12), material('#9a94b4', { metal: .85, rugosidade: .3 }));
  poste.position.set(s * (LARG_META / 2 + .1), ALT_POSTE / 2, Z_META);
  const topoPoste = malha(new THREE.SphereGeometry(.13, 14, 10), mOuro);
  topoPoste.position.set(s * (LARG_META / 2 + .1), ALT_POSTE + .05, Z_META);
  cena.add(poste, topoPoste);
}
let metaPerto = null;
function atualizarMeta(t) {
  const perto = META * unidade <= META_LONGE + .01;
  if (perto !== metaPerto) {
    metaPerto = perto;
    mPlaca.map = perto ? texPlacaPerto : texPlacaLonge;
    mPlaca.needsUpdate = true;
    for (const m of [faixaMeta, ...frisos, laser]) m.visible = perto;
    traco.visible = !perto;
  }
  meta.position.y = BASE + Math.min(META * unidade, META_LONGE);
  const pulso = .5 + Math.sin(t * 4) * .5;
  faixaMeta.material.emissiveIntensity = .4 + pulso * .3;
  brilhoMeta.material.opacity = (perto ? .32 : .14) + pulso * .12;
  texTraco.offset.x = (-t * .6) % 1;   // limitado: depois de horas de live o float perderia precisão
}

/* régua de altura entre as torres */

const tracos = new THREE.InstancedMesh(new THREE.BoxGeometry(1.25, .035, .035),
  new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .45, fog: false }), MAX_REGUA);
tracos.count = 0;
cena.add(tracos);
const marcas = Array.from({ length: MAX_REGUA }, () => {
  const r = rotulo('0', { tamanho: 72, altura: .46, cor: '#ffffff', fundo: 'rgba(16,9,44,.78)' });
  r.visible = false;
  r.userData.texto = '';
  cena.add(r);
  return r;
});
function regua() {
  const marca = PASSOS.find(p => p * unidade >= 1.45) ?? PASSOS.at(-1);
  let j = 0;
  for (let v = marca; v < META && j < MAX_REGUA; v += marca, j++) {
    const y = BASE + v * unidade;
    if (y > BASE + VISTA - 1.1) break;
    tracos.setMatrixAt(j, M.makeTranslation(0, y, 0));
    const r = marcas[j], txt = fmt(v);
    if (r.userData.texto !== txt) { r.userData.trocar(txt); r.userData.texto = txt; }
    r.position.set(0, y + .3, 0);
    r.visible = true;
  }
  tracos.count = j;
  tracos.instanceMatrix.needsUpdate = true;
  for (let k = j; k < MAX_REGUA; k++) marcas[k].visible = false;
}

/* câmera: leve balanço; aproxima no arranha-céu e na torre vencedora */

const camPos = CAM.pos.clone(), camAlvo = CAM.alvo.clone();
const dPos = new THREE.Vector3(), dAlvo = new THREE.Vector3();
function moverCamera(dt, t) {
  if (vencedor >= 0) {
    // torre vencedora no centro. A mais alta possível tem VISTA/1.25 (ver "zoom"): o topo fica em ~y 800, a coroa
    // entre ~600 e ~740 (logo abaixo da faixa de vencedor, que termina em ~560) e a placa do pedestal acima do ranking
    const i = vencedor;
    dAlvo.set(TORRE_X[i] * .85, 4.45, 0);
    dPos.set(TORRE_X[i] * .55, 4.75, 21.25);
  } else if (foco && t < foco.ate) {
    // arranha-céu: chega mais perto e para o lado da torre, sem subir a cena para o HUD (meta e lajes abaixo de ~800 px)
    const i = foco.i;
    dPos.set(TORRE_X[i] * .3, CAM.pos.y - .5, CAM.pos.z - 1.25);
    dAlvo.set(TORRE_X[i] * .3, CAM.alvo.y - .2, 0);
  } else {
    dPos.copy(CAM.pos);
    dAlvo.copy(CAM.alvo);
  }
  dPos.x += Math.sin(t * .23) * .45;
  dPos.y += Math.sin(t * .31) * .12;
  const s = 1 - Math.exp(-dt * (vencedor >= 0 ? 1.6 : 2.4));
  camPos.lerp(dPos, s);
  camAlvo.lerp(dAlvo, s);
  c3d.camera.position.copy(camPos);
  c3d.camera.lookAt(camAlvo);
}

// ponto da tela (px do palco) acima do topo da torre i, para os efeitos em HTML
const V = new THREE.Vector3();
const telaTopo = (i, acima = .4) => c3d.projetar(V.set(TORRE_X[i], topoTorre(i) + acima, 0));

/* ---------- laço único ---------- */

const elClarao = $('clarao');
let ultimaPlaca = -1;
c3d.aoQuadro((dt, t) => {
  for (const i of [0, 1]) {
    vis[i] += (pousado[i] - vis[i]) * (1 - Math.exp(-dt * 10));
    impacto[i] *= Math.exp(-dt * 9);
  }
  // "zoom": a torre mais alta fica a ~70% da vista; perto da meta, a linha da meta entra no quadro
  const alvo = Math.min(META * 1.08, Math.max(40, Math.max(...pousado) * 1.4));
  faixa += (alvo - faixa) * (1 - Math.exp(-dt * 4));
  faixa = Math.max(faixa, Math.max(...vis) * 1.25);
  unidade = VISTA / faixa;

  atualizarQuedas(dt);
  montarTorres();
  atualizarPoeira(dt);
  atualizarOndas(dt);
  tremular(t);
  regua();
  atualizarMeta(t);

  // coroa sobre a torre que lidera
  const l = vis[0] > vis[1] + .5 ? 0 : vis[1] > vis[0] + .5 ? 1 : -1;
  if (l >= 0) {
    const s = 1 - Math.exp(-dt * 6);
    coroaX += (TORRE_X[l] - coroaX) * s;
    coroaY += (topoTorre(l) + .78 - coroaY) * s;
  }
  // trocando de torre a coroa encolhe no caminho e cresce na outra (não cruza a placa da meta pelo ar)
  const viajando = l >= 0 && Math.abs(TORRE_X[l] - coroaX) > 1.2;
  coroaEscala += ((l >= 0 && !viajando ? (vencedor >= 0 ? 1.5 : 1) : 0) - coroaEscala) * (1 - Math.exp(-dt * (viajando ? 14 : 7)));
  coroa.scale.setScalar(Math.max(.001, coroaEscala));
  coroa.position.set(coroaX, coroaY + Math.sin(t * 3) * .08, .25);
  coroa.rotation.set(.18, t * 1.4, 0);

  // placa com quantos entraram em cada time (confere 4× por segundo)
  if (t - ultimaPlaca > .25) {
    ultimaPlaca = t;
    const n = times.tamanho();
    [n.A, n.B].forEach((q, i) => q !== placas[i].n && pintarPlaca(i, q));
  }

  if (antenas) antenas.material.color.setRGB(Math.sin(t * 3) > .2 ? 1 : .25, .1, .1);
  for (const h of holofotes) {
    h.alvo.set(h.lado * (8 + Math.sin(t * .45 + h.lado) * 26), 120, -60 + Math.cos(t * .3 + h.lado) * 30);
    h.feixe.lookAt(h.alvo);
  }
  clarao = Math.max(0, clarao - dt * 1.6);
  elClarao.style.opacity = clarao * .55;
  const agora = performance.now();
  for (const c of contadores) c.passo(agora);
  moverCamera(dt, t);
});

/* ---------- regras ---------- */

// Textos que sobem da cena: cada um procura um lugar livre perto de onde nasceu (alterna abaixo/acima) para não
// empilhar letras quando vários saem juntos, e fica inteiro dentro da tela mesmo se a torre saiu do quadro.
// O texto do kit cresce até 30% de 1,1 s e depois sobe 200 px; a conta considera onde cada um já está agora.
const textosVivos = [];
function soltarTexto({ x, y, texto, cor = '#fff', tamanho = 72 }) {
  const agora = performance.now();
  for (let k = textosVivos.length - 1; k >= 0; k--) if (agora - textosVivos[k].nasceu > 950) textosVivos.splice(k, 1);
  const larg = Math.min(1040, [...texto].length * tamanho * .62 + tamanho * .3), alto = tamanho * 1.1;
  const cx = Math.min(1080 - larg / 2 - 10, Math.max(larg / 2 + 10, x));
  const limitar = (v) => Math.min(1470, Math.max(860, v));
  const yAgora = (o) => o.y - 200 * (1 - (1 - Math.min(1, Math.max(0, (agora - o.nasceu - 330) / 770))) ** 3);
  const bate = (yy) => textosVivos.some(o => Math.abs(o.x - cx) < (o.larg + larg) / 2 && Math.abs(yAgora(o) - yy) < (o.alto + alto) / 2);
  let cy = limitar(y);
  for (let k = 1; k <= 8 && bate(cy); k++) cy = limitar(y + Math.ceil(k / 2) * (k % 2 ? 1 : -1) * alto);
  textosVivos.push({ x: cx, y: cy, larg, alto, nasceu: agora });
  flutuar(palco, { x: cx, y: cy, texto, cor, tamanho });
  return { x: cx, y: cy };
}

function mostrarCombo(i, n, ganho) {
  const el = $('combo' + i);
  if (n < 2) return;
  el.textContent = `COMBO x${n}`;
  el.classList.add('on');
  animar(el);
  clearTimeout(timerCombo[i]);
  timerCombo[i] = setTimeout(() => el.classList.remove('on'), 4000);
  tocar('combo', n);
  if (MARCOS.some(m => n - ganho < m && n >= m)) {
    const p = telaTopo(i, 1);
    particulas(palco, { x: p.x, y: p.y, qtd: 30, forca: 1.4, cores: [TIMES[i].cor, OURO, '#fff'] });
    soltarTexto({ x: p.x, y: Math.max(880, p.y), texto: `COMBO x${n}!`, cor: OURO, tamanho: 90 });
    fx.explodir([TORRE_X[i], topoTorre(i) + 1, 0], { cores: [TIMES[i].cor, OURO], qtd: 40, forca: 5 });
    c3d.tremer(.15, .35);
  }
}

function mostrarUltimo(ev, i) {
  const u = $('ultimo');
  u.style.setProperty('--cor', TIMES[i].cor);
  const nome = document.createElement('span');
  nome.className = 'quem txt-jogo';
  nome.textContent = ev.nome || ev.user;
  u.replaceChildren(avatar(ev, 'grande'), nome);
  animar(u);
}

// Soma blocos ao time i; durante a tela de vencedor guarda para a próxima rodada.
function construir(i, n, acao) {
  if (fim) { guardado[i] += n; return; }
  const antes = lider();
  alt[i] += n;
  const galaxia = acao === 'arranhaceu' || n >= (BLOCOS.arranhaceu ?? 1000);
  const tipo = galaxia ? 'galaxia' : n >= 100 ? 'andar' : 'normal';
  derrubar(i, n, galaxia ? 16 : Math.min(9, Math.ceil(Math.sqrt(n))), tipo);
  if (galaxia) {
    // arranha-céu: lajes em sequência rápida, clarão e a câmera chega perto
    clarao = .9;
    foco = { i, ate: c3d.tempo + 2.4 };
    const agora = performance.now();
    if (agora - ultimoArranhaCeu > 1200) {   // vários seguidos: um letreiro só
      ultimoArranhaCeu = agora;
      soltarTexto({ x: 540, y: 1080, texto: 'ARRANHA-CÉU!', cor: OURO, tamanho: 112 });
    }
    tocar('virada');
  } else if (n >= 100) {
    clarao = .25;
    // vários andares seguidos do mesmo time: um aviso só (não empilha "NOVO ANDAR!" repetido)
    const agora = performance.now();
    if (agora - ultimoAndar[i] > 900) {
      ultimoAndar[i] = agora;
      const p = telaTopo(i, 1.2);
      soltarTexto({ x: p.x, y: Math.max(1000, p.y + 160), texto: 'NOVO ANDAR!', cor: TIMES[i].cor, tamanho: 76 });
    }
    tocar('impacto');
  } else {
    tocar('ponto');
  }
  const depois = lider();
  if (antes !== -1 && depois !== -1 && antes !== depois && !galaxia) {
    soltarTexto({ x: 540, y: 1180, texto: 'VIRADA!', cor: TIMES[depois].cor, tamanho: 110 });
    tocar('virada');
  }
  if (alt[i] >= META) vencer(i);
}

function vencer(i) {
  placar[i]++;
  guardar('torres-rivais:placar', placar);
  vencedor = i;
  palco.classList.add('fim');
  aviso = document.createElement('div');
  aviso.className = 'vencedor';
  aviso.style.setProperty('--destaque', TIMES[i].cor);
  const s = document.createElement('small');
  s.textContent = `Chegou a ${fmt(META)} blocos`;
  aviso.append(s, `🏆 ${TIMES[i].nome} venceu!`);
  const mvp = [...rodadaMvp.values()].filter(p => p.i === i).sort((a, b) => b.n - a.n)[0];
  if (mvp) {
    const m = document.createElement('span');
    m.className = 'mvp';
    m.textContent = `👷 MVP: ${mvp.nome} +${fmt(mvp.n)}`;
    aviso.appendChild(m);
  }
  palco.appendChild(aviso);
  const cores = [TIMES[i].cor, OURO, '#ffffff', TIMES[1 - i].cor];
  fx.confete({ cores, qtd: 260, area: [TORRE_X[i] - 5, TORRE_X[i] + 5], altura: 9, z: [-3, 5] });
  // fogos sobre a torre vencedora
  for (let k = 0; k < 6; k++) {
    setTimeout(() => {
      if (vencedor !== i) return;
      fx.explodir([TORRE_X[i] + (Math.random() - .5) * 5, topoTorre(i) + 1.5 + Math.random() * 2, -1 - Math.random() * 2],
        { cores: [cores[k % 3], '#ffffff'], qtd: 55, forca: 6, tamanho: .12, vida: 1.3, gravidade: -5, subida: .5 });
      if (k % 2 === 0) tocar('impacto');
    }, 300 + k * 520);
  }
  c3d.tremer(.1, .35);
  tocar('vitoria');
  hud(false);
  fim = setTimeout(novaRodada, VENCEDOR_MS);
}

function novaRodada() {
  clearTimeout(fim);
  fim = null;
  aviso?.remove();
  vencedor = -1;
  palco.classList.remove('fim');
  // presentes que chegaram no intervalo valem na nova rodada (sem encerrar de cara)
  alt = guardado.map(g => Math.min(g, META * .5));
  for (const i of [0, 1]) if (vis[i] > alt[i] + 1) poeira(TORRE_X[i], BASE + .1, 0, 14, 1.6);
  pousado = [...alt];
  guardado = [0, 0];
  fila.length = 0;
  caindo.length = 0;
  rodadaMvp = new Map();
  combo.zerar();
  hud(false);
}

function aoEvento(ev) {
  if (ev.tipo === 'comentario') {
    const t = times.pelaPalavra(ev);
    if (!t) return;
    const i = idx(t), agora = performance.now();
    // nome de quem entrou sobe da base da torre (no máximo ~4 por segundo por time)
    if (agora - ultimoNome[i] > 250) {
      ultimoNome[i] = agora;
      const p = c3d.projetar(V.set(TORRE_X[i] + (Math.random() - .5) * 1.6, BASE + .6 + Math.random(), 1.4));
      soltarTexto({ x: p.x, y: p.y, texto: `+ ${String(ev.nome || ev.user).slice(0, 14)}`, cor: '#fff', tamanho: 38 });
    }
    return;
  }
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao) return;
  const i = idx(times.doUsuario(ev.user));
  const q = ev.quantidade ?? 1;
  const n = (BLOCOS[acao] ?? 0) * q;
  // soma ao MVP antes de construir(): o presente que fecha a rodada também conta (no intervalo não entra)
  if (!fim) {
    const r = rodadaMvp.get(ev.user) ?? { nome: ev.nome || ev.user, n: 0, i };
    r.n += n; r.i = i;
    rodadaMvp.set(ev.user, r);
  }
  construir(i, n, acao);
  const p = telaTopo(i, 1.1);
  const onde = soltarTexto({ x: p.x + (Math.random() - .5) * 90, y: Math.max(870, p.y), texto: `+${fmt(n)}`, cor: OURO, tamanho: n >= 30 ? 78 : 50 });
  particulas(palco, { ...onde, qtd: Math.min(q, 5), emoji: cfg.emojis?.[acao] ?? emojiDoPresente(ev.presenteNome), forca: .7 });
  mostrarCombo(i, combo.registrar(i, q), q);
  mostrarUltimo(ev, i);

  ranking.somar(ev, n, { cor: TIMES[i].cor });
  pintarRanking($('ranking'), ranking.top(4), { destaque: ev.user });

  hud();
  avisar(html`<span class="t${i}"><b>${ev.nome || ev.user}</b> ${q}× ${ev.presenteNome} <span class="mais">+${fmt(n)}</span></span>`);
}

function presenteFalso(nome, quantidade = 1) {
  return eventoFalso({ presenteNome: nome, quantidade });
}

function rajada() {
  const presentes = ['Rose', 'Rose', 'GG', 'GG', 'Doughnut', 'Galaxy', 'Finger Heart'];
  for (let k = 0; k < 20; k++) setTimeout(() => aoEvento(Math.random() < .5
    ? eventoFalso({ tipo: 'comentario', texto: cfg.palavras[Math.random() < .5 ? 'A' : 'B'][0] })
    : presenteFalso(presentes[Math.floor(Math.random() * presentes.length)], 1 + Math.floor(Math.random() * 3))
  ), k * 120);
}

teclas({
  t: rajada,
  g: () => aoEvento(presenteFalso(cfg.acoes?.arranhaceu?.[0] ?? 'Galaxy')),
  r: () => {
    placar = [0, 0];
    guardar('torres-rivais:placar', placar);
    times.zerar();
    ranking.zerar();
    pintarRanking($('ranking'), []);
    guardado = [0, 0];
    novaRodada();
  }
});

hud(false);
conectar(aoEvento);
