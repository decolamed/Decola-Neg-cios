/**
 * Peças da vitrine.
 *
 * A vitrine deixou de ser uma página e virou um pequeno aplicativo: tem barra
 * de navegação, busca, categorias e uma primeira dobra que não é só a lista
 * inteira em ordem alfabética. Estas peças são o que se repete entre as telas.
 *
 * TUDO AQUI VESTE A COR DO LOJISTA. `CoresDaLoja` publica duas variáveis CSS e
 * o resto do arquivo só as consome — nenhuma cor de marca aparece escrita nos
 * componentes, senão a loja de cada cliente sairia igual à nossa.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  moeda,
  textoSobre,
  urlDaImagem,
  urlDaLoja,
  urlDoInstagram,
  type CategoriaVitrine,
  type Loja,
  type ProdutoVitrine,
} from '@/dados/loja';

/**
 * A cor do lojista, aplicada como variáveis CSS num escopo só.
 *
 * Variáveis, e não estilos espalhados, porque a cor precisa alcançar botões e
 * faixas que não são filhos diretos deste componente. E escopo, e não `:root`,
 * porque nada fora da vitrine deveria mudar de cor por escolha de um lojista.
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

/* ========================================================== identidade == */

/**
 * O cartão de identidade da loja: logo, nome, o que ela vende e por onde
 * falar com ela.
 *
 * Os três links (WhatsApp, Instagram, endereço) só aparecem quando existem.
 * Um "Instagram" que não leva a lugar nenhum é pior do que a ausência dele:
 * ensina o visitante a desconfiar do resto da página.
 */
export function CabecalhoDaLoja({ loja }: { loja: Loja }) {
  const endereco = loja.endereco?.trim();

  return (
    <section className="loja-identidade">
      <div className="loja-identidade-topo">
        {loja.logo_url ? (
          <img className="loja-logo" src={urlDaLoja(loja.logo_url)} alt="" />
        ) : (
          <div className="loja-logo sem-imagem" aria-hidden="true">
            {loja.nome.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="loja-identidade-texto">
          <h1>{loja.nome}</h1>
          {loja.descricao ? <p className="loja-descricao">{loja.descricao}</p> : null}
        </div>
      </div>

      <div className="loja-contatos">
        {loja.whatsapp ? (
          <a
            className="loja-contato"
            href={`https://wa.me/${loja.whatsapp}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconeWhatsapp />
            WhatsApp
          </a>
        ) : null}

        {loja.instagram ? (
          <a
            className="loja-contato"
            href={urlDoInstagram(loja.instagram)}
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconeInstagram />
            Instagram
          </a>
        ) : null}

        {endereco ? (
          // Abre no mapa do aparelho: quem toca num endereço quer chegar lá.
          <a
            className="loja-contato"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconeLocal />
            Endereço
          </a>
        ) : null}
      </div>
    </section>
  );
}

/* ============================================================= banners == */

/** De quanto da largura a pessoa precisa arrastar para trocar de banner. */
const FRACAO_PARA_TROCAR = 0.2;

/** Quanto tempo o carrossel espera, depois de um toque, antes de voltar a andar. */
const PAUSA_APOS_TOQUE_MS = 9000;

/**
 * Carrossel de banners: passa sozinho, e também no dedo.
 *
 * O QUE ESTAVA ERRADO. Ele já passava sozinho a cada cinco segundos — mas tocar
 * num ponto o parava PARA SEMPRE. Como quem abre a loja quase sempre toca num
 * ponto para ver o resto, o carrossel morria no primeiro toque e passava a
 * depender só dos pontinhos. Era o relato: "passa somente se você clicar na
 * bola". A intenção de não trocar o banner debaixo de quem escolheu estava
 * certa; o prazo é que estava errado — ela vale por alguns segundos, não pela
 * visita inteira.
 *
 * E FALTAVA O DEDO. Numa vitrine aberta no celular, arrastar é o gesto óbvio; o
 * ponto tem seis pixels e serve para saber ONDE se está, não para navegar. Agora
 * os banners ficam num trilho que acompanha o dedo enquanto arrasta, e solta no
 * banner mais próximo — com um quinto da largura bastando para trocar, porque
 * exigir metade faz o gesto parecer que não pegou.
 *
 * Sem `alt` descritivo porque banner é peça promocional cujo conteúdo já está
 * na imagem; um alt inventado por nós seria pior que nenhum.
 */
export function CarrosselDaLoja({ loja }: { loja: Loja }) {
  const banners = loja.banners ?? [];
  const total = banners.length;

  const [atual, setAtual] = useState(0);
  /**
   * Quanto o dedo já arrastou, em pixels. Zero quando ninguém está tocando.
   *
   * DUAS CÓPIAS, e não por descuido. O estado é o que o trilho desenha; o ref é
   * o que a DECISÃO lê ao soltar. Com só o estado, soltar o dedo decidia com o
   * valor de um render atrás — e quando os eventos de toque chegam juntos, esse
   * valor ainda é zero, então o arrasto não trocava de banner. Com o dedo real
   * costumava funcionar, porque os eventos vêm espaçados; "costumava" não é
   * garantia de nada.
   */
  const [arrasto, setArrasto] = useState(0);
  const arrastoRef = useRef(0);
  const [arrastando, setArrastando] = useState(false);
  /** Enquanto for maior que agora, o relógio não anda. */
  const pausadoAte = useRef(0);

  const trilho = useRef<HTMLDivElement>(null);
  /**
   * A largura de um quadro, medida — e não lida durante o render.
   *
   * Ler `clientWidth` no meio do render dá o valor de antes na primeira pintura
   * e, pior, nunca mais muda: girar o aparelho ou redimensionar a janela
   * deixaria o trilho parado num deslocamento calculado para a largura antiga,
   * e o banner apareceria cortado pela metade.
   */
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    const alvo = trilho.current;
    if (!alvo) return;

    const medir = () => setLargura(alvo.clientWidth);
    medir();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', medir);
      return () => window.removeEventListener('resize', medir);
    }

    const observador = new ResizeObserver(medir);
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [total]);

  const inicioX = useRef(0);
  const inicioY = useRef(0);
  /** `null` até saber se o gesto é horizontal (carrossel) ou vertical (rolagem). */
  const horizontal = useRef<boolean | null>(null);

  const ir = useCallback(
    (destino: number) => {
      if (total < 2) return;
      setAtual(((destino % total) + total) % total);
    },
    [total],
  );

  /**
   * Um relógio só, que a cada volta pergunta se já pode andar.
   *
   * Poderia ser um timer recriado a cada interação, mas aí cada toque
   * cancelaria e recriaria o relógio — e um `setInterval` recriado no meio do
   * caminho reinicia a contagem, fazendo o banner pular logo depois de a pessoa
   * soltar. Perguntar as horas é mais simples de acertar.
   */
  useEffect(() => {
    if (total < 2) return;
    const relogio = setInterval(() => {
      if (Date.now() < pausadoAte.current) return;
      setAtual((i) => (i + 1) % total);
    }, 5000);
    return () => clearInterval(relogio);
  }, [total]);

  const adiar = useCallback(() => {
    pausadoAte.current = Date.now() + PAUSA_APOS_TOQUE_MS;
  }, []);

  // ------------------------------------------------------------- o gesto
  const comecar = useCallback(
    (x: number, y: number) => {
      inicioX.current = x;
      inicioY.current = y;
      arrastoRef.current = 0;
      horizontal.current = null;
      setArrastando(true);
      adiar();
    },
    [adiar],
  );

  const mover = useCallback((x: number, y: number) => {
    const dx = x - inicioX.current;
    const dy = y - inicioY.current;

    /**
     * HORIZONTAL OU VERTICAL? Decidido uma vez, no começo do movimento.
     *
     * Sem isso, começar a rolar a página com o dedo em cima do banner
     * arrastaria o carrossel junto — e rolar uma vitrine é muito mais comum do
     * que trocar de banner. Depois de decidido, o gesto não muda de ideia no
     * meio: senão ele treme quando o dedo sobe um pouco.
     */
    if (horizontal.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      horizontal.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!horizontal.current) return;

    arrastoRef.current = dx;
    setArrasto(dx);
  }, []);

  const soltar = useCallback(() => {
    const percorrido = arrastoRef.current;
    const passou = Math.abs(percorrido) > Math.max(1, largura) * FRACAO_PARA_TROCAR;

    if (passou && horizontal.current) ir(atual + (percorrido < 0 ? 1 : -1));

    arrastoRef.current = 0;
    setArrasto(0);
    setArrastando(false);
    horizontal.current = null;
    adiar();
  }, [atual, ir, adiar, largura]);

  if (total === 0) return null;

  const indice = Math.min(atual, total - 1);
  const deslocamento = largura > 0 ? -indice * largura + arrasto : 0;

  return (
    <div
      className="loja-carrossel"
      // `onTouchMove` não é passivo aqui porque precisamos impedir a rolagem
      // quando o gesto é horizontal — daí o `touch-action` no CSS, que resolve
      // isso sem bloquear a rolagem vertical.
      onTouchStart={(e) => comecar(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={(e) => mover(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={soltar}
      onTouchCancel={soltar}
      // No computador o mesmo gesto vale com o mouse apertado.
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') return;
        comecar(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === 'touch' || !arrastando) return;
        mover(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'touch') return;
        soltar();
      }}
      onPointerLeave={() => {
        if (arrastando) soltar();
      }}
    >
      <div
        ref={trilho}
        className={arrastando ? 'loja-carrossel-trilho arrastando' : 'loja-carrossel-trilho'}
        style={{ transform: `translate3d(${deslocamento}px, 0, 0)` }}
      >
        {banners.map((banner) => {
          const imagem = (
            <img
              className="loja-banner"
              src={urlDaLoja(banner.caminho)}
              alt=""
              loading="lazy"
              draggable={false}
            />
          );
          return (
            <div className="loja-carrossel-quadro" key={banner.caminho}>
              {banner.link ? (
                <a
                  href={banner.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  // Arrastar não pode virar clique no link do banner.
                  onClick={(e) => {
                    if (Math.abs(arrastoRef.current) > 4) e.preventDefault();
                  }}
                >
                  {imagem}
                </a>
              ) : (
                imagem
              )}
            </div>
          );
        })}
      </div>

      {total > 1 ? (
        <div className="loja-carrossel-pontos">
          {banners.map((b, i) => (
            <button
              key={b.caminho}
              type="button"
              aria-label={`Banner ${i + 1} de ${total}`}
              aria-current={i === indice}
              className={i === indice ? 'ponto ativo' : 'ponto'}
              onClick={() => {
                ir(i);
                adiar();
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ================================================================ busca == */

export function BuscaDeProdutos({
  valor,
  aoMudar,
  placeholder = 'Buscar produtos…',
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="loja-busca">
      <IconeBusca />
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar produtos"
      />
      {valor ? (
        <button type="button" onClick={() => aoMudar('')} aria-label="Limpar busca">
          ×
        </button>
      ) : null}
    </div>
  );
}

/* =========================================================== categorias == */

/**
 * Categorias em círculo, como no balcão: a foto de um produto representa a
 * seção inteira.
 *
 * A capa vem emprestada do primeiro produto da categoria (a view resolve
 * isso). Pedir uma imagem de categoria ao lojista seria pedir trabalho para
 * obter o que as fotos dele já dão.
 */
export function CirculosDeCategoria({
  slug,
  categorias,
  ativa = null,
}: {
  slug: string;
  categorias: CategoriaVitrine[];
  /** `null` = "Todos" em destaque. */
  ativa?: string | null;
}) {
  if (categorias.length === 0) return null;

  return (
    <nav className="categorias-circulos" aria-label="Categorias">
      <Link
        to={`/${slug}`}
        className={ativa === null ? 'categoria-circulo ativo' : 'categoria-circulo'}
      >
        <span className="categoria-imagem grade" aria-hidden="true">
          <IconeGrade />
        </span>
        <span className="categoria-nome">Todos</span>
      </Link>

      {categorias.map((categoria) => (
        <Link
          key={categoria.id}
          to={`/${slug}/categoria/${categoria.id}`}
          className={ativa === categoria.id ? 'categoria-circulo ativo' : 'categoria-circulo'}
        >
          {categoria.capa ? (
            <img className="categoria-imagem" src={urlDaImagem(categoria.capa)} alt="" loading="lazy" />
          ) : (
            <span className="categoria-imagem sem-imagem" aria-hidden="true">
              {categoria.nome.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="categoria-nome">{categoria.nome}</span>
        </Link>
      ))}
    </nav>
  );
}

/** As mesmas categorias, em pastilhas — para o topo da página de categoria. */
export function ChipsDeCategoria({
  slug,
  categorias,
  ativa,
}: {
  slug: string;
  categorias: CategoriaVitrine[];
  ativa: string | null;
}) {
  if (categorias.length === 0) return null;

  return (
    <nav className="categoria-chips" aria-label="Categorias">
      <Link to={`/${slug}`} className={ativa === null ? 'chip ativo' : 'chip'}>
        Todos
      </Link>
      {categorias.map((c) => (
        <Link
          key={c.id}
          to={`/${slug}/categoria/${c.id}`}
          className={ativa === c.id ? 'chip ativo' : 'chip'}
        >
          {c.nome}
        </Link>
      ))}
    </nav>
  );
}

/* ============================================================= produtos == */

/**
 * Capa do produto.
 *
 * Sem imagem, mostra a inicial num bloco — um espaço vazio faria o cartão
 * desabar e a grade perder o alinhamento.
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

/** Cartão vertical — usado na grade e na faixa de destaques. */
export function CartaoDeProduto({
  slug,
  produto,
  aoAdicionar,
}: {
  slug: string;
  produto: ProdutoVitrine;
  aoAdicionar: (id: string) => void;
}) {
  const esgotado = produto.disponivel <= 0;

  return (
    <article className={esgotado ? 'produto esgotado' : 'produto'}>
      <Link to={`/${slug}/produto/${produto.id}`} className="produto-link">
        <CapaDoProduto produto={produto} />
        <span className="produto-nome">{produto.nome}</span>
        <span className="produto-preco">{moeda(produto.preco)}</span>
      </Link>

      {esgotado ? (
        <span className="esgotado-selo">Sem estoque</span>
      ) : (
        <button
          type="button"
          className="produto-add"
          onClick={() => aoAdicionar(produto.id)}
          aria-label={`Adicionar ${produto.nome} ao carrinho`}
        >
          <IconeCarrinho />
        </button>
      )}
    </article>
  );
}

/** Linha horizontal — usada na lista de uma categoria e nos resultados. */
export function LinhaDeProduto({
  slug,
  produto,
  aoAdicionar,
  mostrarCategoria = true,
}: {
  slug: string;
  produto: ProdutoVitrine;
  aoAdicionar: (id: string) => void;
  /** Falso dentro da própria categoria: repetir "Cabelos" em toda linha da
   *  página "Cabelos" ocupa espaço sem dizer nada. */
  mostrarCategoria?: boolean;
}) {
  const esgotado = produto.disponivel <= 0;

  return (
    <article className={esgotado ? 'produto-linha esgotado' : 'produto-linha'}>
      <Link to={`/${slug}/produto/${produto.id}`} className="produto-linha-link">
        <CapaDoProduto produto={produto} />
        <div className="produto-linha-texto">
          <span className="produto-nome">{produto.nome}</span>
          {mostrarCategoria && produto.categoria_nome ? (
            <span className="produto-categoria">{produto.categoria_nome}</span>
          ) : null}
          <span className="produto-preco">{moeda(produto.preco)}</span>
        </div>
      </Link>

      {esgotado ? (
        <span className="esgotado-selo">Sem estoque</span>
      ) : (
        <button
          type="button"
          className="produto-add"
          onClick={() => aoAdicionar(produto.id)}
          aria-label={`Adicionar ${produto.nome} ao carrinho`}
        >
          <IconeCarrinho />
        </button>
      )}
    </article>
  );
}

/* =========================================================== navegação == */

/**
 * Barra de navegação da loja.
 *
 * Fixa no rodapé porque é assim que o cliente espera navegar no celular, e
 * porque a vitrine tem quatro destinos que ele volta a usar o tempo todo. O
 * carrinho carrega o contador: sem ele, o item adicionado desaparece da vista
 * e a pessoa não sabe se a loja registrou.
 */
export function BarraDaLoja({ slug, itensNoCarrinho }: { slug: string; itensNoCarrinho: number }) {
  const { pathname } = useLocation();

  const itens = useMemo(
    () => [
      { destino: `/${slug}`, rotulo: 'Início', icone: <IconeCasa />, exato: true },
      { destino: `/${slug}/categorias`, rotulo: 'Categorias', icone: <IconeGrade />, exato: false },
      {
        destino: `/${slug}/carrinho`,
        rotulo: 'Carrinho',
        icone: <IconeCarrinho />,
        exato: false,
        contador: itensNoCarrinho,
      },
      { destino: `/${slug}/pedidos`, rotulo: 'Pedidos', icone: <IconePessoa />, exato: false },
    ],
    [slug, itensNoCarrinho],
  );

  return (
    <nav className="loja-barra" aria-label="Navegação da loja">
      {itens.map((item) => {
        const ativo = item.exato ? pathname === item.destino : pathname.startsWith(item.destino);
        return (
          <Link
            key={item.rotulo}
            to={item.destino}
            className={ativo ? 'loja-barra-item ativo' : 'loja-barra-item'}
            aria-current={ativo ? 'page' : undefined}
          >
            <span className="loja-barra-icone">
              {item.icone}
              {item.contador ? <span className="loja-barra-contador">{item.contador}</span> : null}
            </span>
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

/* =============================================================== ícones == */
/*
 * Desenhados à mão em SVG, e não importados de uma biblioteca: são sete
 * ícones, e uma dependência inteira para isso pesaria mais no 4G do cliente
 * do lojista do que o resto da página.
 */

const traco = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function IconeCasa() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M3.5 10.5 12 3.8l8.5 6.7V20a.8.8 0 0 1-.8.8h-4.4v-6h-6.6v6H4.3a.8.8 0 0 1-.8-.8Z" {...traco} />
    </svg>
  );
}

function IconeGrade() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" {...traco} />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" {...traco} />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" {...traco} />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" {...traco} />
    </svg>
  );
}

function IconeCarrinho() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M3 4.5h2.2l2.3 10.2h9.8l2.2-7.2H6.4" {...traco} />
      <circle cx="9.2" cy="19" r="1.5" {...traco} />
      <circle cx="16.6" cy="19" r="1.5" {...traco} />
    </svg>
  );
}

function IconePessoa() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="8.4" r="3.6" {...traco} />
      <path d="M4.8 20.2c.6-3.7 3.6-5.8 7.2-5.8s6.6 2.1 7.2 5.8" {...traco} />
    </svg>
  );
}

function IconeBusca() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.3" {...traco} />
      <path d="m15.4 15.4 4 4" {...traco} />
    </svg>
  );
}

function IconeWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20Z" {...traco} />
      <path d="M9 9.6c.4 2.2 2.2 4 4.4 4.4l1-1.2 1.7.7-.3 1.6c-2.9.6-6.4-2.9-5.8-5.8l1.6-.3.7 1.7-1.3 1" {...traco} />
    </svg>
  );
}

function IconeInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5" {...traco} />
      <circle cx="12" cy="12" r="4" {...traco} />
      <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconeLocal() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M12 21s6.5-5.6 6.5-10a6.5 6.5 0 0 0-13 0c0 4.4 6.5 10 6.5 10Z" {...traco} />
      <circle cx="12" cy="11" r="2.4" {...traco} />
    </svg>
  );
}
