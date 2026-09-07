/**
 * Aceite de convite de funcionário — Seção 5.2, item 4, na web.
 *
 * Os dois caminhos da especificação:
 *   já tem conta ....... entra e aceita participar da empresa
 *   não tem conta ...... cria a conta e o vínculo acontece no mesmo passo
 *
 * O e-mail é digitado porque a RLS impede o convidado de ler o próprio
 * convite antes de aceitá-lo — quem confere se ele bate é a RPC, no banco.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Aviso, CampoTexto, Carregando, LINK_DO_APP } from '@/componentes/Basicos';
import {
  aceitarConvite,
  criarContaDoConvidado,
  entrarComSenha,
  sessaoAtual,
} from '@/dados/convite';

type Estado = 'verificando' | 'formulario' | 'logado' | 'aceito';

export function Convite() {
  const { id } = useParams<{ id: string }>();

  const [estado, setEstado] = useState<Estado>('verificando');
  const [emailDaSessao, setEmailDaSessao] = useState<string | null>(null);
  const [temConta, setTemConta] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const [mensagem, setMensagem] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void sessaoAtual().then((sessao) => {
      if (!ativo) return;
      setEmailDaSessao(sessao?.email ?? null);
      setEstado(sessao ? 'logado' : 'formulario');
    });
    return () => {
      ativo = false;
    };
  }, []);

  const aceitar = useCallback(async () => {
    if (!id) return;
    setMensagem(null);
    setProcessando(true);
    try {
      await aceitarConvite(id);
      setEstado('aceito');
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Não foi possível aceitar o convite.');
    } finally {
      setProcessando(false);
    }
  }, [id]);

  const aoEnviar = useCallback(
    async (evento: FormEvent) => {
      evento.preventDefault();
      if (!id) return;

      setMensagem(null);
      setProcessando(true);
      try {
        if (temConta) {
          await entrarComSenha(email, senha);
        } else {
          if (!nome.trim()) throw new Error('Informe seu nome completo.');
          await criarContaDoConvidado(nome, email, senha);
        }
        await aceitarConvite(id);
        setEstado('aceito');
      } catch (e) {
        setMensagem(e instanceof Error ? e.message : 'Não foi possível aceitar o convite.');
      } finally {
        setProcessando(false);
      }
    },
    [id, temConta, nome, email, senha],
  );

  if (!id) {
    return (
      <main className="pagina estreita">
        <h1>Convite</h1>
        <Aviso mensagem="Este endereço não tem um convite válido. Use o link que você recebeu por e-mail." />
      </main>
    );
  }

  if (estado === 'verificando') {
    return (
      <main className="pagina estreita">
        <Carregando />
      </main>
    );
  }

  if (estado === 'aceito') {
    return (
      <main className="pagina estreita">
        <div className="cabecalho-pagina">
          <h1>Convite aceito</h1>
        </div>
        <Aviso tom="sucesso" mensagem="Pronto! Você já faz parte da equipe." />
        <div className="card">
          <h2>Entrar agora</h2>
          <p>
            Use o mesmo e-mail e senha desta conta. Não precisa instalar nada — o Decola Negócios
            abre no navegador.
          </p>
        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
            <a className="botao" href={LINK_DO_APP}>
              Entrar no Decola Negócios
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pagina estreita">
      <div className="cabecalho-pagina">
        <h1>Você foi convidado</h1>
        <p>Aceite o convite para fazer parte da equipe no Decola Negócios.</p>
      </div>

      {mensagem ? <Aviso mensagem={mensagem} /> : null}

      {estado === 'logado' ? (
        <>
          <div className="card">
            <p className="legenda">Você está conectado como</p>
            <p>
              <strong>{emailDaSessao}</strong>
            </p>
            <button type="button" className="botao" onClick={aceitar} disabled={processando}>
              {processando ? 'Aceitando…' : 'Aceitar convite'}
            </button>
          </div>
          {/* O convite vale para um e-mail específico. Quem chegou logado com
              outra conta precisa saber disso antes de tentar e ser recusado. */}
          <p className="legenda">
            O convite foi enviado para um e-mail específico. Se não for este, saia desta conta e
            entre com o e-mail que recebeu o convite.
          </p>
        </>
      ) : (
        <form onSubmit={aoEnviar} noValidate>
          <div className="card">
            <p className="legenda" style={{ marginTop: 0 }}>
              {temConta
                ? 'Entre com a conta que recebeu o convite.'
                : 'Crie sua conta com o e-mail que recebeu o convite.'}
            </p>

            {!temConta ? (
              <CampoTexto
                rotulo="Seu nome completo"
                valor={nome}
                aoMudar={setNome}
                bloqueado={processando}
                autoComplete="name"
              />
            ) : null}

            <CampoTexto
              rotulo="E-mail do convite"
              valor={email}
              aoMudar={setEmail}
              tipo="email"
              bloqueado={processando}
              autoComplete="email"
              placeholder="voce@exemplo.com"
            />
            <CampoTexto
              rotulo={temConta ? 'Sua senha' : 'Crie uma senha'}
              valor={senha}
              aoMudar={setSenha}
              tipo="password"
              bloqueado={processando}
              autoComplete={temConta ? 'current-password' : 'new-password'}
            />

            <button type="submit" className="botao" disabled={processando}>
              {processando ? 'Aceitando…' : 'Aceitar convite'}
            </button>
          </div>

          <button
            type="button"
            className="botao texto"
            onClick={() => {
              setTemConta((v) => !v);
              setMensagem(null);
            }}
            disabled={processando}
          >
            {temConta ? 'Ainda não tenho conta' : 'Já tenho conta'}
          </button>
        </form>
      )}
    </main>
  );
}
