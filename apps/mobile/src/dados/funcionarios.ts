/**
 * Repositório de funcionários e permissões — Seções 5.2, 5.3, 5.6, 7.8.
 *
 * Nenhuma escrita direta em `empresa_usuarios`: o cliente não tem privilégio
 * de INSERT/UPDATE/DELETE nessa tabela (migration 0014). Convidar, aceitar,
 * promover, ajustar permissões e remover passam pelas RPCs de 0009, que
 * revalidam papel, limite do plano e a imutabilidade do Gestor Principal.
 */
import type { ChavePermissao, Enums, Json, MapaPermissoes } from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

export type Papel = Enums['papel_usuario'];
export type StatusVinculo = Enums['vinculo_status'];

export const ROTULO_PAPEL: Record<Papel, string> = {
  gestor_principal: 'Gestor Principal',
  gestor: 'Gestor',
  funcionario: 'Funcionário',
};

/**
 * Permissões que o Gestor pode conceder individualmente ao Funcionário
 * (Seção 5.3). `gerenciar_assinatura` não entra: é exclusiva do Gestor e
 * "nunca concedível ao Funcionário".
 */
export const PERMISSOES_CONCEDIVEIS: { chave: ChavePermissao; rotulo: string; descricao: string }[] =
  [
    {
      chave: 'cadastrar_produto',
      rotulo: 'Cadastrar produtos',
      descricao: 'Inclui o cadastro rápido durante a venda.',
    },
    { chave: 'editar_produto', rotulo: 'Editar produtos', descricao: 'Alterar nome, preço e dados.' },
    {
      chave: 'excluir_produto',
      rotulo: 'Arquivar e excluir produtos',
      descricao: 'Tirar produtos de circulação.',
    },
    {
      chave: 'gerenciar_estoque',
      rotulo: 'Gerenciar estoque',
      descricao: 'Repor, reduzir e ajustar divergência durante a venda.',
    },
    {
      chave: 'visualizar_financeiro',
      rotulo: 'Ver o financeiro',
      descricao: 'Saldo, entradas e saídas da empresa.',
    },
    {
      chave: 'exportar_relatorios',
      rotulo: 'Acessar relatórios',
      descricao: 'Tela completa de relatórios, com exportação.',
    },
    {
      chave: 'cancelar_venda',
      rotulo: 'Cancelar vendas',
      descricao: 'Cancelar direto, sem precisar da aprovação do Gestor.',
    },
  ];

export type Funcionario = {
  id: string;
  usuario_id: string | null;
  nome: string;
  email: string;
  papel: Papel;
  status: StatusVinculo;
  permissoes: MapaPermissoes;
  convidado_em: string;
  convite_expira_em: string;
  aceito_em: string | null;
  /** Seção 5.2 — convite vale 7 dias. */
  convite_expirado: boolean;
};

type LinhaVinculo = {
  id: string;
  usuario_id: string | null;
  nome_convite: string;
  email_convite: string;
  papel: Papel;
  status: StatusVinculo;
  permissoes: Json;
  convidado_em: string;
  convite_expira_em: string;
  aceito_em: string | null;
  usuarios?: { nome: string; email: string } | null;
};

const SELECAO =
  'id, usuario_id, nome_convite, email_convite, papel, status, permissoes, ' +
  'convidado_em, convite_expira_em, aceito_em, usuarios(nome, email)';

function normalizar(linha: LinhaVinculo): Funcionario {
  return {
    id: linha.id,
    usuario_id: linha.usuario_id,
    // Depois do aceite vale o nome real da conta; antes, o que o Gestor digitou.
    nome: linha.usuarios?.nome || linha.nome_convite,
    email: linha.usuarios?.email || linha.email_convite,
    papel: linha.papel,
    status: linha.status,
    permissoes: (linha.permissoes ?? {}) as MapaPermissoes,
    convidado_em: linha.convidado_em,
    convite_expira_em: linha.convite_expira_em,
    aceito_em: linha.aceito_em,
    convite_expirado:
      linha.status === 'convidado' && new Date(linha.convite_expira_em) < new Date(),
  };
}

/** Seção 7.8 — lista da tela de Funcionários. Acesso exclusivo do Gestor. */
export async function listarFuncionarios(empresaId: string): Promise<Funcionario[]> {
  const { data, error } = await supabase
    .from('empresa_usuarios')
    .select(SELECAO)
    .eq('empresa_id', empresaId)
    .order('papel', { ascending: true })
    .order('convidado_em', { ascending: true });

  if (error) throw new Error(mensagemDeErro(error));
  return ((data ?? []) as unknown as LinhaVinculo[]).map(normalizar);
}

export async function buscarFuncionario(id: string): Promise<Funcionario | null> {
  const { data, error } = await supabase.from('empresa_usuarios').select(SELECAO).eq('id', id).maybeSingle();

  if (error) throw new Error(mensagemDeErro(error));
  return data ? normalizar(data as unknown as LinhaVinculo) : null;
}

/**
 * Seção 5.2 — convite. A RPC valida o limite de funcionários do plano
 * (Seção 6.8) e a regra de uma empresa por usuário antes de criar o vínculo.
 */
export async function convidarFuncionario(nome: string, email: string): Promise<string> {
  await exigirConexao();

  const { data, error } = await supabase.rpc('convidar_funcionario', {
    p_nome: nome,
    p_email: email,
  });

  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as string;
}

/** Seção 5.2 — reenviar gera novo prazo e invalida o convite anterior. */
export async function reenviarConvite(vinculoId: string): Promise<string> {
  await exigirConexao();
  const { data, error } = await supabase.rpc('reenviar_convite', { p_vinculo_id: vinculoId });
  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as string;
}

export async function aceitarConvite(vinculoId: string): Promise<string> {
  await exigirConexao();
  const { data, error } = await supabase.rpc('aceitar_convite', { p_vinculo_id: vinculoId });
  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as string;
}

/** Seção 7.8 — promover Funcionário → Gestor, ou rebaixar. */
export async function alterarPapel(vinculoId: string, papel: Papel): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('alterar_papel_usuario', {
    p_vinculo_id: vinculoId,
    p_papel: papel,
  });
  if (error) throw new Error(mensagemDeErro(error));
}

/** Seção 5.3 — libera/revoga permissões individuais do Funcionário. */
export async function definirPermissoes(
  vinculoId: string,
  permissoes: MapaPermissoes,
): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('definir_permissoes', {
    p_vinculo_id: vinculoId,
    p_permissoes: permissoes as unknown as Json,
  });
  if (error) throw new Error(mensagemDeErro(error));
}

/**
 * Seção 5.6 — remover desativa o acesso e mantém todo o histórico atribuído
 * ao usuário. Ninguém é apagado de verdade.
 */
export async function removerFuncionario(vinculoId: string): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('remover_usuario', { p_vinculo_id: vinculoId });
  if (error) throw new Error(mensagemDeErro(error));
}

/**
 * Seção 5.2, item 3 — envio do convite por e-mail.
 * A montagem da mensagem e a credencial do provedor ficam na Edge Function;
 * o app só dispara.
 */
export async function enviarEmailDeConvite(vinculoId: string): Promise<void> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente.');

  const resposta = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/enviar-convite`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ vinculo_id: vinculoId }),
    },
  );

  if (!resposta.ok) {
    const detalhe = await resposta.json().catch(() => null);
    throw new Error(detalhe?.error ?? 'Não foi possível enviar o e-mail de convite.');
  }
}

/** Seção 5.4 — mudanças de papel e permissão aparecem em tempo real. */
export function observarFuncionarios(empresaId: string, aoMudar: () => void) {
  const canal = supabase
    .channel(`funcionarios:${empresaId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'empresa_usuarios',
        filter: `empresa_id=eq.${empresaId}`,
      },
      aoMudar,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}
