/**
 * Vitrine pública — leitura anônima.
 *
 * Tudo aqui passa por `vitrine_lojas` e `vitrine_produtos`, as duas views que
 * o papel `anon` enxerga. Nenhuma consulta toca `produtos` ou `empresas`
 * direto: o recorte do que é público mora no banco, não nesta camada.
 */
import { supabase } from '@/lib/supabase';

export type BannerDaLoja = {
  caminho: string;
  link?: string;
};

export type Loja = {
  id: string;
  slug: string;
  /** Já resolvido pela view: o nome de exibição, ou a razão social. */
  nome: string;
  descricao: string | null;
  logo_url: string | null;
  whatsapp: string | null;
  endereco: string | null;
  /** Só o usuário, sem @ — quem monta o endereço é o site. */
  instagram: string | null;
  aceita_pix: boolean;
  /** Cor escolhida pelo lojista (0043). Nula = a cor da plataforma. */
  loja_cor: string | null;
  /** Já vem vazio quando o carrossel está desligado — a view resolve isso. */
  banners: BannerDaLoja[];
};

/**
 * Texto legível sobre a cor do lojista, decidido pela luminância.
 *
 * A cor é escolha dele; o contraste não pode ser. Sem isto, um amarelo
 * escolhido com boa intenção produziria um topo branco-sobre-claro que ninguém
 * lê — e a vitrine é a página onde ele vende.
 *
 * Coeficientes da recomendação de luminância relativa da W3C.
 */
export function textoSobre(cor: string): string {
  const hex = cor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#01395E' : '#FFFFFF';
}

/** Caminho no bucket `loja` → URL pública. Logo e banners moram lá. */
export function urlDaLoja(caminho: string): string {
  if (/^https?:\/\//.test(caminho)) return caminho;
  return supabase.storage.from('loja').getPublicUrl(caminho).data.publicUrl;
}

export type ProdutoVitrine = {
  id: string;
  nome: string;
  descricao: string | null;
  preco: number;
  imagens: string[];
  /** `estoque_atual - estoque_reservado`, calculado pela view. */
  disponivel: number;
  categoria_id: string | null;
  categoria_nome: string | null;
  /** Escolha do lojista sobre o que a loja mostra primeiro. */
  destaque: boolean;
  /**
   * Só os campos que o gestor marcou como visíveis na loja, já com o rótulo
   * dele — `{ "Tamanho (PP a XGG)": "M", "Cor": "Preto" }`. A view resolve o
   * recorte; aqui não há nada a filtrar.
   */
  atributos: Record<string, unknown>;
};

export type CategoriaVitrine = {
  id: string;
  nome: string;
  /** Quantos produtos à mostra. Categoria vazia não chega até aqui. */
  produtos: number;
  /** Caminho da foto emprestada do primeiro produto, ou nulo. */
  capa: string | null;
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
    .select('id, nome, descricao, preco, imagens, disponivel, categoria_id, categoria_nome, destaque, atributos')
    .ilike('loja_slug', slug)
    .order('nome');

  if (error) throw new Error(ERRO_LOJA);

  return (data ?? []).map(normalizarProduto);
}

/**
 * Categorias com produto à mostra, na ordem em que a loja deve exibi-las:
 * as com mais produtos primeiro. Uma categoria com um item só no topo faz a
 * loja parecer vazia logo na abertura.
 */
export async function listarCategorias(slug: string): Promise<CategoriaVitrine[]> {
  const { data, error } = await supabase
    .from('vitrine_categorias')
    .select('id, nome, produtos, capa')
    .ilike('loja_slug', slug)
    .order('produtos', { ascending: false })
    .order('nome');

  if (error) throw new Error(ERRO_LOJA);

  return (data ?? []).map((linha) => ({
    ...(linha as CategoriaVitrine),
    produtos: Number((linha as { produtos: number }).produtos),
  }));
}

/** A view devolve `preco` como texto e `imagens`/`atributos` como jsonb. */
function normalizarProduto(linha: unknown): ProdutoVitrine {
  const bruto = linha as ProdutoVitrine & { preco: number | string };
  return {
    ...bruto,
    preco: Number(bruto.preco),
    imagens: Array.isArray(bruto.imagens) ? bruto.imagens : [],
    atributos:
      bruto.atributos && typeof bruto.atributos === 'object' ? bruto.atributos : {},
  };
}

export async function carregarProduto(
  slug: string,
  produtoId: string,
): Promise<ProdutoVitrine | null> {
  const { data, error } = await supabase
    .from('vitrine_produtos')
    .select('id, nome, descricao, preco, imagens, disponivel, categoria_id, categoria_nome, destaque, atributos')
    .ilike('loja_slug', slug)
    .eq('id', produtoId)
    .maybeSingle();

  if (error) throw new Error(ERRO_LOJA);
  if (!data) return null;
  return normalizarProduto(data);
}

/**
 * Texto sem acento e em minúsculas, para a busca casar "cafe" com "Café".
 * A busca acontece no navegador, sobre a lista que a loja já carregou: ela é
 * instantânea, não pisca e não gasta uma ida ao servidor por letra digitada.
 */
export function normalizarBusca(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function filtrarProdutos(produtos: ProdutoVitrine[], termo: string): ProdutoVitrine[] {
  const alvo = normalizarBusca(termo);
  if (!alvo) return produtos;

  return produtos.filter((produto) => {
    const texto = normalizarBusca(
      [produto.nome, produto.descricao ?? '', produto.categoria_nome ?? '',
       Object.values(produto.atributos).join(' ')].join(' '),
    );
    return alvo.split(/\s+/).every((palavra) => texto.includes(palavra));
  });
}

/** Endereço do perfil no Instagram a partir do usuário guardado. */
export function urlDoInstagram(usuario: string): string {
  return `https://instagram.com/${usuario.replace(/^@/, '')}`;
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
