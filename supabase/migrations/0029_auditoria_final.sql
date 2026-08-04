-- =============================================================================
-- 0029 — Correções da auditoria final
-- Especificação: Seções 7.2, 9.1, 9.2
--
-- Reúne o que o linter do Postgres e a revisão tela a tela apontaram depois de
-- a Fase 8 fechar. Nada aqui muda comportamento de negócio: é endurecimento,
-- índice e o resumo que faltava para o Dashboard.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. `search_path` fixo nas duas funções de 0019.
--
-- A migration 0012 fixou o search_path de todas as funções existentes na
-- época; 0019 nasceu depois e escapou. `app.operacao_confiavel()` participa de
-- uma DECISÃO DE PERMISSÃO (o trigger de coluna de produtos consulta ela para
-- saber se pode pular a checagem), então um search_path mutável aqui é uma
-- porta que não deveria existir.
-- -----------------------------------------------------------------------------
create or replace function app.marcar_operacao_confiavel()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform set_config('decola.operacao_confiavel', 'sim', true);
end;
$$;

create or replace function app.operacao_confiavel()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('decola.operacao_confiavel', true), '') = 'sim'
$$;

-- -----------------------------------------------------------------------------
-- 2. `rls_auto_enable()` — event trigger gerido pela própria Supabase, criado
--    fora das nossas migrations, que nasce executável por PUBLIC.
--
-- Chamá-la por RPC já falharia (função de event trigger não roda como função
-- comum), mas deixá-la exposta em `/rest/v1/rpc/` sem necessidade contraria o
-- princípio da Seção 9.1. Revogar não afeta o disparo do event trigger, que
-- roda com o privilégio do dono.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Índices das chaves estrangeiras que ficaram sem cobertura.
--
-- A 0013 cobriu as FKs existentes na Fase 1; estas ou nasceram depois (0025,
-- 0027) ou são colunas de autoria que só passaram a ser consultadas agora.
-- Sem índice, um DELETE na tabela referenciada varre a tabela inteira.
-- -----------------------------------------------------------------------------
create index if not exists alertas_estoque_lido_por_idx
  on public.alertas_estoque (lido_por);

create index if not exists notificacoes_lido_por_idx
  on public.notificacoes (lido_por);

create index if not exists assinaturas_ativada_por_idx
  on public.assinaturas (ativada_por);

create index if not exists assinaturas_plano_agendado_idx
  on public.assinaturas (plano_agendado_id);

create index if not exists configuracoes_atualizado_por_idx
  on public.configuracoes_plataforma (atualizado_por);

create index if not exists solicitacoes_decidido_por_idx
  on public.solicitacoes_cancelamento (decidido_por);

create index if not exists vendas_cancelada_por_idx
  on public.vendas (cancelada_por);

-- -----------------------------------------------------------------------------
-- 4. Políticas permissivas sobrepostas.
--
-- Quando duas políticas permissivas valem para o mesmo papel e a mesma ação, o
-- Postgres avalia AS DUAS em toda linha. Consolidar em uma só com `OR` dá o
-- mesmo resultado por metade do trabalho — mesma limpeza que a 0014 já fez em
-- `empresas`, `empresa_usuarios` e `assinaturas`.
-- -----------------------------------------------------------------------------

-- `empresas` UPDATE: Gestor da própria empresa OU administrador da plataforma.
drop policy if exists empresas_edicao_admin on public.empresas;
drop policy if exists empresas_edicao_gestor on public.empresas;

create policy empresas_edicao on public.empresas
  for update to authenticated
  using (
    (select app.pode_escrever_como_gestor(empresas.id))
    or (select app.eh_admin_plataforma())
  )
  with check (
    (select app.pode_escrever_como_gestor(empresas.id))
    or (select app.eh_admin_plataforma())
  );

-- `empresa_campos_produto`: a política de escrita era `for all`, então também
-- valia para SELECT e duplicava a de leitura. Restringir aos verbos de escrita
-- resolve sem perder nada — quem pode escrever também passa pela de leitura.
drop policy if exists empresa_campos_escrita_gestor on public.empresa_campos_produto;

create policy empresa_campos_insercao_gestor on public.empresa_campos_produto
  for insert to authenticated
  with check ((select app.pode_escrever_como_gestor(empresa_campos_produto.empresa_id)));

create policy empresa_campos_edicao_gestor on public.empresa_campos_produto
  for update to authenticated
  using ((select app.pode_escrever_como_gestor(empresa_campos_produto.empresa_id)))
  with check ((select app.pode_escrever_como_gestor(empresa_campos_produto.empresa_id)));

create policy empresa_campos_exclusao_gestor on public.empresa_campos_produto
  for delete to authenticated
  using ((select app.pode_escrever_como_gestor(empresa_campos_produto.empresa_id)));

-- =============================================================================
-- 5. Resumo do Dashboard — Seção 7.2
--
-- "Card Vendas hoje / Quantidade de vendas / Produtos / Estoque baixo."
--
-- Uma chamada só, agregada no banco: contar produtos e somar vendas no cliente
-- exigiria baixar as duas tabelas inteiras a cada abertura do app. A RLS de
-- cada tabela continua valendo — a função é INVOKER de propósito, para que o
-- isolamento por empresa seja o mesmo de qualquer outra consulta.
-- =============================================================================
create or replace function public.resumo_dashboard()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_inicio timestamptz := date_trunc('day', now());
  v_vendas_hoje numeric := 0;
  v_qtd_hoje integer := 0;
  v_qtd_total integer := 0;
  v_produtos integer := 0;
  v_estoque_baixo integer := 0;
  v_nao_lidas integer := 0;
begin
  if v_empresa is null then
    raise exception 'Nenhuma empresa ativa vinculada a esta conta.' using errcode = '42501';
  end if;

  -- Vendas canceladas não contam no resumo do dia (Seção 8.5): o cancelamento
  -- reverte a operação, e o card mostra o que de fato entrou.
  select coalesce(sum(total), 0), count(*)
  into v_vendas_hoje, v_qtd_hoje
  from public.vendas
  where empresa_id = v_empresa
    and status = 'confirmada'
    and criado_em >= v_inicio;

  select count(*) into v_qtd_total
  from public.vendas
  where empresa_id = v_empresa and status = 'confirmada';

  -- Seção 7.2 — o card "Produtos" conta os de `ciclo_vida = ativo`.
  select count(*) into v_produtos
  from public.produtos
  where empresa_id = v_empresa and ciclo_vida = 'ativo';

  -- Mesmo critério da tela Estoque Baixo (Seção 7.6), pela view de 0016.
  select count(*) into v_estoque_baixo
  from public.produtos_com_status
  where empresa_id = v_empresa
    and ciclo_vida = 'ativo'
    and status_estoque in ('estoque_baixo', 'esgotado');

  -- Badge do sino: alertas de estoque e notificações ainda não lidos.
  select
    (select count(*) from public.alertas_estoque
      where empresa_id = v_empresa and lido_em is null)
    + (select count(*) from public.notificacoes
        where empresa_id = v_empresa and lido_em is null)
  into v_nao_lidas;

  return jsonb_build_object(
    'vendas_hoje_total', v_vendas_hoje,
    'vendas_hoje_quantidade', v_qtd_hoje,
    'vendas_quantidade_total', v_qtd_total,
    'produtos_ativos', v_produtos,
    'estoque_baixo', v_estoque_baixo,
    'nao_lidas', v_nao_lidas
  );
end;
$$;

revoke execute on function public.resumo_dashboard() from public, anon;
grant execute on function public.resumo_dashboard() to authenticated;
