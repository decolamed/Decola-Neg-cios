-- =============================================================================
-- Preferência de notificação para a categoria `pedido`
--
-- A 0032/0033 criaram a categoria `pedido` em `notificacao_categoria`, mas
-- `preferencias_notificacao` tem uma coluna por categoria — e essa ficou de
-- fora. O efeito seria silencioso: o gestor veria a notificação de pedido no
-- sino sem ter como desligá-la, enquanto as outras três se desligam.
--
-- Nasce ligada, como as demais: pedido novo é o tipo de aviso que alguém
-- desliga por escolha, não por descuido de quem escreveu a migration.
-- =============================================================================
alter table public.preferencias_notificacao
  add column pedido boolean not null default true;
