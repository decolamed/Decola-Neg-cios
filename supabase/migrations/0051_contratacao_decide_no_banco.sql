-- =============================================================================
-- 0051 — A contratação passa a DECIDIR no banco, não na Edge Function.
--
-- O DEFEITO, MEDIDO. Nenhuma contratação jamais funcionou — nem pelo site, nem
-- pelo aplicativo. Nos logs de 08/09, toda chamada da função `contratar` morre
-- no primeiro passo:
--
--   GET | 403 | /rest/v1/planos?select=id,nome,valor_mensal&slug=eq.decola-pro
--             | Deno/2.1.4 (SupabaseEdgeRuntime/1.74.3)
--
-- 403, e não 401: a chave de serviço é válida: o que falta é PRIVILÉGIO. O
-- cliente anônimo lê `planos` sem problema (é ele quem monta a tela de planos);
-- o `service_role` não lê.
--
-- E ISSO ESTÁ CERTO. A migração 0030 tirou do `service_role` tudo que ele não
-- precisava, e escreveu, em letras: "o que continua negado ao service_role, de
-- propósito: planos, empresas — só pelas RPCs administrativas; empresa_usuarios
-- — só pelas RPCs de convite e papéis".
--
-- Quem errou foi a 0049: ela criou a `contratar` lendo `planos`,
-- `empresa_usuarios` e `empresas` DIRETO com a chave de serviço, atravessando
-- justamente a fronteira que a 0030 tinha desenhado. O banco recusou, como
-- devia. O sintoma que chegou ao cliente foi "Este plano não está mais
-- disponível" — uma frase que descreve o plano, quando o problema era a
-- permissão de quem perguntou.
--
-- A CORREÇÃO NÃO É ABRIR AS TABELAS. Seria desfazer uma decisão de segurança
-- deliberada para acomodar código que não devia estar consultando dali. É a
-- decisão que muda de lugar: quem responde "o que fazer com este e-mail e este
-- plano" passa a ser o banco, numa função `security definer` — que é onde este
-- produto já manda as regras críticas morarem. A Edge Function volta a fazer só
-- o que só ela pode: falar com o Auth e com o Asaas.
--
-- Nenhum privilégio novo de tabela é concedido a ninguém neste arquivo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A pergunta inteira, respondida de uma vez
--
-- Uma chamada só, e não quatro consultas soltas: o estado é lido numa
-- fotografia consistente, e a Edge Function não fica costurando pedaços que
-- podem mudar entre um SELECT e outro.
--
-- Os quatro desfechos são os mesmos que a `contratar` já tratava — a diferença
-- é que agora quem os decide é o banco:
--
--   plano_indisponivel .... o slug não existe ou o plano foi desativado
--   email_novo ............ ninguém com este e-mail; criar a conta
--   conta_orfa ............ existe usuário, nenhuma empresa. Reaproveitar
--   aguardando_pagamento .. tem empresa e não pagou. Devolver ao pagamento
--   conta_ativa ........... tem empresa em uso. Recusar, mandando entrar
-- -----------------------------------------------------------------------------
create or replace function public.contratacao_situacao(
  p_email      text,
  p_plano_slug text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plano      public.planos%rowtype;
  v_usuario_id uuid;
  v_empresa_id uuid;
  v_assinatura record;
  v_plano_json jsonb;
begin
  select * into v_plano
    from public.planos
   where slug = btrim(lower(coalesce(p_plano_slug, '')))
     and ativo;

  if not found then
    return jsonb_build_object('situacao', 'plano_indisponivel');
  end if;

  v_plano_json := jsonb_build_object(
    'id', v_plano.id, 'nome', v_plano.nome, 'valor', v_plano.valor_mensal
  );

  select id into v_usuario_id
    from public.usuarios
   where email = btrim(lower(coalesce(p_email, '')));

  if v_usuario_id is null then
    return jsonb_build_object('situacao', 'email_novo', 'plano', v_plano_json);
  end if;

  -- `limit 1` e não single: quem foi convidado para mais de uma empresa tem
  -- mais de um vínculo, e cair aqui devolveria a pessoa ao beco sem saída.
  select eu.empresa_id into v_empresa_id
    from public.empresa_usuarios eu
   where eu.usuario_id = v_usuario_id
     and eu.status <> 'removido'
   limit 1;

  if v_empresa_id is null then
    return jsonb_build_object(
      'situacao', 'conta_orfa', 'usuario_id', v_usuario_id, 'plano', v_plano_json
    );
  end if;

  select a.id, a.status, a.valor_contratado, a.asaas_customer_id, e.nome as empresa_nome
    into v_assinatura
    from public.assinaturas a
    join public.empresas e on e.id = a.empresa_id
   where a.empresa_id = v_empresa_id
     and a.status <> 'cancelada'
   order by a.criado_em desc
   limit 1;

  if found and v_assinatura.status = 'pendente_pagamento' then
    return jsonb_build_object(
      'situacao', 'aguardando_pagamento',
      'usuario_id', v_usuario_id,
      'assinatura', jsonb_build_object(
        'id',                v_assinatura.id,
        'valor_contratado',  v_assinatura.valor_contratado,
        'asaas_customer_id', v_assinatura.asaas_customer_id,
        'empresa_nome',      v_assinatura.empresa_nome
      )
    );
  end if;

  return jsonb_build_object('situacao', 'conta_ativa');
end;
$$;

-- Só o backend pergunta. Aberta ao cliente, esta função diria quais e-mails
-- têm conta — exatamente o que o resto do produto evita dizer.
revoke all on function public.contratacao_situacao(text, text) from public;
grant execute on function public.contratacao_situacao(text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 2. A linha em `usuarios` deixa de ser problema da Edge Function
--
-- Ela nasce de um gatilho sobre `auth.users`. Quando o gatilho ainda não rodou,
-- a criação da empresa recusaria por não achar o responsável — e a `contratar`
-- resolvia isso escrevendo em `public.usuarios` com a chave de serviço, que
-- também não tem esse privilégio (só SELECT, pela 0030).
--
-- Quem já roda como dono do banco aqui dentro é esta função. Garantir a linha é
-- trabalho dela, não de quem chama.
-- -----------------------------------------------------------------------------
create or replace function public.contratacao_criar_empresa(
  p_usuario_id   uuid,
  p_nome_empresa text,
  p_plano_id     uuid,
  p_nome_usuario text,
  p_email        text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plano      public.planos%rowtype;
  v_empresa    uuid;
  v_assinatura uuid;
begin
  if p_usuario_id is null then
    raise exception 'Responsável não informado.' using errcode = '22023';
  end if;

  if coalesce(btrim(p_nome_empresa), '') = '' then
    raise exception 'Informe o nome do seu negócio.' using errcode = '22023';
  end if;

  -- O gatilho de `auth.users` pode não ter rodado ainda. Sem esta linha, o
  -- INSERT do vínculo mais abaixo não encontra o responsável e a contratação
  -- morre com uma mensagem que não explica nada.
  if p_email is not null and btrim(p_email) <> '' then
    insert into public.usuarios (id, nome, email)
    values (p_usuario_id, nullif(btrim(p_nome_usuario), ''), btrim(lower(p_email)))
    on conflict (id) do update
      set nome  = coalesce(nullif(btrim(p_nome_usuario), ''), public.usuarios.nome),
          email = excluded.email;
  end if;

  if exists (
    select 1 from public.empresa_usuarios
     where usuario_id = p_usuario_id and status <> 'removido'
  ) then
    raise exception 'Este e-mail já está vinculado a uma empresa.'
      using errcode = '23505';
  end if;

  if exists (select 1 from public.administradores_plataforma where id = p_usuario_id) then
    raise exception 'Esta conta é de administrador da plataforma.'
      using errcode = '22023';
  end if;

  select * into v_plano from public.planos where id = p_plano_id;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = '23503';
  end if;
  if not v_plano.ativo then
    raise exception 'Este plano não está disponível para novas contratações.'
      using errcode = '22023';
  end if;

  insert into public.empresas (nome)
  values (btrim(p_nome_empresa))
  returning id into v_empresa;

  insert into public.empresa_usuarios (
    empresa_id, usuario_id, nome_convite, email_convite,
    papel, permissoes, status, aceito_em
  )
  select
    v_empresa, p_usuario_id,
    coalesce(nullif(btrim(p_nome_usuario), ''), u.nome),
    u.email, 'gestor_principal', app.permissoes_gestor(), 'ativo', now()
  from public.usuarios u
  where u.id = p_usuario_id;

  if not found then
    raise exception 'Não foi possível identificar o responsável pela conta.'
      using errcode = '23503';
  end if;

  insert into public.assinaturas (
    empresa_id, plano_id, valor_contratado, status
  )
  values (v_empresa, v_plano.id, v_plano.valor_mensal, 'pendente_pagamento')
  returning id into v_assinatura;

  update public.usuarios
     set nome = coalesce(nullif(btrim(p_nome_usuario), ''), nome),
         aceitou_termos_em = coalesce(aceitou_termos_em, now())
   where id = p_usuario_id;

  perform app.registrar_log(
    v_empresa, 'empresa.criada', 'empresa', v_empresa, null,
    jsonb_build_object('nome', btrim(p_nome_empresa), 'plano_id', v_plano.id,
                       'origem', 'contratacao_web')
  );

  return jsonb_build_object(
    'empresa_id',    v_empresa,
    'assinatura_id', v_assinatura,
    'valor',         v_plano.valor_mensal,
    'plano_nome',    v_plano.nome
  );
end;
$$;

revoke all on function
  public.contratacao_criar_empresa(uuid, text, uuid, text, text) from public;
grant execute on function
  public.contratacao_criar_empresa(uuid, text, uuid, text, text) to service_role;

-- A versão de quatro argumentos sai de cena: mantê-la deixaria duas funções com
-- o mesmo nome e comportamentos diferentes, e a chamada erraria em silêncio.
drop function if exists public.contratacao_criar_empresa(uuid, text, uuid, text);
