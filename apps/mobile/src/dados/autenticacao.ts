/**
 * Repositório de autenticação — Seções 5.5, 7.11, 7.12.
 *
 * Camada de serviço isolada (Seção 3.1): nenhuma tela fala com o Supabase
 * diretamente. Todas as mensagens de erro voltam já no texto que a
 * especificação define, para que a tela apenas exiba.
 */
import { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';

/** Seção 7.11 — mensagem genérica de propósito: não revela se o e-mail existe. */
export const ERRO_CREDENCIAIS = 'E-mail ou senha incorretos.';
export const ERRO_ENTRAR_GENERICO = 'Não foi possível entrar. Tente novamente.';
export const ERRO_CADASTRO_GENERICO = 'Não foi possível criar sua conta. Tente novamente.';
export const ERRO_EMAIL_EM_USO = 'Este e-mail já possui uma conta. Faça login.';

/** Seção 7.10 — usuário autenticado que não pertence a nenhuma empresa ativa. */
export const AVISO_SEM_EMPRESA =
  'Você não está vinculado a nenhuma empresa ativa no momento. ' +
  'Entre em contato com o Gestor da sua empresa, ou crie uma nova conta.';

export class ErroAutenticacao extends Error {}

export function emailValido(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

export async function sessaoAtual(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);
  return data.session;
}

export function observarSessao(aoMudar: (sessao: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => aoMudar(sessao));
  return () => data.subscription.unsubscribe();
}

/**
 * Seção 7.11 — Entrar.
 * Validação: e-mail em formato válido, senha não vazia (Seção 5.5 — sem
 * exigência de complexidade).
 */
export async function entrarComSenha(email: string, senha: string): Promise<Session> {
  await exigirConexao('login');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  });

  if (error) {
    // Credenciais inválidas E conta inexistente retornam a MESMA mensagem,
    // por segurança (Seção 7.11, tratamento de erros).
    const credenciais =
      error.status === 400 ||
      error.message.toLowerCase().includes('invalid login credentials') ||
      error.message.toLowerCase().includes('email not confirmed');

    throw new ErroAutenticacao(credenciais ? ERRO_CREDENCIAIS : ERRO_ENTRAR_GENERICO);
  }

  if (!data.session) throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);
  return data.session;
}

/**
 * Seção 7.12 — criação da conta com e-mail e senha.
 *
 * A verificação de e-mail não é obrigatória antes do primeiro acesso
 * (Seção 5.5), então o Supabase deve retornar sessão imediatamente. Se o
 * projeto estiver com "Confirm email" ligado, não há sessão e o cadastro não
 * pode continuar — o erro abaixo deixa isso explícito em vez de falhar de
 * forma obscura na criação da empresa.
 */
export async function cadastrarComSenha(
  nome: string,
  email: string,
  senha: string,
): Promise<Session> {
  await exigirConexao('cadastro');

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: senha,
    options: { data: { nome: nome.trim() } },
  });

  if (error) {
    const jaExiste =
      error.message.toLowerCase().includes('already registered') ||
      error.message.toLowerCase().includes('user already exists');
    throw new ErroAutenticacao(jaExiste ? ERRO_EMAIL_EM_USO : ERRO_CADASTRO_GENERICO);
  }

  // O Supabase oculta e-mails já cadastrados devolvendo um usuário sem
  // identidades em vez de um erro. É o sinal de duplicidade da Seção 7.12.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new ErroAutenticacao(ERRO_EMAIL_EM_USO);
  }

  if (!data.session) {
    throw new ErroAutenticacao(
      'Sua conta foi criada, mas é necessário confirmar o e-mail antes de continuar. ' +
        'Verifique sua caixa de entrada e faça login.',
    );
  }

  return data.session;
}

/**
 * Seção 7.11 — Entrar com Google (único provedor social da V1; Apple ficou
 * fora, Seção 7.11).
 */
export async function entrarComGoogle(): Promise<Session> {
  await exigirConexao('login');

  const redirecionamento = Linking.createURL('/');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirecionamento, skipBrowserRedirect: true },
  });

  if (error || !data.url) throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);

  const resultado = await WebBrowser.openAuthSessionAsync(data.url, redirecionamento);

  if (resultado.type !== 'success') {
    // Cancelamento pelo usuário não é erro — a tela apenas volta ao estado
    // anterior, sem mensagem.
    throw new ErroAutenticacao('');
  }

  const codigo = new URL(resultado.url).searchParams.get('code');
  if (!codigo) throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);

  const troca = await supabase.auth.exchangeCodeForSession(codigo);
  if (troca.error || !troca.data.session) throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);

  return troca.data.session;
}

/** Seção 7.11 — Esqueci minha senha (mecanismo padrão do Supabase Auth). */
export async function enviarLinkDeRecuperacao(email: string): Promise<void> {
  await exigirConexao('login');

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: Linking.createURL('/redefinir-senha'),
  });

  // Um e-mail inexistente NÃO é sinalizado: a tela mostra a mesma confirmação
  // em qualquer caso, para não revelar quais contas existem.
  if (error && error.status !== 400) {
    throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);
  }
}

export async function sair(): Promise<void> {
  await supabase.auth.signOut();
}
