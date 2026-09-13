/**
 * "Paguei e não fui liberado" — a resposta para quem já está dentro do app.
 *
 * O QUE ESTA FUNÇÃO CONSERTA. Quem paga e volta pelo CADASTRO já é reconciliado
 * pela `contratar`. Mas quem criou a senha e entrou cai na tela "Ative sua
 * assinatura", e essa tela só relia o BANCO — que nunca mudaria, porque o que
 * não aconteceu foi justamente o webhook do Asaas avisar. A pessoa ficava
 * olhando um pedido de pagamento que já tinha pago, e o poll rodava para sempre
 * confirmando a mesma coisa errada.
 *
 * Agora a tela pergunta AO ASAAS, não ao nosso banco. Se o dinheiro entrou, a
 * conta é liberada na hora, pela mesma RPC que o webhook usa.
 *
 * DUAS PORTAS, UMA LÓGICA:
 *
 *   com JWT do usuário .... confere a assinatura de quem chamou, e só ela. A
 *                           RLS é quem garante isso — a função não recebe nem
 *                           aceita um id de assinatura de fora.
 *   com a chave de serviço  varredura: confere TODAS as assinaturas paradas
 *                           esperando pagamento. É o que faz o conserto
 *                           acontecer sem ninguém abrir tela nenhuma, e é o que
 *                           tira o acesso da dependência exclusiva do webhook.
 *
 * A varredura é chamada pelo `pg_cron` (migração 0057).
 *
 * SECRETS: ASAAS_API_KEY, ASAAS_AMBIENTE, SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { AVISO_JA_PAGO, enviarAcesso, procurarPagamento } from '../_shared/reconciliar.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const erro = (mensagem: string, status: number) => responder({ error: mensagem }, status);

/** Comparação de tempo constante: não vaza a chave por diferença de tempo. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/** Estados de assinatura em que ainda se espera dinheiro entrar. */
const ESPERANDO = ['pendente_pagamento', 'carencia', 'modo_limitado'];

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

/**
 * Libera uma assinatura se o Asaas disser que ela foi paga.
 *
 * Devolve `true` quando liberou. O e-mail de primeiro acesso sai só na primeira
 * confirmação — nunca nas mensalidades seguintes.
 */
async function conferir(
  servidor: ReturnType<typeof createClient>,
  chave: string,
  assinaturaId: string,
  empresaId: string,
): Promise<boolean> {
  const achado = await procurarPagamento(servidor as any, chave, assinaturaId);
  if (achado.tipo !== 'pago') return false;

  if (achado.primeiraConfirmacao) {
    // Pela RPC, e não lendo `empresa_usuarios`: a chave de serviço não tem
    // SELECT nessa tabela, de propósito (migração 0030).
    const { data: email } = await servidor.rpc('contratacao_email_do_gestor', {
      p_empresa_id: empresaId,
    });
    if (email) await enviarAcesso(email as unknown as string);
  }

  return true;
}

/**
 * Varredura: conserta sozinha o que o webhook deixou passar.
 *
 * Esta é a parte que não depende de ninguém abrir tela nenhuma. Um cliente que
 * paga de madrugada, fecha tudo e só volta no dia seguinte já encontra a conta
 * liberada — e o e-mail com o link da senha esperando por ele.
 *
 * Uma falha numa assinatura não derruba as outras: cada uma é conferida no seu
 * próprio try.
 */
async function varrer(chave: string): Promise<Response> {
  const servidor = admin();

  const { data: assinaturas, error } = await servidor
    .from('assinaturas')
    .select('id, empresa_id')
    .in('status', ESPERANDO)
    .limit(200);

  if (error) {
    console.error('conferir-pagamento: falha ao listar assinaturas', error);
    return erro('Não foi possível varrer as assinaturas.', 500);
  }

  let liberadas = 0;
  let falhas = 0;

  for (const assinatura of (assinaturas ?? []) as { id: string; empresa_id: string }[]) {
    try {
      if (await conferir(servidor, chave, assinatura.id, assinatura.empresa_id)) {
        liberadas += 1;
        console.log('conferir-pagamento: liberada pela varredura', assinatura.id);
      }
    } catch (e) {
      falhas += 1;
      console.error('conferir-pagamento: falha ao conferir', assinatura.id, e);
    }
  }

  return responder({ conferidas: assinaturas?.length ?? 0, liberadas, falhas });
}

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requisicao.method !== 'POST') return erro('Método não suportado.', 405);

  const autorizacao = requisicao.headers.get('Authorization') ?? '';
  if (!autorizacao) return erro('Autenticação necessária.', 401);

  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) {
    return erro('O meio de pagamento não está configurado no servidor.', 503);
  }

  // ------------------------------------------------------------- varredura
  const chaveDeServico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (chaveDeServico && iguais(autorizacao, `Bearer ${chaveDeServico}`)) {
    return await varrer(chave);
  }

  // ------------------------------------------------------ um usuário só
  // Cliente com o JWT de quem chamou: a RLS garante que ele enxerga apenas a
  // própria assinatura. É isto que torna desnecessário — e impossível —
  // receber um id de assinatura pelo corpo do pedido.
  const doUsuario = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autorizacao } } },
  );

  const { data: assinaturas, error } = await doUsuario
    .from('assinaturas')
    .select('id, empresa_id, status')
    .neq('status', 'cancelada')
    .limit(1);

  if (error) return erro(error.message, 400);

  const assinatura = assinaturas?.[0];
  if (!assinatura) return erro('Nenhuma assinatura encontrada para esta conta.', 404);

  // Já liberada: nada a conferir, e dizer isso é melhor do que gastar uma
  // chamada ao Asaas para descobrir o que o banco já sabia.
  if (!ESPERANDO.includes(assinatura.status)) {
    return responder({ liberado: true, ja_estava: true });
  }

  try {
    // A GRAVAÇÃO É COM A CHAVE DE SERVIÇO, e não com a do usuário: `assinaturas`
    // e `cobrancas` não têm escrita pelo cliente, de propósito (Seção 6.4). O
    // usuário diz "confere para mim"; quem decide e escreve é o servidor.
    const liberado = await conferir(admin(), chave, assinatura.id, assinatura.empresa_id);

    return responder(
      liberado
        ? { liberado: true, mensagem: AVISO_JA_PAGO }
        : { liberado: false },
    );
  } catch (e) {
    console.error('conferir-pagamento: falha ao conferir', assinatura.id, e);
    return erro(
      'Não conseguimos conferir seu pagamento agora. Tente de novo em instantes.',
      502,
    );
  }
});
