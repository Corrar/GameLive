# Ponte da live + jogo da Urna — design

Data: 2026-10-16
Status: aprovado no chat, aguardando revisão desta especificação

## Objetivo

Primeiro pedaço do produto de jogos interativos para lives de TikTok:

1. **Ponte** — conecta na live de um @ do TikTok, transforma comentários e presentes
   em eventos padronizados e entrega esses eventos aos jogos.
2. **Urna** — primeiro jogo: uma barra de votação no topo da tela dividida entre dois
   lados; cada presente mapeado para um lado empurra a barra para ele.

Sucesso = com a live no ar, um presente mapeado move a barra em até ~1 s, sem contar
presente em sequência duas vezes, e a ponte se recupera sozinha de queda da live.

Fora deste pedaço: launcher, liberação de acesso/licença, outros jogos, site.

## Decisões

- **Stack:** Node.js (≥ 20; máquina atual tem 24) + jogo em HTML5 puro, sem build.
- **Conector:** `tiktok-live-connector` 2.5.0 (ESM). Biblioteca não oficial: lê os mesmos
  dados que qualquer espectador vê, sem login. A conexão precisa de assinatura do serviço
  Euler Stream (limite gratuito; chave opcional `signApiKey` aumenta o limite).
- **Transporte ponte → jogo:** WebSocket (`ws`) no mesmo servidor HTTP que serve os jogos.
- **Captura na live:** o streamer abre `http://localhost:3000/jogos/urna/` e captura no
  OBS (fonte de navegador) ou no TikTok LIVE Studio (captura de janela).
- **Tema dos lados é configuração, não código.** Nomes, cores, imagens e presentes de cada
  lado ficam em `config.json`. Nenhum tema (político ou não) fica embutido no código.

## Estrutura

```
GameLive/
  package.json            dependências: tiktok-live-connector, ws
  ponte/
    server.js             entrada: lê argumentos, sobe HTTP + WebSocket, liga a fonte de eventos
    tiktok.js             conecta na live, reconecta, converte eventos da biblioteca para o formato nosso
    simulador.js          fonte de eventos falsa (mesmo formato), para testar sem live
    sequencia.js          regra de contagem de presentes em sequência (função pura)
    sequencia.test.js     teste da regra (node:test)
  jogos/
    urna/
      index.html
      game.js
      config.json
  presentes-vistos.json   gerado em tempo de execução (ignorado no git)
```

Cada fonte de eventos (`tiktok.js`, `simulador.js`) exporta a mesma forma:
uma função que recebe `emitir(evento)` e devolve `parar()`. O `server.js` não sabe de qual
fonte o evento veio.

## Uso

```
npm install
node ponte/server.js @usuario            conecta na live do @usuario
node ponte/server.js --simular           sem live: gera presentes falsos
```

Porta padrão 3000 (`--porta N` muda). O servidor só escuta em `127.0.0.1`.

## Formato dos eventos (ponte → jogo, JSON por WebSocket)

```
{ "tipo": "presente",   "user": "ana.livz", "nome": "Ana", "foto": "<url>",
  "presenteId": 5655, "presenteNome": "Rose", "quantidade": 3 }
{ "tipo": "comentario", "user": "ana.livz", "nome": "Ana", "texto": "vai A" }
{ "tipo": "status",     "conectado": true, "fonte": "tiktok" | "simulador", "detalhe": "..." }
```

`quantidade` é sempre o **acréscimo** desde o último evento daquele presente, nunca o
total da sequência.

## Regra de presentes em sequência (`sequencia.js`)

No TikTok, presentes com `giftType === 1` podem ser enviados em sequência: a biblioteca
dispara vários eventos com `repeatCount` crescente e, ao fim, mais um com
`repeatEnd: true` repetindo o total. Presentes de outros tipos chegam uma vez só.

Regra (estado: mapa `chave → último repeatCount`, chave = userId + giftId + groupId se existir):

- `giftType !== 1` → acréscimo = `repeatCount` (ou 1 se ausente).
- `giftType === 1` → acréscimo = `repeatCount − último` (último = 0 se não houver);
  guarda `repeatCount` como último; se `repeatEnd`, apaga a chave.
- Acréscimo ≤ 0 → nenhum evento é emitido.

Assim a barra anda ao vivo durante a sequência e o evento final (repetido) soma zero.
Se a ponte entrar no meio de uma sequência, o primeiro evento soma o `repeatCount`
inteiro — aceitável.

Casos de teste obrigatórios: presente único não-sequência; sequência 1→2→3→fim(3) soma 3;
fim de sequência sem eventos anteriores soma o total; dois usuários com o mesmo presente
em paralelo não se misturam; sequência nova do mesmo usuário após o fim recomeça do zero.

## Ponte (`tiktok.js`)

- Cria `TikTokLiveConnection(usuario, { enableExtendedGiftInfo: true, signApiKey })`.
  `signApiKey` vem da variável de ambiente `EULER_API_KEY` se existir.
- Converte `CHAT` → `comentario` e `GIFT` → `presente` (via `sequencia.js`).
  Nome do presente: `giftDetails.giftName`, com fallback `extendedGiftInfo.name`.
- Todo presente recebido é registrado em `presentes-vistos.json`
  (`{ id: { nome, diamantes, vistoEm } }`), gravado no máximo 1 vez a cada 5 s, para o
  streamer descobrir os IDs a usar na configuração.
- **Reconexão:** se `connect()` falhar (live offline etc.) ou houver `DISCONNECTED`, emite
  `status {conectado:false, detalhe}` e tenta de novo em 15 s. Nunca derruba o processo.
- Erros da biblioteca (`ERROR`) vão para o console; não param a ponte.

## Servidor (`server.js`)

- HTTP estático servindo a pasta `jogos/` em `/jogos/` (sem framework, `node:http` +
  `node:fs`), com proteção contra `..` no caminho.
- WebSocket no mesmo servidor; ao conectar um jogo, envia o último `status` conhecido.
- Encaminha cada evento da fonte para todos os jogos conectados.
- Aceita mensagens dos jogos do tipo `{ "tipo": "simular-presente", ... }` apenas para os
  atalhos de teste do jogo (teclas 1/2); são reenviadas como `presente` normais.

## Jogo da Urna (`jogos/urna/`)

### Configuração (`config.json`)

```json
{
  "titulo": "VOTAÇÃO DA LIVE",
  "fundo": "transparente",
  "lados": [
    { "nome": "Lado A", "cor": "#e53935", "imagem": "",
      "presentes": [ { "id": 5655, "votos": 1 } ] },
    { "nome": "Lado B", "cor": "#f5f5f5", "imagem": "",
      "presentes": [ { "id": 0, "votos": 1 } ] }
  ]
}
```

Presente pode ser identificado por `id` (preferido) ou `nome`. Votos de um evento =
`quantidade × votos`. Presentes não mapeados são ignorados. `5655` é o ID conhecido da
"Rose" (confirmar em `presentes-vistos.json`); `id: 0` significa "ainda não mapeado" e
deve ser trocado pelo ID real do segundo presente depois de vê-lo numa live.

### Tela (9:16, 1080×1920 lógico, escala para caber)

- Barra horizontal no topo: dois segmentos com a cor de cada lado, largura proporcional
  aos votos (50/50 com zero votos), porcentagem e total de cada lado, nome e imagem.
  A largura anima suavemente.
- Avisos empilhados abaixo da barra: "ana.livz mandou 3× Rose → +3 Lado A"
  (no máximo 4 visíveis, somem após ~3 s).
- Virada: quando a liderança troca, destaque animado com o nome de quem passou à frente.
- Indicador discreto de status: "aguardando live" / "conectado" / "simulador".

### Estado e teclas

- Placar salvo em `localStorage` (recarregar não zera); falha de storage não quebra o jogo.
- `R` zera o placar. `1` / `2` mandam um voto de teste para o lado A / B (via servidor).
- WebSocket com reconexão automática a cada 2 s.

## Erros e limites conhecidos

- A biblioteca é engenharia reversa: o TikTok pode mudar o protocolo sem aviso.
- Dependência do Euler Stream para assinar a conexão (limite gratuito por IP/chave).
- Não validamos se o @ existe antes de conectar; erro aparece no status.
- Avisos de risco ao usuário (fora do código): tema político em live com presentes pode
  violar regras do TikTok e, em período eleitoral, a vedação a enquetes do TSE
  (Res. 23.600/2019). A escolha dos lados é do streamer.

## Testes

- `node --test ponte/` cobre `sequencia.js`.
- Verificação manual: `--simular` + abrir o jogo no navegador, conferir barra, avisos,
  virada, `R`, `1`/`2`, recarga mantendo placar.
- Verificação real: conectar numa live pública qualquer e conferir `presentes-vistos.json`
  sendo preenchido.
