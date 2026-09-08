/**
 * Pedidos da loja virtual — lado do gestor.
 *
 * Leitura direta (a RLS de `pedidos` já limita à empresa do vínculo) e
 * escrita SEMPRE por RPC: nenhuma tabela de pedido tem verbo de escrita para
 * papel de cliente. Confirmar pagamento, avançar status, cancelar e finalizar
 * revalidam papel, estado da conta e transição no servidor.
 */
import type { Enums, Pedido, PedidoItem } from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

export type StatusPedido = Enums['pedido_status'];
/** Como o cliente escolheu pagar, lá na vitrine. */
export type PagamentoPedido = Enums['pedido_pagamento'];
/** Como o dinheiro de fato entrou — o que vai para a venda e o relatório. */
export type FormaPagamento = Enums['forma_pagamento_venda'];

export type PedidoComItens = Pedido & { itens: PedidoItem[] };

/**
 * As formas oferecidas ao finalizar um pedido pago fora da vitrine.
 *
 * São as mesmas da venda no balcão, de propósito: é o mesmo dinheiro entrando
 * pela mesma porta, e o relatório soma os dois lados.
 */
export const FORMAS_DE_PAGAMENTO: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'pix', rotulo: 'Pix' },
  { valor: 'cartao', rotulo: 'Cartão' },
  { valor: 'outros', rotulo: 'Outros' },
];

/** Rótulos do GESTOR — diferentes dos que o cliente vê na vitrine. */
export const ROTULO_STATUS: Record<StatusPedido, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  pagamento_confirmado: 'Pago — aguardando retirada',
  pagamento_na_retirada: 'Paga na retirada',
  pronto_para_retirada: 'Pronto para retirada',
  aguardando_negociacao: 'Combinar entrega',
  entrega_combinada: 'Entrega combinada',
  confirmado: 'Confirmado',
  em_entrega: 'Em entrega',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

/**
 * O que fazer a seguir, por status.
 *
 * `null` significa que o próximo passo não é avançar — é finalizar, e a tela
 * mostra o botão próprio para isso. Espelha as transições da RPC
 * `pedido_atualizar_status`: se divergirem, o banco recusa e a tela mente.
 */
export const PROXIMO_PASSO: Partial<Record<StatusPedido, { status: StatusPedido; rotulo: string }>> =
  {
    pagamento_confirmado: { status: 'pronto_para_retirada', rotulo: 'Marcar como pronto' },
    pagamento_na_retirada: { status: 'pronto_para_retirada', rotulo: 'Marcar como pronto' },
    aguardando_negociacao: { status: 'entrega_combinada', rotulo: 'Entrega combinada' },
    entrega_combinada: { status: 'confirmado', rotulo: 'Confirmar pedido' },
    confirmado: { status: 'em_entrega', rotulo: 'Saiu para entrega' },
  };

export const EM_ABERTO: StatusPedido[] = [
  'aguardando_pagamento',
  'pagamento_confirmado',
  'pagamento_na_retirada',
  'pronto_para_retirada',
  'aguardando_negociacao',
  'entrega_combinada',
  'confirmado',
  'em_entrega',
];

export async function listarPedidos(filtro: 'abertos' | 'todos'): Promise<Pedido[]> {
  await exigirConexao();

  let consulta = supabase.from('pedidos').select('*').order('criado_em', { ascending: false });
  if (filtro === 'abertos') consulta = consulta.in('status', EM_ABERTO);

  const { data, error } = await consulta;
  if (error) throw new Error(mensagemDeErro(error));
  return data ?? [];
}

export async function carregarPedido(id: string): Promise<PedidoComItens | null> {
  await exigirConexao();

  const { data, error } = await supabase.from('pedidos').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(mensagemDeErro(error));
  if (!data) return null;

  const { data: itens, error: erroItens } = await supabase
    .from('pedido_itens')
    .select('*')
    .eq('pedido_id', id)
    .order('nome_produto');

  if (erroItens) throw new Error(mensagemDeErro(erroItens));
  return { ...data, itens: itens ?? [] };
}

export async function confirmarPagamento(pedidoId: string): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('pedido_confirmar_pagamento', { p_pedido_id: pedidoId });
  if (error) throw new Error(mensagemDeErro(error));
}

export async function avancarStatus(pedidoId: string, status: StatusPedido): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('pedido_atualizar_status', {
    p_pedido_id: pedidoId,
    p_status: status,
  });
  if (error) throw new Error(mensagemDeErro(error));
}

export async function cancelarPedido(pedidoId: string, motivo: string): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('pedido_cancelar', {
    p_pedido_id: pedidoId,
    p_motivo: motivo,
  });
  if (error) throw new Error(mensagemDeErro(error));
}

/**
 * Finalizar é o que transforma o pedido em venda: baixa o estoque, lança o
 * financeiro e libera a reserva. Daí ter função própria, e não ser mais um
 * status na lista de transições.
 *
 * A FORMA DE PAGAMENTO PRECISA VIR JUNTO.
 *
 * A RPC sempre aceitou `p_forma_pagamento`, e o aplicativo nunca mandava. Sem
 * ela, o banco usa a reserva: `pix` quando o pedido foi pago pela vitrine, e
 * `outros` em TODO o resto. Como quase todo pedido de retirada é pago no
 * balcão, o resultado era um histórico de vendas e um relatório em que a loja
 * virtual inteira aparecia como "Outros" — o lojista deixava de saber quanto
 * entrou em dinheiro e quanto em cartão, que é metade da razão de olhar o
 * relatório.
 */
export async function finalizarPedido(
  pedidoId: string,
  formaPagamento?: FormaPagamento,
): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('pedido_finalizar', {
    p_pedido_id: pedidoId,
    p_forma_pagamento: formaPagamento ?? null,
  });
  if (error) throw new Error(mensagemDeErro(error));
}

/**
 * O pedido pago pela vitrine já sabe a resposta — foi Pix, e perguntar seria
 * burocracia. Os outros foram pagos na mão do lojista, e só ele sabe como.
 */
export function precisaEscolherFormaDePagamento(pedido: { pagamento: PagamentoPedido }): boolean {
  return pedido.pagamento !== 'pix_online';
}

/** Link para falar com o cliente pelo WhatsApp, com o pedido já citado. */
export function whatsappDoCliente(telefone: string, numero: number): string {
  let digitos = telefone.replace(/\D/g, '');
  if (digitos.length <= 11) digitos = `55${digitos}`;
  const texto = `Olá! Aqui é da loja, sobre o seu pedido #${numero}.`;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}
