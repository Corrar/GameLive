import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
aplicarFundo(cfg.fundo);
escalarPalco(palco);
const avisar = avisos($('avisos'), { max: 3 });
const canvas = $('tela');
const ctx = canvas.getContext('2d');

const META = cfg.meta ?? 1000000;
const DPS = cfg.distanciaPorSegundo ?? 700;
const TURVA = cfg.turvaSegundos ?? 6, CAOS = cfg.caosSegundos ?? 8, FATOR = cfg.caosFator ?? 0.55;
const RAIO = cfg.rosquinhaRaio ?? 180;
const W = 1080, CHAO = 1640, BX = 330, R = 30;
const G = 2500, PULO = -860, VEL = 440, ESPAC = 560, LARG = 170, VAO = 450;
const MIN_C = 640, MAX_C = 1360;   // centro dos vãos fica abaixo do HUD e acima do chão
const PASSO = 1 / 120;
const r = (a, b) => a + Math.random() * (b - a);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.floor(n).toLocaleString('pt-BR');

let t = 0, camX = 0, dist = 0, estado = 'voando', caiuT = 0;
let ave, obst = [], fila = [], penas = [];
let ultimoX = 0, ultimoCentro = 1000;
let turvaAte = 0, turvaAutor = null, caosAte = 0, caosAutor = null;
let ruido = 0, ruidoAte = 0, iaEspera = 0, tremor = 0, flash = 0;
let recorde = lembrar('voo:recorde', 0);
if (!Number.isFinite(recorde)) recorde = 0;
let recordeSalvo = recorde;

function reiniciar() {
  estado = 'voando';
  dist = 0;
  obst = [];
  ultimoX = camX + W - 200;
  ultimoCentro = 1000;
  ave = { y: 1000, vy: PULO * 0.6, asa: 0 };
}

/* ---------- mundo ---------- */

const roscaY = (o) => o.y0 + Math.sin(t * 1.9 + o.fase) * o.amp;

function gerar() {
  const esp = fila.shift();
  const caos = t < caosAte;
  if (esp?.tipo === 'rosquinha') {
    obst.push({ tipo: 'rosquinha', x: ultimoX + 620, y0: 1000, amp: 230, fase: r(0, 6), r: RAIO, autor: esp.autor, giro: r(0, 6) });
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
  if (!o) return 1000;
  if (o.tipo === 'cano') return o.centro + Math.min(65, o.vao * 0.15);
  const ry = roscaY(o);
  o.lado ??= ry > o.y0 ? -1 : 1;   // escolhe o lado uma vez: por cima (-1) ou por baixo (1)
  return limitar(ry + o.lado * (o.r + 130), 150, CHAO - 150);
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
  const quem = autor ?? (t < caosAte ? caosAutor : t < turvaAte ? turvaAutor : null);
  const cores = ['#ffc23d', '#ff3d7f', '#fff', '#ffe08a'];
  for (let k = 0; k < 46; k++) {
    const a = Math.random() * Math.PI * 2, v = r(150, 900);
    penas.push({ x: camX + BX, y: ave.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, rot: r(0, 6), vr: r(-8, 8), vida: r(1.6, 2.6), cor: cores[k % 4] });
  }
  if (penas.length > 200) penas.splice(0, penas.length - 200);
  tremor = 42;
  flash = 0.8;
  salvarRecorde();

  document.querySelector('.queda')?.remove();
  const q = document.createElement('div');
  q.className = 'queda';
  const titulo = document.createElement('small');
  titulo.textContent = quem ? '💥 DERRUBADO POR' : '💥 BATEU!';
  q.append(titulo, quem ?? 'a IA vacilou');
  palco.appendChild(q);
  setTimeout(() => q.remove(), 2500);
  $('ultima').textContent = quem ? `💥 derrubado por ${quem} aos ${fmt(dist)}` : `💥 a IA bateu sozinha aos ${fmt(dist)}`;
}

function salvarRecorde() {
  if (recorde !== recordeSalvo) { guardar('voo:recorde', recorde); recordeSalvo = recorde; }
}

function chegouNaMeta() {
  const v = document.createElement('div');
  v.className = 'vencedor';
  const s = document.createElement('small');
  s.textContent = 'A IA chegou na meta!';
  v.append(s, fmt(META));
  palco.appendChild(v);
  setTimeout(() => v.remove(), 5000);
  dist = 0;
}

/* ---------- passo da simulação ---------- */

function passo(dt) {
  t += dt;
  if (estado === 'voando') {
    camX += VEL * dt;
    dist += DPS * dt;
    if (dist > recorde) recorde = Math.min(META, dist);
    if (dist >= META) chegouNaMeta();
    while (ultimoX + ESPAC < camX + W + 300) gerar();
    ia(dt);
    ave.vy = Math.min(ave.vy + G * dt, 1300);
    ave.y += ave.vy * dt;
    if (ave.y < R) { ave.y = R; ave.vy = 0; }
    ave.asa = Math.max(0, ave.asa - dt);
    // caos aperta os vãos que ainda estão à frente do pássaro
    for (const o of obst) {
      if (o.tipo !== 'cano' || o.x < camX + BX + 80) continue;
      const alvo = t < caosAte ? VAO * FATOR : VAO;
      o.vao += (alvo - o.vao) * Math.min(1, dt * 3);
    }
    colisao();
  } else {
    caiuT += dt;
    if (caiuT > 1.9) reiniciar();
  }
  obst = obst.filter(o => o.x + 400 > camX);
  for (const p of penas) {
    p.vx *= 1 - 2 * dt; p.vy = p.vy * (1 - 2 * dt) + 500 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vida -= dt;
  }
  penas = penas.filter(p => p.vida > 0);
  tremor = Math.max(0, tremor - dt * 60);
  flash = Math.max(0, flash - dt * 2);
}

/* ---------- desenho ---------- */

const ruidoH = (k) => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const ESTRELAS = Array.from({ length: 110 }, (_, i) => ({ x: ruidoH(i) * 1080, y: ruidoH(i + 300) * 1300, s: 1 + ruidoH(i + 700) * 3 }));
const UM_PRA_UM = { cano: '🌹', turva: '😎', rosquinha: '🍩', caos: '🌌' };

function cidade(par, base, cor, larg, alt, janelas) {
  const off = camX * par;
  const i0 = Math.floor(off / larg) - 1;
  ctx.fillStyle = cor;
  for (let i = i0; i < i0 + Math.ceil(W / larg) + 3; i++) {
    const h = alt * (0.4 + ruidoH(i * 3.1 + base) * 0.6);
    const x = i * larg - off;
    ctx.fillRect(x, CHAO - h, larg - 12, h);
    if (janelas) {
      ctx.fillStyle = 'rgba(255,194,61,.55)';
      for (let jy = CHAO - h + 24; jy < CHAO - 30; jy += 46) {
        for (let jx = 16; jx < larg - 40; jx += 34) if (ruidoH(i * 13 + jy * 0.7 + jx) > 0.62) ctx.fillRect(x + jx, jy, 12, 18);
      }
      ctx.fillStyle = cor;
    }
  }
}

function desenharCano(o) {
  const x = o.x - camX;
  if (x > W + 60 || x + LARG < -60) return;
  const cima = o.centro - o.vao / 2, baixo = o.centro + o.vao / 2;
  const cor = o.autor ? '#ff3d7f' : '#3df2c2';
  const g = ctx.createLinearGradient(x, 0, x + LARG, 0);
  g.addColorStop(0, '#0b0d17'); g.addColorStop(0.12, cor); g.addColorStop(0.35, '#ffffff'); g.addColorStop(0.5, cor); g.addColorStop(1, '#0b0d17');
  ctx.fillStyle = g;
  ctx.fillRect(x, -10, LARG, cima + 10);
  ctx.fillRect(x, baixo, LARG, CHAO - baixo);
  const apertado = o.vao < VAO * 0.9;
  ctx.fillStyle = apertado ? '#ffc23d' : g;
  ctx.fillRect(x - 16, cima - 50, LARG + 32, 50);
  ctx.fillRect(x - 16, baixo, LARG + 32, 50);
  ctx.lineWidth = 6; ctx.strokeStyle = '#0b0d17';
  ctx.strokeRect(x - 16, cima - 50, LARG + 32, 50);
  ctx.strokeRect(x - 16, baixo, LARG + 32, 50);
  if (o.autor) {
    ctx.save();
    ctx.translate(x + LARG / 2, (cima - 50) / 2 + 30);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '900 46px "Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0b0d17';
    ctx.fillText('🌹 ' + String(o.autor).slice(0, 14), 0, 0);
    ctx.restore();
  }
}

function desenharRosquinha(o) {
  const x = o.x - camX, y = roscaY(o), rr = o.r;
  if (x > W + rr || x < -rr) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.giro + t * 0.8);
  ctx.fillStyle = '#d98a3d';
  ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.arc(0, 0, rr * 0.34, 0, Math.PI * 2, true); ctx.fill();
  ctx.fillStyle = '#ff3d7f';
  ctx.beginPath();
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * Math.PI * 2, rad = rr * (0.86 + Math.sin(a * 9) * 0.05);
    k ? ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.arc(0, 0, rr * 0.44, 0, Math.PI * 2, true);
  ctx.fill();
  const granulado = ['#3df2c2', '#ffc23d', '#fff', '#5b8cff'];
  for (let k = 0; k < 26; k++) {
    const a = ruidoH(k) * Math.PI * 2, d = rr * (0.52 + ruidoH(k + 40) * 0.28);
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(ruidoH(k + 80) * 6);
    ctx.fillStyle = granulado[k % 4]; ctx.fillRect(-12, -4, 24, 8); ctx.restore();
  }
  ctx.restore();
  ctx.font = '900 40px "Segoe UI",system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = '#0b0d17'; ctx.fillStyle = '#fff';
  const nome = '🍩 ' + String(o.autor ?? '').slice(0, 14);
  ctx.strokeText(nome, x, y - rr - 34); ctx.fillText(nome, x, y - rr - 34);
}

function desenharAve() {
  ctx.save();
  ctx.translate(BX, ave.y);
  ctx.rotate(limitar(ave.vy / 1100, -0.45, 1.1));
  ctx.fillStyle = '#ff3d7f';
  ctx.beginPath(); ctx.moveTo(-36, -4); ctx.lineTo(-64, -22); ctx.lineTo(-58, 4); ctx.lineTo(-66, 20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffc23d';
  ctx.beginPath(); ctx.ellipse(0, 0, 46, 38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffe9b0';
  ctx.beginPath(); ctx.ellipse(6, 14, 28, 18, 0, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#0b0d17';
  ctx.beginPath(); ctx.ellipse(0, 0, 46, 38, 0, 0, Math.PI * 2); ctx.stroke();
  const bate = ave.asa > 0 ? Math.sin(t * 40) * 0.8 : 0.25;
  ctx.save(); ctx.translate(-14, 6); ctx.rotate(bate);
  ctx.fillStyle = '#ff3d7f';
  ctx.beginPath(); ctx.ellipse(-12, -4, 26, 13, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(20, -13, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b0d17';
  ctx.beginPath(); ctx.arc(25, -12, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff7a3d';
  ctx.beginPath(); ctx.moveTo(38, -4); ctx.lineTo(68, 4); ctx.lineTo(38, 14); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function desenhar() {
  const g = ctx.createLinearGradient(0, 0, 0, CHAO);
  g.addColorStop(0, '#0b0d17'); g.addColorStop(0.6, '#1c2150'); g.addColorStop(1, '#4a2a6a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 1920);
  ctx.fillStyle = '#fff';
  for (const e of ESTRELAS) {
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 2 + e.x);
    ctx.fillRect(((e.x - camX * 0.03) % W + W) % W, e.y, e.s, e.s);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff3c9';
  ctx.beginPath(); ctx.arc(820, 560, 90, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200,180,120,.35)';
  for (const [cx, cy, cr] of [[790, 530, 18], [850, 590, 24], [800, 610, 10]]) { ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); }

  cidade(0.12, 1, '#23285a', 130, 520, false);
  cidade(0.3, 7, '#151936', 110, 380, true);

  ctx.save();
  if (tremor > 0) ctx.translate(r(-tremor, tremor), r(-tremor, tremor) * 0.6);

  for (const o of obst) o.tipo === 'cano' ? desenharCano(o) : desenharRosquinha(o);

  // chão
  ctx.fillStyle = '#1f5e4f'; ctx.fillRect(-60, CHAO, W + 120, 1920 - CHAO + 60);
  ctx.fillStyle = '#3df2c2'; ctx.fillRect(-60, CHAO, W + 120, 14);
  ctx.fillStyle = 'rgba(11,13,23,.35)';
  for (let x = -((camX * 1) % 90); x < W + 90; x += 90) {
    ctx.beginPath(); ctx.moveTo(x, CHAO + 14); ctx.lineTo(x + 45, CHAO + 14); ctx.lineTo(x + 15, CHAO + 60); ctx.lineTo(x - 30, CHAO + 60); ctx.fill();
  }

  if (estado === 'voando') desenharAve();
  for (const p of penas) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.vida);
    ctx.translate(p.x - camX, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.cor;
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(11,13,23,.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(22, 0); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  if (t < caosAte) {
    ctx.fillStyle = `rgba(176,107,255,${0.12 + 0.08 * Math.sin(t * 8)})`;
    ctx.fillRect(0, 0, W, 1920);
  }
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`; ctx.fillRect(0, 0, W, 1920); }
}

/* ---------- HUD ---------- */

let filtro = '';
function atualizarHud() {
  const d = fmt(dist);
  if ($('dist').textContent !== d) $('dist').textContent = d;
  const rc = fmt(recorde);
  if ($('recorde').textContent !== rc) $('recorde').textContent = rc;
  $('progresso').style.width = (dist / META * 100).toFixed(2) + '%';
  const f = t < turvaAte ? 'blur(18px) saturate(1.4)' : '';
  if (f !== filtro) canvas.style.filter = filtro = f;
}

function atualizarEfeitos() {
  const chips = [];
  if (t < turvaAte) chips.push([`😎 TURVA ${Math.ceil(turvaAte - t)}s`, '#ffc23d']);
  if (t < caosAte) chips.push([`🌌 CAOS ${Math.ceil(caosAte - t)}s`, '#b06bff']);
  const canos = fila.filter(f => f.tipo === 'cano').length, roscas = fila.length - canos;
  if (canos) chips.push([`🌹 +${canos} ${canos === 1 ? 'cano' : 'canos'}`, '#ff3d7f']);
  if (roscas) chips.push([`🍩 +${roscas}`, '#ff3d7f']);
  $('efeitos').replaceChildren(...chips.map(([texto, cor]) => {
    const d = document.createElement('div');
    d.textContent = texto; d.style.background = cor;
    return d;
  }));
  salvarRecorde();
}

/* ---------- eventos ---------- */

const ROTULOS = { cano: 'cano extra', turva: 'visão turva', rosquinha: 'rosquinha gigante', caos: 'caos (vãos menores)' };

function aoEvento(ev) {
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao || !ROTULOS[acao]) return;
  const q = Math.max(1, Math.min(30, Math.floor(ev.quantidade) || 1));
  const quem = ev.nome || ev.user || 'alguém';
  if (acao === 'cano' || acao === 'rosquinha') {
    for (let k = 0; k < q; k++) fila.push({ tipo: acao, autor: quem });
    if (fila.length > 40) fila.splice(0, fila.length - 40);
  } else if (acao === 'turva') {
    turvaAte = Math.min(Math.max(turvaAte, t) + TURVA * q, t + 30);
    turvaAutor = quem;
  } else {
    caosAte = Math.min(Math.max(caosAte, t) + CAOS * q, t + 40);
    caosAutor = quem;
  }
  const efeito = acao === 'cano' ? `+${q} ${q === 1 ? 'cano' : 'canos'}` : acao === 'rosquinha' ? `${q}× rosquinha gigante`
    : acao === 'turva' ? `visão turva ${Math.round(turvaAte - t)}s` : `caos ${Math.round(caosAte - t)}s`;
  avisar(html`<span>${UM_PRA_UM[acao]} <b>${quem}</b> ${q}× ${ev.presenteNome} → <span class="mais">${efeito}</span></span>`);
  atualizarEfeitos();
}

/* ---------- início ---------- */

for (const [acao, refs] of Object.entries(cfg.acoes ?? {})) {
  if (!ROTULOS[acao]) continue;
  const chip = document.createElement('div');
  const nome = document.createElement('i');
  nome.textContent = refs.map(x => (typeof x === 'number' ? '#' + x : x)).join(' / ');
  chip.append(`${UM_PRA_UM[acao]} `, nome, ` ${ROTULOS[acao]}`);
  $('legenda').appendChild(chip);
}
$('meta').textContent = 'meta ' + fmt(META);
$('ultima').textContent = 'a IA voa sozinha · o chat tenta derrubar';

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
  r: () => { fila = []; turvaAte = caosAte = 0; penas = []; reiniciar(); $('ultima').textContent = 'voo reiniciado'; }
});

reiniciar();
setInterval(atualizarEfeitos, 250);
let antes = performance.now(), acumulado = 0;
function quadro(agora) {
  acumulado += Math.min(0.1, (agora - antes) / 1000);
  antes = agora;
  while (acumulado >= PASSO) { passo(PASSO); acumulado -= PASSO; }
  desenhar();
  atualizarHud();
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);
conectar(aoEvento);
