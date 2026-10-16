// Verificação visual de um jogo, com a ponte já no ar (npm run simular):
//   node scripts/captura.mjs <jogo> <saida.png> [--porta 3000] [--esperar 6000] [--teclas t,t,1]
// Abre o Chrome headless, espera em tempo real, aperta as teclas pedidas, salva a captura e
// imprime erros de JavaScript da página. Sai com código 1 se houver erro.
import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const [jogo, saida, ...resto] = process.argv.slice(2);
if (!jogo || !saida) {
  console.log('uso: node scripts/captura.mjs <jogo> <saida.png> [--porta 3000] [--esperar 6000] [--teclas t,t,1]');
  process.exit(2);
}
const opc = { porta: 3000, esperar: 6000, teclas: '' };
for (let i = 0; i < resto.length; i += 2) opc[resto[i].replace(/^--/, '')] = resto[i + 1];

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORTA_CDP = 9300 + Math.floor(Math.random() * 500);
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

const perfil = await mkdtemp(path.join(tmpdir(), 'captura-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORTA_CDP}`,
  `--user-data-dir=${perfil}`, '--window-size=540,960', 'about:blank'], { stdio: 'ignore' });

let alvo;
for (let i = 0; i < 50 && !alvo; i++) {
  await dormir(200);
  try { alvo = (await (await fetch(`http://127.0.0.1:${PORTA_CDP}/json`)).json()).find(t => t.type === 'page'); } catch {}
}
if (!alvo) { chrome.kill(); console.error('Chrome não abriu a porta de depuração'); process.exit(1); }

const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise(r => ws.once('open', r));
let id = 0;
const pendentes = new Map();
const erros = [];
ws.on('message', (m) => {
  const msg = JSON.parse(m);
  if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg.result); pendentes.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') erros.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') erros.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') erros.push(`${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
});
const cdp = (method, params = {}) => new Promise(r => { pendentes.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });

await cdp('Runtime.enable');
await cdp('Log.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 540, height: 960, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: `http://localhost:${opc.porta}/jogos/${jogo}/` });
await dormir(1500);
for (const t of String(opc.teclas).split(',').filter(Boolean)) {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: t, text: t });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: t });
  await dormir(150);
}
await dormir(Number(opc.esperar));
const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
await writeFile(saida, Buffer.from(data, 'base64'));
ws.close();
chrome.kill();
await dormir(300);
await rm(perfil, { recursive: true, force: true }).catch(() => {});

console.log(`captura salva em ${saida}`);
if (erros.length) { console.log('ERROS NA PÁGINA:\n' + erros.join('\n')); process.exit(1); }
console.log('sem erros na página');
