-- =============================================================================
-- 0013 — Índices de cobertura para chaves estrangeiras
-- Especificação: Seção 9.2 (Performance)
--
-- Apenas as FKs efetivamente usadas em join ou filtro de tela. As FKs de
-- rastreio de autoria (`lido_por`, `cancelada_por`, `decidido_por`,
-- `ativada_por`, `atualizado_por`) ficam sem índice de propósito: nunca são
-- filtradas em consulta, e usuários nunca são apagados (Seção 5.6), então não
-- há cascade cujo custo valha o peso extra na escrita.
-- =============================================================================

-- Painel Administrativo filtra empresas por plano (Seção 7.15 B).
create index assinaturas_plano_idx on public.assinaturas (plano_id);

-- Join do formulário de produto com o catálogo de campos (Seção 4.6).
create index empresa_campos_campo_idx on public.empresa_campos_produto (campo_id);

-- "Produtos cadastrados por" em auditoria e relatórios.
create index produtos_criado_por_idx on public.produtos (criado_por);

-- Lançamentos manuais por autor (Seção 8.6).
create index movimentacoes_criado_por_idx on public.movimentacoes_financeiras (criado_por);

-- Fila de solicitações pendentes do Gestor, por solicitante (Seção 8.5).
create index solicitacoes_solicitado_por_idx on public.solicitacoes_cancelamento (solicitado_por);
