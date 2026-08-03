-- =============================================================================
-- 0010 — Seed: configuração da plataforma e catálogo de campos padrão
-- Especificação: Seções 4.5, 4.16, 6.9
-- =============================================================================

-- Seção 4.16 — a tabela é singleton; esta é a linha única.
-- Valores iniciais conforme o exemplo da especificação: trial de 7 dias ligado,
-- carência de 7 dias corridos (Seção 6.6).
insert into public.configuracoes_plataforma (trial_ativo, trial_dias, carencia_dias)
select true, 7, 7
where not exists (select 1 from public.configuracoes_plataforma);

-- -----------------------------------------------------------------------------
-- Seção 4.5 — campos padrão do sistema (`empresa_id` nulo = disponíveis a
-- todas as empresas). São apenas o CATÁLOGO: nenhum vem ativo por padrão.
-- O Gestor ativa os que fizerem sentido em Configurações → Cadastro de
-- produtos (Seção 4.6), o que mantém o app genérico para qualquer segmento
-- (Seção 1.4).
-- -----------------------------------------------------------------------------
insert into public.campos_produto_disponiveis (chave, nome_exibicao, tipo_campo, opcoes, empresa_id)
values
  ('marca',        'Marca',        'texto',    null, null),
  ('modelo',       'Modelo',       'texto',    null, null),
  ('cor',          'Cor',          'texto',    null, null),
  ('tamanho',      'Tamanho',      'texto',    null, null),
  ('voltagem',     'Voltagem',     'selecao',  '["110V", "220V", "Bivolt"]'::jsonb, null),
  ('capacidade',   'Capacidade',   'texto',    null, null),
  ('peso',         'Peso',         'numero',   null, null),
  ('validade',     'Validade',     'data',     null, null)
on conflict do nothing;
