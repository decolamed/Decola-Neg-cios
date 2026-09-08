/**
 * Detalhe do produto — `/:slug/produto/:id`.
 *
 * A quantidade que dá para escolher é limitada pelo `disponivel` da view, que
 * já desconta o reservado. O banco confere de novo na criação do pedido: entre
 * abrir esta tela e finalizar, outra pessoa pode ter levado a última unidade.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Aviso, Carregando } from '@/componentes/Basicos';
import { CapaDoProduto } from '@/componentes/Loja';
import { MolduraDaLoja } from '@/componentes/MolduraDaLoja';
import { adicionarAoCarrinho } from '@/dados/carrinho';
import {
  carregarLoja,
  carregarProduto,
  moeda,
  urlDaImagem,
  type Loja as TipoLoja,
  type ProdutoVitrine,
} from '@/dados/loja';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; loja: TipoLoja; produto: ProdutoVitrine }
  | { nome: 'inexistente' }
  | { nome: 'erro'; mensagem: string };

export function Produto() {
  const { slug = '', id = '' } = useParams<{ slug: string; id: string }>();
  const navegar = useNavigate();

  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [quantidade, setQuantidade] = useState(1);
  const [imagemAtiva, setImagemAtiva] = useState(0);

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      const [loja, produto] = await Promise.all([carregarLoja(slug), carregarProduto(slug, id)]);
      setEstado(loja && produto ? { nome: 'pronto', loja, produto } : { nome: 'inexistente' });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar o produto.',
      });
    }
  }, [slug, id]);

  useEffect(() => {
    void carregar();
    setQuantidade(1);
    setImagemAtiva(0);
  }, [carregar]);

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
        <Aviso mensagem="Este produto não está mais disponível nesta loja." />
        <Link to={`/${slug}`} className="botao">
          Voltar para a loja
        </Link>
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

  const { loja, produto } = estado;
  const maximo = produto.disponivel;
  const atributos = Object.entries(produto.atributos).filter(
    ([, valor]) => valor !== null && valor !== undefined && String(valor).trim() !== '',
  );

  const adicionar = () => {
    adicionarAoCarrinho(slug, produto.id, quantidade);
    navegar(`/${slug}/carrinho`);
  };

  return (
    <MolduraDaLoja loja={loja}>
      <main className="pagina estreita">
        <Link
          to={produto.categoria_id ? `/${slug}/categoria/${produto.categoria_id}` : `/${slug}`}
          className="voltar"
        >
          ← {produto.categoria_nome ?? loja.nome}
        </Link>

      <CapaDoProduto
        produto={{ ...produto, imagens: produto.imagens.slice(imagemAtiva) }}
        grande
      />

      {produto.imagens.length > 1 ? (
        <div className="miniaturas">
          {produto.imagens.map((caminho, indice) => (
            <button
              type="button"
              key={caminho}
              className={indice === imagemAtiva ? 'miniatura ativa' : 'miniatura'}
              onClick={() => setImagemAtiva(indice)}
              aria-label={`Imagem ${indice + 1} de ${produto.imagens.length}`}
            >
              <img src={urlDaImagem(caminho)} alt="" />
            </button>
          ))}
        </div>
      ) : null}

      <h1 className="produto-titulo">{produto.nome}</h1>
      <p className="produto-preco grande">{moeda(produto.preco)}</p>

      {produto.descricao ? <p className="produto-descricao">{produto.descricao}</p> : null}

      {/* Só os campos que o gestor marcou como visíveis na loja. É aqui que
          "Tamanho: M" e "Voltagem: 220V" chegam ao cliente — a informação que
          costuma decidir a compra e que antes só existia no aplicativo. */}
      {atributos.length > 0 ? (
        <ul className="produto-atributos">
          {atributos.map(([rotulo, valor]) => (
            <li key={rotulo}>
              <span className="atributo-rotulo">{rotulo}</span>
              <span className="atributo-valor">{String(valor)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {maximo <= 0 ? (
        <Aviso tom="alerta" mensagem="Este produto está sem estoque no momento." />
      ) : (
        <>
          <label className="campo">
            <span>Quantidade</span>
            <div className="contador">
              <button
                type="button"
                className="botao discreto"
                onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                aria-label="Diminuir"
              >
                −
              </button>
              <span className="contador-valor">{quantidade}</span>
              <button
                type="button"
                className="botao discreto"
                onClick={() => setQuantidade((q) => Math.min(maximo, q + 1))}
                aria-label="Aumentar"
                disabled={quantidade >= maximo}
              >
                +
              </button>
            </div>
          </label>

          {/* Mostrar o número só quando ele aperta: "restam 27" não ajuda
              ninguém e ainda expõe o estoque da loja sem motivo. */}
          {maximo <= 5 ? (
            <p className="legenda">
              {maximo === 1 ? 'Resta 1 unidade' : `Restam ${maximo} unidades`}
            </p>
          ) : null}

          <button type="button" className="botao" onClick={adicionar}>
            Adicionar ao carrinho
          </button>
        </>
      )}
      </main>
    </MolduraDaLoja>
  );
}
