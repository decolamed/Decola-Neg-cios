-- =============================================================================
-- Teste de assinatura e pagamento — Fase 7 (Seções 6.4 a 6.9, 7.12, 7.13, 7.14)
--
-- Roda em transação e faz ROLLBACK no fim. Executar com privilégio de
-- service role. Cada linha é uma asserção; procure por "FALHA" na saída.
--
-- DUAS ARMADILHAS que este arquivo evita de propósito:
--
-- 1. A RLS bloqueia UPDATE e DELETE EM SILÊNCIO — afeta 0 linhas, sem levantar
--    exceção. Um teste que só olha "deu erro?" dá falso negativo. Por isso
--    `bloqueado_em_silencio()` confere o `row_count`, e não a exceção.
--
-- 2. Dentro de um mesmo statement, todas as ramificações de um `UNION ALL`
--    enxergam o snapshot do INÍCIO do statement. Aqui cada asserção é um
--    statement próprio, gravando numa tabela temporária, e o resultado sai
--    todo junto no SELECT final.
--
-- Um convite pendente NÃO é legível pelo próprio convidado (a política
-- `empresa_usuarios_leitura` casa por `usuario_id` ou por empresa, e o
-- convidado ainda não tem nenhum dos dois). Quem resolve o id do vínculo é
-- `pg_temp.vinculo()`, SECURITY DEFINER — no app quem faz isso é a RPC
-- `aceitar_convite`, que também é SECURITY DEFINER e recebe o id pelo link.
-- =============================================================================

begin;

create temporary table resultados (ordem serial, teste text, resultado text);

-- Gravação elevada: a tabela temporária pertence ao dono da sessão, e as
-- asserções rodam sob `role authenticated`.
create or replace function pg_temp.registrar(p_rotulo text, p_resultado text)
returns void language plpgsql security definer as $$
begin
  insert into pg_temp.resultados (teste, resultado) values (p_rotulo, p_resultado);
end;
$$;

create or replace function pg_temp.vinculo(p_email text)
returns uuid language sql security definer as $$
  select id from public.empresa_usuarios where email_convite = p_email;
$$;

/** Para operações que DEVEM levantar exceção (RPCs, GRANT, CHECK). */
create or replace function pg_temp.tentar(p_rotulo text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  perform pg_temp.registrar(p_rotulo, 'FALHA: deveria ter sido bloqueado');
exception when others then
  perform pg_temp.registrar(p_rotulo, 'BLOQUEADO: ' || sqlerrm);
end;
$$;

/** Para UPDATE/DELETE que a RLS barra sem erro: o que prova é o row_count. */
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

-- Quatro planos: o do meio é o contratado, para exercitar upgrade e downgrade;
-- o último está desativado, para a guarda da Seção 6.1.
insert into public.planos (id, nome, valor_mensal, limites, slug, ativo)
values
  ('f7000000-0000-0000-0000-0000000000b1','Basico F7',49.90,'{"max_funcionarios":2}','basico-f7', true),
  ('f7000000-0000-0000-0000-0000000000b2','Pro F7',99.90,'{"max_funcionarios":10}','pro-f7', true),
  ('f7000000-0000-0000-0000-0000000000b3','Max F7',199.90,'{}','max-f7', true),
  ('f7000000-0000-0000-0000-0000000000b4','Descontinuado F7',29.90,'{}','desc-f7', false);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','f7000000-0000-0000-0000-000000000001',
   'authenticated','authenticated','f7.gp@teste.local','x',now(),'{}','{"nome":"Gestor Principal"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','f7000000-0000-0000-0000-000000000002',
   'authenticated','authenticated','f7.func@teste.local','x',now(),'{}','{"nome":"Funcionario"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','f7000000-0000-0000-0000-000000000003',
   'authenticated','authenticated','f7.terceiro@teste.local','x',now(),'{}','{"nome":"Terceiro"}',now(),now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.criar_empresa_e_assinatura('Loja F7','f7000000-0000-0000-0000-0000000000b2','Gestor Principal', true);

insert into public.produtos (empresa_id, nome, preco, estoque_atual)
values (app.empresa_atual(), 'Produto Controle', 10, 5);

-- =============================================================================
-- 1. Escrita direta em `assinaturas` continua fechada (Seções 6.4 e 9.1)
--
-- Nem a troca de plano nem a ativação passam pelo cliente: a tabela não tem
-- verbo de escrita para `authenticated` (0014), e o job diário é exclusivo do
-- service_role (0026). A ativação só acontece pelo webhook do Asaas.
-- =============================================================================
select pg_temp.tentar('1a Cliente ativa a propria assinatura por UPDATE direto',
  'update public.assinaturas set status = ''ativa'' where empresa_id = app.empresa_atual()');
select pg_temp.tentar('1b Cliente agenda troca de plano por UPDATE direto',
  'update public.assinaturas set plano_agendado_id = ''f7000000-0000-0000-0000-0000000000b1''
   where empresa_id = app.empresa_atual()');
select pg_temp.tentar('1c Cliente roda o job de expiracoes',
  'select public.processar_assinaturas()');

-- =============================================================================
-- 2. `gerenciar_assinatura` é exclusiva do Gestor (Seções 5.3 e 7.13)
-- =============================================================================
select public.convidar_funcionario('Funcionario', 'f7.func@teste.local');

-- "nunca concedível ao Funcionário" — nem pelo Gestor.
select pg_temp.tentar('2a Gestor concede gerenciar_assinatura a um Funcionario',
  'select public.definir_permissoes(pg_temp.vinculo(''f7.func@teste.local''),
     ''{"gerenciar_assinatura": true}''::jsonb)');

set local request.jwt.claims = '{"sub":"f7000000-0000-0000-0000-000000000002","role":"authenticated"}';
select public.aceitar_convite(pg_temp.vinculo('f7.func@teste.local'));

select pg_temp.tentar('2b Funcionario troca o plano da empresa',
  'select public.trocar_plano(''f7000000-0000-0000-0000-0000000000b3'')');
select pg_temp.tentar('2c Funcionario cancela a troca agendada',
  'select public.cancelar_troca_de_plano()');

-- =============================================================================
-- 3. Guardas da troca (Seções 6.1 e 6.7)
-- =============================================================================
set local request.jwt.claims = '{"sub":"f7000000-0000-0000-0000-000000000001","role":"authenticated"}';

select pg_temp.tentar('3a Trocar para o plano ja contratado',
  'select public.trocar_plano(''f7000000-0000-0000-0000-0000000000b2'')');
select pg_temp.tentar('3b Trocar para plano desativado',
  'select public.trocar_plano(''f7000000-0000-0000-0000-0000000000b4'')');
select pg_temp.tentar('3c Trocar para plano inexistente',
  'select public.trocar_plano(''f7000000-0000-0000-0000-00000000ffff'')');

-- =============================================================================
-- 4. Downgrade acima do limite é RECUSADO, com a lista do excesso (Seção 6.7)
--
-- "o sistema informa ao Gestor exatamente quais limites estão sendo excedidos
--  antes de confirmar a troca" — e "nunca desativa automaticamente
--  funcionários, produtos ou qualquer dado do cliente para forçar um
--  downgrade".
-- =============================================================================
select public.convidar_funcionario('Terceiro', 'f7.terceiro@teste.local');

-- Três vínculos (Gestor Principal + Funcionário + convidado); o Basico F7
-- permite 2. A mensagem esperada é literalmente:
--   "Ajuste sua empresa antes de trocar de plano.
--    Funcionários: você tem 3 e o plano Basico F7 permite 2."
select pg_temp.tentar('4a Downgrade com funcionarios acima do limite',
  'select public.trocar_plano(''f7000000-0000-0000-0000-0000000000b1'')');
select pg_temp.esperar('4b Downgrade recusado nao desativa ninguem',
  (select count(*) = 3 from public.empresa_usuarios
   where empresa_id = app.empresa_atual() and status in ('ativo', 'convidado')));
select pg_temp.esperar('4c Downgrade recusado nao agenda nada',
  (select plano_agendado_id is null from public.assinaturas
   where empresa_id = app.empresa_atual()));

-- =============================================================================
-- 5. Upgrade é IMEDIATO (Seção 6.7)
-- =============================================================================
select public.trocar_plano('f7000000-0000-0000-0000-0000000000b3');

select pg_temp.esperar('5a Upgrade aplica na hora, com o novo valor',
  (select plano_id = 'f7000000-0000-0000-0000-0000000000b3'
      and valor_contratado = 199.90
      and plano_agendado_id is null
   from public.assinaturas where empresa_id = app.empresa_atual()));
select pg_temp.esperar('5b Upgrade registrado na auditoria',
  (select count(*) = 1 from public.logs_auditoria
   where empresa_id = app.empresa_atual() and acao = 'assinatura.upgrade'));

-- =============================================================================
-- 6. Downgrade dentro do limite fica AGENDADO (Seção 6.7)
-- =============================================================================
-- Libera uma vaga para caber no Basico F7.
select public.remover_usuario(pg_temp.vinculo('f7.terceiro@teste.local'));

-- Vencimento conhecido, para conferir a data do agendamento.
reset role;
update public.assinaturas set proximo_vencimento = current_date + 20
where empresa_id = (select id from public.empresas where nome = 'Loja F7');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.trocar_plano('f7000000-0000-0000-0000-0000000000b1');

select pg_temp.esperar('6a Downgrade nao muda o plano atual',
  (select plano_id = 'f7000000-0000-0000-0000-0000000000b3' and valor_contratado = 199.90
   from public.assinaturas where empresa_id = app.empresa_atual()));
select pg_temp.esperar('6b Downgrade agendado para o proximo vencimento',
  (select plano_agendado_id = 'f7000000-0000-0000-0000-0000000000b1'
      and troca_agendada_para = current_date + 20
      and valor_agendado = 49.90
   from public.assinaturas where empresa_id = app.empresa_atual()));
select pg_temp.esperar('6c Downgrade agendado registrado na auditoria',
  (select count(*) = 1 from public.logs_auditoria
   where empresa_id = app.empresa_atual() and acao = 'assinatura.downgrade_agendado'));

-- O Gestor pode desistir antes de a troca entrar em vigor.
select public.cancelar_troca_de_plano();
select pg_temp.esperar('6d Cancelar a troca limpa o agendamento',
  (select plano_agendado_id is null and troca_agendada_para is null and valor_agendado is null
   from public.assinaturas where empresa_id = app.empresa_atual()));

-- =============================================================================
-- 7. Job diário: trial vencido → modo limitado (Seções 6.5 e 6.6)
-- =============================================================================
reset role;
update public.assinaturas
set status = 'trial', trial_expira_em = now() - interval '1 day'
where empresa_id = (select id from public.empresas where nome = 'Loja F7');

select public.processar_assinaturas();

select pg_temp.esperar('7a Trial vencido entra em modo limitado',
  (select status = 'modo_limitado' from public.assinaturas
   where empresa_id = (select id from public.empresas where nome = 'Loja F7')));
select pg_temp.esperar('7b Expiracao do trial registrada na auditoria',
  (select count(*) = 1 from public.logs_auditoria where acao = 'assinatura.trial_expirado'));
-- Só os Gestores são avisados (Seção 6.6: "o Gestor recebe notificações").
select pg_temp.esperar('7c Aviso do fim do trial vai so para os Gestores',
  (select count(*) = 1 from public.notificacoes n
   join public.empresa_usuarios eu on eu.usuario_id = n.destinatario_id
   where n.titulo = 'Seu período de teste terminou'
     and eu.papel in ('gestor', 'gestor_principal')));
select pg_temp.esperar('7d Funcionario nao recebe o aviso de assinatura',
  (select count(*) = 0 from public.notificacoes n
   join public.empresa_usuarios eu on eu.usuario_id = n.destinatario_id
   where n.titulo = 'Seu período de teste terminou' and eu.papel = 'funcionario'));

-- Idempotência: o job roda todo dia e não pode duplicar aviso nem log.
select public.processar_assinaturas();

select pg_temp.esperar('7e Rodar o job de novo nao duplica a auditoria',
  (select count(*) = 1 from public.logs_auditoria where acao = 'assinatura.trial_expirado'));
select pg_temp.esperar('7f Rodar o job de novo nao duplica a notificacao',
  (select count(*) = 1 from public.notificacoes where titulo = 'Seu período de teste terminou'));

-- =============================================================================
-- 8. Modo limitado: consulta liberada, escrita bloqueada (Seção 6.6)
-- =============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"f7000000-0000-0000-0000-000000000001","role":"authenticated"}';

select pg_temp.esperar('8a Em modo limitado a assinatura continua legivel',
  (select count(*) = 1 from public.assinaturas where empresa_id = app.empresa_atual()));
select pg_temp.esperar('8b Em modo limitado os produtos continuam legiveis',
  (select count(*) = 1 from public.produtos where empresa_id = app.empresa_atual()));
select pg_temp.tentar('8c Em modo limitado o Gestor cadastra produto',
  'insert into public.produtos (empresa_id, nome, preco, estoque_atual)
   values (app.empresa_atual(), ''Produto F7'', 10, 5)');
-- UPDATE barrado pela RLS não levanta erro: o que prova é o row_count.
select pg_temp.bloqueado_em_silencio('8d Em modo limitado o Gestor edita produto',
  'update public.produtos set preco = 99 where empresa_id = app.empresa_atual()');
select pg_temp.tentar('8e Em modo limitado o Gestor ajusta estoque',
  'select public.ajustar_estoque(
     (select id from public.produtos where empresa_id = app.empresa_atual() limit 1), 5)');
-- Seção 6.6 — a saída do modo limitado é o pagamento, não a troca de plano.
select pg_temp.tentar('8f Em modo limitado o Gestor troca de plano',
  'select public.trocar_plano(''f7000000-0000-0000-0000-0000000000b2'')');

-- =============================================================================
-- 9. Job diário: carência vencida e downgrade agendado que venceu (6.6 e 6.7)
-- =============================================================================
reset role;
update public.assinaturas
set status = 'carencia',
    carencia_expira_em = now() - interval '1 hour',
    plano_agendado_id = 'f7000000-0000-0000-0000-0000000000b1',
    troca_agendada_para = current_date,
    valor_agendado = 49.90
where empresa_id = (select id from public.empresas where nome = 'Loja F7');

select public.processar_assinaturas();

select pg_temp.esperar('9a Carencia vencida entra em modo limitado',
  (select status = 'modo_limitado' from public.assinaturas
   where empresa_id = (select id from public.empresas where nome = 'Loja F7')));
select pg_temp.esperar('9b Downgrade vencido e aplicado ao plano atual',
  (select plano_id = 'f7000000-0000-0000-0000-0000000000b1'
      and valor_contratado = 49.90
      and plano_agendado_id is null
      and troca_agendada_para is null
      and valor_agendado is null
   from public.assinaturas
   where empresa_id = (select id from public.empresas where nome = 'Loja F7')));
select pg_temp.esperar('9c Fim da carencia registrado na auditoria',
  (select count(*) = 1 from public.logs_auditoria where acao = 'assinatura.carencia_expirada'));
select pg_temp.esperar('9d Downgrade aplicado registrado na auditoria',
  (select count(*) = 1 from public.logs_auditoria where acao = 'assinatura.downgrade_aplicado'));

-- =============================================================================
-- 10. Integridade do agendamento (constraint da 0025)
-- =============================================================================
select pg_temp.tentar('10a Agendamento pela metade (plano sem data)',
  'update public.assinaturas
   set plano_agendado_id = ''f7000000-0000-0000-0000-0000000000b2''
   where empresa_id = (select id from public.empresas where nome = ''Loja F7'')');

reset role;
select ordem, teste, resultado from pg_temp.resultados order by ordem;

rollback;
