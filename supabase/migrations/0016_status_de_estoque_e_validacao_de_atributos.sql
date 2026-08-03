-- =============================================================================
-- 0016 — Status computado de estoque e validação dos campos personalizados
-- Especificação: Seções 4.5, 4.6, 8.2, 8.3
-- =============================================================================

-- Seção 8.3 — o status NÃO é coluna armazenada: é derivado em tempo de leitura
-- de estoque_atual, estoque_referencia_alerta e empresas.alerta_estoque_percentual.
create type public.status_estoque as enum ('disponivel', 'estoque_baixo', 'esgotado');

-- View de leitura das telas de Estoque (7.5) e Estoque Baixo (7.6).
-- `security_invoker` faz a view respeitar a RLS de `produtos` do usuário que
-- consulta — sem isso ela rodaria com os privilégios do dono e furaria o
-- isolamento por empresa.
create view public.produtos_com_status
with (security_invoker = on) as
select
  p.id,
  p.empresa_id,
  p.nome,
  p.codigo,
  p.categoria_id,
  c.nome as categoria_nome,
  p.preco,
  p.estoque_atual,
  p.estoque_referencia_alerta,
  p.ciclo_vida,
  p.atributos,
  p.criado_por,
  p.criado_em,
  p.atualizado_em,
  (case
     when p.estoque_atual = 0 then 'esgotado'
     when p.estoque_referencia_alerta > 0
      and p.estoque_atual <= (p.estoque_referencia_alerta * e.alerta_estoque_percentual / 100.0)
       then 'estoque_baixo'
     else 'disponivel'
   end)::public.status_estoque as status_estoque,
  -- Seção 8.3 — "percentual restante do estoque" exibido na lista de alerta.
  (case
     when p.estoque_referencia_alerta > 0
       then round(p.estoque_atual::numeric * 100 / p.estoque_referencia_alerta)
     else null
   end) as percentual_restante
from public.produtos p
join public.empresas e on e.id = p.empresa_id
left join public.categorias_produto c on c.id = p.categoria_id;

grant select on public.produtos_com_status to authenticated;

-- -----------------------------------------------------------------------------
-- Seções 4.6 e 8.2 — os campos personalizados marcados como `obrigatorio` são
-- exigidos no cadastro, INCLUSIVE no cadastro rápido durante a venda.
--
-- A validação vive aqui, no banco, e não no formulário: um cliente modificado
-- não consegue gravar produto sem os campos que a empresa exige, nem inventar
-- uma chave de atributo que não corresponde a nenhum campo ativo.
-- -----------------------------------------------------------------------------
create or replace function app.produtos_validar_atributos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chave text;
  v_campo record;
  v_valor jsonb;
  v_texto text;
begin
  -- Operações do backend (service_role/Edge Function) não passam por aqui.
  if (select auth.uid()) is null then
    return new;
  end if;

  if jsonb_typeof(new.atributos) <> 'object' then
    raise exception 'Os atributos do produto devem ser um objeto.' using errcode = '22023';
  end if;

  -- 1. Toda chave enviada precisa corresponder a um campo ATIVO da empresa.
  --    Campo desativado some do cadastro para todos, imediatamente (Seção 4.6).
  for v_chave in select jsonb_object_keys(new.atributos) loop
    if not exists (
      select 1
      from public.empresa_campos_produto ecp
      join public.campos_produto_disponiveis c on c.id = ecp.campo_id
      where ecp.empresa_id = new.empresa_id
        and ecp.ativo
        and c.chave = v_chave
    ) then
      raise exception 'O campo "%" não está ativo no cadastro de produtos desta empresa.', v_chave
        using errcode = '22023';
    end if;
  end loop;

  -- 2. Campos ativos: obrigatoriedade e tipo.
  for v_campo in
    select c.chave, c.nome_exibicao, c.tipo_campo, c.opcoes, ecp.obrigatorio
    from public.empresa_campos_produto ecp
    join public.campos_produto_disponiveis c on c.id = ecp.campo_id
    where ecp.empresa_id = new.empresa_id and ecp.ativo
  loop
    v_valor := new.atributos -> v_campo.chave;

    -- Ausente, nulo ou string vazia contam como não preenchido.
    if v_valor is null
       or jsonb_typeof(v_valor) = 'null'
       or (jsonb_typeof(v_valor) = 'string' and btrim(v_valor #>> '{}') = '') then
      if v_campo.obrigatorio then
        raise exception 'O campo "%" é obrigatório.', v_campo.nome_exibicao using errcode = '22023';
      end if;
      continue;
    end if;

    if v_campo.tipo_campo = 'numero' then
      if jsonb_typeof(v_valor) <> 'number' then
        raise exception 'O campo "%" deve ser um número.', v_campo.nome_exibicao
          using errcode = '22023';
      end if;

    elsif v_campo.tipo_campo = 'booleano' then
      if jsonb_typeof(v_valor) <> 'boolean' then
        raise exception 'O campo "%" deve ser sim ou não.', v_campo.nome_exibicao
          using errcode = '22023';
      end if;

    elsif v_campo.tipo_campo = 'selecao' then
      if not (coalesce(v_campo.opcoes, '[]'::jsonb) @> jsonb_build_array(v_valor #>> '{}')) then
        raise exception 'O valor informado em "%" não é uma opção válida.', v_campo.nome_exibicao
          using errcode = '22023';
      end if;

    elsif v_campo.tipo_campo = 'data' then
      v_texto := v_valor #>> '{}';
      begin
        perform v_texto::date;
      exception when others then
        raise exception 'O campo "%" deve conter uma data válida.', v_campo.nome_exibicao
          using errcode = '22023';
      end;
    end if;
  end loop;

  return new;
end;
$$;

create trigger produtos_validar_atributos
  before insert or update of atributos, empresa_id on public.produtos
  for each row execute function app.produtos_validar_atributos();
