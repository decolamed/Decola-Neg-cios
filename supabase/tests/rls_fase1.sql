-- =============================================================================
-- Teste de RLS, permissões e regras de conta — Fase 1
--
-- Roda inteiro dentro de uma transação e faz ROLLBACK no fim: não deixa
-- resíduo no banco. Executar com privilégio de superusuário/postgres (SQL
-- Editor do Supabase ou psql com a connection string de service role).
--
-- Cada linha do resultado é uma asserção. Procure por "FALHA" na saída — se
-- não houver nenhuma, a Fase 1 está íntegra.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Helper: executa um comando e relata se foi barrado.
-- Um UPDATE barrado por RLS não levanta exceção — ele afeta 0 linhas. Por isso
-- checamos row_count, e não apenas o erro.
-- -----------------------------------------------------------------------------
create or replace function pg_temp.tentar(p_rotulo text, p_sql text)
returns table(teste text, resultado text)
language plpgsql as $$
declare v_linhas integer;
begin
  execute p_sql;
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    return query select p_rotulo, 'BLOQUEADO (0 linhas)'::text;
  else
    return query select p_rotulo, ('FALHA: ' || v_linhas || ' linha(s) afetada(s)')::text;
  end if;
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
-- Cenário
-- -----------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','11111111-1111-1111-1111-111111111111','authenticated','authenticated','gestor.a@teste.local','x',now(),'{}','{"nome":"Gestor A"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','22222222-2222-2222-2222-222222222222','authenticated','authenticated','gestor.b@teste.local','x',now(),'{}','{"nome":"Gestor B"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','33333333-3333-3333-3333-333333333333','authenticated','authenticated','func.a@teste.local','x',now(),'{}','{"nome":"Funcionario A"}',now(),now());

insert into public.planos (id, nome, valor_mensal, limites, slug)
values ('99999999-9999-9999-9999-999999999999','Plano de Teste',49.90,'{"max_funcionarios":2}','plano-de-teste');

-- Empresa A
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.criar_empresa_e_assinatura('Loja A','99999999-9999-9999-9999-999999999999','Gestor A', true);

insert into public.produtos (empresa_id, nome, codigo, preco, estoque_atual, estoque_referencia_alerta, criado_por)
values (app.empresa_atual(), 'Produto Teste', 'PT1', 39.90, 20, 20, auth.uid());

-- Empresa B
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select public.criar_empresa_e_assinatura('Loja B','99999999-9999-9999-9999-999999999999','Gestor B', true);

-- =============================================================================
-- 1. Isolamento multi-tenant (Seções 3.2, 9.1)
-- =============================================================================
select * from pg_temp.esperar('B não vê produtos da A', (select count(*) = 0 from public.produtos))
union all
select * from pg_temp.esperar('B só vê a própria empresa', (select count(*) = 1 and bool_and(nome = 'Loja B') from public.empresas))
union all
select * from pg_temp.esperar('B não vê usuários da A', (select count(*) = 1 from public.usuarios))
union all
select * from pg_temp.esperar('B não vê logs da A', (select bool_and(empresa_id = app.empresa_atual()) from public.logs_auditoria));

-- =============================================================================
-- 2. Invariantes de escrita (Seções 8.4, 8.5, 9.1)
-- =============================================================================
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select * from pg_temp.tentar('logs_auditoria é imutável (DELETE)',
  'delete from public.logs_auditoria')
union all
select * from pg_temp.tentar('logs_auditoria é imutável (UPDATE)',
  'update public.logs_auditoria set acao = ''forjado''')
union all
select * from pg_temp.tentar('venda não pode ser inserida direto',
  'insert into public.vendas (empresa_id, usuario_id, subtotal, total, forma_pagamento)
   values (app.empresa_atual(), auth.uid(), 10, 10, ''dinheiro'')')
union all
select * from pg_temp.tentar('Gestor não ativa a própria assinatura',
  'update public.assinaturas set status = ''ativa'' where empresa_id = app.empresa_atual()')
union all
select * from pg_temp.tentar('Gestor não altera empresas.status',
  'update public.empresas set status = ''suspensa'' where id = app.empresa_atual()')
union all
select * from pg_temp.tentar('Ninguém se autopromove a admin da plataforma',
  'insert into public.administradores_plataforma (id, nome, email)
   values (auth.uid(), ''x'', ''x@x.com'')')
union all
select * from pg_temp.tentar('Não cria produto em outra empresa',
  'insert into public.produtos (empresa_id, nome, preco)
   select id, ''Invasor'', 1 from public.empresas where nome = ''Loja B''');

-- =============================================================================
-- 3. Papéis e permissões granulares (Seção 5.3)
-- =============================================================================
select public.convidar_funcionario('Funcionario A', 'func.a@teste.local');

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select public.aceitar_convite(
  (select id from public.empresa_usuarios where email_convite = 'func.a@teste.local')
);

select * from pg_temp.esperar('Funcionário consulta estoque (padrão)', (select count(*) = 1 from public.produtos))
union all
select * from pg_temp.esperar('Funcionário não vê financeiro (padrão)', (select count(*) = 0 from public.movimentacoes_financeiras))
union all
select * from pg_temp.esperar('Funcionário não lê auditoria', (select count(*) = 0 from public.logs_auditoria))
union all
select * from pg_temp.tentar('Funcionário não cadastra produto',
  'insert into public.produtos (empresa_id, nome, preco) values (app.empresa_atual(), ''X'', 5)')
union all
select * from pg_temp.tentar('Funcionário não altera estoque (sem permissão)',
  'update public.produtos set estoque_atual = 999')
union all
select * from pg_temp.tentar('Funcionário não convida',
  'select public.convidar_funcionario(''X'', ''x@y.com'')')
union all
select * from pg_temp.tentar('Funcionário não se autopromove',
  'select public.alterar_papel_usuario(
     (select id from public.empresa_usuarios where usuario_id = auth.uid()), ''gestor'')');

-- Concede APENAS gerenciar_estoque e confirma o recorte por coluna.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.definir_permissoes(
  (select id from public.empresa_usuarios where email_convite = 'func.a@teste.local'),
  '{"gerenciar_estoque": true}'::jsonb
);

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
update public.produtos set estoque_atual = 4;

select * from pg_temp.tentar('Com gerenciar_estoque, ainda não edita preço',
  'update public.produtos set preco = 1')
union all
select * from pg_temp.tentar('Com gerenciar_estoque, ainda não arquiva',
  'update public.produtos set ciclo_vida = ''arquivado''');

-- =============================================================================
-- 4. Alerta de estoque (Seções 4.14, 8.3)
-- Referência 20, alerta em 25% -> limite 5. Estoque foi a 4.
-- =============================================================================
select * from pg_temp.esperar('Alerta de estoque baixo foi gerado',
  (select count(*) = 1 from public.alertas_estoque where tipo = 'estoque_baixo'))
union all
select * from pg_temp.esperar('Alerta não duplica no mesmo ciclo',
  (select count(*) <= 1 from public.alertas_estoque where tipo = 'estoque_baixo'));

-- =============================================================================
-- 5. Regras de conta (Seções 4.3, 5.1, 5.3, 6.8)
-- =============================================================================
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select * from pg_temp.tentar('Convite acima do limite do plano',
  'select public.convidar_funcionario(''Terceiro'', ''terceiro@teste.local'')')
union all
select * from pg_temp.tentar('Gestor Principal não é removível',
  'select public.remover_usuario(
     (select id from public.empresa_usuarios
      where papel = ''gestor_principal'' and empresa_id = app.empresa_atual()))')
union all
select * from pg_temp.tentar('Gestor Principal não é rebaixável',
  'select public.alterar_papel_usuario(
     (select id from public.empresa_usuarios
      where papel = ''gestor_principal'' and empresa_id = app.empresa_atual()), ''funcionario'')')
union all
select * from pg_temp.tentar('gerenciar_assinatura não vai para Funcionário',
  'select public.definir_permissoes(
     (select id from public.empresa_usuarios where email_convite = ''func.a@teste.local''),
     ''{"gerenciar_assinatura": true}''::jsonb)')
union all
select * from pg_temp.tentar('Permissão inexistente é rejeitada',
  'select public.definir_permissoes(
     (select id from public.empresa_usuarios where email_convite = ''func.a@teste.local''),
     ''{"virar_deus": true}''::jsonb)')
union all
select * from pg_temp.tentar('Um usuário, uma empresa',
  'select public.criar_empresa_e_assinatura(''Loja A2'',
     ''99999999-9999-9999-9999-999999999999'', ''Gestor A'', true)');

-- =============================================================================
-- 6. Modo limitado (Seção 6.6): consulta liberada, escrita bloqueada
-- =============================================================================
reset role;
update public.assinaturas set status = 'modo_limitado'
where empresa_id = (select id from public.empresas where nome = 'Loja A');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select * from pg_temp.esperar('Modo limitado permite consulta', app.empresa_permite_leitura(app.empresa_atual()))
union all
select * from pg_temp.esperar('Modo limitado bloqueia escrita', not app.empresa_permite_escrita(app.empresa_atual()))
union all
select * from pg_temp.tentar('Modo limitado — cadastrar produto',
  'insert into public.produtos (empresa_id, nome, preco) values (app.empresa_atual(), ''X'', 5)')
union all
select * from pg_temp.tentar('Modo limitado — alterar estoque',
  'update public.produtos set estoque_atual = 50')
union all
select * from pg_temp.tentar('Modo limitado — lançamento financeiro',
  'insert into public.movimentacoes_financeiras (empresa_id, tipo, valor, origem, criado_por)
   values (app.empresa_atual(), ''saida'', 100, ''manual'', auth.uid())')
union all
select * from pg_temp.tentar('Modo limitado — alterar dados da empresa',
  'update public.empresas set nome = ''Renomeada'' where id = app.empresa_atual()')
union all
select * from pg_temp.tentar('Modo limitado — convidar funcionário',
  'select public.convidar_funcionario(''Novo'', ''novo@teste.local'')');

reset role;
rollback;
