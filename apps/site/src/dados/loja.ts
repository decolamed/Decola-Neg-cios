/**
 * Vitrine pública — leitura anônima.
 *
 * Tudo aqui passa por `vitrine_lojas` e `vitrine_produtos`, as duas views que
 * o papel `anon` enxerga. Nenhuma consulta toca `produtos` ou `empresas`
 * direto: o recorte do que é público mora no banco, não nesta camada.
 */
import { supabase } from '@/lib/supabase';

export type Loja = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  logo_url: string | null;
  whatsapp: string | null;
  endereco: string | null;
  aceita_pix: boolean;
};

export type ProdutoVitrine = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  imagens: string[];
  /** `estoque_atual - estoque_reservado`, calculado pela view. */
  disponivel: number;
};

const ERRO_LOJA = 'Não foi possível carregar esta loja. Tente novamente.';

export async function carregarLoja(slug: string): Promise<Loja | null> {
  const { data, error } = await supabase
    .from('vitrine_lojas')
    .select('*')
    .ilike('slug', slug)
    .maybeSingle();

  if (error) throw new Error(ERRO_LOJA);
  return (data as Loja | null) ?? null;
}

export async function listarProdutos(slug: string): Promise<ProdutoVitrine[]> {
  const { data, error } = await supabase
    .from('vitrine_produtos')
    .select('id, nome, descricao, preco, imagens, disponivel')
    .ilike('loja_slug', slug)
    .order('nome');

  if (error) throw new Error(ERRO_LOJA);

  return (data ?? []).map((linha) => ({
    ...(linha as ProdutoVitrine),
    preco: Number((linha as { preco: number }).preco),
    imagens: Array.isArray((linha as { imagens: unknown }).imagens)
      ? ((linha as { imagens: string[] }).imagens ?? [])
      : [],
  }));
}

export async function carregarProduto(
  slug: string,
  produtoId: string,
): Promise<ProdutoVitrine | null> {
  const { data, error } = await supabase
    .from('vitrine_produtos')
    .select('id, nome, descricao, preco, imagens, disponivel')
    .ilike('loja_slug', slug)
    .eq('id', produtoId)
    .maybeSingle();

  if (error) throw new Error(ERRO_LOJA);
  if (!data) return null;

  return {
    ...(data as ProdutoVitrine),
    preco: Number((data as { preco: number }).preco),
    imagens: Array.isArray((data as { imagens: unknown }).imagens)
      ? ((data as { imagens: string[] }).imagens ?? [])
      : [],
  };
}

/**
 * Caminho da imagem → URL pública do Storage.
 *
 * `imagens` guarda o caminho dentro do bucket, não a URL inteira: assim a
 * troca de domínio do Storage não obriga a reescrever linha de produto.
 */
export function urlDaImagem(caminho: string): string {
  if (/^https?:\/\//.test(caminho)) return caminho;
  return supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl;
}

export function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
