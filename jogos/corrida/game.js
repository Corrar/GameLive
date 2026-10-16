import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  teclas, eventoFalso, foto } from '../kit/kit.js';

const cfg = await carregarConfig();
const VOLTAS = cfg.voltas ?? 3;
const MAX = cfg.maxCarros ?? 12;
const VEL = cfg.velocidade ?? 150; // px lógicos por segundo
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');

aplicarFundo(cfg.fundo);
escalarPalco(palco);
const ctx = $('tela').getContext('2d');
const avisar = avisos($('avisos'), { max: 3 });
const FONTE = '"Segoe UI", system-ui, sans-serif';
const TAU = Math.PI * 2;
const CORES = ['#3df2c2', '#ff3d7f', '#ffc23d', '#5b8cff', '#b06bff', '#ff8a3d', '#41d7ff', '#ff5ad1', '#9dff5a', '#f4f6ff', '#ff5050', '#00c8a0'];

// legenda dos presentes a partir do config
const ROTULOS = { acelerar: ['🌹', 'acelera'], nitro: ['⚡', 'nitro'], oleo: ['🍩', 'óleo no líder'], pular: ['🌌', 'pula pro 1º'] };
const nomeRef = (r) => (typeof r === 'number' ? `#${r}` : r);
$('legenda').append(...[['💬', 'comente', 'entra na pista'],
  ...Object.entries(cfg.acoes ?? {}).filter(([a, r]) => ROTULOS[a] && r.length).map(([a, r]) => [ROTULOS[a][0], nomeRef(r[0]), ROTULOS[a][1]])]
  .map(([e, quem, o_que]) => { const s = document.createElement('span'); s.textContent = `${e} ${quem}: ${o_que}`; return s; }));

/* ---------- pista: estádio em pé, sentido horário, largada no meio da reta esquerda ---------- */
const CX = 540, C1 = 704, C2 = 1180, R = 330, MEIA = 110;
const RETA = C2 - C1, ARCO = Math.PI * R, YL = (C1 + C2) / 2;
const PER = 2 * RETA + 2 * ARCO;
const META = VOLTAS * PER;
const FAIXAS = [-82, -27, 27, 82];

// s (distância) -> ponto na linha central e direção do movimento
function ponto(s) {
  s = ((s % PER) + PER) % PER;
  if (s < RETA / 2) return { x: CX - R, y: YL - s, a: -Math.PI / 2 };
  s -= RETA / 2;
  if (s < ARCO) { const t = Math.PI + s / R; return { x: CX + R * Math.cos(t), y: C1 + R * Math.sin(t), a: t + Math.PI / 2 }; }
  s -= ARCO;
  if (s < RETA) return { x: CX + R, y: C1 + s, a: Math.PI / 2 };
  s -= RETA;
  if (s < ARCO) { const t = s / R; return { x: CX + R * Math.cos(t), y: C2 + R * Math.sin(t), a: t + Math.PI / 2 }; }
  return { x: CX - R, y: C2 - (s - ARCO), a: -Math.PI / 2 };
}

const pista = document.createElement('canvas');
pista.width = 1080; pista.height = 1920;
{
  const g = pista.getContext('2d');
  const estadio = (r) => { g.beginPath(); g.arc(CX, C1, r, Math.PI, TAU); g.lineTo(CX + r, C2); g.arc(CX, C2, r, 0, Math.PI); g.closePath(); };
  g.save(); g.shadowColor = 'rgba(61,242,194,.35)'; g.shadowBlur = 70;
  estadio(R + MEIA + 18); g.fillStyle = '#151a2e'; g.fill(); g.restore();
  estadio(R + MEIA + 9); g.lineWidth = 18; g.strokeStyle = '#f4f6ff'; g.stroke();
  g.setLineDash([34, 34]); g.strokeStyle = '#ff3d7f'; g.stroke(); g.setLineDash([]);
  estadio(R + MEIA); g.fillStyle = '#242b42'; g.fill();
  estadio(R - MEIA - 9); g.strokeStyle = '#f4f6ff'; g.stroke();
  g.setLineDash([34, 34]); g.strokeStyle = '#ff3d7f'; g.stroke(); g.setLineDash([]);
  estadio(R - MEIA - 18); g.fillStyle = '#0e1224'; g.fill();
  g.setLineDash([30, 40]); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.16)';
  for (const d of [-55, 0, 55]) { estadio(R + d); g.stroke(); }
  g.setLineDash([]);
  const q = 22; // linha de chegada quadriculada
  for (let i = 0; i < (2 * MEIA) / q; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = (i + j) % 2 ? '#f4f6ff' : '#0b0d17';
    g.fillRect(CX - R - MEIA + i * q, YL - q + j * q, q, q);
  }
}

/* ---------- estado ---------- */
let carros = [];
let estado = 'esperando'; // esperando | largada | correndo | fim
let contagem = 0;
let timerFim = null;
const vitorias = new Map();
const parts = [];
let manchas = [];

const cortar = (nome, n = 12) => { const l = Array.from(nome); return l.length > n ? l.slice(0, n - 1).join('') + '…' : nome; };
const ordenados = () => [...carros].sort((a, b) => b.s - a.s);
const volta = (c) => Math.min(VOLTAS, Math.max(1, Math.floor(c.s / PER) + 1));
const grade = (i) => -Math.floor(i / 4) * 90 - (i % 2) * 24 - 12;

function soltar(x, y, n, { cor = '#fff', vel = 220, vida = 0.8, tam = 6, grav = 0, emoji = null } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = vel * (0.3 + Math.random() * 0.7);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, v: vida * (0.6 + Math.random() * 0.4), m: vida,
      cor: Array.isArray(cor) ? cor[Math.floor(Math.random() * cor.length)] : cor, tam, grav, emoji });
  }
  if (parts.length > 600) parts.splice(0, parts.length - 600);
}

function posicao(c) {
  const p = ponto(c.s), f = FAIXAS[c.faixa];
  return { x: p.x + f * Math.sin(p.a), y: p.y - f * Math.cos(p.a), a: p.a };
}

function entrar(ev) {
  const agora = performance.now();
  let c = carros.find(k => k.user === ev.user);
  if (c) { c.desde = agora; if (ev.foto) c.fotoUrl = ev.foto; return c; }
  if (carros.length >= MAX) {
    // sai o mais antigo (última atividade) que não está no pódio
    const fora = ordenados().slice(3).sort((a, b) => a.desde - b.desde)[0];
    const p = posicao(fora);
    soltar(p.x, p.y, 16, { cor: '#9aa3bd', vel: 160 });
    carros.splice(carros.indexOf(fora), 1);
  }
  const nome = String(ev.nome || ev.user);
  const uso = [0, 0, 0, 0];
  carros.forEach(k => uso[k.faixa]++);
  c = { user: ev.user, nome, fotoUrl: ev.foto, desde: agora,
    cor: CORES.find(cor => !carros.some(k => k.cor === cor)) ?? CORES[Math.floor(Math.random() * CORES.length)],
    base: VEL * (0.95 + Math.random() * 0.1), ruido: 0, alvo: 0, troca: 0, turbo: 0, nitro: 0, oleo: 0, giro: 0, giroFim: 0,
    faixa: estado === 'correndo' ? uso.indexOf(Math.min(...uso)) : carros.length % 4,
    s: estado === 'correndo' ? Math.min(...carros.map(k => k.s), 40) - 40 : grade(carros.length) };
  carros.push(c);
  const p = posicao(c);
  soltar(p.x, p.y, 14, { cor: c.cor });
  avisar(html`🏎️ <b>${nome}</b> entrou na pista`);
  if (estado === 'esperando') largar();
  return c;
}

function largar() { estado = 'largada'; contagem = 3.4; }

function novaCorrida() {
  document.querySelector('.vencedor')?.remove();
  carros.forEach((c, i) => Object.assign(c, { s: grade(i), faixa: i % 4, turbo: 0, nitro: 0, oleo: 0, giro: 0 }));
  manchas = [];
  if (carros.length) largar(); else estado = 'esperando';
}

function vencer(c) {
  estado = 'fim';
  const v = vitorias.get(c.user) ?? { nome: c.nome, n: 0 };
  v.n++; v.nome = c.nome;
  vitorias.set(c.user, v);
  mostrarVitorias();
  const p = posicao(c);
  soltar(p.x, p.y, 90, { cor: ['#3df2c2', '#ff3d7f', '#ffc23d', '#fff'], vel: 700, vida: 2.2, tam: 9, grav: 500 });
  const faixa = document.createElement('div');
  faixa.className = 'vencedor';
  const titulo = document.createElement('small');
  titulo.textContent = '🏁 venceu a corrida';
  faixa.append(titulo, cortar(c.nome, 16));
  palco.appendChild(faixa);
  timerFim = setTimeout(novaCorrida, 5000);
}

function mostrarVitorias() {
  const ol = $('vitorias');
  const top = [...vitorias.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  if (!top.length) {
    const li = document.createElement('li'); li.className = 'vazio';
    li.textContent = 'Ninguém venceu ainda: o primeiro a cruzar 3 voltas leva!';
    return ol.replaceChildren(li);
  }
  ol.replaceChildren(...top.map((v, i) => {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = `${i + 1}º `;
    li.append(b, `${cortar(v.nome, 14)} · ${v.n} 🏆`);
    return li;
  }));
}

function mostrarPosicoes() {
  const lista = ordenados();
  $('volta').textContent = estado === 'fim' ? 'CHEGADA!' : `VOLTA ${lista.length ? volta(lista[0]) : 1}/${VOLTAS}`;
  $('posicoes').replaceChildren(...lista.slice(0, 5).map((c, i) => {
    const li = document.createElement('li');
    const bola = document.createElement('i'); bola.style.setProperty('--c', c.cor);
    const b = document.createElement('b'); b.textContent = `${i + 1}º`;
    const nome = document.createElement('span'); nome.textContent = c.nome;
    li.append(b, bola, nome);
    return li;
  }));
}

/* ---------- presentes ---------- */
function aoEvento(ev) {
  if (!ev.user) return;
  if (ev.tipo === 'comentario') return void entrar(ev);
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao) return;
  const c = entrar(ev);
  const q = Math.max(1, ev.quantidade | 0);
  const quem = c.nome;
  const p = posicao(c);
  if (acao === 'acelerar') {
    c.turbo = Math.min(10, c.turbo + 1.2 * q);
    soltar(p.x, p.y, 4 + q * 2, { emoji: '🌹', vel: 260, vida: 1.1, tam: 34 });
    avisar(html`🌹 <b>${quem}</b> acelerou <span class="mais">×${q}</span>`);
  } else if (acao === 'nitro') {
    c.nitro = Math.min(14, c.nitro + 2.2 * q);
    soltar(p.x, p.y, 30, { cor: ['#ffc23d', '#ff8a3d', '#ff3d7f'], vel: 420, vida: 0.7, tam: 8 });
    avisar(html`⚡ <b>${quem}</b> NITRO <span class="mais">×${q}</span>`);
  } else if (acao === 'oleo') {
    const alvo = ordenados().find(k => k !== c);
    if (!alvo) return avisar(html`🍩 <b>${quem}</b> jogou óleo… mas está sozinho na pista`);
    alvo.oleo = Math.min(9, alvo.oleo + 2.4 * q);
    const pa = posicao(alvo);
    manchas.push({ x: pa.x, y: pa.y, v: 6 });
    soltar(pa.x, pa.y, 8, { emoji: '🍩', vel: 300, vida: 1, tam: 36 });
    avisar(html`🍩 <b>${quem}</b> jogou óleo em <b>${alvo.nome}</b>!`);
  } else if (acao === 'pular') {
    const lider = ordenados().find(k => k !== c);
    soltar(p.x, p.y, 30, { cor: ['#b06bff', '#41d7ff', '#fff'], vel: 380, vida: 1, tam: 7 });
    if (lider && lider.s >= c.s) { c.s = lider.s + 50; c.faixa = (lider.faixa + 2) % 4; }
    c.turbo = Math.min(10, c.turbo + (q - 1));
    const np = posicao(c);
    soltar(np.x, np.y, 40, { cor: ['#b06bff', '#41d7ff', '#ffc23d', '#fff'], vel: 480, vida: 1.2, tam: 8 });
    soltar(np.x, np.y, 6, { emoji: '✨', vel: 300, vida: 1.2, tam: 36 });
    avisar(html`🌌 <b>${quem}</b> saltou para o 1º lugar!`);
  }
}

/* ---------- loop ---------- */
function atualizar(dt) {
  if (estado === 'largada' || estado === 'correndo') contagem -= dt;
  if (estado === 'largada' && contagem <= 0) estado = 'correndo';
  if (estado === 'correndo') {
    for (const c of carros) {
      if ((c.troca -= dt) <= 0) { c.alvo = (Math.random() * 2 - 1) * 0.12; c.troca = 1 + Math.random() * 1.5; }
      c.ruido += (c.alvo - c.ruido) * Math.min(1, dt * 1.5);
      let v = c.base * (1 + c.ruido);
      if (c.turbo > 0) { v *= 1.45; c.turbo -= dt; }
      if (c.nitro > 0) {
        v *= 2.3; c.nitro -= dt;
        const p = posicao(c);
        soltar(p.x - Math.cos(p.a) * 50, p.y - Math.sin(p.a) * 50, 2, { cor: ['#ffc23d', '#ff8a3d', '#ff3d7f'], vel: 90, vida: 0.45, tam: 9 });
      }
      if (c.oleo > 0) { v *= 0.2; c.oleo -= dt; c.giro += dt * 14; c.giroFim = Math.ceil(c.giro / TAU) * TAU; }
      else if (c.giro) { c.giro += dt * 14; if (c.giro >= c.giroFim) c.giro = 0; }
      c.s += v * dt;
      if (c.s >= META) { vencer(c); break; }
    }
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if ((p.v -= dt) <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
    p.vx *= 1 - dt * 1.2; if (!p.grav) p.vy *= 1 - dt * 1.2;
  }
  manchas = manchas.filter(m => (m.v -= dt) > 0);
}

function avatar(x, y, r, c) {
  const img = foto(c.fotoUrl);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (img) { ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); }
  else {
    ctx.fillStyle = '#0b0d17'; ctx.fill();
    ctx.fillStyle = c.cor; ctx.font = `900 ${r * 1.15}px ${FONTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Array.from(c.nome)[0]?.toUpperCase() ?? '?', x, y + 2);
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
}

function desenharCarro(c) {
  const p = posicao(c);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.a + c.giro);
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.roundRect(-46, -20, 100, 52, 14); ctx.fill();
  ctx.fillStyle = '#05060c';
  for (const [x, y] of [[-36, -31], [18, -31], [-36, 23], [18, 23]]) { ctx.beginPath(); ctx.roundRect(x, y, 24, 8, 3); ctx.fill(); }
  if (c.nitro > 0) { ctx.shadowColor = '#ffc23d'; ctx.shadowBlur = 40; }
  else if (c.turbo > 0) { ctx.shadowColor = '#ff3d7f'; ctx.shadowBlur = 26; }
  ctx.fillStyle = c.cor;
  ctx.beginPath(); ctx.roundRect(-50, -25, 100, 50, [12, 22, 22, 12]); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-54, -27, 10, 54);
  ctx.fillStyle = 'rgba(11,13,23,.8)'; ctx.beginPath(); ctx.roundRect(22, -17, 14, 34, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(44, -20, 5, 9); ctx.fillRect(44, 11, 5, 9);
  ctx.restore();
  avatar(p.x, p.y, 22, c);
  return p;
}

function etiqueta(texto, x, y, cor) {
  ctx.font = `800 28px ${FONTE}`;
  const w = ctx.measureText(texto).width + 26;
  ctx.fillStyle = 'rgba(8,10,20,.86)';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 20, w, 40, 20); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = cor; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y + 1);
}

function desenhar(t) {
  ctx.clearRect(0, 0, 1080, 1920);
  ctx.drawImage(pista, 0, 0);
  for (const m of manchas) {
    ctx.globalAlpha = Math.min(1, m.v);
    ctx.fillStyle = '#05060a';
    ctx.beginPath(); ctx.ellipse(m.x, m.y, 58, 38, 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(176,107,255,.35)';
    ctx.beginPath(); ctx.ellipse(m.x - 12, m.y - 8, 20, 9, 0.4, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const lista = ordenados();
  const pos = lista.reverse().map(c => [c, desenharCarro(c)]);
  pos.forEach(([c, p], i) => etiqueta(`${pos.length - i}º ${cortar(c.nome)}`, p.x, p.y - 62, c.cor));
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.v / p.m);
    if (p.emoji) { ctx.font = `${p.tam}px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.emoji, p.x, p.y); }
    else { ctx.fillStyle = p.cor; ctx.beginPath(); ctx.arc(p.x, p.y, p.tam * (0.4 + 0.6 * p.v / p.m), 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (estado === 'esperando') {
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 4);
    ctx.fillStyle = '#3df2c2'; ctx.font = `900 54px ${FONTE}`;
    ctx.fillText('COMENTE', CX, YL - 34); ctx.fillText('PARA CORRER', CX, YL + 30);
    ctx.globalAlpha = 1;
  } else if (estado === 'largada' || (estado === 'correndo' && contagem > -0.8)) {
    const n = Math.ceil(contagem);
    const frac = contagem - Math.floor(contagem);
    ctx.save();
    ctx.translate(CX, YL);
    ctx.scale(1 + frac * 0.4, 1 + frac * 0.4);
    ctx.fillStyle = n > 0 ? '#ffc23d' : '#3df2c2';
    ctx.font = `900 ${n > 0 ? 190 : 150}px ${FONTE}`;
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 24;
    ctx.fillText(n > 3 ? '' : n > 0 ? String(n) : 'JÁ!', 0, 0);
    ctx.restore();
  }
}

let antes = performance.now(), acum = 0;
function quadro(agora) {
  const dt = Math.min(0.05, (agora - antes) / 1000);
  antes = agora;
  atualizar(dt);
  desenhar(agora / 1000);
  if ((acum += dt) > 0.25) { acum = 0; mostrarPosicoes(); }
  requestAnimationFrame(quadro);
}

/* ---------- teclas de teste ---------- */
const NICKS_TESTE = ['ana.voa', 'beto_rx', 'cami.zz', 'davi.mp4', 'eli_jogos', 'fefe.art', 'gui.k', 'hana__', 'igor.tt', 'juju.lima', 'lari.vlog', 'nina.fps'];
const sortear = (l) => l[Math.floor(Math.random() * l.length)];
function presenteFalso(acao, user) {
  const ref = cfg.acoes?.[acao]?.[0];
  if (ref === undefined) return null;
  const q = 1 + Math.floor(Math.random() * 3);
  return eventoFalso(typeof ref === 'number'
    ? { presenteId: ref, presenteNome: 'presente', quantidade: q, user, nome: user }
    : { presenteNome: String(ref), quantidade: q, user, nome: user });
}
function rajada() {
  [...NICKS_TESTE].sort(() => Math.random() - 0.5).slice(0, 8).forEach((n, i) =>
    setTimeout(() => aoEvento(eventoFalso({ tipo: 'comentario', texto: 'bora!', user: n, nome: n })), i * 120));
  ['acelerar', 'nitro', 'oleo', 'pular'].forEach((a, i) =>
    setTimeout(() => { const ev = presenteFalso(a, sortear(NICKS_TESTE)); if (ev) aoEvento(ev); }, 1200 + i * 400));
}

teclas({
  t: rajada,
  r: () => { clearTimeout(timerFim); carros = []; vitorias.clear(); parts.length = 0; novaCorrida(); mostrarVitorias(); }
});

mostrarVitorias();
requestAnimationFrame(quadro);
conectar(aoEvento);
