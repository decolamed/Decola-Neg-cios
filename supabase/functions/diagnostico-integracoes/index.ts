/**
 * Diagnóstico das integrações — o que o painel mostra em "Integrações".
 *
 * A pergunta que esta função responde é uma só: a integração RESPONDE, agora?
 * Não "existe código para ela", não "o secret está preenchido" — responde.
 * Por isso cada verificação faz uma chamada real ao serviço e reporta o que
 * voltou, inclusive quando o que voltou foi uma recusa.
 *
 * Vive numa Edge Function porque as chaves das integrações moram aqui: chave
 * do Asaas e do Resend nunca podem descer para o navegador do painel.
 *
 * AUTORIZAÇÃO. É do banco, como em `admin-criar-empresa`: a função chama
 * `app.eh_admin_plataforma()` com o JWT de quem pediu, através de uma RPC que
 * roda como o chamador. Quem não for administrador da plataforma não passa —
 * e essa decisão não é tomada aqui.
 *
 * O que esta função NUNCA devolve: o valor de um secret. Só se ele existe, e
 * o que o serviço respondeu quando usado.
 *
 * SECRETS lidos (todos opcionais — ausência é resultado, não erro):
 *   ASAAS_API_KEY, ASAAS_AMBIENTE, ASAAS_WEBHOOK_TOKEN,
 *   RESEND_API_KEY, EMAIL_REMETENTE, URL_SITE
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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

/**
 * `ok`      — respondeu e está utilizável
 * `atencao` — respondeu, mas há algo a resolver antes de contar com ela
 * `falha`   — não respondeu, ou recusou as credenciais
 * `ausente` — não configurada; nada a testar
 */
type Situacao = 'ok' | 'atencao' | 'falha' | 'ausente';

type Verificacao = {
  chave: string;
  nome: string;
  situacao: Situacao;
  resumo: string;
  /** O que fazer, quando há o que fazer. */
  proximoPasso?: string;
  detalhes?: Record<string, string | boolean | number>;
};

const TEMPO_LIMITE = 10_000;

/** Uma integração fora do ar não pode segurar o diagnóstico das outras. */
async function buscarComPrazo(url: string, init: RequestInit): Promise<Response> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE);
  try {
    return await fetch(url, { ...init, signal: controle.signal });
  } finally {
    clearTimeout(relogio);
  }
}

// -----------------------------------------------------------------------------
// Asaas
// -----------------------------------------------------------------------------
async function verificarAsaas(): Promise<Verificacao> {
  const chave = Deno.env.get('ASAAS_API_KEY');
  const ambiente = Deno.env.get('ASAAS_AMBIENTE') ?? 'sandbox';
  const producao = ambiente === 'producao';

  if (!chave) {
    return {
      chave: 'asaas',
      nome: 'Asaas (pagamentos)',
      situacao: 'ausente',
      resumo: 'A chave da API do Asaas ainda não foi configurada.',
      proximoPasso:
        'No Supabase, em Edge Functions → Secrets, cadastre ASAAS_API_KEY e ASAAS_AMBIENTE ' +
        '("sandbox" para testes, "producao" para cobrar de verdade).',
    };
  }

  const base = producao ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';

  try {
    // `myAccount` é a chamada mais barata que prova que a chave é aceita: não
    // cria nada, não cobra ninguém, e devolve de quem é a conta.
    const resposta = await buscarComPrazo(`${base}/myAccount`, {
      headers: { access_token: chave, 'Content-Type': 'application/json' },
    });

    if (resposta.status === 401) {
      return {
        chave: 'asaas',
        nome: 'Asaas (pagamentos)',
        situacao: 'falha',
        resumo: `O Asaas recusou a chave no ambiente de ${producao ? 'produção' : 'testes'}.`,
        proximoPasso:
          'Confira se a chave é do mesmo ambiente indicado em ASAAS_AMBIENTE — chave de ' +
          'sandbox não funciona em produção, e vice-versa.',
        detalhes: { ambiente, http: resposta.status },
      };
    }

    if (!resposta.ok) {
      return {
        chave: 'asaas',
        nome: 'Asaas (pagamentos)',
        situacao: 'falha',
        resumo: `O Asaas respondeu com erro ${resposta.status}.`,
        detalhes: { ambiente, http: resposta.status },
      };
    }

    const conta = (await resposta.json()) as Record<string, unknown>;
    const temWebhook = Boolean(Deno.env.get('ASAAS_WEBHOOK_TOKEN'));

    return {
      chave: 'asaas',
      nome: 'Asaas (pagamentos)',
      // Sem o token do webhook o pagamento é criado mas a confirmação nunca
      // chega de volta — a cobrança fica pendente para sempre. Isso não é "ok".
      situacao: temWebhook ? (producao ? 'ok' : 'atencao') : 'atencao',
      resumo: temWebhook
        ? producao
          ? 'Conectado em produção. Cobranças criadas aqui são reais.'
          : 'Conectado no ambiente de testes. Nenhuma cobrança criada aqui é real.'
        : 'A chave funciona, mas o token do webhook não está configurado.',
      proximoPasso: temWebhook
        ? producao
          ? undefined
          : 'Quando for cobrar de verdade, troque ASAAS_AMBIENTE para "producao" e use a ' +
            'chave de produção.'
        : 'Cadastre ASAAS_WEBHOOK_TOKEN no Supabase e registre a URL do webhook no painel do ' +
          'Asaas. Sem isso a confirmação do pagamento não volta e a cobrança fica pendente ' +
          'mesmo depois de paga.',
      detalhes: {
        ambiente,
        conta: String(conta.name ?? conta.email ?? 'conta sem nome'),
        webhook_configurado: temWebhook,
      },
    };
  } catch (e) {
    return {
      chave: 'asaas',
      nome: 'Asaas (pagamentos)',
      situacao: 'falha',
      resumo:
        e instanceof Error && e.name === 'AbortError'
          ? 'O Asaas não respondeu dentro do tempo limite.'
          : 'Não foi possível falar com o Asaas.',
      detalhes: { ambiente },
    };
  }
}

// -----------------------------------------------------------------------------
// Resend
// -----------------------------------------------------------------------------
async function verificarResend(): Promise<Verificacao> {
  const chave = Deno.env.get('RESEND_API_KEY');
  const remetente = Deno.env.get('EMAIL_REMETENTE') ?? '';

  if (!chave) {
    return {
      chave: 'resend',
      nome: 'Resend (e-mails)',
      situacao: 'ausente',
      resumo: 'A chave do Resend ainda não foi configurada.',
      proximoPasso:
        'No Supabase, em Edge Functions → Secrets, cadastre RESEND_API_KEY e EMAIL_REMETENTE. ' +
        'Sem eles, nenhum e-mail de acesso ou de convite é enviado.',
    };
  }

  try {
    const resposta = await buscarComPrazo('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${chave}` },
    });

    if (resposta.status === 401 || resposta.status === 403) {
      return {
        chave: 'resend',
        nome: 'Resend (e-mails)',
        situacao: 'falha',
        resumo: 'O Resend recusou a chave.',
        proximoPasso: 'Gere uma chave nova em resend.com/api-keys e atualize RESEND_API_KEY.',
        detalhes: { http: resposta.status },
      };
    }

    if (!resposta.ok) {
      return {
        chave: 'resend',
        nome: 'Resend (e-mails)',
        situacao: 'falha',
        resumo: `O Resend respondeu com erro ${resposta.status}.`,
        detalhes: { http: resposta.status },
      };
    }

    const corpo = (await resposta.json()) as { data?: Array<Record<string, unknown>> };
    const dominios = corpo.data ?? [];
    const verificados = dominios.filter((d) => d.status === 'verified');

    // O domínio do remetente precisa estar entre os verificados; senão o envio
    // é aceito pela API e some depois, que é o pior desfecho possível.
    const dominioDoRemetente = remetente.match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? '';
    const remetenteVerificado = verificados.some(
      (d) => String(d.name ?? '').toLowerCase() === dominioDoRemetente,
    );

    if (!remetente) {
      return {
        chave: 'resend',
        nome: 'Resend (e-mails)',
        situacao: 'atencao',
        resumo: 'A chave funciona, mas o remetente não foi definido.',
        proximoPasso:
          'Cadastre EMAIL_REMETENTE no formato "Decola Negócios <negocios@decola.pro>".',
        detalhes: { dominios_verificados: verificados.length },
      };
    }

    if (!remetenteVerificado) {
      return {
        chave: 'resend',
        nome: 'Resend (e-mails)',
        situacao: 'atencao',
        resumo: `O domínio "${dominioDoRemetente}" do remetente não está verificado no Resend.`,
        proximoPasso:
          'Em resend.com/domains, adicione o domínio e publique os registros DNS que ele pedir. ' +
          'Até lá os e-mails são recusados no envio.',
        detalhes: {
          remetente,
          dominios_verificados: verificados.map((d) => String(d.name)).join(', ') || 'nenhum',
        },
      };
    }

    return {
      chave: 'resend',
      nome: 'Resend (e-mails)',
      situacao: 'ok',
      resumo: `Conectado e enviando por ${dominioDoRemetente}.`,
      detalhes: { remetente, dominios_verificados: verificados.length },
    };
  } catch (e) {
    return {
      chave: 'resend',
      nome: 'Resend (e-mails)',
      situacao: 'falha',
      resumo:
        e instanceof Error && e.name === 'AbortError'
          ? 'O Resend não respondeu dentro do tempo limite.'
          : 'Não foi possível falar com o Resend.',
    };
  }
}

// -----------------------------------------------------------------------------
// Site público
// -----------------------------------------------------------------------------
async function verificarSite(): Promise<Verificacao> {
  const base = (Deno.env.get('URL_SITE') ?? 'https://decola.pro').replace(/\/$/, '');

  try {
    const resposta = await buscarComPrazo(base, { method: 'GET', redirect: 'follow' });

    if (!resposta.ok) {
      return {
        chave: 'site',
        nome: 'Site público (links de e-mail)',
        situacao: 'falha',
        resumo: `${base} respondeu ${resposta.status}.`,
        proximoPasso:
          'Os links de definir senha, de convite e da loja virtual apontam para este endereço. ' +
          'Confira a publicação do site e o domínio na Vercel.',
        detalhes: { url: base, http: resposta.status },
      };
    }

    return {
      chave: 'site',
      nome: 'Site público (links de e-mail)',
      situacao: 'ok',
      resumo: `${base} está no ar.`,
      detalhes: { url: base },
    };
  } catch {
    return {
      chave: 'site',
      nome: 'Site público (links de e-mail)',
      situacao: 'falha',
      resumo: `Não foi possível abrir ${base}.`,
      proximoPasso:
        'Enquanto o site não responder, os links enviados por e-mail não levam a lugar nenhum.',
      detalhes: { url: base },
    };
  }
}

// -----------------------------------------------------------------------------
// Storage das fotos
// -----------------------------------------------------------------------------
async function verificarStorage(servico: ReturnType<typeof createClient>): Promise<Verificacao> {
  try {
    const { data, error } = await servico.storage.getBucket('produtos');

    if (error || !data) {
      return {
        chave: 'storage',
        nome: 'Fotos dos produtos (Storage)',
        situacao: 'falha',
        resumo: 'O bucket "produtos" não foi encontrado.',
        proximoPasso: 'Aplique a migração 0038, que cria o bucket e as políticas de acesso.',
      };
    }

    if (!data.public) {
      return {
        chave: 'storage',
        nome: 'Fotos dos produtos (Storage)',
        situacao: 'atencao',
        resumo: 'O bucket existe, mas não é público.',
        proximoPasso:
          'A vitrine é aberta e carrega as fotos sem sessão. Com o bucket privado, os clientes ' +
          'veem espaços em branco no lugar das imagens.',
      };
    }

    return {
      chave: 'storage',
      nome: 'Fotos dos produtos (Storage)',
      situacao: 'ok',
      resumo: 'Bucket "produtos" pronto e público para leitura.',
      detalhes: {
        limite_por_arquivo: `${Math.round((data.file_size_limit ?? 0) / 1024 / 1024)} MB`,
      },
    };
  } catch {
    return {
      chave: 'storage',
      nome: 'Fotos dos produtos (Storage)',
      situacao: 'falha',
      resumo: 'Não foi possível consultar o Storage.',
    };
  }
}

// -----------------------------------------------------------------------------
Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requisicao.method !== 'POST') return responder({ error: 'Método não suportado.' }, 405);

  const autorizacao = requisicao.headers.get('Authorization');
  if (!autorizacao) return responder({ error: 'Autenticação necessária.' }, 401);

  // A permissão é do banco. `admin_confirmar_acesso` roda com o JWT de quem
  // chamou e levanta exceção se não for administrador da plataforma.
  const chamador = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autorizacao } } },
  );

  const { error: erroDePermissao } = await chamador.rpc('admin_confirmar_acesso');
  if (erroDePermissao) {
    return responder({ error: 'Esta ação é exclusiva do administrador da plataforma.' }, 403);
  }

  const servico = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Em paralelo: são quatro serviços independentes e o painel espera por todos.
  const verificacoes = await Promise.all([
    verificarAsaas(),
    verificarResend(),
    verificarSite(),
    verificarStorage(servico),
  ]);

  return responder({
    verificado_em: new Date().toISOString(),
    verificacoes,
  });
});
