import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, criarTimes, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
aplicarFundo(cfg.fundo);
escalarPalco(palco);

const TIMES = cfg.times;
const LIMITE = cfg.limite ?? 100;
const FORCA = cfg.forca ?? {};
const DOBRO_MS = (cfg.dobroSegundos ?? 10) * 1000;
const DOBRO_MAX_MS = (cfg.dobroMaximoSegundos ?? 60) * 1000;
const VENCEDOR_MS = 5000;
const MAX_TEXTOS = 40, MAX_PARTICULAS = 300;
const MEIO = 540, CURSO = 380;            // marcador anda ±380 px até a linha do time
const CORDA_Y = 990, CHAO_Y = 1110, ARENA = { x: 30, y: 420, w: 1020, h: 840 };
const EMOJI = { rose: '🌹', gg: '✨', doughnut: '🍩', galaxy: '🌌' };

TIMES.forEach((t, i) => { palco.style.setProperty('--cor' + i, t.cor); $('nome' + i).textContent = t.nome; });
$('titulo').textContent = cfg.titulo ?? 'CABO DE GUERRA';
$('dica').append('Comente ');
TIMES.forEach((t, i) => {
  const s = document.createElement('span');
  s.className = 't' + i;
  const b = document.createElement('b');
  b.textContent = cfg.palavras[i ? 'B' : 'A'][0];
  s.append(b, ` → ${t.nome}`);
  $('dica').append(s, i ? '' : '  ·  ');
});
const rotulo = (ref) => typeof ref === 'number' ? `🎁 #${ref}` : `${EMOJI[ref.toLowerCase()] ?? '🎁'} ${ref}`;
const legenda = [`💬 ${cfg.palavras.A[0]}/${cfg.palavras.B[0]} puxa ${FORCA.comentario ?? 1}`];
for (const [acao, refs] of Object.entries(cfg.acoes ?? {})) {
  const efeito = acao === 'dobro' ? `força x2 ${DOBRO_MS / 1000}s` : `puxa ${FORCA[acao] ?? 0}`;
  legenda.push(`${refs.map(rotulo).join(' / ')} ${efeito}`);
}
for (const t of legenda) $('legenda').appendChild(document.createElement('span')).textContent = t;

const times = criarTimes(cfg.palavras);
const salvo = lembrar('cabo:placar', null);
let placar = Array.isArray(salvo) && salvo.length === 2 && salvo.every(Number.isFinite) ? salvo : [0, 0];
let pos = 0, vis = 0;                       // pos < 0 = lado do time 0; ±LIMITE encerra a rodada
let dobroAte = [0, 0], tensao = [0, 0], guardado = [0, 0];
let fim = null, faixa = null, tremor = 0, clarão = 0;
let textos = [], parts = [];
const avisar = avisos($('avisos'));
const idx = (t) => t === 'A' ? 0 : 1;

function hud() {
  const n = times.tamanho();
  [n.A, n.B].forEach((g, i) => { $('info' + i).textContent = `👥 ${g} ${g === 1 ? 'pessoa' : 'pessoas'} · 🏆 ${placar[i]}`; });
}

function flutuar(i, txt, grande = false) {
  textos.push({ x: (i ? 790 : 290) + (Math.random() - .5) * 180, y: grande ? 760 : 820 + Math.random() * 60,
    txt, cor: TIMES[i].cor, vida: grande ? 1.6 : 1.1, max: grande ? 1.6 : 1.1, tam: grande ? 76 : 34 });
  if (textos.length > MAX_TEXTOS) textos.splice(0, textos.length - MAX_TEXTOS);
}

function soltar(n, x, y, cor, forca, gravidade = 900) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = forca * (.3 + Math.random() * .7);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - forca * .4, g: gravidade, cor,
      tam: 6 + Math.random() * 10, vida: .6 + Math.random() * .8 });
  }
  if (parts.length > MAX_PARTICULAS) parts.splice(0, parts.length - MAX_PARTICULAS);
}

// Aplica força ao time i (já com o dobro); durante a tela de vencedor guarda para a próxima rodada.
function puxar(i, n) {
  const f = n * (performance.now() < dobroAte[i] ? 2 : 1);
  if (fim) { guardado[i] += f; return f; }
  pos += i ? f : -f;
  tensao[i] = Math.min(1, tensao[i] + .2 + f / 25);
  const off = (vis / LIMITE) * CURSO;
  soltar(Math.min(12, 2 + f), MEIO + off + (i ? 300 : -300), CHAO_Y, 'rgba(220,226,255,.55)', 160, 300);
  if (f >= 30) {
    tremor = Math.min(34, 10 + f / 4);
    clarão = .45;
    soltar(60, MEIO + off, CORDA_Y, TIMES[i].cor, 700);
    soltar(30, MEIO + off, CORDA_Y, '#ffc23d', 520);
  }
  if (Math.abs(pos) >= LIMITE) vencer(pos < 0 ? 0 : 1);
  return f;
}

function vencer(i) {
  pos = i ? LIMITE : -LIMITE;
  placar[i]++;
  guardar('cabo:placar', placar);
  hud();
  faixa = document.createElement('div');
  faixa.className = 'vencedor';
  faixa.style.setProperty('--destaque', TIMES[i].cor);
  const s = document.createElement('small');
  s.textContent = 'Fim da rodada';
  faixa.append(s, `🏆 ${TIMES[i].nome} venceu!`);
  palco.appendChild(faixa);
  for (let k = 0; k < 6; k++) soltar(25, 100 + k * 176, 420, [TIMES[i].cor, '#ffc23d', '#ffffff'][k % 3], 650);
  tremor = 30;
  fim = setTimeout(novaRodada, VENCEDOR_MS);
}

function novaRodada() {
  clearTimeout(fim);
  fim = null;
  faixa?.remove();
  // presentes que chegaram no intervalo valem na nova rodada (sem encerrar de cara)
  pos = Math.max(-LIMITE * .5, Math.min(LIMITE * .5, guardado[1] - guardado[0]));
  guardado = [0, 0];
}

function aoEvento(ev) {
  if (ev.tipo === 'comentario') {
    const t = times.pelaPalavra(ev);
    if (!t) return;
    const i = idx(t);
    const f = puxar(i, FORCA.comentario ?? 1);
    flutuar(i, `+${f} ${String(ev.nome || ev.user).slice(0, 14)}`);
    hud();
    return;
  }
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao) return;
  const i = idx(times.doUsuario(ev.user));
  const q = ev.quantidade ?? 1;
  const quem = ev.nome || ev.user;
  hud();
  if (acao === 'dobro') {
    dobroAte[i] = Math.min(Math.max(dobroAte[i], performance.now()) + DOBRO_MS * q, performance.now() + DOBRO_MAX_MS);
    tremor = 14;
    soltar(50, i ? 790 : 290, 560, '#ffc23d', 600);
    flutuar(i, '⚡ FORÇA x2', true);
    avisar(html`<span class="t${i}"><b>${quem}</b> mandou ${q}× ${ev.presenteNome} → <span class="mais">⚡ força x2 em ${TIMES[i].nome}</span></span>`);
    return;
  }
  const f = puxar(i, (FORCA[acao] ?? 0) * q);
  flutuar(i, `+${f}`, f >= 10);
  avisar(html`<span class="t${i}"><b>${quem}</b> mandou ${q}× ${ev.presenteNome} → <span class="mais">puxou ${f} para ${TIMES[i].nome}</span></span>`);
}

/* ---------- desenho ---------- */

const cv = $('cena'), ctx = cv.getContext('2d');

function boneco(x, cor, lado, inclina, passo) {
  const a = lado * inclina;
  ctx.save();
  ctx.translate(x, CHAO_Y);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2a3150';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(lado * 10, -62); ctx.lineTo(-lado * 26 + passo, 0);
  ctx.moveTo(lado * 10, -62); ctx.lineTo(-lado * 2 - passo, 0);
  ctx.stroke();
  ctx.rotate(a);
  ctx.fillStyle = cor;
  ctx.beginPath(); ctx.roundRect(-27, -150, 54, 96, 22); ctx.fill();
  ctx.fillStyle = '#f2f4ff';
  ctx.beginPath(); ctx.arc(0, -184, 32, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b0d17';
  ctx.beginPath(); ctx.arc(-lado * 12, -188, 5, 0, Math.PI * 2); ctx.arc(-lado * 24, -188, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // braço do ombro até a corda
  const ox = x + Math.sin(a) * 128, oy = CHAO_Y - Math.cos(a) * 128;
  ctx.strokeStyle = cor;
  ctx.lineWidth = 15;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - lado * 46, CORDA_Y); ctx.stroke();
}

function pilula(txt, x, y, cor, fundo) {
  ctx.font = '900 34px "Segoe UI", system-ui, sans-serif';
  const w = ctx.measureText(txt).width + 40;
  ctx.fillStyle = fundo;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 30, w, 60, 30); ctx.fill();
  ctx.fillStyle = cor;
  ctx.fillText(txt, x, y + 2);
}

function cena(agora, dt) {
  const off = (vis / LIMITE) * CURSO;
  ctx.fillStyle = 'rgba(8,10,20,.72)';
  ctx.beginPath(); ctx.roundRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 40); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.roundRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h, 40); ctx.clip();

  // zonas finais e linhas de chegada
  TIMES.forEach((t, i) => {
    const lx = MEIO + (i ? CURSO : -CURSO);
    ctx.globalAlpha = .16;
    ctx.fillStyle = t.cor;
    ctx.fillRect(i ? lx : ARENA.x, ARENA.y, i ? ARENA.x + ARENA.w - lx : lx - ARENA.x, ARENA.h);
    ctx.globalAlpha = 1;
    ctx.fillRect(lx - 4, ARENA.y + 150, 8, CHAO_Y - ARENA.y - 150);
  });
  ctx.fillStyle = '#1b2036';
  ctx.fillRect(ARENA.x, CHAO_Y, ARENA.w, ARENA.y + ARENA.h - CHAO_Y);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(ARENA.x, CHAO_Y, ARENA.w, 6);
  ctx.setLineDash([14, 14]);
  ctx.strokeStyle = 'rgba(255,255,255,.45)';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(MEIO, ARENA.y + 150); ctx.lineTo(MEIO, CHAO_Y); ctx.stroke();
  ctx.setLineDash([]);

  // bonecos (andam com a corda)
  const t = agora / 1000;
  TIMES.forEach((tm, i) => {
    const lado = i ? 1 : -1;
    for (let k = 0; k < 4; k++) {
      const inc = .3 + tensao[i] * .28 + Math.sin(t * 6 + k * 1.7) * .03;
      const passo = tensao[i] > .1 ? Math.sin(t * 14 + k) * 8 : 0;
      boneco(MEIO + off + lado * (200 + k * 92), tm.cor, lado, inc, passo);
    }
  });

  // corda
  ctx.lineCap = 'butt';
  ctx.strokeStyle = '#d8b27a';
  ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(-50, CORDA_Y); ctx.lineTo(1130, CORDA_Y); ctx.stroke();
  ctx.setLineDash([10, 12]);
  ctx.lineDashOffset = -off;
  ctx.strokeStyle = '#9c7444';
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(-50, CORDA_Y); ctx.lineTo(1130, CORDA_Y); ctx.stroke();
  ctx.setLineDash([]);

  // marcador
  const mx = MEIO + off;
  ctx.fillStyle = '#ffc23d';
  ctx.beginPath();
  ctx.moveTo(mx - 20, CORDA_Y); ctx.lineTo(mx + 20, CORDA_Y); ctx.lineTo(mx + 14, CORDA_Y + 96);
  ctx.lineTo(mx, CORDA_Y + 78); ctx.lineTo(mx - 14, CORDA_Y + 96); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(mx, CORDA_Y, 20, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // quanto falta + força dobrada
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  TIMES.forEach((tm, i) => {
    const falta = Math.max(0, Math.ceil(LIMITE + (i ? -pos : pos)));
    ctx.font = '900 40px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = tm.cor;
    ctx.fillText(`faltam ${falta}`, i ? 830 : 250, ARENA.y + 56);
    const resta = (dobroAte[i] - agora) / 1000;
    if (resta > 0) pilula(`⚡ x2 · ${Math.ceil(resta)}s`, i ? 830 : 250, ARENA.y + 122, '#0b0d17', '#ffc23d');
  });

  // partículas
  for (const p of parts) {
    p.vida -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.vida * 2));
    ctx.fillStyle = p.cor;
    ctx.fillRect(p.x - p.tam / 2, p.y - p.tam / 2, p.tam, p.tam);
  }
  parts = parts.filter(p => p.vida > 0 && p.y < 1960);

  // textos flutuantes
  ctx.lineJoin = 'round';
  for (const s of textos) {
    s.vida -= dt; s.y -= 90 * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, s.vida / s.max * 2.5));
    ctx.font = `900 ${s.tam}px "Segoe UI", system-ui, sans-serif`;
    ctx.lineWidth = s.tam / 5;
    ctx.strokeStyle = '#0b0d17';
    ctx.strokeText(s.txt, s.x, s.y);
    ctx.fillStyle = s.cor;
    ctx.fillText(s.txt, s.x, s.y);
  }
  textos = textos.filter(s => s.vida > 0);
  ctx.globalAlpha = 1;
}

let antes = performance.now();
function quadro(agora) {
  const dt = Math.min(.05, (agora - antes) / 1000);
  antes = agora;
  vis += (pos - vis) * (1 - Math.exp(-dt * 7));
  tensao = tensao.map(v => Math.max(0, v - dt * 1.4));
  tremor *= Math.exp(-dt * 7);
  clarão = Math.max(0, clarão - dt * 1.5);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 1080, 1920);
  if (tremor > .5) ctx.translate((Math.random() - .5) * tremor, (Math.random() - .5) * tremor);
  cena(agora, dt);
  if (clarão > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(255,255,255,${clarão * .5})`;
    ctx.fillRect(0, 0, 1080, 1920);
  }
  requestAnimationFrame(quadro);
}

function rajada() {
  const presentes = ['Rose', 'Rose', 'GG', 'GG', 'Doughnut', 'Galaxy', 'Finger Heart'];
  for (let k = 0; k < 20; k++) setTimeout(() => aoEvento(Math.random() < .6
    ? eventoFalso({ tipo: 'comentario', texto: cfg.palavras[Math.random() < .5 ? 'A' : 'B'][0] })
    : eventoFalso({ presenteNome: presentes[Math.floor(Math.random() * presentes.length)], quantidade: 1 + Math.floor(Math.random() * 3) })
  ), k * 120);
}

teclas({
  t: rajada,
  r: () => {
    placar = [0, 0];
    guardar('cabo:placar', placar);
    dobroAte = [0, 0];
    times.zerar();
    guardado = [0, 0];
    novaRodada();
    pos = 0;
    hud();
  }
});

hud();
requestAnimationFrame(quadro);
conectar(aoEvento);
