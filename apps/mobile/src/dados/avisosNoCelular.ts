/**
 * Receber aviso na barra de notificações, com o aplicativo fechado.
 *
 * TRÊS PEÇAS, e esta é a do meio:
 *   1. `web/sw.js` — o Service Worker, que recebe e mostra;
 *   2. ESTE ARQUIVO — pede a permissão, cria a inscrição e a guarda no banco;
 *   3. `supabase/functions/enviar-push` — cifra e entrega, disparada por um
 *      gatilho em `notificacoes` (0066).
 *
 * A PERMISSÃO SÓ PODE SER PEDIDA A PARTIR DE UM TOQUE. O navegador ignora (ou
 * pune) quem pede sozinho ao abrir a página. Por isso não há nada automático
 * aqui: quem chama é um botão.
 *
 * NO IPHONE SÓ FUNCIONA INSTALADO. O Safari só entrega Web Push a um site que
 * está na tela inicial — não é limitação nossa, é do sistema. É por isso que a
 * etapa "Instalar" vem antes no tutorial: sem ela, a de notificações não teria
 * como funcionar naquele aparelho.
 */
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

/** A chave pública do par VAPID (migração 0068). Pública por definição. */
const VAPID_PUBLICA =
  'BA6jAIkVDdfrlfjNjHaRZEmDaD5z8eJJpze47RPSaKSkkElRuD0s7RuTYNCZ-wApSx525wOCgyYQ6Zkakq8aPsY';

export type EstadoDosAvisos =
  /** O navegador deste aparelho não faz Web Push. */
  | 'indisponivel'
  /** Faz, mas só depois de instalado (é o iPhone). */
  | 'exige_instalacao'
  | 'ligado'
  | 'desligado'
  /** A pessoa recusou; só as configurações do navegador revertem. */
  | 'bloqueado';

const ehWeb = Platform.OS === 'web' && typeof window !== 'undefined';

function temSuporte(): boolean {
  return ehWeb && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function abertoComoApp(): boolean {
  if (!ehWeb) return false;
  return (
    (window.matchMedia?.('(display-mode: standalone)').matches ?? false) ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function noIOS(): boolean {
  return ehWeb && /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
}

function deB64Url(texto: string): Uint8Array {
  const base = texto.replace(/-/g, '+').replace(/_/g, '/');
  const cru = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
  const bytes = new Uint8Array(cru.length);
  for (let i = 0; i < cru.length; i += 1) bytes[i] = cru.charCodeAt(i);
  return bytes;
}

function paraB64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  let cru = '';
  for (const b of new Uint8Array(buffer)) cru += String.fromCharCode(b);
  return btoa(cru).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Registra o Service Worker. Chamado na abertura do aplicativo.
 *
 * REGISTRAR NÃO PEDE PERMISSÃO NENHUMA e não incomoda ninguém — é só deixar o
 * arquivo pronto. Fazer isso cedo importa porque o registro é assíncrono: se
 * só começasse no toque do botão, o primeiro toque falharia por não haver
 * Service Worker ainda, e a pessoa concluiria que o botão não funciona.
 */
export async function prepararAvisos(): Promise<void> {
  if (!temSuporte()) return;
  try {
    await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
  } catch (e) {
    console.warn('[avisos] Service Worker não registrado:', e);
    return;
  }

  /**
   * PERMISSÃO CONCEDIDA NÃO É INSCRIÇÃO GRAVADA, e tratar as duas como a mesma
   * coisa foi um defeito que o teste pegou.
   *
   * A tela lia `Notification.permission` e dizia "avisos ligados" — mas a
   * permissão mora no navegador e a inscrição mora no nosso banco. As duas se
   * separam com facilidade: o navegador troca a inscrição por conta própria, a
   * linha é apagada por uma entrega morta, a pessoa entra com outra conta no
   * mesmo aparelho. Em todos esses casos a tela afirmava que estava tudo certo
   * e nenhum aviso chegaria — o pior tipo de falha, porque ninguém vai
   * investigar o que a própria tela diz estar funcionando.
   *
   * Quem já permitiu não precisa ser perguntado de novo: dá para reinscrever em
   * silêncio, aqui na abertura.
   */
  if (Notification.permission === 'granted') {
    try {
      await garantirInscricao();
    } catch (e) {
      console.warn('[avisos] inscrição não confirmada:', e);
    }
  }
}

/**
 * Garante que a inscrição deste navegador está gravada para o usuário atual.
 *
 * Não pede permissão nenhuma: só vale quando ela já foi dada. É idempotente —
 * o `upsert` por `endpoint` faz a segunda chamada não criar linha nova.
 */
async function garantirInscricao(): Promise<boolean> {
  const registro = await navigator.serviceWorker.ready;

  const inscricao =
    (await registro.pushManager.getSubscription()) ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: deB64Url(VAPID_PUBLICA),
    }));

  const { data } = await supabase.auth.getUser();
  const usuarioId = data.user?.id;
  if (!usuarioId) return false;

  const { error } = await supabase.from('inscricoes_web_push').upsert(
    {
      usuario_id: usuarioId,
      endpoint: inscricao.endpoint,
      p256dh: paraB64Url(inscricao.getKey('p256dh')),
      auth: paraB64Url(inscricao.getKey('auth')),
      agente: window.navigator.userAgent.slice(0, 300),
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    console.warn('[avisos] inscrição não gravada:', error.message);
    return false;
  }
  return true;
}

export function estadoDosAvisos(): EstadoDosAvisos {
  if (!temSuporte()) {
    // No iPhone o suporte só APARECE depois de instalado. Dizer "indisponível"
    // ali seria mandar a pessoa desistir de algo que ela consegue ter.
    return noIOS() && !abertoComoApp() ? 'exige_instalacao' : 'indisponivel';
  }
  if (Notification.permission === 'denied') return 'bloqueado';
  if (Notification.permission === 'granted') return 'ligado';
  return 'desligado';
}

/**
 * Pede a permissão e guarda a inscrição. Devolve o estado final.
 *
 * A INSCRIÇÃO É POR APARELHO. O mesmo lojista no celular e no computador do
 * balcão tem duas, e as duas recebem — que é o que ele espera quando deixa o
 * celular no bolso e está atendendo no caixa.
 */
export async function ligarAvisos(): Promise<EstadoDosAvisos> {
  if (!temSuporte()) return estadoDosAvisos();

  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') return permissao === 'denied' ? 'bloqueado' : 'desligado';

  // Mesmo caminho da abertura: `getSubscription` antes de `subscribe`, porque
  // reinscrever com chave diferente da registrada lança erro em vez de trocar —
  // e reaproveitar devolve sempre o mesmo `endpoint`, que é a chave da tabela.
  return (await garantirInscricao()) ? 'ligado' : 'desligado';
}

/**
 * Para de receber NESTE aparelho.
 *
 * Desfaz a inscrição no navegador E apaga a linha. Apagar só a linha deixaria o
 * navegador achando que está inscrito, e o botão de ligar de novo não faria
 * nada visível — `getSubscription` devolveria a inscrição velha, sem gravar.
 */
export async function desligarAvisos(): Promise<void> {
  if (!temSuporte()) return;
  const registro = await navigator.serviceWorker.ready;
  const inscricao = await registro.pushManager.getSubscription();
  if (!inscricao) return;

  await supabase.from('inscricoes_web_push').delete().eq('endpoint', inscricao.endpoint);
  await inscricao.unsubscribe().catch(() => undefined);
}
