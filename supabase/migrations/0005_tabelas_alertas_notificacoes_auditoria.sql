-- =============================================================================
-- 0005 — Alertas de estoque, notificações, push e auditoria
-- Especificação: Seções 4.13, 4.14, 7.2, 7.14, 8.3, 9.1
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 4.14 `alertas_estoque`
-- Histórico persistido de alertas — distinto do estado atual do estoque, que é
-- sempre computado (Seção 8.3). Um novo registro é criado quando o produto
-- cruza o percentual configurado dentro de um novo ciclo (ciclo = período
-- entre duas reposições), o que evita alertas duplicados para a mesma queda.
-- -----------------------------------------------------------------------------
create table public.alertas_estoque (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  produto_id uuid not null references public.produtos (id) on delete cascade,
  tipo public.alerta_estoque_tipo not null,
  mensagem text not null,
  -- Referência de estoque vigente quando o alerta disparou. Serve para
  -- identificar o ciclo: se a referência mudou, começou um ciclo novo.
  ciclo_referencia integer not null,
  lido_por uuid references public.usuarios (id) on delete set null,
  lido_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Um alerta por tipo por ciclo — a garantia de não-duplicidade da Seção 4.14
-- fica no banco, não na lógica do app.
create unique index alertas_estoque_ciclo_unico
  on public.alertas_estoque (produto_id, tipo, ciclo_referencia);

-- Seção 9.2 — listagem paginada de alertas recentes.
create index alertas_estoque_empresa_idx
  on public.alertas_estoque (empresa_id, criado_em desc);

-- -----------------------------------------------------------------------------
-- `notificacoes` (adicional ao documento — Seção 7.14 previu explicitamente
-- "tabela de notificações equivalente para os demais tipos")
-- Alimenta o sino do Dashboard (Seção 7.2) com avisos de assinatura e avisos
-- administrativos. Alertas de estoque continuam em `alertas_estoque`, sua
-- tabela dedicada.
-- -----------------------------------------------------------------------------
create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  categoria public.notificacao_categoria not null,
  titulo text not null,
  mensagem text not null,
  -- Nulo = notificação para toda a empresa; preenchido = destinatário único.
  destinatario_id uuid references public.usuarios (id) on delete cascade,
  -- Permite a notificação abrir a tela relacionada (Seção 7.2).
  entidade text,
  entidade_id uuid,
  lido_por uuid references public.usuarios (id) on delete set null,
  lido_em timestamptz,
  criado_em timestamptz not null default now()
);

create index notificacoes_empresa_idx on public.notificacoes (empresa_id, criado_em desc);
create index notificacoes_destinatario_idx
  on public.notificacoes (destinatario_id)
  where destinatario_id is not null;

-- -----------------------------------------------------------------------------
-- `dispositivos_push` (adicional — Seção 7.14, entrega via Expo Notifications)
-- O push é complementar/best-effort; a fonte confiável é sempre o registro
-- persistido em `alertas_estoque` / `notificacoes`.
-- -----------------------------------------------------------------------------
create table public.dispositivos_push (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  expo_push_token text not null unique,
  plataforma text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index dispositivos_push_usuario_idx on public.dispositivos_push (usuario_id);

create trigger dispositivos_push_atualizado_em
  before update on public.dispositivos_push
  for each row execute function app.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- `preferencias_notificacao` (adicional — Seção 7.14, liga/desliga por categoria)
-- -----------------------------------------------------------------------------
create table public.preferencias_notificacao (
  usuario_id uuid primary key references public.usuarios (id) on delete cascade,
  estoque boolean not null default true,
  assinatura boolean not null default true,
  administrativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create trigger preferencias_notificacao_atualizado_em
  before update on public.preferencias_notificacao
  for each row execute function app.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- 4.13 `logs_auditoria`
-- IMUTÁVEL (Seção 9.1): nenhum papel, nem o Gestor, tem UPDATE ou DELETE aqui.
-- A ausência dessas políticas em 0007 é deliberada, e os REVOKEs abaixo tornam
-- a garantia independente de RLS.
-- Escrita exclusivamente por triggers/funções SECURITY DEFINER (0008).
-- -----------------------------------------------------------------------------
create table public.logs_auditoria (
  id uuid primary key default gen_random_uuid(),
  -- Nulo para ações de plataforma que não pertencem a nenhuma empresa.
  empresa_id uuid references public.empresas (id) on delete cascade,
  usuario_id uuid references public.usuarios (id) on delete set null,
  -- ex: produto.criado, usuario.promovido, estoque.divergencia_ajustada,
  --     estoque.reposicao, financeiro.movimentacao_editada
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  dados_anteriores jsonb,
  dados_novos jsonb,
  criado_em timestamptz not null default now()
);

-- Seção 9.2 — paginação de histórico que cresce sem limite prático.
create index logs_auditoria_empresa_idx on public.logs_auditoria (empresa_id, criado_em desc);
create index logs_auditoria_entidade_idx on public.logs_auditoria (entidade, entidade_id);
create index logs_auditoria_usuario_idx on public.logs_auditoria (usuario_id);

-- Imutabilidade em nível de privilégio, além da ausência de política RLS.
-- Mesmo que uma política de UPDATE/DELETE seja adicionada por engano no
-- futuro, estes REVOKEs continuam barrando a operação.
revoke update, delete, truncate on public.logs_auditoria from authenticated, anon;
