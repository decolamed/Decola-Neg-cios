-- =============================================================================
-- 0027 — Backend do Painel Administrativo
-- Especificação: Seções 6.9, 7.15, 11.1, 11.2, 11.3
--
-- O painel é "completamente separado do app cliente" (Seção 11.1), mas o
-- isolamento NÃO vem do roteamento: vem daqui. Toda ação administrativa
-- revalida `app.eh_admin_plataforma()` no servidor, e as tabelas que o
-- administrador altera (`empresas.status`, `assinaturas`) continuam sem verbo
-- de escrita para o cliente.
--
-- Nível de acesso único na V1 (Seção 11.3): quem está em
-- `administradores_plataforma` pode tudo; não há papéis dentro do painel.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Auditoria das entidades de plataforma.
--
-- `planos` e `configuracoes_plataforma` são escritos por DML direta do painel
-- (a RLS de 0007 já exige administrador). Sem trigger, essas mudanças ficavam
-- fora de `logs_auditoria`, contrariando a Seção 5.4. `empresa_id` fica nulo:
-- são ações de plataforma, e a coluna aceita nulo justamente para isso.
--
-- `assinaturas` NÃO ganha trigger genérico: o webhook do Asaas, o job diário e
-- as RPCs desta migration já registram ações NOMEADAS
-- (`assinatura.trial_expirado`, `assinatura.upgrade`, ...). Um trigger
-- genérico só somaria um `assinatura.editado` redundante a cada uma delas.
-- -----------------------------------------------------------------------------
create trigger planos_auditoria
  after insert or update on public.planos
  for each row execute function app.auditar('plano');

create trigger configuracoes_auditoria
  after update on public.configuracoes_plataforma
  for each row execute function app.auditar('configuracao_plataforma');

-- -----------------------------------------------------------------------------
-- Seção 6.9 — churn precisa saber QUANDO a empresa foi encerrada.
--
-- A Seção 6.9 define `inativa` como o status "para empresas encerradas", e a
-- Seção 7.15 A pede a taxa de cancelamento do mês. Sem uma data, o cálculo
-- teria de adivinhar a partir de `atualizado_em`, que muda por qualquer
-- edição. A coluna é preenchida e limpa por `admin_definir_status_empresa`.
-- -----------------------------------------------------------------------------
alter table public.empresas
  add column encerrada_em timestamptz;

comment on column public.empresas.encerrada_em is
  'Quando a empresa passou a `inativa` (encerrada). Base do churn (Seção 7.15 A).';

-- -----------------------------------------------------------------------------
-- Guarda comum de toda ação administrativa.
-- -----------------------------------------------------------------------------
create or replace function app.exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.eh_admin_plataforma() then
    raise exception 'Esta ação é exclusiva do administrador da plataforma.'
      using errcode = '42501';
  end if;
end;
$$;

-- =============================================================================
-- A. Dashboard do painel — Seção 7.15 A
--
-- "número de empresas ativas; novas empresas no mês; receita recorrente mensal
--  (MRR, soma dos valores dos planos com assinatura `ativa`); taxa de
--  cancelamento no mês (churn); empresas atualmente em carência ou modo
--  limitado (para ação proativa do time)."
-- =============================================================================
create or replace function public.admin_metricas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inicio_mes timestamptz := date_trunc('month', now());
  v_ativas integer;
  v_novas integer;
  v_mrr numeric;
  v_encerradas integer;
  v_base_churn integer;
  v_carencia integer;
  v_limitado integer;
  v_trial integer;
  v_pendentes integer;
begin
  perform app.exigir_admin();

  select count(*) into v_ativas from public.empresas where status = 'ativa';

  select count(*) into v_novas
  from public.empresas where criado_em >= v_inicio_mes;

  -- MRR pelo valor CONTRATADO, não pelo valor de tabela do plano: o preço fica
  -- congelado na assinatura ("preço legado", Seção 7.15 C).
  select coalesce(sum(valor_contratado), 0) into v_mrr
  from public.assinaturas where status = 'ativa';

  select count(*) into v_encerradas
  from public.empresas
  where encerrada_em is not null and encerrada_em >= v_inicio_mes;

  -- Base do churn: quem estava ativo no início do mês — as ativas de hoje mais
  -- as que se encerraram durante o mês.
  v_base_churn := v_ativas + v_encerradas;

  select
    count(*) filter (where status = 'carencia'),
    count(*) filter (where status = 'modo_limitado'),
    count(*) filter (where status = 'trial'),
    count(*) filter (where status = 'pendente_pagamento')
  into v_carencia, v_limitado, v_trial, v_pendentes
  from public.assinaturas;

  return jsonb_build_object(
    'empresas_ativas', v_ativas,
    'novas_no_mes', v_novas,
    'mrr', v_mrr,
    'encerradas_no_mes', v_encerradas,
    'churn_percentual',
      case when v_base_churn = 0 then 0
           else round((v_encerradas::numeric / v_base_churn) * 100, 2) end,
    'em_carencia', v_carencia,
    'em_modo_limitado', v_limitado,
    'em_trial', v_trial,
    'pendentes_pagamento', v_pendentes
  );
end;
$$;

-- =============================================================================
-- B. Empresas — Seção 7.15 B
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ativação manual (Seções 6.9 e 7.15 B).
--
-- "cria `empresa`, cria o usuário responsável, cria `empresa_usuarios` com
--  `papel = gestor_principal`, cria `assinatura` com `ativada_manualmente =
--  true` e `ativada_por` preenchido com o ID do administrador — não passa pelo
--  fluxo de pagamento Asaas."
--
-- A conta no Supabase Auth é criada pela Edge Function `admin-criar-empresa`,
-- que tem acesso à Admin API; aqui chega o `usuario_id` já resolvido. A regra
-- de vínculo único (Seção 5.1) é revalidada mesmo assim.
-- -----------------------------------------------------------------------------
create or replace function public.admin_criar_empresa(
  p_usuario_id uuid,
  p_nome_empresa text,
  p_plano_id uuid,
  p_status public.empresa_status default 'ativa'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_plano public.planos%rowtype;
  v_empresa_id uuid;
  v_assinatura_id uuid;
  v_nome_usuario text;
begin
  perform app.exigir_admin();

  if length(btrim(coalesce(p_nome_empresa, ''))) = 0 then
    raise exception 'Informe o nome da empresa.' using errcode = '22023';
  end if;

  select nome into v_nome_usuario from public.usuarios where id = p_usuario_id;
  if v_nome_usuario is null then
    raise exception 'Responsável não encontrado.' using errcode = '23503';
  end if;

  -- Seção 5.1 — "1 usuário = 1 empresa" é absoluta. A mensagem é a da
  -- Seção 7.15 B, literal.
  if exists (
    select 1 from public.empresa_usuarios
    where usuario_id = p_usuario_id and status <> 'removido'
  ) then
    raise exception 'Este e-mail já está vinculado a outra empresa.'
      using errcode = '23505';
  end if;

  -- Um administrador da plataforma não vira Gestor de empresa (Seção 11.1).
  if exists (select 1 from public.administradores_plataforma where id = p_usuario_id) then
    raise exception 'Esta conta é de administrador da plataforma e não pode ser vinculada a uma empresa.'
      using errcode = '22023';
  end if;

  select * into v_plano from public.planos where id = p_plano_id;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = '23503';
  end if;

  -- Um plano DESATIVADO é aceito aqui de propósito: a Seção 6.1 tira o plano
  -- só das novas contratações por autoatendimento, e a ativação manual é o
  -- caminho das "contas especiais" da Seção 6.9.

  insert into public.empresas (nome, status)
  values (btrim(p_nome_empresa), p_status)
  returning id into v_empresa_id;

  insert into public.empresa_usuarios (
    empresa_id, usuario_id, nome_convite, email_convite, papel, status,
    permissoes, aceito_em
  )
  select v_empresa_id, p_usuario_id, u.nome, u.email, 'gestor_principal', 'ativo',
         app.permissoes_gestor(), now()
  from public.usuarios u where u.id = p_usuario_id;

  insert into public.assinaturas (
    empresa_id, plano_id, valor_contratado, status,
    ativada_manualmente, ativada_por
  )
  values (
    v_empresa_id, v_plano.id, v_plano.valor_mensal, 'ativa',
    true, v_admin
  )
  returning id into v_assinatura_id;

  perform app.registrar_log(
    v_empresa_id, 'empresa.criada_manualmente', 'empresa', v_empresa_id, null,
    jsonb_build_object(
      'nome', btrim(p_nome_empresa),
      'plano_id', v_plano.id,
      'responsavel_id', p_usuario_id,
      'status', p_status,
      'ativada_por', v_admin)
  );

  return jsonb_build_object(
    'empresa_id', v_empresa_id,
    'assinatura_id', v_assinatura_id,
    'responsavel', v_nome_usuario
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Suspender / reativar / encerrar (Seções 6.9 e 7.15 B).
--
-- `empresas.status` e `assinaturas.status` são máquinas de estado
-- INDEPENDENTES (nota de consistência da Seção 6.9): mexer aqui não toca na
-- assinatura, e vice-versa.
-- -----------------------------------------------------------------------------
create or replace function public.admin_definir_status_empresa(
  p_empresa_id uuid,
  p_status public.empresa_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual public.empresas%rowtype;
begin
  perform app.exigir_admin();

  select * into v_atual from public.empresas where id = p_empresa_id for update;
  if not found then
    raise exception 'Empresa não encontrada.' using errcode = '23503';
  end if;

  if v_atual.status = p_status then
    raise exception 'A empresa já está com este status.' using errcode = '22023';
  end if;

  perform app.definir_contexto(
    case p_status
      when 'suspensa' then 'empresa.suspensa'
      when 'inativa' then 'empresa.encerrada'
      else 'empresa.reativada'
    end);

  update public.empresas
  set status = p_status,
      -- Data do encerramento, base do churn (Seção 7.15 A). Reativar limpa.
      encerrada_em = case when p_status = 'inativa' then now() else null end
  where id = p_empresa_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Alterar plano da empresa — "fora do fluxo de autoatendimento do Gestor"
-- (Seção 7.15 B).
--
-- Diferente de `trocar_plano` (Seção 6.7): sem agendamento e sem bloqueio por
-- limite excedido. O administrador está resolvendo um caso concreto, e a
-- decisão do que reduzir continua sendo do Gestor — o sistema apenas não
-- desativa nada sozinho (Seção 6.7, princípio absoluto).
-- -----------------------------------------------------------------------------
create or replace function public.admin_alterar_plano_empresa(
  p_empresa_id uuid,
  p_plano_id uuid,
  p_valor numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assinatura public.assinaturas%rowtype;
  v_plano public.planos%rowtype;
  v_valor numeric;
begin
  perform app.exigir_admin();

  select * into v_assinatura
  from public.assinaturas
  where empresa_id = p_empresa_id and status <> 'cancelada'
  for update;

  if not found then
    raise exception 'Assinatura não encontrada para esta empresa.' using errcode = '23503';
  end if;

  select * into v_plano from public.planos where id = p_plano_id;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = '23503';
  end if;

  -- Seção 7.15 C — o valor cobrado mora na assinatura, não no plano. O
  -- administrador pode fixar um valor diferente do de tabela (preço legado,
  -- acordo comercial); omitido, assume o valor atual do plano.
  v_valor := coalesce(p_valor, v_plano.valor_mensal);
  if v_valor < 0 then
    raise exception 'O valor não pode ser negativo.' using errcode = '22023';
  end if;

  update public.assinaturas
  set plano_id = v_plano.id,
      valor_contratado = v_valor,
      plano_agendado_id = null,
      troca_agendada_para = null,
      valor_agendado = null
  where id = v_assinatura.id;

  perform app.registrar_log(
    p_empresa_id, 'assinatura.plano_alterado_pelo_admin', 'assinatura', v_assinatura.id,
    jsonb_build_object('plano_id', v_assinatura.plano_id,
                       'valor', v_assinatura.valor_contratado),
    jsonb_build_object('plano_id', v_plano.id, 'valor', v_valor)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Ativar manualmente (Seções 6.9 e 7.15 B) — "libera acesso sem passar pelo
-- Asaas". Serve também para regularizar uma conta em modo limitado.
-- -----------------------------------------------------------------------------
create or replace function public.admin_ativar_assinatura(p_empresa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assinatura public.assinaturas%rowtype;
begin
  perform app.exigir_admin();

  select * into v_assinatura
  from public.assinaturas
  where empresa_id = p_empresa_id and status <> 'cancelada'
  for update;

  if not found then
    raise exception 'Assinatura não encontrada para esta empresa.' using errcode = '23503';
  end if;

  update public.assinaturas
  set status = 'ativa',
      ativada_manualmente = true,
      ativada_por = (select auth.uid()),
      carencia_expira_em = null
  where id = v_assinatura.id;

  perform app.registrar_log(
    p_empresa_id, 'assinatura.ativada_manualmente', 'assinatura', v_assinatura.id,
    jsonb_build_object('status', v_assinatura.status),
    jsonb_build_object('status', 'ativa', 'ativada_por', (select auth.uid()))
  );

  perform app.notificar_gestores(
    p_empresa_id,
    'Acesso liberado',
    'Sua assinatura foi ativada pela equipe Decola Negócios e o acesso completo está liberado.'
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Alterar período de teste (Seção 7.15 B) — ajusta o trial de UMA empresa,
-- sem mexer na configuração global da Seção 6.9.
-- -----------------------------------------------------------------------------
create or replace function public.admin_definir_trial(
  p_empresa_id uuid,
  p_expira_em timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assinatura public.assinaturas%rowtype;
begin
  perform app.exigir_admin();

  select * into v_assinatura
  from public.assinaturas
  where empresa_id = p_empresa_id and status <> 'cancelada'
  for update;

  if not found then
    raise exception 'Assinatura não encontrada para esta empresa.' using errcode = '23503';
  end if;

  if p_expira_em is null then
    raise exception 'Informe a nova data de término do teste.' using errcode = '22023';
  end if;

  update public.assinaturas
  set trial_expira_em = p_expira_em,
      -- Estender o teste de uma conta que já caiu em modo limitado devolve o
      -- acesso: sem isso o ajuste de data não teria efeito prático.
      status = case when v_assinatura.status in ('trial', 'modo_limitado', 'pendente_pagamento')
                      and p_expira_em > now()
                    then 'trial' else v_assinatura.status end
  where id = v_assinatura.id;

  perform app.registrar_log(
    p_empresa_id, 'assinatura.trial_alterado', 'assinatura', v_assinatura.id,
    jsonb_build_object('trial_expira_em', v_assinatura.trial_expira_em,
                       'status', v_assinatura.status),
    jsonb_build_object('trial_expira_em', p_expira_em)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Exclusão definitiva (Seções 6.9 e 7.15 B).
--
-- "ação separada e mais drástica que suspender — exige confirmação explícita
--  (ex: digitar o nome da empresa); remove os dados permanentemente. Nunca
--  acontece automaticamente."
--
-- A confirmação é conferida AQUI, não só na tela: a exclusão é irreversível.
-- O log é gravado com `empresa_id` nulo de propósito — `logs_auditoria`
-- cascateia a partir de `empresas`, e um registro amarrado à empresa
-- desapareceria junto com ela.
-- -----------------------------------------------------------------------------
create or replace function public.admin_excluir_empresa(
  p_empresa_id uuid,
  p_confirmacao text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa public.empresas%rowtype;
begin
  perform app.exigir_admin();

  select * into v_empresa from public.empresas where id = p_empresa_id;
  if not found then
    raise exception 'Empresa não encontrada.' using errcode = '23503';
  end if;

  if btrim(coalesce(p_confirmacao, '')) is distinct from btrim(v_empresa.nome) then
    raise exception 'Digite o nome exato da empresa para confirmar a exclusão.'
      using errcode = '22023';
  end if;

  perform app.registrar_log(
    null, 'empresa.excluida_definitivamente', 'empresa', p_empresa_id,
    to_jsonb(v_empresa), null
  );

  delete from public.empresas where id = p_empresa_id;
end;
$$;

-- =============================================================================
-- Grants — as RPCs são chamadas por um usuário autenticado que PRECISA ser
-- administrador. A checagem está dentro de cada função; o grant apenas permite
-- a chamada, e `anon` não chama nenhuma.
-- =============================================================================
revoke execute on function public.admin_metricas() from public, anon;
revoke execute on function public.admin_criar_empresa(uuid, text, uuid, public.empresa_status) from public, anon;
revoke execute on function public.admin_definir_status_empresa(uuid, public.empresa_status) from public, anon;
revoke execute on function public.admin_alterar_plano_empresa(uuid, uuid, numeric) from public, anon;
revoke execute on function public.admin_ativar_assinatura(uuid) from public, anon;
revoke execute on function public.admin_definir_trial(uuid, timestamptz) from public, anon;
revoke execute on function public.admin_excluir_empresa(uuid, text) from public, anon;

grant execute on function public.admin_metricas() to authenticated;
grant execute on function public.admin_criar_empresa(uuid, text, uuid, public.empresa_status) to authenticated;
grant execute on function public.admin_definir_status_empresa(uuid, public.empresa_status) to authenticated;
grant execute on function public.admin_alterar_plano_empresa(uuid, uuid, numeric) to authenticated;
grant execute on function public.admin_ativar_assinatura(uuid) to authenticated;
grant execute on function public.admin_definir_trial(uuid, timestamptz) to authenticated;
grant execute on function public.admin_excluir_empresa(uuid, text) to authenticated;
