import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, criarTimes, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
const ctx = $('tela').getContext('2d');

aplicarFundo(cfg.fundo);
escalarPalco(palco);

const VIDA = Math.max(1, Number(cfg.vida) || 500);
const ROTULO = { soco: '👊 Soco', chute: '🦵 Chute', especial: '⚡ Especial', finalizacao: '💥 Finalização' };
const DURACAO = { soco: 0.32, chute: 0.42, especial: 0.8, finalizacao: 1 };
const IMPACTO = { soco: 0.5, chute: 0.5, especial: 0.85, finalizacao: 0.55 }; // fração da animação em que o golpe acerta
const ONOMATOPEIA = { soco: 'POW!', chute: 'BAM!', especial: 'ZAAP!', finalizacao: 'KABOOM!' };
const MAX_ANIM = 6, MAX_FILA = 30, MAX_PARTICULAS = 260, MAX_NUMEROS = 24;
const CHAO = 1270;
const FONTE = '"Segoe UI",system-ui,sans-serif';

const mapaGolpes = Object.fromEntries(Object.entries(cfg.golpes).map(([k, g]) => [k, g.presentes ?? []]));
const times = criarTimes(cfg.palavras);
const avisar = avisos($('avisos'), { max: 2 });

const lut = cfg.lutadores.slice(0, 2).map((l, i) => ({
  nome: l.nome, cor: l.cor, x: i ? 720 : 360, dir: i ? -1 : 1,
  vida: VIDA, estado: 'idle', t: 0, golpe: null, fila: [],
  flash: 0, recuo: 0, combo: 0, ultimoAcerto: -9, comboT: 0
}));

const salvo = lembrar('briga', null);
let placar = Array.isArray(salvo?.placar) && salvo.placar.length === 2 && salvo.placar.every(Number.isFinite) ? salvo.placar : [0, 0];
let round = Number.isFinite(salvo?.round) ? salvo.round : 1;
let pausa = 0, tremor = 0, flashTela = 0, relogio = 0;
let anuncio = { txt: `ROUND ${round}`, t: 0 };
let particulas = [], numeros = [];

/* ---------- HUD (só texto do config ou via textContent / html``) ---------- */

palco.style.setProperty('--cor-a', lut[0].cor);
palco.style.setProperty('--cor-b', lut[1].cor);
lut.forEach((f, i) => { $('nome' + i).textContent = f.nome; });
$('chamada').innerHTML = html`Comente <b class="l0">${cfg.palavras.A[0]}</b> para ${lut[0].nome} · <b class="l1">${cfg.palavras.B[0]}</b> para ${lut[1].nome}`.__html;
for (const [tipo, g] of Object.entries(cfg.golpes)) {
  const chip = document.createElement('span');
  chip.className = 'chip';
  const ref = g.presentes?.[0];
  chip.textContent = `${ROTULO[tipo] ?? tipo} ${g.dano} · ${typeof ref === 'number' ? '#' + ref : ref}`;
  $('golpes').appendChild(chip);
}

function atualizarHud() {
  const tam = times.tamanho();
  lut.forEach((f, i) => {
    const pct = (f.vida / VIDA) * 100;
    $('vida' + i).style.width = pct + '%';
    $('rastro' + i).style.width = pct + '%';
    $('barra' + i).classList.toggle('perigo', pct > 0 && pct < 25);
    $('hp' + i).textContent = `${Math.ceil(f.vida)} / ${VIDA}`;
    $('torcida' + i).textContent = `👥 ${tam[i ? 'B' : 'A']}`;
  });
  $('placar').replaceChildren(String(placar[0]), Object.assign(document.createElement('span'), { textContent: '×' }), String(placar[1]));
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

function acertar(i, g) {
  const a = lut[i], alvo = lut[1 - i];
  if (pausa > 0 || alvo.vida <= 0) return;
  alvo.vida = Math.max(0, alvo.vida - g.dano);
  alvo.flash = 0.18;
  alvo.recuo = Math.min(90, 18 + g.dano * 1.2);
  a.combo = relogio - a.ultimoAcerto < 1.5 ? a.combo + 1 : 1;
  a.ultimoAcerto = relogio;
  a.comboT = 1.4;

  const hx = alvo.x - alvo.dir * 40, hy = CHAO - (g.anim === 'chute' ? 330 : 450);
  const grande = g.dano >= 25;
  explodir(hx, hy, Math.min(10 + g.dano, 40), [a.cor, '#ffc23d', '#fff']);
  if (numeros.length >= MAX_NUMEROS) numeros.shift();
  numeros.push({ x: alvo.x + (Math.random() - 0.5) * 220, y: CHAO - 640, y0: CHAO - 560 - Math.random() * 120, vy: -600 - Math.random() * 300, t: 0,
    txt: '-' + g.dano, nick: g.nick, cor: a.cor, tam: grande ? 110 : 76 });
  if (g.anim !== 'soco' || Math.random() < 0.3) {
    numeros.push({ x: hx, y: hy - 60, y0: hy, vy: 0, t: 0, txt: ONOMATOPEIA[g.anim], cor: '#ffc23d', tam: grande ? 96 : 70, onoma: true });
  }
  if (grande) tremor = Math.max(tremor, g.dano >= 60 ? 34 : 18);
  if (g.anim === 'finalizacao') flashTela = 0.3;
  atualizarHud();
  if (alvo.vida <= 0) ko(i);
}

function ko(v) {
  mudar(lut[1 - v], 'ko');
  mudar(lut[v], 'vitoria');
  placar[v]++;
  guardar('briga', { placar, round });
  pausa = 5;
  tremor = 40;
  document.querySelector('.vencedor')?.remove();
  const faixa = document.createElement('div');
  faixa.className = 'vencedor';
  faixa.style.setProperty('--destaque', lut[v].cor);
  const titulo = document.createElement('small');
  titulo.textContent = `K.O.! · Round ${round}`;
  faixa.append(titulo, `${lut[v].nome} venceu!`);
  palco.appendChild(faixa);
  atualizarHud();
}

function novoRound() {
  document.querySelector('.vencedor')?.remove();
  pausa = 0;
  round++;
  lut.forEach(f => { f.vida = VIDA; f.combo = 0; f.comboT = 0; mudar(f, 'idle'); });
  anuncio = { txt: `ROUND ${round}`, t: 0 };
  guardar('briga', { placar, round });
  atualizarHud();
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
  avisar(html`<span class="l${lado}"><b>${nick}</b> ${q > 1 ? q + '× ' : ''}${ev.presenteNome} → <span class="mais">${ROTULO[tipo] ?? tipo} −${total}</span></span>`);
}

/* ---------- animação ---------- */

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
  ctx.lineWidth = largura + 14; ctx.strokeStyle = '#0b0d17'; ctx.stroke();
  ctx.lineWidth = largura; ctx.strokeStyle = cor; ctx.stroke();
  if (sombra) { ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke(); }
}

function bola(x, y, r, cor, contorno = 7) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = cor; ctx.fill();
  ctx.lineWidth = contorno; ctx.strokeStyle = '#0b0d17'; ctx.stroke();
}

function cabeca([x, y], f, cor) {
  // faixa na testa com pontas balançando para trás
  const onda = Math.sin(relogio * 9 + f.x) * 14;
  ctx.lineWidth = 16; ctx.strokeStyle = '#eef1fa'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 60, y - 28); ctx.quadraticCurveTo(x - 110, y - 40 + onda, x - 150, y - 10 + onda); ctx.stroke();
  bola(x, y, 68, cor, 9);
  ctx.fillStyle = '#eef1fa'; ctx.fillRect(x - 66, y - 40, 132, 18);
  ctx.lineWidth = 4; ctx.strokeStyle = '#0b0d17'; ctx.strokeRect(x - 66, y - 40, 132, 18);
  ctx.lineWidth = 7; ctx.strokeStyle = '#0b0d17';
  if (f.estado === 'ko') {
    ctx.beginPath();
    for (const ex of [x + 8, x + 40]) { ctx.moveTo(ex - 11, y - 7); ctx.lineTo(ex + 11, y + 15); ctx.moveTo(ex + 11, y - 7); ctx.lineTo(ex - 11, y + 15); }
    ctx.stroke();
    return;
  }
  for (const ex of [x + 8, x + 40]) {
    ctx.beginPath(); ctx.ellipse(ex, y + 4, 13, 16, 0, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex + 5, y + 6, 6, 0, Math.PI * 2); ctx.fillStyle = '#0b0d17'; ctx.fill();
  }
  // sobrancelhas bravas; boca aberta quando apanha ou ataca
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(x - 6, y - 18); ctx.lineTo(x + 22, y - 10); ctx.moveTo(x + 28, y - 10); ctx.lineTo(x + 56, y - 20); ctx.stroke();
  ctx.beginPath();
  if (f.flash > 0 || f.estado === 'golpe' || f.estado === 'vitoria') { ctx.ellipse(x + 32, y + 40, 12, 10, 0, 0, Math.PI * 2); ctx.fillStyle = '#0b0d17'; ctx.fill(); }
  else { ctx.moveTo(x + 20, y + 40); ctx.lineTo(x + 46, y + 36); ctx.stroke(); }
}

function desenharLutador(f) {
  const P = pose(f);
  ctx.save();
  ctx.translate(f.x - f.dir * f.recuo, CHAO);
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
  bola(...P.maoT, 32, '#eef1fa');
  membro([P.quadril, P.ombro], cor, 78);
  ctx.fillStyle = '#0b0d17'; ctx.fillRect(P.quadril[0] - 46, P.quadril[1] - 16, 92, 30);
  ctx.fillStyle = '#ffc23d'; ctx.fillRect(P.quadril[0] - 12, P.quadril[1] - 10, 24, 18);
  cabeca(P.cabeca, f, cor);
  membro([P.quadril, P.joelhoF, P.peF], cor, 38);
  bola(P.peF[0] + 14, P.peF[1] - 10, 22, '#20263f');
  membro([P.ombro, P.cotoveloF, P.maoF], cor, 34);
  bola(...P.maoF, 34, '#eef1fa');
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

function explodir(x, y, n, cores) {
  for (let k = 0; k < n && particulas.length < MAX_PARTICULAS; k++) {
    const ang = Math.random() * Math.PI * 2, vel = 300 + Math.random() * 700;
    particulas.push({ x, y, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel - 200, vida: 0.5 + Math.random() * 0.4,
      r: 6 + Math.random() * 9, cor: cores[k % cores.length] });
  }
}

function texto(txt, x, y, tam, cor, contorno = 14) {
  ctx.font = `900 ${tam}px ${FONTE}`;
  ctx.lineWidth = contorno; ctx.strokeStyle = '#0b0d17'; ctx.lineJoin = 'round';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = cor; ctx.fillText(txt, x, y);
}

// Arena pré-desenhada uma vez num canvas fora da tela.
const arena = document.createElement('canvas');
arena.width = 1080; arena.height = 1920;
(function pintarArena(c) {
  const luz = c.createRadialGradient(540, 1180, 40, 540, 1000, 720);
  luz.addColorStop(0, 'rgba(61,242,194,.18)'); luz.addColorStop(1, 'rgba(61,242,194,0)');
  c.fillStyle = luz; c.fillRect(0, 300, 1080, 1200);
  c.lineCap = 'round';
  for (const x of [90, 990]) { c.lineWidth = 24; c.strokeStyle = '#2a3152'; c.beginPath(); c.moveTo(x, 880); c.lineTo(x, 1175); c.stroke(); }
  [['#ff3d7f', 950], ['#eef1fa', 1020], ['#3df2c2', 1090]].forEach(([cor, y]) => {
    c.lineWidth = 9; c.strokeStyle = cor; c.globalAlpha = 0.8;
    c.beginPath(); c.moveTo(90, y); c.quadraticCurveTo(540, y + 18, 990, y); c.stroke();
  });
  c.globalAlpha = 1;
  for (const x of [90, 990]) { c.fillStyle = '#ffc23d'; c.beginPath(); c.arc(x, 880, 20, 0, Math.PI * 2); c.fill(); }
  const piso = c.createLinearGradient(0, 1170, 0, 1360);
  piso.addColorStop(0, '#1b2036'); piso.addColorStop(1, '#11152a');
  c.fillStyle = piso;
  c.beginPath(); c.moveTo(90, 1170); c.lineTo(990, 1170); c.lineTo(1080, 1360); c.lineTo(0, 1360); c.closePath(); c.fill();
  c.lineWidth = 6; c.strokeStyle = '#3df2c2'; c.stroke();
  c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,.08)';
  c.beginPath(); c.ellipse(540, 1268, 300, 54, 0, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#151a2c'; c.fillRect(0, 1360, 1080, 70);
  c.fillStyle = '#ff3d7f'; c.fillRect(0, 1360, 1080, 8);
  c.font = `900 40px ${FONTE}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = 'rgba(255,255,255,.4)'; c.fillText('B R I G A   D A   L I V E', 540, 1400);
})(arena.getContext('2d'));

function atualizar(dt) {
  if (pausa > 0 && (pausa -= dt) <= 0) novoRound();
  tremor = Math.max(0, tremor - dt * 70);
  flashTela = Math.max(0, flashTela - dt);
  if (anuncio && (anuncio.t += dt) > 1.8) anuncio = null;
  lut.forEach((f, i) => {
    f.t += dt;
    f.flash = Math.max(0, f.flash - dt);
    f.recuo = Math.max(0, f.recuo - dt * 260);
    f.comboT = Math.max(0, f.comboT - dt);
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
  for (const n of numeros) {
    n.t += dt;
    if (n.onoma) continue;
    n.y += n.vy * dt; n.vy += 1700 * dt;
    if (n.y > n.y0 && n.vy > 0) { n.y = n.y0; n.vy *= -0.45; }
  }
  numeros = numeros.filter(n => n.t < (n.onoma ? 0.6 : 1.4));
}

function desenhar() {
  ctx.clearRect(0, 0, 1080, 1920);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save();
  if (tremor > 0) ctx.translate((Math.random() - 0.5) * tremor, (Math.random() - 0.5) * tremor);
  ctx.drawImage(arena, 0, 0);
  // quem está batendo fica na frente
  const ordem = lut[0].estado === 'golpe' ? [1, 0] : [0, 1];
  for (const i of ordem) desenharLutador(lut[i]);
  lut.forEach((f, i) => desenharOrbe(f, lut[1 - i]));
  for (const p of particulas) {
    ctx.globalAlpha = Math.min(1, p.vida * 3);
    ctx.fillStyle = p.cor;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const n of numeros) {
    const pop = n.t < 0.12 ? 0.6 + (n.t / 0.12) * 0.6 : n.t < 0.2 ? 1.2 - ((n.t - 0.12) / 0.08) * 0.2 : 1;
    ctx.globalAlpha = Math.min(1, ((n.onoma ? 0.6 : 1.4) - n.t) * 3);
    ctx.save(); ctx.translate(n.x, n.y); ctx.scale(pop, pop);
    if (n.onoma) { ctx.rotate(-0.12); texto(n.txt, 0, 0, n.tam, n.cor, 16); }
    else { texto(n.txt, 0, 0, n.tam, '#fff', 16); texto(n.nick, 0, n.tam * 0.72, 38, n.cor, 10); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  lut.forEach(f => {
    if (f.comboT <= 0 || f.combo < 3) return;
    const pop = 1 + 0.35 * Math.max(0, (f.comboT - 1.2) / 0.2);
    ctx.save(); ctx.translate(f.x - f.dir * 70, 470); ctx.scale(pop, pop); ctx.rotate(-0.05 * f.dir);
    ctx.globalAlpha = Math.min(1, f.comboT * 3);
    texto(`COMBO ×${f.combo}`, 0, 0, 64, '#ffc23d', 16);
    ctx.restore();
  });
  lut.forEach(f => { if (f.estado === 'ko') texto('💫', f.x - f.dir * 250, CHAO - 200 + Math.sin(relogio * 6) * 10, 70, '#fff', 0); });
  ctx.restore();
  if (flashTela > 0) { ctx.fillStyle = `rgba(255,255,255,${flashTela * 1.4})`; ctx.fillRect(0, 0, 1080, 1920); }
  if (anuncio) {
    const k = anuncio.t;
    ctx.globalAlpha = Math.min(1, (1.8 - k) * 3);
    ctx.save(); ctx.translate(540, 540); const s = k < 0.25 ? 0.5 + k * 2 : 1; ctx.scale(s, s);
    texto(anuncio.txt, 0, -60, 130, '#ffc23d', 20);
    texto('LUTEM!', 0, 70, 96, '#eef1fa', 18);
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
    placar = [0, 0]; round = 0; particulas = []; numeros = [];
    lut.forEach(f => { f.fila.length = 0; });
    novoRound();
  },
  1: () => golpear(0, sortear(Object.keys(cfg.golpes)), 'teste', 1),
  2: () => golpear(1, sortear(Object.keys(cfg.golpes)), 'teste', 1)
});

atualizarHud();
requestAnimationFrame(quadro);
conectar(aoEvento);
