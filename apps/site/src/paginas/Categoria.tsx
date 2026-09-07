/**
 * Produtos de uma categoria — `/loja/:slug/categoria/:id`.
 *
 * As pastilhas no topo trazem as OUTRAS categorias junto: quem entrou em
 * "Cabelos" e queria "Skincare" troca ali mesmo, sem voltar para a home. É a
 * diferença entre navegar e recomeçar.
 *
 * A busca aqui procura dentro da categoria, não na loja inteira — é o que a
 * pessoa espera de um campo de busca que aparece depois de ela ter escolhido
 * uma seção.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Aviso, Carregando } from '@/componentes/Basicos';
import { BuscaDeProdutos, ChipsDeCategoria, LinhaDeProduto } from '@/componentes/Loja';
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

export function Categoria() {
  const { slug = '', id = '' } = useParams<{ slug: string; id: string }>();
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [busca, setBusca] = useState('');

  // Trocar de categoria pelas pastilhas não deve carregar a busca junto: o
  // termo era sobre a seção anterior.
  useEffect(() => setBusca(''), [id]);

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      const loja = await carregarLoja(slug);
      if (!loja) {
        setEstado({ nome: 'inexistente' });
        return;
      }
      const [produtos, categorias] = await Promise.all([
        listarProdutos(slug),
        listarCategorias(slug),
      ]);
      setEstado({ nome: 'pronto', loja, produtos, categorias });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar a categoria.',
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

  const daCategoria = useMemo(
    () => (pronto ? pronto.produtos.filter((p) => p.categoria_id === id) : []),
    [pronto, id],
  );

  const visiveis = useMemo(() => filtrarProdutos(daCategoria, busca), [daCategoria, busca]);

  if (estado.nome === 'carregando') {
    return (
      <main className="pagina">
        <Carregando />
      </main>
    );
  }

  if (estado.nome === 'inexistente') {
    return (
      <main className="pagina estreita">
        <div className="centralizado">
          <h1>Loja não encontrada</h1>
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

  const { loja, categorias } = estado;
  const categoria = categorias.find((c) => c.id === id);

  return (
    <MolduraDaLoja loja={loja}>
      <main className="pagina">
        <Link to={`/loja/${slug}`} className="voltar">
          ← {loja.nome}
        </Link>

        <div className="cabecalho-pagina">
          <h1>{categoria?.nome ?? 'Categoria'}</h1>
        </div>

        <ChipsDeCategoria slug={slug} categorias={categorias} ativa={id} />

        {daCategoria.length > 3 ? (
          <BuscaDeProdutos
            valor={busca}
            aoMudar={setBusca}
            placeholder={`Buscar em ${categoria?.nome ?? 'esta categoria'}…`}
          />
        ) : null}

        {visiveis.length === 0 ? (
          <div className="card">
            <p>
              {busca.trim()
                ? 'Nenhum produto desta categoria corresponde à sua busca.'
                : 'Esta categoria ainda não tem produtos à mostra.'}
            </p>
            <Link className="botao discreto" to={`/loja/${slug}`}>
              Ver todos os produtos
            </Link>
          </div>
        ) : (
          <div className="lista-produtos">
            {visiveis.map((produto) => (
              <LinhaDeProduto
                key={produto.id}
                slug={slug}
                produto={produto}
                aoAdicionar={adicionar}
                mostrarCategoria={false}
              />
            ))}
          </div>
        )}
      </main>
    </MolduraDaLoja>
  );
}
