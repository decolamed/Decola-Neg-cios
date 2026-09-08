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

/**
 * Este link viaja pelo WhatsApp, e link que viaja chega quebrado: cortado no
 * fim, com um caractere a mais colado, copiado pela metade. O banco recebe
 * `p_token uuid` e responde em inglês — `invalid input syntax for type uuid` —
 * que era o que o cliente lia na tela.
 *
 * Conferir o formato ANTES de perguntar ao banco resolve os dois lados: o
 * cliente ouve uma frase que explica o que fazer, e uma consulta inútil não
 * sai da tela.
 */
const FORMATO_DO_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LINK_QUEBRADO =
  'Este link de acompanhamento está incompleto. Confira se ele foi copiado inteiro — ' +
  'às vezes o WhatsApp corta o endereço no fim da mensagem.';

export async function consultarPedido(token: string): Promise<PedidoConsultado> {
  if (!FORMATO_DO_TOKEN.test(token.trim())) throw new Error(LINK_QUEBRADO);

  const { data, error } = await supabase.rpc('vitrine_consultar_pedido', {
    p_token: token.trim(),
  });

  if (error) {
    // 22P02 é o banco recusando o formato do token. Só chega aqui se o formato
    // passar pela conferência acima e ainda assim ser recusado; a frase para o
    // cliente é a mesma, porque o problema é o mesmo.
    if (error.code === '22P02') throw new Error(LINK_QUEBRADO);
    throw new Error(error.message || 'Pedido não encontrado.');
  }

  // A função devolve o pedido inteiro ou levanta erro — nunca um pedaço. Se
  // mesmo assim vier algo sem `loja`, a tela quebrava em branco ao ler
  // `pedido.loja.nome`, e tela branca não diz nada a quem está esperando a
  // encomenda. Melhor a mesma frase de "não encontrado".
  const pedido = data as unknown as PedidoConsultado | null;
  if (!pedido || typeof pedido !== 'object' || !pedido.loja) {
    throw new Error('Pedido não encontrado.');
  }
  return pedido;
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
