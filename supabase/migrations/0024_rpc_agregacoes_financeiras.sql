-- =============================================================================
-- 0024 — Agregações do Financeiro e dos Relatórios
-- Especificação: Seções 7.7, 8.6, 10.2, 10.3
--
-- "Todos os relatórios e gráficos são derivados por agregação de `vendas`,
-- `venda_itens` e `movimentacoes_financeiras` — nenhum dado de relatório é
-- armazenado separadamente" (Seção 10.2).
--
-- A agregação roda no banco, não no app: evita trafegar histórico inteiro para
-- o dispositivo e mantém a mesma lógica servindo as duas telas (Seção 7.7).
--
-- Acesso (Seções 5.3 e 10.3):
--   Financeiro ..... `visualizar_financeiro`
--   Relatórios ..... `exportar_relatorios` (dá acesso à tela completa)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Seção 8.6 — resumo principal do Financeiro.
-- Vendas canceladas não entram no total vendido; o estorno delas aparece como
-- saída no fluxo, mantendo os dois lados visíveis no histórico.
-- -----------------------------------------------------------------------------
create or replace function public.resumo_financeiro(
  p_desde timestamptz,
  p_ate timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_resultado jsonb;
begin
  if not app.pode_ler(v_empresa) or not app.tem_permissao('visualizar_financeiro') then
    raise exception 'Você não tem permissão para visualizar o financeiro.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_vendido', coalesce(v.total_vendido, 0),
    'quantidade_vendas', coalesce(v.quantidade, 0),
    'ticket_medio', case when coalesce(v.quantidade, 0) > 0
                         then round(v.total_vendido / v.quantidade, 2) else 0 end,
    'entradas', coalesce(m.entradas, 0),
    'saidas', coalesce(m.saidas, 0),
    'saldo', coalesce(m.entradas, 0) - coalesce(m.saidas, 0)
  )
  into v_resultado
  from
    (select sum(total) as total_vendido, count(*) as quantidade
     from public.vendas
     where empresa_id = v_empresa
       and status = 'confirmada'
       and criado_em >= p_desde and criado_em < p_ate) v,
    (select
       sum(valor) filter (where tipo = 'entrada') as entradas,
       sum(valor) filter (where tipo = 'saida') as saidas
     from public.movimentacoes_financeiras
     where empresa_id = v_empresa
       and data_movimentacao >= p_desde::date and data_movimentacao <= p_ate::date) m;

  return v_resultado;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 8.6 — autocomplete de categorias.
-- "Simples texto livre com sugestões de categorias já usadas anteriormente
-- pela empresa, em vez de uma lista fixa no sistema."
-- -----------------------------------------------------------------------------
create or replace function public.categorias_financeiras_usadas()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_categorias text[];
begin
  if not app.pode_ler(v_empresa) or not app.tem_permissao('visualizar_financeiro') then
    raise exception 'Você não tem permissão para visualizar o financeiro.'
      using errcode = '42501';
  end if;

  select array_agg(categoria order by usos desc, categoria)
  into v_categorias
  from (
    select categoria, count(*) as usos
    from public.movimentacoes_financeiras
    where empresa_id = v_empresa
      and categoria is not null
      and btrim(categoria) <> ''
    group by categoria
    limit 30
  ) c;

  return coalesce(v_categorias, array[]::text[]);
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 10.2 — dados dos cinco gráficos, numa chamada só.
--   evolucao ................ evolução das vendas no período
--   periodo_anterior ........ comparação entre períodos
--   produtos_mais_vendidos .. top produtos
--   formas_pagamento ........ distribuição por forma
--   por_funcionario ......... vendas por funcionário
-- -----------------------------------------------------------------------------
create or replace function public.relatorio_vendas(
  p_desde timestamptz,
  p_ate timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_duracao interval := p_ate - p_desde;
  v_resultado jsonb;
begin
  -- Seção 10.3 — a permissão de exportar dá acesso à TELA completa de
  -- Relatórios, não apenas ao botão de exportar.
  if not app.pode_ler(v_empresa) or not app.tem_permissao('exportar_relatorios') then
    raise exception 'Você não tem permissão para acessar os relatórios.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'ate', p_ate),

    'totais', (
      select jsonb_build_object(
        'total_vendido', coalesce(sum(total), 0),
        'quantidade_vendas', count(*),
        'ticket_medio', case when count(*) > 0 then round(sum(total) / count(*), 2) else 0 end,
        'desconto_concedido', coalesce(sum(desconto), 0)
      )
      from public.vendas
      where empresa_id = v_empresa and status = 'confirmada'
        and criado_em >= p_desde and criado_em < p_ate
    ),

    -- Comparação entre períodos: mesma duração, imediatamente anterior.
    'periodo_anterior', (
      select jsonb_build_object(
        'total_vendido', coalesce(sum(total), 0),
        'quantidade_vendas', count(*)
      )
      from public.vendas
      where empresa_id = v_empresa and status = 'confirmada'
        and criado_em >= p_desde - v_duracao and criado_em < p_desde
    ),

    'evolucao', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'dia', dia, 'total', total, 'quantidade', quantidade) order by dia), '[]'::jsonb)
      from (
        select date_trunc('day', criado_em)::date as dia,
               sum(total) as total, count(*) as quantidade
        from public.vendas
        where empresa_id = v_empresa and status = 'confirmada'
          and criado_em >= p_desde and criado_em < p_ate
        group by 1
      ) e
    ),

    'produtos_mais_vendidos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'produto_id', produto_id, 'nome', nome,
               'quantidade', quantidade, 'total', total)
               order by quantidade desc), '[]'::jsonb)
      from (
        select i.produto_id, p.nome,
               sum(i.quantidade) as quantidade, sum(i.subtotal) as total
        from public.venda_itens i
        join public.vendas v on v.id = i.venda_id
        join public.produtos p on p.id = i.produto_id
        where v.empresa_id = v_empresa and v.status = 'confirmada'
          and v.criado_em >= p_desde and v.criado_em < p_ate
        group by 1, 2
        order by sum(i.quantidade) desc
        limit 10
      ) pr
    ),

    'formas_pagamento', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'forma', forma, 'total', total, 'quantidade', quantidade)
               order by total desc), '[]'::jsonb)
      from (
        select forma_pagamento::text as forma, sum(total) as total, count(*) as quantidade
        from public.vendas
        where empresa_id = v_empresa and status = 'confirmada'
          and criado_em >= p_desde and criado_em < p_ate
        group by 1
      ) f
    ),

    'por_funcionario', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'usuario_id', usuario_id, 'nome', nome,
               'total', total, 'quantidade', quantidade)
               order by total desc), '[]'::jsonb)
      from (
        select v.usuario_id, u.nome, sum(v.total) as total, count(*) as quantidade
        from public.vendas v
        join public.usuarios u on u.id = v.usuario_id
        where v.empresa_id = v_empresa and v.status = 'confirmada'
          and v.criado_em >= p_desde and v.criado_em < p_ate
        group by 1, 2
      ) fu
    ),

    'canceladas', (
      select jsonb_build_object('quantidade', count(*), 'total', coalesce(sum(total), 0))
      from public.vendas
      where empresa_id = v_empresa and status = 'cancelada'
        and criado_em >= p_desde and criado_em < p_ate
    )
  )
  into v_resultado;

  return v_resultado;
end;
$$;

revoke execute on function public.resumo_financeiro(timestamptz, timestamptz) from public, anon;
revoke execute on function public.categorias_financeiras_usadas() from public, anon;
revoke execute on function public.relatorio_vendas(timestamptz, timestamptz) from public, anon;

grant execute on function public.resumo_financeiro(timestamptz, timestamptz) to authenticated;
grant execute on function public.categorias_financeiras_usadas() to authenticated;
grant execute on function public.relatorio_vendas(timestamptz, timestamptz) to authenticated;
