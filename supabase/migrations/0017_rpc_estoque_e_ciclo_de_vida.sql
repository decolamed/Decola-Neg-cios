-- =============================================================================
-- 0017 — RPCs de estoque e ciclo de vida do produto
-- Especificação: Seções 4.6, 7.5, 7.6, 8.1, 8.3, 8.4
--
-- Toda função revalida permissão e estado da conta, mesmo que a interface já
-- tenha validado. O ajuste de estoque não é um UPDATE solto: ele recalcula a
-- referência do ciclo de alerta e nomeia a ação na auditoria.
--
-- Nota de ordem: `criar_campo_personalizado` usa `public.unaccent_simples`,
-- criada em 0018. Corpos plpgsql resolvem referências em tempo de execução,
-- então a ordem das migrations não quebra a criação.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Seções 7.5, 7.6, 8.1 e 8.3 — ajuste de estoque.
--
--   p_quantidade > 0 ... entrada
--   p_quantidade < 0 ... saída (exige motivo — Seção 7.5)
--
--   p_tipo = 'reposicao'    → recalcula `estoque_referencia_alerta` para a nova
--                             quantidade, iniciando um novo ciclo de alerta
--                             (Seção 8.3)
--   p_tipo = 'divergencia'  → correção de contagem durante a venda (Seção 8.1):
--                             soma ao estoque SEM reiniciar o ciclo, porque não
--                             é uma reposição de mercadoria
--   p_tipo = 'reducao_manual' → baixa manual (perda, dano, ajuste de contagem)
-- -----------------------------------------------------------------------------
create or replace function public.ajustar_estoque(
  p_produto_id uuid,
  p_quantidade integer,
  p_motivo text default null,
  p_tipo text default 'reposicao'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produto public.produtos%rowtype;
  v_novo integer;
  v_nova_referencia integer;
  v_acao text;
begin
  if p_tipo not in ('reposicao', 'divergencia', 'reducao_manual') then
    raise exception 'Tipo de ajuste inválido.' using errcode = '22023';
  end if;

  if p_quantidade = 0 then
    raise exception 'Informe uma quantidade diferente de zero.' using errcode = '22023';
  end if;

  select * into v_produto from public.produtos where id = p_produto_id for update;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = '23503';
  end if;

  -- Seções 5.3 e 8.1 — ajustar estoque exige `gerenciar_estoque`. O Gestor tem
  -- por padrão; o Funcionário só se o Gestor liberar individualmente.
  if not app.pode_escrever(v_produto.empresa_id, 'gerenciar_estoque') then
    raise exception 'Você não tem permissão para alterar o estoque.' using errcode = '42501';
  end if;

  -- Seção 7.5 — a redução manual exige motivo obrigatório, por consistência
  -- com a rastreabilidade já exigida na divergência de estoque.
  if p_quantidade < 0 and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da redução de estoque.' using errcode = '22023';
  end if;

  v_novo := v_produto.estoque_atual + p_quantidade;

  -- Seção 8.1 — o estoque nunca fica negativo.
  if v_novo < 0 then
    raise exception 'O estoque não pode ficar negativo. Disponível: % unidade(s).',
      v_produto.estoque_atual using errcode = '22023';
  end if;

  if p_tipo = 'reposicao' and p_quantidade > 0 then
    -- Seção 8.3 — a referência acompanha a nova quantidade total, mesmo que a
    -- reposição não devolva o produto à quantidade inicial. Começa um ciclo.
    v_nova_referencia := v_novo;
    v_acao := 'estoque.reposicao';
  elsif p_tipo = 'divergencia' then
    v_nova_referencia := greatest(v_produto.estoque_referencia_alerta, v_novo);
    v_acao := 'estoque.divergencia_ajustada';
  else
    v_nova_referencia := v_produto.estoque_referencia_alerta;
    v_acao := case when p_quantidade < 0 then 'estoque.reducao_manual' else 'estoque.entrada' end;
  end if;

  perform app.definir_contexto(v_acao, p_motivo);

  update public.produtos
  set estoque_atual = v_novo,
      estoque_referencia_alerta = v_nova_referencia
  where id = p_produto_id;

  return jsonb_build_object(
    'produto_id', p_produto_id,
    'estoque_anterior', v_produto.estoque_atual,
    'estoque_atual', v_novo,
    'estoque_referencia_alerta', v_nova_referencia
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Seção 8.4 — ciclo de vida do produto.
-- Nenhum estado apaga o registro do banco.
--   arquivado: reversível pela interface
--   excluido:  NÃO reversível pela interface; some de todas as listas
-- -----------------------------------------------------------------------------
create or replace function app.alterar_ciclo_de_vida_produto(
  p_produto_id uuid,
  p_destino public.ciclo_vida,
  p_acao text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_produto public.produtos%rowtype;
begin
  select * into v_produto from public.produtos where id = p_produto_id for update;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = '23503';
  end if;

  if not app.pode_escrever(v_produto.empresa_id, 'excluir_produto') then
    raise exception 'Você não tem permissão para arquivar ou excluir produtos.'
      using errcode = '42501';
  end if;

  -- Um produto excluído não volta pela interface (Seção 8.4).
  if v_produto.ciclo_vida = 'excluido' then
    raise exception 'Este produto foi excluído e não pode mais ser alterado.'
      using errcode = '22023';
  end if;

  if v_produto.ciclo_vida = p_destino then
    return;
  end if;

  perform app.definir_contexto(p_acao);

  update public.produtos set ciclo_vida = p_destino where id = p_produto_id;
end;
$$;

create or replace function public.arquivar_produto(p_produto_id uuid)
returns void language sql security definer set search_path = '' as $$
  select app.alterar_ciclo_de_vida_produto(p_produto_id, 'arquivado', 'produto.arquivado');
$$;

create or replace function public.restaurar_produto(p_produto_id uuid)
returns void language sql security definer set search_path = '' as $$
  select app.alterar_ciclo_de_vida_produto(p_produto_id, 'ativo', 'produto.restaurado');
$$;

create or replace function public.excluir_produto(p_produto_id uuid)
returns void language sql security definer set search_path = '' as $$
  select app.alterar_ciclo_de_vida_produto(p_produto_id, 'excluido', 'produto.excluido');
$$;

-- -----------------------------------------------------------------------------
-- Seção 4.6 — o Gestor cria campos personalizados simples.
-- A chave técnica é derivada aqui, no servidor: o cliente não escolhe a chave,
-- o que evita colisão com campo do sistema e chave em formato inválido.
-- -----------------------------------------------------------------------------
create or replace function public.criar_campo_personalizado(
  p_nome_exibicao text,
  p_tipo public.tipo_campo,
  p_opcoes jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_chave text;
  v_base text;
  v_sufixo integer := 1;
  v_campo_id uuid;
  v_ordem integer;
begin
  if not app.pode_escrever_como_gestor(v_empresa) then
    raise exception 'Você não tem permissão para criar campos de produto.'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_nome_exibicao), '') = '' then
    raise exception 'Informe o nome do campo.' using errcode = '22023';
  end if;

  if p_tipo = 'selecao'
     and (p_opcoes is null or jsonb_typeof(p_opcoes) <> 'array' or jsonb_array_length(p_opcoes) = 0)
  then
    raise exception 'Um campo de seleção precisa de pelo menos uma opção.' using errcode = '22023';
  end if;

  -- Slug: minúsculas, sem acento, espaços viram "_".
  v_base := regexp_replace(
    lower(public.unaccent_simples(btrim(p_nome_exibicao))),
    '[^a-z0-9]+', '_', 'g'
  );
  v_base := btrim(v_base, '_');

  if v_base = '' or v_base !~ '^[a-z]' then
    v_base := 'campo_' || v_base;
    v_base := btrim(v_base, '_');
  end if;

  v_chave := v_base;
  while exists (
    select 1 from public.campos_produto_disponiveis c
    where c.chave = v_chave and (c.empresa_id is null or c.empresa_id = v_empresa)
  ) loop
    v_sufixo := v_sufixo + 1;
    v_chave := v_base || '_' || v_sufixo;
  end loop;

  insert into public.campos_produto_disponiveis (chave, nome_exibicao, tipo_campo, opcoes, empresa_id)
  values (
    v_chave, btrim(p_nome_exibicao), p_tipo,
    case when p_tipo = 'selecao' then p_opcoes else null end,
    v_empresa
  )
  returning id into v_campo_id;

  select coalesce(max(ordem), 0) + 1 into v_ordem
  from public.empresa_campos_produto where empresa_id = v_empresa;

  -- Um campo recém-criado já entra ativo — foi criado justamente para ser usado.
  insert into public.empresa_campos_produto (empresa_id, campo_id, ativo, obrigatorio, ordem)
  values (v_empresa, v_campo_id, true, false, v_ordem);

  perform app.registrar_log(
    v_empresa, 'campo_produto.criado', 'campo_produto', v_campo_id, null,
    jsonb_build_object('chave', v_chave, 'nome_exibicao', btrim(p_nome_exibicao), 'tipo', p_tipo)
  );

  return v_campo_id;
end;
$$;

revoke execute on function public.ajustar_estoque(uuid, integer, text, text) from public, anon;
revoke execute on function public.arquivar_produto(uuid) from public, anon;
revoke execute on function public.restaurar_produto(uuid) from public, anon;
revoke execute on function public.excluir_produto(uuid) from public, anon;
revoke execute on function public.criar_campo_personalizado(text, public.tipo_campo, jsonb) from public, anon;

grant execute on function public.ajustar_estoque(uuid, integer, text, text) to authenticated;
grant execute on function public.arquivar_produto(uuid) to authenticated;
grant execute on function public.restaurar_produto(uuid) to authenticated;
grant execute on function public.excluir_produto(uuid) to authenticated;
grant execute on function public.criar_campo_personalizado(text, public.tipo_campo, jsonb) to authenticated;
