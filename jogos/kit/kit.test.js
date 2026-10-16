import test from 'node:test';
import assert from 'node:assert/strict';
import { ehPresente, acaoDoPresente, escapar, palavraDoTime, criarTimes, html, ehDemo } from './kit.js';

const ev = { presenteId: 5655, presenteNome: 'Rose' };

test('ehPresente por id, por nome sem caixa, e não bate com outro', () => {
  assert.equal(ehPresente(5655, ev), true);
  assert.equal(ehPresente('rose', ev), true);
  assert.equal(ehPresente('GG', ev), false);
  assert.equal(ehPresente(6064, ev), false);
});

test('acaoDoPresente devolve a ação mapeada ou null', () => {
  assert.equal(acaoDoPresente({ nitro: ['GG'], entrar: ['Rose', 1] }, ev), 'entrar');
  assert.equal(acaoDoPresente({ nitro: ['GG'] }, ev), null);
  assert.equal(acaoDoPresente(undefined, ev), null);
});

test('escapar neutraliza HTML', () => {
  assert.equal(escapar('<b>"x"&\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;&lt;/b&gt;');
  assert.equal(escapar(null), '');
});

test('palavraDoTime ignora caixa e espaços', () => {
  const p = { A: ['A', '1'], B: ['B', '2'] };
  assert.equal(palavraDoTime(p, ' a '), 'A');
  assert.equal(palavraDoTime(p, '2'), 'B');
  assert.equal(palavraDoTime(p, 'abc'), null);
});

test('criarTimes: palavra escolhe o time, presente sem time vai para o menor', () => {
  const t = criarTimes({ A: ['A'], B: ['B'] });
  assert.equal(t.pelaPalavra({ user: 'u1', texto: 'A' }), 'A');
  assert.equal(t.pelaPalavra({ user: 'u2', texto: 'A' }), 'A');
  assert.equal(t.doUsuario('u3'), 'B');
  assert.equal(t.doUsuario('u1'), 'A');
  assert.equal(t.pelaPalavra({ user: 'u1', texto: 'B' }), 'B');
  assert.deepEqual(t.tamanho(), { A: 1, B: 2 });
  assert.equal(t.pelaPalavra({ user: 'u4', texto: 'oi' }), null);
});

test('html`` escapa só o que é interpolado', () => {
  const nick = '<img src=x onerror=alert(1)>';
  assert.equal(html`<b>${nick}</b> mandou ${3}`.__html,
    '<b>&lt;img src=x onerror=alert(1)&gt;</b> mandou 3');
});

test('ehDemo: fora de localhost ou com ?demo roda em demonstração', () => {
  assert.equal(ehDemo('http://localhost:3000/jogos/urna/'), false);
  assert.equal(ehDemo('http://127.0.0.1:3000/jogos/urna/'), false);
  assert.equal(ehDemo('http://localhost:3000/jogos/urna/?demo'), true);
  assert.equal(ehDemo('https://gamelive.vercel.app/jogos/urna/'), true);
});
