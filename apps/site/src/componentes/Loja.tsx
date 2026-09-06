/**
 * Peças compartilhadas da vitrine.
 *
 * Ficam separadas porque aparecem em mais de uma tela — cabeçalho da loja na
 * vitrine e no detalhe, barra do carrinho em quase todas.
 */
import { Link } from 'react-router-dom';
import { urlDaImagem, type Loja, type ProdutoVitrine } from '@/dados/loja';

export function CabecalhoDaLoja({ loja }: { loja: Loja }) {
  return (
    <header className="loja-cabecalho">
      {loja.logo_url ? <img className="loja-logo" src={loja.logo_url} alt="" /> : null}
      <div>
        <h1>{loja.nome}</h1>
        {loja.descricao ? <p className="loja-descricao">{loja.descricao}</p> : null}
        {loja.endereco ? <p className="legenda">{loja.endereco}</p> : null}
      </div>
    </header>
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
