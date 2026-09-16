/**
 * O aviso que chega na barra de notificações — com o aplicativo fechado.
 *
 * O PROBLEMA QUE ELA RESOLVE. Tudo o que o produto precisa contar ao lojista já
 * virava linha em `notificacoes`, e essa linha só alcançava quem estivesse com
 * o app aberto. Pedido que entra às 21h, celular no bolso: esperava até alguém
 * abrir o aplicativo. Um pedido que ninguém vê é um pedido perdido.
 *
 * COMO FUNCIONA, em três peças:
 *   1. o navegador guarda uma INSCRIÇÃO (endpoint + duas chaves) — é o
 *      aplicativo que a cria e grava, quando a pessoa permite;
 *   2. um gatilho em `notificacoes` chama ESTA função (0066);
 *   3. ela cifra o aviso para cada inscrição e entrega ao serviço do navegador,
 *      que mostra na barra do sistema mesmo com tudo fechado.
 *
 * POR QUE A CRIPTOGRAFIA ESTÁ ESCRITA AQUI, e não vem de uma biblioteca. O
 * `web-push` do npm depende de APIs de Node (`createECDH`) cuja compatibilidade
 * no runtime do Supabase eu não teria como garantir sem descobrir na hora do
 * primeiro pedido de verdade. O que está abaixo é o RFC 8291 (aes128gcm) e o
 * RFC 8292 (VAPID) com Web Crypto puro — mais linhas, nenhuma surpresa.
 *
 * Conferido contra o vetor de teste do RFC 8291 (Apêndice A): segredo ECDH,
 * IKM, chave de conteúdo e nonce idênticos aos publicados, e o envelope
 * decifrável pelas chaves do RFC. Isso importa porque um erro aqui é MUDO: o
 * serviço de push responde 201 Created e o navegador descarta o aviso.
 *
 * O CORPO DA CHAMADA NÃO TRAZ TEXTO. Quem chama manda só o id da notificação; o
 * título e a mensagem são RELIDOS do banco. Assim este endereço não vira um
 * jeito de escrever o que se quiser no celular de alguém.
 *
 * AS CHAVES VAPID VÊM DO BANCO (0068), da mesma linha que guarda o segredo do
 * gatilho — tabela sem política de RLS e sem privilégio para ninguém além do
 * `service_role`. Secret de projeto seria o lugar canônico; este projeto já foi
 * mordido duas vezes por configuração que envelhece calada num painel, e um
 * valor que o código cria e o código lê não tem como faltar num ambiente novo.
 *
 * SECRETS: SUPABASE_SERVICE_ROLE_KEY (padrão do projeto).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-decola-push',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/* ============================================== base64url e bytes ======== */

function deB64Url(texto: string): Uint8Array {
  const base = texto.replace(/-/g, '+').replace(/_/g, '/');
  const cru = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
  const bytes = new Uint8Array(cru.length);
  for (let i = 0; i < cru.length; i += 1) bytes[i] = cru.charCodeAt(i);
  return bytes;
}

function paraB64Url(bytes: Uint8Array): string {
  let cru = '';
  for (const b of bytes) cru += String.fromCharCode(b);
  return btoa(cru).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function juntar(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const saida = new Uint8Array(total);
  let i = 0;
  for (const p of partes) {
    saida.set(p, i);
    i += p.length;
  }
  return saida;
}

/** Número de 16 ou 32 bits, em big-endian, como os dois RFCs pedem. */
function numero(valor: number, tamanho: 2 | 4): Uint8Array {
  const saida = new Uint8Array(tamanho);
  new DataView(saida.buffer).setUint32(tamanho - 4, valor);
  return saida;
}

/* ====================================================== VAPID (8292) ===== */

/**
 * O crachá que prova ao serviço do navegador que fomos nós que mandamos.
 *
 * É um JWT assinado com a chave privada VAPID, válido por 12 horas e emitido
 * PARA O SERVIDOR DE PUSH daquela inscrição (o `aud` é a origem do endpoint) —
 * é por isso que ele não pode ser calculado uma vez só para todo mundo: Chrome,
 * Firefox e Safari têm servidores diferentes.
 */
async function crachaVapid(origem: string, privadaB64: string, publicaB64: string) {
  const cabecalho = { typ: 'JWT', alg: 'ES256' };
  const corpo = {
    aud: origem,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: 'mailto:contato@decola.pro',
  };

  const texto = new TextEncoder();
  const naoAssinado =
    paraB64Url(texto.encode(JSON.stringify(cabecalho))) +
    '.' +
    paraB64Url(texto.encode(JSON.stringify(corpo)));

  // A chave privada VAPID é só o escalar `d`; o par público vem junto para o
  // Web Crypto aceitar importá-la como JWK.
  const publica = deB64Url(publicaB64);
  const chave = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: privadaB64,
      x: paraB64Url(publica.slice(1, 33)),
      y: paraB64Url(publica.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const assinatura = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      chave,
      texto.encode(naoAssinado),
    ),
  );

  return `${naoAssinado}.${paraB64Url(assinatura)}`;
}

/* ================================================ o envelope (8291) ====== */

async function hkdf(
  sal: Uint8Array,
  segredo: Uint8Array,
  informacao: Uint8Array,
  tamanho: number,
): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', segredo, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: sal, info: informacao },
    base,
    tamanho * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Cifra o aviso para UMA inscrição.
 *
 * O segredo é combinado entre uma chave efêmera nossa (nova a cada envio) e a
 * chave pública do navegador. Nem o serviço de push nem nós, depois, temos como
 * ler o que foi mandado — só aquele navegador.
 */
async function empacotar(
  texto: string,
  p256dhB64: string,
  authB64: string,
): Promise<Uint8Array> {
  const dados = new TextEncoder().encode(texto);
  const cliente = deB64Url(p256dhB64);
  const auth = deB64Url(authB64);

  const efemero = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const nossaPublica = new Uint8Array(
    await crypto.subtle.exportKey('raw', efemero.publicKey),
  );

  const chaveDoCliente = await crypto.subtle.importKey(
    'raw',
    cliente,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const compartilhado = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: chaveDoCliente }, efemero.privateKey, 256),
  );

  const codificar = (s: string) => new TextEncoder().encode(s);

  // Primeiro HKDF: mistura o segredo de autenticação da inscrição.
  const info = juntar(
    codificar('WebPush: info\0'),
    cliente,
    nossaPublica,
  );
  const prk = await hkdf(auth, compartilhado, info, 32);

  const sal = crypto.getRandomValues(new Uint8Array(16));
  const chaveDeConteudo = await hkdf(sal, prk, codificar('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, prk, codificar('Content-Encoding: nonce\0'), 12);

  const aes = await crypto.subtle.importKey('raw', chaveDeConteudo, 'AES-GCM', false, ['encrypt']);
  // O `0x02` é o delimitador de ÚLTIMO registro; sem ele o navegador fica
  // esperando um pedaço que nunca vem e descarta o aviso em silêncio.
  const corpo = juntar(dados, new Uint8Array([0x02]));
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aes, corpo),
  );

  // Cabeçalho aes128gcm: sal (16) + tamanho do registro (4) + tamanho da chave
  // (1) + a chave pública efêmera (65).
  return juntar(sal, numero(4096, 4), new Uint8Array([nossaPublica.length]), nossaPublica, cifrado);
}

/* ========================================================== a função ===== */

type Destino = {
  titulo: string;
  mensagem: string;
  categoria: string;
  entidade: string | null;
  entidade_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Para onde o toque no aviso leva. */
function destinoDoToque(d: Destino): string {
  if (d.entidade === 'pedido' && d.entidade_id) return `/app/pedidos/${d.entidade_id}`;
  if (d.categoria === 'estoque') return '/app/estoque-baixo';
  if (d.categoria === 'assinatura') return '/app/perfil/plano';
  return '/app/notificacoes';
}

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requisicao.method !== 'POST') return responder({ erro: 'Método não suportado.' }, 405);

  let corpo: { notificacao_id?: string };
  try {
    corpo = await requisicao.json();
  } catch {
    return responder({ erro: 'Requisição inválida.' }, 400);
  }

  const id = corpo.notificacao_id ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return responder({ erro: 'Notificação inválida.' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  /**
   * SÓ O BANCO PODE PEDIR ENVIO.
   *
   * O gatilho apresenta um segredo guardado numa tabela que ninguém mais
   * alcança (0066). Sem esta conferência, qualquer um que descobrisse um id de
   * notificação faria o celular de outra pessoa apitar quantas vezes quisesse.
   */
  const { data: segredo } = await admin
    .from('segredo_do_push')
    .select('token, vapid_publica, vapid_privada')
    .maybeSingle();

  const apresentado = requisicao.headers.get('x-decola-push') ?? '';
  if (!segredo?.token || apresentado !== segredo.token) {
    return responder({ erro: 'Não autorizado.' }, 401);
  }

  const publica = segredo.vapid_publica ?? '';
  const privada = segredo.vapid_privada ?? '';
  if (!publica || !privada) {
    console.error('enviar-push: par VAPID ausente na linha de segredo');
    return responder({ erro: 'Envio de avisos não configurado.' }, 503);
  }

  const { data, error } = await admin.rpc('destinos_do_push', { p_notificacao_id: id });
  if (error) {
    console.error('enviar-push: destinos não lidos', error);
    return responder({ erro: 'Não foi possível montar o envio.' }, 500);
  }

  const destinos = (data ?? []) as Destino[];
  if (destinos.length === 0) return responder({ enviados: 0, motivo: 'sem_inscricoes' });

  let enviados = 0;
  let esquecidos = 0;

  for (const destino of destinos) {
    try {
      const carga = JSON.stringify({
        titulo: destino.titulo,
        mensagem: destino.mensagem,
        caminho: destinoDoToque(destino),
      });

      const envelope = await empacotar(carga, destino.p256dh, destino.auth);
      const origem = new URL(destino.endpoint).origin;
      const cracha = await crachaVapid(origem, privada, publica);

      const resposta = await fetch(destino.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `vapid t=${cracha}, k=${publica}`,
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: '86400',
          Urgency: 'high',
        },
        body: envelope,
      });

      if (resposta.ok) {
        enviados += 1;
        continue;
      }

      /**
       * 404 e 410 são o navegador dizendo que aquela inscrição MORREU — app
       * desinstalado, permissão revogada, dados do site limpos. Guardá-la é
       * garantir uma falha por notificação, para sempre. Qualquer outro código
       * é problema do momento e a inscrição continua valendo.
       */
      if (resposta.status === 404 || resposta.status === 410) {
        await admin.rpc('esquecer_inscricao_push', { p_endpoint: destino.endpoint });
        esquecidos += 1;
      } else {
        console.warn(`push recusado (${resposta.status}): ${await resposta.text()}`);
      }
    } catch (e) {
      console.warn('push falhou:', e instanceof Error ? e.message : e);
    }
  }

  return responder({ enviados, esquecidos, destinos: destinos.length });
});
