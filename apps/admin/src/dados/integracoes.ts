/**
 * Diagnóstico das integrações.
 *
 * Toda a verificação acontece na Edge Function `diagnostico-integracoes`, e
 * não aqui, por um motivo que não é de organização: a chave do Asaas e a do
 * Resend não podem descer para o navegador. O painel pergunta; quem testa é o
 * servidor, que é onde as chaves moram.
 *
 * O painel também não decide quem pode perguntar — a função consulta o banco
 * com o JWT de quem chamou.
 */
import { CHAVE_PUBLICA, URL_FUNCOES, supabase } from '@/lib/supabase';

export type SituacaoDaIntegracao = 'ok' | 'atencao' | 'falha' | 'ausente';

export type Verificacao = {
  chave: string;
  nome: string;
  situacao: SituacaoDaIntegracao;
  resumo: string;
  proximoPasso?: string;
  detalhes?: Record<string, string | boolean | number>;
};

export type Diagnostico = {
  verificado_em: string;
  verificacoes: Verificacao[];
};

export const ROTULO_SITUACAO: Record<SituacaoDaIntegracao, string> = {
  ok: 'Funcionando',
  atencao: 'Atenção',
  falha: 'Com falha',
  ausente: 'Não configurada',
};

/**
 * Manda um e-mail de acesso para o próprio administrador logado.
 *
 * É o único teste que prova que o e-mail funciona. Conferir a chave não prova:
 * a chave restrita a envio — a correta para o nosso uso — nem sequer pode ser
 * consultada, só usada. Aqui ela é usada, no mesmo caminho de código que
 * atende o cliente real, e o veredito é a caixa de entrada.
 *
 * Reaproveita `enviar-acesso` de propósito, em vez de um endpoint de teste
 * separado: um teste que exercita outro caminho não testa o que interessa.
 */
export async function enviarEmailDeTeste(email: string): Promise<void> {
  const resposta = await fetch(`${URL_FUNCOES}/enviar-acesso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CHAVE_PUBLICA },
    body: JSON.stringify({ email, tipo: 'recuperacao' }),
  });

  const corpo = (await resposta.json().catch(() => null)) as { error?: string } | null;
  if (!resposta.ok) {
    throw new Error(corpo?.error ?? 'Não foi possível enviar o e-mail de teste.');
  }
}

export async function diagnosticarIntegracoes(): Promise<Diagnostico> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

  const resposta = await fetch(`${URL_FUNCOES}/diagnostico-integracoes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: CHAVE_PUBLICA,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { error?: string } | null;
    throw new Error(corpo?.error ?? 'Não foi possível verificar as integrações.');
  }

  return (await resposta.json()) as Diagnostico;
}
