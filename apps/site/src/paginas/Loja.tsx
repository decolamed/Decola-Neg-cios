/**
 * Vitrine de um negócio — `/loja/:slug`.
 *
 * Pública e sem login. O que aparece aqui é exatamente o que a view
 * `vitrine_produtos` devolve: produto visível, ativo, de loja no ar e com
 * assinatura vigente. A tela não filtra nada por conta própria.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Aviso, Carregando } from '@/componentes/Basicos';
import {
  BarraDoCarrinho,
  CabecalhoDaLoja,
  CapaDoProduto,
  CarrosselDaLoja,
  CoresDaLoja,
} from '@/componentes/Loja';
import { adicionarAoCarrinho, totalDeItens } from '@/dados/carrinho';
import { carregarLoja, listarProdutos, moeda, type Loja as TipoLoja, type ProdutoVitrine } from '@/dados/loja';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; loja: TipoLoja; produtos: ProdutoVitrine[] }
  | { nome: 'inexistente' }
  | { nome: 'erro'; mensagem: string };

export function Loja() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [noCarrinho, setNoCarrinho] = useState(0);

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      const loja = await carregarLoja(slug);
      if (!loja) {
        setEstado({ nome: 'inexistente' });
        return;
      }
      setEstado({ nome: 'pronto', loja, produtos: await listarProdutos(slug) });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar a loja.',
      });
    }
  }, [slug]);

  useEffect(() => {
    void carregar();
    setNoCarrinho(totalDeItens(slug));
  }, [carregar, slug]);

  const adicionar = (produtoId: string) => {
    adicionarAoCarrinho(slug, produtoId, 1);
    setNoCarrinho(totalDeItens(slug));
  };

  if (estado.nome === 'carregando') {
    return (
      <main className="pagina">
        <Carregando texto="Carregando a loja…" />
      </main>
    );
  }

  // Loja inexistente e loja desligada dão o mesmo resultado, de propósito: quem
  // não é cliente não precisa saber que este endereço já existiu.
  if (estado.nome === 'inexistente') {
    return (
      <main className="pagina estreita">
        <div className="centralizado">
          <h1>Loja não encontrada</h1>
          <p className="legenda">
            Este endereço não corresponde a nenhuma loja disponível. Confira o link com quem o
            enviou.
          </p>
        </div>
      </main>
    );
  }

  if (estado.nome === 'erro') {
    return (
      <main className="pagina estreita">
        <Aviso mensagem={estado.mensagem} />
        <button type="button" className="botao discreto" onClick={carregar}>
          Tentar novamente
        </button>
      </main>
    );
  }

  const { loja, produtos } = estado;

  return (
    <CoresDaLoja loja={loja}>
      <main className="pagina com-barra">
        <CabecalhoDaLoja loja={loja} />
        <CarrosselDaLoja loja={loja} />

        {produtos.length === 0 ? (
          <div className="card">
            <p>Esta loja ainda não publicou produtos. Volte em breve.</p>
          </div>
        ) : (
          <div className="grade-produtos">
            {produtos.map((produto) => (
              <article className="produto" key={produto.id}>
                <Link to={`/loja/${slug}/produto/${produto.id}`} className="produto-link">
                  <CapaDoProduto produto={produto} />
                  <span className="produto-nome">{produto.nome}</span>
                  <span className="produto-preco">{moeda(produto.preco)}</span>
                </Link>

                {produto.disponivel > 0 ? (
                  <button type="button" className="botao pequeno" onClick={() => adicionar(produto.id)}>
                    Adicionar
                  </button>
                ) : (
                  <span className="esgotado">Sem estoque</span>
                )}
              </article>
            ))}
          </div>
        )}
      </main>

      <BarraDoCarrinho slug={slug} quantidade={noCarrinho} />
    </CoresDaLoja>
  );
}
