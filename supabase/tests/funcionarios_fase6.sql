-- =============================================================================
-- Teste de funcionários e permissões — Fase 6 (Seções 5.1, 5.2, 5.3, 5.6, 6.8)
--
-- Roda em transação e faz ROLLBACK no fim. Executar com privilégio de
-- service role. Cada linha é uma asserção; procure por "FALHA" na saída.
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

-- Plano com limite de 2 funcionários, para exercitar a Seção 6.8.
insert into public.planos (id, nome, valor_mensal, limites, slug)
values ('eeeeeeee-0000-0000-0000-000000000001','Teste F6',49.90,'{"max_funcionarios":2}','teste-f6');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','f6000000-0000-0000-0000-000000000001',
   'authenticated','authenticated','f6.gp@teste.local','x',now(),'{}','{"nome":"Gestor Principal"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','f6000000-0000-0000-0000-000000000002',
   'authenticated','authenticated','f6.func@teste.local','x',now(),'{}','{"nome":"Funcionario"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','f6000000-0000-0000-0000-000000000003',
   'authenticated','authenticated','f6.outro@teste.local','x',now(),'{}','{"nome":"Outro"}',now(),now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.criar_empresa_e_assinatura('Loja F6','eeeeeeee-0000-0000-0000-000000000001','Gestor Principal', true);
select public.convidar_funcionario('Funcionario', 'f6.func@teste.local');

-- =============================================================================
-- 1. Convite: validade de 7 dias e reenvio (Seção 5.2)
-- =============================================================================
select * from pg_temp.esperar('Convite nasce com prazo de 7 dias',
  (select convite_expira_em::date = (now() + interval '7 days')::date
   from public.empresa_usuarios where email_convite = 'f6.func@teste.local'))
union all
select * from pg_temp.esperar('Convite nasce como `convidado`, sem usuario_id',
  (select status = 'convidado' and usuario_id is null
   from public.empresa_usuarios where email_convite = 'f6.func@teste.local'))
union all
select * from pg_temp.esperar('Funcionário nasce sem nenhuma permissão extra',
  (select permissoes = app.permissoes_funcionario()
   from public.empresa_usuarios where email_convite = 'f6.func@teste.local'));

-- Convite expirado é recusado.
reset role;
update public.empresa_usuarios set convite_expira_em = now() - interval '1 day'
where email_convite = 'f6.func@teste.local';

set local role authenticated;
set local request.jwt.claims = '{"sub":"f6000000-0000-0000-0000-000000000002","role":"authenticated"}';

select * from pg_temp.tentar('Aceitar convite expirado',
  'select public.aceitar_convite(
     (select id from public.empresa_usuarios where email_convite = ''f6.func@teste.local''))');

-- O Gestor reenvia e o prazo volta a valer.
set local request.jwt.claims = '{"sub":"f6000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.reenviar_convite(
  (select id from public.empresa_usuarios where email_convite = 'f6.func@teste.local'));

select * from pg_temp.esperar('Reenvio gera novo prazo de 7 dias',
  (select convite_expira_em > now() + interval '6 days'
   from public.empresa_usuarios where email_convite = 'f6.func@teste.local'));

-- =============================================================================
-- 2. Aceite (Seção 5.2, item 4)
-- =============================================================================
set local request.jwt.claims = '{"sub":"f6000000-0000-0000-0000-000000000002","role":"authenticated"}';
select public.aceitar_convite(
  (select id from public.empresa_usuarios where email_convite = 'f6.func@teste.local'));

select * from pg_temp.esperar('Vínculo virou ativo, com usuario_id e aceito_em',
  (select status = 'ativo' and usuario_id = auth.uid() and aceito_em is not null
   from public.empresa_usuarios where email_convite = 'f6.func@teste.local'))
union all
select * from pg_temp.tentar('Aceitar o mesmo convite duas vezes',
  'select public.aceitar_convite(
     (select id from public.empresa_usuarios where email_convite = ''f6.func@teste.local''))');

-- Seção 5.1 — uma conta não aceita convite estando vinculada a outra empresa.
set local request.jwt.claims = '{"sub":"f6000000-0000-0000-0000-000000000001","role":"authenticated"}';
select * from pg_temp.tentar('Gestor Principal aceita convite de outra empresa',
  'select public.aceitar_convite(
     (select id from public.empresa_usuarios where email_convite = ''f6.func@teste.local''))');

-- =============================================================================
-- 3. Papel e permissões (Seções 5.3 e 7.8)
-- =============================================================================
select public.alterar_papel_usuario(
  (select id from public.empresa_usuarios where email_convite = 'f6.func@teste.local'), 'gestor');

select * from pg_temp.esperar('Promovido a Gestor recebe todas as permissões',
  (select papel = 'gestor' and permissoes = app.permissoes_gestor()
   from public.empresa_usuarios where email_convite = 'f6.func@teste.local'));

select public.alterar_papel_usuario(
  (select id from public.empresa_usuarios where email_convite = 'f6.func@teste.local'), 'funcionario');

select * from pg_temp.esperar('Rebaixado volta ao padrão de Funcionário',
  (select papel = 'funcionario' and permissoes = app.permissoes_funcionario()
   from public.empresa_usuarios where email_convite = 'f6.func@teste.local'));

select public.definir_permissoes(
  (select id from public.empresa_usuarios where email_convite = 'f6.func@teste.local'),
  '{"gerenciar_estoque": true, "cancelar_venda": true}'::jsonb);

select * from pg_temp.esperar('Permissões concedidas individualmente',
  (select (permissoes ->> 'gerenciar_estoque')::boolean
      and (permissoes ->> 'cancelar_venda')::boolean
      and not (permissoes ->> 'visualizar_financeiro')::boolean
   from public.empresa_usuarios where email_convite = 'f6.func@teste.local'));

-- =============================================================================
-- 4. Imutabilidade do Gestor Principal (Seção 4.3) e limite do plano (6.8)
-- =============================================================================
select * from pg_temp.tentar('Gestor Principal não altera o próprio papel',
  'select public.alterar_papel_usuario(
     (select id from public.empresa_usuarios where usuario_id = auth.uid()), ''funcionario'')')
union all
select * from pg_temp.tentar('Gestor Principal não pode ser removido',
  'select public.remover_usuario(
     (select id from public.empresa_usuarios where usuario_id = auth.uid()))')
union all
select * from pg_temp.tentar('Ninguém pode ser promovido a Gestor Principal',
  'select public.alterar_papel_usuario(
     (select id from public.empresa_usuarios where email_convite = ''f6.func@teste.local''),
     ''gestor_principal'')')
union all
-- Já há 2 vínculos (Gestor Principal + Funcionário) e o plano permite 2.
select * from pg_temp.tentar('Convite acima do limite do plano',
  'select public.convidar_funcionario(''Terceiro'', ''f6.outro@teste.local'')');

-- =============================================================================
-- 5. Remoção preserva o histórico (Seção 5.6)
-- =============================================================================
select public.remover_usuario(
  (select id from public.empresa_usuarios where email_convite = 'f6.func@teste.local'));

select * from pg_temp.esperar('Remover não apaga o vínculo, só desativa',
  (select status = 'removido' and usuario_id is not null
   from public.empresa_usuarios where email_convite = 'f6.func@teste.local'))
union all
select * from pg_temp.esperar('O usuário continua existindo',
  (select count(*) = 1 from public.usuarios where email = 'f6.func@teste.local'));

-- O removido perde o acesso ao ambiente da empresa.
set local request.jwt.claims = '{"sub":"f6000000-0000-0000-0000-000000000002","role":"authenticated"}';
select * from pg_temp.esperar('Removido não tem mais empresa ativa',
  app.empresa_atual() is null)
union all
select * from pg_temp.esperar('Removido não enxerga produtos da empresa',
  (select count(*) = 0 from public.produtos));

-- Com a vaga liberada, o convite volta a caber no limite.
set local request.jwt.claims = '{"sub":"f6000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.convidar_funcionario('Terceiro', 'f6.outro@teste.local');

select * from pg_temp.esperar('Vaga liberada permite novo convite',
  (select count(*) = 1 from public.empresa_usuarios
   where email_convite = 'f6.outro@teste.local' and status = 'convidado'));

-- =============================================================================
-- 6. Auditoria (Seção 5.4)
-- =============================================================================
select * from pg_temp.esperar('Ações de usuário nomeadas na auditoria',
  (select count(distinct acao) = 4 from public.logs_auditoria
   where acao in ('usuario.promovido', 'usuario.rebaixado',
                  'usuario.permissoes_alteradas', 'usuario.removido')));

reset role;
rollback;
