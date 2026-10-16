// Kit compartilhado dos jogos. Funções puras primeiro (testadas em node), depois as de navegador.

export function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Template tag: html`<b>${nick}</b>` escapa tudo o que é interpolado. avisos() só aceita
// HTML vindo daqui, então um nick malicioso da live nunca vira código na página.
export function html(partes, ...valores) {
  return { __html: partes.reduce((s, p, i) => s + escapar(valores[i - 1]) + p) };
}

// ref: número = ID do presente; texto = nome, sem diferenciar maiúsculas.
export function ehPresente(ref, ev) {
  if (typeof ref === 'number') return ref === ev.presenteId;
  return String(ref).toLowerCase() === String(ev.presenteNome ?? '').toLowerCase();
}

// mapa: { acao: [refs...] } -> nome da primeira ação cujo presente bate, ou null.
export function acaoDoPresente(mapa, ev) {
  for (const [acao, refs] of Object.entries(mapa ?? {})) {
    if (refs.some(r => ehPresente(r, ev))) return acao;
  }
  return null;
}

// palavras: { A: ['A', '1'], B: ['B', '2'] } -> 'A' | 'B' | null para o texto do comentário.
export function palavraDoTime(palavras, texto) {
  const t = String(texto ?? '').trim().toLowerCase();
  for (const [time, lista] of Object.entries(palavras ?? {})) {
    if (lista.some(p => p.toLowerCase() === t)) return time;
  }
  return null;
}

// Quem comenta a palavra entra no time; quem manda presente sem time vai para o menor.
export function criarTimes(palavras) {
  const de = new Map();
  const tamanho = { A: 0, B: 0 };
  function entrar(user, time) {
    const antes = de.get(user);
    if (antes === time) return time;
    if (antes) tamanho[antes]--;
    de.set(user, time);
    tamanho[time]++;
    return time;
  }
  return {
    pelaPalavra(ev) {
      const time = palavraDoTime(palavras, ev.texto);
      return time ? entrar(ev.user, time) : null;
    },
    doUsuario(user) {
      return de.get(user) ?? entrar(user, tamanho.A <= tamanho.B ? 'A' : 'B');
    },
    tamanho: () => ({ ...tamanho }),
    zerar() { de.clear(); tamanho.A = tamanho.B = 0; }
  };
}

const NICKS_FALSOS = ['teste.um', 'teste.dois', 'teste.tres', 'teste.quatro', 'teste.cinco'];

// Evento local para as teclas de teste dos jogos (mesmo formato da ponte).
export function eventoFalso(campos = {}) {
  const user = NICKS_FALSOS[Math.floor(Math.random() * NICKS_FALSOS.length)];
  const base = campos.tipo === 'comentario'
    ? { tipo: 'comentario', texto: 'A' }
    : { tipo: 'presente', presenteId: 0, presenteNome: 'Rose', quantidade: 1 };
  return { user, nome: user, foto: '', ...base, ...campos };
}

/* ---------- navegador ---------- */

export async function carregarConfig(url = './config.json') {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`config.json não encontrado (${r.status})`);
  return r.json();
}

export function aplicarFundo(fundo) {
  document.body.style.background = !fundo || fundo === 'transparente' ? 'transparent' : fundo;
}

export function guardar(chave, valor) {
  try { localStorage.setItem('gamelive:' + chave, JSON.stringify(valor)); } catch { /* sem storage: segue sem salvar */ }
}

export function lembrar(chave, padrao) {
  try {
    const v = localStorage.getItem('gamelive:' + chave);
    return v === null ? padrao : JSON.parse(v);
  } catch { return padrao; }
}

// Palco lógico 1080x1920 (9:16) escalado e centralizado na janela.
export function escalarPalco(el) {
  function ajustar() {
    const s = Math.min(innerWidth / 1080, innerHeight / 1920);
    el.style.transform = `translate(${(innerWidth - 1080 * s) / 2}px, ${(innerHeight - 1920 * s) / 2}px) scale(${s})`;
  }
  ajustar();
  addEventListener('resize', ajustar);
}

// Pilha de avisos: no máximo 4, cada um some em ~3 s. Aceita texto puro ou html`...`.
export function avisos(el, { max = 4, duracao = 3000 } = {}) {
  return function avisar(conteudo) {
    const a = document.createElement('div');
    a.className = 'aviso';
    if (conteudo?.__html !== undefined) a.innerHTML = conteudo.__html;
    else a.textContent = String(conteudo);
    el.appendChild(a);
    while (el.children.length > max) el.firstChild.remove();
    setTimeout(() => { a.classList.add('sai'); setTimeout(() => a.remove(), 400); }, duracao);
  };
}

export function teclas(mapa) {
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    mapa[e.key.toLowerCase()]?.(e);
  });
}

const fotos = new Map();
// Imagem de perfil já carregada (para canvas) ou null enquanto carrega / se falhar.
export function foto(url) {
  if (!url) return null;
  let f = fotos.get(url);
  if (!f) {
    f = { img: new Image(), ok: false };
    f.img.onload = () => { f.ok = true; };
    f.img.referrerPolicy = 'no-referrer';
    f.img.src = url;
    fotos.set(url, f);
  }
  return f.ok ? f.img : null;
}

// WebSocket com a ponte; reconecta sozinho e mostra o status num selo discreto.
export function conectar(aoEvento) {
  const selo = document.createElement('div');
  selo.className = 'selo-status';
  document.body.appendChild(selo);
  let timerDiscreto;
  // conectado: vira só um ponto depois de 3 s, para não cobrir o placar dos jogos
  const mostrar = (texto, ok) => {
    selo.textContent = texto;
    selo.classList.toggle('ok', ok);
    selo.classList.remove('discreto');
    clearTimeout(timerDiscreto);
    if (ok) timerDiscreto = setTimeout(() => selo.classList.add('discreto'), 3000);
  };

  function abrir() {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/`);
    ws.onmessage = (m) => {
      let ev;
      try { ev = JSON.parse(m.data); } catch { return; }
      if (ev.tipo === 'status') {
        if (ev.fonte === 'simulador') mostrar('● simulador', true);
        else mostrar(ev.conectado ? `● ao vivo ${ev.detalhe ?? ''}` : '○ aguardando live', ev.conectado);
        return;
      }
      try { aoEvento(ev); } catch (e) { console.error('erro ao tratar evento', ev, e); }
    };
    ws.onclose = () => { mostrar('○ sem ponte', false); setTimeout(abrir, 2000); };
  }
  mostrar('○ conectando', false);
  abrir();
}
