/**
 * Criação e acompanhamento de pedido — as duas RPCs abertas ao `anon`.
 *
 * Nenhuma validação daqui é definitiva: disponibilidade, chave Pix, ciência do
 * frete e endereço são revalidados no banco. O que a tela faz é evitar que a
 * pessoa descubra o problema só no fim.
 */
import { supabase } from '@/lib/supabase';

export type Modalidade = 'retirada' | 'entrega';
export type FormaPagamento = 'pix_online' | 'na_retirada' | 'a_combinar';

export type PedidoCriado = {
  pedido_id: string;
  numero: number;
  token: string;
  status: string;
  subtotal: number;
};

export type ItemPedido = {
  nome: string;
  quantidade: number;
  preco: number;
  subtotal: number;
};

export type PedidoConsultado = {
  numero: number;
  status: string;
  modalidade: Modalidade;
  pagamento: FormaPagamento;
  cliente_nome: string;
  endereco_entrega: string | null;
  subtotal: number;
  criado_em: string;
  loja: {
    nome: string;
    whatsapp: string | null;
    endereco: string | null;
    chave_pix: string | null;
  };
  itens: ItemPedido[];
};

export async function criarPedido(dados: {
  slug: string;
  itens: { produtoId: string; quantidade: number }[];
  nome: string;
  telefone: string;
  modalidade: Modalidade;
  pagamento: FormaPagamento;
  endereco?: string;
  cienteCustoEntrega?: boolean;
  observacao?: string;
}): Promise<PedidoCriado> {
  const { data, error } = await supabase.rpc('vitrine_criar_pedido', {
    p_loja_slug: dados.slug,
    p_itens: dados.itens.map((i) => ({ produto_id: i.produtoId, quantidade: i.quantidade })),
    p_cliente_nome: dados.nome,
    p_cliente_telefone: dados.telefone,
    p_modalidade: dados.modalidade,
    p_pagamento: dados.pagamento,
    p_endereco: dados.endereco ?? null,
    p_ciente_custo_entrega: dados.cienteCustoEntrega ?? false,
    p_observacao: dados.observacao ?? null,
  });

  // A mensagem do banco é escrita para o cliente final ("Restam apenas 2
  // unidade(s) de…"), então repassá-la é melhor que traduzir aqui.
  if (error) throw new Error(error.message || 'Não foi possível enviar seu pedido.');
  return data as unknown as PedidoCriado;
}

export async function consultarPedido(token: string): Promise<PedidoConsultado> {
  const { data, error } = await supabase.rpc('vitrine_consultar_pedido', { p_token: token });
  if (error) throw new Error(error.message || 'Pedido não encontrado.');
  return data as unknown as PedidoConsultado;
}

/** Rótulos que o CLIENTE vê. O gestor tem os seus, na área interna. */
export const ROTULO_STATUS: Record<string, string> = {
  aguardando_pagamento: 'Aguardando confirmação do pagamento',
  pagamento_confirmado: 'Pagamento confirmado — aguardando retirada',
  pagamento_na_retirada: 'Você paga na retirada',
  pronto_para_retirada: 'Pronto para retirada',
  aguardando_negociacao: 'Aguardando combinar a entrega',
  entrega_combinada: 'Entrega combinada',
  confirmado: 'Pedido confirmado',
  em_entrega: 'Saiu para entrega',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

/**
 * Link do WhatsApp com a mensagem pronta.
 *
 * O número do banco pode vir com máscara; a API só aceita dígitos. O DDI 55 é
 * assumido quando faltar, que é o caso de quem digita "11 98888-7777".
 */
export function linkWhatsApp(numero: string, mensagem: string): string {
  let digitos = numero.replace(/\D/g, '');
  if (digitos.length <= 11) digitos = `55${digitos}`;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

export function mensagemDeEntrega(numero: number): string {
  return (
    `Olá! Acabei de realizar uma solicitação de pedido pela loja virtual (#${numero}). ` +
    'Gostaria de combinar os detalhes da entrega e verificar o valor do transporte.'
  );
}
