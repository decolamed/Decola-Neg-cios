-- =============================================================================
-- Teste do Dashboard, notificações e dados da empresa — auditoria final
-- Especificação: Seções 7.2, 7.4, 7.9, 8.3, 9.1
--
-- Cobre o que a auditoria final encontrou faltando: o resumo dos quatro cards,
-- a central de notificações unindo `alertas_estoque` e `notificacoes`, e a
-- gravação da chave Pix — sem a qual o "Gerar Pix" da Seção 7.4 nunca funciona.
--
-- Roda em transação e faz ROLLBACK no fim. Executar com privilégio de service
-- role. Cada linha é uma asserção; procure por "FALHA" na saída.
--
-- Armadilhas evitadas (as mesmas dos demais arquivos): UPDATE barrado pela RLS
-- não levanta erro, então `bloqueado_em_silencio()` confere o `row_count`; e
-- cada asserção é um statement próprio, para não cair no snapshot do
-- `UNION ALL`.
-- =============================================================================

begin;

create temporary table resultados (ordem serial, teste text, resultado text);

create or replace function pg_temp.registrar(p_rotulo text, p_resultado text)
returns void language plpgsql security definer as $$
begin
  insert into pg_temp.resultados (teste, resultado) values (p_rotulo, p_resultado);
end;
$$;

create or replace function pg_temp.esperar(p_rotulo text, p_condicao boolean)
returns void language plpgsql as $$
begin
  perform pg_temp.registrar(p_rotulo, case when p_condicao then 'OK' else 'FALHA' end);
end;
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
  perform pg_temp.registrar(p_rotulo,
    case when v_linhas = 0 then 'BLOQUEADO: 0 linhas afetadas'
         else format('FALHA: %s linha(s) alterada(s)', v_linhas) end);
exception when others then
  perform pg_temp.registrar(p_rotulo, 'BLOQUEADO: ' || sqlerrm);
end;
$$;

-- Um convite pendente não é legível pelo próprio convidado — ver o cabeçalho
-- de `funcionarios_fase6.sql`.
create or replace function pg_temp.vinculo(p_email text)
returns uuid language sql security definer as $$
  select id from public.empresa_usuarios where email_convite = p_email;
$$;

insert into public.planos (id, nome, valor_mensal, limites, slug, ativo)
values ('fa000000-0000-0000-0000-0000000000b1','Plano FA',99.90,'{"max_funcionarios":10}','plano-fa', true);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-0000-0000-000000000001',
   'authenticated','authenticated','fa.gp@teste.local','x',now(),'{}','{"nome":"Gestor"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','fa000000-0000-0000-0000-000000000002',
   'authenticated','authenticated','fa.func@teste.local','x',now(),'{}','{"nome":"Funcionario"}',now(),now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"fa000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.criar_empresa_e_assinatura('Loja FA','fa000000-0000-0000-0000-0000000000b1','Gestor', true);
select public.convidar_funcionario('Funcionario', 'fa.func@teste.local');

set local request.jwt.claims = '{"sub":"fa000000-0000-0000-0000-000000000002","role":"authenticated"}';
select public.aceitar_convite(pg_temp.vinculo('fa.func@teste.local'));

set local request.jwt.claims = '{"sub":"fa000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- Estoque de referência igual ao atual: vender 9 de 10 derruba para 10% e
-- dispara o alerta da Seção 8.3.
insert into public.produtos (empresa_id, nome, preco, estoque_atual, estoque_referencia_alerta)
values (app.empresa_atual(), 'Produto FA', 10, 10, 10);

select public.registrar_venda(
  jsonb_build_array(jsonb_build_object(
    'produto_id', (select id from public.produtos where nome = 'Produto FA'),
    'quantidade', 9)),
  'dinheiro');

-- =============================================================================
-- 1. O alerta nasce da venda, sem o app pedir (Seção 8.3)
-- =============================================================================
select pg_temp.esperar('1a Venda que derruba o estoque gera alerta',
  (select count(*) >= 1 from public.alertas_estoque where empresa_id = app.empresa_atual()));

-- Uma notificação dirigida SÓ ao Gestor (como as de assinatura, 0026) e uma
-- para a empresa inteira.
reset role;
insert into public.notificacoes (empresa_id, categoria, titulo, mensagem, destinatario_id)
select id, 'assinatura', 'Aviso do Gestor', 'Somente para gestores.',
       'fa000000-0000-0000-0000-000000000001'
from public.empresas where nome = 'Loja FA';

insert into public.notificacoes (empresa_id, categoria, titulo, mensagem)
select id, 'administrativo', 'Aviso geral', 'Para toda a empresa.'
from public.empresas where nome = 'Loja FA';

set local role authenticated;
set local request.jwt.claims = '{"sub":"fa000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- =============================================================================
-- 2. Resumo dos cards e badge do sino (Seção 7.2)
-- =============================================================================
select pg_temp.esperar('2a Gestor enxerga o aviso dirigido a ele e o geral',
  (select count(*) = 2 from public.notificacoes));
-- 1 alerta de estoque + 2 notificações, todos não lidos.
select pg_temp.esperar('2b Resumo conta alertas e notificacoes nao lidos',
  ((public.resumo_dashboard() ->> 'nao_lidas')::int = 3));
select pg_temp.esperar('2c Resumo traz o total vendido de hoje',
  ((public.resumo_dashboard() ->> 'vendas_hoje_total')::numeric = 90));
select pg_temp.esperar('2d Resumo aponta o produto em estoque baixo',
  ((public.resumo_dashboard() ->> 'estoque_baixo')::int = 1));

-- =============================================================================
-- 3. Marcar como lido é a ÚNICA escrita permitida (grant por coluna, 0014)
-- =============================================================================
update public.notificacoes set lido_por = auth.uid(), lido_em = now()
where titulo = 'Aviso geral';

select pg_temp.esperar('3a Marcar como lido reduz o badge',
  ((public.resumo_dashboard() ->> 'nao_lidas')::int = 2));
select pg_temp.tentar('3b Cliente reescreve a mensagem de uma notificacao',
  'update public.notificacoes set mensagem = ''forjado'' where titulo = ''Aviso geral''');
select pg_temp.tentar('3c Cliente reescreve a mensagem de um alerta',
  'update public.alertas_estoque set mensagem = ''forjado'' where empresa_id = app.empresa_atual()');
select pg_temp.tentar('3d Cliente cria notificacao do nada',
  'insert into public.notificacoes (empresa_id, categoria, titulo, mensagem)
   values (app.empresa_atual(), ''administrativo'', ''Falso'', ''Falso'')');

-- =============================================================================
-- 4. A central respeita o destinatário (Seção 7.2 + política de 0007)
-- =============================================================================
set local request.jwt.claims = '{"sub":"fa000000-0000-0000-0000-000000000002","role":"authenticated"}';

select pg_temp.esperar('4a Funcionario nao ve o aviso dirigido ao Gestor',
  (select count(*) = 1 from public.notificacoes));
select pg_temp.esperar('4b Funcionario ve os alertas de estoque da empresa',
  (select count(*) >= 1 from public.alertas_estoque));
select pg_temp.esperar('4c Funcionario tem o proprio resumo do Dashboard',
  ((public.resumo_dashboard() ->> 'produtos_ativos')::int = 1));

-- =============================================================================
-- 5. Dados da empresa e chave Pix (Seções 7.9, 7.4 e 6.9)
-- =============================================================================
set local request.jwt.claims = '{"sub":"fa000000-0000-0000-0000-000000000001","role":"authenticated"}';

update public.empresas set chave_pix = 'gestor@teste.local' where id = app.empresa_atual();

select pg_temp.esperar('5a Gestor grava a chave Pix',
  (select chave_pix = 'gestor@teste.local' from public.empresas where id = app.empresa_atual()));
-- Seção 6.9 — `status` é do administrador da plataforma; nem consta no GRANT.
select pg_temp.tentar('5b Gestor muda o status da propria empresa',
  'update public.empresas set status = ''inativa'' where id = app.empresa_atual()');

set local request.jwt.claims = '{"sub":"fa000000-0000-0000-0000-000000000002","role":"authenticated"}';
select pg_temp.bloqueado_em_silencio('5c Funcionario grava a chave Pix',
  'update public.empresas set chave_pix = ''pirata'' where id = app.empresa_atual()');

reset role;
select ordem, teste, resultado from pg_temp.resultados order by ordem;

rollback;
