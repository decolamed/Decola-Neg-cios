-- 0048 — "Meus pedidos" na vitrine, com o telefone como identidade.
--
-- O PROBLEMA REAL. Hoje o único caminho de volta a um pedido é o link que o
-- cliente recebeu. Se ele apagou a conversa do WhatsApp, o pedido some para
-- ele — e a loja recebe uma ligação perguntando "cadê o meu".
--
-- POR QUE O TELEFONE E NÃO UM CADASTRO. A loja é sem login de propósito: pedir
-- que alguém crie conta para comprar um shampoo derruba a venda. Mas o
-- telefone JÁ é obrigatório no checkout, já identifica a pessoa para a loja, e
-- é por ele que a loja fala com ela. Ele é a identidade natural aqui.
--
-- O QUE FAZ ISTO SER SEGURO. Não basta DIGITAR o telefone: seria só teclar o
-- número do vizinho para ver o que ele comprou e onde mora. O telefone tem de
-- estar VERIFICADO — quem responde por isso é o Supabase Auth, que confirma o
-- número por código antes de emitir a sessão. Esta função lê o telefone de
-- dentro do token, `auth.jwt() ->> 'phone'`, que o cliente não consegue forjar.
-- Digitar o número em qualquer campo desta tela não devolve nada.

-- =============================================================================
-- Comparação de telefone
-- =============================================================================
-- O checkout guarda o que a pessoa digitou — "(81) 99999-9999", "81 99999
-- 9999", "+5581999999999". O Auth entrega E.164 sem o "+". Comparar as duas
-- coisas exige reduzi-las à mesma forma: só dígitos, com o código do país.

create or replace function app.telefone_comparavel(telefone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when telefone is null then null
    -- Já veio com o país (12 ou 13 dígitos começando em 55): mantém.
    when length(regexp_replace(telefone, '[^0-9]', '', 'g')) in (12, 13)
     and left(regexp_replace(telefone, '[^0-9]', '', 'g'), 2) = '55'
      then regexp_replace(telefone, '[^0-9]', '', 'g')
    -- DDD + número (10 ou 11 dígitos): acrescenta o país.
    when length(regexp_replace(telefone, '[^0-9]', '', 'g')) in (10, 11)
      then '55' || regexp_replace(telefone, '[^0-9]', '', 'g')
    else regexp_replace(telefone, '[^0-9]', '', 'g')
  end;
$$;

comment on function app.telefone_comparavel(text) is
  'Telefone reduzido a dígitos com o código do país, para comparar o que o '
  'cliente digitou no checkout com o número verificado pelo Auth.';

grant execute on function app.telefone_comparavel(text) to anon, authenticated;

-- Sem este índice, "meus pedidos" varre a tabela inteira de todas as lojas.
create index if not exists pedidos_telefone_comparavel_idx
  on public.pedidos (app.telefone_comparavel(cliente_telefone));

-- =============================================================================
-- A consulta
-- =============================================================================

create or replace function public.vitrine_meus_pedidos(p_loja_slug text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telefone text := app.telefone_comparavel(
    nullif(btrim(coalesce((select auth.jwt() ->> 'phone'), '')), '')
  );
  v_lista jsonb;
begin
  -- Sem telefone VERIFICADO não há resposta. Nem lista vazia com desculpa: o
  -- chamador precisa distinguir "você não entrou" de "você não tem pedidos".
  if v_telefone is null then
    raise exception 'Entre com seu telefone para ver seus pedidos.'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'numero',      p.numero,
        'token',       p.token,
        'status',      p.status,
        'modalidade',  p.modalidade,
        'pagamento',   p.pagamento,
        'subtotal',    p.subtotal,
        'criado_em',   p.criado_em,
        'loja_nome',   coalesce(nullif(btrim(e.loja_nome), ''), e.nome),
        'loja_slug',   e.loja_slug,
        'itens',       (select count(*) from public.pedido_itens i where i.pedido_id = p.id)
      )
      order by p.criado_em desc
    ),
    '[]'::jsonb
  )
  into v_lista
  from public.pedidos p
  join public.empresas e on e.id = p.empresa_id
  where app.telefone_comparavel(p.cliente_telefone) = v_telefone
    -- Sem loja informada, devolve os pedidos de todas as lojas do cliente:
    -- é a mesma pessoa, e ela não deveria precisar lembrar por qual link
    -- comprou.
    and (p_loja_slug is null or lower(e.loja_slug) = lower(p_loja_slug));

  return v_lista;
end;
$$;

comment on function public.vitrine_meus_pedidos(text) is
  'Pedidos do telefone VERIFICADO de quem chama (auth.jwt()->>phone). Digitar '
  'um número em qualquer campo não alcança esta função: o número vem de '
  'dentro do token, emitido pelo Auth só depois da confirmação por código.';

-- `anon` não tem telefone verificado e receberia sempre a exceção acima;
-- deixar de fora evita anunciar uma porta que não abre.
revoke execute on function public.vitrine_meus_pedidos(text) from public, anon;
grant  execute on function public.vitrine_meus_pedidos(text) to authenticated;
