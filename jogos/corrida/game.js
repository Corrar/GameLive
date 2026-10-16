import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  teclas, eventoFalso, foto } from '../kit/kit.js';
import { emojiDoPresente, criarCombo, criarRanking, corDoNick, iniciais, avatar, animar, particulas,
  flutuar, tremer, confete, pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';

const cfg = await carregarConfig();
const VOLTAS = cfg.voltas ?? 3;
const MAX = cfg.maxCarros ?? 12;
const VEL = cfg.velocidade ?? 150; // px lógicos por segundo
const CENARIO = cfg.fundo !== 'transparente' && cfg.cenario !== false;
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');

aplicarFundo(cfg.fundo);
escalarPalco(palco);
ligarSom(cfg.som);
// a fonte de jogo precisa estar carregada antes de desenhar texto no canvas
try { await document.fonts.load('40px "Lilita One"'); } catch { /* segue com a reserva */ }

const ctx = $('tela').getContext('2d');
const avisar = avisos($('avisos'), { max: 3 });
const combo = criarCombo({ janela: 4000 });
const ranking = criarRanking();
const campeoes = criarRanking();
const FONTE = '"Lilita One", "Baloo 2", Impact, sans-serif';
const CONTORNO = '#1a1030';
const TAU = Math.PI * 2;
const CORES = ['#3df2c2', '#ff3d7f', '#ffc23d', '#5b8cff', '#b06bff', '#ff8a3d', '#41d7ff', '#ff5ad1', '#9dff5a', '#f4f6ff', '#ff5050', '#00c8a0'];
const FOGO = ['#fff3b0', '#ffd23f', '#ff8a3d', '#ff3d3d'];
const GALAXIA = ['#b06bff', '#41d7ff', '#ff5ad1', '#fff'];

/* ---------- presentes nos cantos da pista ---------- */
const EFEITOS = { acelerar: ['🌹', 'ACELERA', '#ff7aa8'], nitro: ['🔥', 'NITRO', '#ffb02e'],
  oleo: ['🍩', 'ÓLEO NO 1º', '#ff5a6e'], pular: ['🌌', 'TELEPORTE', '#c79bff'] };
const cantos = {};
Object.keys(EFEITOS).forEach((acao, i) => {
  const ref = cfg.acoes?.[acao]?.[0];
  if (ref === undefined) return;
  const el = document.createElement('div');
  el.className = `canto chip-presente c${i}`;
  const emoji = document.createElement('span');
  emoji.className = 'emoji';
  emoji.textContent = typeof ref === 'string' ? emojiDoPresente(ref, EFEITOS[acao][0]) : EFEITOS[acao][0];
  const efeito = document.createElement('span');
  efeito.className = 'efeito';
  efeito.style.color = EFEITOS[acao][2];
  efeito.textContent = EFEITOS[acao][1];
  const nome = document.createElement('span');
  nome.className = 'nome';
  nome.textContent = typeof ref === 'number' ? `presente #${ref}` : ref;
  el.append(emoji, efeito, nome);
  $('cantos').appendChild(el);
  cantos[acao] = el;
});

/* ---------- pista: estádio em pé, sentido horário, largada no meio da reta esquerda ---------- */
const CX = 540, C1 = 640, C2 = 1060, R = 310, MEIA = 108;
const RETA = C2 - C1, ARCO = Math.PI * R, YL = (C1 + C2) / 2;
const PER = 2 * RETA + 2 * ARCO;
const META = VOLTAS * PER;
const FAIXAS = [-80, -27, 27, 80];

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
const grade = (i) => -Math.floor(i / 4) * 80 - (i % 2) * 24 - 34;
const noPonto = (s, faixa) => {
  const p = ponto(s), f = FAIXAS[faixa];
  return { x: p.x + f * Math.sin(p.a), y: p.y - f * Math.cos(p.a), a: p.a };
};

// arquibancada: degraus e torcida colorida (pontinhos)
function torcida(g, x, y, w, h, vertical) {
  g.fillStyle = '#4a5370';
  g.fillRect(x, y, w, h);
  const passo = 22;
  for (let d = 0; d < (vertical ? w : h); d += passo) {
    g.fillStyle = d / passo % 2 ? '#56607f' : '#424a66';
    if (vertical) g.fillRect(x + d, y, passo, h); else g.fillRect(x, y + d, w, passo);
  }
  const cores = ['#ff3d7f', '#ffd23f', '#3df2c2', '#5b8cff', '#fff', '#ff8a3d', '#b06bff', '#ffb3c7'];
  for (let i = 0; i < (vertical ? w : h) / passo; i++) {
    for (let j = 12; j < (vertical ? h : w) - 6; j += 17 + Math.random() * 8) {
      if (Math.random() < 0.18) continue;
      const cx = vertical ? x + i * passo + passo / 2 : x + j, cy = vertical ? y + j : y + i * passo + passo / 2;
      g.fillStyle = cores[Math.floor(Math.random() * cores.length)];
      g.beginPath(); g.arc(cx, cy, 6.5, 0, TAU); g.fill();
    }
  }
  g.strokeStyle = '#2b3047'; g.lineWidth = 6; g.strokeRect(x, y, w, h);
}

const pista = document.createElement('canvas');
pista.width = 1080; pista.height = 1920;
{
  const g = pista.getContext('2d');
  const estadio = (r) => { g.beginPath(); g.arc(CX, C1, r, Math.PI, TAU); g.lineTo(CX + r, C2); g.arc(CX, C2, r, 0, Math.PI); g.closePath(); };
  if (CENARIO) {
    // grama cortada em listras
    g.fillStyle = '#2e9a46'; g.fillRect(0, 0, 1080, 1920);
    g.fillStyle = '#36a94f';
    for (let y = 0; y < 1920; y += 120) g.fillRect(0, y, 1080, 60);
    // céu noturno com holofotes atrás do topo
    const ceu = g.createLinearGradient(0, 0, 0, 200);
    ceu.addColorStop(0, '#141a4a'); ceu.addColorStop(1, '#2c3d96');
    g.fillStyle = ceu; g.fillRect(0, 0, 1080, 190);
    torcida(g, 0, 0, 1080, 112, false);
    // faixa do título
    const faixa = g.createLinearGradient(0, 112, 0, 192);
    faixa.addColorStop(0, '#2a1f5c'); faixa.addColorStop(1, '#160f36');
    g.fillStyle = faixa; g.fillRect(0, 112, 1080, 80);
    g.fillStyle = '#ffd23f'; g.fillRect(0, 112, 1080, 5);
    g.fillStyle = '#e8343c'; g.fillRect(0, 186, 1080, 10);
    for (const lx of [150, 930]) {
      const luz = g.createRadialGradient(lx, 40, 0, lx, 40, 380);
      luz.addColorStop(0, 'rgba(255,250,220,.55)'); luz.addColorStop(1, 'rgba(255,250,220,0)');
      g.fillStyle = luz; g.fillRect(0, 0, 1080, 700);
    }
    // arquibancadas laterais
    torcida(g, 0, 440, 84, 820, true);
    torcida(g, 996, 440, 84, 820, true);
    // placa de chegada na arquibancada da esquerda
    g.save(); g.translate(42, YL); g.rotate(-Math.PI / 2);
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(-150, -32, 300, 64, 14); g.fill();
    g.fillStyle = '#e8343c'; g.font = `44px ${FONTE}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CHEGADA', 0, 3); g.restore();
    // muro dos boxes atrás do rodapé
    const muro = g.createLinearGradient(0, 1500, 0, 1920);
    muro.addColorStop(0, '#232a48'); muro.addColorStop(1, '#10132a');
    g.fillStyle = muro; g.fillRect(0, 1512, 1080, 408);
    for (let x = 0; x < 1080; x += 40) { g.fillStyle = (x / 40) % 2 ? '#fff' : '#e8343c'; g.fillRect(x, 1512, 40, 14); }
  }
  // asfalto com sombra
  g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 40; g.shadowOffsetY = 12;
  estadio(R + MEIA + 18); g.fillStyle = '#fff'; g.fill(); g.restore();
  estadio(R + MEIA + 9); g.lineWidth = 18; g.strokeStyle = '#fff'; g.stroke();
  g.setLineDash([30, 30]); g.strokeStyle = '#e8343c'; g.stroke(); g.setLineDash([]);
  estadio(R + MEIA);
  const asfalto = g.createRadialGradient(CX, YL, 200, CX, YL, 800);
  asfalto.addColorStop(0, '#454b62'); asfalto.addColorStop(1, '#30354a');
  g.fillStyle = asfalto; g.fill();
  // granulado do asfalto
  g.save(); estadio(R + MEIA); g.clip();
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)';
    g.fillRect(Math.random() * 1080, 180 + Math.random() * 1340, 3, 3);
  }
  g.restore();
  estadio(R - MEIA - 9); g.lineWidth = 18; g.strokeStyle = '#fff'; g.stroke();
  g.setLineDash([30, 30]); g.strokeStyle = '#e8343c'; g.stroke(); g.setLineDash([]);
  estadio(R - MEIA - 18);
  if (CENARIO) {
    const miolo = g.createLinearGradient(0, C1 - R, 0, C2 + R);
    miolo.addColorStop(0, '#2a8f40'); miolo.addColorStop(1, '#23803a');
    g.fillStyle = miolo;
  } else g.fillStyle = 'rgba(10,12,24,.6)';
  g.fill();
  // faixas tracejadas
  g.setLineDash([30, 40]); g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.22)';
  for (const d of [-54, 0, 54]) { estadio(R + d); g.stroke(); }
  g.setLineDash([]);
  // grid de largada
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 5;
  for (let i = 0; i < MAX; i++) {
    const p = noPonto(grade(i) + 40, i % 4);
    g.beginPath(); g.moveTo(p.x - 24, p.y); g.lineTo(p.x + 24, p.y); g.stroke();
  }
  // linha de chegada quadriculada
  const q = 18;
  for (let i = 0; i < (2 * MEIA) / q; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = (i + j) % 2 ? '#fff' : '#111';
    g.fillRect(CX - R - MEIA + i * q, YL - q + j * q, q, q);
  }
}

/* ---------- estado ---------- */
let carros = [];
let estado = 'esperando'; // esperando | largada | correndo | fim
let contagem = 0;
let timerFim = null;
let corrida = 1;
let liderAntes = null;
let voltaAntes = 1;
const parts = [];
const aneis = [];
const marcas = [];
let manchas = [];

const cortar = (nome, n = 12) => { const l = Array.from(nome); return l.length > n ? l.slice(0, n - 1).join('') + '…' : nome; };
const ordenados = () => [...carros].sort((a, b) => b.s - a.s);
const volta = (c) => Math.min(VOLTAS, Math.max(1, Math.floor(c.s / PER) + 1));

function soltar(x, y, n, { cor = '#fff', vel = 220, vida = 0.8, tam = 6, grav = 0, emoji = null, dir = null, abre = TAU } = {}) {
  for (let i = 0; i < n; i++) {
    const a = dir === null ? Math.random() * TAU : dir + (Math.random() - 0.5) * abre;
    const v = vel * (0.3 + Math.random() * 0.7);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, v: vida * (0.6 + Math.random() * 0.4), m: vida,
      cor: Array.isArray(cor) ? cor[Math.floor(Math.random() * cor.length)] : cor, tam, grav, emoji });
  }
  if (parts.length > 700) parts.splice(0, parts.length - 700);
}

const posicao = (c) => noPonto(c.s, c.faixa);

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
  const correndo = estado === 'correndo' || estado === 'fim';
  c = { user: ev.user, nome, fotoUrl: ev.foto, desde: agora,
    cor: CORES.find(cor => !carros.some(k => k.cor === cor)) ?? CORES[Math.floor(Math.random() * CORES.length)],
    base: VEL * (0.95 + Math.random() * 0.1), ruido: 0, alvo: 0, troca: 0, turbo: 0, nitro: 0, oleo: 0, giro: 0, giroFim: 0, pulso: 0,
    faixa: correndo ? uso.indexOf(Math.min(...uso)) : carros.length % 4,
    s: correndo ? Math.min(...carros.map(k => k.s), 40) - 40 : grade(carros.length) };
  carros.push(c);
  const p = posicao(c);
  soltar(p.x, p.y, 18, { cor: [c.cor, '#fff'], vel: 260 });
  c.pulso = 1;
  avisar(html`🏎️ <span><b>${cortar(nome, 14)}</b> entrou!</span>`);
  tocar('tecla');
  if (estado === 'esperando') largar();
  return c;
}

function largar() { estado = 'largada'; contagem = 3.4; ultimoNumero = null; voltaAntes = 1; liderAntes = null; }

function novaCorrida() {
  document.querySelector('.podio')?.remove();
  carros.forEach((c, i) => Object.assign(c, { s: grade(i), faixa: i % 4, turbo: 0, nitro: 0, oleo: 0, giro: 0 }));
  manchas = []; marcas.length = 0;
  combo.zerar();
  if (carros.length) largar(); else estado = 'esperando';
}

function banner(texto, sub = '', cor = '#fff') {
  document.querySelector('.banner')?.remove();
  const b = document.createElement('div');
  b.className = 'banner txt-jogo brilho';
  b.style.color = cor;
  if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
  b.append(texto);
  b.addEventListener('animationend', () => b.remove(), { once: true });
  palco.appendChild(b);
}

function vencer(c) {
  estado = 'fim';
  const top3 = ordenados().slice(0, 3);
  campeoes.somar({ user: c.user, nome: c.nome, foto: c.fotoUrl }, 1, { cor: c.cor });
  pintarRanking($('vitorias'), campeoes.top(4), { unidade: ' 🏆', destaque: c.user });
  const p = posicao(c);
  soltar(p.x, p.y, 90, { cor: ['#3df2c2', '#ff3d7f', '#ffc23d', '#fff'], vel: 700, vida: 2.2, tam: 9, grav: 500 });
  mostrarPodio(top3);
  confete(palco, { qtd: 110 });
  tremer(palco, true);
  tocar('vitoria');
  corrida++;
  timerFim = setTimeout(novaCorrida, 7000);
}

function mostrarPodio(top3) {
  const podio = document.createElement('div');
  podio.className = 'podio';
  const cab = document.createElement('div');
  cab.className = 'cab txt-jogo';
  const sub = document.createElement('small');
  sub.textContent = `🏁 Corrida #${corrida}`;
  cab.append(sub, 'CHEGADA!');
  const degraus = document.createElement('div');
  degraus.className = 'degraus';
  const ALTURA = [330, 230, 160], ATRASO = [1.1, .7, .4], MEDALHA = ['🥇', '🥈', '🥉'];
  for (const i of [1, 0, 2]) {
    const c = top3[i];
    const d = document.createElement('div');
    d.className = `degrau p${i + 1}`;
    d.style.cssText = `--h:${ALTURA[i]}px;--cor:${c?.cor ?? '#555'};--atraso:${ATRASO[i]}s`;
    const bloco = document.createElement('div');
    bloco.className = 'bloco';
    const n = document.createElement('b');
    n.className = 'txt-jogo';
    n.textContent = `${i + 1}º`;
    bloco.append(n);
    if (c) {
      const med = document.createElement('div');
      med.className = 'medalha';
      med.textContent = MEDALHA[i];
      const quem = document.createElement('div');
      quem.className = 'quem txt-jogo';
      quem.textContent = c.nome;
      d.append(med, avatar({ user: c.user, nome: c.nome, foto: c.fotoUrl }, i === 0 ? 'grande' : ''), quem);
    }
    d.append(bloco);
    degraus.append(d);
  }
  podio.append(cab, degraus);
  palco.appendChild(podio);
}

/* ---------- painéis ---------- */
let chavePosicoes = '';
function mostrarPosicoes() {
  const lista = ordenados();
  const lider = lista[0];
  const v = lider ? volta(lider) : 1;
  const pil = $('volta');
  pil.textContent = estado === 'fim' ? 'CHEGADA!' : v === VOLTAS && estado === 'correndo' ? 'ÚLTIMA VOLTA' : `VOLTA ${v}/${VOLTAS}`;
  pil.classList.toggle('urgente', estado === 'correndo' && v === VOLTAS);
  $('pilotos').textContent = `🏎️ ${carros.length}/${MAX}`;
  $('numero').textContent = `🏁 #${corrida}`;

  if (estado === 'correndo') {
    if (v > voltaAntes) {
      voltaAntes = v;
      animar(pil);
      tocar('virada');
      banner(v === VOLTAS ? 'ÚLTIMA VOLTA!' : `VOLTA ${v}`, cortar(lider.nome, 14) + ' na frente', v === VOLTAS ? '#ff5a6e' : '#ffd23f');
    }
    if (lider && liderAntes && lider.user !== liderAntes && contagem < -2) {
      avisar(html`👑 <span><b>${cortar(lider.nome, 14)}</b> <span class="mais">assumiu a liderança!</span></span>`);
      tocar('virada');
      const p = posicao(lider);
      flutuar(palco, { x: p.x, y: p.y - 120, texto: '👑 1º!', cor: '#ffd23f', tamanho: 64 });
    }
  }
  liderAntes = lider?.user ?? null;

  const chave = lista.slice(0, 5).map(c => c.user + volta(c)).join('|') + estado;
  if (chave === chavePosicoes) return;
  chavePosicoes = chave;
  if (!lista.length) {
    const li = document.createElement('li'); li.className = 'vazio';
    li.textContent = 'Pista vazia: comente pra largar!';
    return $('posicoes').replaceChildren(li);
  }
  $('posicoes').replaceChildren(...lista.slice(0, 5).map((c, i) => {
    const li = document.createElement('li');
    if (i === 0) li.className = 'lider';
    li.style.setProperty('--cor', c.cor);
    const pos = document.createElement('span'); pos.className = 'pos'; pos.textContent = i === 0 ? '👑' : `${i + 1}º`;
    const nome = document.createElement('span'); nome.className = 'quem'; nome.textContent = c.nome;
    const vv = document.createElement('span'); vv.className = 'v'; vv.textContent = `V${volta(c)}`;
    li.append(pos, avatar({ user: c.user, nome: c.nome, foto: c.fotoUrl }), nome, vv);
    return li;
  }));
}

function vazioRanking(id, texto) {
  const li = document.createElement('li'); li.className = 'vazio'; li.textContent = texto;
  $(id).replaceChildren(li);
}

/* ---------- presentes ---------- */
const MARCOS = [10, 25, 50, 100, 250, 500];
function mostrarCombo(c, p, n, ganho) {
  if (n < 2) return;
  flutuar(palco, { x: p.x, y: p.y - 150, texto: `COMBO x${n}`, cor: '#ffd23f', tamanho: 54 });
  tocar('combo', n);
  if (MARCOS.some(m => n - ganho < m && n >= m)) {
    particulas(palco, { x: p.x, y: p.y, qtd: 30, forca: 1.4, cores: [c.cor, '#ffd23f', '#fff'] });
    flutuar(palco, { x: CX, y: 420, texto: `🔥 COMBO x${n}!`, cor: '#ffd23f', tamanho: 110 });
    tremer(palco, true);
  }
}

function aoEvento(ev) {
  if (!ev.user) return;
  if (ev.tipo === 'comentario') return void entrar(ev);
  if (ev.tipo !== 'presente') return;
  const acao = acaoDoPresente(cfg.acoes, ev);
  if (!acao) return;
  const c = entrar(ev);
  const q = Math.max(1, ev.quantidade | 0);
  const quem = cortar(c.nome, 14);
  const p = posicao(c);
  const emoji = emojiDoPresente(ev.presenteNome, EFEITOS[acao][0]);
  c.pulso = 1;
  if (cantos[acao]) animar(cantos[acao], 'usou');
  ranking.somar({ user: c.user, nome: c.nome, foto: c.fotoUrl }, q, { cor: c.cor });
  pintarRanking($('ranking'), ranking.top(4), { destaque: c.user });
  mostrarCombo(c, p, combo.registrar(c.user, q), q);

  if (acao === 'acelerar') {
    c.turbo = Math.min(10, c.turbo + 1.2 * q);
    soltar(p.x, p.y, 4 + q * 2, { emoji, vel: 260, vida: 1.1, tam: 36 });
    flutuar(palco, { x: p.x, y: p.y - 90, texto: `+VEL x${q}`, cor: '#ff7aa8', tamanho: 56 });
    avisar(html`${emoji} <span><b>${quem}</b> acelerou <span class="mais">×${q}</span></span>`);
    tocar('ponto');
  } else if (acao === 'nitro') {
    c.nitro = Math.min(14, c.nitro + 2.2 * q);
    soltar(p.x, p.y, 40, { cor: FOGO, vel: 480, vida: 0.7, tam: 9 });
    flutuar(palco, { x: p.x, y: p.y - 90, texto: '🔥 NITRO!', cor: '#ffb02e', tamanho: 76 });
    avisar(html`🔥 <span><b>${quem}</b> ligou o <span class="mais">NITRO ×${q}</span></span>`);
    tremer(palco);
    tocar('impacto');
  } else if (acao === 'oleo') {
    const alvo = ordenados().find(k => k !== c);
    if (!alvo) return avisar(html`🍩 <span><b>${quem}</b> jogou óleo… mas está sozinho</span>`);
    alvo.oleo = Math.min(9, alvo.oleo + 2.4 * q);
    const pa = posicao(alvo);
    manchas.push({ x: pa.x, y: pa.y, v: 6 });
    if (manchas.length > 8) manchas.shift();
    soltar(pa.x, pa.y, 10, { emoji: '🍩', vel: 320, vida: 1, tam: 38 });
    soltar(pa.x, pa.y, 24, { cor: ['#111', '#2a2140', '#6b4cff'], vel: 300, vida: 0.8, tam: 10 });
    flutuar(palco, { x: pa.x, y: pa.y - 90, texto: 'DERRAPOU!', cor: '#ff5a6e', tamanho: 64 });
    avisar(html`🍩 <span><b>${quem}</b> jogou óleo em <span class="ruim">${cortar(alvo.nome, 12)}</span>!</span>`);
    tremer(palco);
    tocar('impacto');
  } else if (acao === 'pular') {
    const lider = ordenados().find(k => k !== c);
    aneis.push({ x: p.x, y: p.y, t: 0 });
    soltar(p.x, p.y, 36, { cor: GALAXIA, vel: 380, vida: 1, tam: 7 });
    if (lider && lider.s >= c.s) { c.s = lider.s + 50; c.faixa = (lider.faixa + 2) % 4; }
    c.turbo = Math.min(10, c.turbo + (q - 1));
    const np = posicao(c);
    aneis.push({ x: np.x, y: np.y, t: -0.15 });
    soltar(np.x, np.y, 50, { cor: GALAXIA, vel: 520, vida: 1.2, tam: 8 });
    soltar(np.x, np.y, 6, { emoji: '✨', vel: 300, vida: 1.2, tam: 38 });
    const flash = document.createElement('div');
    flash.className = 'flash';
    flash.style.cssText = `--x:${np.x}px;--y:${np.y}px`;
    flash.addEventListener('animationend', () => flash.remove(), { once: true });
    palco.appendChild(flash);
    flutuar(palco, { x: np.x, y: np.y - 90, texto: '🌌 TELEPORTE!', cor: '#c79bff', tamanho: 64 });
    avisar(html`🌌 <span><b>${quem}</b> <span class="roxo">teleportou pro 1º!</span></span>`);
    tocar('virada');
  }
}

/* ---------- loop ---------- */
let ultimoNumero = null;
function contar() {
  const el = $('largada');
  const n = estado === 'largada' ? Math.ceil(contagem) : estado === 'correndo' && contagem > -0.9 ? 0 : null;
  if (n === ultimoNumero) return;
  ultimoNumero = n;
  if (n === null || n > 3) { el.textContent = ''; el.className = 'largada txt-jogo'; return; }
  el.textContent = n > 0 ? String(n) : 'JÁ!';
  el.className = `largada txt-jogo brilho${n === 0 ? ' ja' : ''}`;
  animar(el);
  if (n > 0) tocar('tique'); else { tocar('combo', 12); tremer(palco); }
  if (n === 0) setTimeout(() => el.classList.add('some'), 300);
}

function atualizar(dt) {
  if (estado === 'largada' || estado === 'correndo') contagem -= dt;
  if (estado === 'largada' && contagem <= 0) estado = 'correndo';
  for (const c of carros) c.pulso = Math.max(0, c.pulso - dt * 1.6);
  if (estado === 'correndo') {
    for (const c of carros) {
      if ((c.troca -= dt) <= 0) { c.alvo = (Math.random() * 2 - 1) * 0.12; c.troca = 1 + Math.random() * 1.5; }
      c.ruido += (c.alvo - c.ruido) * Math.min(1, dt * 1.5);
      let v = c.base * (1 + c.ruido);
      if (c.turbo > 0) { v *= 1.45; c.turbo -= dt; }
      const p = posicao(c);
      if (c.nitro > 0) {
        v *= 2.3; c.nitro -= dt;
        // rastro de fogo saindo do escapamento
        soltar(p.x - Math.cos(p.a) * 52, p.y - Math.sin(p.a) * 52, 4, { cor: FOGO, vel: 160, vida: 0.5, tam: 13, dir: p.a + Math.PI, abre: 0.7 });
      } else if (c.turbo > 0 && Math.random() < 0.4) {
        soltar(p.x - Math.cos(p.a) * 52, p.y - Math.sin(p.a) * 52, 1, { cor: ['#ff7aa8', '#fff'], vel: 80, vida: 0.4, tam: 6, dir: p.a + Math.PI, abre: 0.8 });
      }
      if (c.oleo > 0) {
        v *= 0.2; c.oleo -= dt; c.giro += dt * 14; c.giroFim = Math.ceil(c.giro / TAU) * TAU;
        marcas.push({ x: p.x, y: p.y, v: 3 });
      } else if (c.giro) { c.giro += dt * 14; if (c.giro >= c.giroFim) c.giro = 0; }
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
  for (let i = aneis.length - 1; i >= 0; i--) if ((aneis[i].t += dt) > 0.8) aneis.splice(i, 1);
  for (let i = marcas.length - 1; i >= 0; i--) if ((marcas[i].v -= dt) <= 0) marcas.splice(i, 1);
  if (marcas.length > 400) marcas.splice(0, marcas.length - 400);
  manchas = manchas.filter(m => (m.v -= dt) > 0);
}

function textoContorno(texto, x, y, tam, cor, contorno = CONTORNO) {
  ctx.font = `${tam}px ${FONTE}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = tam * 0.22;
  ctx.strokeStyle = contorno;
  ctx.strokeText(texto, x, y);
  ctx.fillStyle = cor;
  ctx.fillText(texto, x, y);
}

function rosto(x, y, r, c) {
  const img = foto(c.fotoUrl);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (img) { ctx.clip(); ctx.drawImage(img, x - r, y - r, r * 2, r * 2); }
  else {
    ctx.fillStyle = corDoNick(c.user); ctx.fill();
    ctx.fillStyle = CONTORNO; ctx.font = `${r * 0.85}px ${FONTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(iniciais(c.nome), x, y + 2);
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
}

function desenharCarro(c, t) {
  const p = posicao(c);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.a + c.giro);
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.roundRect(-48, -22, 104, 54, 16); ctx.fill();
  // rodas
  ctx.fillStyle = '#0a0b12';
  for (const [x, y] of [[-40, -33], [16, -33], [-40, 23], [16, 23]]) { ctx.beginPath(); ctx.roundRect(x, y, 26, 10, 4); ctx.fill(); }
  // brilho da cor do carro (mais forte no nitro)
  ctx.shadowColor = c.nitro > 0 ? '#ffb02e' : c.turbo > 0 ? '#ff7aa8' : c.cor;
  ctx.shadowBlur = c.nitro > 0 ? 50 + 10 * Math.sin(t * 30) : c.turbo > 0 ? 32 : 16;
  const corpo = ctx.createLinearGradient(0, -26, 0, 26);
  corpo.addColorStop(0, '#fff'); corpo.addColorStop(0.18, c.cor); corpo.addColorStop(1, c.cor);
  ctx.fillStyle = corpo;
  ctx.beginPath(); ctx.roundRect(-52, -26, 104, 52, [12, 24, 24, 12]); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 4; ctx.strokeStyle = CONTORNO; ctx.stroke();
  // aerofólio, faixa e para-brisa
  ctx.fillStyle = CONTORNO; ctx.fillRect(-58, -30, 12, 60);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-44, -5, 98, 10);
  ctx.fillStyle = 'rgba(20,24,44,.85)'; ctx.beginPath(); ctx.roundRect(24, -18, 14, 36, 6); ctx.fill();
  ctx.fillStyle = '#fffbe0'; ctx.fillRect(46, -21, 6, 10); ctx.fillRect(46, 11, 6, 10);
  ctx.restore();
  rosto(p.x, p.y, 25 * (1 + c.pulso * 0.5), c);
  return p;
}

function etiqueta(pos, nome, x, y, cor, ocupadas) {
  ctx.font = `28px ${FONTE}`;
  let w = ctx.measureText(nome).width + 72;
  // etiqueta por cima de outra (largada, pelotão): mostra só a posição
  const cobre = ocupadas.some(o => Math.abs(o.x - x) < (o.w + w) / 2 - 20 && Math.abs(o.y - y) < 30);
  if (cobre && pos !== '1') {
    ctx.fillStyle = cor;
    ctx.beginPath(); ctx.arc(x, y + 6, 18, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = CONTORNO; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    textoContorno(String(pos), x, y + 8, 24, '#fff');
    return;
  }
  ocupadas.push({ x, y, w });
  ctx.fillStyle = 'rgba(14,10,32,.9)';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - 21, w, 42, 21); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = cor; ctx.stroke();
  ctx.fillStyle = cor;
  ctx.beginPath(); ctx.arc(x - w / 2 + 21, y, 18, 0, TAU); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  textoContorno(String(pos), x - w / 2 + 21, y + 2, 24, '#fff');
  ctx.textAlign = 'left';
  textoContorno(nome, x - w / 2 + 46, y + 2, 28, '#fff');
}

function desenhar(t) {
  ctx.clearRect(0, 0, 1080, 1920);
  ctx.drawImage(pista, 0, 0);
  // flashes de câmera na torcida
  if (CENARIO) for (let i = 0; i < 3; i++) if (Math.random() < 0.12) {
    const [x, y] = Math.random() < 0.5 ? [Math.random() * 1080, 10 + Math.random() * 95]
      : [Math.random() < 0.5 ? 10 + Math.random() * 64 : 1006 + Math.random() * 64, 450 + Math.random() * 800];
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x, y, 4 + Math.random() * 4, 0, TAU); ctx.fill();
  }
  // marcas de pneu e manchas de óleo
  ctx.fillStyle = '#14151c';
  for (const m of marcas) { ctx.globalAlpha = Math.min(0.5, m.v / 3); ctx.fillRect(m.x - 5, m.y - 5, 10, 10); }
  for (const m of manchas) {
    ctx.globalAlpha = Math.min(1, m.v);
    ctx.fillStyle = '#07070c';
    ctx.beginPath(); ctx.ellipse(m.x, m.y, 62, 40, 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(176,107,255,.45)';
    ctx.beginPath(); ctx.ellipse(m.x - 14, m.y - 10, 24, 10, 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(61,242,194,.3)';
    ctx.beginPath(); ctx.ellipse(m.x + 16, m.y + 8, 16, 7, 0.4, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // anéis do teleporte
  for (const a of aneis) {
    if (a.t < 0) continue;
    const k = a.t / 0.8;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 10 * (1 - k) + 2;
    for (const [i, cor] of ['#b06bff', '#41d7ff'].entries()) {
      ctx.strokeStyle = cor;
      ctx.beginPath(); ctx.arc(a.x, a.y, 20 + k * (140 + i * 40), 0, TAU); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // partículas sem emoji brilham (aditivo)
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) {
    if (p.emoji) continue;
    ctx.globalAlpha = Math.max(0, p.v / p.m);
    ctx.fillStyle = p.cor; ctx.beginPath(); ctx.arc(p.x, p.y, p.tam * (0.4 + 0.6 * p.v / p.m), 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const lista = ordenados();
  const pos = lista.slice().reverse().map(c => [c, desenharCarro(c, t)]);
  const ocupadas = [];
  // etiquetas da frente para trás: o líder sempre ganha nome; os de trás viram número se cobrirem
  const etiquetas = pos.map(([c, p], i) => [c, p, pos.length - i]).reverse();
  etiquetas.forEach(([c, p, n]) => etiqueta(`${n}`, cortar(c.nome), p.x, p.y - 64, c.cor, ocupadas));
  etiquetas.reverse().forEach(([, p, n]) => {
    if (n === 1 && estado !== 'esperando') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `44px ${FONTE}`;
      ctx.fillText('👑', p.x, p.y - 112 + Math.sin(t * 5) * 4);
    }
  });
  for (const p of parts) {
    if (!p.emoji) continue;
    ctx.globalAlpha = Math.max(0, p.v / p.m);
    ctx.font = `${p.tam}px ${FONTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.emoji, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

let antes = performance.now(), acum = 0;
function quadro(agora) {
  const dt = Math.min(0.05, (agora - antes) / 1000);
  antes = agora;
  atualizar(dt);
  desenhar(agora / 1000);
  contar();
  $('chamada').style.display = estado === 'esperando' ? '' : 'none';
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
  // f: leva o líder para perto da chegada (testar o pódio)
  f: () => { const l = ordenados()[0]; if (l && estado === 'correndo') l.s = Math.max(l.s, META - 60); },
  r: () => {
    clearTimeout(timerFim); carros = []; campeoes.zerar(); ranking.zerar(); combo.zerar(); parts.length = 0; corrida = 1;
    novaCorrida(); vazioRanking('ranking', 'Mande 🌹 e apareça aqui!'); vazioRanking('vitorias', 'Quem leva a 1ª?');
  }
});

vazioRanking('ranking', 'Mande 🌹 e apareça aqui!');
vazioRanking('vitorias', 'Quem leva a 1ª?');
requestAnimationFrame(quadro);
conectar(aoEvento);
