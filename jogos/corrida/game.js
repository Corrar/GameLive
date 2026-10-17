import { conectar, carregarConfig, aplicarFundo, escalarPalco, acaoDoPresente, avisos, html,
  teclas, eventoFalso } from '../kit/kit.js';
import { emojiDoPresente, criarCombo, criarRanking, avatar, animar, flutuar, confete, pintarRanking,
  ligarSom, tocar } from '../kit/efeitos.js';
import { fontesProntas } from '../kit/cena3d.js';
import { criarPista3d, PER, grade } from './pista3d.js';

const cfg = await carregarConfig();
const VOLTAS = cfg.voltas ?? 3;
const MAX = cfg.maxCarros ?? 12;
const VEL = cfg.velocidade ?? 150; // unidades de pista por segundo (40 = 1 m)
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');

aplicarFundo(cfg.fundo);
// sobre a câmera da live: sem os véus escuros atrás do placar
palco.classList.toggle('transparente', cfg.fundo === 'transparente');
escalarPalco(palco);
ligarSom(cfg.som);
// a fonte de jogo precisa estar carregada antes de desenhar texto nas etiquetas e placas 3D
await fontesProntas();
const pista = criarPista3d(palco, cfg, { max: MAX });
const { c3d } = pista;

const avisar = avisos($('avisos'), { max: 3 });
const combo = criarCombo({ janela: 4000 });
const ranking = criarRanking();
const campeoes = criarRanking();
const CORES = ['#3df2c2', '#ff3d7f', '#ffc23d', '#5b8cff', '#b06bff', '#ff8a3d', '#41d7ff', '#ff5ad1', '#9dff5a', '#f4f6ff', '#ff5050', '#00c8a0'];
const TAU = Math.PI * 2;
const META = VOLTAS * PER;

/* ---------- presentes nos cantos da tela ---------- */
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

/* ---------- estado ---------- */
let carros = [];
let estado = 'esperando'; // esperando | largada | correndo | fim
let contagem = 0;
let fimFalta = 0; // segundos de pódio que faltam (tempo de jogo, não de relógio)
let corrida = 1;
let liderAntes = null;
let voltaAntes = 1;

const cortar = (nome, n = 12) => { const l = Array.from(nome); return l.length > n ? l.slice(0, n - 1).join('') + '…' : nome; };
const ordenados = () => [...carros].sort((a, b) => b.s - a.s);
const volta = (c) => Math.min(VOLTAS, Math.max(1, Math.floor(c.s / PER) + 1));
// distância andando para a frente de a até b, na volta (quem está uma volta atrás conta como "perto")
const frente = (a, b) => (((b - a) % PER) + PER) % PER;
const GAP = 108; // ~2,7 m de frente a frente (o carro tem 2,4 m): ninguém encosta em ninguém
// faixa livre no ponto s (ninguém na faixa entre s - atras e s + adiante)
function faixaLivre(faixa, s, eu, atras = GAP, adiante = GAP) {
  return !carros.some(k => k !== eu && k.faixa === faixa && (frente(s, k.s) < adiante || frente(k.s, s) < atras));
}
// lugar livre na pista a partir de s (anda para trás de 130 em 130 até achar), tentando as faixas na ordem dada
function lugarLivre(s, faixas, eu, passo = -130) {
  for (let i = 0; i < 8; i++, s += passo) {
    const f = faixas.find(f => faixaLivre(f, s, eu));
    if (f !== undefined) return { s, faixa: f };
  }
  return { s, faixa: faixas[0] };
}
// primeira vaga da grade que ninguém ocupa (quem saiu deixa a vaga para o próximo)
function vagaNaGrade() {
  for (let i = 0; i < MAX; i++) if (!carros.some(k => k.faixa === i % 4 && Math.abs(k.s - grade(i)) < 20)) return i;
  return carros.length;
}
// ponto na tela acima do carro (para os textos que sobem)
const naTela = (c, altura = 2.4) => pista.tela(c, altura);

function entrar(ev) {
  const agora = performance.now();
  let c = carros.find(k => k.user === ev.user);
  if (c) { c.desde = agora; if (ev.foto) c.fotoUrl = ev.foto; return c; }
  if (carros.length >= MAX) {
    // sai o mais antigo (última atividade) que não está no pódio
    const fora = ordenados().slice(3).sort((a, b) => a.desde - b.desde)[0];
    pista.remover(fora);
    carros.splice(carros.indexOf(fora), 1);
  }
  const nome = String(ev.nome || ev.user);
  const uso = [0, 0, 0, 0];
  carros.forEach(k => uso[k.faixa]++);
  c = { user: ev.user, nome, fotoUrl: ev.foto, desde: agora,
    cor: CORES.find(cor => !carros.some(k => k.cor === cor)) ?? CORES[Math.floor(Math.random() * CORES.length)],
    base: VEL * (0.95 + Math.random() * 0.1), ruido: 0, alvo: 0, troca: 0, turbo: 0, nitro: 0, oleo: 0, giro: 0, giroFim: 0, pulso: 0,
    mudou: 0, faixa: 0, s: 0 };
  if (estado === 'correndo') {
    // entra atrás do último, numa faixa vazia (nunca em cima de outro carro)
    const ordem = [0, 1, 2, 3].sort((a, b) => uso[a] - uso[b]);
    Object.assign(c, lugarLivre(Math.min(...carros.map(k => k.s), 0) - 130, ordem, c));
  } else if (estado === 'fim') {
    c.s = Math.min(...carros.map(k => k.s), 0) - 130; // fica guardado até a próxima largada
  } else {
    const i = vagaNaGrade();
    Object.assign(c, { s: grade(i), faixa: i % 4 });
  }
  carros.push(c);
  // no pódio quem chega espera fora da pista: só aparece na próxima largada (não tampa a festa)
  pista.adicionar(c, { guardar: estado === 'fim' });
  c.pulso = 1;
  avisar(html`🏎️ <span><b>${cortar(nome, 14)}</b> entrou!</span>`);
  tocar('tecla');
  if (estado === 'esperando') largar();
  return c;
}

function largar() { estado = 'largada'; contagem = 3.4; ultimoNumero = null; voltaAntes = 1; liderAntes = null; }

function novaCorrida() {
  document.querySelector('.podio-cab')?.remove();
  fimFalta = 0;
  carros.forEach((c, i) => Object.assign(c, { s: grade(i), faixa: i % 4, turbo: 0, nitro: 0, oleo: 0, giro: 0, mudou: 0 }));
  pista.novaCorrida(carros);
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

function vencer() {
  estado = 'fim';
  const top3 = ordenados().slice(0, 3);
  const c = top3[0]; // o troféu vai para quem está no degrau mais alto do pódio
  // corrida acabou: apaga nitro/turbo/óleo para ninguém subir no pódio pegando fogo ou rodando
  carros.forEach(k => Object.assign(k, { turbo: 0, nitro: 0, oleo: 0, giro: 0 }));
  campeoes.somar({ user: c.user, nome: c.nome, foto: c.fotoUrl }, 1, { cor: c.cor });
  pintarRanking($('vitorias'), campeoes.top(4), { unidade: ' 🏆', destaque: c.user });
  pista.vitoria(top3);
  mostrarPodio(top3);
  confete(palco, { qtd: 60 });
  tocar('vitoria');
  corrida++;
  fimFalta = 7;
}

// o pódio é 3D (no gramado do meio); aqui só o letreiro de cima com o vencedor e os 3 primeiros
function mostrarPodio(top3) {
  const cab = document.createElement('div');
  cab.className = 'podio-cab';
  const sub = document.createElement('small');
  sub.className = 'txt-jogo';
  sub.textContent = `🏁 Corrida #${corrida}`;
  const titulo = document.createElement('div');
  titulo.className = 'txt-jogo brilho grande';
  titulo.textContent = 'CHEGADA!';
  const lista = document.createElement('ol');
  ['🥇', '🥈', '🥉'].forEach((medalha, i) => {
    const c = top3[i];
    if (!c) return;
    const li = document.createElement('li');
    li.style.setProperty('--cor', c.cor);
    li.style.setProperty('--atraso', `${.9 + i * .25}s`);
    const m = document.createElement('span'); m.className = 'medalha'; m.textContent = medalha;
    const nome = document.createElement('span'); nome.className = 'quem'; nome.textContent = c.nome;
    li.append(m, avatar({ user: c.user, nome: c.nome, foto: c.fotoUrl }), nome);
    lista.append(li);
  });
  cab.append(sub, titulo, lista);
  palco.appendChild(cab);
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
  palco.classList.toggle('no-podio', estado === 'fim');
  palco.classList.toggle('na-largada', estado === 'largada');
  pista.ordenar(lista);

  if (estado === 'correndo') {
    if (v > voltaAntes) {
      voltaAntes = v;
      animar(pil);
      tocar('virada');
      pista.agitar(v === VOLTAS ? 1 : .7);
      pista.foco(v === VOLTAS ? 1 : .5);
      banner(v === VOLTAS ? 'ÚLTIMA VOLTA!' : `VOLTA ${v}`, cortar(lider.nome, 14) + ' na frente', v === VOLTAS ? '#ff5a6e' : '#ffd23f');
    }
    if (lider && liderAntes && lider.user !== liderAntes && contagem < -2) {
      avisar(html`👑 <span><b>${cortar(lider.nome, 14)}</b> <span class="mais">assumiu a liderança!</span></span>`);
      tocar('virada');
      pista.agitar(.6);
      pista.foco(.7);
      const p = naTela(lider, 3.2);
      flutuar(palco, { x: p.x, y: p.y, texto: '👑 1º!', cor: '#ffd23f', tamanho: 64 });
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
  flutuar(palco, { x: p.x, y: p.y - 60, texto: `COMBO x${n}`, cor: '#ffd23f', tamanho: 54 });
  tocar('combo', n);
  if (MARCOS.some(m => n - ganho < m && n >= m)) {
    flutuar(palco, { x: 540, y: 420, texto: `🔥 COMBO x${n}!`, cor: '#ffd23f', tamanho: 110 });
    pista.agitar(1);
    c3d.tremer(.35, .5);
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
  const p = naTela(c);
  c.pulso = 1;
  if (cantos[acao]) animar(cantos[acao], 'usou');
  ranking.somar({ user: c.user, nome: c.nome, foto: c.fotoUrl }, q, { cor: c.cor });
  pintarRanking($('ranking'), ranking.top(4), { destaque: c.user });
  mostrarCombo(c, p, combo.registrar(c.user, q), q);
  // no pódio o presente conta no ranking, mas o carro só volta para a pista na próxima largada
  if (estado === 'fim') return;
  pista.agitar(.5);

  if (acao === 'acelerar') {
    c.turbo = Math.min(10, c.turbo + 1.2 * q);
    pista.turbo(c, q);
    flutuar(palco, { x: p.x, y: p.y, texto: `+VEL x${q}`, cor: '#ff7aa8', tamanho: 56 });
    avisar(html`${emojiDoPresente(ev.presenteNome, '🌹')} <span><b>${quem}</b> acelerou <span class="mais">×${q}</span></span>`);
    tocar('ponto');
  } else if (acao === 'nitro') {
    c.nitro = Math.min(14, c.nitro + 2.2 * q);
    pista.nitro(c);
    pista.foco(.45);
    flutuar(palco, { x: p.x, y: p.y, texto: '🔥 NITRO!', cor: '#ffb02e', tamanho: 76 });
    avisar(html`🔥 <span><b>${quem}</b> ligou o <span class="mais">NITRO ×${q}</span></span>`);
    tocar('impacto');
  } else if (acao === 'oleo') {
    const alvo = ordenados().find(k => k !== c);
    if (!alvo) return avisar(html`🍩 <span><b>${quem}</b> jogou óleo… mas está sozinho</span>`);
    alvo.oleo = Math.min(9, alvo.oleo + 2.4 * q);
    pista.oleo(alvo);
    const pa = naTela(alvo);
    flutuar(palco, { x: pa.x, y: pa.y, texto: 'DERRAPOU!', cor: '#ff5a6e', tamanho: 64 });
    avisar(html`🍩 <span><b>${quem}</b> jogou óleo em <span class="ruim">${cortar(alvo.nome, 12)}</span>!</span>`);
    tocar('impacto');
  } else if (acao === 'pular') {
    const lider = ordenados().find(k => k !== c);
    const de = { x: c.v3d.grupo.position.x, z: c.v3d.grupo.position.z };
    if (lider && lider.s >= c.s) {
      // aparece logo à frente do líder, numa faixa sem ninguém por perto
      const f0 = (lider.faixa + 2) % 4;
      Object.assign(c, lugarLivre(lider.s + 50, [f0, (f0 + 1) % 4, (f0 + 3) % 4, lider.faixa], c, 130));
    }
    c.turbo = Math.min(10, c.turbo + (q - 1));
    pista.teleporte(c, de);
    const np = pista.tela(c, .5);
    const flash = document.createElement('div');
    flash.className = 'flash';
    flash.style.cssText = `--x:${np.x}px;--y:${np.y}px`;
    flash.addEventListener('animationend', () => flash.remove(), { once: true });
    palco.appendChild(flash);
    flutuar(palco, { x: np.x, y: np.y - 110, texto: '🌌 TELEPORTE!', cor: '#c79bff', tamanho: 64 });
    avisar(html`🌌 <span><b>${quem}</b> <span class="roxo">teleportou pro 1º!</span></span>`);
    tocar('virada');
  }
}

/* ---------- loop (um só: o da cena 3D) ---------- */
let ultimoNumero = null;
function contar() {
  const el = $('largada');
  const n = estado === 'largada' ? Math.ceil(contagem) : estado === 'correndo' && contagem > -0.9 ? 0 : null;
  if (n === ultimoNumero) return;
  ultimoNumero = n;
  // semáforo do pórtico acompanha a contagem e apaga um tempo depois do "JÁ"
  pista.luzes(n === null ? (estado === 'correndo' ? 0 : null) : n > 3 ? null : n);
  if (n === null || n > 3) { el.textContent = ''; el.className = 'largada txt-jogo'; return; }
  el.textContent = n > 0 ? String(n) : 'JÁ!';
  el.className = `largada txt-jogo brilho${n === 0 ? ' ja' : ''}`;
  animar(el);
  if (n > 0) tocar('tique'); else { tocar('combo', 12); c3d.tremer(.2, .35); pista.agitar(1); }
  if (n === 0) setTimeout(() => el.classList.add('some'), 300);
}

function atualizar(dt) {
  if (estado === 'largada' || estado === 'correndo') contagem -= dt;
  if (estado === 'largada' && contagem <= 0) estado = 'correndo';
  for (const c of carros) c.pulso = Math.max(0, c.pulso - dt * 1.6);
  // pódio contado no tempo do jogo: num PC lento a festa não é cortada no meio
  if (estado === 'fim' && fimFalta > 0 && (fimFalta -= dt) <= 0) return novaCorrida();
  if (estado !== 'correndo') return;
  for (const c of carros) {
    if ((c.troca -= dt) <= 0) { c.alvo = (Math.random() * 2 - 1) * 0.12; c.troca = 1 + Math.random() * 1.5; }
    c.ruido += (c.alvo - c.ruido) * Math.min(1, dt * 1.5);
    let v = c.base * (1 + c.ruido);
    if (c.turbo > 0) { v *= 1.45; c.turbo -= dt; }
    if (c.nitro > 0) { v *= 2.3; c.nitro -= dt; }
    if (c.oleo > 0) {
      v *= 0.2; c.oleo -= dt; c.giro += dt * 14; c.giroFim = Math.ceil(c.giro / TAU) * TAU;
    } else if (c.giro) { c.giro += dt * 14; if (c.giro >= c.giroFim) c.giro = 0; }
    c.vel = v;
    c.mudou -= dt;
  }
  // trânsito, de quem vai na frente para trás: quem alcança o da frente troca de faixa para ultrapassar;
  // sem faixa livre, segura atrás dele (carro não atravessa carro)
  for (const c of ordenados()) {
    let passo = c.vel * dt, perto = null, d = Infinity;
    for (const k of carros) {
      if (k === c || k.faixa !== c.faixa) continue;
      const dk = frente(c.s, k.s);
      if (dk < d) { d = dk; perto = k; }
    }
    if (perto && d - passo < GAP * 1.35) {
      if (c.mudou <= 0 && !(c.oleo > 0)) {
        const lados = [c.faixa - 1, c.faixa + 1].filter(f => f >= 0 && f < 4);
        if (Math.random() < .5) lados.reverse();
        const f = lados.find(f => faixaLivre(f, c.s, c, GAP * .95, GAP * 1.3));
        if (f !== undefined) { c.faixa = f; c.mudou = .9; perto = null; }
      }
      if (perto) passo = Math.max(0, Math.min(passo, d - GAP));
    }
    c.s += passo;
  }
  if (carros.some(c => c.s >= META)) vencer();
}

let acum = 0;
c3d.aoQuadro((dt, t) => {
  atualizar(dt);
  // reta final: a câmera vai chegando perto do líder na segunda metade da última volta
  const lider = estado === 'correndo' ? ordenados()[0] : null;
  const final = lider ? Math.max(0, Math.min(1, (lider.s - (META - PER * .6)) / (PER * .6))) : 0;
  pista.quadro(dt, t, carros, estado, final);
  contar();
  $('chamada').style.display = estado === 'esperando' ? '' : 'none';
  if ((acum += dt) > 0.25) { acum = 0; mostrarPosicoes(); }
});

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
  // presentes avulsos para testar cada efeito: 1 acelera, 2 nitro, 3 óleo, 4 teleporte
  ...Object.fromEntries(['acelerar', 'nitro', 'oleo', 'pular'].map((a, i) => [String(i + 1), () => {
    const ev = presenteFalso(a, sortear(carros.length ? carros.map(c => c.user) : NICKS_TESTE));
    if (ev) aoEvento(ev);
  }])),
  r: () => {
    carros.forEach(c => pista.remover(c));
    carros = []; campeoes.zerar(); ranking.zerar(); combo.zerar(); pista.limpar(); corrida = 1;
    novaCorrida(); vazioRanking('ranking', 'Mande 🌹 e apareça aqui!'); vazioRanking('vitorias', 'Quem leva a 1ª?');
  }
});

vazioRanking('ranking', 'Mande 🌹 e apareça aqui!');
vazioRanking('vitorias', 'Quem leva a 1ª?');
conectar(aoEvento);
