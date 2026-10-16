import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, corDoNick, avatar, animar, contador,
  particulas, flutuar, tremer, confete, pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = $('palco');
const transparente = !cfg.fundo || cfg.fundo === 'transparente';
aplicarFundo(cfg.fundo);
escalarPalco(palco);
ligarSom(cfg.som);
const avisar = avisos($('avisos'), { max: 3 });
const ctx = $('tela').getContext('2d');
if (cfg.titulo) $('titulo').textContent = cfg.titulo;

const GIGANTE = cfg.blocoGigante ?? 5;
const DEMOLE = cfg.demolicao ?? 5;
const MAX_FILA = cfg.maxFila ?? 300;
const H = 72;          // altura de 1 bloco (px do mundo)
const CHAO = 1400;     // y de tela do chão com a câmera em 0 (abaixo fica o rodapé)
const FOLGA = 560;     // o topo da torre fica ~840 px abaixo do alto da tela
// cada cor: base, clara (topo) e escura (base) para o degradê do tijolo
const PALETA = [
  ['#3df2c2', '#b8ffec', '#0f9c7a'], ['#ff3d7f', '#ffb3cc', '#b3124a'], ['#ffc23d', '#fff0b8', '#c27c00'],
  ['#5b8cff', '#c4d6ff', '#2447b8'], ['#b06bff', '#e4ccff', '#6a24b8'], ['#ff7a3d', '#ffd0b3', '#b84012']
];
const OURO = ['#ffd23f', '#fff6c4', '#c98a00'];
const FONTE = '"Lilita One","Baloo 2",Impact,sans-serif';
const EMOJI_FONTE = '"Noto Color Emoji","Segoe UI Emoji","Apple Color Emoji",sans-serif';
const MAX_CACOS = 160, MAX_PARTS = 300, MAX_TEXTOS = 40;
const r = (a, b) => a + Math.random() * (b - a);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

let blocos = [];   // pilha: {x, y, vy, alvo, w, h, vale, pal, quem, gigante, pousou, amasso}
let cacos = [];    // blocos derrubados voando
let parts = [];    // poeira e faíscas
let textos = [];   // "+1" que sobem no canvas
let ondas = [];    // onda de choque do martelo/bola
let cadentes = []; // estrelas cadentes
let fila = [];     // ações esperando a vez: {acao, quem, n}
let espera = 0, anim = null;
let camY = 0, tremor = 0, flash = 0, t = 0, contaCor = 0, ultimoSom = 0;
let recorde = lembrar('torre:recorde', 0);
if (!Number.isFinite(recorde)) recorde = 0;
let festejou = false;    // já comemorou o novo recorde desta subida
let alturaHud = 0, zonaAtual = 0, ultimaZona = 0, ultimaFesta = -1e9;

const altura = () => blocos.reduce((s, b) => s + b.vale, 0);
const topo = () => { const b = blocos.at(-1); return b ? b.alvo + b.h : 0; };
const telaY = (wy) => CHAO - (wy - camY);

/* ---------- HUD ---------- */

const ZONAS = [[0, '☀️ DIA'], [30, '🌅 PÔR DO SOL'], [60, '🌙 NOITE'], [100, '🚀 ESPAÇO'], [200, '🪐 GALÁXIA']];
const zonaDe = (h) => ZONAS.reduce((z, [min], i) => (h >= min ? i : z), 0);
const MARCOS = [10, 25, 50, 100, 250, 500, 1000];

const paraAltura = contador($('altura'));
const combo = criarCombo({ janela: cfg.comboJanela ?? 5000 });
const ranking = criarRanking();
let timerCombo = 0, timerFaixa = 0, timerFesta = 0;
$('recorde').textContent = recorde.toLocaleString('pt-BR');

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
  confete(palco);
  tocar('vitoria');
  const caixa = $('caixaRec');
  caixa.classList.remove('festa'); void caixa.offsetWidth; caixa.classList.add('festa');
  clearTimeout(timerFesta);
  timerFesta = setTimeout(() => caixa.classList.remove('festa'), 3200);
}

// chamada sempre que a pilha muda: número grande, marcos, zona do céu e recorde
function atualizarHud() {
  const h = altura();
  if (h === alturaHud) return;
  const antes = alturaHud;
  alturaHud = h;
  paraAltura(h);

  if (h > antes) {
    const m = Math.floor(h / 10) * 10;
    if (m > 0 && m > antes) {
      flutuar(palco, { x: 540, y: limitar(telaY(topo()) - 90, 660, 1300), texto: `${m} BLOCOS!`, cor: '#3df2c2', tamanho: 84 });
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
    guardar('torre:recorde', recorde);
    $('recorde').textContent = recorde.toLocaleString('pt-BR');
    animar($('recorde'));
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
  blocos.push({ x: 540 + r(-24, 24), y: alvo + 760, vy: -300, alvo, w: gigante ? 440 : r(270, 320), h: H * vale,
    vale, pal: gigante ? OURO : PALETA[contaCor++ % PALETA.length], quem, gigante, pousou: false, amasso: 0 });
}

function removerTopo(n) {
  const fora = [];
  let tirado = 0;
  while (blocos.length && tirado < n) { const b = blocos.pop(); tirado += b.vale; fora.push(b); }
  return { fora, tirado };
}

function virarCacos(fora, vx, vy) {
  for (const b of fora) {
    const pedacos = b.gigante ? 4 : 1;
    for (let k = 0; k < pedacos; k++) {
      cacos.push({ x: b.x + r(-60, 60) * (pedacos > 1), y: b.y + (b.h / pedacos) * k, w: b.gigante ? b.w / 2 : b.w, h: b.h / pedacos,
        pal: b.pal, quem: b.gigante ? '' : b.quem, vx: vx(), vy: vy(), rot: 0, vr: r(-5, 5), vida: 5 });
    }
  }
  if (cacos.length > MAX_CACOS) cacos.splice(0, cacos.length - MAX_CACOS);
}

function faiscas(x, wy, n, cores, forca = 900) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = r(150, forca);
    parts.push({ x, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: r(0.4, 1), tam: r(6, 16), cor: cores[k % cores.length] });
  }
  if (parts.length > MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS);
}

function textoNoMundo(x, wy, texto, cor, tam = 54) {
  textos.push({ x, y: wy, texto, cor, tam, vida: 1 });
  if (textos.length > MAX_TEXTOS) textos.shift();
}

function proximaAcao() {
  const a = fila.shift();
  if (a.acao === 'bloco' || a.acao === 'gigante') {
    soltarBloco(a.quem, a.acao === 'gigante');
    espera = a.acao === 'gigante' ? 0.35 : 0.12;
  } else if (a.acao === 'demolicao') {
    const lado = Math.random() < 0.5 ? -1 : 1;
    const n = DEMOLE * a.n;
    anim = { tipo: 'bola', t: 0, n, quem: a.quem, lado, bateu: false, pivoY: Math.max(H, topo() - Math.min(n, altura()) * H / 2) + 760 };
  } else if (a.acao === 'martelo') {
    const h = altura();
    anim = { tipo: 'martelo', t: 0, n: h - Math.floor(h / 2 ** a.n), quem: a.quem, bateu: false };
  }
}

function impacto() {
  const a = anim;
  a.bateu = true;
  const { fora, tirado } = removerTopo(a.n);
  const wy = topo();
  if (a.tipo === 'bola') {
    const dir = a.lado;
    virarCacos(fora, () => dir * r(500, 1400), () => r(100, 800));
    faiscas(540 - dir * 120, wy + 120, 40, ['#ffc23d', '#fff', '#ff3d7f']);
    ondas.push({ x: 540 - dir * 120, y: wy + 120, raio: 40, vida: 1 });
    tremor = Math.max(tremor, 34);
    tremer(palco);
  } else {
    virarCacos(fora, () => r(-1500, 1500), () => r(200, 1400));
    faiscas(540, wy + 40, 70, ['#ffc23d', '#fff', '#3df2c2', '#ff3d7f'], 1300);
    ondas.push({ x: 540, y: wy + 20, raio: 60, vida: 1 }, { x: 540, y: wy + 20, raio: 10, vida: 1.3 });
    tremor = Math.max(tremor, 56);
    flash = 0.7;
    tremer(palco, true);
  }
  tocar('impacto');
  const y = limitar(telaY(wy) - 60, 640, 1350);
  flutuar(palco, { x: 540, y, texto: tirado ? `−${tirado} 💥` : 'ERROU!', cor: '#ff4d6d', tamanho: tirado >= 10 ? 150 : 120 });
  particulas(palco, { x: 540, y, emoji: a.tipo === 'bola' ? '💥' : '🧱', qtd: 8, forca: 1.2 });
  atualizarHud();
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

  for (const b of blocos) {
    if (!b.pousou) {
      b.vy -= 3600 * dt;
      b.y += b.vy * dt;
      if (b.y <= b.alvo) {
        b.y = b.alvo; b.pousou = true; b.amasso = 1;
        faiscas(b.x, b.alvo, b.gigante ? 30 : 8, ['#e9eefc', '#c9d2ea', b.pal[0]]);
        if (b.gigante) {
          tremor = Math.max(tremor, 18);
          tocar('impacto');
          if (!document.querySelector('.vencedor')) flutuar(palco, { x: 540, y: limitar(telaY(b.alvo + b.h) - 80, 640, 1300), texto: 'GIGANTE!', cor: '#ffd23f', tamanho: 110 });
        } else {
          textoNoMundo(b.x + r(-80, 80), b.alvo + b.h + 30, '+1', b.pal[0]);
          if (t - ultimoSom > 0.08) { ultimoSom = t; tocar('ponto'); }
        }
        atualizarHud();
      }
    }
    b.amasso = Math.max(0, b.amasso - dt * 4);
  }

  if (anim) {
    anim.t += dt;
    const bate = anim.tipo === 'bola' ? 0.6 : 0.5;
    if (!anim.bateu && anim.t >= bate) impacto();
    if (anim.t > (anim.tipo === 'bola' ? 1.5 : 1.2)) { anim = null; espera = 0.2; }
  }

  for (const c of cacos) {
    c.vy -= 2600 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.vida -= dt;
  }
  cacos = cacos.filter(c => c.vida > 0 && telaY(c.y) < 2300 && c.x > -500 && c.x < 1580);
  for (const p of parts) {
    p.vy -= 1400 * dt; p.vx *= 0.98; p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt;
  }
  parts = parts.filter(p => p.vida > 0);
  for (const x of textos) { x.y += 140 * dt; x.vida -= dt * 1.1; }
  textos = textos.filter(x => x.vida > 0);
  for (const o of ondas) { o.raio += 900 * dt; o.vida -= dt * 1.8; }
  ondas = ondas.filter(o => o.vida > 0);

  // estrelas cadentes à noite
  if (camY > 4000 && Math.random() < dt * 0.4 && cadentes.length < 3) {
    cadentes.push({ x: r(100, 1000), y: r(520, 1100), vx: r(-900, -600), vy: r(250, 400), vida: 1 });
  }
  for (const s of cadentes) { s.x += s.vx * dt; s.y += s.vy * dt; s.vida -= dt * 1.2; }
  cadentes = cadentes.filter(s => s.vida > 0);

  const alvoCam = Math.max(0, topo() - FOLGA);
  camY += (alvoCam - camY) * Math.min(1, dt * 4);
  tremor = Math.max(0, tremor - dt * 70);
  flash = Math.max(0, flash - dt * 1.8);
}

/* ---------- desenho ---------- */

const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function mistura(c1, c2, k) {
  const a = hex(c1), b = hex(c2);
  return `rgb(${a.map((v, i) => Math.round(v * (1 - k) + b[i] * k)).join(',')})`;
}
// céu por altura da câmera: dia → pôr do sol → noite → espaço → galáxia
const CEU = [
  [0, '#2a7fe0', '#a8e4ff'], [1300, '#3a6fd6', '#ffe1a8'], [2200, '#6a3fa8', '#ff9a4d'],
  [3300, '#3a1f78', '#ff4f6d'], [4600, '#140c40', '#5a2a80'], [6600, '#05040f', '#15103a'],
  [14000, '#0a0420', '#3a0f5a']
];
function corDoCeu(alt) {
  for (let i = 1; i < CEU.length; i++) {
    if (alt <= CEU[i][0]) {
      const [a0, t0, b0] = CEU[i - 1], [a1, t1, b1] = CEU[i];
      const k = (alt - a0) / (a1 - a0);
      return [mistura(t0, t1, k), mistura(b0, b1, k)];
    }
  }
  return [CEU.at(-1)[1], CEU.at(-1)[2]];
}

const ruido = (k) => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const ESTRELAS = Array.from({ length: 200 }, (_, i) => ({ x: ruido(i) * 1080, y: ruido(i + 500) * 1920, s: 1.5 + ruido(i + 900) * 3.5 }));

function brilhoRedondo(x, y, raio, cor, alfa) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, raio);
  g.addColorStop(0, cor); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alfa;
  ctx.fillStyle = g;
  ctx.fillRect(x - raio, y - raio, raio * 2, raio * 2);
  ctx.globalAlpha = 1;
}

function desenharCeu() {
  const [cTopo, cBase] = corDoCeu(camY);
  const g = ctx.createLinearGradient(0, 0, 0, 1920);
  g.addColorStop(0, cTopo); g.addColorStop(1, cBase);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920);

  // nebulosa na galáxia
  const neb = limitar((camY - 8000) / 6000, 0, 1);
  if (neb > 0) {
    brilhoRedondo(260, 900, 520, 'rgba(255,61,127,.55)', neb * 0.6);
    brilhoRedondo(820, 1250, 560, 'rgba(91,140,255,.55)', neb * 0.6);
  }

  const estrelas = limitar((camY - 2600) / 3000, 0, 1);
  if (estrelas > 0) {
    ctx.fillStyle = '#fff';
    for (const e of ESTRELAS) {
      ctx.globalAlpha = estrelas * (0.45 + 0.55 * Math.sin(t * 2 + e.x));
      const y = (e.y + camY * 0.05) % 1920;
      ctx.beginPath(); ctx.arc(e.x, y, e.s / 2 + 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    for (const s of cadentes) {
      ctx.globalAlpha = s.vida; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.18, s.y - s.vy * 0.18); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // sol: desce e avermelha no pôr do sol, some à noite
  const ks = limitar(camY / 3200, 0, 1);
  const solA = 1 - limitar((camY - 3000) / 900, 0, 1);
  if (solA > 0) {
    const sx = 840, sy = 640 + ks * 640, sr = 80 + ks * 50;
    const cor = mistura('#fff3a0', '#ff5a3d', ks);
    brilhoRedondo(sx, sy, sr * 3.2, cor, solA * 0.55);
    ctx.globalAlpha = solA; ctx.fillStyle = cor;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // lua à noite
  const luaA = limitar((camY - 3300) / 1000, 0, 1) * (1 - limitar((camY - 9000) / 2000, 0, 1));
  if (luaA > 0) {
    const lx = 210, ly = 700;
    brilhoRedondo(lx, ly, 240, 'rgba(220,220,255,.6)', luaA * 0.6);
    ctx.globalAlpha = luaA; ctx.fillStyle = '#f2efff';
    ctx.beginPath(); ctx.arc(lx, ly, 74, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cfc9e8';
    for (const [dx, dy, rr] of [[-22, -18, 16], [20, 10, 12], [-6, 30, 9], [28, -26, 7]]) {
      ctx.beginPath(); ctx.arc(lx + dx, ly + dy, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // planeta com anel no espaço
  const plA = limitar((camY - 5600) / 1500, 0, 1);
  if (plA > 0) {
    const px = 830, py = 1060 + Math.sin(t * 0.3) * 10;
    ctx.save();
    ctx.globalAlpha = plA;
    ctx.translate(px, py); ctx.rotate(-0.35);
    ctx.lineWidth = 16; ctx.strokeStyle = 'rgba(255,210,63,.8)';
    ctx.beginPath(); ctx.ellipse(0, 0, 190, 46, 0, Math.PI, Math.PI * 2); ctx.stroke();
    const gp = ctx.createRadialGradient(-35, -40, 10, 0, 0, 110);
    gp.addColorStop(0, '#ffb3cc'); gp.addColorStop(0.6, '#b06bff'); gp.addColorStop(1, '#3a1f78');
    ctx.fillStyle = gp; ctx.beginPath(); ctx.arc(0, 0, 105, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 190, 46, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
  }
}

function nuvem(x, y, s, alfa, cor) {
  ctx.globalAlpha = alfa;
  ctx.fillStyle = cor;
  ctx.beginPath();
  for (const [dx, dy, rr] of [[0, 0, 70], [70, -30, 85], [150, 0, 70], [80, 25, 70], [-60, 15, 50], [210, 20, 45]]) {
    ctx.moveTo(x + dx * s + rr * s, y + dy * s);
    ctx.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

function nuvens(frente) {
  const PASSO = 420, par = 0.8;
  const cor = mistura('#ffffff', '#ffb59a', limitar((camY - 1200) / 1800, 0, 1));
  const k0 = Math.floor((camY * par - 700) / PASSO);
  for (let k = k0; k < k0 + 7; k++) {
    if (k < 1 || (k % 2 === 0) !== frente) continue;
    const wy = k * PASSO;
    const y = CHAO - (wy - camY * par);
    const alfa = (frente ? 0.5 : 0.85) * (1 - limitar((wy - 3600) / 2400, 0, 1));
    if (alfa <= 0) continue;
    const vel = 12 + ruido(k) * 30;
    const x = ((ruido(k + 7) * 1500 + t * vel) % 1600) - 300;
    nuvem(x, y, 0.8 + ruido(k + 3) * 0.7, alfa, cor);
  }
}

function desenharChao() {
  const yChao = telaY(0);
  if (yChao > 2300) return;
  // morros ao fundo e na frente
  ctx.fillStyle = '#4fae7c';
  ctx.beginPath(); ctx.moveTo(0, yChao);
  for (let x = 0; x <= 1080; x += 30) ctx.lineTo(x, yChao - 190 - Math.sin(x / 210 + 1) * 70 - Math.sin(x / 90) * 18);
  ctx.lineTo(1080, yChao); ctx.fill();
  ctx.fillStyle = '#2f8a5e';
  ctx.beginPath(); ctx.moveTo(0, yChao);
  for (let x = 0; x <= 1080; x += 30) ctx.lineTo(x, yChao - 90 - Math.sin(x / 140) * 40 - Math.sin(x / 55) * 10);
  ctx.lineTo(1080, yChao); ctx.fill();
  // árvores
  for (const [tx, ts] of [[90, 1], [190, 0.8], [880, 0.9], [990, 1.1]]) {
    ctx.fillStyle = '#6b3d1f'; ctx.fillRect(tx - 8 * ts, yChao - 70 * ts, 16 * ts, 70 * ts);
    ctx.fillStyle = '#1f6e47'; ctx.beginPath(); ctx.arc(tx, yChao - 90 * ts, 46 * ts, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f9c62'; ctx.beginPath(); ctx.arc(tx - 12 * ts, yChao - 102 * ts, 26 * ts, 0, Math.PI * 2); ctx.fill();
  }
  // grama e terra
  ctx.fillStyle = '#6b3d1f'; ctx.fillRect(0, yChao, 1080, 700);
  ctx.fillStyle = '#5a3218';
  for (let k = 0; k < 6; k++) ctx.fillRect(0, yChao + 60 + k * 70, 1080, 10);
  ctx.fillStyle = '#4cd964'; ctx.fillRect(0, yChao - 6, 1080, 26);
  ctx.fillStyle = '#2fb24a'; ctx.fillRect(0, yChao + 16, 1080, 8);
  // base de concreto
  ctx.fillStyle = '#8a90a8'; ctx.beginPath(); ctx.roundRect(300, yChao - 30, 480, 44, 10); ctx.fill();
  ctx.fillStyle = '#b8bdd0'; ctx.fillRect(310, yChao - 26, 460, 8);
  ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(300, yChao - 30, 480, 44, 10); ctx.stroke();
}

function textoContorno(texto, x, y, tam, cor, contorno = 0.22) {
  ctx.font = `${tam}px ${FONTE}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = tam * contorno;
  ctx.strokeStyle = '#1a1030';
  ctx.strokeText(texto, x, y);
  ctx.fillStyle = cor;
  ctx.fillText(texto, x, y);
}

function desenharBloco(b, x, y, rot = 0) {
  // y = base do bloco na tela
  const esmaga = b.amasso ? Math.sin(b.amasso * Math.PI) * 0.12 : 0;
  const w = b.w * (1 + esmaga), h = b.h * (1 - esmaga);
  const [base, clara, escura] = b.pal;
  ctx.save();
  ctx.translate(x, y - h / 2);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.roundRect(-w / 2 + 8, -h / 2 + 10, w, h, 14); ctx.fill();
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, clara); g.addColorStop(0.35, base); g.addColorStop(1, escura);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 14); ctx.fill();

  // textura de tijolos
  ctx.strokeStyle = 'rgba(26,16,48,.22)'; ctx.lineWidth = 3;
  ctx.beginPath();
  const fileiras = Math.max(2, Math.round(h / 36));
  for (let f = 1; f < fileiras; f++) { const fy = -h / 2 + (h / fileiras) * f; ctx.moveTo(-w / 2 + 6, fy); ctx.lineTo(w / 2 - 6, fy); }
  for (let f = 0; f < fileiras; f++) {
    const y0 = -h / 2 + (h / fileiras) * f, y1 = y0 + h / fileiras;
    for (let c = (f % 2 ? 0.5 : 1); c < 4; c++) { const cx = -w / 2 + (w / 4) * c; ctx.moveTo(cx, y0 + 3); ctx.lineTo(cx, y1 - 3); }
  }
  ctx.stroke();

  // brilho
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.roundRect(-w / 2 + 12, -h / 2 + 6, w - 24, 9, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.beginPath(); ctx.roundRect(-w / 2 + 8, -h / 2 + 18, 12, h - 30, 6); ctx.fill();
  if (b.gigante) {
    // reflexo que passa pelo bloco dourado
    const fx = ((t * 300) % (w + 400)) - w / 2 - 200;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 14); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.moveTo(fx, -h / 2); ctx.lineTo(fx + 70, -h / 2); ctx.lineTo(fx - 50, h / 2); ctx.lineTo(fx - 120, h / 2); ctx.fill();
    ctx.restore();
  }
  ctx.lineWidth = 5; ctx.strokeStyle = '#1a1030';
  ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 14); ctx.stroke();

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (b.gigante && h > 200) {
    ctx.font = `130px ${EMOJI_FONTE}`;
    ctx.fillStyle = '#fff';
    ctx.fillText('🫰', 0, -40);
    textoContorno(String(b.quem ?? '').slice(0, 16), 0, h / 2 - 70, 48, '#fff');
    textoContorno(`+${b.vale}`, w / 2 - 60, -h / 2 + 50, 54, '#fff');
  } else if (b.quem) {
    textoContorno(String(b.quem).slice(0, 16), 0, 3, Math.min(36, h * 0.5), '#fff');
  }
  ctx.restore();
}

function desenharBola() {
  const a = anim, L = 760, s = a.lado;
  const ang = a.t < 0.6 ? -s * 1.35 * Math.cos(Math.PI / 2 * a.t / 0.6) : s * 0.75 * Math.sin(Math.PI / 2 * Math.min(1, (a.t - 0.6) / 0.45));
  const px = 540 - s * 130, py = telaY(a.pivoY);
  const bx = px + L * Math.sin(ang), by = py + L * Math.cos(ang);
  ctx.globalAlpha = a.t > 1.1 ? Math.max(0, 1 - (a.t - 1.1) / 0.4) : 1;
  // corrente de elos
  ctx.lineWidth = 7; ctx.strokeStyle = '#3a3f5a';
  for (let k = 0; k < 24; k++) {
    const f = k / 24;
    ctx.beginPath();
    ctx.ellipse(px + (bx - px) * f, py + (by - py) * f, k % 2 ? 9 : 16, k % 2 ? 16 : 9, -ang, 0, Math.PI * 2);
    ctx.stroke();
  }
  // rastro
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath(); ctx.arc(bx - s * 40, by, 100, 0, Math.PI * 2); ctx.fill();
  const gb = ctx.createRadialGradient(bx - 35, by - 35, 8, bx, by, 110);
  gb.addColorStop(0, '#c8cde0'); gb.addColorStop(0.35, '#6a7090'); gb.addColorStop(1, '#151829');
  ctx.fillStyle = gb; ctx.beginPath(); ctx.arc(bx, by, 105, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#1a1030'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.beginPath(); ctx.ellipse(bx - 38, by - 44, 26, 14, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  textoContorno(String(a.quem).slice(0, 12), bx, by + 8, 34, '#fff');
  ctx.globalAlpha = 1;
}

function desenharMartelo() {
  const a = anim;
  const yAlvo = telaY(topo());
  const desce = Math.min(1, a.t / 0.5);
  const y = a.bateu ? yAlvo - 120 - (a.t - 0.5) * 900 : -300 + (yAlvo - 120 + 300) * desce * desce;
  ctx.globalAlpha = a.bateu ? Math.max(0, 1 - (a.t - 0.5) / 0.7) : 1;
  ctx.save();
  ctx.translate(640, y);
  ctx.rotate(-0.9 + desce * 1.2);
  // martelo desenhado: cabo de madeira e cabeça de aço
  ctx.lineWidth = 8; ctx.strokeStyle = '#1a1030';
  ctx.fillStyle = '#b8743a';
  ctx.beginPath(); ctx.roundRect(-22, -40, 44, 300, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8a5428'; ctx.fillRect(-22, 180, 44, 18); ctx.fillRect(-22, 214, 44, 18);
  const gm = ctx.createLinearGradient(0, -150, 0, -20);
  gm.addColorStop(0, '#e4e8f5'); gm.addColorStop(0.5, '#8a90a8'); gm.addColorStop(1, '#4a4f68');
  ctx.fillStyle = gm;
  ctx.beginPath(); ctx.roundRect(-170, -150, 340, 130, 22); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.roundRect(-150, -138, 300, 18, 9); ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  textoContorno(String(a.quem).slice(0, 14), 640, y - 230, 44, '#ffd23f');
  ctx.globalAlpha = 1;
}

function desenhar() {
  if (transparente) ctx.clearRect(0, 0, 1080, 1920);
  else desenharCeu();

  ctx.save();
  if (tremor > 0) ctx.translate(r(-tremor, tremor), r(-tremor, tremor) * 0.6);

  if (!transparente) nuvens(false);
  desenharChao();

  // régua de altura e linha do recorde
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const k0 = Math.max(1, Math.floor((camY - 200) / (H * 10)));
  for (let k = k0; k < k0 + 5; k++) {
    const y = telaY(k * 10 * H);
    if (y < 560 || y > 1420) continue;
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillRect(1010, y - 3, 60, 6);
    textoContorno(String(k * 10), 1000, y, 40, '#fff');
  }
  if (recorde > 0) {
    const y = telaY(recorde * H);
    if (y > 540 && y < 1440) {
      ctx.setLineDash([24, 16]); ctx.lineWidth = 6; ctx.strokeStyle = '#ffd23f';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = 'left';
      textoContorno(`🏆 RECORDE ${recorde}`, 24, y - 32, 40, '#ffd23f');
    }
  }

  // torre balançando: mais no alto, mais com a altura
  const n = topo() || 1;
  const amp = Math.min(70, altura() * 0.9);
  const onda = Math.sin(t * 1.3) + 0.3 * Math.sin(t * 3.1);
  let topoX = 540, topoTela = null;
  for (const b of blocos) {
    const y = telaY(b.y);
    if (y < -400 || y - b.h > 2000) continue;
    const frac = (b.alvo / n) ** 2;
    const bx = b.x + onda * amp * frac;
    if (b.pousou) desenharBloco(b, bx, y, onda * 0.025 * frac);
    else {
      // bloco caindo aparece logo abaixo do HUD, sem passar por cima do placar
      ctx.save(); ctx.beginPath(); ctx.rect(-100, 450, 1280, 1600); ctx.clip();
      desenharBloco(b, bx, y, 0);
      ctx.restore();
    }
    if (b.pousou) { topoX = bx; topoTela = y - b.h; }
  }
  // bandeira no topo
  if (topoTela !== null && topoTela > 300) {
    ctx.fillStyle = '#e4e8f5'; ctx.fillRect(topoX - 4, topoTela - 110, 8, 110);
    ctx.fillStyle = '#ff3d7f';
    ctx.beginPath(); ctx.moveTo(topoX + 4, topoTela - 108);
    ctx.quadraticCurveTo(topoX + 60, topoTela - 96 + Math.sin(t * 6) * 8, topoX + 110, topoTela - 88);
    ctx.lineTo(topoX + 4, topoTela - 56); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#1a1030'; ctx.stroke();
  }

  for (const c of cacos) desenharBloco(c, c.x, telaY(c.y), c.rot);

  if (anim?.tipo === 'bola') desenharBola();
  else if (anim?.tipo === 'martelo') desenharMartelo();

  for (const o of ondas) {
    ctx.globalAlpha = Math.max(0, o.vida) * 0.8;
    ctx.lineWidth = 14 * o.vida + 2; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(o.x, telaY(o.y), o.raio, o.raio * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
  }
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.vida);
    ctx.fillStyle = p.cor;
    ctx.fillRect(p.x - p.tam / 2, telaY(p.y) - p.tam / 2, p.tam, p.tam);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const x of textos) {
    ctx.globalAlpha = Math.min(1, x.vida * 2);
    textoContorno(x.texto, x.x, telaY(x.y), x.tam, x.cor);
  }
  ctx.globalAlpha = 1;

  if (!transparente) nuvens(true);
  ctx.restore();

  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`; ctx.fillRect(0, 0, 1080, 1920); }
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

teclas({
  t: () => {
    const rajada = [['bloco', 5], ['bloco', 3], ['gigante', 1], ['bloco', 4], ['demolicao', 1], ['bloco', 5], ['gigante', 1], ['bloco', 2]];
    if (Math.random() < 0.25) rajada.push(['martelo', 1]);
    rajada.forEach(([acao, q], k) => setTimeout(() => aoEvento(falso(acao, q)), k * 220));
  },
  g: () => aoEvento(falso('gigante', 1)),
  d: () => aoEvento(falso('demolicao', 1)),
  m: () => aoEvento(falso('martelo', 1)),
  r: () => { blocos = []; cacos = []; fila = []; anim = null; combo.zerar(); atualizarHud(); avisar('🧱 Torre reiniciada!'); }
});

let antes = performance.now();
function quadro(agora) {
  const dt = Math.min(0.05, (agora - antes) / 1000);
  antes = agora;
  atualizar(dt);
  desenhar();
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);
conectar(aoEvento);
