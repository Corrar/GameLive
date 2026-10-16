// Cena 3D da Urna da Live: sala com mesa de madeira, a urna eletrônica e a mão que digita o voto.
// Unidade ≈ 10 cm (a urna tem 4,4 × 2,8, como a de verdade).
import { THREE, criarCena, material, pele, caixa, malha, texturaCanvas, texturaMaterial, holofote,
  criarParticulas, curvas } from '../kit/cena3d.js';
import { tocar } from '../kit/efeitos.js';

const TECLAS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], [null, '0', null]];

export function criarUrna3d(palco, cfg) {
  const lados = cfg.lados;
  const transparente = cfg.fundo === 'transparente';
  const c3d = criarCena(palco, {
    cfg, luz: 'estudio', fundo: transparente ? null : '#b85a1c', exposicao: .92,
    camera: { pos: [0, 11.86, 13.52], alvo: [0, 1.76, -.9], fov: 30 },
    sol: { pos: [-5, 14, 9], alcance: 8 }
  });
  const { cena } = c3d;
  c3d.sol.shadow.radius = 6;
  const particulas = criarParticulas(c3d, { max: 400 });

  /* ---------- sala ---------- */
  if (!transparente) {
    const parede = texturaMaterial('parede', { cor: '#d9762f', repetir: [3, 2] });
    const fundo = malha(new THREE.PlaneGeometry(60, 34), material('#ffffff', { mapa: parede.mapa, relevo: parede.relevo, escalaRelevo: .02, rugosidade: .95 }), { sombra: false });
    fundo.position.set(0, 8, -9);
    cena.add(fundo);
    // luz quente de abajur na parede, atrás da urna
    const abajur = new THREE.PointLight('#ffb35c', 60, 30, 1.6);
    abajur.position.set(0, 6, -6);
    cena.add(abajur);
    holofote(c3d, { pos: [-9, 16, 4], alvo: [0, 0, 0], cor: '#fff0d8', intensidade: 120, angulo: .32, cone: false });
  }
  if (transparente) {
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.ShadowMaterial({ opacity: .35 }));
    sombra.rotation.x = -Math.PI / 2;
    sombra.receiveShadow = true;
    cena.add(sombra);
  } else {
    const madeira = texturaMaterial('madeira', { cor: '#b06a2c', repetir: [2, 1.4] });
    const mesa = malha(caixa(40, .6, 18, .1), material('#ffffff', { mapa: madeira.mapa, relevo: madeira.relevo, escalaRelevo: .03, rugosidade: .42, verniz: .35 }));
    mesa.position.set(0, -.3, 2);
    mesa.receiveShadow = true;
    mesa.castShadow = false;
    cena.add(mesa);
  }

  /* ---------- urna ---------- */
  const urna = new THREE.Group();
  cena.add(urna);
  const plastico = material('#d9d2bf', { rugosidade: .5, verniz: .25 });
  const plasticoEscuro = material('#c9c3b2', { rugosidade: .6 });

  // corpo em cunha: mais alto atrás, inclinado para quem vota (perfil extrudado com chanfro)
  const ALT_TRAS = 1.12, ALT_FRENTE = .62, PROF = 2.8, LARG = 4.4;
  const perfil = new THREE.Shape();
  perfil.moveTo(-PROF / 2, 0);
  perfil.lineTo(PROF / 2, 0);
  perfil.lineTo(PROF / 2, ALT_FRENTE);
  perfil.lineTo(-PROF / 2, ALT_TRAS);
  perfil.closePath();
  const geoCorpo = new THREE.ExtrudeGeometry(perfil, { depth: LARG - .2, bevelEnabled: true, bevelThickness: .1, bevelSize: .09, bevelSegments: 4, curveSegments: 4 });
  geoCorpo.rotateY(-Math.PI / 2);
  geoCorpo.translate((LARG - .2) / 2, 0, 0);
  const corpo = malha(geoCorpo, plastico);
  urna.add(corpo);
  // frisos na frente (como a régua frontal da urna) e pés de borracha
  const friso = malha(new THREE.BoxGeometry(.05, .26, .04), plasticoEscuro, { sombra: false });
  const frisos = new THREE.InstancedMesh(friso.geometry, plasticoEscuro, 15);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 15; i++) frisos.setMatrixAt(i, mtx.makeTranslation(-2 + i * 4 / 14, .2, PROF / 2 + .1));
  frisos.receiveShadow = true;
  urna.add(frisos);
  const borracha = material('#2b2b2b', { rugosidade: .9 });
  for (const [x, z] of [[-1.9, -1.1], [1.9, -1.1], [-1.9, 1.1], [1.9, 1.1]]) {
    const pe = malha(new THREE.CylinderGeometry(.14, .16, .08, 16), borracha);
    pe.position.set(x, -.04, z);
    urna.add(pe);
  }
  urna.position.y = .08;
  // cabo saindo por trás até fora da mesa
  const cabo = new THREE.CatmullRomCurve3([new THREE.Vector3(1.6, .45, -1.5), new THREE.Vector3(1.9, .08, -2.6), new THREE.Vector3(3.5, .06, -4.2), new THREE.Vector3(7, .06, -5)]);
  urna.add(malha(new THREE.TubeGeometry(cabo, 40, .06, 10), material('#3a3a3a', { rugosidade: .5, verniz: .3 })));

  // tampo inclinado: tudo que fica em cima (tela, teclado) mora neste grupo
  const inclinacao = Math.atan((ALT_TRAS - ALT_FRENTE) / PROF);
  const tampo = new THREE.Group();
  tampo.position.set(0, (ALT_TRAS + ALT_FRENTE) / 2 + .1, 0);
  tampo.rotation.x = inclinacao;
  urna.add(tampo);

  // tela LCD com moldura
  const moldura = malha(caixa(2.3, .08, 1.7, .05), material('#8f9189', { rugosidade: .55 }));
  moldura.position.set(-.95, .01, -.02);
  tampo.add(moldura);
  const TELA_W = 1024, TELA_H = 740;
  const tela = texturaCanvas(TELA_W, TELA_H, () => {});
  const vidro = new THREE.Mesh(new THREE.PlaneGeometry(2.08, 1.5), new THREE.MeshPhysicalMaterial({
    map: tela.textura, emissiveMap: tela.textura, emissive: '#ffffff', emissiveIntensity: .22,
    roughness: .18, clearcoat: 1, clearcoatRoughness: .05
  }));
  vidro.rotation.x = -Math.PI / 2;
  vidro.position.set(-.95, .056, -.02);
  vidro.receiveShadow = true;
  tampo.add(vidro);

  // teclado: painel preto, placa da marca, 10 teclas e os 3 botões
  const painel = malha(caixa(1.62, .06, 1.92, .05), material('#202022', { rugosidade: .45, verniz: .2 }));
  painel.position.set(1.33, .01, .05);
  tampo.add(painel);
  const placa = texturaCanvas(512, 96, (ctx, w, h) => {
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b2b2b'; ctx.font = '800 54px "Baloo 2", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(cfg.marca ?? 'GAMELIVE', w / 2, h / 2 + 4, w - 30);
  });
  const marca = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .26), material('#ffffff', { mapa: placa.textura, rugosidade: .5 }));
  marca.rotation.x = -Math.PI / 2;
  marca.position.set(1.33, .047, -.74);
  tampo.add(marca);

  const teclas = new Map();
  const corTecla = material('#2a2a2d', { rugosidade: .38, verniz: .4 });
  function rotuloTecla(texto, { cor = '#ffffff', fonte = 82, largura = 128, altura = 96 } = {}) {
    const t = texturaCanvas(largura, altura, (ctx, w, h) => {
      ctx.fillStyle = cor; ctx.font = `800 ${fonte}px "Baloo 2", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(texto, w / 2, h / 2 + fonte * .06, w - 8);
    });
    return new THREE.MeshBasicMaterial({ map: t.textura, transparent: true, depthWrite: false });
  }
  const geoTecla = caixa(.36, .11, .26, .045);
  TECLAS.forEach((linha, l) => linha.forEach((d, c) => {
    if (d === null) return;
    const k = malha(geoTecla, corTecla);
    k.position.set(.9 + c * .43, .1, -.47 + l * .3);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(.26, .2), rotuloTecla(d));
    r.rotation.x = -Math.PI / 2;
    r.position.y = .058;
    k.add(r);
    k.userData.base = k.position.y;
    tampo.add(k);
    teclas.set(d, k);
  }));
  const BOTOES = [['BRANCO', '#f3f2ec', '#1b1b1b'], ['CORRIGE', '#f08a24', '#1b1b1b'], ['CONFIRMA', '#2fb24c', '#0f2a15']];
  BOTOES.forEach(([nome, cor, corTexto], i) => {
    const b = malha(caixa(.46, .12, .32, .05), material(cor, { rugosidade: .4, verniz: .4 }));
    b.position.set(.9 + i * .43, .1, .74);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(.42, .14), rotuloTecla(nome, { cor: corTexto, fonte: 40, largura: 256, altura: 80 }));
    r.rotation.x = -Math.PI / 2;
    r.position.y = .063;
    b.add(r);
    b.userData.base = b.position.y;
    tampo.add(b);
    teclas.set(nome, b);
  });

  /* ---------- tela da urna (desenho 2D) ---------- */
  const fontePadrao = (peso, px) => `${peso} ${px}px Arial, "Helvetica Neue", sans-serif`;
  const fotos = lados.map((lado) => {
    if (!lado.imagem) return null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { img.ok = true; };
    img.src = lado.imagem;
    return img;
  });

  // estado: { modo: 'espera' | 'digitando' | 'fim', lado, digitos }
  function pintarTela({ modo = 'espera', lado = 0, digitos = 0 } = {}) {
    const numero = String(lados[lado].numero ?? lado + 1);
    tela.atualizar((ctx, w, h) => {
      ctx.fillStyle = '#f6f7f2';
      ctx.fillRect(0, 0, w, h);
      if (modo === 'fim') {
        ctx.fillStyle = '#111';
        ctx.font = fontePadrao(800, 300);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('FIM', w / 2, h / 2 - 20);
        ctx.font = fontePadrao(700, 40);
        ctx.fillStyle = '#444';
        ctx.fillText('VOTOU', w / 2, h - 90);
        return;
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#111';
      ctx.font = fontePadrao(700, 40);
      ctx.fillText('SEU VOTO PARA', 40, 70);
      ctx.font = fontePadrao(800, 58);
      ctx.fillText((cfg.titulo ?? 'VOTAÇÃO').toUpperCase(), 40, 140, 640);
      ctx.font = fontePadrao(600, 46);
      ctx.fillText('Número:', 40, 270);
      [...numero].forEach((d, k) => {
        const x = 250 + k * 108, y = 196;
        ctx.lineWidth = 6; ctx.strokeStyle = '#111';
        ctx.strokeRect(x, y, 92, 120);
        ctx.fillStyle = '#fff'; ctx.fillRect(x + 3, y + 3, 86, 114);
        if (k < digitos) {
          ctx.fillStyle = '#111'; ctx.font = fontePadrao(700, 100); ctx.textAlign = 'center';
          ctx.fillText(d, x + 46, y + 95);
          ctx.textAlign = 'left';
        } else if (k === digitos && Math.floor(performance.now() / 450) % 2 === 0) {
          ctx.fillStyle = '#111'; ctx.fillRect(x + 18, y + 98, 56, 8);
        }
      });
      if (digitos >= numero.length) {
        ctx.fillStyle = '#111';
        ctx.font = fontePadrao(600, 42);
        ctx.fillText('Nome:', 40, 400);
        ctx.font = fontePadrao(800, 54);
        ctx.fillText(lados[lado].nome, 190, 402, 520);
        // foto do lado (ou iniciais na cor do lado)
        const fx = w - 290, fy = 40, fw = 240, fh = 300;
        ctx.fillStyle = lados[lado].cor; ctx.fillRect(fx, fy, fw, fh);
        if (fotos[lado]?.ok) ctx.drawImage(fotos[lado], fx, fy, fw, fh);
        else {
          ctx.fillStyle = '#fff'; ctx.font = fontePadrao(800, 120); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(lados[lado].nome.trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase(), fx + fw / 2, fy + fh / 2);
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        }
        ctx.lineWidth = 5; ctx.strokeStyle = '#111'; ctx.strokeRect(fx, fy, fw, fh);
      }
      ctx.fillStyle = '#111';
      ctx.fillRect(30, h - 170, w - 60, 4);
      ctx.font = fontePadrao(600, 34);
      ctx.fillText('Aperte a tecla:', 40, h - 118);
      ctx.fillText('VERDE para CONFIRMAR este voto', 80, h - 74);
      ctx.fillText('LARANJA para REINICIAR este voto', 80, h - 30);
    });
  }
  let estadoTela = { modo: 'espera', lado: 0, digitos: 0 };
  const telaPara = (e) => { estadoTela = e; pintarTela(e); };
  telaPara(estadoTela);
  // cursor piscando
  let piscou = 0;
  c3d.aoQuadro((dt) => { piscou += dt; if (piscou > .45 && estadoTela.modo !== 'fim') { piscou = 0; pintarTela(estadoTela); } });

  /* ---------- a mão ---------- */
  const mao = criarMao();
  cena.add(mao.raiz);

  // posição da ponta do dedo: começa descansando ao lado do teclado
  const ponta = new THREE.Vector3();
  const alvoMundo = (obj, altura = 0) => {
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);
    // "para cima" do tampo inclinado
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(tampo.getWorldQuaternion(new THREE.Quaternion()));
    return p.addScaledVector(n, .07 + altura);
  };
  const descanso = () => alvoMundo(teclas.get('9'), .9).add(new THREE.Vector3(.9, 0, 1.2));
  const alvo = descanso();
  ponta.copy(alvo);
  let respiro = 0;
  c3d.aoQuadro((dt, t) => {
    respiro = Math.sin(t * 1.6) * .03;
    mao.posicionar(ponta.x, ponta.y + respiro * (digitando ? .2 : 1), ponta.z);
  });

  const mover = (para, ms, curva = curvas.suave) => c3d.tween(ponta, { x: para.x, y: para.y, z: para.z }, ms, curva);

  async function apertar(tecla, rapido) {
    const v = rapido ? .62 : 1;
    const em = alvoMundo(tecla, .38);
    // arco: sobe um pouco no meio do caminho entre uma tecla e outra
    const meio = ponta.clone().lerp(em, .5);
    meio.y += .35;
    await mover(meio, 110 * v);
    await mover(em, 120 * v, curvas.saida);
    // aperta: o dedo desce, a tecla afunda, bipe
    mao.dobrar(.22);
    await mover(alvoMundo(tecla, -.035), 70 * v, curvas.entrada);
    tecla.position.y = tecla.userData.base - .05;
    tocar(tecla === teclas.get('CONFIRMA') ? 'urnaConfirma' : 'urnaTecla');
    await c3d.esperar(60 * v);
    tecla.position.y = tecla.userData.base;
    mao.dobrar(0);
    await mover(alvoMundo(tecla, .3), 90 * v, curvas.saida);
  }

  let pendentes = [], digitando = false;
  async function digitar() {
    if (digitando) return;
    digitando = true;
    while (pendentes.length) {
      const lado = pendentes.shift();
      const rapido = pendentes.length > 0;
      const numero = String(lados[lado].numero ?? lado + 1);
      telaPara({ modo: 'digitando', lado, digitos: 0 });
      for (let k = 0; k < numero.length; k++) {
        await apertar(teclas.get(numero[k]), rapido);
        telaPara({ modo: 'digitando', lado, digitos: k + 1 });
      }
      await c3d.esperar(rapido ? 120 : 260);
      await apertar(teclas.get('CONFIRMA'), rapido);
      telaPara({ modo: 'fim', lado, digitos: numero.length });
      particulas.explodir(alvoMundo(teclas.get('CONFIRMA'), .2), { qtd: 22, forca: 3, tamanho: .08, cores: [lados[lado].cor, '#ffffff', '#ffd23f'] });
      await c3d.esperar(rapido ? 450 : 900);
      telaPara({ modo: 'espera', lado, digitos: 0 });
    }
    await mover(descanso(), 420, curvas.suave);
    digitando = false;
  }

  return {
    c3d,
    // cada presente vira uma digitação; no máximo 2 esperando para não atrasar demais
    votar(lado) { if (pendentes.length < 2) pendentes.push(lado); digitar(); },
    comemorar(cor) {
      particulas.confete({ cores: [cor, '#ffd23f', '#ffffff'], qtd: 260, area: [-4, 4], altura: 9, z: [-2, 3], tamanho: .12 });
      c3d.tremer(.12, .5);
    },
    projetarUrna: () => c3d.projetar(new THREE.Vector3(0, 1, 0))
  };

  /* ---------- modelagem da mão direita, palma para baixo, indicador esticado ---------- */
  function criarMao() {
    const raiz = new THREE.Group();     // posicionada de modo que a ponta do indicador caia no alvo
    const mao = new THREE.Group();      // orientação do braço
    raiz.add(mao);
    const mPele = pele('#cf946c');
    const mUnha = material('#f3d6cb', { rugosidade: .25, verniz: .8 });
    const tecido = texturaMaterial('tecido', { cor: '#454b55', repetir: [3, 6] });
    const mManga = material('#ffffff', { mapa: tecido.mapa, relevo: tecido.relevo, escalaRelevo: .02, rugosidade: .88 });
    const mPunho = material('#f4f4f0', { rugosidade: .75 });
    const mAbotoadura = material('#d8b24a', { rugosidade: .25, metal: 1 });

    // eixo do braço: os dedos apontam para -z; o pulso fica em z = 0
    const palma = malha(caixa(.86, .3, 1.02, .14), mPele);
    palma.position.set(0, 0, -.5);
    palma.scale.set(1, 1, 1);
    mao.add(palma);
    const dorso = malha(new THREE.SphereGeometry(.47, 24, 16), mPele);
    dorso.scale.set(.92, .34, 1.08);
    dorso.position.set(0, .06, -.45);
    mao.add(dorso);
    // nós dos dedos
    const nos = [-.29, -.1, .1, .29];
    for (const x of nos) {
      const n = malha(new THREE.SphereGeometry(.1, 16, 12), mPele);
      n.position.set(x, .04, -.98);
      n.scale.set(1, .85, 1);
      mao.add(n);
    }
    // dedo = cadeia de falanges com juntas (rotação em x dobra para baixo)
    function dedo(x, comprimentos, raio, dobras, y = 0) {
      let pai = new THREE.Group();
      pai.position.set(x, y, -1.0);
      mao.add(pai);
      const juntas = [];
      comprimentos.forEach((c, i) => {
        const j = i === 0 ? pai : new THREE.Group();
        if (i > 0) { j.position.set(0, 0, -comprimentos[i - 1]); pai.add(j); }
        j.rotation.x = dobras[i];
        const r = raio * (1 - i * .08);
        const f = malha(new THREE.CapsuleGeometry(r, Math.max(.01, c - r), 6, 14), mPele);
        f.rotation.x = Math.PI / 2;
        f.position.z = -c / 2;
        j.add(f);
        if (i > 0) { const dobra = malha(new THREE.SphereGeometry(r * 1.02, 12, 10), mPele); j.add(dobra); }
        juntas.push(j);
        pai = j;
      });
      return juntas;
    }
    // indicador esticado (ligeiramente para baixo), demais dedos fechados
    const indicador = dedo(-.29, [.46, .29, .24], .092, [-.5, -.28, -.16]);
    const unha = malha(new THREE.SphereGeometry(.07, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mUnha);
    unha.scale.set(1, .35, 1.25);
    unha.position.set(0, .055, -.15);
    indicador[2].add(unha);
    const ponteira = new THREE.Object3D();
    ponteira.position.set(0, -.03, -.28);
    indicador[2].add(ponteira);
    dedo(-.1, [.42, .28, .22], .094, [-1.3, -1.6, -1.0]);
    dedo(.1, [.4, .26, .21], .09, [-1.35, -1.6, -1.0]);
    dedo(.29, [.32, .22, .18], .08, [-1.4, -1.55, -1.0]);
    // polegar: sai da lateral da palma e encosta no médio
    const polegarBase = new THREE.Group();
    polegarBase.position.set(-.43, -.08, -.35);
    polegarBase.rotation.set(-.2, .75, .5);
    mao.add(polegarBase);
    const p1 = malha(new THREE.CapsuleGeometry(.11, .3, 6, 14), mPele);
    p1.rotation.x = Math.PI / 2; p1.position.z = -.2;
    polegarBase.add(p1);
    const polegarPonta = new THREE.Group();
    polegarPonta.position.z = -.4;
    polegarPonta.rotation.set(-.25, .55, 0);
    polegarBase.add(polegarPonta);
    const p2 = malha(new THREE.CapsuleGeometry(.1, .2, 6, 14), mPele);
    p2.rotation.x = Math.PI / 2; p2.position.z = -.14;
    polegarPonta.add(p2);
    const unhaP = malha(new THREE.SphereGeometry(.075, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mUnha);
    unhaP.scale.set(1, .35, 1.2); unhaP.position.set(0, .07, -.18);
    polegarPonta.add(unhaP);
    // pulso, punho da camisa com abotoadura e manga do paletó
    const pulso = malha(new THREE.CylinderGeometry(.27, .3, .5, 24), mPele);
    pulso.rotation.x = Math.PI / 2; pulso.position.z = .12; pulso.scale.set(1.15, 1, .78);
    mao.add(pulso);
    const punho = malha(new THREE.CylinderGeometry(.36, .37, .36, 28), mPunho);
    punho.rotation.x = Math.PI / 2; punho.position.z = .48; punho.scale.set(1.1, 1, .85);
    mao.add(punho);
    const abotoadura = malha(new THREE.SphereGeometry(.05, 12, 8), mAbotoadura);
    abotoadura.position.set(-.38, .05, .5);
    mao.add(abotoadura);
    const manga = malha(new THREE.CylinderGeometry(.43, .52, 5, 28, 1, true), mManga);
    manga.rotation.x = Math.PI / 2; manga.position.z = 3.1; manga.scale.set(1.08, 1, .9);
    mao.add(manga);

    // braço vem de baixo à direita, da frente da urna; dedos apontando para o teclado e para baixo
    mao.rotation.order = 'YXZ';
    mao.rotation.set(-.25, .62, -.28);
    const tmp = new THREE.Vector3();
    return {
      raiz,
      // coloca a raiz para a ponta do indicador ficar em (x, y, z)
      posicionar(x, y, z) {
        raiz.updateMatrixWorld(true);
        ponteira.getWorldPosition(tmp);
        raiz.position.x += x - tmp.x;
        raiz.position.y += y - tmp.y;
        raiz.position.z += z - tmp.z;
      },
      // dobra extra do indicador e do pulso ao apertar (0 = solto)
      dobrar(k) {
        indicador[1].rotation.x = -.28 - k * .5;
        indicador[2].rotation.x = -.16 - k * .3;
        mao.rotation.x = -.25 - k * .25;
      }
    };
  }
}
