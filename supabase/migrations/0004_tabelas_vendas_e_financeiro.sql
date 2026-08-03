-- =============================================================================
-- 0004 — Vendas, itens, financeiro e solicitações de cancelamento
-- Especificação: Seções 4.9, 4.10, 4.11, 4.17, 8.5, 8.6
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.9 `vendas`
-- Vendas NUNCA são apagadas (Seção 8.5) — o cancelamento marca `cancelada` e
-- gera reversão. Não há política de DELETE para esta tabela (ver 0007).
-- -----------------------------------------------------------------------------
create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- Quem registrou. `on delete restrict` porque o histórico continua atribuído
  -- ao usuário mesmo após ele ser removido da empresa (Seção 5.6).
  usuario_id uuid not null references public.usuarios (id) on delete restrict,
  status public.venda_status not null default 'confirmada',
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  -- Nulo quando não houve desconto.
  desconto_tipo public.desconto_tipo,
  -- Sempre o valor em REAIS já calculado, mesmo quando o usuário informou um
  -- percentual — `desconto_tipo` registra apenas como o valor foi informado.
  -- Assim `total = subtotal - desconto` é sempre verdadeiro.
  desconto numeric(14, 2) not null default 0 check (desconto >= 0),
  total numeric(14, 2) not null check (total >= 0),
  forma_pagamento public.forma_pagamento_venda not null,
  cancelada_em timestamptz,
  -- Pode diferir de quem solicitou o cancelamento (Seção 8.5).
  cancelada_por uuid references public.usuarios (id) on delete restrict,
  criado_em timestamptz not null default now(),

  -- Seção 7.3 — o desconto nunca deixa o total negativo.
  constraint vendas_desconto_ate_subtotal check (desconto <= subtotal),
  constraint vendas_total_coerente check (total = subtotal - desconto),
  constraint vendas_desconto_tem_tipo
    check ((desconto = 0 and desconto_tipo is null) or (desconto > 0 and desconto_tipo is not null)),
  constraint vendas_cancelamento_completo
    check (
      (status = 'cancelada' and cancelada_em is not null and cancelada_por is not null)
      or (status <> 'cancelada' and cancelada_em is null and cancelada_por is null)
    )
);

-- Seção 9.2 — índice em criado_em para os relatórios por período não
-- degradarem conforme o volume cresce.
create index vendas_empresa_data_idx on public.vendas (empresa_id, criado_em desc);
create index vendas_empresa_status_idx on public.vendas (empresa_id, status);
create index vendas_usuario_idx on public.vendas (usuario_id);

-- -----------------------------------------------------------------------------
-- 4.10 `venda_itens`
-- -----------------------------------------------------------------------------
create table public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas (id) on delete cascade,
  -- `on delete restrict`: produtos nunca são apagados fisicamente (Seção 8.4),
  -- então esta restrição nunca deve ser acionada — está aqui como rede de
  -- segurança contra exclusão acidental.
  produto_id uuid not null references public.produtos (id) on delete restrict,
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric(14, 2) not null check (preco_unitario >= 0),
  subtotal numeric(14, 2) not null check (subtotal >= 0),

  constraint venda_itens_subtotal_coerente
    check (subtotal = preco_unitario * quantidade)
);

create index venda_itens_venda_idx on public.venda_itens (venda_id);
-- Relatório de produtos mais vendidos (Seção 10.2).
create index venda_itens_produto_idx on public.venda_itens (produto_id);

-- -----------------------------------------------------------------------------
-- 4.11 `movimentacoes_financeiras`
-- -----------------------------------------------------------------------------
create table public.movimentacoes_financeiras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo public.movimentacao_tipo not null,
  -- Valor sempre positivo; o sinal é dado por `tipo`.
  valor numeric(14, 2) not null check (valor > 0),
  descricao text not null default '',
  -- Seção 8.6 — texto livre com autocomplete das categorias já usadas pela
  -- empresa, não uma lista fixa do sistema.
  categoria text,
  origem public.movimentacao_origem not null,
  venda_id uuid references public.vendas (id) on delete restrict,
  -- Seção 8.6 — o lançamento manual permite ao Gestor escolher a data;
  -- `criado_em` continua registrando quando a linha foi de fato gravada.
  data_movimentacao date not null default current_date,
  criado_por uuid references public.usuarios (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- Movimentações originadas de venda precisam apontar para a venda.
  constraint movimentacoes_origem_venda_tem_venda
    check ((origem = 'manual' and venda_id is null) or (origem <> 'manual' and venda_id is not null))
);

create index movimentacoes_empresa_data_idx
  on public.movimentacoes_financeiras (empresa_id, data_movimentacao desc, criado_em desc);
create index movimentacoes_venda_idx on public.movimentacoes_financeiras (venda_id);
-- Autocomplete de categorias já usadas (Seção 8.6).
create index movimentacoes_categoria_idx
  on public.movimentacoes_financeiras (empresa_id, categoria)
  where categoria is not null;

-- Uma venda gera no máximo uma entrada e no máximo um estorno — impede
-- lançamento duplicado se uma chamada for repetida.
create unique index movimentacoes_venda_origem_unica
  on public.movimentacoes_financeiras (venda_id, origem)
  where venda_id is not null;

create trigger movimentacoes_atualizado_em
  before update on public.movimentacoes_financeiras
  for each row execute function app.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- 4.17 `solicitacoes_cancelamento`
-- Pedido de cancelamento feito por Funcionário SEM a permissão
-- `cancelar_venda`, para aprovação do Gestor (Seção 8.5).
-- -----------------------------------------------------------------------------
create table public.solicitacoes_cancelamento (
  id uuid primary key default gen_random_uuid(),
  -- Desnormalizado de propósito: a RLS filtra por empresa_id sem precisar de
  -- join com `vendas` a cada verificação de linha.
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  venda_id uuid not null references public.vendas (id) on delete cascade,
  solicitado_por uuid not null references public.usuarios (id) on delete restrict,
  motivo text,
  status public.solicitacao_status not null default 'pendente',
  decidido_por uuid references public.usuarios (id) on delete restrict,
  decidido_em timestamptz,
  criado_em timestamptz not null default now(),

  constraint solicitacoes_decisao_completa
    check (
      (status = 'pendente' and decidido_por is null and decidido_em is null)
      or (status <> 'pendente' and decidido_por is not null and decidido_em is not null)
    )
);

-- Apenas uma solicitação pendente por venda.
create unique index solicitacoes_pendente_unica
  on public.solicitacoes_cancelamento (venda_id)
  where status = 'pendente';

create index solicitacoes_empresa_idx
  on public.solicitacoes_cancelamento (empresa_id, status, criado_em desc);
