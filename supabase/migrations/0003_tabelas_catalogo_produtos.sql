-- =============================================================================
-- 0003 — Catálogo: categorias, campos personalizáveis e produtos
-- Especificação: Seções 4.4, 4.5, 4.6, 4.7, 8.3, 8.4
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.7 `categorias_produto`
-- Mesmo modelo de 3 estados dos produtos: categorias podem estar referenciadas
-- em produtos com histórico de vendas, então nunca são apagadas de verdade.
-- -----------------------------------------------------------------------------
create table public.categorias_produto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  ciclo_vida public.ciclo_vida not null default 'ativo',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index categorias_produto_nome_unico
  on public.categorias_produto (empresa_id, lower(btrim(nome)))
  where ciclo_vida <> 'excluido';

create index categorias_produto_empresa_idx
  on public.categorias_produto (empresa_id, ciclo_vida);

create trigger categorias_produto_atualizado_em
  before update on public.categorias_produto
  for each row execute function app.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- 4.5 `campos_produto_disponiveis` — catálogo de campos
-- `empresa_id` nulo = campo padrão do sistema, disponível a todas as empresas.
-- `empresa_id` preenchido = campo personalizado criado por uma empresa.
-- -----------------------------------------------------------------------------
create table public.campos_produto_disponiveis (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  nome_exibicao text not null,
  tipo_campo public.tipo_campo not null,
  -- Lista de opções válidas — usada apenas quando tipo_campo = 'selecao'.
  opcoes jsonb,
  empresa_id uuid references public.empresas (id) on delete cascade,
  criado_em timestamptz not null default now(),

  constraint campos_produto_selecao_tem_opcoes
    check (tipo_campo <> 'selecao' or (opcoes is not null and jsonb_array_length(opcoes) > 0)),
  constraint campos_produto_opcoes_apenas_em_selecao
    check (tipo_campo = 'selecao' or opcoes is null),
  -- A chave é usada como nome de propriedade em produtos.atributos (jsonb),
  -- então precisa ser um identificador técnico previsível.
  constraint campos_produto_chave_formato
    check (chave ~ '^[a-z][a-z0-9_]*$')
);

-- Campos padrão do sistema: chave única globalmente.
create unique index campos_produto_chave_sistema_unica
  on public.campos_produto_disponiveis (chave)
  where empresa_id is null;

-- Campos personalizados: chave única dentro da empresa.
create unique index campos_produto_chave_empresa_unica
  on public.campos_produto_disponiveis (empresa_id, chave)
  where empresa_id is not null;

create index campos_produto_empresa_idx on public.campos_produto_disponiveis (empresa_id);

-- -----------------------------------------------------------------------------
-- 4.6 `empresa_campos_produto` — quais campos estão ativos em cada empresa
-- Desativar um campo faz ele sumir do cadastro para todos os usuários da
-- empresa imediatamente (Seção 4.6).
-- -----------------------------------------------------------------------------
create table public.empresa_campos_produto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  campo_id uuid not null references public.campos_produto_disponiveis (id) on delete cascade,
  ativo boolean not null default true,
  -- Se true, é exigido no cadastro — inclusive no cadastro rápido durante a
  -- venda (Seção 8.2).
  obrigatorio boolean not null default false,
  ordem integer not null default 0,

  unique (empresa_id, campo_id)
);

create index empresa_campos_produto_empresa_idx
  on public.empresa_campos_produto (empresa_id, ativo, ordem);

-- -----------------------------------------------------------------------------
-- 4.4 `produtos`
-- -----------------------------------------------------------------------------
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  -- Código de barras/SKU. Nullable: o cadastro rápido durante a venda
  -- (Seção 8.2) não exige código.
  codigo text,
  categoria_id uuid references public.categorias_produto (id) on delete set null,
  preco numeric(14, 2) not null check (preco >= 0),
  -- Seção 8.1 — nunca fica negativo. A trava está aqui, no banco, não no app.
  estoque_atual integer not null default 0 check (estoque_atual >= 0),
  -- Seção 8.3 — "base de 100%" do alerta por percentual; recalculada a cada
  -- reposição, não travada no cadastro original.
  estoque_referencia_alerta integer not null default 0 check (estoque_referencia_alerta >= 0),
  ciclo_vida public.ciclo_vida not null default 'ativo',
  -- Valores dos campos personalizados ativados pela empresa (Seções 4.5/4.6).
  atributos jsonb not null default '{}'::jsonb,
  criado_por uuid references public.usuarios (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- O código identifica o produto na busca e no scanner da venda (Seção 7.3),
-- então precisa ser único dentro da empresa entre produtos não excluídos.
create unique index produtos_codigo_unico
  on public.produtos (empresa_id, codigo)
  where codigo is not null and ciclo_vida <> 'excluido';

-- Seção 9.2 — índice composto por empresa_id (toda consulta é filtrada por
-- empresa via RLS) e GIN em atributos para os filtros personalizados.
create index produtos_empresa_idx on public.produtos (empresa_id, ciclo_vida);
create index produtos_categoria_idx on public.produtos (categoria_id);
create index produtos_atributos_gin on public.produtos using gin (atributos);
-- Busca por nome na tela de venda e de estoque.
create index produtos_nome_trgm on public.produtos (empresa_id, lower(nome));

create trigger produtos_atualizado_em
  before update on public.produtos
  for each row execute function app.tocar_atualizado_em();
