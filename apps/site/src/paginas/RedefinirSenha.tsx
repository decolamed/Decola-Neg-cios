/**
 * Redefinir senha na web — destino dos links de e-mail (Seções 5.5 e 7.15 B).
 *
 * Existe a mesma tela no aplicativo, e as duas são necessárias: o link do
 * e-mail abre no navegador de quem clicou, que pode nunca ter instalado o app
 * — é o caso do responsável cuja conta foi criada pelo Painel Administrativo.
 *
 * Aqui o cliente Supabase está com `detectSessionInUrl: true`, então ele
 * troca o código da URL por sessão sozinho. A tela só espera essa sessão
 * aparecer antes de aceitar a nova senha.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Aviso, CampoTexto, Carregando, LINK_DO_APP } from '@/componentes/Basicos';
import { VEIO_DE_LINK_DE_EMAIL, supabase } from '@/lib/supabase';

type Etapa =
  | { nome: 'validando' }
  | { nome: 'pronto' }
  | { nome: 'salvo' }
  | { nome: 'linkInvalido' };

export function RedefinirSenha() {
  const [etapa, setEtapa] = useState<Etapa>({ nome: 'validando' });
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;

    // Sem link nenhum na URL, uma sessão que já existisse no navegador faria
    // esta tela aceitar a troca como se o link tivesse valido.
    if (!VEIO_DE_LINK_DE_EMAIL) {
      setEtapa({ nome: 'linkInvalido' });
      return;
    }

    // `detectSessionInUrl` resolve o link de forma assíncrona; o evento
    // PASSWORD_RECOVERY é o sinal de que a sessão da recuperação existe.
    const { data: inscricao } = supabase.auth.onAuthStateChange((evento) => {
      if (!ativo) return;
      if (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN') {
        setEtapa({ nome: 'pronto' });
      }
    });

    // O evento pode ter disparado antes da inscrição — daí conferir a sessão
    // também. Só que o contrário também acontece: `getSession` responde antes
    // de o cliente terminar de processar o link. Concluir "inválido" nesse
    // instante faria a tela piscar o erro e voltar atrás sozinha.
    const conferir = async () => {
      const { data } = await supabase.auth.getSession();
      if (!ativo) return false;
      if (data.session) {
        setEtapa((atual) => (atual.nome === 'validando' ? { nome: 'pronto' } : atual));
        return true;
      }
      return false;
    };

    void (async () => {
      if (await conferir()) return;
      // Uma segunda chance, depois de o processamento do link ter tempo de
      // terminar. Se ainda não houver sessão, o link realmente não valeu.
      await new Promise((resolver) => setTimeout(resolver, 3000));
      if (!ativo) return;
      if (await conferir()) return;
      setEtapa((atual) => (atual.nome === 'validando' ? { nome: 'linkInvalido' } : atual));
    })();

    return () => {
      ativo = false;
      inscricao.subscription.unsubscribe();
    };
  }, []);

  const aoSalvar = useCallback(
    async (evento: FormEvent) => {
      evento.preventDefault();
      setErro(null);
      setErroSenha(null);

      if (senha.length === 0) {
        setErroSenha('Informe a nova senha.');
        return;
      }
      if (senha !== confirmacao) {
        setErroSenha('As duas senhas não são iguais.');
        return;
      }

      setSalvando(true);
      try {
        const { error } = await supabase.auth.updateUser({ password: senha });
        if (error) throw new Error(error.message);
        setEtapa({ nome: 'salvo' });
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível definir sua senha.');
      } finally {
        setSalvando(false);
      }
    },
    [senha, confirmacao],
  );

  return (
    <main className="pagina estreita">
      <div className="cabecalho-pagina">
        <h1>Criar nova senha</h1>
      </div>

      {etapa.nome === 'validando' ? <Carregando texto="Validando seu link…" /> : null}

      {etapa.nome === 'linkInvalido' ? (
        <>
          <Aviso mensagem="Este link expirou ou já foi usado. Peça um novo pelo aplicativo, em “Esqueci minha senha”." />
          <p className="legenda">
            Os links de redefinição valem por tempo limitado e só podem ser usados uma vez.
          </p>
        </>
      ) : null}

      {etapa.nome === 'salvo' ? (
        <>
          <Aviso tom="sucesso" mensagem="Senha definida. Agora você já pode entrar." />
          <div className="card">
            <p>Entre com o seu e-mail e a senha que você acabou de criar.</p>
          <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
            <a className="botao" href={LINK_DO_APP}>
              Entrar no Decola Negócios
            </a>
          </div>
          </div>
        </>
      ) : null}

      {etapa.nome === 'pronto' ? (
        <form onSubmit={aoSalvar} noValidate>
          {erro ? <Aviso mensagem={erro} /> : null}

          <CampoTexto
            rotulo="Nova senha"
            valor={senha}
            aoMudar={setSenha}
            tipo="password"
            erro={erroSenha}
            bloqueado={salvando}
            autoComplete="new-password"
          />
          <CampoTexto
            rotulo="Repita a nova senha"
            valor={confirmacao}
            aoMudar={setConfirmacao}
            tipo="password"
            bloqueado={salvando}
            autoComplete="new-password"
          />

          <button type="submit" className="botao" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar senha'}
          </button>
        </form>
      ) : null}
    </main>
  );
}
