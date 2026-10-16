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
