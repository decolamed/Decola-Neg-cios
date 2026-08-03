-- =============================================================================
-- Teste de estoque e produtos — Fase 3 (Seções 4.5, 4.6, 7.5, 7.6, 8.3, 8.4)
--
-- Roda em transação e faz ROLLBACK no fim. Executar com privilégio de
-- service role. Cada linha é uma asserção; procure por "FALHA" na saída.
--
-- ATENÇÃO ao ler os resultados: dentro de um mesmo statement, todas as
-- ramificações de um UNION ALL enxergam o snapshot do INÍCIO do statement.
-- Por isso as verificações de efeito colateral (auditoria, estoque final)
-- ficam em statements separados das ações que as produzem.
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
-- Cenário
-- -----------------------------------------------------------------------------
insert into public.planos (id, nome, valor_mensal, limites, slug)
values ('bbbbbbbb-0000-0000-0000-000000000001','Teste F3',49.90,'{"max_funcionarios":5}','teste-f3');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','f3000000-0000-0000-0000-000000000001',
   'authenticated','authenticated','f3.gestor@teste.local','x',now(),'{}','{"nome":"Gestor F3"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','f3000000-0000-0000-0000-000000000002',
   'authenticated','authenticated','f3.func@teste.local','x',now(),'{}','{"nome":"Funcionario F3"}',now(),now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"f3000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.criar_empresa_e_assinatura('Loja F3','bbbbbbbb-0000-0000-0000-000000000001','Gestor F3', true);

-- Ativa "marca" como obrigatório e cria dois campos personalizados.
insert into public.empresa_campos_produto (empresa_id, campo_id, ativo, obrigatorio, ordem)
select app.empresa_atual(), id, true, true, 1
from public.campos_produto_disponiveis where chave = 'marca' and empresa_id is null;

select public.criar_campo_personalizado('Garantia (meses)', 'numero');
select public.criar_campo_personalizado('Condição', 'selecao', '["Novo","Usado"]'::jsonb);

-- =============================================================================
-- 1. Geração da chave técnica (Seção 4.6)
-- =============================================================================
select * from pg_temp.esperar('Slug remove acento e normaliza',
  (select count(*) = 1 from public.campos_produto_disponiveis
   where chave = 'garantia_meses' and empresa_id is not null))
union all
select * from pg_temp.esperar('Slug de "Condição" vira "condicao"',
  (select count(*) = 1 from public.campos_produto_disponiveis
   where chave = 'condicao' and empresa_id is not null))
union all
select * from pg_temp.esperar('Campo criado já entra ativo',
  (select bool_and(ativo) from public.empresa_campos_produto ecp
   join public.campos_produto_disponiveis c on c.id = ecp.campo_id
   where c.empresa_id is not null));

-- =============================================================================
-- 2. Validação dos atributos personalizados (Seções 4.6 e 8.2)
-- Aplicada por trigger no banco — o formulário só antecipa a mensagem.
-- =============================================================================
select * from pg_temp.tentar('Produto sem o campo obrigatório',
  'insert into public.produtos (empresa_id, nome, preco, atributos)
   values (app.empresa_atual(), ''X'', 10, ''{}''::jsonb)')
union all
select * from pg_temp.tentar('Campo obrigatório preenchido só com espaços',
  'insert into public.produtos (empresa_id, nome, preco, atributos)
   values (app.empresa_atual(), ''X'', 10, ''{"marca":"  "}''::jsonb)')
union all
select * from pg_temp.tentar('Chave de atributo que não é campo ativo',
  'insert into public.produtos (empresa_id, nome, preco, atributos)
   values (app.empresa_atual(), ''X'', 10, ''{"marca":"A","inventado":"x"}''::jsonb)')
union all
select * from pg_temp.tentar('Campo numérico recebendo texto',
  'insert into public.produtos (empresa_id, nome, preco, atributos)
   values (app.empresa_atual(), ''X'', 10, ''{"marca":"A","garantia_meses":"doze"}''::jsonb)')
union all
select * from pg_temp.tentar('Campo de seleção com opção inválida',
  'insert into public.produtos (empresa_id, nome, preco, atributos)
   values (app.empresa_atual(), ''X'', 10, ''{"marca":"A","condicao":"Quebrado"}''::jsonb)');

-- =============================================================================
-- 3. Ciclo de alerta — o exemplo literal da Seção 8.3
-- Referência 30, alerta em 50% (dispara em 15). Cai a 10; repõe +10; a nova
-- referência é 20 (NÃO 30) e o produto sai do alerta imediatamente.
-- =============================================================================
update public.empresas set alerta_estoque_percentual = 50 where id = app.empresa_atual();

insert into public.produtos (empresa_id, nome, codigo, preco, estoque_atual,
                             estoque_referencia_alerta, criado_por, atributos)
values (app.empresa_atual(), 'Capa iPhone 15', 'CAP15', 39.90, 30, 30, auth.uid(),
        '{"marca":"Apple","garantia_meses":12,"condicao":"Novo"}'::jsonb);

select * from pg_temp.esperar('Status inicial é disponível',
  (select status_estoque = 'disponivel' from public.produtos_com_status where codigo = 'CAP15'));

-- Redução manual de 20 unidades, com motivo.
select public.ajustar_estoque(
  (select id from public.produtos where codigo = 'CAP15'), -20, 'ajuste de contagem', 'reducao_manual');

select * from pg_temp.esperar('Após cair a 10, status é estoque_baixo',
  (select status_estoque = 'estoque_baixo' from public.produtos_com_status where codigo = 'CAP15'))
union all
select * from pg_temp.esperar('Percentual restante calculado (10/30 = 33%)',
  (select percentual_restante = 33 from public.produtos_com_status where codigo = 'CAP15'))
union all
select * from pg_temp.esperar('Alerta persistido com o ciclo correto',
  (select count(*) = 1 from public.alertas_estoque
   where tipo = 'estoque_baixo' and ciclo_referencia = 30))
union all
select * from pg_temp.esperar('Redução auditada com o motivo',
  (select count(*) = 1 from public.logs_auditoria
   where acao = 'estoque.reducao_manual' and dados_novos ->> '_motivo' = 'ajuste de contagem'));

-- Reposição de +10.
select public.ajustar_estoque(
  (select id from public.produtos where codigo = 'CAP15'), 10, null, 'reposicao');

select * from pg_temp.esperar('Reposição recalcula a referência para 20, não 30',
  (select estoque_referencia_alerta = 20 from public.produtos where codigo = 'CAP15'))
union all
select * from pg_temp.esperar('Produto sai do alerta imediatamente',
  (select status_estoque = 'disponivel' from public.produtos_com_status where codigo = 'CAP15'))
union all
select * from pg_temp.esperar('Percentual volta a 100%',
  (select percentual_restante = 100 from public.produtos_com_status where codigo = 'CAP15'))
union all
select * from pg_temp.esperar('Reposição auditada',
  (select count(*) = 1 from public.logs_auditoria where acao = 'estoque.reposicao'));

-- =============================================================================
-- 4. Guardas do ajuste de estoque (Seções 7.5 e 8.1)
-- =============================================================================
select * from pg_temp.tentar('Redução manual sem motivo',
  'select public.ajustar_estoque((select id from public.produtos where codigo = ''CAP15''),
     -5, null, ''reducao_manual'')')
union all
select * from pg_temp.tentar('Redução que deixaria o estoque negativo',
  'select public.ajustar_estoque((select id from public.produtos where codigo = ''CAP15''),
     -999, ''perda'', ''reducao_manual'')')
union all
select * from pg_temp.tentar('Ajuste de quantidade zero',
  'select public.ajustar_estoque((select id from public.produtos where codigo = ''CAP15''),
     0, null, ''reposicao'')')
union all
select * from pg_temp.tentar('Tipo de ajuste inventado pelo cliente',
  'select public.ajustar_estoque((select id from public.produtos where codigo = ''CAP15''),
     5, null, ''qualquer_coisa'')');

-- =============================================================================
-- 5. Ciclo de vida do produto (Seção 8.4)
-- =============================================================================
select public.arquivar_produto((select id from public.produtos where codigo = 'CAP15'));

select * from pg_temp.esperar('Arquivar muda o ciclo de vida',
  (select ciclo_vida = 'arquivado' from public.produtos where codigo = 'CAP15'));

select public.restaurar_produto((select id from public.produtos where codigo = 'CAP15'));

select * from pg_temp.esperar('Arquivar é reversível',
  (select ciclo_vida = 'ativo' from public.produtos where codigo = 'CAP15'));

select public.excluir_produto((select id from public.produtos where codigo = 'CAP15'));

select * from pg_temp.esperar('Excluir NÃO apaga o registro do banco',
  (select count(*) = 1 from public.produtos where codigo = 'CAP15'))
union all
select * from pg_temp.esperar('Excluir marca o ciclo como excluido',
  (select ciclo_vida = 'excluido' from public.produtos where codigo = 'CAP15'));

select * from pg_temp.tentar('Produto excluído não volta pela interface',
  'select public.restaurar_produto((select id from public.produtos where codigo = ''CAP15''))');

select * from pg_temp.esperar('Ações de ciclo de vida nomeadas na auditoria',
  (select count(distinct acao) = 3 from public.logs_auditoria
   where acao in ('produto.arquivado', 'produto.restaurado', 'produto.excluido')));

-- =============================================================================
-- 6. Permissões do Funcionário (Seções 5.3, 7.5)
-- =============================================================================
select public.convidar_funcionario('Funcionario F3', 'f3.func@teste.local');

insert into public.produtos (empresa_id, nome, codigo, preco, estoque_atual,
                             estoque_referencia_alerta, criado_por, atributos)
values (app.empresa_atual(), 'Fone Bluetooth', 'FONE1', 89.90, 20, 20, auth.uid(),
        '{"marca":"JBL"}'::jsonb);

set local request.jwt.claims = '{"sub":"f3000000-0000-0000-0000-000000000002","role":"authenticated"}';
select public.aceitar_convite(
  (select id from public.empresa_usuarios where email_convite = 'f3.func@teste.local'));

select * from pg_temp.esperar('Funcionário consulta o estoque (padrão)',
  (select count(*) = 1 from public.produtos_com_status where ciclo_vida = 'ativo'))
union all
select * from pg_temp.tentar('Funcionário não ajusta estoque',
  'select public.ajustar_estoque((select id from public.produtos where codigo = ''FONE1''),
     5, null, ''reposicao'')')
union all
select * from pg_temp.tentar('Funcionário não arquiva produto',
  'select public.arquivar_produto((select id from public.produtos where codigo = ''FONE1''))')
union all
select * from pg_temp.tentar('Funcionário não cria campo personalizado',
  'select public.criar_campo_personalizado(''Meu campo'', ''texto'')');

reset role;
rollback;
