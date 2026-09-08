/**
 * Contratação — do e-mail digitado até o link de pagamento.
 *
 * ESTA É A ÚNICA PORTA DE CONTRATAÇÃO. O site entra por aqui, e o aplicativo
 * também. Ele tinha a sua própria, feita do aparelho, com exatamente o defeito
 * descrito abaixo — o site foi consertado, o aplicativo não, e o defeito
 * continuou pegando clientes por mais tempo do que precisava. Duas portas para
 * a mesma coisa é como uma delas apodrece sem ninguém notar.
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
 * NINGUÉM PODE FICAR SEM CAMINHO. É a regra que organiza os desfechos de um
 * e-mail que já existe, porque cada um deles já prendeu alguém:
 *
 *   sem empresa ............. tentativa que parou no meio. Reaproveita a conta
 *                             e segue a contratação.
 *   empresa sem pagamento ... contratou e fechou o checkout. NÃO consegue
 *                             entrar (a senha só nasce depois da confirmação)
 *                             nem cadastrar de novo. Volta para o MESMO
 *                             pagamento, reabrindo a cobrança que já existe.
 *   empresa em uso .......... aí sim recusa, com a instrução certa: entre, não
 *                             cadastre de novo.
 *
 * Recusar os dois primeiros era condenar a pessoa para sempre: com empresa
 * criada e nenhuma forma de pagá-la, o cadastro fica de pé e inútil.
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

/** Vencimento padrão de uma cobrança recém-aberta: 3 dias. */
function vencimentoEmTresDias(): string {
  const data = new Date();
  data.setDate(data.getDate() + 3);
  return data.toISOString().slice(0, 10);
}

/**
 * Quem já contratou mas não pagou volta para o MESMO pagamento.
 *
 * Reabrir a cobrança que já existe, em vez de criar outra, evita duas
 * cobranças abertas para a mesma assinatura — o cliente pagaria uma e a outra
 * ficaria vencendo, e a conciliação pelo webhook viraria adivinhação. Só
 * quando a antiga não serve mais (vencida, cancelada, sumida do Asaas) é que
 * uma nova é aberta.
 */
async function retomarPagamento(
  admin: ReturnType<typeof createClient>,
  assinatura: {
    id: string;
    valor_contratado: number;
    asaas_customer_id: string | null;
    empresas?: { nome: string } | null;
  },
  email: string,
): Promise<Response> {
  const chave = Deno.env.get('ASAAS_API_KEY');
  if (!chave) {
    return erro(
      'Sua conta já está criada, mas o meio de pagamento não está configurado no servidor. ' +
        'Fale com o suporte para concluir a contratação.',
      503,
    );
  }

  const { data: cobranca } = await admin
    .from('cobrancas')
    .select('asaas_payment_id')
    .eq('assinatura_id', assinatura.id)
    .eq('status', 'pendente')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  try {
    // 1. A cobrança que já existe ainda vale? Então é ela.
    if (cobranca?.asaas_payment_id) {
      try {
        const atual = await chamarAsaas(`/payments/${cobranca.asaas_payment_id}`, chave);
        if (atual?.invoiceUrl && (atual.status === 'PENDING' || atual.status === 'OVERDUE')) {
          return responder({
            url_checkout: atual.invoiceUrl,
            valor: Number(atual.value),
            vencimento: atual.dueDate,
            retomada: true,
          });
        }
      } catch {
        // Sumiu ou o Asaas recusou: segue e abre uma nova, abaixo.
      }
    }

    // 2. Não havia cobrança aproveitável. Abre outra para a MESMA assinatura.
    // Sem cliente no Asaas quando a primeira tentativa morreu justamente ali.
    const nomeDaEmpresa = assinatura.empresas?.nome?.trim() || email;
    let clienteId = assinatura.asaas_customer_id;
    if (!clienteId) {
      const cliente = await chamarAsaas('/customers', chave, { name: nomeDaEmpresa, email });
      clienteId = cliente.id;
    }

    const nova = await chamarAsaas('/payments', chave, {
      customer: clienteId,
      billingType: 'UNDEFINED',
      value: Number(assinatura.valor_contratado),
      dueDate: vencimentoEmTresDias(),
      description: `Assinatura ${nomeDaEmpresa} — Decola Negócios`,
      externalReference: assinatura.id,
      callback: { successUrl: `${URL_DO_SITE}/pronto`, autoRedirect: true },
    });

    await admin
      .from('assinaturas')
      .update({ asaas_customer_id: clienteId, proximo_vencimento: nova.dueDate })
      .eq('id', assinatura.id);

    await admin.from('cobrancas').upsert(
      {
        assinatura_id: assinatura.id,
        asaas_payment_id: nova.id,
        valor: Number(nova.value),
        forma_pagamento: 'pix',
        status: 'pendente',
        vencimento: nova.dueDate,
      },
      { onConflict: 'asaas_payment_id' },
    );

    return responder({
      url_checkout: nova.invoiceUrl,
      valor: Number(nova.value),
      vencimento: nova.dueDate,
      retomada: true,
    });
  } catch (e) {
    console.error('contratar: falha ao retomar pagamento', e);
    return erro(
      e instanceof Error
        ? `Sua conta já está criada, mas não foi possível reabrir o pagamento: ${e.message}`
        : 'Sua conta já está criada, mas não foi possível reabrir o pagamento.',
      502,
    );
  }
}

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
  // O e-mail já existe? Quatro desfechos, e só um deles é recusa (ver o
  // cabeçalho: sem empresa, empresa sem pagamento, empresa em uso, e-mail novo).
  const { data: perfil } = await admin
    .from('usuarios')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  let usuarioId = perfil?.id as string | undefined;

  if (usuarioId) {
    // `limit(1)` pela mesma razão de baixo: quem foi convidado para mais de
    // uma empresa tem mais de um vínculo, e `maybeSingle()` falharia aí.
    const { data: vinculos } = await admin
      .from('empresa_usuarios')
      .select('id, empresa_id')
      .eq('usuario_id', usuarioId)
      .neq('status', 'removido')
      .limit(1);

    const vinculo = vinculos?.[0];

    if (vinculo) {
      // Já existe empresa. Duas situações MUITO diferentes moram aqui, e
      // tratá-las igual criava um beco sem saída.
      // `limit(1)` e não `maybeSingle()`: nada no esquema impede duas
      // assinaturas não canceladas na mesma empresa, e ali `maybeSingle()`
      // falharia — reabrindo justamente o beco que este trecho existe para
      // fechar.
      const { data: assinaturas } = await admin
        .from('assinaturas')
        .select('id, status, valor_contratado, asaas_customer_id, empresas(nome)')
        .eq('empresa_id', vinculo.empresa_id)
        .neq('status', 'cancelada')
        .order('criado_em', { ascending: false })
        .limit(1);

      const assinatura = assinaturas?.[0];

      // Caso 1b: contratou e NÃO pagou. Esta pessoa não consegue entrar (a
      // senha só nasce depois da confirmação) nem cadastrar de novo — recusar
      // aqui a deixava sem nenhum caminho, com uma empresa criada e nenhuma
      // forma de pagá-la. Basta ter fechado a aba do checkout. O certo é
      // devolvê-la ao pagamento.
      if (assinatura?.status === 'pendente_pagamento') {
        return await retomarPagamento(admin, assinatura, email);
      }

      // Caso 1: conta completa e em uso. Não é para cadastrar de novo.
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

    const cobranca = await chamarAsaas('/payments', chave, {
      customer: cliente.id,
      // UNDEFINED deixa o pagador escolher Pix, boleto ou cartão no checkout.
      billingType: 'UNDEFINED',
      value: Number(dados.valor),
      dueDate: vencimentoEmTresDias(),
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
