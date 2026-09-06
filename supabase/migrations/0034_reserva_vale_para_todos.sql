-- =============================================================================
-- A reserva passa a valer para TODA saída, inclusive a venda de balcão
--
-- Correção de uma decisão anterior. A 0032 deixou `registrar_venda` olhando só
-- `estoque_atual`, para não bloquear quem está fisicamente na loja. O efeito
-- colateral é pior que o problema: prometer uma unidade a um cliente online e
-- deixá-la sair no balcão sem nenhum aviso.
--
-- A regra agora é uma só, em todo lugar:
--
--     disponível = estoque_atual - estoque_reservado
--
-- `estoque_atual` continua sendo estoque físico — isso não muda, e é o que
-- mantém honestos o relatório, o alerta de reposição e o inventário. O que
-- muda é quem pode consumir a diferença: ninguém, enquanto a reserva existir.
--
-- A mensagem de recusa no balcão mostra as três parcelas (físico, reservado,
-- disponível). Sem isso, o vendedor vê a mercadoria na prateleira e uma
-- recusa sem explicação — e o próximo passo dele seria desconfiar do sistema.
--
-- O QUE **NÃO** MUDA: `ajustar_estoque`. Correção de contagem e reposição
-- registram a realidade física, e a realidade não pode ser barrada por uma
-- reserva. Se um ajuste para baixo deixar `estoque_reservado` maior que o
-- físico, o pedido afetado falha na finalização com o nome do produto — e o
-- gestor decide. Bloquear o ajuste esconderia o problema em vez de mostrá-lo.
--
-- SOBRESCRITA CONSCIENTE. Não existe ainda, de propósito. Quando existir, o
-- lugar é uma RPC própria — algo como `liberar_reserva(pedido, motivo)`, que
-- cancela o pedido e avisa o cliente. O que não pode é a reserva ser ignorada
-- em silêncio, que é exatamente o que esta migration corrige.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Expiração de reserva — estrutura, sem automação
--
-- Um pedido "pagar na retirada" ou uma solicitação de entrega podem ficar
-- pendentes indefinidamente, segurando estoque de alguém que talvez nunca
-- apareça. A janela fica configurável por empresa e NASCE DESLIGADA (`null`):
-- cancelar pedido de cliente automaticamente é decisão de negócio, não padrão
-- técnico.
-- -----------------------------------------------------------------------------
alter table public.empresas
  add column reserva_horas integer;

alter table public.empresas
  add constraint empresas_reserva_horas_positiva
  check (reserva_horas is null or reserva_horas > 0);

comment on column public.empresas.reserva_horas is
  'Horas que um pedido em aberto segura estoque. NULL = reserva não expira. '
  'Alimenta pedidos.reserva_expira_em no momento da criação.';

alter table public.pedidos
  add column reserva_expira_em timestamptz;

comment on column public.pedidos.reserva_expira_em is
  'Quando a reserva deste pedido deixa de valer. Congelado na criação a partir '
  'de empresas.reserva_horas — mudar a configuração não reescreve pedidos que '
  'o cliente já fez sob a regra anterior.';

-- Índice só sobre o que interessa à varredura: pedido em aberto e com prazo.
create index pedidos_reserva_a_vencer
  on public.pedidos (reserva_expira_em)
  where reserva_expira_em is not null and status not in ('finalizado', 'cancelado');

-- -----------------------------------------------------------------------------
-- A varredura.
--
-- Existe e funciona; só não está agendada. Agendar é uma linha de pg_cron,
-- como já se faz com `processar_assinaturas` (0026) — de propósito fica para
-- quando alguém decidir ligar a expiração.
--
-- Cancelar é o caminho certo, e não "só devolver a reserva": um pedido que
-- perdeu a reserva mas continua em aberto poderia ser finalizado sem estoque.
-- O motivo fica gravado, então o gestor entende o que aconteceu.
-- -----------------------------------------------------------------------------
create or replace function public.expirar_reservas_vencidas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido record;
  v_total integer := 0;
begin
  perform app.marcar_operacao_confiavel();

  for v_pedido in
    select id, empresa_id, numero
    from public.pedidos
    where reserva_expira_em is not null
      and reserva_expira_em < now()
      and status not in ('finalizado', 'cancelado')
    for update skip locked
  loop
    update public.produtos p
    set estoque_reservado = greatest(p.estoque_reservado - i.quantidade, 0)
    from public.pedido_itens i
    where i.pedido_id = v_pedido.id and p.id = i.produto_id;

    update public.pedidos
    set status = 'cancelado',
        cancelado_em = now(),
        motivo_cancelamento = 'Reserva expirada sem confirmação'
    where id = v_pedido.id;

    perform app.notificar_pedido(
      v_pedido.empresa_id,
      'Pedido cancelado por tempo',
      format('O pedido #%s ficou pendente além do prazo e a reserva foi liberada.',
             v_pedido.numero)
    );

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.expirar_reservas_vencidas() from public, anon, authenticated;
grant  execute on function public.expirar_reservas_vencidas() to service_role;

-- -----------------------------------------------------------------------------
-- `registrar_venda` — a única alteração é a checagem de disponibilidade.
--
-- O corpo é o mesmo de 0020; reproduzido inteiro porque `create or replace`
-- não permite trocar um trecho.
-- -----------------------------------------------------------------------------
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
  if not app.pode_escrever(v_empresa) then
    raise exception 'Não é possível registrar vendas com a conta neste estado.'
      using errcode = '42501';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione ao menos um produto à venda.' using errcode = '22023';
  end if;

  -- Agrupa por produto para tolerar o mesmo item repetido no carrinho.
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

    if v_produto.ciclo_vida <> 'ativo' then
      raise exception 'O produto "%" não está disponível para venda.', v_produto.nome
        using errcode = '22023';
    end if;

    -- A MUDANÇA. O que a venda pode consumir é o disponível, não o físico:
    -- unidade reservada para pedido da loja não sai pelo balcão sem que
    -- alguém libere a reserva.
    if (v_produto.estoque_atual - v_produto.estoque_reservado) < v_item.quantidade then
      raise exception 'Quantidade insuficiente no estoque.'
        using errcode = '22023',
              detail = format(
                '%s: disponível %s (%s em estoque, %s reservado para pedidos da loja), solicitado %s',
                v_produto.nome,
                greatest(v_produto.estoque_atual - v_produto.estoque_reservado, 0),
                v_produto.estoque_atual, v_produto.estoque_reservado, v_item.quantidade);
    end if;

    v_subtotal := v_subtotal + (v_produto.preco * v_item.quantidade);
  end loop;

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

-- -----------------------------------------------------------------------------
-- O prazo é carimbado por trigger, não pela RPC.
--
-- Assim vale para qualquer caminho que crie pedido — hoje só a vitrine, mas
-- amanhã pode haver outro — e a RPC não precisa ser reescrita inteira só para
-- ler mais uma coluna. O `if` no começo permite que um chamador defina um
-- prazo próprio sem que o padrão o sobrescreva.
-- -----------------------------------------------------------------------------
create or replace function app.pedidos_definir_expiracao_reserva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_horas integer;
begin
  if new.reserva_expira_em is not null then
    return new;
  end if;

  select e.reserva_horas into v_horas from public.empresas e where e.id = new.empresa_id;

  if v_horas is not null then
    new.reserva_expira_em := now() + make_interval(hours => v_horas);
  end if;

  return new;
end;
$$;

create trigger pedidos_expiracao_reserva
  before insert on public.pedidos
  for each row execute function app.pedidos_definir_expiracao_reserva();
