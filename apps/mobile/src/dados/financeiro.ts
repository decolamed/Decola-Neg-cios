/**
 * Repositório financeiro e de relatórios — Seções 7.7, 8.6, 10.2, 10.3.
 *
 * A agregação roda no banco (RPCs de 0024): "todos os relatórios e gráficos
 * são derivados por agregação... nenhum dado de relatório é armazenado
 * separadamente" (Seção 10.2). O app nunca soma histórico no dispositivo.
 */
import type { Enums } from '@decola/types';
import { CHAVE_PUBLICA, URL_FUNCOES, supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';
import { observarTabelas } from '@/lib/tempoReal';

export type TipoMovimentacao = Enums['movimentacao_tipo'];
export type OrigemMovimentacao = Enums['movimentacao_origem'];

export type Movimentacao = {
  id: string;
  tipo: TipoMovimentacao;
  valor: number;
  descricao: string;
  categoria: string | null;
  origem: OrigemMovimentacao;
  venda_id: string | null;
  data_movimentacao: string;
  criado_em: string;
};

export type ResumoFinanceiro = {
  total_vendido: number;
  quantidade_vendas: number;
  ticket_medio: number;
  entradas: number;
  saidas: number;
  saldo: number;
};

/** Seção 8.6 — resumo principal, sempre por agregação em tempo real. */
export async function carregarResumo(desde: Date, ate: Date): Promise<ResumoFinanceiro> {
  const { data, error } = await supabase.rpc('resumo_financeiro', {
    p_desde: desde.toISOString(),
    p_ate: ate.toISOString(),
  });

  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as ResumoFinanceiro;
}

export async function listarMovimentacoes(desde: Date, ate: Date): Promise<Movimentacao[]> {
  const { data, error } = await supabase
    .from('movimentacoes_financeiras')
    .select('id, tipo, valor, descricao, categoria, origem, venda_id, data_movimentacao, criado_em')
    .gte('data_movimentacao', desde.toISOString().slice(0, 10))
    .lte('data_movimentacao', ate.toISOString().slice(0, 10))
    .order('data_movimentacao', { ascending: false })
    .order('criado_em', { ascending: false })
    .limit(200);

  if (error) throw new Error(mensagemDeErro(error));
  return (data ?? []) as Movimentacao[];
}

/**
 * Seção 8.6 — categorias customizáveis: texto livre com sugestões das
 * categorias já usadas pela empresa, em vez de lista fixa do sistema.
 */
export async function sugestoesDeCategoria(): Promise<string[]> {
  const { data, error } = await supabase.rpc('categorias_financeiras_usadas');
  if (error) throw new Error(mensagemDeErro(error));
  return (data as unknown as string[]) ?? [];
}

export type DadosDoLancamento = {
  tipo: TipoMovimentacao;
  valor: number;
  descricao: string;
  categoria: string | null;
  data: string;
};

/**
 * Seção 8.6 — lançamento manual do Gestor (despesas, entradas avulsas).
 * `origem` e autoria são impostas pelo trigger de integridade (0023): o app
 * não consegue forjar um lançamento de venda.
 */
export async function criarLancamento(
  empresaId: string,
  dados: DadosDoLancamento,
): Promise<string> {
  await exigirConexao();

  const { data, error } = await supabase
    .from('movimentacoes_financeiras')
    .insert({
      empresa_id: empresaId,
      tipo: dados.tipo,
      valor: dados.valor,
      descricao: dados.descricao.trim(),
      categoria: dados.categoria?.trim() || null,
      origem: 'manual',
      data_movimentacao: dados.data,
    })
    .select('id')
    .single();

  if (error) throw new Error(mensagemDeErro(error));
  return data.id;
}

/** Seção 8.6 — edição permitida apenas em lançamento manual, com auditoria. */
export async function editarLancamento(id: string, dados: DadosDoLancamento): Promise<void> {
  await exigirConexao();

  const { error } = await supabase
    .from('movimentacoes_financeiras')
    .update({
      tipo: dados.tipo,
      valor: dados.valor,
      descricao: dados.descricao.trim(),
      categoria: dados.categoria?.trim() || null,
      data_movimentacao: dados.data,
    })
    .eq('id', id);

  if (error) throw new Error(mensagemDeErro(error));
}

export async function excluirLancamento(id: string): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.from('movimentacoes_financeiras').delete().eq('id', id);
  if (error) throw new Error(mensagemDeErro(error));
}

export async function buscarLancamento(id: string): Promise<Movimentacao | null> {
  const { data, error } = await supabase
    .from('movimentacoes_financeiras')
    .select('id, tipo, valor, descricao, categoria, origem, venda_id, data_movimentacao, criado_em')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(mensagemDeErro(error));
  return (data as Movimentacao) ?? null;
}

// =============================================================================
// Relatórios — Seção 10.2
// =============================================================================

export type Relatorio = {
  periodo: { desde: string; ate: string };
  totais: {
    total_vendido: number;
    quantidade_vendas: number;
    ticket_medio: number;
    desconto_concedido: number;
  };
  periodo_anterior: { total_vendido: number; quantidade_vendas: number };
  evolucao: { dia: string; total: number; quantidade: number }[];
  produtos_mais_vendidos: { produto_id: string; nome: string; quantidade: number; total: number }[];
  formas_pagamento: { forma: string; total: number; quantidade: number }[];
  por_funcionario: { usuario_id: string; nome: string; total: number; quantidade: number }[];
  canceladas: { quantidade: number; total: number };
};

export async function carregarRelatorio(desde: Date, ate: Date): Promise<Relatorio> {
  const { data, error } = await supabase.rpc('relatorio_vendas', {
    p_desde: desde.toISOString(),
    p_ate: ate.toISOString(),
  });

  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as Relatorio;
}

export type ColunasDoRelatorio = {
  funcionario: boolean;
  formaPagamento: boolean;
  produtos: boolean;
  quantidade: boolean;
};

/**
 * Seção 10.3 — a geração do arquivo é do BACKEND. O app só pede e recebe os
 * bytes prontos; nenhuma formatação de PDF/planilha acontece no dispositivo.
 *
 * A Edge Function roda com o JWT do usuário, então a permissão
 * `exportar_relatorios` é revalidada lá dentro pela própria RPC de agregação.
 */
export async function exportarRelatorio(params: {
  formato: 'pdf' | 'csv';
  desde: Date;
  ate: Date;
  colunas: ColunasDoRelatorio;
}): Promise<{ conteudo: string; nomeArquivo: string; mimeType: string }> {
  await exigirConexao();

  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente para exportar.');

  const url = `${URL_FUNCOES}/exportar-relatorio`;

  const resposta = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: CHAVE_PUBLICA,
    },
    body: JSON.stringify({
      formato: params.formato,
      desde: params.desde.toISOString(),
      ate: params.ate.toISOString(),
      colunas: params.colunas,
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.json().catch(() => null);
    throw new Error(detalhe?.error ?? 'Não foi possível gerar o relatório. Tente novamente.');
  }

  const sufixo = params.desde.toISOString().slice(0, 10);

  if (params.formato === 'pdf') {
    // Base64 é o formato que o sistema de arquivos do Expo grava como binário.
    const buffer = await resposta.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binario = '';
    for (let i = 0; i < bytes.length; i += 1) binario += String.fromCharCode(bytes[i]);

    return {
      conteudo: btoa(binario),
      nomeArquivo: `relatorio-${sufixo}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  return {
    conteudo: await resposta.text(),
    nomeArquivo: `relatorio-${sufixo}.csv`,
    mimeType: 'text/csv',
  };
}

/** Seção 3.3 — o financeiro reflete vendas e lançamentos de outros dispositivos. */
export function observarFinanceiro(empresaId: string, aoMudar: () => void) {
  return observarTabelas({
    nome: 'financeiro',
    empresaId,
    assuntos: [{ tabela: 'movimentacoes_financeiras' }],
    aoMudar,
  });
}
