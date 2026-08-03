-- =============================================================================
-- Teste de onboarding — Fase 2 (Seções 6.1, 6.2, 6.3, 7.12, 7.13)
--
-- Roda em transação e faz ROLLBACK no fim. Executar com privilégio de
-- service role. Cada linha é uma asserção; procure por "FALHA" na saída.
--
-- ATENÇÃO: as asserções de role `anon` precisam de statements separados dos
-- INSERTs, porque um erro de privilégio aborta a transação inteira.
-- =============================================================================

begin;

create or replace function pg_temp.tentar(p_rotulo text, p_sql text)
returns table(teste text, resultado text)
language plpgsql as $$
begin
  execute p_sql;
  return query select p_rotulo, 'FALHA: deveria ter sido bloqueado'::text;
exception when others then
  return query select p_rotulo, ('BLOQUEADO: ' || sqlerrm)::text;
end;
$$;

create or replace function pg_temp.esperar(p_rotulo text, p_condicao boolean)
returns table(teste text, resultado text)
language sql as $$
  select p_rotulo, case when p_condicao then 'OK' else 'FALHA' end;
$$;

-- -----------------------------------------------------------------------------
-- Cenário: um plano ativo, um desativado, dois usuários autenticados.
-- -----------------------------------------------------------------------------
insert into public.planos (id, nome, valor_mensal, limites, funcionalidades, slug, ativo)
values
  ('aaaaaaaa-0000-0000-0000-000000000001','Essencial',49.90,
   '{"max_funcionarios":3}','["financeiro_basico"]','essencial', true),
  ('aaaaaaaa-0000-0000-0000-000000000002','Descontinuado',19.90,
   '{}','[]','descontinuado', false);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','f2000000-0000-0000-0000-000000000001',
   'authenticated','authenticated','fase2.a@teste.local','x',now(),'{}','{"nome":"Fase Dois A"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','f2000000-0000-0000-0000-000000000002',
   'authenticated','authenticated','fase2.b@teste.local','x',now(),'{}','{"full_name":"Fase Dois B"}',now(),now());

-- =============================================================================
-- 1. Provisionamento de conta (Seção 4.2) — o trigger em auth.users
-- =============================================================================
select * from pg_temp.esperar('Trigger criou linha em usuarios',
  (select count(*) = 2 from public.usuarios where email like 'fase2.%@teste.local'))
union all
select * from pg_temp.esperar('Nome veio de raw_user_meta_data.nome',
  (select nome = 'Fase Dois A' from public.usuarios where email = 'fase2.a@teste.local'))
union all
-- O Google entrega o nome em `full_name`, não em `nome`.
select * from pg_temp.esperar('Nome veio de raw_user_meta_data.full_name (Google)',
  (select nome = 'Fase Dois B' from public.usuarios where email = 'fase2.b@teste.local'))
union all
select * from pg_temp.esperar('Preferências de notificação criadas',
  (select count(*) = 2 from public.preferencias_notificacao));

-- =============================================================================
-- 2. Escolha do Plano é PRÉ-autenticação (Seção 7.13)
-- A role `anon` precisa enxergar planos ativos e a configuração de trial sem
-- nenhuma sessão. Esta foi a regressão corrigida pela migration 0015.
-- =============================================================================
set local role anon;

select * from pg_temp.esperar('anon lista planos ativos',
  (select count(*) = 1 from public.planos))
union all
select * from pg_temp.esperar('anon NÃO vê plano desativado (Seção 6.1)',
  (select count(*) = 0 from public.planos where slug = 'descontinuado'))
union all
select * from pg_temp.esperar('anon lê o selo de trial',
  (select trial_ativo from public.configuracoes_plataforma))
union all
select * from pg_temp.esperar('anon resolve o link direto por slug (Seção 6.3)',
  (select nome = 'Essencial' from public.planos where slug = 'essencial'));

reset role;

-- =============================================================================
-- 3. Botão "Criar conta" — validações revalidadas no servidor (Seção 7.12)
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000000-0000-0000-0000-000000000001","role":"authenticated"}';

select * from pg_temp.tentar('Sem aceitar os Termos de Uso',
  'select public.criar_empresa_e_assinatura(''Loja X'',
     ''aaaaaaaa-0000-0000-0000-000000000001'', ''Fulano'', false)')
union all
select * from pg_temp.tentar('Com plano desativado (Seção 6.1)',
  'select public.criar_empresa_e_assinatura(''Loja X'',
     ''aaaaaaaa-0000-0000-0000-000000000002'', ''Fulano'', true)')
union all
select * from pg_temp.tentar('Com nome de empresa em branco',
  'select public.criar_empresa_e_assinatura(''   '',
     ''aaaaaaaa-0000-0000-0000-000000000001'', ''Fulano'', true)')
union all
select * from pg_temp.tentar('Com plano inexistente',
  'select public.criar_empresa_e_assinatura(''Loja X'',
     ''00000000-0000-0000-0000-0000000000ff'', ''Fulano'', true)');

-- =============================================================================
-- 4. Trial LIGADO → assinatura nasce em `trial`, acesso liberado (Seção 6.5)
-- =============================================================================
select public.criar_empresa_e_assinatura(
  'Loja Com Trial', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fase Dois A', true);

select * from pg_temp.esperar('Trial ligado → status = trial',
  (select status = 'trial' from public.assinaturas))
union all
select * from pg_temp.esperar('trial_expira_em preenchido',
  (select trial_expira_em is not null from public.assinaturas))
union all
select * from pg_temp.esperar('Criador virou Gestor Principal (Seção 5.1)',
  (select papel = 'gestor_principal' and status = 'ativo'
   from public.empresa_usuarios where usuario_id = auth.uid()))
union all
select * from pg_temp.esperar('Gestor Principal recebeu todas as permissões',
  (select permissoes = app.permissoes_gestor()
   from public.empresa_usuarios where usuario_id = auth.uid()))
union all
select * from pg_temp.esperar('Aceite dos termos foi registrado',
  (select aceitou_termos_em is not null from public.usuarios where id = auth.uid()))
union all
select * from pg_temp.esperar('Criação da empresa gerou auditoria',
  (select count(*) = 1 from public.logs_auditoria where acao = 'empresa.criada'))
union all
select * from pg_temp.esperar('Trial permite consulta e escrita',
  app.empresa_permite_leitura(app.empresa_atual())
  and app.empresa_permite_escrita(app.empresa_atual()));

-- =============================================================================
-- 5. Trial DESLIGADO → `pendente_pagamento` (Seções 6.2 e 4.12.2)
-- Diferente de modo limitado: aqui NEM a consulta é liberada, mas a empresa e
-- a assinatura continuam legíveis para o app poder mostrar a tela de pagamento.
-- =============================================================================
reset role;
update public.configuracoes_plataforma set trial_ativo = false;

set local role authenticated;
set local request.jwt.claims = '{"sub":"f2000000-0000-0000-0000-000000000002","role":"authenticated"}';

select public.criar_empresa_e_assinatura(
  'Loja Sem Trial', 'aaaaaaaa-0000-0000-0000-000000000001', 'Fase Dois B', true);

select * from pg_temp.esperar('Trial desligado → status = pendente_pagamento',
  (select status = 'pendente_pagamento' from public.assinaturas
   where empresa_id = app.empresa_atual()))
union all
select * from pg_temp.esperar('pendente_pagamento NÃO libera consulta de conteúdo',
  not app.empresa_permite_leitura(app.empresa_atual()))
union all
select * from pg_temp.esperar('pendente_pagamento NÃO libera escrita',
  not app.empresa_permite_escrita(app.empresa_atual()))
union all
select * from pg_temp.esperar('Mas a empresa continua legível (p/ explicar o bloqueio)',
  (select count(*) = 1 from public.empresas))
union all
select * from pg_temp.esperar('E a assinatura também',
  (select count(*) = 1 from public.assinaturas where empresa_id = app.empresa_atual()))
union all
select * from pg_temp.esperar('Nenhum conteúdo de negócio é visível',
  (select count(*) = 0 from public.produtos))
union all
select * from pg_temp.esperar('Preço legado congelado na contratação (Seção 7.15)',
  (select valor_contratado = 49.90 from public.assinaturas
   where empresa_id = app.empresa_atual()));

reset role;
rollback;
