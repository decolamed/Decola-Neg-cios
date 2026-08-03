-- =============================================================================
-- Teste de vendas — Fase 4 (Seções 7.3, 7.4, 8.1, 8.5, 8.6)
--
-- Roda em transação e faz ROLLBACK no fim. Executar com privilégio de
-- service role. Cada linha é uma asserção; procure por "FALHA" na saída.
--
-- Lembrete: dentro de um mesmo statement, todas as ramificações de um UNION
-- ALL leem o snapshot do início do statement. As verificações de efeito
-- colateral ficam em statements separados das ações que as produzem.
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
-- Cenário: Gestor + Funcionário (sem permissões extras), dois produtos.
-- -----------------------------------------------------------------------------
insert into public.planos (id, nome, valor_mensal, limites, slug)
values ('cccccccc-0000-0000-0000-000000000001','Teste F4',49.90,'{"max_funcionarios":5}','teste-f4');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','f4000000-0000-0000-0000-000000000001',
   'authenticated','authenticated','f4.gestor@teste.local','x',now(),'{}','{"nome":"Gestor F4"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','f4000000-0000-0000-0000-000000000002',
   'authenticated','authenticated','f4.func@teste.local','x',now(),'{}','{"nome":"Func F4"}',now(),now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"f4000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.criar_empresa_e_assinatura('Loja F4','cccccccc-0000-0000-0000-000000000001','Gestor F4', true);

insert into public.produtos (empresa_id, nome, codigo, preco, estoque_atual, estoque_referencia_alerta, criado_por)
values
  (app.empresa_atual(), 'Capa', 'CAPA', 40.00, 10, 10, auth.uid()),
  (app.empresa_atual(), 'Fone', 'FONE', 100.00, 5, 5, auth.uid());

select public.convidar_funcionario('Func F4', 'f4.func@teste.local');

-- =============================================================================
-- 1. O Funcionário vende SEM ter `gerenciar_estoque` (Seção 5.3)
-- A baixa de estoque é do servidor: sem o marcador de operação confiável
-- (migration 0019), o trigger de permissão por coluna barraria a venda.
-- =============================================================================
set local request.jwt.claims = '{"sub":"f4000000-0000-0000-0000-000000000002","role":"authenticated"}';
select public.aceitar_convite(
  (select id from public.empresa_usuarios where email_convite = 'f4.func@teste.local'));

select * from pg_temp.esperar('Funcionário NÃO tem gerenciar_estoque',
  not app.tem_permissao('gerenciar_estoque'));

-- 2 Capas (40) + 1 Fone (100) = 180, com 10% de desconto = 162.
select public.registrar_venda(
  jsonb_build_array(
    jsonb_build_object('produto_id', (select id from public.produtos where codigo='CAPA'), 'quantidade', 2),
    jsonb_build_object('produto_id', (select id from public.produtos where codigo='FONE'), 'quantidade', 1)
  ),
  'pix', 'percentual', 10
);

select * from pg_temp.esperar('Subtotal calculado com o preço do BANCO',
  (select subtotal = 180.00 from public.vendas))
union all
select * from pg_temp.esperar('Desconto de 10% convertido para reais (18,00)',
  (select desconto = 18.00 from public.vendas))
union all
select * from pg_temp.esperar('desconto_tipo registrado como percentual',
  (select desconto_tipo = 'percentual' from public.vendas))
union all
select * from pg_temp.esperar('total = subtotal - desconto',
  (select total = subtotal - desconto from public.vendas))
union all
select * from pg_temp.esperar('Estoque da Capa baixado (10 - 2)',
  (select estoque_atual = 8 from public.produtos where codigo='CAPA'))
union all
select * from pg_temp.esperar('Estoque do Fone baixado (5 - 1)',
  (select estoque_atual = 4 from public.produtos where codigo='FONE'))
union all
select * from pg_temp.esperar('Entrada financeira automática (Seção 8.6)',
  (select count(*) = 1 from public.movimentacoes_financeiras
   where tipo = 'entrada' and origem = 'venda' and valor = 162.00))
union all
select * from pg_temp.esperar('Itens gravados com o preço unitário do banco',
  (select count(*) = 2 from public.venda_itens
   where (preco_unitario, quantidade) in ((40.00, 2), (100.00, 1))))
union all
select * from pg_temp.esperar('Vendedor registrado é quem vendeu',
  (select usuario_id = auth.uid() from public.vendas));

-- =============================================================================
-- 2. Guardas do registro de venda (Seções 7.3 e 8.1)
-- =============================================================================
select * from pg_temp.tentar('Vender mais do que há em estoque',
  'select public.registrar_venda(jsonb_build_array(jsonb_build_object(
     ''produto_id'', (select id from public.produtos where codigo=''FONE''), ''quantidade'', 99)), ''dinheiro'')')
union all
select * from pg_temp.tentar('Carrinho vazio',
  'select public.registrar_venda(''[]''::jsonb, ''dinheiro'')')
union all
select * from pg_temp.tentar('Quantidade negativa',
  'select public.registrar_venda(jsonb_build_array(jsonb_build_object(
     ''produto_id'', (select id from public.produtos where codigo=''CAPA''), ''quantidade'', -5)), ''dinheiro'')')
union all
select * from pg_temp.tentar('Desconto percentual acima de 100',
  'select public.registrar_venda(jsonb_build_array(jsonb_build_object(
     ''produto_id'', (select id from public.produtos where codigo=''CAPA''), ''quantidade'', 1)),
     ''dinheiro'', ''percentual'', 150)')
union all
select * from pg_temp.tentar('Desconto fixo maior que a venda',
  'select public.registrar_venda(jsonb_build_array(jsonb_build_object(
     ''produto_id'', (select id from public.produtos where codigo=''CAPA''), ''quantidade'', 1)),
     ''dinheiro'', ''valor_fixo'', 9999)');

-- =============================================================================
-- 3. Cancelamento: dois caminhos conforme a permissão (Seção 8.5)
-- =============================================================================
select * from pg_temp.tentar('Funcionário sem permissão NÃO cancela direto',
  'select public.cancelar_venda((select id from public.vendas))');

select public.solicitar_cancelamento_venda((select id from public.vendas), 'Cliente desistiu');

select * from pg_temp.tentar('Solicitação duplicada para a mesma venda',
  'select public.solicitar_cancelamento_venda((select id from public.vendas), ''de novo'')')
union all
select * from pg_temp.tentar('Funcionário decide a própria solicitação',
  'select public.decidir_solicitacao_cancelamento(
     (select id from public.solicitacoes_cancelamento), true)')
union all
select * from pg_temp.tentar('INSERT direto em solicitacoes_cancelamento',
  'insert into public.solicitacoes_cancelamento (empresa_id, venda_id, solicitado_por)
   values (app.empresa_atual(), (select id from public.vendas), auth.uid())');

-- O Gestor aprova → reversão completa.
set local request.jwt.claims = '{"sub":"f4000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.decidir_solicitacao_cancelamento((select id from public.solicitacoes_cancelamento), true);

select * from pg_temp.esperar('Venda marcada cancelada, NÃO apagada',
  (select count(*) = 1 and bool_and(status = 'cancelada') from public.vendas))
union all
select * from pg_temp.esperar('Itens da venda preservados',
  (select count(*) = 2 from public.venda_itens))
union all
select * from pg_temp.esperar('Estoque da Capa revertido (8 + 2)',
  (select estoque_atual = 10 from public.produtos where codigo='CAPA'))
union all
select * from pg_temp.esperar('Estoque do Fone revertido (4 + 1)',
  (select estoque_atual = 5 from public.produtos where codigo='FONE'))
union all
select * from pg_temp.esperar('Movimentação ORIGINAL preservada (Seção 8.6)',
  (select count(*) = 1 from public.movimentacoes_financeiras
   where tipo = 'entrada' and origem = 'venda'))
union all
select * from pg_temp.esperar('Estorno gerado como novo lançamento',
  (select count(*) = 1 from public.movimentacoes_financeiras
   where tipo = 'saida' and origem = 'estorno_venda' and valor = 162.00))
union all
select * from pg_temp.esperar('cancelada_por preenchido',
  (select cancelada_por is not null and cancelada_em is not null from public.vendas))
union all
select * from pg_temp.esperar('Solicitação marcada como aprovada',
  (select status = 'aprovado' from public.solicitacoes_cancelamento));

select * from pg_temp.tentar('Cancelar uma venda já cancelada',
  'select public.cancelar_venda((select id from public.vendas))');

-- =============================================================================
-- 4. Isolamento: a venda não vaza para outra empresa
-- =============================================================================
select * from pg_temp.esperar('Auditoria registrou o ciclo da venda',
  (select count(distinct acao) >= 3 from public.logs_auditoria
   where acao in ('venda.registrada', 'venda.cancelamento_solicitado', 'venda.cancelada')));

reset role;
rollback;
