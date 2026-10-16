import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  teclas, eventoFalso, foto } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, corDoNick, iniciais, avatar, animar, contador,
  particulas, flutuar, tremer, confete, pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';

const cfg = await carregarConfig();
const MAX = cfg.maxPipas ?? 30;
const ESCUDO_MAX = cfg.escudoMax ?? 5;
const MARCOS = [10, 25, 50, 100];
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');

// "ceu" (padrão) desenha o pôr do sol; "transparente" ou outra cor CSS deixam só os telhados
const fundo = cfg.fundo ?? 'ceu';
const comCeu = fundo === 'ceu';
aplicarFundo(comCeu ? '#24154f' : fundo);
escalarPalco(palco);
ligarSom(cfg.som);
const ctx = $('tela').getContext('2d');
const avisar = avisos($('avisos'), { max: 2, duracao: 2600 });
const combo = criarCombo({ janela: cfg.janelaCombo ?? 6000 });
const ranking = criarRanking();
const contaCeu = contador($('noCeu'));
const contaCortes = contador($('cortes'));
const FONTE = '"Lilita One", "Baloo 2", Impact, sans-serif';
const CONTORNO = '#1a1030';
const TAU = Math.PI * 2;
try { await document.fonts.load('40px "Lilita One"'); } catch { /* segue com a fonte reserva */ }

/* ---------- legenda dos presentes ---------- */
const EFEITO = { crescer: ['🛡️', '+ESCUDO'], tempestade: ['⛈️', 'TEMPESTADE'] };
for (const [acao, refs] of Object.entries(cfg.acoes ?? {})) {
  if (!refs?.length) continue;
  const [padrao, efeito] = EFEITO[acao] ?? ['✂️', `CORTA ${cfg.cortes?.[acao] ?? 1}`];
  const chip = document.createElement('div');
  chip.className = 'chip-presente';
  const e = document.createElement('span');
  e.className = 'emoji';
  e.textContent = cfg.emojis?.[acao] ?? (typeof refs[0] === 'string' ? emojiDoPresente(refs[0], padrao) : padrao);
  const t = document.createElement('span');
  t.className = 'efeito';
  t.textContent = efeito;
  chip.append(e, t);
  $('legenda').appendChild(chip);
}

/* ---------- cenário fixo: céu de fim de tarde, sol e lajes ---------- */
let semente = 11;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const ceu = document.createElement('canvas');
ceu.width = 1080; ceu.height = 1920;
const SOL = { x: 760, y: 1385, r: 150 };
if (comCeu) {
  const g = ceu.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 1480);
  [[0, '#24154f'], [0.24, '#4f2577'], [0.46, '#a83a7c'], [0.62, '#f2625a'], [0.78, '#ff9a4a'], [0.92, '#ffc860'], [1, '#ffe39a']]
    .forEach(([k, c]) => grad.addColorStop(k, c));
  g.fillStyle = grad; g.fillRect(0, 0, 1080, 1920);
  for (let i = 0; i < 50; i++) {
    g.globalAlpha = 0.25 + rnd() * 0.5; g.fillStyle = '#fff';
    g.beginPath(); g.arc(rnd() * 1080, rnd() * 420, 1 + rnd() * 2, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  const brilho = g.createRadialGradient(SOL.x, SOL.y, 40, SOL.x, SOL.y, 620);
  brilho.addColorStop(0, 'rgba(255,240,170,.75)'); brilho.addColorStop(0.35, 'rgba(255,180,90,.3)'); brilho.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = brilho; g.fillRect(0, 700, 1080, 1220);
  const disco = g.createRadialGradient(SOL.x, SOL.y - 40, 10, SOL.x, SOL.y, SOL.r);
  disco.addColorStop(0, '#fffbe0'); disco.addColorStop(0.6, '#ffe07a'); disco.addColorStop(1, '#ffb347');
  g.fillStyle = disco; g.beginPath(); g.arc(SOL.x, SOL.y, SOL.r, 0, TAU); g.fill();
  // faixas de névoa passando na frente do sol
  g.fillStyle = 'rgba(255,140,110,.45)';
  for (const [y, w] of [[1300, 420], [1338, 520], [1372, 360]]) { g.beginPath(); g.ellipse(SOL.x - 20, y, w / 2, 7, 0, 0, TAU); g.fill(); }
}

// lajes e casas; tetos guarda a altura da laje para prender as linhas
const cidade = document.createElement('canvas');
cidade.width = 1080; cidade.height = 1920;
const tetos = [];
{
  const g = cidade.getContext('2d');
  // prédios ao longe
  g.fillStyle = 'rgba(110,40,90,.55)';
  for (let x = -10; x < 1090;) {
    const w = 50 + rnd() * 90, y = 1330 + rnd() * 60;
    g.fillRect(x, y, w, 1920 - y); x += w;
  }
  const PAREDES = ['#6b2f4f', '#7a3a4a', '#5a2a4e', '#8a4652', '#64345a', '#7d3344'];
  for (let x = -20; x < 1100;) {
    const w = 120 + rnd() * 120, y = 1405 + rnd() * 60;
    const cor = PAREDES[Math.floor(rnd() * PAREDES.length)];
    g.fillStyle = cor; g.fillRect(x, y, w, 1920 - y);
    // tijolinho aparente
    if (rnd() < 0.5) {
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2;
      for (let ty = y + 18; ty < 1920; ty += 16) { g.beginPath(); g.moveTo(x, ty); g.lineTo(x + w, ty); g.stroke(); }
    }
    // borda da laje iluminada pelo sol
    g.fillStyle = '#b8636a'; g.fillRect(x - 4, y - 12, w + 8, 14);
    g.fillStyle = '#ffb38a'; g.fillRect(x - 4, y - 12, w + 8, 4);
    // janelas
    for (let wy = y + 40; wy < 1900; wy += 90) for (let wx = x + 22; wx < x + w - 50; wx += 70) {
      const acesa = rnd() < 0.4;
      g.fillStyle = acesa ? '#f0b060' : '#2c1432'; g.fillRect(wx, wy, 34, 44);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(wx - 3, wy + 44, 40, 6);
    }
    // caixa d'água azul
    if (rnd() < 0.55) {
      const cx = x + 20 + rnd() * (w - 80);
      g.fillStyle = '#2d6fd6'; g.fillRect(cx, y - 56, 54, 44);
      g.fillStyle = '#4f8ff0'; g.beginPath(); g.ellipse(cx + 27, y - 56, 27, 8, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(cx + 6, y - 50, 8, 34);
    } else if (rnd() < 0.6) {
      // antena
      const ax = x + 30 + rnd() * (w - 60);
      g.strokeStyle = '#2a1430'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(ax, y - 12); g.lineTo(ax, y - 80);
      g.moveTo(ax - 22, y - 70); g.lineTo(ax + 22, y - 70); g.moveTo(ax - 14, y - 56); g.lineTo(ax + 14, y - 56); g.stroke();
    }
    tetos.push({ x0: x, x1: x + w, y: y - 12 });
    x += w + 3;
  }
  // sombra suave embaixo, para os painéis lerem bem
  const s = g.createLinearGradient(0, 1440, 0, 1920);
  s.addColorStop(0, 'rgba(20,8,30,0)'); s.addColorStop(0.35, 'rgba(20,8,30,.45)'); s.addColorStop(1, 'rgba(20,8,30,.75)');
  g.fillStyle = s; g.fillRect(0, 1440, 1080, 480);
}
const tetoEm = (x) => (tetos.find(t => x >= t.x0 && x < t.x1) ?? tetos[0]).y;

const nuvens = Array.from({ length: 6 }, (_, i) => ({ x: i * 210 - 60, y: 470 + (i * 263) % 640, s: 0.7 + (i % 3) * 0.25 }));

/* ---------- estado ---------- */
let pipas = [];   // voando | caindo | saindo
let ataques = []; // cerol indo de uma pipa até a linha da outra
let raios = [];
let linhas = [];  // pedaço de linha que sobra preso na laje depois do corte
let brilhos = []; // brilho da faísca no ponto do corte
const parts = [];
let tempestade = 0, flash = 0, vento = 0, totalCortes = 0, ultimoTreme = 0, ultimoImpacto = 0;
let lider = null, noCeu = -1, flutuando = 0;
let destaque = null; // usuário mostrado no cartão do último presente

const voando = () => pipas.filter(p => p.estado === 'voando');
const embaralhar = (l) => l.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]);
const cortarNome = (nome, n = 12) => { const l = Array.from(nome); return l.length > n ? l.slice(0, n - 1).join('') + '…' : nome; };

function matiz(user) {
  let h = 0;
  for (const ch of String(user)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

function soltar(x, y, n, { cor = '#fff', vel = 220, vida = 0.8, tam = 6, grav = 0, risco = false } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = vel * (0.3 + Math.random() * 0.7);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, v: vida * (0.6 + Math.random() * 0.4), m: vida,
      cor: Array.isArray(cor) ? cor[Math.floor(Math.random() * cor.length)] : cor, tam, grav, risco });
  }
  if (parts.length > 700) parts.splice(0, parts.length - 700);
}

// texto flutuante do kit, com teto para a tempestade não encher a tela de DOM
function flutua(opcoes) {
  if (flutuando >= 10) return;
  flutuando++;
  setTimeout(() => flutuando--, 1150);
  // não deixa subir por cima da legenda do topo
  flutuar(palco, { ...opcoes, y: Math.max(640, opcoes.y) });
}

// lugar no céu longe das outras pipas (melhor de 14 sorteios)
function lugarLivre() {
  const outras = voando();
  let melhor = null, md = -1;
  for (let i = 0; i < 14; i++) {
    const x = 110 + Math.random() * 860, y = 560 + Math.random() * 580;
    let d = 9999;
    for (const p of outras) d = Math.min(d, Math.hypot(p.hx - x, (p.hy - y) * 1.3));
    if (d > md) { md = d; melhor = { x, y }; }
  }
  return melhor;
}

// mão de quem empina, em cima da laje
const mao = (p) => ({ x: p.ax + 9, y: p.ay - 32 });
function pontoLinha(p, u) {
  const m = mao(p), fx = p.x, fy = p.y + 10;
  const cx = (m.x + fx) / 2 + 40 + vento * 0.4, cy = (m.y + fy) / 2 + 80;
  const a = (1 - u) ** 2, b = 2 * (1 - u) * u, c = u * u;
  return { x: a * m.x + b * cx + c * fx, y: a * m.y + b * cy + c * fy };
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
  const ax = Math.min(1040, Math.max(40, 540 + (x - 540) * 0.7 + (Math.random() - 0.5) * 200));
  p = { user: ev.user, nome, fotoUrl: ev.foto, cor: `hsl(${h} 92% 58%)`, cor2: `hsl(${(h + 150) % 360} 92% 62%)`,
    cor3: `hsl(${(h + 60) % 360} 95% 70%)`, estilo: h % 3,
    hx: x, hy: y, x, y: tetoEm(ax) - 40, ax, ay: tetoEm(ax),
    fase: Math.random() * TAU, tam: 1, escudo: 0, estado: 'voando', ultimo: agora, subida: 0, pulo: 0,
    alfa: 1, rot: 0, inc: 0, vx: 0, vy: 0, vr: 0, alvejado: false, cortes: 0 };
  pipas.push(p);
  avisar(html`🪁 <b>${nome}</b> soltou a pipa`);
  tocar('tecla');
  return p;
}

/* ---------- cartão "último presente" e ranking ---------- */
function mostrarDestaque(p, acao) {
  destaque = p.user;
  const card = $('destaque');
  card.style.setProperty('--cor', p.cor);
  $('destaqueAvatar').replaceChildren(avatar({ user: p.user, nome: p.nome, foto: p.fotoUrl }));
  $('destaqueQuem').textContent = p.nome;
  $('destaqueAcao').textContent = acao;
  atualizarComboDestaque();
  animar(card);
}

function atualizarComboDestaque() {
  const n = destaque ? combo.atual(destaque) : 0;
  const el = $('destaqueCombo');
  if (n >= 2) { el.textContent = `COMBO x${n}`; el.classList.add('on'); animar(el); }
  else el.classList.remove('on');
}

function mostrarRanking(novo = null) {
  const top = ranking.top(5);
  lider = top[0]?.user ?? null;
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'ranking-item vazio';
    li.textContent = 'Ninguém cortou ainda. Mande ✨ e corte a primeira!';
    return $('ranking').replaceChildren(li);
  }
  pintarRanking($('ranking'), top, { destaque: novo });
}

// conta um corte para o autor: ranking, combo e marcos
function contarCorte(autor) {
  totalCortes++;
  contaCortes(totalCortes);
  autor.cortes++;
  ranking.somar({ user: autor.user, nome: autor.nome, foto: autor.fotoUrl }, 1, { cor: autor.cor });
  mostrarRanking(autor.user);
  const n = combo.registrar(autor.user);
  if (autor.user === destaque) atualizarComboDestaque();
  if (n >= 2) {
    tocar('combo', n);
    flutua({ x: autor.x, y: autor.y - 130 * autor.tam, texto: `COMBO x${n}`, cor: '#ffd23f', tamanho: 60 });
  }
  if (MARCOS.includes(n)) {
    tocar('vitoria');
    confete(palco, { qtd: 70 });
    tremer(palco, true);
    flutua({ x: 540, y: 900, texto: `${n} SEGUIDAS!`, cor: '#ffd23f', tamanho: 120 });
    particulas(palco, { x: autor.x, y: autor.y, qtd: 24, forca: 1.4, cores: [autor.cor, '#ffd23f', '#fff'] });
  }
}

function cortar(alvo, autor, forcar = false) {
  alvo.alvejado = false;
  if (alvo.estado !== 'voando') return;
  const pt = pontoLinha(alvo, 0.8);
  if (alvo.escudo > 0 && !forcar) {
    alvo.escudo--; alvo.tam = Math.max(1, alvo.tam - 0.08);
    soltar(alvo.x, alvo.y, 22, { cor: ['#3df2c2', '#fff'], vel: 300 });
    flutua({ x: alvo.x, y: alvo.y - 90, texto: '🛡️ AGUENTOU!', cor: '#3df2c2', tamanho: 54 });
    tocar('tique');
    return;
  }
  alvo.estado = 'caindo';
  alvo.vx = (Math.random() - 0.5) * 140; alvo.vy = -90; alvo.vr = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3);
  linhas.push({ p: alvo, x: pt.x, y: pt.y, v: 1.3 });
  // faísca no ponto em que a linha arrebentou
  brilhos.push({ x: pt.x, y: pt.y, v: 0.45 });
  soltar(pt.x, pt.y, 26, { cor: ['#fff6c0', '#ffd23f', '#ff9a3d', '#fff'], vel: 520, vida: 0.55, tam: 4, grav: 600, risco: true });
  soltar(alvo.x, alvo.y, 18, { cor: [alvo.cor, alvo.cor2, '#fff'], vel: 300, vida: 0.9, tam: 7 });
  flutua({ x: pt.x, y: pt.y - 30, texto: 'CORTOU!', cor: '#ff3d7f', tamanho: 68 });
  const agora = performance.now();
  if (agora - ultimoImpacto > 120) { tocar('impacto'); ultimoImpacto = agora; }
  contarCorte(autor);
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
  if (acao === 'crescer') {
    p.tam = Math.min(1.6, p.tam + 0.1 * q);
    p.escudo = Math.min(ESCUDO_MAX, p.escudo + q);
    particulas(palco, { x: p.x, y: p.y, emoji: emojiDoPresente(ev.presenteNome, '🛡️'), qtd: Math.min(8, 2 + q * 2), forca: 0.7 });
    flutua({ x: p.x, y: p.y - 110 * p.tam, texto: `+${q} 🛡️`, cor: '#3df2c2', tamanho: 58 });
    tocar('ponto');
    mostrarDestaque(p, `🛡️ ESCUDO x${p.escudo}`);
  } else if (acao === 'tempestade') {
    const rivais = embaralhar(voando().filter(k => k !== p && !k.alvejado));
    const n = Math.ceil(rivais.length * (1 - 0.5 ** q));
    tempestade = Math.min(8, tempestade + 2.5 + n * 0.15);
    rivais.slice(0, n).forEach((alvo, i) => { alvo.alvejado = true; raios.push({ alvo, autor: p, t: -(0.5 + i * 0.16), pts: null }); });
    flutua({ x: 540, y: 820, texto: '⛈️ TEMPESTADE!', cor: '#b9c8ff', tamanho: 110 });
    tremer(palco, true);
    tocar('virada');
    mostrarDestaque(p, n ? `⛈️ RAIO EM ${n}` : '⛈️ TEMPESTADE');
  } else {
    const n = (cfg.cortes?.[acao] ?? 1) * q;
    const alvos = embaralhar(voando().filter(k => k !== p && !k.alvejado)).slice(0, n);
    particulas(palco, { x: p.x, y: p.y, emoji: emojiDoPresente(ev.presenteNome, '✂️'), qtd: Math.min(6, 2 + q), forca: 0.6 });
    mostrarDestaque(p, alvos.length ? `✂️ VAI CORTAR ${alvos.length}` : '✂️ SEM RIVAIS');
    if (!alvos.length) return avisar(html`✂️ <b>${p.nome}</b> afiou a linha… sem rivais`);
    alvos.forEach((alvo, i) => { alvo.alvejado = true; ataques.push({ de: p, alvo, t: -i * 0.28, dur: 0.5 }); });
  }
}

/* ---------- loop ---------- */
function zigue(x0, y0, x1, y1) {
  const pts = [[x0, y0]];
  for (let i = 1; i < 10; i++) { const f = i / 10; pts.push([x0 + (x1 - x0) * f + (Math.random() - 0.5) * 100, y0 + (y1 - y0) * f]); }
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
      const x = p.hx + vento * (0.5 + p.hy / 2600) + Math.sin(t * 1.2 + p.fase) * 18;
      const alvoY = p.hy + Math.sin(t * 1.6 + p.fase * 1.3) * 14 - Math.sin(p.pulo * Math.PI) * 50;
      p.x = p.ax + (x - p.ax) * e;
      p.y = p.ay - 40 + (alvoY - p.ay + 40) * e;
      p.inc = vento * 0.004 + Math.sin(t * 1.2 + p.fase) * 0.09;
    } else if (p.estado === 'caindo') {
      p.vy = Math.min(p.vy + 320 * dt, 520);
      p.x += (p.vx + vento * 0.8) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > 1450) p.alfa -= dt * 2.5;
    } else {
      p.y -= 140 * dt; p.alfa -= dt * 1.4;
    }
  }
  pipas = pipas.filter(p => p.alfa > 0 && p.y < 2100);

  for (const a of ataques) {
    a.t += dt;
    if (a.t >= 0 && a.t < a.dur && a.de.estado === 'voando') {
      const pt = pontoLinha(a.alvo, 0.8), f = a.t / a.dur;
      soltar(a.de.x + (pt.x - a.de.x) * f, a.de.y + (pt.y - a.de.y) * f, 1, { cor: ['#ff3d7f', '#ffd23f'], vel: 80, vida: 0.4, tam: 5 });
    }
    if (a.t >= a.dur) cortar(a.alvo, a.de);
  }
  ataques = ataques.filter(a => a.t < a.dur);

  for (const r of raios) {
    r.t += dt;
    if (r.t >= 0 && !r.pts) {
      r.pts = zigue(r.alvo.x + (Math.random() - 0.5) * 300, 440, r.alvo.x, r.alvo.y);
      flash = 1;
      const agora = performance.now();
      if (agora - ultimoTreme > 220) { tremer(palco); ultimoTreme = agora; }
      cortar(r.alvo, r.autor, true);
    }
  }
  raios = raios.filter(r => r.t < 0.35);

  tempestade = Math.max(0, tempestade - dt);
  flash = Math.max(0, flash - dt * 3);
  linhas = linhas.filter(l => (l.v -= dt) > 0);
  brilhos = brilhos.filter(c => (c.v -= dt) > 0);
  for (const n of nuvens) { n.x += (16 + vento * 0.25) * dt * n.s; if (n.x > 1250) n.x = -300; if (n.x < -320) n.x = 1240; }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if ((p.v -= dt) <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
    p.vx *= 1 - dt * 1.5; p.vy *= 1 - dt * 1.5;
  }
  const n = voando().length;
  if (n !== noCeu) { contaCeu(n, n > noCeu && noCeu >= 0); noCeu = n; }
}

// texto com contorno grosso, no estilo .txt-jogo
function textoJogo(txt, x, y, tam, cor = '#fff') {
  ctx.font = `${tam}px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = tam * 0.24; ctx.strokeStyle = CONTORNO;
  ctx.strokeText(txt, x, y + tam * 0.07);
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = cor; ctx.fillText(txt, x, y);
}

function desenharAvatar(x, y, r, p) {
  const img = foto(p.fotoUrl);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (img) { ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); }
  else {
    ctx.fillStyle = corDoNick(p.user); ctx.fill();
    ctx.fillStyle = CONTORNO; ctx.font = `${r * 0.95}px ${FONTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(iniciais(p.nome), x, y + 2);
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
}

function losango(s) {
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0.85 * s, -0.2 * s); ctx.lineTo(0, 1.15 * s); ctx.lineTo(-0.85 * s, -0.2 * s); ctx.closePath();
}

function desenharPipa(p, t) {
  const s = 48 * p.tam;
  const ang = p.inc + p.rot;
  ctx.globalAlpha = Math.max(0, Math.min(1, p.alfa));
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(ang);
  // bolha de escudo
  if (p.escudo && p.estado === 'voando') {
    const pulsa = 0.5 + 0.2 * Math.sin(t * 5 + p.fase);
    ctx.fillStyle = `rgba(61,242,194,${0.12 + 0.04 * p.escudo})`;
    ctx.beginPath(); ctx.arc(0, 0, 1.35 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(61,242,194,${pulsa})`; ctx.lineWidth = 3 + p.escudo; ctx.stroke();
  }
  // rabiola com fitinhas
  const cauda = [];
  let cx = 0, cy = 1.15 * s;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  for (let i = 1; i <= 11; i++) {
    cx = Math.sin(t * 4 + i * 0.55 + p.fase) * i * 2.4 - vento * 0.05 * i;
    cy = 1.15 * s + i * 12 * p.tam;
    cauda.push([cx, cy]); ctx.lineTo(cx, cy);
  }
  ctx.strokeStyle = CONTORNO; ctx.lineWidth = 3; ctx.stroke();
  const fitas = [p.cor, '#fff', p.cor2];
  for (let i = 1; i < 11; i += 2) {
    const [fx, fy] = cauda[i];
    ctx.fillStyle = fitas[(i >> 1) % 3];
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - 15, fy - 9); ctx.lineTo(fx - 15, fy + 9); ctx.closePath();
    ctx.moveTo(fx, fy); ctx.lineTo(fx + 15, fy - 9); ctx.lineTo(fx + 15, fy + 9); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = CONTORNO; ctx.stroke();
  }
  // corpo: losango com desenho variado por dono
  if (p.user === lider && p.estado === 'voando') { ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 34; }
  else if (p.escudo) { ctx.shadowColor = '#3df2c2'; ctx.shadowBlur = 16 + p.escudo * 5; }
  losango(s); ctx.fillStyle = p.cor; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.save(); losango(s); ctx.clip();
  ctx.fillStyle = p.cor2;
  if (p.estilo === 0) ctx.fillRect(0, -s, s, 2.2 * s);
  else if (p.estilo === 1) { ctx.fillRect(-s, -s, s, 0.8 * s); ctx.fillRect(0, -0.2 * s, s, 1.4 * s); }
  else { ctx.fillRect(-0.24 * s, -s, 0.48 * s, 2.2 * s); ctx.fillStyle = p.cor3; ctx.fillRect(-s, -0.34 * s, 2 * s, 0.26 * s); }
  // brilho em cima
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-s, -s, 2 * s, 0.55 * s);
  ctx.restore();
  // varetas e contorno
  ctx.strokeStyle = 'rgba(26,16,48,.6)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, 1.15 * s); ctx.moveTo(-0.85 * s, -0.2 * s); ctx.quadraticCurveTo(0, -0.45 * s, 0.85 * s, -0.2 * s); ctx.stroke();
  losango(s); ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = CONTORNO; ctx.stroke();
  ctx.restore();
  // avatar do dono no meio da pipa
  const r = 0.4 * s;
  desenharAvatar(p.x + Math.sin(ang) * 0.1 * s, p.y - Math.cos(ang) * 0.1 * s, r, p);
  ctx.globalAlpha = 1;
}

function etiqueta(p) {
  const s = 48 * p.tam;
  const y = p.y - s - 34;
  ctx.globalAlpha = Math.max(0, Math.min(1, p.alfa));
  let txt = cortarNome(p.nome);
  if (p.cortes) txt += ` ✂️${p.cortes}`;
  if (p.escudo) txt += ` 🛡️${p.escudo}`;
  ctx.font = `32px ${FONTE}`;
  const meia = ctx.measureText(txt).width / 2 + 10;
  const x = Math.min(1080 - meia, Math.max(meia, p.x)); // não corta nas bordas
  textoJogo(txt, x, y, 32, p.user === lider ? '#ffd23f' : '#fff');
  if (p.user === lider) {
    ctx.font = `46px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('👑', x, y - 44 + Math.sin(performance.now() / 300) * 4);
  }
  ctx.globalAlpha = 1;
}

function desenharNuvem(n, cor, sombra) {
  const partes = [[0, 0, 70], [70, -26, 90], [150, 0, 70], [75, 22, 80]];
  ctx.fillStyle = sombra;
  for (const [dx, dy, r] of partes) { ctx.beginPath(); ctx.ellipse(n.x + dx * n.s, n.y + (dy + 14) * n.s, r * n.s * 1.3, r * n.s * 0.6, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = cor;
  for (const [dx, dy, r] of partes) { ctx.beginPath(); ctx.ellipse(n.x + dx * n.s, n.y + dy * n.s, r * n.s * 1.3, r * n.s * 0.6, 0, 0, TAU); ctx.fill(); }
}

function quemEmpina(p) {
  // bonequinho na laje segurando a linha
  ctx.fillStyle = CONTORNO;
  ctx.beginPath(); ctx.arc(p.ax, p.ay - 36, 7, 0, TAU); ctx.fill();
  ctx.fillRect(p.ax - 6, p.ay - 28, 12, 28);
  ctx.strokeStyle = CONTORNO; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(p.ax, p.ay - 24); ctx.lineTo(p.ax + 9, p.ay - 32); ctx.stroke();
}

function desenhar(t) {
  ctx.clearRect(0, 0, 1080, 1920);
  const k = Math.min(1, tempestade);
  if (comCeu) ctx.drawImage(ceu, 0, 0);
  for (const n of nuvens) {
    desenharNuvem(n, k > 0 ? `rgba(${255 - 140 * k},${214 - 110 * k},${230 - 90 * k},.6)` : 'rgba(255,214,230,.6)',
      k > 0 ? 'rgba(60,50,90,.4)' : 'rgba(200,100,150,.35)');
  }
  ctx.drawImage(cidade, 0, 0);
  const vivas = voando().sort((a, b) => a.hy - b.hy);
  // linhas das pipas até a laje
  ctx.lineWidth = 2.5;
  for (const p of vivas) {
    const m = mao(p), c = pontoLinha(p, 0.5);
    ctx.strokeStyle = p.escudo ? 'rgba(61,242,194,.8)' : 'rgba(255,255,255,.6)';
    ctx.beginPath(); ctx.moveTo(m.x, m.y);
    ctx.quadraticCurveTo(2 * c.x - (m.x + p.x) / 2, 2 * c.y - (m.y + p.y + 10) / 2, p.x, p.y + 10);
    ctx.stroke();
  }
  // linha que sobrou presa na laje, caindo frouxa
  for (const l of linhas) {
    const m = mao(l.p), queda = (1.3 - l.v) * 420;
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * l.v / 1.3})`;
    ctx.beginPath(); ctx.moveTo(m.x, m.y);
    ctx.quadraticCurveTo((m.x + l.x) / 2 + 60, (m.y + l.y) / 2 + 160 + queda, l.x + 30, Math.min(m.y, l.y + queda));
    ctx.stroke();
  }
  for (const p of pipas) if (p.estado === 'voando' || p.estado === 'caindo') quemEmpina(p);
  // pipas caindo levam um pedaço da linha
  for (const p of pipas) {
    if (p.estado === 'voando') continue;
    if (p.estado === 'caindo') {
      ctx.globalAlpha = Math.max(0, p.alfa) * 0.7;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      for (let i = 1; i <= 6; i++) ctx.lineTo(p.x + Math.sin(t * 6 + i) * 10 * i * 0.4 - p.vx * 0.05 * i, p.y - i * 26);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    desenharPipa(p, t);
  }
  for (const p of vivas) desenharPipa(p, t);
  for (const p of vivas) etiqueta(p);
  // cerol: linha brilhante indo até a linha do rival
  for (const a of ataques) {
    if (a.t < 0 || a.de.estado !== 'voando') continue;
    const f = Math.min(1, a.t / a.dur), pt = pontoLinha(a.alvo, 0.8);
    ctx.save();
    ctx.shadowColor = '#ff3d7f'; ctx.shadowBlur = 24; ctx.strokeStyle = '#ffe0ea'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(a.de.x, a.de.y + 10);
    ctx.lineTo(a.de.x + (pt.x - a.de.x) * f, a.de.y + 10 + (pt.y - a.de.y - 10) * f); ctx.stroke();
    ctx.restore();
  }
  for (const c of brilhos) {
    const r = 30 + (0.45 - c.v) * 260;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
    g.addColorStop(0, `rgba(255,250,210,${c.v * 2})`); g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.fill();
  }
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.v / p.m);
    if (p.risco) {
      ctx.strokeStyle = p.cor; ctx.lineWidth = p.tam; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); ctx.stroke();
    } else { ctx.fillStyle = p.cor; ctx.beginPath(); ctx.arc(p.x, p.y, p.tam * (0.4 + 0.6 * p.v / p.m), 0, TAU); ctx.fill(); }
  }
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
  if (k > 0) {
    ctx.fillStyle = `rgba(12,10,40,${0.5 * k})`; ctx.fillRect(0, 0, 1080, 1920);
    // nuvem carregada embaixo do topo
    ctx.fillStyle = `rgba(40,36,70,${0.9 * k})`;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(i * 135 + Math.sin(t + i) * 10, 445, 120, 50, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = `rgba(170,200,255,${0.4 * k})`; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const x = ((i * 137 + t * 260) % 1240) - 80, y = ((i * 251 + t * 1700) % 1500) + 440;
      ctx.moveTo(x, y); ctx.lineTo(x - 14, y + 46);
    }
    ctx.stroke();
  }
  for (const r of raios) {
    if (!r.pts) continue;
    ctx.save();
    ctx.shadowColor = '#b9c8ff'; ctx.shadowBlur = 34; ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
    ctx.globalAlpha = Math.max(0, 1 - r.t / 0.35);
    ctx.beginPath(); r.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.restore();
  }
  if (flash > 0) { ctx.fillStyle = `rgba(220,230,255,${flash * 0.4})`; ctx.fillRect(0, 0, 1080, 1920); }
  if (!vivas.length && !pipas.length) {
    const pulo = Math.sin(t * 4) * 8;
    textoJogo('COMENTE E SOLTE', 540, 820 + pulo, 76);
    textoJogo('A SUA PIPA! 🪁', 540, 910 + pulo, 76, '#ffd23f');
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
function presenteFalso(acao, user, q = 1 + Math.floor(Math.random() * 3)) {
  const ref = cfg.acoes?.[acao]?.[0];
  if (ref === undefined) return null;
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
// C: a mesma pessoa corta várias seguidas (testa o combo)
function rajadaDeCortes() {
  const quem = NICKS_TESTE[Math.floor(Math.random() * NICKS_TESTE.length)];
  const acao = Object.keys(cfg.cortes ?? {})[0] ?? 'cortar';
  for (let i = 0; i < 4; i++) setTimeout(() => { const ev = presenteFalso(acao, quem, 1); if (ev) aoEvento(ev); }, i * 700);
}

teclas({
  t: rajada,
  c: rajadaDeCortes,
  r: () => {
    pipas = []; ataques = []; raios = []; linhas = []; brilhos = []; parts.length = 0;
    ranking.zerar(); combo.zerar(); tempestade = 0; totalCortes = 0; contaCortes(0, false);
    mostrarRanking();
  }
});

mostrarRanking();
requestAnimationFrame(quadro);
conectar(aoEvento);
