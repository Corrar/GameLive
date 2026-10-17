<div align="center">

<img src="assets/banner.svg" alt="GameLive — jogos que o chat da sua live joga com você" width="100%">

<br>

<img src="assets/logo.svg" alt="" width="72">

### Comentou, aconteceu.

Jogos interativos em 3D para **TikTok LIVE**: cada comentário e presente da audiência vira ação dentro do jogo, ao vivo, na tela do streamer.

<br>

![Node](https://img.shields.io/badge/node-%E2%89%A520-3df2c2?style=flat-square&labelColor=0b0d17)
![HTML5](https://img.shields.io/badge/jogos-HTML5%20sem%20build-ff3d7f?style=flat-square&labelColor=0b0d17)
![OBS](https://img.shields.io/badge/captura-OBS%20%C2%B7%20LIVE%20Studio-9aa3bd?style=flat-square&labelColor=0b0d17)
![Status](https://img.shields.io/badge/jogos-8%20prontos-3df2c2?style=flat-square&labelColor=0b0d17)

</div>

---

## O que é

O **GameLive** é um conjunto de jogos feitos para rodar *durante* uma live. O streamer abre o jogo, informa o seu `@` uma vez, e a partir daí quem joga é o chat:

- 💬 **comentário vira jogada** — escolher um time, entrar na corrida, soltar uma pipa;
- 🎁 **presente vira evento** — voto, nitro, bola de demolição, golpe especial;
- 👀 **quem assiste se vê na tela** — nome e foto de quem participou aparecem no jogo.

## Como funciona

```
 TikTok LIVE ──► ponte (Node.js) ──WebSocket──► jogo (página HTML5) ──► OBS / LIVE Studio
   comentários     padroniza os eventos             reage aos eventos       captura a tela
   presentes       conta presentes em sequência
```

| Parte | Onde | O que faz |
|---|---|---|
| **Ponte** | `ponte/` | Conecta na live pelo `@`, converte comentários e presentes num formato único, conta presentes em sequência sem duplicar e reconecta sozinha se a live cair. |
| **Simulador** | `jogos/kit/simulador.js` | Gera comentários e presentes falsos — na ponte (`--simular`) e no modo demonstração do navegador. |
| **Kit** | `jogos/kit/` | Base comum dos jogos: conexão com a ponte, palco 9:16, avisos, placar salvo, times, efeitos e a base 3D (`cena3d.js`, three.js em `vendor/`). |
| **Jogos** | `jogos/<nome>/` | Cada jogo é uma página estática com um `config.json` editável. |
| **Site** | `site/` | Página inicial publicada na Vercel, com a vitrine dos jogos em demonstração. |

## Jogos

| Jogo | Como o chat joga | Status |
|---|---|---|
| 🗳️ **Urna da Live** | Presente vira voto; combos, urna eletrônica, ranking e rodadas com tempo | ✅ pronto |
| 🪢 **Cabo de Guerra** | Comente o seu time e puxe a corda; presente puxa mais forte | ✅ pronto |
| 🏎️ **Corrida do Chat** | Quem comenta entra na pista; presentes viram nitro e óleo | ✅ pronto |
| 🗼 **Torre Alta** | Presentes constroem e derrubam a torre | ✅ pronto |
| 🏰 **Torres Rivais** | Dois times, duas torres, quem chega primeiro na meta | ✅ pronto |
| 🐦 **Voo da Live** | O pássaro voa sozinho e o chat tenta derrubar | ✅ pronto |
| 🪁 **Céu de Pipas** | Cada comentário é uma pipa; presente corta a linha do rival | ✅ pronto |
| 🥊 **Briga da Live** | Escolha o lutador; presentes viram golpes | ✅ pronto |

## Demonstração online

O site do GameLive (pasta `site/`) é publicado na Vercel com os 8 jogos rodando em **modo demonstração**: fora de `localhost` não existe ponte, então o kit liga o simulador dentro do próprio navegador e o selo mostra `● demonstração`. Localmente, `?demo` no fim da URL força o mesmo modo. O placar da demonstração fica separado do placar das lives.

```bash
node scripts/site.mjs     # monta dist/ (site + jogos + assets), o mesmo que a Vercel roda
```

## Começando

Requer **Node.js 20+**.

```bash
npm install

# testar sem live (eventos falsos)
npm run simular

# conectar numa live de verdade
npm start -- @seu_usuario
```

Depois abra **http://localhost:3000/jogos/**, escolha um jogo e capture a página:

- **OBS:** fonte *Navegador* → URL do jogo, largura `1080`, altura `1920`.
- **TikTok LIVE Studio:** captura de *Janela* do navegador com o jogo aberto.

Em todo jogo, a tecla `T` dispara um evento de teste.

### Configurando os presentes

Cada jogo tem um `config.json` com nomes, cores e quais presentes fazem o quê. Um presente pode ser indicado pelo **ID** (número) ou pelo **nome**:

```json
{ "presente": 5655, "votos": 1 }
{ "presente": "Rose", "votos": 1 }
```

Campos comuns aos jogos:

| Campo | O que faz |
|---|---|
| `"qualidade": "alta"` | Qualidade da cena 3D: `alta`, `media` ou `baixa` (PC fraco no OBS). Também dá para usar `?qualidade=baixa` na URL. |
| `"som": true` | Efeitos sonoros (no OBS, marque *Controlar áudio via OBS* na fonte de navegador). |
| `"fundo"` | Cor, gradiente ou `"transparente"` para sobrepor na câmera; a Urna também aceita `"estudio"` (cenário próprio). |
| `"rodada": { "segundos": 120, "pausa": 8 }` | Urna: duração da rodada e tempo mostrando o vencedor (`0` = sem cronômetro). |
| `"numero"`, `"imagem"` em cada lado | Urna: número digitado na urna eletrônica (ex.: 13, 22) e imagem mostrada na tela da urna (arquivo em `jogos/urna/imagens/` ou URL). |

Para descobrir o ID dos presentes da sua região, conecte numa live e abra o arquivo `presentes-vistos.json`, que a ponte preenche com todo presente que chegar.

Se a conexão começar a falhar por limite, crie uma chave em [eulerstream.com](https://www.eulerstream.com) e rode com `EULER_API_KEY=sua_chave`.

O que ainda falta fazer está em [`PENDENCIAS.md`](PENDENCIAS.md).

## Testes

```bash
npm test                                   # regra de presentes, conversão de eventos e kit
npm run simular                            # em outro terminal, depois:
node scripts/captura.mjs urna urna.png --teclas t   # abre o jogo no Chrome, aperta T e salva a tela
```

O script de captura sai com erro se a página tiver qualquer erro de JavaScript.

## Avisos

- O TikTok **não tem API oficial** para eventos de live. A ponte usa a biblioteca comunitária [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector), que pode parar de funcionar quando o TikTok mudar algo.
- Temas políticos em lives com presentes podem violar as regras de monetização do TikTok e, em período eleitoral, a vedação a enquetes do TSE. Os lados de cada jogo são configuráveis justamente para que essa escolha seja do streamer.
- GameLive não tem vínculo com TikTok, OBS ou qualquer outra marca citada.

<div align="center">
<br>
<img src="assets/logo.svg" alt="" width="28"><br>
<sub>feito para lives que querem a audiência jogando junto</sub>
</div>
