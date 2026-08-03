-- =============================================================================
-- 0020 — Registro de venda
-- Especificação: Seções 7.3, 7.4, 8.1, 8.6
--
-- Uma venda toca quatro tabelas (vendas, venda_itens, produtos,
-- movimentacoes_financeiras). Tudo numa transação só, com o servidor como
-- autoridade sobre PREÇO e ESTOQUE — o cliente envia apenas produto e
-- quantidade. Um app modificado não consegue vender mais barato nem furar o
-- estoque.
-- =============================================================================

create or replace function public.registrar_venda(
  p_itens jsonb,
  p_forma_pagamento public.forma_pagamento_venda,
  p_desconto_tipo public.desconto_tipo default null,
  p_desconto_valor numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_usuario uuid := (select auth.uid());
  v_itens jsonb;
  v_item record;
  v_produto public.produtos%rowtype;
  v_subtotal numeric(14,2) := 0;
  v_desconto numeric(14,2) := 0;
  v_total numeric(14,2);
  v_venda_id uuid;
begin
  -- Seção 5.3 — registrar venda é permissão padrão de todo papel; o que se
  -- exige aqui é vínculo ativo e conta em dia (Seção 6.6).
  if not app.pode_escrever(v_empresa) then
    raise exception 'Não é possível registrar vendas com a conta neste estado.'
      using errcode = '42501';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um produto à venda.' using errcode = '22023';
  end if;

  -- Agrupa por produto para tolerar o mesmo item repetido no carrinho.
  -- (jsonb em vez de tabela temporária: `create temporary table` falharia se a
  -- função fosse chamada duas vezes na mesma transação.)
  select jsonb_agg(jsonb_build_object('produto_id', produto_id, 'quantidade', quantidade))
  into v_itens
  from (
    select (elemento ->> 'produto_id')::uuid as produto_id,
           sum((elemento ->> 'quantidade')::integer) as quantidade
    from jsonb_array_elements(p_itens) as elemento
    group by 1
  ) agrupado;

  if exists (
    select 1 from jsonb_to_recordset(v_itens) as x(produto_id uuid, quantidade integer)
    where produto_id is null or quantidade <= 0
  ) then
    raise exception 'Quantidade inválida em um dos itens da venda.' using errcode = '22023';
  end if;

  -- A operação já foi validada: a baixa de estoque abaixo é do servidor, então
  -- não exige `gerenciar_estoque` do vendedor (ver 0019).
  perform app.marcar_operacao_confiavel();
  perform app.definir_contexto('venda.registrada');

  -- 1ª passada: trava as linhas, valida e soma o subtotal com o preço do BANCO.
  for v_item in
    select * from jsonb_to_recordset(v_itens) as x(produto_id uuid, quantidade integer)
    order by produto_id
  loop
    select * into v_produto from public.produtos where id = v_item.produto_id for update;

    if not found or v_produto.empresa_id <> v_empresa then
      raise exception 'Produto não encontrado.' using errcode = '23503';
    end if;

    -- Seção 8.4 — arquivado e excluído somem da busca de venda.
    if v_produto.ciclo_vida <> 'ativo' then
      raise exception 'O produto "%" não está disponível para venda.', v_produto.nome
        using errcode = '22023';
    end if;

    -- Seção 8.1 — a divergência é tratada na tela, mas o servidor é a última
    -- palavra: outro caixa pode ter vendido a mesma peça no meio do caminho.
    if v_produto.estoque_atual < v_item.quantidade then
      raise exception 'Quantidade insuficiente no estoque.'
        using errcode = '22023',
              detail = format('%s: disponível %s, solicitado %s',
                              v_produto.nome, v_produto.estoque_atual, v_item.quantidade);
    end if;

    v_subtotal := v_subtotal + (v_produto.preco * v_item.quantidade);
  end loop;

  -- Seção 7.3 — desconto por percentual ou valor fixo, sem teto na V1, mas
  -- nunca deixando o total negativo. O valor em reais é calculado AQUI, não
  -- no cliente.
  if p_desconto_tipo is not null and coalesce(p_desconto_valor, 0) > 0 then
    if p_desconto_tipo = 'percentual' then
      if p_desconto_valor > 100 then
        raise exception 'O desconto não pode passar de 100%%.' using errcode = '22023';
      end if;
      v_desconto := round(v_subtotal * p_desconto_valor / 100.0, 2);
    else
      v_desconto := round(p_desconto_valor, 2);
    end if;

    if v_desconto > v_subtotal then
      raise exception 'O desconto não pode ser maior que o valor da venda.' using errcode = '22023';
    end if;
  end if;

  v_total := v_subtotal - v_desconto;

  insert into public.vendas (
    empresa_id, usuario_id, status, subtotal, desconto_tipo, desconto, total, forma_pagamento
  )
  values (
    v_empresa, v_usuario, 'confirmada', v_subtotal,
    case when v_desconto > 0 then p_desconto_tipo else null end,
    v_desconto, v_total, p_forma_pagamento
  )
  returning id into v_venda_id;

  insert into public.venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
  select v_venda_id, i.produto_id, i.quantidade, p.preco, p.preco * i.quantidade
  from jsonb_to_recordset(v_itens) as i(produto_id uuid, quantidade integer)
  join public.produtos p on p.id = i.produto_id;

  update public.produtos p
  set estoque_atual = p.estoque_atual - i.quantidade
  from jsonb_to_recordset(v_itens) as i(produto_id uuid, quantidade integer)
  where p.id = i.produto_id;

  -- Seção 8.6 — toda venda confirmada gera automaticamente uma entrada.
  insert into public.movimentacoes_financeiras (
    empresa_id, tipo, valor, descricao, origem, venda_id, criado_por
  )
  values (v_empresa, 'entrada', v_total, 'Venda registrada', 'venda', v_venda_id, v_usuario);

  return jsonb_build_object(
    'venda_id', v_venda_id,
    'subtotal', v_subtotal,
    'desconto', v_desconto,
    'total', v_total
  );
end;
$$;

revoke execute on function public.registrar_venda(
  jsonb, public.forma_pagamento_venda, public.desconto_tipo, numeric) from public, anon;
grant execute on function public.registrar_venda(
  jsonb, public.forma_pagamento_venda, public.desconto_tipo, numeric) to authenticated;
