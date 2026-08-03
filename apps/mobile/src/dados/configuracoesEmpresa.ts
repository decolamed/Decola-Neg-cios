/**
 * Configurações da empresa — Seções 4.1, 7.9, 8.3.
 */
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

/** Seção 8.3 — opções oferecidas na interface para o alerta de estoque. */
export const PERCENTUAIS_DE_ALERTA = [50, 25, 10] as const;

/**
 * Seção 8.3 — configuração ÚNICA e geral da empresa, aplicada a todos os
 * produtos. Substitui o "estoque mínimo" absoluto por produto, que não existe
 * mais no sistema.
 *
 * `empresas.status` não é alterável por aqui: a coluna nem sequer está no
 * GRANT do cliente (Seção 6.9).
 */
export async function definirPercentualDeAlerta(
  empresaId: string,
  percentual: number,
): Promise<void> {
  await exigirConexao();

  if (!(percentual > 0 && percentual <= 100)) {
    throw new Error('O percentual de alerta deve estar entre 1 e 100.');
  }

  const { error } = await supabase
    .from('empresas')
    .update({ alerta_estoque_percentual: percentual })
    .eq('id', empresaId);

  if (error) throw new Error(mensagemDeErro(error));
}

export type DadosCadastraisDaEmpresa = {
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  chave_pix: string | null;
};

export async function salvarDadosDaEmpresa(
  empresaId: string,
  dados: DadosCadastraisDaEmpresa,
): Promise<void> {
  await exigirConexao();

  const { error } = await supabase
    .from('empresas')
    .update({
      nome: dados.nome.trim(),
      cnpj: dados.cnpj?.trim() || null,
      endereco: dados.endereco?.trim() || null,
      telefone: dados.telefone?.trim() || null,
      chave_pix: dados.chave_pix?.trim() || null,
    })
    .eq('id', empresaId);

  if (error) throw new Error(mensagemDeErro(error));
}
