/**
 * Todas as categorias da loja — `/:slug/categorias`.
 *
 * O destino da aba "Categorias" da barra inferior. Na home as categorias
 * aparecem em círculos que rolam de lado, o que é bom para escolher rápido e
 * ruim para ver o que existe: com oito seções, metade fica fora da tela. Aqui
 * elas aparecem inteiras, com quantos produtos cada uma tem — a informação que
 * decide por onde começar.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Aviso, Carregando } from '@/componentes/Basicos';
import { MolduraDaLoja } from '@/componentes/MolduraDaLoja';
import {
  carregarLoja,
  listarCategorias,
  urlDaImagem,
  type CategoriaVitrine,
  type Loja as TipoLoja,
} from '@/dados/loja';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; loja: TipoLoja; categorias: CategoriaVitrine[] }
  | { nome: 'inexistente' }
  | { nome: 'erro'; mensagem: string };

export function Categorias() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      const loja = await carregarLoja(slug);
      if (!loja) {
        setEstado({ nome: 'inexistente' });
        return;
      }
      setEstado({ nome: 'pronto', loja, categorias: await listarCategorias(slug) });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar as categorias.',
      });
    }
  }, [slug]);

  useEffect(() => {
    void carregar();
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

  return (
    <MolduraDaLoja loja={loja}>
      <main className="pagina">
        <div className="cabecalho-pagina">
          <h1>Categorias</h1>
        </div>

        {categorias.length === 0 ? (
          <div className="card">
            <p>Esta loja ainda não organizou os produtos em categorias.</p>
            <Link className="botao" to={`/${slug}`}>
              Ver todos os produtos
            </Link>
          </div>
        ) : (
          <div className="grade-categorias">
            {categorias.map((categoria) => (
              <Link
                key={categoria.id}
                to={`/${slug}/categoria/${categoria.id}`}
                className="cartao-categoria"
              >
                {categoria.capa ? (
                  <img src={urlDaImagem(categoria.capa)} alt="" loading="lazy" />
                ) : (
                  <span className="cartao-categoria-vazio" aria-hidden="true">
                    {categoria.nome.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="cartao-categoria-nome">{categoria.nome}</span>
                <span className="cartao-categoria-contagem">
                  {categoria.produtos} {categoria.produtos === 1 ? 'produto' : 'produtos'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </MolduraDaLoja>
  );
}
