-- =============================================================================
-- 0006 — Funções auxiliares de permissão
-- Especificação: Seções 5.1, 5.3, 6.6, 6.8, 6.9, 9.1
--
-- Todas são SECURITY DEFINER com `search_path = ''`:
--   - SECURITY DEFINER porque precisam ler `empresa_usuarios` sem disparar a
--     RLS da própria `empresa_usuarios` (o que causaria recursão infinita).
--   - `search_path = ''` porque uma função SECURITY DEFINER com search_path
--     mutável é escalável por qualquer usuário; todo objeto é qualificado.
--   - STABLE para o planejador reaproveitar o resultado dentro do statement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identidade e vínculo
-- -----------------------------------------------------------------------------

-- Seção 5.1 — cada usuário tem no máximo UM vínculo ativo, então esta função
-- retorna no máximo uma empresa.
create or replace function app.empresa_atual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select eu.empresa_id
  from public.empresa_usuarios eu
  where eu.usuario_id = (select auth.uid())
    and eu.status = 'ativo'
  limit 1
$$;

create or replace function app.papel_atual()
returns public.papel_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select eu.papel
  from public.empresa_usuarios eu
  where eu.usuario_id = (select auth.uid())
    and eu.status = 'ativo'
  limit 1
$$;

-- Seção 5.3 — convidar/remover/promover usuários e configurar a empresa são
-- ações do PAPEL Gestor, não permissões individuais concedíveis.
create or replace function app.eh_gestor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_usuarios eu
    where eu.usuario_id = (select auth.uid())
      and eu.status = 'ativo'
      and eu.papel in ('gestor_principal', 'gestor')
  )
$$;

-- Seção 4.15 — administrador da plataforma é quem possui linha em
-- `administradores_plataforma`. Não tem vínculo com empresa nenhuma.
create or replace function app.eh_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.administradores_plataforma ap
    where ap.id = (select auth.uid())
  )
$$;

-- -----------------------------------------------------------------------------
-- Permissões granulares (Seção 5.3)
-- Chaves canônicas: cadastrar_produto, editar_produto, excluir_produto,
-- gerenciar_estoque, visualizar_financeiro, exportar_relatorios,
-- cancelar_venda, gerenciar_assinatura.
-- -----------------------------------------------------------------------------
create or replace function app.tem_permissao(p_chave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_usuarios eu
    where eu.usuario_id = (select auth.uid())
      and eu.status = 'ativo'
      and (
        -- O Gestor possui todas as permissões da Seção 5.3 por definição do
        -- papel; a coluna jsonb é espelhada apenas para exibição na interface.
        eu.papel in ('gestor_principal', 'gestor')
        or (
          -- `gerenciar_assinatura` nunca é concedível ao Funcionário
          -- (Seção 5.3, coluna "Padrão Funcionário").
          p_chave <> 'gerenciar_assinatura'
          and coalesce((eu.permissoes ->> p_chave)::boolean, false)
        )
      )
  )
$$;

-- -----------------------------------------------------------------------------
-- Estado da conta (Seções 6.6 e 6.9)
--
-- `empresas.status` e `assinaturas.status` são DUAS máquinas de estado
-- independentes (nota de consistência da Seção 6.9):
--   - empresas.status muda apenas por ação manual do administrador;
--   - modo limitado é um valor de assinaturas.status — uma empresa em modo
--     limitado continua com empresas.status = 'ativa'.
-- -----------------------------------------------------------------------------

-- Leitura liberada: modo limitado e carência permitem consulta;
-- `pendente_pagamento` não (sem acesso ao conteúdo até a confirmação —
-- Seção 4.12.2). Empresa suspensa ou inativa bloqueia tudo (Seção 6.9).
create or replace function app.empresa_permite_leitura(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.empresas e
    left join public.assinaturas a
      on a.empresa_id = e.id and a.status <> 'cancelada'
    where e.id = p_empresa
      and e.status = 'ativa'
      -- Sem assinatura vigente (todas canceladas): consulta continua liberada,
      -- coerente com "nenhum dado é perdido" (Seção 6.5).
      and (a.id is null or a.status <> 'pendente_pagamento')
  )
$$;

-- Escrita liberada apenas em trial, ativa ou carência. Modo limitado bloqueia
-- toda escrita: vendas, produtos, estoque, funcionários e configurações
-- (tabela de regras da Seção 6.6).
create or replace function app.empresa_permite_escrita(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.empresas e
    join public.assinaturas a on a.empresa_id = e.id
    where e.id = p_empresa
      and e.status = 'ativa'
      and a.status in ('trial', 'ativa', 'carencia')
  )
$$;

-- -----------------------------------------------------------------------------
-- Portas de entrada usadas pelas políticas de RLS (0007)
-- -----------------------------------------------------------------------------

-- Membro ativo da empresa + conta em estado que permite consulta.
create or replace function app.pode_ler(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_empresa is not null
     and p_empresa = app.empresa_atual()
     and app.empresa_permite_leitura(p_empresa)
$$;

-- Membro ativo + conta permite escrita + possui a permissão exigida.
-- `p_permissao` nulo = a ação não depende de permissão granular (apenas de
-- pertencer à empresa com a conta em dia).
create or replace function app.pode_escrever(p_empresa uuid, p_permissao text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_empresa is not null
     and p_empresa = app.empresa_atual()
     and app.empresa_permite_escrita(p_empresa)
     and (p_permissao is null or app.tem_permissao(p_permissao))
$$;

-- Ações exclusivas do papel Gestor (Seção 5.3): gerenciar funcionários,
-- configurar a empresa, gerenciar categorias e campos de produto.
create or replace function app.pode_escrever_como_gestor(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_empresa is not null
     and p_empresa = app.empresa_atual()
     and app.empresa_permite_escrita(p_empresa)
     and app.eh_gestor()
$$;

-- Um usuário pode ver os dados cadastrais de quem trabalha na mesma empresa —
-- necessário para exibir "Venda realizada por João" (Seção 5.6) e a tela de
-- Funcionários (Seção 7.8). Inclui vínculos removidos, já que o histórico
-- continua atribuído a eles.
create or replace function app.eh_colega(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.empresa_usuarios eu
    where eu.usuario_id = p_usuario
      and eu.empresa_id = app.empresa_atual()
  )
$$;

-- `venda_itens` não carrega `empresa_id`; esta função resolve a empresa da
-- venda sem que a política precise de um join sujeito a RLS.
create or replace function app.venda_empresa(p_venda uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select v.empresa_id from public.vendas v where v.id = p_venda
$$;

-- -----------------------------------------------------------------------------
-- Limites do plano (Seção 6.8)
-- Retorna null quando o limite não está definido = sem limite.
-- -----------------------------------------------------------------------------
create or replace function app.limite_plano(p_empresa uuid, p_chave text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select (p.limites ->> p_chave)::numeric
  from public.assinaturas a
  join public.planos p on p.id = a.plano_id
  where a.empresa_id = p_empresa
    and a.status <> 'cancelada'
  limit 1
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- O schema `app` não é exposto pelo PostgREST, então estas funções não viram
-- endpoints — mas precisam ser executáveis pelo usuário que dispara a policy.
-- -----------------------------------------------------------------------------
grant usage on schema app to authenticated, anon, service_role;
grant execute on all functions in schema app to authenticated, anon, service_role;
