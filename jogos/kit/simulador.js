// Fonte de eventos falsa no mesmo formato da ponte, para testar e gravar demos sem live.
// Sem dependências de Node: a ponte (--simular) e o modo demonstração dos jogos usam este arquivo.
const NICKS = ['luna.gg', 'beto_rx', 'cami.zz', 'davi.mp4', 'eli_jogos', 'fefe.art', 'gui.k', 'hana__',
  'igor.tt', 'juju.lima', 'kauã.br', 'lari.vlog', 'mateus77', 'nina.fps', 'otto.zip', 'pri.mel'];
const TEXTOS = ['A', 'B', 'A', 'B', 'entrar', 'vai!!', 'kkkk', 'bora', 'G'];
// shortcut: IDs além da Rose (5655) são inventados; os jogos mapeiam por nome no config.
const PRESENTES = [
  { id: 5655, nome: 'Rose', peso: 35, max: 5 },
  { id: 6064, nome: 'GG', peso: 35, max: 5 },
  { id: 900001, nome: 'Doughnut', peso: 8, max: 1 },
  { id: 900002, nome: 'Finger Heart', peso: 8, max: 1 },
  { id: 900003, nome: 'Sunglasses', peso: 8, max: 1 },
  { id: 900004, nome: 'Galaxy', peso: 6, max: 1 }
];
const TOTAL_PESO = PRESENTES.reduce((s, p) => s + p.peso, 0);

const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];

function sortearPresente() {
  let r = Math.random() * TOTAL_PESO;
  return PRESENTES.find(p => (r -= p.peso) < 0) ?? PRESENTES[0];
}

function evento() {
  const user = sortear(NICKS);
  const base = { user, nome: user, foto: '' };
  if (Math.random() < 0.65) return { tipo: 'comentario', ...base, texto: sortear(TEXTOS) };
  const p = sortearPresente();
  return { tipo: 'presente', ...base, presenteId: p.id, presenteNome: p.nome,
    quantidade: 1 + Math.floor(Math.random() * p.max) };
}

export function iniciarSimulador(emitir) {
  emitir({ tipo: 'status', conectado: true, fonte: 'simulador', detalhe: 'eventos falsos' });
  let timer;
  (function proximo() {
    timer = setTimeout(() => { emitir(evento()); proximo(); }, 350 + Math.random() * 550);
  })();
  return () => clearTimeout(timer);
}
