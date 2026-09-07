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
import { supabase } from '@/lib/supabase';

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

export async function diagnosticarIntegracoes(): Promise<Diagnostico> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
  const resposta = await fetch(`${base}/functions/v1/diagnostico-integracoes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
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
