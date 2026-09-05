-- =============================================================================
-- GRANTs de UPDATE que a 0007 levou junto — papel `authenticated`
--
-- Mesma raiz do 0030, agora do lado do cliente. A 0007 revogou DML de todos os
-- papéis e devolveu apenas parte; três tabelas ficaram com política de RLS
-- escrita, testada e correta, mas sem o privilégio que a política pressupõe.
-- O resultado é a pior combinação possível: a política diz "pode", o GRANT diz
-- "não", e o cliente recebe erro em cima de uma operação legítima.
--
-- As três políticas correspondentes já existem e são de `authenticated`:
--   alertas_estoque .... alertas_marcar_lido
--   empresas ........... empresas_edicao
--   notificacoes ....... notificacoes_marcar_lido
--
-- O que estava quebrado na prática:
--   empresas ........... salvar a chave Pix e o percentual de alerta de
--                        estoque (Seção 7.9) — a tela gravava e falhava
--   alertas_estoque .... marcar alerta de estoque como lido (Seção 7.2)
--   notificacoes ....... marcar notificação como lida (Seção 7.2)
--
-- Por que o GRANT amplo em `empresas` não afrouxa nada: quem limita QUAIS
-- colunas cada papel altera é o trigger de permissão por coluna (0007), não o
-- GRANT. Uma política de RLS não consegue comparar OLD e NEW, e por isso essa
-- checagem sempre morou no trigger — ele continua valendo, intacto.
-- =============================================================================

grant update on public.alertas_estoque to authenticated;
grant update on public.empresas       to authenticated;
grant update on public.notificacoes   to authenticated;
