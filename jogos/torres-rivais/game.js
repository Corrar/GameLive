import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, criarTimes, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
aplicarFundo(cfg.fundo);
escalarPalco(palco);

const TIMES = cfg.times;
const META = cfg.meta ?? 2000;
const BLOCOS = cfg.blocos ?? {};
const VENCEDOR_MS = 5000;
const MAX_TEXTOS = 40, MAX_PARTICULAS = 300, MAX_CAINDO = 80;
const CHAO = 1640, VISTA = 800;           // torre ocupa de CHAO até CHAO - VISTA
const TORRE_X = [300, 780], TORRE_L = 260;
const PASSOS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const EMOJI = { rose: '🌹', gg: '✨', doughnut: '🍩', galaxy: '🌌' };
const FONTE = '"Segoe UI", system-ui, sans-serif';
const fmt = (n) => Math.floor(n).toLocaleString('pt-BR');

TIMES.forEach((t, i) => { palco.style.setProperty('--cor' + i, t.cor); $('nome' + i).textContent = t.nome; });
$('titulo').textContent = cfg.titulo ?? 'TORRES RIVAIS';
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
const legenda = [`🏁 meta ${fmt(META)}`];
for (const [acao, refs] of Object.entries(cfg.acoes ?? {})) legenda.push(`${refs.map(rotulo).join(' / ')} +${fmt(BLOCOS[acao] ?? 0)}`);
for (const t of legenda) $('legenda').appendChild(document.createElement('span')).textContent = t;

const times = criarTimes(cfg.palavras);
const salvo = lembrar('torres-rivais:placar', null);
let placar = Array.isArray(salvo) && salvo.length === 2 && salvo.every(Number.isFinite) ? salvo : [0, 0];
let alt = [0, 0], vis = [0, 0], guardado = [0, 0];
let faixa = 40, fim = null, aviso = null, tremor = 0, clarão = 0;
let textos = [], parts = [], caindo = [];
const avisar = avisos($('avisos'), { max: 3 });
const idx = (t) => t === 'A' ? 0 : 1;

function hud() {
  const n = times.tamanho();
  [n.A, n.B].forEach((g, i) => {
    $('info' + i).textContent = `👥 ${g} ${g === 1 ? 'pessoa' : 'pessoas'} · 🏆 ${placar[i]}`;
    $('barra' + i).style.transform = `scaleX(${Math.min(1, alt[i] / META)})`;
  });
}

const pxBloco = () => VISTA / faixa;
const topo = (i) => CHAO - vis[i] * pxBloco();

function flutuar(i, txt, y, grande = false) {
  textos.push({ x: TORRE_X[i] + (Math.random() - .5) * 120, y, txt, cor: TIMES[i].cor,
    vida: grande ? 1.8 : 1.2, max: grande ? 1.8 : 1.2, tam: grande ? 80 : 34 });
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

// Soma blocos ao time i; durante a tela de vencedor guarda para a próxima rodada.
function construir(i, n) {
  if (fim) { guardado[i] += n; return; }
  alt[i] += n;
  const k = Math.min(14, Math.ceil(Math.sqrt(n)));
  for (let j = 0; j < k; j++) {
    caindo.push({ i, x: TORRE_X[i] + (Math.random() - .5) * (TORRE_L - 60), y: 700 - Math.random() * 400 - j * 40,
      vy: 200, rot: (Math.random() - .5) * .6 });
  }
  if (caindo.length > MAX_CAINDO) caindo.splice(0, caindo.length - MAX_CAINDO);
  if (n >= 100) {
    tremor = Math.min(36, 10 + n / 40);
    clarão = n >= 500 ? .5 : .2;
    soltar(n >= 500 ? 90 : 40, TORRE_X[i], topo(i), TIMES[i].cor, 750);
    soltar(30, TORRE_X[i], topo(i), '#ffc23d', 550);
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
  palco.appendChild(aviso);
  for (let k = 0; k < 6; k++) soltar(25, 100 + k * 176, 760, [TIMES[i].cor, '#ffc23d', '#ffffff'][k % 3], 650);
  tremor = 30;
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
  hud();
}

function aoEvento(ev) {
  if (ev.tipo === 'comentario') {
    const t = times.pelaPalavra(ev);
    if (!t) return;
    flutuar(idx(t), `👤 ${String(ev.nome || ev.user).slice(0, 14)}`, CHAO - 40 - Math.random() * 160);
    hud();
    return;
  }
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao) return;
  const i = idx(times.doUsuario(ev.user));
  const q = ev.quantidade ?? 1;
  const n = (BLOCOS[acao] ?? 0) * q;
  construir(i, n);
  flutuar(i, `+${fmt(n)}`, Math.max(820, topo(i) - 60), n >= 30);
  hud();
  avisar(html`<span class="t${i}"><b>${ev.nome || ev.user}</b> mandou ${q}× ${ev.presenteNome} → <span class="mais">+${fmt(n)} ${TIMES[i].nome}</span></span>`);
}

/* ---------- desenho ---------- */

const cv = $('cena'), ctx = cv.getContext('2d');

function mistura(hex, f) {   // clareia (f > 0) ou escurece (f < 0) uma cor #rrggbb
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)));
  return `rgb(${c})`;
}
const tons = TIMES.map(t => [mistura(t.cor, 0), mistura(t.cor, -.18), mistura(t.cor, -.55)]);

function torre(i, px) {
  const x0 = TORRE_X[i] - TORRE_L / 2;
  const passo = PASSOS.find(p => p * px >= 26) ?? PASSOS.at(-1);
  const hRow = passo * px;
  const linhas = vis[i] / passo;
  const cheias = Math.floor(linhas);
  // passo >= 26 px por fileira: no máximo ~35 fileiras por torre, qualquer que seja a altura
  for (let r = 0; r <= cheias; r++) {
    const h = r < cheias ? hRow : (linhas - cheias) * hRow;
    if (h <= .5) break;
    const y = CHAO - r * hRow - h;
    ctx.fillStyle = tons[i][r % 2];
    ctx.fillRect(x0, y, TORRE_L, h);
    ctx.fillStyle = tons[i][2];
    ctx.fillRect(x0, y, TORRE_L, Math.min(3, h));
    const desloc = r % 2 ? TORRE_L / 8 : 0;
    for (let j = 0; j < 4; j++) ctx.fillRect(x0 + desloc + j * TORRE_L / 4, y, 3, h);
  }
  // bandeira + número no topo
  const yt = CHAO - vis[i] * px;
  ctx.fillStyle = '#f2f4ff';
  ctx.fillRect(TORRE_X[i] - 3, yt - 80, 6, 80);
  ctx.fillStyle = TIMES[i].cor;
  ctx.beginPath(); ctx.moveTo(TORRE_X[i] + 3, yt - 80); ctx.lineTo(TORRE_X[i] + 62, yt - 64); ctx.lineTo(TORRE_X[i] + 3, yt - 48); ctx.fill();
  const lider = vis[i] > vis[1 - i] + .5;
  ctx.font = `900 56px ${FONTE}`;
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#0b0d17';
  const rot = (lider ? '👑 ' : '') + fmt(vis[i] + .5);
  ctx.strokeText(rot, TORRE_X[i], yt - 120);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(rot, TORRE_X[i], yt - 120);
}

function cena(agora, dt) {
  const px = pxBloco();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  // régua de altura
  const marca = PASSOS.find(p => p * px >= 150) ?? PASSOS.at(-1);
  ctx.font = `800 32px ${FONTE}`;
  for (let v = marca; v <= faixa * 1.1 && v < META; v += marca) {
    const y = CHAO - v * px;
    if (y < 820) break;
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(40, y - 1, 1000, 2);
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillText(fmt(v), 540, y - 22);
  }

  // linha da meta
  const ym = CHAO - META * px;
  if (ym > 700) {
    ctx.setLineDash([24, 16]);
    ctx.strokeStyle = '#ffc23d';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(30, ym); ctx.lineTo(1050, ym); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `900 36px ${FONTE}`;
    ctx.fillStyle = '#ffc23d';
    ctx.fillText('🏁 META', 540, ym + 34);   // abaixo da linha, no vão entre as torres
  }

  torre(0, px);
  torre(1, px);

  // chão
  ctx.fillStyle = '#1b2036';
  ctx.fillRect(0, CHAO, 1080, 1920 - CHAO);
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.fillRect(0, CHAO, 1080, 6);

  // blocos caindo: somem ao tocar o topo da torre
  for (const b of caindo) {
    b.vy += 2600 * dt; b.y += b.vy * dt; b.rot *= .97;
    const yt = topo(b.i);
    if (b.y + 20 >= yt) { b.fora = true; soltar(4, b.x, yt, tons[b.i][0], 220, 600); continue; }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    ctx.fillStyle = tons[b.i][0];
    ctx.fillRect(-32, -20, 64, 40);
    ctx.fillStyle = tons[b.i][2];
    ctx.fillRect(-32, -20, 64, 5);
    ctx.restore();
  }
  caindo = caindo.filter(b => !b.fora);

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
    ctx.font = `900 ${s.tam}px ${FONTE}`;
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
  const suave = 1 - Math.exp(-dt * 3);
  vis = vis.map((v, i) => v + (alt[i] - v) * suave);
  // câmera: a torre mais alta fica a ~80% da vista; perto da meta, a linha da meta entra no quadro
  const alvo = Math.min(META * 1.06, Math.max(40, Math.max(...alt) * 1.3));
  faixa += (alvo - faixa) * (1 - Math.exp(-dt * 5));
  faixa = Math.max(faixa, Math.max(...vis) * 1.1);
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
  for (let k = 0; k < 20; k++) setTimeout(() => aoEvento(Math.random() < .5
    ? eventoFalso({ tipo: 'comentario', texto: cfg.palavras[Math.random() < .5 ? 'A' : 'B'][0] })
    : eventoFalso({ presenteNome: presentes[Math.floor(Math.random() * presentes.length)], quantidade: 1 + Math.floor(Math.random() * 3) })
  ), k * 120);
}

teclas({
  t: rajada,
  r: () => {
    placar = [0, 0];
    guardar('torres-rivais:placar', placar);
    times.zerar();
    guardado = [0, 0];
    novaRodada();
  }
});

hud();
requestAnimationFrame(quadro);
conectar(aoEvento);
