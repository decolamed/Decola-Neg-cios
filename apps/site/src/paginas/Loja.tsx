/**
 * Vitrine de um negócio — `/:slug`.
 *
 * Pública e sem login. O que aparece aqui é exatamente o que as views
 * `vitrine_*` devolvem: produto visível, ativo, de loja no ar e com assinatura
 * vigente. A tela não filtra nada por conta própria.
 *
 * A ORDEM DA PÁGINA É UMA DECISÃO. Banner (o que a loja quer anunciar), quem
 * ela é, busca, categorias, destaques e só então o catálogo inteiro. Quem
 * chega sabendo o que quer usa a busca na terceira dobra; quem chega olhando
 * desce pelas categorias. Antes só existia a última dessas coisas, e com
 * duzentos produtos ela é uma parede.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Aviso } from '@/componentes/Basicos';
import { CarregandoLoja } from '@/componentes/CarregandoLoja';
import {
  BuscaDeProdutos,
  CabecalhoDoCatalogo,
  CartaoDeProduto,
  CarrosselDaLoja,
} from '@/componentes/Loja';
import { MolduraDaLoja } from '@/componentes/MolduraDaLoja';
import { adicionarAoCarrinho } from '@/dados/carrinho';
import {
  carregarLoja,
  filtrarProdutos,
  listarCategorias,
  listarProdutos,
  type CategoriaVitrine,
  type Loja as TipoLoja,
  type ProdutoVitrine,
} from '@/dados/loja';

type Estado =
  | { nome: 'carregando' }
  | {
      nome: 'pronto';
      loja: TipoLoja;
      produtos: ProdutoVitrine[];
      categorias: CategoriaVitrine[];
    }
  | { nome: 'inexistente' }
  | { nome: 'erro'; mensagem: string };

export function Loja() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      const loja = await carregarLoja(slug);
      if (!loja) {
        setEstado({ nome: 'inexistente' });
        return;
      }

      // Em paralelo: a loja já foi encontrada, e esperar uma consulta terminar
      // para começar a outra só adiciona latência no 4G do cliente.
      const [produtos, categorias] = await Promise.all([
        listarProdutos(slug),
        listarCategorias(slug),
      ]);

      setEstado({ nome: 'pronto', loja, produtos, categorias });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar a loja.',
      });
    }
  }, [slug]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const adicionar = useCallback(
    (produtoId: string) => adicionarAoCarrinho(slug, produtoId, 1),
    [slug],
  );

  const pronto = estado.nome === 'pronto' ? estado : null;

  const resultados = useMemo(
    () => (pronto ? filtrarProdutos(pronto.produtos, busca) : []),
    [pronto, busca],
  );

  const destaques = useMemo(
    () => (pronto ? pronto.produtos.filter((p) => p.destaque) : []),
    [pronto],
  );

  if (estado.nome === 'carregando') {
    return (
      <CarregandoLoja slug={slug} />
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

  const { loja, produtos, categorias } = estado;
  const buscando = busca.trim().length > 0;

  return (
    <MolduraDaLoja loja={loja}>
      {/* A busca vem ANTES do banner, e não depois. Ela é a única coisa da
          página que precisa acompanhar a rolagem — logo abaixo da barra da
          marca ela gruda no topo sem cobrir nada; embaixo do banner, ela
          grudaria por cima dele. */}
      <BuscaDeProdutos valor={busca} aoMudar={setBusca} fixa />
      <CarrosselDaLoja loja={loja} />

      <main className="pagina">
        {/* Buscando, a página inteira vira o resultado: destaques abaixo de uma
            busca ativa são ruído entre a pessoa e o que ela acabou de pedir. */}
        {buscando ? (
          <section className="loja-secao">
            <CabecalhoDoCatalogo
              titulo="Resultados"
              contagem={rotuloDaContagem(resultados.length)}
              slug={slug}
              categorias={categorias}
            />

            {resultados.length === 0 ? (
              <p className="legenda">
                Tente outra palavra, ou use o filtro para ver tudo o que a loja tem.
              </p>
            ) : (
              <div className="grade-produtos">
                {resultados.map((produto) => (
                  <CartaoDeProduto
                    key={produto.id}
                    slug={slug}
                    produto={produto}
                    aoAdicionar={adicionar}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {destaques.length > 0 ? (
              <section className="loja-secao">
                <CabecalhoDoCatalogo
                  titulo="Destaques"
                  slug={slug}
                  categorias={[]}
                />
                <div className="grade-produtos">
                  {destaques.map((produto) => (
                    <CartaoDeProduto
                      key={produto.id}
                      slug={slug}
                      produto={produto}
                      aoAdicionar={adicionar}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="loja-secao">
              <CabecalhoDoCatalogo
                titulo="Produtos"
                contagem={rotuloDaContagem(produtos.length)}
                slug={slug}
                categorias={categorias}
              />

              {produtos.length === 0 ? (
                <div className="card">
                  <p>Esta loja ainda não publicou produtos. Volte em breve.</p>
                </div>
              ) : (
                <div className="grade-produtos">
                  {produtos.map((produto) => (
                    <CartaoDeProduto
                      key={produto.id}
                      slug={slug}
                      produto={produto}
                      aoAdicionar={adicionar}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </MolduraDaLoja>
  );
}

/** "1 produto" / "12 produtos" — o texto discreto ao lado do título. */
function rotuloDaContagem(quantos: number): string {
  return `${quantos} ${quantos === 1 ? 'produto' : 'produtos'}`;
}
