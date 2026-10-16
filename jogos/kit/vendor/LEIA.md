# Bibliotecas de terceiros

- `three.module.min.js` — [three.js](https://threejs.org) r186 (`three@0.186.1`, licença MIT em `LICENSE-three.txt`),
  `build/three.module.js` + `three.core.js` juntos e minificados com
  `esbuild three.module.js --bundle --format=esm --minify --legal-comments=inline`.
- `addons/` — arquivos sem alteração de `three@0.186.1/examples/jsm/`, nas mesmas subpastas (RoundedBoxGeometry, RoomEnvironment,
  BufferGeometryUtils, Sky). Importam `three`, resolvido pelo import map de cada jogo.
