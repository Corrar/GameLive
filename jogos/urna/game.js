import { conectar, carregarConfig, escalarPalco, ehPresente, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';
import { criarCombo, criarRanking, emojiDoPresente, formatarTempo, avatar, animar,
  particulas, flutuar, tremer, confete, cronometro, pintarRanking, ligarSom, tocar } from '../kit/efeitos.js';
import { fontesProntas } from '../kit/cena3d.js';
import { criarUrna3d, numeroDoLado } from './urna3d.js';
import { retratoCanvas } from './retrato.js';

const cfg = await carregarConfig();
const lados = cfg.lados;
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');
// centro de cada lado no palco, para efeitos (número grande e barra)
const CENTRO = [{ x: 285, y: 400 }, { x: 795, y: 400 }];

// "transparente": só a urna e a mão, para sobrepor na câmera; qualquer outro valor mostra a sala 3D
if (cfg.fundo === 'transparente') {
  palco.classList.add('transparente');
  document.body.style.background = 'transparent';
}
escalarPalco(palco);
await fontesProntas();
const urna = criarUrna3d(palco, cfg);
ligarSom(cfg.som);
palco.style.setProperty('--cor-a', lados[0].cor);
palco.style.setProperty('--cor-b', lados[1].cor);
$('titulo').textContent = cfg.titulo ?? '';

// presentes de cada lado: emoji + "+N VOTOS"
lados.forEach((lado, i) => {
  // nome com a foto do lado (a mesma da tela da urna: imagem do config ou retrato ilustrado)
  const foto = document.createElement('img');
  foto.className = 'retrato';
  foto.alt = '';
  const generico = () => { foto.onerror = null; foto.src = retratoCanvas(lado.cor, i, 160, 200).toDataURL(); };
  if (lado.imagem) { foto.onerror = generico; foto.src = lado.imagem; } else generico();
  const nome = document.createElement('span');
  nome.textContent = lado.nome;
  $('nome' + i).replaceChildren(foto, nome);
  for (const p of lado.presentes.slice(0, 2)) {
    const chip = document.createElement('div');
    chip.className = 'chip-presente';
    const nomePresente = typeof p.presente === 'number' ? (p.nome ?? (p.presente === 5655 ? 'Rose' : '')) : p.presente;
    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.textContent = p.emoji ?? emojiDoPresente(nomePresente);
    const efeito = document.createElement('span');
    efeito.className = 'efeito';
    const v = p.votos ?? 1;
    efeito.textContent = `+${v} ${v === 1 ? 'VOTO' : 'VOTOS'}`;
    chip.append(emoji, efeito);
    $('presentes' + i).appendChild(chip);
  }
});

const salvo = lembrar('urna', null);
let votos = Array.isArray(salvo?.votos) && salvo.votos.every(Number.isFinite) ? salvo.votos : [0, 0];
let trofeus = Array.isArray(salvo?.trofeus) ? salvo.trofeus : [0, 0];
let encerrada = false;
const salvar = () => guardar('urna', { votos, trofeus });

const avisar = avisos($('avisos'), { max: 3 });
const combo = criarCombo({ janela: 4000 });
const ranking = criarRanking();
const contadores = [contadorVotos($('votos0')), contadorVotos($('votos1'))];
const timerCombo = [0, 0];

// contador do placar: mede o tempo com performance.now() dentro do quadro (o timestamp do rAF pode vir
// antes do início com quadros lentos, e a curva extrapolava para votos negativos)
function contadorVotos(el, duracao = 450) {
  let atual = 0, raf = 0;
  el.textContent = '0';
  return function para(valor, pular = true) {
    const de = atual, inicio = performance.now();
    cancelAnimationFrame(raf);
    const passo = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - inicio) / duracao));
      atual = Math.round(de + (valor - de) * (1 - (1 - k) ** 3));
      el.textContent = Math.max(0, atual).toLocaleString('pt-BR');
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    if (pular && valor !== de) animar(el);
  };
}

function lider() {
  if (votos[0] === votos[1]) return -1;
  return votos[0] > votos[1] ? 0 : 1;
}

function desenhar(pular = true) {
  const total = votos[0] + votos[1];
  const fracA = total ? votos[0] / total : .5;
  $('seg0').style.transform = `scaleX(${fracA})`;
  $('faisca').style.transform = `translateX(${fracA * 948}px)`;
  const pct = (f) => (f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  $('pct0').textContent = pct(fracA);
  $('pct1').textContent = pct(1 - fracA);
  contadores[0](votos[0], pular);
  contadores[1](votos[1], pular);
  $('trofeu0').textContent = trofeus[0];
  $('trofeu1').textContent = trofeus[1];
}

const MARCOS = [10, 25, 50, 100, 250, 500, 1000];
function mostrarCombo(i, n, ganho) {
  const el = $('combo' + i);
  if (n < 2) return;
  el.textContent = `COMBO x${n}`;
  el.classList.add('on');
  animar(el);
  clearTimeout(timerCombo[i]);
  timerCombo[i] = setTimeout(() => el.classList.remove('on'), 4000);
  // passou de um marco (10, 25, 50...): explosão, tremida e o som de combo
  // (fora dos marcos, quem faz barulho é a urna: bipe em cada tecla e o trinado do CONFIRMA)
  if (MARCOS.some(m => n - ganho < m && n >= m)) {
    tocar('combo', n);
    particulas(palco, { ...CENTRO[i], qtd: 30, forca: 1.4, cores: [lados[i].cor, '#ffd23f', '#fff'] });
    tremer(palco, true);
  }
}

function mostrarUltimo(ev, i) {
  const u = $('ultimo');
  u.style.setProperty('--cor', lados[i].cor);
  const nome = document.createElement('span');
  nome.className = 'quem txt-jogo';
  nome.textContent = ev.nome || ev.user;
  const votou = document.createElement('span');
  votou.className = 'votou txt-jogo';
  votou.textContent = `votou ${numeroDoLado(lados[i], i)} · ${lados[i].nome}`;
  u.replaceChildren(avatar(ev), nome, votou);
  animar(u);
}

function mostrarVirada(i) {
  document.querySelector('.virada')?.remove();
  const v = document.createElement('div');
  v.className = 'virada txt-jogo l' + i;
  const titulo = document.createElement('small');
  titulo.textContent = 'VIRADA!';
  v.append(titulo, `${lados[i].nome} na frente`);
  palco.appendChild(v);
  tocar('virada');
  setTimeout(() => v.remove(), 2700);
}

/* ---------- rodada ---------- */
const rodada = cfg.rodada ?? {};
const relogio = $('relogio');
const crono = rodada.segundos > 0 ? cronometro({
  segundos: rodada.segundos,
  aoTick: (r) => {
    const txt = formatarTempo(r);
    if (txt !== relogio.textContent) {
      relogio.textContent = txt;
      if (r <= 10 && r > 0) tocar('tique');
    }
    relogio.classList.toggle('urgente', r <= 10);
  },
  aoFim: encerrarRodada
}) : null;

function encerrarRodada() {
  const venc = lider();
  encerrada = true;
  const faixa = document.createElement('div');
  faixa.className = 'vencedor';
  const t = document.createElement('small');
  if (venc === -1) {
    t.textContent = 'Fim da rodada';
    faixa.append(t, 'EMPATE!');
  } else {
    trofeus[venc]++;
    faixa.style.setProperty('--destaque', lados[venc].cor);
    t.textContent = 'Vencedor da rodada';
    faixa.append(t, lados[venc].nome);
    confete(palco, { cores: [lados[venc].cor, '#ffd23f', '#fff'] });
    urna.comemorar(lados[venc].cor);
  }
  palco.appendChild(faixa);
  tocar('vitoria');
  salvar();
  desenhar(false);
  setTimeout(() => {
    faixa.remove();
    votos = [0, 0];
    encerrada = false;
    combo.zerar();
    salvar();
    desenhar(false);
    crono.iniciar();
  }, (rodada.pausa ?? 8) * 1000);
}

/* ---------- eventos ---------- */
function aoEvento(ev) {
  if (ev.tipo !== 'presente' || encerrada) return;
  lados.forEach((lado, i) => {
    const regra = lado.presentes.find(p => ehPresente(p.presente, ev));
    if (!regra) return;
    const n = ev.quantidade * (regra.votos ?? 1);
    const antes = lider();
    votos[i] += n;
    salvar();
    desenhar();
    const barra = $('barra');
    barra.classList.add('pulso' + i);
    setTimeout(() => barra.classList.remove('pulso' + i), 250);

    flutuar(palco, { x: CENTRO[i].x, y: CENTRO[i].y - 150, texto: `+${n}`, cor: lado.cor, tamanho: 110 });
    particulas(palco, { x: CENTRO[i].x, y: 780, qtd: Math.min(8 + n * 2, 30), emoji: null, cores: [lado.cor, '#fff', '#ffd23f'] });
    particulas(palco, { x: i ? 900 : 180, y: 870, qtd: Math.min(n, 6), emoji: regra.emoji ?? emojiDoPresente(ev.presenteNome), forca: .8 });
    mostrarCombo(i, combo.registrar(i, n), n);

    ranking.somar(ev, n, { cor: lado.cor });
    pintarRanking($('ranking'), ranking.top(4), { destaque: ev.user });
    avisar(html`<span class="l${i}"><b>${ev.nome || ev.user}</b> ${ev.quantidade}× ${ev.presenteNome} <span class="mais">+${n}</span></span>`);

    // "quem votou" troca só quando a urna começa a digitar este voto: nome e número na tela batem
    urna.votar(i, () => mostrarUltimo(ev, i));

    const depois = lider();
    if (antes !== -1 && depois !== -1 && antes !== depois) mostrarVirada(depois);
  });
}

// evento falso usando o primeiro presente configurado do lado
function presenteDoLado(i, quantidade = 1) {
  const ref = lados[i].presentes[0]?.presente;
  return eventoFalso(typeof ref === 'number'
    ? { presenteId: ref, presenteNome: 'presente', quantidade }
    : { presenteNome: String(ref), quantidade });
}

teclas({
  r: () => { votos = [0, 0]; trofeus = [0, 0]; ranking.zerar(); combo.zerar(); pintarRanking($('ranking'), []); salvar(); desenhar(false); crono?.iniciar(); },
  1: () => aoEvento(presenteDoLado(0)),
  2: () => aoEvento(presenteDoLado(1)),
  f: () => crono && crono.rodando() && (crono.parar(), encerrarRodada()),
  t: () => { for (let k = 0; k < 5; k++) setTimeout(() => aoEvento(presenteDoLado(Math.round(Math.random()), 1 + Math.floor(Math.random() * 5))), k * 250); }
});

desenhar(false);
crono?.iniciar();
conectar(aoEvento);
