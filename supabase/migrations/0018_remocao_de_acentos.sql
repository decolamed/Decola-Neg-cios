-- =============================================================================
-- 0018 — Remoção de acentos para gerar a chave técnica de campos personalizados
--
-- `translate` em vez da extensão `unaccent`: cobre o português com folga e
-- evita depender de uma extensão só para gerar slug (Seção 4.6).
-- =============================================================================
create or replace function public.unaccent_simples(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
    p_texto,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  )
$$;

revoke execute on function public.unaccent_simples(text) from public, anon;
grant execute on function public.unaccent_simples(text) to authenticated, service_role;
