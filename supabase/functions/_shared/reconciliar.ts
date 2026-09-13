/**
 * "Ele já pagou?" — a pergunta em UM lugar só.
 *
 * POR QUE ISTO EXISTE. Em 13/09 um cliente pagou R$ 5,00 por Pix, o Asaas
 * confirmou, mandou o recibo — e nunca chamou o nosso webhook. Zero requisições
 * ao `asaas-webhook` em 24 horas. A assinatura seguiu `pendente_pagamento` e o
 * produto pediu pagamento de novo, para alguém que já tinha pago.
 *
 * O defeito não era o webhook estar desconfigurado: era o acesso depender
 * EXCLUSIVAMENTE dele. Webhook é entrega de terceiro — pode não estar
 * cadastrado, pode ser apagado por engano, pode esgotar as retentativas. Cada
 * vez que isso acontece, alguém paga e não entra, calado.
 *
 * Agora existe um segundo caminho, e ele é consultado de três lugares: quem
 * volta pelo cadastro (`contratar`), quem está logado na tela de pagamento
 * (`conferir-pagamento`) e a varredura que roda sozinha, sem ninguém abrir tela
 * nenhuma. Os três perguntam ao Asaas e, achando dinheiro recebido, chamam a
 * MESMA RPC que o webhook chama (`assinatura_registrar_pagamento`, migração
 * 0056).
 *
 * Uma cópia só da regra, de propósito: se cada caminho tivesse a sua, eles
 * divergiriam — e a divergência apareceria como acesso liberado por um e não
 * pelo outro, que é o tipo de defeito que ninguém encontra.
 */

/**
 * Estados em que o Asaas considera o dinheiro recebido.
 *
 * `RECEIVED_IN_CASH` fica DE FORA de propósito, como na Decola MED: é baixa
 * manual registrada no painel do Asaas ("recebi em dinheiro"), não pagamento
 * pelo checkout. Tratá-la como confirmação faria uma anotação administrativa
 * liberar acesso e disparar o e-mail de primeiro acesso — e essa é uma decisão
 * de quem administra, não um efeito colateral de marcar uma caixa.
 *
 * É também a mesma lista que o webhook reconhece (`PAYMENT_CONFIRMED` e
 * `PAYMENT_RECEIVED`), e os dois caminhos precisam concordar: se a varredura
 * liberasse por um estado que o webhook ignora, o acesso dependeria de quem
 * chegou primeiro.
 */
export const PAGAS = ['RECEIVED', 'CONFIRMED'];

/** Formas do Asaas → enum `cobranca_forma_pagamento`. */
export function formaDePagamento(tipo: string | undefined): 'pix' | 'boleto' | 'cartao' {
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

export function baseAsaas(): string {
  return Deno.env.get('ASAAS_AMBIENTE') === 'producao'
    ? 'https://api.asaas.com/v3'
    : 'https://api-sandbox.asaas.com/v3';
}

export async function chamarAsaas(
  caminho: string,
  chave: string,
  corpo?: unknown,
): Promise<any> {
  const resposta = await fetch(`${baseAsaas()}${caminho}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { access_token: chave, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(dados?.errors?.[0]?.description ?? 'Erro na comunicação com o Asaas.');
  }
  return dados;
}

/** O que a busca encontrou nas cobranças pendentes de uma assinatura. */
export type Achado =
  /** Dinheiro recebido, e a conta já foi liberada por esta chamada. */
  | { tipo: 'pago'; pagamento: Record<string, any>; primeiraConfirmacao: boolean }
  /** Nada pago, mas existe um checkout aberto que ainda serve. */
  | { tipo: 'em_aberto'; pagamento: Record<string, any> }
  /** Nenhuma cobrança aproveitável: quem chamou que decida abrir outra. */
  | { tipo: 'nada' };

/**
 * Percorre as cobranças pendentes de uma assinatura e devolve o que achou.
 *
 * TODAS AS PENDENTES, e não só a última. Foi assim que o cliente de 13/09 quase
 * pagou duas vezes: a assinatura tinha DUAS cobranças pendentes, ele pagou uma,
 * e olhar só a mais recente caía justamente na outra — ainda `PENDING` no
 * Asaas. O produto concluiria, com toda a lógica nova no lugar, que faltava
 * pagar.
 *
 * Duas cobranças abertas para a mesma assinatura acontecem quando uma tentativa
 * morre no meio e a pessoa recomeça. Enquanto isso for possível, a pergunta tem
 * de ser feita a todas: basta UMA paga para o dinheiro ter entrado.
 *
 * Uma cobrança paga interrompe a busca na hora — nada mais importa depois
 * disso. As em aberto só são devolvidas no fim, quando se sabe que nenhuma
 * outra foi paga: oferecer checkout a quem já pagou é o erro caro.
 */
export async function procurarPagamento(
  admin: { from: (t: string) => any; rpc: (n: string, a: unknown) => any },
  chave: string,
  assinaturaId: string,
): Promise<Achado> {
  const { data: pendentes } = await admin
    .from('cobrancas')
    .select('asaas_payment_id')
    .eq('assinatura_id', assinaturaId)
    .eq('status', 'pendente')
    .order('criado_em', { ascending: false })
    .limit(10);

  let emAberto: Record<string, any> | null = null;

  for (const registro of (pendentes ?? []) as { asaas_payment_id?: string }[]) {
    if (!registro.asaas_payment_id) continue;

    let atual: Record<string, any>;
    try {
      atual = await chamarAsaas(`/payments/${registro.asaas_payment_id}`, chave);
    } catch {
      // Sumiu do Asaas ou ele recusou: essa não serve, olha a próxima.
      continue;
    }

    if (atual?.status && PAGAS.includes(atual.status)) {
      const primeiraConfirmacao = await registrarPagamento(admin, assinaturaId, atual);
      return { tipo: 'pago', pagamento: atual, primeiraConfirmacao };
    }

    if (!emAberto && atual?.invoiceUrl && (atual.status === 'PENDING' || atual.status === 'OVERDUE')) {
      emAberto = atual;
    }
  }

  return emAberto ? { tipo: 'em_aberto', pagamento: emAberto } : { tipo: 'nada' };
}

/**
 * Grava a confirmação pela MESMA porta que o webhook usa, e diz se esta foi a
 * primeira — o que decide o envio do e-mail de "crie sua senha": ele sai uma
 * vez, nunca nas mensalidades seguintes.
 */
export async function registrarPagamento(
  admin: { rpc: (n: string, a: unknown) => any },
  assinaturaId: string,
  pagamento: Record<string, any>,
): Promise<boolean> {
  const { data, error } = await admin.rpc('assinatura_registrar_pagamento', {
    p_assinatura_id: assinaturaId,
    p_asaas_payment_id: pagamento.id,
    p_valor: Number(pagamento.value ?? 0),
    p_forma: formaDePagamento(pagamento.billingType),
    p_vencimento: pagamento.dueDate ?? null,
  });

  if (error) {
    console.error('reconciliar: achei o pagamento mas nao consegui registrar', error);
    throw new Error('Não foi possível liberar a conta agora.');
  }

  return Boolean((data as { primeira_confirmacao?: boolean })?.primeira_confirmacao);
}

/**
 * O e-mail que fecha o ciclo: o link para criar a senha.
 *
 * FALHAR AQUI NÃO PODE DERRUBAR A LIBERAÇÃO. A conta já está ativa; se o Resend
 * estiver fora, a pessoa pede o mesmo link por "Esqueci minha senha". O
 * desfecho de cada envio fica gravado em `envios_de_acesso` (migração 0055),
 * para que esta resiliência não vire cegueira.
 *
 * A chamada leva a CHAVE DE SERVIÇO: `enviar-acesso` reconhece o pedido como
 * interno e pula o freio de 60 segundos, que aqui seguraria justamente o e-mail
 * que libera o acesso.
 */
export async function enviarAcesso(email: string): Promise<void> {
  try {
    const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resposta = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enviar-acesso`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${chave}`,
        apikey: chave,
      },
      body: JSON.stringify({ email, tipo: 'primeiro_acesso' }),
    });

    if (!resposta.ok) {
      console.error('reconciliar: envio do acesso recusado', resposta.status, await resposta.text());
    }
  } catch (e) {
    console.error('reconciliar: falha ao enviar o acesso', e);
  }
}

/** Texto único da boa notícia, para as telas não inventarem cada uma a sua. */
export const AVISO_JA_PAGO =
  'Seu pagamento já foi confirmado e sua conta está liberada. Enviamos para o seu e-mail o ' +
  'link para criar sua senha — confira também a caixa de spam. Se preferir, use "Esqueci ' +
  'minha senha" na tela de entrada.';
