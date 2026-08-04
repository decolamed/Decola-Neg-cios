-- =============================================================================
-- Teste do Painel Administrativo — Fase 8 (Seções 6.9, 7.15, 11.1, 11.2, 11.3)
--
-- Roda em transação e faz ROLLBACK no fim. Executar com privilégio de
-- service role. Cada linha é uma asserção; procure por "FALHA" na saída.
--
-- TRÊS ARMADILHAS que este arquivo evita de propósito:
--
-- 1. A RLS barra UPDATE e DELETE EM SILÊNCIO — 0 linhas, sem exceção.
--    `bloqueado_em_silencio()` confere o `row_count`, não a exceção.
--
-- 2. Dentro de um mesmo statement, todas as ramificações de um `UNION ALL`
--    enxergam o snapshot do início do statement. Aqui cada asserção é um
--    statement próprio.
--
-- 3. O administrador da plataforma NÃO pertence a nenhuma empresa (Seção
--    11.1), então ele não lê `notificacoes` — a política exige `pode_ler` da
--    empresa. Conferir uma notificação de cliente sob a identidade do
--    administrador dá falso negativo: quem confere é o Gestor da empresa.
--
-- E uma regra do contexto de auditoria: `app.definir_contexto()` vale pela
-- TRANSAÇÃO. Como este arquivo encadeia operações que pelo PostgREST seriam
-- requisições separadas, as verificações de auditoria de plataforma ficam
-- antes de qualquer RPC que nomeie ação, ou depois de `app.limpar_contexto()`.
-- =============================================================================

begin;

create temporary table resultados (ordem serial, teste text, resultado text);

create or replace function pg_temp.registrar(p_rotulo text, p_resultado text)
returns void language plpgsql security definer as $$
begin
  insert into pg_temp.resultados (teste, resultado) values (p_rotulo, p_resultado);
end;
$$;

create or replace function pg_temp.empresa(p_nome text)
returns uuid language sql security definer as $$
  select id from public.empresas where nome = p_nome;
$$;

/** Conta linhas fora da RLS do chamador — usado para conferir efeitos que o
    administrador não enxerga (notificações de cliente). */
create or replace function pg_temp.contar_notificacoes(p_titulo text)
returns integer language sql security definer as $$
  select count(*)::integer from public.notificacoes where titulo = p_titulo;
$$;

create or replace function pg_temp.tentar(p_rotulo text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.registrar(p_rotulo, 'FALHA: deveria ter sido bloqueado');
exception when others then
  perform pg_temp.registrar(p_rotulo, 'BLOQUEADO: ' || sqlerrm);
end;
$$;

create or replace function pg_temp.bloqueado_em_silencio(p_rotulo text, p_sql text)
returns void language plpgsql as $$
declare
  v_linhas integer;
begin
  execute p_sql;
  get diagnostics v_linhas = row_count;
  perform pg_temp.registrar(
    p_rotulo,
    case when v_linhas = 0 then 'BLOQUEADO: 0 linhas afetadas'
         else format('FALHA: %s linha(s) alterada(s)', v_linhas) end);
exception when others then
  perform pg_temp.registrar(p_rotulo, 'BLOQUEADO: ' || sqlerrm);
end;
$$;

create or replace function pg_temp.esperar(p_rotulo text, p_condicao boolean)
returns void language plpgsql as $$
begin
  perform pg_temp.registrar(p_rotulo, case when p_condicao then 'OK' else 'FALHA' end);
end;
$$;

insert into public.planos (id, nome, valor_mensal, limites, slug, ativo)
values
  ('f8000000-0000-0000-0000-0000000000b1','Basico F8',49.90,'{"max_funcionarios":2}','basico-f8', true),
  ('f8000000-0000-0000-0000-0000000000b2','Pro F8',99.90,'{"max_funcionarios":10}','pro-f8', true);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','f8000000-0000-0000-0000-000000000001',
   'authenticated','authenticated','f8.admin@decola.local','x',now(),'{}','{"nome":"Admin Decola"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','f8000000-0000-0000-0000-000000000002',
   'authenticated','authenticated','f8.gp@teste.local','x',now(),'{}','{"nome":"Gestor Cliente"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','f8000000-0000-0000-0000-000000000003',
   'authenticated','authenticated','f8.orfao@teste.local','x',now(),'{}','{"nome":"Conta Orfa"}',now(),now());

insert into public.administradores_plataforma (id, nome, email)
values ('f8000000-0000-0000-0000-000000000001','Admin Decola','f8.admin@decola.local');

-- Empresa cliente comum, criada pelo autoatendimento (Seção 6.2).
set local role authenticated;
set local request.jwt.claims = '{"sub":"f8000000-0000-0000-0000-000000000002","role":"authenticated"}';
select public.criar_empresa_e_assinatura('Loja Cliente F8','f8000000-0000-0000-0000-0000000000b2','Gestor Cliente', true);

-- =============================================================================
-- 1. Isolamento do painel (Seções 9.1 e 11.1)
--
-- "Completamente separado do app cliente" NÃO é uma questão de roteamento:
-- nenhuma RPC administrativa aceita um usuário de empresa, por mais Gestor
-- Principal que ele seja.
-- =============================================================================
select pg_temp.tentar('1a Gestor de empresa le as metricas do painel',
  'select public.admin_metricas()');
select pg_temp.tentar('1b Gestor de empresa cria empresa manualmente',
  'select public.admin_criar_empresa(''f8000000-0000-0000-0000-000000000003'', ''Pirata'',
     ''f8000000-0000-0000-0000-0000000000b1'')');
select pg_temp.tentar('1c Gestor de empresa muda o status da propria empresa',
  'select public.admin_definir_status_empresa(app.empresa_atual(), ''ativa'')');
select pg_temp.tentar('1d Gestor de empresa ativa a propria assinatura',
  'select public.admin_ativar_assinatura(app.empresa_atual())');
select pg_temp.tentar('1e Gestor de empresa estende o proprio trial',
  'select public.admin_definir_trial(app.empresa_atual(), now() + interval ''999 days'')');
select pg_temp.tentar('1f Gestor de empresa altera o proprio plano por RPC de admin',
  'select public.admin_alterar_plano_empresa(app.empresa_atual(),
     ''f8000000-0000-0000-0000-0000000000b1'', 0)');
select pg_temp.tentar('1g Gestor de empresa exclui a propria empresa',
  'select public.admin_excluir_empresa(app.empresa_atual(), ''Loja Cliente F8'')');

-- =============================================================================
-- 2. Entidades de plataforma continuam fechadas ao cliente (Seções 6.1 e 6.9)
-- =============================================================================
select pg_temp.tentar('2a Cliente cria plano',
  'insert into public.planos (nome, valor_mensal, slug) values (''Pirata'', 0, ''pirata'')');
select pg_temp.bloqueado_em_silencio('2b Cliente edita plano',
  'update public.planos set valor_mensal = 0 where id = ''f8000000-0000-0000-0000-0000000000b2''');
select pg_temp.bloqueado_em_silencio('2c Cliente muda o trial global',
  'update public.configuracoes_plataforma set trial_dias = 999');
select pg_temp.esperar('2d Cliente nao enxerga a lista de administradores',
  (select count(*) = 0 from public.administradores_plataforma));

-- =============================================================================
-- 3. Auditoria das entidades de plataforma (Seção 5.4)
--
-- Fica ANTES de qualquer RPC que nomeie ação, para que o nome derivado do
-- TG_OP seja o que realmente vale — ver a nota sobre contexto no cabeçalho.
-- =============================================================================
set local request.jwt.claims = '{"sub":"f8000000-0000-0000-0000-000000000001","role":"authenticated"}';

update public.planos set valor_mensal = 129.90 where id = 'f8000000-0000-0000-0000-0000000000b2';
update public.configuracoes_plataforma set trial_dias = 14;

select pg_temp.esperar('3a Edicao de plano auditada, sem empresa',
  (select count(*) = 1 from public.logs_auditoria
   where acao = 'plano.editado' and empresa_id is null));
select pg_temp.esperar('3b Configuracao da plataforma auditada, sem empresa',
  (select count(*) = 1 from public.logs_auditoria
   where acao = 'configuracao_plataforma.editado' and empresa_id is null));
-- Seção 7.15 C — "alterar o valor mensal não afeta assinantes já ativos".
select pg_temp.esperar('3c Novo valor de tabela nao mexe no preco ja contratado',
  (select valor_contratado = 99.90 from public.assinaturas
   where empresa_id = pg_temp.empresa('Loja Cliente F8')));

-- =============================================================================
-- 4. Ativação manual de conta (Seções 6.9 e 7.15 B)
-- =============================================================================
select public.admin_criar_empresa(
  'f8000000-0000-0000-0000-000000000003', 'Loja Manual F8',
  'f8000000-0000-0000-0000-0000000000b1', 'ativa');

select pg_temp.esperar('4a Empresa manual criada e ativa',
  (select status = 'ativa' from public.empresas where nome = 'Loja Manual F8'));
select pg_temp.esperar('4b Responsavel virou Gestor Principal ativo, com todas as permissoes',
  (select papel = 'gestor_principal' and status = 'ativo'
      and permissoes = app.permissoes_gestor() and aceito_em is not null
   from public.empresa_usuarios
   where usuario_id = 'f8000000-0000-0000-0000-000000000003'));
select pg_temp.esperar('4c Assinatura nasce ativa, manual e com ativada_por preenchido',
  (select status = 'ativa' and ativada_manualmente
      and ativada_por = 'f8000000-0000-0000-0000-000000000001'
      and valor_contratado = 49.90
   from public.assinaturas where empresa_id = pg_temp.empresa('Loja Manual F8')));
-- Seção 7.15 B — conta órfã é REAPROVEITADA, não duplicada.
select pg_temp.esperar('4d Conta orfa reaproveitada, sem usuario duplicado',
  (select count(*) = 1 from public.usuarios where email = 'f8.orfao@teste.local'));
select pg_temp.esperar('4e Criacao manual registrada na auditoria',
  (select count(*) = 1 from public.logs_auditoria where acao = 'empresa.criada_manualmente'));

-- Seção 5.1 — "1 usuário = 1 empresa" é absoluta; a mensagem é a da Seção 7.15 B.
select pg_temp.tentar('4f Responsavel ja vinculado a outra empresa',
  'select public.admin_criar_empresa(''f8000000-0000-0000-0000-000000000002'', ''Outra'',
     ''f8000000-0000-0000-0000-0000000000b1'')');
-- Seção 11.1 — administrador da plataforma não vira Gestor de empresa.
select pg_temp.tentar('4g Administrador da plataforma como responsavel',
  'select public.admin_criar_empresa(''f8000000-0000-0000-0000-000000000001'', ''Outra'',
     ''f8000000-0000-0000-0000-0000000000b1'')');
select pg_temp.tentar('4h Empresa sem nome',
  'select public.admin_criar_empresa(''f8000000-0000-0000-0000-000000000003'', ''   '',
     ''f8000000-0000-0000-0000-0000000000b1'')');

-- =============================================================================
-- 5. Plano e assinatura pelo painel (Seções 7.15 B e C)
-- =============================================================================
select public.admin_alterar_plano_empresa(
  pg_temp.empresa('Loja Cliente F8'), 'f8000000-0000-0000-0000-0000000000b1', 19.90);

select pg_temp.esperar('5a Plano trocado com valor combinado (preco legado)',
  (select plano_id = 'f8000000-0000-0000-0000-0000000000b1' and valor_contratado = 19.90
   from public.assinaturas where empresa_id = pg_temp.empresa('Loja Cliente F8')));
select pg_temp.tentar('5b Valor negativo',
  'select public.admin_alterar_plano_empresa(pg_temp.empresa(''Loja Cliente F8''),
     ''f8000000-0000-0000-0000-0000000000b2'', -1)');

-- Ativação manual resgata uma conta que caiu em modo limitado (Seção 6.6).
reset role;
update public.assinaturas set status = 'modo_limitado'
where empresa_id = (select id from public.empresas where nome = 'Loja Cliente F8');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f8000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.admin_ativar_assinatura(pg_temp.empresa('Loja Cliente F8'));

select pg_temp.esperar('5c Ativacao manual tira do modo limitado',
  (select status = 'ativa' and ativada_manualmente
   from public.assinaturas where empresa_id = pg_temp.empresa('Loja Cliente F8')));
-- Contado por função elevada: o administrador não lê notificações de cliente.
select pg_temp.esperar('5d Gestor da empresa foi notificado da liberacao',
  pg_temp.contar_notificacoes('Acesso liberado') = 1);

-- =============================================================================
-- 6. Período de teste por empresa (Seção 7.15 B)
-- =============================================================================
reset role;
update public.assinaturas
set status = 'modo_limitado', trial_expira_em = now() - interval '5 days'
where empresa_id = (select id from public.empresas where nome = 'Loja Manual F8');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f8000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.admin_definir_trial(pg_temp.empresa('Loja Manual F8'), now() + interval '30 days');

select pg_temp.esperar('6a Estender o teste devolve o acesso',
  (select status = 'trial' and trial_expira_em > now() + interval '29 days'
   from public.assinaturas where empresa_id = pg_temp.empresa('Loja Manual F8')));
select pg_temp.tentar('6b Estender o teste sem informar a data',
  'select public.admin_definir_trial(pg_temp.empresa(''Loja Manual F8''), null)');

-- =============================================================================
-- 7. Métricas do painel (Seção 7.15 A)
-- =============================================================================
select pg_temp.esperar('7a Empresas ativas',
  ((public.admin_metricas() ->> 'empresas_ativas')::int = 2));
-- MRR pelo valor CONTRATADO, não pelo de tabela (preço legado, Seção 7.15 C).
select pg_temp.esperar('7b MRR soma so as assinaturas ativas, pelo valor contratado',
  ((public.admin_metricas() ->> 'mrr')::numeric = 19.90));
select pg_temp.esperar('7c Empresas em trial aparecem para acao proativa',
  ((public.admin_metricas() ->> 'em_trial')::int = 1));
select pg_temp.esperar('7d Novas empresas do mes',
  ((public.admin_metricas() ->> 'novas_no_mes')::int = 2));

-- =============================================================================
-- 8. Status da empresa (Seção 6.9)
--
-- `empresas.status` e `assinaturas.status` são máquinas de estado
-- INDEPENDENTES: mexer numa não move a outra.
-- =============================================================================
select public.admin_definir_status_empresa(pg_temp.empresa('Loja Cliente F8'), 'suspensa');

select pg_temp.esperar('8a Suspender nao marca data de encerramento',
  (select status = 'suspensa' and encerrada_em is null
   from public.empresas where nome = 'Loja Cliente F8'));
select pg_temp.esperar('8b Suspender nao mexe na assinatura',
  (select status = 'ativa' from public.assinaturas
   where empresa_id = pg_temp.empresa('Loja Cliente F8')));
select pg_temp.esperar('8c Suspensao registrada na auditoria',
  (select count(*) = 1 from public.logs_auditoria where acao = 'empresa.suspensa'));
select pg_temp.tentar('8d Definir o status que a empresa ja tem',
  'select public.admin_definir_status_empresa(pg_temp.empresa(''Loja Cliente F8''), ''suspensa'')');

select public.admin_definir_status_empresa(pg_temp.empresa('Loja Cliente F8'), 'inativa');
select pg_temp.esperar('8e Encerrar grava a data, base do churn',
  (select status = 'inativa' and encerrada_em is not null
   from public.empresas where nome = 'Loja Cliente F8'));
select pg_temp.esperar('8f Churn do mes calculado sobre a base do inicio do mes',
  ((public.admin_metricas() ->> 'encerradas_no_mes')::int = 1
   and (public.admin_metricas() ->> 'churn_percentual')::numeric = 50.00));

select public.admin_definir_status_empresa(pg_temp.empresa('Loja Cliente F8'), 'ativa');
select pg_temp.esperar('8g Reativar limpa a data de encerramento',
  (select status = 'ativa' and encerrada_em is null
   from public.empresas where nome = 'Loja Cliente F8'));

-- Empresa suspensa trava o cliente, preservando os dados (Seção 6.9).
reset role;
update public.empresas set status = 'suspensa'
where nome = 'Loja Cliente F8';

set local role authenticated;
set local request.jwt.claims = '{"sub":"f8000000-0000-0000-0000-000000000002","role":"authenticated"}';
select pg_temp.esperar('8h Empresa suspensa: o Gestor ainda le a propria conta',
  (select count(*) = 1 from public.empresas where id = app.empresa_atual()));
select pg_temp.tentar('8i Empresa suspensa: o Gestor nao cadastra produto',
  'insert into public.produtos (empresa_id, nome, preco, estoque_atual)
   values (app.empresa_atual(), ''Produto F8'', 10, 5)');

-- =============================================================================
-- 9. Exclusão definitiva (Seções 6.9 e 7.15 B)
-- =============================================================================
set local request.jwt.claims = '{"sub":"f8000000-0000-0000-0000-000000000001","role":"authenticated"}';

select pg_temp.tentar('9a Excluir com confirmacao errada',
  'select public.admin_excluir_empresa(pg_temp.empresa(''Loja Manual F8''), ''loja manual'')');
select pg_temp.esperar('9b Empresa continua existindo apos confirmacao errada',
  (select count(*) = 1 from public.empresas where nome = 'Loja Manual F8'));

select public.admin_excluir_empresa(pg_temp.empresa('Loja Manual F8'), 'Loja Manual F8');

select pg_temp.esperar('9c Empresa excluida definitivamente',
  (select count(*) = 0 from public.empresas where nome = 'Loja Manual F8'));
-- O log da exclusão nasce com `empresa_id` nulo justamente para sobreviver ao
-- cascade que apaga tudo o que pertencia à empresa.
select pg_temp.esperar('9d Registro da exclusao sobrevive ao cascade',
  (select count(*) = 1 from public.logs_auditoria
   where acao = 'empresa.excluida_definitivamente' and empresa_id is null));

reset role;
select ordem, teste, resultado from pg_temp.resultados order by ordem;

rollback;
