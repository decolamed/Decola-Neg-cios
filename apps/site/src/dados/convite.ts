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
 *
 * A CONTA NOVA NASCE NO SERVIDOR, e não mais com `auth.signUp()` daqui.
 *
 * Este era o único lugar do produto que criava conta pelo navegador. O efeito:
 * o Supabase mandava um SEGUNDO e-mail, para confirmar o mesmo endereço que
 * tinha acabado de receber o convite; sem sessão, o aceite não acontecia; o
 * aviso saía em vermelho como se fosse erro; e o link daquele e-mail, por não
 * estar na lista de Redirect URLs do Auth, largava o funcionário na página de
 * planos. A função `aceitar-convite` cria a conta como `admin-criar-empresa`
 * sempre criou — no servidor, com `email_confirm`, sem e-mail nenhum.
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

/** Um convite que já tem conta: a pessoa entra com a senha dela, não com uma nova. */
export class ContaJaExiste extends Error {
  constructor(readonly email: string) {
    super('Este e-mail já tem conta no Decola Negócios. Entre com a sua senha para aceitar.');
    this.name = 'ContaJaExiste';
  }
}

/**
 * Cria a conta do convidado e deixa a sessão aberta.
 *
 * O E-MAIL NÃO VAI DAQUI. Quem decide para qual endereço a conta é criada é o
 * convite, no banco — o que a pessoa digitou na tela serve só para ela conferir
 * que está no convite certo. Mandar o e-mail digitado seria deixar o navegador
 * escolher em que endereço abrir conta.
 */
export async function criarContaDoConvidado(
  nome: string,
  senha: string,
  vinculoId: string,
): Promise<{ email: string }> {
  const { data, error } = await supabase.functions.invoke('aceitar-convite', {
    body: { vinculo_id: vinculoId, nome: nome.trim(), senha },
  });

  if (error) {
    // `invoke` não traz o corpo do erro: ele vem no `context` da resposta.
    const resposta = (error as { context?: Response }).context;
    const detalhe = resposta ? await resposta.json().catch(() => null) : null;
    throw new Error(
      (detalhe as { error?: string } | null)?.error ??
        'Não foi possível criar a conta. Tente novamente.',
    );
  }

  const resultado = data as { conta_criada?: boolean; conta_ja_existe?: boolean; email?: string };

  if (resultado?.conta_ja_existe) throw new ContaJaExiste(resultado.email ?? '');
  if (!resultado?.conta_criada || !resultado.email) throw new Error(ERRO_GENERICO);

  // A conta nasceu confirmada, então entrar é imediato — e é isto que dá à
  // próxima linha (`aceitar_convite`) a identidade que ela precisa conferir.
  await supabase.auth.signInWithPassword({ email: resultado.email, password: senha });

  return { email: resultado.email };
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
