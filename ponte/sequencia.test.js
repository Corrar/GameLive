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
  c(g({ repeatCount: 4 }));
  c(g({ repeatCount: 4, repeatEnd: true }));
  assert.equal(c(g({ repeatCount: 1 })), 1);
});
