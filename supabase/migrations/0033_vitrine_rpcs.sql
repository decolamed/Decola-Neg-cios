-- =============================================================================
-- Vitrine virtual — regras de negócio
--
-- Nenhuma tabela de pedido tem verbo de escrita para papel de cliente. Tudo
-- passa por aqui, e cada função revalida no servidor o que a tela já validou.
--
-- O cliente da vitrine é ANÔNIMO. Isso muda a checagem: não há permissão a
-- consultar, então o que protege é o recorte — a loja precisa estar pública, o
-- produto precisa estar visível, e a quantidade precisa caber na reserva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Notificação de pedido.
--
-- `app.notificar_gestores` não serve: ela é fixa na categoria `assinatura` e
-- silencia repetições por 20 horas. Pedido é o contrário — cada um precisa
-- aparecer, e dois pedidos iguais em sequência são dois pedidos.
-- -----------------------------------------------------------------------------
create or replace function app.notificar_pedido(
  p_empresa uuid,
  p_titulo  text,
  p_mensagem text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notificacoes (empresa_id, categoria, titulo, mensagem, destinatario_id)
  select p_empresa, 'pedido', p_titulo, p_mensagem, eu.usuario_id
  from public.empresa_usuarios eu
  where eu.empresa_id = p_empresa
    and eu.status = 'ativo'
    and eu.papel in ('gestor_principal', 'gestor')
    and eu.usuario_id is not null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Criar pedido a partir da vitrine — chamável por `anon`.
--
-- `p_itens`: [{ "produto_id": uuid, "quantidade": int }]
--
-- A reserva acontece sob `select ... for update`, o mesmo travamento por linha
-- que `registrar_venda` usa. É isso que resolve dois clientes disputando a
-- última unidade: o segundo espera o primeiro terminar e então enxerga o
-- estoque já comprometido.
-- -----------------------------------------------------------------------------
create or replace function public.vitrine_criar_pedido(
  p_loja_slug            text,
  p_itens                jsonb,
  p_cliente_nome         text,
  p_cliente_telefone     text,
  p_modalidade           public.pedido_modalidade,
  p_pagamento            public.pedido_pagamento,
  p_endereco             text default null,
  p_ciente_custo_entrega boolean default false,
  p_observacao           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa    uuid;
  v_aceita_pix boolean;
  v_itens     jsonb;
  v_item      record;
  v_produto   public.produtos%rowtype;
  v_subtotal  numeric(12,2) := 0;
  v_status    public.pedido_status;
  v_pedido    public.pedidos%rowtype;
begin
  -- A loja precisa estar pública. `vitrine_lojas` já embute empresa ativa e
  -- assinatura vigente: consultar a view em vez de repetir as condições evita
  -- que as duas definições de "loja no ar" saiam de sincronia.
  select l.id, l.aceita_pix into v_empresa, v_aceita_pix from public.vitrine_lojas l
  where lower(l.slug) = lower(btrim(p_loja_slug));

  if v_empresa is null then
    raise exception 'Esta loja não está disponível no momento.' using errcode = 'P0002';
  end if;

  -- Oferecer Pix sem chave cadastrada deixaria o cliente numa tela de pagamento
  -- sem para onde pagar. A vitrine já esconde a opção; aqui ela é recusada de
  -- novo, porque a tela não é onde a regra mora.
  if p_pagamento = 'pix_online' and not v_aceita_pix then
    raise exception 'Esta loja ainda não configurou uma chave Pix. Escolha pagar na retirada.'
      using errcode = '22023';
  end if;

  if btrim(coalesce(p_cliente_nome, '')) = '' then
    raise exception 'Informe seu nome.' using errcode = '22023';
  end if;

  if btrim(coalesce(p_cliente_telefone, '')) = '' then
    raise exception 'Informe um telefone para contato.' using errcode = '22023';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um produto ao carrinho.' using errcode = '22023';
  end if;

  -- Regras de modalidade repetidas aqui, e não só nas constraints: a mensagem
  -- de erro do banco é técnica demais para chegar ao cliente final.
  if p_modalidade = 'entrega' then
    if btrim(coalesce(p_endereco, '')) = '' then
      raise exception 'Informe o endereço completo para a entrega.' using errcode = '22023';
    end if;
    if not p_ciente_custo_entrega then
      raise exception
        'É preciso confirmar que o custo da entrega não está incluso no valor dos produtos.'
        using errcode = '22023';
    end if;
  end if;

  -- Agrupa o mesmo produto repetido, para não travar a mesma linha duas vezes
  -- nem furar a unicidade de item por pedido.
  select jsonb_agg(jsonb_build_object('produto_id', produto_id, 'quantidade', total))
    into v_itens
  from (
    select (i ->> 'produto_id')::uuid as produto_id,
           sum((i ->> 'quantidade')::integer) as total
    from jsonb_array_elements(p_itens) as i
    group by 1
  ) agrupado;

  v_status := case
    when p_modalidade = 'entrega'                             then 'aguardando_negociacao'
    when p_pagamento  = 'pix_online'                          then 'aguardando_pagamento'
    else                                                            'pagamento_na_retirada'
  end;

  insert into public.pedidos (
    empresa_id, status, modalidade, pagamento,
    cliente_nome, cliente_telefone, endereco_entrega, ciente_custo_entrega,
    observacao, subtotal
  )
  values (
    v_empresa, v_status, p_modalidade, p_pagamento,
    btrim(p_cliente_nome), btrim(p_cliente_telefone),
    case when p_modalidade = 'entrega' then btrim(p_endereco) else null end,
    p_ciente_custo_entrega,
    nullif(btrim(coalesce(p_observacao, '')), ''),
    0
  )
  returning * into v_pedido;

  -- A operação já foi validada: o trigger de permissão por coluna não deve
  -- barrar a reserva feita em nome de um visitante sem conta.
  perform app.marcar_operacao_confiavel();

  for v_item in
    select (i ->> 'produto_id')::uuid as produto_id, (i ->> 'quantidade')::integer as quantidade
    from jsonb_array_elements(v_itens) as i
  loop
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'Quantidade inválida em um dos itens.' using errcode = '22023';
    end if;

    select * into v_produto from public.produtos where id = v_item.produto_id for update;

    if not found
       or v_produto.empresa_id <> v_empresa
       or v_produto.ciclo_vida <> 'ativo'
       or not v_produto.visivel_na_loja then
      raise exception 'Um dos produtos não está mais disponível nesta loja.'
        using errcode = 'P0002';
    end if;

    if (v_produto.estoque_atual - v_produto.estoque_reservado) < v_item.quantidade then
      raise exception 'Restam apenas % unidade(s) de "%".',
        greatest(v_produto.estoque_atual - v_produto.estoque_reservado, 0), v_produto.nome
        using errcode = '23514';
    end if;

    update public.produtos
    set estoque_reservado = estoque_reservado + v_item.quantidade
    where id = v_produto.id;

    insert into public.pedido_itens (
      pedido_id, produto_id, nome_produto, preco_unitario, quantidade, subtotal
    )
    values (
      v_pedido.id, v_produto.id, v_produto.nome, v_produto.preco,
      v_item.quantidade, v_produto.preco * v_item.quantidade
    );

    v_subtotal := v_subtotal + (v_produto.preco * v_item.quantidade);
  end loop;

  update public.pedidos set subtotal = v_subtotal where id = v_pedido.id;

  perform app.notificar_pedido(
    v_empresa,
    'Novo pedido na loja virtual',
    format('Pedido #%s de %s — %s.',
           v_pedido.numero, btrim(p_cliente_nome),
           case when p_modalidade = 'entrega' then 'entrega a combinar'
                when p_pagamento = 'pix_online' then 'retirada, aguardando pagamento Pix'
                else 'retirada, paga no balcão' end)
  );

  return jsonb_build_object(
    'pedido_id', v_pedido.id,
    'numero',    v_pedido.numero,
    'token',     v_pedido.token,
    'status',    v_status,
    'subtotal',  v_subtotal
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Acompanhamento pelo cliente — chamável por `anon`.
--
-- O token é o segredo: quem tem o link vê aquele pedido e só aquele. Sem isso,
-- acompanhar o pedido exigiria criar conta, o que contraria a vitrine sem
-- login.
-- -----------------------------------------------------------------------------
create or replace function public.vitrine_consultar_pedido(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'numero',            p.numero,
    'status',            p.status,
    'modalidade',        p.modalidade,
    'pagamento',         p.pagamento,
    'cliente_nome',      p.cliente_nome,
    'endereco_entrega',  p.endereco_entrega,
    'subtotal',          p.subtotal,
    'criado_em',         p.criado_em,
    'loja', jsonb_build_object(
      'nome',      e.nome,
      'whatsapp',  e.whatsapp,
      'endereco',  e.endereco,
      'chave_pix', case when p.pagamento = 'pix_online' then e.chave_pix else null end
    ),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nome',       i.nome_produto,
        'quantidade', i.quantidade,
        'preco',      i.preco_unitario,
        'subtotal',   i.subtotal
      ) order by i.nome_produto)
      from public.pedido_itens i where i.pedido_id = p.id
    ), '[]'::jsonb)
  )
  into v
  from public.pedidos p
  join public.empresas e on e.id = p.empresa_id
  where p.token = p_token;

  if v is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Confirmação manual do Pix.
--
-- Nunca automática: o clique do cliente em "já paguei" apenas avisa. Quem diz
-- que o dinheiro entrou é quem olhou a conta.
-- -----------------------------------------------------------------------------
create or replace function public.pedido_confirmar_pagamento(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  if not app.pode_escrever_como_gestor(v_pedido.empresa_id) then
    raise exception 'Você não tem permissão para confirmar pagamentos.' using errcode = '42501';
  end if;

  if v_pedido.status <> 'aguardando_pagamento' then
    raise exception 'Este pedido não está aguardando confirmação de pagamento.'
      using errcode = '22023';
  end if;

  update public.pedidos
  set status = 'pagamento_confirmado',
      pagamento_confirmado_em = now(),
      pagamento_confirmado_por = (select auth.uid())
  where id = p_pedido_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Avanço de status.
--
-- As transições permitidas ficam aqui, e não na tela: é o banco que impede um
-- pedido de pular etapa. `finalizado` e `cancelado` têm função própria, porque
-- mexem em estoque — não são só mudança de rótulo.
-- -----------------------------------------------------------------------------
create or replace function public.pedido_atualizar_status(
  p_pedido_id uuid,
  p_status    public.pedido_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_permitido boolean;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  if not app.pode_escrever_como_gestor(v_pedido.empresa_id) then
    raise exception 'Você não tem permissão para alterar pedidos.' using errcode = '42501';
  end if;

  if p_status in ('finalizado', 'cancelado') then
    raise exception 'Use a finalização ou o cancelamento do pedido para este passo.'
      using errcode = '22023';
  end if;

  v_permitido := case v_pedido.status
    when 'aguardando_pagamento'   then p_status = 'pagamento_confirmado'
    when 'pagamento_confirmado'   then p_status = 'pronto_para_retirada'
    when 'pagamento_na_retirada'  then p_status = 'pronto_para_retirada'
    when 'aguardando_negociacao'  then p_status = 'entrega_combinada'
    when 'entrega_combinada'      then p_status = 'confirmado'
    when 'confirmado'             then p_status = 'em_entrega'
    else false
  end;

  if not v_permitido then
    raise exception 'Não é possível mudar o pedido de "%" para "%".',
      v_pedido.status, p_status using errcode = '22023';
  end if;

  update public.pedidos set status = p_status where id = p_pedido_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cancelamento — devolve a reserva.
--
-- Pedido não é apagado, pelo mesmo princípio das vendas (Seção 8.5): ele muda
-- de status e guarda o motivo.
-- -----------------------------------------------------------------------------
create or replace function public.pedido_cancelar(p_pedido_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  if not app.pode_escrever_como_gestor(v_pedido.empresa_id) then
    raise exception 'Você não tem permissão para cancelar pedidos.' using errcode = '42501';
  end if;

  if v_pedido.status in ('finalizado', 'cancelado') then
    raise exception 'Este pedido já foi encerrado.' using errcode = '22023';
  end if;

  perform app.marcar_operacao_confiavel();

  -- `greatest(...,0)`: a reserva nunca fica negativa, nem se algo já a tiver
  -- devolvido por outro caminho.
  update public.produtos p
  set estoque_reservado = greatest(p.estoque_reservado - i.quantidade, 0)
  from public.pedido_itens i
  where i.pedido_id = p_pedido_id and p.id = i.produto_id;

  update public.pedidos
  set status = 'cancelado',
      cancelado_em = now(),
      cancelado_por = (select auth.uid()),
      motivo_cancelamento = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = p_pedido_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Finalização — é aqui que o pedido vira gestão.
--
-- Cria a venda, os itens, baixa o estoque FÍSICO, libera a reserva e lança a
-- entrada no financeiro. Depois disso o pedido aparece no faturamento como
-- qualquer outra venda, e é o `venda_id` que amarra os dois lados.
--
-- Os itens saem de `pedido_itens`, com o preço congelado no momento do pedido
-- — e não do produto hoje. Cobrar diferente do que o cliente aceitou seria
-- errado, mesmo que a diferença fosse a favor dele.
-- -----------------------------------------------------------------------------
create or replace function public.pedido_finalizar(
  p_pedido_id       uuid,
  p_forma_pagamento public.forma_pagamento_venda default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido  public.pedidos%rowtype;
  v_forma   public.forma_pagamento_venda;
  v_venda   uuid;
  v_usuario uuid := (select auth.uid());
  v_faltando text;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;

  if not app.pode_escrever_como_gestor(v_pedido.empresa_id) then
    raise exception 'Você não tem permissão para finalizar pedidos.' using errcode = '42501';
  end if;

  if v_pedido.status in ('finalizado', 'cancelado') then
    raise exception 'Este pedido já foi encerrado.' using errcode = '22023';
  end if;

  if v_pedido.status = 'aguardando_pagamento' then
    raise exception 'Confirme o pagamento antes de finalizar este pedido.' using errcode = '22023';
  end if;

  -- Os literais precisam do cast explícito: sem ele o CASE devolve `text` e o
  -- COALESCE não casa com o enum, o que só aparece em tempo de execução.
  v_forma := coalesce(
    p_forma_pagamento,
    case when v_pedido.pagamento = 'pix_online'
         then 'pix'::public.forma_pagamento_venda
         else 'outros'::public.forma_pagamento_venda end
  );

  -- Uma venda de balcão pode ter consumido o que este pedido tinha reservado.
  -- Melhor recusar com o nome do produto do que gravar estoque negativo.
  select string_agg(p.nome, ', ') into v_faltando
  from public.pedido_itens i
  join public.produtos p on p.id = i.produto_id
  where i.pedido_id = p_pedido_id and p.estoque_atual < i.quantidade;

  if v_faltando is not null then
    raise exception 'Estoque insuficiente para finalizar: %.', v_faltando using errcode = '23514';
  end if;

  insert into public.vendas (
    empresa_id, usuario_id, status, subtotal, desconto, total, forma_pagamento
  )
  values (
    v_pedido.empresa_id, v_usuario, 'confirmada',
    v_pedido.subtotal, 0, v_pedido.subtotal, v_forma
  )
  returning id into v_venda;

  insert into public.venda_itens (venda_id, produto_id, quantidade, preco_unitario, subtotal)
  select v_venda, i.produto_id, i.quantidade, i.preco_unitario, i.subtotal
  from public.pedido_itens i where i.pedido_id = p_pedido_id;

  perform app.marcar_operacao_confiavel();

  update public.produtos p
  set estoque_atual     = p.estoque_atual - i.quantidade,
      estoque_reservado = greatest(p.estoque_reservado - i.quantidade, 0)
  from public.pedido_itens i
  where i.pedido_id = p_pedido_id and p.id = i.produto_id;

  insert into public.movimentacoes_financeiras (
    empresa_id, tipo, valor, descricao, origem, venda_id, criado_por
  )
  values (
    v_pedido.empresa_id, 'entrada', v_pedido.subtotal,
    format('Pedido #%s da loja virtual', v_pedido.numero), 'venda', v_venda, v_usuario
  );

  update public.pedidos
  set status = 'finalizado', finalizado_em = now(), venda_id = v_venda
  where id = p_pedido_id;

  return jsonb_build_object('venda_id', v_venda, 'total', v_pedido.subtotal);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios
--
-- As duas primeiras são a única porta do visitante anônimo. As demais exigem
-- sessão — e, por dentro, papel de gestor na empresa dona do pedido.
-- -----------------------------------------------------------------------------
revoke execute on function public.vitrine_criar_pedido(
  text, jsonb, text, text, public.pedido_modalidade, public.pedido_pagamento,
  text, boolean, text) from public;
grant execute on function public.vitrine_criar_pedido(
  text, jsonb, text, text, public.pedido_modalidade, public.pedido_pagamento,
  text, boolean, text) to anon, authenticated;

revoke execute on function public.vitrine_consultar_pedido(uuid) from public;
grant  execute on function public.vitrine_consultar_pedido(uuid) to anon, authenticated;

revoke execute on function public.pedido_confirmar_pagamento(uuid) from public, anon;
grant  execute on function public.pedido_confirmar_pagamento(uuid) to authenticated;

revoke execute on function public.pedido_atualizar_status(uuid, public.pedido_status)
  from public, anon;
grant  execute on function public.pedido_atualizar_status(uuid, public.pedido_status)
  to authenticated;

revoke execute on function public.pedido_cancelar(uuid, text) from public, anon;
grant  execute on function public.pedido_cancelar(uuid, text) to authenticated;

revoke execute on function public.pedido_finalizar(uuid, public.forma_pagamento_venda)
  from public, anon;
grant  execute on function public.pedido_finalizar(uuid, public.forma_pagamento_venda)
  to authenticated;
