/**
 * Aceite de convite pela web — Seção 5.2, item 4.
 *
 * O convidado NÃO consegue ler o próprio convite antes de aceitar: a RLS de
 * `empresa_usuarios` só enxerga membros já vinculados. Por isso esta tela não
 * mostra o nome da empresa antes do aceite, e o e-mail é digitado por quem
 * chegou — a RPC `aceitar_convite` é `SECURITY DEFINER` e confere se o e-mail
 * da sessão bate com o do convite, recusando com mensagem pronta quando não.
 *
 * Consequência de projeto: não há como "espiar" um convite alheio por aqui.
 * Quem tenta com outro e-mail é recusado pelo banco, não pela interface.
 */
import { supabase } from '@/lib/supabase';

const ERRO_GENERICO = 'Não foi possível aceitar o convite. Tente novamente.';

export async function entrarComSenha(email: string, senha: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  });
  if (error) throw new Error('E-mail ou senha incorretos.');
}

export async function criarContaDoConvidado(
  nome: string,
  email: string,
  senha: string,
  /** O convite que trouxe a pessoa até aqui. Ver a nota abaixo. */
  vinculoId: string,
): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: senha,
    options: {
      data: { nome: nome.trim() },
      /**
       * SE O PROJETO EXIGIR CONFIRMAÇÃO DE E-MAIL, o link de confirmação traz a
       * pessoa DE VOLTA PARA ESTE CONVITE — e não para a porta da frente do
       * site, que é o padrão.
       *
       * Sem isto, o caminho de quem precisa confirmar termina num beco: a conta
       * existe, o vínculo não, e a pessoa está numa página que não sabe que
       * havia um convite. Ela teria de achar o e-mail do convite de novo, e o
       * botão dele, para fechar o que começou.
       *
       * Quando a confirmação está desligada (que é como o projeto está hoje),
       * esta linha não custa nada: o Supabase simplesmente não usa.
       */
      emailRedirectTo: `${window.location.origin}/convite/${vinculoId}`,
    },
  });

  if (error) {
    const jaExiste =
      error.message.toLowerCase().includes('already registered') ||
      error.message.toLowerCase().includes('user already exists');
    throw new Error(
      jaExiste
        ? 'Este e-mail já tem conta. Use a opção "Já tenho conta" para entrar.'
        : 'Não foi possível criar a conta. Tente novamente.',
    );
  }

  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new Error('Este e-mail já tem conta. Use a opção "Já tenho conta" para entrar.');
  }

  if (!data.session) {
    // O `emailRedirectTo` acima faz o link da confirmação voltar para esta
    // mesma página, então a instrução pode ser curta e verdadeira.
    throw new Error(
      'Sua conta foi criada. Abra o e-mail de confirmação que acabamos de enviar ' +
        'e clique no link — ele traz você de volta para cá e o convite é aceito.',
    );
  }
}

/**
 * A RPC recusa convite expirado, já aceito, de outro e-mail, e conta já
 * vinculada a outra empresa — cada um com a sua mensagem. Repassar o texto do
 * banco é melhor que traduzir aqui: a regra mora lá.
 */
export async function aceitarConvite(vinculoId: string): Promise<void> {
  const { error } = await supabase.rpc('aceitar_convite', { p_vinculo_id: vinculoId });
  if (error) throw new Error(error.message || ERRO_GENERICO);
}

export async function sessaoAtual(): Promise<{ email: string } | null> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email;
  return email ? { email } : null;
}
