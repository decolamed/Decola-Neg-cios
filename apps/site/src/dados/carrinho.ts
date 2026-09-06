/**
 * Carrinho — estado do visitante, e só dele.
 *
 * Vive no `localStorage`, por loja. Guardar carrinho no servidor exigiria
 * identificar quem é o visitante, e a vitrine é sem login de propósito. O
 * efeito colateral aceito é que o carrinho não segue para outro aparelho.
 *
 * O que o carrinho guarda é `produto_id` e `quantidade`. Nome e preço são
 * relidos da vitrine a cada abertura: um preço congelado no navegador do
 * cliente por três dias seria uma promessa que a loja não fez. O preço só
 * vira compromisso quando o pedido é criado, e aí quem congela é o banco.
 */
const CHAVE = 'decola-carrinho';

export type ItemCarrinho = { produtoId: string; quantidade: number };

type Guardado = Record<string, ItemCarrinho[]>;

function ler(): Guardado {
  try {
    const bruto = localStorage.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as Guardado) : {};
  } catch {
    // localStorage bloqueado (aba anônima, cookies desligados): o carrinho
    // simplesmente não persiste. Melhor que derrubar a vitrine inteira.
    return {};
  }
}

function gravar(dados: Guardado): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    /* idem */
  }
}

export function itensDoCarrinho(slug: string): ItemCarrinho[] {
  return ler()[slug] ?? [];
}

export function salvarCarrinho(slug: string, itens: ItemCarrinho[]): void {
  const dados = ler();
  if (itens.length === 0) delete dados[slug];
  else dados[slug] = itens;
  gravar(dados);
}

export function adicionarAoCarrinho(slug: string, produtoId: string, quantidade = 1): void {
  const itens = itensDoCarrinho(slug);
  const existente = itens.find((i) => i.produtoId === produtoId);
  if (existente) existente.quantidade += quantidade;
  else itens.push({ produtoId, quantidade });
  salvarCarrinho(slug, itens);
}

export function definirQuantidade(slug: string, produtoId: string, quantidade: number): void {
  const itens = itensDoCarrinho(slug)
    .map((i) => (i.produtoId === produtoId ? { ...i, quantidade } : i))
    .filter((i) => i.quantidade > 0);
  salvarCarrinho(slug, itens);
}

export function removerDoCarrinho(slug: string, produtoId: string): void {
  salvarCarrinho(
    slug,
    itensDoCarrinho(slug).filter((i) => i.produtoId !== produtoId),
  );
}

export function limparCarrinho(slug: string): void {
  salvarCarrinho(slug, []);
}

export function totalDeItens(slug: string): number {
  return itensDoCarrinho(slug).reduce((soma, i) => soma + i.quantidade, 0);
}
