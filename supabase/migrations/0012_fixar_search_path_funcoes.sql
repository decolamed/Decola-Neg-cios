-- =============================================================================
-- 0012 — Endurecimento: search_path fixo nas funções restantes
--
-- Detectado pelo linter de segurança do Supabase após a aplicação inicial.
-- Uma função com `search_path` mutável pode ser sequestrada por um schema
-- controlado pelo chamador — inaceitável em funções que participam da
-- avaliação de permissão (Seção 9.1).
--
-- As definições em 0002, 0008 e 0009 já foram corrigidas na origem; esta
-- migration existe para manter o histórico do banco replayável e é idempotente
-- (`create or replace`), sendo um no-op numa execução do zero.
-- =============================================================================

create or replace function app.tocar_atualizado_em()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create or replace function app.definir_contexto(p_acao text, p_motivo text default null)
returns void language plpgsql volatile set search_path = '' as $$
begin
  perform set_config('decola.acao', coalesce(p_acao, ''), true);
  perform set_config('decola.motivo', coalesce(p_motivo, ''), true);
end;
$$;

create or replace function app.contexto_acao()
returns text language sql stable set search_path = '' as $$
  select nullif(current_setting('decola.acao', true), '')
$$;

create or replace function app.contexto_motivo()
returns text language sql stable set search_path = '' as $$
  select nullif(current_setting('decola.motivo', true), '')
$$;

create or replace function app.chaves_permissao()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'cadastrar_produto','editar_produto','excluir_produto','gerenciar_estoque',
    'visualizar_financeiro','exportar_relatorios','cancelar_venda','gerenciar_assinatura'
  ]
$$;

create or replace function app.permissoes_gestor()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_object_agg(chave, true) from unnest(app.chaves_permissao()) as chave
$$;

create or replace function app.permissoes_funcionario()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_object_agg(chave, false) from unnest(app.chaves_permissao()) as chave
  where chave <> 'gerenciar_assinatura'
$$;
