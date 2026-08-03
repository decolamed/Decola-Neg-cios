-- =============================================================================
-- 0011 — Supabase Realtime
-- Especificação: Seções 3.3 e 5.4 — toda alteração relevante é propagada para
-- os dispositivos da mesma empresa, inclusive mudança de permissão, que deve
-- revogar acesso em tempo real sem exigir novo login.
--
-- O Realtime respeita a RLS de 0007: um dispositivo só recebe as linhas que
-- aquele usuário poderia ler via SELECT.
-- =============================================================================

alter publication supabase_realtime add table public.empresas;
alter publication supabase_realtime add table public.empresa_usuarios;
alter publication supabase_realtime add table public.assinaturas;
alter publication supabase_realtime add table public.categorias_produto;
alter publication supabase_realtime add table public.empresa_campos_produto;
alter publication supabase_realtime add table public.produtos;
alter publication supabase_realtime add table public.vendas;
alter publication supabase_realtime add table public.venda_itens;
alter publication supabase_realtime add table public.movimentacoes_financeiras;
alter publication supabase_realtime add table public.solicitacoes_cancelamento;
alter publication supabase_realtime add table public.alertas_estoque;
alter publication supabase_realtime add table public.notificacoes;

-- Seção 5.4 — a revogação de permissão em tempo real depende de o payload
-- de UPDATE carregar a linha completa, não só a chave primária.
alter table public.empresa_usuarios replica identity full;
-- Seção 7.12 — o app detecta a virada de `pendente_pagamento` para `ativa`
-- após o webhook do Asaas e navega sozinho para o Dashboard.
alter table public.assinaturas replica identity full;
