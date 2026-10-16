import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarComentario, lerPresente } from './tiktok.js';

test('comentário no formato dos tipos v2.5 (displayId/content/avatarThumb)', () => {
  const ev = normalizarComentario({
    user: { id: '1', displayId: 'ana.livz', nickname: 'Ana', avatarThumb: { urlList: ['http://f/a.jpg'] } },
    content: 'A'
  });
  assert.deepEqual(ev, { tipo: 'comentario', user: 'ana.livz', nome: 'Ana', foto: 'http://f/a.jpg', texto: 'A' });
});

test('comentário no formato da documentação (uniqueId/comment/profilePicture)', () => {
  const ev = normalizarComentario({
    user: { uniqueId: 'kaka', nickname: 'Kaká', profilePicture: { url: ['http://f/k.jpg'] } },
    comment: 'B'
  });
  assert.equal(ev.user, 'kaka');
  assert.equal(ev.foto, 'http://f/k.jpg');
  assert.equal(ev.texto, 'B');
});

test('presente no formato dos tipos v2.5 (gift.type, repeatEnd numérico, giftId texto)', () => {
  const p = lerPresente({
    user: { id: '42', displayId: 'x' }, giftId: '5655', groupId: '7', repeatCount: 3, repeatEnd: 1,
    gift: { id: '5655', type: 1, name: 'Rose', diamondCount: 1 }
  });
  assert.deepEqual(p, { userId: '42', giftId: 5655, groupId: '7', giftType: 1, repeatCount: 3,
    repeatEnd: true, nome: 'Rose', diamantes: 1 });
});

test('presente no formato da documentação (giftDetails)', () => {
  const p = lerPresente({
    user: { userId: '9', uniqueId: 'y' }, giftId: 6064, repeatCount: 1, repeatEnd: false,
    giftDetails: { giftType: 2, giftName: 'GG', diamondCount: 1 }
  });
  assert.equal(p.userId, '9');
  assert.equal(p.giftType, 2);
  assert.equal(p.nome, 'GG');
});
