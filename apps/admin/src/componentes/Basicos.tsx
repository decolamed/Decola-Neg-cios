/**
 * Componentes básicos do painel.
 *
 * A Seção 7.15 exige os mesmos quatro estados de tela do app cliente
 * (carregando, vazio, erro com retry, sem conexão) — centralizá-los aqui evita
 * que uma listagem esqueça um deles ou invente um texto próprio.
 */
import type { ChangeEvent, ReactNode } from 'react';

export function Aviso({
  mensagem,
  tom = 'erro',
}: {
  mensagem: string;
  tom?: 'erro' | 'sucesso' | 'alerta';
}) {
  return (
    <div className={`aviso ${tom}`} role="alert">
      {mensagem}
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <p className="vazio">{texto}</p>;
}

export function ErroComRetry({
  mensagem,
  aoTentarNovamente,
}: {
  mensagem: string;
  aoTentarNovamente: () => void;
}) {
  return (
    <div className="card">
      <Aviso mensagem={mensagem} />
      <button type="button" className="botao discreto" onClick={aoTentarNovamente}>
        Tentar novamente
      </button>
    </div>
  );
}

export function Vazio({ mensagem }: { mensagem: string }) {
  return <p className="vazio">{mensagem}</p>;
}

export function Campo({
  rotulo,
  children,
  erro,
}: {
  rotulo: string;
  children: ReactNode;
  erro?: string | null;
}) {
  return (
    <label className={`campo${erro ? ' com-erro' : ''}`}>
      <span>{rotulo}</span>
      {children}
      {erro ? <span style={{ color: 'var(--cor-erro)' }}>{erro}</span> : null}
    </label>
  );
}

export function CampoTexto({
  rotulo,
  valor,
  aoMudar,
  tipo = 'text',
  placeholder,
  erro,
  desabilitado,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  tipo?: 'text' | 'email' | 'password' | 'number' | 'date';
  placeholder?: string;
  erro?: string | null;
  desabilitado?: boolean;
}) {
  return (
    <Campo rotulo={rotulo} erro={erro}>
      <input
        type={tipo}
        value={valor}
        placeholder={placeholder}
        disabled={desabilitado}
        onChange={(e: ChangeEvent<HTMLInputElement>) => aoMudar(e.target.value)}
      />
    </Campo>
  );
}

export function Seletor<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  desabilitado,
}: {
  rotulo: string;
  valor: T;
  opcoes: { valor: T; rotulo: string }[];
  aoMudar: (valor: T) => void;
  desabilitado?: boolean;
}) {
  return (
    <Campo rotulo={rotulo}>
      <select
        value={valor}
        disabled={desabilitado}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => aoMudar(e.target.value as T)}
      >
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    </Campo>
  );
}

export function Modal({
  titulo,
  children,
  aoFechar,
}: {
  titulo: string;
  children: ReactNode;
  aoFechar: () => void;
}) {
  return (
    <div
      className="fundo-modal"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}
