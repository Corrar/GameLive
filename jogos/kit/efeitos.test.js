import test from 'node:test';
import assert from 'node:assert/strict';
import { emojiDoPresente, criarCombo, criarRanking, formatarTempo, iniciais, corDoNick } from './efeitos.js';

test('emojiDoPresente por nome, sem caixa, com padrão', () => {
  assert.equal(emojiDoPresente('Rose'), '🌹');
  assert.equal(emojiDoPresente('DOUGHNUT'), '🍩');
  assert.equal(emojiDoPresente('Desconhecido'), '🎁');
});

test('combo soma dentro da janela e recomeça depois', () => {
  const c = criarCombo({ janela: 1000 });
  assert.equal(c.registrar('A', 2, 0), 2);
  assert.equal(c.registrar('A', 3, 500), 5);
  assert.equal(c.registrar('B', 1, 600), 1);
  assert.equal(c.registrar('A', 1, 2000), 1);
  assert.equal(c.atual('B', 5000), 0);
});

test('ranking ordena por pontos e atualiza nome/foto', () => {
  const r = criarRanking();
  r.somar({ user: 'a', nome: 'Ana' }, 3);
  r.somar({ user: 'b', nome: 'Beto' }, 5);
  r.somar({ user: 'a', nome: 'Ana Live', foto: 'x.jpg' }, 4);
  const [primeiro, segundo] = r.top(2);
  assert.deepEqual([primeiro.user, primeiro.pontos, primeiro.nome, primeiro.foto], ['a', 7, 'Ana Live', 'x.jpg']);
  assert.equal(segundo.user, 'b');
});

test('formatarTempo, iniciais e cor estável', () => {
  assert.equal(formatarTempo(68), '1:08');
  assert.equal(formatarTempo(-3), '0:00');
  assert.equal(iniciais('luna.gg'), 'LG');
  assert.equal(iniciais('beto'), 'BE');
  assert.equal(corDoNick('x'), corDoNick('x'));
});
