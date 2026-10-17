// Foto do lado no quadrado da tela da urna (e no placar): a imagem do config ("imagem" do lado,
// URL ou arquivo relativo à pasta do jogo, ex. "imagens/13.jpg") ou, sem ela, um retrato ilustrado
// genérico (busto de terno e gravata sobre a cor do lado). Nunca iniciais, nunca pessoa real.

// estilos do retrato genérico, um por lado (só para os dois não ficarem iguais)
const ESTILOS = [
  { pele: '#e2b08c', sombraPele: '#c58f6c', cabelo: '#2b211c', gravata: '#1f3f8f', terno: '#262b36', curto: true },
  { pele: '#c98f68', sombraPele: '#a8714f', cabelo: '#4a3022', gravata: '#8c1d2c', terno: '#2f3340', curto: false }
];

function misturar(hex, alvo, k) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(alvo.slice(1), 16);
  const c = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

// Desenha o retrato ilustrado no retângulo (x, y, w, h) do contexto.
export function desenharRetrato(ctx, x, y, w, h, { cor = '#5577ff', variante = 0 } = {}) {
  const e = ESTILOS[variante % ESTILOS.length];
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // fundo de estúdio na cor do lado (escurecida: a tela da urna tem brilho próprio)
  const f = ctx.createRadialGradient(x + w / 2, y + h * .36, h * .05, x + w / 2, y + h * .5, h * .8);
  f.addColorStop(0, misturar(cor, '#ffffff', .12));
  f.addColorStop(.55, misturar(cor, '#000000', .25));
  f.addColorStop(1, misturar(cor, '#000000', .55));
  ctx.fillStyle = f; ctx.fillRect(x, y, w, h);

  const cx = x + w / 2, s = Math.min(w / 262, h / 330);
  const P = (px, py) => [cx + px * s, y + py * s];
  // ombros e paletó
  ctx.fillStyle = e.terno;
  ctx.beginPath();
  ctx.moveTo(...P(-150, 340));
  ctx.bezierCurveTo(...P(-140, 262), ...P(-110, 238), ...P(-52, 226));
  ctx.lineTo(...P(52, 226));
  ctx.bezierCurveTo(...P(110, 238), ...P(140, 262), ...P(150, 340));
  ctx.closePath(); ctx.fill();
  // camisa (V entre as lapelas)
  ctx.fillStyle = '#f3f3ef';
  ctx.beginPath(); ctx.moveTo(...P(-40, 222)); ctx.lineTo(...P(40, 222)); ctx.lineTo(...P(0, 330)); ctx.closePath(); ctx.fill();
  // lapelas
  ctx.fillStyle = misturar(e.terno, '#000000', .25);
  for (const lado of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(...P(lado * 44, 226)); ctx.lineTo(...P(lado * 8, 330)); ctx.lineTo(...P(lado * 30, 330));
    ctx.lineTo(...P(lado * 62, 262)); ctx.lineTo(...P(lado * 50, 244)); ctx.closePath(); ctx.fill();
  }
  // gravata: nó e corpo
  ctx.fillStyle = e.gravata;
  ctx.beginPath(); ctx.moveTo(...P(-13, 228)); ctx.lineTo(...P(13, 228)); ctx.lineTo(...P(9, 248)); ctx.lineTo(...P(-9, 248)); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(...P(-9, 248)); ctx.lineTo(...P(9, 248)); ctx.lineTo(...P(17, 312)); ctx.lineTo(...P(0, 332)); ctx.lineTo(...P(-17, 312)); ctx.closePath(); ctx.fill();
  // pescoço com sombra do queixo
  ctx.fillStyle = e.sombraPele;
  ctx.beginPath(); ctx.moveTo(...P(-30, 170)); ctx.lineTo(...P(30, 170)); ctx.lineTo(...P(34, 228)); ctx.lineTo(...P(0, 244)); ctx.lineTo(...P(-34, 228)); ctx.closePath(); ctx.fill();
  // colarinho
  ctx.fillStyle = '#ffffff';
  for (const lado of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(...P(lado * 36, 214)); ctx.lineTo(...P(lado * 4, 236)); ctx.lineTo(...P(lado * 22, 252)); ctx.lineTo(...P(lado * 46, 228)); ctx.closePath(); ctx.fill();
  }
  // orelhas
  ctx.fillStyle = e.sombraPele;
  for (const lado of [-1, 1]) { ctx.beginPath(); ctx.ellipse(...P(lado * 56, 128), 11 * s, 19 * s, 0, 0, Math.PI * 2); ctx.fill(); }
  // rosto com luz no centro
  const g = ctx.createRadialGradient(...P(-10, 110), 8 * s, ...P(0, 125), 70 * s);
  g.addColorStop(0, misturar(e.pele, '#ffffff', .12)); g.addColorStop(1, e.pele);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(...P(0, 122), 54 * s, 70 * s, 0, 0, Math.PI * 2); ctx.fill();
  // cabelo
  ctx.fillStyle = e.cabelo;
  ctx.beginPath();
  if (e.curto) {
    ctx.moveTo(...P(-57, 114));
    ctx.bezierCurveTo(...P(-68, 16), ...P(68, 16), ...P(57, 114));
    ctx.bezierCurveTo(...P(52, 86), ...P(34, 72), ...P(0, 74));
    ctx.bezierCurveTo(...P(-34, 72), ...P(-52, 86), ...P(-57, 114));
  } else {
    ctx.moveTo(...P(-58, 128));
    ctx.bezierCurveTo(...P(-74, 12), ...P(70, 8), ...P(58, 124));
    ctx.bezierCurveTo(...P(52, 86), ...P(36, 76), ...P(-14, 74));
    ctx.bezierCurveTo(...P(-30, 84), ...P(-48, 96), ...P(-58, 128));
  }
  ctx.fill();
  // sobrancelhas, olhos, nariz e boca (traço simples)
  ctx.strokeStyle = e.cabelo; ctx.lineCap = 'round'; ctx.lineWidth = 5 * s;
  for (const lado of [-1, 1]) { ctx.beginPath(); ctx.moveTo(...P(lado * 12, 100)); ctx.quadraticCurveTo(...P(lado * 22, 94), ...P(lado * 34, 99)); ctx.stroke(); }
  ctx.fillStyle = '#2a1d18';
  for (const lado of [-1, 1]) { ctx.beginPath(); ctx.ellipse(...P(lado * 22, 115), 5 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = e.sombraPele; ctx.lineWidth = 3.5 * s;
  ctx.beginPath(); ctx.moveTo(...P(-2, 118)); ctx.quadraticCurveTo(...P(-8, 140), ...P(4, 144)); ctx.stroke();
  ctx.strokeStyle = '#9b4f45'; ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.moveTo(...P(-18, 162)); ctx.quadraticCurveTo(...P(0, 172), ...P(18, 162)); ctx.stroke();
  ctx.restore();
}

// Imagem cobrindo o retângulo sem distorcer: corta as laterais (rosto no centro) e, se precisar cortar
// em altura, corta mais embaixo que em cima (não perde o topo da cabeça).
export function desenharCobrindo(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const esc = Math.max(w / iw, h / ih);
  const sw = w / esc, sh = h / esc;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) * .2, sw, sh, x, y, w, h);
}

// Canvas com o retrato genérico (para virar <img> no placar).
export function retratoCanvas(cor, variante, w = 262, h = 330) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  desenharRetrato(c.getContext('2d'), 0, 0, w, h, { cor, variante });
  return c;
}

// Carrega a imagem do lado; aoCarregar() é chamado quando ela fica pronta. Sem imagem ou com erro: null/ok falso.
export function carregarImagem(src, aoCarregar) {
  if (!src) return null;
  const img = new Image();
  img.crossOrigin = 'anonymous';   // sem isso uma URL de fora "suja" o canvas e a textura da tela não sobe
  img.onload = () => { img.ok = img.naturalWidth > 0; aoCarregar?.(img); };
  img.onerror = () => { img.ok = false; };
  img.src = src;
  return img;
}
