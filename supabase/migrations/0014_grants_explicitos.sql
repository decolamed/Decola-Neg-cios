-- =============================================================================
-- 0014 — Camada de privilégio explícita (defesa em profundidade sobre a RLS)
-- Especificação: Seção 9.1
--
-- O Supabase não concede DML automaticamente às roles `anon`/`authenticated`
-- (o padrão atual dá apenas REFERENCES/TRIGGER/TRUNCATE). Em vez de conceder
-- tudo e confiar só na RLS, aproveitamos isso: cada tabela recebe exatamente
-- os verbos que alguma política de 0007 pode autorizar, e nada além.
--
-- Onde a única via de escrita legítima é uma RPC SECURITY DEFINER — vendas,
-- vínculos de usuário, assinaturas —, NENHUM verbo de escrita é concedido.
-- Nessas tabelas, um cliente modificado não é barrado por uma política que
-- alguém possa afrouxar por engano: ele simplesmente não tem o privilégio.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Políticas de admin redundantes.
-- A política de leitura de cada uma destas tabelas já inclui
-- `app.eh_admin_plataforma()`; manter uma segunda política permissiva só fazia
-- o Postgres avaliar as duas em toda consulta (apontado pelo linter de
-- performance).
-- -----------------------------------------------------------------------------
drop policy if exists empresas_admin_total on public.empresas;
drop policy if exists empresa_usuarios_admin_total on public.empresa_usuarios;
drop policy if exists assinaturas_admin_total on public.assinaturas;

-- O administrador edita dados cadastrais da empresa. Mudança de `status`
-- (suspender/reativar, Seção 7.15 B) fica de fora: é ação auditável que passa
-- por RPC própria, e a coluna não consta no grant do fim deste arquivo.
create policy empresas_edicao_admin on public.empresas
  for update to authenticated
  using ((select app.eh_admin_plataforma()))
  with check ((select app.eh_admin_plataforma()));

-- -----------------------------------------------------------------------------
-- Pré-autenticação — tela de Escolha do Plano (Seção 7.13)
-- -----------------------------------------------------------------------------
grant select on public.planos to anon, authenticated;
grant select on public.configuracoes_plataforma to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Plataforma
-- -----------------------------------------------------------------------------
grant select on public.administradores_plataforma to authenticated;
grant update on public.configuracoes_plataforma to authenticated;
grant insert, update on public.planos to authenticated;

-- -----------------------------------------------------------------------------
-- Conta e empresa
-- -----------------------------------------------------------------------------
grant select, update on public.usuarios to authenticated;
grant select on public.empresas to authenticated;

-- Somente leitura: criar vínculo, aceitar convite, promover, rebaixar e
-- remover passam obrigatoriamente pelas RPCs de 0009 (Seções 5.1, 5.2, 5.3, 6.8).
grant select on public.empresa_usuarios to authenticated;

-- Somente leitura: o status da assinatura é definido pelo webhook do Asaas
-- (service_role) ou por RPC administrativa. Sem isso, um cliente modificado se
-- marcaria como 'ativa' sem pagar (Seção 6.4).
grant select on public.assinaturas to authenticated;
grant select on public.cobrancas to authenticated;

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
grant select, insert, update on public.categorias_produto to authenticated;
grant select, insert, update on public.campos_produto_disponiveis to authenticated;
grant select, insert, update, delete on public.empresa_campos_produto to authenticated;
grant select, insert, update on public.produtos to authenticated;

-- -----------------------------------------------------------------------------
-- Vendas — somente leitura pelo cliente.
-- Registrar e cancelar venda mexem em estoque e financeiro na mesma transação
-- (Seções 7.4, 8.5, 8.6) e só existem como RPC.
-- -----------------------------------------------------------------------------
grant select on public.vendas to authenticated;
grant select on public.venda_itens to authenticated;

-- -----------------------------------------------------------------------------
-- Financeiro — DML liberado apenas para lançamento manual; a política de 0007
-- restringe a `origem = 'manual'` e ao papel Gestor (Seção 8.6).
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.movimentacoes_financeiras to authenticated;

grant select, insert on public.solicitacoes_cancelamento to authenticated;

-- -----------------------------------------------------------------------------
-- Alertas e notificações — a única escrita permitida é marcar como lido.
-- -----------------------------------------------------------------------------
grant select on public.alertas_estoque to authenticated;
grant update (lido_por, lido_em) on public.alertas_estoque to authenticated;
grant select on public.notificacoes to authenticated;
grant update (lido_por, lido_em) on public.notificacoes to authenticated;

grant select, insert, update, delete on public.dispositivos_push to authenticated;
grant select, insert, update, delete on public.preferencias_notificacao to authenticated;

-- -----------------------------------------------------------------------------
-- Auditoria — leitura e nada mais, em nenhuma hipótese (Seção 9.1).
-- -----------------------------------------------------------------------------
grant select on public.logs_auditoria to authenticated;

-- Reafirma `empresas.status` como intocável pelo cliente (Seção 6.9): só o
-- administrador muda, e por RPC.
revoke update on public.empresas from authenticated;
grant update (nome, cnpj, endereco, telefone, logo_url, chave_pix,
              alerta_estoque_percentual)
  on public.empresas to authenticated;
