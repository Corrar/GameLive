// Monta o site estático publicado na Vercel em dist/: página inicial (site/), jogos e assets.
// Fora de localhost os jogos rodam em demonstração (kit.ehDemo), sem precisar da ponte.
//   node scripts/site.mjs
import { cp, rm, mkdir } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const dist = new URL('dist/', raiz);

await rm(dist, { recursive: true, force: true });
await mkdir(dist);
await cp(new URL('site/', raiz), dist, { recursive: true });
await cp(new URL('jogos/', raiz), new URL('jogos/', dist), {
  recursive: true, filter: (origem) => !origem.endsWith('.test.js')
});
await cp(new URL('assets/', raiz), new URL('assets/', dist), { recursive: true });
// diagrama interativo da arquitetura (docs/arquitetura/, gerado com o Archify)
await mkdir(new URL('arquitetura/', dist));
await cp(new URL('docs/arquitetura/gamelive.architecture.html', raiz), new URL('arquitetura/index.html', dist));
console.log('site montado em dist/');
