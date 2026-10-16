import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, criarTimes, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, avatar, animar, contador, particulas, flutuar, tremer,
  confete, pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
// "arena" desenha o cenário; qualquer outra cor (ou "transparente") fica só com o jogo
const ARENA_FUNDO = (cfg.fundo ?? 'arena') === 'arena';
aplicarFundo(ARENA_FUNDO ? '#140a35' : cfg.fundo);
if (!ARENA_FUNDO) palco.classList.add('transparente');
escalarPalco(palco);
ligarSom(cfg.som);

const TIMES = cfg.times;
const LIMITE = cfg.limite ?? 100;
const FORCA = cfg.forca ?? {};
const DOBRO_MS = (cfg.dobroSegundos ?? 10) * 1000;
const DOBRO_MAX_MS = (cfg.dobroMaximoSegundos ?? 60) * 1000;
const VENCEDOR_MS = 5000;
const MAX_TEXTOS = 40, MAX_PARTICULAS = 300;
const MEIO = 540, CURSO = 340;            // marcador anda ±340 px até a linha do time
const ARRASTO = .5;                       // os bonecos andam metade do que a corda anda (ficam na tela)
const CORDA_Y = 1112, CHAO_Y = 1232;      // corda e pés dos bonecos
const ARQ = { y: 690, h: 290 };            // arquibancada
const GRAMA_Y = 980, GRAMA_FIM = 1300;
const CENTRO = [{ x: 280, y: 380 }, { x: 800, y: 380 }];  // número grande de cada time
const MARCOS = [10, 25, 50, 100, 250, 500, 1000];
const EMOJI_ACAO = { puxinho: '🌹', puxao: '✨', dobro: '🍩', superpuxao: '🌌' };
const fonte = (px) => `${px}px "Lilita One", "Baloo 2", Impact, sans-serif`;

TIMES.forEach((t, i) => {
  palco.style.setProperty('--cor' + i, t.cor);
  $('nome' + i).textContent = t.nome;
});
$('titulo').textContent = cfg.titulo ?? 'CABO DE GUERRA';

// dica: "Comente A → Meninos · B → Meninas"
$('dica').append('Comente ');
TIMES.forEach((t, i) => {
  const s = document.createElement('span');
  s.className = 't' + i;
  const b = document.createElement('b');
  b.textContent = cfg.palavras[i ? 'B' : 'A'][0];
  s.append(b, ` ${t.nome}`);
  $('dica').append(s, i ? '' : '  ·  ');
});

// presentes: emoji grande + efeito, metade de cada lado
function emojiDe(acao, refs) {
  const nome = refs.find(r => typeof r === 'string');
  return emojiDoPresente(nome, EMOJI_ACAO[acao] ?? '🎁');
}
const chips = Object.entries(cfg.acoes ?? {}).map(([acao, refs]) => {
  const chip = document.createElement('div');
  chip.className = 'chip-presente';
  const emoji = document.createElement('span');
  emoji.className = 'emoji';
  emoji.textContent = emojiDe(acao, refs);
  const efeito = document.createElement('span');
  efeito.className = 'efeito';
  efeito.textContent = acao === 'dobro' ? `x2 ${DOBRO_MS / 1000}s` : `PUXA ${FORCA[acao] ?? 0}`;
  chip.append(emoji, efeito);
  return chip;
});
const metade = Math.ceil(chips.length / 2);
$('presentes0').append(...chips.slice(0, metade));
$('presentes1').append(...chips.slice(metade));

/* ---------- estado ---------- */
const times = criarTimes(cfg.palavras);
const salvo = lembrar('cabo:placar', null);
let placar = Array.isArray(salvo) && salvo.length === 2 && salvo.every(Number.isFinite) ? salvo : [0, 0];
let pos = 0, vis = 0;                       // pos < 0 = lado do time 0; ±LIMITE encerra a rodada
let forca = [0, 0];                         // força puxada por cada time na rodada
let dobroAte = [0, 0], tensao = [0, 0], guardado = [0, 0], torcida = [0, 0];
let fim = null, faixa = null, vencedorAtual = -1, tremor = 0, clarao = 0, lider = 0;
let textos = [], parts = [];
const avisar = avisos($('avisos'), { max: 3 });
const combo = criarCombo({ janela: 3500 });
const ranking = criarRanking();
const contadores = [contador($('forca0')), contador($('forca1'))];
const timerCombo = [0, 0];
const idx = (t) => t === 'A' ? 0 : 1;

function hud(pular = true) {
  const n = times.tamanho();
  [n.A, n.B].forEach((g, i) => { $('gente' + i).textContent = `👥 ${g} ${g === 1 ? 'pessoa' : 'pessoas'}`; });
  const f0 = Math.max(0, Math.min(1, (LIMITE - pos) / (2 * LIMITE)));
  const pct = (f) => (f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  $('pct0').textContent = pct(f0);
  $('pct1').textContent = pct(1 - f0);
  contadores[0](forca[0], pular);
  contadores[1](forca[1], pular);
  $('trofeu0').textContent = placar[0];
  $('trofeu1').textContent = placar[1];
  $('rodada').textContent = `RODADA ${placar[0] + placar[1] + 1}`;
}

function textoCanvas(i, txt, grande = false) {
  textos.push({ x: (i ? 800 : 280) + (Math.random() - .5) * 220, y: grande ? 1000 : 1040 + Math.random() * 50,
    txt, cor: TIMES[i].cor, vida: grande ? 1.6 : 1.1, max: grande ? 1.6 : 1.1, tam: grande ? 70 : 36 });
  if (textos.length > MAX_TEXTOS) textos.splice(0, textos.length - MAX_TEXTOS);
}

function soltar(n, x, y, cor, forcaP, gravidade = 900) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = forcaP * (.3 + Math.random() * .7);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - forcaP * .4, g: gravidade, cor,
      tam: 6 + Math.random() * 10, vida: .6 + Math.random() * .8 });
  }
  if (parts.length > MAX_PARTICULAS) parts.splice(0, parts.length - MAX_PARTICULAS);
}

function mostrarCombo(i, n, ganho, presente) {
  if (n < 2) return;
  const el = $('combo' + i);
  el.textContent = `COMBO x${n}`;
  el.classList.add('on');
  animar(el);
  clearTimeout(timerCombo[i]);
  timerCombo[i] = setTimeout(() => el.classList.remove('on'), 3500);
  if (presente) tocar('combo', n);
  // passou de um marco (10, 25, 50...): explosão e tremida
  if (MARCOS.some(m => n - ganho < m && n >= m)) {
    particulas(palco, { x: CENTRO[i].x, y: 600, qtd: 30, forca: 1.4, cores: [TIMES[i].cor, '#ffd23f', '#fff'] });
    flutuar(palco, { x: CENTRO[i].x, y: 560, texto: `COMBO x${n}!`, cor: '#ffd23f', tamanho: 96 });
    tremer(palco, true);
    if (!presente) tocar('combo', n);
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

// Aplica força ao time i (já com o dobro); durante a tela de vencedor guarda para a próxima rodada.
function puxar(i, n) {
  const f = n * (performance.now() < dobroAte[i] ? 2 : 1);
  if (fim) { guardado[i] += f; return f; }
  pos += i ? f : -f;
  forca[i] += f;
  tensao[i] = Math.min(1, tensao[i] + .2 + f / 25);
  torcida[i] = Math.min(1, torcida[i] + .25 + f / 30);
  const off = (vis / LIMITE) * CURSO;
  soltar(Math.min(12, 2 + f), MEIO + off * ARRASTO + (i ? 260 : -260), CHAO_Y, 'rgba(210,190,140,.7)', 160, 300);
  if (f >= 30) {
    tremor = Math.min(40, 12 + f / 3);
    clarao = .5;
    soltar(60, MEIO + off, CORDA_Y, TIMES[i].cor, 700);
    soltar(30, MEIO + off, CORDA_Y, '#ffd23f', 520);
  }
  // virada: o outro time estava na frente e agora este passou
  const agoraLider = pos < -8 ? 0 : pos > 8 ? 1 : lider;
  if (agoraLider !== lider) {
    lider = agoraLider;
    flutuar(palco, { x: 540, y: 880, texto: `VIRADA! ${TIMES[lider].nome}`, cor: TIMES[lider].cor, tamanho: 84 });
    tocar('virada');
  }
  if (Math.abs(pos) >= LIMITE) vencer(pos < 0 ? 0 : 1);
  return f;
}

function vencer(i) {
  pos = i ? LIMITE : -LIMITE;
  vencedorAtual = i;
  placar[i]++;
  guardar('cabo:placar', placar);
  hud(false);
  animar($('trofeu' + i));
  faixa = document.createElement('div');
  faixa.className = 'vencedor';
  faixa.style.setProperty('--destaque', TIMES[i].cor);
  const s = document.createElement('small');
  s.textContent = `Rodada ${placar[0] + placar[1]}`;
  faixa.append(s, `🏆 ${TIMES[i].nome} venceu!`);
  palco.appendChild(faixa);
  confete(palco, { cores: [TIMES[i].cor, '#ffd23f', '#fff'] });
  for (let k = 0; k < 6; k++) soltar(25, 100 + k * 176, GRAMA_Y, [TIMES[i].cor, '#ffd23f', '#ffffff'][k % 3], 650);
  tremor = 30;
  torcida[i] = 1;
  tocar('vitoria');
  fim = setTimeout(novaRodada, VENCEDOR_MS);
}

function novaRodada() {
  clearTimeout(fim);
  fim = null;
  vencedorAtual = -1;
  faixa?.remove();
  faixa = null;
  // presentes que chegaram no intervalo valem na nova rodada (sem encerrar de cara)
  pos = Math.max(-LIMITE * .5, Math.min(LIMITE * .5, guardado[1] - guardado[0]));
  forca = [...guardado];
  guardado = [0, 0];
  lider = pos < -8 ? 0 : pos > 8 ? 1 : lider;
  combo.zerar();
  hud(false);
}

function aoEvento(ev) {
  const quem = ev.nome || ev.user;
  if (ev.tipo === 'comentario') {
    const t = times.pelaPalavra(ev);
    if (!t) return;
    const i = idx(t);
    const f = puxar(i, FORCA.comentario ?? 1);
    textoCanvas(i, `+${f} ${String(quem).slice(0, 14)}`);
    ranking.somar(ev, f, { cor: TIMES[i].cor });
    pintarRanking($('ranking'), ranking.top(4));
    mostrarCombo(i, combo.registrar(i, 1), 1, false);
    hud();
    return;
  }
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao) return;
  const i = idx(times.doUsuario(ev.user));
  const q = ev.quantidade ?? 1;
  const emoji = emojiDoPresente(ev.presenteNome, EMOJI_ACAO[acao] ?? '🎁');
  const ladoX = i ? 830 : 250;
  mostrarUltimo(ev, i);
  mostrarCombo(i, combo.registrar(i, q), q, true);
  particulas(palco, { x: ladoX, y: 1060, qtd: Math.min(q + 2, 8), emoji, forca: .8 });

  if (acao === 'dobro') {
    dobroAte[i] = Math.min(Math.max(dobroAte[i], performance.now()) + DOBRO_MS * q, performance.now() + DOBRO_MAX_MS);
    tremor = 14;
    soltar(50, ladoX, 1040, '#ffd23f', 600);
    flutuar(palco, { x: CENTRO[i].x, y: CENTRO[i].y, texto: 'FORÇA x2!', cor: '#ffd23f', tamanho: 100 });
    animar($('dobro' + i));
    tocar('virada');
    ranking.somar(ev, 0, { cor: TIMES[i].cor });
    pintarRanking($('ranking'), ranking.top(4), { destaque: ev.user });
    avisar(html`<span class="t${i}"><b>${quem}</b> ${q}× ${ev.presenteNome} <span class="mais">⚡ x2</span></span>`);
    hud(false);
    return;
  }

  const f = puxar(i, (FORCA[acao] ?? 0) * q);
  ranking.somar(ev, f, { cor: TIMES[i].cor });
  pintarRanking($('ranking'), ranking.top(4), { destaque: ev.user });
  if (acao === 'superpuxao') {
    tremor = 46;
    clarao = .7;
    tremer(palco, true);
    flutuar(palco, { x: 540, y: 880, texto: 'SUPERPUXÃO!', cor: TIMES[i].cor, tamanho: 120 });
    flutuar(palco, { x: CENTRO[i].x, y: CENTRO[i].y, texto: `+${f}`, cor: TIMES[i].cor, tamanho: 130 });
    particulas(palco, { x: 540, y: CORDA_Y, qtd: 12, emoji, forca: 1.6 });
    tocar('impacto');
  } else {
    flutuar(palco, { x: CENTRO[i].x, y: CENTRO[i].y, texto: `+${f}`, cor: TIMES[i].cor, tamanho: f >= 10 ? 120 : 96 });
    if (f >= 10) tremer(palco);
    tocar(f >= 30 ? 'impacto' : 'ponto');
  }
  avisar(html`<span class="t${i}"><b>${quem}</b> ${q}× ${ev.presenteNome} <span class="mais">+${f}</span></span>`);
  hud();
}

/* ---------- desenho ---------- */

const cv = $('cena'), ctx = cv.getContext('2d');
const CONTORNO = '#1a1030';
const PELES = ['#ffd9b8', '#f2c49b', '#d9a066', '#b97a4a', '#8d5a33', '#ffe3c9'];

// torcida da arquibancada: 4 fileiras, metade de cada time e alguns neutros
const fas = [];
for (let r = 0; r < 4; r++) {
  const y = ARQ.y + 62 + r * 64;
  for (let x = 20 + (r % 2) * 24; x < 1080; x += 48) {
    const lado = x < MEIO ? 0 : 1;
    const neutro = Math.random() < .22;
    fas.push({ x: x + (Math.random() - .5) * 10, y, lado, fase: Math.random() * 7,
      pele: PELES[Math.floor(Math.random() * PELES.length)],
      cor: neutro ? ['#ffd23f', '#ffffff', '#7c5cff'][Math.floor(Math.random() * 3)] : null,
      bandeira: !neutro && Math.random() < .12 });
  }
}

function arquibancada(t) {
  // parede e degraus
  const g = ctx.createLinearGradient(0, ARQ.y, 0, ARQ.y + ARQ.h);
  g.addColorStop(0, '#2a1a5c');
  g.addColorStop(1, '#170d3a');
  ctx.fillStyle = g;
  ctx.fillRect(0, ARQ.y, 1080, ARQ.h);
  for (let r = 0; r < 4; r++) {
    const y = ARQ.y + 74 + r * 64;
    ctx.fillStyle = r % 2 ? '#3a2878' : '#33236b';
    ctx.fillRect(0, y, 1080, 26);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(0, y, 1080, 4);
  }
  // torcedores
  for (const f of fas) {
    const cor = f.cor ?? TIMES[f.lado].cor;
    const pulo = Math.sin(t * 3 + f.fase) * 2 + torcida[f.lado] * Math.abs(Math.sin(t * 11 + f.fase)) * 16;
    const y = f.y - pulo;
    ctx.fillStyle = cor;
    ctx.beginPath(); ctx.arc(f.x, y + 26, 20, Math.PI, 0); ctx.fill();
    if (torcida[f.lado] > .35) {   // braços para cima quando o time puxa
      ctx.strokeStyle = cor; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(f.x - 14, y + 14); ctx.lineTo(f.x - 22, y - 12);
      ctx.moveTo(f.x + 14, y + 14); ctx.lineTo(f.x + 22, y - 12); ctx.stroke();
    }
    ctx.fillStyle = f.pele;
    ctx.beginPath(); ctx.arc(f.x, y + 2, 13, 0, Math.PI * 2); ctx.fill();
    if (f.bandeira) {
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(f.x + 18, y + 18); ctx.lineTo(f.x + 18, y - 40); ctx.stroke();
      ctx.fillStyle = TIMES[f.lado].cor;
      const onda = Math.sin(t * 6 + f.fase) * 5;
      ctx.beginPath(); ctx.moveTo(f.x + 18, y - 40); ctx.quadraticCurveTo(f.x + 34, y - 36 + onda, f.x + 50, y - 34);
      ctx.lineTo(f.x + 50, y - 14); ctx.quadraticCurveTo(f.x + 34, y - 16 + onda, f.x + 18, y - 20); ctx.fill();
    }
  }
  // mureta com faixas dos times
  ctx.fillStyle = '#120a2e';
  ctx.fillRect(0, GRAMA_Y - 34, 1080, 34);
  TIMES.forEach((tm, i) => {
    ctx.fillStyle = tm.cor;
    ctx.fillRect(i ? 560 : 0, GRAMA_Y - 30, 520, 26);
    ctx.font = fonte(22);
    ctx.fillStyle = CONTORNO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nome = tm.nome.toUpperCase();
    for (let x = (i ? 560 : 0) + 90; x < (i ? 1080 : 520); x += 170) ctx.fillText(nome, x, GRAMA_Y - 16);
  });
}

function gramado() {
  const g = ctx.createLinearGradient(0, GRAMA_Y, 0, GRAMA_FIM);
  g.addColorStop(0, '#2f9a4e');
  g.addColorStop(1, '#1d6b35');
  ctx.fillStyle = g;
  ctx.fillRect(0, GRAMA_Y, 1080, GRAMA_FIM - GRAMA_Y);
  // faixas da grama
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let x = 0; x < 1080; x += 120) ctx.fillRect(x, GRAMA_Y, 60, GRAMA_FIM - GRAMA_Y);
  // transição suave para o chão escuro de baixo
  const s = ctx.createLinearGradient(0, GRAMA_FIM - 40, 0, GRAMA_FIM + 30);
  s.addColorStop(0, 'rgba(8,38,26,0)');
  s.addColorStop(1, 'rgba(8,38,26,1)');
  ctx.fillStyle = s;
  ctx.fillRect(0, GRAMA_FIM - 40, 1080, 70);
}

// zonas de vitória: brilham mais conforme o marcador se aproxima
function zonas(t) {
  TIMES.forEach((tm, i) => {
    const lx = MEIO + (i ? CURSO : -CURSO);
    const perto = Math.max(0, Math.min(1, (i ? vis : -vis) / LIMITE));
    const pulso = perto > .65 ? (Math.sin(t * 12) + 1) / 2 : 0;
    const x0 = i ? lx : 0, w = i ? 1080 - lx : lx;
    ctx.globalAlpha = .18 + perto * .3 + pulso * .2;
    ctx.fillStyle = tm.cor;
    ctx.fillRect(x0, GRAMA_Y, w, GRAMA_FIM - GRAMA_Y - 20);
    // coluna de luz subindo da linha
    const luz = ctx.createLinearGradient(0, GRAMA_FIM, 0, ARQ.y);
    luz.addColorStop(0, tm.cor);
    luz.addColorStop(1, 'transparent');
    ctx.globalAlpha = .12 + perto * .45 + pulso * .25;
    ctx.fillStyle = luz;
    ctx.fillRect(lx - 30, ARQ.y, 60, GRAMA_FIM - ARQ.y);
    ctx.globalAlpha = 1;
    ctx.shadowColor = tm.cor;
    ctx.shadowBlur = 20 + perto * 30;
    ctx.fillStyle = '#fff';
    ctx.fillRect(lx - 5, GRAMA_Y, 10, GRAMA_FIM - GRAMA_Y - 20);
    ctx.fillStyle = tm.cor;
    ctx.fillRect(lx - 3, GRAMA_Y, 6, GRAMA_FIM - GRAMA_Y - 20);
    ctx.shadowBlur = 0;
    // quanto falta
    const falta = Math.max(0, Math.ceil(LIMITE + (i ? -pos : pos)));
    textoContorno(`faltam ${falta}`, i ? (lx + 1080) / 2 : lx / 2, GRAMA_FIM - 34, 32, tm.cor);
  });
  // linha do meio
  ctx.setLineDash([16, 14]);
  ctx.strokeStyle = 'rgba(255,255,255,.6)';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(MEIO, GRAMA_Y); ctx.lineTo(MEIO, GRAMA_FIM - 20); ctx.stroke();
  ctx.setLineDash([]);
}

function textoContorno(txt, x, y, tam, cor) {
  ctx.font = fonte(tam);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = tam / 4.5;
  ctx.strokeStyle = CONTORNO;
  ctx.strokeText(txt, x, y + tam * .06);
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = cor;
  ctx.fillText(txt, x, y);
}

// aura dourada da força x2 atrás do time
function aura(i, off, t) {
  const lado = i ? 1 : -1;
  const cx = MEIO + off * ARRASTO + lado * 270;
  const r = 230 + Math.sin(t * 8) * 14;
  const g = ctx.createRadialGradient(cx, CHAO_Y - 110, 20, cx, CHAO_Y - 110, r);
  g.addColorStop(0, 'rgba(255,230,90,.8)');
  g.addColorStop(.6, 'rgba(255,190,30,.38)');
  g.addColorStop(1, 'rgba(255,190,30,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(cx, CHAO_Y - 110, r * 1.1, r * .75, 0, 0, Math.PI * 2); ctx.fill();
  // faíscas subindo
  ctx.fillStyle = '#fff6b0';
  for (let k = 0; k < 10; k++) {
    const fase = (t * .8 + k / 10) % 1;
    const x = cx + Math.sin(k * 2.3 + t * 2) * 180;
    const y = CHAO_Y - fase * 260;
    ctx.globalAlpha = 1 - fase;
    ctx.beginPath(); ctx.arc(x, y, 5 + (k % 3) * 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// boneco puxando: inclina para trás com o esforço, pés arrastando, dentes cerrados
function boneco(x, cor, lado, inclina, passo, esforco, pele, pulo = 0, comemora = false) {
  const a = lado * inclina;
  const base = CHAO_Y - pulo;
  ctx.save();
  ctx.translate(x, base);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // pernas (contorno + calça)
  const pernas = () => {
    ctx.beginPath();
    ctx.moveTo(lado * 8, -66); ctx.lineTo(-lado * 30 + passo, 0);
    ctx.moveTo(lado * 8, -66); ctx.lineTo(-lado * 2 - passo, 0);
    ctx.stroke();
  };
  ctx.strokeStyle = CONTORNO; ctx.lineWidth = 24; pernas();
  ctx.strokeStyle = '#2c3566'; ctx.lineWidth = 15; pernas();
  // tênis
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = CONTORNO; ctx.lineWidth = 4;
  for (const px of [-lado * 30 + passo, -lado * 2 - passo]) {
    ctx.beginPath(); ctx.ellipse(px - lado * 6, -4, 15, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.rotate(comemora ? 0 : a);
  // corpo
  ctx.fillStyle = cor;
  ctx.strokeStyle = CONTORNO; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(-28, -154, 56, 100, 22); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.beginPath(); ctx.roundRect(-18, -146, 14, 70, 7); ctx.fill();
  // cabeça
  ctx.fillStyle = pele;
  ctx.beginPath(); ctx.arc(0, -188, 33, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // faixa na testa
  ctx.fillStyle = cor;
  ctx.beginPath(); ctx.roundRect(-34, -210, 68, 12, 4); ctx.fill(); ctx.stroke();
  // olhos e boca (olham para o meio)
  const ox = -lado * 12;
  ctx.fillStyle = CONTORNO;
  if (esforco > .45 && !comemora) {
    // olhos apertados
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ox - 9, -192); ctx.lineTo(ox - 2, -188); ctx.lineTo(ox - 9, -184);
    ctx.moveTo(ox + 15, -192); ctx.lineTo(ox + 8, -188); ctx.lineTo(ox + 15, -184);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.roundRect(ox - 8, -174, 22, 10, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox - 8, -169); ctx.lineTo(ox + 14, -169); ctx.lineWidth = 2; ctx.stroke();
    // gota de suor
    ctx.fillStyle = '#9fe6ff';
    ctx.beginPath(); ctx.moveTo(lado * 24, -214); ctx.quadraticCurveTo(lado * 34, -198, lado * 24, -194);
    ctx.quadraticCurveTo(lado * 14, -198, lado * 24, -214); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(ox - 6, -190, 5, 0, Math.PI * 2); ctx.arc(ox + 10, -190, 5, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (comemora) ctx.arc(ox + 2, -176, 10, 0, Math.PI);
    else { ctx.moveTo(ox - 6, -172); ctx.lineTo(ox + 10, -172); }
    ctx.stroke();
  }
  ctx.restore();

  const ox2 = x + Math.sin(comemora ? 0 : a) * 130, oy = base - Math.cos(comemora ? 0 : a) * 130;
  const bracos = (fim) => {
    ctx.beginPath();
    for (const [dx, dy] of fim) { ctx.moveTo(ox2, oy); ctx.lineTo(dx, dy); }
    ctx.stroke();
  };
  const maos = comemora
    ? [[ox2 - 34, oy - 70], [ox2 + 34, oy - 70]]
    : [[ox2 - lado * 50, CORDA_Y], [ox2 - lado * 30, CORDA_Y]];
  ctx.lineCap = 'round';
  ctx.strokeStyle = CONTORNO; ctx.lineWidth = 20; bracos(maos);
  ctx.strokeStyle = cor; ctx.lineWidth = 12; bracos(maos);
  ctx.fillStyle = pele; ctx.strokeStyle = CONTORNO; ctx.lineWidth = 4;
  for (const [mx, my] of maos) { ctx.beginPath(); ctx.arc(mx, my, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
}

function corda(off, t) {
  const y = CORDA_Y + Math.sin(t * 45) * (tensao[0] + tensao[1]) * 1.2;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = CONTORNO;
  ctx.lineWidth = 34;
  ctx.beginPath(); ctx.moveTo(-50, y); ctx.lineTo(1130, y); ctx.stroke();
  ctx.strokeStyle = '#d9ad6a';
  ctx.lineWidth = 24;
  ctx.beginPath(); ctx.moveTo(-50, y); ctx.lineTo(1130, y); ctx.stroke();
  // trançado que anda junto com a corda
  ctx.strokeStyle = '#9c6c35';
  ctx.lineWidth = 5;
  ctx.beginPath();
  const desloc = ((off % 22) + 22) % 22;
  for (let x = -44 + desloc; x < 1130; x += 22) { ctx.moveTo(x, y - 11); ctx.lineTo(x + 12, y + 11); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.fillRect(-50, y - 9, 1180, 4);
  return y;
}

// marcador do meio: fita vermelha e nó dourado
function marcador(mx, y, t) {
  const balanco = Math.sin(t * 5) * 6 + (pos - vis) * .4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = CONTORNO; ctx.lineWidth = 6;
  ctx.fillStyle = '#ff3b4e';
  ctx.beginPath();
  ctx.moveTo(mx - 20, y); ctx.lineTo(mx + 20, y);
  ctx.lineTo(mx + 18 + balanco, y + 104); ctx.lineTo(mx + balanco, y + 84); ctx.lineTo(mx - 18 + balanco, y + 104);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(mx, y, 24, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.fillStyle = '#fff6c0';
  ctx.beginPath(); ctx.arc(mx - 7, y - 8, 7, 0, Math.PI * 2); ctx.fill();
}

function cena(agora, dt) {
  const t = agora / 1000;
  const off = (vis / LIMITE) * CURSO;
  if (ARENA_FUNDO) { arquibancada(t); gramado(); }
  zonas(t);

  for (let i = 0; i < 2; i++) if (dobroAte[i] > agora) aura(i, off, t);

  // bonecos (andam com a corda); no fim, quem venceu pula e quem perdeu é arrastado
  TIMES.forEach((tm, i) => {
    const lado = i ? 1 : -1;
    const ganhou = vencedorAtual === i, perdeu = vencedorAtual !== -1 && !ganhou;
    for (let k = 3; k >= 0; k--) {
      let inc = .3 + tensao[i] * .3 + Math.sin(t * 6 + k * 1.7) * .03;
      if (perdeu) inc = -.25;
      const passo = tensao[i] > .1 || perdeu ? Math.sin(t * 16 + k) * 9 : 0;
      const pulo = ganhou ? Math.abs(Math.sin(t * 9 + k)) * 34 : 0;
      boneco(MEIO + off * ARRASTO + lado * (150 + k * 80), tm.cor, lado, inc, passo, tensao[i], PELES[(k * 2 + i) % PELES.length], pulo, ganhou);
    }
  });

  const y = corda(off, t);
  marcador(MEIO + off, y, t);

  // partículas
  for (const p of parts) {
    p.vida -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.vida * 2));
    ctx.fillStyle = p.cor;
    ctx.fillRect(p.x - p.tam / 2, p.y - p.tam / 2, p.tam, p.tam);
  }
  parts = parts.filter(p => p.vida > 0 && p.y < 1960);
  ctx.globalAlpha = 1;

  // textos flutuantes dos comentários
  for (const s of textos) {
    s.vida -= dt; s.y -= 90 * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, s.vida / s.max * 2.5));
    textoContorno(s.txt, s.x, s.y, s.tam, s.cor);
  }
  textos = textos.filter(s => s.vida > 0);
  ctx.globalAlpha = 1;
}

// pílula de força x2 com contagem regressiva
const dobroTxt = ['', ''];
function pintarDobro(agora) {
  for (let i = 0; i < 2; i++) {
    const resta = Math.ceil((dobroAte[i] - agora) / 1000);
    const txt = resta > 0 ? `${resta}s` : '';
    if (txt === dobroTxt[i]) continue;
    dobroTxt[i] = txt;
    $('dobro' + i).classList.toggle('on', resta > 0);
    if (txt) {
      $('dobroS' + i).textContent = txt;
      if (resta <= 3) tocar('tique');
    }
  }
}

let antes = performance.now();
function quadro(agora) {
  const dt = Math.min(.05, (agora - antes) / 1000);
  antes = agora;
  vis += (pos - vis) * (1 - Math.exp(-dt * 7));
  tensao = tensao.map(v => Math.max(0, v - dt * 1.4));
  torcida = torcida.map(v => Math.max(0, v - dt * .8));
  tremor *= Math.exp(-dt * 6);
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
  pintarDobro(agora);
  requestAnimationFrame(quadro);
}

/* ---------- teclas de teste ---------- */
function rajada() {
  const presentes = ['Rose', 'Rose', 'GG', 'GG', 'Doughnut', 'Galaxy', 'Finger Heart'];
  for (let k = 0; k < 20; k++) setTimeout(() => aoEvento(Math.random() < .6
    ? eventoFalso({ tipo: 'comentario', texto: cfg.palavras[Math.random() < .5 ? 'A' : 'B'][0] })
    : eventoFalso({ presenteNome: presentes[Math.floor(Math.random() * presentes.length)], quantidade: 1 + Math.floor(Math.random() * 3) })
  ), k * 120);
}

// 1/2: quem comentou A/B manda o superpuxão (Galaxy por padrão)
function superDoTime(i) {
  const ref = cfg.acoes?.superpuxao?.[0] ?? 'Galaxy';
  const ev = eventoFalso(typeof ref === 'number' ? { presenteId: ref, presenteNome: 'presente' } : { presenteNome: String(ref) });
  times.pelaPalavra({ user: ev.user, texto: cfg.palavras[i ? 'B' : 'A'][0] });
  aoEvento(ev);
}

teclas({
  t: rajada,
  1: () => superDoTime(0),
  2: () => superDoTime(1),
  r: () => {
    placar = [0, 0];
    guardar('cabo:placar', placar);
    dobroAte = [0, 0];
    times.zerar();
    ranking.zerar();
    pintarRanking($('ranking'), []);
    guardado = [0, 0];
    novaRodada();
    pos = 0;
    forca = [0, 0];
    hud(false);
  }
});

hud(false);
requestAnimationFrame(quadro);
conectar(aoEvento);
