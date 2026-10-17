import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, criarTimes, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, avatar, animar, particulas, flutuar, tremer,
  pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';
import { fontesProntas } from '../kit/cena3d.js';
import { criarArena3d } from './arena3d.js';

const cfg = await carregarConfig();
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
// "arena" monta o estádio 3D; "transparente" (sobrepor na câmera) ou outra cor ficam só com o jogo
const ARENA_FUNDO = (cfg.fundo ?? 'arena') === 'arena';
aplicarFundo(ARENA_FUNDO ? '#140a35' : cfg.fundo);
if (!ARENA_FUNDO) palco.classList.add('transparente');
escalarPalco(palco);
ligarSom(cfg.som);
await fontesProntas();
const arena = criarArena3d(palco, cfg);

const TIMES = cfg.times;
const LIMITE = cfg.limite ?? 100;
const FORCA = cfg.forca ?? {};
const DOBRO_MS = (cfg.dobroSegundos ?? 10) * 1000;
const DOBRO_MAX_MS = (cfg.dobroMaximoSegundos ?? 60) * 1000;
const VENCEDOR_MS = 5000;
const MAX_TEXTOS = 14;
const MARCOS = [10, 25, 50, 100, 250, 500, 1000];
const EMOJI_ACAO = { puxinho: '🌹', puxao: '✨', dobro: '🍩', superpuxao: '🌌' };
// alturas (no mundo 3D, acima do time) dos textos flutuantes, uma faixa para cada tipo: todas entre a cabeça
// dos bonecos e o placar (≈ 650–850 px), para nenhum texto nascer em cima dos números
const ALTURA = { comentario: 2.5, ganho: 2.95, dobro: 3.4, combo: 3.85 };

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
let fim = null, faixa = null, vencedorAtual = -1, clarao = 0, lider = 0;
const avisar = avisos($('avisos'), { max: 3 });
const combo = criarCombo({ janela: 3500 });
const ranking = criarRanking();
const contadores = [contadorForca($('forca0')), contadorForca($('forca1'))];
const timerCombo = [0, 0];
const idx = (t) => t === 'A' ? 0 : 1;

// Número de força que conta até o valor novo, andando no laço da cena 3D. (O contador do kit mede pelo
// horário do quadro, que num PC lento fica antes do início da animação e faz o número passar do ponto.)
function contadorForca(el) {
  let atual = 0, de = 0, alvo = 0, inicio = 0;
  el.textContent = '0';
  return {
    para(valor, pular = true) {
      de = atual; alvo = valor; inicio = performance.now();
      if (pular && valor !== de) animar(el);
    },
    passo(agora) {
      if (atual === alvo) return;
      const k = Math.min(1, Math.max(0, (agora - inicio) / 450));
      atual = Math.round(de + (alvo - de) * (1 - (1 - k) ** 3));
      el.textContent = atual.toLocaleString('pt-BR');
    }
  };
}

function hud(pular = true) {
  const n = times.tamanho();
  [n.A, n.B].forEach((g, i) => { $('gente' + i).textContent = `👥 ${g} ${g === 1 ? 'pessoa' : 'pessoas'}`; });
  const f0 = Math.max(0, Math.min(1, (LIMITE - pos) / (2 * LIMITE)));
  const pct = (f) => (f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  $('pct0').textContent = pct(f0);
  $('pct1').textContent = pct(1 - f0);
  contadores[0].para(forca[0], pular);
  contadores[1].para(forca[1], pular);
  $('trofeu0').textContent = placar[0];
  $('trofeu1').textContent = placar[1];
  $('rodada').textContent = `RODADA ${placar[0] + placar[1] + 1}`;
  for (let i = 0; i < 2; i++) $('falta' + i).textContent = `faltam ${Math.max(0, Math.ceil(LIMITE + (i ? -pos : pos)))}`;
}

// texto que sobe acima do time (presa à posição 3D dele) e nunca em cima do placar
function sobreTime(i, altura, texto, cor, tamanho) {
  const p = arena.acima(i, altura);
  flutuar(palco, { x: p.x, y: p.y, texto, cor, tamanho });
}

// "+1 nick" de quem comentou, subindo de cima do time (no máximo MAX_TEXTOS na tela)
function textoPuxada(i, txt) {
  const camada = $('textos');
  if (camada.childElementCount >= MAX_TEXTOS) camada.firstElementChild.remove();
  const p = arena.acima(i, ALTURA.comentario);
  const el = document.createElement('div');
  el.className = 'puxada txt-jogo';
  el.textContent = txt;
  el.style.cssText = `left:${p.x + (Math.random() - .5) * 240}px;top:${p.y - Math.random() * 30}px;color:${TIMES[i].cor}`;
  el.addEventListener('animationend', () => el.remove(), { once: true });
  camada.append(el);
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
    const p = arena.acima(i, ALTURA.combo);
    particulas(palco, { x: p.x, y: p.y, qtd: 30, forca: 1.4, cores: [TIMES[i].cor, '#ffd23f', '#fff'] });
    sobreTime(i, ALTURA.combo, `COMBO x${n}!`, '#ffd23f', 92);
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
  arena.puxou(i, f);
  if (f >= 30) clarao = .5;
  // virada: o outro time estava na frente e agora este passou
  const agoraLider = pos < -8 ? 0 : pos > 8 ? 1 : lider;
  if (agoraLider !== lider) {
    lider = agoraLider;
    flutuar(palco, { x: 540, y: 900, texto: `VIRADA! ${TIMES[lider].nome}`, cor: TIMES[lider].cor, tamanho: 84 });
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
  arena.vitoria(i);
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
  arena.reiniciar();
  hud(false);
}

function aoEvento(ev) {
  const quem = ev.nome || ev.user;
  if (ev.tipo === 'comentario') {
    const t = times.pelaPalavra(ev);
    if (!t) return;
    const i = idx(t);
    const f = puxar(i, FORCA.comentario ?? 1);
    textoPuxada(i, `+${f} ${String(quem).slice(0, 14)}`);
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
  const sobre = arena.acima(i, ALTURA.ganho);
  mostrarUltimo(ev, i);
  mostrarCombo(i, combo.registrar(i, q), q, true);
  particulas(palco, { x: sobre.x, y: sobre.y, qtd: Math.min(q + 2, 8), emoji, forca: .8 });

  if (acao === 'dobro') {
    dobroAte[i] = Math.min(Math.max(dobroAte[i], performance.now()) + DOBRO_MS * q, performance.now() + DOBRO_MAX_MS);
    arena.dobro(i);
    sobreTime(i, ALTURA.dobro, 'FORÇA x2!', '#ffd23f', 88);
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
    clarao = .7;
    arena.superpuxao(i);
    tremer(palco, true);
    const meio = arena.fita();
    flutuar(palco, { x: 540, y: meio.y - 50, texto: 'SUPERPUXÃO!', cor: TIMES[i].cor, tamanho: 116 });
    sobreTime(i, ALTURA.ganho, `+${f}`, TIMES[i].cor, 120);
    particulas(palco, { x: meio.x, y: meio.y, qtd: 12, emoji, forca: 1.6 });
    tocar('impacto');
  } else {
    sobreTime(i, ALTURA.ganho, `+${f}`, TIMES[i].cor, f >= 10 ? 110 : 90);
    if (f >= 10) tremer(palco);
    tocar(f >= 30 ? 'impacto' : 'ponto');
  }
  avisar(html`<span class="t${i}"><b>${quem}</b> ${q}× ${ev.presenteNome} <span class="mais">+${f}</span></span>`);
  hud();
}

/* ---------- laço único (cena 3D) ---------- */

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

// placas "faltam N" presas às linhas de vitória do gramado
const placasFalta = [$('falta0'), $('falta1')];
function posicionarPlacas() {
  placasFalta.forEach((el, i) => {
    const p = arena.linha(i);
    // não desce até a dica de comentário, mesmo quando a câmera chega perto
    el.style.transform = `translate(${p.x.toFixed(1)}px, ${Math.min(1250, p.y).toFixed(1)}px) translate(-50%, -50%)`;
  });
}

const flash = $('clarao');
let antes = performance.now();
arena.c3d.aoQuadro((dt, t) => {
  const agora = performance.now();
  // o clarão segue o relógio de verdade: some rápido mesmo quando o PC renderiza devagar
  const real = Math.min(.5, (agora - antes) / 1000);
  antes = agora;
  vis += (pos - vis) * (1 - Math.exp(-dt * 7));
  tensao = tensao.map(v => Math.max(0, v - dt * 1.4));
  torcida = torcida.map(v => Math.max(0, v - dt * .8));
  clarao = Math.max(0, clarao - real * 1.6);
  flash.style.opacity = (clarao * .45).toFixed(3);
  arena.quadro(dt, t, { m: vis / LIMITE, tensao, torcida, vencedor: vencedorAtual,
    dobro: [dobroAte[0] > agora, dobroAte[1] > agora] });
  posicionarPlacas();
  pintarDobro(agora);
  contadores[0].passo(agora);
  contadores[1].passo(agora);
});

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

// 3/4: força x2 para o time A/B (Doughnut por padrão)
function dobroDoTime(i) {
  const ref = cfg.acoes?.dobro?.[0] ?? 'Doughnut';
  const ev = eventoFalso(typeof ref === 'number' ? { presenteId: ref, presenteNome: 'presente' } : { presenteNome: String(ref) });
  times.pelaPalavra({ user: ev.user, texto: cfg.palavras[i ? 'B' : 'A'][0] });
  aoEvento(ev);
}

teclas({
  t: rajada,
  1: () => superDoTime(0),
  2: () => superDoTime(1),
  3: () => dobroDoTime(0),
  4: () => dobroDoTime(1),
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
conectar(aoEvento);
