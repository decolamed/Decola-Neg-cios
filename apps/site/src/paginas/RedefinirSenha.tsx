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
import { Aviso, CampoTexto, Carregando } from '@/componentes/Basicos';
import { supabase } from '@/lib/supabase';

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

    // `detectSessionInUrl` resolve o código de forma assíncrona; o evento
    // PASSWORD_RECOVERY é o sinal de que a sessão da recuperação existe.
    const { data: inscricao } = supabase.auth.onAuthStateChange((evento) => {
      if (!ativo) return;
      if (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN') {
        setEtapa({ nome: 'pronto' });
      }
    });

    // Recarregar a página depois de o código já ter sido trocado não dispara
    // evento nenhum — por isso a sessão também é conferida diretamente.
    void supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setEtapa((atual) =>
        atual.nome === 'validando'
          ? data.session
            ? { nome: 'pronto' }
            : { nome: 'linkInvalido' }
          : atual,
      );
    });

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
            <p className="legenda">
              Abra o aplicativo Decola Negócios e entre com o seu e-mail e a senha que acabou de
              criar.
            </p>
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
