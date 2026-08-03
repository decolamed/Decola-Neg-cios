-- =============================================================================
-- 0023 — Lançamento manual: integridade e auditoria
-- Especificação: Seção 8.6
--
-- "Edição/exclusão de lançamento manual: PERMITIDO, diferente de vendas (que
-- nunca são apagadas) — por serem lançamentos avulsos. Toda edição ou exclusão
-- gera registro em logs_auditoria (`financeiro.movimentacao_editada` /
-- `financeiro.movimentacao_excluida`)."
--
-- O trigger genérico de 0008 produziria `financeiro.movimentacao.editado`.
-- Aqui trocamos por um trigger dedicado que emite exatamente os nomes da
-- especificação, e que também impede o cliente de forjar autoria ou origem.
-- =============================================================================

create or replace function app.movimentacoes_integridade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or app.operacao_confiavel() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A autoria é de quem está autenticado, não do que o cliente enviou.
    new.criado_por := (select auth.uid());

    -- Lançamentos de venda e estorno só nascem das RPCs de venda, que rodam
    -- como operação confiável e não chegam aqui.
    if new.origem <> 'manual' then
      raise exception 'Somente lançamentos manuais podem ser criados pelo aplicativo.'
        using errcode = '42501';
    end if;

  elsif tg_op = 'UPDATE' then
    if old.origem <> 'manual' then
      raise exception 'Lançamentos gerados por venda não podem ser editados.'
        using errcode = '42501';
    end if;
    -- Origem, vínculo com venda e autoria são imutáveis na edição.
    new.origem := old.origem;
    new.venda_id := old.venda_id;
    new.criado_por := old.criado_por;
    new.empresa_id := old.empresa_id;
  end if;

  return new;
end;
$$;

create trigger movimentacoes_integridade
  before insert or update on public.movimentacoes_financeiras
  for each row execute function app.movimentacoes_integridade();

-- -----------------------------------------------------------------------------
-- Auditoria com os nomes exatos da Seção 8.6.
-- -----------------------------------------------------------------------------
create or replace function app.auditar_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acao text;
  v_anterior jsonb;
  v_novo jsonb;
begin
  if tg_op = 'INSERT' then
    v_anterior := null;
    v_novo := to_jsonb(new);
    v_acao := coalesce(app.contexto_acao(), 'financeiro.movimentacao_criada');
  elsif tg_op = 'UPDATE' then
    v_anterior := to_jsonb(old);
    v_novo := to_jsonb(new);
    if v_anterior = v_novo then
      return new;
    end if;
    v_acao := coalesce(app.contexto_acao(), 'financeiro.movimentacao_editada');
  else
    v_anterior := to_jsonb(old);
    v_novo := null;
    v_acao := 'financeiro.movimentacao_excluida';
  end if;

  perform app.registrar_log(
    (coalesce(v_novo, v_anterior) ->> 'empresa_id')::uuid,
    v_acao,
    'financeiro.movimentacao',
    (coalesce(v_novo, v_anterior) ->> 'id')::uuid,
    v_anterior,
    v_novo
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists movimentacoes_auditoria on public.movimentacoes_financeiras;

create trigger movimentacoes_auditoria
  after insert or update or delete on public.movimentacoes_financeiras
  for each row execute function app.auditar_movimentacao();
