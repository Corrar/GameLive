import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  guardar, lembrar, teclas, eventoFalso, foto } from '../kit/kit.js';
import { emojiDoPresente, criarCombo, criarRanking, corDoNick, iniciais, avatar, animar, particulas,
  flutuar, tremer, confete, pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
aplicarFundo(cfg.fundo);
escalarPalco(palco);
ligarSom(cfg.som);
const cenario = cfg.fundo !== 'transparente' && cfg.cenario !== false;
const avisar = avisos($('avisos'), { max: 2 });
const canvas = $('tela');
const ctx = canvas.getContext('2d');

const META = cfg.meta ?? 1000000;
const DPS = cfg.distanciaPorSegundo ?? 700;
const TURVA = cfg.turvaSegundos ?? 6, CAOS = cfg.caosSegundos ?? 8, FATOR = cfg.caosFator ?? 0.55;
const RAIO = cfg.rosquinhaRaio ?? 180;
const MARCO = cfg.marcoDistancia ?? 100000;
const BONUS_QUEDA = cfg.pontosPorQueda ?? 5;
const W = 1080, H = 1920, CHAO = 1560, BX = 330, R = 30, TETO = 380;
const G = 2500, PULO = -860, VEL = 440, ESPAC = 560, LARG = 170, VAO = 450;
const MIN_C = 740, MAX_C = 1290, MEIO = (MIN_C + MAX_C) / 2;   // vãos entre o HUD e o chão
const PASSO = 1 / 120;
const FONTE = '"Lilita One","Baloo 2",Impact,sans-serif';
const r = (a, b) => a + Math.random() * (b - a);
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => Math.floor(n).toLocaleString('pt-BR');

let t = 0, camX = 0, dist = 0, estado = 'voando', caiuT = 0;
let ave, obst = [], fila = [], penas = [];
let ultimoX = 0, ultimoCentro = MEIO;
let turvaAte = 0, turvaAutor = null, caosAte = 0, caosAutor = null;
let ruido = 0, ruidoAte = 0, iaEspera = 0, tremor = 0, flash = 0, raio = 0;
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
  const cores = ['#ffd23f', '#ff3d7f', '#fff', '#ffe08a', '#ff9f3d'];
  for (let k = 0; k < 60; k++) {
    const a = Math.random() * Math.PI * 2, v = r(200, 1000);
    penas.push({ x: camX + BX, y: ave.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 250, rot: r(0, 6), vr: r(-9, 9), vida: r(1.8, 3), cor: cores[k % cores.length], tam: r(0.7, 1.4) });
  }
  if (penas.length > 240) penas.splice(0, penas.length - 240);
  ave.vy = -720;
  tremor = 46;
  flash = 0.9;
  salvarRecorde();
  tocar('impacto');
  tremer(palco, true);
  particulas(palco, { x: BX, y: ave.y, emoji: '🪶', qtd: 8, forca: 1.2 });

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
  confete(palco);
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
  for (const p of penas) {
    p.vx *= 1 - 2 * dt; p.vy = p.vy * (1 - 2 * dt) + 500 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vida -= dt;
  }
  penas = penas.filter(p => p.vida > 0);
  tremor = Math.max(t < caosAte ? 5 : 0, tremor - dt * 60);
  flash = Math.max(0, flash - dt * 2);
  raio = Math.max(0, raio - dt);
  if (t < caosAte && raio <= 0 && Math.random() < dt * 1.3) raio = 0.18;
}

/* ---------- cenário (parallax) ---------- */

const ruidoH = (k) => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const suave = (x) => Math.sin(x * 0.0021) * 0.5 + Math.sin(x * 0.0057 + 1.3) * 0.3 + Math.sin(x * 0.013 + 4) * 0.2;
const ESTRELAS = Array.from({ length: 60 }, (_, i) => ({ x: ruidoH(i) * W, y: ruidoH(i + 300) * 620, s: 2 + ruidoH(i + 700) * 3 }));

const CEU = ctx.createLinearGradient(0, 0, 0, CHAO);
CEU.addColorStop(0, '#24195e'); CEU.addColorStop(0.32, '#5a2c8c'); CEU.addColorStop(0.6, '#d6508f');
CEU.addColorStop(0.82, '#ff8f5a'); CEU.addColorStop(1, '#ffcf7a');
const SOL = ctx.createRadialGradient(760, 960, 40, 760, 960, 440);
SOL.addColorStop(0, 'rgba(255,248,214,1)'); SOL.addColorStop(0.22, 'rgba(255,224,140,.95)');
SOL.addColorStop(0.24, 'rgba(255,190,110,.45)'); SOL.addColorStop(1, 'rgba(255,150,90,0)');
const TERRA = ctx.createLinearGradient(0, CHAO, 0, H);
TERRA.addColorStop(0, '#7a4a2a'); TERRA.addColorStop(0.25, '#5c3420'); TERRA.addColorStop(1, '#2e1a14');

function montanhas(par, base, alt, escala, cor) {
  const off = camX * par;
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.moveTo(0, CHAO);
  for (let x = 0; x <= W + 30; x += 30) ctx.lineTo(x, base - alt * (0.55 + 0.45 * suave((x + off) * escala)));
  ctx.lineTo(W, CHAO);
  ctx.fill();
}

function nuvens(par, yBase, faixa, escala, alfa, larg) {
  const off = camX * par;
  const i0 = Math.floor(off / larg) - 1;
  ctx.globalAlpha = alfa;
  for (let i = i0; i < i0 + Math.ceil(W / larg) + 3; i++) {
    if (ruidoH(i * 7.7 + escala) < 0.25) continue;
    const x = i * larg - off + ruidoH(i * 3.3) * larg * 0.5, y = yBase + ruidoH(i * 5.1 + 2) * faixa;
    const s = escala * (0.7 + ruidoH(i * 9.9) * 0.6);
    ctx.fillStyle = '#ffd9e8';
    ctx.beginPath(); ctx.ellipse(x, y + 18 * s, 120 * s, 30 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    for (const [dx, dy, rr] of [[-70, 0, 46], [-15, -30, 62], [50, -12, 52], [95, 6, 36]]) {
      ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffd9e8';
    ctx.fillRect(x - 110 * s, y + 10 * s, 220 * s, 18 * s);
  }
  ctx.globalAlpha = 1;
}

function cidade(par, base, cor, larg, alt, janelas) {
  const off = camX * par;
  const i0 = Math.floor(off / larg) - 1;
  for (let i = i0; i < i0 + Math.ceil(W / larg) + 3; i++) {
    const h = alt * (0.4 + ruidoH(i * 3.1 + base) * 0.6);
    const x = i * larg - off;
    ctx.fillStyle = cor;
    ctx.fillRect(x, CHAO - h, larg - 12, h);
    if (ruidoH(i * 1.7 + base) > 0.6) ctx.fillRect(x + larg / 2 - 10, CHAO - h - 40, 6, 40);   // antena
    if (janelas) {
      ctx.fillStyle = 'rgba(255,214,120,.85)';
      for (let jy = CHAO - h + 24; jy < CHAO - 30; jy += 46) {
        for (let jx = 16; jx < larg - 40; jx += 34) if (ruidoH(i * 13 + jy * 0.7 + jx) > 0.6) ctx.fillRect(x + jx, jy, 12, 18);
      }
    }
  }
}

function arbustos(par) {
  const off = camX * par, larg = 150;
  const i0 = Math.floor(off / larg) - 1;
  for (let i = i0; i < i0 + Math.ceil(W / larg) + 3; i++) {
    const x = i * larg - off, s = 0.7 + ruidoH(i * 4.4) * 0.6;
    ctx.fillStyle = '#2f7a43';
    ctx.beginPath(); ctx.arc(x, CHAO, 70 * s, Math.PI, 0); ctx.arc(x + 70 * s, CHAO, 50 * s, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#4fae5a';
    ctx.beginPath(); ctx.arc(x - 10 * s, CHAO - 18 * s, 34 * s, 0, Math.PI * 2); ctx.fill();
  }
}

function desenharCenario() {
  ctx.fillStyle = CEU; ctx.fillRect(0, 0, W, CHAO);
  ctx.fillStyle = '#fff';
  for (const e of ESTRELAS) {
    ctx.globalAlpha = 0.3 + 0.35 * Math.sin(t * 2 + e.x);
    ctx.fillRect(((e.x - camX * 0.02) % W + W) % W, e.y, e.s, e.s);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = SOL; ctx.fillRect(300, 500, 780, 900);
  nuvens(0.04, 560, 260, 1.3, 0.55, 480);
  montanhas(0.08, 1260, 360, 1, '#8a3f8c');
  montanhas(0.16, 1360, 260, 1.6, '#6a2f78');
  cidade(0.26, 1, '#4a2366', 120, 360, false);
  cidade(0.42, 7, '#2c1647', 110, 260, true);
  arbustos(0.7);
}

/* ---------- obstáculos ---------- */

function corpoCano(x, y0, y1, claro, base, escuro) {
  const g = ctx.createLinearGradient(x, 0, x + LARG, 0);
  g.addColorStop(0, escuro); g.addColorStop(0.18, base); g.addColorStop(0.32, claro); g.addColorStop(0.55, base); g.addColorStop(1, escuro);
  ctx.fillStyle = g;
  ctx.fillRect(x, y0, LARG, y1 - y0);
  ctx.lineWidth = 6; ctx.strokeStyle = '#1a1030';
  ctx.strokeRect(x, y0, LARG, y1 - y0);
  return g;
}

function tampa(x, y, g, cor) {
  ctx.fillStyle = cor ?? g;
  ctx.beginPath(); ctx.roundRect(x - 18, y, LARG + 36, 56, 10); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#1a1030'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x, y + 8, LARG * 0.6, 8);
}

function desenharCano(o) {
  const x = o.x - camX;
  if (x > W + 60 || x + LARG < -60) return;
  const cima = o.centro - o.vao / 2, baixo = o.centro + o.vao / 2;
  const [claro, base, escuro] = o.autor ? ['#ffb3cc', '#ff3d7f', '#8f1446'] : ['#c8ffb0', '#56c94a', '#1e6b2a'];
  const g = corpoCano(x, -20, cima - 50, claro, base, escuro);
  corpoCano(x, baixo + 50, CHAO + 10, claro, base, escuro);
  const apertado = o.vao < VAO * 0.9 && t < caosAte;
  const corTampa = apertado ? (Math.sin(t * 20) > 0 ? '#ffd23f' : '#b06bff') : null;
  tampa(x, cima - 56, g, corTampa);
  tampa(x, baixo, g, corTampa);
  if (o.autor) {
    const cx = x + LARG / 2;
    const y = baixo + 160 < 1480 ? baixo + 120 : cima - 120;   // fora dos chips de efeito
    etiqueta(o.autor, '🌹', cx, y);
  }
}

// plaquinha com avatar + nome de quem mandou o obstáculo (texto só via fillText)
function etiqueta(autor, emoji, cx, cy) {
  const nome = String(autor.nome ?? autor.user ?? '').slice(0, 14);
  ctx.font = `40px ${FONTE}`;
  const tw = ctx.measureText(nome).width;
  const w = 58 + 14 + tw + 56, h = 70;
  const x = limitar(cx - w / 2, 8, W - w - 8);
  ctx.fillStyle = 'rgba(26,16,48,.92)';
  ctx.beginPath(); ctx.roundRect(x, cy - h / 2, w, h, h / 2); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke();
  // avatar
  const ax = x + 8 + 29, img = foto(autor.foto);
  ctx.save();
  ctx.beginPath(); ctx.arc(ax, cy, 27, 0, Math.PI * 2); ctx.clip();
  if (img) ctx.drawImage(img, ax - 27, cy - 27, 54, 54);
  else {
    ctx.fillStyle = corDoNick(autor.user || autor.nome); ctx.fillRect(ax - 27, cy - 27, 54, 54);
    ctx.fillStyle = '#1a1030'; ctx.font = `26px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(iniciais(autor.nome || autor.user), ax, cy + 2);
  }
  ctx.restore();
  ctx.font = `40px ${FONTE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = '#1a1030'; ctx.fillStyle = '#fff';
  ctx.strokeText(nome, x + 72, cy + 3); ctx.fillText(nome, x + 72, cy + 3);
  ctx.font = '38px system-ui,sans-serif';
  ctx.fillText(emoji, x + 72 + tw + 8, cy + 2);
}

function desenharRosquinha(o) {
  const x = o.x - camX, y = roscaY(o), rr = o.r;
  if (x > W + rr + 200 || x < -rr - 200) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.arc(8, 14, rr, 0, Math.PI * 2); ctx.arc(8, 14, rr * 0.34, 0, Math.PI * 2, true); ctx.fill();
  ctx.rotate(o.giro + t * 0.8);
  ctx.fillStyle = '#d98a3d';
  ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.arc(0, 0, rr * 0.34, 0, Math.PI * 2, true); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#1a1030'; ctx.stroke();
  ctx.fillStyle = '#ff3d7f';
  ctx.beginPath();
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * Math.PI * 2, rad = rr * (0.86 + Math.sin(a * 9) * 0.05);
    k ? ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.arc(0, 0, rr * 0.44, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.ellipse(-rr * 0.35, -rr * 0.5, rr * 0.25, rr * 0.08, -0.6, 0, Math.PI * 2); ctx.fill();
  const granulado = ['#3df2c2', '#ffd23f', '#fff', '#5b8cff'];
  for (let k = 0; k < 26; k++) {
    const a = ruidoH(k) * Math.PI * 2, d = rr * (0.52 + ruidoH(k + 40) * 0.28);
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(ruidoH(k + 80) * 6);
    ctx.fillStyle = granulado[k % 4]; ctx.fillRect(-12, -4, 24, 8); ctx.restore();
  }
  ctx.restore();
  if (o.autor) etiqueta(o.autor, '🍩', x, y - rr - 50);
}

/* ---------- pássaro ---------- */

function asa(ang, cor) {
  ctx.save(); ctx.translate(-10, 4); ctx.rotate(ang);
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-30, -44, -64, -30);
  ctx.quadraticCurveTo(-46, -16, -56, -4);
  ctx.quadraticCurveTo(-36, 4, -42, 14);
  ctx.quadraticCurveTo(-20, 16, 0, 10);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function desenharAve() {
  const caido = estado === 'caiu';
  const susto = caido || t < caosAte;
  const turva = t < turvaAte && !caido;
  const bate = Math.sin(ave.fase);
  ctx.save();
  ctx.translate(BX, ave.y);
  ctx.rotate(caido ? ave.giro : limitar(ave.vy / 1100, -0.45, 1.0));
  ctx.lineWidth = 5; ctx.strokeStyle = '#1a1030'; ctx.lineJoin = 'round';

  // cauda e asa de trás
  ctx.fillStyle = '#ff3d7f';
  ctx.beginPath(); ctx.moveTo(-38, -2); ctx.lineTo(-72, -26); ctx.lineTo(-62, 0); ctx.lineTo(-74, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
  asa(-0.3 - bate * 0.9, '#c42a63');

  // corpo
  const g = ctx.createRadialGradient(-10, -16, 6, 0, 0, 52);
  g.addColorStop(0, '#fff3a8'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#f0a020');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, 48, 40, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff1c4';
  ctx.beginPath(); ctx.ellipse(8, 16, 28, 17, 0, 0, Math.PI * 2); ctx.fill();
  // topete
  ctx.fillStyle = '#ff3d7f';
  for (const [dx, a] of [[-6, -0.5], [4, -0.1], [14, 0.3]]) {
    ctx.save(); ctx.translate(dx, -36); ctx.rotate(a + (susto ? Math.sin(t * 30) * 0.2 : 0));
    ctx.beginPath(); ctx.ellipse(0, -12, 7, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // bochecha
  ctx.fillStyle = 'rgba(255,90,140,.55)';
  ctx.beginPath(); ctx.ellipse(18, 8, 10, 6, 0, 0, Math.PI * 2); ctx.fill();

  // olho
  if (susto) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(22, -14, 19, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.arc(24 + Math.sin(t * 40) * 2, -14, 4.5, 0, Math.PI * 2); ctx.fill();
    // sobrancelha preocupada e gota de suor
    ctx.beginPath(); ctx.moveTo(8, -38); ctx.lineTo(36, -32); ctx.stroke();
    ctx.fillStyle = '#7fd8ff';
    ctx.beginPath(); ctx.moveTo(-8, -48); ctx.quadraticCurveTo(-18, -32, -8, -28); ctx.quadraticCurveTo(2, -32, -8, -48); ctx.fill();
  } else if (t > ave.piscaEm && t < ave.piscaEm + 0.14) {
    ctx.beginPath(); ctx.moveTo(10, -13); ctx.quadraticCurveTo(22, -6, 34, -13); ctx.stroke();
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(21, -13, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.arc(26, -12, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(29, -15, 3, 0, Math.PI * 2); ctx.fill();
  }
  if (turva) {
    // óculos escuros do presente
    ctx.fillStyle = '#1a1030';
    ctx.beginPath(); ctx.roundRect(4, -26, 40, 24, 8); ctx.fill();
    ctx.fillRect(-14, -20, 20, 5);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(12, -22, 12, 4);
  }

  // bico (abre no susto)
  const abre = susto ? 0.45 : 0.05;
  ctx.fillStyle = '#ff7a3d';
  ctx.save(); ctx.translate(40, 2); ctx.rotate(-abre / 2);
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(34, 0); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(40, 4); ctx.rotate(abre);
  ctx.fillStyle = '#e85a20';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(26, 4); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();

  // asa da frente
  asa(-0.2 - bate * 1.1, '#ff5e94');
  ctx.restore();

  if (caido && caiuT < 1.2) {
    ctx.font = `90px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.strokeStyle = '#1a1030'; ctx.fillStyle = '#ffd23f';
    ctx.strokeText('!!', BX + 10, ave.y - 100); ctx.fillText('!!', BX + 10, ave.y - 100);
  }
}

/* ---------- quadro ---------- */

function desenharChao() {
  ctx.fillStyle = TERRA; ctx.fillRect(-60, CHAO, W + 120, H - CHAO + 60);
  ctx.fillStyle = '#4fbf4a'; ctx.fillRect(-60, CHAO, W + 120, 34);
  ctx.fillStyle = '#7fe060'; ctx.fillRect(-60, CHAO, W + 120, 8);
  ctx.fillStyle = '#3a9a3c';
  for (let x = -(camX % 70); x < W + 70; x += 70) {
    ctx.beginPath(); ctx.moveTo(x, CHAO + 34); ctx.lineTo(x + 35, CHAO + 34); ctx.lineTo(x + 18, CHAO + 54); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  for (let x = -(camX % 160); x < W + 160; x += 160) {
    ctx.beginPath(); ctx.ellipse(x + 40, CHAO + 90, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 120, CHAO + 150, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
}

function desenhar() {
  if (cenario) desenharCenario();
  else ctx.clearRect(0, 0, W, H);

  ctx.save();
  if (tremor > 0) ctx.translate(r(-tremor, tremor), r(-tremor, tremor) * 0.6);

  for (const o of obst) o.tipo === 'cano' ? desenharCano(o) : desenharRosquinha(o);
  desenharChao();
  desenharAve();
  for (const p of penas) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.vida);
    ctx.translate(p.x - camX, p.y); ctx.rotate(p.rot); ctx.scale(p.tam, p.tam);
    ctx.fillStyle = p.cor;
    ctx.beginPath(); ctx.ellipse(0, 0, 24, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(26,16,48,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(22, 0); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  if (t < caosAte) {
    ctx.fillStyle = `rgba(150,60,255,${0.16 + 0.1 * Math.sin(t * 8)})`;
    ctx.fillRect(0, 0, W, H);
    if (raio > 0) desenharRaio();
  }
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.55})`; ctx.fillRect(0, 0, W, H); }
}

let raioX = 500;
function desenharRaio() {
  if (raio > 0.17) raioX = r(100, W - 100);
  ctx.fillStyle = `rgba(230,210,255,${raio * 1.6})`; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.shadowColor = '#c9a0ff'; ctx.shadowBlur = 30;
  ctx.beginPath();
  let x = raioX, y = 300;
  ctx.moveTo(x, y);
  for (let k = 0; k < 8; k++) { x += ruidoH(raioX + k) * 120 - 60; y += 130; ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.shadowBlur = 0;
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
  const f = t < turvaAte ? 'blur(16px) saturate(1.5)' : '';
  if (f !== filtro) canvas.style.filter = filtro = f;
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
function faixa({ classe, cor, grande, pessoa, rotulo }) {
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
    s.textContent = rotulo;
    n.append(pessoa.nome || pessoa.user, s);
    q.append(avatar(pessoa, 'grande'), n);
    f.append(q);
  } else if (rotulo) {
    const s = document.createElement('div');
    s.className = 'nome txt-jogo';
    s.style.cssText = 'text-align:center;max-width:none;margin-top:10px;font-size:46px';
    s.textContent = rotulo;
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
    tremor = Math.max(tremor, 30);
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
  r: () => { fila = []; turvaAte = caosAte = 0; penas = []; reiniciar(); },
  x: () => { if (estado === 'voando') bater(null); }
});

await document.fonts.load(`40px ${FONTE}`).catch(() => {});
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
