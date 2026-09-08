/**
 * Repositório de vendas — Seções 7.1, 7.3, 7.4, 8.1, 8.5.
 *
 * Nenhuma escrita direta em `vendas`: o cliente não tem privilégio de INSERT
 * nem UPDATE nessa tabela. Tudo passa pelas RPCs, que são a autoridade sobre
 * preço, estoque e financeiro.
 */
import type { Enums } from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';
import { observarTabelas } from '@/lib/tempoReal';

export type FormaPagamento = Enums['forma_pagamento_venda'];
export type DescontoTipo = Enums['desconto_tipo'];
export type StatusVenda = Enums['venda_status'];

/** Seção 8.1 — mensagem exata exibida quando o estoque não cobre a venda. */
export const AVISO_ESTOQUE_INSUFICIENTE = 'Quantidade insuficiente no estoque.';
/** Seção 8.2 — mensagem exata do produto não encontrado. */
export const AVISO_PRODUTO_NAO_CADASTRADO = 'Produto não cadastrado.';

export type ItemDaVenda = { produtoId: string; quantidade: number };

export type ResultadoDaVenda = {
  venda_id: string;
  subtotal: number;
  desconto: number;
  total: number;
};

/**
 * Seção 7.4, botão "Confirmar venda" — operação única e transacional:
 * grava a venda e os itens, dá baixa no estoque e lança a entrada no
 * financeiro. O app envia apenas produto e quantidade; preço e total são
 * calculados pelo servidor.
 */
export async function registrarVenda(params: {
  itens: ItemDaVenda[];
  formaPagamento: FormaPagamento;
  descontoTipo?: DescontoTipo | null;
  descontoValor?: number;
}): Promise<ResultadoDaVenda> {
  await exigirConexao();

  const { data, error } = await supabase.rpc('registrar_venda', {
    p_itens: params.itens.map((item) => ({
      produto_id: item.produtoId,
      quantidade: item.quantidade,
    })),
    p_forma_pagamento: params.formaPagamento,
    p_desconto_tipo: params.descontoTipo ?? null,
    p_desconto_valor: params.descontoValor ?? 0,
  });

  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as ResultadoDaVenda;
}

export type VendaResumo = {
  id: string;
  criado_em: string;
  total: number;
  subtotal: number;
  desconto: number;
  desconto_tipo: DescontoTipo | null;
  forma_pagamento: FormaPagamento;
  status: StatusVenda;
  usuario_id: string;
  vendedor: string | null;
  cancelada_em: string | null;
  cancelada_por: string | null;
};

type LinhaDeVenda = Omit<VendaResumo, 'vendedor'> & {
  usuarios?: { nome: string } | null;
};

const SELECAO_VENDA =
  'id, criado_em, total, subtotal, desconto, desconto_tipo, forma_pagamento, status, ' +
  'usuario_id, cancelada_em, cancelada_por, usuarios!vendas_usuario_id_fkey(nome)';

/**
 * Seção 7.1 — histórico de vendas: data, valor, funcionário responsável,
 * forma de pagamento e status. Paginado (Seção 9.2).
 */
export async function listarVendas(opcoes: {
  desde?: string;
  ate?: string;
  pagina?: number;
  porPagina?: number;
} = {}): Promise<VendaResumo[]> {
  const porPagina = opcoes.porPagina ?? 30;
  const pagina = opcoes.pagina ?? 0;

  let consulta = supabase
    .from('vendas')
    .select(SELECAO_VENDA)
    .order('criado_em', { ascending: false })
    .range(pagina * porPagina, (pagina + 1) * porPagina - 1);

  if (opcoes.desde) consulta = consulta.gte('criado_em', opcoes.desde);
  if (opcoes.ate) consulta = consulta.lte('criado_em', opcoes.ate);

  const { data, error } = await consulta;
  if (error) throw new Error(mensagemDeErro(error));

  return ((data ?? []) as unknown as LinhaDeVenda[]).map((linha) => ({
    ...linha,
    vendedor: linha.usuarios?.nome ?? null,
  }));
}

export type ItemDetalhado = {
  id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
  produto_nome: string;
};

export type VendaDetalhada = VendaResumo & {
  itens: ItemDetalhado[];
  cancelada_por_nome: string | null;
};

export async function buscarVenda(id: string): Promise<VendaDetalhada | null> {
  const [respostaVenda, respostaItens] = await Promise.all([
    supabase.from('vendas').select(SELECAO_VENDA).eq('id', id).maybeSingle(),
    supabase
      .from('venda_itens')
      .select('id, produto_id, quantidade, preco_unitario, subtotal, produtos(nome)')
      .eq('venda_id', id),
  ]);

  if (respostaVenda.error) throw new Error(mensagemDeErro(respostaVenda.error));
  if (respostaItens.error) throw new Error(mensagemDeErro(respostaItens.error));
  if (!respostaVenda.data) return null;

  const linha = respostaVenda.data as unknown as LinhaDeVenda;

  let canceladaPorNome: string | null = null;
  if (linha.cancelada_por) {
    const { data } = await supabase
      .from('usuarios')
      .select('nome')
      .eq('id', linha.cancelada_por)
      .maybeSingle();
    canceladaPorNome = data?.nome ?? null;
  }

  const itens = ((respostaItens.data ?? []) as unknown as (ItemDetalhado & {
    produtos?: { nome: string } | null;
  })[]).map((item) => ({
    id: item.id,
    produto_id: item.produto_id,
    quantidade: item.quantidade,
    preco_unitario: item.preco_unitario,
    subtotal: item.subtotal,
    produto_nome: item.produtos?.nome ?? 'Produto removido',
  }));

  return {
    ...linha,
    vendedor: linha.usuarios?.nome ?? null,
    cancelada_por_nome: canceladaPorNome,
    itens,
  };
}

/** Seção 8.5 — cancelamento direto, para quem tem `cancelar_venda`. */
export async function cancelarVenda(vendaId: string, motivo?: string | null): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('cancelar_venda', {
    p_venda_id: vendaId,
    p_motivo: motivo ?? null,
  });
  if (error) throw new Error(mensagemDeErro(error));
}

/** Seção 8.5 — solicitação, para o Funcionário sem a permissão. */
export async function solicitarCancelamento(
  vendaId: string,
  motivo?: string | null,
): Promise<string> {
  await exigirConexao();
  const { data, error } = await supabase.rpc('solicitar_cancelamento_venda', {
    p_venda_id: vendaId,
    p_motivo: motivo ?? null,
  });
  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as string;
}

export type SolicitacaoPendente = {
  id: string;
  venda_id: string;
  motivo: string | null;
  criado_em: string;
  solicitante: string | null;
  venda_total: number;
  venda_data: string;
};

/** Fila do Gestor: solicitações aguardando decisão (Seção 8.5). */
export async function listarSolicitacoesPendentes(): Promise<SolicitacaoPendente[]> {
  const { data, error } = await supabase
    .from('solicitacoes_cancelamento')
    .select(
      'id, venda_id, motivo, criado_em, ' +
        'usuarios!solicitacoes_cancelamento_solicitado_por_fkey(nome), ' +
        'vendas(total, criado_em)',
    )
    .eq('status', 'pendente')
    .order('criado_em', { ascending: false });

  if (error) throw new Error(mensagemDeErro(error));

  return ((data ?? []) as unknown as {
    id: string;
    venda_id: string;
    motivo: string | null;
    criado_em: string;
    usuarios?: { nome: string } | null;
    vendas?: { total: number; criado_em: string } | null;
  }[]).map((linha) => ({
    id: linha.id,
    venda_id: linha.venda_id,
    motivo: linha.motivo,
    criado_em: linha.criado_em,
    solicitante: linha.usuarios?.nome ?? null,
    venda_total: linha.vendas?.total ?? 0,
    venda_data: linha.vendas?.criado_em ?? linha.criado_em,
  }));
}

export async function decidirSolicitacao(
  solicitacaoId: string,
  aprovar: boolean,
): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('decidir_solicitacao_cancelamento', {
    p_solicitacao_id: solicitacaoId,
    p_aprovar: aprovar,
  });
  if (error) throw new Error(mensagemDeErro(error));
}

/** Existe solicitação pendente para esta venda? Usado nos detalhes. */
export async function solicitacaoPendenteDaVenda(vendaId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('solicitacoes_cancelamento')
    .select('id', { count: 'exact', head: true })
    .eq('venda_id', vendaId)
    .eq('status', 'pendente');

  if (error) throw new Error(mensagemDeErro(error));
  return (count ?? 0) > 0;
}

/** Seção 3.3 — o histórico reflete vendas de outros dispositivos da empresa. */
export function observarVendas(empresaId: string, aoMudar: () => void) {
  return observarTabelas({
    nome: 'vendas',
    empresaId,
    assuntos: [{ tabela: 'vendas' }, { tabela: 'solicitacoes_cancelamento' }],
    aoMudar,
  });
}
