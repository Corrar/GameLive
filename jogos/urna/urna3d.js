// Cena 3D da Urna da Live: sala com mesa de madeira, a urna eletrônica e a mão que digita o voto.
// Unidade ≈ 10 cm (a urna tem 4,4 × 2,8, como a de verdade).
import { THREE, criarCena, material, caixa, malha, texturaCanvas, texturaMaterial, holofote,
  criarParticulas, curvas } from '../kit/cena3d.js';
import { tocar } from '../kit/efeitos.js';
import { criarMao } from './mao3d.js';
import { desenharRetrato, desenharCobrindo, carregarImagem } from './retrato.js';

const TECLAS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], [null, '0', null]];

// número do lado só com dígitos (cabe nas caixas da tela e tem tecla para cada um)
export function numeroDoLado(lado, i) {
  const n = String(lado?.numero ?? '').replace(/\D/g, '').slice(0, 5);
  return n || String(i + 1);
}

export function criarUrna3d(palco, cfg) {
  const lados = cfg.lados;
  const numeros = lados.map(numeroDoLado);
  const transparente = cfg.fundo === 'transparente';
  const c3d = criarCena(palco, {
    cfg, luz: 'estudio', fundo: transparente ? null : '#b85a1c', exposicao: 1,
    // alvo um pouco acima do centro: a urna desce no quadro e sobra respiro para 'quem votou' em cima dela
    camera: { pos: [0, 12.6, 14.9], alvo: [0, 1.7, -1], fov: 30 },
    // sol alto à esquerda e um pouco atrás: a urna faz sombra na mesa e a mão no teclado, para a frente
    sol: { pos: [-6, 11, -3], alcance: 7 }
  });
  const { cena } = c3d;
  // pouco preenchimento: o sol desenha as sombras (mão no teclado, urna na mesa) e o preto fica preto
  c3d.sol.intensity = 3.3;
  c3d.sol.shadow.radius = 5;
  c3d.hemi.intensity = .2;
  cena.environmentIntensity = .3;
  const particulas = criarParticulas(c3d, { max: 400 });

  /* ---------- sala ---------- */
  if (!transparente) {
    const parede = texturaMaterial('parede', { cor: '#d9762f', repetir: [3, 2] });
    const fundo = malha(new THREE.PlaneGeometry(60, 34), material('#ffffff', { mapa: parede.mapa, relevo: parede.relevo, escalaRelevo: .02, rugosidade: .95 }), { sombra: false });
    fundo.position.set(0, 8, -9);
    cena.add(fundo);
    // luz quente de abajur na parede, atrás da urna
    // (alcance curto: esquenta a parede sem lavar a urna nem as sombras da mesa)
    const abajur = new THREE.PointLight('#ffb35c', 30, 7.5, 1.6);
    abajur.position.set(0, 6.5, -7.8);
    cena.add(abajur);
    holofote(c3d, { pos: [-9, 16, 4], alvo: [0, 0, 0], cor: '#fff0d8', intensidade: 40, angulo: .32, cone: false });
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
  // cabo curto saindo por trás até a fonte de energia, deitada na mesa atrás da urna
  // (fica quase toda escondida pela urna: não sobe na tela nem termina no vazio no modo transparente)
  const corCabo = material('#2f2f31', { rugosidade: .5, verniz: .3 });
  const cabo = new THREE.CatmullRomCurve3([new THREE.Vector3(1.6, .45, -1.5), new THREE.Vector3(1.7, .1, -1.95),
    new THREE.Vector3(1.4, .05, -2.3), new THREE.Vector3(1.0, .09, -2.36)]);
  urna.add(malha(new THREE.TubeGeometry(cabo, 16, .06, 8), corCabo));
  const fonte = malha(caixa(.8, .22, .45, .06), corCabo);
  fonte.position.set(.6, .03, -2.36);
  urna.add(fonte);

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
    map: tela.textura, emissiveMap: tela.textura, emissive: '#ffffff', emissiveIntensity: .16,
    roughness: .18, clearcoat: 1, clearcoatRoughness: .05
  }));
  vidro.rotation.x = -Math.PI / 2;
  vidro.position.set(-.95, .056, -.02);
  vidro.receiveShadow = true;
  tampo.add(vidro);

  // teclado: painel preto, placa da marca, 10 teclas e os 3 botões
  const painel = malha(caixa(1.62, .06, 1.92, .05), material('#18181a', { rugosidade: .45, verniz: .2 }));
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
  const corTecla = material('#232326', { rugosidade: .38, verniz: .4 });
  function rotuloTecla(texto, { cor = '#ffffff', fonte = 82, largura = 128, altura = 96 } = {}) {
    const t = texturaCanvas(largura, altura, (ctx, w, h) => {
      ctx.fillStyle = cor; ctx.font = `800 ${fonte}px "Baloo 2", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(texto, w / 2, h / 2 + fonte * .06, w - 8);
    });
    // material com luz: a sombra da mão escurece o número da tecla
    return new THREE.MeshStandardMaterial({ map: t.textura, transparent: true, depthWrite: false, roughness: .4,
      emissive: '#ffffff', emissiveMap: t.textura, emissiveIntensity: .12 });
  }
  const geoTecla = caixa(.36, .11, .26, .045);
  TECLAS.forEach((linha, l) => linha.forEach((d, c) => {
    if (d === null) return;
    const k = malha(geoTecla, corTecla);
    k.position.set(.9 + c * .43, .1, -.47 + l * .3);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(.26, .2), rotuloTecla(d));
    r.rotation.x = -Math.PI / 2;
    r.position.y = .058;
    r.receiveShadow = true;
    k.add(r);
    k.userData.base = k.position.y;
    k.userData.meia = .055;
    tampo.add(k);
    teclas.set(d, k);
  }));
  const BOTOES = [['BRANCO', '#f3f2ec', '#1b1b1b'], ['CORRIGE', '#f08a24', '#1b1b1b'], ['CONFIRMA', '#2fb24c', '#0f2a15']];
  BOTOES.forEach(([nome, cor, corTexto], i) => {
    const mat = material(cor, { rugosidade: .4, verniz: .4, emissivo: '#5dff7e', intensidadeEmissiva: 0 });
    const b = malha(caixa(.46, .12, .32, .05), mat);
    b.position.set(.9 + i * .43, .1, .74);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(.42, .14), rotuloTecla(nome, { cor: corTexto, fonte: 40, largura: 256, altura: 80 }));
    r.rotation.x = -Math.PI / 2;
    r.position.y = .063;
    r.receiveShadow = true;
    b.add(r);
    b.userData.base = b.position.y;
    b.userData.meia = .06;
    b.userData.mat = mat;
    tampo.add(b);
    teclas.set(nome, b);
  });

  /* ---------- tela da urna (desenho 2D) ---------- */
  const fontePadrao = (peso, px) => `${peso} ${px}px Arial, "Helvetica Neue", sans-serif`;
  // foto de cada lado: a "imagem" do config (repinta a tela quando ela chega) ou o retrato ilustrado
  const fotos = lados.map((lado) => carregarImagem(lado.imagem, () => pintarTela(estadoTela)));

  // estado: { modo: 'espera' | 'digitando' | 'fim', lado, digitos }
  function pintarTela({ modo = 'espera', lado = 0, digitos = 0 } = {}) {
    const numero = numeros[lado];
    tela.atualizar((ctx, w, h) => {
      ctx.fillStyle = '#f6f7f2';
      ctx.fillRect(0, 0, w, h);
      if (modo === 'fim') {
        ctx.fillStyle = '#111';
        ctx.font = fontePadrao(800, 300);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('FIM', w / 2, h / 2 - 30);
        ctx.font = fontePadrao(700, 56);
        ctx.fillStyle = '#333';
        ctx.fillText('VOTOU', w / 2, h - 90);
        return;
      }
      const completo = digitos >= numero.length;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#111';
      ctx.font = fontePadrao(700, 36);
      ctx.fillText('SEU VOTO PARA', 34, 54);
      ctx.font = fontePadrao(800, 50);
      ctx.fillText((cfg.titulo ?? 'VOTAÇÃO').toUpperCase(), 34, 108, 640);
      // caixas grandes dos dígitos (o centro da animação: precisa ler até no celular);
      // o tamanho não muda quando a foto aparece
      ctx.font = fontePadrao(600, 38);
      ctx.fillText('Número:', 34, 166);
      const n = numero.length, espaco = 18;
      const lb = Math.min(196, (650 - (n - 1) * espaco) / n), ab = Math.min(250, lb * 1.3);
      [...numero].forEach((d, k) => {
        const x = 34 + k * (lb + espaco), y = 186;
        ctx.fillStyle = '#fff'; ctx.fillRect(x, y, lb, ab);
        ctx.lineWidth = 8; ctx.strokeStyle = '#111'; ctx.strokeRect(x, y, lb, ab);
        if (k < digitos) {
          ctx.fillStyle = '#111'; ctx.font = fontePadrao(800, Math.round(ab * .86)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(d, x + lb / 2, y + ab / 2 + ab * .05);
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        } else if (k === digitos) {
          colocarCursor(x + lb * .16, y + ab - 40, lb * .68, 14);
        }
      });
      if (completo) {
        ctx.fillStyle = '#111';
        ctx.font = fontePadrao(600, 38);
        ctx.fillText('Nome:', 34, 520);
        ctx.font = fontePadrao(800, 64);
        ctx.fillText(lados[lado].nome, 158, 522, 560);
        // foto do lado: imagem do config cobrindo o quadrado, ou o retrato ilustrado na cor do lado
        const fx = w - 296, fy = 34, fw = 262, fh = 330;
        ctx.fillStyle = '#fff'; ctx.fillRect(fx, fy, fw, fh);
        if (fotos[lado]?.ok) desenharCobrindo(ctx, fotos[lado], fx, fy, fw, fh);
        else desenharRetrato(ctx, fx, fy, fw, fh, { cor: lados[lado].cor, variante: lado });
        ctx.lineWidth = 6; ctx.strokeStyle = '#111'; ctx.strokeRect(fx, fy, fw, fh);
      }
      ctx.fillStyle = '#111';
      ctx.fillRect(30, h - 160, w - 60, 5);
      ctx.font = fontePadrao(600, 32);
      ctx.fillText('Aperte a tecla:', 34, h - 114);
      ctx.fillText('VERDE para CONFIRMAR este voto', 70, h - 72);
      ctx.fillText('LARANJA para REINICIAR este voto', 70, h - 30);
    });
  }
  // cursor piscando: um quad preto em cima do vidro (só liga/desliga; a textura da tela não é reenviada)
  const cursor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#111111' }));
  cursor.visible = false;
  vidro.add(cursor);
  let cursorPosto = false;
  // retângulo em px do canvas da tela → plano do vidro (2,08 × 1,5)
  function colocarCursor(x, y, w, h) {
    cursor.scale.set(w / TELA_W * 2.08, h / TELA_H * 1.5, 1);
    cursor.position.set(((x + w / 2) / TELA_W - .5) * 2.08, (.5 - (y + h / 2) / TELA_H) * 1.5, .002);
    cursorPosto = true;
  }
  let estadoTela = { modo: 'espera', lado: 0, digitos: 0 };
  const telaPara = (e) => { estadoTela = e; cursorPosto = false; pintarTela(e); };
  telaPara(estadoTela);
  c3d.aoQuadro((dt, t) => { cursor.visible = cursorPosto && Math.floor(t / .45) % 2 === 0; });

  /* ---------- a mão ---------- */
  const mao = criarMao({ passo: c3d.qualidade.nome === 'baixa' ? .026 : .019 });
  cena.add(mao.raiz);

  // ponto na face de cima da tecla (posição de repouso dela), "altura" acima, na normal do tampo
  const sobre = (tecla, altura = 0) => tampo.localToWorld(new THREE.Vector3(tecla.position.x,
    tecla.userData.base + tecla.userData.meia + altura, tecla.position.z));
  // descanso: mão apoiada na mesa, na frente e à direita da urna, com punho e manga no quadro
  const DESCANSO = new THREE.Vector3(1.05, .012, 2.1);
  const GIRO_DESCANSO = { x: .02, y: .55, z: .06 };
  // digitando: mão um pouco tombada para o lado do indicador (a unha fica de frente para a câmera)
  const GIRO_DIGITA = { x: -.06, y: .92, z: .4 };
  const ponta = DESCANSO.clone();
  Object.assign(mao.giro, GIRO_DESCANSO);
  const dobra = { k: 0 };
  let digitando = false;
  c3d.aoQuadro((dt, t) => {
    // respiração leve só parada; digitando, a mão segue exatamente o alvo
    const r = digitando ? 0 : Math.sin(t * 1.5) * .012;
    mao.dobrar(dobra.k + (digitando ? 0 : Math.sin(t * 1.5 + 1) * .03));
    mao.posicionar(ponta.x, ponta.y + Math.max(0, r), ponta.z);
  });

  const mover = (para, ms, curva = curvas.suave) => c3d.tween(ponta, { x: para.x, y: para.y, z: para.z }, ms, curva);

  async function apertar(tecla, rapido) {
    const v = rapido ? .65 : 1;
    const acima = sobre(tecla, .3);
    // arco: sobe no meio do caminho (pulo curto entre teclas vizinhas) e o indicador se estica antes de descer
    const meio = ponta.clone().lerp(acima, .5);
    meio.y = Math.max(ponta.y, acima.y) + Math.min(.3, .08 + ponta.distanceTo(acima) * .14);
    c3d.tween(dobra, { k: -.25 }, 200 * v, curvas.suave);
    await mover(meio, 130 * v, curvas.suave);
    await mover(acima, 130 * v, curvas.saida);
    await mover(sobre(tecla, 0), 90 * v, curvas.entrada);
    // aperta: dedo e tecla descem juntos, o dedo dobra, bipe no fundo
    const FUNDO = .05;
    await Promise.all([
      mover(sobre(tecla, -FUNDO), 70 * v, curvas.saida),
      c3d.tween(tecla.position, { y: tecla.userData.base - FUNDO }, 70 * v, curvas.saida),
      c3d.tween(dobra, { k: .25 }, 70 * v, curvas.saida)
    ]);
    const confirma = tecla === teclas.get('CONFIRMA');
    tocar(confirma ? 'urnaConfirma' : 'urnaTecla');
    if (confirma) {
      tecla.userData.mat.emissiveIntensity = .9;
      c3d.tween(tecla.userData.mat, { emissiveIntensity: 0 }, 650, curvas.entrada);
    }
    await c3d.esperar(130 * v);
    await Promise.all([
      mover(sobre(tecla, 0), 80 * v, curvas.suave),
      c3d.tween(tecla.position, { y: tecla.userData.base }, 80 * v, curvas.suave),
      c3d.tween(dobra, { k: 0 }, 80 * v, curvas.suave)
    ]);
    await mover(sobre(tecla, .28), 100 * v, curvas.saida);
  }

  let pendentes = [];
  async function digitar() {
    if (digitando) return;
    digitando = true;
    try {
      while (pendentes.length) {
        // sai do descanso: a mão vira para o teclado enquanto vai até a primeira tecla
        c3d.tween(mao.giro, GIRO_DIGITA, 420, curvas.suave);
        while (pendentes.length) {
          const { lado, aoComecar } = pendentes.shift();
          const rapido = pendentes.length > 0;
          const numero = numeros[lado];
          telaPara({ modo: 'digitando', lado, digitos: 0 });
          aoComecar?.();
          for (let k = 0; k < numero.length; k++) {
            const tecla = teclas.get(numero[k]);
            if (tecla) await apertar(tecla, rapido);
            telaPara({ modo: 'digitando', lado, digitos: k + 1 });
          }
          await c3d.esperar(rapido ? 140 : 280);
          await apertar(teclas.get('CONFIRMA'), rapido);
          telaPara({ modo: 'fim', lado, digitos: numero.length });
          particulas.explodir(sobre(teclas.get('CONFIRMA'), .15), { qtd: 22, forca: 3, tamanho: .08, cores: [lados[lado].cor, '#ffffff', '#ffd23f'] });
          // espera o trinado de confirmação (0,88 s) acabar antes do próximo voto
          await c3d.esperar(900);
          telaPara({ modo: 'espera', lado, digitos: 0 });
        }
        // volta a descansar na mesa (se chegar voto no caminho, já volta para o teclado)
        const meio = ponta.clone().lerp(DESCANSO, .5);
        meio.y = ponta.y + .2;
        c3d.tween(mao.giro, GIRO_DESCANSO, 640, curvas.suave);
        await mover(meio, 300, curvas.suave);
        if (!pendentes.length) await mover(DESCANSO, 340, curvas.saida);
      }
    } finally {
      digitando = false;
    }
  }

  return {
    c3d,
    // cada presente vira uma digitação; aoComecar roda quando a mão começa a digitar esse voto
    // (para o placar mostrar quem a urna está digitando). No máximo 2 esperando: com a fila cheia
    // o último da fila dá lugar ao mais novo, então quem acabou de votar aparece logo
    votar(lado, aoComecar) {
      const voto = { lado, aoComecar };
      if (pendentes.length < 2) pendentes.push(voto); else pendentes[pendentes.length - 1] = voto;
      digitar();
    },
    comemorar(cor) {
      particulas.confete({ cores: [cor, '#ffd23f', '#ffffff'], qtd: 260, area: [-4, 4], altura: 9, z: [-2, 3], tamanho: .12 });
      c3d.tremer(.12, .5);
    },
    projetarUrna: () => c3d.projetar(new THREE.Vector3(0, 1, 0))
  };
}
