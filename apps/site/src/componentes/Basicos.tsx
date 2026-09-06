/**
 * Peças de interface do site.
 *
 * Deliberadamente poucas: o site tem quatro telas, e um sistema de
 * componentes maior aqui seria estrutura sem uso. O que existe é o que
 * aparece em mais de uma tela.
 */
import type { ReactNode } from 'react';

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

export function Moldura({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="topo">
        <img src="/marca/logo-nome-claro.png" alt="Decola Negócios" />
      </header>
      {children}
      <footer className="rodape">
        Decola Negócios — gestão para pequenos e médios negócios.
      </footer>
    </>
  );
}
