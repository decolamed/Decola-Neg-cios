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
import { useEffect, useState, type FormEvent } from 'react';
import { Aviso, CampoTexto } from '@/componentes/Basicos';
import { useSessaoAdmin } from '@/contexto/SessaoAdmin';
import { entrar, LEVANDO_AO_APLICATIVO, sair } from '@/dados/sessao';
import { CAMINHO_DO_APP } from '@/lib/enderecos';

export function Login() {
  const { administrador, autenticado, recarregar } = useSessaoAdmin();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  // Autenticado mas sem registro de administrador: credencial válida no mesmo
  // Supabase Auth, acesso nenhum AQUI (Seção 11.1) — mas acesso total ao
  // aplicativo do cliente, que é onde essa pessoa quer estar.
  const contaDeCliente = autenticado && !administrador;

  /**
   * Um endereço, um login, e o destino decidido pelo tipo de conta.
   *
   * O aplicativo é servido na mesma publicação, sob `/app`, e as duas partes
   * compartilham a sessão do navegador — então a pessoa não digita a senha de
   * novo do outro lado. Se fossem endereços diferentes, isto seria um segundo
   * login, e o encaminhamento pioraria a vida em vez de melhorar.
   */
  useEffect(() => {
    if (contaDeCliente) {
      const relogio = setTimeout(() => {
        window.location.replace(CAMINHO_DO_APP);
      }, 1200);
      return () => clearTimeout(relogio);
    }
  }, [contaDeCliente]);

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

  if (contaDeCliente) {
    return (
      <div className="centralizado">
        <h1>Decola Negócios</h1>
        <div style={{ maxWidth: 420 }}>
          <Aviso mensagem={LEVANDO_AO_APLICATIVO} tom="sucesso" />

          {/* O redirecionamento é automático; este link cobre o caso de ele
              ser barrado, e dá à pessoa algo em que clicar durante a espera. */}
          <a className="botao" href={CAMINHO_DO_APP}>
            Abrir o aplicativo
          </a>

          <button
            type="button"
            className="botao discreto"
            style={{ marginTop: 'var(--espaco-sm)' }}
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
      {/* Já não é "Painel Administrativo": esta virou a porta de todo mundo.
          Quem digita e-mail e senha aqui é encaminhado pelo tipo da conta —
          dono de negócio vai para o aplicativo, administrador da plataforma
          fica. Anunciar "acesso restrito" mandaria o cliente embora achando
          que errou o endereço, que era exatamente o beco de antes. */}
      <p className="legenda">Entre com sua conta</p>

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
        Se você é cliente do Decola Negócios, entre com o mesmo e-mail e senha de sempre — nós te
        levamos ao aplicativo.{' '}
        <a href={CAMINHO_DO_APP}>
          Esqueceu a senha, quer entrar com Google ou ainda não tem conta?
        </a>
      </p>

      <img
        src="/marca/by-decola-escuro.png"
        alt="by Decola"
        style={{ width: 80, height: 'auto', opacity: 0.5 }}
      />
    </div>
  );
}
