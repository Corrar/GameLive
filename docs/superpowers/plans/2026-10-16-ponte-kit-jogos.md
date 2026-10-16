# Ponte, kit e jogos HTML5 — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ponte TikTok → WebSocket, kit compartilhado e 8 jogos HTML5 rodando em `http://localhost:3000/jogos/`.

**Architecture:** `ponte/server.js` (node:http + ws) serve `jogos/` e repassa eventos normalizados vindos de uma fonte (`tiktok.js` ou `simulador.js`). Cada jogo é uma página estática que importa `jogos/kit/kit.js` e reage aos eventos.

**Tech Stack:** Node.js ≥ 20 (ESM), `tiktok-live-connector@2.5.0`, `ws@8`, HTML5/canvas sem build, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-16-ponte-urna-design.md`, `docs/superpowers/specs/2026-10-16-jogos-catalogo-design.md`

## Global Constraints

- Node ≥ 20; `package.json` com `"type": "module"`; só duas dependências: `tiktok-live-connector`, `ws`.
- Servidor escuta só em `127.0.0.1`, porta padrão 3000 (`--porta N`).
- Eventos ponte → jogo: `presente {user,nome,foto,presenteId,presenteNome,quantidade}`, `comentario {user,nome,texto}`, `status {conectado,fonte,detalhe}`; `quantidade` é sempre acréscimo.
- Nada de nome, arte, texto ou código do ratgames; tema dos lados só em `config.json`.
- Texto da live passa por `escapar()` antes de ir para HTML.
- Palco lógico 1080×1920 (9:16).
- Textos de interface em pt-BR.

---

### Task 1: Projeto + regra de presentes em sequência

**Files:**
- Create: `package.json`, `.gitignore`, `ponte/sequencia.js`, `ponte/sequencia.test.js`

**Interfaces:**
- Produces: `criarContador() → (gift) => number` onde `gift = { userId, giftId, groupId?, giftType, repeatCount, repeatEnd }` e o retorno é o acréscimo (≤ 0 = ignorar).

- [ ] **Step 1: `package.json`** com `"type":"module"`, scripts `"start": "node ponte/server.js"`, `"simular": "node ponte/server.js --simular"`, `"test": "node --test \"ponte/**/*.test.js\" \"jogos/kit/**/*.test.js\""`; `npm i tiktok-live-connector@2.5.0 ws@8`. `.gitignore`: `node_modules/`, `presentes-vistos.json`.
- [ ] **Step 2: teste que falha** (`ponte/sequencia.test.js`):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarContador } from './sequencia.js';

const g = (o) => ({ userId: 'u1', giftId: 5655, giftType: 1, repeatEnd: false, ...o });

test('presente que não é sequência soma repeatCount', () => {
  assert.equal(criarContador()(g({ giftType: 2, repeatCount: 1 })), 1);
});
test('sequência 1→2→3→fim(3) soma 3 no total', () => {
  const c = criarContador();
  const total = [1, 2, 3].map(n => c(g({ repeatCount: n }))).reduce((a, b) => a + b)
    + c(g({ repeatCount: 3, repeatEnd: true }));
  assert.equal(total, 3);
});
test('fim de sequência sem eventos anteriores soma o total', () => {
  assert.equal(criarContador()(g({ repeatCount: 7, repeatEnd: true })), 7);
});
test('dois usuários com o mesmo presente não se misturam', () => {
  const c = criarContador();
  c(g({ repeatCount: 2 }));
  assert.equal(c(g({ userId: 'u2', repeatCount: 2 })), 2);
});
test('nova sequência após o fim recomeça do zero', () => {
  const c = criarContador();
  c(g({ repeatCount: 4 })); c(g({ repeatCount: 4, repeatEnd: true }));
  assert.equal(c(g({ repeatCount: 1 })), 1);
});
```

- [ ] **Step 3:** `node --test "ponte/**/*.test.js"` → FAIL (módulo não existe).
- [ ] **Step 4: implementação**:

```js
// Presentes giftType 1 chegam várias vezes com repeatCount crescente; devolve só o acréscimo.
export function criarContador() {
  const ultimo = new Map();
  return (gift) => {
    const n = gift.repeatCount || 1;
    if (gift.giftType !== 1) return n;
    const chave = `${gift.userId}:${gift.giftId}:${gift.groupId ?? ''}`;
    const delta = n - (ultimo.get(chave) || 0);
    if (gift.repeatEnd) ultimo.delete(chave); else ultimo.set(chave, n);
    return delta;
  };
}
```

- [ ] **Step 5:** `node --test "ponte/**/*.test.js"` → 5 PASS. Commit `feat: regra de presentes em sequência`.

### Task 2: Ponte (fontes + servidor)

**Files:**
- Create: `ponte/simulador.js`, `ponte/tiktok.js`, `ponte/server.js`

**Interfaces:**
- Consumes: `criarContador` (Task 1).
- Produces: fonte = `iniciar(emitir, opcoes) → parar()`; `emitir(evento)` com o formato dos Global Constraints. WebSocket em `ws://127.0.0.1:<porta>/` (mesmo host do HTTP).

- [ ] **Step 1: `simulador.js`** — `iniciarSimulador(emitir)`: emite `status {conectado:true, fonte:'simulador'}`; a cada 350–900 ms aleatórios, 65% `comentario` (texto sorteado de `['A','B','A','B','entrar','vai!!','kkkk','bora','G']`), 35% `presente` (sorteado de Rose 5655, GG 6064, Doughnut 5879, Finger Heart 5487, Sunglasses 5509, Galaxy 11046; Rose/GG 70% das vezes; quantidade 1–5 para Rose/GG, 1 para os demais) com usuário de uma lista de 16 nicks inventados. Retorna `parar()` que limpa o timer.
- [ ] **Step 2: `tiktok.js`** — `iniciarTiktok(emitir, { usuario })`: cria `TikTokLiveConnection(usuario, { enableExtendedGiftInfo: true, signApiKey: process.env.EULER_API_KEY })`; `WebcastEvent.CHAT` → `comentario {user: d.user.uniqueId, nome: d.user.nickname, texto: d.comment}`; `WebcastEvent.GIFT` → acréscimo via `criarContador()` com `{userId: d.user.userId, giftId: d.giftId, groupId: d.groupId, giftType: d.giftDetails?.giftType, repeatCount: d.repeatCount, repeatEnd: d.repeatEnd}`; se > 0 emite `presente` com `presenteNome = d.giftDetails?.giftName || d.extendedGiftInfo?.name`, `foto = d.user.profilePicture?.url?.[0]`. Registra cada presente em `presentes-vistos.json` (`{[id]: {nome, diamantes: d.giftDetails?.diamondCount, vistoEm}}`), gravando com debounce de 5 s. `connect()` falhou ou `ControlEvent.DISCONNECTED` → `status {conectado:false, detalhe}` e nova tentativa em 15 s; `ControlEvent.CONNECTED` → `status {conectado:true, fonte:'tiktok', detalhe:'@usuario'}`; `ControlEvent.ERROR` → `console.error`. `parar()` cancela timer e `disconnect()`.
  - Conferir nomes reais de campos em `node_modules/tiktok-live-connector/dist/index.d.ts` antes de escrever (`profilePicture`, `groupId`, `giftDetails`).
- [ ] **Step 3: `server.js`** — argumentos: `@usuario` | `--simular`, `--porta N`. `node:http` serve `jogos/` em `/jogos/*` (resolve o caminho e recusa qualquer coisa fora de `jogos/`; `/jogos/x/` → `index.html`; tipos: html, js, css, json, png, svg, webp); `/` → 302 `/jogos/`; resto 404. `WebSocketServer({ server })`: guarda o último `status` e envia ao conectar; `emitir` faz broadcast JSON. Sem argumentos → imprime uso e sai com código 1. Loga `Abra http://localhost:<porta>/jogos/`.
- [ ] **Step 4: verificar** `node ponte/server.js --simular` + `curl localhost:3000/jogos/../package.json` → 404; cliente `ws` de teste recebe eventos. Commit `feat: ponte com simulador e conector do TikTok`.

### Task 3: Kit compartilhado + índice

**Files:**
- Create: `jogos/kit/kit.js`, `jogos/kit/kit.css`, `jogos/kit/kit.test.js`, `jogos/index.html`

**Interfaces:**
- Produces (ES module): `conectar(aoEvento)`, `carregarConfig()`, `ehPresente(ref, ev)`, `acaoDoPresente(mapa, ev)`, `avisos(el) → avisar(html)`, `guardar(chave, valor)`, `lembrar(chave, padrao)`, `escalarPalco(el)`, `escapar(texto)`. CSS: `.palco` (1080×1920, `transform-origin: top left`), `.avisos`/`.aviso`, `.selo-status`.

- [ ] **Step 1: teste que falha** (`jogos/kit/kit.test.js`):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ehPresente, acaoDoPresente, escapar } from './kit.js';

const ev = { presenteId: 5655, presenteNome: 'Rose' };
test('ehPresente por id, por nome sem caixa, e não bate com outro', () => {
  assert.equal(ehPresente(5655, ev), true);
  assert.equal(ehPresente('rose', ev), true);
  assert.equal(ehPresente('GG', ev), false);
});
test('acaoDoPresente devolve a ação mapeada ou null', () => {
  assert.equal(acaoDoPresente({ nitro: ['GG'], entrar: ['Rose', 1] }, ev), 'entrar');
  assert.equal(acaoDoPresente({ nitro: ['GG'] }, ev), null);
});
test('escapar neutraliza HTML', () => {
  assert.equal(escapar('<b>"x"&</b>'), '&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
});
```

- [ ] **Step 2:** `node --test "jogos/kit/**/*.test.js"` → FAIL.
- [ ] **Step 3: `kit.js`** — funções puras acima sem tocar em `window` no topo do módulo; `conectar` usa `location.host`, reconecta em 2 s, cria `.selo-status` no `body` ("● simulador" / "● ao vivo @x" / "○ aguardando live" / "○ sem ponte"); `escalarPalco` aplica `scale(min(innerWidth/1080, innerHeight/1920))` e centraliza, refaz no `resize`; `avisos` mantém no máximo 4 filhos, cada um sai após 3 s.
- [ ] **Step 4: `kit.css`** — reset, `html,body{margin:0;height:100%;overflow:hidden;background:transparent}`, fonte `system-ui`, `.palco`, avisos (cartão escuro translúcido, entra deslizando), selo de status (canto superior direito, 22px, opacidade .6).
- [ ] **Step 5: `jogos/index.html`** — lista com link para cada jogo e nota "capture esta página no OBS / LIVE Studio".
- [ ] **Step 6:** `npm test` → PASS. Commit `feat: kit compartilhado dos jogos`.

### Task 4: Urna da Live

**Files:** Create `jogos/urna/index.html`, `jogos/urna/game.js`, `jogos/urna/config.json`

- [ ] Implementar conforme a seção "Jogo da Urna" da spec da Urna: barra no topo com dois segmentos (largura ∝ votos, 50/50 no zero, transição 400 ms), nome/imagem/porcentagem/total por lado, avisos "`nick` mandou `n`× `presente` → +`v` `lado`", virada animada quando a liderança troca, placar em `lembrar/guardar('urna')`, `R` zera, `1`/`2` voto de teste, `T` = 5 presentes falsos sorteados. `fundo: "transparente"` ou cor.
- [ ] Verificar com `--simular` + captura de tela. Commit `feat: jogo Urna da Live`.

### Tasks 5–11: um jogo por task

Cada task cria `jogos/<pasta>/index.html`, `game.js`, `config.json`, segue a linha da tabela "Jogos" e as "Regras de rodada" da spec do catálogo, usa só o kit, define `T` para disparar eventos falsos e as ações no `config.json` em forma de `{ "acoes": { "<acao>": [refs] } }` (Cabo/Torres/Briga também `"palavras": {"A": [...], "B": [...]}` e nomes/cores dos lados). Arte em canvas/CSS + emoji. Verificação: `--simular`, sem erros no console, captura de tela mostrando o jogo reagindo, e (quando houver) uma rodada fechando. Um commit por jogo.

| Task | Pasta | Jogo |
|---|---|---|
| 5 | `cabo` | Cabo de Guerra |
| 6 | `corrida` | Corrida do Chat |
| 7 | `torre` | Torre Alta |
| 8 | `torres-rivais` | Torres Rivais |
| 9 | `voo` | Voo da Live |
| 10 | `pipas` | Céu de Pipas |
| 11 | `briga` | Briga da Live |

### Task 12: README + verificação final

- [ ] `README.md`: instalar, `npm run simular`, `npm start -- @usuario`, `EULER_API_KEY`, como achar IDs em `presentes-vistos.json`, como capturar no OBS/LIVE Studio, aviso sobre biblioteca não oficial e tema político.
- [ ] `npm test` verde; abrir cada jogo com `--simular` e capturar tela. Commit e push.
