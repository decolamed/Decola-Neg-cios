/**
 * Planos e configurações da plataforma — Seções 6.1, 6.9, 7.15 C e D.
 *
 * Aqui a escrita é DIRETA na tabela, e não por RPC: as políticas
 * `planos_insercao_admin`, `planos_edicao_admin` e
 * `configuracoes_escrita_admin` (0007) já exigem administrador, e não há
 * regra composta a revalidar — criar um plano é gravar uma linha. Os triggers
 * de 0027 cuidam da auditoria (Seção 5.4).
 *
 * O que NÃO acontece ao editar um plano: mexer no que as empresas já pagam.
 * "alterar o valor mensal não afeta assinantes já ativos" (Seção 7.15 C) — o
 * valor vive em `assinaturas.valor_contratado`, e nada aqui o toca.
 */
import type { ConfiguracaoPlataforma, Json, Plano } from '@decola/types';
import { supabase } from '@/lib/supabase';

export type DadosDoPlano = {
  nome: string;
  valor_mensal: number;
  slug: string;
  ativo: boolean;
  /** Chaves técnicas (Seção 4.12.1), uma por linha na tela. */
  funcionalidades: string[];
  /** Seção 6.8 — `null` significa sem limite. */
  max_funcionarios: number | null;
};

/** A política `planos_leitura` deixa o administrador ver ativos e inativos. */
export async function listarPlanos(): Promise<Plano[]> {
  const { data, error } = await supabase
    .from('planos')
    .select('*')
    .order('valor_mensal', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export function paraFormulario(plano: Plano): DadosDoPlano {
  const limites = (plano.limites ?? {}) as Record<string, unknown>;
  const max = limites.max_funcionarios;

  return {
    nome: plano.nome,
    valor_mensal: plano.valor_mensal,
    slug: plano.slug,
    ativo: plano.ativo,
    funcionalidades: Array.isArray(plano.funcionalidades)
      ? (plano.funcionalidades as unknown[]).filter((f): f is string => typeof f === 'string')
      : [],
    max_funcionarios: typeof max === 'number' ? max : null,
  };
}

function paraBanco(dados: DadosDoPlano) {
  return {
    nome: dados.nome.trim(),
    valor_mensal: dados.valor_mensal,
    slug: dados.slug.trim(),
    ativo: dados.ativo,
    funcionalidades: dados.funcionalidades as unknown as Json,
    limites: (dados.max_funcionarios === null
      ? {}
      : { max_funcionarios: dados.max_funcionarios }) as unknown as Json,
  };
}

export async function criarPlano(dados: DadosDoPlano): Promise<void> {
  const { error } = await supabase.from('planos').insert(paraBanco(dados));
  if (error) throw new Error(error.message);
}

export async function editarPlano(id: string, dados: DadosDoPlano): Promise<void> {
  const { error } = await supabase.from('planos').update(paraBanco(dados)).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Seção 6.1 — desativar tira o plano das NOVAS contratações; quem já assina
 * continua normalmente, com tudo o que contratou.
 */
export async function definirPlanoAtivo(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('planos').update({ ativo }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Seções 6.3 e 7.15 C — link direto de cadastro com o plano pré-selecionado.
 *
 * O destino é `cadastro?plano=<slug>`, que é a rota que o app realmente tem:
 * `apps/mobile/app/cadastro.tsx` lê o parâmetro `plano`, resolve o plano pelo
 * slug e fixa a escolha, pulando a tela de Escolha do Plano. Não existe rota
 * `/planos/<slug>` — `app/planos.tsx` responde só por `/planos`, sem segmento
 * dinâmico, então um link para lá abriria o app numa rota inexistente.
 */
export function linkDoPlano(slug: string): string {
  const caminho = `cadastro?plano=${encodeURIComponent(slug)}`;
  const base = import.meta.env.VITE_URL_CADASTRO?.trim();
  return base ? `${base.replace(/\/$/, '')}/${caminho}` : `decolanegocios://${caminho}`;
}

// -----------------------------------------------------------------------------
// Configurações SaaS — Seção 7.15 D
// -----------------------------------------------------------------------------

export async function carregarConfiguracoes(): Promise<ConfiguracaoPlataforma> {
  const { data, error } = await supabase
    .from('configuracoes_plataforma')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('A linha de configuração da plataforma não existe.');
  return data;
}

export async function salvarConfiguracoes(
  id: string,
  valores: { trial_ativo: boolean; trial_dias: number; carencia_dias: number },
): Promise<void> {
  const { error } = await supabase
    .from('configuracoes_plataforma')
    .update(valores)
    .eq('id', id);

  if (error) throw new Error(error.message);
}
