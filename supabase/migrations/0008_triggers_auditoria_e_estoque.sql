-- =============================================================================
-- 0008 — Triggers: provisionamento de conta, auditoria, permissão por coluna
--        e alertas de estoque
-- Especificação: Seções 4.14, 5.4, 8.3, 9.1, 10.1
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Contexto de ação
-- Permite que uma RPC nomeie a ação que está executando (ex:
-- "estoque.reposicao") para que o trigger genérico de auditoria registre o
-- nome específico em vez de um genérico "produto.editado". O escopo é a
-- transação (`is_local = true`), então não vaza entre requisições.
-- -----------------------------------------------------------------------------
create or replace function app.definir_contexto(p_acao text, p_motivo text default null)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform set_config('decola.acao', coalesce(p_acao, ''), true);
  perform set_config('decola.motivo', coalesce(p_motivo, ''), true);
end;
$$;

create or replace function app.contexto_acao()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('decola.acao', true), '')
$$;

create or replace function app.contexto_motivo()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('decola.motivo', true), '')
$$;

-- -----------------------------------------------------------------------------
-- Seção 9.1 — única porta de escrita em `logs_auditoria`.
-- SECURITY DEFINER porque a tabela não tem política de INSERT para ninguém.
-- -----------------------------------------------------------------------------
create or replace function app.registrar_log(
  p_empresa_id uuid,
  p_acao text,
  p_entidade text,
  p_entidade_id uuid,
  p_dados_anteriores jsonb default null,
  p_dados_novos jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.logs_auditoria (
    empresa_id, usuario_id, acao, entidade, entidade_id,
    dados_anteriores, dados_novos
  )
  values (
    p_empresa_id, (select auth.uid()), p_acao, p_entidade, p_entidade_id,
    p_dados_anteriores, p_dados_novos
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger genérico de auditoria.
-- Argumento 1 = nome da entidade. Deriva a ação de TG_OP, a menos que a
-- transação tenha nomeado uma ação específica via app.definir_contexto().
-- -----------------------------------------------------------------------------
create or replace function app.auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entidade text := tg_argv[0];
  v_acao text;
  v_empresa uuid;
  v_anterior jsonb;
  v_novo jsonb;
  v_motivo text := app.contexto_motivo();
begin
  if tg_op = 'DELETE' then
    v_anterior := to_jsonb(old);
    v_novo := null;
  elsif tg_op = 'INSERT' then
    v_anterior := null;
    v_novo := to_jsonb(new);
  else
    v_anterior := to_jsonb(old);
    v_novo := to_jsonb(new);
    -- Nada mudou de fato: não polui a auditoria.
    if v_anterior = v_novo then
      return coalesce(new, old);
    end if;
  end if;

  v_empresa := coalesce(v_novo, v_anterior) ->> 'empresa_id';

  v_acao := coalesce(
    app.contexto_acao(),
    v_entidade || '.' || case tg_op
      when 'INSERT' then 'criado'
      when 'UPDATE' then 'editado'
      else 'excluido'
    end
  );

  if v_motivo is not null then
    v_novo := coalesce(v_novo, '{}'::jsonb) || jsonb_build_object('_motivo', v_motivo);
  end if;

  perform app.registrar_log(
    v_empresa,
    v_acao,
    v_entidade,
    (coalesce(v_novo, v_anterior) ->> 'id')::uuid,
    v_anterior,
    v_novo
  );

  return coalesce(new, old);
end;
$$;

create trigger produtos_auditoria
  after insert or update on public.produtos
  for each row execute function app.auditar('produto');

create trigger categorias_auditoria
  after insert or update on public.categorias_produto
  for each row execute function app.auditar('categoria');

create trigger empresas_auditoria
  after update on public.empresas
  for each row execute function app.auditar('empresa');

create trigger empresa_usuarios_auditoria
  after insert or update on public.empresa_usuarios
  for each row execute function app.auditar('usuario');

-- Seção 8.6 — edição e exclusão de lançamento manual geram registro de
-- auditoria, preservando a rastreabilidade mesmo quando o valor muda.
create trigger movimentacoes_auditoria
  after insert or update or delete on public.movimentacoes_financeiras
  for each row execute function app.auditar('financeiro.movimentacao');

create trigger vendas_auditoria
  after insert or update on public.vendas
  for each row execute function app.auditar('venda');

-- -----------------------------------------------------------------------------
-- Permissão por coluna em `produtos` (Seção 5.3)
-- Uma política de RLS não consegue comparar OLD com NEW, então a distinção
-- entre "editar dados do produto", "mexer no estoque" e "arquivar/excluir"
-- é aplicada aqui — no banco, não no app.
-- -----------------------------------------------------------------------------
create or replace function app.produtos_validar_permissao_colunas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- O service_role (Edge Functions) e o dono do banco não passam por esta
  -- verificação: rodam fora do contexto de um usuário autenticado.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.ciclo_vida is distinct from old.ciclo_vida
     and not app.tem_permissao('excluir_produto') then
    raise exception 'Você não tem permissão para arquivar ou excluir produtos.'
      using errcode = '42501';
  end if;

  if new.estoque_atual is distinct from old.estoque_atual
     and not app.tem_permissao('gerenciar_estoque') then
    raise exception 'Você não tem permissão para alterar o estoque.'
      using errcode = '42501';
  end if;

  if (new.nome, new.codigo, new.categoria_id, new.preco, new.atributos)
       is distinct from (old.nome, old.codigo, old.categoria_id, old.preco, old.atributos)
     and not app.tem_permissao('editar_produto') then
    raise exception 'Você não tem permissão para editar produtos.'
      using errcode = '42501';
  end if;

  -- `empresa_id` nunca muda: impede mover um produto para outro tenant.
  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'Não é possível transferir um produto entre empresas.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger produtos_permissao_colunas
  before update on public.produtos
  for each row execute function app.produtos_validar_permissao_colunas();

-- -----------------------------------------------------------------------------
-- Alertas de estoque (Seções 4.14 e 8.3)
-- Status do produto é sempre computado; o que persiste aqui é o HISTÓRICO do
-- alerta. Um alerta por tipo por ciclo — e "ciclo" é delimitado pelo valor de
-- `estoque_referencia_alerta`, que é recalculado a cada reposição. O índice
-- único `alertas_estoque_ciclo_unico` garante a não-duplicidade.
-- -----------------------------------------------------------------------------
create or replace function app.avaliar_alerta_estoque()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_percentual numeric;
  v_limite numeric;
  v_tipo public.alerta_estoque_tipo;
  v_mensagem text;
begin
  if new.estoque_atual = old.estoque_atual then
    return new;
  end if;

  -- Produto arquivado ou excluído não gera alerta de reposição.
  if new.ciclo_vida <> 'ativo' then
    return new;
  end if;

  select e.alerta_estoque_percentual into v_percentual
  from public.empresas e
  where e.id = new.empresa_id;

  if new.estoque_atual = 0 then
    v_tipo := 'esgotado';
    v_mensagem := new.nome || ' está sem estoque.';
  else
    if new.estoque_referencia_alerta <= 0 or v_percentual is null then
      return new;
    end if;

    v_limite := new.estoque_referencia_alerta * v_percentual / 100.0;

    if new.estoque_atual > v_limite then
      return new;
    end if;

    v_tipo := 'estoque_baixo';
    v_mensagem := new.nome || ' possui apenas ' || new.estoque_atual
                  || case when new.estoque_atual = 1 then ' unidade disponível.'
                          else ' unidades disponíveis.' end;
  end if;

  insert into public.alertas_estoque (
    empresa_id, produto_id, tipo, mensagem, ciclo_referencia
  )
  values (
    new.empresa_id, new.id, v_tipo, v_mensagem, new.estoque_referencia_alerta
  )
  on conflict (produto_id, tipo, ciclo_referencia) do nothing;

  return new;
end;
$$;

create trigger produtos_alerta_estoque
  after update of estoque_atual on public.produtos
  for each row execute function app.avaliar_alerta_estoque();

-- -----------------------------------------------------------------------------
-- Provisionamento de conta a partir do Supabase Auth
-- Seção 4.2 — `usuarios` é 1:1 com auth.users. O e-mail e o nome vindos do
-- cadastro por senha ou do Google (raw_user_meta_data) são copiados aqui.
-- -----------------------------------------------------------------------------
create or replace function app.provisionar_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usuarios (id, nome, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'nome',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ),
    new.email
  )
  on conflict (id) do nothing;

  -- Seção 7.14 — preferências de notificação começam todas ligadas.
  insert into public.preferencias_notificacao (usuario_id)
  values (new.id)
  on conflict (usuario_id) do nothing;

  return new;
end;
$$;

create trigger auth_usuario_criado
  after insert on auth.users
  for each row execute function app.provisionar_usuario();
