import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, criarTimes, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, avatar, animar, contador, particulas, flutuar as flutuarDom,
  tremer, confete, pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
// "cenario" (padrão) desenha céu e cidade; qualquer outro valor vale como antes (cor ou "transparente")
const cenario = (cfg.fundo ?? 'cenario') === 'cenario';
aplicarFundo(cenario ? '#1b1446' : cfg.fundo);
escalarPalco(palco);
ligarSom(cfg.som);

const TIMES = cfg.times;
const META = cfg.meta ?? 2000;
const BLOCOS = cfg.blocos ?? {};
const VENCEDOR_MS = 5000;
const MAX_TEXTOS = 40, MAX_PARTICULAS = 300, MAX_CAINDO = 80, MAX_ONDAS = 8;
const CHAO = 1490, VISTA = 670, TOPO = CHAO - VISTA;   // torre ocupa de CHAO até TOPO
const TORRE_X = [300, 780], TORRE_L = 260;
const PASSOS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const MARCOS = [10, 25, 50, 100, 250, 500];
const FONTE = '"Lilita One", "Baloo 2", Impact, sans-serif';
const CONTORNO = '#1a1030', OURO = '#ffd23f';
const fmt = (n) => Math.floor(n).toLocaleString('pt-BR');
try { await document.fonts.load(`40px ${FONTE}`); } catch { /* segue com a fonte reserva */ }

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
let alt = [0, 0], vis = [0, 0], guardado = [0, 0];
let faixa = 40, fim = null, aviso = null, tremor = 0, clarao = 0;
let textos = [], parts = [], caindo = [], ondas = [];
let rodadaMvp = new Map();   // quem mais construiu nesta rodada (para a faixa de vencedor)
const avisar = avisos($('avisos'), { max: 3 });
const combo = criarCombo({ janela: 4000 });
const ranking = criarRanking();
const contadores = [contador($('blocos0')), contador($('blocos1'))];
const timerCombo = [0, 0];
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

const pxBloco = () => VISTA / faixa;
const topo = (i) => CHAO - vis[i] * pxBloco();

function flutuar(i, txt, y, grande = false, cor = '#fff') {
  textos.push({ x: TORRE_X[i] + (Math.random() - .5) * 120, y, txt, cor,
    vida: grande ? 1.8 : 1.2, max: grande ? 1.8 : 1.2, tam: grande ? 78 : 40 });
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

function onda(x, y, cor, max = 520) {
  ondas.push({ x, y, cor, r: 20, max, vida: 1 });
  if (ondas.length > MAX_ONDAS) ondas.shift();
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
    particulas(palco, { x: TORRE_X[i] - 15, y: 420, qtd: 30, forca: 1.4, cores: [TIMES[i].cor, OURO, '#fff'] });
    flutuarDom(palco, { x: TORRE_X[i] - 15, y: 560, texto: `COMBO x${n}!`, cor: OURO, tamanho: 90 });
    tremer(palco, true);
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
  const k = Math.min(14, Math.ceil(Math.sqrt(n)));
  for (let j = 0; j < k; j++) {
    caindo.push({ i, x: TORRE_X[i] + (Math.random() - .5) * (TORRE_L - 80), y: Math.max(380, 760 - Math.random() * 200 - j * 30),
      vy: 150, vx: 0, rot: (Math.random() - .5) * .8, quiques: 0 });
  }
  if (caindo.length > MAX_CAINDO) caindo.splice(0, caindo.length - MAX_CAINDO);

  const yt = Math.max(TOPO + 60, topo(i));
  const galaxia = acao === 'arranhaceu' || n >= (BLOCOS.arranhaceu ?? 1000);
  if (galaxia) {
    // arranha-céu: explosão, onda de choque, clarão e tremida forte
    tremor = 40;
    clarao = .7;
    soltar(110, TORRE_X[i], yt, TIMES[i].cor, 850);
    soltar(50, TORRE_X[i], yt, OURO, 650);
    onda(TORRE_X[i], yt, TIMES[i].cor, 700);
    onda(TORRE_X[i], yt, '#ffffff', 480);
    particulas(palco, { x: TORRE_X[i], y: yt, qtd: 14, emoji: '🌌', forca: 1.5 });
    flutuarDom(palco, { x: 540, y: 1080, texto: 'ARRANHA-CÉU!', cor: OURO, tamanho: 130 });
    tremer(palco, true);
    tocar('impacto');
    setTimeout(() => tocar('virada'), 180);
  } else if (n >= 100) {
    tremor = Math.min(28, 10 + n / 30);
    clarao = .25;
    soltar(45, TORRE_X[i], yt, TIMES[i].cor, 700);
    soltar(25, TORRE_X[i], yt, OURO, 520);
    onda(TORRE_X[i], yt, TIMES[i].cor, 380);
    flutuarDom(palco, { x: TORRE_X[i], y: 1000, texto: 'NOVO ANDAR!', cor: TIMES[i].cor, tamanho: 76 });
    tremer(palco);
    tocar('impacto');
  } else {
    tocar('ponto');
  }
  const depois = lider();
  if (antes !== -1 && depois !== -1 && antes !== depois && !galaxia) {
    flutuarDom(palco, { x: 540, y: 1180, texto: 'VIRADA!', cor: TIMES[depois].cor, tamanho: 110 });
    tocar('virada');
  }
  if (alt[i] >= META) vencer(i);
}

function vencer(i) {
  placar[i]++;
  guardar('torres-rivais:placar', placar);
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
  for (let k = 0; k < 6; k++) soltar(25, 100 + k * 176, 760, [TIMES[i].cor, OURO, '#ffffff'][k % 3], 650);
  confete(palco, { cores: [TIMES[i].cor, OURO, '#fff', TIMES[1 - i].cor] });
  tremor = 30;
  tocar('vitoria');
  hud(false);
  fim = setTimeout(novaRodada, VENCEDOR_MS);
}

function novaRodada() {
  clearTimeout(fim);
  fim = null;
  aviso?.remove();
  // presentes que chegaram no intervalo valem na nova rodada (sem encerrar de cara)
  alt = guardado.map(g => Math.min(g, META * .5));
  guardado = [0, 0];
  caindo = [];
  rodadaMvp = new Map();
  combo.zerar();
  hud(false);
}

function aoEvento(ev) {
  if (ev.tipo === 'comentario') {
    const t = times.pelaPalavra(ev);
    if (!t) return;
    flutuar(idx(t), `+ ${String(ev.nome || ev.user).slice(0, 14)}`, CHAO - 40 - Math.random() * 160);
    return;
  }
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao) return;
  const i = idx(times.doUsuario(ev.user));
  const q = ev.quantidade ?? 1;
  const n = (BLOCOS[acao] ?? 0) * q;
  construir(i, n, acao);
  flutuar(i, `+${fmt(n)}`, Math.max(TOPO + 40, topo(i) - 60), n >= 30, OURO);
  particulas(palco, { x: TORRE_X[i], y: 760, qtd: Math.min(q, 5), emoji: cfg.emojis?.[acao] ?? emojiDoPresente(ev.presenteNome), forca: .7 });
  mostrarCombo(i, combo.registrar(i, q), q);
  mostrarUltimo(ev, i);

  ranking.somar(ev, n, { cor: TIMES[i].cor });
  pintarRanking($('ranking'), ranking.top(4), { destaque: ev.user });
  const r = rodadaMvp.get(ev.user) ?? { nome: ev.nome || ev.user, n: 0, i };
  r.n += n; r.i = i;
  rodadaMvp.set(ev.user, r);

  hud();
  avisar(html`<span class="t${i}"><b>${ev.nome || ev.user}</b> ${q}× ${ev.presenteNome} <span class="mais">+${fmt(n)}</span></span>`);
}

/* ---------- desenho ---------- */

const cv = $('cena'), ctx = cv.getContext('2d');

function mistura(hex, f) {   // clareia (f > 0) ou escurece (f < 0) uma cor #rrggbb
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)));
  return `rgb(${c})`;
}
// claro, base, escuro, sombra, brilho
const tons = TIMES.map(t => [mistura(t.cor, .12), mistura(t.cor, -.12), mistura(t.cor, -.5), mistura(t.cor, -.7), mistura(t.cor, .55)]);

// cenário fixo (céu, estrelas, cidade ao longe) desenhado uma vez numa tela fora do palco
const fundo = cenario ? desenharFundo() : null;
function desenharFundo() {
  const f = document.createElement('canvas');
  f.width = 1080; f.height = 1920;
  const g = f.getContext('2d');
  const ceu = g.createLinearGradient(0, 0, 0, CHAO);
  ceu.addColorStop(0, '#120c33');
  ceu.addColorStop(.32, '#3a2479');
  ceu.addColorStop(.62, '#a2408f');
  ceu.addColorStop(.84, '#ff7a6b');
  ceu.addColorStop(1, '#ffc46b');
  g.fillStyle = ceu;
  g.fillRect(0, 0, 1080, CHAO);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 90; k++) {
    g.globalAlpha = .3 + rnd() * .6;
    g.fillStyle = '#fff';
    const r = rnd() * 2.6 + .6;
    g.beginPath(); g.arc(rnd() * 1080, rnd() * 820, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  // sol no horizonte
  const sol = g.createRadialGradient(540, CHAO - 40, 10, 540, CHAO - 40, 620);
  sol.addColorStop(0, 'rgba(255,236,170,.95)');
  sol.addColorStop(.18, 'rgba(255,200,120,.55)');
  sol.addColorStop(1, 'rgba(255,160,120,0)');
  g.fillStyle = sol;
  g.fillRect(0, 0, 1080, CHAO);
  // nuvens
  g.fillStyle = 'rgba(255,255,255,.10)';
  for (const [x, y, w] of [[160, 520, 260], [880, 440, 300], [520, 300, 220], [960, 760, 200], [90, 860, 180]]) {
    g.beginPath(); g.ellipse(x, y, w / 2, w / 7, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x - w / 5, y - w / 10, w / 4, w / 7, 0, 0, Math.PI * 2); g.fill();
  }
  // cidade ao longe (duas camadas) com janelas acesas
  for (const [cor, hMin, hMax, larg, luz] of [['#7c3c86', 110, 330, 90, .35], ['#3b1f5e', 60, 220, 120, .6]]) {
    let x = -20;
    while (x < 1100) {
      const w = larg * (.6 + rnd() * .7), h = hMin + rnd() * (hMax - hMin);
      g.fillStyle = cor;
      g.fillRect(x, CHAO - h, w, h);
      g.fillStyle = `rgba(255,214,120,${luz})`;
      for (let wy = CHAO - h + 18; wy < CHAO - 14; wy += 26) {
        for (let wx = x + 12; wx < x + w - 14; wx += 22) if (rnd() < .35) g.fillRect(wx, wy, 9, 12);
      }
      x += w + 6 + rnd() * 30;
    }
  }
  return f;
}

function holofotes(agora) {
  for (const [x, fase] of [[120, 0], [960, 2]]) {
    const a = Math.sin(agora / 1900 + fase) * .35 + (x < 540 ? .25 : -.25);
    ctx.save();
    ctx.translate(x, CHAO);
    ctx.rotate(a);
    const gr = ctx.createLinearGradient(0, 0, 0, -1400);
    gr.addColorStop(0, 'rgba(255,240,200,.22)');
    gr.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-170, -1400); ctx.lineTo(170, -1400); ctx.lineTo(18, 0); ctx.fill();
    ctx.restore();
  }
}

function texto(t, x, y, tam, cor, contorno = CONTORNO) {
  ctx.font = `${tam}px ${FONTE}`;
  ctx.lineWidth = tam * .22;
  ctx.strokeStyle = contorno;
  ctx.fillStyle = contorno;
  ctx.fillText(t, x, y + tam * .07);
  ctx.strokeText(t, x, y);
  ctx.fillStyle = cor;
  ctx.fillText(t, x, y);
}

function tijolo(x, y, w, h, i) {
  ctx.fillStyle = tons[i][0];
  ctx.fillRect(x, y, w, h);
  if (h > 8) {
    ctx.fillStyle = tons[i][4];
    ctx.fillRect(x, y, w, Math.min(5, h * .18));
    ctx.fillStyle = tons[i][2];
    ctx.fillRect(x, y + h - Math.min(5, h * .18), w, Math.min(5, h * .18));
  }
}

function torre(i, px, agora) {
  const x0 = TORRE_X[i] - TORRE_L / 2;
  const passo = PASSOS.find(p => p * px >= 26) ?? PASSOS.at(-1);
  const hRow = passo * px;
  const linhas = vis[i] / passo;
  const cheias = Math.floor(linhas);
  const yt = CHAO - vis[i] * px;
  // sombra e brilho do time atrás da torre
  ctx.save();
  ctx.shadowColor = TIMES[i].cor;
  ctx.shadowBlur = 40;
  ctx.fillStyle = CONTORNO;
  ctx.fillRect(x0 - 6, yt - 6, TORRE_L + 12, CHAO - yt + 6);
  ctx.restore();
  // fileiras de tijolos: passo >= 26 px, no máximo ~30 fileiras por torre
  for (let r = 0; r <= cheias; r++) {
    const h = r < cheias ? hRow : (linhas - cheias) * hRow;
    if (h <= .5) break;
    const y = CHAO - r * hRow - h;
    const desloc = r % 2 ? TORRE_L / 8 : 0;
    const tw = TORRE_L / 4;
    for (let j = -1; j < 4; j++) {
      const bx = Math.max(x0, x0 + desloc + j * tw), bw = Math.min(x0 + TORRE_L, x0 + desloc + (j + 1) * tw) - bx;
      if (bw > 0) tijolo(bx + 2, y + 2, bw - 4, h - 3, i);
    }
  }
  // luz e sombra laterais (volume)
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.fillRect(x0, yt, 16, CHAO - yt);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.fillRect(x0 + TORRE_L - 26, yt, 26, CHAO - yt);
  // laje do topo
  ctx.fillStyle = CONTORNO;
  ctx.fillRect(x0 - 16, yt - 20, TORRE_L + 32, 24);
  ctx.fillStyle = tons[i][4];
  ctx.fillRect(x0 - 12, yt - 16, TORRE_L + 24, 9);
  ctx.fillStyle = tons[i][1];
  ctx.fillRect(x0 - 12, yt - 7, TORRE_L + 24, 7);
  // mastro e bandeira tremulando
  const xb = TORRE_X[i] + 70, onda1 = Math.sin(agora / 160 + i) * 8;
  ctx.fillStyle = '#f2f4ff';
  ctx.fillRect(xb - 4, yt - 110, 8, 92);
  ctx.fillStyle = TIMES[i].cor;
  ctx.strokeStyle = CONTORNO;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(xb + 4, yt - 110);
  ctx.quadraticCurveTo(xb + 40, yt - 110 + onda1, xb + 78, yt - 92);
  ctx.quadraticCurveTo(xb + 40, yt - 74 + onda1, xb + 4, yt - 72);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // coroa no líder
  if (vis[i] > vis[1 - i] + .5) {
    ctx.font = `76px ${FONTE}`;
    ctx.fillText('👑', TORRE_X[i] - 30, yt - 70 + Math.sin(agora / 250) * 8);
  }
}

function linhaMeta(px, agora) {
  const ym = CHAO - META * px;
  const pulso = .65 + Math.sin(agora / 220) * .35;
  const real = ym > TOPO - 10;
  const y = real ? ym : TOPO;
  ctx.save();
  ctx.shadowColor = OURO;
  ctx.shadowBlur = 30 * pulso;
  if (real) {
    // faixa quadriculada de chegada
    const t = 16;
    for (let x = 0, k = 0; x < 1080; x += t, k++) {
      ctx.fillStyle = k % 2 ? '#fff' : CONTORNO;
      ctx.fillRect(x, y - t, t, t);
      ctx.fillStyle = k % 2 ? CONTORNO : '#fff';
      ctx.fillRect(x, y, t, t);
    }
    ctx.fillStyle = OURO;
    ctx.fillRect(0, y - t - 6, 1080, 6);
    ctx.fillRect(0, y + t, 1080, 6);
  } else {
    // meta ainda longe: linha brilhante presa no alto da vista
    ctx.setLineDash([30, 18]);
    ctx.lineDashOffset = -agora / 30;
    ctx.strokeStyle = OURO;
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(1060, y); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  texto('🏁 META', 540, y + 54, 40, OURO);
  texto(real ? fmt(META) : `${fmt(META)} ▲`, 540, y + 100, 40, '#fff');
}

function cena(agora, dt) {
  const px = pxBloco();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  if (fundo) {
    ctx.drawImage(fundo, 0, 0);
    holofotes(agora);
  }

  // régua de altura
  const marca = PASSOS.find(p => p * px >= 150) ?? PASSOS.at(-1);
  for (let v = marca; v < META; v += marca) {
    const y = CHAO - v * px;
    if (y < TOPO + 160) break;
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    ctx.fillRect(440, y - 1, 200, 3);
    texto(fmt(v), 540, y - 24, 30, 'rgba(255,255,255,.75)');
  }

  torre(0, px, agora);
  torre(1, px, agora);
  linhaMeta(px, agora);

  // calçada e chão
  ctx.fillStyle = '#c9b7e8';
  ctx.fillRect(0, CHAO, 1080, 14);
  ctx.fillStyle = '#8a76b8';
  ctx.fillRect(0, CHAO + 14, 1080, 30);
  const chao = ctx.createLinearGradient(0, CHAO + 44, 0, 1920);
  chao.addColorStop(0, '#3a2763');
  chao.addColorStop(1, '#170f2e');
  ctx.fillStyle = chao;
  ctx.fillRect(0, CHAO + 44, 1080, 1920 - CHAO - 44);

  // placa de cada time na base: palavra para entrar + quantas pessoas
  const n = times.tamanho();
  [n.A, n.B].forEach((g, i) => {
    const txt = `COMENTE ${cfg.palavras[i ? 'B' : 'A'][0]} · 👥 ${g}`;
    ctx.fillStyle = CONTORNO;
    ctx.beginPath(); ctx.roundRect(TORRE_X[i] - 150, CHAO + 4, 300, 46, 23); ctx.fill();
    ctx.fillStyle = TIMES[i].cor;
    ctx.beginPath(); ctx.roundRect(TORRE_X[i] - 146, CHAO + 8, 292, 38, 19); ctx.fill();
    texto(txt, TORRE_X[i], CHAO + 28, 28, '#fff');
  });

  // blocos caindo: quicam no topo da torre e depois somem
  for (const b of caindo) {
    b.vy += 2600 * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.rot *= .97;
    const yt = topo(b.i);
    if (b.y + 22 >= yt && b.vy > 0) {
      b.y = yt - 22;
      if (b.quiques >= 2 || b.vy < 260) { b.fora = true; soltar(5, b.x, yt, tons[b.i][4], 240, 700); continue; }
      b.vy *= -.38;
      b.vx = (Math.random() - .5) * 160;
      b.rot = (Math.random() - .5) * .9;
      b.quiques++;
      b.x = Math.max(TORRE_X[b.i] - TORRE_L / 2 + 36, Math.min(TORRE_X[b.i] + TORRE_L / 2 - 36, b.x));
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.fillStyle = CONTORNO;
    ctx.fillRect(-38, -24, 76, 48);
    tijolo(-34, -20, 68, 40, b.i);
    ctx.restore();
  }
  caindo = caindo.filter(b => !b.fora);

  for (const o of ondas) {
    o.vida -= dt * 1.6; o.r += (o.max - o.r) * (1 - Math.exp(-dt * 6));
    ctx.globalAlpha = Math.max(0, o.vida);
    ctx.strokeStyle = o.cor;
    ctx.lineWidth = 18 * o.vida + 2;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.stroke();
  }
  ondas = ondas.filter(o => o.vida > 0);

  for (const p of parts) {
    p.vida -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.vida * 2));
    ctx.fillStyle = p.cor;
    ctx.fillRect(p.x - p.tam / 2, p.y - p.tam / 2, p.tam, p.tam);
  }
  parts = parts.filter(p => p.vida > 0 && p.y < 1960);

  for (const s of textos) {
    s.vida -= dt; s.y -= 90 * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, s.vida / s.max * 2.5));
    texto(s.txt, s.x, s.y, s.tam, s.cor);
  }
  textos = textos.filter(s => s.vida > 0);
  ctx.globalAlpha = 1;
}

let antes = performance.now();
function quadro(agora) {
  const dt = Math.min(.05, (agora - antes) / 1000);
  antes = agora;
  const suave = 1 - Math.exp(-dt * 3);
  vis = vis.map((v, i) => v + (alt[i] - v) * suave);
  // câmera: a torre mais alta fica a ~75% da vista; perto da meta, a linha da meta entra no quadro
  const alvo = Math.min(META * 1.08, Math.max(40, Math.max(...alt) * 1.4));
  faixa += (alvo - faixa) * (1 - Math.exp(-dt * 5));
  faixa = Math.max(faixa, Math.max(...vis) * 1.25);
  tremor *= Math.exp(-dt * 7);
  clarao = Math.max(0, clarao - dt * 1.5);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 1080, 1920);
  if (tremor > .5) ctx.translate((Math.random() - .5) * tremor, (Math.random() - .5) * tremor);
  cena(agora, dt);
  if (clarao > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(255,255,255,${clarao * .5})`;
    ctx.fillRect(0, 0, 1080, 1920);
  }
  requestAnimationFrame(quadro);
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
requestAnimationFrame(quadro);
conectar(aoEvento);
