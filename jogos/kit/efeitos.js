// Camada de "jogo" do kit: combos, ranking de quem mais mandou, números que pulam,
// partículas, cronômetro e sons. Funções puras primeiro (testadas em node), depois as de navegador.

const EMOJIS = {
  'rose': '🌹', 'gg': '✨', 'doughnut': '🍩', 'finger heart': '🫰', 'sunglasses': '🕶️',
  'galaxy': '🌌', 'tiktok': '🎵', 'heart me': '💖', 'ice cream cone': '🍦', 'perfume': '🧴',
  'lion': '🦁', 'universe': '🪐', 'hand hearts': '🫶', 'love you': '🥰', 'corgi': '🐶',
  'money gun': '💸', 'confetti': '🎊', 'hat and mustache': '🎩', 'rosa': '🌹', 'heart': '❤️'
};

// Emoji para um presente; ref pode ser o nome do presente ou um item de config com { emoji }.
export function emojiDoPresente(nome, padrao = '🎁') {
  return EMOJIS[String(nome ?? '').trim().toLowerCase()] ?? padrao;
}

// Combo: presentes seguidos na mesma chave (lado, time, usuário) dentro da janela somam.
export function criarCombo({ janela = 4000 } = {}) {
  const estado = new Map();
  return {
    registrar(chave, n = 1, agora = Date.now()) {
      const c = estado.get(chave);
      const total = c && agora - c.ultimo <= janela ? c.total + n : n;
      estado.set(chave, { total, ultimo: agora });
      return total;
    },
    atual(chave, agora = Date.now()) {
      const c = estado.get(chave);
      return c && agora - c.ultimo <= janela ? c.total : 0;
    },
    zerar() { estado.clear(); }
  };
}

// Ranking de quem mais mandou (por usuário). top(k) em ordem decrescente de pontos.
export function criarRanking() {
  const pessoas = new Map();
  return {
    somar({ user, nome, foto }, n = 1, extra = {}) {
      const p = pessoas.get(user) ?? { user, nome: nome || user, foto: foto || '', pontos: 0 };
      p.pontos += n;
      if (nome) p.nome = nome;
      if (foto) p.foto = foto;
      Object.assign(p, extra);
      pessoas.set(user, p);
      return p;
    },
    top(k = 5) { return [...pessoas.values()].sort((a, b) => b.pontos - a.pontos).slice(0, k); },
    total: () => pessoas.size,
    zerar() { pessoas.clear(); }
  };
}

export function formatarTempo(segundos) {
  const s = Math.max(0, Math.ceil(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Cor estável para um nick (avatar sem foto).
export function corDoNick(nick) {
  let h = 0;
  for (const c of String(nick ?? '')) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return `hsl(${h % 360} 85% 62%)`;
}

export function iniciais(nome) {
  const partes = String(nome ?? '?').replace(/[._@-]+/g, ' ').trim().split(/\s+/);
  return (partes.length > 1 ? partes[0][0] + partes[1][0] : partes[0].slice(0, 2)).toUpperCase();
}

/* ---------- navegador ---------- */

// Avatar redondo com a foto da live ou as iniciais coloridas.
export function avatar({ user, nome, foto } = {}, classe = '') {
  const el = document.createElement('span');
  el.className = `avatar ${classe}`.trim();
  el.style.setProperty('--cor-avatar', corDoNick(user || nome));
  el.textContent = iniciais(nome || user);
  if (foto) {
    const img = new Image();
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => { el.textContent = ''; el.appendChild(img); };
    img.src = foto;
  }
  return el;
}

// Reinicia uma animação CSS da classe (ex.: 'pop') no elemento.
export function animar(el, classe = 'pop') {
  el.classList.remove(classe);
  void el.offsetWidth;
  el.classList.add(classe);
}

// Número que conta até o novo valor e dá um pulo.
export function contador(el, { formato = (n) => n.toLocaleString('pt-BR'), duracao = 450 } = {}) {
  let atual = 0, alvo = 0, raf = 0;
  el.textContent = formato(0);
  return function para(valor, pular = true) {
    const de = atual, inicio = performance.now();
    alvo = valor;
    cancelAnimationFrame(raf);
    const passo = (t) => {
      const k = Math.min(1, (t - inicio) / duracao);
      atual = Math.round(de + (alvo - de) * (1 - (1 - k) ** 3));
      el.textContent = formato(atual);
      if (k < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    if (pular && valor !== de) animar(el);
  };
}

const MAX_PARTICULAS = 160;
let vivas = 0;

// Explosão de partículas (ou emojis) a partir de um ponto do palco.
export function particulas(palco, { x, y, cores = ['#ffd23f', '#ff3d7f', '#3df2c2', '#fff'], qtd = 18, emoji = null, forca = 1 }) {
  for (let i = 0; i < qtd && vivas < MAX_PARTICULAS; i++) {
    const p = document.createElement('span');
    p.className = emoji ? 'particula emoji' : 'particula';
    if (emoji) p.textContent = emoji;
    const ang = Math.random() * Math.PI * 2;
    const dist = (120 + Math.random() * 260) * forca;
    p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(ang) * dist}px;--dy:${Math.sin(ang) * dist - 120 * forca}px;` +
      `--giro:${(Math.random() - .5) * 720}deg;--cor:${cores[i % cores.length]};--t:${700 + Math.random() * 500}ms;` +
      `--tam:${emoji ? 44 + Math.random() * 30 : 12 + Math.random() * 16}px`;
    vivas++;
    p.addEventListener('animationend', () => { p.remove(); vivas--; }, { once: true });
    palco.appendChild(p);
  }
}

// Texto que sobe e some (+3 VOTOS, -10, COMBO x5...).
export function flutuar(palco, { x, y, texto, cor = '#fff', tamanho = 72 }) {
  const f = document.createElement('div');
  f.className = 'flutua txt-jogo';
  f.textContent = texto;
  f.style.cssText = `left:${x}px;top:${y}px;color:${cor};font-size:${tamanho}px`;
  f.addEventListener('animationend', () => f.remove(), { once: true });
  palco.appendChild(f);
}

export function tremer(el, forte = false) {
  animar(el, forte ? 'treme-forte' : 'treme');
}

// Chuva de confete para fim de rodada.
export function confete(palco, { cores = ['#ffd23f', '#ff3d7f', '#3df2c2', '#7c5cff', '#fff'], qtd = 90 } = {}) {
  for (let i = 0; i < qtd; i++) {
    const c = document.createElement('span');
    c.className = 'confete';
    c.style.cssText = `left:${Math.random() * 1080}px;--cor:${cores[i % cores.length]};--atraso:${Math.random() * 900}ms;` +
      `--t:${2200 + Math.random() * 1600}ms;--giro:${(Math.random() - .5) * 1440}deg;--deriva:${(Math.random() - .5) * 300}px`;
    c.addEventListener('animationend', () => c.remove(), { once: true });
    palco.appendChild(c);
  }
}

// Cronômetro de rodada: chama aoTick(restante) a cada segundo e aoFim() ao zerar.
export function cronometro({ segundos, aoTick, aoFim }) {
  let fim = 0, timer = 0, parado = true, restante = segundos;
  const tick = () => {
    restante = Math.max(0, (fim - Date.now()) / 1000);
    aoTick?.(restante);
    if (restante <= 0) { parado = true; clearInterval(timer); aoFim?.(); }
  };
  return {
    iniciar(s = segundos) { clearInterval(timer); parado = false; fim = Date.now() + s * 1000; tick(); timer = setInterval(tick, 250); },
    somar(s) { if (!parado) { fim += s * 1000; tick(); } },
    parar() { parado = true; clearInterval(timer); },
    restante: () => restante,
    rodando: () => !parado
  };
}

// Lista "mais enviado" com avatar, nome e pontos. lista = ranking.top(k).
export function pintarRanking(el, lista, { unidade = '', destaque = null } = {}) {
  const medalhas = ['🥇', '🥈', '🥉'];
  el.replaceChildren(...lista.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'ranking-item' + (p.user === destaque ? ' novo' : '');
    if (p.cor) li.style.setProperty('--cor-time', p.cor);
    const pos = document.createElement('span');
    pos.className = 'ranking-pos';
    pos.textContent = medalhas[i] ?? `${i + 1}º`;
    const nome = document.createElement('span');
    nome.className = 'ranking-nome';
    nome.textContent = p.nome;
    const pts = document.createElement('span');
    pts.className = 'ranking-pts txt-jogo';
    pts.textContent = `${p.pontos.toLocaleString('pt-BR')}${unidade}`;
    li.append(pos, avatar(p, 'pequeno'), nome, pts);
    return li;
  }));
}

// Sons sintetizados (sem arquivos). Só tocam se o navegador permitir áudio
// (no OBS, marque "Controlar áudio via OBS" na fonte de navegador).
let ctx;
function audio() {
  try { ctx ??= new AudioContext(); } catch { return null; }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx.state === 'running' ? ctx : null;
}

// sustenta: volume constante até o fim (bipe eletrônico); senão decai como uma batida.
function nota(a, { freq, ate = freq, dur = .12, tipo = 'square', vol = .06, atraso = 0, sustenta = false }) {
  const t = a.currentTime + atraso;
  const o = a.createOscillator(), g = a.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(ate, t + dur);
  g.gain.setValueAtTime(vol, t);
  if (sustenta) {
    g.gain.setValueAtTime(vol, t + dur - .008);
    g.gain.linearRampToValueAtTime(0, t + dur);
  } else g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + .02);
}

const SONS = {
  ponto: (a) => nota(a, { freq: 880, ate: 1320, dur: .09 }),
  combo: (a, n = 1) => nota(a, { freq: 520 + Math.min(n, 20) * 40, ate: 1400 + Math.min(n, 20) * 40, dur: .14, tipo: 'triangle', vol: .08 }),
  impacto: (a) => { nota(a, { freq: 180, ate: 50, dur: .22, tipo: 'sawtooth', vol: .1 }); nota(a, { freq: 90, ate: 40, dur: .3, tipo: 'sine', vol: .15 }); },
  virada: (a) => [660, 880, 1100].forEach((f, i) => nota(a, { freq: f, dur: .12, tipo: 'triangle', vol: .08, atraso: i * .08 })),
  vitoria: (a) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => nota(a, { freq: f, dur: .18, tipo: 'triangle', vol: .09, atraso: i * .12 })),
  tecla: (a) => nota(a, { freq: 1200, ate: 900, dur: .05, tipo: 'square', vol: .04 }),
  // urna eletrônica: bipe curto a cada tecla e o trinado de confirmação do voto
  urnaTecla: (a) => nota(a, { freq: 1046, dur: .09, tipo: 'square', vol: .04, sustenta: true }),
  urnaConfirma: (a) => {
    for (let i = 0; i < 9; i++) nota(a, { freq: i % 2 ? 1318 : 1568, dur: .06, tipo: 'square', vol: .04, atraso: i * .06, sustenta: true });
    nota(a, { freq: 1568, dur: .34, tipo: 'square', vol: .04, atraso: .54, sustenta: true });
  },
  tique: (a) => nota(a, { freq: 1500, dur: .04, tipo: 'sine', vol: .05 })
};

let somLigado = true;
export function ligarSom(sim) { somLigado = sim !== false; }
export function tocar(nome, ...args) {
  if (!somLigado) return;
  const a = audio();
  if (a) SONS[nome]?.(a, ...args);
}
