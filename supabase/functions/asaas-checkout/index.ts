/**
 * Criação da cobrança da assinatura — Seções 6.4 e 7.12.
 *
 * "Toda a integração de pagamento é feita através da API oficial do Asaas,
 * EXCLUSIVAMENTE pelo backend. O app cliente NUNCA se comunica diretamente com
 * o Asaas." (Seção 6.4)
 *
 * Fluxo: App → esta função → API Asaas → link do checkout hospedado.
 * O app abre esse link numa webview e aguarda a confirmação via webhook
 * (Seção 7.12, item 6) — não é esta função que libera o acesso.
 *
 * A chave da API vive só no secret `ASAAS_API_KEY` e nunca sai daqui
 * (Seções 6.4 e 9.1).
 *
 * SECRETS: ASAAS_API_KEY, ASAAS_AMBIENTE ("sandbox" | "producao").
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function erro(mensagem: string, status: number): Response {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function baseAsaas(): string {
  return Deno.env.get('ASAAS_AMBIENTE') === 'producao'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

async function chamarAsaas(caminho: string, chave: string, corpo?: unknown): Promise<any> {
  const resposta = await fetch(`${baseAsaas()}${caminho}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { access_token: chave, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const dados = await resposta.json();

  if (!resposta.ok) {
    const detalhe = dados?.errors?.[0]?.description ?? 'Erro na comunicação com o Asaas.';
    throw new Error(detalhe);
  }

  return dados;
}

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requisicao.method !== 'POST') return erro('Método não suportado.', 405);

  const autorizacao = requisicao.headers.get('Authorization');
  if (!autorizacao) return erro('Autenticação necessária.', 401);

  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) {
    return erro(
      'O meio de pagamento ainda não está configurado no servidor. Fale com o suporte.',
      503,
    );
  }

  // Cliente com o JWT do chamador: a RLS garante que ele só enxerga a própria
  // empresa e a própria assinatura.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autorizacao } } },
  );

  const { data: assinaturas, error } = await supabase
    .from('assinaturas')
    .select('id, empresa_id, plano_id, valor_contratado, status, asaas_customer_id, ' +
            'ativada_manualmente, empresas(nome, cnpj, telefone), planos(nome)')
    .neq('status', 'cancelada')
    .limit(1);

  if (error) return erro(error.message, 400);

  const assinatura = assinaturas?.[0];
  if (!assinatura) return erro('Nenhuma assinatura encontrada para esta conta.', 404);

  // Seção 6.9 — contas ativadas manualmente não passam pelo fluxo de pagamento.
  if (assinatura.ativada_manualmente) {
    return erro('Esta conta foi ativada manualmente e não requer pagamento.', 400);
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('nome, email, telefone')
    .limit(1)
    .maybeSingle();

  if (!usuario) return erro('Não foi possível identificar o responsável pela conta.', 400);

  const empresa = assinatura.empresas as { nome: string; cnpj: string | null; telefone: string | null } | null;
  const plano = assinatura.planos as { nome: string } | null;

  try {
    // 1. Cliente no Asaas — reaproveita se a assinatura já tiver um.
    let clienteId = assinatura.asaas_customer_id;

    if (!clienteId) {
      const cliente = await chamarAsaas('/customers', chave, {
        name: empresa?.nome ?? usuario.nome,
        email: usuario.email,
        cpfCnpj: empresa?.cnpj ?? undefined,
        phone: empresa?.telefone ?? usuario.telefone ?? undefined,
        // Amarra o cliente do Asaas à empresa, para o webhook reconciliar.
        externalReference: assinatura.empresa_id,
      });
      clienteId = cliente.id;
    }

    // 2. Cobrança do primeiro ciclo, com vencimento em 3 dias.
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + 3);

    const cobranca = await chamarAsaas('/payments', chave, {
      customer: clienteId,
      // UNDEFINED deixa o pagador escolher entre Pix, boleto e cartão no
      // checkout hospedado (Seção 6.4).
      billingType: 'UNDEFINED',
      value: Number(assinatura.valor_contratado),
      dueDate: vencimento.toISOString().slice(0, 10),
      description: `Assinatura ${plano?.nome ?? ''} — Decola Negócios`.trim(),
      externalReference: assinatura.id,
    });

    // 3. Persiste com a service key: `assinaturas` e `cobrancas` não têm
    //    escrita pelo cliente, de propósito (Seção 6.4).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    await admin
      .from('assinaturas')
      .update({ asaas_customer_id: clienteId, proximo_vencimento: cobranca.dueDate })
      .eq('id', assinatura.id);

    await admin.from('cobrancas').upsert(
      {
        assinatura_id: assinatura.id,
        asaas_payment_id: cobranca.id,
        valor: Number(cobranca.value),
        // O pagador ainda não escolheu: registramos como pix e o webhook
        // corrige com a forma efetivamente usada.
        forma_pagamento: 'pix',
        status: 'pendente',
        vencimento: cobranca.dueDate,
      },
      { onConflict: 'asaas_payment_id' },
    );

    // Seção 7.12 — o app abre esta URL numa webview.
    return new Response(
      JSON.stringify({
        url_checkout: cobranca.invoiceUrl,
        cobranca_id: cobranca.id,
        vencimento: cobranca.dueDate,
        valor: Number(cobranca.value),
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('Falha ao criar cobrança no Asaas:', e);
    return erro(
      e instanceof Error ? e.message : 'Não foi possível iniciar o pagamento. Tente novamente.',
      502,
    );
  }
});
