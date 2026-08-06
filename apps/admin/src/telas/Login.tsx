/**
 * Login do painel — Seção 7.15 (Acesso).
 *
 * "formulário de e-mail/senha equivalente ao da Seção 7.11, porém SEM as
 *  opções de cadastro, login com Google, ou 'esqueci minha senha'
 *  self-service — administradores são criados diretamente no banco/pelo
 *  próprio time; recuperação de senha, se necessária, é feita por canal
 *  interno."
 *
 * Por isso esta tela tem exatamente três controles: e-mail, senha e Entrar.
 */
import { useState, type FormEvent } from 'react';
import { Aviso, CampoTexto } from '@/componentes/Basicos';
import { useSessaoAdmin } from '@/contexto/SessaoAdmin';
import { entrar, NAO_E_ADMINISTRADOR, sair } from '@/dados/sessao';

export function Login() {
  const { administrador, autenticado, recarregar } = useSessaoAdmin();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  // Autenticado mas sem registro de administrador: credencial válida no mesmo
  // Supabase Auth, acesso nenhum aqui (Seção 11.1).
  const contaSemAcesso = autenticado && !administrador;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setEntrando(true);

    try {
      await entrar(email, senha);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setEntrando(false);
    }
  };

  if (contaSemAcesso) {
    return (
      <div className="centralizado">
        <h1>Painel Administrativo</h1>
        <div style={{ maxWidth: 420 }}>
          <Aviso mensagem={NAO_E_ADMINISTRADOR} tom="alerta" />
          <button
            type="button"
            className="botao discreto"
            onClick={async () => {
              await sair();
              await recarregar();
            }}
          >
            Entrar com outra conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="centralizado">
      <img
        src="/marca/logo-nome-escuro.png"
        alt="Decola Negócios"
        style={{ width: 200, height: 'auto' }}
      />
      <p className="legenda">Painel Administrativo</p>

      <form className="card" style={{ width: 380, textAlign: 'left' }} onSubmit={enviar}>
        {erro ? <Aviso mensagem={erro} /> : null}

        <CampoTexto
          rotulo="E-mail"
          valor={email}
          aoMudar={setEmail}
          tipo="email"
          desabilitado={entrando}
        />
        <CampoTexto
          rotulo="Senha"
          valor={senha}
          aoMudar={setSenha}
          tipo="password"
          desabilitado={entrando}
        />

        <button
          type="submit"
          className="botao"
          style={{ width: '100%' }}
          disabled={entrando || !email.trim() || !senha}
        >
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="legenda" style={{ maxWidth: 380 }}>
        Acesso restrito à equipe da plataforma. Contas de administrador são criadas internamente —
        não há cadastro nem recuperação de senha por autoatendimento.
      </p>

      <img
        src="/marca/by-decola-escuro.png"
        alt="by Decola"
        style={{ width: 80, height: 'auto', opacity: 0.5 }}
      />
    </div>
  );
}
