/**
 * Peças compartilhadas da vitrine.
 *
 * Ficam separadas porque aparecem em mais de uma tela — cabeçalho da loja na
 * vitrine e no detalhe, barra do carrinho em quase todas.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  textoSobre,
  urlDaImagem,
  urlDaLoja,
  type Loja,
  type ProdutoVitrine,
} from '@/dados/loja';

/**
 * A cor do lojista, aplicada como variáveis CSS num escopo só.
 *
 * Variáveis, e não estilos espalhados, porque a cor precisa alcançar botões e
 * faixas que não são filhos diretos deste componente. E escopo, e não `:root`,
 * porque a mesma página pode um dia mostrar duas lojas — e porque nada fora da
 * vitrine deveria mudar de cor por causa de uma escolha de lojista.
 */
export function CoresDaLoja({ loja, children }: { loja: Loja; children: React.ReactNode }) {
  const cor = loja.loja_cor;
  if (!cor) return <>{children}</>;

  return (
    <div
      style={
        {
          '--cor-loja': cor,
          '--cor-sobre-loja': textoSobre(cor),
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

export function CabecalhoDaLoja({ loja }: { loja: Loja }) {
  return (
    <header className="loja-cabecalho">
      {loja.logo_url ? <img className="loja-logo" src={urlDaLoja(loja.logo_url)} alt="" /> : null}
      <div>
        <h1>{loja.nome}</h1>
        {loja.descricao ? <p className="loja-descricao">{loja.descricao}</p> : null}
        {loja.endereco ? <p className="legenda">{loja.endereco}</p> : null}
      </div>
    </header>
  );
}

/**
 * Carrossel de banners.
 *
 * Passa sozinho a cada cinco segundos, e para de vez quando alguém toca num
 * ponto: se a pessoa escolheu um banner, trocá-lo debaixo dela é tirar o que
 * ela quis ver. Com um banner só não há carrossel — nem timer, nem pontos,
 * porque não há para onde ir.
 *
 * Sem `alt` descritivo porque banner é peça promocional cujo conteúdo já está
 * na imagem; um alt inventado por nós seria pior que nenhum.
 */
export function CarrosselDaLoja({ loja }: { loja: Loja }) {
  const banners = loja.banners ?? [];
  const [atual, setAtual] = useState(0);
  const [parado, setParado] = useState(false);

  useEffect(() => {
    if (banners.length < 2 || parado) return;
    const relogio = setInterval(() => {
      setAtual((i) => (i + 1) % banners.length);
    }, 5000);
    return () => clearInterval(relogio);
  }, [banners.length, parado]);

  if (banners.length === 0) return null;

  const banner = banners[Math.min(atual, banners.length - 1)];
  const imagem = (
    <img className="loja-banner" src={urlDaLoja(banner.caminho)} alt="" loading="lazy" />
  );

  return (
    <div className="loja-carrossel">
      {banner.link ? (
        <a href={banner.link} target="_blank" rel="noreferrer noopener">
          {imagem}
        </a>
      ) : (
        imagem
      )}

      {banners.length > 1 ? (
        <div className="loja-carrossel-pontos">
          {banners.map((b, i) => (
            <button
              key={b.caminho}
              type="button"
              aria-label={`Banner ${i + 1} de ${banners.length}`}
              aria-current={i === atual}
              className={i === atual ? 'ponto ativo' : 'ponto'}
              onClick={() => {
                setAtual(i);
                setParado(true);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Capa do produto.
 *
 * Sem imagem, mostra a inicial num bloco da cor da marca — um espaço vazio
 * faria o cartão desabar e a grade perder o alinhamento.
 */
export function CapaDoProduto({
  produto,
  grande = false,
}: {
  produto: ProdutoVitrine;
  grande?: boolean;
}) {
  const capa = produto.imagens[0];
  const classe = grande ? 'produto-capa grande' : 'produto-capa';

  if (!capa) {
    return (
      <div className={`${classe} sem-imagem`} aria-hidden="true">
        {produto.nome.charAt(0).toUpperCase()}
      </div>
    );
  }

  return <img className={classe} src={urlDaImagem(capa)} alt={produto.nome} loading="lazy" />;
}

/**
 * Barra fixa no rodapé com o carrinho.
 *
 * Só aparece com item dentro: numa vitrine vazia ela seria um chamariz para
 * uma tela que não tem nada a mostrar.
 */
export function BarraDoCarrinho({ slug, quantidade }: { slug: string; quantidade: number }) {
  if (quantidade <= 0) return null;

  return (
    <div className="barra-carrinho">
      <Link to={`/loja/${slug}/carrinho`} className="botao">
        Ver carrinho ({quantidade} {quantidade === 1 ? 'item' : 'itens'})
      </Link>
    </div>
  );
}
