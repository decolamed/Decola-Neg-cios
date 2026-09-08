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

/**
 * O e-mail que fecha o ciclo da contratação.
 *
 * O cliente escolhe o plano, cria a conta e paga — SEM nunca ter escolhido uma
 * senha. É aqui, no instante em que o dinheiro entra, que ele recebe o link
 * para criar a dela. Antes disso não existe acesso nenhum, e é assim de
 * propósito: o produto não é liberado por promessa de pagamento.
 *
 * Chamamos a função `enviar-acesso`, que já sabe gerar o token de recuperação
 * e montar o e-mail da marca. Reaproveitar em vez de duplicar importa aqui:
 * são dois caminhos para o MESMO e-mail (primeiro acesso pela compra, e o
 * "esqueci minha senha"), e um corpo de e-mail só é um corpo só para manter.
 *
 * FALHAR AQUI NÃO PODE DERRUBAR O WEBHOOK. Se o Resend estiver fora do ar, o
 * pagamento continua confirmado e a assinatura continua ativa — devolver erro
 * ao Asaas faria ele reenviar o evento e reprocessar tudo por causa de um
 * e-mail. O gestor sempre pode pedir o link de novo em "Esqueci minha senha",
 * e o log abaixo diz o que houve.
 */
async function enviarPrimeiroAcesso(supabase: any, empresaId: string): Promise<void> {
  try {
    // O e-mail de quem contratou é o do Gestor Principal da empresa: é a linha
    // que a própria RPC de criação escreve, com o e-mail da conta do Auth.
    //
    // PELA RPC, E NÃO LENDO A TABELA (migração 0052). Isto aqui consultava
    // `empresa_usuarios` direto com a chave de serviço, que não tem SELECT nela
    // de propósito (migração 0030). O banco recusava, o `catch` abaixo engolia,
    // e o cliente pagava sem NUNCA receber o link para criar a senha — sem
    // nada, em lugar nenhum, dizendo por quê.
    const { data: email, error: erroGestor } = await supabase.rpc(
      'contratacao_email_do_gestor',
      { p_empresa_id: empresaId },
    );

    if (erroGestor || !email) {
      console.error('primeiro acesso: nao achei o gestor principal', empresaId, erroGestor);
      return;
    }

    const resposta = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-acesso`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Chamada de servidor para servidor, dentro do mesmo projeto.
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      },
      body: JSON.stringify({ email, tipo: 'primeiro_acesso' }),
    });

    if (!resposta.ok) {
      console.error('primeiro acesso: envio recusado', resposta.status, await resposta.text());
      return;
    }

    console.log('primeiro acesso enviado para a empresa', empresaId);
  } catch (e) {
    console.error('primeiro acesso: falha inesperada', e);
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
    /**
     * É a PRIMEIRA vez que esta assinatura é paga?
     *
     * A pergunta precisa ser feita ANTES do update, porque logo abaixo o
     * status vira 'ativa' e a informação se perde. E ela decide uma coisa que
     * não dá para errar nos dois sentidos: o e-mail de "crie sua senha" sai
     * na primeira confirmação e em nenhuma das mensalidades seguintes.
     * Mandá-lo todo mês seria oferecer, uma vez por mês, um link que troca a
     * senha de quem já entrou.
     */
    const primeiraConfirmacao = assinatura.status === 'pendente_pagamento';

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

    if (primeiraConfirmacao) {
      await enviarPrimeiroAcesso(supabase, assinatura.empresa_id);
    }
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
