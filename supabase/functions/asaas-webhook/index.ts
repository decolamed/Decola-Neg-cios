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
 * A chamada leva a CHAVE DE SERVIÇO, e isso tem consequência: `enviar-acesso`
 * reconhece que o pedido veio de dentro do servidor e pula o freio de 60
 * segundos. Sem isso, quem tivesse clicado em "esqueci minha senha" pouco antes
 * de pagar tomava 429 bem aqui — e pagava sem receber o link.
 *
 * FALHAR AQUI NÃO PODE DERRUBAR O WEBHOOK. Se o Resend estiver fora do ar, o
 * pagamento continua confirmado e a assinatura continua ativa — devolver erro
 * ao Asaas faria ele reenviar o evento e reprocessar tudo por causa de um
 * e-mail. O desfecho de cada envio fica gravado em `envios_de_acesso`
 * (migração 0055), para que esta resiliência não vire cegueira.
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

  /**
   * OS DOIS MOTIVOS DE RECUSA SÃO DIFERENTES, E A DIFERENÇA É O DIAGNÓSTICO.
   *
   * Antes os dois davam o mesmo 401 e o mesmo log de uma linha. O sintoma
   * ficava sendo "o webhook está cadastrado e mesmo assim nada acontece", sem
   * nada que dissesse qual dos dois casos era.
   *
   * Sem o secret configurado, qualquer um liberaria acesso de graça mandando um
   * POST aqui — recusar tudo é o certo, mas o log tem de dizer o que fazer.
   *
   * Token divergente é a causa MAIS PROVÁVEL de webhook cadastrado que não
   * funciona: o valor do painel do Asaas não bate com o do secret. Dizer isso
   * no log poupa a próxima investigação inteira.
   */
  if (!esperado) {
    console.error(
      'Webhook do Asaas recebido, mas o secret ASAAS_WEBHOOK_TOKEN não está configurado. ' +
        'Configure-o em Supabase → Settings → Edge Functions → Secrets com o MESMO valor ' +
        'do campo "Token de autenticação" do webhook no painel do Asaas.',
    );
    return new Response('Webhook não configurado.', { status: 503 });
  }

  if (!recebido || !tokensIguais(esperado, recebido)) {
    console.error(
      'Webhook do Asaas recusado: o token recebido não confere com ASAAS_WEBHOOK_TOKEN. ' +
        'Os dois valores precisam ser idênticos — confira o campo "Token de autenticação" ' +
        'do webhook no painel do Asaas.',
    );
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

  /**
   * A CONSULTA FALHOU É DIFERENTE DE A LINHA NÃO EXISTE.
   *
   * Estes dois `select` descartavam o erro e caíam no mesmo `if (!achou)`, que
   * respondia 200 "ignorado". Um 200 faz o Asaas RISCAR o evento da fila: ele
   * não reenvia mais. Então uma indisponibilidade de um segundo no banco —
   * enquanto o dinheiro já entrou — apagava para sempre o aviso de que alguém
   * pagou. Sem erro em lugar nenhum, sem retentativa, sem acesso.
   *
   * É o mesmo defeito que a Decola MED já pagou para descobrir e corrigiu em
   * `confirmar-pagamento.ts`. Aqui vale igual: falha de consulta pede
   * RETENTATIVA (500, e o Asaas reenvia); só a ausência real da linha — um
   * `externalReference` que não é desta plataforma — é definitiva, porque
   * reenviar não faria a linha aparecer.
   */
  const { data: cobrancaExistente, error: erroCobranca } = await supabase
    .from('cobrancas')
    .select('id, assinatura_id')
    .eq('asaas_payment_id', pagamento.id)
    .maybeSingle();

  if (erroCobranca) {
    console.error('webhook: falha ao consultar a cobrança', pagamento.id, erroCobranca);
    return new Response(JSON.stringify({ erro: 'falha ao consultar' }), { status: 500 });
  }

  const assinaturaId: string | undefined =
    cobrancaExistente?.assinatura_id ?? pagamento.externalReference ?? undefined;

  if (!assinaturaId) {
    console.warn('Webhook sem assinatura identificável:', pagamento.id);
    return new Response(JSON.stringify({ ignorado: true }), { status: 200 });
  }

  const { data: assinatura, error: erroAssinatura } = await supabase
    .from('assinaturas')
    .select('id, empresa_id, status')
    .eq('id', assinaturaId)
    .maybeSingle();

  if (erroAssinatura) {
    console.error('webhook: falha ao consultar a assinatura', assinaturaId, erroAssinatura);
    return new Response(JSON.stringify({ erro: 'falha ao consultar' }), { status: 500 });
  }

  if (!assinatura) {
    console.warn('Assinatura não encontrada:', assinaturaId);
    return new Response(JSON.stringify({ ignorado: true }), { status: 200 });
  }

  const tipo = evento.event ?? '';
  const confirmado = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(tipo);
  const vencido = tipo === 'PAYMENT_OVERDUE';
  const cancelado = ['PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'].includes(tipo);

  /**
   * Dinheiro que VOLTOU não é o mesmo que cobrança apagada.
   *
   * Estorno e chargeback desfazem um pagamento que já tinha liberado a conta.
   * Antes, os três eventos só marcavam a cobrança como cancelada e a assinatura
   * seguia `ativa` para sempre — acesso liberado indevidamente, sem nada no
   * caminho denunciando.
   *
   * `PAYMENT_DELETED` fica de fora de propósito: apagar uma cobrança é ação
   * administrativa (trocar um boleto por outro, corrigir um valor) e não
   * significa que o dinheiro voltou. Tirar acesso por causa dela puniria o
   * cliente por uma correção nossa.
   */
  const dinheiroDevolvido = ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED'].includes(tipo);

  // 1. Histórico da cobrança (Seção 4.12.3). Upsert torna o webhook idempotente
  //    — o Asaas reenvia eventos, e reprocessar não pode duplicar nada.
  //
  //    A confirmação NÃO passa por aqui: ela é registrada pela RPC abaixo, que
  //    é o único lugar que decide o que "pago" significa. Este upsert cuida dos
  //    outros desfechos.
  if (!confirmado) {
    await supabase.from('cobrancas').upsert(
      {
        assinatura_id: assinatura.id,
        asaas_payment_id: pagamento.id,
        valor: Number(pagamento.value ?? 0),
        forma_pagamento: formaDePagamento(pagamento.billingType),
        status: vencido ? 'vencido' : cancelado ? 'cancelado' : 'pendente',
        vencimento: pagamento.dueDate,
        pago_em: null,
      },
      { onConflict: 'asaas_payment_id' },
    );
  }

  // 2. Estado da assinatura.
  if (confirmado) {
    /**
     * QUEM DECIDE O QUE "PAGO" SIGNIFICA É O BANCO (migração 0056).
     *
     * Existem DOIS caminhos que liberam acesso: este webhook e a reconciliação
     * que a contratação faz ao consultar a cobrança no Asaas. O segundo nasceu
     * porque este aqui falhou com dinheiro real no meio — um cliente pagou, o
     * Asaas não nos chamou, e a conta ficou presa.
     *
     * Se cada caminho tivesse a sua cópia da regra, eles divergiriam, e a
     * divergência apareceria como acesso liberado por um e não pelo outro — o
     * tipo de defeito que ninguém encontra. A RPC grava a cobrança, ativa a
     * assinatura, notifica, e devolve se esta foi a PRIMEIRA confirmação (o que
     * decide o envio do e-mail de "crie sua senha": ele sai uma vez, nunca nas
     * mensalidades seguintes).
     */
    const { data: resultado, error: erroConfirmar } = await supabase.rpc(
      'assinatura_registrar_pagamento',
      {
        p_assinatura_id: assinatura.id,
        p_asaas_payment_id: pagamento.id,
        p_valor: Number(pagamento.value ?? 0),
        p_forma: formaDePagamento(pagamento.billingType),
        p_vencimento: pagamento.dueDate ?? null,
      },
    );

    if (erroConfirmar) {
      // Devolver erro faz o Asaas reenviar o evento — que é o certo aqui: sem
      // esta gravação o cliente pagou e não foi liberado.
      console.error('webhook: falha ao registrar o pagamento', erroConfirmar);
      return new Response(JSON.stringify({ erro: 'falha ao registrar' }), { status: 500 });
    }

    const primeiraConfirmacao = Boolean(
      (resultado as unknown as { primeira_confirmacao?: boolean })?.primeira_confirmacao,
    );

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
  } else if (dinheiroDevolvido && ['ativa', 'trial'].includes(assinatura.status)) {
    /**
     * O pagamento foi desfeito. A conta não pode continuar ativa — mas também
     * não é cortada na hora.
     *
     * A Seção 6.6 vale aqui pelo mesmo motivo do atraso: ninguém perde o acesso
     * ao próprio negócio sem aviso e sem chance de resolver. A diferença é que
     * agora existe um prazo correndo, e uma notificação que diz o que houve —
     * em vez do silêncio de antes, em que o dinheiro voltava e o acesso ficava.
     */
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
      titulo: 'Pagamento estornado',
      mensagem:
        'O pagamento da sua assinatura foi devolvido. Todas as funcionalidades continuam ' +
        'disponíveis durante o período de carência — regularize em Meu plano para não entrar ' +
        'em modo limitado.',
    });
  }

  return new Response(JSON.stringify({ processado: true, evento: tipo }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
