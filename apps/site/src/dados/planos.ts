/**
 * Planos disponíveis para contratação (Seções 6.1 e 6.3).
 *
 * Leitura anônima, de propósito: quem abre a página de planos ainda não tem
 * conta. A RLS de `planos` permite `select` ao papel `anon`, e não há nada
 * sensível ali — é a vitrine.
 */
import type { Plano } from '@decola/types';
import { supabase } from '@/lib/supabase';

export type PlanoComTrial = {
  plano: Plano;
  /** Dias de teste, quando a plataforma está com trial ligado (Seção 6.2). */
  trialDias: number | null;
};

const ERRO_CARREGAR = 'Não foi possível carregar os planos. Tente novamente.';

async function trialDaPlataforma(): Promise<number | null> {
  const { data } = await supabase
    .from('configuracoes_plataforma')
    .select('trial_ativo, trial_dias')
    .maybeSingle();

  if (!data?.trial_ativo) return null;
  return data.trial_dias ?? null;
}

export async function listarPlanosAtivos(): Promise<PlanoComTrial[]> {
  const [{ data, error }, trialDias] = await Promise.all([
    supabase.from('planos').select('*').eq('ativo', true).order('valor_mensal'),
    trialDaPlataforma(),
  ]);

  if (error) throw new Error(ERRO_CARREGAR);
  return (data ?? []).map((plano) => ({ plano: plano as Plano, trialDias }));
}

export async function buscarPlanoPorSlug(slug: string): Promise<PlanoComTrial | null> {
  const [{ data, error }, trialDias] = await Promise.all([
    supabase.from('planos').select('*').eq('slug', slug).eq('ativo', true).maybeSingle(),
    trialDaPlataforma(),
  ]);

  if (error) throw new Error(ERRO_CARREGAR);
  return data ? { plano: data as Plano, trialDias } : null;
}

/**
 * Rótulo humano para a chave técnica de funcionalidade (Seção 4.12.1).
 * Mesma decisão do painel: humanizar a chave em vez de inventar nome
 * comercial, que seria conteúdo de produto e não de código.
 */
export function rotuloDeFuncionalidade(chave: string): string {
  const texto = chave.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function limiteDeFuncionarios(plano: Plano): string {
  const limites = (plano.limites ?? {}) as Record<string, unknown>;
  const max = limites.max_funcionarios;
  if (max === null || max === undefined) return 'Funcionários sem limite';
  return `Até ${max} funcionários`;
}
