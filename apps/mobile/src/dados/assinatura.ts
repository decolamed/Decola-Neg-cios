/**
 * Repositório de assinatura e pagamento — Seções 6.4 a 6.9, 7.12, 7.13, 7.14.
 *
 * O app NUNCA fala com o Asaas (Seção 6.4): a criação da cobrança passa pela
 * Edge Function `asaas-checkout`, que devolve a URL do checkout hospedado. E
 * `assinaturas` não tem verbo de escrita para o cliente (migration 0014) — a
 * troca de plano passa pela RPC `trocar_plano` e a ativação, só pelo webhook.
 */
import type {
  Assinatura,
  Cobranca,
  Enums,
  Plano,
  ResultadoTrocaDePlano,
} from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

export type StatusAssinatura = Enums['assinatura_status'];

/** Seção 4.12.2 — rótulos dos estados que o Gestor vê em "Meu plano". */
export const ROTULO_STATUS_ASSINATURA: Record<StatusAssinatura, string> = {
  pendente_pagamento: 'Aguardando pagamento',
  trial: 'Teste gratuito',
  ativa: 'Ativa',
  carencia: 'Pagamento pendente',
  modo_limitado: 'Modo limitado',
  cancelada: 'Cancelada',
};

/**
 * Explicação de cada estado, no vocabulário das Seções 6.5 e 6.6 — o usuário
 * precisa entender o que ainda pode fazer, não só o nome do estado.
 */
export const EXPLICACAO_STATUS_ASSINATURA: Record<StatusAssinatura, string> = {
  pendente_pagamento:
    'Sua assinatura ainda não foi ativada. Conclua o pagamento para liberar o acesso.',
  trial: 'Todas as funcionalidades do seu plano estão liberadas durante o teste.',
  ativa: 'Tudo em dia. Sua próxima cobrança acontece na data indicada abaixo.',
  carencia:
    'Não identificamos o pagamento. Todas as funcionalidades continuam disponíveis durante a ' +
    'carência — regularize para não entrar em modo limitado.',
  modo_limitado:
    'Você pode consultar seus dados, mas não registrar vendas, alterar estoque ou editar ' +
    'produtos até regularizar o pagamento. Nenhum dado foi perdido.',
  cancelada: 'Sua assinatura foi cancelada. Os dados da empresa continuam preservados.',
};

export const ROTULO_FORMA_COBRANCA: Record<Enums['cobranca_forma_pagamento'], string> = {
  pix: 'Pix',
  boleto: 'Boleto',
  cartao: 'Cartão de crédito',
};

export const ROTULO_STATUS_COBRANCA: Record<Enums['cobranca_status'], string> = {
  pendente: 'Aguardando pagamento',
  confirmado: 'Pago',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
};

export const ERRO_CARREGAR_ASSINATURA = 'Não foi possível carregar os dados do seu plano.';

/** Seção 7.14, botão "Meu plano" — tudo que a tela precisa, numa consulta só. */
export type DetalheDaAssinatura = {
  assinatura: Assinatura;
  plano: Plano;
  /** Downgrade agendado, quando existe (Seção 6.7). */
  planoAgendado: Plano | null;
  /** Histórico de cobranças da assinatura (Seção 4.12.3). */
  cobrancas: Cobranca[];
};

type LinhaAssinatura = Assinatura & {
  planos: Plano | null;
  plano_agendado: Plano | null;
};

/**
 * A RLS já restringe a leitura à empresa do usuário, e `assinaturas` continua
 * legível mesmo com a conta em modo limitado (decisão da Fase 1) — é assim que
 * esta tela consegue explicar o bloqueio em vez de aparecer vazia.
 */
export async function carregarDetalheDaAssinatura(
  empresaId: string,
): Promise<DetalheDaAssinatura | null> {
  const { data, error } = await supabase
    .from('assinaturas')
    .select('*, planos!assinaturas_plano_id_fkey(*), plano_agendado:planos!assinaturas_plano_agendado_id_fkey(*)')
    .eq('empresa_id', empresaId)
    .neq('status', 'cancelada')
    .maybeSingle();

  if (error) throw new Error(mensagemDeErro(error));
  if (!data) return null;

  const linha = data as unknown as LinhaAssinatura;
  if (!linha.planos) throw new Error(ERRO_CARREGAR_ASSINATURA);

  const { data: cobrancas, error: erroCobrancas } = await supabase
    .from('cobrancas')
    .select('*')
    .eq('assinatura_id', linha.id)
    .order('vencimento', { ascending: false })
    .limit(12);

  // A leitura de cobranças exige `gerenciar_assinatura` na política de 0007:
  // para o Funcionário ela volta vazia, e o restante da tela segue normal.
  if (erroCobrancas) throw new Error(mensagemDeErro(erroCobrancas));

  return {
    assinatura: linha,
    plano: linha.planos,
    planoAgendado: linha.plano_agendado,
    cobrancas: cobrancas ?? [],
  };
}

/**
 * Seção 6.7 — troca de plano. Upgrade é imediato; downgrade fica agendado para
 * o próximo vencimento e é RECUSADO se a empresa exceder os limites do plano
 * de destino, com a lista exata do que precisa ser ajustado.
 *
 * Toda a decisão é do servidor: a RPC revalida `gerenciar_assinatura`, o plano
 * estar ativo e os limites, mesmo com a interface já tendo filtrado.
 */
export async function trocarPlano(planoId: string): Promise<ResultadoTrocaDePlano> {
  await exigirConexao();

  const { data, error } = await supabase.rpc('trocar_plano', { p_plano_id: planoId });

  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as ResultadoTrocaDePlano;
}

/** Seção 6.7 — desistir do downgrade antes de ele entrar em vigor. */
export async function cancelarTrocaDePlano(): Promise<void> {
  await exigirConexao();
  const { error } = await supabase.rpc('cancelar_troca_de_plano');
  if (error) throw new Error(mensagemDeErro(error));
}

export type CheckoutIniciado = {
  url_checkout: string;
  cobranca_id: string;
  vencimento: string;
  valor: number;
};

/**
 * Seções 6.4 e 7.12 — cria a cobrança pelo backend e devolve a URL do checkout
 * hospedado do Asaas. A chave da API vive só no secret da Edge Function; o app
 * recebe apenas um link.
 */
export async function iniciarCheckout(): Promise<CheckoutIniciado> {
  await exigirConexao();

  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente.');

  const resposta = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/asaas-checkout`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({}),
    },
  );

  const corpo = await resposta.json().catch(() => null);

  if (!resposta.ok) {
    throw new Error(corpo?.error ?? 'Não foi possível iniciar o pagamento. Tente novamente.');
  }

  return corpo as CheckoutIniciado;
}
