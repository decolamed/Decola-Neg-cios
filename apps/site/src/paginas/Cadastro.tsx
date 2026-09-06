/**
 * Cadastro e contratação — Seção 7.12, na web.
 *
 * É o destino do link direto de plano: `/cadastro?plano=<slug>`. Com o slug na
 * URL o plano fica FIXO e a escolha é pulada, exatamente como no aplicativo.
 *
 * A ordem dos passos importa e é a mesma do app: primeiro a conta no Auth,
 * porque sem sessão a RPC seguinte rodaria como anônimo e seria recusada.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Aviso, CampoTexto, Carregando } from '@/componentes/Basicos';
import { criarConta, criarEmpresaEAssinatura, emailValido } from '@/dados/cadastro';
import { buscarPlanoPorSlug, type PlanoComTrial } from '@/dados/planos';

type Preparacao =
  | { nome: 'carregando' }
  | { nome: 'pronto'; plano: PlanoComTrial }
  | { nome: 'erro'; mensagem: string };

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function Cadastro() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const slug = params.get('plano') ?? '';

  const [preparacao, setPreparacao] = useState<Preparacao>({ nome: 'carregando' });

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [aceitouTermos, setAceitouTermos] = useState(false);

  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    let ativo = true;

    const preparar = async () => {
      if (!slug) {
        if (ativo) {
          setPreparacao({ nome: 'erro', mensagem: 'Escolha um plano para continuar.' });
        }
        return;
      }
      try {
        const plano = await buscarPlanoPorSlug(slug);
        if (!ativo) return;
        setPreparacao(
          plano
            ? { nome: 'pronto', plano }
            : {
                nome: 'erro',
                mensagem: 'Este plano não está mais disponível. Escolha outro para continuar.',
              },
        );
      } catch (e) {
        if (ativo) {
          setPreparacao({
            nome: 'erro',
            mensagem: e instanceof Error ? e.message : 'Não foi possível carregar o plano.',
          });
        }
      }
    };

    void preparar();
    return () => {
      ativo = false;
    };
  }, [slug]);

  const aoEnviar = useCallback(
    async (evento: FormEvent) => {
      evento.preventDefault();
      if (preparacao.nome !== 'pronto') return;

      const novosErros: Record<string, string | null> = {
        nome: nome.trim() ? null : 'Informe seu nome completo.',
        email: emailValido(email) ? null : 'Informe um e-mail válido.',
        // Seção 5.5 — não há exigência de complexidade; só não pode ser vazia.
        senha: senha.length > 0 ? null : 'Crie uma senha.',
        nomeEmpresa: nomeEmpresa.trim() ? null : 'Informe o nome do seu negócio.',
      };
      setErros(novosErros);
      if (Object.values(novosErros).some(Boolean)) return;

      if (!aceitouTermos) {
        setMensagem('É preciso aceitar os termos de uso para continuar.');
        return;
      }

      setMensagem(null);
      setCriando(true);
      try {
        await criarConta(nome, email, senha);

        const resultado = await criarEmpresaEAssinatura({
          nomeEmpresa,
          planoId: preparacao.plano.plano.id,
          nomeUsuario: nome,
          aceitouTermos,
        });

        // Mesma bifurcação do app: com trial a conta já está liberada; sem
        // ele, não há acesso até o pagamento ser confirmado (Seção 7.12).
        navegar(resultado.assinatura_status === 'trial' ? '/pronto' : '/pagamento', {
          replace: true,
        });
      } catch (e) {
        setMensagem(e instanceof Error ? e.message : 'Não foi possível concluir o cadastro.');
      } finally {
        setCriando(false);
      }
    },
    [preparacao, nome, email, senha, nomeEmpresa, aceitouTermos, navegar],
  );

  if (preparacao.nome === 'carregando') {
    return (
      <main className="pagina estreita">
        <Carregando texto="Carregando o plano…" />
      </main>
    );
  }

  if (preparacao.nome === 'erro') {
    return (
      <main className="pagina estreita">
        <h1>Criar conta</h1>
        <Aviso mensagem={preparacao.mensagem} />
        <button type="button" className="botao" onClick={() => navegar('/planos')}>
          Ver os planos
        </button>
      </main>
    );
  }

  const { plano, trialDias } = preparacao.plano;

  return (
    <main className="pagina estreita">
      <div className="cabecalho-pagina">
        <h1>Criar conta</h1>
        <p>Leva menos de um minuto. Depois é só baixar o aplicativo e entrar.</p>
      </div>

      <div className="resumo-plano">
        <div>
          <strong>{plano.nome}</strong>
          <div className="legenda">{moeda(Number(plano.valor_mensal))} por mês</div>
        </div>
        {trialDias ? <span className="selo-trial">{trialDias} dias grátis</span> : null}
      </div>

      {mensagem ? <Aviso mensagem={mensagem} /> : null}

      <form onSubmit={aoEnviar} noValidate>
        <CampoTexto
          rotulo="Seu nome completo"
          valor={nome}
          aoMudar={setNome}
          erro={erros.nome}
          bloqueado={criando}
          autoComplete="name"
        />
        <CampoTexto
          rotulo="E-mail"
          valor={email}
          aoMudar={setEmail}
          tipo="email"
          erro={erros.email}
          bloqueado={criando}
          autoComplete="email"
          placeholder="voce@exemplo.com"
        />
        <CampoTexto
          rotulo="Crie uma senha"
          valor={senha}
          aoMudar={setSenha}
          tipo="password"
          erro={erros.senha}
          bloqueado={criando}
          autoComplete="new-password"
        />
        <CampoTexto
          rotulo="Nome do seu negócio"
          valor={nomeEmpresa}
          aoMudar={setNomeEmpresa}
          erro={erros.nomeEmpresa}
          bloqueado={criando}
          autoComplete="organization"
        />

        <label className="aceite">
          <input
            type="checkbox"
            checked={aceitouTermos}
            onChange={(e) => setAceitouTermos(e.target.checked)}
            disabled={criando}
          />
          <span>Li e aceito os termos de uso e a política de privacidade.</span>
        </label>

        <button type="submit" className="botao" disabled={criando}>
          {criando ? 'Criando sua conta…' : 'Criar conta e continuar'}
        </button>
      </form>
    </main>
  );
}
