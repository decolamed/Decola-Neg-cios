/**
 * Definir senha — `/definir-senha?token=…&tipo=primeiro|nova`
 *
 * Destino dos e-mails enviados pela Edge Function `enviar-acesso`. Substitui a
 * volta pelo endpoint do Supabase: o token vem no nosso endereço e é trocado
 * por sessão aqui, com `verifyOtp`.
 *
 * A diferença prática em relação à antiga `/redefinir-senha` é onde o token é
 * validado. Lá, o Auth validava e redirecionava — o que exigia a URL na lista
 * de Redirect URLs do painel e fazia o link morrer quando a lista não estava
 * certa. Aqui não há redirecionamento nenhum: a página recebe o token direto.
 *
 * `/redefinir-senha` continua existindo para os links antigos que já saíram.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Aviso, CampoTexto, Carregando } from '@/componentes/Basicos';
import { supabase } from '@/lib/supabase';

type Etapa =
  | { nome: 'validando' }
  | { nome: 'pronto' }
  | { nome: 'salvo' }
  | { nome: 'invalido'; mensagem: string };

export function DefinirSenha() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const primeiroAcesso = params.get('tipo') === 'primeiro';

  const [etapa, setEtapa] = useState<Etapa>({ nome: 'validando' });
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;

    const validar = async () => {
      if (!token) {
        if (ativo) {
          setEtapa({
            nome: 'invalido',
            mensagem: 'Abra esta página pelo link que enviamos por e-mail.',
          });
        }
        return;
      }

      // `verifyOtp` com `token_hash` consome o token e devolve a sessão de
      // curta duração que autoriza a troca de senha logo abaixo.
      const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'recovery' });
      if (!ativo) return;

      setEtapa(
        error
          ? {
              nome: 'invalido',
              mensagem:
                'Este link expirou ou já foi usado. Peça um novo pela tela de entrada do aplicativo, em "Esqueci minha senha".',
            }
          : { nome: 'pronto' },
      );
    };

    void validar();
    return () => {
      ativo = false;
    };
  }, [token]);

  const aoSalvar = useCallback(
    async (evento: FormEvent) => {
      evento.preventDefault();
      setErro(null);
      setErroSenha(null);

      // Seção 5.5 — a única exigência é não ser vazia.
      if (senha.length === 0) {
        setErroSenha('Crie uma senha.');
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
        setErro(e instanceof Error ? e.message : 'Não foi possível salvar sua senha.');
      } finally {
        setSalvando(false);
      }
    },
    [senha, confirmacao],
  );

  return (
    <main className="pagina estreita">
      <div className="cabecalho-pagina">
        <h1>{primeiroAcesso ? 'Defina sua senha' : 'Criar nova senha'}</h1>
        {etapa.nome === 'pronto' ? (
          <p>
            {primeiroAcesso
              ? 'Escolha a senha que você vai usar para entrar no Decola Negócios.'
              : 'Escolha a nova senha da sua conta.'}
          </p>
        ) : null}
      </div>

      {etapa.nome === 'validando' ? <Carregando texto="Validando seu link…" /> : null}

      {etapa.nome === 'invalido' ? (
        <>
          <Aviso mensagem={etapa.mensagem} />
          <p className="legenda">
            Os links de acesso valem por 1 hora e só podem ser usados uma vez.
          </p>
        </>
      ) : null}

      {etapa.nome === 'salvo' ? (
        <>
          <Aviso tom="sucesso" mensagem="Senha definida. Sua conta está pronta para uso." />
          <div className="card">
            <h2>Como entrar</h2>
            <ol className="legenda" style={{ lineHeight: 1.8 }}>
              <li>Abra o aplicativo Decola Negócios no seu celular.</li>
              <li>Toque em “Entrar”.</li>
              <li>Use o seu e-mail e a senha que você acabou de criar.</li>
            </ol>
          </div>
        </>
      ) : null}

      {etapa.nome === 'pronto' ? (
        <form onSubmit={aoSalvar} noValidate>
          {erro ? <Aviso mensagem={erro} /> : null}

          <CampoTexto
            rotulo={primeiroAcesso ? 'Sua senha' : 'Nova senha'}
            valor={senha}
            aoMudar={setSenha}
            tipo="password"
            erro={erroSenha}
            bloqueado={salvando}
            autoComplete="new-password"
          />
          <CampoTexto
            rotulo="Repita a senha"
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
