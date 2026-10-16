# Catálogo de jogos HTML5 — design

Data: 2026-10-16
Depende de: `2026-10-16-ponte-urna-design.md` (ponte, formato dos eventos, Urna)

## Objetivo

Versões **próprias** das mecânicas do catálogo "launcher" do ratgames.com.br: nomes,
textos, arte e código nossos. Mecânica de jogo não tem dono; nome, arte, vídeo e código
deles têm, e nada disso é copiado. A arte é desenhada em código (canvas/CSS) e emoji,
sem imagens de terceiros.

Fora deste design: os 6 jogos de Roblox do catálogo deles (Avatares, GlowUP, Steal a Drip,
Royale Blox, Filhotes, Abbey Road). Eles exigem Roblox Studio e uma ponte HTTP para dentro
do Roblox — é outro subprojeto.

## Jogos

| Nosso jogo | Mecânica de referência | Comentários | Presentes (padrão) |
|---|---|---|---|
| **Urna da Live** | — (pedido do usuário) | — | ver spec da Urna |
| **Cabo de Guerra** | Boys vs Girls | palavra do time (`A`/`B`, configurável) puxa 1 | Rose puxa 3 · GG puxa 10 · Doughnut dobra a força do time por 10 s · Galaxy puxa 60 |
| **Corrida do Chat** | Corrida na Live | qualquer comentário entra na pista | Rose acelera um pouco · GG nitro · Doughnut óleo no líder · Galaxy pula para o 1º |
| **Torre Alta** | Tower Sky | — | Rose +1 bloco · Finger Heart bloco gigante · GG bola de demolição (−5) · Galaxy martelo (metade) |
| **Torres Rivais** | Duelo de Torres | `A`/`B` escolhe o time de quem comenta | Rose +5 · GG +30 · Doughnut +100 · Galaxy +1000 blocos para o time de quem mandou |
| **Voo da Live** | Flappy Fly | — | Rose cano extra · Sunglasses visão turva · Doughnut obstáculo gigante · Galaxy caos (vãos menores) |
| **Céu de Pipas** | Pipa Arena | qualquer comentário põe a sua pipa no céu | Rose pipa maior · GG corta 1 rival · Doughnut corta 3 · Galaxy tempestade (corta metade) |
| **Briga da Live** | Tik Fighters | `A`/`B` escolhe o lutador de quem comenta | Rose soco (5) · GG chute (10) · Doughnut especial (25) · Galaxy finalização (60) |

Os nomes de presente acima são só o **padrão** de cada `config.json`; o streamer troca
por ID ou por outro nome. Times sem escolha (quem mandou presente sem ter comentado
`A`/`B`) vão para o time com menos gente.

### Regras de rodada

- **Cabo de Guerra / Torres Rivais / Briga da Live:** a rodada termina quando um lado
  chega ao limite (corda no fim / altura-meta / vida zero). Mostra o vencedor por 5 s,
  soma 1 no placar de rodadas e recomeça.
- **Corrida do Chat:** carros andam sozinhos com velocidade levemente aleatória; ganha
  quem cruzar a linha de chegada (3 voltas). Até 12 carros na pista; com mais gente,
  entram os mais recentes no lugar dos mais antigos sem posição de pódio.
- **Torre Alta:** sem fim; mostra a altura atual e o recorde da sessão.
- **Voo da Live:** o pássaro é controlado por IA e tenta desviar sozinho; meta de
  distância 1.000.000. Se bater, a distância volta a zero e o recorde fica.
- **Céu de Pipas:** sem fim; placar das 5 pessoas que mais cortaram. Pipa cortada cai
  e o dono pode voltar comentando de novo.

## Kit compartilhado (`jogos/kit/`)

Todo jogo é `jogos/<pasta>/index.html` + `game.js` (ES module) + `config.json`, e usa:

```js
import { conectar, carregarConfig, ehPresente, acaoDoPresente, avisos,
         guardar, lembrar, escalarPalco, escapar } from '../kit/kit.js';
```

- `conectar(aoEvento)` — WebSocket para o mesmo host, reconecta a cada 2 s; chama
  `aoEvento(ev)` para `presente`/`comentario`; mostra o status num selo discreto.
- `carregarConfig()` → `Promise<object>` do `./config.json`.
- `ehPresente(ref, ev)` → `true` se `ref` (número = ID, texto = nome sem diferenciar
  maiúsculas) bate com o presente do evento.
- `acaoDoPresente(mapa, ev)` → nome da ação (`mapa` = `{ acao: [refs...] }`) ou `null`.
- `avisos(elemento)` → `avisar(html)`: pilha de no máximo 4 avisos que somem em ~3 s.
- `guardar(chave, valor)` / `lembrar(chave, padrao)` — `localStorage` com try/catch.
- `escalarPalco(elemento)` — palco lógico 1080×1920 escalado para caber na janela.
- `escapar(texto)` — escapa HTML de nomes/comentários vindos da live.

`kit.css` traz o palco, fontes do sistema, o selo de status e os avisos.

Todo jogo aceita `T` (teste) para disparar eventos locais falsos — cada jogo define o que
o `T` simula — e o modo `--simular` da ponte gera comentários `A`, `B`, textos soltos e os
presentes Rose, GG, Doughnut, Finger Heart, Sunglasses e Galaxy.

## Segurança

Texto vindo da live (nome, comentário) sempre passa por `escapar()` antes de ir para o
HTML, ou é desenhado no canvas com `fillText`. Fotos de perfil só entram como `src` de
imagem.

## Testes

- Lógica pura do kit (`ehPresente`, `acaoDoPresente`) tem teste em `node:test`.
- Cada jogo é verificado com a ponte em `--simular`: abre sem erro no console, reage a
  comentários e presentes, fecha uma rodada (quando houver) — conferido por captura de
  tela no navegador headless.
