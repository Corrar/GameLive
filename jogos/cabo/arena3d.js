// Cena 3D do Cabo de Guerra: estádio ao entardecer com torcida dos dois times, gramado com as linhas
// de vitória, a corda com a fita do meio e os 8 bonecos puxando (cada boneco é um único SkinnedMesh).
// Unidade ≈ 1 m. A corda corre no eixo x (time 0 à esquerda, time 1 à direita); a câmera olha de +z.
import { THREE, criarCena, material, malha, caixa, texturaCanvas, textoJogo, ceuDegrade, chao, boneco, poses,
  torcida as criarTorcida, criarParticulas, curvas, mergeGeometries } from '../kit/cena3d.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const LINHA = 2;                    // linhas de vitória em x = ±LINHA (o meio da corda anda até elas)
const CORDA_Y = .98;                       // altura da corda (nas mãos)
const POR_TIME = 4, PRIMEIRO = .95, ESPACO = .72;
const FILA_Z = -.34, GIRO = .4;            // bonecos atrás da corda, virados um pouco para a câmera
const SEGUE = .6;                          // quanto a câmera acompanha o meio da corda
// de cima, olhando para baixo: torcida atrás do placar, gramado e bonecos na faixa do meio da tela
const CAMERA = { pos: [0, 8.4, 16.8], alvo: [0, 1.7, 0], fov: 46 };
const PELES = ['#f1c9a5', '#c68a62', '#e0a882', '#8a5638', '#f6d5b8', '#a86f4c'];
const CABELOS = ['#1c140f', '#6a4325', '#3b2416', '#c49a5a', '#2a1a10', '#8b2f1e'];
const L1 = .3, L2 = .28;                   // braço e antebraço do boneco do kit

export function criarArena3d(palco, cfg) {
  const TIMES = cfg.times;
  const arena = (cfg.fundo ?? 'arena') === 'arena';
  const transparente = cfg.fundo === 'transparente';
  const c3d = criarCena(palco, {
    cfg, luz: 'por-do-sol', fundo: arena ? '#1b0f45' : transparente ? null : cfg.fundo,
    exposicao: 1.05, camera: CAMERA, sol: { pos: [-12, 10, 6], alcance: 9 },
    // névoa do entardecer: a arquibancada lá atrás fica mais apagada (profundidade e placar legível)
    neblina: arena ? { cor: '#3b2468', perto: 18, longe: 62 } : null
  });
  const { cena, camera } = c3d;
  c3d.sol.shadow.radius = 5;
  // sol de fim de tarde mais forte e menos luz de preenchimento: a sombra dos bonecos marca o gramado
  c3d.sol.intensity = 3.1;
  c3d.hemi.intensity = .4;
  if (cena.environment) cena.environmentIntensity = .32;
  const part = criarParticulas(c3d, { max: 700 });

  /* ---------- gramado e linhas ---------- */
  if (arena) {
    ceuDegrade(c3d, { cores: ['#120a33', '#47217e', '#ff8f62'] });
    const grama = chao(c3d, { tipo: 'grama', cor: '#3c9440', repetir: [40, 40], relevo: .03 });
    listrar(grama.material.map);
    estadio();
  } else {
    // sobre a câmera da live: só a sombra dos bonecos num chão invisível
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.ShadowMaterial({ opacity: .35 }));
    sombra.rotation.x = -Math.PI / 2;
    sombra.receiveShadow = true;
    cena.add(sombra);
  }

  const Z0 = -4.6, Z1 = 7.5;               // laterais do campo
  const tiras = [];
  const faixa = (x, z, l, p) => { const g = new THREE.PlaneGeometry(l, p); g.rotateX(-Math.PI / 2); g.translate(x, 0, z); return g; };
  tiras.push(faixa(0, Z0, 60, .12), faixa(0, Z1, 60, .12));
  for (let z = Z0 + .4; z < Z1 - .2; z += .9) tiras.push(faixa(0, z, .1, .5));   // linha do meio tracejada
  const giz = material('#ffffff', { rugosidade: .8 });
  Object.assign(giz, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const linhas = malha(mergeGeometries(tiras), giz, { sombra: false });
  linhas.position.y = .006;
  cena.add(linhas);

  // linhas de vitória coloridas, área do time e parede de luz que acendem quando a fita se aproxima
  const gradiente = texturaCanvas(256, 4, (ctx, w) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, 4);
  }).textura;
  const subida = texturaCanvas(4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }).textura;
  const zonas = TIMES.map((tm, i) => {
    const lado = i ? 1 : -1;
    const linha = malha(new THREE.PlaneGeometry(.16, Z1 - Z0), material(tm.cor, { emissivo: tm.cor, intensidadeEmissiva: .6, rugosidade: .6 }), { sombra: false });
    Object.assign(linha.material, { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    linha.rotation.x = -Math.PI / 2;
    linha.position.set(lado * LINHA, .008, (Z0 + Z1) / 2);
    const aditivo = (mapa) => new THREE.MeshBasicMaterial({ color: tm.cor, map: mapa, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: .3 });
    const area = new THREE.Mesh(new THREE.PlaneGeometry(9, Z1 - Z0), aditivo(gradiente));
    area.rotation.x = -Math.PI / 2;
    if (!i) area.rotation.z = Math.PI;     // degradê sempre saindo da linha para fora
    area.position.set(lado * (LINHA + 4.5), .01, (Z0 + Z1) / 2);
    const parede = new THREE.Mesh(new THREE.PlaneGeometry(Z1 - Z0 - 4, 3.2), aditivo(subida));
    parede.material.side = THREE.DoubleSide;
    parede.rotation.y = Math.PI / 2;
    parede.position.set(lado * LINHA, 1.6, Z0 + (Z1 - Z0 - 4) / 2);
    area.visible = arena;                  // sobre a câmera da live não pinta o chão de cor
    cena.add(linha, area, parede);
    return { linha, area, parede };
  });

  /* ---------- corda, fita do meio e bonecos (tudo anda junto com o meio da corda) ---------- */
  const mundoCorda = new THREE.Group();
  cena.add(mundoCorda);
  const fio = new THREE.Group();           // a corda em si (treme com a tensão e cai no fim)
  fio.position.y = CORDA_Y;
  mundoCorda.add(fio);
  const pontas = (s) => [[-7.2, -.93, .55], [-6.1, -.93, .4], [-5.2, -.82, .2], [-4.55, -.42, .05], [-4.1, -.08, 0]]
    .map(([x, y, z]) => new THREE.Vector3(x * s, y, z * (s > 0 ? 1 : -.7)));
  const caminho = new THREE.CatmullRomCurve3([...pontas(1), new THREE.Vector3(-3.6, 0, 0), new THREE.Vector3(-1.8, 0, 0),
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(1.8, 0, 0), new THREE.Vector3(3.6, 0, 0), ...pontas(-1).reverse()], false, 'centripetal');
  const tranca = texturaCanvas(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#d8ad69'; ctx.fillRect(0, 0, w, h);
    for (let k = -2; k < 6; k++) {                 // fios torcidos na diagonal
      const g = ctx.createLinearGradient(k * 32, 0, k * 32 + 24, h);
      g.addColorStop(0, '#9b6a33'); g.addColorStop(.5, '#f0cf8e'); g.addColorStop(1, '#9b6a33');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(k * 32, 0); ctx.lineTo(k * 32 + 20, 0); ctx.lineTo(k * 32 + 52, h); ctx.lineTo(k * 32 + 32, h); ctx.fill();
    }
  }, { repetir: [caminho.getLength() / .16, 1] });
  const corda = malha(new THREE.TubeGeometry(caminho, 160, .055, 8), material('#ffffff', { mapa: tranca.textura, relevo: tranca.textura, escalaRelevo: 1.2, rugosidade: .85 }));
  fio.add(corda);

  // fita vermelha com nó dourado no meio da corda
  const fita = new THREE.Group();
  fio.add(fita);
  const no = malha(new THREE.SphereGeometry(.13, 24, 16), material('#ffcc33', { metal: .55, rugosidade: .25, verniz: .8, emissivo: '#ff9d00', intensidadeEmissiva: .25 }));
  no.scale.set(1.2, 1, 1.2);
  fita.add(no);
  const forma = new THREE.Shape();
  forma.moveTo(-.09, 0); forma.lineTo(.09, 0); forma.lineTo(.1, -.62); forma.lineTo(0, -.5); forma.lineTo(-.1, -.62); forma.closePath();
  const pano = material('#ff2d46', { rugosidade: .7, lados: THREE.DoubleSide, brilho: .4 });
  const tiras2 = [-1, 1].map((l) => {
    const t = malha(new THREE.ShapeGeometry(forma), pano);
    t.position.set(l * .05, -.05, .04 * l);
    t.rotation.y = l * .5;
    fita.add(t);
    return t;
  });

  const matTimes = TIMES.map(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, emissive: '#ffbf2e', emissiveIntensity: 0 }));
  const membros = [];
  TIMES.forEach((tm, i) => {
    const s = i ? -1 : 1;                  // direção do meio (para onde o time olha)
    for (let k = 0; k < POR_TIME; k++) {
      const b = bonecoUnico({ pele: PELES[(k * 2 + i * 3) % PELES.length], camisa: tm.cor, calca: '#252a40',
        cabelo: CABELOS[(k + i * 3) % CABELOS.length], faixa: '#ffffff', sapato: '#f4f4f4', semente: k * 3 + i + 2, cabecao: 1.2 }, matTimes[i]);
      const base = new THREE.Group();
      base.rotation.order = 'YXZ';
      base.add(b.malha);
      mundoCorda.add(base);
      const yaw = s * (Math.PI / 2 - GIRO);
      base.position.set(-s * (PRIMEIRO + k * ESPACO), 0, FILA_Z);
      base.rotation.y = yaw;
      membros.push({ ...b, base, time: i, k, s, yaw, x0: base.position.x, fase: k * 1.9 + i * .7, piscar: 1 + Math.random() * 3,
        queda: 0, comemora: 0 });
    }
  });

  // sombra de contato (mancha macia) sob cada boneco: dá peso no chão mesmo na qualidade baixa, que não tem mapa de sombra
  const manchaTex = texturaCanvas(128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(.55, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  }).textura;
  const manchaG = new THREE.PlaneGeometry(1, 1);
  manchaG.rotateX(-Math.PI / 2);
  const manchas = new THREE.InstancedMesh(manchaG, new THREE.MeshBasicMaterial({ map: manchaTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), membros.length);
  manchas.position.y = .012;
  manchas.frustumCulled = false;
  mundoCorda.add(manchas);
  const mM = new THREE.Matrix4(), qM = new THREE.Quaternion(), pM = new THREE.Vector3(), sM = new THREE.Vector3();

  // brilho dourado da força x2: disco no chão e coluna de luz em volta do time
  const discoTex = texturaCanvas(256, 256, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.55, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  }).textura;
  const auras = [0, 1].map((i) => {
    const s = i ? -1 : 1;
    const grupo = new THREE.Group();
    grupo.position.set(-s * (PRIMEIRO + 1.5 * ESPACO), 0, FILA_Z);
    const disco = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.6), new THREE.MeshBasicMaterial({ color: '#ffc21f', map: discoTex,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    disco.rotation.x = -Math.PI / 2;
    disco.position.y = .02;
    const coluna = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.3, 3.4, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd23f',
      map: subida, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide }));
    coluna.scale.z = .45;
    coluna.position.y = 1.7;
    grupo.add(disco, coluna);
    grupo.visible = false;
    mundoCorda.add(grupo);
    return { grupo, disco, coluna, faisca: 0 };
  });

  // onda de choque no chão (puxão forte)
  const onda = new THREE.Mesh(new THREE.RingGeometry(.82, 1, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide }));
  onda.rotation.x = -Math.PI / 2;
  onda.position.y = .03;
  cena.add(onda);

  /* ---------- torcida ---------- */
  let animarTorcida = () => {};
  if (arena) animarTorcida = arquibancada();

  /* ---------- estado da cena ---------- */
  const est = { mAntes: 0, quedaCorda: 0, punch: 0, ondaT: 1, antes: performance.now() };
  const cam = { x: 0, y: CAMERA.pos[1], z: CAMERA.pos[2], ay: CAMERA.alvo[1] };
  const v = new THREE.Vector3(), alvoMao = new THREE.Vector3();

  function quadro(dt, t, { m, tensao, torcida, dobro, vencedor }) {
    // fim de rodada e câmera seguem o relógio de verdade: a faixa de vencedor dura 5 s mesmo num PC lento
    const agora = performance.now(), real = Math.min(.25, (agora - est.antes) / 1000);
    est.antes = agora;
    est.quedaCorda += ((vencedor !== -1 ? 1 : 0) - est.quedaCorda) * (1 - Math.exp(-real * 7));
    const meio = m * LINHA;
    const vel = (m - est.mAntes) / Math.max(dt, 1e-3);
    est.mAntes = m;
    mundoCorda.position.x = meio;

    // corda: treme com a tensão; no fim da rodada cai no chão
    const tens = tensao[0] + tensao[1];
    fio.position.y = CORDA_Y - est.quedaCorda * (CORDA_Y - .06) + Math.sin(t * 47) * tens * .008;
    fita.rotation.z = Math.sin(t * 5) * .12 - vel * .05;
    fita.rotation.x = Math.sin(t * 3.3) * .1;
    tiras2.forEach((ti, l) => { ti.rotation.x = Math.sin(t * 6 + l) * .12; });

    // linhas e áreas dos times acendem quando a fita chega perto
    zonas.forEach((z, i) => {
      const perto = THREE.MathUtils.clamp(i ? m : -m, 0, 1);
      const pulso = perto > .65 ? (Math.sin(t * 12) + 1) / 2 : 0;
      z.area.material.opacity = .1 + perto * .16 + pulso * .08;
      z.parede.material.opacity = .06 + perto * .22 + pulso * .12;
      z.linha.material.emissiveIntensity = .5 + perto * 1.2 + pulso * .6;
    });

    // força x2
    auras.forEach((a, i) => {
      a.grupo.visible = dobro[i];
      matTimes[i].emissiveIntensity = dobro[i] ? .05 + (Math.sin(t * 8) + 1) * .035 : 0;
      if (!dobro[i]) return;
      const p = .75 + Math.sin(t * 8) * .25;
      a.disco.material.opacity = .4 * p;
      a.coluna.material.opacity = .1 * p;
      a.coluna.rotation.y += dt * .8;
      a.faisca -= dt;
      if (a.faisca <= 0) {
        a.faisca = .12;
        a.grupo.getWorldPosition(v);
        part.explodir([v.x + (Math.random() - .5) * 3.6, .2, v.z + (Math.random() - .5) * 1.2], { cores: ['#ffe066', '#fff6c0', '#ffb800'],
          qtd: 2, forca: .5, tamanho: .07, vida: 1.1, gravidade: 2.4, subida: 1.6 });
      }
    });

    membros.forEach((mb, k) => {
      animarMembro(mb, real, t, tensao[mb.time], vel, vencedor);
      // mancha acompanha o corpo: um pouco atrás quando puxa, esticada para a frente quando cai
      const q = mb.queda;
      pM.set(mb.base.position.x - mb.s * (.12 - q * .6), 0, FILA_Z + .05);
      manchas.setMatrixAt(k, mM.compose(pM, qM, sM.set(1.05 + q * .9, 1, .62 + q * .1)));
    });
    manchas.instanceMatrix.needsUpdate = true;

    animarTorcida(t, torcida, vencedor);

    // onda de choque
    onda.visible = est.ondaT < 1;
    if (est.ondaT < 1) {
      est.ondaT = Math.min(1, est.ondaT + dt * 1.6);
      onda.scale.setScalar(.3 + curvas.saida(est.ondaT) * 6);
      onda.material.opacity = (1 - est.ondaT) * .9;
    }

    // câmera: acompanha boa parte do caminho da fita; no fim vai até o time vencedor
    est.punch = Math.max(0, est.punch - real * 2.8);
    const soco = curvas.saida(Math.min(1, est.punch));
    // perto do meio a câmera chega mais perto; com a fita perto de uma linha ela abre para caber o time todo
    const zoom = .88 + .12 * Math.min(1, Math.abs(m));
    let alvoX = meio * SEGUE, alvoY = CAMERA.alvo[1];
    let posY = alvoY + (CAMERA.pos[1] - alvoY) * zoom, posZ = CAMERA.pos[2] * zoom - soco * 1.1;
    if (vencedor !== -1) {
      alvoX = meio + (vencedor ? 1 : -1) * 2.2;
      posY = 5.6; posZ = 12.8; alvoY = 1.5;
    }
    const k = 1 - Math.exp(-real * (vencedor !== -1 ? 2.2 : 3.5));
    cam.x += (alvoX - cam.x) * k;
    cam.y += (posY - cam.y) * k;
    cam.z += (posZ - cam.z) * k;
    cam.ay += (alvoY - cam.ay) * k;
    camera.position.set(cam.x + Math.sin(t * .4) * .25, cam.y + Math.sin(t * .55) * .08, cam.z);
    c3d.mirar(cam.x, cam.ay, 0);
  }

  /* ---------- bonecos ---------- */
  function animarMembro(mb, real, t, tensao, vel, vencedor) {
    const { J, base } = mb;
    const ganhou = vencedor === mb.time, perdeu = vencedor !== -1 && !ganhou;
    const e = .3 + tensao * .7;

    // queda de quem perdeu e giro para a câmera de quem ganhou
    mb.queda += ((perdeu ? 1 : 0) - mb.queda) * (1 - Math.exp(-real * (perdeu ? 5 - mb.k * .6 : 6)));
    mb.comemora += ((ganhou ? 1 : 0) - mb.comemora) * (1 - Math.exp(-real * 5));
    base.rotation.y = mb.yaw * (1 - mb.comemora);
    base.rotation.x = curvas.entrada(Math.min(1, mb.queda * 1.15)) * 1.42;
    base.position.y = mb.queda * .2;
    base.position.x = mb.x0 + mb.s * mb.queda * .55;

    // piscar
    mb.piscar -= real;
    if (mb.piscar < -.12) mb.piscar = 2 + Math.random() * 3;
    const olho = mb.piscar < 0 ? .1 : 1;

    if (ganhou) {
      J.tronco.rotation.set(0, 0, 0); J.pescoco.rotation.set(0, 0, 0); J.cabeca.rotation.set(-.15, 0, 0);
      poses.comemorar(mb.fake, t + mb.fase);
      J.boca.scale.set(1.35, 1.7, 1);
      J.olhoE.scale.y = J.olhoD.scale.y = olho;
      return;
    }
    if (perdeu) {
      poses.parado(mb.fake, t);
      J.ombroE.rotation.set(-2.7, 0, .25); J.ombroD.rotation.set(-2.7, 0, -.25);
      J.pescoco.rotation.set(-.3, 0, 0); J.cabeca.rotation.set(-.3, 0, 0);
      J.boca.scale.set(1, .5, 1);
      J.olhoE.scale.y = J.olhoD.scale.y = .15;
      return;
    }

    // puxando: pés arrastam quando a corda anda (para trás se o time ganha terreno, para a frente se perde)
    const anda = THREE.MathUtils.clamp(Math.abs(vel) * .5, 0, 1);
    const passo = Math.sin(t * 15 + mb.fase) * .3 * Math.max(anda, tensao * .35);
    const fA = -(.35 + .42 * e) + passo, jA = .12 + .05 * e;
    const fB = .14 + .26 * e - passo, jB = .3 + .35 * e;
    J.coxaE.rotation.set(fA, 0, .05); J.joelhoE.rotation.set(jA, 0, 0);
    J.coxaD.rotation.set(fB, 0, -.05); J.joelhoD.rotation.set(jB, 0, 0);
    const alt = (a, b) => .4 * Math.cos(a) + .465 * Math.cos(a + b);
    J.quadril.position.y = .04 + Math.max(alt(fA, jA), alt(fB, jB));
    J.tronco.rotation.set(-(.22 + .5 * e) + Math.sin(t * 31 + mb.fase) * .02 * tensao, 0, 0);
    J.pescoco.rotation.set(.1 + .2 * e, 0, 0);
    J.cabeca.rotation.set(.08 + .16 * e, 0, Math.sin(t * 2 + mb.fase) * .05);
    J.boca.scale.set(1 + .25 * e, e > .55 ? .3 : 1, 1);
    J.olhoE.scale.y = J.olhoD.scale.y = Math.min(olho, e > .55 ? .4 : 1);

    // braços: as duas mãos agarram a corda (cinemática inversa simples)
    base.updateMatrixWorld(true);
    const perto = mb.time ? 'E' : 'D', longe = mb.time ? 'D' : 'E';
    const cy = fio.position.y;
    for (const [lado, alcance, recuo] of [[perto, .55, 0], [longe, .58, .2]]) {
      J['ombro' + lado].getWorldPosition(v);
      const dy = v.y - cy, dz = v.z;
      const dx = Math.sqrt(Math.max(0, alcance * alcance - dy * dy - dz * dz));
      alvoMao.set(v.x + mb.s * Math.max(.05, dx - recuo), cy, 0);
      alcancar(J, lado, alvoMao);
    }
  }

  /* ---------- efeitos ---------- */
  function poeira(i, qtd = 6) {
    for (const mb of membros) {
      if (mb.time !== i) continue;
      mb.base.getWorldPosition(v);
      part.explodir([v.x, .05, v.z + .1], { cores: ['#c9a66b', '#a8875a', '#e2cb9b'], qtd, forca: 1.4, tamanho: .07, vida: .55, gravidade: -7, subida: 1.3 });
    }
  }

  function noMeio() { fita.getWorldPosition(v); return v.clone(); }

  const api = {
    c3d, quadro,
    // puxada normal: poeira nos pés; forte (≥ 30): explosão na fita, onda no chão, tremida e câmera chegando perto
    puxou(i, f) {
      poeira(i, Math.min(8, 2 + Math.ceil(f / 4)));
      if (f < 30) return;
      const p = noMeio();
      part.explodir(p, { cores: [TIMES[i].cor, '#ffd23f', '#ffffff'], qtd: 50, forca: 7, tamanho: .12 });
      onda.material.color.set(TIMES[i].cor);
      onda.position.set(p.x, .03, 0);
      est.ondaT = 0;
      est.punch = Math.max(est.punch, .7);
      c3d.tremer(Math.min(.5, .15 + f / 300), .45);
    },
    superpuxao(i) {
      const p = noMeio();
      part.explodir(p, { cores: [TIMES[i].cor, '#ffd23f', '#ffffff', '#7c5cff'], qtd: 90, forca: 10, tamanho: .14, vida: 1.4 });
      est.punch = 1.2;
      c3d.tremer(.7, .8);
    },
    dobro(i) {
      const a = auras[i].grupo;
      a.visible = true;
      a.getWorldPosition(v);
      part.explodir([v.x, 1.2, v.z], { cores: ['#ffe066', '#ffffff', '#ffb800'], qtd: 60, forca: 5, tamanho: .1, vida: 1.2 });
      onda.material.color.set('#ffd23f');
      onda.position.set(v.x, .03, v.z);
      est.ondaT = 0;
      c3d.tremer(.15, .3);
    },
    vitoria(i) {
      poeira(1 - i, 10);
      const meio = mundoCorda.position.x;
      part.confete({ area: [meio - 8, meio + 8], altura: 8, z: [-3, 6], qtd: 240, cores: [TIMES[i].cor, '#ffd23f', '#ffffff'] });
      c3d.tremer(.4, .6);
    },
    reiniciar() { est.punch = 0; },
    // posição no palco (px) acima do meio do time i, para os textos flutuantes em HTML
    acima(i, altura = 2.4) {
      const s = i ? -1 : 1;
      v.set(mundoCorda.position.x - s * (PRIMEIRO + 1.5 * ESPACO), altura, FILA_Z);
      return c3d.projetar(v);
    },
    // ponto no gramado junto da linha de vitória do time i (placa "faltam N")
    linha(i, z = 1.25) { v.set((i ? 1 : -1) * LINHA, 0, z); return c3d.projetar(v); },
    fita() { return c3d.projetar(noMeio()); }
  };
  return api;

  /* ---------- estádio ---------- */
  function estadio() {
    // placas de LED na mureta: nome dos times nas cores deles
    const placas = texturaCanvas(2048, 128, (ctx, w, h) => {
      const blocos = [TIMES[0], null, TIMES[1], null];
      for (let b = 0; b < 4; b++) {
        const tm = blocos[b], x = b * w / 4;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, tm ? tm.cor : '#2b1c63'); g.addColorStop(1, tm ? '#1a1030' : '#120a33');
        ctx.fillStyle = g; ctx.fillRect(x, 0, w / 4, h);
        textoJogo(ctx, tm ? tm.nome.toUpperCase() : (cfg.titulo ?? 'CABO DE GUERRA'), x + w / 8, h / 2 + 2,
          { tamanho: 64, cor: tm ? '#ffffff' : '#ffd23f', larguraMax: w / 4 - 40, sombra: false });
      }
    }, { repetir: [3, 1] });
    const mureta = malha(new THREE.BoxGeometry(46, 1.15, .3), material('#1d1440', { rugosidade: .6 }), { sombra: false });
    mureta.position.set(0, .575, -5.35);
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(46, .95), new THREE.MeshStandardMaterial({ map: placas.textura,
      emissiveMap: placas.textura, emissive: '#ffffff', emissiveIntensity: .9, roughness: .35 }));
    tela.position.set(0, .6, -5.19);
    cena.add(mureta, tela);

    // parede do fundo, cobertura com luzes e colunas
    const fundo = malha(new THREE.BoxGeometry(40, 6, .6), material('#2a2050', { rugosidade: .9 }), { sombra: false });
    fundo.position.set(0, 5.6, -12.5);
    const teto = malha(new THREE.BoxGeometry(40, .3, 6.5), material('#3a3266', { rugosidade: .7, metal: .2 }), { sombra: false });
    teto.position.set(0, 8.7, -10.4);
    teto.rotation.x = .1;
    const lampadas = [];
    for (let x = -18; x <= 18; x += 3) { const g = new THREE.BoxGeometry(1.6, .08, .25); g.translate(x, 8.45, -7.6); lampadas.push(g); }
    const luzesTeto = new THREE.Mesh(mergeGeometries(lampadas), new THREE.MeshBasicMaterial({ color: '#fff3d0' }));
    luzesTeto.rotation.x = .1;
    const pilares = [];
    for (const x of [-13, -6.5, 6.5, 13]) { const g = new THREE.CylinderGeometry(.16, .2, 8.8, 10); g.translate(x, 4.4, -12); pilares.push(g); }
    const colunas = malha(mergeGeometries(pilares), material('#8d8fa3', { metal: .6, rugosidade: .35 }), { sombra: false });
    cena.add(fundo, teto, luzesTeto, colunas);

    // torres de refletores nos cantos, com feixe de luz no gramado
    const painel = texturaCanvas(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#2a2a35'; ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) {
        const g = ctx.createRadialGradient(22 + x * 42, 22 + y * 42, 2, 22 + x * 42, 22 + y * 42, 19);
        g.addColorStop(0, '#ffffff'); g.addColorStop(.6, '#fff1c4'); g.addColorStop(1, '#8a7a50');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(22 + x * 42, 22 + y * 42, 18, 0, 7); ctx.fill();
      }
    }).textura;
    const metal = material('#6f7184', { metal: .7, rugosidade: .4 });
    for (const l of [-1, 1]) {
      const poste = malha(new THREE.CylinderGeometry(.22, .34, 15, 12), metal, { sombra: false });
      poste.position.set(l * 11.5, 7.5, -16.5);
      const caixaLuz = malha(caixa(3.4, 1.8, .4, .08), metal, { sombra: false });
      caixaLuz.position.set(l * 11.5, 15.2, -16.2);
      caixaLuz.rotation.set(.35, -l * .45, 0);
      const brilho = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.55), new THREE.MeshBasicMaterial({ map: painel }));
      brilho.position.set(0, 0, .21);
      caixaLuz.add(brilho);
      cena.add(poste, caixaLuz);
    }
  }

  // arquibancada: torcida instanciada com camisas dos times, cabelos e braços que sobem quando o time puxa
  function arquibancada() {
    const POR = 30, FIL = 6;
    const NEUTRAS = ['#ffd23f', '#ffffff', '#7c5cff', '#ff8a1f', '#2a2a3a'];
    const tor = criarTorcida(c3d, { fileiras: FIL, porFileira: POR, origem: [-10.45, .95, -6.4], passoX: .72, passoZ: -.98, subida: .55,
      arquibancada: '#4b4766', cores: (k, i) => Math.random() < .2 ? NEUTRAS[k % NEUTRAS.length] : TIMES[i < POR / 2 ? 0 : 1].cor });
    const n = tor.pessoas.length;
    // geometrias mais leves que as do kit (de longe ninguém vê a diferença e o PC fraco agradece)
    tor.corpos.geometry.dispose();
    tor.corpos.geometry = new THREE.CapsuleGeometry(.22, .32, 2, 8);
    tor.cabecas.geometry.dispose();
    tor.cabecas.geometry = new THREE.SphereGeometry(.18, 9, 6);
    const cabeloG = new THREE.SphereGeometry(.19, 9, 3, 0, Math.PI * 2, 0, Math.PI * .45);
    const cabelos = new THREE.InstancedMesh(cabeloG, material('#ffffff', { rugosidade: .5 }), n);
    const bracoG = new THREE.CapsuleGeometry(.055, .3, 1, 5);
    bracoG.translate(0, -.19, 0);
    const bracos = new THREE.InstancedMesh(bracoG, material('#ffffff', { rugosidade: .8 }), n * 2);
    const cor = new THREE.Color();
    tor.pessoas.forEach((b, k) => {
      b.limiar = Math.random();
      b.time = b.lado === 'A' ? 0 : 1;
      cabelos.setColorAt(k, cor.set(CABELOS[Math.floor(Math.random() * CABELOS.length)]));
      tor.corpos.getColorAt(k, cor);
      bracos.setColorAt(k * 2, cor);
      bracos.setColorAt(k * 2 + 1, cor);
    });
    for (const im of [cabelos, bracos]) { im.castShadow = false; im.receiveShadow = true; cena.add(im); }
    // torcida um pouco mais escura que os bonecos (fica na sombra da cobertura e não briga com o placar)
    for (const im of [tor.corpos, bracos]) im.material.color.set('#b9b2c9');
    tor.cabecas.material.color.set('#d8cfd0');
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qb = new THREE.Quaternion(), um = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const eixoZ = new THREE.Vector3(0, 0, 1);
    return (t, energia, vencedor) => {
      for (let k = 0; k < n; k++) {
        const b = tor.pessoas[k];
        const e = vencedor === b.time ? 1 : .12 + energia[b.time] * .88;
        const y = b.y + .25 + Math.max(0, Math.sin(t * b.ritmo + b.fase)) * .3 * e;
        tor.corpos.setMatrixAt(k, m4.compose(p.set(b.x, y, b.z), q, um));
        tor.cabecas.setMatrixAt(k, m4.compose(p.set(b.x, y + .42, b.z), q, um));
        cabelos.setMatrixAt(k, m4.compose(p.set(b.x, y + .46, b.z - .015), q, um));
        const ergue = e > b.limiar + .15 ? 1 : 0;
        const ang = .12 + ergue * (2.35 + Math.sin(t * b.ritmo * 1.4 + b.fase) * .35);
        bracos.setMatrixAt(k * 2, m4.compose(p.set(b.x - .2, y + .28, b.z + .02), qb.setFromAxisAngle(eixoZ, -ang), um));
        bracos.setMatrixAt(k * 2 + 1, m4.compose(p.set(b.x + .2, y + .28, b.z + .02), qb.setFromAxisAngle(eixoZ, ang), um));
      }
      tor.corpos.instanceMatrix.needsUpdate = tor.cabecas.instanceMatrix.needsUpdate = true;
      cabelos.instanceMatrix.needsUpdate = bracos.instanceMatrix.needsUpdate = true;
    };
  }
}

// Listras de grama cortada (claras e escuras) desenhadas por cima da textura do gramado.
function listrar(textura) {
  const cv = textura.image, ctx = cv.getContext('2d');
  for (let k = 0; k < 2; k++) {
    ctx.fillStyle = k ? 'rgba(0,35,0,.13)' : 'rgba(255,255,210,.07)';
    ctx.fillRect(k * cv.width / 2, 0, cv.width / 2, cv.height);
  }
  textura.needsUpdate = true;
}

/* ---------- boneco em uma malha só ---------- */

// Junta o boneco do kit (≈30 malhas) num SkinnedMesh único com a cor de cada peça nos vértices:
// 1 draw call por boneco em vez de 30. As juntas viram ossos com os mesmos nomes, então as poses do kit
// continuam valendo. Ossos extras: boca e olhos (escala para careta de força e piscar).
function bonecoUnico(opcoes, mat) {
  const modelo = boneco(opcoes);
  modelo.updateMatrixWorld(true);
  const juntas = modelo.userData.juntas;
  const nomeDe = new Map(Object.entries(juntas).filter(([, o]) => !o.isMesh).map(([k, o]) => [o, k]));
  const raiz = new THREE.Bone();
  const ossoDe = new Map([[modelo, raiz]]);
  const J = {};
  modelo.traverse((o) => {
    if (o === modelo || o.isMesh) return;
    const osso = new THREE.Bone();
    osso.position.copy(o.position);
    osso.quaternion.copy(o.quaternion);
    osso.scale.copy(o.scale);
    ossoDe.get(o.parent).add(osso);
    ossoDe.set(o, osso);
    if (nomeDe.has(o)) J[nomeDe.get(o)] = osso;
  });
  const extra = (nome, x, y, z) => { const o = new THREE.Bone(); o.position.set(x, y, z); J.cabeca.add(o); J[nome] = o; return o; };
  extra('boca', 0, .09, .185);
  extra('olhoE', .075, .2, .18);
  extra('olhoD', -.075, .2, .18);

  const ossos = [];
  raiz.traverse((o) => ossos.push(o));
  const indice = new Map(ossos.map((o, k) => [o, k]));
  const partes = [];
  const descartaveis = new Set();
  modelo.traverse((o) => {
    if (!o.isMesh) return;
    let osso = ossoDe.get(o.parent);
    const c = o.material.color;
    if (o === juntas.boca) osso = J.boca;
    else if (o.parent === juntas.cabeca && (c.getHex() === 0xffffff || c.getHex() === 0x151018) && o.position.y < .23) osso = o.position.x > 0 ? J.olhoE : J.olhoD;
    let g = maisLeve(o.geometry);
    if (g.index) g = g.toNonIndexed();
    for (const nome of Object.keys(g.attributes)) if (nome !== 'position' && nome !== 'normal') g.deleteAttribute(nome);
    g.applyMatrix4(o.matrixWorld);
    const n = g.attributes.position.count;
    const cores = new Float32Array(n * 3), idx = new Uint16Array(n * 4), pesos = new Float32Array(n * 4);
    for (let k = 0; k < n; k++) {
      cores[k * 3] = c.r; cores[k * 3 + 1] = c.g; cores[k * 3 + 2] = c.b;
      idx[k * 4] = indice.get(osso);
      pesos[k * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(pesos, 4));
    partes.push(g);
    if (!o.geometry.userData.compartilhada) descartaveis.add(o.geometry);
    descartaveis.add(o.material);
  });
  const juntas3 = mergeGeometries(partes);
  const geo = mergeVertices(juntas3);
  juntas3.dispose();
  partes.forEach((g) => g.dispose());
  descartaveis.forEach((d) => { d.map?.dispose(); d.dispose(); });

  const corpo = new THREE.SkinnedMesh(geo, mat);
  corpo.castShadow = true;
  corpo.receiveShadow = true;
  corpo.frustumCulled = false;
  corpo.add(raiz);
  corpo.updateMatrixWorld(true);
  corpo.bind(new THREE.Skeleton(ossos));
  return { malha: corpo, J, fake: { userData: { juntas: J } } };
}

// Mesma peça do kit com menos segmentos: o boneco ocupa ~250 px na tela, não precisa de esfera 32×24.
function maisLeve(g) {
  const p = g.parameters;
  switch (g.type) {
    case 'SphereGeometry': {
      const grande = p.radius > .15;
      return new THREE.SphereGeometry(p.radius, Math.min(p.widthSegments, grande ? 18 : 10), Math.min(p.heightSegments, grande ? 12 : 7),
        p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
    }
    case 'CapsuleGeometry':
      return new THREE.CapsuleGeometry(p.radius, p.height ?? p.length, Math.min(p.capSegments, 3), Math.min(p.radialSegments, 10), p.heightSegments ?? 1);
    case 'TorusGeometry':
      return new THREE.TorusGeometry(p.radius, p.tube, Math.min(p.radialSegments, 6), Math.min(p.tubularSegments, 18), p.arc);
    case 'CylinderGeometry':
      return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, Math.min(p.radialSegments, 10), p.heightSegments, p.openEnded, p.thetaStart, p.thetaLength);
    default:
      return g.clone();
  }
}

// Dobra ombro e cotovelo para a mão chegar ao ponto do mundo (cinemática inversa de dois ossos).
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _m = new THREE.Matrix4(), _n = new THREE.Matrix4();
const EIXO_X = new THREE.Vector3(1, 0, 0);
function alcancar(J, lado, alvo) {
  const ombro = J['ombro' + lado], cotovelo = J['cotovelo' + lado];
  const vet = J.tronco.worldToLocal(_a.copy(alvo)).sub(ombro.position);
  const D = THREE.MathUtils.clamp(vet.length(), .12, L1 + L2 - .004);
  const gama = Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
  cotovelo.rotation.set(gama - Math.PI, 0, 0);
  const alfa = Math.acos(THREE.MathUtils.clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
  // braço em repouso: e1 = direção ombro→mão, eixo x = dobra do cotovelo; queremos e1 apontando para o alvo
  const e1 = _b.set(0, -Math.cos(alfa), Math.sin(alfa));
  _m.makeBasis(e1, EIXO_X, _c.crossVectors(e1, EIXO_X));
  const f1 = vet.normalize();
  const f2 = Math.abs(f1.x) > .97 ? _d.set(0, 0, 1) : _d.copy(EIXO_X);
  f2.addScaledVector(f1, -f2.dot(f1)).normalize();
  _n.makeBasis(f1, f2, _e.crossVectors(f1, f2)).multiply(_m.transpose());
  ombro.quaternion.setFromRotationMatrix(_n);
}
