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
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  estadoDaLoja,
  lerHorario,
  resumoDaSemana,
} from '@/dados/horario';
import { lembrarCaraDaLoja } from '@/componentes/CarregandoLoja';
import { paletaDaLoja } from '@decola/theme';
import {
  moeda,
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
 *
 * A CLASSE `vitrine` VEM JUNTO, e é ela que liga o desenho aprovado da loja:
 * paleta fria, Plus Jakarta Sans nos números, cartões de imagem grande. O
 * bloco correspondente em `estilos.css` explica por que ele é escopado.
 *
 * `--cor-loja` passa a existir SEMPRE, com o azul da marca como padrão. Antes
 * ela só aparecia quando o lojista tinha escolhido uma cor, e cada regra do CSS
 * carregava um `var(--cor-loja, …)` com a reserva escrita do lado. Com a
 * variável sempre presente, "a cor desta loja" é uma pergunta com uma resposta
 * só — inclusive para o `color-mix`, que não aceita reserva.
 */
export function CoresDaLoja({ loja, children }: { loja: Loja; children: React.ReactNode }) {
  /**
   * TRÊS CORES ENTRAM, uma dúzia sai.
   *
   * O lojista escolhe fundo, destaque e texto; superfície dos cartões, texto
   * secundário, linhas e o ladrilho das fotos são derivados — e a legibilidade
   * é conferida antes, em `@/dados/paleta`. Sem essa derivação, personalizar a
   * loja seria escolher doze cores; com ela, é escolher três e o resto
   * acompanha sem quebrar.
   */
  const paleta = useMemo(
    () =>
      paletaDaLoja({
        destaque: loja.loja_cor,
        fundo: loja.loja_cor_fundo,
        texto: loja.loja_cor_texto,
      }),
    [loja.loja_cor, loja.loja_cor_fundo, loja.loja_cor_texto],
  );

  const cor = paleta.destaque;

  /**
   * O fundo do documento também vira a cor da loja.
   *
   * Sem isto, puxar a página além do fim (o "elástico" do celular) mostra o
   * cinza da plataforma por baixo do rodapé — exatamente o "por que não fica
   * azul até embaixo?" que motivou este ajuste. A limpeza devolve o valor
   * anterior: fora da vitrine o site continua sendo o site.
   */
  useEffect(() => {
    const anterior = document.body.style.backgroundColor;
    document.body.style.backgroundColor = cor;
    return () => {
      document.body.style.backgroundColor = anterior;
    };
  }, [cor]);

  /**
   * Guarda a cara da loja para a PRÓXIMA abertura.
   *
   * É o que faz a tela de carregamento já ter a cor certa quando o cliente
   * volta — na primeira visita não há como, porque as cores vêm da consulta que
   * a própria tela está esperando.
   */
  useEffect(() => {
    lembrarCaraDaLoja(loja.slug, {
      nome: loja.nome,
      destaque: paleta.destaque,
      fundo: paleta.fundo,
    });
  }, [loja.slug, loja.nome, paleta.destaque, paleta.fundo]);

  return (
    <div
      className="vitrine"
      style={
        {
          '--cor-loja': paleta.destaque,
          '--cor-sobre-loja': paleta.sobreDestaque,
          '--cor-sobre-barra': paleta.sobreBarra,
          // Os tokens do desenho, agora vindos da escolha do lojista. Os nomes
          // são os mesmos do bloco `.vitrine` em estilos.css — lá eles têm o
          // valor do desenho; aqui, o da loja.
          '--v-fundo': paleta.fundo,
          '--v-superficie': paleta.superficie,
          '--v-ladrilho': paleta.ladrilho,
          '--v-tinta': paleta.tinta,
          '--v-suave': paleta.suave,
          '--v-linha': paleta.linha,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

/* ============================================================== a marca == */

/**
 * A barra da marca: o nome da loja, o que ela vende e as duas ações que o
 * cliente repete o tempo todo.
 *
 * O QUE ELA SUBSTITUI. Antes a loja se apresentava num cartão branco com foto
 * de perfil redonda, nome e uma fileira de pastilhas de contato — um "perfil de
 * rede social" ocupando a primeira dobra inteira, antes de qualquer produto. O
 * desenho aprovado troca isso por uma faixa na cor da loja, com o nome em letra
 * de marca: ela ocupa um terço do espaço, diz a mesma coisa e ainda tinge o
 * topo da página com a cor do lojista. Os contatos não sumiram — desceram para
 * o rodapé, que é onde se procura telefone e endereço.
 *
 * A LUPA NÃO ABRE NADA. Ela leva o foco para o campo de busca da própria
 * página, quando ele existe; nas telas que não têm busca (carrinho, pedido),
 * volta para a vitrine, que tem. Um botão que às vezes não faz nada é pior do
 * que um botão a menos.
 */
export function BarraDaMarca({ loja, itensNoCarrinho }: { loja: Loja; itensNoCarrinho: number }) {
  const navegar = useNavigate();

  const buscar = useCallback(() => {
    const campo = document.getElementById(ID_DA_BUSCA);
    if (campo) {
      campo.scrollIntoView({ block: 'center', behavior: 'smooth' });
      campo.focus();
      return;
    }
    navegar(`/${loja.slug}`);
  }, [navegar, loja.slug]);

  return (
    <div className="loja-marca">
      <div className="loja-marca-linha">
        <Link to={`/${loja.slug}`} className="loja-marca-texto">
          <span className="loja-marca-nome">{loja.nome}</span>
          {loja.descricao ? <span className="loja-marca-tagline">{loja.descricao}</span> : null}
          <SeloDeAtendimento loja={loja} />
        </Link>

        <div className="loja-marca-acoes">
          <button
            type="button"
            className="loja-marca-botao"
            onClick={buscar}
            aria-label="Buscar na loja"
          >
            <IconeBusca tamanho={23} />
          </button>

          <Link
            to={`/${loja.slug}/carrinho`}
            className="loja-marca-botao"
            aria-label={
              itensNoCarrinho > 0
                ? `Carrinho, ${itensNoCarrinho} ${itensNoCarrinho === 1 ? 'item' : 'itens'}`
                : 'Carrinho'
            }
          >
            <IconeCarrinho tamanho={24} />
            {itensNoCarrinho > 0 ? (
              <span className="loja-marca-contador">{itensNoCarrinho}</span>
            ) : null}
          </Link>
        </div>
      </div>
    </div>
  );
}

/* =========================================================== horário == */

/**
 * "Aberta agora" / "Fechada · Abre amanhã às 08:00", na barra da marca.
 *
 * O SELO SÓ APARECE SE HOUVER HORÁRIO. Sem ele não dizemos nada — uma loja que
 * nunca configurou não pode receber um carimbo de "fechada" que ela não pediu,
 * e também não pode receber um "aberta" que talvez seja mentira.
 *
 * O relógio anda enquanto a página está aberta: quem entra às 17h59 de uma loja
 * que fecha às 18h vê o selo virar sozinho, sem recarregar. Um minuto de
 * intervalo é o passo certo — é a menor unidade que o horário tem.
 */
export function SeloDeAtendimento({ loja }: { loja: Loja }) {
  const horario = useMemo(() => lerHorario(loja.horario_funcionamento), [loja.horario_funcionamento]);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    if (!horario) return;
    const relogio = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(relogio);
  }, [horario]);

  if (!horario) return null;

  const estado = estadoDaLoja(horario, agora);

  return (
    <span className={estado.aberta ? 'loja-selo-horario aberta' : 'loja-selo-horario'}>
      <span className="loja-selo-ponto" aria-hidden="true" />
      {estado.aberta
        ? `Aberta agora${estado.fechaAs ? ` · fecha às ${estado.fechaAs}` : ''}`
        : `Fechada${estado.proximaAbertura ? ` · ${estado.proximaAbertura.toLowerCase()}` : ''}`}
    </span>
  );
}

/**
 * O aviso de loja fechada, nas duas telas em que ele aparece.
 *
 * Um componente, e não dois textos parecidos: ele aparece na hora de fechar o
 * pedido e de novo na tela do pedido pronto — os dois momentos em que a pessoa
 * já pagou ou está prestes a pagar. Dizer coisas diferentes nos dois lugares é
 * o que faz alguém achar que deu errado e mandar mensagem no WhatsApp da loja
 * perguntando se o pedido chegou.
 */
export function AvisoDeLojaFechada({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="aviso-fechada" role="status">
      <span className="relogio" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" {...traco}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 1.8" />
        </svg>
      </span>
      <span>
        <strong>{titulo}</strong>
        {texto}
      </span>
    </div>
  );
}

/** A semana inteira, para o rodapé. */
function HorarioDaLoja({ loja }: { loja: Loja }) {
  const horario = useMemo(() => lerHorario(loja.horario_funcionamento), [loja.horario_funcionamento]);
  if (!horario) return null;

  return (
    <div>
      <h2>Atendimento</h2>
      {resumoDaSemana(horario).map((linha) => (
        <p key={linha.dias} className="loja-rodape-horario">
          <span>{linha.dias}</span>
          <span>{linha.faixa}</span>
        </p>
      ))}
    </div>
  );
}

/* ============================================================== rodapé == */

/**
 * Rodapé da loja: contato, navegação e a assinatura da plataforma.
 *
 * É ele que faz o azul chegar até embaixo — cantos arredondados em cima, cor da
 * loja, e a inicial dela gigante e quase apagada no canto. A marca d'água não
 * pede arte nenhuma ao lojista: ela é a primeira letra do nome que ele já
 * digitou no cadastro.
 *
 * Os contatos vieram do cartão de perfil que existia no topo. Continuam
 * condicionais um a um: um "Instagram" que não leva a lugar nenhum é pior que a
 * ausência dele — ensina o visitante a desconfiar do resto da página.
 */
export function RodapeDaLoja({ loja }: { loja: Loja }) {
  const endereco = loja.endereco?.trim();
  const inicial = loja.nome.trim().charAt(0).toUpperCase() || 'L';

  return (
    <footer className="loja-rodape">
      <span aria-hidden="true" className="loja-rodape-marca-dagua">
        {inicial}
      </span>

      <div className="loja-rodape-colunas">
        <div>
          {loja.logo_url ? (
            <img className="loja-rodape-logo" src={urlDaLoja(loja.logo_url)} alt="" loading="lazy" />
          ) : null}
          <span className="loja-rodape-nome">{loja.nome}</span>
          {loja.descricao ? <p className="loja-rodape-tagline">{loja.descricao}</p> : null}
        </div>

        {loja.whatsapp || loja.instagram || endereco ? (
          <div>
            <h2>Contato</h2>
            {loja.whatsapp ? (
              <p>
                <a href={`https://wa.me/${loja.whatsapp}`} target="_blank" rel="noreferrer noopener">
                  WhatsApp
                </a>
              </p>
            ) : null}
            {loja.instagram ? (
              <p>
                <a
                  href={urlDoInstagram(loja.instagram)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  @{loja.instagram}
                </a>
              </p>
            ) : null}
            {endereco ? (
              <p>
                {/* Abre no mapa do aparelho: quem toca num endereço quer chegar lá. */}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {endereco}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}

        <HorarioDaLoja loja={loja} />

        <div>
          <h2>Navegar</h2>
          <p>
            <Link to={`/${loja.slug}`}>Todos os produtos</Link>
          </p>
          <p>
            <Link to={`/${loja.slug}/categorias`}>Categorias</Link>
          </p>
          <p>
            <Link to={`/${loja.slug}/pedidos`}>Meus pedidos</Link>
          </p>
        </div>
      </div>

      <div className="loja-rodape-fim">
        <span>
          © {new Date().getFullYear()} {loja.nome}
        </span>
        <span>Loja criada com Decola Negócios</span>
      </div>
    </footer>
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
    <div className="loja-carrossel-area">
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
    </div>

      {/**
        * OS PONTOS FICAM FORA DA MOLDURA, e não por cima da imagem.
        *
        * Sobre um banner claro — e banner de promoção costuma ser claro — o
        * ponto branco desaparecia, e junto com ele a única pista de que havia
        * mais de um. Abaixo, sobre o fundo da página, eles usam a cor da loja e
        * se leem em qualquer banner.
        */}
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

/**
 * O campo de busca tem um nome fixo no documento porque a lupa da barra da
 * marca precisa achá-lo de outro canto da árvore. Um `ref` não serviria: os
 * dois componentes não têm parentesco nenhum.
 */
export const ID_DA_BUSCA = 'loja-busca';

export function BuscaDeProdutos({
  valor,
  aoMudar,
  placeholder = 'Buscar na loja…',
  /** `true` na vitrine: a busca acompanha a rolagem, grudada no topo. */
  fixa = false,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  fixa?: boolean;
}) {
  /**
   * ELA FILTRA ENQUANTO SE DIGITA — e mesmo assim precisava de um "pesquisar".
   *
   * O relato foi "digito e não tenho como confirmar; o Enter não faz nada". Os
   * resultados já apareciam a cada letra, mas no celular ninguém via: o teclado
   * cobre a tela inteira, a tecla de busca não fazia nada (um `input` solto não
   * tem o que submeter) e a pessoa ficava esperando um botão que não existia.
   *
   * Virar `form` resolve os dois de uma vez: o Enter e a tecla "pesquisar" do
   * teclado passam a submeter, e submeter aqui significa TIRAR O TECLADO DA
   * FRENTE — é o foco no campo que o mantém aberto. Não há nada a recarregar,
   * então o `preventDefault` é o comportamento inteiro.
   */
  const confirmar = (evento: FormEvent) => {
    evento.preventDefault();
    document.getElementById(ID_DA_BUSCA)?.blur();
  };

  const campo = (
    <form className="loja-busca" onSubmit={confirmar} role="search">
      <IconeBusca tamanho={21} />
      <input
        id={ID_DA_BUSCA}
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label="Buscar produtos"
        /* No celular, a tecla de ação do teclado passa a dizer "pesquisar". */
        enterKeyHint="search"
      />
      {valor ? (
        <>
          <button type="button" onClick={() => aoMudar('')} aria-label="Limpar busca">
            ×
          </button>
          {/* Só aparece com texto digitado: um botão de pesquisar sobre um
              campo vazio não faria nada, e ocupa o lugar de quem está lendo. */}
          <button type="submit" className="loja-busca-ir" aria-label="Pesquisar">
            <IconeBusca tamanho={18} />
          </button>
        </>
      ) : null}
    </form>
  );

  return fixa ? <div className="loja-busca-topo">{campo}</div> : campo;
}

/* =========================================================== categorias == */

/**
 * Cabeçalho do catálogo: o título, quantos itens ele tem e o funil.
 *
 * O QUE ELE SUBSTITUI. A vitrine trazia uma fileira de categorias em círculo,
 * com a foto emprestada de um produto. Ela era bonita e custava uma dobra
 * inteira acima do primeiro produto — numa loja de seis categorias o cliente
 * rolava um catálogo de fotos antes de chegar ao catálogo de verdade. O desenho
 * aprovado troca a fileira por um botão de 40px: quem quer filtrar toca nele,
 * quem não quer vê produto onde antes via categoria.
 *
 * As categorias não mudaram de endereço — são as mesmas rotas de sempre, agora
 * listadas dentro da folha.
 */
export function CabecalhoDoCatalogo({
  titulo,
  contagem,
  slug,
  categorias,
  ativa = null,
}: {
  titulo: string;
  /** Texto à direita do título ("12 produtos"). Vazio esconde. */
  contagem?: string;
  slug: string;
  categorias: CategoriaVitrine[];
  ativa?: string | null;
}) {
  const [aberta, setAberta] = useState(false);

  return (
    <div className="loja-secao-topo">
      <div className="loja-secao-titulo-grupo">
        <h2 className="loja-secao-titulo">{titulo}</h2>
        {contagem ? <span className="loja-secao-contagem">{contagem}</span> : null}
      </div>

      {categorias.length > 0 ? (
        <>
          <button
            type="button"
            className={ativa === null ? 'loja-filtro-botao' : 'loja-filtro-botao ativo'}
            onClick={() => setAberta(true)}
            aria-label="Filtrar por categoria"
            aria-haspopup="dialog"
          >
            <IconeFunil />
          </button>

          {aberta ? (
            <FolhaDeCategorias
              slug={slug}
              categorias={categorias}
              ativa={ativa}
              aoFechar={() => setAberta(false)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** A folha que sobe de baixo com as categorias da loja. */
function FolhaDeCategorias({
  slug,
  categorias,
  ativa,
  aoFechar,
}: {
  slug: string;
  categorias: CategoriaVitrine[];
  ativa: string | null;
  aoFechar: () => void;
}) {
  // Fechar no Esc: quem abriu a folha sem querer, no computador, não deveria
  // precisar mirar num × de 40px para sair dela.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  return (
    <div className="loja-folha" role="dialog" aria-modal="true" aria-label="Filtrar por categoria">
      <button type="button" className="loja-folha-fundo" aria-label="Fechar" onClick={aoFechar} />

      <div className="loja-folha-corpo">
        <div className="loja-folha-topo">
          <h2>Filtrar</h2>
          <button type="button" className="loja-folha-fechar" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <h3 className="loja-folha-rotulo">Categoria</h3>
        <div className="loja-folha-chips">
          <Link to={`/${slug}`} onClick={aoFechar} className={ativa === null ? 'chip ativo' : 'chip'}>
            Todos
          </Link>
          {categorias.map((c) => (
            <Link
              key={c.id}
              to={`/${slug}/categoria/${c.id}`}
              onClick={aoFechar}
              className={ativa === c.id ? 'chip ativo' : 'chip'}
            >
              {c.nome}
            </Link>
          ))}
        </div>
      </div>
    </div>
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

/** A partir de quantas unidades o estoque deixa de ser notícia. */
const ESTOQUE_BAIXO = 3;

/**
 * O que a linha de estoque diz, e por que ela existe.
 *
 * O desenho original desta vitrine trazia estrelas e número de avaliações. Não
 * temos nem uma coisa nem outra — e inventar "4,8 (124)" numa loja que nunca
 * recebeu uma avaliação seria mentir para o cliente do lojista. O estoque ocupa
 * o mesmo lugar e é verdade: já está na view, calculado como
 * `estoque_atual - estoque_reservado`.
 *
 * Ele também trabalha. "Últimas 3 unidades" apressa a decisão; "Sem estoque"
 * evita a frustração de tocar, esperar carregar e só então descobrir.
 */
function linhaDeEstoque(disponivel: number): { texto: string; baixo: boolean } {
  if (disponivel <= 0) return { texto: 'Sem estoque', baixo: false };
  if (disponivel <= ESTOQUE_BAIXO) {
    return {
      texto: `${disponivel === 1 ? 'Última unidade' : `Últimas ${disponivel} unidades`}`,
      baixo: true,
    };
  }
  return { texto: `${disponivel} disponíveis`, baixo: false };
}

/**
 * Cartão de produto — a peça que o desenho aprovado mais mudou.
 *
 * ANTES: foto pequena, nome, preço na cor da marca e um botão redondo de 40px
 * no canto, com só um ícone de carrinho dentro. O botão era discreto ao ponto
 * de passar despercebido, e o cartão inteiro cabia em 150px porque a grade se
 * arranjava sozinha com `auto-fill`.
 *
 * AGORA: a foto é um ladrilho quadrado que ocupa a largura toda do cartão, o
 * preço é o maior texto da peça e na cor da loja, e a ação virou um botão de
 * largura total com a palavra escrita. Em cima da foto, quando há o que dizer,
 * um selo: laranja para "Mais vendido" (o `destaque` que o lojista marca no
 * aplicativo), cinza para "Esgotado".
 *
 * ESGOTADO CONTINUA SENDO UM BOTÃO, e desabilitado. Um cartão que perde o botão
 * muda de altura e desalinha a linha inteira da grade; e "Indisponível" escrito
 * onde a pessoa procura "Adicionar" responde a pergunta dela sem ela precisar
 * caçar a resposta em outro canto do cartão.
 */
/**
 * O "adicionado!" que o botão precisava.
 *
 * O carrinho é local e instantâneo, e essa era justamente a causa da queixa:
 * NADA acontecia na tela. O contador lá no rodapé subia, longe do dedo, e a
 * pessoa clicava de novo — e de novo — achando que o primeiro toque falhou. O
 * estoque no cartão até muda, mas um número diminuindo não se lê como "deu
 * certo".
 *
 * O aviso dura 1,4s: tempo de ser visto e de sumir antes do produto seguinte.
 *
 * O CLIQUE CONTINUA VALENDO enquanto ele aparece — quem quer dois toca duas
 * vezes, e travar o botão trocaria uma dúvida por uma recusa. O que muda é só
 * o que se vê.
 */
function useConfirmacaoDeAdicao(acao: () => void) {
  const [adicionado, setAdicionado] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sair da página com o relógio pendente deixaria um `setState` procurando um
  // componente que não existe mais.
  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );

  const confirmar = useCallback(() => {
    acao();
    setAdicionado(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setAdicionado(false), 1400);
  }, [acao]);

  return { adicionado, confirmar };
}

/** O tique da confirmação. */
export function IconeCerto({ tamanho = 16 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

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
  const estoque = linhaDeEstoque(produto.disponivel);
  const capa = produto.imagens[0];
  const selo = esgotado ? 'Esgotado' : produto.destaque ? 'Mais vendido' : null;
  const { adicionado, confirmar: adicionar } = useConfirmacaoDeAdicao(() =>
    aoAdicionar(produto.id),
  );

  return (
    <article className={esgotado ? 'produto esgotado' : 'produto'}>
      <Link to={`/${slug}/produto/${produto.id}`} className="produto-ladrilho">
        {capa ? (
          <img src={urlDaImagem(capa)} alt={produto.nome} loading="lazy" />
        ) : (
          <span className="produto-ladrilho-vazio" aria-hidden="true">
            {produto.nome.charAt(0).toUpperCase()}
          </span>
        )}

        {selo ? (
          <span className={esgotado ? 'produto-selo apagado' : 'produto-selo'}>{selo}</span>
        ) : null}
      </Link>

      <div className="produto-corpo">
        <Link to={`/${slug}/produto/${produto.id}`} className="produto-nome-link">
          <h3 className="produto-nome">{produto.nome}</h3>
        </Link>

        <span className={estoque.baixo ? 'produto-estoque baixo' : 'produto-estoque'}>
          {estoque.texto}
        </span>

        <span className="produto-preco">{moeda(produto.preco)}</span>

        <button
          type="button"
          className={adicionado ? 'produto-cta adicionado' : 'produto-cta'}
          disabled={esgotado}
          onClick={adicionar}
          aria-label={
            esgotado ? `${produto.nome} indisponível` : `Adicionar ${produto.nome} ao carrinho`
          }
        >
          {adicionado ? <IconeCerto tamanho={16} /> : <IconeCarrinho tamanho={16} />}
          {esgotado ? (
            <span>Indisponível</span>
          ) : adicionado ? (
            <span>Adicionado!</span>
          ) : (
            <span>
              <span className="rotulo-curto">Adicionar</span>
              <span className="rotulo-longo">Adicionar ao carrinho</span>
            </span>
          )}
        </button>
      </div>
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

function IconeCarrinho({ tamanho = 20 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true">
      <path d="M3 4.5h2.2l2.3 10.2h9.8l2.2-7.2H6.4" {...traco} />
      <circle cx="9.2" cy="19" r="1.5" {...traco} />
      <circle cx="16.6" cy="19" r="1.5" {...traco} />
    </svg>
  );
}

/** O funil do filtro. */
function IconeFunil() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path d="M3 5.5h18l-7 8v5.5l-4 2v-7.5l-7-8Z" {...traco} strokeWidth={1.9} />
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

function IconeBusca({ tamanho = 18 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="6.3" {...traco} strokeWidth={2} />
      <path d="m15.4 15.4 4 4" {...traco} strokeWidth={2} />
    </svg>
  );
}
