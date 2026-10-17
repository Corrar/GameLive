// Cenário fixo do Céu de Pipas: céu do pôr do sol (shader próprio com sol e névoa), estrelas,
// bairro de lajes em várias profundidades (tudo fundido por material: poucas chamadas de desenho)
// e os pontos nas lajes onde quem empina fica de pé.
import { THREE, material, texturaMaterial, mergeGeometries } from '../kit/cena3d.js';

let semente = 11;
const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
const escolher = (lista) => lista[Math.floor(rnd() * lista.length)];

/* ---------- céu ---------- */

// Cúpula com degradê de fim de tarde, disco do sol com faixas de névoa e modo tempestade.
export function criarCeu(cena, dirSol) {
  const paradas = [-.1, 0, .03, .08, .16, .27, .42, .7];
  const cores = ['#f0a060', '#ffd88c', '#ffb466', '#f8805e', '#d6537a', '#983c86', '#56287a', '#22144c'].map((c) => new THREE.Color(c));
  const cor = (c) => ({ value: new THREE.Color(c) });
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      cores: { value: cores }, paradas: { value: paradas }, sol: { value: dirSol.clone() },
      tempestade: { value: 0 }, flash: { value: 0 },
      corHalo: cor('#ffb06a'), corDisco: cor('#fff6cf'), corBorda: cor('#ff9a45'), corNevoa: cor('#f0727e'),
      tempA: cor('#17162a'), tempB: cor('#4a4562')
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `
      uniform vec3 cores[8]; uniform float paradas[8]; uniform vec3 sol; uniform float tempestade; uniform float flash;
      uniform vec3 corHalo; uniform vec3 corDisco; uniform vec3 corBorda; uniform vec3 corNevoa; uniform vec3 tempA; uniform vec3 tempB;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = cores[0];
        for (int i = 1; i < 8; i++) col = mix(col, cores[i], smoothstep(paradas[i - 1], paradas[i], h));
        float c = dot(d, sol);
        float s = max(c, 0.);
        col += corHalo * (pow(s, 5.) * .32 + pow(s, 40.) * .5 + pow(s, 600.) * .5) * (1. - tempestade);
        // disco do sol (~3,2 graus de raio), mais claro no meio
        float ang = acos(clamp(c, -1., 1.)), raio = .056;
        float disco = 1. - smoothstep(raio * .95, raio, ang);
        vec3 cd = mix(corDisco, corBorda, smoothstep(.1, 1., ang / raio));
        float e = h - sol.y;
        float faixas = exp(-pow((e + .014) / .0045, 2.)) + .8 * exp(-pow((e - .008) / .003, 2.)) + .7 * exp(-pow((e + .034) / .006, 2.));
        cd = mix(cd, corNevoa, clamp(faixas, 0., 1.) * .6);
        col = mix(col, cd, disco * (1. - tempestade));
        col = mix(col, mix(tempB, tempA, smoothstep(-.05, .5, h)), tempestade);
        col += flash * vec3(.55, .6, .8);
        gl_FragColor = vec4(col, 1.);
        #include <colorspace_fragment>
      }`
  });
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  ceu.frustumCulled = false;
  ceu.renderOrder = -10;
  cena.add(ceu);
  return ceu;
}

// Estrelinhas no alto do céu (um único Points).
export function criarEstrelas(cena, escala = 1) {
  const n = 90, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const el = Math.asin(.3 + rnd() * .62), az = (rnd() - .5) * 1.4;
    pos.set([Math.cos(el) * Math.sin(az) * 850, Math.sin(el) * 850, -Math.cos(el) * Math.cos(az) * 850], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pontos = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#fff4e8', size: 2.6 * escala, sizeAttenuation: false,
    transparent: true, opacity: .75, fog: false, depthWrite: false }));
  pontos.frustumCulled = false;
  cena.add(pontos);
  return pontos;
}

/* ---------- bairro ---------- */

const PASTEIS = ['#f2b8a2', '#f6d77c', '#9fd3c7', '#c9a6dc', '#f49ac1', '#a8c8f0', '#f3ede2', '#e8a86b', '#b8d98a', '#f7c59f'];
const TIJOLOS = ['#ffffff', '#f3e0d6', '#ffe9dc', '#e9cfc2'];
const AZUIS = ['#2f6fd8', '#3b82e8', '#2a62c4'];

// Caixa com UV na escala do mundo (a textura não estica em paredes grandes).
function caixaUV(l, a, p, tile) {
  const g = new THREE.BoxGeometry(l, a, p);
  const uv = g.attributes.uv;
  const medidas = [[p, a], [p, a], [l, p], [l, p], [l, a], [l, a]];
  const ou = rnd(), ov = rnd();
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * medidas[f][0] / tile + ou, uv.getY(i) * medidas[f][1] / tile + ov);
  }
  return g;
}

function pintar(g, cor) {
  const c = new THREE.Color(cor), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Monta o bairro. comFundo = morro e prédios ao longe; comChao = rua de asfalto; perto = distância da câmera
// em que começam as casas. No fundo transparente fica só uma faixa de lajes lá longe, sem rua nem morro.
// Devolve { candidatos, colisao }: pontos nas lajes onde alguém pode empinar e as caixas das casas (para ver quem aparece).
export function criarBairro(cena, { comFundo = true, comChao = true, perto = 0, sombras = true } = {}) {
  semente = 11;
  const lotes = new Map();
  const juntar = (chave, g) => { if (!lotes.has(chave)) lotes.set(chave, []); lotes.get(chave).push(g); return g; };
  const colisao = [];
  const candidatos = [];

  // bloco com a base em y
  function bloco(chave, l, a, p, x, y, z, cor = '#ffffff', tile = 3) {
    const g = caixaUV(l, a, p, tile);
    g.translate(x, y + a / 2, z);
    return juntar(chave, pintar(g, cor));
  }
  function cilindro(chave, r1, r2, a, x, y, z, cor, lados = 16) {
    const g = new THREE.CylinderGeometry(r1, r2, a, lados);
    g.translate(x, y + a / 2, z);
    return juntar(chave, pintar(g, cor));
  }
  function caixaDagua(x, y, z, r, sufixo) {
    const cor = escolher(AZUIS);
    cilindro('plastico' + sufixo, r, r * .9, r * 1.3, x, y, z, cor, 18);
    cilindro('plastico' + sufixo, r * 1.06, r * 1.06, .12, x, y + r * 1.3, z, cor, 18);
    cilindro('plastico' + sufixo, r * .3, r * .3, .08, x, y + r * 1.3 + .12, z, cor, 10);
  }
  function antena(x, y, z, alt, sufixo) {
    cilindro('metal' + sufixo, .03, .03, alt, x, y, z, '#4a4550', 5);
    for (let k = 0; k < 3; k++) bloco('metal' + sufixo, 1.1 - k * .28, .035, .035, x, y + alt - .15 - k * .32, z, '#4a4550', 1);
  }
  function telhado(l, p, x, y, z, alt) {
    let g = new THREE.CylinderGeometry(1, 1, l + .3, 3, 1);
    g.rotateZ(Math.PI / 2);
    g.rotateX(-Math.PI / 2);
    g.scale(1, alt / 1.5, (p + .4) / 1.732);
    g.translate(x, y + alt / 3, z);
    g = g.toNonIndexed();
    g.computeVertexNormals();
    juntar('telha', pintar(g, escolher(['#b5532d', '#a64a2a', '#c2643a'])));
  }
  function varal(x, y, z, l) {
    for (const s of [-1, 1]) cilindro('metal', .025, .025, 1.5, x + s * l / 2, y, z, '#3a3640', 5);
    bloco('metal', l, .015, .015, x, y + 1.42, z, '#d9d2c8', 1);
    for (let k = 0; k < Math.floor(l / .55); k++) {
      const g = new THREE.PlaneGeometry(.38 + rnd() * .15, .45 + rnd() * .25);
      g.translate(x - l / 2 + .35 + k * .55, y + 1.42 - .28, z + (rnd() - .5) * .04);
      juntar('roupa', pintar(g, escolher(['#ff5d7a', '#ffffff', '#3d8bff', '#ffd23f', '#3df2c2', '#9b6bff'])));
    }
  }

  // casa de laje (ou telhado); sufixo '-longe' = sem sombra, só para silhueta
  function casa(x, z, l, p, andares, base, { longe = false, lugares = false } = {}) {
    const sufixo = longe ? '-longe' : '';
    const h = andares * 2.9, topo = base + h;
    const deTijolo = rnd() < .45;
    bloco((deTijolo ? 'tijolo' : 'tinta') + sufixo, l, h + 4, p, x, base - 4, z, deTijolo ? escolher(TIJOLOS) : escolher(PASTEIS), deTijolo ? 1.6 : 3);
    colisao.push({ min: new THREE.Vector3(x - l / 2, base - 4, z - p / 2), max: new THREE.Vector3(x + l / 2, topo + .3, z + p / 2) });
    // janelas da frente (acesas ou de vidro)
    const porAndar = Math.max(1, Math.floor(l / 2.3));
    for (let f = 0; f < andares; f++) for (let j = 0; j < porAndar; j++) {
      if (rnd() < .18) continue;
      const wx = x - l / 2 + (j + .5) * l / porAndar, wy = base + f * 2.9 + .95;
      const acesa = rnd() < (longe ? .45 : .32);
      bloco((acesa ? 'acesa' : 'vidro') + sufixo, .8, 1, .08, wx, wy, z + p / 2 + .02, acesa ? escolher(['#ffd9a0', '#ffe2b8', '#ffc98a']) : escolher(['#2b2540', '#3a2f52', '#24304a']), 1);
      if (!longe) bloco('concreto', 1, .1, .2, wx, wy - .1, z + p / 2 + .06, '#d8d2c8', 1); // peitoril
    }
    if (!longe && rnd() < .2 && andares < 3) {
      telhado(l, p, x, topo, z, .9 + rnd() * .5);
      return;
    }
    // laje com mureta, caixa d'água, antena, vergalhão e varal
    const cinza = escolher(['#c9c4bb', '#b8b2a8', '#d6d0c6']);
    bloco('concreto' + sufixo, l + .3, .22, p + .3, x, topo, z, cinza);
    const y = topo + .22;
    if (lugares) {
      // até 3 pontos por laje, na metade da frente (a caixa d'água e a antena ficam atrás);
      // folga = quanto alguém pode se afastar para o lado sem sair do seu pedaço da laje
      const n = l > 5.6 ? 3 : l > 4 ? 2 : 1;
      const folga = Math.min(.7, Math.max(.3, l / n / 2 - .55));
      for (let k = 0; k < n; k++) {
        const px = x - l / 2 + (k + .5) * l / n + (rnd() - .5) * .5;
        candidatos.push({ pos: new THREE.Vector3(px, y, z + p / 2 - .8 - rnd() * (p / 2 - 1.2)), folga });
      }
    }
    if (longe) {
      if (rnd() < .35) caixaDagua(x + (rnd() - .5) * (l - 1.4), topo + .22, z + (rnd() - .5) * (p - 1.4), .45, sufixo);
      return;
    }
    const mureta = rnd() < .55;
    if (mureta) {
      const alt = .45 + rnd() * .5, corM = deTijolo ? '#ffffff' : cinza;
      const chaveM = deTijolo ? 'tijolo' : 'concreto';
      bloco(chaveM, l + .3, alt, .14, x, y, z + p / 2 + .08, corM, 1.6);
      bloco(chaveM, .14, alt, p + .3, x - l / 2 - .08, y, z, corM, 1.6);
      bloco(chaveM, .14, alt, p + .3, x + l / 2 + .08, y, z, corM, 1.6);
    }
    if (rnd() < .3) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      bloco('metal', .035, .5 + rnd() * .6, .035, x + sx * (l / 2 - .15), y, z + sz * (p / 2 - .15), '#8a5236', 1);
    }
    const temCaixa = rnd() < .55;
    const cx = x + (rnd() < .5 ? -1 : 1) * (l / 2 - 1), cz = z - p / 2 + 1.1;
    if (temCaixa) caixaDagua(cx, y, cz, .55 + rnd() * .2, '');
    if (rnd() < .45) antena(x + (rnd() - .5) * (l - 1), y, z - p / 2 + .6 + rnd(), 1.6 + rnd() * 1.4, '');
    if (rnd() < .22 && l > 4) varal(x, y, z - .4, Math.min(2.6, l - 1.5));
  }

  // chão das ruas e becos (a nossa laje fica logo abaixo da câmera, fora do quadro)
  if (comChao) {
    const asfalto = texturaMaterial('asfalto', { cor: '#4a4248', repetir: [60, 60], semente: 4 });
    const rua = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), material('#ffffff', { mapa: asfalto.mapa, rugosidade: .95 }));
    rua.rotation.x = -Math.PI / 2;
    rua.position.set(0, 0, -250);
    rua.receiveShadow = sombras;
    cena.add(rua);
  }

  // tapete de lajes até o horizonte, com o terreno ondulando de leve
  const terreno = (x, z) => Math.max(0, 1.6 * Math.sin(x * .045 + 1) + 1.3 * Math.sin(z * .06 + .5) + .4);
  for (let z = -4; z > -180; z -= 7 + rnd() * 2.5) {
    const d = 12 - z;
    const meia = d * .29 + 5;
    const longe = d > 125;
    if (d < perto) continue;
    for (let x = -meia + rnd() * 3; x < meia;) {
      const l = 3.6 + rnd() * 3.4, p = 5 + rnd() * 2.2;
      const andares = 1 + Math.floor(rnd() * (d < 60 ? 2 : 3)) + (d > 90 && rnd() < .12 ? 1 : 0);
      const cx = x + l / 2;
      casa(cx, z + (rnd() - .5) * 1.4, l, p, andares, terreno(cx, z) + rnd() * .4, { longe, lugares: d > 40 && d < 160 });
      x += l + .12 + (rnd() < .16 ? 1.5 : 0);
    }
  }

  if (comFundo) {
    // morro à esquerda coberto de casinhas
    const morro = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), material('#5b4458', { rugosidade: 1 }));
    morro.scale.set(105, 52, 80);
    morro.position.set(-70, -20, -320);
    cena.add(morro);
    const alturaMorro = (x, z) => {
      const k = 1 - ((x + 70) / 105) ** 2 - ((z + 320) / 80) ** 2;
      return k > 0 ? -20 + 52 * Math.sqrt(k) : -99;
    };
    for (let i = 0; i < 340; i++) {
      const x = -160 + rnd() * 150, z = -250 - rnd() * 90;
      const y = alturaMorro(x, z);
      if (y < 1) continue;
      casa(x, z, 3.2 + rnd() * 2.6, 3.5 + rnd() * 2, 1 + Math.floor(rnd() * 2), y - 1, { longe: true });
    }
    // cidade baixa à direita, onde o sol se põe
    for (let x = 6; x < 170;) {
      const l = 8 + rnd() * 10, z = -270 - rnd() * 80, alt = 5 + rnd() * (x < 90 ? 8 : 20);
      bloco((rnd() < .5 ? 'tinta' : 'concreto') + '-longe', l, alt + 4, 8 + rnd() * 6, x + l / 2, -4, z, escolher(['#b9a8b8', '#a89aae', '#c7b2b0', '#9d93a8']), 4);
      for (let wy = 1.2; wy < alt - .8; wy += 2.2) for (let wx = x + 1; wx < x + l - 1; wx += 1.6) {
        if (rnd() < .4) bloco('acesa-longe', .7, .9, .1, wx + .35, wy, z + 4 + .1, escolher(['#ffd9a0', '#ffe2b8']), 1);
      }
      x += l + rnd() * 3;
    }
  }

  // funde cada lote num único Mesh
  const tex = (tipo, cor, s) => texturaMaterial(tipo, { cor, repetir: [1, 1], semente: s });
  const parede = tex('parede', '#f6f1e8', 3), tijolo = tex('tijolo', '#b9603e', 5), concreto = tex('concreto', '#b7b2aa', 9);
  // sem relevo: de longe não aparece e custa caro no PC fraco
  const MATS = {
    tinta: material('#ffffff', { mapa: parede.mapa, rugosidade: .92 }),
    tijolo: material('#ffffff', { mapa: tijolo.mapa, rugosidade: .9 }),
    concreto: material('#ffffff', { mapa: concreto.mapa, rugosidade: .95 }),
    acesa: material('#ffd9a0', { emissivo: '#ffa64a', intensidadeEmissiva: 1.5, rugosidade: .5 }),
    vidro: material('#ffffff', { rugosidade: .1, metal: .3 }),
    plastico: material('#ffffff', { rugosidade: .28 }),
    metal: material('#ffffff', { metal: .8, rugosidade: .4 }),
    telha: material('#ffffff', { rugosidade: .75 }),
    roupa: material('#ffffff', { rugosidade: .9, lados: THREE.DoubleSide })
  };
  for (const m of Object.values(MATS)) m.vertexColors = true;
  for (const t of [parede, tijolo, concreto]) t.relevo.dispose();
  for (const [chave, geos] of lotes) {
    const longe = chave.endsWith('-longe');
    const mesh = new THREE.Mesh(mergeGeometries(geos), MATS[chave.replace('-longe', '')]);
    for (const g of geos) g.dispose();
    mesh.castShadow = sombras && !longe;
    mesh.receiveShadow = sombras && !longe;
    cena.add(mesh);
  }
  return { candidatos, colisao };
}

// Raio contra caixa alinhada (método das placas): distância de entrada ou Infinity.
function raioCaixa(origem, dir, caixa) {
  let t0 = 0, t1 = Infinity;
  for (const k of ['x', 'y', 'z']) {
    const inv = 1 / dir[k];
    let a = (caixa.min[k] - origem[k]) * inv, b = (caixa.max[k] - origem[k]) * inv;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

// Fica com os pontos de laje que a câmera enxerga (sem casa na frente) e que não caem embaixo do placar.
export function lugaresVisiveis({ candidatos, colisao }, camera, { yMax = 1390, xMin = 70, xMax = 1010 } = {}) {
  const dir = new THREE.Vector3(), alvo = new THREE.Vector3(), tela = new THREE.Vector3();
  const lugares = [];
  for (const { pos: c, folga } of candidatos) {
    tela.copy(c).project(camera);
    const sx = (tela.x + 1) * 540, sy = (1 - tela.y) * 960;
    if (sx < xMin || sx > xMax || sy > yMax) continue;
    let ok = true;
    for (const alt of [1.3, 1.65]) {
      alvo.copy(c).y += alt;
      dir.subVectors(alvo, camera.position);
      const dist = dir.length();
      dir.divideScalar(dist);
      for (const cx of colisao) if (raioCaixa(camera.position, dir, cx) < dist - .6) { ok = false; break; }
      if (!ok) break;
    }
    if (ok && !lugares.some((l) => Math.hypot(l.sx - sx, l.sy - sy) < 34)) lugares.push({ pos: c, folga, sx, sy, dono: null, extras: 0 });
  }
  return lugares.sort((a, b) => a.sx - b.sx);
}
