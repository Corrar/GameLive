import { conectar, carregarConfig, aplicarFundo, escalarPalco, ehPresente, avisos, html,
  guardar, lembrar, teclas, eventoFalso } from '../kit/kit.js';

const cfg = await carregarConfig();
const lados = cfg.lados;
const $ = (id) => document.getElementById(id);
const palco = document.querySelector('.palco');

aplicarFundo(cfg.fundo);
escalarPalco(palco);
palco.style.setProperty('--cor-a', lados[0].cor);
palco.style.setProperty('--cor-b', lados[1].cor);
$('titulo').textContent = cfg.titulo ?? '';

lados.forEach((lado, i) => {
  $('nome' + i).textContent = lado.nome;
  const f = $('foto' + i);
  if (lado.imagem) {
    const img = document.createElement('img');
    img.src = lado.imagem;
    img.alt = '';
    f.appendChild(img);
  } else {
    f.textContent = lado.nome.trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
  }
});

const salvo = lembrar('urna', null);
let votos = Array.isArray(salvo) && salvo.length === 2 && salvo.every(Number.isFinite) ? salvo : [0, 0];
const avisar = avisos($('avisos'));

function lider() {
  if (votos[0] === votos[1]) return -1;
  return votos[0] > votos[1] ? 0 : 1;
}

function desenhar() {
  const total = votos[0] + votos[1];
  const pctA = total ? (votos[0] / total) * 100 : 50;
  $('seg0').style.width = pctA + '%';
  $('seg1').style.width = (100 - pctA) + '%';
  $('pct0').textContent = Math.round(pctA) + '%';
  $('pct1').textContent = (100 - Math.round(pctA)) + '%';
  votos.forEach((v, i) => { $('total' + i).textContent = `${v.toLocaleString('pt-BR')} ${v === 1 ? 'voto' : 'votos'}`; });
}

function pulsar(i) {
  const s = $('seg' + i);
  s.classList.add('pulso');
  setTimeout(() => s.classList.remove('pulso'), 250);
}

function mostrarVirada(i) {
  document.querySelector('.virada')?.remove();
  const v = document.createElement('div');
  v.className = 'virada l' + i;
  const titulo = document.createElement('small');
  titulo.textContent = 'VIRADA!';
  v.append(titulo, `${lados[i].nome} na frente`);
  palco.appendChild(v);
  setTimeout(() => v.remove(), 2700);
}

function aoEvento(ev) {
  if (ev.tipo !== 'presente') return;
  lados.forEach((lado, i) => {
    const regra = lado.presentes.find(p => ehPresente(p.presente, ev));
    if (!regra) return;
    const n = ev.quantidade * (regra.votos ?? 1);
    const antes = lider();
    votos[i] += n;
    guardar('urna', votos);
    desenhar();
    pulsar(i);
    avisar(html`<span class="l${i}"><b>${ev.nome || ev.user}</b> mandou ${ev.quantidade}× ${ev.presenteNome} → <span class="mais">+${n} ${lado.nome}</span></span>`);
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
  r: () => { votos = [0, 0]; guardar('urna', votos); desenhar(); },
  1: () => aoEvento(presenteDoLado(0)),
  2: () => aoEvento(presenteDoLado(1)),
  t: () => { for (let k = 0; k < 5; k++) setTimeout(() => aoEvento(presenteDoLado(Math.round(Math.random()), 1 + Math.floor(Math.random() * 5))), k * 250); }
});

desenhar();
conectar(aoEvento);
