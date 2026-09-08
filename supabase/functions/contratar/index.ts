/**
 * Contratação pelo site — do e-mail digitado até o link de pagamento.
 *
 * POR QUE ISTO EXISTE. O cadastro fazia, do navegador: `signUp` → RPC da
 * empresa → checkout, e os dois últimos passos dependiam da SESSÃO que o
 * `signUp` devolve. Com "Confirm email" ligado no Supabase Auth, `signUp` NÃO
 * devolve sessão — devolve um usuário e manda um e-mail. Os passos seguintes
 * nunca aconteciam, e o cliente ficava preso dos dois lados: tentar de novo
 * dizia "este e-mail já tem conta", e entrar não funcionava porque a senha da
 * contratação é descartável de propósito.
 *
 * Aqui nada depende de sessão. A chave de serviço cria a conta já confirmada,
 * cria a empresa e abre a cobrança — três passos, um pedido só, e o navegador
 * recebe só a URL do checkout.
 *
 * REAPROVEITAR CONTA ÓRFÃ É PARTE DO CONSERTO. Quem parou no meio do caminho
 * ficou com um usuário no Auth e nenhuma empresa. Recusar esse e-mail seria
 * condená-lo para sempre; aqui ele é reaproveitado e a contratação segue. Só
 * quem JÁ TEM empresa é recusado — e com a instrução certa: entre, não
 * cadastre de novo.
 *
 * SECRETS: SUPABASE_SERVICE_ROLE_KEY, ASAAS_API_KEY, ASAAS_AMBIENTE.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// Onde o site está publicado vive em UM arquivo, compartilhado. Ver a nota
// em `_shared/enderecos.ts` sobre por que não é secret.
import { URL_DO_SITE } from '../_shared/enderecos.ts';

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
    throw new Error(dados?.errors?.[0]?.description ?? 'Erro na comunicação com o Asaas.');
  }
  return dados;
}

/**
 * Senha que existe só para o Auth aceitar a conta — e que ninguém usa.
 *
 * O cliente não escolhe senha ao contratar: ele paga e SÓ ENTÃO recebe o link
 * para criar a dele. Gerada no servidor com o gerador criptográfico, usada uma
 * vez e descartada; não é devolvida na resposta nem registrada em log.
 */
function senhaDescartavel(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requisicao.method !== 'POST') return erro('Método não suportado.', 405);

  let corpo: {
    nome?: string;
    email?: string;
    nomeEmpresa?: string;
    planoSlug?: string;
    aceitouTermos?: boolean;
  };
  try {
    corpo = await requisicao.json();
  } catch {
    return erro('Requisição inválida.', 400);
  }

  const nome = corpo.nome?.trim() ?? '';
  const email = corpo.email?.trim().toLowerCase() ?? '';
  const nomeEmpresa = corpo.nomeEmpresa?.trim() ?? '';
  const planoSlug = corpo.planoSlug?.trim() ?? '';

  if (!nome) return erro('Informe seu nome completo.', 400);
  if (!EMAIL_VALIDO.test(email)) return erro('Informe um e-mail válido.', 400);
  if (!nomeEmpresa) return erro('Informe o nome do seu negócio.', 400);
  if (!planoSlug) return erro('Escolha um plano para continuar.', 400);
  if (!corpo.aceitouTermos) {
    return erro('É necessário aceitar os Termos de Uso e a Política de Privacidade.', 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // ---------------------------------------------------------------- plano
  const { data: plano } = await admin
    .from('planos')
    .select('id, nome, valor_mensal')
    .eq('slug', planoSlug)
    .eq('ativo', true)
    .maybeSingle();

  if (!plano) {
    return erro('Este plano não está mais disponível. Escolha outro para continuar.', 404);
  }

  // ----------------------------------------------------------------- conta
  //
  // O e-mail já existe? Três casos diferentes, e só um deles é erro.
  const { data: perfil } = await admin
    .from('usuarios')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  let usuarioId = perfil?.id as string | undefined;

  if (usuarioId) {
    const { data: vinculo } = await admin
      .from('empresa_usuarios')
      .select('id')
      .eq('usuario_id', usuarioId)
      .neq('status', 'removido')
      .maybeSingle();

    if (vinculo) {
      // Caso 1: conta completa. Não é para cadastrar de novo.
      return erro(
        'Este e-mail já tem uma conta ativa. Entre pelo aplicativo — se não lembra a senha, ' +
          'use "Esqueci minha senha".',
        409,
      );
    }
    // Caso 2: conta órfã, de uma tentativa que parou no meio. Reaproveita.
  } else {
    // Caso 3: e-mail novo.
    const { data: criado, error: erroCriacao } = await admin.auth.admin.createUser({
      email,
      password: senhaDescartavel(),
      // Confirmado na origem: o cliente não precisa clicar em e-mail nenhum
      // para contratar, e o acesso só existe depois do pagamento de qualquer
      // forma. É isto que tira a contratação das mãos de uma caixa marcada no
      // painel do Supabase.
      email_confirm: true,
      user_metadata: { nome },
    });

    if (erroCriacao || !criado?.user) {
      // O usuário pode existir no Auth sem linha em `usuarios` (cadastro
      // interrompido antes do gatilho). Procura antes de desistir.
      const { data: lista } = await admin.auth.admin.listUsers();
      const existente = lista?.users?.find((u) => u.email?.toLowerCase() === email);

      if (!existente) {
        console.error('contratar: falha ao criar usuário', erroCriacao);
        return erro('Não foi possível criar sua conta. Tente novamente.', 500);
      }
      usuarioId = existente.id;
    } else {
      usuarioId = criado.user.id;
    }
  }

  if (!usuarioId) return erro('Não foi possível criar sua conta. Tente novamente.', 500);

  // A linha em `public.usuarios` nasce de um gatilho sobre `auth.users`. Se ela
  // ainda não estiver lá, a RPC abaixo recusaria — então garantimos aqui.
  await admin.from('usuarios').upsert({ id: usuarioId, nome, email }, { onConflict: 'id' });

  // --------------------------------------------------------------- empresa
  const { data: contratacao, error: erroEmpresa } = await admin.rpc(
    'contratacao_criar_empresa',
    {
      p_usuario_id: usuarioId,
      p_nome_empresa: nomeEmpresa,
      p_plano_id: plano.id,
      p_nome_usuario: nome,
    },
  );

  if (erroEmpresa) {
    console.error('contratar: falha ao criar empresa', erroEmpresa);
    return erro(erroEmpresa.message ?? 'Não foi possível concluir o cadastro.', 400);
  }

  const dados = contratacao as unknown as { assinatura_id: string; valor: number };

  // -------------------------------------------------------------- cobrança
  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) {
    // A conta e a empresa JÁ existem e ficam pendentes de pagamento. Dizer
    // isso é melhor do que apagar tudo: o dono da plataforma liga o Asaas e a
    // pessoa retoma pelo mesmo e-mail.
    console.error('contratar: ASAAS_API_KEY ausente');
    return erro(
      'Sua conta foi criada, mas o meio de pagamento ainda não está configurado. ' +
        'Fale com o suporte para concluir a contratação.',
      503,
    );
  }

  try {
    const cliente = await chamarAsaas('/customers', chave, {
      name: nomeEmpresa,
      email,
      externalReference: usuarioId,
    });

    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + 3);

    const cobranca = await chamarAsaas('/payments', chave, {
      customer: cliente.id,
      // UNDEFINED deixa o pagador escolher Pix, boleto ou cartão no checkout.
      billingType: 'UNDEFINED',
      value: Number(dados.valor),
      dueDate: vencimento.toISOString().slice(0, 10),
      description: `Assinatura ${plano.nome} — Decola Negócios`,
      externalReference: dados.assinatura_id,
      callback: { successUrl: `${URL_DO_SITE}/pronto`, autoRedirect: true },
    });

    await admin
      .from('assinaturas')
      .update({ asaas_customer_id: cliente.id, proximo_vencimento: cobranca.dueDate })
      .eq('id', dados.assinatura_id);

    await admin.from('cobrancas').upsert(
      {
        assinatura_id: dados.assinatura_id,
        asaas_payment_id: cobranca.id,
        valor: Number(cobranca.value),
        forma_pagamento: 'pix',
        status: 'pendente',
        vencimento: cobranca.dueDate,
      },
      { onConflict: 'asaas_payment_id' },
    );

    return responder({
      url_checkout: cobranca.invoiceUrl,
      valor: Number(cobranca.value),
      vencimento: cobranca.dueDate,
    });
  } catch (e) {
    console.error('contratar: falha no Asaas', e);
    return erro(
      e instanceof Error
        ? `Sua conta foi criada, mas não foi possível abrir o pagamento: ${e.message}`
        : 'Sua conta foi criada, mas não foi possível abrir o pagamento.',
      502,
    );
  }
});
