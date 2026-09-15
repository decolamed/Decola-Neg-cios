/**
 * Aceite de convite de funcionário — Seção 5.2, item 4, na web.
 *
 * Os dois caminhos da especificação:
 *   já tem conta ....... entra e aceita participar da empresa
 *   não tem conta ...... cria a conta e o vínculo acontece no mesmo passo
 *
 * O e-mail é digitado porque a RLS impede o convidado de ler o próprio
 * convite antes de aceitá-lo — quem confere se ele bate é a RPC, no banco.
 *
 * NÃO HÁ MAIS SEGUNDA CONFIRMAÇÃO DE E-MAIL. A conta nasce no servidor, já
 * confirmada, porque o convite chegou naquele endereço: exigir que a pessoa
 * confirme por e-mail o mesmo e-mail que acabou de abrir não prova nada novo —
 * só acrescentava um passo onde o fluxo morria.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Aviso, CampoTexto, Carregando, LINK_DO_APP } from '@/componentes/Basicos';
import {
  aceitarConvite,
  ContaJaExiste,
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
  const [confirmacao, setConfirmacao] = useState('');

  const [mensagem, setMensagem] = useState<string | null>(null);
  /**
   * O TOM É PARTE DA MENSAGEM.
   *
   * "Sua conta foi criada" saía em vermelho, com papel de alerta, porque o
   * único jeito de mostrar um recado nesta tela era jogá-lo no balde de erros.
   * Quem leu entendeu que tinha dado errado — e tinha dado certo.
   */
  const [tom, setTom] = useState<'erro' | 'sucesso' | 'alerta'>('erro');
  const [processando, setProcessando] = useState(false);

  /** O e-mail com que a conta ficou pronta, para o fim do caminho. */
  const [emailFinal, setEmailFinal] = useState<string | null>(null);

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

  const falhar = useCallback((texto: string) => {
    setTom('erro');
    setMensagem(texto);
  }, []);

  const aceitar = useCallback(async () => {
    if (!id) return;
    setMensagem(null);
    setProcessando(true);
    try {
      await aceitarConvite(id);
      setEmailFinal(emailDaSessao);
      setEstado('aceito');
    } catch (e) {
      falhar(e instanceof Error ? e.message : 'Não foi possível aceitar o convite.');
    } finally {
      setProcessando(false);
    }
  }, [id, emailDaSessao, falhar]);

  const aoEnviar = useCallback(
    async (evento: FormEvent) => {
      evento.preventDefault();
      if (!id) return;

      setMensagem(null);
      setProcessando(true);
      try {
        let usado = email.trim();

        if (temConta) {
          await entrarComSenha(usado, senha);
        } else {
          if (!nome.trim()) throw new Error('Informe seu nome completo.');
          /**
           * As duas senhas conferem ANTES de qualquer chamada.
           *
           * É a única validação que não dá para fazer depois: uma senha
           * digitada errada é aceita sem reclamação por qualquer servidor — ela
           * é válida, só não é a que a pessoa quis. Quem descobre é ela, no
           * login seguinte, sem saber o que digitou.
           */
          if (senha !== confirmacao) {
            throw new Error('As senhas não coincidem. Digite a mesma senha nos dois campos.');
          }
          const criada = await criarContaDoConvidado(nome, senha, id);
          usado = criada.email;
        }

        await aceitarConvite(id);
        setEmailFinal(usado);
        setEstado('aceito');
      } catch (e) {
        if (e instanceof ContaJaExiste) {
          // Passa para o outro caminho já explicando — em vez de recusar e
          // deixar a pessoa adivinhar qual dos dois botões era o certo.
          setTemConta(true);
          setConfirmacao('');
          if (e.email) setEmail(e.email);
          setTom('alerta');
          setMensagem(e.message);
        } else {
          falhar(e instanceof Error ? e.message : 'Não foi possível aceitar o convite.');
        }
      } finally {
        setProcessando(false);
      }
    },
    [id, temConta, nome, email, senha, confirmacao, falhar],
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
    /**
     * O DESTINO É O APLICATIVO, nunca a página de planos.
     *
     * O funcionário não está comprando nada: ele entra numa empresa que já tem
     * assinatura. O link leva ao login do app com o e-mail já preenchido — o
     * app vive em outro endereço, e a sessão aberta aqui não atravessa de um
     * domínio para o outro (cada um guarda a sua).
     */
    const entrar = emailFinal
      ? `${LINK_DO_APP}/app/login?email=${encodeURIComponent(emailFinal)}`
      : `${LINK_DO_APP}/app/login`;

    return (
      <main className="pagina estreita">
        <div className="cabecalho-pagina">
          <h1>Convite aceito</h1>
        </div>
        <Aviso
          tom="sucesso"
          mensagem="Conta criada com sucesso! Seu acesso está pronto e você já faz parte da equipe."
        />
        <div className="card">
          <h2>Entrar agora</h2>
          <p>
            Use {emailFinal ? <strong>{emailFinal}</strong> : 'o e-mail do convite'} e a senha que
            você acabou de criar. Não precisa instalar nada — o Decola Negócios abre no navegador.
          </p>
          <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
            <a className="botao" href={entrar}>
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

      {mensagem ? <Aviso tom={tom} mensagem={mensagem} /> : null}

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
            {!temConta ? (
              <CampoTexto
                rotulo="Confirme a senha"
                valor={confirmacao}
                aoMudar={setConfirmacao}
                tipo="password"
                bloqueado={processando}
                autoComplete="new-password"
                /* O aviso aparece enquanto se digita, e não só ao enviar: sem
                   isso a pessoa só descobre o desencontro depois de tudo. */
                erro={
                  confirmacao && senha !== confirmacao ? 'As senhas não coincidem.' : undefined
                }
              />
            ) : null}

            <button type="submit" className="botao" disabled={processando}>
              {processando ? 'Aceitando…' : 'Aceitar convite'}
            </button>
          </div>

          <button
            type="button"
            className="botao texto"
            onClick={() => {
              setTemConta((v) => !v);
              setConfirmacao('');
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
