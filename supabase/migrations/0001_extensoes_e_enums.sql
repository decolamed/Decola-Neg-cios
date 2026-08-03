-- =============================================================================
-- 0001 — Extensões, schema privado e tipos enumerados
-- Especificação: Seção 4 (Modelo de Dados)
-- =============================================================================

create extension if not exists "pgcrypto";

-- Schema privado para funções auxiliares de permissão (Seção 9.1).
-- Fica fora de `public` de propósito: o PostgREST só expõe `public`, então
-- estes helpers não viram endpoints RPC acessíveis pelo app.
create schema if not exists app;

-- -----------------------------------------------------------------------------
-- Empresa e usuários
-- -----------------------------------------------------------------------------

-- Seção 4.1 / 6.9 — status da empresa, controlado APENAS pelo administrador da
-- plataforma. Nunca muda automaticamente por causa de pagamento.
create type public.empresa_status as enum ('ativa', 'suspensa', 'inativa');

-- Seção 4.3 / 5.3
create type public.papel_usuario as enum ('gestor_principal', 'gestor', 'funcionario');

-- Seção 4.3 / 5.6 — usuários nunca são apagados, apenas marcados como removido.
create type public.vinculo_status as enum ('convidado', 'ativo', 'removido');

-- -----------------------------------------------------------------------------
-- Catálogo de produtos
-- -----------------------------------------------------------------------------

-- Seção 4.4 / 4.7 / 8.4 — produtos e categorias nunca são apagados fisicamente.
-- `arquivado` é reversível; `excluido` não é reversível pela interface.
create type public.ciclo_vida as enum ('ativo', 'arquivado', 'excluido');

-- Seção 4.5 — tipos de campo personalizável de produto.
create type public.tipo_campo as enum ('texto', 'numero', 'selecao', 'booleano', 'data');

-- -----------------------------------------------------------------------------
-- Vendas
-- -----------------------------------------------------------------------------

-- Seção 4.9 — `pendente` existe no enum mas não é usado na V1: o carrinho vive
-- no app e a venda só é gravada no banco já confirmada (Seção 7.4).
create type public.venda_status as enum ('pendente', 'confirmada', 'cancelada');

-- Seção 4.9 / 7.3
create type public.desconto_tipo as enum ('percentual', 'valor_fixo');

-- Seção 4.9 / 7.4
create type public.forma_pagamento_venda as enum ('dinheiro', 'pix', 'cartao', 'outros');

-- Seção 4.17 / 8.5
create type public.solicitacao_status as enum ('pendente', 'aprovado', 'rejeitado');

-- -----------------------------------------------------------------------------
-- Financeiro
-- -----------------------------------------------------------------------------

-- Seção 4.11
create type public.movimentacao_tipo as enum ('entrada', 'saida');

-- Seção 4.11 / 8.6 — `estorno_venda` é o lançamento de reversão gerado por um
-- cancelamento; a movimentação original nunca é apagada.
create type public.movimentacao_origem as enum ('venda', 'manual', 'estorno_venda');

-- -----------------------------------------------------------------------------
-- Assinaturas (SaaS)
-- -----------------------------------------------------------------------------

-- Seção 4.12.2 / 6.5 / 6.6
--   pendente_pagamento = sem acesso nenhum ao conteúdo do app
--   modo_limitado      = leitura liberada, escrita bloqueada
create type public.assinatura_status as enum (
  'pendente_pagamento',
  'trial',
  'ativa',
  'carencia',
  'modo_limitado',
  'cancelada'
);

-- Seção 4.12.3
create type public.cobranca_forma_pagamento as enum ('pix', 'boleto', 'cartao');
create type public.cobranca_status as enum ('pendente', 'confirmado', 'vencido', 'cancelado');

-- -----------------------------------------------------------------------------
-- Alertas e notificações
-- -----------------------------------------------------------------------------

-- Seção 4.14
create type public.alerta_estoque_tipo as enum ('estoque_baixo', 'esgotado');

-- Seção 7.14 — categorias de notificação que o usuário pode ligar/desligar.
create type public.notificacao_categoria as enum ('estoque', 'assinatura', 'administrativo');
