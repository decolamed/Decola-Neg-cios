-- =============================================================================
-- 0009 — RPCs de onboarding, convite e gestão de usuários
-- Especificação: Seções 5.1, 5.2, 5.3, 5.6, 6.2, 6.5, 6.8, 7.8, 7.12
--
-- Estas operações não têm política de escrita direta em 0007 de propósito:
-- envolvem validação composta (limite do plano, vínculo único, imutabilidade
-- do Gestor Principal) que precisa acontecer numa transação só, no servidor.
-- Toda função aqui REVALIDA a permissão do chamador, mesmo que o app já tenha
-- validado antes de chamar.
-- =============================================================================

-- Chaves canônicas de permissão (Seção 5.3). Centralizadas para que a
-- validação de entrada não aceite chave inventada pelo cliente.
create or replace function app.chaves_permissao()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'cadastrar_produto',
    'editar_produto',
    'excluir_produto',
    'gerenciar_estoque',
    'visualizar_financeiro',
    'exportar_relatorios',
    'cancelar_venda',
    'gerenciar_assinatura'
  ]
$$;

-- Permissões padrão do Gestor: todas verdadeiras (Seção 5.3).
create or replace function app.permissoes_gestor()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_object_agg(chave, true)
  from unnest(app.chaves_permissao()) as chave
$$;

-- Permissões padrão do Funcionário: todas falsas (Seção 5.3).
create or replace function app.permissoes_funcionario()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_object_agg(chave, false)
  from unnest(app.chaves_permissao()) as chave
  where chave <> 'gerenciar_assinatura'
$$;

-- -----------------------------------------------------------------------------
-- Seção 7.12 — Cadastro de Conta e Criação da Empresa
-- O usuário autenticado vira automaticamente Gestor Principal (Seção 5.1) e a
-- assinatura nasce em trial ou pendente_pagamento conforme a configuração
-- global da plataforma (Seção 6.2, item 5).
-- -----------------------------------------------------------------------------
create or replace function public.criar_empresa_e_assinatura(
  p_nome_empresa text,
  p_plano_id uuid,
  p_nome_usuario text,
  p_aceitou_termos boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_config public.configuracoes_plataforma%rowtype;
  v_plano public.planos%rowtype;
  v_empresa_id uuid;
  v_status public.assinatura_status;
  v_trial_expira timestamptz;
begin
  if v_usuario is null then
    raise exception 'É necessário estar autenticado para criar uma empresa.'
      using errcode = '42501';
  end if;

  -- Seção 7.12 — o aceite dos termos é obrigatório.
  if not coalesce(p_aceitou_termos, false) then
    raise exception 'É necessário aceitar os Termos de Uso e a Política de Privacidade.'
      using errcode = '22023';
  end if;

  if coalesce(btrim(p_nome_empresa), '') = '' then
    raise exception 'Informe o nome da empresa.' using errcode = '22023';
  end if;

  -- Seção 5.1 — cada usuário pertence a no máximo uma empresa.
  if exists (
    select 1 from public.empresa_usuarios eu
    where eu.usuario_id = v_usuario and eu.status = 'ativo'
  ) then
    raise exception 'Esta conta já está vinculada a uma empresa.'
      using errcode = '23505';
  end if;

  select * into v_plano from public.planos where id = p_plano_id;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = '23503';
  end if;
  if not v_plano.ativo then
    raise exception 'Este plano não está disponível para novas contratações.'
      using errcode = '22023';
  end if;

  select * into v_config from public.configuracoes_plataforma limit 1;

  -- Seção 6.5 — trial ativo libera o acesso imediatamente; trial desativado
  -- deixa a conta sem acesso ao conteúdo até a confirmação do pagamento.
  if coalesce(v_config.trial_ativo, false) then
    v_status := 'trial';
    v_trial_expira := now() + make_interval(days => coalesce(v_config.trial_dias, 7));
  else
    v_status := 'pendente_pagamento';
    v_trial_expira := null;
  end if;

  insert into public.empresas (nome)
  values (btrim(p_nome_empresa))
  returning id into v_empresa_id;

  insert into public.empresa_usuarios (
    empresa_id, usuario_id, nome_convite, email_convite,
    papel, permissoes, status, aceito_em
  )
  select
    v_empresa_id, v_usuario, coalesce(nullif(btrim(p_nome_usuario), ''), u.nome),
    u.email, 'gestor_principal', app.permissoes_gestor(), 'ativo', now()
  from public.usuarios u
  where u.id = v_usuario;

  insert into public.assinaturas (
    empresa_id, plano_id, valor_contratado, status, trial_expira_em
  )
  values (
    -- Seção 7.15 — preço legado: congela o valor no momento da contratação.
    v_empresa_id, v_plano.id, v_plano.valor_mensal, v_status, v_trial_expira
  );

  update public.usuarios
  set nome = coalesce(nullif(btrim(p_nome_usuario), ''), nome),
      aceitou_termos_em = coalesce(aceitou_termos_em, now())
  where id = v_usuario;

  perform app.registrar_log(
    v_empresa_id, 'empresa.criada', 'empresa', v_empresa_id, null,
    jsonb_build_object('nome', btrim(p_nome_empresa), 'plano_id', v_plano.id)
  );

  return jsonb_build_object(
    'empresa_id', v_empresa_id,
    'assinatura_status', v_status,
    'trial_expira_em', v_trial_expira
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 5.2 — Convite de colaborador
-- Valida o limite de funcionários do plano (Seção 6.8) ANTES de permitir o
-- convite, e a regra de vínculo único (Seção 5.1).
-- O envio do e-mail em si é feito por Edge Function.
-- -----------------------------------------------------------------------------
create or replace function public.convidar_funcionario(
  p_nome text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_email text := lower(btrim(p_email));
  v_limite numeric;
  v_atuais integer;
  v_vinculo_id uuid;
begin
  -- Seção 5.3 — convidar é ação exclusiva do papel Gestor.
  if not app.pode_escrever_como_gestor(v_empresa) then
    raise exception 'Você não tem permissão para convidar funcionários.'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'Informe o nome do funcionário.' using errcode = '22023';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;

  -- Seção 6.8 — limite do plano validado no ponto de uso.
  v_limite := app.limite_plano(v_empresa, 'max_funcionarios');
  if v_limite is not null then
    select count(*) into v_atuais
    from public.empresa_usuarios eu
    where eu.empresa_id = v_empresa
      and eu.status in ('ativo', 'convidado');

    if v_atuais >= v_limite then
      raise exception
        'Seu plano permite até % funcionários. Faça upgrade do plano para adicionar mais.',
        v_limite::integer
        using errcode = '22023';
    end if;
  end if;

  -- Seção 5.1 — a conta convidada não pode já pertencer a outra empresa.
  if exists (
    select 1
    from public.empresa_usuarios eu
    join public.usuarios u on u.id = eu.usuario_id
    where lower(u.email) = v_email
      and eu.status = 'ativo'
      and eu.empresa_id <> v_empresa
  ) then
    raise exception 'Este e-mail já está vinculado a outra empresa.'
      using errcode = '23505';
  end if;

  if exists (
    select 1 from public.empresa_usuarios eu
    where eu.empresa_id = v_empresa
      and lower(eu.email_convite) = v_email
      and eu.status <> 'removido'
  ) then
    raise exception 'Já existe um convite ou vínculo para este e-mail nesta empresa.'
      using errcode = '23505';
  end if;

  insert into public.empresa_usuarios (
    empresa_id, nome_convite, email_convite, papel, permissoes, status
  )
  values (
    v_empresa, btrim(p_nome), v_email, 'funcionario',
    app.permissoes_funcionario(), 'convidado'
  )
  returning id into v_vinculo_id;

  return v_vinculo_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 5.2 — Reenvio de convite
-- Gera novo prazo e, com isso, invalida automaticamente o anterior.
-- -----------------------------------------------------------------------------
create or replace function public.reenviar_convite(p_vinculo_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_novo_prazo timestamptz := now() + interval '7 days';
begin
  if not app.pode_escrever_como_gestor(v_empresa) then
    raise exception 'Você não tem permissão para reenviar convites.'
      using errcode = '42501';
  end if;

  update public.empresa_usuarios
  set convidado_em = now(),
      convite_expira_em = v_novo_prazo
  where id = p_vinculo_id
    and empresa_id = v_empresa
    and status = 'convidado';

  if not found then
    raise exception 'Convite não encontrado ou já aceito.' using errcode = '23503';
  end if;

  return v_novo_prazo;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 5.2, item 4 — Aceite do convite
-- Vale tanto para quem já tinha conta quanto para quem acabou de criar uma.
-- -----------------------------------------------------------------------------
create or replace function public.aceitar_convite(p_vinculo_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_email text;
  v_vinculo public.empresa_usuarios%rowtype;
begin
  if v_usuario is null then
    raise exception 'É necessário estar autenticado para aceitar o convite.'
      using errcode = '42501';
  end if;

  select lower(u.email) into v_email from public.usuarios u where u.id = v_usuario;

  -- Seção 5.1 — não é possível aceitar um convite já pertencendo a outra empresa.
  if exists (
    select 1 from public.empresa_usuarios eu
    where eu.usuario_id = v_usuario and eu.status = 'ativo'
  ) then
    raise exception 'Esta conta já está vinculada a uma empresa.'
      using errcode = '23505';
  end if;

  select * into v_vinculo
  from public.empresa_usuarios
  where id = p_vinculo_id
  for update;

  if not found or v_vinculo.status <> 'convidado' then
    raise exception 'Convite não encontrado.' using errcode = '23503';
  end if;

  if lower(v_vinculo.email_convite) <> v_email then
    raise exception 'Este convite foi enviado para outro e-mail.'
      using errcode = '42501';
  end if;

  -- Seção 5.2 — validade de 7 dias.
  if v_vinculo.convite_expira_em < now() then
    raise exception 'Este convite expirou. Peça ao Gestor para reenviá-lo.'
      using errcode = '22023';
  end if;

  update public.empresa_usuarios
  set usuario_id = v_usuario,
      status = 'ativo',
      aceito_em = now()
  where id = p_vinculo_id;

  return v_vinculo.empresa_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seções 4.3 e 5.3 — Promover / rebaixar
-- O Gestor Principal é imutável: não pode ser rebaixado nem removido por
-- ninguém, e ninguém mais pode ser promovido a Gestor Principal.
-- -----------------------------------------------------------------------------
create or replace function public.alterar_papel_usuario(
  p_vinculo_id uuid,
  p_papel public.papel_usuario
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_alvo public.empresa_usuarios%rowtype;
begin
  if not app.pode_escrever_como_gestor(v_empresa) then
    raise exception 'Você não tem permissão para alterar papéis.'
      using errcode = '42501';
  end if;

  if p_papel = 'gestor_principal' then
    raise exception 'O Gestor Principal é definido na criação da empresa e não pode ser transferido.'
      using errcode = '42501';
  end if;

  select * into v_alvo
  from public.empresa_usuarios
  where id = p_vinculo_id and empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Funcionário não encontrado.' using errcode = '23503';
  end if;

  if v_alvo.papel = 'gestor_principal' then
    raise exception 'O Gestor Principal não pode ser rebaixado.' using errcode = '42501';
  end if;

  if v_alvo.usuario_id = (select auth.uid()) then
    raise exception 'Você não pode alterar o seu próprio papel.' using errcode = '42501';
  end if;

  perform app.definir_contexto(
    case when p_papel = 'gestor' then 'usuario.promovido' else 'usuario.rebaixado' end
  );

  update public.empresa_usuarios
  set papel = p_papel,
      -- Ao promover, o usuário passa a ter todas as permissões do Gestor;
      -- ao rebaixar, volta ao padrão do Funcionário (Seção 5.3).
      permissoes = case
        when p_papel = 'gestor' then app.permissoes_gestor()
        else app.permissoes_funcionario()
      end
  where id = p_vinculo_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 5.3 — Permissões individuais do Funcionário
-- -----------------------------------------------------------------------------
create or replace function public.definir_permissoes(
  p_vinculo_id uuid,
  p_permissoes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_alvo public.empresa_usuarios%rowtype;
  v_chave text;
begin
  if not app.pode_escrever_como_gestor(v_empresa) then
    raise exception 'Você não tem permissão para alterar permissões.'
      using errcode = '42501';
  end if;

  select * into v_alvo
  from public.empresa_usuarios
  where id = p_vinculo_id and empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Funcionário não encontrado.' using errcode = '23503';
  end if;

  if v_alvo.papel <> 'funcionario' then
    raise exception 'O Gestor já possui todas as permissões.' using errcode = '22023';
  end if;

  -- Rejeita chave fora do conjunto canônico da Seção 5.3.
  for v_chave in select jsonb_object_keys(p_permissoes) loop
    if not (v_chave = any (app.chaves_permissao())) then
      raise exception 'Permissão desconhecida: %', v_chave using errcode = '22023';
    end if;
    -- Seção 5.3 — nunca concedível ao Funcionário.
    if v_chave = 'gerenciar_assinatura' and coalesce((p_permissoes ->> v_chave)::boolean, false) then
      raise exception 'A permissão de gerenciar assinatura é exclusiva do Gestor.'
        using errcode = '42501';
    end if;
  end loop;

  perform app.definir_contexto('usuario.permissoes_alteradas');

  update public.empresa_usuarios
  set permissoes = app.permissoes_funcionario() || p_permissoes
  where id = p_vinculo_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 5.6 — Remoção de usuário
-- Nunca apaga: desativa o acesso e mantém todo o histórico atribuído a ele.
-- -----------------------------------------------------------------------------
create or replace function public.remover_usuario(p_vinculo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_alvo public.empresa_usuarios%rowtype;
begin
  if not app.pode_escrever_como_gestor(v_empresa) then
    raise exception 'Você não tem permissão para remover funcionários.'
      using errcode = '42501';
  end if;

  select * into v_alvo
  from public.empresa_usuarios
  where id = p_vinculo_id and empresa_id = v_empresa
  for update;

  if not found then
    raise exception 'Funcionário não encontrado.' using errcode = '23503';
  end if;

  if v_alvo.papel = 'gestor_principal' then
    raise exception 'O Gestor Principal não pode ser removido.' using errcode = '42501';
  end if;

  if v_alvo.usuario_id = (select auth.uid()) then
    raise exception 'Você não pode remover o seu próprio acesso.' using errcode = '42501';
  end if;

  perform app.definir_contexto('usuario.removido');

  update public.empresa_usuarios
  set status = 'removido'
  where id = p_vinculo_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants — apenas usuários autenticados chamam estas RPCs.
-- -----------------------------------------------------------------------------
revoke execute on function public.criar_empresa_e_assinatura(text, uuid, text, boolean) from public, anon;
revoke execute on function public.convidar_funcionario(text, text) from public, anon;
revoke execute on function public.reenviar_convite(uuid) from public, anon;
revoke execute on function public.aceitar_convite(uuid) from public, anon;
revoke execute on function public.alterar_papel_usuario(uuid, public.papel_usuario) from public, anon;
revoke execute on function public.definir_permissoes(uuid, jsonb) from public, anon;
revoke execute on function public.remover_usuario(uuid) from public, anon;

grant execute on function public.criar_empresa_e_assinatura(text, uuid, text, boolean) to authenticated;
grant execute on function public.convidar_funcionario(text, text) to authenticated;
grant execute on function public.reenviar_convite(uuid) to authenticated;
grant execute on function public.aceitar_convite(uuid) to authenticated;
grant execute on function public.alterar_papel_usuario(uuid, public.papel_usuario) to authenticated;
grant execute on function public.definir_permissoes(uuid, jsonb) to authenticated;
grant execute on function public.remover_usuario(uuid) to authenticated;
