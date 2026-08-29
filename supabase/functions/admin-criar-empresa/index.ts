/**
 * Ativação manual de conta — Seções 6.9 e 7.15 B.
 *
 * "cria `empresa`, cria o usuário responsável, cria `empresa_usuarios` com
 *  `papel = gestor_principal`, cria `assinatura` com `ativada_manualmente =
 *  true`... não passa pelo fluxo de pagamento Asaas."
 *
 * A parte transacional é da RPC `admin_criar_empresa`. Esta função existe por
 * um motivo só: criar a conta no Supabase Auth quando o e-mail ainda não
 * existe, o que exige a Admin API e, portanto, a service key — que nunca pode
 * viver no painel.
 *
 * Os três desfechos da Seção 7.15 B, decididos AQUI:
 *   e-mail inexistente ............ cria a conta e envia link para definir senha
 *   e-mail órfão (sem empresa) .... reaproveita a conta existente
 *   e-mail já vinculado ........... recusado pela RPC, que é quem manda
 *
 * A autorização é do banco: a RPC roda com o JWT de quem chamou e levanta
 * exceção se não for administrador da plataforma. Esta função não decide isso.
 *
 * SECRETS: SUPABASE_SERVICE_ROLE_KEY (padrão do projeto), URL_PAINEL_BASE.
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

function erro(mensagem: string, status: number): Response {
  return responder({ error: mensagem }, status);
}

type Corpo = {
  nome_empresa?: string;
  responsavel_nome?: string;
  responsavel_email?: string;
  plano_id?: string;
  status?: 'ativa' | 'suspensa' | 'inativa';
};

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requisicao.method !== 'POST') return erro('Método não suportado.', 405);

  const autorizacao = requisicao.headers.get('Authorization');
  if (!autorizacao) return erro('Autenticação necessária.', 401);

  let corpo: Corpo;
  try {
    corpo = await requisicao.json();
  } catch {
    return erro('Corpo inválido.', 400);
  }

  const nomeEmpresa = corpo.nome_empresa?.trim() ?? '';
  const nomeResponsavel = corpo.responsavel_nome?.trim() ?? '';
  const email = corpo.responsavel_email?.trim().toLowerCase() ?? '';
  const planoId = corpo.plano_id ?? '';

  if (!nomeEmpresa) return erro('Informe o nome da empresa.', 400);
  if (!nomeResponsavel) return erro('Informe o nome do responsável.', 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return erro('Informe um e-mail válido.', 400);
  if (!planoId) return erro('Escolha um plano.', 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Cliente com o JWT de quem chamou: é ele que a RPC vai avaliar como
  // administrador da plataforma (ou recusar).
  const chamador = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autorizacao } } },
  );

  // Recusa cedo quem não é administrador, para não criar conta de Auth à toa.
  // A palavra final continua sendo da RPC.
  const { data: { user: quemChamou } } = await chamador.auth.getUser();
  if (!quemChamou) return erro('Sessão expirada. Entre novamente.', 401);

  const { data: ehAdmin, error: erroAdmin } = await admin
    .from('administradores_plataforma')
    .select('id')
    .eq('id', quemChamou.id)
    .maybeSingle();

  // Falha de infraestrutura não é resposta sobre permissão. Descartar este
  // erro fazia um privilégio faltando no banco chegar ao usuário como "você
  // não é administrador" — mensagem que manda investigar o lugar errado.
  if (erroAdmin) {
    console.error('admin-criar-empresa: consulta de administrador falhou', erroAdmin);
    return erro(
      `Não foi possível verificar suas permissões: ${erroAdmin.message}`,
      500,
    );
  }

  if (!ehAdmin) return erro('Esta ação é exclusiva do administrador da plataforma.', 403);

  // 1. Resolve a conta do responsável.
  const { data: existente, error: erroBusca } = await admin
    .from('usuarios')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (erroBusca) return erro('Não foi possível verificar o e-mail informado.', 500);

  let usuarioId = existente?.id as string | undefined;
  let contaCriada = false;

  if (!usuarioId) {
    // Senha aleatória: o responsável define a dele pelo link de recuperação.
    // Sem isso a conta nasceria com uma senha conhecida por quem a criou.
    const senha = crypto.randomUUID() + crypto.randomUUID();

    const { data: criado, error: erroCriacao } = await admin.auth.admin.createUser({
      email,
      password: senha,
      // Seção 5.5 — a verificação de e-mail não é obrigatória para usar o app.
      email_confirm: true,
      user_metadata: { nome: nomeResponsavel },
    });

    if (erroCriacao || !criado.user) {
      return erro(erroCriacao?.message ?? 'Não foi possível criar a conta do responsável.', 400);
    }

    usuarioId = criado.user.id;
    contaCriada = true;
  }

  // 2. Parte transacional — empresa, vínculo e assinatura, com a autorização
  //    revalidada no banco sob a identidade de quem chamou.
  const { data, error } = await chamador.rpc('admin_criar_empresa', {
    p_usuario_id: usuarioId,
    p_nome_empresa: nomeEmpresa,
    p_plano_id: planoId,
    p_status: corpo.status ?? 'ativa',
  });

  if (error) {
    // A conta de Auth recém-criada não serve para mais nada se a empresa não
    // nasceu — remover evita deixar um e-mail "ocupado" por engano.
    if (contaCriada && usuarioId) {
      await admin.auth.admin.deleteUser(usuarioId).catch(() => undefined);
    }
    return erro(error.message, 400);
  }

  // 3. Link para o responsável definir a senha. Best-effort: a empresa já
  //    existe, e o administrador pode reenviar pelo painel do Supabase.
  let convite_enviado = false;
  if (contaCriada) {
    const { error: erroLink } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: Deno.env.get('URL_PAINEL_BASE') ?? undefined,
    });
    convite_enviado = !erroLink;
  }

  return responder({ ...(data as Record<string, unknown>), conta_criada: contaCriada, convite_enviado });
});
