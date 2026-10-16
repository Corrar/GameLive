import { writeFile } from 'node:fs/promises';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { criarContador } from './sequencia.js';

const RECONECTAR_MS = 15000;
const ARQUIVO_PRESENTES = new URL('../presentes-vistos.json', import.meta.url);

// A doc da biblioteca usa nomes antigos (uniqueId, comment, giftDetails); os tipos da v2.5 usam
// displayId, content, gift. Lemos os dois para não quebrar quando um lado mudar.
function usuario(u = {}) {
  return {
    user: u.uniqueId ?? u.displayId ?? '',
    nome: u.nickname || u.uniqueId || u.displayId || '',
    foto: u.profilePicture?.url?.[0] ?? u.avatarThumb?.urlList?.[0] ?? ''
  };
}

export function normalizarComentario(d) {
  return { tipo: 'comentario', ...usuario(d.user), texto: d.comment ?? d.content ?? '' };
}

// Devolve o dado bruto do presente no formato que criarContador() e o registro esperam.
export function lerPresente(d) {
  const g = d.giftDetails ?? {};
  return {
    userId: String(d.user?.userId ?? d.user?.id ?? d.user?.displayId ?? ''),
    giftId: Number(d.giftId ?? d.gift?.id),
    groupId: d.groupId,
    giftType: g.giftType ?? d.gift?.type,
    repeatCount: d.repeatCount,
    repeatEnd: Boolean(d.repeatEnd),
    nome: g.giftName ?? d.gift?.name ?? d.extendedGiftInfo?.name ?? '',
    diamantes: g.diamondCount ?? d.gift?.diamondCount ?? d.extendedGiftInfo?.diamond_count ?? null
  };
}

export function iniciarTiktok(emitir, { usuario: arroba }) {
  const conexao = new TikTokLiveConnection(arroba, {
    enableExtendedGiftInfo: true,
    signApiKey: process.env.EULER_API_KEY
  });
  const contar = criarContador();
  const vistos = {};
  let timerReconexao = null, timerGravar = null, parado = false;

  function gravarVistos() {
    clearTimeout(timerGravar);
    timerGravar = setTimeout(() => {
      writeFile(ARQUIVO_PRESENTES, JSON.stringify(vistos, null, 2))
        .catch(e => console.error('Não consegui gravar presentes-vistos.json:', e.message));
    }, 5000);
  }

  function agendarReconexao(detalhe) {
    emitir({ tipo: 'status', conectado: false, fonte: 'tiktok', detalhe });
    if (parado || timerReconexao) return;
    timerReconexao = setTimeout(() => { timerReconexao = null; conectar(); }, RECONECTAR_MS);
  }

  function conectar() {
    conexao.connect().catch(e => {
      console.error(`Live de @${arroba} indisponível: ${e.message}`);
      agendarReconexao(e.message);
    });
  }

  conexao.on(ControlEvent.CONNECTED, (estado) => {
    console.log(`Conectado na live de @${arroba} (sala ${estado.roomId})`);
    emitir({ tipo: 'status', conectado: true, fonte: 'tiktok', detalhe: `@${arroba}` });
  });
  conexao.on(ControlEvent.DISCONNECTED, ({ reason } = {}) => {
    console.warn(`Desconectado da live${reason ? `: ${reason}` : ''}`);
    agendarReconexao(reason || 'desconectado');
  });
  conexao.on(ControlEvent.ERROR, ({ info, exception } = {}) => console.error('Erro da biblioteca:', info, exception?.message ?? ''));

  conexao.on(WebcastEvent.CHAT, (d) => emitir(normalizarComentario(d)));

  conexao.on(WebcastEvent.GIFT, (d) => {
    const p = lerPresente(d);
    if (!vistos[p.giftId]) {
      vistos[p.giftId] = { nome: p.nome, diamantes: p.diamantes, vistoEm: new Date().toISOString() };
      gravarVistos();
    }
    const quantidade = contar(p);
    if (quantidade <= 0) return;
    emitir({ tipo: 'presente', ...usuario(d.user), presenteId: p.giftId, presenteNome: p.nome, quantidade });
  });

  conectar();

  return () => {
    parado = true;
    clearTimeout(timerReconexao);
    clearTimeout(timerGravar);
    return conexao.disconnect();
  };
}
