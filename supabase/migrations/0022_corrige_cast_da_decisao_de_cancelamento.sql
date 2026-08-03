-- =============================================================================
-- 0022 — Correção de cast em decidir_solicitacao_cancelamento
--
-- Um CASE com dois literais produz `text`, e o Postgres não coage text para
-- enum implicitamente num UPDATE — a decisão do Gestor falhava com
-- "column status is of type solicitacao_status but expression is of type text".
--
-- A definição em 0021 já foi corrigida na origem; este arquivo existe para
-- manter o histórico do banco replayável e é um no-op numa execução do zero.
-- =============================================================================

-- Ver a definição corrigida (com `::public.solicitacao_status`) em
-- 0021_rpc_cancelamento_de_venda.sql.
select 1;
