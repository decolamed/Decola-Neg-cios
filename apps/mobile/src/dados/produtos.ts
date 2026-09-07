/**
 * Repositório de produtos e estoque — Seções 7.5, 7.6, 8.3, 8.4.
 *
 * As leituras usam a view `produtos_com_status`, que já traz o status
 * computado (disponivel/estoque_baixo/esgotado) e o percentual restante —
 * nunca recalculamos isso no app, para não divergir do banco (Seção 8.3).
 */
import type { Json } from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

export type StatusEstoque = 'disponivel' | 'estoque_baixo' | 'esgotado';
export type CicloVida = 'ativo' | 'arquivado' | 'excluido';

export type ProdutoComStatus = {
  id: string;
  empresa_id: string;
  nome: string;
  codigo: string | null;
  categoria_id: string | null;
  categoria_nome: string | null;
  preco: number;
  estoque_atual: number;
  estoque_referencia_alerta: number;
  ciclo_vida: CicloVida;
  atributos: Record<string, unknown>;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
  status_estoque: StatusEstoque;
  percentual_restante: number | null;
  descricao: string | null;
  visivel_na_loja: boolean;
  /** Unidades comprometidas com pedidos abertos da loja virtual. */
  estoque_reservado: number;
  /**
   * `estoque_atual - estoque_reservado`. É este número que `registrar_venda`
   * confere (0034) — checar `estoque_atual` na tela deixaria o app oferecer
   * uma venda que o banco recusa.
   */
  estoque_disponivel: number;
  /** Caminhos no bucket `produtos`, em ordem. A primeira é a capa. */
  imagens: string[];
};

const CAMPOS = '*';

export type FiltroDeProdutos = {
  /** Nome ou código (Seção 7.5, campo de pesquisa). */
  busca?: string;
  categoriaId?: string | null;
  /** Filtro por campos personalizados ativados pela empresa (Seção 7.5). */
  atributos?: Record<string, string>;
  /** Seção 8.4 — `excluido` nunca aparece em lista nenhuma. */
  cicloVida?: Exclude<CicloVida, 'excluido'>;
  apenasEmAlerta?: boolean;
};

/**
 * Seção 7.5 — lista da tela Estoque.
 * Produtos `excluido` são sempre omitidos: não aparecem em nenhuma lista, nem
 * na de arquivados (Seção 8.4).
 */
export async function listarProdutos(filtro: FiltroDeProdutos = {}): Promise<ProdutoComStatus[]> {
  let consulta = supabase
    .from('produtos_com_status')
    .select(CAMPOS)
    .neq('ciclo_vida', 'excluido')
    .order('nome', { ascending: true });

  consulta = consulta.eq('ciclo_vida', filtro.cicloVida ?? 'ativo');

  if (filtro.busca?.trim()) {
    const termo = filtro.busca.trim();
    // Pesquisa por nome OU código (Seção 7.5).
    consulta = consulta.or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`);
  }

  if (filtro.categoriaId) {
    consulta = consulta.eq('categoria_id', filtro.categoriaId);
  }

  // Filtro por campos personalizados: `contains` usa o índice GIN de
  // produtos.atributos (Seção 9.2).
  if (filtro.atributos && Object.keys(filtro.atributos).length > 0) {
    consulta = consulta.contains('atributos', filtro.atributos);
  }

  if (filtro.apenasEmAlerta) {
    consulta = consulta.in('status_estoque', ['estoque_baixo', 'esgotado']);
  }

  const { data, error } = await consulta;
  if (error) throw new Error(mensagemDeErro(error));
  return (data ?? []) as unknown as ProdutoComStatus[];
}

export async function buscarProduto(id: string): Promise<ProdutoComStatus | null> {
  const { data, error } = await supabase
    .from('produtos_com_status')
    .select(CAMPOS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(mensagemDeErro(error));
  return (data as unknown as ProdutoComStatus) ?? null;
}

/** Seção 7.3 / 8.2 — busca por código exato, usada pelo scanner da venda. */
export async function buscarProdutoPorCodigo(codigo: string): Promise<ProdutoComStatus | null> {
  const { data, error } = await supabase
    .from('produtos_com_status')
    .select(CAMPOS)
    .eq('codigo', codigo.trim())
    .eq('ciclo_vida', 'ativo')
    .maybeSingle();

  if (error) throw new Error(mensagemDeErro(error));
  return (data as unknown as ProdutoComStatus) ?? null;
}

export type DadosDeProduto = {
  nome: string;
  codigo: string | null;
  categoriaId: string | null;
  preco: number;
  atributos: Record<string, unknown>;
  /** Vitrine — a descrição que o cliente lê na página pública. */
  descricao: string | null;
  /** Vitrine — se o produto aparece na loja. */
  visivelNaLoja: boolean;
};

/**
 * Seção 7.5 — cadastro completo. A quantidade inicial define também a
 * referência do primeiro ciclo de alerta (Seção 8.3).
 *
 * A obrigatoriedade dos campos personalizados é validada por trigger no banco
 * (0016), não aqui: o formulário só antecipa a mensagem.
 */
export async function criarProduto(
  dados: DadosDeProduto & { empresaId: string; criadoPor: string; quantidadeInicial: number },
): Promise<string> {
  await exigirConexao();

  const { data, error } = await supabase
    .from('produtos')
    .insert({
      empresa_id: dados.empresaId,
      nome: dados.nome.trim(),
      codigo: dados.codigo?.trim() || null,
      categoria_id: dados.categoriaId,
      preco: dados.preco,
      estoque_atual: dados.quantidadeInicial,
      estoque_referencia_alerta: dados.quantidadeInicial,
      atributos: dados.atributos as Json,
      descricao: dados.descricao?.trim() || null,
      visivel_na_loja: dados.visivelNaLoja,
      criado_por: dados.criadoPor,
    })
    .select('id')
    .single();

  if (error) throw new Error(mensagemDeErro(error));
  return data.id;
}

/**
 * Edição dos dados cadastrais. O estoque NÃO é alterado aqui: mexer em
 * quantidade exige `gerenciar_estoque` e passa por `ajustarEstoque`, que é o
 * que o trigger de permissão por coluna (0008) impõe.
 */
export async function editarProduto(id: string, dados: DadosDeProduto): Promise<void> {
  await exigirConexao();

  const { error } = await supabase
    .from('produtos')
    .update({
      nome: dados.nome.trim(),
      codigo: dados.codigo?.trim() || null,
      categoria_id: dados.categoriaId,
      preco: dados.preco,
      atributos: dados.atributos as Json,
      descricao: dados.descricao?.trim() || null,
      visivel_na_loja: dados.visivelNaLoja,
    })
    .eq('id', id);

  if (error) throw new Error(mensagemDeErro(error));
}

export type TipoDeAjuste = 'reposicao' | 'divergencia' | 'reducao_manual';

export type ResultadoDeAjuste = {
  produto_id: string;
  estoque_anterior: number;
  estoque_atual: number;
  estoque_referencia_alerta: number;
};

/**
 * Seções 7.5, 7.6, 8.1 e 8.3 — único caminho para alterar quantidade.
 *
 * A RPC revalida a permissão `gerenciar_estoque`, exige motivo em qualquer
 * redução, impede estoque negativo, recalcula a referência do ciclo quando é
 * reposição e nomeia a ação na auditoria.
 */
export async function ajustarEstoque(params: {
  produtoId: string;
  quantidade: number;
  motivo?: string | null;
  tipo?: TipoDeAjuste;
}): Promise<ResultadoDeAjuste> {
  await exigirConexao();

  const { data, error } = await supabase.rpc('ajustar_estoque', {
    p_produto_id: params.produtoId,
    p_quantidade: params.quantidade,
    p_motivo: params.motivo ?? null,
    p_tipo: params.tipo ?? 'reposicao',
  });

  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as ResultadoDeAjuste;
}

/** Seção 8.4 — arquivar é reversível. */
export async function arquivarProduto(id: string): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('arquivar_produto', { p_produto_id: id });
  if (error) throw new Error(mensagemDeErro(error));
}

export async function restaurarProduto(id: string): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('restaurar_produto', { p_produto_id: id });
  if (error) throw new Error(mensagemDeErro(error));
}

/** Seção 8.4 — excluir NÃO é reversível pela interface. */
export async function excluirProduto(id: string): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('excluir_produto', { p_produto_id: id });
  if (error) throw new Error(mensagemDeErro(error));
}

/** Seção 3.3 — a lista reflete alterações de outros dispositivos da empresa. */
export function observarProdutos(empresaId: string, aoMudar: () => void) {
  const canal = supabase
    .channel(`produtos:${empresaId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'produtos', filter: `empresa_id=eq.${empresaId}` },
      aoMudar,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}
