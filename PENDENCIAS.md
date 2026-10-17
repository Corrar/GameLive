# Pendências — onde paramos

Atualizado em 17/10/2026. Branch: `claude/nice-galileo-k2f1k9` (ainda não juntada ao `main`).
Site publicado: https://gamelive-one.vercel.app (Vercel, projeto `gamelive`).

## Estado atual

Os 8 jogos estão em **3D (three.js)**, commitados e publicados. A base 3D fica em `jogos/kit/cena3d.js`
(three.js r186 em `jogos/kit/vendor/`). Página de conferência das peças 3D: `jogos/kit/vitrine3d.html`.

| Jogo | Situação | Nota da última revisão independente |
|---|---|---|
| Urna da Live | pronto — uma urna, mão 3D animada, som de urna, 13/22 com imagens | 8,5 (aprovado); a 3ª revisão foi interrompida |
| Voo da Live | pronto | 8,5 (aprovado) |
| Cabo de Guerra | pronto | 8,5 (aprovado) |
| Briga da Live | pronto | 8 (aprovado) |
| Torre Alta | pronto | 8,2 (aprovado) |
| Torres Rivais | pronto | 8 (aprovado) |
| Céu de Pipas | funciona; correções da 1ª revisão aplicadas, **falta revisar de novo** | 7 antes das correções |
| Corrida do Chat | funciona; **correções da revisão incompletas** (interrompidas no meio) | 6,5 |

## Para fazer

### Prioridade 1 — Corrida do Chat (`jogos/corrida/`)
A correção foi interrompida no meio. Eu completei só a função `foco()` da câmera (em `pista3d.js`) para o jogo não dar erro.
Conferir e corrigir o que a revisão apontou:
- [ ] **(alta)** O pódio fica tapado por carros novos que entram durante o fim da corrida (caem na curva de baixo, na frente da câmera do pódio).
- [ ] Carros passam por dentro uns dos outros (sem colisão nem troca de faixa).
- [ ] Na largada e em pelotões, as etiquetas de nome viram uma pilha ilegível.
- [ ] O troféu às vezes vai para quem não é o 1º do pódio (`vencer()` usa a ordem do array; o pódio usa `ordenados()`).
- [ ] Carros e etiquetas aparecem voando por cima da arquibancada e do HUD quando entram caindo.
- [ ] Efeitos do teleporte (feixes, anéis, flashes) lavam a tela de lilás.

### Prioridade 2 — Céu de Pipas (`jogos/pipas/`)
O agente diz ter corrigido os 10 itens; a revisão de confirmação foi interrompida. Rever:
- [ ] Nuvens da tempestade cortadas na borda (era o item alto).
- [ ] Nomes das pipas sobrepostos com o céu cheio.
- [ ] Presentes seguidos sem alvo livre (pipas "reservadas" por ataques anteriores).
- [ ] Com `"fundo": "transparente"`, a rua e as casas ainda aparecem opacas.

### Prioridade 3 — melhorias apontadas nos jogos aprovados (nada quebrado)
- [ ] **Briga:** a torcida são cápsulas lisas (sem rosto/braços); é o ponto mais "primitivo" da cena.
- [ ] **Cabo:** câmera acompanha só 60% da corda; perto do fim, o último puxador fica cortado na borda.
- [ ] **Torre Alta:** depois de um martelo numa torre alta, a câmera mostra céu vazio por um instante antes de descer.
- [ ] **Torres Rivais:** a faixa de vitória aparece antes de as lajes terminarem de cair.
- [ ] **Voo:** no CAOS o céu quase não muda; a visão turva desfoca a cena 3D inteira (pesado em PC fraco).
- [ ] **Urna:** cabo da urna passa por trás do chip "+1 VOTO" do lado B; o cursor da tela redesenha a tela inteira a cada 0,45 s.
- [ ] Kit (`efeitos.js`): `contador()` pode mostrar número negativo com poucos quadros por segundo (a Urna já usa um contador próprio).

### Decisões do dono
- [ ] **Imagens da Urna** (`jogos/urna/imagens/13.jpg` e `22.jpg`): são caricaturas de políticos reais feitas por terceiros
  (a do 22 tem assinatura do artista). Confirmar se pode usar (direitos autorais) — também aparecem no site público.
  Para trocar ou desligar: campo `imagem` de cada lado em `jogos/urna/config.json` (vazio = retrato ilustrado genérico).
- [ ] Tema político em live com presentes: regras de monetização do TikTok e, em período eleitoral, a vedação a enquetes do TSE.
- [ ] Cores da Urna: hoje 13 = verde e 22 = vermelho. Trocar se quiser (campo `cor` em `jogos/urna/config.json`).
- [ ] Juntar a branch `claude/nice-galileo-k2f1k9` ao `main` (sem isso, um push direto no `main` publicaria a versão antiga na Vercel).

## Como retomar
1. `npm install` e `npm run simular` → abrir `http://localhost:3000/jogos/<jogo>/` (adicione `?qualidade=baixa` em PC fraco).
2. Para conferir uma cena 3D por captura em navegador sem GPU, o WebGL roda por software e fica lento (~2 fps): use `?qualidade=baixa`.
3. Depois de mexer: `npm test`, commit na branch e publicar de novo na Vercel.
