import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, criarTimes, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, avatar, animar, particulas as pDom, tremer, confete,
  pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';
import { criarCena, THREE, material, malha, caixa, texturaCanvas, texturaMaterial, textoJogo, fontesProntas,
  chao, holofote, boneco, torcida, criarParticulas, mergeGeometries } from '../kit/cena3d.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');

// "arena" (padrão): ringue com público, telões e holofotes; outra cor ou "transparente": só o ringue
const fundoCfg = cfg.fundo ?? 'arena';
const cenario = fundoCfg === 'arena';
const transparente = fundoCfg === 'transparente';
aplicarFundo(cenario ? '#12061f' : fundoCfg);
// sobre a câmera da live a sombra do placar escureceria o rosto de quem está transmitindo
if (transparente) { document.querySelector('.vinheta').remove(); palco.classList.add('transparente'); }
escalarPalco(palco);
ligarSom(cfg.som);

const VIDA = Math.max(1, Number(cfg.vida) || 500);
const PAUSA = Math.max(2, Number(cfg.pausa) || 5);
const NOME = { soco: 'SOCO', chute: 'CHUTE', especial: 'ESPECIAL', finalizacao: 'FINALIZAÇÃO' };
const EMOJI_GOLPE = { soco: '👊', chute: '🦵', especial: '⚡', finalizacao: '💥' };
const DURACAO = { soco: 0.32, chute: 0.42, especial: 0.8, finalizacao: 1 };
const IMPACTO = { soco: 0.5, chute: 0.5, especial: 0.85, finalizacao: 0.55 }; // fração da animação em que o golpe acerta
const ONOMATOPEIA = { soco: ['POW!', 'PAF!', 'TUM!'], chute: ['BAM!', 'CRACK!', 'PÁ!'], especial: ['ZAAP!', 'VUSH!'], finalizacao: ['KABOOM!', 'KRAKOW!'] };
const MAX_ANIM = 6, MAX_FILA = 30, MAX_NUMEROS = 14, MAX_ONOMA = 5;
const MARCOS = [10, 25, 50, 100, 250, 500, 1000];

const mapaGolpes = Object.fromEntries(Object.entries(cfg.golpes).map(([k, g]) => [k, g.presentes ?? []]));
const times = criarTimes(cfg.palavras);
const avisar = avisos($('avisos'), { max: 2 });
const combo = criarCombo({ janela: 4000 });
const ranking = criarRanking();
const timerCombo = [0, 0];

// lado 0 à esquerda olhando para +x, lado 1 à direita olhando para -x
const lut = cfg.lutadores.slice(0, 2).map((l, i) => ({
  nome: l.nome, cor: l.cor, lado: i, dir: i ? -1 : 1, x0: i ? 0.66 : -0.66,
  vida: VIDA, estado: 'idle', t: 0, golpe: null, fila: [],
  flash: 0, recuo: 0, reacao: 'cabeca', levantar: 0, caiu: false
}));

const salvo = lembrar('briga', null);
let placar = Array.isArray(salvo?.placar) && salvo.placar.length === 2 && salvo.placar.every(Number.isFinite) ? salvo.placar : [0, 0];
let round = Number.isFinite(salvo?.round) ? salvo.round : 1;
let pausa = 0, flashTela = 0, relogio = 0, tReal = 0, agito = 0, ultimoSom = 0, ladoAgito = null;
let lento = 0, ondaCorda = 0, claraoAtual = 0;
let faixaEm = 0, faixaLado = -1; // faixa do vencedor: entra em tempo de jogo, logo depois que o perdedor bate na lona

await fontesProntas();

/* ---------- HUD (só texto do config ou via textContent / html``) ---------- */

palco.style.setProperty('--cor-a', lut[0].cor);
palco.style.setProperty('--cor-b', lut[1].cor);
lut.forEach((f, i) => { $('nome' + i).textContent = f.nome; });

// legenda: emoji do presente, dano e nome do golpe
for (const [tipo, g] of Object.entries(cfg.golpes)) {
  const ref = g.presentes?.[0];
  const nomePresente = typeof ref === 'number' ? (g.nome ?? `#${ref}`) : String(ref ?? '');
  const chip = document.createElement('div');
  chip.className = 'golpe';
  const emoji = document.createElement('span');
  emoji.className = 'emoji';
  emoji.textContent = g.emoji ?? emojiDoPresente(nomePresente, EMOJI_GOLPE[tipo] ?? '🎁');
  const txt = document.createElement('div');
  txt.className = 'txt';
  const dano = document.createElement('span');
  dano.className = 'dano txt-jogo';
  dano.textContent = `-${g.dano}`;
  const rot = document.createElement('span');
  rot.className = 'rot';
  rot.textContent = NOME[tipo] ?? tipo;
  chip.title = nomePresente;
  txt.append(dano, rot);
  chip.append(emoji, txt);
  $('golpes').appendChild(chip);
}

function esperando() {
  const u = $('ultimo');
  u.style.removeProperty('--cor');
  const e = document.createElement('span');
  e.className = 'espera';
  e.textContent = '🥊';
  const t = document.createElement('span');
  t.className = 'golpeou txt-jogo';
  t.style.color = '#fff';
  t.textContent = 'Mande presente!';
  u.replaceChildren(e, t);
}

function pintarTop(destaque = null) {
  const lista = ranking.top(4);
  if (lista.length) pintarRanking($('ranking'), lista, { destaque });
  else {
    const vazio = document.createElement('li');
    vazio.className = 'ranking-vazio';
    vazio.textContent = `Comente ${cfg.palavras.A[0]} ou ${cfg.palavras.B[0]} e mande presente para bater!`;
    $('ranking').replaceChildren(vazio);
  }
}

function atualizarHud() {
  const tam = times.tamanho();
  lut.forEach((f, i) => {
    const frac = f.vida / VIDA;
    $('vida' + i).style.transform = `scaleX(${frac})`;
    $('rastro' + i).style.transform = `scaleX(${frac})`;
    $('barra' + i).classList.toggle('perigo', frac > 0 && frac < 0.25);
    $('hp' + i).textContent = Math.ceil(f.vida);
    const pal = cfg.palavras[i ? 'B' : 'A'][0];
    $('torcida' + i).replaceChildren('💬', Object.assign(document.createElement('b'), { textContent: pal }), `👥 ${tam[i ? 'B' : 'A']}`);
  });
  $('trofeu0').textContent = placar[0];
  $('trofeu1').textContent = placar[1];
  $('round').textContent = `ROUND ${round}`;
}

function anunciarRound() {
  $('anuncioRound').textContent = `ROUND ${round}`;
  animar($('anuncio'), 'mostra');
}

/* ---------- cena 3D ---------- */

const V3 = THREE.Vector3;
const R = 2.1;          // meia largura do ringue entre os postes
const BORDA = 2.45;     // meia largura da lona (até a saia)
const ALTURAS_CORDA = [0.4, 0.8, 1.2];
const CORES_CORDA = ['#1f47c9', '#f2f2f6', '#d41c34'];
const FUNDO = '#140822';
const CAMERA = { pos: [0, 3.4, 8.8], alvo: [0, 1.02, 0], fov: 40 };

const c3d = criarCena(palco, {
  cfg, fundo: transparente ? null : cenario ? FUNDO : fundoCfg, luz: 'noite', exposicao: 0.95,
  camera: CAMERA, sol: { pos: [-4, 9, 3], alcance: 3.4, alvo: [0, 0, 0] },
  neblina: cenario ? { cor: FUNDO, perto: 10, longe: 30 } : null
});
const { cena } = c3d;
c3d.sol.color.set('#fff2de');
c3d.sol.intensity = 2.5;
c3d.hemi.intensity = 0.2;
cena.environmentIntensity = 0.16;

// cor do config misturada com outra (k = quanto da segunda)
const misturar = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();

// junta várias geometrias (cada uma já posicionada) numa malha só: menos chamadas de desenho
function fundidas(geos, mat, opc) {
  const g = mergeGeometries(geos);
  geos.forEach((x) => x.dispose());
  return malha(g, mat, opc);
}

let semente = 9;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);

/* ----- ringue ----- */

function desenharLona(ctx, w, h) {
  ctx.fillStyle = '#9d96b0';
  ctx.fillRect(0, 0, w, h);
  // sujeira de uso e marcas de tênis perto do centro
  for (let i = 0; i < 7000; i++) {
    ctx.globalAlpha = 0.03 + rnd() * 0.06;
    ctx.fillStyle = rnd() < 0.6 ? '#8f86a8' : '#ffffff';
    const s = 1 + rnd() * 3;
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#4a3e66';
    ctx.beginPath();
    ctx.ellipse(w / 2 + (rnd() - 0.5) * 520, h / 2 + (rnd() - 0.5) * 360, 20 + rnd() * 30, 9 + rnd() * 10, rnd() * 3, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // faixa da borda (fora das cordas) com filete dourado
  const b = (BORDA - R + 0.05) / (BORDA * 2) * w;
  ctx.fillStyle = '#2a1650';
  ctx.fillRect(0, 0, w, b); ctx.fillRect(0, h - b, w, b); ctx.fillRect(0, 0, b, h); ctx.fillRect(w - b, 0, b, h);
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 6; ctx.strokeRect(b, b, w - 2 * b, h - 2 * b);
  // cantos de cada lutador (fundo-esquerda e fundo-direita)
  [[b, b, 1, lut[0].cor], [w - b, b, -1, lut[1].cor]].forEach(([x, y, s, cor]) => {
    ctx.globalAlpha = 0.85; ctx.fillStyle = cor;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s * 190, y); ctx.lineTo(x, y + 190); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  });
  // logo pintado no centro
  const cx = w / 2, cy = h / 2;
  ctx.globalAlpha = 0.93;
  const fundoLogo = ctx.createRadialGradient(cx, cy - 60, 20, cx, cy, 230);
  fundoLogo.addColorStop(0, '#4a2a8a'); fundoLogo.addColorStop(1, '#22104a');
  ctx.fillStyle = fundoLogo;
  ctx.beginPath(); ctx.arc(cx, cy, 225, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 16; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
  ctx.lineWidth = 10;
  ctx.strokeStyle = lut[0].cor; ctx.beginPath(); ctx.arc(cx, cy, 200, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke();
  ctx.strokeStyle = lut[1].cor; ctx.beginPath(); ctx.arc(cx, cy, 200, -Math.PI * 0.45, Math.PI * 0.45); ctx.stroke();
  textoJogo(ctx, 'BRIGA', cx, cy - 40, { tamanho: 132, cor: '#ffd23f', espessura: 0.16 });
  textoJogo(ctx, 'DA LIVE', cx, cy + 72, { tamanho: 82, cor: '#ffffff', espessura: 0.16 });
  ctx.globalAlpha = 1;
}

function desenharSaia(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a1a6e'); g.addColorStop(1, '#14082c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, 0, w, 12);
  ctx.fillStyle = lut[0].cor; ctx.fillRect(0, h - 18, w / 2, 18);
  ctx.fillStyle = lut[1].cor; ctx.fillRect(w / 2, h - 18, w / 2, 18);
  // sobre a câmera da live a saia fica atrás do ranking: sem letreiro, para o HUD continuar legível
  if (transparente) return;
  for (const x of [w / 4, w * 3 / 4]) textoJogo(ctx, 'BRIGA DA LIVE', x, h / 2 + 2, { tamanho: 64, cor: '#ffd23f', espessura: 0.14 });
}

function criarRingue() {
  const grupo = new THREE.Group();
  // lona com trama em relevo
  const lonaTex = texturaCanvas(1024, 1024, desenharLona);
  const trama = texturaMaterial('tecido', { cor: '#8a8a8a', repetir: [12, 12], tamanho: 256 });
  trama.mapa.dispose();
  const lona = malha(new THREE.PlaneGeometry(BORDA * 2, BORDA * 2),
    material('#ffffff', { mapa: lonaTex.textura, relevo: trama.relevo, escalaRelevo: 0.5, rugosidade: 0.85 }), { sombra: false });
  lona.rotation.x = -Math.PI / 2;
  lona.position.y = 0.002;
  grupo.add(lona);
  // tablado com a saia estampada
  const saia = malha(new THREE.BoxGeometry(BORDA * 2, 1, BORDA * 2),
    material('#ffffff', { mapa: texturaCanvas(1024, 192, desenharSaia).textura, rugosidade: 0.7 }), { sombra: false });
  saia.position.y = -0.5;
  grupo.add(saia);
  // postes de metal cromado, protetores nos cantos (cor de cada lutador atrás, brancos na frente)
  const postes = [], protetores = [[], [], []];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    postes.push(new THREE.CylinderGeometry(0.05, 0.06, 2.65, 16).translate(sx * R, 0.31, sz * R));
    postes.push(new THREE.SphereGeometry(0.075, 16, 10).translate(sx * R, 1.64, sz * R));
    const p = caixa(0.22, 1.1, 0.22, 0.06).clone().rotateY(Math.PI / 4).translate(sx * R, 0.83, sz * R);
    protetores[sz > 0 ? 2 : sx < 0 ? 0 : 1].push(p);
  }
  grupo.add(fundidas(postes, material('#d5d9e0', { metal: 1, rugosidade: 0.22 })));
  [lut[0].cor, lut[1].cor, '#f4f2f8'].forEach((cor, k) =>
    grupo.add(fundidas(protetores[k], material(cor, { rugosidade: 0.35, verniz: 0.6 }))));
  // escadinhas de aço nas laterais
  const degraus = [], trilhos = [];
  for (const lado of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      degraus.push(new THREE.BoxGeometry(0.34, 0.05, 0.8).translate(lado * (BORDA + 0.2 + (2 - k) * 0.3), -0.75 + k * 0.27, 1.55));
    }
    for (const dz of [-0.42, 0.42]) {
      const t = new THREE.BoxGeometry(1.15, 0.06, 0.05);
      t.rotateZ(lado * -0.72);
      trilhos.push(t.translate(lado * (BORDA + 0.5), -0.48, 1.55 + dz));
    }
  }
  grupo.add(fundidas(degraus, material('#26232c', { rugosidade: 0.8 })));
  grupo.add(fundidas(trilhos, material('#c8ccd4', { metal: 1, rugosidade: 0.3 })));
  cena.add(grupo);
  return grupo;
}

// cordas em tubo: 4 lados por corda, vértices guardados para a corda balançar quando o ringue treme
function criarCordas() {
  const c = R - 0.07, T = 28, RAD = 8;
  const cantos = [[-c, -c], [c, -c], [c, c], [-c, c]];
  return ALTURAS_CORDA.map((y, n) => {
    const geos = [];
    for (let s = 0; s < 4; s++) {
      const [x0, z0] = cantos[s], [x1, z1] = cantos[(s + 1) % 4];
      geos.push(new THREE.TubeGeometry(new THREE.LineCurve3(new V3(x0, y, z0), new V3(x1, y, z1)), T, 0.03, RAD, false));
    }
    const m = fundidas(geos, material(CORES_CORDA[n], { rugosidade: 0.35, verniz: 0.5 }));
    const pos = m.geometry.attributes.position;
    pos.setUsage(THREE.DynamicDrawUsage);
    const porLado = (T + 1) * (RAD + 1);
    const seno = new Float32Array(pos.count), dentroX = new Float32Array(pos.count), dentroZ = new Float32Array(pos.count), fase = new Float32Array(pos.count);
    for (let v = 0; v < pos.count; v++) {
      const s = Math.floor(v / porLado), anel = Math.floor((v % porLado) / (RAD + 1));
      const [x0, z0] = cantos[s], [x1, z1] = cantos[(s + 1) % 4];
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, l = Math.hypot(mx, mz);
      seno[v] = Math.sin(Math.PI * anel / T);
      dentroX[v] = -mx / l; dentroZ[v] = -mz / l; fase[v] = s * 1.3 + n * 0.8;
    }
    cena.add(m);
    return { pos, base: Float32Array.from(pos.array), seno, dentroX, dentroZ, fase };
  });
}

function moverCordas(t, amp) {
  for (const c of cordas) {
    const a = c.pos.array;
    for (let v = 0; v < c.pos.count; v++) {
      const s = c.seno[v], o = amp * s * Math.sin(t * 17 + c.fase[v]);
      a[v * 3] = c.base[v * 3] + c.dentroX[v] * o * 0.6;
      a[v * 3 + 1] = c.base[v * 3 + 1] - 0.03 * s + o;
      a[v * 3 + 2] = c.base[v * 3 + 2] + c.dentroZ[v] * o * 0.6;
    }
    c.pos.needsUpdate = true;
  }
}

criarRingue();
const cordas = criarCordas();
moverCordas(0, 0);

/* ----- arena: chão, arquibancada, flashes ----- */

// (sem placas de LED atrás do ringue: na câmera padrão elas ficavam na altura dos joelhos, picotadas por pernas e cordas)
let tor = null, flashes = null;

if (cenario) {
  chao(c3d, { tipo: 'concreto', cor: '#2a2436', largura: 60, profundidade: 60, repetir: [12, 12], y: -1, rugosidade: 0.55 });

  // arquibancada atrás do ringue: metade com a cor de cada lutador
  const neutras = ['#d8d4e0', '#2f2a40', '#3a3f58', '#c9a53a', '#6a6f88', '#1f1b2c'];
  const paleta = (cor) => [misturar(cor, '#1a1030', 0.2), misturar(cor, '#1a1030', 0.45), misturar(cor, '#ffffff', 0.2), ...neutras];
  const paletas = [paleta(lut[0].cor), paleta(lut[1].cor)];
  const POR_FILEIRA = 38;
  tor = torcida(c3d, {
    fileiras: 11, porFileira: POR_FILEIRA, origem: [-10.6, -0.7, -6.6], passoX: 0.56, passoZ: -0.62, subida: 0.36, escala: 0.72,
    arquibancada: '#272038', cores: (k, i) => { const p = paletas[i < POR_FILEIRA / 2 ? 0 : 1]; return p[Math.floor(rnd() * p.length)]; }
  });
  // público na penumbra (o ringue é que está iluminado)
  tor.corpos.material.color.set('#8f88a3');
  tor.cabecas.material.color.set('#a59eb5');
  // degraus da arquibancada viram uma malha só
  tor.degraus.updateMatrixWorld(true);
  const geoDegraus = mergeGeometries(tor.degraus.children.map((m) => m.geometry.clone().applyMatrix4(m.matrix)));
  const matDegrau = tor.degraus.children[0].material;
  for (const m of [...tor.degraus.children]) { m.geometry.dispose(); tor.degraus.remove(m); }
  tor.degraus.add(malha(geoDegraus, matDegrau, { sombra: false }));

  // flashes de câmera espalhados pelo público (um único Points com brilho por ponto)
  const n = 48;
  const posFlash = new Float32Array(n * 3), corFlash = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const f = Math.floor(rnd() * 11);
    posFlash.set([-10 + rnd() * 20.5, -0.7 + f * 0.36 + 0.55, -6.6 - f * 0.62 + 0.2], k * 3);
  }
  const geoFlash = new THREE.BufferGeometry();
  geoFlash.setAttribute('position', new THREE.BufferAttribute(posFlash, 3));
  geoFlash.setAttribute('color', new THREE.BufferAttribute(corFlash, 3));
  const brilhoTex = texturaCanvas(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  }).textura;
  const pontos = new THREE.Points(geoFlash, new THREE.PointsMaterial({ size: 1.3, map: brilhoTex, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  pontos.frustumCulled = false;
  cena.add(pontos);
  flashes = { cor: geoFlash.attributes.color, brilho: new Float32Array(n), n };
}

// dois holofotes de contraluz cruzando a fumaça atrás dos lutadores e a luz da câmera de TV na frente
const holofotes = [
  holofote(c3d, { pos: [-4.5, 10, -6], alvo: [0.5, 0, 0.3], cor: '#ffe6c4', intensidade: 45, angulo: 0.22 }),
  holofote(c3d, { pos: [4.5, 10, -6], alvo: [-0.5, 0, 0.3], cor: '#d9b8ff', intensidade: 45, angulo: 0.22 }),
  holofote(c3d, { pos: [0, 6.5, 9], alvo: [0, 1.1, 0], cor: '#fff4e8', intensidade: 20, angulo: 0.32, cone: false })
];
holofotes[0].feixe.material.uniforms.forca.value = holofotes[1].feixe.material.uniforms.forca.value = 0.8;
// sobre a câmera da live (fundo transparente) o feixe aditivo viraria um cone opaco
if (transparente) holofotes[0].feixe.visible = holofotes[1].feixe.visible = false;
const alvosHolofote = holofotes.map((h) => h.luz.target.position.clone());

// luz do impacto (fica apagada até um golpe acertar): curta e afastada do corpo, só um brilho de borda
const luzImpacto = new THREE.PointLight('#ffffff', 0, 3, 2);
cena.add(luzImpacto);

/* ----- efeitos: faíscas, suor, poeira, estouro do impacto, orbes do especial, estrelinhas do K.O. ----- */

const fx = criarParticulas(c3d, { max: 400 }); // só o confete do fim do round
const CIMA = new V3(0, 1, 0);

// faíscas: riscos de luz esticados na direção do voo (uma InstancedMesh aditiva)
const faiscas = (() => {
  const MAX = 160;
  const geo = new THREE.CylinderGeometry(0.5, 0.12, 1, 5, 1, true).translate(0, -0.5, 0); // ponta grossa na frente, cauda fina atrás
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false }), MAX);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.setColorAt(0, new THREE.Color());
  inst.frustumCulled = false;
  inst.renderOrder = 11;
  inst.count = 0;
  cena.add(inst);
  const vivas = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), d = new V3(), cor = new THREE.Color();
  return {
    soltar(p, { qtd = 20, forca = 4, cores = ['#ffffff'], vida = 0.35, gravidade = -9, largura = 0.022 } = {}) {
      for (let i = 0; i < qtd && vivas.length < MAX; i++) {
        const v = new V3(Math.random() - 0.5, Math.random() - 0.35, Math.random() - 0.5).normalize().multiplyScalar(forca * (0.5 + Math.random() * 0.7));
        const t = vida * (0.6 + Math.random() * 0.6);
        vivas.push({ p: p.clone(), v, t, total: t, g: gravidade, l: largura, cor: new THREE.Color(cores[i % cores.length]) });
      }
    },
    passo(dt) {
      let n = 0;
      for (let i = vivas.length - 1; i >= 0; i--) {
        const a = vivas[i];
        a.t -= dt;
        if (a.t <= 0) { vivas.splice(i, 1); continue; }
        a.v.y += a.g * dt;
        a.v.multiplyScalar(1 - 2.5 * dt);
        a.p.addScaledVector(a.v, dt);
        const k = a.t / a.total, vel = a.v.length();
        q.setFromUnitVectors(CIMA, d.copy(a.v).divideScalar(vel || 1));
        inst.setMatrixAt(n, m.compose(a.p, q, s.set(a.l * k, Math.min(0.32, 0.02 + vel * 0.05), a.l * k)));
        inst.setColorAt(n++, cor.copy(a.cor).multiplyScalar(1.6 * k));
      }
      inst.count = n;
      inst.instanceMatrix.needsUpdate = true;
      inst.instanceColor.needsUpdate = true;
    }
  };
})();

// gotas (suor) e poeira: nuvens de pontos redondos com transparência por ponto
function nuvemPontos({ max, tamanho, mapa, cor }) {
  const pos = new Float32Array(max * 3), rgba = new Float32Array(max * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: tamanho, map: mapa, vertexColors: true, transparent: true, depthWrite: false }));
  pts.frustumCulled = false;
  pts.renderOrder = 10;
  cena.add(pts);
  const c = new THREE.Color(cor), vivas = [];
  return {
    soltar(p, { qtd = 10, forca = 2, subida = 1, dx = 0, vida = 0.6, gravidade = -10, opacidade = 0.9 } = {}) {
      for (let i = 0; i < qtd && vivas.length < max; i++) {
        const v = new V3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize().multiplyScalar(forca * (0.4 + Math.random() * 0.8));
        v.y += subida; v.x += dx;
        const t = vida * (0.7 + Math.random() * 0.6);
        vivas.push({ p: p.clone(), v, t, total: t, g: gravidade, a: opacidade });
      }
    },
    passo(dt) {
      let n = 0;
      for (let i = vivas.length - 1; i >= 0; i--) {
        const a = vivas[i];
        a.t -= dt;
        if (a.t <= 0 || a.p.y < 0) { vivas.splice(i, 1); continue; }
        a.v.y += a.g * dt;
        a.v.multiplyScalar(1 - 1.5 * dt);
        a.p.addScaledVector(a.v, dt);
        pos.set([a.p.x, a.p.y, a.p.z], n * 3);
        rgba.set([c.r, c.g, c.b, a.a * Math.min(1, a.t / a.total * 2)], n * 4);
        n++;
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
    }
  };
}
const texGota = texturaCanvas(64, 64, (ctx) => {
  const g = ctx.createRadialGradient(26, 24, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(225,242,255,.95)'); g.addColorStop(0.8, 'rgba(150,200,240,.75)'); g.addColorStop(1, 'rgba(150,200,240,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(32, 32, 30, 0, 7); ctx.fill();
}).textura;
const texPoeira = texturaCanvas(64, 64, (ctx) => {
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.5, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
}).textura;
const gotas = nuvemPontos({ max: 80, tamanho: 0.05, mapa: texGota, cor: '#e6f4ff' });
const poeira = nuvemPontos({ max: 40, tamanho: 0.55, mapa: texPoeira, cor: '#d9d3e6' });

const texEstouro = texturaCanvas(256, 256, (ctx) => {
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let p = 0; p < 24; p++) {
    const ang = p / 24 * Math.PI * 2, r = p % 2 ? 44 : 100 + (p * 37 % 7) * 4;
    ctx.lineTo(128 + Math.cos(ang) * r, 128 + Math.sin(ang) * r);
  }
  ctx.closePath(); ctx.fill();
}).textura;
const estouros = [0, 1, 2].map(() => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texEstouro, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, fog: false }));
  s.visible = false; s.renderOrder = 12;
  s.userData = { t: 1, tam: 1 };
  cena.add(s);
  return s;
});
let proxEstouro = 0;
const texBrilho = texturaCanvas(128, 128, (ctx) => {
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
}).textura;

function estourar(p, cor, tam) {
  const s = estouros[proxEstouro++ % estouros.length];
  s.position.copy(p);
  s.material.color.set(cor).lerp(new THREE.Color('#ffffff'), 0.25);
  s.material.rotation = Math.random() * 6;
  s.userData.t = 0; s.userData.tam = tam;
  s.visible = true;
  // a luz fica uns 60 cm à frente do corpo (perto demais ela lavava o lutador inteiro de branco)
  luzImpacto.position.set(p.x, p.y + 0.15, p.z + 0.6);
  luzImpacto.color.set(cor).lerp(new THREE.Color('#ffffff'), 0.35);
  luzImpacto.intensity = 3.2 * tam;
}

// orbe do especial: núcleo branco e brilho na cor do lutador
lut.forEach((f) => {
  const orbe = new THREE.Group();
  orbe.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })));
  const brilho = new THREE.Sprite(new THREE.SpriteMaterial({ map: texBrilho, color: f.cor, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false }));
  brilho.scale.setScalar(0.9);
  orbe.add(brilho);
  orbe.visible = false;
  cena.add(orbe);
  f.orbe = orbe;
});

// estrelinhas girando em cima da cabeça de quem caiu
const estrelas = (() => {
  const forma = new THREE.Shape();
  for (let p = 0; p < 10; p++) {
    const ang = p / 10 * Math.PI * 2 + Math.PI / 2, r = p % 2 ? 0.035 : 0.085;
    p ? forma.lineTo(Math.cos(ang) * r, Math.sin(ang) * r) : forma.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
  }
  const geos = [0, 1, 2].map((k) => new THREE.ExtrudeGeometry(forma, { depth: 0.03, bevelEnabled: false })
    .translate(0, 0, -0.015).rotateY(k * 2.1).translate(Math.cos(k * 2.094) * 0.3, Math.sin(k * 3) * 0.04, Math.sin(k * 2.094) * 0.3));
  const m = fundidas(geos, material('#ffd23f', { emissivo: '#ffb000', intensidadeEmissiva: 0.8, verniz: 0.5 }), { sombra: false });
  m.visible = false;
  cena.add(m);
  return m;
})();

/* ----- lutadores (bonecos do kit com luvas, regata, calção e botas) ----- */

const fora = (s) => (s === 'E' ? 1 : -1);

// funde as peças de cada junta que usam o mesmo material (o boneco tem ~30 peças soltas)
function fundirJunta(grupo) {
  const porMat = new Map();
  for (const m of grupo.children) if (m.isMesh) {
    if (!porMat.has(m.material)) porMat.set(m.material, []);
    porMat.get(m.material).push(m);
  }
  for (const [mat, lista] of porMat) {
    if (lista.length < 2) continue;
    let geos = lista.map((m) => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); });
    // caixa() do kit não tem índice: mistura indexada + não indexada precisa virar tudo não indexado
    if (geos.some((g) => !g.index)) geos = geos.map((g) => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; });
    const geo = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!geo) continue;
    for (const m of lista) { grupo.remove(m); if (!m.geometry.userData.compartilhada) m.geometry.dispose(); }
    grupo.add(malha(geo, mat));
  }
}

function geoLuva(lado) {
  const bola = new THREE.SphereGeometry(0.13, 24, 18).scale(1, 1.12, 1.06);
  const dedao = new THREE.CapsuleGeometry(0.042, 0.08, 4, 10).rotateX(0.5).translate(-lado * 0.08, 0.03, 0.07);
  return mergeGeometries([bola, dedao]);
}
const GEO_LUVA = { E: geoLuva(1), D: geoLuva(-1) };
// perfil do tronco girado (raio, altura): cintura, peito largo e ombros quase retos até o pescoço
const GEO_TRONCO = new THREE.LatheGeometry([
  [0, -0.4], [0.15, -0.4], [0.205, -0.36], [0.215, -0.26], [0.228, -0.1], [0.252, 0.06], [0.27, 0.17], [0.274, 0.24],
  [0.262, 0.295], [0.232, 0.335], [0.18, 0.358], [0.1, 0.368], [0, 0.37]
].map(([r, y]) => new THREE.Vector2(r, y)), 24);
const GEO_PEITO = new THREE.SphereGeometry(0.1, 16, 12).scale(1.2, 0.78, 0.55);
const GEO_DECOTE = new THREE.SphereGeometry(0.2, 20, 10).scale(0.95, 0.32, 0.72);
for (const g of [GEO_TRONCO, GEO_PEITO, GEO_DECOTE]) g.userData.compartilhada = true;

function criarLutador(f, i) {
  const l = cfg.lutadores[i] ?? {};
  const b = boneco({
    pele: l.pele ?? (i ? '#e8b48c' : '#a86f4c'), camisa: misturar(f.cor, '#140a26', 0.12), calca: misturar(f.cor, '#140a26', 0.5),
    cabelo: l.cabelo ?? (i ? '#6a4325' : '#1c140f'), sapato: '#1d1a26', cabecao: 1.1, semente: 2 + i * 7
  });
  const J = b.userData.juntas, M = b.userData.materiais;
  const mLuva = material(l.luva ?? '#d61f2c', { rugosidade: 0.26, verniz: 1 });
  const mPunho = material('#f4f1ea', { rugosidade: 0.55 });
  const mFaixa = material(l.cinto ?? '#ffd23f', { rugosidade: 0.3, verniz: 0.6 });
  for (const s of ['E', 'D']) {
    // regata: ombro e braço com pele; deltoide e bíceps mais cheios (braço de boxeador, sem a "bolinha" no ombro)
    for (const m of J['ombro' + s].children) if (m.isMesh) {
      m.material = M.pele;
      if (m.geometry.type === 'SphereGeometry') m.scale.set(1.18, 1.25, 1.12);
      else m.scale.set(1.24, 1, 1.2);
    }
    // luva grande no lugar da mão, com punho branco
    const cot = J['cotovelo' + s];
    cot.children[0].scale.set(1.14, 1, 1.12);
    const mao = cot.children.find((m) => m.isMesh && m.position.y < -0.2);
    cot.remove(mao); mao.geometry.dispose();
    const luva = malha(GEO_LUVA[s], mLuva);
    luva.position.set(0, -0.33, 0.01);
    const punho = malha(new THREE.CylinderGeometry(0.075, 0.088, 0.12, 16), mPunho, { sombra: false });
    punho.position.y = -0.2;
    cot.add(luva, punho);
    // calção largo só na coxa; canela com pele e bota de boxe
    J['coxa' + s].children[0].scale.set(1.22, 1, 1.18);
    const joelho = J['joelho' + s];
    joelho.children[0].material = M.pele;
    const bota = malha(new THREE.CylinderGeometry(0.08, 0.086, 0.2, 14), joelho.children[1].material);
    bota.position.y = -0.33;
    joelho.add(bota);
  }
  // tronco em "V" (peito e ombros largos, cintura fina, ombros retos) no lugar da cápsula do kit
  const torso = J.tronco.children.find((m) => m.isMesh && m.material === M.camisa);
  torso.geometry.dispose();
  torso.geometry = GEO_TRONCO;
  torso.scale.set(1.12, 1, 0.8);
  // peitoral sob a regata e decote mostrando a base do pescoço
  for (const lado of [-1, 1]) {
    const peito = malha(GEO_PEITO, M.camisa);
    peito.position.set(lado * 0.105, 0.43, 0.155);
    J.tronco.add(peito);
  }
  const decote = malha(GEO_DECOTE, M.pele, { sombra: false });
  decote.position.set(0, 0.615, 0.01);
  J.tronco.add(decote);
  // olhos, pupilas e sobrancelhas rentes ao rosto (de perfil elas saltavam da silhueta)
  for (const m of J.cabeca.children) {
    if (!m.isMesh) continue;
    const r = m.geometry.parameters?.radius;
    if (m.geometry.type === 'BoxGeometry') m.position.z -= 0.018;
    else if (r === 0.045 && m.position.z > 0.1) { m.position.z -= 0.008; m.scale.z = 0.5; }
    else if (r === 0.022) { m.position.z -= 0.012; m.scale.set(1, 1.1, 0.45); }
  }
  // boca rente ao rosto (o arco do kit fica espetado quando o boneco está de perfil)
  J.boca.geometry.dispose();
  J.boca.geometry = new THREE.SphereGeometry(0.04, 16, 10);
  J.boca.material.color.set('#4a141c');
  J.boca.position.set(0, 0.085, 0.165);
  J.boca.rotation.set(0, 0, 0);
  J.boca.scale.set(1.5, 0.45, 0.6);
  J.boca.castShadow = false;
  // cinto do calção
  const cinto = malha(new THREE.TorusGeometry(0.2, 0.045, 8, 28).rotateX(Math.PI / 2).scale(1.26, 1, 0.94), mFaixa, { sombra: false });
  cinto.position.y = 0.1;
  J.quadril.add(cinto);
  b.traverse((o) => { if (o.isGroup && o.children.some((c) => c.isMesh)) fundirJunta(o); });
  // detalhes do rosto não precisam de sombra
  for (const m of J.cabeca.children) if (m.isMesh && m.material !== M.pele) m.castShadow = false;

  const base = new THREE.Group();
  const queda = new THREE.Group();
  base.add(queda);
  queda.add(b);
  base.position.set(f.x0, 0, 0);
  base.rotation.y = f.dir * Math.PI / 2;
  cena.add(base);
  // brilho do "apanhou": emissivo branco que some rápido
  const mats = [M.pele, M.camisa, M.calca, mLuva];
  for (const m of mats) { m.emissive = new THREE.Color('#ffe2d6'); m.emissiveIntensity = 0; }
  Object.assign(f, { b, J, base, queda, mats, L: i ? 'D' : 'E', R: i ? 'E' : 'D' });
}
lut.forEach(criarLutador);

// sombra redonda embaixo de cada um: única sombra na qualidade baixa e, nas outras, contato dos pés com a lona
// (os holofotes sem sombra clareiam a sombra do sol)
{
  const tex = texturaCanvas(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(0.45, 'rgba(0,0,0,.38)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  }).textura;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: c3d.qualidade.sombras ? 0.75 : 1 });
  lut.forEach((f) => {
    f.sombra = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), mat);
    f.sombra.rotation.x = -Math.PI / 2;
    f.sombra.position.y = 0.01;
    f.sombra.renderOrder = 1;
    cena.add(f.sombra);
  });
}

/* ---------- poses ---------- */

// Valores por pose: tronco (tx inclina, ty gira o ombro da frente, tz balança), cabeça (cx, cy),
// braço da frente (lox/loz ombro, lcx cotovelo), braço de trás (rox/roz, rcx), pernas (lpx/lpz/ljx e rpx/rpz/rjx),
// av = avanço para o adversário, sy = pulo.
const GUARDA = {
  tx: 0.14, ty: 0.42, tz: 0, cx: 0.06, cy: -0.3,
  lox: -1.2, loz: -0.12, lcx: -1.7, rox: -0.8, roz: -0.26, rcx: -2.25,
  lpx: -0.24, lpz: 0.1, ljx: 0.26, rpx: 0.36, rpz: 0.12, rjx: 0.2, av: 0, sy: 0, gc: 0.32
};
const POSES = {
  socoL: { tx: 0.24, ty: 0.85, cy: -0.7, lox: -1.78, loz: -0.04, lcx: -0.06, av: 0.24, gc: 0.05 },
  socoR: { tx: 0.26, ty: -0.25, cy: 0.2, rox: -1.78, roz: -0.14, rcx: -0.06, lox: -1.0, lcx: -2.1, av: 0.3, gc: 0.05 },
  chute: { tx: -0.32, ty: -0.2, cy: 0.15, rpx: -1.55, rjx: 0.1, rpz: 0.14, lpx: 0.04, ljx: 0.12, av: 0.12, gc: 0.12 },
  especial: { tx: 0.2, ty: 0.05, cy: -0.05, lox: -1.6, loz: -0.32, lcx: -0.12, rox: -1.6, roz: -0.32, rcx: -0.12,
    lpx: -0.55, ljx: 0.55, rpx: 0.5, rjx: 0.45, av: 0.1, gc: 0.1 },
  finalizacao: { tx: -0.2, ty: -0.35, cy: 0.25, rox: -2.95, roz: -0.12, rcx: -0.3, lox: -1.0, lcx: -2.0,
    lpx: -0.95, ljx: 1.25, rpx: 0.15, rjx: 0.3, av: 0.32, gc: 0.08 },
  vitoria: { tx: -0.12, ty: 0, cy: 0, cx: -0.1, lox: -2.95, loz: 0.35, lcx: -0.2, rox: -2.95, roz: 0.35, rcx: -0.2,
    lpx: -0.08, lpz: 0.1, ljx: 0.06, rpx: 0.08, rpz: 0.1, rjx: 0.06, gc: 1.1 },
  ko: { tx: -0.25, ty: 0, cy: 0.3, cx: -0.5, lox: -2.5, loz: 0.55, lcx: -0.3, rox: -2.2, roz: 0.6, rcx: -0.5,
    lpx: -0.35, ljx: 0.55, rpx: -0.1, rjx: 0.3 }
};

// 0..1 da animação -> quanto da pose de golpe aplicar (recua, estica rápido, segura, volta)
function curva(k) {
  if (k < 0.3) return -0.15 * (k / 0.3);
  if (k < 0.5) return -0.15 + 1.15 * ((k - 0.3) / 0.2);
  if (k < 0.75) return 1;
  return Math.max(0, 1 - (k - 0.75) / 0.25);
}
const suave = (k) => k * k * (3 - 2 * k);

function nomePose(g) { return g.anim === 'soco' ? (g.braco === 'L' ? 'socoL' : 'socoR') : g.anim; }

function misturarPose(P, alvo, a) {
  for (const k in alvo) P[k] += (alvo[k] - GUARDA[k]) * a;
}

const QUEDA = 0.85; // segundos de jogo até bater de costas na lona
const FLASH = 0.12; // duração do brilho de quem apanha

function poseDe(f) {
  const P = { ...GUARDA };
  const T = relogio + f.lado * 1.7;
  // ginga: joelhos sobem e descem, tronco balança, passinhos para frente e para trás
  const g = Math.sin(T * 4.4);
  P.ljx += 0.07 + g * 0.07; P.rjx += 0.07 - g * 0.07;
  P.tz = Math.sin(T * 2.2) * 0.05;
  P.ty += Math.sin(T * 1.3) * 0.07;
  P.av = Math.sin(T * 1.1) * 0.07;
  let yaw = 0, queda = 0;
  if (f.estado === 'golpe') {
    const k = f.t / f.golpe.dur;
    misturarPose(P, POSES[nomePose(f.golpe)], curva(k));
    if (f.golpe.anim === 'finalizacao') P.sy = Math.sin(Math.PI * Math.min(1, Math.max(0, (k - 0.3) / 0.6))) * 0.55;
  } else if (f.estado === 'vitoria') {
    misturarPose(P, POSES.vitoria, Math.min(1, f.t / 0.3));
    P.sy = Math.abs(Math.sin(relogio * 6.5)) * 0.2;
    P.loz += Math.sin(relogio * 13) * 0.12; P.roz += Math.sin(relogio * 13) * 0.12;
    P.av = 0;
  } else if (f.estado === 'ko') {
    // o golpe gira o corpo de frente para a câmera e ele cai de costas, esticado, para o fundo do ringue
    const e = Math.min(1, f.t / QUEDA);
    misturarPose(P, POSES.ko, Math.min(1, f.t / 0.3));
    P.av = 0;
    P.gc = 0;
    yaw = -f.dir * (Math.PI / 2) * suave(Math.min(1, f.t / 0.4));
    queda = e < 0.25 ? e * 0.5 : 0.125 + (Math.PI / 2 - 0.125) * ((e - 0.25) / 0.75) ** 2;
    if (f.t > QUEDA) queda = Math.PI / 2 - 0.07 * Math.exp(-(f.t - QUEDA) * 6) * Math.abs(Math.sin((f.t - QUEDA) * 16));
  }
  // reação ao apanhar
  const r = f.recuo;
  if (r > 0) {
    if (f.reacao === 'corpo') { P.tx += 0.55 * r; P.cx += 0.25 * r; P.av -= 0.22 * r; P.lox += 0.35 * r; P.rox += 0.35 * r; }
    else if (f.reacao === 'lancado') { P.tx -= 0.5 * r; P.cx -= 0.6 * r; P.av -= 0.32 * r; P.sy += Math.sin(Math.PI * r) * 0.3; }
    else { P.tx -= 0.45 * r; P.cx -= 0.55 * r; P.av -= 0.28 * r; P.ty -= 0.2 * r; P.cy += 0.35 * r; }
  }
  // levantando depois do K.O. (começo do round seguinte)
  if (f.levantar > 0) queda = Math.max(queda, Math.PI / 2 * f.levantar * f.levantar);
  return { P, yaw: yaw - f.dir * P.gc, queda };
}

const perna = (c, j) => 0.4 * Math.cos(c) + 0.465 * Math.cos(c + j);

function aplicarPose(f, { P, yaw, queda }, dt) {
  const J = f.J, L = f.L, Rr = f.R, oL = fora(L), oR = fora(Rr);
  // giro do corpo suavizado (troca de estado não dá tranco)
  f.giro = (f.giro ?? 0) + (yaw - (f.giro ?? 0)) * (1 - Math.exp(-dt * 7));
  J.tronco.rotation.set(P.tx, -oL * P.ty, P.tz);
  J.cabeca.rotation.set(P.cx, -oL * P.cy, 0);
  J['ombro' + L].rotation.set(P.lox, 0, oL * P.loz);
  J['cotovelo' + L].rotation.x = P.lcx;
  J['ombro' + Rr].rotation.set(P.rox, 0, oR * P.roz);
  J['cotovelo' + Rr].rotation.x = P.rcx;
  J['coxa' + L].rotation.set(P.lpx, 0, oL * P.lpz);
  J['joelho' + L].rotation.x = P.ljx;
  J['coxa' + Rr].rotation.set(P.rpx, 0, oR * P.rpz);
  J['joelho' + Rr].rotation.x = P.rjx;
  // o pé de apoio fica sempre na lona
  J.quadril.position.y = 0.035 + Math.max(perna(P.lpx, P.ljx), perna(P.rpx, P.rjx));
  f.base.position.set(f.x0 + f.dir * P.av, P.sy, 0);
  f.base.rotation.y = f.dir * Math.PI / 2 + f.giro;
  f.queda.rotation.x = -queda;
  f.queda.position.y = Math.sin(queda) * 0.13;
  // boca abre quando bate ou apanha
  J.boca.scale.y = f.flash > 0 || f.estado === 'golpe' || f.estado === 'vitoria' || f.estado === 'ko' ? 1.1 : 0.45;
  // brilho do "apanhou": pico baixo e queda rápida (com a fila cheia os golpes se emendam e o lutador não pode ficar branco)
  const brilho = f.flash > 0 ? 0.13 * (f.flash / FLASH) ** 2 : 0;
  for (const m of f.mats) m.emissiveIntensity = brilho;
  // sombra acompanha o corpo: encolhe no pulo e se estica para trás quando ele cai de costas
  const deitado = Math.sin(queda);
  f.sombra.position.set(f.base.position.x, 0.01, -deitado * 0.95);
  f.sombra.scale.set(1 - Math.min(0.5, P.sy), (1 - Math.min(0.5, P.sy)) * (1 + deitado * 1.4), 1);
}

/* ---------- pontos 3D -> tela ---------- */

const tmp = new V3(), tmp2 = new V3();

function pontoDeImpacto(alvo, anim) {
  const p = new V3();
  if (anim === 'chute') { alvo.J.tronco.getWorldPosition(p); p.y += 0.3; }
  else if (anim === 'especial') { alvo.J.tronco.getWorldPosition(p); p.y += 0.45; }
  else { alvo.J.cabeca.getWorldPosition(p); p.y += 0.2; }
  p.x += alvo.dir * 0.2;
  p.z += 0.15;
  return p;
}

function maosDe(f, destino) {
  f.J.cotoveloE.localToWorld(destino.set(0, -0.33, 0));
  f.J.cotoveloD.localToWorld(tmp2.set(0, -0.33, 0));
  return destino.add(tmp2).multiplyScalar(0.5);
}

/* ---------- regras ---------- */

function mudar(f, estado) { f.estado = estado; f.t = 0; }

// Divide o dano total em até MAX_ANIM golpes animados (teto visual), sem perder dano.
function golpear(lado, tipo, nick, q) {
  const dano = Math.max(0, Number(cfg.golpes[tipo]?.dano) || 0);
  const total = dano * q;
  const n = Math.min(q, MAX_ANIM);
  const fila = lut[lado].fila;
  for (let k = 0; k < n; k++) {
    const parte = Math.floor(total / n) + (k < total % n ? 1 : 0);
    if (fila.length >= MAX_FILA) { fila[fila.length - 1].dano += parte; continue; }
    fila.push({ tipo, anim: DURACAO[tipo] ? tipo : 'soco', nick: String(nick).slice(0, 18), dano: parte });
  }
  return total;
}

function onomatopeia(x, y, txt, cor, tam) {
  const vivas = palco.querySelectorAll('.onoma');
  if (vivas.length >= MAX_ONOMA) vivas[0].remove();
  const o = document.createElement('div');
  o.className = 'onoma txt-jogo';
  o.textContent = txt;
  o.style.cssText = `left:${x}px;top:${y}px;--tam:${tam}px;--rot:${(Math.random() - 0.5) * 22}deg;--cor-onoma:#fff;--estouro:${cor}`;
  o.addEventListener('animationend', () => o.remove(), { once: true });
  palco.appendChild(o);
}

function numeroDano(x, y, dano, nick, cor, grande) {
  const vivos = palco.querySelectorAll('.dano-voa');
  if (vivos.length >= MAX_NUMEROS) vivos[0].remove();
  const d = document.createElement('div');
  d.className = 'dano-voa txt-jogo';
  d.textContent = '-' + dano;
  if (nick) {
    const s = document.createElement('small');
    s.textContent = nick;
    d.appendChild(s);
  }
  d.style.cssText = `left:${x}px;top:${y}px;--tam:${grande ? 116 : 80}px;--dx:${(Math.random() - 0.5) * 220}px;--cor-nick:${cor}`;
  d.addEventListener('animationend', () => d.remove(), { once: true });
  palco.appendChild(d);
}

function acertar(i, g) {
  const a = lut[i], alvo = lut[1 - i];
  if (pausa > 0 || alvo.vida <= 0) return;
  alvo.vida = Math.max(0, alvo.vida - g.dano);
  alvo.flash = FLASH;
  alvo.recuo = Math.min(1, 0.4 + g.dano / 50);
  alvo.reacao = g.anim === 'chute' ? 'corpo' : g.anim === 'finalizacao' ? 'lancado' : 'cabeca';
  const barra = $('barra' + (1 - i));
  barra.classList.add('apanha');
  setTimeout(() => barra.classList.remove('apanha'), 120);

  const p = pontoDeImpacto(alvo, g.anim);
  const grande = g.dano >= 25;
  // faíscas na cor de quem bateu e gotas de suor espirrando para trás
  faiscas.soltar(p, { qtd: Math.min(10 + g.dano, 40), forca: grande ? 6 : 4.2, cores: [a.cor, '#ffd23f', '#ffffff'], vida: grande ? 0.42 : 0.32,
    largura: grande ? 0.03 : 0.022 });
  gotas.soltar(p, { qtd: grande ? 14 : 7, forca: grande ? 2.4 : 1.7, subida: 0.9, dx: -alvo.dir * 1.4, vida: 0.7, gravidade: -9 });
  estourar(p, a.cor, grande ? 1.5 : 0.9);
  const s = c3d.projetar(p);
  numeroDano(s.x + (Math.random() - 0.5) * 80, s.y - 90, g.dano, grande ? g.nick : '', a.cor, grande);
  if (g.anim !== 'soco' || Math.random() < 0.35) {
    const lista = ONOMATOPEIA[g.anim];
    onomatopeia(s.x + (Math.random() - 0.5) * 80, s.y - 200, lista[Math.floor(Math.random() * lista.length)], a.cor,
      g.anim === 'finalizacao' ? 150 : grande ? 120 : 90);
  }
  if (grande) { c3d.tremer(g.dano >= 60 ? 0.22 : 0.1, 0.35); agito = 1; ladoAgito = i; }
  if (g.anim === 'finalizacao') {
    flashTela = 0.3;
    lento = Math.max(lento, 0.6);
    ondaCorda = Math.max(ondaCorda, 0.05);
    tremer(palco, true);
  }
  const agora = performance.now();
  if (agora - ultimoSom > 110) { ultimoSom = agora; tocar('impacto'); }
  atualizarHud();
  if (alvo.vida <= 0) ko(i);
}

function ko(v) {
  const perdedor = lut[1 - v];
  mudar(perdedor, 'ko');
  perdedor.caiu = false;
  perdedor.recuo = 0;
  mudar(lut[v], 'vitoria');
  lut[v].recuo = 0;
  placar[v]++;
  guardar('briga', { placar, round });
  pausa = PAUSA + 1.5;
  flashTela = 0.45;
  agito = 1.5; ladoAgito = v;
  lento = 1.6; // câmera lenta enquanto ele cai
  c3d.tremer(0.3, 0.5);
  tremer(palco, true);
  limparFaixas();
  palco.classList.add('fim-round'); // some a linha de torcida/combos, onde entra o K.O.!
  // câmera sobe e abre um pouco: vencedor comemorando e o perdedor caindo de costas, os dois inteiros no quadro
  // (centro puxado para o lado de quem cai, abaixo do K.O.!)
  const xl = perdedor.x0;
  focar({ pos: [xl * 0.15, 4.5, 7.6], alvo: [xl * 0.3, 0.85, -0.4], fov: 39, segundos: pausa, vel: 2.4 });
  const k = document.createElement('div');
  k.className = 'ko txt-jogo';
  k.append(Object.assign(document.createElement('span'), { textContent: 'K.O.!' }));
  palco.append(k);
  tocar('vitoria');
  atualizarHud();
  animar($('trofeu' + v));
  // a faixa do vencedor entra pouco depois de o perdedor bater na lona (contado em tempo de jogo, ver atualizar)
  faixaLado = v;
  faixaEm = 0;
}

function mostrarFaixa(v) {
  const faixa = document.createElement('div');
  faixa.className = 'vencedor';
  faixa.style.setProperty('--destaque', lut[v].cor);
  const titulo = document.createElement('small');
  titulo.textContent = `🏆 Venceu o round ${round}`;
  faixa.append(titulo, lut[v].nome);
  palco.append(faixa);
  palco.classList.add('com-faixa'); // a faixa toma o lugar dos nomes e barras
  confete(palco, { cores: [lut[v].cor, '#ffd23f', '#fff', lut[1 - v].cor], qtd: 60 });
  fx.confete({ cores: [lut[v].cor, '#ffd23f', '#ffffff', lut[1 - v].cor], qtd: 160, area: [-3, 3], altura: 6, z: [-1.5, 2.5], tamanho: 0.09 });
}

function limparFaixas() { palco.querySelectorAll('.vencedor, .ko').forEach(e => e.remove()); }

function novoRound() {
  faixaLado = -1; faixaEm = 0;
  limparFaixas();
  palco.classList.remove('fim-round', 'com-faixa');
  pausa = 0;
  round++;
  lut.forEach(f => {
    f.vida = VIDA;
    if (f.estado === 'ko') f.levantar = 1;
    f.recuo = 0;
    mudar(f, 'idle');
  });
  estrelas.visible = false;
  foco = null;
  combo.zerar();
  [0, 1].forEach(i => $('combo' + i).classList.remove('on'));
  anunciarRound();
  tocar('virada');
  guardar('briga', { placar, round });
  atualizarHud();
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
  // passou de um marco (10, 25, 50...): explosão e tremida
  if (MARCOS.some(m => n - ganho < m && n >= m)) {
    pDom(palco, { x: i ? 820 : 260, y: 405, qtd: 30, forca: 1.4, cores: [lut[i].cor, '#ffd23f', '#fff'] });
    tremer(palco, true);
    c3d.tremer(0.08, 0.3);
    agito = 1; ladoAgito = i;
  }
}

function mostrarUltimo(ev, i, tipo, total) {
  const u = $('ultimo');
  u.style.setProperty('--cor', lut[i].cor);
  const nome = document.createElement('span');
  nome.className = 'quem txt-jogo';
  nome.textContent = ev.nome || ev.user;
  const g = document.createElement('span');
  g.className = 'golpeou txt-jogo brilho';
  g.textContent = `${EMOJI_GOLPE[tipo] ?? '👊'} -${total}`;
  u.replaceChildren(avatar(ev, 'grande'), nome, g);
  animar(u);
}

function aoEvento(ev) {
  if (ev.tipo === 'comentario') { if (times.pelaPalavra(ev)) atualizarHud(); return; }
  if (ev.tipo !== 'presente') return;
  const tipo = acaoDoPresente(mapaGolpes, ev);
  if (!tipo) return;
  const q = Math.max(1, Math.min(9999, Math.floor(Number(ev.quantidade) || 1)));
  const lado = times.doUsuario(ev.user) === 'A' ? 0 : 1;
  const nick = ev.nome || ev.user;
  const total = golpear(lado, tipo, nick, q);
  atualizarHud();
  const emoji = cfg.golpes[tipo].emoji ?? emojiDoPresente(ev.presenteNome, EMOJI_GOLPE[tipo]);
  lut[lado].J.tronco.getWorldPosition(tmp);
  const s = c3d.projetar(tmp);
  pDom(palco, { x: s.x, y: s.y, qtd: Math.min(q, 5), emoji, forca: 0.7 });
  mostrarCombo(lado, combo.registrar(lado, q), q);
  mostrarUltimo(ev, lado, tipo, total);
  ranking.somar(ev, total, { cor: lut[lado].cor });
  pintarTop(ev.user);
  avisar(html`<span class="l${lado}"><b>${nick}</b> ${q > 1 ? q + '× ' : ''}${ev.presenteNome} <span class="mais">−${total}</span></span>`);
}

/* ---------- câmera ---------- */

const camBase = { pos: new V3(...CAMERA.pos), alvo: new V3(...CAMERA.alvo), fov: CAMERA.fov };
const cam = { pos: camBase.pos.clone(), alvo: camBase.alvo.clone(), fov: camBase.fov };
const camMeta = { pos: new V3(), alvo: new V3(), fov: 40 };
let foco = null;

// foco por alguns segundos: { pos, alvo, fov } fixo (K.O.) ou { dupla: true } (finalização: fecha nos dois lutadores)
function focar({ pos = null, alvo = null, fov = 36, dupla = false, segundos = 1, vel = 3 }) {
  foco = { pos: pos && new V3(...pos), alvo: alvo && new V3(...alvo), fov, dupla, ate: tReal + segundos, vel };
}

// Câmera fechada que segue os dois: centro entre as pontas (cabeça, tronco, luvas) e recuo suficiente
// para quem for lançado pela finalização não sair pela borda.
const TAN_MEIA_LARGURA = (fov) => Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (1080 / 1920);
function enquadrarDupla(fov) {
  let min = Infinity, max = -Infinity;
  for (const f of lut) {
    for (const j of [f.J.cabeca, f.J.tronco]) { j.getWorldPosition(tmp); min = Math.min(min, tmp.x); max = Math.max(max, tmp.x); }
    for (const c of [f.J.cotoveloE, f.J.cotoveloD]) { c.localToWorld(tmp.set(0, -0.33, 0)); min = Math.min(min, tmp.x); max = Math.max(max, tmp.x); }
  }
  const cx = (min + max) / 2, dist = Math.max(7.2, ((max - min) / 2 + 0.42) / TAN_MEIA_LARGURA(fov));
  camMeta.alvo.set(cx, 1.35, 0);
  camMeta.pos.set(cx * 0.6, 3.0, dist);
  camMeta.fov = fov;
}

function animarCamera(dt) {
  let vel = 2.2;
  if (foco && tReal < foco.ate) {
    vel = foco.vel;
    if (foco.dupla) enquadrarDupla(foco.fov);
    else { camMeta.pos.copy(foco.pos); camMeta.alvo.copy(foco.alvo); camMeta.fov = foco.fov; }
  } else {
    foco = null;
    // balanço leve de câmera de transmissão
    camMeta.pos.copy(camBase.pos);
    camMeta.pos.x += Math.sin(tReal * 0.23) * 0.22;
    camMeta.pos.y += Math.sin(tReal * 0.31) * 0.06;
    camMeta.alvo.copy(camBase.alvo);
    camMeta.fov = camBase.fov;
  }
  const k = 1 - Math.exp(-dt * vel);
  cam.pos.lerp(camMeta.pos, k);
  cam.alvo.lerp(camMeta.alvo, k);
  cam.fov += (camMeta.fov - cam.fov) * k;
  c3d.camera.position.copy(cam.pos);
  if (Math.abs(c3d.camera.fov - cam.fov) > 0.01) { c3d.camera.fov = cam.fov; c3d.camera.updateProjectionMatrix(); }
  c3d.mirar(cam.alvo.x, cam.alvo.y, cam.alvo.z);
}

/* ---------- laço ---------- */

function atualizar(dj, dt) {
  if (pausa > 0 && (pausa -= dt) <= 0) novoRound();
  if (faixaEm > 0 && (faixaEm -= dt) <= 0 && faixaLado >= 0) { mostrarFaixa(faixaLado); faixaLado = -1; }
  flashTela = Math.max(0, flashTela - dt);
  agito = Math.max(0, agito - dt * 1.2);
  lut.forEach((f, i) => {
    f.t += dj;
    f.flash = Math.max(0, f.flash - dj);
    f.recuo = Math.max(0, f.recuo - dj * 2.6);
    f.levantar = Math.max(0, f.levantar - dt * 1.8);
    if (f.estado === 'golpe') {
      const g = f.golpe;
      if (!g.acertou && f.t >= g.dur * IMPACTO[g.anim]) { g.acertou = true; acertar(i, g); }
      if (f.estado === 'golpe' && f.t >= g.dur) mudar(f, 'idle');
    }
    if (f.estado === 'idle' && pausa <= 0 && f.fila.length) {
      f.golpe = f.fila.shift();
      f.golpe.dur = DURACAO[f.golpe.anim] / (f.fila.length > 2 ? 1.8 : 1); // fila cheia: golpes mais rápidos
      f.golpe.braco = Math.random() < 0.5 ? 'L' : 'R';
      mudar(f, 'golpe');
      // finalização: câmera fecha nos dois antes do golpe
      if (f.golpe.anim === 'finalizacao') focar({ dupla: true, fov: 40, segundos: f.golpe.dur + 0.5, vel: 4 });
    }
    // bateu de costas na lona: poeira, ringue treme, cordas balançam
    if (f.estado === 'ko' && !f.caiu && f.t >= QUEDA) {
      f.caiu = true;
      f.J.tronco.getWorldPosition(tmp);
      tmp.y = 0.05;
      poeira.soltar(tmp, { qtd: 22, forca: 1.8, subida: 0.5, vida: 1.1, gravidade: -0.4, opacidade: 0.7 });
      c3d.tremer(0.35, 0.6);
      ondaCorda = 0.07;
      tocar('impacto');
      if (faixaLado >= 0) faixaEm = 0.7;
    }
  });
}

function animarLutadores(dj, dt) {
  lut.forEach((f) => aplicarPose(f, poseDe(f), dj));
  // orbe do especial: cresce nas mãos e voa até o peito do adversário
  lut.forEach((f, i) => {
    const o = f.orbe;
    const ativo = f.estado === 'golpe' && f.golpe.anim === 'especial' && f.t / f.golpe.dur < IMPACTO.especial;
    o.visible = ativo;
    if (!ativo) return;
    const k = f.t / f.golpe.dur, inicio = 0.45;
    maosDe(f, o.position);
    o.position.x += f.dir * 0.12;
    if (k > inicio) {
      lut[1 - i].J.tronco.getWorldPosition(tmp);
      tmp.y += 0.45;
      o.position.lerp(tmp, (k - inicio) / (IMPACTO.especial - inicio));
    }
    const tam = k < inicio ? 0.3 + 0.7 * (k / inicio) : 1;
    o.scale.setScalar(tam * (1 + Math.sin(relogio * 40) * 0.08));
    faiscas.soltar(o.position, { qtd: 2, forca: 0.9, vida: 0.3, gravidade: 0, largura: 0.02, cores: [f.cor, '#ffffff'] });
  });
  // estrelinhas em cima de quem está no chão
  const caido = lut.find((f) => f.estado === 'ko' && f.caiu);
  estrelas.visible = !!caido;
  if (caido) {
    caido.J.cabeca.getWorldPosition(estrelas.position);
    estrelas.position.y += 0.32;
    estrelas.rotation.y += dt * 4;
  }
}

function animarCena(dt, t) {
  // estouros e luz do impacto
  for (const s of estouros) {
    if (!s.visible) continue;
    s.userData.t += dt / 0.22;
    const k = s.userData.t;
    if (k >= 1) { s.visible = false; continue; }
    s.scale.setScalar(s.userData.tam * (0.38 + k * 0.6));
    s.material.opacity = 0.85 * (1 - k * k);
  }
  luzImpacto.intensity = Math.max(0, luzImpacto.intensity - dt * 40);
  faiscas.passo(dt);
  gotas.passo(dt);
  poeira.passo(dt);
  // cordas balançando
  if (ondaCorda > 0.0015) { moverCordas(t, ondaCorda); ondaCorda *= Math.exp(-dt * 2.4); }
  else if (ondaCorda > 0) { ondaCorda = 0; moverCordas(t, 0); }
  // holofotes passeando
  holofotes.forEach((h, k) => {
    h.luz.target.position.copy(alvosHolofote[k]);
    if (k === 2) return;
    h.luz.target.position.x += Math.sin(t * 0.45 + k * 2.1) * 0.6;
    h.luz.target.position.z += Math.cos(t * 0.37 + k) * 0.4;
    h.feixe?.lookAt(h.luz.target.position);
  });
  if (cenario) {
    const letra = ladoAgito === 0 ? 'A' : 'B';
    tor.animar(t, 0.22 + Math.min(1, agito) * 0.7, agito > 0.1 && ladoAgito !== null ? (b) => b.lado === letra : null);
    // flashes de câmera: mais durante os golpes grandes
    const fl = flashes, chance = dt * (4 + agito * 30);
    for (let k = 0; k < fl.n; k++) {
      if (fl.brilho[k] <= 0 && Math.random() < chance / fl.n * 4) fl.brilho[k] = 1;
      fl.brilho[k] = Math.max(0, fl.brilho[k] - dt * 7);
      const b = fl.brilho[k] * 1.4;
      fl.cor.setXYZ(k, b, b, b * 0.95);
    }
    fl.cor.needsUpdate = true;
  }
  // clarão branco sobre a cena (no modo transparente ficaria piscando branco no rosto de quem transmite)
  const clarao = transparente ? 0 : Math.min(0.5, flashTela * 1.1);
  if (clarao !== claraoAtual) { $('clarao').style.opacity = clarao; claraoAtual = clarao; }
}

let quadros = 0;
c3d.aoQuadro((dt) => {
  // o relógio do kit pode entregar dt <= 0 no 1º quadro: com Math.max(0, x - dt) isso acenderia flash e luz sem golpe
  if (!(dt > 0)) return;
  tReal += dt;
  // anúncio do round só depois que a cena já apareceu (o 1º quadro compila os shaders e demora)
  if (++quadros === 2) anunciarRound();
  // câmera lenta (K.O. e finalização), voltando ao normal nos últimos 0,4 s
  let escala = 1;
  if (lento > 0) {
    lento = Math.max(0, lento - dt);
    escala = lento > 0.4 ? 0.28 : 0.28 + 0.72 * (1 - lento / 0.4);
  }
  const dj = dt * escala;
  relogio += dj;
  atualizar(dj, dt);
  animarLutadores(dj, dt);
  animarCena(dt, tReal);
  animarCamera(dt);
});

/* ---------- teclas de teste ---------- */

const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];
function presenteFalso(ref, quantidade) {
  return eventoFalso(typeof ref === 'number'
    ? { presenteId: ref, presenteNome: 'presente', quantidade }
    : { presenteNome: String(ref), quantidade });
}
const refsGolpes = Object.values(cfg.golpes).map(g => g.presentes?.[0]).filter(r => r != null);

teclas({
  t: () => {
    for (let k = 0; k < 14; k++) setTimeout(() => {
      const r = Math.random();
      if (r < 0.4) aoEvento(eventoFalso({ tipo: 'comentario', texto: sortear([cfg.palavras.A[0], cfg.palavras.B[0]]) }));
      else if (r < 0.5) aoEvento(eventoFalso({ presenteNome: 'Finger Heart' }));
      else aoEvento(presenteFalso(sortear(refsGolpes), 1 + Math.floor(Math.random() * 3)));
    }, k * 180);
  },
  r: () => {
    placar = [0, 0]; round = 0;
    lut.forEach(f => { f.fila.length = 0; });
    ranking.zerar();
    pintarTop();
    esperando();
    novoRound();
  },
  1: () => golpear(0, sortear(Object.keys(cfg.golpes)), 'teste', 1),
  2: () => golpear(1, sortear(Object.keys(cfg.golpes)), 'teste', 1),
  // K: finalização que nocauteia o lado B (para testar o fim de round)
  k: () => { if (pausa <= 0) { lut[1].vida = Math.min(lut[1].vida, 1); golpear(0, 'finalizacao', 'teste', 1); } }
});

atualizarHud();
pintarTop();
esperando();
tocar('virada');
conectar(aoEvento);
