-- =============================================================================
-- 0042 — Tirar TRUNCATE, TRIGGER, REFERENCES e MAINTAIN de anon/authenticated
-- =============================================================================
-- Sobra do template do Supabase, que abre o schema `public` com `grant all` aos
-- papéis da API. A migração 0007 revogou o que importava no dia a dia —
-- SELECT, INSERT, UPDATE, DELETE — e ficou nisso. Os outros quatro
-- privilégios continuaram em 23 tabelas.
--
-- O que sobrou não é decorativo. TRUNCATE **não passa por RLS**: não existe
-- política que segure um TRUNCATE, ele esvazia a tabela inteira, de todas as
-- empresas de uma vez. Hoje ele não é alcançável — o PostgREST não expõe verbo
-- que vire TRUNCATE, e `anon`/`authenticated` não são papéis de login, então
-- ninguém se conecta como eles direto no Postgres. Ou seja: nenhum caminho
-- conhecido chega lá.
--
-- Mesmo assim sai. O isolamento entre empresas deste sistema é sustentado por
-- RLS, e um privilégio que ignora RLS por completo não pode depender de
-- "ninguém consegue chamar" para ser inofensivo — depende de uma camada
-- (PostgREST) cuja superfície não é nossa e pode mudar. Privilégio que a
-- aplicação nunca usa é privilégio que não deveria existir.
--
-- Que isso é descuido, e não decisão, o próprio banco mostra: `logs_auditoria`
-- é a única tabela SEM truncate para esses papéis. Alguém revogou lá — onde a
-- imutabilidade é regra escrita (Seção 9.1) — e não repetiu no resto.
--
-- As tabelas criadas depois (`pedidos`, `pedido_itens`, `envios_de_acesso`)
-- nasceram limpas, com grants explícitos. As antigas ficam iguais a elas.
--
-- `service_role` mantém os seus: é papel de backend, roda em Edge Function com
-- a chave de serviço, e nunca chega a partir do navegador.
-- =============================================================================

revoke truncate, references, trigger, maintain
  on all tables in schema public from anon, authenticated;

-- E para as tabelas que ainda não existem: sem isto, a próxima tabela criada
-- por `postgres` volta a nascer com os quatro privilégios.
alter default privileges in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
