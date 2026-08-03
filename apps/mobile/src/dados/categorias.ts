/**
 * Repositório de categorias — Seções 4.7 e 8.4.
 *
 * Categorias seguem exatamente o mesmo modelo de 3 estados dos produtos: podem
 * estar referenciadas em produtos com histórico de vendas, então nunca são
 * apagadas de verdade. Não existe política de DELETE na tabela.
 */
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';
import type { CicloVida } from './produtos';

export type Categoria = {
  id: string;
  empresa_id: string;
  nome: string;
  ciclo_vida: CicloVida;
};

export async function listarCategorias(
  empresaId: string,
  incluirArquivadas = false,
): Promise<Categoria[]> {
  let consulta = supabase
    .from('categorias_produto')
    .select('id, empresa_id, nome, ciclo_vida')
    .eq('empresa_id', empresaId)
    .neq('ciclo_vida', 'excluido')
    .order('nome', { ascending: true });

  if (!incluirArquivadas) {
    consulta = consulta.eq('ciclo_vida', 'ativo');
  }

  const { data, error } = await consulta;
  if (error) throw new Error(mensagemDeErro(error));
  return (data ?? []) as Categoria[];
}

export async function criarCategoria(empresaId: string, nome: string): Promise<string> {
  await exigirConexao();

  const { data, error } = await supabase
    .from('categorias_produto')
    .insert({ empresa_id: empresaId, nome: nome.trim() })
    .select('id')
    .single();

  if (error) throw new Error(mensagemDeErro(error));
  return data.id;
}

export async function renomearCategoria(id: string, nome: string): Promise<void> {
  await exigirConexao();
  const { error } = await supabase
    .from('categorias_produto')
    .update({ nome: nome.trim() })
    .eq('id', id);
  if (error) throw new Error(mensagemDeErro(error));
}

/** Arquivar e restaurar são updates de `ciclo_vida` — nunca DELETE (Seção 8.4). */
export async function alterarCicloDeVidaCategoria(
  id: string,
  destino: Exclude<CicloVida, never>,
): Promise<void> {
  await exigirConexao();
  const { error } = await supabase
    .from('categorias_produto')
    .update({ ciclo_vida: destino })
    .eq('id', id);
  if (error) throw new Error(mensagemDeErro(error));
}
