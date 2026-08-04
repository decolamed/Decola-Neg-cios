/**
 * Webhook do Asaas — Seções 6.4, 6.6 e 7.12.
 *
 * "Fluxo: App/Web → Backend Decola Negócios → API Asaas → Webhook de
 * confirmação → Backend atualiza assinatura → App libera acesso."
 *
 * Esta é a ÚNICA porta que muda `assinaturas.status` para `ativa`. Nem o app,
 * nem o Gestor conseguem: a tabela não tem escrita pelo cliente (0014). Por
 * isso a autenticidade da chamada importa tanto.
 *
 * Autenticação: o Asaas envia o token configurado no painel dele no cabeçalho
 * `asaas-access-token`. Comparamos com o secret `ASAAS_WEBHOOK_TOKEN` usando
 * comparação de tempo constante. `verify_jwt` fica DESLIGADO nesta função
 * porque quem chama é o Asaas, não um usuário — a autenticação é esta.
 *
 * SECRETS: ASAAS_WEBHOOK_TOKEN, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

/** Comparação de tempo constante: não vaza o token por diferença de tempo. */
function tokensIguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** Formas de pagamento do Asaas → enum `cobranca_forma_pagamento`. */
function formaDePagamento(tipo: string | undefined): 'pix' | 'boleto' | 'cartao' {
  switch (tipo) {
    case 'CREDIT_CARD':
    case 'DEBIT_CARD':
      return 'cartao';
    case 'BOLETO':
      return 'boleto';
    default:
      return 'pix';
  }
}

Deno.serve(async (requisicao) => {
  if (requisicao.method !== 'POST') {
    return new Response('Método não suportado.', { status: 405 });
  }

  const esperado = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
  const recebido = requisicao.headers.get('asaas-access-token');

  if (!esperado || !recebido || !tokensIguais(esperado, recebido)) {
    console.warn('Webhook recusado: token inválido.');
    return new Response('Não autorizado.', { status: 401 });
  }

  let evento: { event?: string; payment?: Record<string, any> };
  try {
    evento = await requisicao.json();
  } catch {
    return new Response('Corpo inválido.', { status: 400 });
  }

  const pagamento = evento.payment;
  if (!pagamento?.id) {
    // Evento sem cobrança (ex: eventos de conta) — reconhecemos e ignoramos.
    return new Response(JSON.stringify({ ignorado: true }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Localiza a cobrança. `externalReference` carrega o id da assinatura desde
  // a criação (asaas-checkout), o que dispensa depender só do id do pagamento.
  const { data: cobrancaExistente } = await supabase
    .from('cobrancas')
    .select('id, assinatura_id')
    .eq('asaas_payment_id', pagamento.id)
    .maybeSingle();

  const assinaturaId: string | undefined =
    cobrancaExistente?.assinatura_id ?? pagamento.externalReference ?? undefined;

  if (!assinaturaId) {
    console.warn('Webhook sem assinatura identificável:', pagamento.id);
    return new Response(JSON.stringify({ ignorado: true }), { status: 200 });
  }

  const { data: assinatura } = await supabase
    .from('assinaturas')
    .select('id, empresa_id, status')
    .eq('id', assinaturaId)
    .maybeSingle();

  if (!assinatura) {
    console.warn('Assinatura não encontrada:', assinaturaId);
    return new Response(JSON.stringify({ ignorado: true }), { status: 200 });
  }

  const tipo = evento.event ?? '';
  const confirmado = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(tipo);
  const vencido = tipo === 'PAYMENT_OVERDUE';
  const cancelado = ['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'].includes(tipo);

  // 1. Histórico da cobrança (Seção 4.12.3). Upsert torna o webhook idempotente
  //    — o Asaas reenvia eventos, e reprocessar não pode duplicar nada.
  await supabase.from('cobrancas').upsert(
    {
      assinatura_id: assinatura.id,
      asaas_payment_id: pagamento.id,
      valor: Number(pagamento.value ?? 0),
      forma_pagamento: formaDePagamento(pagamento.billingType),
      status: confirmado ? 'confirmado' : vencido ? 'vencido' : cancelado ? 'cancelado' : 'pendente',
      vencimento: pagamento.dueDate,
      pago_em: confirmado ? new Date().toISOString() : null,
    },
    { onConflict: 'asaas_payment_id' },
  );

  // 2. Estado da assinatura.
  if (confirmado) {
    // Seção 6.6 — "o pagamento é regularizado → acesso completo é restaurado
    // automaticamente". Vale inclusive saindo do modo limitado.
    const proximo = new Date();
    proximo.setMonth(proximo.getMonth() + 1);

    await supabase
      .from('assinaturas')
      .update({
        status: 'ativa',
        proximo_vencimento: proximo.toISOString().slice(0, 10),
        carencia_expira_em: null,
      })
      .eq('id', assinatura.id);

    await supabase.from('notificacoes').insert({
      empresa_id: assinatura.empresa_id,
      categoria: 'assinatura',
      titulo: 'Pagamento confirmado',
      mensagem: 'Sua assinatura está ativa e o acesso completo foi liberado.',
    });
  } else if (vencido && ['ativa', 'trial'].includes(assinatura.status)) {
    // Seção 6.6 — "um pagamento recusado ou atrasado NÃO bloqueia o acesso
    // imediatamente": entra em carência, com todas as funcionalidades.
    const { data: config } = await supabase
      .from('configuracoes_plataforma')
      .select('carencia_dias')
      .limit(1)
      .maybeSingle();

    const carencia = new Date();
    carencia.setDate(carencia.getDate() + (config?.carencia_dias ?? 7));

    await supabase
      .from('assinaturas')
      .update({ status: 'carencia', carencia_expira_em: carencia.toISOString() })
      .eq('id', assinatura.id);

    await supabase.from('notificacoes').insert({
      empresa_id: assinatura.empresa_id,
      categoria: 'assinatura',
      titulo: 'Pagamento em atraso',
      mensagem:
        'Não identificamos o pagamento. Todas as funcionalidades continuam disponíveis ' +
        'durante o período de carência — regularize para não entrar em modo limitado.',
    });
  }

  return new Response(JSON.stringify({ processado: true, evento: tipo }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
