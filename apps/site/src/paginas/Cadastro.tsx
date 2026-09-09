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
import { documentoValido, mascararDocumento } from '@decola/pix';
import { Aviso, CampoTexto, Carregando } from '@/componentes/Basicos';
import { contratar, emailValido } from '@/dados/cadastro';
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
  const [documento, setDocumento] = useState('');
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
        nomeEmpresa: nomeEmpresa.trim() ? null : 'Informe o nome do seu negócio.',
        // Exigido pelo Asaas para emitir a cobrança. Dizer qual dos dois está
        // errado poupa a pessoa de conferir o número certo.
        documento: documentoValido(documento)
          ? null
          : documento.replace(/\D/g, '').length === 0
            ? 'Informe o CPF ou CNPJ do responsável.'
            : documento.replace(/\D/g, '').length === 11
              ? 'Este CPF não é válido. Confira os números.'
              : documento.replace(/\D/g, '').length === 14
                ? 'Este CNPJ não é válido. Confira os números.'
                : 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).',
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
        // Um pedido só: conta, empresa e cobrança nascem juntas no servidor.
        // Se qualquer parte falhar, nada fica pela metade.
        const contratacao = await contratar({
          nome,
          email,
          nomeEmpresa,
          planoSlug: slug,
          aceitouTermos,
          cpfCnpj: documento,
        });

        // O link do checkout viaja no estado da navegação, não na URL: ele é
        // de uso único e não deveria sobrar no histórico do navegador nem em
        // print de tela compartilhado.
        navegar('/pagamento', { replace: true, state: contratacao });
      } catch (e) {
        setMensagem(e instanceof Error ? e.message : 'Não foi possível concluir o cadastro.');
      } finally {
        setCriando(false);
      }
    },
    [preparacao, slug, nome, email, nomeEmpresa, documento, aceitouTermos, navegar],
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
        <p>
          Leva menos de um minuto. No passo seguinte você escolhe como pagar — Pix, boleto ou
          cartão. Assim que o pagamento for confirmado, enviamos um e-mail para você criar sua
          senha e entrar.
        </p>
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
          rotulo="CPF ou CNPJ do responsável"
          valor={documento}
          aoMudar={(v) => setDocumento(mascararDocumento(v))}
          erro={erros.documento}
          bloqueado={criando}
          placeholder="000.000.000-00"
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
