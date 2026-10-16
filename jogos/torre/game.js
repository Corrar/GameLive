import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
aplicarFundo(cfg.fundo);
escalarPalco(palco);
const avisar = avisos($('avisos'));
const ctx = $('tela').getContext('2d');

const GIGANTE = cfg.blocoGigante ?? 5;
const DEMOLE = cfg.demolicao ?? 5;
const MAX_FILA = cfg.maxFila ?? 300;
const H = 72;          // altura de 1 bloco (px do mundo)
const CHAO = 1720;     // y de tela do chão com a câmera em 0
const CORES = ['#3df2c2', '#ff3d7f', '#ffc23d', '#5b8cff', '#b06bff'];
const MAX_CACOS = 160, MAX_PARTS = 300;
const r = (a, b) => a + Math.random() * (b - a);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

let blocos = [];   // pilha: {x, y, vy, alvo, w, h, vale, cor, quem, gigante, pousou, amasso}
let cacos = [];    // blocos derrubados voando
let parts = [];    // poeira e faíscas
let fila = [];     // ações esperando a vez: {acao, quem, n}
let espera = 0, anim = null;
let camY = 0, tremor = 0, flash = 0, t = 0, contaCor = 0;
let recorde = lembrar('torre:recorde', 0);
if (!Number.isFinite(recorde)) recorde = 0;

const altura = () => blocos.reduce((s, b) => s + b.vale, 0);
const topo = () => { const b = blocos.at(-1); return b ? b.alvo + b.h : 0; };
const telaY = (wy) => CHAO - (wy - camY);

/* ---------- regras ---------- */

function soltarBloco(quem, gigante) {
  const vale = gigante ? GIGANTE : 1;
  const alvo = topo();
  blocos.push({ x: 540 + r(-24, 24), y: alvo + 700, vy: -300, alvo, w: gigante ? 440 : r(270, 320), h: H * vale,
    vale, cor: CORES[contaCor++ % CORES.length], quem, gigante, pousou: false, amasso: 0 });
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
        cor: b.cor, quem: b.gigante ? '' : b.quem, vx: vx(), vy: vy(), rot: 0, vr: r(-5, 5), vida: 5 });
    }
  }
  if (cacos.length > MAX_CACOS) cacos.splice(0, cacos.length - MAX_CACOS);
}

function faiscas(x, wy, n, cores, forca = 900) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = r(150, forca);
    parts.push({ x, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vida: r(0.4, 1), max: 1, tam: r(6, 16), cor: cores[k % cores.length] });
  }
  if (parts.length > MAX_PARTS) parts.splice(0, parts.length - MAX_PARTS);
}

function proximaAcao() {
  const a = fila.shift();
  if (a.acao === 'bloco' || a.acao === 'gigante') {
    soltarBloco(a.quem, a.acao === 'gigante');
    $('ultimo').textContent = `${a.acao === 'gigante' ? '🫰 bloco gigante' : '🧱 último bloco'}: ${a.quem}`;
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
    tremor = Math.max(tremor, 34);
    $('ultimo').textContent = tirado ? `💥 ${a.quem} derrubou ${tirado} ${tirado === 1 ? 'bloco' : 'blocos'}` : `💥 ${a.quem} errou: torre vazia!`;
  } else {
    virarCacos(fora, () => r(-1500, 1500), () => r(200, 1400));
    faiscas(540, wy + 40, 70, ['#ffc23d', '#fff', '#3df2c2', '#ff3d7f'], 1300);
    tremor = Math.max(tremor, 56);
    flash = 0.7;
    $('ultimo').textContent = tirado ? `🔨 ${a.quem} martelou: −${tirado} blocos` : `🔨 ${a.quem} martelou o chão!`;
  }
}

/* ---------- eventos ---------- */

const ROTULOS = {
  bloco: () => '+1 bloco', gigante: () => `gigante (+${GIGANTE})`,
  demolicao: () => `demolição (−${DEMOLE})`, martelo: () => 'martelo (metade)'
};
const EMOJI = { bloco: '🧱', gigante: '🫰', demolicao: '💣', martelo: '🔨' };

function aoEvento(ev) {
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao || !ROTULOS[acao]) return;
  const q = Math.max(1, Math.min(50, Math.floor(ev.quantidade) || 1));
  const quem = ev.nome || ev.user || 'alguém';
  if (acao === 'bloco' || acao === 'gigante') for (let k = 0; k < q; k++) fila.push({ acao, quem, n: 1 });
  else fila.push({ acao, quem, n: q });
  if (fila.length > MAX_FILA) fila.splice(0, fila.length - MAX_FILA);
  const efeito = acao === 'bloco' ? `+${q} ${q === 1 ? 'bloco' : 'blocos'}`
    : acao === 'gigante' ? `+${q * GIGANTE} (gigante)`
    : acao === 'demolicao' ? `bola de demolição −${q * DEMOLE}` : (q > 1 ? `martelo ×${q}` : 'martelo: metade!');
  avisar(html`<span>${EMOJI[acao]} <b>${quem}</b> ${q}× ${ev.presenteNome} → <span class="mais">${efeito}</span></span>`);
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
        faiscas(b.x, b.alvo, b.gigante ? 30 : 8, ['#e9eefc', '#c9d2ea']);
        if (b.gigante) tremor = Math.max(tremor, 18);
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

  const h = altura();
  if (h > recorde) {
    if (recorde > 0 && Math.floor(h / 10) > Math.floor(recorde / 10)) $('caixaRec').classList.remove('pulso'), void $('caixaRec').offsetWidth, $('caixaRec').classList.add('pulso');
    recorde = h;
    guardar('torre:recorde', recorde);
  }

  for (const c of cacos) {
    c.vy -= 2600 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt; c.vida -= dt;
  }
  cacos = cacos.filter(c => c.vida > 0 && telaY(c.y) < 2300 && c.x > -500 && c.x < 1580);
  for (const p of parts) {
    p.vy -= 1400 * dt; p.vx *= 0.98; p.x += p.vx * dt; p.y += p.vy * dt; p.vida -= dt;
  }
  parts = parts.filter(p => p.vida > 0);

  const alvoCam = Math.max(0, topo() - 760);
  camY += (alvoCam - camY) * Math.min(1, dt * 2.2);
  tremor = Math.max(0, tremor - dt * 70);
  flash = Math.max(0, flash - dt * 1.8);
}

/* ---------- desenho ---------- */

function mistura(c1, c2, k) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const canal = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return `rgb(${canal(16)},${canal(8)},${canal(0)})`;
}
const CEU = [[0, '#3f8fe0', '#bfe9ff'], [2500, '#2b5bbf', '#7fb8f0'], [6000, '#1a2470', '#4b4fa8'], [11000, '#0b0d17', '#1b1f45']];
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
const ESTRELAS = Array.from({ length: 140 }, (_, i) => ({ x: ruido(i) * 1080, y: ruido(i + 500) * 1920, s: 1 + ruido(i + 900) * 3 }));

function nuvem(x, y, s, alfa) {
  ctx.globalAlpha = alfa;
  ctx.fillStyle = '#fff';
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
  const k0 = Math.floor((camY * par - 300) / PASSO);
  for (let k = k0; k < k0 + 7; k++) {
    if (k < 1 || (k % 2 === 0) !== frente) continue;
    const wy = k * PASSO;
    const y = CHAO - (wy - camY * par);
    const alfa = (frente ? 0.55 : 0.9) * (1 - limitar((wy - 9000) / 4000, 0, 1));
    if (alfa <= 0) continue;
    const vel = 12 + ruido(k) * 30;
    const x = ((ruido(k + 7) * 1500 + t * vel) % 1600) - 300;
    nuvem(x, y, 0.8 + ruido(k + 3) * 0.7, alfa);
  }
}

function retArred(x, y, w, h, raio) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, raio);
}

function desenharBloco(b, x, y, rot = 0) {
  // y = base do bloco na tela
  const esmaga = b.amasso ? Math.sin(b.amasso * Math.PI) * 0.12 : 0;
  const w = b.w * (1 + esmaga), h = b.h * (1 - esmaga);
  ctx.save();
  ctx.translate(x, y - h / 2);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  retArred(-w / 2 + 6, -h / 2 + 8, w, h, 14); ctx.fill();
  ctx.fillStyle = b.cor;
  retArred(-w / 2, -h / 2, w, h, 14); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  retArred(-w / 2 + 8, -h / 2 + 6, w - 16, 10, 5); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.fillRect(-w / 2 + 6, h / 2 - 12, w - 12, 8);
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(11,13,23,.55)';
  retArred(-w / 2, -h / 2, w, h, 14); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (b.gigante) {
    ctx.font = '900 120px "Segoe UI Emoji","Segoe UI",system-ui,sans-serif';
    ctx.fillText('🫰', 0, -26);
    ctx.font = '900 40px "Segoe UI",system-ui,sans-serif';
    ctx.fillStyle = '#0b0d17';
    ctx.fillText(String(b.quem ?? '').slice(0, 16), 0, h / 2 - 50);
  } else if (b.quem) {
    ctx.font = '900 32px "Segoe UI",system-ui,sans-serif';
    ctx.fillStyle = '#0b0d17';
    ctx.fillText(String(b.quem).slice(0, 16), 0, 3);
  }
  ctx.restore();
}

function desenhar() {
  const [cTopo, cBase] = corDoCeu(camY);
  const g = ctx.createLinearGradient(0, 0, 0, 1920);
  g.addColorStop(0, cTopo); g.addColorStop(1, cBase);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920);

  const estrelas = limitar((camY - 3500) / 5000, 0, 1);
  if (estrelas > 0) {
    ctx.fillStyle = '#fff';
    for (const e of ESTRELAS) {
      ctx.globalAlpha = estrelas * (0.5 + 0.5 * Math.sin(t * 2 + e.x));
      ctx.fillRect(e.x, (e.y + camY * 0.05) % 1920, e.s, e.s);
    }
    ctx.globalAlpha = 1;
  }

  ctx.save();
  if (tremor > 0) ctx.translate(r(-tremor, tremor), r(-tremor, tremor) * 0.6);

  nuvens(false);

  // morros e chão
  const yChao = telaY(0);
  if (yChao < 2100) {
    ctx.fillStyle = '#2f7d6b';
    ctx.beginPath(); ctx.moveTo(0, yChao);
    for (let x = 0; x <= 1080; x += 40) ctx.lineTo(x, yChao - 120 - Math.sin(x / 160) * 60 - Math.sin(x / 70) * 20);
    ctx.lineTo(1080, yChao); ctx.fill();
    ctx.fillStyle = '#1f5e4f'; ctx.fillRect(0, yChao, 1080, 400);
    ctx.fillStyle = '#3df2c2'; ctx.fillRect(0, yChao, 1080, 14);
    ctx.fillStyle = '#5a6078'; retArred(330, yChao - 26, 420, 40, 10); ctx.fill();
  }

  // régua de altura e linha do recorde
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.font = '900 34px "Segoe UI",system-ui,sans-serif';
  const k0 = Math.max(1, Math.floor((camY - 200) / (H * 10)));
  for (let k = k0; k < k0 + 4; k++) {
    const y = telaY(k * 10 * H);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(1000, y - 2, 60, 4);
    ctx.fillText(String(k * 10), 990, y);
  }
  if (recorde > 0) {
    const y = telaY(recorde * H);
    ctx.setLineDash([24, 16]); ctx.lineWidth = 5; ctx.strokeStyle = '#ffc23d';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffc23d';
    ctx.fillText(`RECORDE ${recorde}`, 24, y - 28);
  }

  // torre balançando: mais no alto, mais com a altura
  const n = topo() || 1;
  const amp = Math.min(70, altura() * 0.9);
  const onda = Math.sin(t * 1.3) + 0.3 * Math.sin(t * 3.1);
  for (const b of blocos) {
    const y = telaY(b.y);
    if (y < -400 || y - b.h > 2000) continue;
    const frac = (b.alvo / n) ** 2;
    desenharBloco(b, b.x + onda * amp * frac, y, onda * 0.025 * frac);
  }

  for (const c of cacos) desenharBloco(c, c.x, telaY(c.y), c.rot);

  // bola de demolição / martelo
  if (anim?.tipo === 'bola') {
    const a = anim, L = 760, s = a.lado;
    const ang = a.t < 0.6 ? -s * 1.35 * Math.cos(Math.PI / 2 * a.t / 0.6) : s * 0.75 * Math.sin(Math.PI / 2 * Math.min(1, (a.t - 0.6) / 0.45));
    const px = 540 - s * 130, py = telaY(a.pivoY);
    const bx = px + L * Math.sin(ang), by = py + L * Math.cos(ang);
    ctx.globalAlpha = a.t > 1.1 ? Math.max(0, 1 - (a.t - 1.1) / 0.4) : 1;
    ctx.strokeStyle = '#2a2f45'; ctx.lineWidth = 12; ctx.setLineDash([22, 10]);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
    const gb = ctx.createRadialGradient(bx - 30, by - 30, 10, bx, by, 95);
    gb.addColorStop(0, '#6a7090'); gb.addColorStop(1, '#151829');
    ctx.fillStyle = gb; ctx.beginPath(); ctx.arc(bx, by, 95, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '900 30px "Segoe UI",system-ui,sans-serif';
    ctx.fillText(String(a.quem).slice(0, 14), bx, by);
    ctx.globalAlpha = 1;
  } else if (anim?.tipo === 'martelo') {
    const a = anim;
    const yAlvo = telaY(topo());
    const desce = Math.min(1, a.t / 0.5);
    const y = a.bateu ? yAlvo - 120 - (a.t - 0.5) * 900 : -300 + (yAlvo - 120 + 300) * desce * desce;
    ctx.globalAlpha = a.bateu ? Math.max(0, 1 - (a.t - 0.5) / 0.7) : 1;
    ctx.save();
    ctx.translate(620, y);
    ctx.rotate(-0.9 + desce * 1.2);
    ctx.font = '380px "Segoe UI Emoji",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🔨', 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.vida);
    ctx.fillStyle = p.cor;
    ctx.fillRect(p.x - p.tam / 2, telaY(p.y) - p.tam / 2, p.tam, p.tam);
  }
  ctx.globalAlpha = 1;

  nuvens(true);
  ctx.restore();

  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.6})`; ctx.fillRect(0, 0, 1080, 1920); }

  const h = String(altura());
  if ($('altura').textContent !== h) $('altura').textContent = h;
  const rc = String(recorde);
  if ($('recorde').textContent !== rc) $('recorde').textContent = rc;
}

/* ---------- início ---------- */

for (const [acao, refs] of Object.entries(cfg.acoes ?? {})) {
  if (!ROTULOS[acao]) continue;
  const chip = document.createElement('div');
  const nome = document.createElement('i');
  nome.textContent = refs.map(x => (typeof x === 'number' ? '#' + x : x)).join(' / ');
  chip.append(`${EMOJI[acao]} `, nome, ` ${ROTULOS[acao]()}`);
  $('legenda').appendChild(chip);
}
$('ultimo').textContent = '🌹 Mande presentes para erguer a torre até as nuvens!';

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
  r: () => { blocos = []; cacos = []; fila = []; anim = null; $('ultimo').textContent = '🧱 Torre reiniciada!'; }
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
