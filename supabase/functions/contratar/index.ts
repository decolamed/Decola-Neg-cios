/**
 * Contratação — do e-mail digitado até o link de pagamento.
 *
 * ESTA É A ÚNICA PORTA DE CONTRATAÇÃO. O site entra por aqui, e o aplicativo
 * também. Ele tinha a sua própria, feita do aparelho, com o defeito descrito
 * abaixo — o site foi consertado, o aplicativo não, e o defeito continuou
 * pegando clientes. Duas portas para a mesma coisa é como uma delas apodrece
 * sem ninguém notar.
 *
 * POR QUE ISTO EXISTE. O cadastro fazia, do navegador: `signUp` → RPC da
 * empresa → checkout, e os dois últimos passos dependiam da SESSÃO que o
 * `signUp` devolve. Com "Confirm email" ligado no Supabase Auth, `signUp` NÃO
 * devolve sessão — devolve um usuário e manda um e-mail. Os passos seguintes
 * nunca aconteciam, e o cliente ficava preso dos dois lados: tentar de novo
 * dizia "este e-mail já tem conta", e entrar não funcionava porque a senha da
 * contratação é descartável de propósito.
 *
 * QUEM DECIDE É O BANCO (migração 0051). Esta função não consulta `planos`,
 * `empresas` nem `empresa_usuarios`: ela PERGUNTA, numa chamada só, o que fazer
 * com este e-mail e este plano. Não é elegância — é obrigação. A migração 0030
 * negou ao `service_role`, de propósito, o acesso a essas tabelas ("só pelas
 * RPCs administrativas"), e a versão anterior desta função as lia direto com a
 * chave de serviço. O banco recusava com 403 e o cliente lia "Este plano não
 * está mais disponível". Nenhuma contratação funcionou enquanto isso durou.
 *
 * Aqui ficou só o que só esta função pode fazer: falar com o Auth (criar a
 * conta) e com o Asaas (abrir a cobrança).
 *
 * NINGUÉM PODE FICAR SEM CAMINHO. É a regra que organiza os desfechos de um
 * e-mail que já existe, porque cada um deles já prendeu alguém:
 *
 *   conta_orfa ............... tentativa que parou no meio. Reaproveita a conta
 *                              e segue a contratação.
 *   aguardando_pagamento ..... contratou e fechou o checkout. NÃO consegue
 *                              entrar (a senha só nasce depois da confirmação)
 *                              nem cadastrar de novo. Volta para o MESMO
 *                              pagamento, reabrindo a cobrança que já existe.
 *   conta_ativa .............. aí sim recusa, com a instrução certa: entre, não
 *                              cadastre de novo.
 *
 * SECRETS: SUPABASE_SERVICE_ROLE_KEY, ASAAS_API_KEY, ASAAS_AMBIENTE.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// Onde o site está publicado vive em UM arquivo, compartilhado. Ver a nota
// em `_shared/enderecos.ts` sobre por que não é secret.
import { URL_DO_SITE } from '../_shared/enderecos.ts';
import { digitosDoDocumento, documentoValido } from '../_shared/documento.ts';

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

/** O que `public.contratacao_situacao` devolve. */
type Situacao = {
  situacao:
    | 'plano_indisponivel'
    | 'email_novo'
    | 'conta_orfa'
    | 'aguardando_pagamento'
    | 'conta_ativa';
  usuario_id?: string;
  plano?: { id: string; nome: string; valor: number };
  assinatura?: {
    id: string;
    valor_contratado: number;
    asaas_customer_id: string | null;
    empresa_nome: string | null;
    empresa_documento: string | null;
  };
};

/** Abre a cobrança do primeiro ciclo e registra o que o webhook vai reconciliar. */
async function abrirCobranca(
  admin: ReturnType<typeof createClient>,
  chave: string,
  dados: {
    assinaturaId: string;
    clienteId: string;
    valor: number;
    descricao: string;
  },
): Promise<{ url_checkout: string; valor: number; vencimento: string }> {
  const cobranca = await chamarAsaas('/payments', chave, {
    customer: dados.clienteId,
    // UNDEFINED deixa o pagador escolher Pix, boleto ou cartão no checkout.
    billingType: 'UNDEFINED',
    value: Number(dados.valor),
    dueDate: vencimentoEmTresDias(),
    description: dados.descricao,
    externalReference: dados.assinaturaId,
    callback: { successUrl: `${URL_DO_SITE}/pronto`, autoRedirect: true },
  });

  await admin
    .from('assinaturas')
    .update({ asaas_customer_id: dados.clienteId, proximo_vencimento: cobranca.dueDate })
    .eq('id', dados.assinaturaId);

  await admin.from('cobrancas').upsert(
    {
      assinatura_id: dados.assinaturaId,
      asaas_payment_id: cobranca.id,
      valor: Number(cobranca.value),
      // O pagador ainda não escolheu: registramos como pix e o webhook corrige
      // com a forma efetivamente usada.
      forma_pagamento: 'pix',
      status: 'pendente',
      vencimento: cobranca.dueDate,
    },
    { onConflict: 'asaas_payment_id' },
  );

  return {
    url_checkout: cobranca.invoiceUrl,
    valor: Number(cobranca.value),
    vencimento: cobranca.dueDate,
  };
}

/**
 * Quem já contratou mas não pagou volta para o MESMO pagamento.
 *
 * Reabrir a cobrança que já existe, em vez de criar outra, evita duas cobranças
 * abertas para a mesma assinatura — o cliente pagaria uma e a outra ficaria
 * vencendo, e a conciliação pelo webhook viraria adivinhação. Só quando a
 * antiga não serve mais (paga, cancelada, sumida do Asaas) uma nova é aberta.
 */
async function retomarPagamento(
  admin: ReturnType<typeof createClient>,
  assinatura: NonNullable<Situacao['assinatura']>,
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
    const nomeDaEmpresa = assinatura.empresa_nome?.trim() || email;
    let clienteId = assinatura.asaas_customer_id;
    if (!clienteId) {
      // Sem cliente no Asaas quando a primeira tentativa morreu justamente ali.
      // O documento vem do cadastro da empresa: o Asaas recusa criar cobrança
      // sem CPF/CNPJ, e sem ele a retomada falharia com a mesma mensagem que a
      // migração 0053 existe para eliminar.
      const cliente = await chamarAsaas('/customers', chave, {
        name: nomeDaEmpresa,
        email,
        cpfCnpj: assinatura.empresa_documento ?? undefined,
      });
      clienteId = cliente.id;
    }

    const aberta = await abrirCobranca(admin, chave, {
      assinaturaId: assinatura.id,
      clienteId,
      valor: assinatura.valor_contratado,
      descricao: `Assinatura ${nomeDaEmpresa} — Decola Negócios`,
    });

    return responder({ ...aberta, retomada: true });
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
    cpfCnpj?: string;
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

  // Só dígitos: é o formato que o Asaas espera e o que o banco grava.
  const documento = digitosDoDocumento(corpo.cpfCnpj ?? '');

  if (!nome) return erro('Informe seu nome completo.', 400);
  if (!EMAIL_VALIDO.test(email)) return erro('Informe um e-mail válido.', 400);
  if (!nomeEmpresa) return erro('Informe o nome do seu negócio.', 400);
  if (!planoSlug) return erro('Escolha um plano para continuar.', 400);

  // Conferido AQUI, e não só na tela: o pedido chega por HTTP e a tela não é
  // garantia de nada. Recusar antes evita criar conta e empresa para um
  // documento que o Asaas rejeitaria depois — deixando a pessoa cadastrada e
  // sem conseguir pagar, que é o beco que este fluxo já produziu uma vez.
  if (!documento) {
    return erro(
      'Informe o CPF ou CNPJ do responsável pela assinatura. Ele é exigido para emitir a ' +
        'cobrança.',
      400,
    );
  }
  if (!documentoValido(documento)) {
    return erro('O CPF ou CNPJ informado não é válido. Confira os números e tente de novo.', 400);
  }
  if (!corpo.aceitouTermos) {
    return erro('É necessário aceitar os Termos de Uso e a Política de Privacidade.', 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // ------------------------------------------------------- o que fazer aqui?
  const { data: resposta, error: erroSituacao } = await admin.rpc('contratacao_situacao', {
    p_email: email,
    p_plano_slug: planoSlug,
  });

  if (erroSituacao) {
    console.error('contratar: falha ao consultar a situação', erroSituacao);
    return erro('Não foi possível iniciar o cadastro agora. Tente novamente.', 500);
  }

  const situacao = resposta as unknown as Situacao;

  if (situacao.situacao === 'plano_indisponivel') {
    return erro('Este plano não está mais disponível. Escolha outro para continuar.', 404);
  }

  if (situacao.situacao === 'conta_ativa') {
    return erro(
      'Este e-mail já tem uma conta ativa. Entre pelo aplicativo — se não lembra a senha, ' +
        'use "Esqueci minha senha".',
      409,
    );
  }

  if (situacao.situacao === 'aguardando_pagamento' && situacao.assinatura) {
    return await retomarPagamento(admin, situacao.assinatura, email);
  }

  const plano = situacao.plano;
  if (!plano) {
    console.error('contratar: situação sem plano', situacao);
    return erro('Não foi possível iniciar o cadastro agora. Tente novamente.', 500);
  }

  // ----------------------------------------------------------------- conta
  let usuarioId = situacao.usuario_id;

  if (!usuarioId) {
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

  // --------------------------------------------------------------- empresa
  // O e-mail vai junto: a RPC garante a linha em `public.usuarios` quando o
  // gatilho de `auth.users` ainda não rodou. Esta função não escreve lá — nem
  // tem privilégio para isso, nem deveria.
  const { data: contratacao, error: erroEmpresa } = await admin.rpc(
    'contratacao_criar_empresa',
    {
      p_usuario_id: usuarioId,
      p_nome_empresa: nomeEmpresa,
      p_plano_id: plano.id,
      p_nome_usuario: nome,
      p_email: email,
      // Gravado na empresa: a renovação do mês seguinte é feita pelo
      // `asaas-checkout`, que lê o documento dali. Sem isso, a primeira
      // cobrança funcionaria e a segunda voltaria a falhar.
      p_documento: documento,
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
    // pessoa retoma pelo mesmo e-mail — e cai no caminho de retomada acima.
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
      // O Asaas recusa criar cobrança sem documento do pagador: "Para criar
      // esta cobrança é necessário preencher o CPF ou CNPJ do cliente".
      cpfCnpj: documento,
      externalReference: usuarioId,
    });

    const aberta = await abrirCobranca(admin, chave, {
      assinaturaId: dados.assinatura_id,
      clienteId: cliente.id,
      valor: dados.valor,
      descricao: `Assinatura ${plano.nome} — Decola Negócios`,
    });

    return responder(aberta);
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
