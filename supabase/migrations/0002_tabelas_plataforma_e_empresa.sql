-- =============================================================================
-- 0002 — Plataforma SaaS, contas, empresas e assinaturas
-- Especificação: Seções 4.1, 4.2, 4.3, 4.12, 4.15, 4.16
-- =============================================================================

-- Função utilitária compartilhada: mantém `atualizado_em` sempre correto sem
-- depender do cliente enviar o valor.
create or replace function app.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4.15 `administradores_plataforma`
-- Proprietário/equipe da plataforma Decola. Sem vínculo com empresa nenhuma.
-- Reaproveita o Supabase Auth: um usuário é reconhecido como administrador
-- exclusivamente por possuir uma linha aqui (Seção 4.15).
-- Criado por seed manual, nunca por autoatendimento (Seção 7.15).
-- -----------------------------------------------------------------------------
create table public.administradores_plataforma (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null unique,
  criado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4.16 `configuracoes_plataforma` (singleton)
-- Espera-se exatamente uma linha. O índice único abaixo torna isso uma
-- garantia do banco, não uma convenção.
-- -----------------------------------------------------------------------------
create table public.configuracoes_plataforma (
  id uuid primary key default gen_random_uuid(),
  linha_unica boolean not null default true,
  trial_ativo boolean not null default true,
  trial_dias integer not null default 7 check (trial_dias >= 0),
  -- Seção 6.6 — padrão de 7 dias corridos, editável pelo administrador.
  carencia_dias integer not null default 7 check (carencia_dias >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.administradores_plataforma (id),
  constraint configuracoes_plataforma_linha_unica check (linha_unica)
);

create unique index configuracoes_plataforma_singleton
  on public.configuracoes_plataforma (linha_unica);

create trigger configuracoes_plataforma_atualizado_em
  before update on public.configuracoes_plataforma
  for each row execute function app.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- 4.12.1 `planos`
-- Planos são dinâmicos, criados pelo Painel Administrativo — nunca hardcoded
-- no app (Seção 6.1).
-- -----------------------------------------------------------------------------
create table public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor_mensal numeric(14, 2) not null check (valor_mensal >= 0),
  -- ex: ["financeiro_basico", "relatorios_avancados"]
  funcionalidades jsonb not null default '[]'::jsonb,
  -- ex: {"max_funcionarios": 3} — extensível sem alterar schema (Seção 4.12.1)
  limites jsonb not null default '{}'::jsonb,
  -- Controla apenas NOVAS contratações. Assinantes atuais seguem normalmente
  -- (Seção 6.1).
  ativo boolean not null default true,
  -- Usado para montar o link direto do plano (Seção 6.3).
  slug text not null unique,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index planos_ativo_idx on public.planos (ativo) where ativo;
-- Seção 9.2 — índices GIN nas colunas jsonb consultáveis.
create index planos_funcionalidades_gin on public.planos using gin (funcionalidades);
create index planos_limites_gin on public.planos using gin (limites);

create trigger planos_atualizado_em
  before update on public.planos
  for each row execute function app.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- 4.2 `usuarios` — 1:1 com auth.users
-- -----------------------------------------------------------------------------
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text not null,
  telefone text,
  -- Seção 7.12 — o aceite dos termos é obrigatório no cadastro; guardamos
  -- quando ocorreu.
  aceitou_termos_em timestamptz,
  criado_em timestamptz not null default now()
);

create index usuarios_email_idx on public.usuarios (lower(email));

-- -----------------------------------------------------------------------------
-- 4.1 `empresas`
-- Nota: `plano_atual_id` da especificação original foi removido — a assinatura
-- é a fonte única de verdade do plano vigente, já que ela carrega o preço
-- legado congelado (`valor_contratado`, Seção 4.12.2 / 7.15).
-- -----------------------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  -- Seção 4.1 — todos opcionais: o público-alvo inclui negócios informais.
  cnpj text,
  endereco text,
  telefone text,
  logo_url text,
  chave_pix text,
  status public.empresa_status not null default 'ativa',
  -- Seção 8.3 — configuração ÚNICA e geral da empresa (não por produto).
  -- Opções da interface: 50, 25 ou 10; a coluna aceita qualquer percentual
  -- para suportar o valor personalizado previsto na especificação.
  alerta_estoque_percentual numeric(5, 2) not null default 25
    check (alerta_estoque_percentual > 0 and alerta_estoque_percentual <= 100),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index empresas_status_idx on public.empresas (status);

create trigger empresas_atualizado_em
  before update on public.empresas
  for each row execute function app.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- 4.3 `empresa_usuarios` — núcleo do sistema de permissões
-- Modelada como N:N por flexibilidade futura, mas a regra de produto da
-- Seção 5.1 restringe cada usuário a no máximo UM vínculo ativo.
-- -----------------------------------------------------------------------------
create table public.empresa_usuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- Nulo enquanto o convite não é aceito (o convidado pode ainda não ter conta).
  usuario_id uuid references public.usuarios (id) on delete restrict,
  nome_convite text not null,
  email_convite text not null,
  papel public.papel_usuario not null default 'funcionario',
  -- Chaves canônicas definidas na tabela de referência da Seção 5.3.
  permissoes jsonb not null default '{}'::jsonb,
  status public.vinculo_status not null default 'convidado',
  convidado_em timestamptz not null default now(),
  -- Seção 5.2 — validade de 7 dias; reenviar gera novo valor e invalida o anterior.
  convite_expira_em timestamptz not null default (now() + interval '7 days'),
  aceito_em timestamptz,

  -- Um vínculo só pode estar ativo se houver de fato uma conta por trás dele.
  constraint empresa_usuarios_ativo_exige_usuario
    check (status <> 'ativo' or usuario_id is not null)
);

-- Seção 5.1 — "cada usuário pertence a apenas uma empresa" vira garantia do
-- banco, não apenas regra de aplicação.
create unique index empresa_usuarios_vinculo_ativo_unico
  on public.empresa_usuarios (usuario_id)
  where status = 'ativo' and usuario_id is not null;

-- Seção 4.3 — exatamente 1 gestor_principal por empresa.
create unique index empresa_usuarios_gestor_principal_unico
  on public.empresa_usuarios (empresa_id)
  where papel = 'gestor_principal';

-- Evita dois convites simultâneos para o mesmo e-mail na mesma empresa.
create unique index empresa_usuarios_convite_unico
  on public.empresa_usuarios (empresa_id, lower(email_convite))
  where status <> 'removido';

create index empresa_usuarios_empresa_idx on public.empresa_usuarios (empresa_id, status);
create index empresa_usuarios_usuario_idx on public.empresa_usuarios (usuario_id);
create index empresa_usuarios_permissoes_gin on public.empresa_usuarios using gin (permissoes);

-- -----------------------------------------------------------------------------
-- 4.12.2 `assinaturas`
-- -----------------------------------------------------------------------------
create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  plano_id uuid not null references public.planos (id) on delete restrict,
  -- Seção 7.15 — preço legado: congelado na contratação, NUNCA recalculado a
  -- partir de planos.valor_mensal quando o administrador altera o plano.
  valor_contratado numeric(14, 2) not null check (valor_contratado >= 0),
  status public.assinatura_status not null default 'pendente_pagamento',
  trial_expira_em timestamptz,
  carencia_expira_em timestamptz,
  -- Nulos quando `ativada_manualmente = true` (não passa pelo Asaas, Seção 6.9).
  asaas_customer_id text,
  asaas_subscription_id text,
  proximo_vencimento date,
  ativada_manualmente boolean not null default false,
  ativada_por uuid references public.administradores_plataforma (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint assinaturas_ativacao_manual_tem_autor
    check (not ativada_manualmente or ativada_por is not null)
);

-- Uma assinatura vigente por empresa. Assinaturas canceladas ficam no
-- histórico sem bloquear a criação de uma nova.
create unique index assinaturas_vigente_unica
  on public.assinaturas (empresa_id)
  where status <> 'cancelada';

create index assinaturas_empresa_idx on public.assinaturas (empresa_id);
create index assinaturas_status_idx on public.assinaturas (status);
create index assinaturas_asaas_subscription_idx
  on public.assinaturas (asaas_subscription_id)
  where asaas_subscription_id is not null;

create trigger assinaturas_atualizado_em
  before update on public.assinaturas
  for each row execute function app.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- 4.12.3 `cobrancas` — histórico de cobranças individuais geradas pelo Asaas
-- -----------------------------------------------------------------------------
create table public.cobrancas (
  id uuid primary key default gen_random_uuid(),
  assinatura_id uuid not null references public.assinaturas (id) on delete cascade,
  asaas_payment_id text not null unique,
  valor numeric(14, 2) not null check (valor >= 0),
  forma_pagamento public.cobranca_forma_pagamento not null,
  -- Atualizado via webhook do Asaas (Seção 6.4).
  status public.cobranca_status not null default 'pendente',
  vencimento date not null,
  pago_em timestamptz,
  criado_em timestamptz not null default now()
);

create index cobrancas_assinatura_idx on public.cobrancas (assinatura_id, criado_em desc);
create index cobrancas_status_idx on public.cobrancas (status);
