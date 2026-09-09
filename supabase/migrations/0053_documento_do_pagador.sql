-- =============================================================================
-- 0053 — O documento do pagador entra na contratação.
--
-- O QUE O CLIENTE LEU NA TELA: "Sua conta foi criada, mas não foi possível
-- abrir o pagamento: Para criar esta cobrança é necessário preencher o CPF ou
-- CNPJ do cliente."
--
-- É o Asaas recusando, e com razão: cobrança no Brasil identifica o pagador. A
-- conta do Asaas está configurada para exigir CPF/CNPJ, e a contratação nunca
-- pediu esse dado — criava o cliente lá só com nome e e-mail.
--
-- A frase, note, veio inteira do gateway até a tela. Isso está certo: dizer "não
-- foi possível abrir o pagamento" e parar teria escondido a única informação
-- útil. O que faltava era não chegar nesse ponto.
--
-- ONDE O DOCUMENTO MORA. Em `empresas.cnpj`, que já existe e já é o campo que o
-- `asaas-checkout` envia como `cpfCnpj` nas cobranças seguintes. O nome da
-- coluna diz "cnpj" e ela guarda também CPF — quem contrata como pessoa física
-- é a maioria do público deste produto. Renomear a coluna tocaria em telas,
-- tipos e RPCs por uma questão de vocabulário; fica o registro de que o
-- conteúdo é "o documento do titular", CPF ou CNPJ.
--
-- POR QUE A CRIAÇÃO DA EMPRESA GRAVA ISSO. Se o documento ficasse só no Asaas,
-- a primeira cobrança funcionaria e a renovação (`asaas-checkout`, que lê
-- `empresas.cnpj`) voltaria a falhar pelo mesmo motivo, um mês depois — quando
-- ninguém mais lembrasse deste erro.
-- =============================================================================

create or replace function public.contratacao_criar_empresa(
  p_usuario_id   uuid,
  p_nome_empresa text,
  p_plano_id     uuid,
  p_nome_usuario text,
  p_email        text default null,
  p_documento    text default null
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
  v_documento  text;
begin
  if p_usuario_id is null then
    raise exception 'Responsável não informado.' using errcode = '22023';
  end if;

  if coalesce(btrim(p_nome_empresa), '') = '' then
    raise exception 'Informe o nome do seu negócio.' using errcode = '22023';
  end if;

  -- Só dígitos: é o formato que o Asaas espera e o que dispensa decidir, depois,
  -- se "123.456.789-00" e "12345678900" são a mesma pessoa.
  v_documento := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');

  if v_documento is not null and length(v_documento) not in (11, 14) then
    raise exception 'Informe um CPF ou CNPJ válido.' using errcode = '22023';
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

  insert into public.empresas (nome, cnpj)
  values (btrim(p_nome_empresa), v_documento)
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
  public.contratacao_criar_empresa(uuid, text, uuid, text, text, text) from public;
grant execute on function
  public.contratacao_criar_empresa(uuid, text, uuid, text, text, text) to service_role;

drop function if exists public.contratacao_criar_empresa(uuid, text, uuid, text, text);

-- -----------------------------------------------------------------------------
-- A retomada também precisa do documento
--
-- Quem contratou e não pagou volta para o mesmo pagamento. Se a cobrança antiga
-- não servir mais, uma nova é aberta — e criar cliente no Asaas exige o mesmo
-- CPF/CNPJ. Sem devolvê-lo aqui, a retomada falharia exatamente com a mensagem
-- que esta migração existe para eliminar.
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

  select a.id, a.status, a.valor_contratado, a.asaas_customer_id,
         e.nome as empresa_nome, e.cnpj as empresa_documento
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
        'empresa_nome',      v_assinatura.empresa_nome,
        'empresa_documento', v_assinatura.empresa_documento
      )
    );
  end if;

  return jsonb_build_object('situacao', 'conta_ativa');
end;
$$;

revoke all on function public.contratacao_situacao(text, text) from public;
grant execute on function public.contratacao_situacao(text, text) to service_role;
