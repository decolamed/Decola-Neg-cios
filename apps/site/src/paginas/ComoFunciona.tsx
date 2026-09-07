/**
 * Como funciona — o storyboard de quem está chegando agora.
 *
 * POR QUE ESTA PÁGINA EXISTE. Quem contrata o Decola Negócios abre o
 * aplicativo pela primeira vez sem nunca ter visto nada parecido, e o
 * aplicativo não tem tempo de se explicar: já é a tela de vender. Esta página
 * é o que se manda ANTES, num link de WhatsApp, para a pessoa entender o
 * caminho inteiro em dois minutos — e, principalmente, para ela colocar o
 * aplicativo na tela do celular, que é o passo em que quase todo mundo
 * desiste sozinho.
 *
 * As telinhas dos quadros são desenhadas com <div>, não são capturas. É de
 * propósito: captura de tela envelhece a cada mudança de layout e ninguém
 * lembra de trocar. O que estes quadros precisam mostrar é a FORMA da tela —
 * onde ficam as coisas — e isso muda muito mais devagar.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LINK_DO_APP } from '@/componentes/Basicos';

type Cena = {
  titulo: string;
  texto: string;
  tela: JSX.Element;
};

/** Telinha genérica: a moldura do celular com o que estiver dentro. */
function Telinha({ children, topo }: { children: React.ReactNode; topo?: string }) {
  return (
    <div className="cena-tela" aria-hidden="true">
      {topo ? <div className="cena-topo">{topo}</div> : null}
      <div className="cena-corpo">{children}</div>
    </div>
  );
}

function Linha({ largura = '100%', alto = 8, forte = false }: { largura?: string; alto?: number; forte?: boolean }) {
  return <div className={`cena-linha${forte ? ' forte' : ''}`} style={{ width: largura, height: alto }} />;
}

const CENAS: Cena[] = [
  {
    titulo: 'Uma porta só',
    texto:
      'Você entra com o mesmo e-mail e senha de sempre. O aplicativo reconhece quem é você e ' +
      'abre a tela certa — não existe "endereço do gerente" e "endereço do funcionário".',
    tela: (
      <Telinha>
        <div className="cena-marca" />
        <Linha largura="80%" />
        <Linha largura="80%" />
        <div className="cena-botao" />
      </Telinha>
    ),
  },
  {
    titulo: 'O dia do seu negócio, na abertura',
    texto:
      'A primeira tela mostra quanto entrou hoje, quantas vendas saíram e o que está acabando no ' +
      'estoque. É a pergunta que todo dono faz de manhã, já respondida.',
    tela: (
      <Telinha topo="Início">
        <div className="cena-cartoes">
          <div className="cena-cartao destaque" />
          <div className="cena-cartao" />
        </div>
        <Linha largura="60%" forte />
        <div className="cena-grafico" />
        <div className="cena-menu" />
      </Telinha>
    ),
  },
  {
    titulo: 'Vender é o botão do meio',
    texto:
      'Toque no + , escolha os produtos (ou leia o código de barras), aplique desconto se quiser e ' +
      'confirme. O estoque baixa e a venda entra no financeiro na mesma hora — você não lança nada duas vezes.',
    tela: (
      <Telinha topo="Nova venda">
        <div className="cena-item" />
        <div className="cena-item" />
        <Linha largura="45%" forte />
        <div className="cena-botao" />
        <div className="cena-menu com-mais" />
      </Telinha>
    ),
  },
  {
    titulo: 'Recebimento por Pix, sem digitar valor',
    texto:
      'Escolhendo Pix, o aplicativo gera o QR Code já com o valor da venda, usando a chave que você ' +
      'cadastrou. O cliente aponta a câmera e paga. Você confere que caiu e confirma — nada é dado ' +
      'como pago sozinho.',
    tela: (
      <Telinha topo="Finalizar venda">
        <div className="cena-formas">
          <span /><span className="ativa" /><span /><span />
        </div>
        <div className="cena-qr" />
        <div className="cena-botao" />
      </Telinha>
    ),
  },
  {
    titulo: 'Produtos que você cadastra do seu jeito',
    texto:
      'Além de nome, preço e estoque, você liga só os campos que o SEU negócio usa: tamanho P/M/G, ' +
      'numeração, cor, voltagem, armazenamento, validade, garantia. O que não serve some do formulário.',
    tela: (
      <Telinha topo="Novo produto">
        <Linha largura="100%" />
        <Linha largura="70%" />
        <div className="cena-chips">
          <span /><span className="ativa" /><span /><span /><span />
        </div>
        <div className="cena-botao" />
      </Telinha>
    ),
  },
  {
    titulo: 'Sua loja online, com a sua cara',
    texto:
      'Ligue a loja e seus produtos ganham um endereço para mandar no WhatsApp. Você escolhe o nome, ' +
      'a cor, a logo e os banners que passam no topo. Quem compra não precisa instalar nada.',
    tela: (
      <Telinha topo="Sua Loja">
        <div className="cena-banner" />
        <div className="cena-vitrine">
          <span /><span /><span /><span />
        </div>
      </Telinha>
    ),
  },
  {
    titulo: 'O pedido chega e você atende',
    texto:
      'O cliente monta o carrinho e envia. As unidades ficam reservadas para ninguém vender o mesmo ' +
      'item duas vezes. Você confirma, separa, entrega — e ao finalizar, o estoque e o financeiro se ' +
      'acertam sozinhos.',
    tela: (
      <Telinha topo="Pedido #12">
        <Linha largura="55%" forte />
        <div className="cena-passos">
          <span className="feito" /><span className="feito" /><span className="atual" /><span />
        </div>
        <div className="cena-item" />
        <div className="cena-botao" />
      </Telinha>
    ),
  },
  {
    titulo: 'Sua equipe, cada um no seu limite',
    texto:
      'Convide funcionários por e-mail e marque o que cada um pode fazer: vender, mexer no estoque, ' +
      'ver o financeiro. Quem não tem permissão não vê o dado — e não é só o botão que some, o ' +
      'sistema recusa por baixo também.',
    tela: (
      <Telinha topo="Equipe">
        <div className="cena-pessoa" />
        <div className="cena-pessoa" />
        <div className="cena-pessoa" />
        <div className="cena-botao" />
      </Telinha>
    ),
  },
];

/** Passo a passo de instalação, por aparelho. */
type Instalacao = { chave: string; aparelho: string; passos: string[] };

const INSTALACOES: Instalacao[] = [
  {
    chave: 'android',
    aparelho: 'Celular Android',
    passos: [
      'Abra o endereço do Decola Negócios no navegador Chrome.',
      'Toque nos três pontinhos (⋮) no canto superior direito.',
      'Escolha "Instalar aplicativo" — ou "Adicionar à tela inicial", se aparecer assim.',
      'Confirme. O ícone amarelo do Decola aparece junto com os seus outros aplicativos.',
    ],
  },
  {
    chave: 'ios',
    aparelho: 'iPhone ou iPad',
    passos: [
      'Abra o endereço do Decola Negócios no navegador Safari (não funciona pelo Chrome no iPhone).',
      'Toque no botão de compartilhar — o quadradinho com a seta para cima, embaixo da tela.',
      'Role a lista e escolha "Adicionar à Tela de Início".',
      'Toque em "Adicionar". O ícone fica na tela junto com os outros aplicativos.',
    ],
  },
  {
    chave: 'computador',
    aparelho: 'Computador',
    passos: [
      'Abra o endereço do Decola Negócios no Chrome ou no Edge.',
      'Clique no ícone de instalar que aparece no fim da barra de endereço.',
      'Confirme em "Instalar".',
      'O Decola abre em janela própria e fica no menu Iniciar ou no Dock.',
    ],
  },
];

/** Chuta o aparelho para deixar o passo certo já aberto. */
function aparelhoProvavel(): string {
  if (typeof navigator === 'undefined') return 'android';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'computador';
}

export function ComoFunciona() {
  const provavel = useMemo(aparelhoProvavel, []);
  const enderecoVisivel = LINK_DO_APP.replace(/^https?:\/\//, '');

  return (
    <main className="pagina">
      <div className="cabecalho-pagina">
        <h1>Como o Decola Negócios funciona</h1>
        <p>
          Oito telas e dois minutos de leitura. No fim, o passo a passo para deixar o aplicativo na
          tela do seu celular.
        </p>
      </div>

      <ol className="cenas">
        {CENAS.map((cena, indice) => (
          <li className="cena" key={cena.titulo}>
            {cena.tela}
            <div className="cena-texto">
              <span className="cena-numero">{indice + 1}</span>
              <h2>{cena.titulo}</h2>
              <p>{cena.texto}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* ------------------------------------------------------- instalação */}
      <h2 className="secao-instalar" id="instalar">
        Deixe o Decola na tela do seu celular
      </h2>
      <p className="legenda instalar-intro">
        O Decola Negócios abre pelo navegador, então não há nada para baixar de loja de aplicativos.
        Mas dá para colocar o ícone na tela inicial e usar como qualquer outro aplicativo — abre em
        tela cheia, sem barra de endereço. O endereço é{' '}
        <strong>{enderecoVisivel}</strong>.
      </p>

      {INSTALACOES.map((instalacao) => (
        <details
          className="instalar"
          key={instalacao.chave}
          open={instalacao.chave === provavel}
        >
          <summary>
            {instalacao.aparelho}
            {instalacao.chave === provavel ? <span className="marcador">seu aparelho</span> : null}
          </summary>
          <ol className="passos">
            {instalacao.passos.map((passo) => (
              <li key={passo}>{passo}</li>
            ))}
          </ol>
        </details>
      ))}

      <div className="card acoes-finais">
        <h2>Pronto para começar?</h2>
        <p className="legenda">
          Se você já contratou, é só entrar. Se ainda não, escolha um plano — dá para começar hoje.
        </p>
        <a className="botao" href={LINK_DO_APP}>
          Abrir o Decola Negócios
        </a>
        <Link className="botao discreto" to="/planos">
          Ver os planos
        </Link>
      </div>
    </main>
  );
}
