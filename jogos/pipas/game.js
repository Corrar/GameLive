import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  teclas, eventoFalso, foto } from '../kit/kit.js';

const cfg = await carregarConfig();
const MAX = cfg.maxPipas ?? 30;
const ESCUDO_MAX = cfg.escudoMax ?? 5;
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');

aplicarFundo(cfg.fundo);
escalarPalco(palco);
const ctx = $('tela').getContext('2d');
const avisar = avisos($('avisos'));
const FONTE = '"Segoe UI", system-ui, sans-serif';
const TAU = Math.PI * 2;
const CHAO = 1790; // altura dos telhados, onde as linhas ficam presas

// legenda a partir do config
const ROTULOS = { crescer: ['🌹', 'pipa maior e forte'], tempestade: ['⛈️', 'tempestade'] };
const nomeRef = (r) => (typeof r === 'number' ? `#${r}` : r);
$('legenda').append(...Object.entries(cfg.acoes ?? {}).filter(([, r]) => r.length).map(([a, r]) => {
  const s = document.createElement('span');
  const [e, o] = ROTULOS[a] ?? ['✂️', `corta ${cfg.cortes?.[a] ?? 1}`];
  s.textContent = `${e} ${nomeRef(r[0])}: ${o}`;
  return s;
}));

/* ---------- cenário fixo: estrelas, lua e telhados ---------- */
const cena = document.createElement('canvas');
cena.width = 1080; cena.height = 1920;
{
  const g = cena.getContext('2d');
  let semente = 7;
  const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 110; i++) {
    g.globalAlpha = 0.2 + rnd() * 0.6; g.fillStyle = '#fff';
    g.beginPath(); g.arc(rnd() * 1080, rnd() * 1100, 1 + rnd() * 2, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  const lua = g.createRadialGradient(150, 1150, 10, 150, 1150, 160);
  lua.addColorStop(0, 'rgba(255,194,61,.35)'); lua.addColorStop(1, 'rgba(255,194,61,0)');
  g.fillStyle = lua; g.fillRect(0, 980, 320, 340);
  g.fillStyle = '#ffe3a3'; g.beginPath(); g.arc(150, 1150, 46, 0, TAU); g.fill();
  for (let x = -10; x < 1090;) {
    const w = 70 + rnd() * 110, h = 90 + rnd() * 150, y = 1920 - 130 - h * 0.5 - rnd() * 40;
    g.fillStyle = '#070912'; g.fillRect(x, y, w, 1920 - y);
    g.fillStyle = '#141a33'; g.fillRect(x, y, w, 4);
    for (let wy = y + 22; wy < 1900; wy += 34) for (let wx = x + 12; wx < x + w - 16; wx += 26) {
      if (rnd() < 0.22) { g.fillStyle = `rgba(255,194,61,${0.35 + rnd() * 0.4})`; g.fillRect(wx, wy, 12, 16); }
    }
    x += w + 4;
  }
}
const nuvens = Array.from({ length: 6 }, (_, i) => ({ x: i * 200, y: 520 + (i * 263) % 700, s: 0.7 + (i % 3) * 0.3 }));

/* ---------- estado ---------- */
let pipas = [];   // voando | caindo | saindo
let ataques = []; // linha de cerol indo de uma pipa até a outra
let raios = [];
let linhas = [];  // pedaços de linha soltos depois do corte
let textos = [];
const parts = [];
const placar = new Map();
let tempestade = 0, flash = 0, vento = 0;

const cortarNome = (nome, n = 13) => { const l = Array.from(nome); return l.length > n ? l.slice(0, n - 1).join('') + '…' : nome; };
const voando = () => pipas.filter(p => p.estado === 'voando');
const embaralhar = (l) => l.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]);

function matiz(user) {
  let h = 0;
  for (const ch of String(user)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

function soltar(x, y, n, { cor = '#fff', vel = 220, vida = 0.8, tam = 6, grav = 0, emoji = null } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = vel * (0.3 + Math.random() * 0.7);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, v: vida * (0.6 + Math.random() * 0.4), m: vida,
      cor: Array.isArray(cor) ? cor[Math.floor(Math.random() * cor.length)] : cor, tam, grav, emoji });
  }
  if (parts.length > 600) parts.splice(0, parts.length - 600);
}

function texto(x, y, txt, cor) { textos.push({ x, y, txt, cor, v: 1.4 }); if (textos.length > 30) textos.shift(); }

// lugar no céu longe das outras pipas (melhor de 14 sorteios)
function lugarLivre() {
  const outras = voando();
  let melhor = null, md = -1;
  for (let i = 0; i < 14; i++) {
    const x = 110 + Math.random() * 860, y = 500 + Math.random() * 780;
    const d = Math.min(9999, ...outras.map(p => Math.hypot(p.hx - x, (p.hy - y) * 1.3)));
    if (d > md) { md = d; melhor = { x, y }; }
  }
  return melhor;
}

function soltarPipa(ev) {
  const agora = performance.now();
  let p = pipas.find(k => k.user === ev.user && k.estado === 'voando');
  if (p) { p.ultimo = agora; p.pulo = 1; if (ev.foto) p.fotoUrl = ev.foto; return p; }
  const vivas = voando();
  if (vivas.length >= MAX) vivas.sort((a, b) => a.ultimo - b.ultimo)[0].estado = 'saindo';
  const { x, y } = lugarLivre();
  const h = matiz(ev.user);
  const nome = String(ev.nome || ev.user);
  p = { user: ev.user, nome, fotoUrl: ev.foto, cor: `hsl(${h} 95% 60%)`, cor2: `hsl(${(h + 45) % 360} 95% 72%)`,
    hx: x, hy: y, x, y: CHAO, ax: Math.min(1040, Math.max(40, 540 + (x - 540) * 0.6 + (Math.random() - 0.5) * 160)),
    fase: Math.random() * TAU, tam: 1, escudo: 0, estado: 'voando', ultimo: agora, subida: 0, pulo: 0,
    alfa: 1, rot: 0, inc: 0, vx: 0, vy: 0, vr: 0, alvejado: false };
  pipas.push(p);
  avisar(html`🪁 <b>${nome}</b> soltou a pipa`);
  return p;
}

function marcar(autor) {
  const r = placar.get(autor.user) ?? { nome: autor.nome, n: 0 };
  r.n++; r.nome = autor.nome;
  placar.set(autor.user, r);
  mostrarPlacar();
}

function cortar(alvo, autor, forcar = false) {
  alvo.alvejado = false;
  if (alvo.estado !== 'voando') return;
  if (alvo.escudo > 0 && !forcar) {
    alvo.escudo--; alvo.tam = Math.max(1, alvo.tam - 0.08);
    soltar(alvo.x, alvo.y, 18, { cor: '#3df2c2', vel: 260 });
    texto(alvo.x, alvo.y - 60, '🛡️ AGUENTOU!', '#3df2c2');
    return;
  }
  alvo.estado = 'caindo';
  alvo.vx = (Math.random() - 0.5) * 120; alvo.vy = -80; alvo.vr = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3);
  linhas.push({ ax: alvo.ax, x: alvo.x, y: alvo.y + 20, v: 1.2 });
  soltar(alvo.x, alvo.y, 26, { cor: [alvo.cor, alvo.cor2, '#fff'], vel: 340, vida: 0.9, tam: 7 });
  texto(alvo.x, alvo.y - 70, '✂️ CORTOU!', '#ff3d7f');
  marcar(autor);
}

function mostrarPlacar() {
  const top = [...placar.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  if (!top.length) {
    const li = document.createElement('li'); li.className = 'vazio';
    li.textContent = 'Ninguém cortou ainda. Mande um presente e corte a primeira!';
    return $('placar').replaceChildren(li);
  }
  $('placar').replaceChildren(...top.map((r, i) => {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = `${i + 1}º`;
    const s = document.createElement('span'); s.textContent = r.nome;
    const e = document.createElement('em'); e.textContent = `✂ ${r.n}`;
    li.append(b, s, e);
    return li;
  }));
}

/* ---------- eventos ---------- */
function aoEvento(ev) {
  if (!ev.user) return;
  if (ev.tipo === 'comentario') return void soltarPipa(ev);
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao) return;
  const p = soltarPipa(ev);
  const q = Math.max(1, ev.quantidade | 0);
  const autor = { user: p.user, nome: p.nome };
  if (acao === 'crescer') {
    p.tam = Math.min(1.7, p.tam + 0.1 * q);
    p.escudo = Math.min(ESCUDO_MAX, p.escudo + q);
    soltar(p.x, p.y, 3 + q * 2, { emoji: '🌹', vel: 240, vida: 1.1, tam: 34 });
    avisar(html`🌹 <b>${p.nome}</b> reforçou a pipa <span class="mais">🛡️×${p.escudo}</span>`);
  } else if (acao === 'tempestade') {
    const rivais = embaralhar(voando().filter(k => k !== p && !k.alvejado));
    const n = Math.ceil(rivais.length * (1 - 0.5 ** q));
    tempestade = Math.min(8, tempestade + 2.5 + n * 0.15);
    rivais.slice(0, n).forEach((alvo, i) => { alvo.alvejado = true; raios.push({ alvo, autor, t: -(0.4 + i * 0.16), pts: null }); });
    avisar(html`⛈️ <b>${p.nome}</b> chamou a TEMPESTADE! <span class="mais">−${n} ${n === 1 ? 'pipa' : 'pipas'}</span>`);
  } else {
    const n = (cfg.cortes?.[acao] ?? 1) * q;
    const alvos = embaralhar(voando().filter(k => k !== p && !k.alvejado)).slice(0, n);
    if (!alvos.length) return avisar(html`✂️ <b>${p.nome}</b> afiou a linha… mas não há rivais no céu`);
    alvos.forEach((alvo, i) => { alvo.alvejado = true; ataques.push({ de: p, alvo, autor, t: -i * 0.28, dur: 0.5 }); });
    avisar(html`✂️ <b>${p.nome}</b> vai cortar <span class="mais">${alvos.length} ${alvos.length === 1 ? 'pipa' : 'pipas'}</span>`);
  }
}

/* ---------- loop ---------- */
function zigue(x0, y0, x1, y1) {
  const pts = [[x0, y0]];
  for (let i = 1; i < 9; i++) { const f = i / 9; pts.push([x0 + (x1 - x0) * f + (Math.random() - 0.5) * 90, y0 + (y1 - y0) * f]); }
  pts.push([x1, y1]);
  return pts;
}

function atualizar(dt, t) {
  vento = Math.sin(t * 0.33) * 55 + Math.sin(t * 0.91 + 1) * 20 + (tempestade > 0 ? Math.sin(t * 3) * 40 : 0);
  for (const p of pipas) {
    if (p.estado === 'voando') {
      p.subida = Math.min(1, p.subida + dt / 1.4);
      p.pulo = Math.max(0, p.pulo - dt * 2);
      const e = 1 - (1 - p.subida) ** 3;
      p.x = p.hx + vento * (0.5 + p.hy / 2600) + Math.sin(t * 1.2 + p.fase) * 18;
      const alvoY = p.hy + Math.sin(t * 1.6 + p.fase * 1.3) * 14 - Math.sin(p.pulo * Math.PI) * 50;
      p.y = CHAO + (alvoY - CHAO) * e;
      p.inc = vento * 0.004 + Math.sin(t * 1.2 + p.fase) * 0.09;
    } else if (p.estado === 'caindo') {
      p.vy = Math.min(p.vy + 320 * dt, 520);
      p.x += (p.vx + vento * 0.8) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > 1700) p.alfa -= dt * 2;
    } else {
      p.y -= 140 * dt; p.alfa -= dt * 1.4;
    }
  }
  pipas = pipas.filter(p => p.alfa > 0 && p.y < 2100);

  for (const a of ataques) {
    a.t += dt;
    if (a.t >= 0 && a.t < a.dur) {
      const f = a.t / a.dur;
      soltar(a.de.x + (a.alvo.x - a.de.x) * f, a.de.y + (a.alvo.y - a.de.y) * f, 1, { cor: ['#ff3d7f', '#ffc23d'], vel: 80, vida: 0.4, tam: 5 });
    }
    if (a.t >= a.dur) cortar(a.alvo, a.autor);
  }
  ataques = ataques.filter(a => a.t < a.dur);

  for (const r of raios) {
    r.t += dt;
    if (r.t >= 0 && !r.pts) { r.pts = zigue(r.alvo.x + (Math.random() - 0.5) * 300, 0, r.alvo.x, r.alvo.y); flash = 1; cortar(r.alvo, r.autor, true); }
  }
  raios = raios.filter(r => r.t < 0.35);

  tempestade = Math.max(0, tempestade - dt);
  flash = Math.max(0, flash - dt * 3);
  linhas = linhas.filter(l => (l.v -= dt) > 0);
  textos = textos.filter(x => (x.v -= dt) > 0);
  for (const n of nuvens) { n.x += (18 + vento * 0.25) * dt * n.s; if (n.x > 1250) n.x = -250; if (n.x < -260) n.x = 1240; }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if ((p.v -= dt) <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
    p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5;
  }
}

function avatar(x, y, r, p) {
  const img = foto(p.fotoUrl);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (img) { ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); }
  else {
    ctx.fillStyle = '#0b0d17'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `900 ${r * 1.15}px ${FONTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Array.from(p.nome)[0]?.toUpperCase() ?? '?', x, y + 2);
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
}

function desenharPipa(p, t) {
  const s = 46 * p.tam;
  ctx.globalAlpha = Math.max(0, p.alfa);
  // rabiola
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.inc + p.rot);
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 1.15 * s);
  const cauda = [];
  for (let i = 1; i <= 12; i++) {
    const cx = Math.sin(t * 4 + i * 0.55 + p.fase) * i * 2.2 - vento * 0.04 * i, cy = 1.15 * s + i * 13 * p.tam;
    cauda.push([cx, cy]); ctx.lineTo(cx, cy);
  }
  ctx.stroke();
  ctx.fillStyle = p.cor2;
  for (let i = 2; i < 12; i += 3) {
    const [cx, cy] = cauda[i];
    ctx.beginPath(); ctx.moveTo(cx - 12, cy - 7); ctx.lineTo(cx + 12, cy + 7); ctx.lineTo(cx + 12, cy - 7); ctx.lineTo(cx - 12, cy + 7); ctx.fill();
  }
  // corpo em losango, duas cores
  if (p.escudo) { ctx.shadowColor = '#3df2c2'; ctx.shadowBlur = 14 + p.escudo * 6; }
  ctx.fillStyle = p.cor;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(-0.85 * s, -0.2 * s); ctx.lineTo(0, 1.15 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = p.cor2;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0.85 * s, -0.2 * s); ctx.lineTo(0, 1.15 * s); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0.85 * s, -0.2 * s); ctx.lineTo(0, 1.15 * s); ctx.lineTo(-0.85 * s, -0.2 * s); ctx.closePath();
  ctx.lineWidth = p.escudo ? 3 + p.escudo : 3; ctx.strokeStyle = p.escudo ? '#3df2c2' : 'rgba(255,255,255,.85)'; ctx.stroke();
  ctx.strokeStyle = 'rgba(11,13,23,.55)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, 1.15 * s); ctx.moveTo(-0.85 * s, -0.2 * s); ctx.lineTo(0.85 * s, -0.2 * s); ctx.stroke();
  ctx.restore();
  avatar(p.x, p.y - 0.1 * s, 0.34 * s, p);
  ctx.globalAlpha = 1;
}

function etiqueta(p) {
  const txt = cortarNome(p.nome) + (p.escudo ? ` 🛡️${p.escudo}` : '');
  const y = p.y - 46 * p.tam - 30;
  ctx.globalAlpha = Math.max(0, Math.min(1, p.alfa));
  ctx.font = `800 28px ${FONTE}`;
  const w = ctx.measureText(txt).width + 26;
  ctx.fillStyle = 'rgba(8,10,20,.82)';
  ctx.beginPath(); ctx.roundRect(p.x - w / 2, y - 20, w, 40, 20); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = p.cor; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(txt, p.x, y + 1);
  ctx.globalAlpha = 1;
}

function desenhar(t) {
  ctx.clearRect(0, 0, 1080, 1920);
  for (const n of nuvens) {
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (const [dx, dy, r] of [[0, 0, 70], [70, -20, 90], [150, 0, 70], [75, 25, 80]]) {
      ctx.beginPath(); ctx.ellipse(n.x + dx * n.s, n.y + dy * n.s, r * n.s * 1.3, r * n.s * 0.6, 0, 0, TAU); ctx.fill();
    }
  }
  ctx.drawImage(cena, 0, 0);
  const vivas = voando().sort((a, b) => a.hy - b.hy);
  // linhas presas nos telhados
  ctx.lineWidth = 2;
  for (const p of vivas) {
    ctx.strokeStyle = p.escudo ? 'rgba(61,242,194,.55)' : 'rgba(255,255,255,.32)';
    ctx.beginPath(); ctx.moveTo(p.ax, CHAO);
    ctx.quadraticCurveTo((p.ax + p.x) / 2 + 50 + vento * 0.4, (CHAO + p.y) / 2 + 90, p.x, p.y + 10);
    ctx.stroke();
  }
  for (const l of linhas) {
    const queda = (1.2 - l.v) * 500;
    ctx.strokeStyle = `rgba(255,255,255,${0.32 * l.v / 1.2})`;
    ctx.beginPath(); ctx.moveTo(l.ax, CHAO);
    ctx.quadraticCurveTo((l.ax + l.x) / 2 + 80, (CHAO + l.y) / 2 + 200 + queda, l.x + 40, Math.min(CHAO, l.y + queda));
    ctx.stroke();
  }
  for (const p of pipas) if (p.estado !== 'voando') desenharPipa(p, t);
  for (const p of vivas) desenharPipa(p, t);
  for (const p of vivas) etiqueta(p);
  // cerol: linha brilhante indo até a pipa alvo
  for (const a of ataques) {
    if (a.t < 0) continue;
    const f = Math.min(1, a.t / a.dur);
    ctx.save();
    ctx.shadowColor = '#ff3d7f'; ctx.shadowBlur = 24; ctx.strokeStyle = '#ffd1e0'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(a.de.x, a.de.y);
    ctx.lineTo(a.de.x + (a.alvo.x - a.de.x) * f, a.de.y + (a.alvo.y - a.de.y) * f); ctx.stroke();
    ctx.restore();
  }
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.v / p.m);
    if (p.emoji) { ctx.font = `${p.tam}px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.emoji, p.x, p.y); }
    else { ctx.fillStyle = p.cor; ctx.beginPath(); ctx.arc(p.x, p.y, p.tam * (0.4 + 0.6 * p.v / p.m), 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  if (tempestade > 0) {
    const k = Math.min(1, tempestade);
    ctx.fillStyle = `rgba(4,5,14,${0.45 * k})`; ctx.fillRect(0, 0, 1080, 1920);
    ctx.strokeStyle = `rgba(160,190,255,${0.35 * k})`; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const x = ((i * 137 + t * 260) % 1240) - 80, y = ((i * 251 + t * 1700) % 2000) - 40;
      ctx.moveTo(x, y); ctx.lineTo(x - 14, y + 46);
    }
    ctx.stroke();
  }
  for (const r of raios) {
    if (!r.pts) continue;
    ctx.save();
    ctx.shadowColor = '#b9c8ff'; ctx.shadowBlur = 30; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
    ctx.globalAlpha = Math.max(0, 1 - r.t / 0.35);
    ctx.beginPath(); r.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.restore();
  }
  if (flash > 0) { ctx.fillStyle = `rgba(220,230,255,${flash * 0.35})`; ctx.fillRect(0, 0, 1080, 1920); }
  for (const x of textos) {
    ctx.globalAlpha = Math.min(1, x.v);
    ctx.font = `900 40px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#0b0d17'; ctx.strokeText(x.txt, x.x, x.y - (1.4 - x.v) * 60);
    ctx.fillStyle = x.cor; ctx.fillText(x.txt, x.x, x.y - (1.4 - x.v) * 60);
  }
  ctx.globalAlpha = 1;
  if (!vivas.length && !pipas.length) {
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 4);
    ctx.fillStyle = '#3df2c2'; ctx.font = `900 60px ${FONTE}`; ctx.textAlign = 'center';
    ctx.fillText('COMENTE E SOLTE', 540, 900); ctx.fillText('A SUA PIPA! 🪁', 540, 975);
    ctx.globalAlpha = 1;
  }
}

let antes = performance.now();
function quadro(agora) {
  const dt = Math.min(0.05, (agora - antes) / 1000);
  antes = agora;
  atualizar(dt, agora / 1000);
  desenhar(agora / 1000);
  requestAnimationFrame(quadro);
}

/* ---------- teclas de teste ---------- */
const NICKS_TESTE = ['ana.voa', 'beto_rx', 'cami.zz', 'davi.mp4', 'eli_jogos', 'fefe.art', 'gui.k', 'hana__', 'igor.tt', 'juju.lima', 'lari.vlog', 'nina.fps'];
function presenteFalso(acao, user) {
  const ref = cfg.acoes?.[acao]?.[0];
  if (ref === undefined) return null;
  const q = 1 + Math.floor(Math.random() * 3);
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

teclas({
  t: rajada,
  r: () => { pipas = []; ataques = []; raios = []; linhas = []; textos = []; parts.length = 0; placar.clear(); tempestade = 0; mostrarPlacar(); }
});

mostrarPlacar();
requestAnimationFrame(quadro);
conectar(aoEvento);
