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
): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: senha,
    options: { data: { nome: nome.trim() } },
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
    throw new Error(
      'Sua conta foi criada, mas é preciso confirmar o e-mail antes de aceitar o convite. ' +
        'Verifique sua caixa de entrada.',
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
