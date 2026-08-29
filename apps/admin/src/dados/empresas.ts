/**
 * Empresas — Seções 6.9 e 7.15 B.
 *
 * Nenhuma escrita direta: `empresas.status` está revogado do cliente (0014) e
 * `assinaturas` não tem verbo de escrita nenhum (0014). Suspender, reativar,
 * encerrar, trocar plano, ativar manualmente, mexer no trial e excluir passam
 * pelas RPCs de 0027, que revalidam `eh_admin_plataforma()` no servidor.
 */
import type { Assinatura, Empresa, EmpresaUsuario, Enums, Plano } from '@decola/types';
import { supabase, CHAVE_PUBLICA, URL_FUNCOES } from '@/lib/supabase';

export type StatusEmpresa = Enums['empresa_status'];

export const ROTULO_STATUS_EMPRESA: Record<StatusEmpresa, string> = {
  ativa: 'Ativa',
  suspensa: 'Suspensa',
  inativa: 'Encerrada',
};

export const ROTULO_STATUS_ASSINATURA: Record<Enums['assinatura_status'], string> = {
  pendente_pagamento: 'Aguardando pagamento',
  trial: 'Teste gratuito',
  ativa: 'Ativa',
  carencia: 'Em carência',
  modo_limitado: 'Modo limitado',
  cancelada: 'Cancelada',
};

export type EmpresaNaLista = Empresa & {
  assinatura: (Assinatura & { plano: Pick<Plano, 'id' | 'nome'> | null }) | null;
};

type LinhaEmpresa = Empresa & {
  assinaturas: (Assinatura & { planos: Pick<Plano, 'id' | 'nome'> | null })[];
};

const SELECAO =
  '*, assinaturas(*, planos!assinaturas_plano_id_fkey(id, nome))';

function normalizar(linha: LinhaEmpresa): EmpresaNaLista {
  // A assinatura cancelada é histórico; a vigente é a que interessa ao painel.
  const vigente = linha.assinaturas?.find((a) => a.status !== 'cancelada') ?? null;
  const { assinaturas: _ignorado, ...empresa } = linha;

  return {
    ...empresa,
    assinatura: vigente ? { ...vigente, plano: vigente.planos } : null,
  };
}

/**
 * Seção 7.15 B — "Busca e filtro por status e por plano".
 * O filtro por plano vai no cliente porque mora na assinatura embutida, não
 * numa coluna de `empresas`.
 */
export async function listarEmpresas(filtros: {
  busca?: string;
  status?: StatusEmpresa | '';
  planoId?: string;
}): Promise<EmpresaNaLista[]> {
  let consulta = supabase.from('empresas').select(SELECAO).order('criado_em', { ascending: false });

  if (filtros.status) consulta = consulta.eq('status', filtros.status);
  if (filtros.busca?.trim()) consulta = consulta.ilike('nome', `%${filtros.busca.trim()}%`);

  const { data, error } = await consulta;
  if (error) throw new Error(error.message);

  const empresas = ((data ?? []) as unknown as LinhaEmpresa[]).map(normalizar);

  return filtros.planoId
    ? empresas.filter((e) => e.assinatura?.plano_id === filtros.planoId)
    : empresas;
}

export type DetalheDaEmpresa = {
  empresa: EmpresaNaLista;
  usuarios: EmpresaUsuario[];
};

export async function carregarEmpresa(id: string): Promise<DetalheDaEmpresa | null> {
  const { data, error } = await supabase.from('empresas').select(SELECAO).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { data: usuarios, error: erroUsuarios } = await supabase
    .from('empresa_usuarios')
    .select('*')
    .eq('empresa_id', id)
    .order('papel');

  if (erroUsuarios) throw new Error(erroUsuarios.message);

  return {
    empresa: normalizar(data as unknown as LinhaEmpresa),
    usuarios: usuarios ?? [],
  };
}

/** Seção 6.9 — suspender, reativar e encerrar. Nunca automático. */
export async function definirStatus(empresaId: string, status: StatusEmpresa): Promise<void> {
  const { error } = await supabase.rpc('admin_definir_status_empresa', {
    p_empresa_id: empresaId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

/** Seção 7.15 B — troca de plano fora do autoatendimento do Gestor. */
export async function alterarPlano(
  empresaId: string,
  planoId: string,
  valor?: number,
): Promise<void> {
  const { error } = await supabase.rpc('admin_alterar_plano_empresa', {
    p_empresa_id: empresaId,
    p_plano_id: planoId,
    p_valor: valor ?? undefined,
  });
  if (error) throw new Error(error.message);
}

/** Seção 6.9 — libera acesso sem passar pelo Asaas. */
export async function ativarAssinatura(empresaId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_ativar_assinatura', { p_empresa_id: empresaId });
  if (error) throw new Error(error.message);
}

/** Seção 7.15 B — ajusta o trial daquela empresa especificamente. */
export async function definirTrial(empresaId: string, expiraEm: Date): Promise<void> {
  const { error } = await supabase.rpc('admin_definir_trial', {
    p_empresa_id: empresaId,
    p_expira_em: expiraEm.toISOString(),
  });
  if (error) throw new Error(error.message);
}

/**
 * Seção 6.9 — irreversível. A confirmação digitada é conferida também no
 * servidor: a tela não é a última linha de defesa de uma ação destas.
 */
export async function excluirEmpresa(empresaId: string, confirmacao: string): Promise<void> {
  const { error } = await supabase.rpc('admin_excluir_empresa', {
    p_empresa_id: empresaId,
    p_confirmacao: confirmacao,
  });
  if (error) throw new Error(error.message);
}

export type NovaEmpresa = {
  nomeEmpresa: string;
  responsavelNome: string;
  responsavelEmail: string;
  planoId: string;
  status: StatusEmpresa;
};

export type ResultadoCriacao = {
  empresa_id: string;
  assinatura_id: string;
  responsavel: string;
  conta_criada: boolean;
  convite_enviado: boolean;
};

/**
 * Reenvia o link de definição de senha para um usuário da empresa
 * (Seções 5.5 e 7.15 B).
 *
 * A criação manual já dispara esse e-mail uma vez, mas ele se perde: cai no
 * spam, expira, ou a conta é criada antes de o responsável existir de fato.
 * Sem um reenvio pelo painel, a única saída era mexer no Supabase.
 *
 * Não passa por Edge Function porque `resetPasswordForEmail` é um endpoint
 * público de propósito — é o mesmo "Esqueci minha senha" que qualquer pessoa
 * aciona, e ele não revela se a conta existe. Não há privilégio a proteger
 * aqui, e uma função a mais só somaria superfície.
 *
 * O destino é o app, não o painel: quem recebe é dono de loja, e a tela que
 * grava a senha é `redefinir-senha` do aplicativo.
 */
export async function reenviarAcesso(email: string): Promise<void> {
  // Sem site configurado, o destino é o esquema do app; com `VITE_URL_CADASTRO`
  // vira um endereço web, que abre também para quem ainda não instalou nada.
  const base = import.meta.env.VITE_URL_CADASTRO?.trim().replace(/\/$/, '');
  const destino = base ? `${base}/redefinir-senha` : 'decolanegocios://redefinir-senha';

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: destino,
  });
  if (error) throw new Error(error.message);
}

/**
 * Seções 6.9 e 7.15 B — ativação manual. Passa pela Edge Function porque
 * criar a conta do responsável no Auth exige a service key, que não pode
 * viver no navegador.
 */
export async function criarEmpresaManualmente(dados: NovaEmpresa): Promise<ResultadoCriacao> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente.');

  const resposta = await fetch(`${URL_FUNCOES}/admin-criar-empresa`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: CHAVE_PUBLICA,
    },
    body: JSON.stringify({
      nome_empresa: dados.nomeEmpresa,
      responsavel_nome: dados.responsavelNome,
      responsavel_email: dados.responsavelEmail,
      plano_id: dados.planoId,
      status: dados.status,
    }),
  });

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(corpo?.error ?? 'Não foi possível criar a empresa.');
  }

  return corpo as ResultadoCriacao;
}
