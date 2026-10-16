import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, criarTimes, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, avatar, animar, particulas as pDom, tremer, confete,
  pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
const ctx = $('tela').getContext('2d');

// "arena" (padrão): cenário com público e holofotes; outra cor ou "transparente": só o ringue
const cenario = (cfg.fundo ?? 'arena') === 'arena';
aplicarFundo(cenario ? '#12061f' : cfg.fundo);
escalarPalco(palco);
ligarSom(cfg.som);

const VIDA = Math.max(1, Number(cfg.vida) || 500);
const PAUSA = Math.max(2, Number(cfg.pausa) || 5);
const NOME = { soco: 'SOCO', chute: 'CHUTE', especial: 'ESPECIAL', finalizacao: 'FINALIZAÇÃO' };
const EMOJI_GOLPE = { soco: '👊', chute: '🦵', especial: '⚡', finalizacao: '💥' };
const DURACAO = { soco: 0.32, chute: 0.42, especial: 0.8, finalizacao: 1 };
const IMPACTO = { soco: 0.5, chute: 0.5, especial: 0.85, finalizacao: 0.55 }; // fração da animação em que o golpe acerta
const ONOMATOPEIA = { soco: ['POW!', 'PAF!', 'TUM!'], chute: ['BAM!', 'CRACK!', 'PÁ!'], especial: ['ZAAP!', 'VUSH!'], finalizacao: ['KABOOM!', 'KRAKOW!'] };
const MAX_ANIM = 6, MAX_FILA = 30, MAX_PARTICULAS = 260, MAX_NUMEROS = 24, MAX_ONOMA = 5;
const CHAO = 1230;
const CONTORNO = '#1a1030';
const FONTE = '"Lilita One","Baloo 2",Impact,sans-serif';
const MARCOS = [10, 25, 50, 100, 250, 500, 1000];

const mapaGolpes = Object.fromEntries(Object.entries(cfg.golpes).map(([k, g]) => [k, g.presentes ?? []]));
const times = criarTimes(cfg.palavras);
const avisar = avisos($('avisos'), { max: 2 });
const combo = criarCombo({ janela: 4000 });
const ranking = criarRanking();
const timerCombo = [0, 0];

const lut = cfg.lutadores.slice(0, 2).map((l, i) => ({
  nome: l.nome, cor: l.cor, x: i ? 720 : 360, dir: i ? -1 : 1,
  vida: VIDA, estado: 'idle', t: 0, golpe: null, fila: [],
  flash: 0, recuo: 0
}));

const salvo = lembrar('briga', null);
let placar = Array.isArray(salvo?.placar) && salvo.placar.length === 2 && salvo.placar.every(Number.isFinite) ? salvo.placar : [0, 0];
let round = Number.isFinite(salvo?.round) ? salvo.round : 1;
let pausa = 0, tremor = 0, flashTela = 0, relogio = 0, agito = 0, ultimoSom = 0;
let anuncio = { txt: `ROUND ${round}`, t: 0 };
let particulas = [], numeros = [], impactos = [];

await document.fonts.load(`40px ${FONTE}`).catch(() => {});

/* ---------- HUD (só texto do config ou via textContent / html``) ---------- */

palco.style.setProperty('--cor-a', lut[0].cor);
palco.style.setProperty('--cor-b', lut[1].cor);
lut.forEach((f, i) => { $('nome' + i).textContent = f.nome; });

// legenda: emoji do presente, dano e nome do golpe
for (const [tipo, g] of Object.entries(cfg.golpes)) {
  const ref = g.presentes?.[0];
  const nomePresente = typeof ref === 'number' ? (g.nome ?? `#${ref}`) : String(ref ?? '');
  const chip = document.createElement('div');
  chip.className = 'golpe';
  const emoji = document.createElement('span');
  emoji.className = 'emoji';
  emoji.textContent = g.emoji ?? emojiDoPresente(nomePresente, EMOJI_GOLPE[tipo] ?? '🎁');
  const txt = document.createElement('div');
  txt.className = 'txt';
  const dano = document.createElement('span');
  dano.className = 'dano txt-jogo';
  dano.textContent = `-${g.dano}`;
  const rot = document.createElement('span');
  rot.className = 'rot';
  rot.textContent = NOME[tipo] ?? tipo;
  chip.title = nomePresente;
  txt.append(dano, rot);
  chip.append(emoji, txt);
  $('golpes').appendChild(chip);
}

function esperando() {
  const u = $('ultimo');
  u.style.removeProperty('--cor');
  const e = document.createElement('span');
  e.className = 'espera';
  e.textContent = '🥊';
  const t = document.createElement('span');
  t.className = 'golpeou txt-jogo';
  t.style.color = '#fff';
  t.textContent = 'Mande presente!';
  u.replaceChildren(e, t);
}

function pintarTop(destaque = null) {
  const lista = ranking.top(4);
  if (lista.length) pintarRanking($('ranking'), lista, { destaque });
  else {
    const vazio = document.createElement('li');
    vazio.className = 'ranking-vazio';
    vazio.textContent = `Comente ${cfg.palavras.A[0]} ou ${cfg.palavras.B[0]} e mande presente para bater!`;
    $('ranking').replaceChildren(vazio);
  }
}

function atualizarHud() {
  const tam = times.tamanho();
  lut.forEach((f, i) => {
    const frac = f.vida / VIDA;
    $('vida' + i).style.transform = `scaleX(${frac})`;
    $('rastro' + i).style.transform = `scaleX(${frac})`;
    $('barra' + i).classList.toggle('perigo', frac > 0 && frac < 0.25);
    $('hp' + i).textContent = Math.ceil(f.vida);
    const pal = cfg.palavras[i ? 'B' : 'A'][0];
    $('torcida' + i).replaceChildren('💬', Object.assign(document.createElement('b'), { textContent: pal }), `👥 ${tam[i ? 'B' : 'A']}`);
  });
  $('trofeu0').textContent = placar[0];
  $('trofeu1').textContent = placar[1];
  $('round').textContent = `ROUND ${round}`;
}

/* ---------- regras ---------- */

function mudar(f, estado) { f.estado = estado; f.t = 0; }

// Divide o dano total em até MAX_ANIM golpes animados (teto visual), sem perder dano.
function golpear(lado, tipo, nick, q) {
  const dano = Math.max(0, Number(cfg.golpes[tipo]?.dano) || 0);
  const total = dano * q;
  const n = Math.min(q, MAX_ANIM);
  const fila = lut[lado].fila;
  for (let k = 0; k < n; k++) {
    const parte = Math.floor(total / n) + (k < total % n ? 1 : 0);
    if (fila.length >= MAX_FILA) { fila[fila.length - 1].dano += parte; continue; }
    fila.push({ tipo, anim: DURACAO[tipo] ? tipo : 'soco', nick: String(nick).slice(0, 18), dano: parte });
  }
  return total;
}

function onomatopeia(x, y, txt, cor, tam) {
  const vivas = palco.querySelectorAll('.onoma');
  if (vivas.length >= MAX_ONOMA) vivas[0].remove();
  const o = document.createElement('div');
  o.className = 'onoma txt-jogo';
  o.textContent = txt;
  o.style.cssText = `left:${x}px;top:${y}px;--tam:${tam}px;--rot:${(Math.random() - 0.5) * 22}deg;--cor-onoma:#fff;--estouro:${cor}`;
  o.addEventListener('animationend', () => o.remove(), { once: true });
  palco.appendChild(o);
}

function acertar(i, g) {
  const a = lut[i], alvo = lut[1 - i];
  if (pausa > 0 || alvo.vida <= 0) return;
  alvo.vida = Math.max(0, alvo.vida - g.dano);
  alvo.flash = 0.18;
  alvo.recuo = Math.min(90, 18 + g.dano * 1.2);
  const barra = $('barra' + (1 - i));
  barra.classList.add('apanha');
  setTimeout(() => barra.classList.remove('apanha'), 120);

  const hx = alvo.x - alvo.dir * 40, hy = CHAO - (g.anim === 'chute' ? 330 : 450);
  const grande = g.dano >= 25;
  explodir(hx, hy, Math.min(10 + g.dano, 40), [a.cor, '#ffd23f', '#fff']);
  impactos.push({ x: hx, y: hy, t: 0, r: grande ? 190 : 110, cor: a.cor });
  if (impactos.length > 8) impactos.shift();
  if (numeros.length >= MAX_NUMEROS) numeros.shift();
  numeros.push({ x: alvo.x + (Math.random() - 0.5) * 220, y: CHAO - 640, y0: CHAO - 560 - Math.random() * 120, vy: -320 - Math.random() * 220, t: 0,
    txt: '-' + g.dano, nick: grande ? g.nick : '', cor: a.cor, tam: grande ? 120 : 84 });
  if (g.anim !== 'soco' || Math.random() < 0.35) {
    const lista = ONOMATOPEIA[g.anim];
    onomatopeia(hx + (Math.random() - 0.5) * 80, hy - 120, lista[Math.floor(Math.random() * lista.length)], a.cor,
      g.anim === 'finalizacao' ? 150 : grande ? 120 : 90);
  }
  if (grande) { tremor = Math.max(tremor, g.dano >= 60 ? 34 : 18); agito = 1; }
  if (g.anim === 'finalizacao') { flashTela = 0.3; tremer(palco, true); }
  else if (g.anim === 'especial') tremer(palco);
  const agora = performance.now();
  if (agora - ultimoSom > 110) { ultimoSom = agora; tocar('impacto'); }
  atualizarHud();
  if (alvo.vida <= 0) ko(i);
}

function ko(v) {
  mudar(lut[1 - v], 'ko');
  mudar(lut[v], 'vitoria');
  placar[v]++;
  guardar('briga', { placar, round });
  pausa = PAUSA;
  tremor = 44;
  flashTela = 0.45;
  agito = 1.5;
  tremer(palco, true);
  limparFaixas();
  const k = document.createElement('div');
  k.className = 'ko txt-jogo';
  k.append(Object.assign(document.createElement('span'), { textContent: 'K.O.!' }));
  const faixa = document.createElement('div');
  faixa.className = 'vencedor';
  faixa.style.setProperty('--destaque', lut[v].cor);
  const titulo = document.createElement('small');
  titulo.textContent = `🏆 Venceu o round ${round}`;
  faixa.append(titulo, lut[v].nome);
  palco.append(k, faixa);
  confete(palco, { cores: [lut[v].cor, '#ffd23f', '#fff', lut[1 - v].cor] });
  pDom(palco, { x: 540, y: 620, qtd: 36, forca: 1.6, cores: [lut[v].cor, '#ffd23f', '#fff'] });
  tocar('vitoria');
  atualizarHud();
  animar($('trofeu' + v));
}

function limparFaixas() { palco.querySelectorAll('.vencedor, .ko').forEach(e => e.remove()); }

function novoRound() {
  limparFaixas();
  pausa = 0;
  round++;
  lut.forEach(f => { f.vida = VIDA; mudar(f, 'idle'); });
  combo.zerar();
  [0, 1].forEach(i => $('combo' + i).classList.remove('on'));
  anuncio = { txt: `ROUND ${round}`, t: 0 };
  tocar('virada');
  guardar('briga', { placar, round });
  atualizarHud();
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
  // passou de um marco (10, 25, 50...): explosão e tremida
  if (MARCOS.some(m => n - ganho < m && n >= m)) {
    pDom(palco, { x: i ? 820 : 260, y: 405, qtd: 30, forca: 1.4, cores: [lut[i].cor, '#ffd23f', '#fff'] });
    tremer(palco, true);
    agito = 1;
  }
}

function mostrarUltimo(ev, i, tipo, total) {
  const u = $('ultimo');
  u.style.setProperty('--cor', lut[i].cor);
  const nome = document.createElement('span');
  nome.className = 'quem txt-jogo';
  nome.textContent = ev.nome || ev.user;
  const g = document.createElement('span');
  g.className = 'golpeou txt-jogo brilho';
  g.textContent = `${EMOJI_GOLPE[tipo] ?? '👊'} -${total}`;
  u.replaceChildren(avatar(ev, 'grande'), nome, g);
  animar(u);
}

function aoEvento(ev) {
  if (ev.tipo === 'comentario') { if (times.pelaPalavra(ev)) atualizarHud(); return; }
  if (ev.tipo !== 'presente') return;
  const tipo = acaoDoPresente(mapaGolpes, ev);
  if (!tipo) return;
  const q = Math.max(1, Math.min(9999, Math.floor(Number(ev.quantidade) || 1)));
  const lado = times.doUsuario(ev.user) === 'A' ? 0 : 1;
  const nick = ev.nome || ev.user;
  const total = golpear(lado, tipo, nick, q);
  atualizarHud();
  const emoji = cfg.golpes[tipo].emoji ?? emojiDoPresente(ev.presenteNome, EMOJI_GOLPE[tipo]);
  pDom(palco, { x: lado ? 900 : 180, y: 1000, qtd: Math.min(q, 5), emoji, forca: 0.7 });
  mostrarCombo(lado, combo.registrar(lado, q), q);
  mostrarUltimo(ev, lado, tipo, total);
  ranking.somar(ev, total, { cor: lut[lado].cor });
  pintarTop(ev.user);
  avisar(html`<span class="l${lado}"><b>${nick}</b> ${q > 1 ? q + '× ' : ''}${ev.presenteNome} <span class="mais">−${total}</span></span>`);
}

/* ---------- animação dos lutadores ---------- */

const GUARDA = {
  cabeca: [10, -525], ombro: [0, -430], quadril: [0, -250],
  cotoveloF: [70, -360], maoF: [125, -440], cotoveloT: [30, -350], maoT: [70, -460],
  joelhoF: [75, -130], peF: [95, 0], joelhoT: [-60, -125], peT: [-95, 0]
};
const POSES = {
  soco: { ombro: [25, -430], cabeca: [40, -520], cotoveloF: [150, -440], maoF: [275, -445] },
  chute: { ombro: [-40, -425], cabeca: [-50, -515], quadril: [-10, -250], joelhoF: [130, -280], peF: [295, -320] },
  especial: { cotoveloF: [120, -420], maoF: [225, -425], cotoveloT: [110, -395], maoT: [215, -390],
    joelhoF: [95, -120], peF: [135, 0], joelhoT: [-80, -120], peT: [-135, 0] },
  finalizacao: { ombro: [20, -440], cabeca: [35, -535], cotoveloF: [95, -530], maoF: [150, -690], maoT: [40, -430],
    joelhoF: [80, -170], peF: [40, -60], joelhoT: [-30, -150], peT: [-80, -40] },
  vitoria: { cotoveloF: [95, -560], maoF: [95, -690], cotoveloT: [-80, -560], maoT: [-85, -690] }
};
const SUPERIOR = ['cabeca', 'ombro', 'cotoveloF', 'maoF', 'cotoveloT', 'maoT'];

// 0..1 da animação -> quanto da pose de golpe aplicar (recua, estica rápido, segura, volta)
function curva(k) {
  if (k < 0.3) return -0.15 * (k / 0.3);
  if (k < 0.5) return -0.15 + 1.15 * ((k - 0.3) / 0.2);
  if (k < 0.75) return 1;
  return Math.max(0, 1 - (k - 0.75) / 0.25);
}

function pose(f) {
  let alvo = null, a = 0, dy = 0, rot = 0;
  if (f.estado === 'golpe') {
    const k = f.t / f.golpe.dur;
    alvo = POSES[f.golpe.anim];
    a = curva(k);
    if (f.golpe.anim === 'finalizacao') dy = -Math.sin(Math.PI * Math.min(1, k)) * 180;
  } else if (f.estado === 'vitoria') {
    alvo = POSES.vitoria;
    a = Math.min(1, f.t / 0.3);
    dy = -Math.abs(Math.sin(relogio * 6)) * 40;
  } else if (f.estado === 'ko') {
    const e = Math.min(1, f.t / 0.6);
    rot = -(Math.PI / 2) * 0.9 * e * e;
  }
  const bob = f.estado === 'ko' ? 0 : Math.sin(relogio * 5 + f.x) * 9;
  const P = { dy, rot: rot - f.recuo / 400 };
  for (const [nome, [x, y]] of Object.entries(GUARDA)) {
    const [tx, ty] = alvo?.[nome] ?? [x, y];
    P[nome] = [x + (tx - x) * a, y + (ty - y) * a + (SUPERIOR.includes(nome) ? bob : nome === 'quadril' ? bob / 2 : 0)];
  }
  return P;
}

function membro(pontos, cor, largura = 36, sombra = false) {
  ctx.beginPath();
  ctx.moveTo(...pontos[0]);
  for (const p of pontos.slice(1)) ctx.lineTo(...p);
  ctx.lineWidth = largura + 14; ctx.strokeStyle = CONTORNO; ctx.stroke();
  ctx.lineWidth = largura; ctx.strokeStyle = cor; ctx.stroke();
  if (sombra) { ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke(); }
}

function bola(x, y, r, cor, contorno = 7) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = cor; ctx.fill();
  ctx.lineWidth = contorno; ctx.strokeStyle = CONTORNO; ctx.stroke();
}

// luva com brilho (mais "de luta" que uma bola chapada)
function luva(x, y, r) {
  bola(x, y, r, '#ff4058');
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.35, r * 0.35, r * 0.2, -0.5, 0, Math.PI * 2); ctx.fill();
}

function cabeca([x, y], f, cor) {
  // faixa na testa com pontas balançando para trás
  const onda = Math.sin(relogio * 9 + f.x) * 14;
  ctx.lineWidth = 16; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 60, y - 28); ctx.quadraticCurveTo(x - 110, y - 40 + onda, x - 150, y - 10 + onda); ctx.stroke();
  bola(x, y, 68, cor, 9);
  ctx.fillStyle = '#fff'; ctx.fillRect(x - 66, y - 40, 132, 18);
  ctx.lineWidth = 4; ctx.strokeStyle = CONTORNO; ctx.strokeRect(x - 66, y - 40, 132, 18);
  ctx.lineWidth = 7; ctx.strokeStyle = CONTORNO;
  if (f.estado === 'ko') {
    ctx.beginPath();
    for (const ex of [x + 8, x + 40]) { ctx.moveTo(ex - 11, y - 7); ctx.lineTo(ex + 11, y + 15); ctx.moveTo(ex + 11, y - 7); ctx.lineTo(ex - 11, y + 15); }
    ctx.stroke();
    return;
  }
  for (const ex of [x + 8, x + 40]) {
    ctx.beginPath(); ctx.ellipse(ex, y + 4, 13, 16, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex + 5, y + 6, 6, 0, Math.PI * 2); ctx.fillStyle = CONTORNO; ctx.fill();
  }
  // sobrancelhas bravas; boca aberta quando apanha ou ataca
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(x - 6, y - 18); ctx.lineTo(x + 22, y - 10); ctx.moveTo(x + 28, y - 10); ctx.lineTo(x + 56, y - 20); ctx.stroke();
  ctx.beginPath();
  if (f.flash > 0 || f.estado === 'golpe' || f.estado === 'vitoria') { ctx.ellipse(x + 32, y + 40, 12, 10, 0, 0, Math.PI * 2); ctx.fillStyle = CONTORNO; ctx.fill(); }
  else { ctx.moveTo(x + 20, y + 40); ctx.lineTo(x + 46, y + 36); ctx.stroke(); }
}

function desenharLutador(f) {
  const P = pose(f);
  ctx.save();
  ctx.translate(f.x - f.dir * f.recuo, CHAO);
  // holofote no chão embaixo de cada lutador
  const luz = ctx.createRadialGradient(0, 8, 10, 0, 8, 220);
  luz.addColorStop(0, 'rgba(255,240,200,.28)'); luz.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = luz;
  ctx.beginPath(); ctx.ellipse(0, 8, 230, 52, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(0, 8, f.estado === 'ko' ? 260 : 150 + P.dy * 0.3, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(f.dir, 1);
  ctx.translate(f.estado === 'ko' ? 270 * Math.min(1, f.t / 0.6) : 0, P.dy); // cai para o centro, senão sai da tela
  ctx.rotate(P.rot);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const cor = f.flash > 0 ? '#ffffff' : f.cor;
  membro([P.ombro, P.cotoveloT, P.maoT], cor, 34, true);
  membro([P.quadril, P.joelhoT, P.peT], cor, 38, true);
  bola(P.peT[0] + 14, P.peT[1] - 10, 22, '#20263f');
  luva(...P.maoT, 32);
  membro([P.quadril, P.ombro], cor, 78);
  ctx.fillStyle = CONTORNO; ctx.fillRect(P.quadril[0] - 46, P.quadril[1] - 16, 92, 30);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(P.quadril[0] - 12, P.quadril[1] - 10, 24, 18);
  cabeca(P.cabeca, f, cor);
  membro([P.quadril, P.joelhoF, P.peF], cor, 38);
  bola(P.peF[0] + 14, P.peF[1] - 10, 22, '#20263f');
  membro([P.ombro, P.cotoveloF, P.maoF], cor, 34);
  luva(...P.maoF, 34);
  ctx.restore();
}

// orbe do golpe especial viajando entre os dois
function desenharOrbe(f, outro) {
  if (f.estado !== 'golpe' || f.golpe.anim !== 'especial') return;
  const k = f.t / f.golpe.dur;
  const inicio = 0.45, fim = IMPACTO.especial;
  if (k > fim) return;
  const p = Math.max(0, (k - inicio) / (fim - inicio));
  const x = f.x + f.dir * 230 + (outro.x - f.dir * 40 - (f.x + f.dir * 230)) * p;
  const y = CHAO - 420;
  const r = k < inicio ? 20 + 40 * (k / inicio) : 60;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
  g.addColorStop(0, '#fff'); g.addColorStop(0.35, f.cor); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();
}

// flash de impacto: estrela branca de pontas irregulares que estoura e some
function desenharImpacto(im) {
  const k = im.t / 0.2;
  const r = im.r * (0.5 + k * 0.7);
  ctx.save();
  ctx.translate(im.x, im.y);
  ctx.rotate(im.x * 0.01);
  ctx.globalAlpha = 1 - k;
  ctx.beginPath();
  for (let p = 0; p < 20; p++) {
    const ang = (p / 20) * Math.PI * 2, rr = p % 2 ? r * 0.42 : r * (0.85 + ((p * 37) % 7) / 20);
    ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.lineWidth = 10; ctx.strokeStyle = im.cor; ctx.stroke();
  ctx.restore();
}

function explodir(x, y, n, cores) {
  for (let k = 0; k < n && particulas.length < MAX_PARTICULAS; k++) {
    const ang = Math.random() * Math.PI * 2, vel = 300 + Math.random() * 700;
    particulas.push({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel - 200, vida: 0.5 + Math.random() * 0.4,
      r: 6 + Math.random() * 9, cor: cores[k % cores.length] });
  }
}

function texto(txt, x, y, tam, cor, contorno = 14, c = ctx) {
  c.font = `400 ${tam}px ${FONTE}`;
  c.lineWidth = contorno; c.strokeStyle = CONTORNO; c.lineJoin = 'round';
  c.strokeText(txt, x, y);
  c.fillStyle = cor; c.fillText(txt, x, y);
}

/* ---------- cenário: fundo, público e ringue pré-desenhados ---------- */

// mistura uma cor #rrggbb do config com um tom base [r,g,b]
function misturar(hex, base, k) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex).trim());
  const cor = m ? m.slice(1).map(h => parseInt(h, 16)) : [124, 92, 255];
  return `rgb(${base.map((b, i) => Math.round(b + (cor[i] - b) * k)).join(',')})`;
}

function novaTela(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

const fundo = novaTela(1080, 1920);
if (cenario) (function pintarFundo(c) {
  const g = c.createLinearGradient(0, 0, 0, 1920);
  g.addColorStop(0, '#1d0a3e'); g.addColorStop(0.3, '#3a1260'); g.addColorStop(0.58, '#1a0a33'); g.addColorStop(1, '#0d0519');
  c.fillStyle = g; c.fillRect(0, 0, 1080, 1920);
  // telão de LED no fundo com as cores dos lutadores
  const led = c.createLinearGradient(0, 0, 1080, 0);
  led.addColorStop(0, lut[0].cor); led.addColorStop(0.5, '#ffd23f'); led.addColorStop(1, lut[1].cor);
  c.globalAlpha = 0.5; c.fillStyle = led; c.fillRect(0, 488, 1080, 10); c.globalAlpha = 1;
  // arquibancada atrás do ringue
  c.fillStyle = '#140826'; c.fillRect(0, 498, 1080, 640);
  // grade de proteção com faixa luminosa
  c.fillStyle = '#0f061f'; c.fillRect(0, 1060, 1080, 80);
  c.globalAlpha = 0.8; c.fillStyle = led; c.fillRect(0, 1060, 1080, 6); c.globalAlpha = 1;
})(fundo.getContext('2d'));

// público em fileiras: de trás (menor, escuro) para frente (maior, mais claro); camisa puxa a cor do lado
const plateia = novaTela(1080, 600);
if (cenario) (function pintarPlateia(c) {
  let semente = 7;
  const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < 7; r++) {
    const y = 60 + r * 78, raio = 17 + r * 2.6, passo = 50 + r * 7;
    for (let x = -20 + (r % 2) * passo / 2; x < 1100; x += passo) {
      const px = x + (rnd() - 0.5) * 14, py = y + (rnd() - 0.5) * 10;
      const lado = px < 540 ? 0 : 1;
      const luz = 16 + r * 4 + rnd() * 6;
      c.fillStyle = misturar(lut[lado].cor, [36 + luz * 2, 24 + luz * 1.5, 52 + luz * 2.4], 0.14 + r * 0.04);
      // braços pra cima em parte da torcida
      if (rnd() < 0.22) {
        c.lineWidth = raio * 0.55; c.lineCap = 'round'; c.strokeStyle = c.fillStyle;
        c.beginPath(); c.moveTo(px - raio * 0.8, py + raio * 1.6); c.lineTo(px - raio * 1.3, py - raio * 1.4);
        c.moveTo(px + raio * 0.8, py + raio * 1.6); c.lineTo(px + raio * 1.3, py - raio * 1.4); c.stroke();
      }
      c.beginPath(); c.ellipse(px, py + raio * 2.3, raio * 1.35, raio * 1.4, 0, Math.PI, 0); c.fill();
      c.fillStyle = `hsl(268 30% ${luz + 6}%)`;
      c.beginPath(); c.arc(px, py, raio, 0, Math.PI * 2); c.fill();
    }
    // plaquinhas com a palavra de cada time nas fileiras da frente
    if (r >= 4 && r <= 5) for (let k = 0; k < 2; k++) {
      const lado = (k + r) % 2, px = 80 + rnd() * 920, py = y - 30;
      c.save(); c.translate(px, py); c.rotate((rnd() - 0.5) * 0.3);
      c.fillStyle = '#fff'; c.fillRect(-46, -30, 92, 60);
      c.lineWidth = 5; c.strokeStyle = lut[lado].cor; c.strokeRect(-46, -30, 92, 60);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `400 44px ${FONTE}`; c.fillStyle = lut[lado].cor;
      c.fillText(String(cfg.palavras[lado ? 'B' : 'A'][0]).slice(0, 3) + '!', 0, 3);
      c.restore();
    }
  }
})(plateia.getContext('2d'));

const ringue = novaTela(1080, 1920);
(function pintarRingue(c) {
  c.lineCap = 'round';
  // cordas de trás
  [['#ff3d7f', 905], ['#ffffff', 975], ['#3df2c2', 1045]].forEach(([cor, y]) => {
    c.lineWidth = 12; c.strokeStyle = CONTORNO;
    c.beginPath(); c.moveTo(90, y); c.quadraticCurveTo(540, y + 18, 990, y); c.stroke();
    c.lineWidth = 8; c.strokeStyle = cor;
    c.beginPath(); c.moveTo(90, y); c.quadraticCurveTo(540, y + 18, 990, y); c.stroke();
  });
  // postes nas cores dos lutadores
  [[90, lut[0].cor], [990, lut[1].cor]].forEach(([x, cor]) => {
    c.lineWidth = 34; c.strokeStyle = CONTORNO; c.beginPath(); c.moveTo(x, 860); c.lineTo(x, 1135); c.stroke();
    c.lineWidth = 24; c.strokeStyle = cor; c.beginPath(); c.moveTo(x, 860); c.lineTo(x, 1135); c.stroke();
    c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(x, 860, 24, 0, Math.PI * 2); c.fill();
    c.lineWidth = 6; c.strokeStyle = CONTORNO; c.stroke();
  });
  // lona
  const piso = c.createLinearGradient(0, 1130, 0, 1320);
  piso.addColorStop(0, '#3b2a7a'); piso.addColorStop(1, '#22174d');
  c.fillStyle = piso;
  c.beginPath(); c.moveTo(90, 1130); c.lineTo(990, 1130); c.lineTo(1080, 1320); c.lineTo(0, 1320); c.closePath(); c.fill();
  c.lineWidth = 8; c.strokeStyle = '#fff'; c.stroke();
  c.lineWidth = 8; c.strokeStyle = 'rgba(255,210,63,.35)';
  c.beginPath(); c.ellipse(540, 1228, 320, 58, 0, 0, Math.PI * 2); c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.globalAlpha = 0.18; texto('VS', 540, 1230, 90, '#fff', 0, c); c.globalAlpha = 1;
  // saia do ringue com o nome do jogo
  const saia = c.createLinearGradient(0, 1320, 0, 1384);
  saia.addColorStop(0, '#c4123f'); saia.addColorStop(1, '#7a0a2a');
  c.fillStyle = saia; c.fillRect(0, 1320, 1080, 64);
  c.fillStyle = '#ffd23f'; c.fillRect(0, 1320, 1080, 6);
  texto('BRIGA DA LIVE', 540, 1355, 44, '#ffd23f', 10, c);
})(ringue.getContext('2d'));

// holofotes que balançam e flashes de câmera no público (desenho leve a cada quadro)
function desenharLuzes() {
  if (!cenario) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  [[120, 0.5, '255,220,150'], [540, 0, '200,170,255'], [960, -0.5, '255,220,150']].forEach(([x, base, rgb], k) => {
    const ang = base + Math.sin(relogio * 0.7 + k * 2) * 0.22;
    ctx.save(); ctx.translate(x, 440); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, 0, 900);
    g.addColorStop(0, `rgba(${rgb},.32)`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.lineTo(190, 900); ctx.lineTo(-190, 900); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
  for (let k = 0; k < 3; k++) {
    if (Math.random() > 0.25 + agito * 0.5) continue;
    const x = Math.random() * 1080, y = 560 + Math.random() * 480;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 26, y - 26, 52, 52);
  }
  ctx.restore();
}

/* ---------- laço ---------- */

function atualizar(dt) {
  if (pausa > 0 && (pausa -= dt) <= 0) novoRound();
  tremor = Math.max(0, tremor - dt * 70);
  flashTela = Math.max(0, flashTela - dt);
  agito = Math.max(0, agito - dt * 1.5);
  if (anuncio && (anuncio.t += dt) > 1.8) anuncio = null;
  lut.forEach((f, i) => {
    f.t += dt;
    f.flash = Math.max(0, f.flash - dt);
    f.recuo = Math.max(0, f.recuo - dt * 260);
    if (f.estado === 'golpe') {
      const g = f.golpe;
      if (!g.acertou && f.t >= g.dur * IMPACTO[g.anim]) { g.acertou = true; acertar(i, g); }
      if (f.estado === 'golpe' && f.t >= g.dur) mudar(f, 'idle');
    }
    if (f.estado === 'idle' && pausa <= 0 && f.fila.length) {
      f.golpe = f.fila.shift();
      f.golpe.dur = DURACAO[f.golpe.anim] / (f.fila.length > 2 ? 1.8 : 1); // fila cheia: golpes mais rápidos
      mudar(f, 'golpe');
    }
  });
  for (const p of particulas) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1800 * dt; p.vida -= dt; }
  particulas = particulas.filter(p => p.vida > 0);
  for (const im of impactos) im.t += dt;
  impactos = impactos.filter(im => im.t < 0.2);
  for (const n of numeros) {
    n.t += dt;
    n.y += n.vy * dt; n.vy += 1700 * dt;
    if (n.y > n.y0 && n.vy > 0) { n.y = n.y0; n.vy *= -0.45; }
  }
  numeros = numeros.filter(n => n.t < 1.4);
}

function desenhar() {
  ctx.clearRect(0, 0, 1080, 1920);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save();
  if (tremor > 0) ctx.translate((Math.random() - 0.5) * tremor, (Math.random() - 0.5) * tremor);
  if (cenario) {
    ctx.drawImage(fundo, 0, 0);
    // público pula nos golpes grandes
    const pulo = agito > 0 ? Math.abs(Math.sin(relogio * 22)) * 14 * Math.min(1, agito) : Math.abs(Math.sin(relogio * 3)) * 3;
    ctx.drawImage(plateia, 0, 500 - pulo);
  }
  desenharLuzes();
  ctx.drawImage(ringue, 0, 0);
  // quem está batendo fica na frente
  const ordem = lut[0].estado === 'golpe' ? [1, 0] : [0, 1];
  for (const i of ordem) desenharLutador(lut[i]);
  lut.forEach((f, i) => desenharOrbe(f, lut[1 - i]));
  for (const im of impactos) desenharImpacto(im);
  for (const p of particulas) {
    ctx.globalAlpha = Math.min(1, p.vida * 3);
    ctx.fillStyle = p.cor;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const n of numeros) {
    const pop = n.t < 0.12 ? 0.6 + (n.t / 0.12) * 0.6 : n.t < 0.2 ? 1.2 - ((n.t - 0.12) / 0.08) * 0.2 : 1;
    ctx.globalAlpha = Math.min(1, (1.4 - n.t) * 3);
    ctx.save(); ctx.translate(n.x, n.y); ctx.scale(pop, pop);
    texto(n.txt, 0, 0, n.tam, '#fff', 16);
    if (n.nick) texto(n.nick, 0, n.tam * 0.72, 40, n.cor, 10);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  lut.forEach(f => { if (f.estado === 'ko') texto('💫', f.x - f.dir * 250, CHAO - 200 + Math.sin(relogio * 6) * 10, 70, '#fff', 0); });
  ctx.restore();
  if (flashTela > 0) { ctx.fillStyle = `rgba(255,255,255,${flashTela * 1.4})`; ctx.fillRect(0, 0, 1080, 1920); }
  if (anuncio) {
    const k = anuncio.t;
    ctx.globalAlpha = Math.min(1, (1.8 - k) * 3);
    ctx.save(); ctx.translate(540, 700); const s = k < 0.25 ? 0.5 + k * 2 : 1; ctx.scale(s, s);
    texto(anuncio.txt, 0, -70, 150, '#ffd23f', 22);
    ctx.rotate(-0.05);
    texto('LUTEM!', 0, 80, 120, '#fff', 20);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

let anterior = performance.now();
function quadro(agora) {
  const dt = Math.min(0.05, (agora - anterior) / 1000);
  anterior = agora;
  relogio += dt;
  atualizar(dt);
  desenhar();
  requestAnimationFrame(quadro);
}

/* ---------- teclas de teste ---------- */

const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];
function presenteFalso(ref, quantidade) {
  return eventoFalso(typeof ref === 'number'
    ? { presenteId: ref, presenteNome: 'presente', quantidade }
    : { presenteNome: String(ref), quantidade });
}
const refsGolpes = Object.values(cfg.golpes).map(g => g.presentes?.[0]).filter(r => r != null);

teclas({
  t: () => {
    for (let k = 0; k < 14; k++) setTimeout(() => {
      const r = Math.random();
      if (r < 0.4) aoEvento(eventoFalso({ tipo: 'comentario', texto: sortear([cfg.palavras.A[0], cfg.palavras.B[0]]) }));
      else if (r < 0.5) aoEvento(eventoFalso({ presenteNome: 'Finger Heart' }));
      else aoEvento(presenteFalso(sortear(refsGolpes), 1 + Math.floor(Math.random() * 3)));
    }, k * 180);
  },
  r: () => {
    placar = [0, 0]; round = 0; particulas = []; numeros = []; impactos = [];
    lut.forEach(f => { f.fila.length = 0; });
    ranking.zerar();
    pintarTop();
    esperando();
    novoRound();
  },
  1: () => golpear(0, sortear(Object.keys(cfg.golpes)), 'teste', 1),
  2: () => golpear(1, sortear(Object.keys(cfg.golpes)), 'teste', 1),
  // K: finalização que nocauteia o lado B (para testar o fim de round)
  k: () => { if (pausa <= 0) { lut[1].vida = Math.min(lut[1].vida, 1); golpear(0, 'finalizacao', 'teste', 1); } }
});

atualizarHud();
pintarTop();
esperando();
tocar('virada');
requestAnimationFrame(quadro);
conectar(aoEvento);
