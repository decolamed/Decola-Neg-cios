/**
 * Repositório de planos — Seções 6.1, 6.3, 7.13.
 *
 * Planos são dinâmicos: carregados do banco a cada abertura da tela, nunca
 * fixos no código. Criar, editar ou desativar um plano no Painel
 * Administrativo reflete aqui sem alteração de app.
 */
import type { ConfiguracaoPlataforma, Plano } from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';

export const ERRO_CARREGAR_PLANOS = 'Não foi possível carregar os planos. Tente novamente.';
export const NENHUM_PLANO = 'Nenhum plano disponível no momento. Tente novamente mais tarde.';

/** Seção 7.14 — canal de suporte da V1 é e-mail. */
export const EMAIL_SUPORTE = 'decolanegocios0001@gmail.com';

export type PlanoComTrial = {
  plano: Plano;
  /** Limite de funcionários do plano, quando definido (Seção 6.8). */
  maxFuncionarios: number | null;
  /** Lista de funcionalidades habilitadas (Seção 4.12.1). */
  funcionalidades: string[];
};

export type CatalogoDePlanos = {
  planos: PlanoComTrial[];
  /** Seção 7.13 — selo de trial no card, quando o trial está ativo. */
  trialAtivo: boolean;
  trialDias: number;
};

function normalizar(plano: Plano): PlanoComTrial {
  const limites = (plano.limites ?? {}) as Record<string, unknown>;
  const bruto = limites.max_funcionarios;

  const funcionalidades = Array.isArray(plano.funcionalidades)
    ? (plano.funcionalidades as unknown[]).filter((f): f is string => typeof f === 'string')
    : [];

  return {
    plano,
    maxFuncionarios: typeof bruto === 'number' ? bruto : null,
    funcionalidades,
  };
}

/**
 * Seção 7.13 — lista os planos ativos. A RLS já filtra: `anon` só enxerga
 * `planos.ativo = true`, então esta consulta é segura antes do login.
 */
export async function listarPlanosDisponiveis(): Promise<CatalogoDePlanos> {
  await exigirConexao('cadastro');

  const [respostaPlanos, respostaConfig] = await Promise.all([
    supabase.from('planos').select('*').eq('ativo', true).order('valor_mensal', { ascending: true }),
    supabase.from('configuracoes_plataforma').select('*').limit(1).maybeSingle(),
  ]);

  if (respostaPlanos.error) throw new Error(ERRO_CARREGAR_PLANOS);
  if (respostaConfig.error) throw new Error(ERRO_CARREGAR_PLANOS);

  const config = respostaConfig.data as ConfiguracaoPlataforma | null;

  return {
    planos: (respostaPlanos.data ?? []).map(normalizar),
    trialAtivo: config?.trial_ativo ?? false,
    trialDias: config?.trial_dias ?? 0,
  };
}

/**
 * Seção 6.3 — link direto de plano. O slug vem da URL de cadastro gerada pelo
 * Painel Administrativo ("Copiar link do plano").
 *
 * Um plano desativado depois que o link foi divulgado não é aceito: a
 * Seção 6.1 diz que planos inativos somem para NOVAS contratações.
 */
export async function buscarPlanoPorSlug(slug: string): Promise<PlanoComTrial | null> {
  await exigirConexao('cadastro');

  const { data, error } = await supabase
    .from('planos')
    .select('*')
    .eq('slug', slug)
    .eq('ativo', true)
    .maybeSingle();

  if (error) throw new Error(ERRO_CARREGAR_PLANOS);
  return data ? normalizar(data) : null;
}

export async function buscarPlanoPorId(id: string): Promise<PlanoComTrial | null> {
  await exigirConexao('cadastro');

  const { data, error } = await supabase.from('planos').select('*').eq('id', id).maybeSingle();

  if (error) throw new Error(ERRO_CARREGAR_PLANOS);
  return data ? normalizar(data) : null;
}
