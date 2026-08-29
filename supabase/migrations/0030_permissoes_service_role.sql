-- =============================================================================
-- Permissões do `service_role` para as Edge Functions
--
-- CONTEXTO DO DEFEITO
-- A migration 0007 revogou os privilégios de DML de todos os papéis em todas as
-- tabelas, e o `service_role` foi junto. Ele bypassa RLS, mas `GRANT` continua
-- valendo para ele — sem privilégio, a consulta é recusada antes de qualquer
-- política ser avaliada.
--
-- O sintoma foi enganoso: `admin-criar-empresa` consulta
-- `administradores_plataforma` com a service key para confirmar quem chamou.
-- A consulta era recusada por falta de SELECT, e a função respondia
-- "Esta ação é exclusiva do administrador da plataforma." para um
-- administrador legítimo.
--
-- O QUE ESTE ARQUIVO CONCEDE
-- Só os verbos que as Edge Functions exercem **com a service key**, tabela por
-- tabela. Não `all privileges`, que é o padrão do Supabase e devolveria ao
-- `service_role` escrita em tudo, inclusive em `logs_auditoria` (imutável,
-- Seção 9.1), `vendas` e `produtos`.
--
-- Três das cinco funções — `enviar-convite`, `exportar-relatorio` e a maior
-- parte de `asaas-checkout` — operam com o JWT de quem chamou, sob o papel
-- `authenticated`, e portanto não aparecem aqui: para elas a RLS é que decide,
-- como deve ser.
--
-- POR QUE ISSO NÃO AFROUXA O MODELO DE SEGURANÇA
-- A service key vive só no servidor, como secret de Edge Function — nunca no
-- bundle do navegador nem no app. As decisões críticas continuam onde estavam:
-- `admin_criar_empresa` revalida `app.exigir_admin()` por dentro, e nenhum
-- papel de cliente ganha um privilégio sequer neste arquivo.
-- =============================================================================

-- admin-criar-empresa --------------------------------------------------------
-- Confere se quem chamou é administrador e procura a conta do responsável.
-- (A parte transacional é chamada com o JWT do administrador, não com a
--  service key — por isso não há GRANT de execute para `admin_criar_empresa`.)
grant select on public.administradores_plataforma to service_role;
grant select on public.usuarios                   to service_role;

-- asaas-webhook --------------------------------------------------------------
-- Roda sem usuário: o Asaas chama a URL direto, então tudo aqui é service key.
-- Lê `carencia_dias` para calcular o vencimento da carência (Seção 6.5).
grant select on public.configuracoes_plataforma   to service_role;
-- Avisa o gestor sobre pagamento confirmado ou vencido. Só insert:
-- notificação não é editada nem apagada pelo servidor.
grant insert on public.notificacoes               to service_role;

-- asaas-webhook + asaas-checkout ---------------------------------------------
-- `assinaturas` e `cobrancas` não têm escrita pelo cliente, de propósito
-- (Seção 6.4): quem muda o estado da cobrança é o provedor, via servidor.
-- O webhook muda o status da assinatura; o checkout grava `asaas_customer_id`
-- e `proximo_vencimento`. Ambos fazem upsert na cobrança — daí insert e update.
grant select, update         on public.assinaturas to service_role;
grant select, insert, update on public.cobrancas   to service_role;

-- =============================================================================
-- O que continua negado ao `service_role`, de propósito:
--   logs_auditoria ............ imutável para todos (Seção 9.1)
--   vendas, venda_itens ....... só pelas RPCs transacionais (Seção 8.5)
--   produtos, categorias ...... só pelas RPCs de estoque
--   movimentacoes_financeiras . geradas por trigger, nunca à mão
--   planos, empresas .......... só pelas RPCs administrativas
--   empresa_usuarios .......... só pelas RPCs de convite e papéis
-- =============================================================================
