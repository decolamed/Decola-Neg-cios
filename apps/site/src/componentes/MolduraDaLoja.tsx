/**
 * A moldura comum das telas da loja: cor do lojista, conteúdo e barra de
 * navegação com o contador do carrinho sempre certo.
 *
 * Existe para que nenhuma tela precise lembrar de três coisas ao mesmo tempo.
 * Antes, cada página montava as cores por conta própria e decidia sozinha se
 * mostrava a barra — e bastava esquecer numa para o cliente ficar sem saída
 * naquela tela.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { BarraDaLoja, CoresDaLoja } from '@/componentes/Loja';
import { observarCarrinho, totalDeItens } from '@/dados/carrinho';
import type { Loja } from '@/dados/loja';

/** Quantos itens há no carrinho desta loja, acompanhando as mudanças. */
export function useItensNoCarrinho(slug: string): number {
  const [total, setTotal] = useState(() => totalDeItens(slug));

  useEffect(() => {
    const atualizar = () => setTotal(totalDeItens(slug));
    atualizar();
    return observarCarrinho(atualizar);
  }, [slug]);

  return total;
}

export function MolduraDaLoja({
  loja,
  children,
  /** `true` nas telas de fluxo (checkout, pedido) onde a barra distrai. */
  semBarra = false,
}: {
  loja: Loja;
  children: ReactNode;
  semBarra?: boolean;
}) {
  const itens = useItensNoCarrinho(loja.slug);

  return (
    <CoresDaLoja loja={loja}>
      <div className={semBarra ? undefined : 'com-barra-inferior'}>{children}</div>
      {semBarra ? null : <BarraDaLoja slug={loja.slug} itensNoCarrinho={itens} />}
    </CoresDaLoja>
  );
}
