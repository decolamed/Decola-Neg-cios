/**
 * Carrinho — `/:slug/carrinho`.
 *
 * O carrinho guarda id e quantidade; nome, preço e disponibilidade são
 * relidos da vitrine ao abrir. Por isso esta tela é o lugar onde o cliente
 * descobre que algo mudou desde que colocou no carrinho — e o texto diz isso
 * em vez de simplesmente corrigir o número por baixo do pano.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Aviso } from '@/componentes/Basicos';
import { CarregandoLoja } from '@/componentes/CarregandoLoja';
import { CapaDoProduto } from '@/componentes/Loja';
import { MolduraDaLoja } from '@/componentes/MolduraDaLoja';
import { definirQuantidade, itensDoCarrinho, removerDoCarrinho } from '@/dados/carrinho';
import {
  carregarLoja,
  listarProdutos,
  moeda,
  type Loja as TipoLoja,
  type ProdutoVitrine,
} from '@/dados/loja';

type Linha = { produto: ProdutoVitrine; quantidade: number; excedeu: boolean };

export function Carrinho() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navegar = useNavigate();

  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [sumiram, setSumiram] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * A loja, só para vestir a tela.
   *
   * O carrinho é destino da barra de navegação da vitrine: sair de uma loja
   * inteira na cor do lojista e cair numa página cinza da Decola é a única
   * emenda visível do caminho de compra. Por isso ele carrega a loja também.
   *
   * MAS ELE NÃO DEPENDE DELA. Se a consulta falhar, a moldura não aparece e o
   * carrinho continua funcionando igual — um enfeite não pode ser motivo para
   * ninguém conseguir fechar o pedido.
   */
  const [loja, setLoja] = useState<TipoLoja | null>(null);

  useEffect(() => {
    let vivo = true;
    carregarLoja(slug)
      .then((l) => {
        if (vivo) setLoja(l);
      })
      .catch(() => {
        /* sem moldura, e nada mais. */
      });
    return () => {
      vivo = false;
    };
  }, [slug]);

  const montar = useCallback(async () => {
    try {
      const itens = itensDoCarrinho(slug);
      if (itens.length === 0) {
        setLinhas([]);
        return;
      }

      const produtos = await listarProdutos(slug);
      const porId = new Map(produtos.map((p) => [p.id, p]));

      const montadas: Linha[] = [];
      let desaparecidos = 0;

      for (const item of itens) {
        const produto = porId.get(item.produtoId);
        // Produto que saiu da vitrine (arquivado, escondido) some do carrinho:
        // manter uma linha morta só geraria erro na hora de fechar o pedido.
        if (!produto) {
          removerDoCarrinho(slug, item.produtoId);
          desaparecidos += 1;
          continue;
        }
        montadas.push({
          produto,
          quantidade: item.quantidade,
          excedeu: item.quantidade > produto.disponivel,
        });
      }

      setSumiram(desaparecidos);
      setLinhas(montadas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o carrinho.');
      setLinhas([]);
    }
  }, [slug]);

  useEffect(() => {
    void montar();
  }, [montar]);

  const mudar = (produtoId: string, quantidade: number) => {
    definirQuantidade(slug, produtoId, quantidade);
    void montar();
  };

  const remover = (produtoId: string) => {
    removerDoCarrinho(slug, produtoId);
    void montar();
  };

  /** A tela dentro da moldura da loja — ou sozinha, se a loja não veio. */
  const comMoldura = (conteudo: ReactNode) =>
    loja ? <MolduraDaLoja loja={loja}>{conteudo}</MolduraDaLoja> : conteudo;

  if (linhas === null) {
    return comMoldura(
      <CarregandoLoja slug={slug} />,
    );
  }

  const total = linhas.reduce((soma, l) => soma + l.produto.preco * l.quantidade, 0);
  const temProblema = linhas.some((l) => l.excedeu);

  return comMoldura(
    <main className="pagina estreita">
      <Link to={`/${slug}`} className="voltar">
        ← Continuar comprando
      </Link>

      <h1>Seu carrinho</h1>

      {erro ? <Aviso mensagem={erro} /> : null}

      {sumiram > 0 ? (
        <Aviso
          tom="alerta"
          mensagem={
            sumiram === 1
              ? 'Um produto saiu da loja e foi removido do seu carrinho.'
              : `${sumiram} produtos saíram da loja e foram removidos do seu carrinho.`
          }
        />
      ) : null}

      {linhas.length === 0 ? (
        <div className="card">
          <p>Seu carrinho está vazio.</p>
          <Link to={`/${slug}`} className="botao">
            Ver produtos
          </Link>
        </div>
      ) : (
        <>
          {linhas.map(({ produto, quantidade, excedeu }) => (
            <div className="linha-carrinho" key={produto.id}>
              <CapaDoProduto produto={produto} />

              <div className="linha-dados">
                <span className="produto-nome">{produto.nome}</span>
                <span className="legenda">{moeda(produto.preco)} cada</span>

                <div className="contador">
                  <button
                    type="button"
                    className="botao discreto"
                    onClick={() => mudar(produto.id, quantidade - 1)}
                    aria-label="Diminuir"
                  >
                    −
                  </button>
                  <span className="contador-valor">{quantidade}</span>
                  <button
                    type="button"
                    className="botao discreto"
                    onClick={() => mudar(produto.id, quantidade + 1)}
                    aria-label="Aumentar"
                    disabled={quantidade >= produto.disponivel}
                  >
                    +
                  </button>
                </div>

                {excedeu ? (
                  <span className="erro-linha">
                    {produto.disponivel === 0
                      ? 'Sem estoque — remova para continuar'
                      : `Restam apenas ${produto.disponivel}. Ajuste a quantidade.`}
                  </span>
                ) : null}
              </div>

              <div className="linha-fim">
                <strong>{moeda(produto.preco * quantidade)}</strong>
                <button type="button" className="botao texto" onClick={() => remover(produto.id)}>
                  Remover
                </button>
              </div>
            </div>
          ))}

          <div className="total-carrinho">
            <span>Total dos produtos</span>
            <strong>{moeda(total)}</strong>
          </div>

          <button
            type="button"
            className="botao"
            disabled={temProblema}
            onClick={() => navegar(`/${slug}/checkout`)}
          >
            Continuar
          </button>

          {temProblema ? (
            <p className="legenda">Ajuste as quantidades marcadas em vermelho para continuar.</p>
          ) : null}
        </>
      )}
    </main>,
  );
}
