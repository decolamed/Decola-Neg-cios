-- =============================================================================
-- 0021 — Cancelamento de venda e fluxo de aprovação
-- Especificação: Seções 4.17, 5.3, 8.5, 8.6
--
-- Vendas NUNCA são apagadas: o cancelamento marca `cancelada` e gera reversão.
-- Dois caminhos, conforme a permissão `cancelar_venda`:
--   com a permissão  → cancela diretamente
--   sem a permissão  → solicita, e o Gestor aprova ou rejeita
--
-- Nota: o cast explícito do enum em `decidir_solicitacao_cancelamento` veio da
-- correção 0022 e já está incorporado aqui.
-- =============================================================================

-- Núcleo da reversão. Não checa permissão: quem chama já validou — o
-- cancelamento direto e a aprovação do Gestor chegam por caminhos diferentes.
create or replace function app.reverter_venda(p_venda_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda public.vendas%rowtype;
begin
  select * into v_venda from public.vendas where id = p_venda_id for update;

  if not found then
    raise exception 'Venda não encontrada.' using errcode = '23503';
  end if;

  if v_venda.status = 'cancelada' then
    raise exception 'Esta venda já foi cancelada.' using errcode = '22023';
  end if;

  perform app.marcar_operacao_confiavel();
  perform app.definir_contexto('venda.cancelada', p_motivo);

  -- Seção 8.5 — o estoque volta mesmo para produtos arquivados ou excluídos:
  -- o ciclo de vida controla a visibilidade para NOVAS vendas, não impede
  -- ajuste de quantidade por integridade de dados.
  update public.produtos p
  set estoque_atual = p.estoque_atual + i.quantidade
  from public.venda_itens i
  where i.venda_id = p_venda_id and p.id = i.produto_id;

  -- Seção 8.6 — a movimentação original NÃO é apagada; o estorno é um novo
  -- lançamento, e os dois ficam visíveis no histórico.
  insert into public.movimentacoes_financeiras (
    empresa_id, tipo, valor, descricao, origem, venda_id, criado_por
  )
  values (
    v_venda.empresa_id, 'saida', v_venda.total,
    coalesce(nullif(btrim(p_motivo), ''), 'Estorno de venda cancelada'),
    'estorno_venda', p_venda_id, (select auth.uid())
  );

  update public.vendas
  set status = 'cancelada',
      cancelada_em = now(),
      cancelada_por = (select auth.uid())
  where id = p_venda_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 8.5 — cancelamento direto, para quem tem `cancelar_venda`.
-- Sem prazo limite na V1: qualquer venda pode ser cancelada, independentemente
-- de quando foi realizada. Sempre integral — não há cancelamento parcial.
-- -----------------------------------------------------------------------------
create or replace function public.cancelar_venda(p_venda_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.vendas where id = p_venda_id;

  if v_empresa is null then
    raise exception 'Venda não encontrada.' using errcode = '23503';
  end if;

  if not app.pode_escrever(v_empresa, 'cancelar_venda') then
    raise exception 'Você não tem permissão para cancelar vendas. Solicite o cancelamento ao Gestor.'
      using errcode = '42501';
  end if;

  perform app.reverter_venda(p_venda_id, p_motivo);

  -- Fecha qualquer solicitação pendente da mesma venda.
  update public.solicitacoes_cancelamento
  set status = 'aprovado', decidido_por = (select auth.uid()), decidido_em = now()
  where venda_id = p_venda_id and status = 'pendente';
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 8.5 — solicitação, para o Funcionário SEM a permissão.
-- Vira RPC (em vez de INSERT direto) para validar que a venda pertence à
-- empresa do solicitante e ainda não está cancelada.
-- -----------------------------------------------------------------------------
create or replace function public.solicitar_cancelamento_venda(
  p_venda_id uuid,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda public.vendas%rowtype;
  v_solicitacao_id uuid;
begin
  select * into v_venda from public.vendas where id = p_venda_id;

  if not found then
    raise exception 'Venda não encontrada.' using errcode = '23503';
  end if;

  if not app.pode_escrever(v_venda.empresa_id) then
    raise exception 'Não é possível solicitar cancelamento com a conta neste estado.'
      using errcode = '42501';
  end if;

  if v_venda.status = 'cancelada' then
    raise exception 'Esta venda já foi cancelada.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.solicitacoes_cancelamento
    where venda_id = p_venda_id and status = 'pendente'
  ) then
    raise exception 'Já existe uma solicitação de cancelamento pendente para esta venda.'
      using errcode = '23505';
  end if;

  insert into public.solicitacoes_cancelamento (empresa_id, venda_id, solicitado_por, motivo)
  values (v_venda.empresa_id, p_venda_id, (select auth.uid()), nullif(btrim(p_motivo), ''))
  returning id into v_solicitacao_id;

  perform app.registrar_log(
    v_venda.empresa_id, 'venda.cancelamento_solicitado', 'venda', p_venda_id, null,
    jsonb_build_object('solicitacao_id', v_solicitacao_id, 'motivo', p_motivo)
  );

  return v_solicitacao_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 8.5 — decisão do Gestor. Aprovar dispara a reversão completa.
-- -----------------------------------------------------------------------------
create or replace function public.decidir_solicitacao_cancelamento(
  p_solicitacao_id uuid,
  p_aprovar boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitacao public.solicitacoes_cancelamento%rowtype;
begin
  select * into v_solicitacao
  from public.solicitacoes_cancelamento
  where id = p_solicitacao_id
  for update;

  if not found then
    raise exception 'Solicitação não encontrada.' using errcode = '23503';
  end if;

  if v_solicitacao.status <> 'pendente' then
    raise exception 'Esta solicitação já foi decidida.' using errcode = '22023';
  end if;

  -- Quem decide é quem pode cancelar diretamente (Seção 8.5).
  if not app.pode_escrever(v_solicitacao.empresa_id, 'cancelar_venda') then
    raise exception 'Você não tem permissão para decidir solicitações de cancelamento.'
      using errcode = '42501';
  end if;

  -- Cast explícito: um CASE com dois literais produz `text`, e o Postgres não
  -- coage text para enum implicitamente num UPDATE.
  update public.solicitacoes_cancelamento
  set status = (case when p_aprovar then 'aprovado' else 'rejeitado' end)::public.solicitacao_status,
      decidido_por = (select auth.uid()),
      decidido_em = now()
  where id = p_solicitacao_id;

  if p_aprovar then
    perform app.reverter_venda(v_solicitacao.venda_id, v_solicitacao.motivo);
  else
    perform app.registrar_log(
      v_solicitacao.empresa_id, 'venda.cancelamento_rejeitado', 'venda',
      v_solicitacao.venda_id, null, jsonb_build_object('solicitacao_id', p_solicitacao_id)
    );
  end if;
end;
$$;

-- A solicitação passa a ser exclusivamente pela RPC: sem privilégio de INSERT
-- direto, um cliente não consegue registrar solicitação para venda de outra
-- empresa nem burlar as validações acima.
drop policy if exists solicitacoes_insercao on public.solicitacoes_cancelamento;
revoke insert on public.solicitacoes_cancelamento from authenticated;

revoke execute on function public.cancelar_venda(uuid, text) from public, anon;
revoke execute on function public.solicitar_cancelamento_venda(uuid, text) from public, anon;
revoke execute on function public.decidir_solicitacao_cancelamento(uuid, boolean) from public, anon;

grant execute on function public.cancelar_venda(uuid, text) to authenticated;
grant execute on function public.solicitar_cancelamento_venda(uuid, text) to authenticated;
grant execute on function public.decidir_solicitacao_cancelamento(uuid, boolean) to authenticated;
