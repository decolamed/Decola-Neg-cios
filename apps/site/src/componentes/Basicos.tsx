/**
 * Peças de interface do site.
 *
 * Deliberadamente poucas: o site tem quatro telas, e um sistema de
 * componentes maior aqui seria estrutura sem uso. O que existe é o que
 * aparece em mais de uma tela.
 */
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

export function Aviso({
  mensagem,
  tom = 'erro',
}: {
  mensagem: string;
  tom?: 'erro' | 'sucesso' | 'alerta';
}) {
  return (
    <div className={`aviso ${tom}`} role={tom === 'erro' ? 'alert' : undefined}>
      {mensagem}
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <p className="legenda">{texto}</p>;
}

export function CampoTexto({
  rotulo,
  valor,
  aoMudar,
  tipo = 'text',
  erro,
  bloqueado,
  autoComplete,
  placeholder,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  tipo?: 'text' | 'email' | 'password';
  erro?: string | null;
  bloqueado?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className={`campo ${erro ? 'com-erro' : ''}`}>
      <span>{rotulo}</span>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        disabled={bloqueado}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={Boolean(erro)}
      />
      {erro ? <span className="erro">{erro}</span> : null}
    </label>
  );
}

/**
 * Onde o aplicativo do cliente é servido.
 *
 * Mesma publicação deste site, sob `/app`: a versão web do aplicativo é
 * exportada para `dist/app` durante o build. Um caminho, e não um domínio à
 * parte, porque assim não há um segundo projeto para alguém esquecer de
 * publicar — e porque o cliente já está aqui.
 */
export const LINK_DO_APP = '/app/';

export function Moldura({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  /**
   * Na vitrine de um negócio, quem lidera é a marca DELE.
   *
   * O topo com o logotipo do Decola faz sentido nas telas da plataforma
   * (planos, cadastro, redefinir senha), mas na loja de um lojista ele
   * disputaria a atenção com o nome do próprio negócio — e a página é dele,
   * não nossa. Aqui a plataforma vira assinatura discreta no rodapé.
   */
  const daLoja = pathname.startsWith('/loja/') || pathname.startsWith('/pedido/');

  return (
    <>
      {daLoja ? null : (
        <header className="topo">
          <img src="/marca/logo-nome-claro.png" alt="Decola Negócios" />

          {/* Sem isto o cliente que já contratou não tem por onde voltar: ele
              termina o cadastro, fecha a aba, e no dia seguinte chega ao site
              sem nenhuma porta de entrada visível. `<a>` e não `<Link>` porque
              /app é outra aplicação, servida ao lado desta, não uma rota do
              roteador daqui. */}
          <a className="entrar" href={LINK_DO_APP}>
            Entrar
          </a>
        </header>
      )}

      {children}

      <footer className="rodape">
        {daLoja ? (
          <>
            Loja online feita com <strong>Decola Negócios</strong>
          </>
        ) : (
          'Decola Negócios — gestão para pequenos e médios negócios.'
        )}
      </footer>
    </>
  );
}
