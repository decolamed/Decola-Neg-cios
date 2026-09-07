/**
 * Autenticação do painel — Seções 7.15 (Acesso) e 11.1.
 *
 * "formulário de e-mail/senha equivalente ao da Seção 7.11, porém SEM as
 *  opções de cadastro, login com Google, ou 'esqueci minha senha'
 *  self-service... administradores são criados diretamente no banco/pelo
 *  próprio time."
 *
 * Autenticar não basta: um Gestor de empresa tem credencial válida no mesmo
 * Supabase Auth. O que abre o painel é existir em `administradores_plataforma`
 * — conferido no banco, com a política de RLS que só o próprio administrador
 * satisfaz.
 */
import type { AdministradorPlataforma } from '@decola/types';
import { supabase } from '@/lib/supabase';

export const ERRO_CREDENCIAIS = 'E-mail ou senha incorretos.';
export const ERRO_GENERICO = 'Não foi possível entrar. Tente novamente.';

/**
 * Mensagem para quem autenticou e não é administrador da plataforma — um dono
 * de negócio, na maioria das vezes.
 *
 * Antes isto era um beco sem saída: "esta conta não tem acesso, use o
 * aplicativo", sem dizer onde ele fica. Quem chegava aqui tinha credencial
 * válida e nenhum caminho. Agora é aviso de passagem, e a tela encaminha.
 */
export const LEVANDO_AO_APLICATIVO =
  'Esta conta é de cliente, não de administrador da plataforma. ' +
  'Levando você para o aplicativo…';

export async function entrar(email: string, senha: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  });

  if (error) {
    // Credencial inválida e conta inexistente devolvem a MESMA mensagem, para
    // não revelar quais contas existem.
    throw new Error(error.status === 400 ? ERRO_CREDENCIAIS : ERRO_GENERICO);
  }
}

export async function sair(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * `null` quando o usuário está autenticado mas não é administrador. A leitura
 * passa pela política `administradores_leitura`, então nem adianta forjar:
 * quem não é administrador não enxerga nenhuma linha desta tabela.
 */
export async function administradorAtual(): Promise<AdministradorPlataforma | null> {
  const { data: sessao } = await supabase.auth.getSession();
  if (!sessao.session) return null;

  const { data, error } = await supabase
    .from('administradores_plataforma')
    .select('*')
    .eq('id', sessao.session.user.id)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}

export function observarSessao(aoMudar: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange(() => aoMudar());
  return () => data.subscription.unsubscribe();
}
