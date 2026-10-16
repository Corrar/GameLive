import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { iniciarSimulador } from './simulador.js';
import { iniciarTiktok } from './tiktok.js';

const RAIZ_JOGOS = fileURLToPath(new URL('../jogos/', import.meta.url));
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg'
};

function lerArgumentos(argv) {
  const a = { porta: 3000, simular: false, usuario: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--simular') a.simular = true;
    else if (argv[i] === '--porta') a.porta = Number(argv[++i]);
    else if (!argv[i].startsWith('--')) a.usuario = argv[i].replace(/^@/, '');
  }
  return a;
}

const args = lerArgumentos(process.argv.slice(2));
if ((!args.simular && !args.usuario) || !Number.isInteger(args.porta)) {
  console.log('Uso:\n  node ponte/server.js @usuario      conecta na live do TikTok\n' +
    '  node ponte/server.js --simular     eventos falsos para teste\n' +
    'Opções: --porta N (padrão 3000)');
  process.exit(1);
}

async function servirArquivo(req, res) {
  const url = new URL(req.url, 'http://local');
  if (url.pathname === '/') { res.writeHead(302, { Location: '/jogos/' }); return res.end(); }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (!url.pathname.startsWith('/jogos/')) { res.writeHead(404); return res.end('não existe'); }

  let rel = decodeURIComponent(url.pathname.slice('/jogos/'.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const arquivo = path.resolve(RAIZ_JOGOS, rel);
  // impede ../ de sair da pasta jogos/
  if (!arquivo.startsWith(RAIZ_JOGOS)) { res.writeHead(404); return res.end('não existe'); }

  try {
    const corpo = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store' });
    res.end(corpo);
  } catch {
    res.writeHead(404); res.end('não existe');
  }
}

const servidor = http.createServer((req, res) => {
  servirArquivo(req, res).catch(e => { console.error(e); res.writeHead(500); res.end(); });
});
const wss = new WebSocketServer({ server: servidor });
let ultimoStatus = { tipo: 'status', conectado: false, fonte: args.simular ? 'simulador' : 'tiktok', detalhe: 'iniciando' };

function emitir(evento) {
  if (evento.tipo === 'status') ultimoStatus = evento;
  const texto = JSON.stringify(evento);
  for (const cliente of wss.clients) if (cliente.readyState === 1) cliente.send(texto);
}

wss.on('connection', (ws) => ws.send(JSON.stringify(ultimoStatus)));

servidor.listen(args.porta, '127.0.0.1', () => {
  console.log(`Ponte no ar. Abra http://localhost:${args.porta}/jogos/`);
  const parar = args.simular ? iniciarSimulador(emitir) : iniciarTiktok(emitir, { usuario: args.usuario });
  const sair = async () => { await parar(); process.exit(0); };
  process.on('SIGINT', sair);
  process.on('SIGTERM', sair);
});
