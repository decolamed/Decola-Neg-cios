/**
 * "Meus pedidos" — os dois caminhos de volta para um pedido.
 *
 * O PROBLEMA. O único caminho de volta a um pedido era o link recebido. Quem
 * apagava a conversa do WhatsApp perdia o pedido de vista, e ligava para a
 * loja perguntando.
 *
 * DOIS CAMINHOS, DE PROPÓSITO:
 *
 * 1. ESTE APARELHO — os pedidos feitos neste navegador, guardados aqui mesmo.
 *    Funciona sem digitar nada e sem depender de serviço nenhum. É o caminho
 *    que atende quase todo mundo, porque quase todo mundo volta pelo mesmo
 *    celular em que comprou.
 *
 * 2. ENTRAR COM O TELEFONE — para quem trocou de aparelho, limpou o navegador
 *    ou comprou pelo computador e quer ver no celular. Aqui não basta DIGITAR
 *    o número: o Supabase Auth manda um código por SMS e só emite a sessão
 *    depois da confirmação. Sem isso, bastaria teclar o número do vizinho para
 *    ver o que ele comprou e onde mora — e a RPC no banco recusa exatamente
 *    por isso: ela lê o telefone de dentro do token, não do que foi digitado.
 *
 * O CAMINHO 2 EXIGE UM PROVEDOR DE SMS ligado no Supabase (Twilio e afins),
 * que é serviço pago por mensagem. Enquanto não houver, o Auth responde com
 * erro e a tela explica em português em vez de falhar em silêncio — o caminho
 * 1 continua inteiro.
 */
import { supabase } from '@/lib/supabase';

/* ===================================================== este aparelho ==== */

const CHAVE = 'decola-meus-pedidos';

export type PedidoLocal = {
  token: string;
  numero: number;
  slug: string;
  criadoEm: string;
};

function lerLocais(): PedidoLocal[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const lista = bruto ? (JSON.parse(bruto) as PedidoLocal[]) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    // Aba anônima ou cookies desligados: o histórico simplesmente não existe.
    return [];
  }
}

/** Guarda o pedido recém-criado. Chamado uma vez, no fim do checkout. */
export function lembrarPedido(pedido: PedidoLocal): void {
  try {
    const lista = lerLocais().filter((p) => p.token !== pedido.token);
    lista.unshift(pedido);
    // Vinte é bastante para qualquer cliente e mantém o `localStorage` pequeno.
    localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, 20)));
  } catch {
    /* idem */
  }
}

export function pedidosDesteAparelho(slug?: string): PedidoLocal[] {
  const lista = lerLocais();
  return slug ? lista.filter((p) => p.slug.toLowerCase() === slug.toLowerCase()) : lista;
}

/* ==================================================== entrar por SMS ==== */

export type PedidoDoCliente = {
  numero: number;
  token: string;
  status: string;
  modalidade: 'retirada' | 'entrega';
  pagamento: 'pix_online' | 'na_retirada' | 'a_combinar';
  subtotal: number;
  criado_em: string;
  loja_nome: string;
  loja_slug: string;
  itens: number;
};

/**
 * Telefone no formato que o Auth espera: E.164 com o "+".
 * Devolve `null` quando o que foi digitado não é um celular brasileiro.
 */
export function telefoneParaAuth(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, '');
  const semPais =
    digitos.length > 11 && digitos.startsWith('55') ? digitos.slice(2) : digitos;

  // Celular: DDD + 9 dígitos começando em 9. Só celular recebe SMS.
  if (semPais.length !== 11 || !semPais.startsWith('9', 2)) return null;
  const ddd = Number(semPais.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;

  return `+55${semPais}`;
}

const SEM_SMS =
  'O envio de código por SMS ainda não está ligado nesta loja. ' +
  'Use o link que você recebeu ao fazer o pedido, ou fale com a loja pelo WhatsApp.';

/** Traduz as recusas do Auth, que chegam em inglês e sem contexto. */
function traduzirErro(mensagem: string): string {
  const texto = mensagem.toLowerCase();
  if (texto.includes('sms provider') || texto.includes('provider') || texto.includes('unsupported')) {
    return SEM_SMS;
  }
  if (texto.includes('rate') || texto.includes('too many') || texto.includes('security purposes')) {
    return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  }
  if (texto.includes('invalid') && texto.includes('token')) {
    return 'Código incorreto ou vencido. Peça um novo código.';
  }
  if (texto.includes('expired')) return 'O código venceu. Peça um novo.';
  if (texto.includes('phone')) return 'Não foi possível usar este número. Confira o DDD e o 9.';
  return 'Não foi possível concluir agora. Tente novamente em instantes.';
}

export async function enviarCodigo(telefone: string): Promise<void> {
  const numero = telefoneParaAuth(telefone);
  if (!numero) {
    throw new Error('Informe um celular com DDD, como (81) 99999-9999.');
  }

  const { error } = await supabase.auth.signInWithOtp({ phone: numero });
  if (error) throw new Error(traduzirErro(error.message));
}

export async function confirmarCodigo(telefone: string, codigo: string): Promise<void> {
  const numero = telefoneParaAuth(telefone);
  if (!numero) throw new Error('Informe um celular com DDD.');
  if (codigo.trim().length < 4) throw new Error('Digite o código que você recebeu.');

  const { error } = await supabase.auth.verifyOtp({
    phone: numero,
    token: codigo.trim(),
    type: 'sms',
  });
  if (error) throw new Error(traduzirErro(error.message));
}

export async function sairDaConta(): Promise<void> {
  await supabase.auth.signOut();
}

/** O telefone verificado da sessão, ou `null` se ninguém entrou. */
export async function telefoneConectado(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.phone ?? null;
}

/**
 * Pedidos do telefone verificado.
 *
 * Sem `slug`, traz os de todas as lojas: é a mesma pessoa, e ela não deveria
 * precisar lembrar por qual link comprou.
 */
export async function listarMeusPedidos(slug?: string): Promise<PedidoDoCliente[]> {
  const { data, error } = await supabase.rpc('vitrine_meus_pedidos', {
    p_loja_slug: slug ?? null,
  });

  if (error) {
    // 42501 é a recusa proposital de quem não tem telefone verificado.
    if (error.code === '42501') throw new Error('Entre com seu telefone para ver seus pedidos.');
    throw new Error('Não foi possível carregar seus pedidos. Tente novamente.');
  }

  return (data as unknown as PedidoDoCliente[]) ?? [];
}
