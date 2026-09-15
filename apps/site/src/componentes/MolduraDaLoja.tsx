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
import { BarraDaLoja, BarraDaMarca, CoresDaLoja, RodapeDaLoja } from '@/componentes/Loja';
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

/**
 * A moldura passou a desenhar a loja inteira, e não só as bordas.
 *
 * Com o desenho aprovado, toda tela da vitrine começa pela barra da marca e
 * termina no rodapé azul. Isso poderia ser repetido em cinco páginas — e
 * esquecido na sexta, que é como a barra de navegação já tinha sumido de uma
 * tela antes. Aqui é uma decisão só, tomada num lugar só.
 *
 * O RODAPÉ ACOMPANHA A BARRA, e não o conteúdo: nas telas de fluxo (checkout,
 * pedido) o cliente está terminando uma coisa, e uma parede de links para
 * "todos os produtos" bem ali é um convite a abandonar o carrinho.
 */
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
      {/**
        * O RODAPÉ FICA DENTRO DO MIOLO CLARO, e não solto sobre a moldura.
        *
        * Ele tem cantos arredondados em cima, e um canto arredondado só aparece
        * se houver outra cor atrás dele. Solto sobre a moldura — que é da cor da
        * loja, para o azul chegar até embaixo — os dois cantos ficavam da mesma
        * cor do próprio rodapé, e a curva simplesmente não existia. Aqui dentro
        * ela recorta o fundo claro, como no desenho. Abaixo do rodapé continua a
        * moldura, que é o que a pessoa vê ao puxar a página além do fim.
        */}
      <div className="vitrine-conteudo">
        <BarraDaMarca loja={loja} itensNoCarrinho={itens} />
        <div className={semBarra ? undefined : 'com-barra-inferior'}>{children}</div>
        {semBarra ? null : <RodapeDaLoja loja={loja} />}
      </div>

      {semBarra ? null : <BarraDaLoja slug={loja.slug} itensNoCarrinho={itens} />}
    </CoresDaLoja>
  );
}
